import { GoogleGenAI } from '@google/genai';
import { ApiConnectionTestResult } from '../src/types.js';
import { ApiProviderRecord } from './db.js';
import { resolveProviderSecret } from './secrets.js';
import {
  ProviderError,
  classifyGeminiError,
  withTimeout,
  aspectRatioToDimensions,
  synthesizeEditPromptWithGemini,
} from './mediaGenerators.js';

function parseJsonSafe(raw?: string): Record<string, any> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function buildAuthHeaders(
  record: Pick<ApiProviderRecord, 'authHeader' | 'authPrefix' | 'extraHeadersJson'>,
  apiKey: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const extra = parseJsonSafe(record.extraHeadersJson);
  for (const [k, v] of Object.entries(extra)) {
    if (typeof v === 'string') headers[k] = v;
  }
  if (apiKey) {
    const headerName = (record.authHeader || 'Authorization').trim();
    const prefix = record.authPrefix !== undefined ? record.authPrefix : 'Bearer ';
    headers[headerName] = `${prefix}${apiKey}`;
  }
  return headers;
}

function resolveOpenAIChatUrl(apiUrl: string): string {
  const clean = apiUrl.trim().replace(/\/+$/, '');
  if (!clean) return 'https://api.openai.com/v1/chat/completions';
  if (clean.endsWith('/chat/completions') || clean.endsWith('/responses')) return clean;
  if (clean.endsWith('/v1') || clean.endsWith('/openai/v1')) return `${clean}/chat/completions`;
  return clean;
}

function resolveOpenAIImageUrl(apiUrl: string, isEdit: boolean): string {
  const clean = apiUrl.trim().replace(/\/+$/, '');
  if (!clean) {
    return isEdit
      ? 'https://api.openai.com/v1/images/edits'
      : 'https://api.openai.com/v1/images/generations';
  }
  if (clean.endsWith('/v1')) {
    return isEdit ? `${clean}/images/edits` : `${clean}/images/generations`;
  }
  return clean;
}

function detectImageMime(buf: Buffer, headerMime?: string | null): string | null {
  if (!buf || buf.length < 512) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  if (headerMime && headerMime.startsWith('image/') && !headerMime.includes('svg')) {
    return headerMime.split(';')[0].trim();
  }
  return null;
}

function splitDataUrl(dataUrl: string, fallbackMime = 'image/png'): { mimeType: string; base64: string; buffer: Buffer } | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1],
      base64: match[2],
      buffer: Buffer.from(match[2], 'base64'),
    };
  }
  return null;
}

function getEffectiveSecret(
  record: Pick<ApiProviderRecord, 'id' | 'apiKeyEnvVar'>,
  draftOverrideKey?: string
): { key: string; source: 'draft' | 'env' | 'server_secret' | 'none' } {
  if (draftOverrideKey && draftOverrideKey.trim()) {
    return { key: draftOverrideKey.trim(), source: 'draft' };
  }
  return resolveProviderSecret(record.id, record.apiKeyEnvVar);
}

