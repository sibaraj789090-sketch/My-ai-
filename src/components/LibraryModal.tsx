import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Download,
  Trash2,
  Bookmark,
  MessageSquare,
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  BookOpen,
  Clock,
  Plus,
  Square,
  ExternalLink,
} from 'lucide-react';
import { ChatConversation, GenerationJob, NotebookItem } from '../types';
import { LibraryFilter } from './Sidebar';

interface LibraryModalProps {
  isOpen: boolean;
  initialTab: LibraryFilter;
  onClose: () => void;
  onOpenChat: (chatId: string) => void;
  onAttachNotebookToChat: (nb: NotebookItem) => void;
  onNotebooksChanged: (notebooks: NotebookItem[]) => void;
  onCancelJob: (jobId: string) => void;
}

export const LibraryModal: React.FC<LibraryModalProps> = ({
  isOpen,
  initialTab,
  onClose,
  onOpenChat,
  onAttachNotebookToChat,
  onNotebooksChanged,
  onCancelJob,
}) => {
  const [tab, setTab] = useState<LibraryFilter>(initialTab);
  const [search, setSearch] = useState('');
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [notebooks, setNotebooks] = useState<NotebookItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Notebook editor state
  const [nbTitle, setNbTitle] = useState('');
  const [nbContent, setNbContent] = useState('');
  const [editingNbId, setEditingNbId] = useState<string | null>(null);
  const [showNbForm, setShowNbForm] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/library');
      const data = await res.json();
      setJobs(data.jobs || []);
      setChats(data.chats || []);
      setNotebooks(data.notebooks || []);
      onNotebooksChanged(data.notebooks || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadLibrary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const tabs: Array<{ id: LibraryFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'conversations', label: 'Conversations' },
    { id: 'images', label: 'Images' },
    { id: 'videos', label: 'Videos' },
    { id: 'audio', label: 'Audio' },
    { id: 'files', label: 'Files' },
    { id: 'notebooks', label: 'Notebooks' },
    { id: 'saved', label: 'Saved' },
    { id: 'scheduled', label: 'Scheduled' },
  ];

  const q = search.trim().toLowerCase();

  const filteredJobs = jobs.filter((j) => {
    if (q && !j.prompt.toLowerCase().includes(q) && !(j.fileName || '').toLowerCase().includes(q)) {
      return false;
    }
    if (tab === 'images') return j.type === 'image';
    if (tab === 'videos') return j.type === 'video';
    if (tab === 'audio') return j.type === 'audio';
    if (tab === 'files') return j.type === 'file';
    if (tab === 'saved') return !!j.saved;
    if (tab === 'scheduled') return j.type === 'task' || j.status === 'queued' || j.status === 'processing';
    if (tab === 'conversations' || tab === 'notebooks') return false;
    return true;
  });

  const filteredChats = chats.filter((c) => {
    if (tab !== 'conversations' && tab !== 'all') return false;
    return !q || c.title.toLowerCase().includes(q);
  });

  const filteredNotebooks = notebooks.filter((n) => {
    if (tab !== 'notebooks' && tab !== 'all') return false;
    return !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
  });

  const handleToggleSave = async (id: string) => {
    const res = await fetch(`/api/library/${id}/save`, { method: 'PATCH' });
    const data = await res.json();
    if (data.job) {
      setJobs((prev) => prev.map((j) => (j.id === id ? data.job : j)));
    }
  };

  const handleDeleteJob = async (id: string) => {
    await fetch(`/api/library/${id}`, { method: 'DELETE' });
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const handleSaveNotebook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nbTitle.trim()) return;
    if (editingNbId) {
      const res = await fetch(`/api/notebooks/${editingNbId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nbTitle.trim(), content: nbContent }),
      });
      const data = await res.json();
      if (data.notebook) {
        const next = notebooks.map((n) => (n.id === editingNbId ? data.notebook : n));
        setNotebooks(next);
        onNotebooksChanged(next);
      }
    } else {
      const res = await fetch('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nbTitle.trim(), content: nbContent }),
      });
      const data = await res.json();
      if (data.notebook) {
        const next = [data.notebook, ...notebooks];
        setNotebooks(next);
        onNotebooksChanged(next);
      }
    }
    setNbTitle('');
    setNbContent('');
    setEditingNbId(null);
    setShowNbForm(false);
  };

  const handleDeleteNotebook = async (id: string) => {
    await fetch(`/api/notebooks/${id}`, { method: 'DELETE' });
    const next = notebooks.filter((n) => n.id !== id);
    setNotebooks(next);
    onNotebooksChanged(next);
  };

  const handleDownload = (url?: string, name?: string) => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = name || `myai-export-${Date.now()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
      <div className="w-full h-full sm:h-[88dvh] sm:max-w-5xl bg-[#070B14] sm:border border-slate-800 sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Library & Notebooks</h2>
            <p className="text-xs text-slate-300">
              Conversations, generated media, uploaded files, scheduled tasks, and notebooks
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-[#11192E] transition"
            aria-label="Close Library"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search + Filter Tabs */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-800 space-y-3 bg-[#0B1020]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search library, prompts, files, notebooks..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            {(tab === 'notebooks' || tab === 'all') && (
              <button
                type="button"
                onClick={() => {
                  setEditingNbId(null);
                  setNbTitle('');
                  setNbContent('');
                  setShowNbForm(true);
                  setTab('notebooks');
                }}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>New Notebook</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  tab === t.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#11192E] text-slate-200 border border-slate-700/80 hover:bg-[#17213B] hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-300">Loading library...</div>
          ) : (
            <>
              {/* Notebook Form */}
              {showNbForm && (
                <form
                  onSubmit={handleSaveNotebook}
                  className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-3"
                >
                  <div className="text-sm font-bold text-white">
                    {editingNbId ? 'Edit Notebook' : 'Create Notebook'}
                  </div>
                  <input
                    type="text"
                    value={nbTitle}
                    onChange={(e) => setNbTitle(e.target.value)}
                    placeholder="Notebook Title"
                    required
                    className="w-full px-3.5 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                  />
                  <textarea
                    rows={4}
                    value={nbContent}
                    onChange={(e) => setNbContent(e.target.value)}
                    placeholder="Write study notes, project specs, or context to attach to MY AI..."
                    className="w-full px-3.5 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNbForm(false)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-[#17213B]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                    >
                      Save Notebook
                    </button>
                  </div>
                </form>
              )}

              {/* Notebooks Section */}
              {filteredNotebooks.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                    Notebooks ({filteredNotebooks.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredNotebooks.map((nb) => (
                      <div
                        key={nb.id}
                        className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 flex flex-col justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-white">
                            <BookOpen className="w-4 h-4 text-purple-400 shrink-0" />
                            <span className="truncate">{nb.title}</span>
                          </div>
                          <p className="mt-1.5 text-xs text-slate-300 line-clamp-3 whitespace-pre-wrap">
                            {nb.content || 'Empty notebook'}
                          </p>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              onAttachNotebookToChat(nb);
                              onClose();
                            }}
                            className="text-xs font-semibold text-blue-400 hover:underline"
                          >
                            Attach to Chat
                          </button>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNbId(nb.id);
                                setNbTitle(nb.title);
                                setNbContent(nb.content);
                                setShowNbForm(true);
                              }}
                              className="text-xs text-slate-300 hover:text-white"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteNotebook(nb.id)}
                              className="p-1 text-slate-400 hover:text-red-400"
                              aria-label="Delete notebook"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conversations Section */}
              {filteredChats.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                    Conversations ({filteredChats.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {filteredChats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => {
                          onOpenChat(chat.id);
                          onClose();
                        }}
                        className="p-3.5 rounded-2xl bg-[#0B1020] hover:bg-[#11192E] border border-slate-800 text-left flex items-center justify-between gap-3 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <MessageSquare className="w-4 h-4 text-blue-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">
                              {chat.title}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {new Date(chat.updatedAt).toLocaleDateString()} · {chat.messageCount || 0} messages
                            </div>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Media / Files / Tasks Grid */}
              {filteredJobs.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                    Creations & Jobs ({filteredJobs.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {filteredJobs.map((job) => (
                      <div
                        key={job.id}
                        className="rounded-2xl border border-slate-800 bg-[#0B1020] overflow-hidden flex flex-col justify-between"
                      >
                        {job.type === 'image' && job.outputUrl ? (
                          <img
                            src={job.outputUrl}
                            alt={job.prompt}
                            className="w-full h-44 object-cover bg-black/40"
                          />
                        ) : job.type === 'video' && job.outputUrl ? (
                          <video
                            src={job.outputUrl}
                            controls
                            className="w-full h-44 object-cover bg-black"
                          />
                        ) : (
                          <div className="p-4 flex items-center gap-2.5 border-b border-slate-800">
                            {job.type === 'audio' ? (
                              <Music className="w-5 h-5 text-pink-400 shrink-0" />
                            ) : job.type === 'task' ? (
                              <Clock className="w-5 h-5 text-blue-400 shrink-0" />
                            ) : job.type === 'video' ? (
                              <Film className="w-5 h-5 text-purple-400 shrink-0" />
                            ) : job.type === 'image' ? (
                              <ImageIcon className="w-5 h-5 text-blue-400 shrink-0" />
                            ) : (
                              <FileText className="w-5 h-5 text-amber-400 shrink-0" />
                            )}
                            <span className="text-xs font-semibold text-slate-100 capitalize truncate">
                              {job.fileName || job.type} · {job.status}
                            </span>
                          </div>
                        )}

                        <div className="p-3.5 space-y-2.5">
                          <p className="text-xs text-slate-200 line-clamp-2 font-medium">
                            {job.prompt}
                          </p>
                          <div className="text-[11px] font-mono text-slate-400">
                            {job.model} · {new Date(job.timestamp).toLocaleDateString()}
                          </div>

                          {job.type === 'audio' && job.outputUrl && (
                            <audio src={job.outputUrl} controls className="w-full h-8" />
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                            <div className="flex items-center gap-1.5">
                              {job.chatId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onOpenChat(job.chatId!);
                                    onClose();
                                  }}
                                  className="text-xs font-semibold text-blue-400 hover:underline"
                                >
                                  Open Chat
                                </button>
                              )}
                              {(job.status === 'queued' || job.status === 'processing') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onCancelJob(job.id);
                                    loadLibrary();
                                  }}
                                  className="flex items-center gap-1 text-xs font-semibold text-red-400 hover:underline"
                                >
                                  <Square className="w-3 h-3 fill-current" />
                                  <span>Cancel</span>
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleToggleSave(job.id)}
                                className={`p-1.5 rounded-lg ${
                                  job.saved ? 'text-blue-400' : 'text-slate-400 hover:text-white'
                                }`}
                                title="Toggle Saved"
                              >
                                <Bookmark className={`w-4 h-4 ${job.saved ? 'fill-current' : ''}`} />
                              </button>
                              {job.outputUrl && (
                                <button
                                  type="button"
                                  onClick={() => handleDownload(job.outputUrl, job.fileName)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteJob(job.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filteredJobs.length === 0 &&
                filteredChats.length === 0 &&
                filteredNotebooks.length === 0 && (
                  <div className="py-16 text-center text-sm text-slate-400">
                    Nothing found in this section yet. Create images, videos, music, tasks, or notebooks from MY AI chat.
                  </div>
                )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
