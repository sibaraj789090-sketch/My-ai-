import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';
import {
  executeCustomImageOrEditProvider,
  executeCustomVideoProvider,
  executeCustomAudioProvider,
} from './providerClient.js';

export class ProviderError extends Error {
  code: string;
  httpStatus?: number;
  googleStatus?: string;
  reason?: string;
  rawError?: string;
  missingConfig?: string;
  requiresPaidKey?: boolean;

  constructor(
    message: string,
    opts?: {
      code?: string;
      httpStatus?: number;
      googleStatus?: string;
      reason?: string;
      rawError?: string;
      missingConfig?: string;
      requiresPaidKey?: boolean;
    }
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = opts?.code || 'PROVIDER_ERROR';
    this.httpStatus = opts?.httpStatus;
    this.googleStatus = opts?.googleStatus;
    this.reason = opts?.reason;
    this.rawError = opts?.rawError;
    this.missingConfig = opts?.missingConfig;
    this.requiresPaidKey = opts?.requiresPaidKey;
  }
}

export function getGeminiKeySource(): 'env' | 'override' | 'none' {
  const envKey = process.env.GEMINI_API_KEY?.trim() || '';
  if (envKey && envKey !== 'MY_GEMINI_API_KEY' && envKey.length > 10) return 'env';
  const override = db.getConfig().geminiOverrideKey?.trim();
  if (override && override.length > 10) return 'override';
  return 'none';
}

export function getEffectiveGeminiKey(): string {
  const envKey = process.env.GEMINI_API_KEY?.trim() || '';
  if (envKey && envKey !== 'MY_GEMINI_API_KEY' && envKey.length > 10) return envKey;
  const override = db.getConfig().geminiOverrideKey?.trim();
  if (override && override.length > 10) return override;
  return '';
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = getEffectiveGeminiKey();
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseGoogleErrorPayload(err: any): {
  httpStatus?: number;
  googleStatus?: string;
  reason?: string;
  rawMessage: string;
  detailsText?: string;
} {
  let httpStatus: number | undefined = typeof err?.status === 'number' ? err.status : undefined;
  let googleStatus: string | undefined;
  let reason: string | undefined;
  let detailsText: string | undefined;
  let rawMessage = err?.message || String(err || 'Unknown API error');

  const tryExtractFromObj = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    const e = obj.error || obj;
    if (typeof e.code === 'number' && !httpStatus) httpStatus = e.code;
    if (typeof e.status === 'string') googleStatus = e.status;
    if (typeof e.message === 'string' && e.message.trim()) rawMessage = e.message.trim();
    if (Array.isArray(e.details)) {
      const reasons: string[] = [];
      for (const d of e.details) {
        if (d?.reason) {
          reason = reason || d.reason;
          const svc = d?.metadata?.service ? ` on ${d.metadata.service}` : '';
          reasons.push(`${d.reason}${svc}`);
        } else if (d?.message) {
          reasons.push(d.message);
        }
      }
      if (reasons.length > 0) detailsText = reasons.join('; ');
    }
  };

  if (typeof rawMessage === 'string') {
    const trimmed = rawMessage.trim();
    const jsonStart = trimmed.indexOf('{');
    if (jsonStart !== -1) {
      try {
        const parsed = JSON.parse(trimmed.slice(jsonStart));
        tryExtractFromObj(parsed);
      } catch {
        // ignore non-JSON
      }
    }
  }
  if (err?.errorDetails) {
    tryExtractFromObj({ details: err.errorDetails });
  }

  return { httpStatus, googleStatus, reason, rawMessage, detailsText };
}

