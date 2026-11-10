import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Type, ThinkingLevel } from '@google/genai';
import { db } from './server/db.js';
import {
  getGeminiClient,
  getEffectiveGeminiKey,
  generateAIImage,
  generateAIVideo,
  generateAIMusic,
  classifyGeminiError,
  retryGeminiCall,
  withTimeout,
  testGeminiConnection,
  diagnoseGeminiSetup,
  ProviderError,
} from './server/mediaGenerators.js';
import {
  testApiProviderConnection,
  executeCustomTextOrCodeProvider,
} from './server/providerClient.js';
import { setProviderSecret, deleteProviderSecret } from './server/secrets.js';
import {
  createCashfreeOrder,
  verifyCashfreeOrder,
  testCashfreeConnection,
} from './server/cashfree.js';
import { getSupabaseClient, testSupabaseConnection, uploadMediaToSupabase } from './server/supabase.js';
import {
  ApiCapabilityCategory,
  ChatMessage,
  ChatSkillMode,
  ComposerTab,
  DetectedIntent,
  TaskStep,
} from './src/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Root API Health & Diagnostic endpoint
app.get('/api', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'MY AI API',
    version: '2.0.0',
    timestamp: Date.now(),
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Track active user session (supports switching/login/signup)
let currentUserId = 'user-admin';

// Track active & cancelled background jobs/tasks
const runningJobIds = new Set<string>();
const cancelledJobIds = new Set<string>();

// Recover any orphaned pending/streaming messages left over from prior server restarts
db.recoverStuckMessages(runningJobIds);

function getActiveUser(req?: Request) {
  if (req) {
    const headerUserId = ((req.headers['x-user-id'] as string) || '').trim();
    if (headerUserId) {
      const found = db.getUser(headerUserId);
      if (found) return found;
    }
    const authHeader = ((req.headers['authorization'] as string) || '').trim();
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const byId = db.getUser(token);
      if (byId) return byId;
    }
  }
  return db.getUser(currentUserId) || db.getUsers()[0];
}

// Server-side Admin Authorization Middleware
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = getActiveUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({
      error: 'Administrator authorization required. Switch to an admin account to access this panel.',
    });
  }
  next();
}

// Intelligent Prompt Classifier
function detectIntent(
  prompt: string,
  attachments?: Array<{ type: string; mimeType: string; name: string }>,
  composerTab?: ComposerTab,
  skillMode?: ChatSkillMode,
  selectedModel?: string
): DetectedIntent {
  if (composerTab === 'task') {
    return 'task';
  }

  const p = prompt.toLowerCase().trim();
  const hasImages = attachments?.some((a) => a.type === 'image' || a.mimeType?.startsWith('image/'));
  const hasDocs = attachments?.some(
    (a) =>
      a.type === 'document' ||
      a.type === 'notebook' ||
      a.type === 'drive' ||
      a.mimeType?.includes('pdf') ||
      a.mimeType?.includes('text/')
  );

  // Explicit custom API provider override (selected from dropdown)
  if (selectedModel?.startsWith('custom:')) {
    const customId = selectedModel.slice('custom:'.length);
    const customEntry = db.getApiProvider(customId);
    if (customEntry) {
      if (customEntry.category === 'video') return hasImages ? 'photo_to_video' : 'video_generation';
      if (customEntry.category === 'audio') return 'audio_generation';
      if (customEntry.category === 'image_edit') return 'image_editing';
      if (customEntry.category === 'image') return hasImages ? 'image_editing' : 'image_generation';
      if (customEntry.category === 'code') return 'coding';
      return 'text';
    }
  }

  // Explicit model pin overrides
  if (selectedModel === 'gemini-omni-1.2-flash') {
    return hasImages ? 'photo_to_video' : 'video_generation';
  }
  if (
    selectedModel === 'free-image-gen' ||
    selectedModel === 'gemini-3.1-flash-lite-image' ||
    selectedModel === 'gemini-nano-banana-2.1' ||
    selectedModel === 'gemini-3-pro-image'
  ) {
    return hasImages ? 'image_editing' : 'image_generation';
  }
  if (selectedModel === 'lyria-3-clip-preview') {
    return 'audio_generation';
  }

  // Explicit skill mode from Plus Menu
  if (skillMode === 'create_videos') {
    return hasImages ? 'photo_to_video' : 'video_generation';
  }
  if (skillMode === 'create_images') {
    return hasImages ? 'image_editing' : 'image_generation';
  }
  if (skillMode === 'create_music') {
    return 'audio_generation';
  }
  if (skillMode === 'canvas') {
    return 'canvas';
  }
  if (skillMode === 'guided_learning') {
    return 'guided_learning';
  }

  // 1. Photo-to-video
  if (
    hasImages &&
    (p.includes('video') ||
      p.includes('animate') ||
      p.includes('motion') ||
      p.includes('cinematic') ||
      p.includes('bring to life') ||
      p.includes('make this into') ||
      p.includes('turn this into'))
  ) {
    return 'photo_to_video';
  }

  // 2. Image editing (supports single or multi-image editing)
  if (
    hasImages &&
    (p.includes('edit') ||
      p.includes('modify') ||
      p.includes('change') ||
      p.includes('remove') ||
      p.includes('add ') ||
      p.includes('replace') ||
      p.includes('restyle') ||
      p.includes('combine') ||
      p.includes('merge') ||
      p.includes('blend') ||
      p.includes('background'))
  ) {
    return 'image_editing';
  }

  // 3. Image understanding
  if (hasImages) {
    return 'image_understanding';
  }

  // 4. Document / PDF / Notebook analysis
  if (hasDocs || p.includes('explain this pdf') || p.includes('summarize this file')) {
    return 'document_analysis';
  }

  // 5. Music / Audio Generation
  if (
    p.includes('create music') ||
    p.includes('generate music') ||
    p.includes('make music') ||
    p.includes('compose a song') ||
    p.includes('generate a song') ||
    p.includes('create a song') ||
    p.includes('audio track') ||
    p.includes('soundtrack') ||
    p.startsWith('music ')
  ) {
    return 'audio_generation';
  }

  // 6. Video Generation
  if (
    p.includes('create a video') ||
    p.includes('create a cinematic video') ||
    p.includes('generate a video') ||
    p.includes('make a video') ||
    p.includes('generate video') ||
    p.includes('cinematic video') ||
    p.startsWith('video of') ||
    p.includes('render a video')
  ) {
    return 'video_generation';
  }

  // 7. Image Generation
  if (
    p.includes('create a photo') ||
    p.includes('create a realistic') ||
    p.includes('create an image') ||
    p.includes('generate an image') ||
    p.includes('generate a photo') ||
    p.includes('generate photo') ||
    p.includes('generate image') ||
    p.includes('4k photo') ||
    p.includes('draw a') ||
    p.includes('picture of') ||
    p.startsWith('photo of') ||
    p.startsWith('image of') ||
    p.includes('wallpaper of')
  ) {
    return 'image_generation';
  }

  // 8. Canvas / Slides
  if (p.includes('create slides') || p.includes('slide deck') || p.includes('open canvas')) {
    return 'canvas';
  }

  // 9. Guided Learning
  if (p.includes('teach me') || p.includes('step by step') || p.includes('guided learning') || p.includes('quiz me')) {
    return 'guided_learning';
  }

  // 10. Coding
  if (
    p.includes('write python') ||
    p.includes('python code') ||
    p.includes('write a program') ||
    p.includes('write code') ||
    p.includes('javascript') ||
    p.includes('typescript') ||
    p.includes('react component') ||
    p.includes('sql query') ||
    p.includes('algorithm') ||
    p.includes('debug this') ||
    p.includes('write a script')
  ) {
    return 'coding';
  }

  return 'text';
}

// Helper: Build system instruction using user preferences + skill mode
function buildSystemInstruction(user: ReturnType<typeof getActiveUser>, intent: DetectedIntent): string {
  const parts = [
    'You are MY AI, a helpful, concise, and intelligent multimodal AI assistant.',
    'Format code cleanly inside markdown code fences with language tags (e.g., ```python, ```tsx).',
  ];

  if (intent === 'guided_learning') {
    parts.push(
      'You are in Guided Learning mode: teach step-by-step, explain concepts clearly with intuitive analogies, check understanding with short practice questions, and guide the learner patiently.'
    );
  } else if (intent === 'canvas') {
    parts.push(
      'You are in Canvas creation mode: produce clean, structured deliverables (complete code, polished essay/article, or clearly numbered presentation slides with Speaker Notes).'
    );
  }

  if (user?.preferences?.personalIntelligenceEnabled) {
    if (user.preferences.customInstructions?.trim()) {
      parts.push(`User Personal Instructions:\n${user.preferences.customInstructions.trim()}`);
    }
    if (user.preferences.importedMemory?.trim()) {
      parts.push(`User Personal Context Memory:\n${user.preferences.importedMemory.trim().slice(0, 4000)}`);
    }
  }

  return parts.join('\n\n');
}

// Helper: Convert attachments into Gemini content parts
function buildGeminiParts(prompt: string, attachments?: any[]) {
  const parts: any[] = [];
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.type === 'notebook' || att.type === 'drive') {
        parts.push({
          text: `[Attached ${att.type === 'notebook' ? 'Notebook' : 'Google Drive Resource'}: ${att.name}]\n${att.textPreview || att.dataUrl || ''}`,
        });
        continue;
      }

      if (att.dataUrl && att.dataUrl.includes('base64,')) {
        const base64Data = att.dataUrl.split('base64,')[1];
        const mime = att.mimeType || 'application/octet-stream';
        if (
          mime.startsWith('image/') ||
          mime === 'application/pdf' ||
          mime.startsWith('audio/') ||
          mime.startsWith('video/')
        ) {
          parts.push({
            inlineData: {
              data: base64Data,
              mimeType: mime,
            },
          });
        } else {
          try {
            const decodedText = Buffer.from(base64Data, 'base64').toString('utf-8');
            parts.push({
              text: `[Attached file: ${att.name}]\n\`\`\`\n${decodedText.slice(0, 50000)}\n\`\`\``,
            });
          } catch {
            parts.push({ text: `[Attached file: ${att.name} (${mime})]` });
          }
        }
      }
    }
  }
  parts.push({
    text: prompt || 'Analyze the attached media and provide clear, helpful insights.',
  });
  return parts;
}

