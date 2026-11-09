import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Mic,
  MicOff,
  Send,
  X,
  FileText,
  AudioLines,
  Square,
  Sparkles,
  BookOpen,
  HardDrive,
  Wand2,
  Film,
  Music,
  LayoutTemplate,
  GraduationCap,
} from 'lucide-react';
import { Attachment, ChatSkillMode, ComposerTab, DetectedIntent, NotebookItem } from '../types';
import { PlusBottomSheet } from './PlusBottomSheet';

interface PromptBoxProps {
  onSend: (
    text: string,
    attachments: Attachment[],
    options: {
      composerTab: ComposerTab;
      skillMode: ChatSkillMode;
      aspectRatio: string;
    }
  ) => void;
  isGenerating: boolean;
  activeJobId?: string | null;
  onCancelActiveJob?: () => void;
  composerTab: ComposerTab;
  onChangeComposerTab: (tab: ComposerTab) => void;
  skillMode: ChatSkillMode;
  onChangeSkillMode: (mode: ChatSkillMode) => void;
  notebooks: NotebookItem[];
  userAvatar?: string;
  defaultAspectRatio?: string;
  onOpenVoiceModal: () => void;
  onOpenPersonalIntelligence: () => void;
  attachments: Attachment[];
  onChangeAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  draftText?: string;
  onDraftConsumed?: () => void;
}

const SKILL_META: Record<
  Exclude<ChatSkillMode, 'standard' | 'personal_intelligence'>,
  { label: string; icon: React.FC<{ className?: string }>; placeholder: string }
> = {
  create_images: {
    label: 'Create Images',
    icon: Wand2,
    placeholder: 'Describe an image to create or how to edit an attached photo...',
  },
  create_videos: {
    label: 'Create Videos',
    icon: Film,
    placeholder: 'Describe a cinematic video or attach a photo to animate...',
  },
  create_music: {
    label: 'Create Music',
    icon: Music,
    placeholder: 'Describe the genre, mood, instruments, or lyrics for your audio track...',
  },
  canvas: {
    label: 'Canvas',
    icon: LayoutTemplate,
    placeholder: 'Describe the code module, essay, or slide deck to build in Canvas...',
  },
  guided_learning: {
    label: 'Guided Learning',
    icon: GraduationCap,
    placeholder: 'What topic or homework concept would you like to learn step-by-step?',
  },
};