export function classifyGeminiError(err: any, modelName: string): ProviderError {
  if (err instanceof ProviderError) return err;
  const parsed = parseGoogleErrorPayload(err);
  const raw = parsed.rawMessage;
  const lower = `${raw} ${parsed.googleStatus || ''} ${parsed.reason || ''}`.toLowerCase();
  const detailSuffix = [
    parsed.httpStatus ? `HTTP ${parsed.httpStatus}` : '',
    parsed.googleStatus || '',
    parsed.reason ? `reason: ${parsed.reason}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const exactDetail = detailSuffix ? `${raw} [${detailSuffix}]` : raw;

  const isPaidMediaModel = [
    'gemini-3.1-flash-lite-image',
    'gemini-nano-banana-2.1',
    'gemini-3-pro-image',
    'gemini-omni-1.2-flash',
    'lyria-3-clip-preview',
    'lyria-3-pro-preview',
    'gemini-4-argon',
  ].includes(modelName);

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) {
    return new ProviderError(
      `The Gemini API request to "${modelName}" timed out. Please try again.`,
      { code: 'TIMEOUT', httpStatus: 504, rawError: exactDetail }
    );
  }
  if (parsed.httpStatus === 503 || lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand') || lower.includes('overloaded')) {
    return new ProviderError(
      `Model "${modelName}" is temporarily busy due to high demand (${exactDetail}). Please retry in a moment.`,
      { code: 'SERVICE_UNAVAILABLE', httpStatus: 503, googleStatus: parsed.googleStatus, rawError: exactDetail }
    );
  }
  if (
    parsed.httpStatus === 401 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('unauthenticated')
  ) {
    return new ProviderError(
      `Gemini API key rejected: ${exactDetail}. Verify GEMINI_API_KEY in Settings > Secrets.`,
      {
        code: 'API_KEY_INVALID',
        httpStatus: parsed.httpStatus || 401,
        googleStatus: parsed.googleStatus,
        reason: parsed.reason,
        rawError: exactDetail,
        missingConfig: 'GEMINI_API_KEY',
      }
    );
  }
  // Check 429 / RESOURCE_EXHAUSTED BEFORE checking "billing" text, because Google's 429 payload says "check your plan and billing details".
  if (
    parsed.httpStatus === 429 ||
    parsed.googleStatus === 'RESOURCE_EXHAUSTED' ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota exceeded') ||
    lower.includes('rate limit')
  ) {
    const isFreeTierZero = lower.includes('free_tier') && lower.includes('limit: 0');
    const msg = isFreeTierZero
      ? `Model "${modelName}" has a Free Tier quota of 0 on your current API key (HTTP 429 RESOURCE_EXHAUSTED). A billing-enabled (paid) Gemini API key is required for "${modelName}". Free-tier text chat (gemini-3.1-flash-lite) remains available.`
      : `Gemini API quota or rate limit exceeded for "${modelName}": ${exactDetail}.`;
    return new ProviderError(msg, {
      code: 'QUOTA_EXCEEDED',
      httpStatus: 429,
      googleStatus: parsed.googleStatus || 'RESOURCE_EXHAUSTED',
      reason: isFreeTierZero ? 'FREE_TIER_LIMIT_ZERO' : parsed.reason || 'RESOURCE_EXHAUSTED',
      rawError: exactDetail,
      requiresPaidKey: isFreeTierZero || isPaidMediaModel,
      missingConfig: isFreeTierZero || isPaidMediaModel ? 'Paid / Billing-Enabled GEMINI_API_KEY' : undefined,
    });
  }
  if (
    parsed.httpStatus === 403 ||
    parsed.googleStatus === 'PERMISSION_DENIED' ||
    lower.includes('permission_denied') ||
    lower.includes('access_denied')
  ) {
    const guidance = isPaidMediaModel
      ? `Google API returned HTTP 403 PERMISSION_DENIED for "${modelName}" (${exactDetail}). Ensure the Generative Language API is enabled, the API key is unrestricted for generativelanguage.googleapis.com, and billing is active on the selected project.`
      : `Google Gemini API permission denied for "${modelName}": ${exactDetail}. Verify API key permissions, Generative Language API enablement, and project access in Google AI Studio / Cloud Console.`;
    return new ProviderError(guidance, {
      code: 'PERMISSION_DENIED',
      httpStatus: 403,
      googleStatus: parsed.googleStatus || 'PERMISSION_DENIED',
      reason: parsed.reason || 'ACCESS_DENIED',
      rawError: exactDetail,
      requiresPaidKey: isPaidMediaModel,
      missingConfig: isPaidMediaModel ? 'Paid / Billing-Enabled GEMINI_API_KEY' : 'GEMINI_API_KEY Permissions',
    });
  }
  if (parsed.httpStatus === 404 || parsed.googleStatus === 'NOT_FOUND' || lower.includes('not_found')) {
    return new ProviderError(
      `Model "${modelName}" was not found or is unavailable for this API key/endpoint: ${exactDetail}.`,
      {
        code: 'MODEL_NOT_FOUND',
        httpStatus: 404,
        googleStatus: parsed.googleStatus || 'NOT_FOUND',
        reason: parsed.reason,
        rawError: exactDetail,
      }
    );
  }
  return new ProviderError(exactDetail, {
    code: 'API_ERROR',
    httpStatus: parsed.httpStatus,
    googleStatus: parsed.googleStatus,
    reason: parsed.reason,
    rawError: exactDetail,
  });
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ProviderError(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`, { code: 'TIMEOUT' }));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function retryGeminiCall<T>(
  fn: () => Promise<T>,
  modelName: string,
  maxRetries = 2
): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = (err?.message || '').toLowerCase();
      const isTransient =
        msg.includes('503') ||
        msg.includes('500') ||
        msg.includes('unavailable') ||
        msg.includes('econnreset') ||
        msg.includes('429') ||
        msg.includes('resource_exhausted');
      if (!isTransient || attempt === maxRetries) {
        throw classifyGeminiError(err, modelName);
      }
      const backoffMs = 700 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw classifyGeminiError(lastErr, modelName);
}