// Helper: Sync record to Supabase when configured (non-blocking)
async function syncChatAndMessageToSupabase(chatId: string, msg: ChatMessage) {
  const cfg = db.getConfig();
  const sb = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceKey || cfg.supabaseAnonKey);
  if (!sb) return;
  try {
    const chat = db.getChat(chatId);
    if (chat) {
      await sb.from('chats').upsert({
        id: chat.id,
        title: chat.title,
        pinned: !!chat.pinned,
        message_count: chat.messageCount || 0,
        last_message_snippet: chat.lastMessageSnippet || '',
        updated_at: new Date(chat.updatedAt).toISOString(),
      });
    }
    await sb.from('messages').upsert({
      id: msg.id,
      chat_id: chatId,
      role: msg.role,
      content: msg.content,
      status: msg.status || 'complete',
      media_type: msg.mediaType || 'text',
      media_data: msg.mediaData || null,
      model_used: msg.modelUsed || null,
      intent_detected: msg.intentDetected || null,
      processing_time_ms: msg.processingTimeMs || null,
      error: msg.error || null,
    });
  } catch {
    // Non-blocking sync
  }
}

// Background Multi-Step Task Runner
async function runBackgroundTask(options: {
  jobId: string;
  chatId: string;
  assistantMsgId: string;
  prompt: string;
  attachments: any[];
  user: ReturnType<typeof getActiveUser>;
  modelId: string;
}) {
  const { jobId, chatId, assistantMsgId, prompt, attachments, user, modelId } = options;
  const startTime = Date.now();

  try {
    const apiKey = getEffectiveGeminiKey();
    if (!apiKey) {
      throw new ProviderError(
        'Multi-step Task execution requires GEMINI_API_KEY. Please configure GEMINI_API_KEY in Settings > Secrets.',
        { code: 'MISSING_API_KEY', missingConfig: 'GEMINI_API_KEY' }
      );
    }

    const ai = getGeminiClient();
    const targetModel =
      modelId === 'gemini-4-argon'
        ? 'gemini-4-argon'
        : modelId === 'gemini-3.8-flash'
        ? 'gemini-3.8-flash'
        : 'gemini-3.1-flash-lite';

    // Step 1: Generate execution plan
    let steps: TaskStep[] = [
      { id: 'step-1', title: 'Analyze objective & constraints', status: 'running' },
      { id: 'step-2', title: 'Research & synthesize solution', status: 'queued' },
      { id: 'step-3', title: 'Review & format final deliverable', status: 'queued' },
    ];

    db.updateMessage(chatId, assistantMsgId, { taskSteps: steps });
    db.updateJob(jobId, { status: 'processing', progress: 15, statusDetail: 'Planning task steps...' });

    try {
      const planRes = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `Break this user task into 3 concise, actionable execution steps:\n"${prompt}"`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                },
              },
            },
          },
        }),
        20000,
        'Task planning'
      );
      const parsedPlan = JSON.parse((planRes.text || '[]').trim());
      if (Array.isArray(parsedPlan) && parsedPlan.length >= 2) {
        steps = parsedPlan.slice(0, 4).map((s: any, i: number) => ({
          id: `step-${i + 1}`,
          title: s.title || `Step ${i + 1}`,
          status: i === 0 ? 'running' : 'queued',
        }));
      }
    } catch {
      // keep default 3 steps if JSON planning fails
    }

    db.updateMessage(chatId, assistantMsgId, { taskSteps: steps });

    const stepOutputs: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      if (cancelledJobIds.has(jobId)) {
        steps = steps.map((s, idx) => (idx >= i ? { ...s, status: 'cancelled' } : s));
        db.updateMessage(chatId, assistantMsgId, {
          status: 'cancelled',
          taskSteps: steps,
          content: stepOutputs.length
            ? `${stepOutputs.join('\n\n')}\n\n*Task cancelled by user.*`
            : 'Task cancelled by user.',
        });
        db.updateJob(jobId, { status: 'cancelled', statusDetail: 'Cancelled by user' });
        return;
      }

      steps = steps.map((s, idx) =>
        idx === i ? { ...s, status: 'running' } : idx < i ? { ...s, status: 'completed' } : s
      );
      const progressPct = Math.round(((i + 0.5) / steps.length) * 85) + 10;
      db.updateMessage(chatId, assistantMsgId, { taskSteps: steps });
      db.updateJob(jobId, { status: 'processing', progress: progressPct, statusDetail: steps[i].title });

      const stepPrompt =
        i === steps.length - 1
          ? `Original Goal: "${prompt}"\n\nPrevious step notes:\n${stepOutputs.join('\n\n')}\n\nNow execute the final step ("${steps[i].title}") and present the complete, polished final result for the user.`
          : `Original Goal: "${prompt}"\n\nExecute Step ${i + 1} of ${steps.length}: "${steps[i].title}". Keep your output focused and structured so it feeds into the next step.`;

      const parts = i === 0 ? buildGeminiParts(stepPrompt, attachments) : [{ text: stepPrompt }];
      const stepRes = await retryGeminiCall(
        () =>
          withTimeout(
            ai.models.generateContent({
              model: targetModel,
              contents: { parts },
              config: {
                systemInstruction: buildSystemInstruction(user, 'task'),
                ...(targetModel === 'gemini-3.8-flash' || targetModel === 'gemini-4-argon'
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : {}),
              },
            }),
            30000,
            `Task step (${targetModel})`
          ),
        targetModel,
        1
      );

      const stepText = stepRes.text || '';
      stepOutputs.push(`### ${i + 1}. ${steps[i].title}\n${stepText}`);
      steps = steps.map((s, idx) => (idx === i ? { ...s, status: 'completed', detail: stepText.slice(0, 140) } : s));
      db.updateMessage(chatId, assistantMsgId, {
        taskSteps: steps,
        content: i === steps.length - 1 ? stepText : stepOutputs.join('\n\n'),
      });
    }

    const finalContent = stepOutputs[stepOutputs.length - 1]?.replace(/^### .*?\n/, '') || stepOutputs.join('\n\n');
    const updatedMsg = db.updateMessage(chatId, assistantMsgId, {
      status: 'complete',
      mediaType: 'task',
      taskSteps: steps,
      content: finalContent,
      modelUsed: targetModel,
      processingTimeMs: Date.now() - startTime,
    });

    db.updateJob(jobId, {
      status: 'completed',
      progress: 100,
      statusDetail: 'All steps completed',
      durationSeconds: (Date.now() - startTime) / 1000,
      costUsd: 0.002,
    });

    if (updatedMsg) syncChatAndMessageToSupabase(chatId, updatedMsg);
  } catch (err: any) {
    const classified = classifyGeminiError(err, modelId || 'gemini-3.1-flash-lite');
    const errorMsg = classified.message || 'Task execution failed.';
    db.updateMessage(chatId, assistantMsgId, {
      status: 'error',
      error: errorMsg,
      errorCode: classified.code,
      httpStatus: classified.httpStatus,
      googleStatus: classified.googleStatus,
      reason: classified.reason,
      rawError: classified.rawError,
      missingConfig: classified.missingConfig,
      content: errorMsg,
      processingTimeMs: Date.now() - startTime,
    });
    db.updateJob(jobId, {
      status: 'failed',
      error: errorMsg,
      statusDetail: errorMsg,
      durationSeconds: (Date.now() - startTime) / 1000,
    });
  } finally {
    runningJobIds.delete(jobId);
    cancelledJobIds.delete(jobId);
  }
}

// Background Video Job Runner
async function runBackgroundVideoJob(options: {
  jobId: string;
  chatId: string;
  assistantMsgId: string;
  prompt: string;
  sourceImage?: any;
  aspectRatio: string;
  resolution: string;
  userId: string;
  sourceImages?: Array<{ dataUrl: string; mimeType: string }>;
  preferredModel?: string;
}) {
  const {
    jobId,
    chatId,
    assistantMsgId,
    prompt,
    sourceImage,
    sourceImages,
    aspectRatio,
    resolution,
    userId,
    preferredModel,
  } = options;
  const startTime = Date.now();

  try {
    const videoResult = await generateAIVideo({
      prompt: prompt || 'Cinematic video sequence',
      sourceImageBase64: sourceImage?.dataUrl,
      sourceMimeType: sourceImage?.mimeType,
      sourceImages,
      aspectRatio,
      duration: '10s',
      resolution,
      preferredModel,
      onProgress: (statusDetail, progress, interactionId) => {
        db.updateJob(jobId, { status: 'processing', statusDetail, progress, interactionId });
      },
      shouldCancel: () => cancelledJobIds.has(jobId),
    });

    // Optional upload to Supabase storage
    const cfg = db.getConfig();
    const sb = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceKey || cfg.supabaseAnonKey);
    let finalVideoUrl = videoResult.videoUrl;
    if (sb && videoResult.videoUrl.startsWith('data:')) {
      const mime = videoResult.videoUrl.match(/^data:([^;]+);/)?.[1] || 'video/mp4';
      const uploaded = await uploadMediaToSupabase(sb, `video-${Date.now()}.mp4`, videoResult.videoUrl, mime);
      if (uploaded) finalVideoUrl = uploaded;
    }

    const updatedMsg = db.updateMessage(chatId, assistantMsgId, {
      content: `Generated video for:\n\n**"${prompt}"**`,
      status: 'complete',
      mediaType: 'video',
      mediaData: {
        type: 'video',
        url: finalVideoUrl,
        thumbnail: sourceImage?.dataUrl,
        prompt: videoResult.prompt,
        duration: videoResult.duration,
        resolution: videoResult.resolution,
        aspectRatio,
      },
      modelUsed: videoResult.model,
      processingTimeMs: Date.now() - startTime,
    });

    db.updateJob(jobId, {
      status: 'completed',
      progress: 100,
      statusDetail: 'Video ready',
      durationSeconds: (Date.now() - startTime) / 1000,
      costUsd: 0.1,
      outputUrl: finalVideoUrl,
      thumbnailUrl: sourceImage?.dataUrl,
      interactionId: videoResult.interactionId,
    });

    const user = db.getUser(userId);
    if (user && user.generationLimits.videosRemaining > 0) {
      db.updateUser(user.id, {
        generationLimits: {
          ...user.generationLimits,
          videosRemaining: user.generationLimits.videosRemaining - 1,
        },
      });
    }

    if (updatedMsg) syncChatAndMessageToSupabase(chatId, updatedMsg);
  } catch (err: any) {
    const isCancel = err?.code === 'CANCELLED' || cancelledJobIds.has(jobId);
    const errorMsg = err?.message || 'Video generation failed.';
    db.updateMessage(chatId, assistantMsgId, {
      status: isCancel ? 'cancelled' : 'error',
      error: errorMsg,
      errorCode: err?.code,
      httpStatus: err?.httpStatus,
      googleStatus: err?.googleStatus,
      reason: err?.reason,
      rawError: err?.rawError,
      missingConfig: err?.missingConfig,
      content: errorMsg,
      processingTimeMs: Date.now() - startTime,
    });
    db.updateJob(jobId, {
      status: isCancel ? 'cancelled' : 'failed',
      error: errorMsg,
      statusDetail: errorMsg,
      durationSeconds: (Date.now() - startTime) / 1000,
    });
  } finally {
    runningJobIds.delete(jobId);
    cancelledJobIds.delete(jobId);
  }
}

