import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedKey = '';

export function getSupabaseClient(customUrl?: string, customKey?: string): SupabaseClient | null {
  const url = (customUrl || process.env.SUPABASE_URL || '').trim();
  const key = (customKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

  if (!url || !key || !url.startsWith('http')) {
    return null;
  }

  if (cachedClient && cachedUrl === url && cachedKey === key) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
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
  connected: boolean;
  message: string;
}> {
  const client = getSupabaseClient(customUrl, customKey);
  if (!client) {
    return {
      connected: false,
      message: 'SUPABASE_URL and SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are not configured.',
    };
  }

  try {
    const { error } = await client.from('profiles').select('id').limit(1);
    if (error) {
      return {
        connected: true,
        message: `Connected to Supabase URL, schema check returned: ${error.message}. Run supabase/schema.sql in your SQL Editor.`,
      };
    }
    return {
      connected: true,
      message: 'Connected to Supabase PostgreSQL & Storage.',
    };
  } catch (err: any) {
    return {
      connected: false,
      message: err?.message || 'Unable to reach Supabase instance.',
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
