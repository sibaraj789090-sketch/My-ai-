import React, { useState, useEffect } from 'react';
import {
  X,
  BarChart3,
  Users,
  Cpu,
  Gauge,
  Activity,
  Globe,
  Shield,
  CheckCircle2,
  XCircle,
  Square,
  Database,
  Save,
  KeyRound,
  CreditCard,
} from 'lucide-react';
import { ApiManagementSection } from './ApiManagementSection';
import { SubscriptionManagementSection } from './SubscriptionManagementSection';
import {
  AIModelConfig,
  FeedbackEntry,
  GenerationJob,
  ProviderConfig,
  SystemStats,
  UserAccount,
} from '../types';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated: () => Promise<void>;
}

type AdminTab =
  | 'dashboard'
  | 'users'
  | 'models'
  | 'api_management'
  | 'subscription'
  | 'limits'
  | 'jobs'
  | 'website';

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  onConfigUpdated,
}) => {
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [models, setModels] = useState<AIModelConfig[]>([]);
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [supabaseStatus, setSupabaseStatus] = useState<{
    configured: boolean;
    connected: boolean;
    message: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState('');

  const [geminiTestResult, setGeminiTestResult] = useState<{
    configured: boolean;
    connected: boolean;
    model: string;
    latencyMs?: number;
    message: string;
  } | null>(null);
  const [testingGemini, setTestingGemini] = useState(false);

  // Write-only secret fields for optional separate media/Supabase providers
  const [customImageKey, setCustomImageKey] = useState('');
  const [customVideoKey, setCustomVideoKey] = useState('');
  const [customAudioKey, setCustomAudioKey] = useState('');
  const [supabaseServiceKey, setSupabaseServiceKey] = useState('');

  const loadAdminData = async () => {
    setErrorMsg('');
    try {
      const [statsRes, usersRes, cfgRes, jobsRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/users'),
        fetch('/api/admin/config'),
        fetch('/api/admin/jobs'),
      ]);

      if (statsRes.status === 403 || cfgRes.status === 403) {
        setErrorMsg('Administrator privileges required to view Admin Panel.');
        return;
      }

      const [statsData, usersData, cfgData, jobsData] = await Promise.all([
        statsRes.json(),
        usersRes.json(),
        cfgRes.json(),
        jobsRes.json(),
      ]);

      setStats(statsData.stats || null);
      setUsers(usersData.users || []);
      setConfig(cfgData.config || null);
      setModels(cfgData.models || []);
      setSupabaseStatus(cfgData.supabaseStatus || null);
      setJobs(jobsData.jobs || []);
      setFeedback(jobsData.feedback || []);
    } catch {
      setErrorMsg('Failed to load admin console.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAdminData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUpdateUser = async (userId: string, patch: Partial<UserAccount>) => {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.user) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
      setNotice('User account updated.');
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    const payloadConfig: Record<string, any> = { ...config };
    if (customImageKey.trim()) payloadConfig.customImageKey = customImageKey.trim();
    if (customVideoKey.trim()) payloadConfig.customVideoKey = customVideoKey.trim();
    if (customAudioKey.trim()) payloadConfig.customAudioKey = customAudioKey.trim();
    if (supabaseServiceKey.trim()) payloadConfig.supabaseServiceKey = supabaseServiceKey.trim();
    if (!payloadConfig.supabaseUrl?.trim()) delete payloadConfig.supabaseUrl;
    if (!payloadConfig.supabaseAnonKey?.trim()) delete payloadConfig.supabaseAnonKey;

    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': typeof window !== 'undefined' ? (localStorage.getItem('myai_active_user_id') || '') : '',
      },
      body: JSON.stringify({ config: payloadConfig, models }),
    });
    const data = await res.json();
    if (data.success) {
      setConfig(data.config);
      setModels(data.models);
      setCustomImageKey('');
      setCustomVideoKey('');
      setCustomAudioKey('');
      setSupabaseServiceKey('');
      setNotice('Admin configuration & model settings saved.');
      await onConfigUpdated();
    }
  };

  const handleTestGemini = async () => {
    setTestingGemini(true);
    try {
      const res = await fetch('/api/gemini/test', { method: 'POST' });
      const data = await res.json();
      setGeminiTestResult(data);
    } catch {
      setGeminiTestResult({
        configured: false,
        connected: false,
        model: 'gemini-3.1-flash-lite',
        message: 'Network error testing Gemini API.',
      });
    } finally {
      setTestingGemini(false);
    }
  };

  const handleTestSupabase = async () => {
    if (!config) return;
    const res = await fetch('/api/admin/test-supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supabaseUrl: config.supabaseUrl,
        supabaseKey: supabaseServiceKey || config.supabaseAnonKey,
      }),
    });
    const result = await res.json();
    setSupabaseStatus(result);
  };

  const handleCancelJob = async (jobId: string) => {
    await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
    loadAdminData();
  };

  const tabs: Array<{ id: AdminTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'models', label: 'Models & Providers', icon: Cpu },
    { id: 'api_management', label: 'API Management', icon: KeyRound },
    { id: 'subscription', label: 'Subscription Management', icon: CreditCard },
    { id: 'limits', label: 'Limits & Costs', icon: Gauge },
    { id: 'jobs', label: 'Jobs & Feedback', icon: Activity },
    { id: 'website', label: 'Website', icon: Globe },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
      <div className="w-full h-full sm:h-[90dvh] sm:max-w-5xl bg-[#070B14] sm:border border-slate-800 sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-[#050811] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                MY AI Admin Panel
              </h2>
              <p className="text-xs text-slate-300">
                Models, API providers, user RBAC, quotas, jobs & website controls
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close Admin Panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 py-2.5 border-b border-slate-800 bg-[#0B1020] flex items-center gap-1.5 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  tab === t.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#11192E] text-slate-200 border border-slate-700 hover:border-slate-500 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/40 text-sm text-red-200">
              {errorMsg}
            </div>
          )}
          {notice && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-medium text-emerald-300">
              {notice}
            </div>
          )}

          {!errorMsg && tab === 'dashboard' && stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { label: 'Total Users', value: stats.totalUsers },
                { label: 'Total Chats', value: stats.totalChats },
                { label: 'Images Generated', value: stats.imagesGenerated },
                { label: 'Videos Generated', value: stats.videosGenerated },
                { label: 'Audio Generated', value: stats.audioGenerated },
                { label: 'Tasks Completed', value: stats.tasksCompleted },
                { label: 'Estimated API Cost', value: `$${stats.estimatedCostUsd.toFixed(2)}` },
                { label: 'Uptime Hours', value: `${stats.uptimeHours}h` },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800"
                >
                  <div className="text-xs text-slate-300">{stat.label}</div>
                  <div className="mt-1 text-xl font-bold font-mono text-white">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!errorMsg && tab === 'users' && (
            <div className="space-y-3">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white">
                      {u.name} · <span className="font-mono text-xs text-slate-300">{u.email}</span>
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      Status: <span className={u.status === 'suspended' ? 'text-red-400 font-semibold' : 'text-emerald-400 font-semibold'}>{u.status}</span> · Images left: {u.generationLimits.imagesRemaining} · Videos left: {u.generationLimits.videosRemaining}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={u.role}
                      onChange={(e) =>
                        handleUpdateUser(u.id, { role: e.target.value as 'admin' | 'user' })
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>

                    <select
                      value={u.tier}
                      onChange={(e) =>
                        handleUpdateUser(u.id, {
                          tier: e.target.value as 'Free' | 'Pro' | 'Enterprise',
                        })
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                    >
                      <option value="Free">Free</option>
                      <option value="Pro">Pro</option>
                      <option value="Enterprise">Enterprise</option>
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateUser(u.id, {
                          generationLimits: {
                            ...u.generationLimits,
                            imagesRemaining: u.generationLimits.imagesRemaining + 50,
                          },
                        })
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-semibold"
                    >
                      +50 Images
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateUser(u.id, {
                          generationLimits: {
                            ...u.generationLimits,
                            videosRemaining: u.generationLimits.videosRemaining + 20,
                          },
                        })
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs font-semibold"
                    >
                      +20 Videos
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateUser(u.id, {
                          status: u.status === 'active' ? 'suspended' : 'active',
                        })
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                        u.status === 'active'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {u.status === 'active' ? 'Block' : 'Unblock'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!errorMsg && tab === 'models' && config && (
            <div className="space-y-6">
              {/* Models List */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  AI Models
                </h3>
                {models.map((m) => (
                  <label
                    key={m.id}
                    className="p-3.5 rounded-2xl bg-[#0B1020] border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">
                        {m.name} <span className="font-mono text-xs text-slate-300">({m.id})</span>
                      </div>
                      <div className="text-xs text-slate-300">
                        {m.provider} · {m.description}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={m.enabled}
                      onChange={(e) =>
                        setModels((prev) =>
                          prev.map((item) =>
                            item.id === m.id ? { ...item, enabled: e.target.checked } : item
                          )
                        )
                      }
                      className="w-4 h-4 accent-blue-500 shrink-0"
                    />
                  </label>
                ))}
              </div>

              {/* Gemini Server Secret Connection Status (Read-Only) */}
              <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Google Gemini API (Server Environment Secret)
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Uses <span className="font-mono text-blue-300">GEMINI_API_KEY</span> from Settings &gt; Secrets · Default model: <span className="font-mono text-blue-300">gemini-3.1-flash-lite</span> (Free Tier)
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={testingGemini}
                    onClick={handleTestGemini}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shrink-0"
                  >
                    {testingGemini ? 'Testing...' : 'Test Gemini Connection'}
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {config.hasGeminiKey ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span className="text-slate-200">
                    {config.hasGeminiKey
                      ? 'GEMINI_API_KEY is configured on the server.'
                      : 'GEMINI_API_KEY is not set in server environment Secrets.'}
                  </span>
                </div>

                {geminiTestResult && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      geminiTestResult.connected
                        ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                        : 'bg-red-500/15 border border-red-500/40 text-red-300'
                    }`}
                  >
                    {geminiTestResult.connected ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{geminiTestResult.message}</span>
                  </div>
                )}
              </div>

              {/* Separate Custom Media Providers */}
              <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-white">
                  Optional Separate Image / Video / Audio Providers
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-medium text-slate-300 mb-1">
                      Custom Image API Endpoint
                    </label>
                    <input
                      type="text"
                      value={config.customImageEndpoint}
                      onChange={(e) =>
                        setConfig({ ...config, customImageEndpoint: e.target.value })
                      }
                      placeholder="https://api.example.com/v1/images"
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300 mb-1">
                      Custom Image Key ({config.hasCustomImageKey ? 'Configured' : 'Not set'})
                    </label>
                    <input
                      type="password"
                      value={customImageKey}
                      onChange={(e) => setCustomImageKey(e.target.value)}
                      placeholder="Bearer key"
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300 mb-1">
                      Custom Video API Endpoint
                    </label>
                    <input
                      type="text"
                      value={config.customVideoEndpoint}
                      onChange={(e) =>
                        setConfig({ ...config, customVideoEndpoint: e.target.value })
                      }
                      placeholder="https://api.example.com/v1/videos"
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300 mb-1">
                      Custom Video Key ({config.hasCustomVideoKey ? 'Configured' : 'Not set'})
                    </label>
                    <input
                      type="password"
                      value={customVideoKey}
                      onChange={(e) => setCustomVideoKey(e.target.value)}
                      placeholder="Bearer key"
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300 mb-1">
                      Custom Audio API Endpoint
                    </label>
                    <input
                      type="text"
                      value={config.customAudioEndpoint}
                      onChange={(e) =>
                        setConfig({ ...config, customAudioEndpoint: e.target.value })
                      }
                      placeholder="https://api.example.com/v1/audio"
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-300 mb-1">
                      Custom Audio Key ({config.hasCustomAudioKey ? 'Configured' : 'Not set'})
                    </label>
                    <input
                      type="password"
                      value={customAudioKey}
                      onChange={(e) => setCustomAudioKey(e.target.value)}
                      placeholder="Bearer key"
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* Supabase Integration */}
              <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span>Supabase Backend Integration</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestSupabase}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                  >
                    Test Connection
                  </button>
                </div>

                {supabaseStatus && (
                  <div className="flex items-center gap-2 text-xs text-slate-200">
                    {supabaseStatus.connected ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <span>{supabaseStatus.message}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <input
                    type="text"
                    value={config.supabaseUrl}
                    onChange={(e) => setConfig({ ...config, supabaseUrl: e.target.value })}
                    placeholder="SUPABASE_URL"
                    className="px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400"
                  />
                  <input
                    type="text"
                    value={config.supabaseAnonKey}
                    onChange={(e) => setConfig({ ...config, supabaseAnonKey: e.target.value })}
                    placeholder="SUPABASE_ANON_KEY"
                    className="px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400"
                  />
                  <input
                    type="password"
                    value={supabaseServiceKey}
                    onChange={(e) => setSupabaseServiceKey(e.target.value)}
                    placeholder={
                      config.hasSupabaseServiceKey ? 'Service Key (Configured)' : 'SUPABASE_SERVICE_ROLE_KEY'
                    }
                    className="px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveConfig}
                className="px-5 py-2.5 rounded-xl gemini-gradient-bg text-white text-xs font-semibold flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Save Models & Providers</span>
              </button>
            </div>
          )}

          {!errorMsg && tab === 'api_management' && (
            <ApiManagementSection
              onConfigUpdated={onConfigUpdated}
              onNotice={(msg) => setNotice(msg)}
            />
          )}

          {!errorMsg && tab === 'subscription' && (
            <SubscriptionManagementSection
              onConfigUpdated={onConfigUpdated}
              onNotice={(msg) => setNotice(msg)}
            />
          )}

          {!errorMsg && tab === 'limits' && config && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2">
                  <div className="font-bold text-white">Free Daily Images</div>
                  <input
                    type="number"
                    value={config.freeTierDailyImageLimit}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        freeTierDailyImageLimit: parseInt(e.target.value || '0', 10),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white"
                  />
                </div>
                <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2">
                  <div className="font-bold text-white">Free Daily Videos</div>
                  <input
                    type="number"
                    value={config.freeTierDailyVideoLimit}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        freeTierDailyVideoLimit: parseInt(e.target.value || '0', 10),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white"
                  />
                </div>
                <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2">
                  <div className="font-bold text-white">Free Daily Audio</div>
                  <input
                    type="number"
                    value={config.freeTierDailyAudioLimit}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        freeTierDailyAudioLimit: parseInt(e.target.value || '0', 10),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white"
                  />
                </div>
                <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2">
                  <div className="font-bold text-white">Pro Daily Images</div>
                  <input
                    type="number"
                    value={config.proTierDailyImageLimit}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        proTierDailyImageLimit: parseInt(e.target.value || '0', 10),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white"
                  />
                </div>
                <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2">
                  <div className="font-bold text-white">Pro Daily Videos</div>
                  <input
                    type="number"
                    value={config.proTierDailyVideoLimit}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        proTierDailyVideoLimit: parseInt(e.target.value || '0', 10),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white"
                  />
                </div>
                <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2">
                  <div className="font-bold text-white">Pro Daily Audio</div>
                  <input
                    type="number"
                    value={config.proTierDailyAudioLimit}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        proTierDailyAudioLimit: parseInt(e.target.value || '0', 10),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
              >
                Save Limits
              </button>
            </div>
          )}

          {!errorMsg && tab === 'jobs' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                  Generation Jobs ({jobs.length})
                </h3>
                <div className="space-y-2">
                  {jobs.length === 0 ? (
                    <div className="text-xs text-slate-300">No generation jobs recorded yet.</div>
                  ) : (
                    jobs.map((j) => (
                      <div
                        key={j.id}
                        className="p-3.5 rounded-2xl bg-[#0B1020] border border-slate-800 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            [{j.type.toUpperCase()}] {j.prompt}
                          </div>
                          <div className="text-slate-300 font-mono mt-0.5">
                            {j.userEmail} · {j.model} · {j.status} · {j.durationSeconds.toFixed(1)}s
                          </div>
                        </div>
                        {(j.status === 'queued' || j.status === 'processing') && (
                          <button
                            type="button"
                            onClick={() => handleCancelJob(j.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 font-semibold shrink-0"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            <span>Cancel</span>
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                  User Feedback & Reports ({feedback.length})
                </h3>
                <div className="space-y-2">
                  {feedback.length === 0 ? (
                    <div className="text-xs text-slate-300">No feedback or reports submitted yet.</div>
                  ) : (
                    feedback.map((fb) => (
                      <div
                        key={fb.id}
                        className="p-3.5 rounded-2xl bg-[#0B1020] border border-slate-800 text-xs space-y-1"
                      >
                        <div className="font-bold text-white">
                          [{fb.category.toUpperCase()}] {fb.subject}
                        </div>
                        <div className="text-slate-200">{fb.message}</div>
                        <div className="text-slate-400 font-mono">
                          {fb.userEmail} · {new Date(fb.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {!errorMsg && tab === 'website' && config && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Site Name
                </label>
                <input
                  type="text"
                  value={config.siteName}
                  onChange={(e) => setConfig({ ...config, siteName: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B1020] border border-slate-700 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Announcement Banner (Optional)
                </label>
                <input
                  type="text"
                  value={config.announcementBanner}
                  onChange={(e) => setConfig({ ...config, announcementBanner: e.target.value })}
                  placeholder="Displayed across top of MY AI chat..."
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B1020] border border-slate-700 text-sm text-white placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Safety Level
                </label>
                <select
                  value={config.safetyLevel}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      safetyLevel: e.target.value as 'standard' | 'strict' | 'relaxed',
                    })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B1020] border border-slate-700 text-sm text-white"
                >
                  <option value="standard">Standard</option>
                  <option value="strict">Strict</option>
                  <option value="relaxed">Relaxed</option>
                </select>
              </div>

              <label className="flex items-center justify-between p-4 rounded-2xl bg-[#0B1020] border border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Maintenance Mode
                  </div>
                  <div className="text-xs text-slate-300">
                    Temporarily block non-admin chats while updating
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.maintenanceMode}
                  onChange={(e) => setConfig({ ...config, maintenanceMode: e.target.checked })}
                  className="w-4 h-4 accent-blue-500"
                />
              </label>

              <button
                type="button"
                onClick={handleSaveConfig}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
              >
                Save Website Settings
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