// -----------------------------------------------------------------------------
// API ROUTES: GEMINI HEALTH, CHAT, TASKS & MULTIMODAL GENERATION
// -----------------------------------------------------------------------------

app.get('/api/gemini/status', (req, res) => {
  const configured = !!getEffectiveGeminiKey();
  const models = db.getModels().filter((m) => m.enabled);
  const defaultModel = models.find((m) => m.isDefault)?.id || 'gemini-3.1-flash-lite';
  res.json({
    configured,
    defaultModel,
    freeTierSupported: true,
    envVar: 'GEMINI_API_KEY',
  });
});

app.post('/api/gemini/test', async (req, res) => {
  const requestedModel = typeof req.body?.model === 'string' ? req.body.model : undefined;
  const result = await testGeminiConnection(requestedModel);
  res.status(result.connected ? 200 : result.configured ? 502 : 400).json(result);
});

app.get('/api/gemini/diagnose', async (req, res) => {
  const result = await diagnoseGeminiSetup();
  res.json(result);
});

app.post('/api/classify-intent', (req, res) => {
  const { prompt, attachments, composerTab, skillMode, selectedModel } = req.body;
  const intent = detectIntent(prompt || '', attachments, composerTab, skillMode, selectedModel);
  res.json({ intent });
});

app.post('/api/chat', async (req, res) => {
  const startTime = Date.now();
  const {
    chatId,
    message = '',
    attachments = [],
    model = 'auto',
    composerTab = 'chat',
    skillMode = 'standard',
    aspectRatio,
    resolution,
    stream = false,
  } = req.body;

  if (!chatId || (!message.trim() && (!attachments || attachments.length === 0))) {
    return res.status(400).json({ error: 'chatId and either message or attachments are required.' });
  }

  const user = getActiveUser();
  if (user.status === 'suspended') {
    return res.status(403).json({
      error: 'Your account is currently suspended. Contact an administrator for assistance.',
    });
  }

  const cfg = db.getConfig();
  if (cfg.maintenanceMode && user.role !== 'admin') {
    return res.status(503).json({
      error: 'MY AI is undergoing scheduled maintenance. Please check back shortly.',
    });
  }

  const normalizedAttachments = Array.isArray(attachments)
    ? attachments.map((att: any, idx: number) => ({
        ...att,
        id: att.id || `att-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      }))
    : [];

  // Record uploaded files into Library jobs when applicable
  for (const att of normalizedAttachments) {
    if (att.type !== 'notebook' && att.type !== 'drive') {
      db.addJob({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId: user.id,
        userEmail: user.email,
        chatId,
        type: 'file',
        prompt: `Uploaded file: ${att.name}`,
        status: 'completed',
        model: 'Upload',
        timestamp: Date.now(),
        durationSeconds: 0,
        outputUrl: att.dataUrl,
        fileName: att.name,
        mimeType: att.mimeType,
      });
    }
  }

  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    chatId,
    role: 'user',
    content: message || (normalizedAttachments.length ? `[Uploaded ${normalizedAttachments.length} file(s)]` : ''),
    timestamp: Date.now(),
    attachments: normalizedAttachments,
    status: 'complete',
  };
  db.addMessage(chatId, userMsg);
  syncChatAndMessageToSupabase(chatId, userMsg);

  const selectedExplicitModel = model !== 'auto' ? model : undefined;
  const intent = detectIntent(
    message,
    normalizedAttachments,
    composerTab as ComposerTab,
    skillMode as ChatSkillMode,
    selectedExplicitModel
  );

  const assistantMsgId = `msg-asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const assistantMsg: ChatMessage = {
    id: assistantMsgId,
    chatId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    status: 'pending',
    intentDetected: intent,
    modelUsed: selectedExplicitModel || 'gemini-3.1-flash-lite',
  };
  db.addMessage(chatId, assistantMsg);

  try {
    // ---------------------------------------------------------
    // CASE 1: MULTI-STEP TASK MODE (Background async steps)
    // ---------------------------------------------------------
    if (intent === 'task') {
      const jobId = `job-task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      db.addJob({
        id: jobId,
        userId: user.id,
        userEmail: user.email,
        chatId,
        messageId: assistantMsgId,
        type: 'task',
        prompt: message,
        status: 'queued',
        progress: 5,
        statusDetail: 'Initializing multi-step task...',
        model: selectedExplicitModel || 'gemini-3.1-flash-lite',
        timestamp: Date.now(),
        durationSeconds: 0,
      });

      const pendingMsg = db.updateMessage(chatId, assistantMsgId, {
        jobId,
        mediaType: 'task',
        status: 'streaming',
        taskSteps: [
          { id: 'step-1', title: 'Planning execution steps...', status: 'running' },
        ],
      });

      // Kick off task asynchronously
      runningJobIds.add(jobId);
      runBackgroundTask({
        jobId,
        chatId,
        assistantMsgId,
        prompt: message,
        attachments: normalizedAttachments,
        user,
        modelId: selectedExplicitModel || 'gemini-3.1-flash-lite',
      });

      return res.json({ success: true, message: pendingMsg, asyncJobId: jobId });
    }

    // ---------------------------------------------------------
    // CASE 2: VIDEO GENERATION / PHOTO-TO-VIDEO (Background Job)
    // ---------------------------------------------------------
    if (intent === 'video_generation' || intent === 'photo_to_video') {
      if (user.generationLimits.videosRemaining <= 0) {
        const updated = db.updateMessage(chatId, assistantMsgId, {
          status: 'error',
          error: 'Video generation quota reached. Upgrade your plan or contact an admin.',
          content: 'Video generation quota reached. Upgrade your plan or request additional quota from the Admin Panel.',
        });
        return res.status(403).json({ error: 'Video quota exceeded', message: updated });
      }

      const sourceImages = normalizedAttachments.filter(
        (a: any) => a.type === 'image' || a.mimeType?.startsWith('image/')
      );
      const sourceImage = sourceImages[0];
      const jobId = `job-vid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const targetAspect = aspectRatio === '9:16' ? '9:16' : '16:9';
      const targetRes = resolution || user.preferences?.media?.defaultVideoResolution || '720p';

      db.addJob({
        id: jobId,
        userId: user.id,
        userEmail: user.email,
        chatId,
        messageId: assistantMsgId,
        type: 'video',
        prompt: message || 'Cinematic video generation',
        status: 'queued',
        progress: 5,
        statusDetail: 'Queued for Video AI...',
        model: selectedExplicitModel || 'gemini-omni-1.2-flash',
        timestamp: Date.now(),
        durationSeconds: 0,
      });

      const pendingMsg = db.updateMessage(chatId, assistantMsgId, {
        jobId,
        mediaType: 'video',
        status: 'pending',
        modelUsed: selectedExplicitModel || 'gemini-omni-1.2-flash',
      });

      runningJobIds.add(jobId);
      runBackgroundVideoJob({
        jobId,
        chatId,
        assistantMsgId,
        prompt: message || 'Animate this image with smooth cinematic camera motion',
        sourceImage,
        sourceImages: sourceImages.map((s: any) => ({ dataUrl: s.dataUrl, mimeType: s.mimeType })),
        aspectRatio: targetAspect,
        resolution: targetRes,
        userId: user.id,
        preferredModel: selectedExplicitModel,
      });

      return res.json({ success: true, message: pendingMsg, asyncJobId: jobId });
    }

    // ---------------------------------------------------------
    // CASE 3: IMAGE GENERATION / MULTI-IMAGE EDITING
    // ---------------------------------------------------------
    if (intent === 'image_generation' || intent === 'image_editing') {
      if (user.generationLimits.imagesRemaining <= 0) {
        const updated = db.updateMessage(chatId, assistantMsgId, {
          status: 'error',
          error: 'Image generation quota reached.',
          content: 'Image generation quota reached. Upgrade your plan or contact an administrator.',
        });
        return res.status(403).json({ error: 'Image quota exceeded', message: updated });
      }

      const sourceImages = normalizedAttachments.filter(
        (a: any) => a.type === 'image' || a.mimeType?.startsWith('image/')
      );
      const sourceImage = sourceImages[0];
      const targetAspect = aspectRatio || user.preferences?.media?.defaultAspectRatio || '1:1';
      const is4k = message.toLowerCase().includes('4k') || selectedExplicitModel === 'gemini-nano-banana-2.1';
      const seed = typeof req.body?.seed === 'number' ? req.body.seed : undefined;

      const imageResult = await generateAIImage({
        prompt: message || 'High-definition photorealistic image',
        sourceImageBase64: sourceImage?.dataUrl,
        sourceMimeType: sourceImage?.mimeType,
        sourceImages: sourceImages.map((s: any) => ({
          dataUrl: s.dataUrl,
          mimeType: s.mimeType,
          name: s.name,
        })),
        aspectRatio: targetAspect,
        quality: is4k ? '4K' : '1K',
        preferredModel: selectedExplicitModel,
        seed,
      });

      // Optional Supabase storage upload
      const sb = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceKey || cfg.supabaseAnonKey);
      let finalImageUrl = imageResult.imageUrl;
      if (sb && imageResult.imageUrl.startsWith('data:')) {
        const mime = imageResult.imageUrl.match(/^data:([^;]+);/)?.[1] || 'image/png';
        const uploaded = await uploadMediaToSupabase(sb, `image-${Date.now()}.png`, imageResult.imageUrl, mime);
        if (uploaded) finalImageUrl = uploaded;
      }

      const updated = db.updateMessage(chatId, assistantMsgId, {
        content: imageResult.textNote || `Generated image for:\n\n**"${message}"**`,
        status: 'complete',
        mediaType: 'image',
        mediaData: {
          type: 'image',
          url: finalImageUrl,
          prompt: imageResult.prompt,
          aspectRatio: targetAspect,
          resolution: imageResult.model.startsWith('Free Image') ? 'Free HD' : is4k ? '4K' : '1K',
        },
        modelUsed: imageResult.model,
        processingTimeMs: Date.now() - startTime,
      });

      db.addJob({
        id: `job-img-${Date.now()}`,
        userId: user.id,
        userEmail: user.email,
        chatId,
        messageId: assistantMsgId,
        type: 'image',
        prompt: message,
        status: 'completed',
        progress: 100,
        model: imageResult.model,
        timestamp: Date.now(),
        durationSeconds: (Date.now() - startTime) / 1000,
        costUsd: imageResult.model.startsWith('Free Image') ? 0 : is4k ? 0.04 : 0.02,
        outputUrl: finalImageUrl,
      });

      if (user.generationLimits.imagesRemaining > 0) {
        db.updateUser(user.id, {
          generationLimits: {
            ...user.generationLimits,
            imagesRemaining: user.generationLimits.imagesRemaining - 1,
          },
        });
      }

      if (updated) syncChatAndMessageToSupabase(chatId, updated);
      return res.json({ success: true, message: updated });
    }

    // ---------------------------------------------------------
    // CASE 4: MUSIC / AUDIO GENERATION (Lyria / Custom Audio)
    // ---------------------------------------------------------
    if (intent === 'audio_generation') {
      if (user.generationLimits.audioRemaining <= 0) {
        const updated = db.updateMessage(chatId, assistantMsgId, {
          status: 'error',
          error: 'Audio generation quota reached.',
          content: 'Audio generation quota reached.',
        });
        return res.status(403).json({ error: 'Audio quota exceeded', message: updated });
      }

      const sourceImages = normalizedAttachments.filter(
        (a: any) => a.type === 'image' || a.mimeType?.startsWith('image/')
      );
      const sourceImage = sourceImages[0];

      const musicResult = await generateAIMusic({
        prompt: message || 'Generate a 30-second instrumental track',
        sourceImageBase64: sourceImage?.dataUrl,
        sourceMimeType: sourceImage?.mimeType,
        sourceImages: sourceImages.map((s: any) => ({ dataUrl: s.dataUrl, mimeType: s.mimeType })),
        fullTrack: message.toLowerCase().includes('full'),
        preferredModel: selectedExplicitModel,
      });

      const updated = db.updateMessage(chatId, assistantMsgId, {
        content: `Generated audio track for:\n\n**"${message}"**`,
        status: 'complete',
        mediaType: 'audio',
        mediaData: {
          type: 'audio',
          url: musicResult.audioUrl,
          lyrics: musicResult.lyrics,
          prompt: musicResult.prompt,
          duration: '30s',
        },
        modelUsed: musicResult.model,
        processingTimeMs: Date.now() - startTime,
      });

      db.addJob({
        id: `job-aud-${Date.now()}`,
        userId: user.id,
        userEmail: user.email,
        chatId,
        messageId: assistantMsgId,
        type: 'audio',
        prompt: message,
        status: 'completed',
        progress: 100,
        model: musicResult.model,
        timestamp: Date.now(),
        durationSeconds: (Date.now() - startTime) / 1000,
        costUsd: 0.05,
        outputUrl: musicResult.audioUrl,
        lyrics: musicResult.lyrics,
      });

      if (user.generationLimits.audioRemaining > 0) {
        db.updateUser(user.id, {
          generationLimits: {
            ...user.generationLimits,
            audioRemaining: user.generationLimits.audioRemaining - 1,
          },
        });
      }

      if (updated) syncChatAndMessageToSupabase(chatId, updated);
      return res.json({ success: true, message: updated });
    }

    // ---------------------------------------------------------
    // CASE 5: CHAT, CODING, VISION, PDF, CANVAS, GUIDED LEARNING
    // ---------------------------------------------------------
    const textCapability: ApiCapabilityCategory = intent === 'coding' ? 'code' : 'text';
    const assignedTextOrCodeId = selectedExplicitModel?.startsWith('custom:')
      ? selectedExplicitModel.slice('custom:'.length)
      : !selectedExplicitModel
      ? db.getFeatureAssignments()[textCapability]
      : 'built-in';

    // Include recent conversation history (last 8 messages excluding current pending)
    const previousMsgs = db
      .getMessages(chatId)
      .filter((m) => m.id !== userMsg.id && m.id !== assistantMsgId && m.status === 'complete' && m.content)
      .slice(-8);

    const historyText = previousMsgs.length
      ? `Recent conversation context:\n${previousMsgs
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 600)}`)
          .join('\n')}\n\nCurrent request:\n`
      : '';

    const systemInstruction = buildSystemInstruction(user, intent);

    // If Admin assigned or user selected a custom Text/Code AI API provider
    if (assignedTextOrCodeId && assignedTextOrCodeId !== 'built-in') {
      const customProvider = db.getApiProvider(assignedTextOrCodeId);
      if (customProvider && customProvider.enabled) {
        const customRes = await executeCustomTextOrCodeProvider(customProvider, {
          prompt: message,
          systemInstruction,
          historyText,
          attachments: normalizedAttachments,
        });

        const updated = db.updateMessage(chatId, assistantMsgId, {
          content: customRes.text,
          status: 'complete',
          mediaType: intent === 'canvas' ? 'canvas' : intent === 'coding' ? 'code' : 'text',
          canvasData:
            intent === 'canvas'
              ? {
                  title: message.slice(0, 48) || 'MY AI Canvas',
                  kind: message.toLowerCase().includes('slide')
                    ? 'slides'
                    : message.toLowerCase().includes('code')
                    ? 'code'
                    : 'document',
                  content: customRes.text,
                }
              : undefined,
          modelUsed: customRes.modelLabel,
          processingTimeMs: Date.now() - startTime,
        });

        if (user.generationLimits.chatsRemaining > 0) {
          db.updateUser(user.id, {
            generationLimits: {
              ...user.generationLimits,
              chatsRemaining: user.generationLimits.chatsRemaining - 1,
            },
          });
        }

        if (updated) syncChatAndMessageToSupabase(chatId, updated);

        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.flushHeaders?.();
          res.write(`data: ${JSON.stringify({ type: 'start', modelUsed: customRes.modelLabel })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: customRes.text, modelUsed: customRes.modelLabel })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'done', message: updated })}\n\n`);
          return res.end();
        }
        return res.json({ success: true, message: updated });
      } else if (selectedExplicitModel?.startsWith('custom:')) {
        throw new ProviderError(
          `Selected API provider "${customProvider?.name || assignedTextOrCodeId}" is disabled. Enable it in Admin Panel → API Management or select "Auto".`
        );
      }
    }

    const apiKey = getEffectiveGeminiKey();
    if (!apiKey) {
      throw new ProviderError(
        'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in AI Studio Secrets to enable real-time Gemini chat and image understanding.',
        { code: 'MISSING_API_KEY', missingConfig: 'GEMINI_API_KEY' }
      );
    }

    let targetModel =
      selectedExplicitModel === 'gemini-4-argon'
        ? 'gemini-4-argon'
        : selectedExplicitModel === 'gemini-3.8-flash'
        ? 'gemini-3.8-flash'
        : selectedExplicitModel === 'gemini-flash-latest'
        ? 'gemini-flash-latest'
        : 'gemini-3.1-flash-lite';

    const modelRow = db.getModels().find((m) => m.id === targetModel);
    if (modelRow && !modelRow.enabled) {
      throw new ProviderError(`Model "${modelRow.name}" is disabled by the administrator.`);
    }

    const ai = getGeminiClient();

    const processedParts = buildGeminiParts(`${historyText}${message}`, normalizedAttachments);

    const buildConfigForModel = (mId: string) => {
      const cfgObj: any = { systemInstruction };
      if (mId === 'gemini-3.8-flash' || mId === 'gemini-4-argon') {
        cfgObj.thinkingConfig = {
          thinkingLevel: intent === 'coding' || mId === 'gemini-4-argon' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW,
        };
      }
      return cfgObj;
    };

    const makeCanvasData = (textContent: string): ChatMessage['canvasData'] | undefined => {
      if (intent !== 'canvas') return undefined;
      const lowerMsg = message.toLowerCase();
      const kind = lowerMsg.includes('slide') ? 'slides' : lowerMsg.includes('code') ? 'code' : 'document';
      return {
        title: message.slice(0, 48) || 'MY AI Canvas',
        kind,
        content: textContent,
      };
    };

    const candidateChain = selectedExplicitModel
      ? [targetModel]
      : ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];

    const shouldFallback = (err: any) =>
      err?.code === 'TIMEOUT' ||
      err?.code === 'SERVICE_UNAVAILABLE' ||
      err?.code === 'QUOTA_EXCEEDED' ||
      err?.code === 'MODEL_NOT_FOUND';

    // Real-Time SSE Streaming Mode
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const sendSse = (payload: Record<string, any>) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
      };

      let clientDisconnected = false;
      res.on('close', () => {
        if (!res.writableEnded) {
          clientDisconnected = true;
        }
      });

      sendSse({ type: 'start', modelUsed: targetModel });

      const streamWithModel = async (mId: string): Promise<string> => {
        let streamResp: any;
        for (let attempt = 0; attempt <= 2; attempt++) {
          try {
            streamResp = await withTimeout(
              ai.models.generateContentStream({
                model: mId,
                contents: { parts: processedParts },
                config: buildConfigForModel(mId),
              }),
              45000,
              `Gemini stream (${mId})`
            );
            break;
          } catch (err: any) {
            const errStr = (err?.message || '').toLowerCase();
            const isTransient =
              errStr.includes('503') ||
              errStr.includes('502') ||
              errStr.includes('504') ||
              errStr.includes('unavailable') ||
              errStr.includes('overloaded') ||
              errStr.includes('econnreset') ||
              errStr.includes('timeout');
            if (!isTransient || attempt === 2) {
              throw err;
            }
            await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
          }
        }

        let accumulated = '';
        for await (const chunk of streamResp) {
          if (clientDisconnected) break;
          const chunkText = chunk.text || '';
          if (chunkText) {
            accumulated += chunkText;
            sendSse({ type: 'chunk', text: chunkText, modelUsed: mId });
          }
        }
        return accumulated;
      };

      try {
        db.updateMessage(chatId, assistantMsgId, { status: 'streaming', modelUsed: targetModel });
        let fullText = '';
        let lastErr: any;

        for (let idx = 0; idx < candidateChain.length; idx++) {
          const mId = candidateChain[idx];
          targetModel = mId;
          try {
            fullText = await streamWithModel(mId);
            lastErr = null;
            break;
          } catch (err: any) {
            lastErr = classifyGeminiError(err, mId);
            if (idx < candidateChain.length - 1 && shouldFallback(lastErr)) {
              continue;
            }
            throw lastErr;
          }
        }

        if (lastErr) throw lastErr;

        if (!fullText.trim()) {
          throw new ProviderError(`Model "${targetModel}" returned an empty response. Please try rephrasing your prompt.`);
        }

        const updated = db.updateMessage(chatId, assistantMsgId, {
          content: fullText,
          status: 'complete',
          mediaType: intent === 'canvas' ? 'canvas' : intent === 'coding' ? 'code' : 'text',
          canvasData: makeCanvasData(fullText),
          modelUsed: targetModel,
          processingTimeMs: Date.now() - startTime,
        });

        if (user.generationLimits.chatsRemaining > 0) {
          db.updateUser(user.id, {
            generationLimits: {
              ...user.generationLimits,
              chatsRemaining: user.generationLimits.chatsRemaining - 1,
            },
          });
        }

        if (updated) syncChatAndMessageToSupabase(chatId, updated);
        sendSse({ type: 'done', message: updated });
        return res.end();
      } catch (streamErr: any) {
        const classified = classifyGeminiError(streamErr, targetModel);
        const updated = db.updateMessage(chatId, assistantMsgId, {
          content: classified.message,
          status: 'error',
          error: classified.message,
          errorCode: classified.code,
          httpStatus: classified.httpStatus,
          googleStatus: classified.googleStatus,
          reason: classified.reason,
          rawError: classified.rawError,
          missingConfig: classified.missingConfig,
          processingTimeMs: Date.now() - startTime,
        });
        sendSse({
          type: 'error',
          error: classified.message,
          errorCode: classified.code,
          httpStatus: classified.httpStatus,
          googleStatus: classified.googleStatus,
          reason: classified.reason,
          rawError: classified.rawError,
          missingConfig: classified.missingConfig,
          requiresPaidKey: classified.requiresPaidKey,
          message: updated,
        });
        return res.end();
      }
    }

    // Standard Non-Streaming JSON Mode (also used by VoiceConversation & REST clients)
    let response: any;
    let lastErr: any;
    for (let idx = 0; idx < candidateChain.length; idx++) {
      const mId = candidateChain[idx];
      targetModel = mId;
      try {
        response = await retryGeminiCall(
          () =>
            withTimeout(
              ai.models.generateContent({
                model: mId,
                contents: { parts: processedParts },
                config: buildConfigForModel(mId),
              }),
              25000,
              `Gemini (${mId})`
            ),
          mId,
          1
        );
        lastErr = null;
        break;
      } catch (err: any) {
        lastErr = classifyGeminiError(err, mId);
        if (idx < candidateChain.length - 1 && shouldFallback(lastErr)) {
          continue;
        }
        throw lastErr;
      }
    }
    if (lastErr) throw lastErr;

    const fullText = response?.text || '';
    if (!fullText) {
      throw new ProviderError(`Model "${targetModel}" returned an empty response.`);
    }

    const updated = db.updateMessage(chatId, assistantMsgId, {
      content: fullText,
      status: 'complete',
      mediaType: intent === 'canvas' ? 'canvas' : intent === 'coding' ? 'code' : 'text',
      canvasData: makeCanvasData(fullText),
      modelUsed: targetModel,
      processingTimeMs: Date.now() - startTime,
    });

    if (user.generationLimits.chatsRemaining > 0) {
      db.updateUser(user.id, {
        generationLimits: {
          ...user.generationLimits,
          chatsRemaining: user.generationLimits.chatsRemaining - 1,
        },
      });
    }

    if (updated) syncChatAndMessageToSupabase(chatId, updated);
    return res.json({ success: true, message: updated });
  } catch (err: any) {
    const classified = classifyGeminiError(err, selectedExplicitModel || 'gemini-3.1-flash-lite');
    const errorMsg = classified.message || 'An error occurred while contacting the AI provider.';
    const updated = db.updateMessage(chatId, assistantMsgId, {
      content: errorMsg,
      status: 'error',
      error: errorMsg,
      errorCode: classified.code || 'API_ERROR',
      httpStatus: classified.httpStatus,
      googleStatus: classified.googleStatus,
      reason: classified.reason,
      rawError: classified.rawError,
      missingConfig: classified.missingConfig,
      processingTimeMs: Date.now() - startTime,
    });
    const statusCode =
      classified.code === 'QUOTA_EXCEEDED'
        ? 429
        : classified.code === 'PERMISSION_DENIED'
        ? 403
        : err instanceof ProviderError
        ? 400
        : 500;
    return res.status(statusCode).json({
      error: errorMsg,
      errorCode: classified.code,
      httpStatus: classified.httpStatus,
      googleStatus: classified.googleStatus,
      reason: classified.reason,
      rawError: classified.rawError,
      missingConfig: classified.missingConfig,
      requiresPaidKey: classified.requiresPaidKey,
      message: updated,
    });
  }
});

// Background Job Polling & Cancellation
app.get('/api/jobs/:id', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const msg = job.chatId && job.messageId
    ? db.getMessages(job.chatId).find((m) => m.id === job.messageId)
    : undefined;
  res.json({ job, message: msg });
});

app.post('/api/jobs/:id/cancel', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  cancelledJobIds.add(req.params.id);
  const updated = db.updateJob(req.params.id, {
    status: 'cancelled',
    statusDetail: 'Cancellation requested...',
  });
  if (job.chatId && job.messageId) {
    db.updateMessage(job.chatId, job.messageId, {
      status: 'cancelled',
      content: 'Generation cancelled by user.',
    });
  }
  res.json({ success: true, job: updated });
});

// -----------------------------------------------------------------------------
// CHATS & HISTORY
// -----------------------------------------------------------------------------

app.get('/api/chats', (req, res) => {
  const user = getActiveUser();
  res.json({ chats: db.getChats(user.id) });
});

app.post('/api/chats', (req, res) => {
  const user = getActiveUser();
  const { title, skillMode } = req.body;
  const newChat = db.createChat({
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: title || 'New Chat',
    userId: user.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageCount: 0,
    skillMode: skillMode || 'standard',
  });
  res.json({ chat: newChat });
});

app.get('/api/chats/:id', (req, res) => {
  db.recoverStuckMessages(runningJobIds);
  const messages = db.getMessages(req.params.id);
  const chat = db.getChat(req.params.id);
  res.json({ chat, messages });
});

app.patch('/api/chats/:id', (req, res) => {
  const updated = db.updateChat(req.params.id, req.body);
  res.json({ chat: updated });
});

app.delete('/api/chats/:id', (req, res) => {
  const success = db.deleteChat(req.params.id);
  res.json({ success });
});

// -----------------------------------------------------------------------------
// LIBRARY, CREATIONS & NOTEBOOKS
// -----------------------------------------------------------------------------

app.get('/api/library', (req, res) => {
  const user = getActiveUser();
  const jobs = db.getJobs(user.id);
  const chats = db.getChats(user.id);
  const notebooks = db.getNotebooks(user.id);
  res.json({ jobs, chats, notebooks });
});

app.get('/api/creations', (req, res) => {
  const user = getActiveUser();
  res.json({ creations: db.getJobs(user.id) });
});

app.patch('/api/library/:id/save', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Item not found' });
  const updated = db.updateJob(req.params.id, { saved: !job.saved });
  res.json({ job: updated });
});

app.delete('/api/library/:id', (req, res) => {
  const user = getActiveUser();
  const deleted = db.deleteJob(req.params.id, user.role === 'admin' ? undefined : user.id);
  res.json({ success: deleted });
});

app.get('/api/notebooks', (req, res) => {
  const user = getActiveUser();
  res.json({ notebooks: db.getNotebooks(user.id) });
});

app.post('/api/notebooks', (req, res) => {
  const user = getActiveUser();
  const { title, content, tags } = req.body;
  const nb = db.addNotebook({
    id: `nb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: user.id,
    title: title || 'Untitled Notebook',
    content: content || '',
    tags: Array.isArray(tags) ? tags : [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  res.json({ notebook: nb });
});

