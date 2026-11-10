import React, { useState, useEffect, useCallback } from 'react';
import { Menu, ChevronDown, Sun, Moon, Monitor, Sparkles, Check } from 'lucide-react';
import {
  AIModelConfig,
  Attachment,
  ChatConversation,
  ChatMessage,
  ChatSkillMode,
  ComposerTab,
  GenerationJob,
  NotebookItem,
  PublicLinkItem,
  ThemePreference,
  UserAccount,
} from './types';
import { Sidebar, LibraryFilter } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { PromptBox } from './components/PromptBox';
import { VoiceConversationModal } from './components/VoiceConversationModal';
import { LibraryModal } from './components/LibraryModal';
import { AccountModal } from './components/AccountModal';
import { SettingsModal, SettingsSectionKey } from './components/SettingsModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { SubscriptionModal } from './components/SubscriptionModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [availableUsers, setAvailableUsers] = useState<UserAccount[]>([]);
  const [models, setModels] = useState<AIModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  const [siteConfig, setSiteConfig] = useState<{
    siteName: string;
    announcementBanner: string;
    maintenanceMode: boolean;
  }>({ siteName: 'MY AI', announcementBanner: '', maintenanceMode: false });

  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notebooks, setNotebooks] = useState<NotebookItem[]>([]);
  const [publicLinks, setPublicLinks] = useState<PublicLinkItem[]>([]);

  // Composer controls
  const [composerTab, setComposerTab] = useState<ComposerTab>('chat');
  const [skillMode, setSkillMode] = useState<ChatSkillMode>('standard');
  const [composerAttachments, setComposerAttachments] = useState<Attachment[]>([]);
  const [draftText, setDraftText] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Active background jobs polling
  const [activeJobs, setActiveJobs] = useState<Record<string, GenerationJob>>({});

  // Theme preference: system | light | dark
  const [themePref, setThemePref] = useState<ThemePreference>('dark');

  // Navigation Drawers & Modals
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [libraryState, setLibraryState] = useState<{ open: boolean; tab: LibraryFilter }>({
    open: false,
    tab: 'all',
  });
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [settingsState, setSettingsState] = useState<{
    open: boolean;
    section: SettingsSectionKey;
  }>({ open: false, section: 'main' });
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Enforce dark theme across the entire app
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, [themePref]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const loadWorkspace = useCallback(async () => {
    try {
      const [userRes, chatsRes, nbRes] = await Promise.all([
        fetch('/api/user'),
        fetch('/api/chats'),
        fetch('/api/notebooks'),
      ]);
      const userData = await userRes.json();
      const chatsData = await chatsRes.json();
      const nbData = await nbRes.json();

      if (userData.user) {
        setCurrentUser(userData.user);
        if (userData.user.preferences?.theme) {
          setThemePref(userData.user.preferences.theme);
        }
      }
      setAvailableUsers(userData.availableUsers || []);
      setModels(userData.models || []);
      setPublicLinks(userData.publicLinks || []);
      if (userData.siteConfig) {
        setSiteConfig(userData.siteConfig);
      }

      const loadedChats: ChatConversation[] = chatsData.chats || [];
      setChats(loadedChats);
      setNotebooks(nbData.notebooks || []);

      if (loadedChats.length > 0) {
        setActiveChatId((prev) => {
          const exists = prev && loadedChats.some((c) => c.id === prev);
          return exists ? prev : loadedChats[0].id;
        });
      } else {
        setActiveChatId(null);
        setMessages([]);
      }
    } catch {
      // ignore network error
    }
  }, []);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const loadChatMessages = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`/api/chats/${chatId}`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (activeChatId) {
      loadChatMessages(activeChatId);
    } else {
      setMessages([]);
    }
  }, [activeChatId, loadChatMessages]);

  // Poll any active background video / multi-step task jobs
  const activeJobIds = Object.values(activeJobs)
    .filter((j) => j.status === 'queued' || j.status === 'processing')
    .map((j) => j.id);

  useEffect(() => {
    if (activeJobIds.length === 0) return;

    const interval = setInterval(async () => {
      for (const jobId of activeJobIds) {
        try {
          const res = await fetch(`/api/jobs/${jobId}`);
          if (!res.ok) continue;
          const data = await res.json();
          if (data.job) {
            setActiveJobs((prev) => ({ ...prev, [jobId]: data.job }));
          }
          if (data.message && data.message.chatId === activeChatId) {
            setMessages((prev) =>
              prev.map((m) => (m.id === data.message.id ? data.message : m))
            );
          }
        } catch {
          // ignore
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJobIds.join(','), activeChatId]);

  const handleNewChat = async () => {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Chat', skillMode }),
    });
    const data = await res.json();
    if (data.chat) {
      setChats((prev) => [data.chat, ...prev]);
      setActiveChatId(data.chat.id);
      setMessages([]);
    }
  };

  const ensureChatId = async (): Promise<string> => {
    if (activeChatId) return activeChatId;
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Chat', skillMode }),
    });
    const data = await res.json();
    setChats((prev) => [data.chat, ...prev]);
    setActiveChatId(data.chat.id);
    return data.chat.id;
  };

  const handleSendMessage = async (
    text: string,
    attachments: Attachment[],
    options: { composerTab: ComposerTab; skillMode: ChatSkillMode; aspectRatio: string; seed?: number }
  ) => {
    setIsGenerating(true);
    const chatId = await ensureChatId();
    const pendingTempId = `temp-a-${Date.now()}`;

    const optimisticUser: ChatMessage = {
      id: `temp-u-${Date.now()}`,
      chatId,
      role: 'user',
      content: text || `[Uploaded ${attachments.length} file(s)]`,
      timestamp: Date.now(),
      attachments,
      status: 'complete',
    };

    const optimisticPending: ChatMessage = {
      id: pendingTempId,
      chatId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending',
    };

    setMessages((prev) => [...prev, optimisticUser, optimisticPending]);

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 70000);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          chatId,
          message: text,
          attachments,
          model: selectedModel,
          composerTab: options.composerTab,
          skillMode: options.skillMode,
          aspectRatio: options.aspectRatio,
          resolution: currentUser?.preferences?.media?.defaultVideoResolution || '720p',
          ...(options.seed !== undefined ? { seed: options.seed } : {}),
          stream: true,
        }),
      });

      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let streamedText = '';
        let streamFinished = false;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });

          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;

            try {
              const evt = JSON.parse(jsonStr);
              if (evt.type === 'chunk' && evt.text) {
                streamedText += evt.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === pendingTempId
                      ? {
                          ...m,
                          status: 'streaming',
                          content: streamedText,
                          modelUsed: evt.modelUsed || m.modelUsed,
                        }
                      : m
                  )
                );
              } else if (evt.type === 'done' && evt.message) {
                streamFinished = true;
                setMessages((prev) =>
                  prev.map((m) => (m.id === pendingTempId ? evt.message : m))
                );
              } else if (evt.type === 'error') {
                streamFinished = true;
                const errMsgObj: ChatMessage = evt.message || {
                  ...optimisticPending,
                  status: 'error',
                  error: evt.error || 'Gemini API error occurred.',
                  errorCode: evt.errorCode || 'API_ERROR',
                  httpStatus: evt.httpStatus,
                  googleStatus: evt.googleStatus,
                  reason: evt.reason,
                  rawError: evt.rawError,
                  missingConfig: evt.missingConfig,
                  content: evt.error || 'Gemini API error occurred.',
                };
                setMessages((prev) =>
                  prev.map((m) => (m.id === pendingTempId ? errMsgObj : m))
                );
              }
            } catch {
              // ignore partial JSON fragment
            }
          }
        }

        if (!streamFinished) {
          await loadChatMessages(chatId);
        }
      } else {
        const data = await res.json().catch(() => ({
          error: `Server returned status ${res.status}`,
        }));

        if (data.asyncJobId && data.message) {
          setActiveJobs((prev) => ({
            ...prev,
            [data.asyncJobId]: {
              id: data.asyncJobId,
              userId: currentUser?.id || '',
              userEmail: currentUser?.email || '',
              chatId,
              messageId: data.message.id,
              type: options.composerTab === 'task' ? 'task' : 'video',
              prompt: text,
              status: 'processing',
              progress: 10,
              statusDetail: 'Processing...',
              model: data.message.modelUsed || 'gemini-omni-1.2-flash',
              timestamp: Date.now(),
              durationSeconds: 0,
            },
          }));
        }

        if (!res.ok && !data.message) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pendingTempId
                ? {
                    ...m,
                    status: 'error',
                    error: data.error || `Request failed (${res.status})`,
                    errorCode: data.errorCode || 'API_ERROR',
                    httpStatus: data.httpStatus ?? res.status,
                    googleStatus: data.googleStatus,
                    reason: data.reason,
                    rawError: data.rawError,
                    missingConfig: data.missingConfig,
                    content: data.error || `Request failed (${res.status})`,
                  }
                : m
            )
          );
        } else {
          await loadChatMessages(chatId);
        }
      }

      const [chatsRes, userRes] = await Promise.all([fetch('/api/chats'), fetch('/api/user')]);
      const [chatsData, userData] = await Promise.all([chatsRes.json(), userRes.json()]);
      setChats(chatsData.chats || []);
      if (userData.user) setCurrentUser(userData.user);
    } catch (err: any) {
      const errorText =
        err?.name === 'AbortError'
          ? 'The AI request timed out. Please try again.'
          : err?.message || 'Failed to contact server. Please check your connection.';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingTempId
            ? {
                ...m,
                status: 'error',
                error: errorText,
                errorCode: err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
                content: errorText,
              }
            : m
        )
      );
      showToast(errorText);
    } finally {
      clearTimeout(timeoutTimer);
      setIsGenerating(false);
    }
  };

  const handleVoiceTurn = async (transcript: string): Promise<string | null> => {
    try {
      const chatId = await ensureChatId();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          message: transcript,
          model: selectedModel,
          composerTab: 'chat',
          skillMode: 'standard',
        }),
      });
      const data = await res.json();
      await loadChatMessages(chatId);
      return data.message?.content || data.error || null;
    } catch {
      return null;
    }
  };

  const handleCancelJob = async (jobId: string) => {
    await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
    setActiveJobs((prev) => {
      const existing = prev[jobId];
      if (!existing) return prev;
      return {
        ...prev,
        [jobId]: { ...existing, status: 'cancelled' },
      };
    });
    if (activeChatId) await loadChatMessages(activeChatId);
    showToast('Generation cancelled.');
  };

  const handleAnimateImage = (imageUrl: string, prompt: string) => {
    setComposerAttachments([
      {
        id: `att-anim-${Date.now()}`,
        name: 'Source Image.png',
        mimeType: 'image/png',
        dataUrl: imageUrl,
        type: 'image',
      },
    ]);
    setSkillMode('create_videos');
    setDraftText(`Animate this photo into a cinematic video: ${prompt}`);
  };

  const handleRegenerateImage = (prompt: string, aspectRatio?: string) => {
    if (isGenerating || !prompt.trim()) return;
    handleSendMessage(prompt, [], {
      composerTab: 'chat',
      skillMode: 'create_images',
      aspectRatio: aspectRatio || currentUser?.preferences?.media?.defaultAspectRatio || '1:1',
      seed: Math.floor(Math.random() * 1_000_000_000),
    });
  };

  const handleToggleSaveMessage = async (msg: ChatMessage) => {
    if (msg.jobId) {
      await fetch(`/api/library/${msg.jobId}/save`, { method: 'PATCH' });
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, saved: !m.saved } : m))
    );
    showToast(msg.saved ? 'Removed from saved.' : 'Saved to Library.');
  };

  const handleCycleTheme = async () => {
    const order: ThemePreference[] = ['dark', 'light', 'system'];
    const next = order[(order.indexOf(themePref) + 1) % order.length];
    setThemePref(next);
    if (currentUser) {
      const nextPrefs = { ...(currentUser.preferences || {}), theme: next };
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPrefs),
      });
      const data = await res.json();
      if (data.user) setCurrentUser(data.user);
    }
    showToast(`Theme: ${next}`);
  };

  const handleShareChat = async (chatId: string, title: string) => {
    const res = await fetch('/api/public-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, title }),
    });
    const data = await res.json();
    if (data.link) {
      setPublicLinks((prev) => [data.link, ...prev]);
      navigator.clipboard?.writeText(`${window.location.origin}/?share=${data.link.id}`);
      showToast('Public link created & copied to clipboard.');
    }
  };

  const activeModelLabel =
    selectedModel === 'auto'
      ? 'Auto Route'
      : models.find((m) => m.id === selectedModel)?.name || selectedModel;

  const initials = (currentUser?.name || 'MY')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-black myai-navy-backdrop text-white">
      {/* Announcement Banner */}
      {siteConfig.announcementBanner && (
        <div className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium text-center shrink-0">
          {siteConfig.announcementBanner}
        </div>
      )}

      {/* Top Navigation */}
      <header className="h-14 px-3 sm:px-5 border-b border-slate-800/90 flex items-center justify-between gap-2 shrink-0 backdrop-blur-md bg-[#050811]/95 z-30">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-200 hover:bg-slate-800/80 hover:text-white transition shrink-0"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <span className="text-base font-bold tracking-tight text-white shrink-0">
            {siteConfig.siteName || 'MY AI'}
          </span>

          {/* Model Selector Dropdown */}
          <div className="relative ml-1">
            <button
              type="button"
              onClick={() => setIsModelDropdownOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0B1020] border border-slate-700/80 text-xs font-semibold text-slate-100 hover:border-blue-500/60 transition max-w-[160px] sm:max-w-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="truncate">{activeModelLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {isModelDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsModelDropdownOpen(false)}
                />
                <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-[#0B1020] border border-slate-700/90 shadow-2xl p-1.5 z-50">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModel('auto');
                      setIsModelDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between text-xs ${
                      selectedModel === 'auto'
                        ? 'bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30'
                        : 'hover:bg-slate-800/80 text-slate-100'
                    }`}
                  >
                    <div>
                      <div>Auto (Smart Route)</div>
                      <div className="text-[11px] text-slate-400 font-normal">
                        Automatically selects chat, image, video, music & code models
                      </div>
                    </div>
                    {selectedModel === 'auto' && <Check className="w-4 h-4 shrink-0 text-blue-400" />}
                  </button>

                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(m.id);
                        setIsModelDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between text-xs ${
                        selectedModel === m.id
                          ? 'bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30'
                          : 'hover:bg-slate-800/80 text-slate-100'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate">{m.name}</div>
                        <div className="text-[11px] text-slate-400 font-normal truncate">
                          {m.description}
                        </div>
                      </div>
                      {selectedModel === m.id && <Check className="w-4 h-4 shrink-0 text-blue-400" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Controls: Theme Indicator + User Avatar */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCycleTheme}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-200 hover:bg-slate-800/80 transition"
            title="Dark Theme Active"
            aria-label="Theme"
          >
            {themePref === 'light' ? (
              <Sun className="w-5 h-5 text-blue-400" />
            ) : themePref === 'system' ? (
              <Monitor className="w-5 h-5 text-cyan-400" />
            ) : (
              <Moon className="w-5 h-5 text-blue-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsAccountOpen(true)}
            className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center border border-slate-700 hover:ring-2 hover:ring-blue-500/60 transition"
            aria-label="Open Account"
          >
            {currentUser?.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full gemini-gradient-bg text-white text-xs font-bold flex items-center justify-center">
                {initials}
              </div>
            )}
          </button>
        </div>
      </header>

      {/* Main Single-Screen Chat Stream + Docked Universal Composer */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-transparent">
        <ChatArea
          messages={messages}
          activeJobs={activeJobs}
          isGenerating={isGenerating}
          onAnimateImage={handleAnimateImage}
          onRegenerateImage={handleRegenerateImage}
          onCancelJob={handleCancelJob}
          onToggleSaveMessage={handleToggleSaveMessage}
          onOpenSettings={() => setSettingsState({ open: true, section: 'main' })}
        />

        <div className="shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent pt-1">
          <PromptBox
            onSend={handleSendMessage}
            isGenerating={isGenerating}
            activeJobId={activeJobIds[0] || null}
            onCancelActiveJob={
              activeJobIds[0] ? () => handleCancelJob(activeJobIds[0]) : undefined
            }
            composerTab={composerTab}
            onChangeComposerTab={setComposerTab}
            skillMode={skillMode}
            onChangeSkillMode={setSkillMode}
            notebooks={notebooks}
            userAvatar={currentUser?.avatar}
            defaultAspectRatio={currentUser?.preferences?.media?.defaultAspectRatio || '1:1'}
            onOpenVoiceModal={() => setIsVoiceOpen(true)}
            onOpenPersonalIntelligence={() =>
              setSettingsState({ open: true, section: 'personal_intelligence' })
            }
            attachments={composerAttachments}
            onChangeAttachments={setComposerAttachments}
            draftText={draftText}
            onDraftConsumed={() => setDraftText('')}
          />
        </div>
      </main>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-[#0B1020] border border-slate-700 text-white text-xs font-semibold shadow-2xl">
          {toastMsg}
        </div>
      )}

      {/* Navigation Drawer */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={(id) => setActiveChatId(id)}
        onNewChat={handleNewChat}
        onDeleteChat={async (id) => {
          await fetch(`/api/chats/${id}`, { method: 'DELETE' });
          setChats((prev) => prev.filter((c) => c.id !== id));
          if (activeChatId === id) {
            setActiveChatId(null);
            setMessages([]);
          }
        }}
        onRenameChat={async (id, newTitle) => {
          const res = await fetch(`/api/chats/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle }),
          });
          const data = await res.json();
          if (data.chat) {
            setChats((prev) => prev.map((c) => (c.id === id ? data.chat : c)));
          }
        }}
        onShareChat={handleShareChat}
        onOpenLibrary={(tab) => setLibraryState({ open: true, tab })}
        onOpenStudentsMode={() => {
          setComposerTab('chat');
          setSkillMode('guided_learning');
          showToast('Students / Guided Learning mode enabled.');
        }}
        onOpenCustomize={() =>
          setSettingsState({ open: true, section: 'personal_intelligence' })
        }
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenSettings={() => setSettingsState({ open: true, section: 'main' })}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onOpenSubscription={() => setIsSubscriptionOpen(true)}
        currentUser={currentUser}
      />

      {/* Voice Conversation Modal */}
      <VoiceConversationModal
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        onSendVoiceTurn={handleVoiceTurn}
        speechRate={currentUser?.preferences?.voice?.speechRate || 1.0}
      />

      {/* Library & Notebooks Modal */}
      <LibraryModal
        isOpen={libraryState.open}
        initialTab={libraryState.tab}
        onClose={() => setLibraryState((s) => ({ ...s, open: false }))}
        onOpenChat={(chatId) => setActiveChatId(chatId)}
        onAttachNotebookToChat={(nb) => {
          setComposerAttachments((prev) => [
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
          showToast(`Attached notebook "${nb.title}" to chat.`);
        }}
        onNotebooksChanged={setNotebooks}
        onCancelJob={handleCancelJob}
      />

      {/* Account Modal */}
      {currentUser && (
        <AccountModal
          isOpen={isAccountOpen}
          onClose={() => setIsAccountOpen(false)}
          currentUser={currentUser}
          availableUsers={availableUsers}
          onUserUpdated={setCurrentUser}
          onWorkspaceReload={loadWorkspace}
          onOpenSettings={() => setSettingsState({ open: true, section: 'main' })}
          onOpenSubscription={() => setIsSubscriptionOpen(true)}
        />
      )}

      {/* Settings Modal */}
      {currentUser && (
        <SettingsModal
          isOpen={settingsState.open}
          initialSection={settingsState.section}
          onClose={() => setSettingsState((s) => ({ ...s, open: false }))}
          currentUser={currentUser}
          publicLinks={publicLinks}
          onPreferencesSaved={(u) => {
            setCurrentUser(u);
            if (u.preferences?.theme) setThemePref(u.preferences.theme);
          }}
          onOpenAccount={() => setIsAccountOpen(true)}
          onOpenNotebooks={() => setLibraryState({ open: true, tab: 'notebooks' })}
          onDeleteAllChats={async () => {
            await fetch('/api/user/data/chats', { method: 'DELETE' });
            setChats([]);
            setActiveChatId(null);
            setMessages([]);
          }}
          onDeleteAllCreations={async () => {
            await fetch('/api/user/data/creations', { method: 'DELETE' });
          }}
          onDeletePublicLink={async (id) => {
            await fetch(`/api/public-links/${id}`, { method: 'DELETE' });
            setPublicLinks((prev) => prev.filter((l) => l.id !== id));
          }}
        />
      )}

      {/* Admin Panel Modal */}
      <AdminPanelModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        onConfigUpdated={loadWorkspace}
      />

      {/* Premium Subscription & Checkout Modal */}
      <SubscriptionModal
        isOpen={isSubscriptionOpen}
        onClose={() => setIsSubscriptionOpen(false)}
        currentUser={currentUser}
        onWorkspaceReload={loadWorkspace}
      />
    </div>
  );
}