export const PromptBox: React.FC<PromptBoxProps> = ({
  onSend,
  isGenerating,
  activeJobId,
  onCancelActiveJob,
  composerTab,
  onChangeComposerTab,
  skillMode,
  onChangeSkillMode,
  notebooks,
  userAvatar,
  defaultAspectRatio = '1:1',
  onOpenVoiceModal,
  onOpenPersonalIntelligence,
  attachments,
  onChangeAttachments,
  draftText,
  onDraftConsumed,
}) => {
  const [text, setText] = useState('');
  const [isPlusOpen, setIsPlusOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(defaultAspectRatio);
  const [detectedHint, setDetectedHint] = useState<DetectedIntent>('text');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setAspectRatio(defaultAspectRatio);
  }, [defaultAspectRatio]);

  useEffect(() => {
    if (draftText) {
      setText(draftText);
      onDraftConsumed?.();
      textareaRef.current?.focus();
    }
  }, [draftText, onDraftConsumed]);

  // Adjust aspect ratio cleanly when switching to video mode (16:9 or 9:16)
  useEffect(() => {
    if (skillMode === 'create_videos' && aspectRatio !== '16:9' && aspectRatio !== '9:16') {
      setAspectRatio('16:9');
    }
  }, [skillMode, aspectRatio]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [text]);

  // Lightweight live intent preview
  useEffect(() => {
    if (composerTab === 'task') {
      setDetectedHint('task');
      return;
    }
    if (skillMode === 'create_images') {
      setDetectedHint(attachments.some((a) => a.type === 'image') ? 'image_editing' : 'image_generation');
      return;
    }
    if (skillMode === 'create_videos') {
      setDetectedHint(attachments.some((a) => a.type === 'image') ? 'photo_to_video' : 'video_generation');
      return;
    }
    if (skillMode === 'create_music') {
      setDetectedHint('audio_generation');
      return;
    }
    if (skillMode === 'canvas') {
      setDetectedHint('canvas');
      return;
    }
    if (skillMode === 'guided_learning') {
      setDetectedHint('guided_learning');
      return;
    }

    const p = text.toLowerCase();
    const hasImg = attachments.some((a) => a.type === 'image');
    const hasDoc = attachments.some((a) => a.type === 'document' || a.type === 'notebook' || a.type === 'drive');

    if (hasImg && (p.includes('video') || p.includes('animate') || p.includes('cinematic') || p.includes('motion'))) {
      setDetectedHint('photo_to_video');
    } else if (hasImg && (p.includes('edit') || p.includes('modify') || p.includes('change') || p.includes('remove'))) {
      setDetectedHint('image_editing');
    } else if (hasImg) {
      setDetectedHint('image_understanding');
    } else if (hasDoc) {
      setDetectedHint('document_analysis');
    } else if (p.includes('music') || p.includes('song') || p.includes('soundtrack')) {
      setDetectedHint('audio_generation');
    } else if (p.includes('video') || p.includes('cinematic')) {
      setDetectedHint('video_generation');
    } else if (p.includes('photo') || p.includes('4k') || p.includes('draw ') || p.includes('generate an image') || p.includes('create an image')) {
      setDetectedHint('image_generation');
    } else if (p.includes('python') || p.includes('code') || p.includes('script') || p.includes('algorithm')) {
      setDetectedHint('coding');
    } else {
      setDetectedHint('text');
    }
  }, [text, attachments, composerTab, skillMode]);

  const readFileAsAttachment = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');
      const isCode = /\.(py|js|ts|tsx|jsx|html|css|json|md|sql|sh)$/i.test(file.name);

      let textPreview: string | undefined;
      if (isCode || file.type === 'text/plain' || file.name.endsWith('.csv')) {
        try {
          const base64 = dataUrl.split(',')[1];
          if (base64) textPreview = atob(base64).slice(0, 4000);
        } catch {
          // ignore decode error
        }
      }

      const nextAtt: Attachment = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataUrl,
        size: file.size,
        type: isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : isCode ? 'code' : 'document',
        textPreview,
      };
      onChangeAttachments((prev) => [...prev, nextAtt]);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(readFileAsAttachment);
    e.target.value = '';
  };

  const toggleVoiceDictation = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onstart = () => setIsRecording(true);
      recognition.onresult = (event: any) => {
        let spoken = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          spoken += event.results[i][0].transcript;
        }
        if (event.results[event.results.length - 1]?.isFinal) {
          setText((prev) => (prev ? `${prev.trim()} ${spoken.trim()}` : spoken.trim()));
        }
      };
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsRecording(false);
    }
  };

  const handleSend = () => {
    if (isGenerating) return;
    if (!text.trim() && attachments.length === 0) return;
    onSend(text.trim(), attachments, { composerTab, skillMode, aspectRatio });
    setText('');
    onChangeAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeSkillInfo =
    skillMode !== 'standard' && skillMode !== 'personal_intelligence'
      ? SKILL_META[skillMode]
      : null;

  const placeholderText =
    composerTab === 'task'
      ? 'Describe a multi-step research, planning, or build task for MY AI...'
      : activeSkillInfo
      ? activeSkillInfo.placeholder
      : 'Ask MY AI anything, generate photos, videos, music, or code...';

  const intentLabelMap: Record<DetectedIntent, string> = {
    text: '',
    coding: 'Code Assistant',
    image_generation: 'Image Generation',
    image_editing: 'Photo Editing',
    image_understanding: 'Vision Analysis',
    video_generation: 'Video Generation',
    photo_to_video: 'Photo to Video',
    audio_generation: 'Music Generation',
    document_analysis: 'Document Analysis',
    canvas: 'Canvas Workspace',
    guided_learning: 'Guided Learning',
    task: 'Multi-Step Task',
    translation_writing: 'Writing & Translation',
  };

  const showHint = detectedHint !== 'text' && (text.trim().length > 0 || attachments.length > 0 || skillMode !== 'standard' || composerTab === 'task');

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-5 pt-1">
      {/* Chat / Task Segmented Tabs + Active Skill Indicator */}
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <div className="flex items-center gap-1 bg-[#0B1020] border border-slate-700/90 rounded-xl p-1">
          <button
            type="button"
            onClick={() => onChangeComposerTab('chat')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              composerTab === 'chat'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => onChangeComposerTab('task')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              composerTab === 'task'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            Task
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs min-w-0">
          {activeSkillInfo && (
            <button
              type="button"
              onClick={() => onChangeSkillMode('standard')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-300 font-medium truncate"
              title="Clear active mode"
            >
              <activeSkillInfo.icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{activeSkillInfo.label}</span>
              <X className="w-3 h-3 shrink-0" />
            </button>
          )}
          {showHint && !activeSkillInfo && (
            <span className="text-slate-300 flex items-center gap-1 truncate">
              <Sparkles className="w-3 h-3 text-blue-400 shrink-0" />
              <span className="truncate">{intentLabelMap[detectedHint]}</span>
            </span>
          )}
          {activeJobId && onCancelActiveJob && (
            <button
              type="button"
              onClick={onCancelActiveJob}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 font-semibold transition"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Cancel Task</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Rounded Composer Box */}
      <div className="rounded-3xl bg-[#0B1020] border border-slate-700/90 shadow-2xl focus-within:border-blue-500 transition-colors">
        {/* Attachments Preview Row */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1 border-b border-slate-800">
            {attachments.map((att, idx) => (
              <div
                key={att.id || `att-${idx}-${att.name}`}
                className="relative group flex items-center gap-2 bg-[#11192E] border border-slate-700 rounded-xl p-1.5 pr-7 max-w-[200px]"
              >
                {att.type === 'image' && att.dataUrl ? (
                  <img src={att.dataUrl} alt={att.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                ) : att.type === 'notebook' ? (
                  <div className="w-9 h-9 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                ) : att.type === 'drive' ? (
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0">
                    <HardDrive className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-white truncate">
                    {att.name}
                  </div>
                  <div className="text-[10px] text-slate-300 capitalize">
                    {att.type}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onChangeAttachments((prev) => prev.filter((item) => item.id !== att.id))}
                  className="absolute right-1.5 top-1.5 p-1 rounded-full text-slate-300 hover:text-red-400 hover:bg-slate-800 transition"
                  aria-label="Remove attachment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <div className="px-4 pt-3 pb-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            className="w-full bg-transparent border-none focus:outline-none focus:ring-0 resize-none text-base sm:text-[15px] text-white placeholder:text-slate-400 max-h-40 leading-relaxed"
          />
        </div>

        {/* Bottom Action Bar inside Composer */}
        <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsPlusOpen(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-200 hover:text-white hover:bg-slate-800 transition"
              title="Add attachments & AI tools"
              aria-label="Open attachment and AI creation menu"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {/* Microphone Dictation */}
            <button
              type="button"
              onClick={toggleVoiceDictation}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
                isRecording
                  ? 'bg-red-500/20 text-red-400 animate-pulse'
                  : 'text-slate-200 hover:text-white hover:bg-slate-800'
              }`}
              title={isRecording ? 'Stop dictation' : 'Voice input'}
              aria-label="Voice dictation"
            >
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Voice Conversation Mode */}
            <button
              type="button"
              onClick={onOpenVoiceModal}
              className="w-10 h-10 rounded-full flex items-center justify-center text-blue-400 hover:bg-slate-800 transition"
              title="Live Voice Conversation"
              aria-label="Start live voice conversation"
            >
              <AudioLines className="w-5 h-5" />
            </button>

            {/* Send / Stop */}
            {activeJobId && isGenerating && onCancelActiveJob ? (
              <button
                type="button"
                onClick={onCancelActiveJob}
                className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-md transition"
                title="Stop generation"
                aria-label="Stop generation"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={isGenerating || (!text.trim() && attachments.length === 0)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
                  text.trim() || attachments.length > 0
                    ? 'gemini-gradient-bg text-white shadow-md hover:brightness-110'
                    : 'bg-[#17213B] text-slate-300 border border-slate-700 cursor-not-allowed'
                }`}
                title="Send message"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={photosInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileInput}
      />
      <input
        ref={filesInputRef}
        type="file"
        accept=".pdf,.txt,.md,.json,.csv,.py,.js,.ts,.tsx,.jsx,.html,.css,audio/*,video/*,image/*"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Gemini-Style Plus Bottom Sheet */}
      <PlusBottomSheet
        isOpen={isPlusOpen}
        onClose={() => setIsPlusOpen(false)}
        onPickPhotos={() => photosInputRef.current?.click()}
        onPickCamera={() => cameraInputRef.current?.click()}
        onPickFiles={() => filesInputRef.current?.click()}
        onAttachAvatar={() => {
          if (userAvatar) {
            onChangeAttachments((prev) => [
              ...prev,
              {
                id: `att-avatar-${Date.now()}`,
                name: 'My Profile Avatar',
                mimeType: 'image/png',
                dataUrl: userAvatar,
                type: 'image',
              },
            ]);
          } else {
            photosInputRef.current?.click();
          }
        }}
        onAttachDriveLink={(title, urlOrNote) => {
          onChangeAttachments((prev) => [
            ...prev,
            {
              id: `att-drive-${Date.now()}`,
              name: title,
              mimeType: 'text/plain',
              dataUrl: '',
              type: 'drive',
              textPreview: urlOrNote,
            },
          ]);
        }}
        notebooks={notebooks}
        onAttachNotebook={(nb) => {
          onChangeAttachments((prev) => [
            ...prev,
            {
              id: `att-nb-${nb.id}-${Date.now()}`,
              name: nb.title,
              mimeType: 'text/markdown',
              dataUrl: '',
              type: 'notebook',
              textPreview: nb.content,
            },
          ]);
        }}
        activeSkillMode={skillMode}
        onSelectSkillMode={onChangeSkillMode}
        selectedAspectRatio={aspectRatio}
        onSelectAspectRatio={setAspectRatio}
        onOpenPersonalIntelligence={onOpenPersonalIntelligence}
      />
    </div>
  );
};
