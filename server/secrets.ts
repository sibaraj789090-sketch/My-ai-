import fs from 'fs';
import path from 'path';

const isServerless = !!(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NOW_REGION
);

const BUNDLED_DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_DIR = isServerless ? path.join('/tmp', 'myai_data') : BUNDLED_DATA_DIR;
const SECRETS_FILE = path.join(DATA_DIR, 'provider_secrets.json');
const BUNDLED_SECRETS_FILE = path.join(BUNDLED_DATA_DIR, 'provider_secrets.json');

type SecretMap = Record<string, string>;

function loadSecretsMap(): SecretMap {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
      } catch {
        // Ignore directory creation failure in read-only environments
      }
    }
    if (fs.existsSync(SECRETS_FILE)) {
      const raw = fs.readFileSync(SECRETS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as SecretMap;
      }
    } else if (isServerless && fs.existsSync(BUNDLED_SECRETS_FILE)) {
      const raw = fs.readFileSync(BUNDLED_SECRETS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as SecretMap;
      }
    }
  } catch (err) {
    console.warn('Could not read server secrets store:', err);
  }
  return {};
}

function writeSecretsMap(map: SecretMap): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(map, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch (err) {
    console.error('Failed to persist server secrets store:', err);
  }
}

export function setProviderSecret(providerId: string, apiKey: string): void {
  const cleaned = apiKey.trim();
  const map = loadSecretsMap();
  if (!cleaned) {
    delete map[providerId];
  } else {
    map[providerId] = cleaned;
  }
  writeSecretsMap(map);
}

export function deleteProviderSecret(providerId: string): void {
  const map = loadSecretsMap();
  if (providerId in map) {
    delete map[providerId];
    writeSecretsMap(map);
  }
}

export function resolveProviderSecret(
  providerId: string,
  apiKeyEnvVar?: string
): { key: string; source: 'env' | 'server_secret' | 'none' } {
  const envName = (apiKeyEnvVar || '').trim();
  if (envName) {
    const envVal = (process.env[envName] || '').trim();
    if (envVal && envVal !== 'MY_GEMINI_API_KEY') {
      return { key: envVal, source: 'env' };
    }
  }

  // Well-known alias fallbacks
  if (
    providerId.includes('gemini') ||
    providerId.includes('google') ||
    envName === 'GEMINI_API_KEY' ||
    envName === 'GOOGLE_API_KEY' ||
    envName === 'GOOGLE_GENAI_API_KEY' ||
    envName === 'API_KEY'
  ) {
    const gem = (
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      process.env.API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      ''
    ).trim();
    if (gem && gem !== 'MY_GEMINI_API_KEY' && gem.length > 8) {
      return { key: gem, source: 'env' };
    }
  }
  if (providerId.includes('hf') || providerId.includes('huggingface') || envName === 'HF_TOKEN' || envName === 'HUGGINGFACE_API_KEY') {
    const hf = (process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || '').trim();
    if (hf) return { key: hf, source: 'env' };
  }
  if (providerId.includes('photoroom') || envName === 'PHOTOROOM_API_KEY') {
    const pr = (process.env.PHOTOROOM_API_KEY || '').trim();
    if (pr) return { key: pr, source: 'env' };
  }
  if (providerId.includes('cashfree') || envName === 'CASHFREE_SECRET_KEY') {
    const cf = (process.env.CASHFREE_SECRET_KEY || '').trim();
    if (cf) return { key: cf, source: 'env' };
  }

  const map = loadSecretsMap();
  const stored = (map[providerId] || '').trim();
  if (stored) {
    return { key: stored, source: 'server_secret' };
  }

  return { key: '', source: 'none' };
}

export function getProviderSecretStatus(
  providerId: string,
  apiKeyEnvVar?: string
): { hasApiKey: boolean; keySource: 'env' | 'server_secret' | 'none'; maskedKey?: string } {
  const { key, source } = resolveProviderSecret(providerId, apiKeyEnvVar);
  if (!key) {
    return { hasApiKey: false, keySource: 'none' };
  }
  const maskedKey = key.length > 8 ? `••••${key.slice(-4)}` : '••••••';
  return { hasApiKey: true, keySource: source, maskedKey };
}