app.patch('/api/notebooks/:id', (req, res) => {
  const user = getActiveUser();
  const updated = db.updateNotebook(req.params.id, user.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Notebook not found' });
  res.json({ notebook: updated });
});

app.delete('/api/notebooks/:id', (req, res) => {
  const user = getActiveUser();
  const success = db.deleteNotebook(req.params.id, user.id);
  res.json({ success });
});

// -----------------------------------------------------------------------------
// USER AUTH, PROFILE, PREFERENCES, FEEDBACK & PRIVACY CONTROLS
// -----------------------------------------------------------------------------

app.get('/api/user', (req, res) => {
  const user = getActiveUser();
  const availableUsers = db.getUsers();
  const baseModels = db.getModels().filter((m) => m.enabled);
  const customModels = db
    .getSanitizedApiProviders()
    .filter((p) => p.enabled)
    .map((p) => ({
      id: `custom:${p.id}`,
      name: `${p.name} (${p.modelName})`,
      type:
        p.category === 'code'
          ? ('code' as const)
          : p.category === 'image' || p.category === 'image_edit'
          ? ('image' as const)
          : p.category === 'video'
          ? ('video' as const)
          : p.category === 'audio'
          ? ('audio' as const)
          : ('chat' as const),
      provider: p.providerType,
      enabled: true,
      description: `Admin API Management · ${p.category} · ${p.hasApiKey ? 'Key Configured' : 'No Key Set'}`,
      costPerOp: 0,
      requiresPaidKey: false,
    }));
  const models = [...baseModels, ...customModels];
  const cfg = db.getSanitizedConfig();
  res.json({
    user,
    availableUsers,
    models,
    publicLinks: db.getPublicLinks(user.id),
    siteConfig: {
      siteName: cfg.siteName,
      announcementBanner: cfg.announcementBanner,
      maintenanceMode: cfg.maintenanceMode,
      hasGeminiKey: cfg.hasGeminiKey,
      supabaseConfigured: !!cfg.supabaseUrl && !!cfg.supabaseAnonKey,
    },
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const cfg = db.getConfig();
  const sb = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  if (sb && password) {
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        return res.status(401).json({ error: error.message });
      }
      if (data.user) {
        let local = db.getUserByEmail(email);
        if (!local) {
          local = db.createUser({
            id: data.user.id,
            email,
            name: (data.user.user_metadata?.name as string) || email.split('@')[0],
            role: email.toLowerCase() === 'siba02062005@gmail.com' ? 'admin' : 'user',
            avatar: '',
            tier: 'Free',
            generationLimits: {
              imagesRemaining: cfg.freeTierDailyImageLimit,
              videosRemaining: cfg.freeTierDailyVideoLimit,
              audioRemaining: cfg.freeTierDailyAudioLimit,
              chatsRemaining: 100,
              totalImagesQuota: cfg.freeTierDailyImageLimit,
              totalVideosQuota: cfg.freeTierDailyVideoLimit,
              totalAudioQuota: cfg.freeTierDailyAudioLimit,
            },
            createdAt: Date.now(),
            status: 'active',
          });
        }
        currentUserId = local.id;
        return res.json({
          success: true,
          user: local,
          session: data.session
            ? {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
              }
            : undefined,
          provider: 'supabase',
        });
      }
    } catch (sbErr: any) {
      console.warn('Supabase auth sign-in warning:', sbErr?.message || sbErr);
    }
  }

  const existing = db.getUserByEmail(email);
  if (!existing) {
    return res.status(404).json({ error: 'Account not found. Create an account or choose a workspace profile.' });
  }
  currentUserId = existing.id;
  res.json({ success: true, user: existing, provider: 'local' });
});

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !name) return res.status(400).json({ error: 'Name and email are required.' });

  const cfg = db.getConfig();
  const sb = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  let assignedId = `user-${Date.now()}`;
  let sessionData: any = undefined;

  if (sb && password) {
    try {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      if (data.user?.id) assignedId = data.user.id;
      if (data.session) {
        sessionData = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        };
      }
    } catch (sbErr: any) {
      console.warn('Supabase auth sign-up warning:', sbErr?.message || sbErr);
    }
  }

  if (db.getUserByEmail(email)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const created = db.createUser({
    id: assignedId,
    email,
    name,
    role: email.toLowerCase() === 'siba02062005@gmail.com' ? 'admin' : 'user',
    avatar: '',
    tier: 'Free',
    generationLimits: {
      imagesRemaining: cfg.freeTierDailyImageLimit,
      videosRemaining: cfg.freeTierDailyVideoLimit,
      audioRemaining: cfg.freeTierDailyAudioLimit,
      chatsRemaining: 100,
      totalImagesQuota: cfg.freeTierDailyImageLimit,
      totalVideosQuota: cfg.freeTierDailyVideoLimit,
      totalAudioQuota: cfg.freeTierDailyAudioLimit,
    },
    createdAt: Date.now(),
    status: 'active',
  });
  currentUserId = created.id;
  res.json({ success: true, user: created, session: sessionData });
});