export async function testGeminiConnection(preferredModel?: string): Promise<{
  configured: boolean;
  connected: boolean;
  model: string;
  latencyMs?: number;
  errorCode?: string;
  httpStatus?: number;
  reason?: string;
  rawError?: string;
  message: string;
  attempts?: Array<{
    model: string;
    ok: boolean;
    latencyMs: number;
    errorCode?: string;
    httpStatus?: number;
    reason?: string;
    error?: string;
  }>;
}> {
  const apiKey = getEffectiveGeminiKey();
  const candidates = preferredModel
    ? [preferredModel]
    : ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];

  if (!apiKey) {
    return {
      configured: false,
      connected: false,
      model: candidates[0],
      errorCode: 'MISSING_API_KEY',
      message: 'GEMINI_API_KEY is not configured in server environment Secrets.',
    };
  }

  const ai = getGeminiClient();
  const attempts: Array<{
    model: string;
    ok: boolean;
    latencyMs: number;
    errorCode?: string;
    httpStatus?: number;
    reason?: string;
    error?: string;
  }> = [];

  for (const model of candidates) {
    const start = Date.now();
    try {
      const isImageModel = model.includes('image') || model.includes('banana');
      const res = await withTimeout(
        ai.models.generateContent({
          model,
          contents: isImageModel ? 'A small minimal blue star icon on black background' : 'Reply with OK.',
          ...(isImageModel ? { config: { imageConfig: { aspectRatio: '1:1' } } } : {}),
        }),
        18000,
        `Gemini connection test (${model})`
      );
      const latencyMs = Date.now() - start;
      const text = (res.text || '').trim();
      attempts.push({ model, ok: true, latencyMs });
      return {
        configured: true,
        connected: true,
        model,
        latencyMs,
        message: text ? `Connected to ${model} (${latencyMs}ms)` : `Connected to ${model} (${latencyMs}ms)`,
        attempts,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      const classified = classifyGeminiError(err, model);
      attempts.push({
        model,
        ok: false,
        latencyMs,
        errorCode: classified.code,
        httpStatus: classified.httpStatus,
        reason: classified.reason,
        error: classified.rawError || classified.message,
      });
    }
  }

  const last = attempts[attempts.length - 1];
  return {
    configured: true,
    connected: false,
    model: candidates[0],
    latencyMs: last?.latencyMs,
    errorCode: last?.errorCode || 'CONNECTION_FAILED',
    httpStatus: last?.httpStatus,
    reason: last?.reason,
    rawError: last?.error,
    message: last?.error || 'Unable to connect to Gemini API.',
    attempts,
  };
}

export async function diagnoseGeminiSetup(): Promise<{
  keySource: 'env' | 'override' | 'none';
  configured: boolean;
  listedModels: Array<{ name: string; supportedActions: string[] }>;
  listModelsError?: string;
  textTest: Awaited<ReturnType<typeof testGeminiConnection>>;
  imageTests: Array<{
    model: string;
    ok: boolean;
    latencyMs: number;
    errorCode?: string;
    httpStatus?: number;
    googleStatus?: string;
    reason?: string;
    rawError?: string;
  }>;
}> {
  const keySource = getGeminiKeySource();
  const apiKey = getEffectiveGeminiKey();
  if (!apiKey) {
    return {
      keySource,
      configured: false,
      listedModels: [],
      listModelsError: 'GEMINI_API_KEY is not configured.',
      textTest: await testGeminiConnection('gemini-3.1-flash-lite'),
      imageTests: [],
    };
  }

  const ai = getGeminiClient();
  const listedModels: Array<{ name: string; supportedActions: string[] }> = [];
  let listModelsError: string | undefined;

  try {
    const pager = await withTimeout(ai.models.list(), 12000, 'List models');
    for await (const m of pager) {
      listedModels.push({
        name: (m.name || '').replace(/^models\//, ''),
        supportedActions: m.supportedActions || [],
      });
      if (listedModels.length >= 100) break;
    }
  } catch (err: any) {
    const parsed = parseGoogleErrorPayload(err);
    listModelsError = `${parsed.rawMessage} [HTTP ${parsed.httpStatus || '?'} · ${parsed.googleStatus || ''} · ${parsed.reason || ''}]`;
  }

  const textTest = await testGeminiConnection('gemini-3.1-flash-lite');

  const imageModels = ['gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1', 'gemini-3-pro-image'];
  const imageTests = [];
  for (const model of imageModels) {
    const start = Date.now();
    try {
      await withTimeout(
        ai.models.generateContent({
          model,
          contents: 'A single minimal blue star on dark background',
          config: { imageConfig: { aspectRatio: '1:1' } },
        }),
        20000,
        `Image test (${model})`
      );
      imageTests.push({
        model,
        ok: true,
        latencyMs: Date.now() - start,
      });
    } catch (err: any) {
      const classified = classifyGeminiError(err, model);
      imageTests.push({
        model,
        ok: false,
        latencyMs: Date.now() - start,
        errorCode: classified.code,
        httpStatus: classified.httpStatus,
        googleStatus: classified.googleStatus,
        reason: classified.reason,
        rawError: classified.rawError || classified.message,
      });
    }
  }

  return {
    keySource,
    configured: true,
    listedModels,
    listModelsError,
    textTest,
    imageTests,
  };
}

async function resolveImageToBase64(
  source?: string,
  fallbackMime = 'image/png'
): Promise<{ data: string; mimeType: string } | null> {
  if (!source) return null;
  if (source.startsWith('data:')) {
    const match = source.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
    return { mimeType: fallbackMime, data: source.replace(/^data:[^;]+;base64,/, '') };
  }
  if (source.startsWith('http://') || source.startsWith('https://')) {
    try {
      const resp = await fetch(source);
      if (!resp.ok) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      const contentType = resp.headers.get('content-type') || fallbackMime;
      return { mimeType: contentType, data: buf.toString('base64') };
    } catch {
      return null;
    }
  }
  return null;
}

function validateAndDetectImageMime(buf: Buffer, headerMime?: string | null): string | null {
  if (!buf || buf.length < 1000) return null;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (headerMime && headerMime.startsWith('image/') && !headerMime.includes('svg')) {
    return headerMime.split(';')[0].trim();
  }
  return null;
}

function aspectRatioToDimensions(aspectRatio: string, maxDim = 1024): { width: number; height: number } {
  if (maxDim <= 640) {
    // AI Horde anonymous tier caps dimensions cleanly around 512x512 - 640x384
    switch (aspectRatio) {
      case '16:9':
        return { width: 640, height: 384 };
      case '9:16':
        return { width: 384, height: 640 };
      case '4:3':
        return { width: 576, height: 448 };
      case '3:4':
        return { width: 448, height: 576 };
      default:
        return { width: 512, height: 512 };
    }
  }
  switch (aspectRatio) {
    case '16:9':
      return { width: 1024, height: 576 };
    case '9:16':
      return { width: 576, height: 1024 };
    case '4:3':
      return { width: 1024, height: 768 };
    case '3:4':
      return { width: 768, height: 1024 };
    default:
      return { width: 1024, height: 1024 };
  }
}

async function synthesizeEditPromptWithGemini(
  sourceImages: Array<{ data: string; mimeType: string }>,
  editInstruction: string
): Promise<string> {
  const apiKey = getEffectiveGeminiKey();
  if (!apiKey || sourceImages.length === 0) return editInstruction;
  try {
    const ai = getGeminiClient();
    const parts: any[] = sourceImages.map((img) => ({
      inlineData: { data: img.data, mimeType: img.mimeType },
    }));
    parts.push({
      text:
        sourceImages.length > 1
          ? `Describe each of these ${sourceImages.length} images in visual detail (subjects, style, lighting, colors, composition), then combine/edit them according to this instruction: "${editInstruction}". Return ONLY a single clean image-generation prompt describing the final combined/edited image.`
          : `Describe this image in rich visual detail (subject, pose, style, lighting, colors, composition), then seamlessly apply this requested edit: "${editInstruction}". Return ONLY a single clean image-generation prompt describing the final edited image.`,
    });
    const res = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: { parts },
      }),
      15000,
      'Image edit prompt synthesis'
    );
    const refined = (res.text || '').trim();
    return refined && refined.length > 10 ? refined : editInstruction;
  } catch {
    return editInstruction;
  }
}

