-- MY AI — Supabase PostgreSQL + Storage + Row Level Security Schema
-- Run this SQL in your Supabase SQL Editor to enable full cloud persistence.

-- 1. Profiles & Quotas
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT 'MY AI User',
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  tier TEXT NOT NULL DEFAULT 'Free' CHECK (tier IN ('Free', 'Pro', 'Enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  bio TEXT DEFAULT '',
  images_remaining INTEGER NOT NULL DEFAULT 10,
  videos_remaining INTEGER NOT NULL DEFAULT 3,
  audio_remaining INTEGER NOT NULL DEFAULT 5,
  chats_remaining INTEGER NOT NULL DEFAULT 100,
  total_images_quota INTEGER NOT NULL DEFAULT 10,
  total_videos_quota INTEGER NOT NULL DEFAULT 3,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Chats
CREATE TABLE IF NOT EXISTS public.chats (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_snippet TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT REFERENCES public.chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'complete',
  media_type TEXT DEFAULT 'text',
  media_data JSONB,
  attachments JSONB DEFAULT '[]'::jsonb,
  task_steps JSONB,
  canvas_data JSONB,
  model_used TEXT,
  intent_detected TEXT,
  processing_time_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Generation Jobs & Saved Library Items
CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_email TEXT,
  type TEXT NOT NULL CHECK (type IN ('image', 'video', 'audio', 'file', 'task')),
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  model TEXT NOT NULL,
  interaction_id TEXT,
  duration_seconds NUMERIC DEFAULT 0,
  cost_usd NUMERIC DEFAULT 0,
  output_url TEXT,
  thumbnail_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Notebooks
CREATE TABLE IF NOT EXISTS public.notebooks (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Admin & Provider Config
CREATE TABLE IF NOT EXISTS public.admin_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Policies: Users can access their own records; Admins can access all records
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users manage own chats" ON public.chats
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users manage own messages" ON public.messages
  FOR ALL USING (EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND c.user_id = auth.uid()));

CREATE POLICY "Users manage own jobs" ON public.generation_jobs
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users manage own notebooks" ON public.notebooks
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Only admins manage settings" ON public.admin_settings
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Storage bucket for generated images, videos, audio, and uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('myai-media', 'myai-media', true)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. Subscription Plans
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price_inr NUMERIC NOT NULL DEFAULT 0,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly', 'custom', 'lifetime', 'free')),
  duration_days INTEGER NOT NULL DEFAULT 30,
  duration_label TEXT NOT NULL DEFAULT 'Month',
  tier TEXT NOT NULL DEFAULT 'Pro',
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  limits JSONB NOT NULL DEFAULT '{"imagesQuota": 100, "videosQuota": 25, "audioQuota": 40, "chatsQuota": 1000}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 8. User Subscriptions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  plan_id TEXT REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  plan_name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'Pro',
  amount_paid_inr NUMERIC NOT NULL DEFAULT 0,
  order_id TEXT,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expiry_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  limits_granted JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 9. Payment Orders
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  plan_id TEXT REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  plan_name TEXT NOT NULL,
  amount_inr NUMERIC NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('upi_qr', 'upi_id', 'bank_transfer', 'cashfree')),
  status TEXT NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'approved', 'rejected', 'failed')),
  reference_number TEXT UNIQUE NOT NULL,
  user_transaction_ref TEXT,
  user_proof_notes TEXT,
  user_proof_screenshot_url TEXT,
  cashfree_order_id TEXT,
  cashfree_payment_session_id TEXT,
  rejection_reason TEXT,
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 10. Payment Transactions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES public.payment_orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  plan_id TEXT,
  amount_inr NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  gateway_status TEXT,
  gateway_transaction_id TEXT,
  raw_gateway_response JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 11. Payment Settings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_settings (
  id TEXT PRIMARY KEY DEFAULT 'current',
  upi_qr JSONB NOT NULL DEFAULT '{"enabled": true, "qrImageUrl": "", "upiId": "", "accountHolderName": ""}'::jsonb,
  upi_id JSONB NOT NULL DEFAULT '{"enabled": true, "upiId": "", "accountHolderName": ""}'::jsonb,
  bank_transfer JSONB NOT NULL DEFAULT '{"enabled": false, "accountHolderName": "", "bankName": "", "accountNumber": "", "ifscCode": ""}'::jsonb,
  cashfree JSONB NOT NULL DEFAULT '{"enabled": false, "environment": "sandbox", "appIdEnvVar": "CASHFREE_APP_ID"}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for all new tables
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read active subscription plans
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans
  FOR SELECT USING (enabled = TRUE OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Only admins manage subscription plans
CREATE POLICY "Only admins manage plans" ON public.subscription_plans
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Users can read their own subscriptions; Admins read all
CREATE POLICY "Users read own subscriptions" ON public.user_subscriptions
  FOR SELECT USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Only admins and system insert/update subscriptions
CREATE POLICY "Only admins manage subscriptions" ON public.user_subscriptions
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Users can read and insert their own orders; Admins can read and update all orders
CREATE POLICY "Users view own orders" ON public.payment_orders
  FOR SELECT USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Users create own orders" ON public.payment_orders
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own pending orders" ON public.payment_orders
  FOR UPDATE USING (user_id = auth.uid() AND status = 'pending_verification');

CREATE POLICY "Admins manage all orders" ON public.payment_orders
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Transactions
CREATE POLICY "Users view own transactions" ON public.payment_transactions
  FOR SELECT USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins manage transactions" ON public.payment_transactions
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Payment Settings: Public can read enabled payment methods; Admins can manage all
CREATE POLICY "Public read payment settings" ON public.payment_settings
  FOR SELECT USING (TRUE);

CREATE POLICY "Only admins manage payment settings" ON public.payment_settings
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
