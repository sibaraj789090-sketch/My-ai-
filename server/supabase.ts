import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedKey = '';

export function resolveSupabaseCredentials(customUrl?: string, customKey?: string): {
  url: string;
  key: string;
  isConfigured: boolean;
} {
  const envUrl = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  ).trim();

  const envKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  const url = (customUrl && customUrl.startsWith('http') ? customUrl : envUrl).trim();
  const key = (customKey && customKey.length > 8 ? customKey : envKey).trim();

  return {
    url,
    key,
    isConfigured: !!(url && key && url.startsWith('http')),
  };
}

export function getSupabaseClient(customUrl?: string, customKey?: string): SupabaseClient | null {
  const { url, key, isConfigured } = resolveSupabaseCredentials(customUrl, customKey);

  if (!isConfigured) {
    return null;
  }

  if (cachedClient && cachedUrl === url && cachedKey === key) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    cachedUrl = url;
    cachedKey = key;
    return cachedClient;
  } catch (err) {
    console.error('Supabase client initialization failed:', err);
    return null;
  }
}

export async function testSupabaseConnection(customUrl?: string, customKey?: string): Promise<{
  configured: boolean;
  connected: boolean;
  message: string;
}> {
  const { isConfigured } = resolveSupabaseCredentials(customUrl, customKey);
  if (!isConfigured) {
    return {
      configured: false,
      connected: false,
      message: 'SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) are not configured. Add them in Vercel / Environment Variables.',
    };
  }

  const client = getSupabaseClient(customUrl, customKey);
  if (!client) {
    return {
      configured: true,
      connected: false,
      message: 'Failed to initialize Supabase client with configured URL and Key.',
    };
  }

  try {
    const { error } = await client.from('profiles').select('id').limit(1);
    if (error) {
      if (
        error.code === 'PGRST116' ||
        error.message?.includes('does not exist') ||
        error.code === '42P01'
      ) {
        return {
          configured: true,
          connected: true,
          message: 'Connected to Supabase PostgreSQL database. (Tip: execute supabase/schema.sql in your Supabase SQL editor to create tables).',
        };
      }
      return {
        configured: true,
        connected: true,
        message: `Connected to Supabase instance (${error.message}).`,
      };
    }
    return {
      configured: true,
      connected: true,
      message: 'Connected to Supabase PostgreSQL & Storage.',
    };
  } catch (err: any) {
    cachedClient = null;
    cachedUrl = '';
    cachedKey = '';
    return {
      configured: true,
      connected: false,
      message: err?.message || 'Unable to reach Supabase instance. Check network or credentials.',
    };
  }
}

export async function uploadMediaToSupabase(
  client: SupabaseClient | null,
  fileName: string,
  base64Data: string,
  mimeType: string
): Promise<string | null> {
  if (!client) return null;
  try {
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const storagePath = `uploads/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const { error } = await client.storage.from('myai-media').upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });

    if (error) {
      return null;
    }

    const { data } = client.storage.from('myai-media').getPublicUrl(storagePath);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}
