import React, { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Check,
  FileText,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  Square,
  Bookmark,
  Clock,
  BookOpen,
  HardDrive,
  Volume2,
} from 'lucide-react';
import { ChatMessage, GenerationJob } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import {
  InlineImageViewer,
  InlineVideoPlayer,
  InlineAudioPlayer,
  InlineCanvasCard,
} from './MediaViewer';

function cleanTextForSpeech(markdown: string): string {
  if (!markdown) return '';
  return markdown
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_~>]/g, '')
    .replace(/[-*+]\s+/g, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

function detectSpeechLanguage(text: string): string {
  // Check for Devanagari script (Hindi, Marathi, Sanskrit, Nepali)
  if (/[\u0900-\u097F]/.test(text)) {
    return 'hi-IN';
  }
  if (/[\u0980-\u09FF]/.test(text)) return 'bn-IN';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta-IN';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN';
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu-IN';
  return 'en-US';
}

function selectMatchingVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const targetPrefix = lang.toLowerCase().slice(0, 2);
  const exactMatch = voices.find((v) => v.lang.toLowerCase().replace('_', '-') === lang.toLowerCase());
  if (exactMatch) return exactMatch;

  const prefixMatch = voices.find((v) => v.lang.toLowerCase().startsWith(targetPrefix));
  if (prefixMatch) return prefixMatch;

  return voices[0] || null;
}

