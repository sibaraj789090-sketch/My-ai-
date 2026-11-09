import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const SECRETS_FILE = path.join(DATA_DIR, 'provider_secrets.json');

type SecretMap = Record<string, string>;

function loadSecretsMap(): SecretMap {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    }
    if (fs.existsSync(SECRETS_FILE)) {
      const raw = fs.readFileSync(SECRETS_FILE, 'utf-8');
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
