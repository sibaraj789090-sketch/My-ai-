import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  Gauge,
  Bell,
  Brain,
  Camera,
  ListChecks,
  SunMoon,
  Sparkles,
  Volume2,
  Film,
  Mic,
  BookOpen,
  DownloadCloud,
  Mail,
  Activity,
  Link2,
  Shield,
  Trash2,
  HelpCircle,
  Bug,
  Info,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import {
  PublicLinkItem,
  ThemePreference,
  UserAccount,
  UserPreferences,
} from '../types';

export type SettingsSectionKey =
  | 'main'
  | 'personal_intelligence'
  | 'theme'
  | 'voice'
  | 'media'
  | 'skills'
  | 'tasks'
  | 'device'
  | 'privacy'
  | 'report';

interface SettingsModalProps {
  isOpen: boolean;
  initialSection?: SettingsSectionKey;
  onClose: () => void;
  currentUser: UserAccount;
  publicLinks: PublicLinkItem[];
  onPreferencesSaved: (user: UserAccount) => void;
  onOpenAccount: () => void;
  onOpenNotebooks: () => void;
  onDeleteAllChats: () => Promise<void>;
  onDeleteAllCreations: () => Promise<void>;
  onDeletePublicLink: (id: string) => Promise<void>;
}

const DEFAULT_PREFS: UserPreferences = {
  theme: 'dark',
  notifications: true,
  personalIntelligenceEnabled: true,
  customInstructions: '',
  importedMemory: '',
  taskDepth: 'standard',
  autoPollTasks: true,
  skills: {
    imageGen: true,
    videoGen: true,
    musicGen: true,
    coding: true,
    guidedLearning: true,
    canvas: true,
  },
  voice: {
    voiceName: 'Default System Voice',
    speechRate: 1.0,
    autoSpeakReplies: false,
  },
  media: {
    defaultAspectRatio: '1:1',
    defaultVideoResolution: '720p',
    autoplayVideo: false,
  },
  contactEmail: '',
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  initialSection = 'main',
  onClose,
  currentUser,
  publicLinks,
  onPreferencesSaved,
  onOpenAccount,
  onOpenNotebooks,
  onDeleteAllChats,
  onDeleteAllCreations,
  onDeletePublicLink,
}) => {
  const [section, setSection] = useState<SettingsSectionKey>(initialSection);
  const [prefs, setPrefs] = useState<UserPreferences>({
    ...DEFAULT_PREFS,
    ...(currentUser.preferences || {}),
  });
  const [saving, setSaving] = useState(false);
  const [bannerMsg, setBannerMsg] = useState('');
  const [micStatus, setMicStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [camStatus, setCamStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [bugSubject, setBugSubject] = useState('');
  const [bugDesc, setBugDesc] = useState('');
  const [confirmClearChats, setConfirmClearChats] = useState(false);
  const [confirmClearCreations, setConfirmClearCreations] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<{
    configured: boolean;
    connected?: boolean;
    defaultModel?: string;
    message?: string;
  } | null>(null);
  const [geminiDiagnosis, setGeminiDiagnosis] = useState<{
    keySource: string;
    textTest?: { connected: boolean; model: string; message: string };
    imageTests?: Array<{ model: string; ok: boolean; httpStatus?: number; googleStatus?: string; reason?: string; rawError?: string }>;
  } | null>(null);
  const [testingGemini, setTestingGemini] = useState(false);
  const [diagnosingGemini, setDiagnosingGemini] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSection(initialSection);
      setPrefs({
        ...DEFAULT_PREFS,
        ...(currentUser.preferences || {}),
        contactEmail: currentUser.preferences?.contactEmail || currentUser.email,
      });
      setBannerMsg('');
      fetch('/api/gemini/status')
        .then((r) => r.json())
        .then((d) => setGeminiStatus(d))
        .catch(() => {});
    }
  }, [isOpen, initialSection, currentUser]);

  if (!isOpen) return null;

  const persistPrefs = async (next: UserPreferences, notice = 'Preferences saved.') => {
    setPrefs(next);
    setSaving(true);
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (data.user) {
        onPreferencesSaved(data.user);
        setBannerMsg(notice);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = (theme: ThemePreference) => {
    persistPrefs({ ...prefs, theme }, `Theme set to ${theme}.`);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: ev.target?.result }),
      });
      const data = await res.json();
      if (data.user) {
        onPreferencesSaved(data.user);
        setBannerMsg('Avatar photo updated.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const testDevicePermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus('granted');
    } catch {
      setMicStatus('denied');
    }
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      camStream.getTracks().forEach((t) => t.stop());
      setCamStatus('granted');
    } catch {
      setCamStatus('denied');
    }
  };

  const submitBugReport = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'bug',
        subject: bugSubject || 'Problem Report',
        message: bugDesc,
      }),
    });
    if (res.ok) {
      setBugSubject('');
      setBugDesc('');
      setBannerMsg('Problem report submitted. Thank you!');
      setSection('main');
    }
  };

  const limits = currentUser.generationLimits;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
      <div className="w-full h-full sm:h-[88dvh] sm:max-w-2xl bg-[#070B14] sm:border border-slate-800 sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-[#050811]">
          <div className="flex items-center gap-2">
            {section !== 'main' && (
              <button
                type="button"
                onClick={() => setSection('main')}
                className="text-xs font-semibold text-blue-400 hover:underline mr-1"
              >
                ← Settings
              </button>
            )}
            <h2 className="text-base sm:text-lg font-bold text-white">
              {section === 'main'
                ? 'Settings'
                : section === 'personal_intelligence'
                ? 'Personal Intelligence'
                : section === 'theme'
                ? 'Appearance & Theme'
                : section === 'voice'
                ? 'Voice Settings'
                : section === 'media'
                ? 'Media Preferences'
                : section === 'skills'
                ? 'AI Skills'
                : section === 'tasks'
                ? 'Task Settings'
                : section === 'device'
                ? 'Device Controls'
                : section === 'privacy'
                ? 'Data & Privacy'
                : 'Report a Problem'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-blue-400">Saving...</span>}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition"
              aria-label="Close Settings"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {bannerMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-medium text-emerald-300">
              {bannerMsg}
            </div>
          )}

          {section === 'main' && (
            <>
              {/* ACCOUNT */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
                  ACCOUNT
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#0B1020] divide-y divide-slate-800/90 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAccount();
                    }}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#11192E] transition"
                  >
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4 text-blue-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Manage Account
                        </div>
                        <div className="text-xs text-slate-300">
                          {currentUser.name} · {currentUser.email}
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className="px-4 py-3.5 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <Gauge className="w-4 h-4 text-blue-400" />
                      <div className="text-sm font-semibold text-white">
                        Usage Limits ({currentUser.tier})
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-[#11192E] border border-slate-800">
                        <div className="text-slate-300">Images</div>
                        <div className="font-mono font-bold text-white mt-0.5">
                          {limits.imagesRemaining} / {limits.totalImagesQuota}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#11192E] border border-slate-800">
                        <div className="text-slate-300">Videos</div>
                        <div className="font-mono font-bold text-white mt-0.5">
                          {limits.videosRemaining} / {limits.totalVideosQuota}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#11192E] border border-slate-800">
                        <div className="text-slate-300">Audio</div>
                        <div className="font-mono font-bold text-white mt-0.5">
                          {limits.audioRemaining ?? 0} / {limits.totalAudioQuota ?? 5}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* PREFERENCES */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
                  PREFERENCES
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#0B1020] divide-y divide-slate-800/90 overflow-hidden">
                  {/* Notifications */}
                  <div className="px-4 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bell className="w-4 h-4 text-blue-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Notifications
                        </div>
                        <div className="text-xs text-slate-300">
                          Task & background video completion alerts
                        </div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={prefs.notifications}
                      onChange={(e) =>
                        persistPrefs({ ...prefs, notifications: e.target.checked })
                      }
                      className="w-4 h-4 accent-blue-500"
                    />
                  </div>

                  {/* Personal Intelligence */}
                  <button
                    type="button"
                    onClick={() => setSection('personal_intelligence')}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#11192E] transition"
                  >
                    <div className="flex items-center gap-3">
                      <Brain className="w-4 h-4 text-purple-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Personal Intelligence
                        </div>
                        <div className="text-xs text-slate-300">
                          {prefs.personalIntelligenceEnabled ? 'Enabled' : 'Disabled'} · Custom instructions
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-slate-300">›</span>
                  </button>

                  {/* Avatar */}
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#11192E] transition"
                  >
                    <div className="flex items-center gap-3">
                      <Camera className="w-4 h-4 text-indigo-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Avatar
                        </div>
                        <div className="text-xs text-slate-300">
                          Upload custom profile avatar photo
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-blue-400 font-semibold">Upload</span>
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />

                  {/* Task Settings */}
                  <button
                    type="button"
                    onClick={() => setSection('tasks')}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#11192E] transition"
                  >
                    <div className="flex items-center gap-3">
                      <ListChecks className="w-4 h-4 text-emerald-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Task Settings
                        </div>
                        <div className="text-xs text-slate-300 capitalize">
                          Depth: {prefs.taskDepth} · Live polling {prefs.autoPollTasks ? 'On' : 'Off'}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-slate-300">›</span>
                  </button>

                  {/* Theme: System, Light, Dark */}
                  <div className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <SunMoon className="w-4 h-4 text-amber-400" />
                      <div className="text-sm font-semibold text-white">
                        Theme
                      </div>
                    </div>
                    <div className="flex items-center gap-1 bg-[#050811] border border-slate-800 p-1 rounded-xl">
                      {(['system', 'light', 'dark'] as ThemePreference[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => handleThemeChange(t)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                            prefs.theme === t
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Skills */}
                  <button
                    type="button"
                    onClick={() => setSection('skills')}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#11192E] transition"
                  >
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-4 h-4 text-blue-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Skills
                        </div>
                        <div className="text-xs text-slate-300">
                          Manage image, video, music, coding, learning & canvas skills
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-slate-300">›</span>
                  </button>

                  {/* Voice */}
                  <button
                    type="button"
                    onClick={() => setSection('voice')}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#11192E] transition"
                  >
                    <div className="flex items-center gap-3">
                      <Volume2 className="w-4 h-4 text-cyan-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Voice
                        </div>
                        <div className="text-xs text-slate-300">
                          Speech rate {prefs.voice.speechRate}x · {prefs.voice.voiceName}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-slate-300">›</span>
                  </button>

                  {/* Media */}
                  <button
                    type="button"
                    onClick={() => setSection('media')}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#11192E] transition"
                  >
                    <div className="flex items-center gap-3">
                      <Film className="w-4 h-4 text-purple-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Media
                        </div>
                        <div className="text-xs text-slate-300">
                          Aspect {prefs.media.defaultAspectRatio} · Video {prefs.media.defaultVideoResolution}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-slate-300">›</span>
                  </button>

                  {/* Device Controls */}
                  <button
                    type="button"
                    onClick={() => setSection('device')}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#11192E] transition"
                  >
                    <div className="flex items-center gap-3">
                      <Mic className="w-4 h-4 text-emerald-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Device Controls
                        </div>
                        <div className="text-xs text-slate-300">
                          Microphone & camera permissions
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-slate-300">›</span>
                  </button>

                  {/* Notebooks */}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenNotebooks();
                    }}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#11192E] transition"
                  >
                    <div className="flex items-center gap-3">
                      <BookOpen className="w-4 h-4 text-purple-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Notebooks
                        </div>
                        <div className="text-xs text-slate-300">
                          Manage saved reference notebooks
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-slate-300">›</span>
                  </button>
                </div>
              </div>

              {/* DATA AND PRIVACY */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
                  DATA AND PRIVACY
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#0B1020] divide-y divide-slate-800/90 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSection('privacy')}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#11192E] transition"
                  >
                    <div className="flex items-center gap-3">
                      <DownloadCloud className="w-4 h-4 text-blue-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Import Memory
                        </div>
                        <div className="text-xs text-slate-300">
                          Paste background context or memory notes
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-slate-300">›</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSection('privacy')}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#11192E] transition"
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-cyan-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Contact Information
                        </div>
                        <div className="text-xs text-slate-300">
                          {prefs.contactEmail || currentUser.email}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-slate-300">›</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSection('privacy')}
                    className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#11192E] transition"
                  >
                    <div className="flex items-center gap-3">
                      <Activity className="w-4 h-4 text-emerald-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          AI Activity & Public Links
                        </div>
                        <div className="text-xs text-slate-300">
                          {publicLinks.length} active shared link(s) · Data deletion controls
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-slate-300">›</span>
                  </button>
                </div>
              </div>

              {/* GET SUPPORT */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
                  GET SUPPORT
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#0B1020] divide-y divide-slate-800/90 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAccount();
                    }}
                    className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-[#11192E] transition"
                  >
                    <HelpCircle className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-semibold text-white">Help</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSection('report')}
                    className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-[#11192E] transition"
                  >
                    <Bug className="w-4 h-4 text-red-400" />
                    <span className="text-sm font-semibold text-white">
                      Report a Problem
                    </span>
                  </button>
                  <div className="px-4 py-3.5 flex items-center justify-between text-xs text-slate-300">
                    <div className="flex items-center gap-3">
                      <Info className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-white">About MY AI</span>
                    </div>
                    <span>v2.5 Universal</span>
                  </div>
                  <div className="px-4 py-3.5 space-y-3 text-xs text-slate-300">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <RefreshCw className={`w-4 h-4 ${geminiStatus?.configured ? 'text-emerald-400' : 'text-amber-400'}`} />
                        <div>
                          <div className="font-semibold text-white">
                            Gemini API Connection
                          </div>
                          <div className="text-[11px] text-slate-300">
                            {geminiStatus?.message ||
                              (geminiStatus?.configured
                                ? `Active (${geminiStatus.defaultModel || 'gemini-3.1-flash-lite'}) via GEMINI_API_KEY`
                                : 'Checking server environment configuration...')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={diagnosingGemini}
                          onClick={async () => {
                            setDiagnosingGemini(true);
                            try {
                              const res = await fetch('/api/gemini/diagnose');
                              const data = await res.json();
                              setGeminiDiagnosis(data);
                            } finally {
                              setDiagnosingGemini(false);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#11192E] hover:bg-[#17213B] border border-slate-700 disabled:opacity-50 text-slate-100 font-semibold"
                        >
                          {diagnosingGemini ? 'Checking...' : 'Check Models'}
                        </button>
                        <button
                          type="button"
                          disabled={testingGemini}
                          onClick={async () => {
                            setTestingGemini(true);
                            try {
                              const res = await fetch('/api/gemini/test', { method: 'POST' });
                              const data = await res.json();
                              setGeminiStatus(data);
                            } finally {
                              setTestingGemini(false);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold"
                        >
                          {testingGemini ? 'Testing...' : 'Test Connection'}
                        </button>
                      </div>
                    </div>

                    {geminiDiagnosis && (
                      <div className="p-3 rounded-xl bg-[#070B14] border border-slate-800 space-y-2 text-[11px]">
                        <div className="flex items-center justify-between text-slate-300">
                          <span>Key Source: <strong className="text-white uppercase">{geminiDiagnosis.keySource}</strong></span>
                          <span className={geminiDiagnosis.textTest?.connected ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                            Text Chat: {geminiDiagnosis.textTest?.connected ? `OK (${geminiDiagnosis.textTest.model})` : 'Failed'}
                          </span>
                        </div>
                        {geminiDiagnosis.imageTests?.map((t) => (
                          <div key={t.model} className="pt-1.5 border-t border-slate-800 space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-white">{t.model}</span>
                              <span className={t.ok ? 'text-emerald-400 font-semibold' : 'text-amber-300 font-semibold'}>
                                {t.ok
                                  ? 'Available'
                                  : `HTTP ${t.httpStatus || '?'} · ${t.reason || t.googleStatus || 'Denied'}`}
                              </span>
                            </div>
                            {!t.ok && t.rawError && (
                              <div className="text-slate-400 break-words line-clamp-2">{t.rawError}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {section === 'personal_intelligence' && (
            <div className="space-y-4">
              <label className="flex items-center justify-between p-4 rounded-2xl bg-[#0B1020] border border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Enable Personal Intelligence
                  </div>
                  <div className="text-xs text-slate-300">
                    Include your custom instructions & memory across chats
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.personalIntelligenceEnabled}
                  onChange={(e) =>
                    setPrefs({ ...prefs, personalIntelligenceEnabled: e.target.checked })
                  }
                  className="w-4 h-4 accent-blue-500"
                />
              </label>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Custom Instructions
                </label>
                <textarea
                  rows={5}
                  value={prefs.customInstructions}
                  onChange={(e) => setPrefs({ ...prefs, customInstructions: e.target.value })}
                  placeholder="Tell MY AI how you prefer responses (e.g., concise code examples, TypeScript by default, step-by-step explanations)..."
                  className="w-full p-3.5 rounded-2xl bg-[#0B1020] border border-slate-700 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="button"
                onClick={() => persistPrefs(prefs, 'Personal Intelligence updated.')}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
              >
                Save Instructions
              </button>
            </div>
          )}

          {section === 'tasks' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2">
                <div className="text-sm font-semibold text-white">Task Execution Depth</div>
                <div className="flex gap-2">
                  {(['concise', 'standard', 'deep'] as const).map((depth) => (
                    <button
                      key={depth}
                      type="button"
                      onClick={() => persistPrefs({ ...prefs, taskDepth: depth })}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold capitalize ${
                        prefs.taskDepth === depth
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#11192E] text-slate-200 border border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      {depth}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between p-4 rounded-2xl bg-[#0B1020] border border-slate-800">
                <span className="text-sm font-semibold text-white">
                  Auto-poll live background task steps
                </span>
                <input
                  type="checkbox"
                  checked={prefs.autoPollTasks}
                  onChange={(e) => persistPrefs({ ...prefs, autoPollTasks: e.target.checked })}
                  className="w-4 h-4 accent-blue-500"
                />
              </label>
            </div>
          )}

          {section === 'skills' && (
            <div className="space-y-2.5">
              {(
                [
                  { key: 'imageGen', label: 'Image Generation & Editing' },
                  { key: 'videoGen', label: 'Video & Photo-to-Video Generation' },
                  { key: 'musicGen', label: 'Music & Audio Generation' },
                  { key: 'coding', label: 'Programming & Debugging' },
                  { key: 'guidedLearning', label: 'Guided Learning Tutor' },
                  { key: 'canvas', label: 'Canvas Workspace (Docs, Code, Slides)' },
                ] as const
              ).map((item) => (
                <label
                  key={item.key}
                  className="flex items-center justify-between p-4 rounded-2xl bg-[#0B1020] border border-slate-800"
                >
                  <span className="text-sm font-medium text-white">
                    {item.label}
                  </span>
                  <input
                    type="checkbox"
                    checked={prefs.skills[item.key]}
                    onChange={(e) =>
                      persistPrefs({
                        ...prefs,
                        skills: { ...prefs.skills, [item.key]: e.target.checked },
                      })
                    }
                    className="w-4 h-4 accent-blue-500"
                  />
                </label>
              ))}
            </div>
          )}

          {section === 'voice' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2">
                <div className="text-sm font-semibold text-white">
                  Speech Rate ({prefs.voice.speechRate.toFixed(1)}x)
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.5"
                  step="0.1"
                  value={prefs.voice.speechRate}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      voice: { ...prefs.voice, speechRate: parseFloat(e.target.value) },
                    })
                  }
                  onMouseUp={() => persistPrefs(prefs, 'Voice rate updated.')}
                  onTouchEnd={() => persistPrefs(prefs, 'Voice rate updated.')}
                  className="w-full accent-blue-500"
                />
              </div>

              <label className="flex items-center justify-between p-4 rounded-2xl bg-[#0B1020] border border-slate-800">
                <span className="text-sm font-medium text-white">
                  Auto-speak voice conversation replies
                </span>
                <input
                  type="checkbox"
                  checked={prefs.voice.autoSpeakReplies}
                  onChange={(e) =>
                    persistPrefs({
                      ...prefs,
                      voice: { ...prefs.voice, autoSpeakReplies: e.target.checked },
                    })
                  }
                  className="w-4 h-4 accent-blue-500"
                />
              </label>
            </div>
          )}

          {section === 'media' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2">
                <div className="text-sm font-semibold text-white">
                  Default Image Aspect Ratio
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['1:1', '16:9', '9:16', '4:3', '3:4'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() =>
                        persistPrefs({ ...prefs, media: { ...prefs.media, defaultAspectRatio: ratio } })
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold ${
                        prefs.media.defaultAspectRatio === ratio
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#11192E] border border-slate-700 text-slate-200 hover:border-slate-500'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2">
                <div className="text-sm font-semibold text-white">
                  Default Video Resolution
                </div>
                <div className="flex gap-2">
                  {(['720p', '1080p', '4k'] as const).map((res) => (
                    <button
                      key={res}
                      type="button"
                      onClick={() =>
                        persistPrefs({
                          ...prefs,
                          media: { ...prefs.media, defaultVideoResolution: res },
                        })
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold ${
                        prefs.media.defaultVideoResolution === res
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#11192E] border border-slate-700 text-slate-200 hover:border-slate-500'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'device' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-3">
                <div className="text-sm font-semibold text-white">
                  Browser Microphone & Camera Permissions
                </div>
                <div className="text-xs text-slate-300 space-y-1">
                  <div>Microphone: <span className="font-mono text-white">{micStatus}</span></div>
                  <div>Camera: <span className="font-mono text-white">{camStatus}</span></div>
                </div>
                <button
                  type="button"
                  onClick={testDevicePermissions}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  Check Device Access
                </button>
              </div>
            </div>
          )}

          {section === 'privacy' && (
            <div className="space-y-5">
              {/* Import Memory */}
              <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2.5">
                <div className="text-sm font-bold text-white">Import Memory</div>
                <textarea
                  rows={4}
                  value={prefs.importedMemory}
                  onChange={(e) => setPrefs({ ...prefs, importedMemory: e.target.value })}
                  placeholder="Paste imported personal facts, project background, or notes..."
                  className="w-full p-3 rounded-xl bg-[#11192E] border border-slate-700 text-xs sm:text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    type="email"
                    value={prefs.contactEmail}
                    onChange={(e) => setPrefs({ ...prefs, contactEmail: e.target.value })}
                    placeholder="Contact Email"
                    className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => persistPrefs(prefs, 'Memory & contact info saved.')}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                  >
                    Save Memory & Contact
                  </button>
                </div>
              </div>

              {/* Public Links */}
              <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2.5">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-blue-400" />
                  <span>Public Links ({publicLinks.length})</span>
                </div>
                {publicLinks.length === 0 ? (
                  <p className="text-xs text-slate-300">
                    No shared chat links yet. Use the Share icon on any chat in the sidebar.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {publicLinks.map((lnk) => (
                      <div
                        key={lnk.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#11192E] border border-slate-700 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            {lnk.title}
                          </div>
                          <div className="text-slate-300 font-mono truncate">?share={lnk.id}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/?share=${lnk.id}`);
                              setCopiedLinkId(lnk.id);
                              setTimeout(() => setCopiedLinkId(null), 1500);
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300"
                          >
                            {copiedLinkId === lnk.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-slate-300" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeletePublicLink(lnk.id)}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Privacy Help Hub + Deletion */}
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-red-300">
                  <Shield className="w-4 h-4" />
                  <span>Data Deletion Controls</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!confirmClearChats ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClearChats(true)}
                      className="px-3.5 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-200 text-xs font-semibold"
                    >
                      Delete All Chats
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await onDeleteAllChats();
                        setConfirmClearChats(false);
                        setBannerMsg('All conversations deleted.');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold"
                    >
                      Confirm Delete All Chats
                    </button>
                  )}

                  {!confirmClearCreations ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClearCreations(true)}
                      className="px-3.5 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-200 text-xs font-semibold"
                    >
                      Clear Saved Creations
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await onDeleteAllCreations();
                        setConfirmClearCreations(false);
                        setBannerMsg('Saved media creations cleared.');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold"
                    >
                      Confirm Clear Creations
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {section === 'report' && (
            <form onSubmit={submitBugReport} className="space-y-3">
              <input
                type="text"
                value={bugSubject}
                onChange={(e) => setBugSubject(e.target.value)}
                placeholder="Issue summary"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1020] border border-slate-700 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
              />
              <textarea
                rows={5}
                required
                value={bugDesc}
                onChange={(e) => setBugDesc(e.target.value)}
                placeholder="Describe what happened..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1020] border border-slate-700 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold"
              >
                Submit Problem Report
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
