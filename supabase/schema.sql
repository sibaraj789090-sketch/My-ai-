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
