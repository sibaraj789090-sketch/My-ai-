import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Sparkles,
  Check,
  QrCode,
  Building,
  Zap,
  Copy,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  History,
  FileCheck,
  AlertCircle,
} from 'lucide-react';
import {
  SubscriptionPlan,
  UserAccount,
  PaymentSettings,
  PaymentOrder,
  UserSubscription,
} from '../types';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount | null;
  onWorkspaceReload: () => Promise<void>;
  initialSelectedPlanId?: string;
}

type SubscriptionView = 'plans' | 'checkout' | 'order_success' | 'history';

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onWorkspaceReload,
  initialSelectedPlanId,
}) => {
  const [view, setView] = useState<SubscriptionView>('plans');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [availableMethods, setAvailableMethods] = useState<any[]>([]);
  const [myOrders, setMyOrders] = useState<PaymentOrder[]>([]);
  const [activeSub, setActiveSub] = useState<UserSubscription | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Checkout flow state
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'upi_qr' | 'upi_id' | 'bank_transfer' | 'cashfree'>('upi_qr');
  const [userTransactionRef, setUserTransactionRef] = useState('');
  const [userProofNotes, setUserProofNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<PaymentOrder | null>(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [copyNotice, setCopyNotice] = useState('');

  // Cashfree verification polling
  const [isVerifyingCashfree, setIsVerifyingCashfree] = useState(false);

  const loadSubscriptionInfo = async () => {
    setLoading(true);
    try {
      const [plansRes, methodsRes, statusRes, ordersRes] = await Promise.all([
        fetch('/api/subscription/plans'),
        fetch('/api/subscription/payment-methods'),
        fetch('/api/subscription/my-status'),
        fetch('/api/subscription/my-orders'),
      ]);

      const plansData = await plansRes.json();
      const methodsData = await methodsRes.json();
      const statusData = await statusRes.json();
      const ordersData = await ordersRes.json();

      const loadedPlans: SubscriptionPlan[] = plansData.plans || [];
      setPlans(loadedPlans);
      setPaymentSettings(methodsData.settings || null);
      setAvailableMethods(methodsData.methods || []);
      setActiveSub(statusData.activeSubscription || null);
      setDaysRemaining(statusData.daysRemaining ?? 0);
      setMyOrders(ordersData.orders || []);

      if (initialSelectedPlanId) {
        const found = loadedPlans.find((p) => p.id === initialSelectedPlanId);
        if (found) {
          setSelectedPlan(found);
          setView('checkout');
        }
      }
    } catch {
      // ignore network errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSubscriptionInfo();
    }
  }, [isOpen, initialSelectedPlanId]);

  if (!isOpen) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyNotice(`Copied ${label} to clipboard!`);
    setTimeout(() => setCopyNotice(''), 2500);
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setCheckoutError('');
    setUserTransactionRef('');
    setUserProofNotes('');

    // If Free plan (₹0), directly activate without payment
    if (plan.priceINR === 0) {
      handleDirectFreeActivation(plan);
      return;
    }

    // Set default payment method based on what is enabled
    if (paymentSettings?.upiQr?.enabled) {
      setSelectedMethod('upi_qr');
    } else if (paymentSettings?.upiId?.enabled) {
      setSelectedMethod('upi_id');
    } else if (paymentSettings?.bankTransfer?.enabled) {
      setSelectedMethod('bank_transfer');
    } else if (paymentSettings?.cashfree?.enabled) {
      setSelectedMethod('cashfree');
    }
    setView('checkout');
  };

  const handleDirectFreeActivation = async (plan: SubscriptionPlan) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/subscription/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, paymentMethod: 'upi_qr' }),
      });
      const data = await res.json();
      if (res.ok) {
        await onWorkspaceReload();
        await loadSubscriptionInfo();
        setView('plans');
      } else {
        setCheckoutError(data.error || 'Failed to activate plan.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setCheckoutError('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/subscription/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlan.id,
          paymentMethod: selectedMethod,
          userTransactionRef: userTransactionRef.trim() || undefined,
          userProofNotes: userProofNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCheckoutError(data.error || 'Failed to initiate payment order.');
        setIsSubmitting(false);
        return;
      }

      setCreatedOrder(data.order);

      // If Cashfree, open Cashfree checkout or redirect
      if (selectedMethod === 'cashfree') {
        if (data.paymentSessionId) {
          // Trigger server-side verification check
          setView('order_success');
          checkCashfreeOrderStatus(data.order.id);
        } else {
          setView('order_success');
        }
      } else {
        setView('order_success');
      }

      await loadSubscriptionInfo();
    } catch (err: any) {
      setCheckoutError(err?.message || 'Network error processing checkout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateProof = async (orderId: string) => {
    if (!userTransactionRef.trim() && !userProofNotes.trim()) {
      setCheckoutError('Please enter your 12-digit transaction UTR / Reference ID.');
      return;
    }
    setIsSubmitting(true);
    setCheckoutError('');
    try {
      const res = await fetch(`/api/subscription/orders/${orderId}/submit-proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userTransactionRef: userTransactionRef.trim(),
          userProofNotes: userProofNotes.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedOrder(data.order);
        await loadSubscriptionInfo();
      } else {
        setCheckoutError(data.error || 'Failed to submit proof.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkCashfreeOrderStatus = async (orderId: string) => {
    setIsVerifyingCashfree(true);
    try {
      const res = await fetch(`/api/subscription/orders/${orderId}/verify-cashfree`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.isPaid) {
        setCreatedOrder(data.order);
        await onWorkspaceReload();
        await loadSubscriptionInfo();
      }
    } finally {
      setIsVerifyingCashfree(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-0 sm:p-4">
      <div className="w-full h-full sm:h-[92dvh] sm:max-w-5xl bg-[#070B14] sm:border border-slate-800 sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-[#050811] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl gemini-gradient-bg flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>MY AI Premium Plans</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  INR (₹) Pricing
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Unlock 4K AI image synthesis, cinematic video generation, and priority quota
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setView(view === 'history' ? 'plans' : 'history')}
              className="px-3 py-1.5 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
            >
              <History className="w-3.5 h-3.5 text-blue-400" />
              <span>{view === 'history' ? 'Browse Plans' : 'Order History'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Copy Notification Toast */}
        {copyNotice && (
          <div className="bg-emerald-600 text-white text-xs font-semibold text-center py-1.5 px-4 animate-in fade-in">
            {copyNotice}
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Active Subscription Banner */}
          {activeSub ? (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-[#0B1020] to-purple-950/40 border border-blue-500/40 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                    Current Active Plan:
                  </span>
                  <span className="text-sm font-extrabold text-white">{activeSub.planName}</span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold">
                    ACTIVE
                  </span>
                </div>
                <div className="text-xs text-slate-300">
                  {activeSub.expiryDate > 0 ? (
                    <>
                      Valid until{' '}
                      <span className="font-semibold text-white">
                        {new Date(activeSub.expiryDate).toLocaleDateString()}
                      </span>{' '}
                      ({daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Expiring today'})
                    </>
                  ) : (
                    <span className="text-emerald-300 font-semibold">Free Forever / Permanent Tier</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right text-xs">
                  <div className="text-slate-300">Quotas Remaining:</div>
                  <div className="font-mono font-bold text-white">
                    {currentUser?.generationLimits?.imagesRemaining ?? 0} Images ·{' '}
                    {currentUser?.generationLimits?.videosRemaining ?? 0} Videos
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-[#0B1020] border border-slate-800 flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-slate-300" />
                <span>
                  You are currently on the <strong className="text-white">Free Starter</strong> plan. Upgrade below to remove limits and unlock premium models.
                </span>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* VIEW: PLANS GRID & COMPARISON */}
          {/* ----------------------------------------------------------------- */}
          {view === 'plans' && (
            <div className="space-y-8">
              {/* Plans Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {plans.map((plan) => {
                  const isCurrent = activeSub?.planId === plan.id;
                  return (
                    <div
                      key={plan.id}
                      className={`p-5 rounded-3xl border flex flex-col justify-between transition relative ${
                        plan.isPopular
                          ? 'border-blue-500 bg-gradient-to-b from-blue-950/30 to-[#0B1020] shadow-xl shadow-blue-500/10'
                          : plan.isRecommended
                          ? 'border-amber-500 bg-gradient-to-b from-amber-950/30 to-[#0B1020] shadow-xl shadow-amber-500/10'
                          : 'border-slate-800 bg-[#0B1020] hover:border-slate-700'
                      }`}
                    >
                      {/* Top Badges */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                            {plan.tier}
                          </span>
                          {plan.isPopular && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500 text-white font-extrabold text-[10px] tracking-wide">
                              POPULAR
                            </span>
                          )}
                          {plan.isRecommended && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black font-black text-[10px] tracking-wide">
                              RECOMMENDED
                            </span>
                          )}
                        </div>

                        <div>
                          <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                          {plan.title && (
                            <p className="text-xs text-blue-300 font-medium mt-0.5">{plan.title}</p>
                          )}
                        </div>

                        <div className="py-2">
                          <div className="text-3xl font-black text-white tracking-tight">
                            {plan.priceINR === 0 ? '₹0' : `₹${plan.priceINR.toLocaleString('en-IN')}`}
                          </div>
                          <div className="text-xs text-slate-300 mt-0.5">
                            {plan.priceINR === 0
                              ? 'Free forever'
                              : `per ${plan.durationLabel || 'Month'} (${plan.durationDays} days)`}
                          </div>
                        </div>

                        {/* Quotas Pill */}
                        <div className="p-2.5 rounded-xl bg-[#11192E] border border-slate-700/50 space-y-1 text-[11px]">
                          <div className="flex items-center justify-between text-slate-300">
                            <span>AI Photos:</span>
                            <span className="font-mono font-bold text-white">
                              {plan.limits?.imagesQuota}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-300">
                            <span>Cinematic Videos:</span>
                            <span className="font-mono font-bold text-white">
                              {plan.limits?.videosQuota}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-300">
                            <span>Music & Audio:</span>
                            <span className="font-mono font-bold text-white">
                              {plan.limits?.audioQuota}
                            </span>
                          </div>
                        </div>

                        {/* Feature Bullets */}
                        <div className="space-y-2 pt-2 border-t border-slate-800">
                          {(plan.features || []).map((feature, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-slate-200">
                              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                              <span className="leading-snug">{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Select Action Button */}
                      <button
                        type="button"
                        onClick={() => handleSelectPlan(plan)}
                        disabled={isCurrent}
                        className={`mt-6 w-full py-2.5 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                          isCurrent
                            ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
                            : plan.isPopular || plan.isRecommended
                            ? 'gemini-gradient-bg text-white shadow-lg hover:opacity-90'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        <span>{isCurrent ? 'Current Plan' : plan.priceINR === 0 ? 'Choose Free' : 'Upgrade Now'}</span>
                        {!isCurrent && <ArrowRight className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Feature Comparison Matrix */}
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    Compare Plan Capabilities & Features
                  </h3>
                  <p className="text-xs text-slate-300">
                    Transparent limits, model access, and creative studio tools
                  </p>
                </div>

                <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-[#0B1020]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#050811] text-slate-300 uppercase tracking-wider text-[11px] border-b border-slate-800">
                      <tr>
                        <th className="p-3.5 font-semibold">Feature / Quota</th>
                        <th className="p-3.5 font-semibold">Free Starter</th>
                        <th className="p-3.5 font-semibold text-blue-400">Pro Creator</th>
                        <th className="p-3.5 font-semibold text-amber-400">Super AI Enterprise</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      <tr>
                        <td className="p-3.5 font-medium text-white">Price</td>
                        <td className="p-3.5">₹0</td>
                        <td className="p-3.5 font-bold text-white">₹499 / mo or ₹4,999 / yr</td>
                        <td className="p-3.5 font-bold text-white">₹9,999 / yr</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 font-medium text-white">AI Image Generation</td>
                        <td className="p-3.5">15 photos / day</td>
                        <td className="p-3.5 text-blue-300 font-semibold">250–3,500 photos</td>
                        <td className="p-3.5 text-amber-300 font-semibold">10,000 photos</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 font-medium text-white">Hugging Face FLUX & PhotoRoom</td>
                        <td className="p-3.5 text-slate-300">Standard FLUX only</td>
                        <td className="p-3.5 text-emerald-400 font-semibold">Full Priority Access</td>
                        <td className="p-3.5 text-emerald-400 font-semibold">Dedicated Concurrency</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 font-medium text-white">Subject Preservation & Editing</td>
                        <td className="p-3.5 text-slate-300">Basic Prompt Edit</td>
                        <td className="p-3.5 text-emerald-400 font-semibold">Multi-photo & Person Blend</td>
                        <td className="p-3.5 text-emerald-400 font-semibold">Studio Grade</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 font-medium text-white">Cinematic Video Export</td>
                        <td className="p-3.5">720p resolution</td>
                        <td className="p-3.5 text-blue-300 font-semibold">1080p Full HD</td>
                        <td className="p-3.5 text-amber-300 font-semibold">4K Cinema Quality</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 font-medium text-white">Generation Queue</td>
                        <td className="p-3.5">Standard Queue</td>
                        <td className="p-3.5 text-emerald-400 font-semibold">Priority 2x Speed</td>
                        <td className="p-3.5 text-amber-300 font-semibold">Instant VIP Concurrency</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 font-medium text-white">Support & Community</td>
                        <td className="p-3.5">Community Help</td>
                        <td className="p-3.5">Fast Email Support</td>
                        <td className="p-3.5 text-amber-300 font-semibold">24/7 Dedicated Support</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* VIEW: CHECKOUT SCREEN */}
          {/* ----------------------------------------------------------------- */}
          {view === 'checkout' && selectedPlan && (
            <div className="max-w-2xl mx-auto space-y-6">
              <button
                type="button"
                onClick={() => setView('plans')}
                className="text-xs font-semibold text-blue-400 hover:underline flex items-center gap-1"
              >
                ← Back to Plans
              </button>

              {/* Order Summary Card */}
              <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">
                    Selected Plan:
                  </span>
                  <h3 className="text-base font-bold text-white">{selectedPlan.name}</h3>
                  <p className="text-xs text-slate-300">
                    Validity: {selectedPlan.durationDays} days ({selectedPlan.durationLabel})
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-300 block">Total Amount:</span>
                  <span className="text-2xl font-black text-white">
                    ₹{selectedPlan.priceINR.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {checkoutError && (
                <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/40 text-xs font-medium text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{checkoutError}</span>
                </div>
              )}

              {/* Select Payment Method */}
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Select Payment Method:
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* UPI QR */}
                  {paymentSettings?.upiQr?.enabled && (
                    <button
                      type="button"
                      onClick={() => setSelectedMethod('upi_qr')}
                      className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 ${
                        selectedMethod === 'upi_qr'
                          ? 'border-blue-500 bg-blue-600/15 text-white'
                          : 'border-slate-800 bg-[#0B1020] text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <QrCode className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-white">UPI QR Code</div>
                        <div className="text-[11px] text-slate-300 mt-0.5">
                          Scan with PhonePe, GPay, Paytm, BHIM
                        </div>
                      </div>
                    </button>
                  )}

                  {/* UPI ID */}
                  {paymentSettings?.upiId?.enabled && (
                    <button
                      type="button"
                      onClick={() => setSelectedMethod('upi_id')}
                      className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 ${
                        selectedMethod === 'upi_id'
                          ? 'border-blue-500 bg-blue-600/15 text-white'
                          : 'border-slate-800 bg-[#0B1020] text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <Zap className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-white">Direct UPI ID</div>
                        <div className="text-[11px] text-slate-300 mt-0.5">
                          Transfer to official verified UPI ID
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Bank Transfer */}
                  {paymentSettings?.bankTransfer?.enabled && (
                    <button
                      type="button"
                      onClick={() => setSelectedMethod('bank_transfer')}
                      className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 ${
                        selectedMethod === 'bank_transfer'
                          ? 'border-blue-500 bg-blue-600/15 text-white'
                          : 'border-slate-800 bg-[#0B1020] text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <Building className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-white">Bank Transfer</div>
                        <div className="text-[11px] text-slate-300 mt-0.5">
                          Direct IMPS / NEFT transfer
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Cashfree Gateway */}
                  {paymentSettings?.cashfree?.enabled && (
                    <button
                      type="button"
                      onClick={() => setSelectedMethod('cashfree')}
                      className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 ${
                        selectedMethod === 'cashfree'
                          ? 'border-blue-500 bg-blue-600/15 text-white'
                          : 'border-slate-800 bg-[#0B1020] text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <CreditCard className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-white">Cashfree Gateway</div>
                        <div className="text-[11px] text-slate-300 mt-0.5">
                          Instant card & netbanking activation
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Dynamic Payment Details Screen */}
              <div className="p-5 rounded-3xl bg-[#0B1020] border border-slate-800 space-y-4">
                {/* Method A: QR CODE */}
                {selectedMethod === 'upi_qr' && (
                  <div className="space-y-4">
                    <div className="text-center space-y-2">
                      <span className="text-xs font-semibold text-slate-300 block">
                        Scan with any UPI App and pay exact amount:
                      </span>
                      <div className="text-2xl font-black text-white">
                        ₹{selectedPlan.priceINR.toLocaleString('en-IN')}
                      </div>

                      {paymentSettings?.upiQr?.qrImageUrl ? (
                        <div className="inline-block p-3 rounded-2xl bg-white border border-slate-700 shadow-xl">
                          <img
                            src={paymentSettings.upiQr.qrImageUrl}
                            alt="Payment QR"
                            className="w-48 h-48 object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-48 h-48 mx-auto rounded-2xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center p-3 text-slate-300 text-xs">
                          <QrCode className="w-8 h-8 text-slate-300 mb-2" />
                          <span>QR code provided by Admin</span>
                        </div>
                      )}

                      <div className="pt-2 text-xs text-slate-300 flex items-center justify-center gap-2">
                        <span>UPI ID:</span>
                        <span className="font-mono font-bold text-white">
                          {paymentSettings?.upiQr?.upiId || 'myai@icici'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(paymentSettings?.upiQr?.upiId || 'myai@icici', 'UPI ID')
                          }
                          className="p-1 rounded-lg bg-[#11192E] hover:bg-slate-800 text-slate-300"
                          title="Copy UPI ID"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {paymentSettings?.upiQr?.accountHolderName && (
                        <div className="text-xs text-slate-300">
                          Account Holder: <strong className="text-white">{paymentSettings.upiQr.accountHolderName}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Method B: DIRECT UPI ID */}
                {selectedMethod === 'upi_id' && (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-300">
                      Transfer exact plan amount of{' '}
                      <strong className="text-white">₹{selectedPlan.priceINR.toLocaleString('en-IN')}</strong> to the verified UPI ID below:
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[#11192E] border border-slate-700 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] text-slate-300 block">Official UPI ID:</span>
                        <span className="font-mono text-sm font-bold text-white">
                          {paymentSettings?.upiId?.upiId || 'myai@icici'}
                        </span>
                        {paymentSettings?.upiId?.accountHolderName && (
                          <span className="text-xs text-slate-300 block mt-0.5">
                            Name: {paymentSettings.upiId.accountHolderName}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(paymentSettings?.upiId?.upiId || 'myai@icici', 'UPI ID')
                        }
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-1.5 transition"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy UPI ID</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Method C: BANK TRANSFER */}
                {selectedMethod === 'bank_transfer' && (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-300">
                      Initiate an IMPS, NEFT, or RTGS bank transfer of{' '}
                      <strong className="text-white">₹{selectedPlan.priceINR.toLocaleString('en-IN')}</strong> using the verified details:
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[#11192E] border border-slate-700 space-y-2 text-xs">
                      <div className="flex items-center justify-between py-1 border-b border-slate-800">
                        <span className="text-slate-300">Account Holder Name:</span>
                        <span className="font-bold text-white">
                          {paymentSettings?.bankTransfer?.accountHolderName || 'MY AI Technologies Pvt Ltd'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-800">
                        <span className="text-slate-300">Bank Name:</span>
                        <span className="font-bold text-white">
                          {paymentSettings?.bankTransfer?.bankName || 'HDFC Bank'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-800">
                        <span className="text-slate-300">Account Number:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white">
                            {paymentSettings?.bankTransfer?.accountNumber || '50200088991122'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                paymentSettings?.bankTransfer?.accountNumber || '50200088991122',
                                'Account Number'
                              )
                            }
                            className="p-1 rounded bg-slate-800 text-slate-300"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-800">
                        <span className="text-slate-300">IFSC Code:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white">
                            {paymentSettings?.bankTransfer?.ifscCode || 'HDFC0001234'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                paymentSettings?.bankTransfer?.ifscCode || 'HDFC0001234',
                                'IFSC Code'
                              )
                            }
                            className="p-1 rounded bg-slate-800 text-slate-300"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      {paymentSettings?.bankTransfer?.branchName && (
                        <div className="flex items-center justify-between py-1">
                          <span className="text-slate-300">Branch Name:</span>
                          <span className="text-slate-200">
                            {paymentSettings.bankTransfer.branchName}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Method D: CASHFREE */}
                {selectedMethod === 'cashfree' && (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                      You will be directed through Cashfree secure gateway. Upon successful transaction, your subscription will activate automatically via server-side verification.
                    </div>
                  </div>
                )}

                {/* Manual Methods: UTR Submission Form */}
                {selectedMethod !== 'cashfree' && (
                  <div className="pt-2 border-t border-slate-800 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-white mb-1">
                        Enter 12-Digit Transaction Reference / UTR Number: *
                      </label>
                      <input
                        type="text"
                        required
                        value={userTransactionRef}
                        onChange={(e) => setUserTransactionRef(e.target.value)}
                        placeholder="e.g. 432109876543 (from GPay / PhonePe / Paytm receipt)"
                        className="w-full px-3.5 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white font-mono placeholder:text-slate-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Optional Payment Notes / Payer Name:
                      </label>
                      <input
                        type="text"
                        value={userProofNotes}
                        onChange={(e) => setUserProofNotes(e.target.value)}
                        placeholder="e.g. Paid via PhonePe from Rahul's bank account"
                        className="w-full px-3.5 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCreateOrder}
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-2xl gemini-gradient-bg text-white text-xs font-bold shadow-lg hover:opacity-95 transition disabled:opacity-50"
                >
                  {isSubmitting
                    ? 'Processing Order...'
                    : selectedMethod === 'cashfree'
                    ? `Proceed to Pay ₹${selectedPlan.priceINR.toLocaleString('en-IN')}`
                    : 'Submit Payment Reference for Verification'}
                </button>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* VIEW: ORDER SUCCESS & VERIFICATION STATUS */}
          {/* ----------------------------------------------------------------- */}
          {view === 'order_success' && createdOrder && (
            <div className="max-w-xl mx-auto space-y-5 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white">Payment Order Registered!</h3>
                <p className="text-xs text-slate-300">
                  Your order has been recorded with reference number:
                </p>
                <div className="font-mono text-base font-extrabold text-blue-400 pt-1 select-all">
                  #{createdOrder.referenceNumber}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 text-xs text-left space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Plan:</span>
                  <span className="font-bold text-white">{createdOrder.planName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Amount:</span>
                  <span className="font-bold text-white">
                    ₹{createdOrder.amountINR.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Status:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                      createdOrder.status === 'approved'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300 animate-pulse'
                    }`}
                  >
                    {createdOrder.status === 'approved'
                      ? 'Approved & Active'
                      : 'Pending Verification'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Transaction Reference:</span>
                  <span className="font-mono text-white">
                    {createdOrder.userTransactionRef || 'Pending submission'}
                  </span>
                </div>
              </div>

              {createdOrder.paymentMethod === 'cashfree' ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => checkCashfreeOrderStatus(createdOrder.id)}
                    disabled={isVerifyingCashfree}
                    className="w-full py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition disabled:opacity-50"
                  >
                    {isVerifyingCashfree
                      ? 'Checking Gateway Status...'
                      : 'Verify Cashfree Payment Status'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {!createdOrder.userTransactionRef && (
                    <div className="p-3.5 rounded-2xl bg-[#11192E] border border-slate-700 text-left space-y-2">
                      <span className="text-xs font-bold text-white block">
                        Update Transaction UTR:
                      </span>
                      <input
                        type="text"
                        value={userTransactionRef}
                        onChange={(e) => setUserTransactionRef(e.target.value)}
                        placeholder="Enter 12-digit UTR number"
                        className="w-full px-3 py-1.5 rounded-xl bg-black/40 border border-slate-700 text-xs text-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateProof(createdOrder.id)}
                        disabled={isSubmitting}
                        className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition"
                      >
                        Submit UTR Number
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Our team verifies all UPI and bank transfers against official banking statements. Once verified, your subscription and high-speed generation quotas will activate automatically.
                  </p>
                </div>
              )}

              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => setView('plans')}
                  className="px-5 py-2 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200"
                >
                  Return to Plans
                </button>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* VIEW: ORDER HISTORY */}
          {/* ----------------------------------------------------------------- */}
          {view === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-400" />
                  <span>My Payment & Subscription History</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setView('plans')}
                  className="text-xs font-semibold text-blue-400 hover:underline"
                >
                  ← Browse Plans
                </button>
              </div>

              {myOrders.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#0B1020] border border-slate-800 text-center text-xs text-slate-300">
                  No payment orders found. When you select a plan, your orders and receipts will appear here.
                </div>
              ) : (
                <div className="space-y-3">
                  {myOrders.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white">
                            #{ord.referenceNumber}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                              ord.status === 'approved'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : ord.status === 'pending_verification'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-red-500/20 text-red-300 border-red-500/40'
                            }`}
                          >
                            {ord.status === 'pending_verification'
                              ? 'Pending Verification'
                              : ord.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-slate-300">
                          {ord.planName} • {new Date(ord.createdAt).toLocaleString()}
                        </div>
                        {ord.userTransactionRef && (
                          <div className="text-[11px] text-slate-300 font-mono">
                            UTR: {ord.userTransactionRef}
                          </div>
                        )}
                        {ord.rejectionReason && (
                          <div className="text-[11px] text-red-400">
                            Reason: {ord.rejectionReason}
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        <div className="text-base font-extrabold text-white">
                          ₹{ord.amountINR.toLocaleString('en-IN')}
                        </div>
                        <div className="text-[11px] text-slate-300 uppercase tracking-wider">
                          {ord.paymentMethod.replace('_', ' ')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