app.post('/api/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) {
    return res.status(400).json({ error: 'Refresh token is required.' });
  }
  const cfg = db.getConfig();
  const sb = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  if (!sb) {
    return res.status(503).json({ error: 'Supabase authentication service is not configured.' });
  }
  try {
    const { data, error } = await sb.auth.refreshSession({ refresh_token });
    if (error || !data.session) {
      return res.status(401).json({ error: error?.message || 'Session refresh failed.' });
    }
    return res.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to refresh authentication session.' });
  }
});

app.post('/api/user/switch', (req, res) => {
  const { userId } = req.body;
  const target = db.getUser(userId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  currentUserId = target.id;
  res.json({ success: true, user: target });
});

app.patch('/api/user/profile', (req, res) => {
  const user = getActiveUser();
  const { name, bio, avatar, email } = req.body;
  const updated = db.updateUser(user.id, {
    ...(name !== undefined ? { name } : {}),
    ...(bio !== undefined ? { bio } : {}),
    ...(avatar !== undefined ? { avatar } : {}),
    ...(email !== undefined ? { email } : {}),
  });
  res.json({ user: updated });
});

app.patch('/api/user/preferences', (req, res) => {
  const user = getActiveUser();
  const updated = db.updateUser(user.id, {
    preferences: req.body,
  });
  res.json({ user: updated });
});

app.post('/api/user/upgrade', (req, res) => {
  const user = getActiveUser();
  const { tier } = req.body;
  const cfg = db.getConfig();
  if (!['Free', 'Pro', 'Enterprise'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid subscription tier.' });
  }

  const limits =
    tier === 'Enterprise'
      ? {
          imagesRemaining: 9999,
          videosRemaining: 9999,
          audioRemaining: 9999,
          chatsRemaining: 99999,
          totalImagesQuota: 10000,
          totalVideosQuota: 10000,
          totalAudioQuota: 10000,
        }
      : tier === 'Pro'
      ? {
          imagesRemaining: cfg.proTierDailyImageLimit,
          videosRemaining: cfg.proTierDailyVideoLimit,
          audioRemaining: cfg.proTierDailyAudioLimit,
          chatsRemaining: 1000,
          totalImagesQuota: cfg.proTierDailyImageLimit,
          totalVideosQuota: cfg.proTierDailyVideoLimit,
          totalAudioQuota: cfg.proTierDailyAudioLimit,
        }
      : {
          imagesRemaining: cfg.freeTierDailyImageLimit,
          videosRemaining: cfg.freeTierDailyVideoLimit,
          audioRemaining: cfg.freeTierDailyAudioLimit,
          chatsRemaining: 100,
          totalImagesQuota: cfg.freeTierDailyImageLimit,
          totalVideosQuota: cfg.freeTierDailyVideoLimit,
          totalAudioQuota: cfg.freeTierDailyAudioLimit,
        };

  const updated = db.updateUser(user.id, { tier, generationLimits: limits });
  res.json({ user: updated });
});

app.post('/api/feedback', (req, res) => {
  const user = getActiveUser();
  const { category = 'feedback', subject, message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message is required.' });
  const entry = db.addFeedback({
    id: `fb-${Date.now()}`,
    userId: user.id,
    userEmail: user.email,
    category,
    subject: subject || 'User Submission',
    message,
    createdAt: Date.now(),
  });
  res.json({ success: true, entry });
});

app.post('/api/public-links', (req, res) => {
  const { chatId, title } = req.body;
  if (!chatId) return res.status(400).json({ error: 'chatId is required' });
  const link = db.createPublicLink(chatId, title || 'Shared MY AI Chat');
  res.json({ link });
});

app.delete('/api/public-links/:id', (req, res) => {
  db.deletePublicLink(req.params.id);
  res.json({ success: true });
});

app.delete('/api/user/data/chats', (req, res) => {
  const user = getActiveUser();
  db.deleteAllChatsForUser(user.id);
  res.json({ success: true });
});

app.delete('/api/user/data/creations', (req, res) => {
  const user = getActiveUser();
  db.deleteAllJobsForUser(user.id);
  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// ADMIN PANEL ENDPOINTS (Strictly Protected by requireAdmin)
// -----------------------------------------------------------------------------

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json({ stats: db.getStats() });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json({ users: db.getUsers() });
});

app.post('/api/admin/users/:id', requireAdmin, (req, res) => {
  const updated = db.updateUser(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'User not found' });
  res.json({ user: updated });
});

app.get('/api/admin/config', requireAdmin, async (req, res) => {
  const config = db.getSanitizedConfig();
  const models = db.getModels();
  const supabaseStatus = await testSupabaseConnection(
    config.supabaseUrl,
    db.getConfig().supabaseServiceKey || config.supabaseAnonKey
  );
  res.json({ config, models, supabaseStatus });
});

app.post('/api/admin/config', requireAdmin, (req, res) => {
  const { config, models } = req.body;
  if (config) db.updateConfig(config);
  if (models && Array.isArray(models)) {
    models.forEach((m: any) => {
      if (m.id) db.updateModel(m.id, m);
    });
  }
  res.json({ success: true, config: db.getSanitizedConfig(), models: db.getModels() });
});

app.post('/api/admin/test-supabase', requireAdmin, async (req, res) => {
  const { supabaseUrl, supabaseKey } = req.body;
  const result = await testSupabaseConnection(
    supabaseUrl || db.getConfig().supabaseUrl,
    supabaseKey || db.getConfig().supabaseServiceKey || db.getConfig().supabaseAnonKey
  );
  res.json(result);
});

app.get('/api/admin/jobs', requireAdmin, (req, res) => {
  res.json({ jobs: db.getJobs(), feedback: db.getFeedback() });
});

// -----------------------------------------------------------------------------
// ADMIN PANEL: AI MODEL API MANAGEMENT ENDPOINTS (Strictly Protected)
// -----------------------------------------------------------------------------

app.get('/api/admin/api-providers', requireAdmin, (req, res) => {
  res.json({
    providers: db.getSanitizedApiProviders(),
    featureAssignments: db.getFeatureAssignments(),
  });
});

app.post('/api/admin/api-providers', requireAdmin, (req, res) => {
  const {
    name,
    category,
    providerType,
    apiUrl,
    modelName,
    apiKey,
    apiKeyEnvVar,
    authHeader,
    authPrefix,
    timeoutMs,
    extraHeadersJson,
    extraBodyJson,
    notes,
    enabled,
  } = req.body || {};

  if (!category || !['text', 'image', 'image_edit', 'video', 'audio', 'code'].includes(category)) {
    return res.status(400).json({ error: 'Valid API category is required.' });
  }
  if (!modelName?.trim()) {
    return res.status(400).json({ error: 'Model ID / Name is required.' });
  }

  const created = db.createApiProvider({
    name: name || `${category.toUpperCase()} Provider`,
    category,
    providerType: providerType || 'openai_compatible',
    apiUrl: apiUrl || '',
    modelName,
    apiKey,
    apiKeyEnvVar,
    authHeader,
    authPrefix,
    timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : undefined,
    extraHeadersJson,
    extraBodyJson,
    notes,
    enabled: enabled ?? true,
  });

  res.json({
    success: true,
    provider: created,
    providers: db.getSanitizedApiProviders(),
    featureAssignments: db.getFeatureAssignments(),
  });
});

app.patch('/api/admin/api-providers/:id', requireAdmin, (req, res) => {
  const updated = db.updateApiProvider(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'API provider not found.' });
  res.json({
    success: true,
    provider: updated,
    providers: db.getSanitizedApiProviders(),
    featureAssignments: db.getFeatureAssignments(),
  });
});

app.delete('/api/admin/api-providers/:id', requireAdmin, (req, res) => {
  const deleted = db.deleteApiProvider(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'API provider not found.' });
  res.json({
    success: true,
    providers: db.getSanitizedApiProviders(),
    featureAssignments: db.getFeatureAssignments(),
  });
});

