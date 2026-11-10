import React, { useState, useEffect, useRef } from 'react';
import {
  CreditCard,
  Plus,
  Check,
  X,
  Trash2,
  Edit3,
  ShieldCheck,
  QrCode,
  Building,
  Upload,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ArrowUpDown,
  Search,
  ExternalLink,
  Copy,
  Zap,
} from 'lucide-react';
import {
  SubscriptionPlan,
  PaymentSettings,
  PaymentOrder,
  UserSubscription,
  UserAccount,
  PlanBillingCycle,
} from '../types';

interface SubscriptionManagementSectionProps {
  onNotice: (msg: string) => void;
  onConfigUpdated: () => Promise<void>;
}

type SubSectionTab = 'plans' | 'payment_methods' | 'orders' | 'subscribers';

export const SubscriptionManagementSection: React.FC<SubscriptionManagementSectionProps> = ({
  onNotice,
  onConfigUpdated,
}) => {
  const [subTab, setSubTab] = useState<SubSectionTab>('plans');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [userSubs, setUserSubs] = useState<
    Array<{ user: UserAccount; subscription: UserSubscription | null; allSubscriptions: UserSubscription[] }>
  >([]);
  const [loading, setLoading] = useState(true);

  // Filter orders
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'pending_verification' | 'approved' | 'rejected'>('all');
  const [orderSearch, setOrderSearch] = useState('');

  // Plan Edit / Create Modal State
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<{
    name: string;
    title: string;
    description: string;
    priceINR: number;
    billingCycle: PlanBillingCycle;
    durationDays: number;
    durationLabel: string;
    tier: string;
    features: string[];
    newFeatureInput: string;
    imagesQuota: number;
    videosQuota: number;
    audioQuota: number;
    chatsQuota: number;
    enabled: boolean;
    isPopular: boolean;
    isRecommended: boolean;
    sortOrder: number;
  }>({
    name: '',
    title: '',
    description: '',
    priceINR: 499,
    billingCycle: 'monthly',
    durationDays: 30,
    durationLabel: 'Month',
    tier: 'Pro',
    features: [
      'Full AI Studio access',
      'High-resolution media export',
      'Subject-preserved photo editing',
      'Priority generation queue',
    ],
    newFeatureInput: '',
    imagesQuota: 200,
    videosQuota: 40,
    audioQuota: 50,
    chatsQuota: 1000,
    enabled: true,
    isPopular: false,
    isRecommended: false,
    sortOrder: 1,
  });

  // User Preview Modal State
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // Reject Order Modal
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Manual Grant Modal
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantPlanId, setGrantPlanId] = useState('');
  const [grantDurationDays, setGrantDurationDays] = useState(30);

  // Payment Settings Edit Form State
  const [upiQrEnabled, setUpiQrEnabled] = useState(true);
  const [upiQrImage, setUpiQrImage] = useState('');
  const [upiQrId, setUpiQrId] = useState('');
  const [upiQrHolder, setUpiQrHolder] = useState('');
  const [upiQrInstructions, setUpiQrInstructions] = useState('');

  const [upiIdEnabled, setUpiIdEnabled] = useState(true);
  const [upiDirectId, setUpiDirectId] = useState('');
  const [upiDirectHolder, setUpiDirectHolder] = useState('');
  const [upiDirectInstructions, setUpiDirectInstructions] = useState('');

  const [bankEnabled, setBankEnabled] = useState(true);
  const [bankHolder, setBankHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankInstructions, setBankInstructions] = useState('');

  const [cfEnabled, setCfEnabled] = useState(false);
  const [cfEnvironment, setCfEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [cfAppId, setCfAppId] = useState('');
  const [cfSecretKey, setCfSecretKey] = useState('');
  const [cfTesting, setCfTesting] = useState(false);
  const [cfTestResult, setCfTestResult] = useState<{
    connected: boolean;
    latencyMs: number;
    message: string;
  } | null>(null);

  const qrFileInputRef = useRef<HTMLInputElement>(null);

  const loadSubscriptionData = async () => {
    setLoading(true);
    try {
      const [plansRes, settingsRes, ordersRes, subsRes] = await Promise.all([
        fetch('/api/admin/subscription/plans'),
        fetch('/api/admin/subscription/payment-settings'),
        fetch('/api/admin/subscription/orders'),
        fetch('/api/admin/subscription/subscriptions'),
      ]);

      const plansData = await plansRes.json();
      const settingsData = await settingsRes.json();
      const ordersData = await ordersRes.json();
      const subsData = await subsRes.json();

      setPlans(plansData.plans || []);
      if (settingsData.settings) {
        setPaymentSettings(settingsData.settings);
        const s = settingsData.settings;
        setUpiQrEnabled(s.upiQr?.enabled ?? true);
        setUpiQrImage(s.upiQr?.qrImageUrl || '');
        setUpiQrId(s.upiQr?.upiId || '');
        setUpiQrHolder(s.upiQr?.accountHolderName || '');
        setUpiQrInstructions(s.upiQr?.instructions || '');

        setUpiIdEnabled(s.upiId?.enabled ?? true);
        setUpiDirectId(s.upiId?.upiId || '');
        setUpiDirectHolder(s.upiId?.accountHolderName || '');
        setUpiDirectInstructions(s.upiId?.instructions || '');

        setBankEnabled(s.bankTransfer?.enabled ?? false);
        setBankHolder(s.bankTransfer?.accountHolderName || '');
        setBankName(s.bankTransfer?.bankName || '');
        setBankAccount(s.bankTransfer?.accountNumber || '');
        setBankIfsc(s.bankTransfer?.ifscCode || '');
        setBankBranch(s.bankTransfer?.branchName || '');
        setBankInstructions(s.bankTransfer?.instructions || '');

        setCfEnabled(s.cashfree?.enabled ?? false);
        setCfEnvironment(s.cashfree?.environment || 'sandbox');
      }
      setOrders(ordersData.orders || []);
      setUserSubs(subsData.userSubscriptions || []);
    } catch {
      onNotice('Error loading subscription data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscriptionData();
  }, []);

  // ---------------------------------------------------------------------------
  // PLANS HANDLERS
  // ---------------------------------------------------------------------------

  const openCreatePlanModal = () => {
    setEditingPlanId(null);
    setPlanForm({
      name: '',
      title: '',
      description: '',
      priceINR: 499,
      billingCycle: 'monthly',
      durationDays: 30,
      durationLabel: 'Month',
      tier: 'Pro',
      features: [
        'Full AI Studio access',
        'High-resolution media export',
        'Subject-preserved photo editing',
        'Priority generation queue',
      ],
      newFeatureInput: '',
      imagesQuota: 200,
      videosQuota: 40,
      audioQuota: 50,
      chatsQuota: 1000,
      enabled: true,
      isPopular: false,
      isRecommended: false,
      sortOrder: plans.length + 1,
    });
    setIsPlanModalOpen(true);
  };

  const openEditPlanModal = (plan: SubscriptionPlan) => {
    setEditingPlanId(plan.id);
    setPlanForm({
      name: plan.name,
      title: plan.title || '',
      description: plan.description || '',
      priceINR: plan.priceINR,
      billingCycle: plan.billingCycle,
      durationDays: plan.durationDays,
      durationLabel: plan.durationLabel || 'Month',
      tier: plan.tier || 'Pro',
      features: Array.isArray(plan.features) ? [...plan.features] : [],
      newFeatureInput: '',
      imagesQuota: plan.limits?.imagesQuota ?? 100,
      videosQuota: plan.limits?.videosQuota ?? 25,
      audioQuota: plan.limits?.audioQuota ?? 40,
      chatsQuota: plan.limits?.chatsQuota ?? 1000,
      enabled: plan.enabled,
      isPopular: !!plan.isPopular,
      isRecommended: !!plan.isRecommended,
      sortOrder: plan.sortOrder ?? 1,
    });
    setIsPlanModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planForm.name.trim()) {
      onNotice('Plan name is required.');
      return;
    }

    const payload = {
      name: planForm.name.trim(),
      title: planForm.title.trim(),
      description: planForm.description.trim(),
      priceINR: Number(planForm.priceINR),
      billingCycle: planForm.billingCycle,
      durationDays: Number(planForm.durationDays),
      durationLabel: planForm.durationLabel.trim() || 'Month',
      tier: planForm.tier,
      features: planForm.features,
      limits: {
        imagesQuota: Number(planForm.imagesQuota),
        videosQuota: Number(planForm.videosQuota),
        audioQuota: Number(planForm.audioQuota),
        chatsQuota: Number(planForm.chatsQuota),
      },
      enabled: planForm.enabled,
      isPopular: planForm.isPopular,
      isRecommended: planForm.isRecommended,
      sortOrder: Number(planForm.sortOrder),
    };

    const endpoint = editingPlanId
      ? `/api/admin/subscription/plans/${editingPlanId}`
      : '/api/admin/subscription/plans';
    const method = editingPlanId ? 'PATCH' : 'POST';

    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) {
      setPlans(data.plans || []);
      setIsPlanModalOpen(false);
      onNotice(editingPlanId ? 'Plan updated successfully.' : 'New subscription plan created.');
      await onConfigUpdated();
    } else {
      onNotice(data.error || 'Failed to save plan.');
    }
  };

  const handleDeletePlan = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the plan "${name}"?`)) return;
    const res = await fetch(`/api/admin/subscription/plans/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      setPlans(data.plans || []);
      onNotice(`Plan "${name}" removed.`);
      await onConfigUpdated();
    } else {
      onNotice(data.error || 'Failed to delete plan.');
    }
  };

  const handleTogglePlanEnabled = async (plan: SubscriptionPlan) => {
    const res = await fetch(`/api/admin/subscription/plans/${plan.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !plan.enabled }),
    });
    const data = await res.json();
    if (res.ok) {
      setPlans(data.plans || []);
      onNotice(`Plan "${plan.name}" is now ${!plan.enabled ? 'Enabled' : 'Disabled'}.`);
      await onConfigUpdated();
    }
  };

  const handleAddFeature = () => {
    if (!planForm.newFeatureInput.trim()) return;
    setPlanForm({
      ...planForm,
      features: [...planForm.features, planForm.newFeatureInput.trim()],
      newFeatureInput: '',
    });
  };

  const handleRemoveFeature = (index: number) => {
    const updated = [...planForm.features];
    updated.splice(index, 1);
    setPlanForm({ ...planForm, features: updated });
  };

  // ---------------------------------------------------------------------------
  // PAYMENT METHODS HANDLERS
  // ---------------------------------------------------------------------------

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setUpiQrImage(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSavePaymentSettings = async () => {
    const payload = {
      upiQr: {
        enabled: upiQrEnabled,
        qrImageUrl: upiQrImage,
        upiId: upiQrId.trim(),
        accountHolderName: upiQrHolder.trim(),
        instructions: upiQrInstructions.trim(),
      },
      upiId: {
        enabled: upiIdEnabled,
        upiId: upiDirectId.trim(),
        accountHolderName: upiDirectHolder.trim(),
        instructions: upiDirectInstructions.trim(),
      },
      bankTransfer: {
        enabled: bankEnabled,
        accountHolderName: bankHolder.trim(),
        bankName: bankName.trim(),
        accountNumber: bankAccount.trim(),
        ifscCode: bankIfsc.trim().toUpperCase(),
        branchName: bankBranch.trim(),
        instructions: bankInstructions.trim(),
      },
      cashfree: {
        enabled: cfEnabled,
        environment: cfEnvironment,
        appId: cfAppId.trim() || undefined,
        secretKey: cfSecretKey.trim() || undefined,
      },
    };

    const res = await fetch('/api/admin/subscription/payment-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) {
      setPaymentSettings(data.settings);
      setCfSecretKey('');
      onNotice('Payment methods and gateway configuration saved.');
      await onConfigUpdated();
    } else {
      onNotice(data.error || 'Failed to save payment settings.');
    }
  };

  const handleTestCashfree = async () => {
    setCfTesting(true);
    setCfTestResult(null);
    try {
      const res = await fetch('/api/admin/subscription/test-cashfree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: cfAppId.trim() || undefined,
          secretKey: cfSecretKey.trim() || undefined,
          environment: cfEnvironment,
        }),
      });
      const data = await res.json();
      setCfTestResult(data);
      onNotice(data.connected ? 'Cashfree Connection Successful!' : 'Cashfree Connection Failed.');
    } catch {
      setCfTestResult({
        connected: false,
        latencyMs: 0,
        message: 'Network error communicating with test endpoint.',
      });
    } finally {
      setCfTesting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // ORDER VERIFICATION HANDLERS
  // ---------------------------------------------------------------------------

  const handleApproveOrder = async (orderId: string, orderRef: string) => {
    if (!confirm(`Are you sure you want to approve order ${orderRef}? This will activate the user's subscription immediately.`)) {
      return;
    }
    const res = await fetch(`/api/admin/subscription/orders/${orderId}/approve`, {
      method: 'POST',
    });
    const data = await res.json();
    if (res.ok) {
      setOrders(data.orders || []);
      onNotice(`Order ${orderRef} approved and subscription activated!`);
      loadSubscriptionData();
      await onConfigUpdated();
    } else {
      onNotice(data.error || 'Failed to approve order.');
    }
  };

  const handleRejectOrder = async () => {
    if (!rejectOrderId) return;
    const res = await fetch(`/api/admin/subscription/orders/${rejectOrderId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: rejectReason }),
    });
    const data = await res.json();
    if (res.ok) {
      setOrders(data.orders || []);
      setRejectOrderId(null);
      setRejectReason('');
      onNotice('Order marked as rejected.');
      loadSubscriptionData();
    } else {
      onNotice(data.error || 'Failed to reject order.');
    }
  };

  // ---------------------------------------------------------------------------
  // MANUAL SUBSCRIPTION GRANT
  // ---------------------------------------------------------------------------

  const handleManualGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantUserId || !grantPlanId) {
      onNotice('Please select a user and a plan.');
      return;
    }

    const res = await fetch('/api/admin/subscription/manual-grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: grantUserId,
        planId: grantPlanId,
        durationDays: Number(grantDurationDays),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      onNotice(`Subscription successfully granted to ${data.user?.name || 'user'}.`);
      setIsGrantModalOpen(false);
      loadSubscriptionData();
      await onConfigUpdated();
    } else {
      onNotice(data.error || 'Failed to grant subscription.');
    }
  };

  const filteredOrders = orders
    .filter((o) => {
      if (orderStatusFilter === 'all') return true;
      return o.status === orderStatusFilter;
    })
    .filter((o) => {
      if (!orderSearch.trim()) return true;
      const s = orderSearch.toLowerCase();
      return (
        o.referenceNumber?.toLowerCase().includes(s) ||
        o.userEmail?.toLowerCase().includes(s) ||
        o.userName?.toLowerCase().includes(s) ||
        o.userTransactionRef?.toLowerCase().includes(s) ||
        o.planName?.toLowerCase().includes(s)
      );
    });

  const pendingCount = orders.filter((o) => o.status === 'pending_verification').length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Tab Navigation */}
      <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">
              Subscription & Payment Management
            </h3>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold animate-pulse">
                {pendingCount} Pending Verification
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Configure unlimited subscription plans in INR (₹), manage manual UPI QR, direct UPI ID, bank transfers, and automated Cashfree gateway payments with strict verification.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPreviewModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
          >
            <Eye className="w-3.5 h-3.5 text-blue-400" />
            <span>Preview As User</span>
          </button>
          <button
            type="button"
            onClick={openCreatePlanModal}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center gap-1.5 shadow-md transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Plan</span>
          </button>
        </div>
      </div>

      {/* Subtab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setSubTab('plans')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shrink-0 ${
            subTab === 'plans'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Plans ({plans.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('payment_methods')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shrink-0 ${
            subTab === 'payment_methods'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Payment Methods & Gateway</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('orders')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shrink-0 ${
            subTab === 'orders'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Verification Queue ({orders.length})</span>
          {pendingCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping ml-1" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('subscribers')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shrink-0 ${
            subTab === 'subscribers'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Subscribers ({userSubs.length})</span>
        </button>
      </div>

      {/* ----------------------------------------------------------------------- */}
      {/* 1. PLANS MANAGER */}
      {/* ----------------------------------------------------------------------- */}
      {subTab === 'plans' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>
              All plans reflect instantly on the user subscription page. Plans with price ₹0 activate without payment.
            </span>
            <span className="font-semibold text-slate-200">
              {plans.filter((p) => p.enabled).length} of {plans.length} plans enabled
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`p-4 rounded-2xl border transition flex flex-col justify-between ${
                  plan.enabled
                    ? plan.isPopular
                      ? 'border-blue-500/80 bg-gradient-to-b from-blue-950/20 to-[#0B1020]'
                      : plan.isRecommended
                      ? 'border-amber-500/80 bg-gradient-to-b from-amber-950/20 to-[#0B1020]'
                      : 'border-slate-800 bg-[#0B1020]'
                    : 'border-slate-800/50 bg-[#070B14] opacity-60'
                }`}
              >
                <div className="space-y-3">
                  {/* Badges & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                        Tier: {plan.tier}
                      </span>
                      {plan.isPopular && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/40">
                          Popular
                        </span>
                      )}
                      {plan.isRecommended && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Recommended
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        plan.enabled
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {plan.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>

                  {/* Plan Name & Pricing */}
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center justify-between">
                      <span>{plan.name}</span>
                      <span className="text-xs font-mono text-slate-400 font-normal">
                        Order #{plan.sortOrder ?? 0}
                      </span>
                    </h4>
                    {plan.title && (
                      <p className="text-xs text-blue-400 font-medium mt-0.5">{plan.title}</p>
                    )}
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-extrabold text-white">
                        {plan.priceINR === 0 ? 'Free' : `₹${plan.priceINR.toLocaleString('en-IN')}`}
                      </span>
                      {plan.priceINR > 0 && (
                        <span className="text-xs text-slate-300 font-medium">
                          / {plan.durationLabel || 'Month'} ({plan.durationDays} days)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {plan.description && (
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {plan.description}
                    </p>
                  )}

                  {/* Quotas */}
                  <div className="p-2.5 rounded-xl bg-[#11192E] border border-slate-700/60 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-300 block">Images:</span>
                      <span className="font-semibold text-white font-mono">
                        {plan.limits?.imagesQuota} / period
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-300 block">Videos:</span>
                      <span className="font-semibold text-white font-mono">
                        {plan.limits?.videosQuota} / period
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-300 block">Audio / Songs:</span>
                      <span className="font-semibold text-white font-mono">
                        {plan.limits?.audioQuota} / period
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-300 block">Chat Messages:</span>
                      <span className="font-semibold text-white font-mono">
                        {plan.limits?.chatsQuota} / period
                      </span>
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="space-y-1 pt-1">
                    <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                      Included Features:
                    </div>
                    <ul className="space-y-1 text-xs text-slate-300">
                      {(plan.features || []).slice(0, 4).map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span className="truncate">{f}</span>
                        </li>
                      ))}
                      {(plan.features?.length || 0) > 4 && (
                        <li className="text-[11px] text-slate-300 pl-5">
                          +{plan.features.length - 4} more features
                        </li>
                      )}
                    </ul>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleTogglePlanEnabled(plan)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition ${
                      plan.enabled
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                    }`}
                  >
                    {plan.enabled ? 'Disable' : 'Enable'}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditPlanModal(plan)}
                      className="p-1.5 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-slate-200 transition"
                      title="Edit Plan"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePlan(plan.id, plan.name)}
                      className="p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 transition"
                      title="Delete Plan"
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

      {/* ----------------------------------------------------------------------- */}
      {/* 2. PAYMENT METHODS & CASHFREE GATEWAY */}
      {/* ----------------------------------------------------------------------- */}
      {subTab === 'payment_methods' && (
        <div className="space-y-5">
          <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-500/30 text-xs text-blue-200 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <span>
              Admins can toggle UPI QR Code, direct UPI ID, Bank Transfer, and Cashfree Payment Gateway independently. For manual payments, users receive a unique order reference and submit their transaction UTR, requiring your manual approval before premium features activate. Cashfree payments verify automatically via server secrets.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Card A: UPI QR Code */}
            <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-blue-400" />
                    <h4 className="text-sm font-bold text-white">Payment Method A: UPI QR Code</h4>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300">
                    <input
                      type="checkbox"
                      checked={upiQrEnabled}
                      onChange={(e) => setUpiQrEnabled(e.target.checked)}
                      className="rounded accent-blue-600"
                    />
                    <span>{upiQrEnabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Official Payment QR Image:
                  </label>
                  <div className="flex items-center gap-3">
                    {upiQrImage ? (
                      <div className="relative w-24 h-24 rounded-xl border border-slate-700 bg-black/60 p-1 flex items-center justify-center shrink-0">
                        <img
                          src={upiQrImage}
                          alt="UPI QR Code"
                          className="w-full h-full object-contain rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => setUpiQrImage('')}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px]"
                          title="Remove QR"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center text-[10px] text-slate-300 p-2 text-center shrink-0">
                        <QrCode className="w-6 h-6 text-slate-300 mb-1" />
                        No QR Image
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <input
                        ref={qrFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleQrUpload}
                      />
                      <button
                        type="button"
                        onClick={() => qrFileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5 text-blue-400" />
                        <span>Upload Official QR</span>
                      </button>
                      <p className="text-[11px] text-slate-300">
                        Upload your business QR code image (PNG/JPG).
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    UPI ID (associated with QR):
                  </label>
                  <input
                    type="text"
                    value={upiQrId}
                    onChange={(e) => setUpiQrId(e.target.value)}
                    placeholder="e.g. myai@icici"
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Account Holder Name:
                  </label>
                  <input
                    type="text"
                    value={upiQrHolder}
                    onChange={(e) => setUpiQrHolder(e.target.value)}
                    placeholder="e.g. MY AI Technologies"
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Instructions to User:
                  </label>
                  <textarea
                    rows={2}
                    value={upiQrInstructions}
                    onChange={(e) => setUpiQrInstructions(e.target.value)}
                    placeholder="Scan QR, pay exact amount, and paste the 12-digit UTR below."
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Card B: Direct UPI ID */}
            <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-sm font-bold text-white">Payment Method B: Direct UPI ID</h4>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300">
                    <input
                      type="checkbox"
                      checked={upiIdEnabled}
                      onChange={(e) => setUpiIdEnabled(e.target.checked)}
                      className="rounded accent-blue-600"
                    />
                    <span>{upiIdEnabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Configured UPI ID:
                  </label>
                  <input
                    type="text"
                    value={upiDirectId}
                    onChange={(e) => setUpiDirectId(e.target.value)}
                    placeholder="e.g. myai@okhdfcbank"
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Account Holder Name:
                  </label>
                  <input
                    type="text"
                    value={upiDirectHolder}
                    onChange={(e) => setUpiDirectHolder(e.target.value)}
                    placeholder="e.g. MY AI Technologies"
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Instructions to User:
                  </label>
                  <textarea
                    rows={3}
                    value={upiDirectInstructions}
                    onChange={(e) => setUpiDirectInstructions(e.target.value)}
                    placeholder="Users will see a One-Click Copy button for the UPI ID."
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Card C: Bank Transfer */}
            <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-purple-400" />
                    <h4 className="text-sm font-bold text-white">Payment Method C: Bank Transfer (IMPS / NEFT)</h4>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300">
                    <input
                      type="checkbox"
                      checked={bankEnabled}
                      onChange={(e) => setBankEnabled(e.target.checked)}
                      className="rounded accent-blue-600"
                    />
                    <span>{bankEnabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Bank Name:
                    </label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. HDFC Bank"
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Account Number:
                    </label>
                    <input
                      type="text"
                      value={bankAccount}
                      onChange={(e) => setBankAccount(e.target.value)}
                      placeholder="50200088991122"
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      IFSC Code:
                    </label>
                    <input
                      type="text"
                      value={bankIfsc}
                      onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                      placeholder="HDFC0001234"
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Account Holder Name:
                    </label>
                    <input
                      type="text"
                      value={bankHolder}
                      onChange={(e) => setBankHolder(e.target.value)}
                      placeholder="MY AI Technologies Pvt Ltd"
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Branch Name (Optional):
                  </label>
                  <input
                    type="text"
                    value={bankBranch}
                    onChange={(e) => setBankBranch(e.target.value)}
                    placeholder="e.g. Koramangala 4th Block, Bengaluru"
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            {/* Card D: Cashfree Payment Gateway */}
            <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-amber-400" />
                    <h4 className="text-sm font-bold text-white">Payment Method D: Cashfree Gateway</h4>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300">
                    <input
                      type="checkbox"
                      checked={cfEnabled}
                      onChange={(e) => setCfEnabled(e.target.checked)}
                      className="rounded accent-blue-600"
                    />
                    <span>{cfEnabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Gateway Environment:
                    </label>
                    <select
                      value={cfEnvironment}
                      onChange={(e) => setCfEnvironment(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                    >
                      <option value="sandbox">Sandbox (Testing)</option>
                      <option value="production">Production (Live)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Cashfree App ID:
                    </label>
                    <input
                      type="text"
                      value={cfAppId}
                      onChange={(e) => setCfAppId(e.target.value)}
                      placeholder="e.g. 1234567890abcdef"
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      Cashfree Secret Key:
                    </label>
                    {paymentSettings?.cashfree?.hasSecretKey && (
                      <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Stored in Server Secrets ({paymentSettings.cashfree.maskedSecret})
                      </span>
                    )}
                  </div>
                  <input
                    type="password"
                    value={cfSecretKey}
                    onChange={(e) => setCfSecretKey(e.target.value)}
                    placeholder={
                      paymentSettings?.cashfree?.hasSecretKey
                        ? '•••••••••••••••• (Leave blank to keep existing key)'
                        : 'Enter Cashfree Secret Key'
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white font-mono"
                  />
                  <p className="text-[11px] text-slate-300 mt-1">
                    Key is strictly stored in protected server-side storage and never exposed to the browser.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Webhook Listener URL:
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/api/subscription/cashfree-webhook`}
                      className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-slate-800 text-[11px] text-slate-300 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${window.location.origin}/api/subscription/cashfree-webhook`
                        );
                        onNotice('Webhook URL copied to clipboard.');
                      }}
                      className="p-1.5 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-slate-200"
                      title="Copy Webhook URL"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {cfTestResult && (
                  <div
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                      cfTestResult.connected
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-red-500/15 border-red-500/40 text-red-300'
                    }`}
                  >
                    {cfTestResult.connected ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0 text-red-400" />
                    )}
                    <span>{cfTestResult.message}</span>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestCashfree}
                  disabled={cfTesting}
                  className="w-full py-1.5 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${cfTesting ? 'animate-spin' : ''}`} />
                  <span>{cfTesting ? 'Verifying Gateway...' : 'Test Cashfree Connection'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleSavePaymentSettings}
              className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-lg transition"
            >
              Save Payment Methods Configuration
            </button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* 3. VERIFICATION QUEUE & ORDERS */}
      {/* ----------------------------------------------------------------------- */}
      {subTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-[#0B1020] p-1 rounded-2xl border border-slate-800">
              {(
                [
                  { id: 'all', label: 'All Orders' },
                  { id: 'pending_verification', label: `Pending (${pendingCount})` },
                  { id: 'approved', label: 'Approved' },
                  { id: 'rejected', label: 'Rejected' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setOrderStatusFilter(f.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition ${
                    orderStatusFilter === f.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-300" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search reference, email, UTR..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#0B1020] border border-slate-800 text-xs text-white placeholder:text-slate-400"
              />
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#0B1020] border border-slate-800 text-center text-xs text-slate-300">
              No orders found in this filter category.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className={`p-4 rounded-2xl border transition ${
                    order.status === 'pending_verification'
                      ? 'border-amber-500/60 bg-gradient-to-r from-amber-950/20 via-[#0B1020] to-[#0B1020]'
                      : order.status === 'approved'
                      ? 'border-emerald-500/40 bg-[#0B1020]'
                      : 'border-slate-800 bg-[#070B14]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-white">
                          #{order.referenceNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            order.status === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : order.status === 'pending_verification'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                              : 'bg-red-500/20 text-red-300 border-red-500/40'
                          }`}
                        >
                          {order.status === 'pending_verification'
                            ? 'Pending Verification'
                            : order.status.toUpperCase()}
                        </span>
                        <span className="text-[11px] text-slate-300 uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-slate-800">
                          {order.paymentMethod === 'upi_qr'
                            ? 'UPI QR Code'
                            : order.paymentMethod === 'upi_id'
                            ? 'Direct UPI ID'
                            : order.paymentMethod === 'bank_transfer'
                            ? 'Bank Transfer'
                            : 'Cashfree Gateway'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-300 flex items-center gap-2">
                        <span className="font-semibold text-white">{order.userName}</span>
                        <span>({order.userEmail})</span>
                        <span>•</span>
                        <span>{new Date(order.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-extrabold text-white">
                        ₹{order.amountINR.toLocaleString('en-IN')}
                      </div>
                      <div className="text-xs text-blue-400 font-semibold">{order.planName}</div>
                    </div>
                  </div>

                  {/* Payment Proof / UTR Details */}
                  <div className="mt-3 p-3 rounded-xl bg-[#11192E] border border-slate-700/60 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-300 block text-[11px]">User Transaction Ref / UTR:</span>
                      <span className="font-mono font-bold text-white select-all">
                        {order.userTransactionRef || (
                          <span className="text-amber-400 italic">Not submitted yet</span>
                        )}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-300 block text-[11px]">User Proof Notes:</span>
                      <span className="text-slate-200">
                        {order.userProofNotes || <span className="text-slate-300">None</span>}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-300 block text-[11px]">Verification Details:</span>
                      <span className="text-slate-200">
                        {order.verifiedBy ? (
                          <>
                            Verified by {order.verifiedBy} at{' '}
                            {order.verifiedAt ? new Date(order.verifiedAt).toLocaleDateString() : ''}
                          </>
                        ) : order.rejectionReason ? (
                          <span className="text-red-400">Rejected: {order.rejectionReason}</span>
                        ) : (
                          <span className="text-amber-300">Awaiting Admin Verification</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Verification Actions */}
                  {order.status === 'pending_verification' && (
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRejectOrderId(order.id);
                          setRejectReason('');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-xs font-semibold text-red-300 flex items-center gap-1.5 transition"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject Payment</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApproveOrder(order.id, order.referenceNumber)}
                        className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1.5 shadow transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verify & Activate Subscription</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* 4. SUBSCRIBED USERS & MANUAL GRANTS */}
      {/* ----------------------------------------------------------------------- */}
      {subTab === 'subscribers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-300">
              Users with active or historical subscriptions. Admins can grant or extend any plan manually.
            </span>
            <button
              type="button"
              onClick={() => {
                setGrantUserId(userSubs[0]?.user?.id || '');
                setGrantPlanId(plans[0]?.id || '');
                setIsGrantModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-blue-400" />
              <span>Manual Grant Subscription</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#0B1020]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#050811] text-slate-300 uppercase tracking-wider text-[11px] border-b border-slate-800">
                <tr>
                  <th className="p-3 font-semibold">User</th>
                  <th className="p-3 font-semibold">Active Plan</th>
                  <th className="p-3 font-semibold">Tier</th>
                  <th className="p-3 font-semibold">Started</th>
                  <th className="p-3 font-semibold">Expires</th>
                  <th className="p-3 font-semibold">Quota Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {userSubs.map((entry) => {
                  const sub = entry.subscription;
                  const now = Date.now();
                  const isExpired = sub && sub.expiryDate > 0 && now > sub.expiryDate;
                  const daysLeft =
                    sub && sub.expiryDate > 0
                      ? Math.max(0, Math.ceil((sub.expiryDate - now) / (24 * 3600 * 1000)))
                      : sub && sub.expiryDate === 0
                      ? 'Forever'
                      : 'None';

                  return (
                    <tr key={entry.user.id} className="hover:bg-slate-800/40">
                      <td className="p-3">
                        <div className="font-semibold text-white">{entry.user.name}</div>
                        <div className="text-[11px] text-slate-300">{entry.user.email}</div>
                      </td>
                      <td className="p-3">
                        {sub ? (
                          <span className="font-semibold text-blue-300">{sub.planName}</span>
                        ) : (
                          <span className="text-slate-300">Free Default</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-bold text-slate-200">
                          {entry.user.tier}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">
                        {sub?.startDate ? new Date(sub.startDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="p-3">
                        {sub ? (
                          isExpired ? (
                            <span className="text-red-400 font-semibold">Expired</span>
                          ) : (
                            <span className="text-emerald-400 font-semibold">
                              {typeof daysLeft === 'number' ? `${daysLeft} days remaining` : daysLeft}
                            </span>
                          )
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-[11px]">
                        {entry.user.generationLimits?.imagesRemaining ?? 0} imgs ·{' '}
                        {entry.user.generationLimits?.videosRemaining ?? 0} vids
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* PLAN CREATE / EDIT MODAL */}
      {/* ----------------------------------------------------------------------- */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="w-full max-w-2xl bg-[#070B14] border border-slate-800 rounded-3xl shadow-2xl p-5 space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span>{editingPlanId ? 'Edit Subscription Plan' : 'Create New Subscription Plan'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsPlanModalOpen(false)}
                className="p-1 rounded-full text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Plan Name: *
                  </label>
                  <input
                    type="text"
                    required
                    value={planForm.name}
                    onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                    placeholder="e.g. Pro Creator"
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Plan Subtitle / Tagline:
                  </label>
                  <input
                    type="text"
                    value={planForm.title}
                    onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
                    placeholder="e.g. Best for daily creative productivity"
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Plan Description:
                </label>
                <textarea
                  rows={2}
                  value={planForm.description}
                  onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                  placeholder="Summarize the core benefits and audience for this plan..."
                  className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Price in INR (₹): *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={planForm.priceINR}
                    onChange={(e) => setPlanForm({ ...planForm, priceINR: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white font-mono"
                  />
                  <span className="text-[10px] text-slate-300">Set 0 for Free tier</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Billing Cycle:
                  </label>
                  <select
                    value={planForm.billingCycle}
                    onChange={(e) => {
                      const cycle = e.target.value as PlanBillingCycle;
                      const days = cycle === 'yearly' ? 365 : cycle === 'monthly' ? 30 : cycle === 'free' ? 0 : 14;
                      const label = cycle === 'yearly' ? 'Year' : cycle === 'monthly' ? 'Month' : cycle === 'free' ? 'Free Forever' : `${days} Days`;
                      setPlanForm({
                        ...planForm,
                        billingCycle: cycle,
                        durationDays: days,
                        durationLabel: label,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="custom">Custom Duration</option>
                    <option value="free">Free Forever</option>
                    <option value="lifetime">Lifetime</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Duration (in Days):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={planForm.durationDays}
                    onChange={(e) => setPlanForm({ ...planForm, durationDays: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white font-mono"
                  />
                  <span className="text-[10px] text-slate-300">0 = permanent/free</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Duration Display Label:
                  </label>
                  <input
                    type="text"
                    value={planForm.durationLabel}
                    onChange={(e) => setPlanForm({ ...planForm, durationLabel: e.target.value })}
                    placeholder="e.g. Month, Year, 30 Days"
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Target User Tier:
                  </label>
                  <select
                    value={planForm.tier}
                    onChange={(e) => setPlanForm({ ...planForm, tier: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                  >
                    <option value="Free">Free</option>
                    <option value="Pro">Pro</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </div>
              </div>

              {/* AI Quotas */}
              <div className="p-3.5 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-white block">
                  AI Usage Limits & Generation Quotas:
                </span>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-0.5">Images Quota:</label>
                    <input
                      type="number"
                      min="0"
                      value={planForm.imagesQuota}
                      onChange={(e) => setPlanForm({ ...planForm, imagesQuota: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#11192E] border border-slate-700 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-0.5">Videos Quota:</label>
                    <input
                      type="number"
                      min="0"
                      value={planForm.videosQuota}
                      onChange={(e) => setPlanForm({ ...planForm, videosQuota: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#11192E] border border-slate-700 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-0.5">Audio Quota:</label>
                    <input
                      type="number"
                      min="0"
                      value={planForm.audioQuota}
                      onChange={(e) => setPlanForm({ ...planForm, audioQuota: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#11192E] border border-slate-700 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-0.5">Chats Quota:</label>
                    <input
                      type="number"
                      min="0"
                      value={planForm.chatsQuota}
                      onChange={(e) => setPlanForm({ ...planForm, chatsQuota: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#11192E] border border-slate-700 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Plan Features List */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Plan Features & Perks (Bullet Points):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={planForm.newFeatureInput}
                    onChange={(e) => setPlanForm({ ...planForm, newFeatureInput: e.target.value })}
                    placeholder="e.g. 4K Video exports & priority queue"
                    className="flex-1 px-3 py-1.5 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddFeature();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddFeature}
                    className="px-3 py-1.5 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200"
                  >
                    Add Bullet
                  </button>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1">
                  {planForm.features.map((feature, i) => (
                    <div
                      key={i}
                      className="p-2 rounded-xl bg-[#11192E] border border-slate-800 flex items-center justify-between text-xs text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{feature}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFeature(i)}
                        className="text-slate-300 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#0B1020] border border-slate-800 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                  <input
                    type="checkbox"
                    checked={planForm.isPopular}
                    onChange={(e) => setPlanForm({ ...planForm, isPopular: e.target.checked })}
                    className="rounded accent-blue-600"
                  />
                  <span>Mark as Popular</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                  <input
                    type="checkbox"
                    checked={planForm.isRecommended}
                    onChange={(e) => setPlanForm({ ...planForm, isRecommended: e.target.checked })}
                    className="rounded accent-blue-600"
                  />
                  <span>Mark as Recommended</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                  <input
                    type="checkbox"
                    checked={planForm.enabled}
                    onChange={(e) => setPlanForm({ ...planForm, enabled: e.target.checked })}
                    className="rounded accent-blue-600"
                  />
                  <span>Plan Enabled</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPlanModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-lg transition"
                >
                  {editingPlanId ? 'Save Changes' : 'Create Subscription Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* REJECT ORDER MODAL */}
      {/* ----------------------------------------------------------------------- */}
      {rejectOrderId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="w-full max-w-md bg-[#070B14] border border-slate-800 rounded-3xl p-5 space-y-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              <span>Reject Payment Verification</span>
            </h4>
            <p className="text-xs text-slate-300">
              Provide a clear reason for the rejection (e.g. UTR not matching statement, wrong amount paid, invalid reference).
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Transaction reference # could not be verified in official bank statement."
              className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectOrderId(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectOrder}
                className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* MANUAL GRANT MODAL */}
      {/* ----------------------------------------------------------------------- */}
      {isGrantModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="w-full max-w-md bg-[#070B14] border border-slate-800 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-sm font-bold text-white">Manual Grant Subscription</h4>
              <button
                type="button"
                onClick={() => setIsGrantModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleManualGrant} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Select User:
                </label>
                <select
                  value={grantUserId}
                  onChange={(e) => setGrantUserId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                >
                  {userSubs.map((entry) => (
                    <option key={entry.user.id} value={entry.user.id}>
                      {entry.user.name} ({entry.user.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Select Plan:
                </label>
                <select
                  value={grantPlanId}
                  onChange={(e) => setGrantPlanId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.priceINR === 0 ? 'Free' : `₹${p.priceINR}`} - {p.durationLabel})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Duration in Days:
                </label>
                <input
                  type="number"
                  min="1"
                  value={grantDurationDays}
                  onChange={(e) => setGrantDurationDays(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGrantModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow"
                >
                  Grant Subscription
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* USER PREVIEW MODAL */}
      {/* ----------------------------------------------------------------------- */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-4xl max-h-[90dvh] bg-[#070B14] border border-slate-800 rounded-3xl p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">
                  Live Admin Preview
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  How Plans Appear on the User Subscription Page
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans
                .filter((p) => p.enabled)
                .map((plan) => (
                  <div
                    key={plan.id}
                    className={`p-5 rounded-3xl border flex flex-col justify-between ${
                      plan.isPopular
                        ? 'border-blue-500 bg-gradient-to-b from-blue-950/30 to-[#0B1020] shadow-xl shadow-blue-500/10'
                        : plan.isRecommended
                        ? 'border-amber-500 bg-gradient-to-b from-amber-950/30 to-[#0B1020] shadow-xl shadow-amber-500/10'
                        : 'border-slate-800 bg-[#0B1020]'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          {plan.tier}
                        </span>
                        {plan.isPopular && (
                          <span className="px-2.5 py-0.5 rounded-full bg-blue-500 text-white font-bold text-[10px]">
                            POPULAR
                          </span>
                        )}
                        {plan.isRecommended && (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-black font-extrabold text-[10px]">
                            RECOMMENDED
                          </span>
                        )}
                      </div>

                      <h4 className="text-lg font-bold text-white">{plan.name}</h4>
                      {plan.title && (
                        <p className="text-xs text-blue-300 font-medium">{plan.title}</p>
                      )}

                      <div className="py-2">
                        <div className="text-3xl font-extrabold text-white">
                          {plan.priceINR === 0 ? '₹0' : `₹${plan.priceINR.toLocaleString('en-IN')}`}
                        </div>
                        <div className="text-xs text-slate-300">
                          per {plan.durationLabel || 'Month'} ({plan.durationDays > 0 ? `${plan.durationDays} days validity` : 'Free forever'})
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-slate-800">
                        {(plan.features || []).map((f, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-200">
                            <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled
                      className={`mt-6 w-full py-2.5 rounded-2xl text-xs font-bold transition ${
                        plan.isPopular || plan.isRecommended
                          ? 'gemini-gradient-bg text-white shadow-lg'
                          : 'bg-[#11192E] border border-slate-700 text-slate-200'
                      }`}
                    >
                      {plan.priceINR === 0 ? 'Current Plan' : 'Select Plan & Checkout'}
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