async function generateWithFreeImageProviders(options: {
  prompt: string;
  aspectRatio: string;
  seed?: number;
}): Promise<{ imageUrl: string; model: string }> {
  const { prompt, aspectRatio, seed = Math.floor(Math.random() * 1_000_000_000) } = options;
  const errors: string[] = [];

  // 1. Optional Hugging Face Free Inference API (if server-side HUGGINGFACE_API_KEY / HF_TOKEN is configured)
  const hfKey = (process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '').trim();
  if (hfKey) {
    try {
      const dims = aspectRatioToDimensions(aspectRatio, 1024);
      const hfResp = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { width: dims.width, height: dims.height, seed },
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (hfResp.ok) {
        const buf = Buffer.from(await hfResp.arrayBuffer());
        const mime = validateAndDetectImageMime(buf, hfResp.headers.get('content-type'));
        if (mime) {
          return {
            imageUrl: `data:${mime};base64,${buf.toString('base64')}`,
            model: 'Free Image AI (FLUX.1-schnell)',
          };
        }
        errors.push('Hugging Face returned non-image response.');
      } else {
        errors.push(`Hugging Face HTTP ${hfResp.status}`);
      }
    } catch (err: any) {
      errors.push(`Hugging Face: ${err?.message || 'request failed'}`);
    }
  }

  // 2. Pollinations.ai (uses POLLINATIONS_API_KEY if configured in server Secrets, otherwise free keyless tier)
  const pollinationsKey = (process.env.POLLINATIONS_API_KEY || '').trim();
  try {
    const dims = aspectRatioToDimensions(aspectRatio, 1024);
    const encoded = encodeURIComponent(prompt);
    const pollUrl = pollinationsKey
      ? `https://gen.pollinations.ai/image/${encoded}?width=${dims.width}&height=${dims.height}&nologo=true&seed=${seed}`
      : `https://image.pollinations.ai/prompt/${encoded}?width=${dims.width}&height=${dims.height}&nologo=true&seed=${seed}`;
    const pollResp = await fetch(pollUrl, {
      headers: pollinationsKey ? { Authorization: `Bearer ${pollinationsKey}` } : undefined,
      signal: AbortSignal.timeout(35000),
    });
    if (pollResp.ok) {
      const buf = Buffer.from(await pollResp.arrayBuffer());
      const mime = validateAndDetectImageMime(buf, pollResp.headers.get('content-type'));
      if (mime) {
        return {
          imageUrl: `data:${mime};base64,${buf.toString('base64')}`,
          model: 'Free Image AI (Pollinations)',
        };
      }
      errors.push('Pollinations returned an invalid or empty image payload.');
    } else {
      const errBody = await pollResp.text().catch(() => '');
      errors.push(`Pollinations HTTP ${pollResp.status}${errBody ? `: ${errBody.slice(0, 120)}` : ''}`);
    }
  } catch (err: any) {
    errors.push(`Pollinations: ${err?.message || 'request failed'}`);
  }

  // 3. AI Horde Free Community Grid (supports optional AI_HORDE_API_KEY, defaults to free community key 0000000000)
  const hordeKey = (process.env.AI_HORDE_API_KEY || '0000000000').trim();
  try {
    const dims = aspectRatioToDimensions(aspectRatio, 640);
    const submitResp = await fetch('https://stablehorde.net/api/v2/generate/async', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: hordeKey,
        'Client-Agent': 'MY-AI:2.5:free-tier',
      },
      body: JSON.stringify({
        prompt,
        params: {
          sampler_name: 'k_euler_a',
          width: dims.width,
          height: dims.height,
          steps: 22,
          cfg_scale: 7,
          seed: String(seed),
          n: 1,
        },
        nsfw: false,
        censor_nsfw: true,
        r2: true,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!submitResp.ok) {
      const txt = await submitResp.text().catch(() => '');
      throw new Error(`AI Horde submit HTTP ${submitResp.status}: ${txt.slice(0, 160)}`);
    }

    const submitted: any = await submitResp.json();
    const jobId = submitted?.id;
    if (!jobId) {
      throw new Error('AI Horde did not return a generation job ID.');
    }

    const started = Date.now();
    const maxWaitMs = 55000;
    let generation: any = null;

    while (Date.now() - started < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusResp = await fetch(`https://stablehorde.net/api/v2/generate/status/${jobId}`, {
        headers: { 'Client-Agent': 'MY-AI:2.5:free-tier' },
        signal: AbortSignal.timeout(10000),
      });
      if (!statusResp.ok) continue;
      const statusData: any = await statusResp.json();
      if (statusData?.faulted) {
        throw new Error('AI Horde worker faulted during image rendering.');
      }
      if (statusData?.done && Array.isArray(statusData.generations) && statusData.generations[0]?.img) {
        generation = statusData.generations[0];
        break;
      }
    }

    if (!generation?.img) {
      throw new Error('AI Horde timed out waiting for an available free worker.');
    }

    const imgResp = await fetch(generation.img, { signal: AbortSignal.timeout(15000) });
    if (!imgResp.ok) {
      throw new Error(`Failed to fetch rendered image (${imgResp.status}).`);
    }
    const buf = Buffer.from(await imgResp.arrayBuffer());
    const mime = validateAndDetectImageMime(buf, imgResp.headers.get('content-type'));
    if (!mime) {
      throw new Error('Rendered output was not a valid image.');
    }

    const workerModel = generation.model ? `AI Horde · ${generation.model}` : 'AI Horde';
    return {
      imageUrl: `data:${mime};base64,${buf.toString('base64')}`,
      model: `Free Image AI (${workerModel})`,
    };
  } catch (err: any) {
    errors.push(`AI Horde: ${err?.message || 'request failed'}`);
  }

  throw new ProviderError(
    `Free image generation failed across providers (${errors.join(' | ')}). Please retry in a few seconds.`,
    { code: 'FREE_IMAGE_UNAVAILABLE', rawError: errors.join(' | ') }
  );
}

// 1. REAL IMAGE GENERATION & EDITING (Admin API Management Custom Provider, Free Image AI by default, Custom Endpoint, or Optional Paid Gemini)
export async function generateAIImage(options: {
  prompt: string;
  sourceImageBase64?: string;
  sourceMimeType?: string;
  sourceImages?: Array<{ dataUrl: string; mimeType: string; name?: string }>;
  aspectRatio?: string;
  quality?: '1K' | '2K' | '4K';
  preferredModel?: string;
  seed?: number;
}): Promise<{
  imageUrl: string;
  prompt: string;
  model: string;
  textNote?: string;
}> {
  const {
    prompt,
    sourceImageBase64,
    sourceMimeType,
    sourceImages,
    aspectRatio = '1:1',
    quality = '1K',
    preferredModel,
    seed,
  } = options;
  const cfg = db.getConfig();

  const allSourceImages: Array<{ dataUrl: string; mimeType: string; name?: string }> =
    sourceImages && sourceImages.length > 0
      ? sourceImages
      : sourceImageBase64
      ? [{ dataUrl: sourceImageBase64, mimeType: sourceMimeType || 'image/png' }]
      : [];

  // Option 0: Admin Panel AI Model API Management Provider (explicitly selected OR assigned to image / image_edit)
  const capability = allSourceImages.length > 0 ? 'image_edit' : 'image';
  const assignedProviderId = preferredModel?.startsWith('custom:')
    ? preferredModel.slice('custom:'.length)
    : !preferredModel || preferredModel === 'auto'
    ? db.getFeatureAssignments()[capability]
    : 'built-in';

  if (assignedProviderId && assignedProviderId !== 'built-in') {
    const customProvider = db.getApiProvider(assignedProviderId);
    if (customProvider && customProvider.enabled) {
      const customResult = await executeCustomImageOrEditProvider(customProvider, {
        prompt,
        sourceImages: allSourceImages,
        aspectRatio,
        quality,
      });
      return {
        imageUrl: customResult.imageUrl,
        prompt,
        model: customResult.modelLabel,
        textNote: customResult.textNote,
      };
    } else if (preferredModel?.startsWith('custom:')) {
      throw new ProviderError(
        `Selected API provider "${customProvider?.name || assignedProviderId}" is currently disabled. Enable it in Admin Panel → API Management or select "Auto".`
      );
    }
  }

  // Option A: Custom Compatible Image Provider configured in Legacy Admin Panel Settings
  if (cfg.customImageEndpoint && cfg.customImageKey) {
    const resp = await fetch(cfg.customImageEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.customImageKey}`,
      },
      body: JSON.stringify({
        prompt,
        n: 1,
        size: quality === '4K' ? '1792x1024' : '1024x1024',
        response_format: 'b64_json',
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new ProviderError(`Custom Image Provider error (${resp.status}): ${errText}`, { code: 'CUSTOM_IMAGE_ERROR' });
    }

    const data: any = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    const url = data?.data?.[0]?.url || data?.imageUrl;
    if (b64) {
      return {
        imageUrl: `data:image/png;base64,${b64}`,
        prompt,
        model: 'Custom Image API',
      };
    }
    if (url) {
      return { imageUrl: url, prompt, model: 'Custom Image API' };
    }
    throw new ProviderError('Custom Image Provider returned no image payload.');
  }

  // Option B: Optional Paid Gemini Image Models (ONLY when explicitly selected AND enabled by Admin)
  const isExplicitPaidImageModel =
    preferredModel === 'gemini-3.1-flash-lite-image' ||
    preferredModel === 'gemini-nano-banana-2.1' ||
    preferredModel === 'gemini-3-pro-image';

  if (isExplicitPaidImageModel) {
    const paidModelRow = db.getModels().find((m) => m.id === preferredModel);
    if (paidModelRow && !paidModelRow.enabled) {
      throw new ProviderError(
        `Paid image model "${paidModelRow.name}" is disabled by default. Use "Auto" or "Free Image AI" for free generation, or enable it in the Admin Panel with a billing-enabled API key.`
      );
    }

    const apiKey = getEffectiveGeminiKey();
    if (!apiKey) {
      throw new ProviderError(
        'Selected paid Gemini image model requires a billing-enabled GEMINI_API_KEY in Settings > Secrets.',
        { code: 'MISSING_API_KEY', missingConfig: 'GEMINI_API_KEY', requiresPaidKey: true }
      );
    }

    const ai = getGeminiClient();
    const parts: any[] = [];
    for (const src of allSourceImages) {
      const resolved = await resolveImageToBase64(src.dataUrl, src.mimeType || 'image/png');
      if (resolved) {
        parts.push({ inlineData: { data: resolved.data, mimeType: resolved.mimeType } });
      }
    }
    parts.push({ text: prompt });

    const supportsExtendedAspects =
      preferredModel === 'gemini-nano-banana-2.1' || preferredModel === 'gemini-3-pro-image';
    const validAspects = supportsExtendedAspects
      ? ['1:1', '3:4', '4:3', '9:16', '16:9', '1:4', '1:8', '4:1', '8:1']
      : ['1:1', '3:4', '4:3', '9:16', '16:9'];

    const config: any = {
      imageConfig: {
        aspectRatio: validAspects.includes(aspectRatio) ? aspectRatio : '1:1',
      },
    };
    if (supportsExtendedAspects) {
      config.imageConfig.imageSize = quality;
    }

    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: preferredModel,
          contents: { parts },
          config,
        }),
        45000,
        `Image generation (${preferredModel})`
      );

      let imageUrl = '';
      let textNote = '';
      const candidates = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of candidates) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          imageUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          textNote += part.text;
        }
      }

      if (!imageUrl) {
        throw new ProviderError(
          textNote || `Model "${preferredModel}" completed without returning an image.`
        );
      }

      return {
        imageUrl,
        prompt,
        model: preferredModel,
        textNote: textNote.trim() || undefined,
      };
    } catch (err: any) {
      if (err instanceof ProviderError) throw err;
      throw classifyGeminiError(err, preferredModel);
    }
  }

  // Option C: Free AI Image Generation (Default — works without a paid Gemini API key)
  const freeModelRow = db.getModels().find((m) => m.id === 'free-image-gen');
  if (freeModelRow && !freeModelRow.enabled) {
    throw new ProviderError('Free Image AI is currently disabled by the administrator.');
  }

  let effectivePrompt = prompt;
  let editNote: string | undefined;
  const resolvedList: Array<{ data: string; mimeType: string }> = [];
  for (const src of allSourceImages) {
    const res = await resolveImageToBase64(src.dataUrl, src.mimeType || 'image/png');
    if (res) resolvedList.push(res);
  }
  if (resolvedList.length > 0) {
    effectivePrompt = await synthesizeEditPromptWithGemini(resolvedList, prompt);
    editNote =
      resolvedList.length > 1
        ? `Edited & combined ${resolvedList.length} images using Free Image AI for: **"${prompt}"**`
        : `Edited image using Free Image AI for: **"${prompt}"**`;
  }

  const freeResult = await generateWithFreeImageProviders({
    prompt: effectivePrompt,
    aspectRatio,
    seed,
  });

  return {
    imageUrl: freeResult.imageUrl,
    prompt,
    model: freeResult.model,
    textNote: editNote,
  };
}

// 2. REAL VIDEO GENERATION (Admin API Management Provider, Custom Video Provider, or Gemini Omni 1.2 Flash)
export async function generateAIVideo(options: {
  prompt: string;
  sourceImageBase64?: string;
  sourceMimeType?: string;
  sourceImages?: Array<{ dataUrl: string; mimeType: string }>;
  aspectRatio?: string;
  duration?: string;
  resolution?: string;
  preferredModel?: string;
  onProgress?: (statusDetail: string, progress: number, interactionId?: string) => void;
  shouldCancel?: () => boolean;
}): Promise<{
  videoUrl: string;
  prompt: string;
  duration: string;
  resolution: string;
  model: string;
  interactionId?: string;
}> {
  const {
    prompt,
    sourceImageBase64,
    sourceMimeType,
    sourceImages,
    aspectRatio = '16:9',
    duration = '10s',
    resolution = '720p',
    preferredModel,
    onProgress,
    shouldCancel,
  } = options;

  const cfg = db.getConfig();
  const allSources =
    sourceImages && sourceImages.length > 0
      ? sourceImages
      : sourceImageBase64
      ? [{ dataUrl: sourceImageBase64, mimeType: sourceMimeType || 'image/png' }]
      : [];

  // Option 0: Admin Panel AI Model API Management Provider for Video Generation
  const assignedVideoId = preferredModel?.startsWith('custom:')
    ? preferredModel.slice('custom:'.length)
    : !preferredModel || preferredModel === 'auto'
    ? db.getFeatureAssignments().video
    : 'built-in';

  if (assignedVideoId && assignedVideoId !== 'built-in') {
    const customVideo = db.getApiProvider(assignedVideoId);
    if (customVideo && customVideo.enabled) {
      onProgress?.(`Generating video via ${customVideo.name} (${customVideo.modelName})...`, 25);
      const vidRes = await executeCustomVideoProvider(customVideo, {
        prompt,
        sourceImages: allSources,
        aspectRatio,
        duration,
        resolution,
      });
      return {
        videoUrl: vidRes.videoUrl,
        prompt,
        duration,
        resolution,
        model: vidRes.modelLabel,
      };
    } else if (preferredModel?.startsWith('custom:')) {
      throw new ProviderError(
        `Selected Video API provider "${customVideo?.name || assignedVideoId}" is disabled. Enable it in Admin Panel → API Management.`
      );
    }
  }

  // Option A: Custom Compatible Video API configured in Admin Panel
  if (cfg.customVideoEndpoint && cfg.customVideoKey) {
    onProgress?.('Dispatching request to configured Video API...', 20);
    const resp = await fetch(cfg.customVideoEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.customVideoKey}`,
      },
      body: JSON.stringify({
        prompt,
        image: sourceImageBase64,
        aspect_ratio: aspectRatio,
        duration,
        resolution,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new ProviderError(`Custom Video API error (${resp.status}): ${errText}`);
    }
    const data: any = await resp.json();
    const videoUrl = data?.videoUrl || data?.url || data?.output?.[0];
    if (!videoUrl) {
      throw new ProviderError('Custom Video API returned no video URL.');
    }
    return {
      videoUrl,
      prompt,
      duration,
      resolution,
      model: 'Custom Video API',
    };
  }

  // Option B: Google Gemini Omni 1.2 Flash via Interactions API
  const apiKey = getEffectiveGeminiKey();
  if (!apiKey) {
    throw new ProviderError(
      'Video generation requires a paid GEMINI_API_KEY (for gemini-omni-1.2-flash) or a Custom Video Provider configured in the Admin Panel.',
      { code: 'MISSING_API_KEY', missingConfig: 'GEMINI_API_KEY', requiresPaidKey: true }
    );
  }

  const modelRow = db.getModels().find((m) => m.id === 'gemini-omni-1.2-flash');
  if (modelRow && !modelRow.enabled) {
    throw new ProviderError('Video generation model (gemini-omni-1.2-flash) is disabled by the administrator.');
  }

  const modelName = 'gemini-omni-1.2-flash';

  try {
    const ai = getGeminiClient();
    const input: any[] = [];
    const resolved = await resolveImageToBase64(sourceImageBase64, sourceMimeType || 'image/png');
    if (resolved) {
      input.push({
        type: 'image',
        mime_type: resolved.mimeType,
        data: resolved.data,
      });
    }
    input.push({
      type: 'text',
      text: prompt,
    });

    onProgress?.('Submitting background video job to Gemini Omni 1.2 Flash...', 15);

    const initialInteraction: any = await ai.interactions.create({
      model: modelName,
      input,
      background: true,
      store: true,
      stream: false,
      response_format: {
        type: 'video',
        aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9',
        duration,
        resolution,
      } as any,
    });

    // If synchronous video already returned:
    let finalInteraction = initialInteraction;
    if (initialInteraction?.id && initialInteraction?.status !== 'completed') {
      onProgress?.('Rendering video frames in background...', 35, initialInteraction.id);

      const startedAt = Date.now();
      const maxWaitMs = 240000;
      let pollStep = 0;

      while (Date.now() - startedAt < maxWaitMs) {
        if (shouldCancel?.()) {
          throw new ProviderError('Video generation cancelled by user.', { code: 'CANCELLED' });
        }

        await new Promise((r) => setTimeout(r, 4000));
        pollStep += 1;

        const current: any = await ai.interactions.get(initialInteraction.id);
        finalInteraction = current;

        if (current.status === 'completed') {
          onProgress?.('Finalizing video stream...', 95, current.id);
          break;
        }
        if (current.status === 'failed' || current.status === 'cancelled') {
          throw new ProviderError(
            current.error?.message || `Video generation ${current.status}.`,
            { code: 'VIDEO_FAILED' }
          );
        }

        const estProgress = Math.min(90, 35 + pollStep * 7);
        onProgress?.(`Rendering frames (${current.status || 'in_progress'})...`, estProgress, current.id);
      }
    }

    const videoPart = finalInteraction?.output_video;
    if (videoPart?.data) {
      const mime = videoPart.mime_type || 'video/mp4';
      return {
        videoUrl: `data:${mime};base64,${videoPart.data}`,
        prompt,
        duration,
        resolution,
        model: modelName,
        interactionId: finalInteraction?.id,
      };
    }
    if (videoPart?.uri) {
      return {
        videoUrl: videoPart.uri,
        prompt,
        duration,
        resolution,
        model: modelName,
        interactionId: finalInteraction?.id,
      };
    }

    throw new ProviderError('Gemini Omni finished without returning video output.');
  } catch (err: any) {
    if (err instanceof ProviderError) throw err;
    throw classifyGeminiError(err, modelName);
  }
}

// 3. REAL MUSIC / AUDIO GENERATION (Admin API Management Provider, Custom Audio Provider, or Lyria 3)
export async function generateAIMusic(options: {
  prompt: string;
  sourceImageBase64?: string;
  sourceMimeType?: string;
  sourceImages?: Array<{ dataUrl: string; mimeType: string }>;
  fullTrack?: boolean;
  preferredModel?: string;
}): Promise<{
  audioUrl: string;
  lyrics?: string;
  prompt: string;
  model: string;
}> {
  const { prompt, sourceImageBase64, sourceMimeType, sourceImages, fullTrack = false, preferredModel } = options;
  const cfg = db.getConfig();
  const allSources =
    sourceImages && sourceImages.length > 0
      ? sourceImages
      : sourceImageBase64
      ? [{ dataUrl: sourceImageBase64, mimeType: sourceMimeType || 'image/jpeg' }]
      : [];

  // Option 0: Admin Panel AI Model API Management Provider for Music Generation
  const assignedAudioId = preferredModel?.startsWith('custom:')
    ? preferredModel.slice('custom:'.length)
    : !preferredModel || preferredModel === 'auto'
    ? db.getFeatureAssignments().audio
    : 'built-in';

  if (assignedAudioId && assignedAudioId !== 'built-in') {
    const customAudio = db.getApiProvider(assignedAudioId);
    if (customAudio && customAudio.enabled) {
      const audRes = await executeCustomAudioProvider(customAudio, {
        prompt,
        sourceImages: allSources,
      });
      return {
        audioUrl: audRes.audioUrl,
        lyrics: audRes.lyrics,
        prompt,
        model: audRes.modelLabel,
      };
    } else if (preferredModel?.startsWith('custom:')) {
      throw new ProviderError(
        `Selected Music API provider "${customAudio?.name || assignedAudioId}" is disabled. Enable it in Admin Panel → API Management.`
      );
    }
  }

  // Option A: Custom Compatible Audio Provider
  if (cfg.customAudioEndpoint && cfg.customAudioKey) {
    const resp = await fetch(cfg.customAudioEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.customAudioKey}`,
      },
      body: JSON.stringify({ prompt }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new ProviderError(`Custom Audio API error (${resp.status}): ${errText}`);
    }
    const data: any = await resp.json();
    const audioUrl = data?.audioUrl || data?.url;
    if (!audioUrl) throw new ProviderError('Custom Audio API returned no audio URL.');
    return { audioUrl, prompt, model: 'Custom Audio API', lyrics: data?.lyrics };
  }

  // Option B: Google Gemini Lyria 3
  const apiKey = getEffectiveGeminiKey();
  if (!apiKey) {
    throw new ProviderError(
      'Music generation requires a paid GEMINI_API_KEY (for lyria-3-clip-preview) or a Custom Audio Provider in the Admin Panel.',
      { code: 'MISSING_API_KEY', missingConfig: 'GEMINI_API_KEY', requiresPaidKey: true }
    );
  }

  const modelName = fullTrack ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';
  const modelRow = db.getModels().find((m) => m.id === 'lyria-3-clip-preview');
  if (modelRow && !modelRow.enabled) {
    throw new ProviderError('Music generation (Lyria 3) is disabled by the administrator.');
  }

  try {
    const ai = getGeminiClient();
    const parts: any[] = [{ text: prompt }];
    const resolved = await resolveImageToBase64(sourceImageBase64, sourceMimeType || 'image/jpeg');
    if (resolved) {
      parts.push({
        inlineData: {
          data: resolved.data,
          mimeType: resolved.mimeType,
        },
      });
    }

    const responseStream = await ai.models.generateContentStream({
      model: modelName,
      contents: parts.length === 1 ? prompt : { parts },
    });

    const audioChunks: Buffer[] = [];
    let lyrics = '';
    let mimeType = 'audio/mpeg';

    for await (const chunk of responseStream) {
      const chunkParts = chunk.candidates?.[0]?.content?.parts;
      if (!chunkParts) continue;
      for (const part of chunkParts) {
        if (part.inlineData?.data) {
          if (audioChunks.length === 0 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
        }
        if (part.text) {
          lyrics += part.text;
        }
      }
    }

    if (audioChunks.length === 0) {
      throw new ProviderError('Lyria completed without returning audio data.');
    }

    const audioBase64 = Buffer.concat(audioChunks).toString('base64');
    return {
      audioUrl: `data:${mimeType};base64,${audioBase64}`,
      lyrics: lyrics.trim() || undefined,
      prompt,
      model: modelName,
    };
  } catch (err: any) {
    if (err instanceof ProviderError) throw err;
    throw classifyGeminiError(err, modelName);
  }
}