interface ChatAreaProps {
  messages: ChatMessage[];
  activeJobs: Record<string, GenerationJob>;
  isGenerating?: boolean;
  onAnimateImage: (imageUrl: string, prompt: string) => void;
  onRegenerateImage?: (prompt: string, aspectRatio?: string) => void;
  onCancelJob: (jobId: string) => void;
  onToggleSaveMessage: (msg: ChatMessage) => void;
  onOpenSettings?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  activeJobs,
  isGenerating,
  onAnimateImage,
  onRegenerateImage,
  onCancelJob,
  onToggleSaveMessage,
  onOpenSettings,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeJobs]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleToggleSpeak = (msgId: string, content: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();

    const plainText = cleanTextForSpeech(content);
    if (!plainText) return;

    const utterance = new SpeechSynthesisUtterance(plainText);
    const lang = detectSpeechLanguage(plainText);
    utterance.lang = lang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voice = selectMatchingVoice(lang);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      setSpeakingMsgId(msgId);
    };

    utterance.onend = () => {
      setSpeakingMsgId((curr) => (curr === msgId ? null : curr));
    };

    utterance.onerror = () => {
      setSpeakingMsgId((curr) => (curr === msgId ? null : curr));
    };

    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Welcome Screen (only shown when starting a new empty chat)
  if (messages.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 flex items-center justify-center">
        <div className="w-full max-w-xl mx-auto flex flex-col items-center justify-center text-center">
          {/* Animated AI Sparkle SVG Logo */}
          <div className="w-16 h-16 mb-5 rounded-2xl bg-[#0B1020] border border-blue-500/40 flex items-center justify-center sparkle-animate shadow-[0_0_40px_rgba(37,99,235,0.28)]">
            <svg viewBox="0 0 48 48" className="w-9 h-9" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="myaiSparkle" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#60a5fa" />
                  <stop offset="50%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
              <path
                d="M24 4C25.6 15.2 32.8 22.4 44 24C32.8 25.6 25.6 32.8 24 44C22.4 32.8 15.2 25.6 4 24C15.2 22.4 22.4 15.2 24 4Z"
                fill="url(#myaiSparkle)"
              />
            </svg>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white text-center">
            Welcome to <span className="text-blue-400">MY AI</span>
          </h1>
          <p className="mt-2.5 text-sm sm:text-base text-slate-300 text-center">
            What can I help you with today?
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {messages.map((msg, msgIdx) => {
          const msgKey = msg.id || `msg-${msgIdx}-${msg.timestamp}`;
          const isUser = msg.role === 'user';
          const linkedJob = msg.jobId ? activeJobs[msg.jobId] : undefined;

          if (isUser) {
            return (
              <div key={msgKey} className="flex justify-end">
                <div className="max-w-[88%] sm:max-w-[78%] rounded-2xl rounded-tr-sm px-4 py-3 bg-blue-600 border border-blue-500/60 text-white shadow-lg">
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.attachments.map((att, attIdx) => (
                        <div
                          key={att.id || `${msgKey}-att-${attIdx}`}
                          className="rounded-xl overflow-hidden bg-[#060913]/80 border border-blue-300/30"
                        >
                          {att.type === 'image' && att.dataUrl ? (
                            <img
                              src={att.dataUrl}
                              alt={att.name}
                              className="max-h-48 max-w-[240px] object-cover"
                            />
                          ) : (
                            <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs text-white">
                              {att.type === 'notebook' ? (
                                <BookOpen className="w-3.5 h-3.5 text-blue-200" />
                              ) : att.type === 'drive' ? (
                                <HardDrive className="w-3.5 h-3.5 text-cyan-200" />
                              ) : (
                                <FileText className="w-3.5 h-3.5 text-blue-200" />
                              )}
                              <span className="truncate max-w-[180px]">{att.name}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-sm sm:text-[15px] text-white whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          }

          // Assistant message states
          const isTaskMessage = msg.mediaType === 'task' || (msg.taskSteps && msg.taskSteps.length > 0);
          const isPendingVideo = msg.status === 'pending' && msg.mediaType === 'video';
          const isPendingChat =
            (msg.status === 'pending' && msg.mediaType !== 'video') ||
            (msg.status === 'streaming' && !msg.content && !isTaskMessage);
          const isError = msg.status === 'error';
          const isCancelled = msg.status === 'cancelled';

          return (
            <div key={msgKey} className="flex items-start gap-3">
              {/* MY AI Sparkle Avatar */}
              <div className="w-8 h-8 rounded-full bg-[#0B1020] border border-blue-500/40 flex items-center justify-center shrink-0 mt-0.5">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" aria-hidden="true">
                  <path
                    d="M12 2C12.9 7.8 16.2 11.1 22 12C16.2 12.9 12.9 16.2 12 22C11.1 16.2 7.8 12.9 2 12C7.8 11.1 11.1 7.8 12 2Z"
                    fill="#60a5fa"
                  />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                {/* Pending standard thinking */}
                {isPendingChat && (
                  <div className="flex items-center gap-2.5 text-sm text-slate-200 py-1.5">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                    <span>Thinking...</span>
                  </div>
                )}

                {/* Background Video Generation Job Progress */}
                {isPendingVideo && (
                  <div className="rounded-2xl border border-slate-800 bg-[#0B1020] p-4 max-w-lg shadow-lg">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                        <span>Generating Video</span>
                      </div>
                      {msg.jobId && (
                        <button
                          type="button"
                          onClick={() => onCancelJob(msg.jobId!)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold transition"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>Cancel</span>
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-300">
                      {linkedJob?.statusDetail || 'Processing frames with Gemini Omni 1.2 Flash...'}
                    </p>
                    <div className="mt-3 w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full gemini-gradient-bg transition-all duration-500"
                        style={{ width: `${Math.max(8, linkedJob?.progress || 15)}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span className="capitalize">{linkedJob?.status || 'processing'}</span>
                      <span>{linkedJob?.progress ?? 15}%</span>
                    </div>
                  </div>
                )}

                {/* Multi-Step Task Progress Card */}
                {isTaskMessage && msg.taskSteps && msg.taskSteps.length > 0 && (
                  <div className="mb-3 rounded-2xl border border-slate-800 bg-[#0B1020] p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="text-xs font-bold uppercase tracking-wider text-blue-400">
                        Task Execution Plan
                      </div>
                      {msg.jobId && (msg.status === 'streaming' || msg.status === 'pending') && (
                        <button
                          type="button"
                          onClick={() => onCancelJob(msg.jobId!)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold transition"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>Cancel Task</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {msg.taskSteps.map((step, sIdx) => (
                        <div
                          key={step.id || `${msgKey}-step-${sIdx}`}
                          className="flex items-start gap-2.5 text-xs sm:text-sm"
                        >
                          {step.status === 'completed' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          ) : step.status === 'running' ? (
                            <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0 mt-0.5" />
                          ) : step.status === 'failed' || step.status === 'cancelled' ? (
                            <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          ) : (
                            <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-white">
                              {step.title}
                            </div>
                            {step.detail && (
                              <div className="text-xs text-slate-300 mt-0.5">
                                {step.detail}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Honest Error / Quota Exceeded / Missing Config Card */}
                {isError && (
                  <div
                    className={`rounded-2xl border p-4 text-sm space-y-2.5 ${
                      msg.errorCode === 'QUOTA_EXCEEDED' || msg.errorCode === 'RESOURCE_EXHAUSTED'
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                        : 'border-red-500/40 bg-red-500/10 text-red-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                          {msg.reason === 'FREE_TIER_LIMIT_ZERO'
                            ? 'Paid API Key Required (Free-Tier Quota = 0)'
                            : msg.errorCode === 'QUOTA_EXCEEDED' || msg.errorCode === 'RESOURCE_EXHAUSTED'
                            ? 'API Quota / Rate Limit Exceeded'
                            : msg.errorCode === 'MISSING_API_KEY' || msg.errorCode === 'API_KEY_INVALID'
                            ? 'Gemini API Key Configuration Required'
                            : msg.errorCode === 'PERMISSION_DENIED'
                            ? 'Google API Permission Denied (HTTP 403)'
                            : 'AI Request Failed'}
                        </span>
                      </div>
                      {(msg.httpStatus || msg.googleStatus) && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#0B1020] border border-slate-700 text-slate-200">
                          {[msg.httpStatus ? `HTTP ${msg.httpStatus}` : '', msg.googleStatus || '']
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm leading-relaxed text-slate-100">{msg.error || msg.content}</p>

                    {msg.rawError && (
                      <div className="rounded-xl bg-[#070B14] border border-slate-800 p-3 space-y-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Exact Google API Error Reason{msg.reason ? ` (${msg.reason})` : ''}
                        </div>
                        <pre className="text-[11px] font-mono text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                          {msg.rawError}
                        </pre>
                      </div>
                    )}

                    {msg.missingConfig && (
                      <div className="pt-0.5 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono bg-[#0B1020] border border-slate-700 px-2 py-0.5 rounded text-slate-200">
                          Secret: {msg.missingConfig}
                        </span>
                        {onOpenSettings && (
                          <button
                            type="button"
                            onClick={onOpenSettings}
                            className="underline font-semibold text-blue-300"
                          >
                            Check API Diagnostics
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {isCancelled && (
                  <div className="text-xs text-slate-300 italic py-1">
                    {msg.content || 'Generation cancelled.'}
                  </div>
                )}

                {/* Main Text / Markdown Output */}
                {!isError && !isCancelled && !isPendingChat && !isPendingVideo && msg.content && (
                  <div className="text-sm sm:text-[15px] text-slate-100 leading-relaxed">
                    <MarkdownRenderer content={msg.content} />
                    {msg.status === 'streaming' && !isTaskMessage && (
                      <span className="inline-block w-2 h-4 ml-1 bg-blue-400 animate-pulse align-middle rounded-sm" />
                    )}
                  </div>
                )}

                {/* Inline Canvas Workspace */}
                {msg.canvasData && <InlineCanvasCard canvas={msg.canvasData} />}

                {/* Inline Media Viewers */}
                {msg.mediaData?.type === 'image' && msg.mediaData.url && (
                  <InlineImageViewer
                    media={msg.mediaData}
                    onAnimateToVideo={onAnimateImage}
                    onRegenerate={onRegenerateImage}
                    isRegenerating={isGenerating}
                    onToggleSave={() => onToggleSaveMessage(msg)}
                    isSaved={msg.saved}
                  />
                )}

                {msg.mediaData?.type === 'video' && msg.mediaData.url && (
                  <InlineVideoPlayer
                    media={msg.mediaData}
                    onToggleSave={() => onToggleSaveMessage(msg)}
                    isSaved={msg.saved}
                  />
                )}

                {msg.mediaData?.type === 'audio' && msg.mediaData.url && (
                  <InlineAudioPlayer
                    media={msg.mediaData}
                    onToggleSave={() => onToggleSaveMessage(msg)}
                    isSaved={msg.saved}
                  />
                )}

                {/* Clean Footer Metadata */}
                {msg.status === 'complete' && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-[11px] text-slate-400">
                    {msg.modelUsed && <span className="font-mono text-slate-300">{msg.modelUsed}</span>}
                    {msg.processingTimeMs !== undefined && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-slate-300">
                          {(msg.processingTimeMs / 1000).toFixed(1)}s
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    {msg.content && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleToggleSpeak(msgKey, msg.content)}
                          title={speakingMsgId === msgKey ? 'Stop listening (आवाज़ रोकें)' : 'Listen to AI reply (सुनें)'}
                          className={`inline-flex items-center gap-1 transition ${
                            speakingMsgId === msgKey
                              ? 'text-blue-400 font-medium'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          {speakingMsgId === msgKey ? (
                            <>
                              <Square className="w-3.5 h-3.5 fill-current text-blue-400 animate-pulse" />
                              <span className="text-blue-300">Stop</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                              <span>Listen</span>
                            </>
                          )}
                        </button>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy(msgKey, msg.content)}
                      className="inline-flex items-center gap-1 text-slate-300 hover:text-white transition"
                    >
                      {copiedId === msgKey ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleSaveMessage(msg)}
                      className={`inline-flex items-center gap-1 hover:text-white transition ${
                        msg.saved ? 'text-blue-400 font-medium' : 'text-slate-300'
                      }`}
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${msg.saved ? 'fill-current' : ''}`} />
                      <span>{msg.saved ? 'Saved' : 'Save'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