export async function testApiProviderConnection(
  record: ApiProviderRecord,
  draftOverrideKey?: string
): Promise<ApiConnectionTestResult> {
  const started = Date.now();
  const { key } = getEffectiveSecret(record, draftOverrideKey);

  if (!record.modelName?.trim()) {
    return {
      connected: false,
      configured: false,
      providerId: record.id,
      category: record.category,
      modelName: '',
      latencyMs: Date.now() - started,
      message: 'Model ID / Name is required before testing.',
    };
  }

  if (record.providerType !== 'custom_rest' && !key) {
    return {
      connected: false,
      configured: false,
      providerId: record.id,
      category: record.category,
      modelName: record.modelName,
      latencyMs: Date.now() - started,
      message: `API key is not set yet. Paste a key or set server environment variable ${record.apiKeyEnvVar || '(e.g. OPENAI_API_KEY)'}.`,
    };
  }

  const timeoutMs = Math.min(record.timeoutMs || 20000, 25000);

  try {
    // 1. Google Gemini Protocol
    if (record.providerType === 'google_gemini') {
      const cleanUrl = (record.apiUrl || '').trim().replace(/\/+$/, '');
      const ai = new GoogleGenAI({
        apiKey: key,
        ...(cleanUrl && !cleanUrl.includes('generativelanguage.googleapis.com/v1beta')
          ? { httpOptions: { baseUrl: cleanUrl } }
          : {}),
      });

      if (record.category === 'video' || record.category === 'audio') {
        await withTimeout(ai.models.get({ model: record.modelName }), timeoutMs, 'Gemini model lookup');
        const latencyMs = Date.now() - started;
        return {
          connected: true,
          configured: true,
          providerId: record.id,
          category: record.category,
          modelName: record.modelName,
          latencyMs,
          httpStatus: 200,
          message: `Connected · Verified Gemini model "${record.modelName}" (${latencyMs}ms)`,
        };
      }

      const isImg = record.category === 'image' || record.category === 'image_edit';
      await withTimeout(
        ai.models.generateContent({
          model: record.modelName,
          contents: isImg ? 'A small minimal star icon on black background' : 'Reply with OK.',
          ...(isImg ? { config: { imageConfig: { aspectRatio: '1:1' } } } : {}),
        }),
        timeoutMs,
        `Gemini test (${record.modelName})`
      );
      const latencyMs = Date.now() - started;
      return {
        connected: true,
        configured: true,
        providerId: record.id,
        category: record.category,
        modelName: record.modelName,
        latencyMs,
        httpStatus: 200,
        message: `Connected to ${record.modelName} (${latencyMs}ms)`,
      };
    }

    // 2. Anthropic Protocol
    if (record.providerType === 'anthropic') {
      const url = (record.apiUrl || '').trim() || 'https://api.anthropic.com/v1/messages';
      const headers = buildAuthHeaders(
        {
          authHeader: record.authHeader || 'x-api-key',
          authPrefix: record.authPrefix !== undefined ? record.authPrefix : '',
          extraHeadersJson: record.extraHeadersJson,
        },
        key
      );
      if (!headers['anthropic-version']) headers['anthropic-version'] = '2023-06-01';

      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: record.modelName,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'OK' }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const latencyMs = Date.now() - started;
      if (!resp.ok) {
        const errTxt = await resp.text().catch(() => '');
        return {
          connected: false,
          configured: true,
          providerId: record.id,
          category: record.category,
          modelName: record.modelName,
          latencyMs,
          httpStatus: resp.status,
          message: `HTTP ${resp.status}: ${errTxt.slice(0, 180) || resp.statusText}`,
        };
      }
      return {
        connected: true,
        configured: true,
        providerId: record.id,
        category: record.category,
        modelName: record.modelName,
        latencyMs,
        httpStatus: resp.status,
        message: `Connected to Anthropic ${record.modelName} (${latencyMs}ms)`,
      };
    }

    // 3. Hugging Face Inference Protocol
    if (record.providerType === 'huggingface') {
      const resp = await fetch('https://huggingface.co/api/whoami-v2', {
        headers: {
          Authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const latencyMs = Date.now() - started;
      if (!resp.ok) {
        const errTxt = await resp.text().catch(() => '');
        return {
          connected: false,
          configured: true,
          providerId: record.id,
          category: record.category,
          modelName: record.modelName,
          latencyMs,
          httpStatus: resp.status,
          message: `Hugging Face auth failed (HTTP ${resp.status}): ${errTxt.slice(0, 180) || 'Invalid or expired HF_TOKEN.'}`,
        };
      }
      const who: any = await resp.json().catch(() => ({}));
      const userName = who?.name || who?.fullname || 'Hugging Face user';
      return {
        connected: true,
        configured: true,
        providerId: record.id,
        category: record.category,
        modelName: record.modelName,
        latencyMs,
        httpStatus: 200,
        message: `Connected as "${userName}" · Router ready for "${record.modelName}" (${latencyMs}ms)`,
      };
    }

    // 4. PhotoRoom Official API Protocol
    if (record.providerType === 'photoroom') {
      const accountUrl = 'https://image-api.photoroom.com/v2/account';
      const resp = await fetch(accountUrl, {
        method: 'GET',
        headers: {
          'x-api-key': key,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const latencyMs = Date.now() - started;
      if (!resp.ok) {
        const errTxt = await resp.text().catch(() => '');
        return {
          connected: false,
          configured: true,
          providerId: record.id,
          category: record.category,
          modelName: record.modelName,
          latencyMs,
          httpStatus: resp.status,
          message: `PhotoRoom auth failed (HTTP ${resp.status}): ${errTxt.slice(0, 180) || 'Invalid PHOTOROOM_API_KEY.'}`,
        };
      }
      const data: any = await resp.json().catch(() => ({}));
      const availableCredits = data?.credits?.available ?? data?.credits?.subscription ?? 'Active';
      return {
        connected: true,
        configured: true,
        providerId: record.id,
        category: record.category,
        modelName: record.modelName,
        latencyMs,
        httpStatus: 200,
        message: `Connected to PhotoRoom API · Available Credits: ${availableCredits} (${latencyMs}ms)`,
      };
    }

    // 4. OpenAI-Compatible Protocol
    if (record.providerType === 'openai_compatible') {
      const headers = buildAuthHeaders(record, key);
      if (record.category === 'text' || record.category === 'code') {
        const url = resolveOpenAIChatUrl(record.apiUrl);
        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: record.modelName,
            messages: [{ role: 'user', content: 'Reply with OK' }],
            max_tokens: 8,
            ...parseJsonSafe(record.extraBodyJson),
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latencyMs = Date.now() - started;
        if (!resp.ok) {
          const errTxt = await resp.text().catch(() => '');
          return {
            connected: false,
            configured: true,
            providerId: record.id,
            category: record.category,
            modelName: record.modelName,
            latencyMs,
            httpStatus: resp.status,
            message: `HTTP ${resp.status}: ${errTxt.slice(0, 180) || resp.statusText}`,
          };
        }
        return {
          connected: true,
          configured: true,
          providerId: record.id,
          category: record.category,
          modelName: record.modelName,
          latencyMs,
          httpStatus: resp.status,
          message: `Connected to ${record.modelName} (${latencyMs}ms)`,
        };
      } else {
        // For image / image_edit / video / audio, probe /v1/models on same base without spending media generation credits
        const base = record.apiUrl?.trim()
          ? new URL(record.apiUrl.trim())
          : new URL('https://api.openai.com/v1/models');
        const modelsProbeUrl = record.apiUrl?.includes('/v1/')
          ? `${record.apiUrl.trim().split('/v1/')[0]}/v1/models`
          : `${base.origin}/v1/models`;

        const resp = await fetch(modelsProbeUrl, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latencyMs = Date.now() - started;
        if (resp.ok) {
          return {
            connected: true,
            configured: true,
            providerId: record.id,
            category: record.category,
            modelName: record.modelName,
            latencyMs,
            httpStatus: resp.status,
            message: `Authenticated & reachable for ${record.modelName} (${latencyMs}ms)`,
          };
        }
        const errTxt = await resp.text().catch(() => '');
        return {
          connected: false,
          configured: true,
          providerId: record.id,
          category: record.category,
          modelName: record.modelName,
          latencyMs,
          httpStatus: resp.status,
          message: `HTTP ${resp.status} checking ${modelsProbeUrl}: ${errTxt.slice(0, 150)}`,
        };
      }
    }

    // 5. Custom REST Protocol
    if (!record.apiUrl?.trim()) {
      return {
        connected: false,
        configured: false,
        providerId: record.id,
        category: record.category,
        modelName: record.modelName,
        latencyMs: Date.now() - started,
        message: 'API URL is required for Custom REST providers.',
      };
    }

    const headers = buildAuthHeaders(record, key);
    const resp = await fetch(record.apiUrl.trim(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: record.modelName,
        prompt: 'Reply with OK',
        messages: [{ role: 'user', content: 'OK' }],
        test: true,
        ...parseJsonSafe(record.extraBodyJson),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - started;
    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => '');
      return {
        connected: false,
        configured: true,
        providerId: record.id,
        category: record.category,
        modelName: record.modelName,
        latencyMs,
        httpStatus: resp.status,
        message: `HTTP ${resp.status}: ${errTxt.slice(0, 180) || resp.statusText}`,
      };
    }
    return {
      connected: true,
      configured: true,
      providerId: record.id,
      category: record.category,
      modelName: record.modelName,
      latencyMs,
      httpStatus: resp.status,
      message: `Connected to ${record.name} (${latencyMs}ms)`,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      connected: false,
      configured: true,
      providerId: record.id,
      category: record.category,
      modelName: record.modelName,
      latencyMs,
      message: err?.message || 'Connection failed.',
    };
  }
}

export async function executeCustomTextOrCodeProvider(
  record: ApiProviderRecord,
  options: {
    prompt: string;
    systemInstruction: string;
    historyText?: string;
    attachments?: Array<{ type: string; mimeType: string; name: string; dataUrl?: string; textPreview?: string }>;
  }
): Promise<{ text: string; modelLabel: string }> {
  const { key } = resolveProviderSecret(record.id, record.apiKeyEnvVar);
  if (record.providerType !== 'custom_rest' && !key) {
    throw new ProviderError(
      `API provider "${record.name}" (${record.category === 'code' ? 'Code AI API' : 'Text AI API'}) is assigned but no API key is configured. Add its key in Admin Panel → API Management or switch the assignment back to Built-in.`,
      { code: 'MISSING_API_KEY', missingConfig: record.apiKeyEnvVar || record.name }
    );
  }

  const timeoutMs = record.timeoutMs || 35000;
  const fullUserPrompt = `${options.historyText || ''}${options.prompt || ''}`.trim();
  const modelLabel = `${record.name} (${record.modelName})`;

  // 1. Google Gemini Custom Provider
  if (record.providerType === 'google_gemini') {
    const cleanUrl = (record.apiUrl || '').trim().replace(/\/+$/, '');
    const ai = new GoogleGenAI({
      apiKey: key,
      ...(cleanUrl && !cleanUrl.includes('generativelanguage.googleapis.com/v1beta')
        ? { httpOptions: { baseUrl: cleanUrl } }
        : {}),
    });
    const parts: any[] = [];
    for (const att of options.attachments || []) {
      const split = att.dataUrl ? splitDataUrl(att.dataUrl, att.mimeType) : null;
      if (split && (att.mimeType?.startsWith('image/') || att.mimeType === 'application/pdf' || att.mimeType?.startsWith('audio/') || att.mimeType?.startsWith('video/'))) {
        parts.push({ inlineData: { data: split.base64, mimeType: split.mimeType } });
      } else if (att.textPreview) {
        parts.push({ text: `[Attachment: ${att.name}]\n${att.textPreview}` });
      } else if (split) {
        parts.push({ text: `[Attachment: ${att.name}]\n${split.buffer.toString('utf-8').slice(0, 40000)}` });
      }
    }
    parts.push({ text: fullUserPrompt });

    try {
      const res = await withTimeout(
        ai.models.generateContent({
          model: record.modelName,
          contents: { parts },
          config: { systemInstruction: options.systemInstruction },
        }),
        timeoutMs,
        `Custom Gemini (${record.modelName})`
      );
      const text = (res.text || '').trim();
      if (!text) throw new ProviderError(`Model "${record.modelName}" returned an empty response.`);
      return { text, modelLabel };
    } catch (err: any) {
      throw classifyGeminiError(err, record.modelName);
    }
  }

  // 2. Anthropic Messages API
  if (record.providerType === 'anthropic') {
    const url = (record.apiUrl || '').trim() || 'https://api.anthropic.com/v1/messages';
    const headers = buildAuthHeaders(
      {
        authHeader: record.authHeader || 'x-api-key',
        authPrefix: record.authPrefix !== undefined ? record.authPrefix : '',
        extraHeadersJson: record.extraHeadersJson,
      },
      key
    );
    if (!headers['anthropic-version']) headers['anthropic-version'] = '2023-06-01';

    const contentBlocks: any[] = [];
    for (const att of options.attachments || []) {
      const split = att.dataUrl ? splitDataUrl(att.dataUrl, att.mimeType) : null;
      if (split && split.mimeType.startsWith('image/')) {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: split.mimeType, data: split.base64 },
        });
      } else if (att.textPreview) {
        contentBlocks.push({ type: 'text', text: `[Attachment: ${att.name}]\n${att.textPreview}` });
      }
    }
    contentBlocks.push({ type: 'text', text: fullUserPrompt });

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: record.modelName,
        max_tokens: 4096,
        system: options.systemInstruction,
        messages: [{ role: 'user', content: contentBlocks }],
        ...parseJsonSafe(record.extraBodyJson),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => '');
      throw new ProviderError(`${record.name} error (HTTP ${resp.status}): ${errTxt.slice(0, 240)}`, {
        httpStatus: resp.status,
        rawError: errTxt,
      });
    }
    const data: any = await resp.json();
    const text = Array.isArray(data?.content)
      ? data.content.map((b: any) => b?.text || '').join('\n').trim()
      : '';
    if (!text) throw new ProviderError(`${record.name} returned an empty response.`);
    return { text, modelLabel };
  }

  // 3. Hugging Face Text/Chat Inference
  if (record.providerType === 'huggingface') {
    const url =
      (record.apiUrl || '').trim() ||
      `https://router.huggingface.co/hf-inference/models/${record.modelName}/v1/chat/completions`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders(record, key),
      body: JSON.stringify({
        model: record.modelName,
        messages: [
          { role: 'system', content: options.systemInstruction },
          { role: 'user', content: fullUserPrompt },
        ],
        max_tokens: 2048,
        ...parseJsonSafe(record.extraBodyJson),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => '');
      throw new ProviderError(`${record.name} error (HTTP ${resp.status}): ${errTxt.slice(0, 240)}`, {
        httpStatus: resp.status,
      });
    }
    const data: any = await resp.json();
    const text =
      data?.choices?.[0]?.message?.content ||
      data?.[0]?.generated_text ||
      data?.generated_text ||
      '';
    if (!text.trim()) throw new ProviderError(`${record.name} returned an empty response.`);
    return { text: text.trim(), modelLabel };
  }

  // 4. OpenAI-Compatible or Custom REST
  const url =
    record.providerType === 'openai_compatible'
      ? resolveOpenAIChatUrl(record.apiUrl)
      : record.apiUrl.trim();

  if (!url) {
    throw new ProviderError(`Provider "${record.name}" is missing an API URL.`);
  }

  const userContentParts: any[] = [];
  let hasImageParts = false;
  for (const att of options.attachments || []) {
    if (att.dataUrl && att.mimeType?.startsWith('image/')) {
      hasImageParts = true;
      userContentParts.push({ type: 'image_url', image_url: { url: att.dataUrl } });
    } else if (att.textPreview) {
      userContentParts.push({ type: 'text', text: `[Attachment: ${att.name}]\n${att.textPreview}` });
    }
  }

  const messagesPayload =
    hasImageParts
      ? [
          { role: 'system', content: options.systemInstruction },
          {
            role: 'user',
            content: [...userContentParts, { type: 'text', text: fullUserPrompt }],
          },
        ]
      : [
          { role: 'system', content: options.systemInstruction },
          { role: 'user', content: fullUserPrompt },
        ];

  const resp = await fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(record, key),
    body: JSON.stringify({
      model: record.modelName,
      messages: messagesPayload,
      prompt: fullUserPrompt,
      ...parseJsonSafe(record.extraBodyJson),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    const errTxt = await resp.text().catch(() => '');
    throw new ProviderError(`${record.name} error (HTTP ${resp.status}): ${errTxt.slice(0, 240)}`, {
      httpStatus: resp.status,
      rawError: errTxt,
    });
  }

  const data: any = await resp.json();
  const text =
    data?.choices?.[0]?.message?.content ||
    data?.output_text ||
    data?.reply ||
    data?.text ||
    data?.content ||
    '';

  if (!String(text).trim()) {
    throw new ProviderError(`${record.name} returned an empty response.`);
  }
  return { text: String(text).trim(), modelLabel };
}

export async function executeCustomImageOrEditProvider(
  record: ApiProviderRecord,
  options: {
    prompt: string;
    sourceImages?: Array<{ dataUrl: string; mimeType: string; name?: string }>;
    aspectRatio?: string;
    quality?: '1K' | '2K' | '4K';
  }
): Promise<{ imageUrl: string; modelLabel: string; textNote?: string }> {
  const { key } = resolveProviderSecret(record.id, record.apiKeyEnvVar);
  const featureLabel = record.category === 'image_edit' ? 'Multi-Image Editing API' : 'Image Generation API';

  if (record.providerType !== 'custom_rest' && !key) {
    throw new ProviderError(
      `API provider "${record.name}" (${featureLabel}) is assigned but no API key is configured. Add its key in Admin Panel → API Management or switch back to Built-in.`,
      { code: 'MISSING_API_KEY', missingConfig: record.apiKeyEnvVar || record.name }
    );
  }

  const timeoutMs = record.timeoutMs || 45000;
  const modelLabel = `${record.name} (${record.modelName})`;
  const sourceImages = options.sourceImages || [];

  // 1. Google Gemini Image / Multi-Image Editing
  if (record.providerType === 'google_gemini') {
    const cleanUrl = (record.apiUrl || '').trim().replace(/\/+$/, '');
    const ai = new GoogleGenAI({
      apiKey: key,
      ...(cleanUrl && !cleanUrl.includes('generativelanguage.googleapis.com/v1beta')
        ? { httpOptions: { baseUrl: cleanUrl } }
        : {}),
    });

    const parts: any[] = [];
    for (const img of sourceImages) {
      const split = splitDataUrl(img.dataUrl, img.mimeType);
      if (split) {
        parts.push({ inlineData: { data: split.base64, mimeType: split.mimeType } });
      }
    }
    parts.push({ text: options.prompt });

    try {
      const res = await withTimeout(
        ai.models.generateContent({
          model: record.modelName,
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: options.aspectRatio || '1:1',
            },
          },
        }),
        timeoutMs,
        `Custom Gemini Image (${record.modelName})`
      );

      let imageUrl = '';
      let textNote = '';
      for (const part of res.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        } else if (part.text) {
          textNote += part.text;
        }
      }
      if (!imageUrl) {
        throw new ProviderError(textNote || `${record.name} completed without returning an image.`);
      }
      return { imageUrl, modelLabel, textNote: textNote.trim() || undefined };
    } catch (err: any) {
      throw classifyGeminiError(err, record.modelName);
    }
  }

  // 2. Hugging Face Image Generation & Editing Protocol
  if (record.providerType === 'huggingface') {
    const cleanBase = (record.apiUrl || '').trim().replace(/\/+$/, '');
    const modelTarget = record.modelName || 'black-forest-labs/FLUX.1-schnell';
    const url = cleanBase.includes('/models/')
      ? cleanBase
      : `${cleanBase || 'https://router.huggingface.co'}/hf-inference/models/${modelTarget}`;

    const dims = aspectRatioToDimensions(options.aspectRatio || '1:1', 1024);

    if (sourceImages.length > 0) {
      // Image-to-image or Multi-image synthesis preserving subjects
      const primaryImage = sourceImages[0];
      const split = splitDataUrl(primaryImage.dataUrl, primaryImage.mimeType);

      let effectivePrompt = options.prompt;
      if (sourceImages.length > 1) {
        const resolvedList: Array<{ data: string; mimeType: string }> = [];
        for (const s of sourceImages) {
          const sp = splitDataUrl(s.dataUrl, s.mimeType);
          if (sp) resolvedList.push({ data: sp.base64, mimeType: sp.mimeType });
        }
        effectivePrompt = await synthesizeEditPromptWithGemini(resolvedList, options.prompt);
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          ...parseJsonSafe(record.extraHeadersJson),
        },
        body: JSON.stringify({
          inputs: effectivePrompt,
          ...(split ? { image: split.base64 } : {}),
          parameters: {
            width: dims.width,
            height: dims.height,
            ...parseJsonSafe(record.extraBodyJson),
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!resp.ok) {
        const errTxt = await resp.text().catch(() => '');
        throw new ProviderError(`Hugging Face error (HTTP ${resp.status}): ${errTxt.slice(0, 240)}`, {
          httpStatus: resp.status,
        });
      }

      const buf = Buffer.from(await resp.arrayBuffer());
      const mime = detectImageMime(buf, resp.headers.get('content-type'));
      if (!mime) {
        throw new ProviderError(`Hugging Face returned non-image bytes.`);
      }

      return {
        imageUrl: `data:${mime};base64,${buf.toString('base64')}`,
        modelLabel,
        textNote:
          sourceImages.length > 1
            ? `Combined and edited using Hugging Face (${modelTarget}), preserving original subjects and appearance.`
            : `Photo edited using Hugging Face (${modelTarget}).`,
      };
    }

    // Text-to-Image Generation
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...parseJsonSafe(record.extraHeadersJson),
      },
      body: JSON.stringify({
        inputs: options.prompt,
        parameters: {
          width: dims.width,
          height: dims.height,
          ...parseJsonSafe(record.extraBodyJson),
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => '');
      throw new ProviderError(`Hugging Face error (HTTP ${resp.status}): ${errTxt.slice(0, 240)}`, {
        httpStatus: resp.status,
      });
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    const mime = detectImageMime(buf, resp.headers.get('content-type'));
    if (!mime) {
      throw new ProviderError(`Hugging Face did not return valid image bytes.`);
    }

    return {
      imageUrl: `data:${mime};base64,${buf.toString('base64')}`,
      modelLabel,
    };
  }

  // 3. PhotoRoom Official Image Editing API Protocol
  if (record.providerType === 'photoroom') {
    if (sourceImages.length === 0) {
      throw new ProviderError(
        'PhotoRoom is an image editing & background API that requires an uploaded image. Please attach a photo or select an image generation model (Hugging Face / Gemini / Free Image AI).'
      );
    }

    const editUrl = (record.apiUrl || '').trim() || 'https://image-api.photoroom.com/v2/edit';
    const primaryImage = sourceImages[0];
    const split = splitDataUrl(primaryImage.dataUrl, primaryImage.mimeType);
    if (!split) {
      throw new ProviderError('Unable to process the uploaded image for PhotoRoom API.');
    }

    const form = new FormData();
    const ext = split.mimeType.includes('jpeg') ? 'jpg' : split.mimeType.includes('webp') ? 'webp' : 'png';
    form.append(
      'imageFile',
      new Blob([new Uint8Array(split.buffer)], { type: split.mimeType }),
      `input.${ext}`
    );
    form.append('export.format', 'png');

    const pLower = (options.prompt || '').toLowerCase();
    const isBgRemoval =
      pLower.includes('remove background') ||
      pLower.includes('transparent background') ||
      pLower.includes('cutout') ||
      pLower.includes('isolate subject') ||
      pLower.includes('extract person') ||
      pLower.includes('delete background');

    const isColor =
      pLower.includes('white background')
        ? 'FFFFFF'
        : pLower.includes('black background')
        ? '000000'
        : pLower.includes('blue background')
        ? '1E40AF'
        : pLower.includes('red background')
        ? 'DC2626'
        : pLower.includes('green background')
        ? '16A34A'
        : pLower.includes('gray background') || pLower.includes('grey background')
        ? '9CA3AF'
        : null;

    if (isColor) {
      form.append('background.color', isColor);
    } else if (isBgRemoval && !pLower.includes('replace') && !pLower.includes('scene') && !pLower.includes('on a ')) {
      form.append('removeBackground', 'true');
    } else {
      // AI Scene Background Generation / Prompt-Based Photo Editing
      form.append('background.prompt', options.prompt);
      form.append('referenceBox', 'originalImage');
    }

    const extra = parseJsonSafe(record.extraBodyJson);
    for (const [k, v] of Object.entries(extra)) {
      if (typeof v === 'string') form.append(k, v);
    }

    const headers: Record<string, string> = {
      'x-api-key': key,
      'pr-hd-background-removal': 'auto',
      ...parseJsonSafe(record.extraHeadersJson),
    };

    const resp = await fetch(editUrl, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => '');
      throw new ProviderError(`PhotoRoom API error (HTTP ${resp.status}): ${errTxt.slice(0, 240)}`, {
        httpStatus: resp.status,
      });
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    const mime = detectImageMime(buf, resp.headers.get('content-type')) || 'image/png';

    const note = isColor
      ? `Replaced background with PhotoRoom solid color (#${isColor}).`
      : isBgRemoval
      ? 'Removed background and isolated subject with PhotoRoom HD cutout.'
      : `Edited scene with PhotoRoom AI background for: "${options.prompt}".`;

    return {
      imageUrl: `data:${mime};base64,${buf.toString('base64')}`,
      modelLabel: 'PhotoRoom (v2/edit)',
      textNote: note,
    };
  }

  // 3. OpenAI-Compatible / Custom REST (supports single & multi-image editing)
  const isEdit = record.category === 'image_edit' && sourceImages.length > 0;
  const url =
    record.providerType === 'openai_compatible'
      ? resolveOpenAIImageUrl(record.apiUrl, isEdit)
      : record.apiUrl.trim();

  if (!url) {
    throw new ProviderError(`Provider "${record.name}" is missing an API URL.`);
  }

  const size =
    options.aspectRatio === '16:9'
      ? '1792x1024'
      : options.aspectRatio === '9:16'
      ? '1024x1792'
      : '1024x1024';

  let resp: globalThis.Response;
  if (isEdit && url.includes('/images/edits')) {
    const form = new FormData();
    form.append('model', record.modelName);
    form.append('prompt', options.prompt);
    form.append('n', '1');
    form.append('size', size === '1792x1024' ? '1536x1024' : size === '1024x1792' ? '1024x1536' : '1024x1024');
    sourceImages.forEach((img, idx) => {
      const split = splitDataUrl(img.dataUrl, img.mimeType);
      if (split) {
        const ext = split.mimeType.includes('jpeg') ? 'jpg' : split.mimeType.includes('webp') ? 'webp' : 'png';
        const fieldName = sourceImages.length > 1 ? 'image[]' : 'image';
        form.append(
          fieldName,
          new Blob([new Uint8Array(split.buffer)], { type: split.mimeType }),
          `input-${idx}.${ext}`
        );
      }
    });
    const headers = buildAuthHeaders(record, key);
    delete headers['Content-Type']; // let fetch set multipart boundary
    resp = await fetch(url, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } else {
    resp = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders(record, key),
      body: JSON.stringify({
        model: record.modelName,
        prompt: options.prompt,
        n: 1,
        size,
        ...(sourceImages.length > 0 ? { images: sourceImages.map((s) => s.dataUrl), image: sourceImages[0].dataUrl } : {}),
        response_format: 'b64_json',
        ...parseJsonSafe(record.extraBodyJson),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  if (!resp.ok) {
    const errTxt = await resp.text().catch(() => '');
    throw new ProviderError(`${record.name} error (HTTP ${resp.status}): ${errTxt.slice(0, 240)}`, {
      httpStatus: resp.status,
      rawError: errTxt,
    });
  }

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.startsWith('image/')) {
    const buf = Buffer.from(await resp.arrayBuffer());
    const mime = detectImageMime(buf, contentType);
    if (!mime) throw new ProviderError(`${record.name} returned invalid image bytes.`);
    return { imageUrl: `data:${mime};base64,${buf.toString('base64')}`, modelLabel };
  }

  const data: any = await resp.json();
  const b64 = data?.data?.[0]?.b64_json || data?.b64_json || data?.imageBase64;
  const imgUrl = data?.data?.[0]?.url || data?.imageUrl || data?.url || data?.output?.[0];
  if (b64) {
    return { imageUrl: `data:image/png;base64,${b64}`, modelLabel };
  }
  if (imgUrl) {
    return { imageUrl: imgUrl, modelLabel };
  }
  throw new ProviderError(`${record.name} returned no image payload.`);
}

export async function executeCustomVideoProvider(
  record: ApiProviderRecord,
  options: {
    prompt: string;
    sourceImages?: Array<{ dataUrl: string; mimeType: string }>;
    aspectRatio?: string;
    duration?: string;
    resolution?: string;
  }
): Promise<{ videoUrl: string; modelLabel: string }> {
  const { key } = resolveProviderSecret(record.id, record.apiKeyEnvVar);
  if (record.providerType !== 'custom_rest' && !key) {
    throw new ProviderError(
      `API provider "${record.name}" (Video Generation API) is assigned but no API key is configured. Add its key in Admin Panel → API Management.`,
      { code: 'MISSING_API_KEY', missingConfig: record.apiKeyEnvVar || record.name }
    );
  }

  const modelLabel = `${record.name} (${record.modelName})`;
  const timeoutMs = record.timeoutMs || 90000;

  if (record.providerType === 'google_gemini') {
    const ai = new GoogleGenAI({ apiKey: key });
    const input: any[] = [];
    for (const img of options.sourceImages || []) {
      const split = splitDataUrl(img.dataUrl, img.mimeType);
      if (split) input.push({ type: 'image', mime_type: split.mimeType, data: split.base64 });
    }
    input.push({ type: 'text', text: options.prompt });

    try {
      const initial: any = await ai.interactions.create({
        model: record.modelName,
        input,
        background: true,
        store: true,
        stream: false,
        response_format: {
          type: 'video',
          aspect_ratio: options.aspectRatio === '9:16' ? '9:16' : '16:9',
          duration: options.duration || '10s',
          resolution: options.resolution || '720p',
        } as any,
      });

      let finalInteraction = initial;
      if (initial?.id && initial?.status !== 'completed') {
        const start = Date.now();
        while (Date.now() - start < 240000) {
          await new Promise((r) => setTimeout(r, 4000));
          const cur: any = await ai.interactions.get(initial.id);
          finalInteraction = cur;
          if (cur.status === 'completed') break;
          if (cur.status === 'failed' || cur.status === 'cancelled') {
            throw new ProviderError(cur.error?.message || `Video generation ${cur.status}`);
          }
        }
      }
      const videoPart = finalInteraction?.output_video;
      if (videoPart?.data) {
        return {
          videoUrl: `data:${videoPart.mime_type || 'video/mp4'};base64,${videoPart.data}`,
          modelLabel,
        };
      }
      if (videoPart?.uri) {
        return { videoUrl: videoPart.uri, modelLabel };
      }
      throw new ProviderError(`${record.name} finished without returning video output.`);
    } catch (err: any) {
      throw classifyGeminiError(err, record.modelName);
    }
  }

  const url = record.apiUrl.trim();
  if (!url) throw new ProviderError(`Provider "${record.name}" is missing an API URL.`);

  const resp = await fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(record, key),
    body: JSON.stringify({
      model: record.modelName,
      prompt: options.prompt,
      image: options.sourceImages?.[0]?.dataUrl,
      images: options.sourceImages?.map((s) => s.dataUrl),
      aspect_ratio: options.aspectRatio || '16:9',
      duration: options.duration || '10s',
      resolution: options.resolution || '720p',
      ...parseJsonSafe(record.extraBodyJson),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    const errTxt = await resp.text().catch(() => '');
    throw new ProviderError(`${record.name} error (HTTP ${resp.status}): ${errTxt.slice(0, 240)}`, {
      httpStatus: resp.status,
    });
  }
  const data: any = await resp.json();
  const videoUrl = data?.videoUrl || data?.url || data?.output?.[0] || data?.data?.[0]?.url;
  if (!videoUrl) throw new ProviderError(`${record.name} returned no video URL.`);
  return { videoUrl, modelLabel };
}

export async function executeCustomAudioProvider(
  record: ApiProviderRecord,
  options: {
    prompt: string;
    sourceImages?: Array<{ dataUrl: string; mimeType: string }>;
  }
): Promise<{ audioUrl: string; lyrics?: string; modelLabel: string }> {
  const { key } = resolveProviderSecret(record.id, record.apiKeyEnvVar);
  if (record.providerType !== 'custom_rest' && !key) {
    throw new ProviderError(
      `API provider "${record.name}" (Music Generation API) is assigned but no API key is configured. Add its key in Admin Panel → API Management.`,
      { code: 'MISSING_API_KEY', missingConfig: record.apiKeyEnvVar || record.name }
    );
  }

  const modelLabel = `${record.name} (${record.modelName})`;
  const timeoutMs = record.timeoutMs || 60000;

  if (record.providerType === 'google_gemini') {
    const ai = new GoogleGenAI({ apiKey: key });
    const parts: any[] = [{ text: options.prompt }];
    for (const img of options.sourceImages || []) {
      const split = splitDataUrl(img.dataUrl, img.mimeType);
      if (split) parts.push({ inlineData: { data: split.base64, mimeType: split.mimeType } });
    }
    try {
      const stream = await ai.models.generateContentStream({
        model: record.modelName,
        contents: parts.length === 1 ? options.prompt : { parts },
      });
      const chunks: Buffer[] = [];
      let lyrics = '';
      let mime = 'audio/mpeg';
      for await (const ch of stream) {
        for (const p of ch.candidates?.[0]?.content?.parts || []) {
          if (p.inlineData?.data) {
            if (chunks.length === 0 && p.inlineData.mimeType) mime = p.inlineData.mimeType;
            chunks.push(Buffer.from(p.inlineData.data, 'base64'));
          }
          if (p.text) lyrics += p.text;
        }
      }
      if (chunks.length === 0) throw new ProviderError(`${record.name} returned no audio data.`);
      return {
        audioUrl: `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`,
        lyrics: lyrics.trim() || undefined,
        modelLabel,
      };
    } catch (err: any) {
      throw classifyGeminiError(err, record.modelName);
    }
  }

  const url = record.apiUrl.trim();
  if (!url) throw new ProviderError(`Provider "${record.name}" is missing an API URL.`);

  const resp = await fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(record, key),
    body: JSON.stringify({
      model: record.modelName,
      prompt: options.prompt,
      input: options.prompt,
      ...parseJsonSafe(record.extraBodyJson),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    const errTxt = await resp.text().catch(() => '');
    throw new ProviderError(`${record.name} error (HTTP ${resp.status}): ${errTxt.slice(0, 240)}`, {
      httpStatus: resp.status,
    });
  }

  const ct = resp.headers.get('content-type') || '';
  if (ct.startsWith('audio/')) {
    const buf = Buffer.from(await resp.arrayBuffer());
    return {
      audioUrl: `data:${ct.split(';')[0]};base64,${buf.toString('base64')}`,
      modelLabel,
    };
  }

  const data: any = await resp.json();
  const audioUrl = data?.audioUrl || data?.url || data?.output?.[0] || data?.data?.[0]?.url;
  if (!audioUrl) throw new ProviderError(`${record.name} returned no audio URL.`);
  return { audioUrl, lyrics: data?.lyrics, modelLabel };
}
