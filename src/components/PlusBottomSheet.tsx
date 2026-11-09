import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Camera,
  UserCircle2,
  FolderOpen,
  HardDrive,
  BookOpen,
  Wand2,
  Film,
  Music,
  LayoutTemplate,
  GraduationCap,
  SlidersHorizontal,
  X,
  Check,
  Plus,
} from 'lucide-react';
import { Attachment, ChatSkillMode, NotebookItem } from '../types';

interface PlusBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onPickPhotos: () => void;
  onPickCamera: () => void;
  onPickFiles: () => void;
  onAttachAvatar: () => void;
  onAttachDriveLink: (title: string, urlOrNote: string) => void;
  notebooks: NotebookItem[];
  onAttachNotebook: (notebook: NotebookItem) => void;
  activeSkillMode: ChatSkillMode;
  onSelectSkillMode: (mode: ChatSkillMode) => void;
  selectedAspectRatio: string;
  onSelectAspectRatio: (ratio: string) => void;
  onOpenPersonalIntelligence: () => void;
}

export const PlusBottomSheet: React.FC<PlusBottomSheetProps> = ({
  isOpen,
  onClose,
  onPickPhotos,
  onPickCamera,
  onPickFiles,
  onAttachAvatar,
  onAttachDriveLink,
  notebooks,
  onAttachNotebook,
  activeSkillMode,
  onSelectSkillMode,
  selectedAspectRatio,
  onSelectAspectRatio,
  onOpenPersonalIntelligence,
}) => {
  const [subPanel, setSubPanel] = useState<'main' | 'drive' | 'notebooks'>('main');
  const [driveTitle, setDriveTitle] = useState('');
  const [driveUrl, setDriveUrl] = useState('');

  if (!isOpen) return null;

  const handleClose = () => {
    setSubPanel('main');
    onClose();
  };

  const quickUploads = [
    { id: 'photos', label: 'Photos', icon: ImageIcon, color: 'text-blue-500 bg-blue-500/10', onClick: () => { onPickPhotos(); handleClose(); } },
    { id: 'camera', label: 'Camera', icon: Camera, color: 'text-emerald-500 bg-emerald-500/10', onClick: () => { onPickCamera(); handleClose(); } },
    { id: 'avatar', label: 'Avatar', icon: UserCircle2, color: 'text-indigo-500 bg-indigo-500/10', onClick: () => { onAttachAvatar(); handleClose(); } },
    { id: 'files', label: 'Files', icon: FolderOpen, color: 'text-amber-500 bg-amber-500/10', onClick: () => { onPickFiles(); handleClose(); } },
    { id: 'drive', label: 'Google Drive', icon: HardDrive, color: 'text-cyan-500 bg-cyan-500/10', onClick: () => setSubPanel('drive') },
    { id: 'notebooks', label: 'Notebooks', icon: BookOpen, color: 'text-purple-500 bg-purple-500/10', onClick: () => setSubPanel('notebooks') },
  ];

  const aiCreations: Array<{
    mode: ChatSkillMode;
    title: string;
    subtitle: string;
    icon: React.FC<{ className?: string }>;
    accent: string;
  }> = [
    {
      mode: 'create_images',
      title: 'Create Images',
      subtitle: 'Visualize and edit',
      icon: Wand2,
      accent: 'text-blue-400',
    },
    {
      mode: 'create_videos',
      title: 'Create Videos',
      subtitle: 'Bring ideas to life',
      icon: Film,
      accent: 'text-purple-400',
    },
    {
      mode: 'create_music',
      title: 'Create Music',
      subtitle: 'Generate audio tracks',
      icon: Music,
      accent: 'text-pink-400',
    },
    {
      mode: 'canvas',
      title: 'Canvas',
      subtitle: 'Code, write or create slides',
      icon: LayoutTemplate,
      accent: 'text-cyan-400',
    },
    {
      mode: 'guided_learning',
      title: 'Guided Learning',
      subtitle: 'Step-by-step assistance',
      icon: GraduationCap,
      accent: 'text-emerald-400',
    },
    {
      mode: 'personal_intelligence',
      title: 'Personal Intelligence',
      subtitle: 'Personalization controls',
      icon: SlidersHorizontal,
      accent: 'text-amber-400',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center sm:items-center p-0 sm:p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg bg-[#0B1020] border-t sm:border border-slate-700/90 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[85dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle / Header */}
        <div className="px-5 pt-3 pb-3 border-b border-slate-800 flex flex-col items-center">
          <div className="w-10 h-1 rounded-full bg-slate-600 mb-3 sm:hidden" />
          <div className="w-full flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              {subPanel === 'drive'
                ? 'Attach Google Drive Resource'
                : subPanel === 'notebooks'
                ? 'Attach a Notebook'
                : 'Add to Chat'}
            </h3>
            <button
              type="button"
              onClick={subPanel === 'main' ? handleClose : () => setSubPanel('main')}
              className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition min-h-[36px] min-w-[36px] flex items-center justify-center"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 sm:p-5 space-y-5">
          {subPanel === 'main' && (
            <>
              {/* Quick Upload Grid */}
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-3">
                  Quick Upload & Sources
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {quickUploads.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={item.onClick}
                        className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-[#11192E] hover:bg-[#18233F] border border-slate-800 transition min-h-[82px]"
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-medium text-slate-100 truncate w-full text-center">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Aspect Ratio Picker when Image or Video selected */}
              {(activeSkillMode === 'create_images' || activeSkillMode === 'create_videos') && (
                <div className="p-3 rounded-2xl bg-[#11192E] border border-slate-800">
                  <div className="text-xs font-semibold text-slate-200 mb-2">
                    Output Aspect Ratio
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(activeSkillMode === 'create_videos'
                      ? ['16:9', '9:16']
                      : ['1:1', '16:9', '9:16', '4:3', '3:4']
                    ).map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => onSelectAspectRatio(ratio)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition ${
                          selectedAspectRatio === ratio
                            ? 'bg-blue-600 text-white'
                            : 'bg-[#070B14] text-slate-200 border border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Creation Options */}
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2.5">
                  AI Tools & Modes
                </div>
                <div className="space-y-1.5">
                  {aiCreations.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = activeSkillMode === opt.mode;
                    return (
                      <button
                        key={opt.mode}
                        type="button"
                        onClick={() => {
                          if (opt.mode === 'personal_intelligence') {
                            handleClose();
                            onOpenPersonalIntelligence();
                            return;
                          }
                          onSelectSkillMode(isSelected ? 'standard' : opt.mode);
                          handleClose();
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-2xl text-left transition min-h-[56px] ${
                          isSelected
                            ? 'bg-blue-600/20 border border-blue-500/50'
                            : 'hover:bg-[#11192E] border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[#070B14] border border-slate-800 flex items-center justify-center shrink-0">
                            <Icon className={`w-5 h-5 ${opt.accent}`} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">
                              {opt.title}
                            </div>
                            <div className="text-xs text-slate-300 truncate">
                              {opt.subtitle}
                            </div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {subPanel === 'drive' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-300 leading-relaxed">
                Paste a Google Drive document name and link or excerpt so MY AI can reference it directly inside your conversation.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  value={driveTitle}
                  onChange={(e) => setDriveTitle(e.target.value)}
                  placeholder="Q4 Product Strategy Deck"
                  className="w-full rounded-xl bg-[#070B14] border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Google Drive URL or Content
                </label>
                <textarea
                  rows={3}
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/... or paste notes"
                  className="w-full rounded-xl bg-[#070B14] border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="button"
                disabled={!driveTitle.trim() && !driveUrl.trim()}
                onClick={() => {
                  onAttachDriveLink(driveTitle.trim() || 'Google Drive Document', driveUrl.trim());
                  setDriveTitle('');
                  setDriveUrl('');
                  handleClose();
                }}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold transition"
              >
                Attach to Chat
              </button>
            </div>
          )}

          {subPanel === 'notebooks' && (
            <div className="space-y-2.5">
              {notebooks.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-300">
                  No Notebooks saved yet. Create one in Library → Notebooks.
                </div>
              ) : (
                notebooks.map((nb) => (
                  <button
                    key={nb.id}
                    type="button"
                    onClick={() => {
                      onAttachNotebook(nb);
                      handleClose();
                    }}
                    className="w-full p-3.5 rounded-2xl bg-[#11192E] hover:bg-[#18233F] border border-slate-800 text-left flex items-center justify-between gap-3 transition"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {nb.title}
                      </div>
                      <div className="text-xs text-slate-300 line-clamp-1 mt-0.5">
                        {nb.content}
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-blue-400 shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