app.post('/api/admin/api-providers/test-draft', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const existing = body.id ? db.getApiProvider(body.id) : undefined;
  const draftRecord = {
    id: existing?.id || `draft-${Date.now()}`,
    name: body.name || existing?.name || 'Draft Provider',
    category: body.category || existing?.category || 'text',
    providerType: body.providerType || existing?.providerType || 'openai_compatible',
    apiUrl: body.apiUrl !== undefined ? body.apiUrl : existing?.apiUrl || '',
    modelName: body.modelName !== undefined ? body.modelName : existing?.modelName || '',
    apiKeyEnvVar: body.apiKeyEnvVar !== undefined ? body.apiKeyEnvVar : existing?.apiKeyEnvVar,
    authHeader: body.authHeader !== undefined ? body.authHeader : existing?.authHeader,
    authPrefix: body.authPrefix !== undefined ? body.authPrefix : existing?.authPrefix,
    timeoutMs: body.timeoutMs !== undefined ? body.timeoutMs : existing?.timeoutMs,
    extraHeadersJson:
      body.extraHeadersJson !== undefined ? body.extraHeadersJson : existing?.extraHeadersJson,
    extraBodyJson: body.extraBodyJson !== undefined ? body.extraBodyJson : existing?.extraBodyJson,
    enabled: true,
    lastTestStatus: 'untested' as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const result = await testApiProviderConnection(draftRecord, body.apiKey);
  if (existing) {
    db.updateApiProvider(existing.id, {
      lastTestStatus: result.connected ? 'connected' : 'failed',
      lastTestedAt: Date.now(),
      lastTestLatencyMs: result.latencyMs,
      lastTestMessage: result.message,
      lastErrorLog: !result.connected
        ? `[${new Date().toISOString()}] Test failed (HTTP ${result.httpStatus || 400}): ${result.message}`
        : undefined,
    });
  }
  res.json(result);
});

