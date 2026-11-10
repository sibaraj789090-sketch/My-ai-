import React, { useState, useRef } from 'react';
import {
  X,
  UserCheck,
  CreditCard,
  Sparkles,
  Settings,
  MessageSquarePlus,
  HelpCircle,
  ShieldCheck,
  FileText,
  Camera,
  Check,
  LogIn,
  UserPlus,
  Users,
} from 'lucide-react';
import { UserAccount } from '../types';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  availableUsers: UserAccount[];
  onUserUpdated: (user: UserAccount) => void;
  onWorkspaceReload: () => Promise<void>;
  onOpenSettings: () => void;
  onOpenSubscription?: () => void;
}

type AccountSection =
  | 'overview'
  | 'manage'
  | 'subscription'
  | 'feedback'
  | 'help'
  | 'privacy'
  | 'terms';

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  availableUsers,
  onUserUpdated,
  onWorkspaceReload,
  onOpenSettings,
  onOpenSubscription,
}) => {
  const [section, setSection] = useState<AccountSection>('overview');
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Auth form states
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  // Feedback form
  const [fbSubject, setFbSubject] = useState('');
  const [fbMessage, setFbMessage] = useState('');

  const avatarInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const initials = (currentUser.name || 'MY')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: dataUrl }),
      });
      const data = await res.json();
      if (data.user) {
        onUserUpdated(data.user);
        setStatusMsg('Profile picture updated.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, bio }),
    });
    const data = await res.json();
    if (data.user) {
      onUserUpdated(data.user);
      setStatusMsg('Account profile saved.');
    }
  };

  const handleSwitchProfile = async (userId: string) => {
    setErrorMsg('');
    setStatusMsg('');
    const res = await fetch('/api/user/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (data.user) {
      await onWorkspaceReload();
      setName(data.user.name);
      setEmail(data.user.email);
      setBio(data.user.bio || '');
      setStatusMsg(`Switched to ${data.user.name} (${data.user.role}).`);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const payload =
      authMode === 'login'
        ? { email: authEmail, password: authPassword }
        : { name: authName, email: authEmail, password: authPassword };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Authentication failed.');
      return;
    }
    await onWorkspaceReload();
    setAuthPassword('');
    setStatusMsg(authMode === 'login' ? 'Signed in successfully.' : 'Account created and signed in.');
  };

  const handleUpgrade = async (tier: 'Free' | 'Pro' | 'Enterprise') => {
    const res = await fetch('/api/user/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    });
    const data = await res.json();
    if (data.user) {
      onUserUpdated(data.user);
      setStatusMsg(`Subscription updated to ${tier}.`);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'feedback',
        subject: fbSubject || 'General Feedback',
        message: fbMessage,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Failed to submit feedback.');
      return;
    }
    setFbSubject('');
    setFbMessage('');
    setStatusMsg('Thank you! Your feedback has been submitted.');
  };

  const menuRows: Array<{
    id: AccountSection | 'settings';
    label: string;
    subtitle: string;
    icon: React.FC<{ className?: string }>;
    onClick: () => void;
  }> = [
    {
      id: 'manage',
      label: 'Manage Account',
      subtitle: 'Edit profile, sign in, or switch workspace profile',
      icon: UserCheck,
      onClick: () => setSection('manage'),
    },
    {
      id: 'subscription',
      label: 'Manage Subscription',
      subtitle: `Current plan: ${currentUser.tier}`,
      icon: CreditCard,
      onClick: () => setSection('subscription'),
    },
    {
      id: 'subscription',
      label: 'Upgrade Plan',
      subtitle: 'Unlock higher daily image, video & music limits',
      icon: Sparkles,
      onClick: () => setSection('subscription'),
    },
    {
      id: 'settings',
      label: 'Settings',
      subtitle: 'Preferences, theme, personal intelligence & privacy',
      icon: Settings,
      onClick: () => {
        onClose();
        onOpenSettings();
      },
    },
    {
      id: 'feedback',
      label: 'Feedback',
      subtitle: 'Share suggestions with the MY AI team',
      icon: MessageSquarePlus,
      onClick: () => setSection('feedback'),
    },
    {
      id: 'help',
      label: 'Help',
      subtitle: 'How to prompt images, videos, music & tasks',
      icon: HelpCircle,
      onClick: () => setSection('help'),
    },
    {
      id: 'privacy',
      label: 'Privacy Policy',
      subtitle: 'How your conversations & media are handled',
      icon: ShieldCheck,
      onClick: () => setSection('privacy'),
    },
    {
      id: 'terms',
      label: 'Terms of Service',
      subtitle: 'Usage guidelines and acceptable use',
      icon: FileText,
      onClick: () => setSection('terms'),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
      <div className="w-full h-full sm:h-auto sm:max-h-[90dvh] sm:max-w-xl bg-[#070B14] sm:border border-slate-800 sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-[#050811] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {section !== 'overview' && (
              <button
                type="button"
                onClick={() => {
                  setSection('overview');
                  setStatusMsg('');
                  setErrorMsg('');
                }}
                className="text-xs font-semibold text-blue-400 hover:underline mr-1"
              >
                ← Back
              </button>
            )}
            <h2 className="text-base font-bold text-white">
              {section === 'overview'
                ? 'Account'
                : section === 'manage'
                ? 'Manage Account'
                : section === 'subscription'
                ? 'Subscription & Plans'
                : section === 'feedback'
                ? 'Send Feedback'
                : section === 'help'
                ? 'Help Center'
                : section === 'privacy'
                ? 'Privacy Policy'
                : 'Terms of Service'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close Account"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {statusMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-medium text-emerald-300">
              {statusMsg}
            </div>
          )}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-xs font-medium text-red-300">
              {errorMsg}
            </div>
          )}

          {section === 'overview' && (
            <>
              {/* Profile Hero Card */}
              <div className="p-5 rounded-3xl bg-[#0B1020] border border-slate-800 flex flex-col items-center text-center">
                <div className="relative">
                  {currentUser.avatar ? (
                    <img
                      src={currentUser.avatar}
                      alt={currentUser.name}
                      className="w-20 h-20 rounded-full object-cover border-2 border-blue-500/50 shadow-lg"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full gemini-gradient-bg text-white text-xl font-bold flex items-center justify-center shadow-lg">
                      {initials}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center shadow border-2 border-[#0B1020]"
                    title="Change avatar photo"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>

                <h3 className="mt-3 text-lg font-bold text-white">
                  {currentUser.name}
                </h3>
                <p className="text-xs text-slate-300">{currentUser.email}</p>

                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-600/20 border border-blue-500/40 text-xs font-semibold text-blue-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>MY AI {currentUser.tier}</span>
                </div>
              </div>

              {/* Action List */}
              <div className="divide-y divide-slate-800/90 rounded-2xl border border-slate-800 overflow-hidden bg-[#0B1020]">
                {menuRows.map((row, idx) => {
                  const Icon = row.icon;
                  return (
                    <button
                      key={`${row.label}-${idx}`}
                      type="button"
                      onClick={row.onClick}
                      className="w-full px-4 py-3.5 flex items-center gap-3.5 text-left hover:bg-[#11192E] transition"
                    >
                      <Icon className="w-5 h-5 text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">
                          {row.label}
                        </div>
                        <div className="text-xs text-slate-300 truncate">
                          {row.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {section === 'manage' && (
            <div className="space-y-6">
              {/* Profile Edit Form */}
              <form
                onSubmit={handleSaveProfile}
                className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-3"
              >
                <div className="text-sm font-bold text-white">
                  Edit Profile Details
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Bio
                  </label>
                  <input
                    type="text"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="AI builder, designer, student..."
                    className="w-full px-3.5 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-sm text-white placeholder:text-slate-400"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
                >
                  Save Profile
                </button>
              </form>

              {/* Auth Sign In / Sign Up */}
              <form
                onSubmit={handleAuthSubmit}
                className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    {authMode === 'login' ? <LogIn className="w-4 h-4 text-blue-400" /> : <UserPlus className="w-4 h-4 text-blue-400" />}
                    <span>{authMode === 'login' ? 'Sign In' : 'Create Account'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                    className="text-xs font-semibold text-blue-400 hover:underline"
                  >
                    {authMode === 'login' ? 'Need an account? Sign Up' : 'Have an account? Sign In'}
                  </button>
                </div>

                {authMode === 'signup' && (
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full px-3.5 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-sm text-white placeholder:text-slate-400"
                  />
                )}
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-sm text-white placeholder:text-slate-400"
                />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Password (required when Supabase Auth is active)"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-sm text-white placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  className="w-full py-2 rounded-xl gemini-gradient-bg text-white text-xs font-semibold"
                >
                  {authMode === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              </form>

              {/* Workspace Profile Switcher */}
              <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2.5">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>Workspace Profiles</span>
                </div>
                <div className="space-y-1.5">
                  {availableUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleSwitchProfile(u.id)}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between text-xs transition ${
                        u.id === currentUser.id
                          ? 'border-blue-500 bg-blue-600/20 text-blue-300 font-semibold'
                          : 'border-slate-700 bg-[#11192E] text-slate-200 hover:border-slate-500'
                      }`}
                    >
                      <span className="truncate">
                        {u.name} · {u.email} ({u.role})
                      </span>
                      {u.id === currentUser.id && <Check className="w-4 h-4 shrink-0 text-blue-400" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'subscription' && (
            <div className="space-y-4">
              {currentUser.activeSubscription ? (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/30 to-[#0B1020] border border-blue-500/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                      Active Subscription
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                      ACTIVE
                    </span>
                  </div>
                  <div className="text-base font-bold text-white">
                    {currentUser.activeSubscription.planName}
                  </div>
                  <div className="text-xs text-slate-300">
                    {currentUser.activeSubscription.expiryDate > 0 ? (
                      <>
                        Expires on{' '}
                        <strong className="text-white">
                          {new Date(currentUser.activeSubscription.expiryDate).toLocaleDateString()}
                        </strong>
                      </>
                    ) : (
                      'Free Forever / Lifetime Access'
                    )}
                  </div>
                </div>
              ) : null}

              {onOpenSubscription && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSubscription();
                  }}
                  className="w-full py-3 rounded-2xl gemini-gradient-bg text-white text-xs font-bold shadow-lg hover:opacity-95 transition flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Open Full Premium Subscription & Checkout Portal</span>
                </button>
              )}

              <div className="space-y-2.5 pt-1">
                {(
                  [
                    {
                      tier: 'Free Starter',
                      price: '₹0',
                      perks: '15 images, 3 videos, 5 audio daily · Standard FLUX & Gemini 3.1 Lite',
                    },
                    {
                      tier: 'Pro Creator',
                      price: '₹499 / mo or ₹4,999 / yr',
                      perks: '250+ images, 50 videos · Full Hugging Face FLUX + PhotoRoom AI',
                    },
                    {
                      tier: 'Super AI Enterprise',
                      price: '₹9,999 / yr',
                      perks: '10,000 images, 2,000 videos, VIP Concurrency · Unlimited workspace chats',
                    },
                  ]
                ).map((plan) => {
                  const isCurrent =
                    currentUser.activeSubscription?.planName === plan.tier ||
                    (!currentUser.activeSubscription && plan.tier === 'Free Starter');
                  return (
                    <div
                      key={plan.tier}
                      className={`p-3.5 rounded-2xl border ${
                        isCurrent
                          ? 'border-blue-500 bg-blue-600/15'
                          : 'border-slate-800 bg-[#0B1020]'
                      } flex items-center justify-between gap-3`}
                    >
                      <div>
                        <div className="text-xs font-bold text-white">
                          {plan.tier} · <span className="text-blue-300 font-mono">{plan.price}</span>
                        </div>
                        <div className="text-[11px] text-slate-300 mt-0.5">
                          {plan.perks}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenSubscription) {
                            onClose();
                            onOpenSubscription();
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 ${
                          isCurrent
                            ? 'bg-[#11192E] text-slate-300 border border-slate-700'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        {isCurrent ? 'Current' : 'View Plan'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {section === 'feedback' && (
            <form onSubmit={handleSubmitFeedback} className="space-y-3">
              <input
                type="text"
                value={fbSubject}
                onChange={(e) => setFbSubject(e.target.value)}
                placeholder="Subject (e.g., Feature idea, UI suggestion)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1020] border border-slate-700 text-sm text-white placeholder:text-slate-400"
              />
              <textarea
                rows={5}
                required
                value={fbMessage}
                onChange={(e) => setFbMessage(e.target.value)}
                placeholder="Share your feedback with us..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1020] border border-slate-700 text-sm text-white placeholder:text-slate-400"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold"
              >
                Submit Feedback
              </button>
            </form>
          )}

          {section === 'help' && (
            <div className="space-y-3 text-xs sm:text-sm text-slate-200 leading-relaxed">
              <p className="font-semibold text-white">Using MY AI Universal Chat</p>
              <p>• Type any request naturally—MY AI automatically routes between text reasoning, coding, 4K image generation, video creation, music generation, and file analysis inside one conversation.</p>
              <p>• Upload a photo via (+) and say “Animate this into a cinematic video” for Photo-to-Video, or say “Change the sky to sunset” for Image Editing.</p>
              <p>• Switch to the Task tab above the input box to execute multi-step plans with live step tracking and cancellation.</p>
            </div>
          )}

          {section === 'privacy' && (
            <div className="space-y-3 text-xs sm:text-sm text-slate-200 leading-relaxed">
              <p className="font-semibold text-white">MY AI Privacy Commitment</p>
              <p>API keys are stored exclusively on the backend and never exposed to client browsers. You can clear your chat history, creations, and public links anytime inside Settings → Data and Privacy.</p>
            </div>
          )}

          {section === 'terms' && (
            <div className="space-y-3 text-xs sm:text-sm text-slate-200 leading-relaxed">
              <p className="font-semibold text-white">Terms of Service</p>
              <p>MY AI provides multimodal generation powered by configured AI providers. Users are responsible for complying with applicable safety policies and intellectual property rights for generated assets.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