app.post('/api/admin/api-providers/:id/test', requireAdmin, async (req, res) => {
  const record = db.getApiProvider(req.params.id);
  if (!record) return res.status(404).json({ error: 'API provider not found.' });

  const draftKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : undefined;
  const result = await testApiProviderConnection(record, draftKey);
  const updated = db.updateApiProvider(record.id, {
    lastTestStatus: result.connected ? 'connected' : 'failed',
    lastTestedAt: Date.now(),
    lastTestLatencyMs: result.latencyMs,
    lastTestMessage: result.message,
    lastErrorLog: !result.connected
      ? `[${new Date().toISOString()}] Test failed (HTTP ${result.httpStatus || 400}): ${result.message}`
      : undefined,
  });

  res.json({
    ...result,
    provider: updated,
    providers: db.getSanitizedApiProviders(),
  });
});

app.post('/api/admin/feature-assignments', requireAdmin, (req, res) => {
  const updated = db.updateFeatureAssignments(req.body || {});
  res.json({
    success: true,
    featureAssignments: updated,
  });
});

// -----------------------------------------------------------------------------
// USER SUBSCRIPTION & CHECKOUT ENDPOINTS
// -----------------------------------------------------------------------------

app.get('/api/subscription/plans', (req, res) => {
  const plans = db.getSubscriptionPlans(false);
  res.json({ plans });
});

app.get('/api/subscription/payment-methods', (req, res) => {
  const settings = db.getSanitizedPaymentSettings();
  const availableMethods = [];
  if (settings.upiQr.enabled) {
    availableMethods.push({
      type: 'upi_qr',
      title: 'UPI QR Code',
      description: 'Scan & pay with GPay, PhonePe, Paytm, BHIM',
      qrImageUrl: settings.upiQr.qrImageUrl,
      upiId: settings.upiQr.upiId,
      accountHolderName: settings.upiQr.accountHolderName,
      instructions: settings.upiQr.instructions,
    });
  }
  if (settings.upiId.enabled) {
    availableMethods.push({
      type: 'upi_id',
      title: 'Direct UPI ID',
      description: 'Transfer directly to verified UPI ID',
      upiId: settings.upiId.upiId,
      accountHolderName: settings.upiId.accountHolderName,
      instructions: settings.upiId.instructions,
    });
  }
  if (settings.bankTransfer.enabled) {
    availableMethods.push({
      type: 'bank_transfer',
      title: 'Bank Transfer (IMPS / NEFT)',
      description: 'Direct wire transfer to bank account',
      bankName: settings.bankTransfer.bankName,
      accountNumber: settings.bankTransfer.accountNumber,
      ifscCode: settings.bankTransfer.ifscCode,
      accountHolderName: settings.bankTransfer.accountHolderName,
      branchName: settings.bankTransfer.branchName,
      instructions: settings.bankTransfer.instructions,
    });
  }
  if (settings.cashfree.enabled) {
    availableMethods.push({
      type: 'cashfree',
      title: 'Instant Online Payment (Cashfree)',
      description: 'Cards, NetBanking, UPI instant activation',
      environment: settings.cashfree.environment,
      isConfigured: settings.cashfree.hasSecretKey,
    });
  }

  res.json({
    methods: availableMethods,
    settings,
  });
});

app.get('/api/subscription/my-status', (req, res) => {
  const user = getActiveUser();
  const activeSub = db.getUserActiveSubscription(user.id);
  const now = Date.now();
  const daysRemaining =
    activeSub && activeSub.expiryDate > 0
      ? Math.max(0, Math.ceil((activeSub.expiryDate - now) / (24 * 3600 * 1000)))
      : activeSub && activeSub.expiryDate === 0
      ? -1 // lifetime / permanent
      : 0;

  res.json({
    user,
    activeSubscription: activeSub,
    daysRemaining,
    limits: user.generationLimits,
  });
});

app.get('/api/subscription/my-orders', (req, res) => {
  const user = getActiveUser();
  const orders = db.getPaymentOrders({ userId: user.id });
  const subscriptions = db.getUserSubscriptions(user.id);
  res.json({ orders, subscriptions });
});

app.post('/api/subscription/orders', async (req, res) => {
  const user = getActiveUser();
  const { planId, paymentMethod, userTransactionRef, userProofNotes, userProofScreenshotUrl } =
    req.body || {};

  if (!planId) {
    return res.status(400).json({ error: 'Please select a subscription plan.' });
  }

  const plan = db.getSubscriptionPlan(planId);
  if (!plan) {
    return res.status(404).json({ error: 'Selected subscription plan does not exist.' });
  }

  const validMethods = ['upi_qr', 'upi_id', 'bank_transfer', 'cashfree'];
  if (!validMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: 'Invalid payment method selected.' });
  }

  // Free plan auto-activation
  if (plan.priceINR === 0) {
    const sub = db.activateUserSubscription(user.id, plan, 'free-plan-direct');
    return res.json({
      success: true,
      freeActivated: true,
      subscription: sub,
      message: `${plan.name} has been activated on your account.`,
    });
  }

  // Cashfree flow
  if (paymentMethod === 'cashfree') {
    const orderId = `cf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newOrder = db.createPaymentOrder({
      id: orderId,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      planId: plan.id,
      planName: plan.name,
      amountINR: plan.priceINR,
      paymentMethod: 'cashfree',
      status: 'pending_verification',
      cashfreeOrderId: orderId,
    });

    const returnUrl = `${req.protocol}://${req.get('host')}/?cf_verify=${orderId}`;
    const cfResult = await createCashfreeOrder({
      orderId,
      orderAmount: plan.priceINR,
      orderCurrency: 'INR',
      customerId: user.id,
      customerName: user.name,
      customerEmail: user.email,
      returnUrl,
    });

    if (!cfResult.success) {
      db.updatePaymentOrder(orderId, {
        status: 'failed',
        rejectionReason: cfResult.error || 'Failed to initialize Cashfree gateway order.',
      });
      return res.status(502).json({
        error: cfResult.error || 'Unable to initialize Cashfree payment gateway session.',
      });
    }

    db.updatePaymentOrder(orderId, {
      cashfreePaymentSessionId: cfResult.paymentSessionId,
    });

    return res.json({
      success: true,
      order: db.getPaymentOrder(orderId),
      paymentSessionId: cfResult.paymentSessionId,
      cashfreeOrderId: orderId,
    });
  }

  // Manual payment methods (UPI QR, UPI ID, Bank Transfer)
  const order = db.createPaymentOrder({
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    planId: plan.id,
    planName: plan.name,
    amountINR: plan.priceINR,
    paymentMethod,
    status: 'pending_verification',
    userTransactionRef: userTransactionRef?.trim() || '',
    userProofNotes: userProofNotes?.trim() || '',
    userProofScreenshotUrl: userProofScreenshotUrl || '',
  });

  res.json({
    success: true,
    order,
    message: `Order #${order.referenceNumber} created. Submit your transaction UTR / Reference ID for verification.`,
  });
});

app.post('/api/subscription/orders/:id/submit-proof', (req, res) => {
  const user = getActiveUser();
  const order = db.getPaymentOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  if (order.userId !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized to update this order.' });
  }

  const { userTransactionRef, userProofNotes, userProofScreenshotUrl } = req.body || {};
  if (!userTransactionRef?.trim() && !userProofNotes?.trim()) {
    return res.status(400).json({ error: 'Please enter your transaction reference / UTR number.' });
  }

  const updated = db.updatePaymentOrder(order.id, {
    userTransactionRef: userTransactionRef?.trim() || order.userTransactionRef,
    userProofNotes: userProofNotes !== undefined ? userProofNotes : order.userProofNotes,
    userProofScreenshotUrl:
      userProofScreenshotUrl !== undefined ? userProofScreenshotUrl : order.userProofScreenshotUrl,
    status: 'pending_verification',
  });

  res.json({
    success: true,
    order: updated,
    message: 'Payment proof submitted. Admin will verify and activate your subscription.',
  });
});

app.post('/api/subscription/orders/:id/verify-cashfree', async (req, res) => {
  const order = db.getPaymentOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  if (order.status === 'approved') {
    return res.json({
      success: true,
      alreadyVerified: true,
      order,
      message: 'Order already verified and subscription is active.',
    });
  }

  const cfOrderId = order.cashfreeOrderId || order.id;
  const verifyResult = await verifyCashfreeOrder(cfOrderId);

  if (verifyResult.isPaid) {
    const approval = db.approvePaymentOrder(order.id, 'cashfree_gateway');
    return res.json({
      success: true,
      isPaid: true,
      order: approval.order,
      subscription: approval.subscription,
      message: 'Cashfree payment verified successfully! Your subscription is now active.',
    });
  }

  res.json({
    success: false,
    isPaid: false,
    orderStatus: verifyResult.status,
    message: `Payment status is "${verifyResult.status}". Subscription not activated.`,
  });
});

app.post('/api/subscription/cashfree-webhook', async (req, res) => {
  try {
    const event = req.body;
    const orderData = event?.data?.order || event?.order || {};
    const orderId = orderData?.order_id;
    if (!orderId) {
      return res.status(200).send('No order_id in event');
    }

    const order = (db.getPaymentOrders() || []).find(
      (o) => o.cashfreeOrderId === orderId || o.id === orderId
    );
    if (!order) {
      return res.status(200).send('Order not tracked');
    }

    if (order.status === 'approved') {
      return res.status(200).send('Already approved');
    }

    const verify = await verifyCashfreeOrder(orderId);
    if (verify.isPaid) {
      db.approvePaymentOrder(order.id, 'cashfree_webhook');
      console.log(`[Cashfree Webhook] Approved order ${order.id} for user ${order.userEmail}`);
    }
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[Cashfree Webhook] Error:', err);
    res.status(200).json({ error: err?.message || 'Webhook processing failed' });
  }
});

// -----------------------------------------------------------------------------
// ADMIN PANEL: SUBSCRIPTION MANAGEMENT ENDPOINTS (Strictly Protected)
// -----------------------------------------------------------------------------

app.get('/api/admin/subscription/plans', requireAdmin, (req, res) => {
  res.json({ plans: db.getSubscriptionPlans(true) });
});

app.post('/api/admin/subscription/plans', requireAdmin, (req, res) => {
  const { name, title, description, priceINR, billingCycle, durationDays, durationLabel, tier, features, limits, enabled, isPopular, isRecommended, sortOrder } = req.body || {};
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Plan name is required.' });
  }

  const created = db.createSubscriptionPlan({
    name,
    title,
    description,
    priceINR,
    billingCycle,
    durationDays,
    durationLabel,
    tier,
    features,
    limits,
    enabled,
    isPopular,
    isRecommended,
    sortOrder,
  });

  res.json({
    success: true,
    plan: created,
    plans: db.getSubscriptionPlans(true),
  });
});

app.patch('/api/admin/subscription/plans/:id', requireAdmin, (req, res) => {
  const updated = db.updateSubscriptionPlan(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Subscription plan not found.' });
  res.json({
    success: true,
    plan: updated,
    plans: db.getSubscriptionPlans(true),
  });
});

app.delete('/api/admin/subscription/plans/:id', requireAdmin, (req, res) => {
  const deleted = db.deleteSubscriptionPlan(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Subscription plan not found.' });
  res.json({
    success: true,
    plans: db.getSubscriptionPlans(true),
  });
});

app.get('/api/admin/subscription/payment-settings', requireAdmin, (req, res) => {
  res.json({ settings: db.getSanitizedPaymentSettings() });
});

app.post('/api/admin/subscription/payment-settings', requireAdmin, (req, res) => {
  const { upiQr, upiId, bankTransfer, cashfree } = req.body || {};

  // Store Cashfree secret key securely in server secrets store if provided
  if (cashfree?.secretKey && cashfree.secretKey.trim()) {
    setProviderSecret('cashfree', cashfree.secretKey.trim());
  }
  if (cashfree?.appId && cashfree.appId.trim()) {
    setProviderSecret('cashfree_app_id', cashfree.appId.trim());
  }

  const updated = db.updatePaymentSettings({
    upiQr,
    upiId,
    bankTransfer,
    cashfree: cashfree
      ? {
          enabled: cashfree.enabled,
          environment: cashfree.environment,
          appIdEnvVar: cashfree.appIdEnvVar,
          webhookUrl: cashfree.webhookUrl,
        }
      : undefined,
  });

  res.json({
    success: true,
    settings: updated,
  });
});

app.post('/api/admin/subscription/test-cashfree', requireAdmin, async (req, res) => {
  const { appId, secretKey, environment } = req.body || {};
  const result = await testCashfreeConnection({
    appId,
    secretKey,
    environment,
  });
  res.json(result);
});

app.get('/api/admin/subscription/orders', requireAdmin, (req, res) => {
  const { userId, status } = req.query as { userId?: string; status?: string };
  const orders = db.getPaymentOrders({ userId, status });
  res.json({ orders });
});

app.post('/api/admin/subscription/orders/:id/approve', requireAdmin, (req, res) => {
  const user = getActiveUser();
  const result = db.approvePaymentOrder(req.params.id, user.email);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({
    success: true,
    order: result.order,
    subscription: result.subscription,
    orders: db.getPaymentOrders(),
  });
});

app.post('/api/admin/subscription/orders/:id/reject', requireAdmin, (req, res) => {
  const user = getActiveUser();
  const { reason } = req.body || {};
  const result = db.rejectPaymentOrder(req.params.id, reason, user.email);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({
    success: true,
    order: result.order,
    orders: db.getPaymentOrders(),
  });
});

app.get('/api/admin/subscription/subscriptions', requireAdmin, (req, res) => {
  const users = db.getUsers();
  const activeSubs = users
    .map((u) => ({
      user: u,
      subscription: db.getUserActiveSubscription(u.id),
      allSubscriptions: db.getUserSubscriptions(u.id),
    }))
    .filter((entry) => !!entry.subscription || entry.allSubscriptions.length > 0);

  res.json({ userSubscriptions: activeSubs });
});

app.post('/api/admin/subscription/manual-grant', requireAdmin, (req, res) => {
  const admin = getActiveUser();
  const { userId, planId, durationDays } = req.body || {};
  if (!userId || !planId) {
    return res.status(400).json({ error: 'User ID and Plan ID are required.' });
  }

  const result = db.manualGrantSubscription(userId, planId, durationDays, admin.email);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({
    success: true,
    user: result.user,
    subscription: result.subscription,
  });
});

// -----------------------------------------------------------------------------
// VITE MIDDLEWARE / STATIC ASSETS
// -----------------------------------------------------------------------------

async function setupServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`MY AI server running on port ${port} (http://0.0.0.0:${port})`);
  });
}

// Only start standalone listener when not in a serverless environment (such as Vercel)
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  setupServer().catch((err) => {
    console.error('Failed to start MY AI server:', err);
  });
}

export { app };
export default app;
