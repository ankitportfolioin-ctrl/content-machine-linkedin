import crypto from 'crypto';

const KEY_ENV = 'SOCIAL_CONNECTOR_KEY';

/**
 * AES-256-GCM token vault for optional social connectors.
 *
 * The key comes from SOCIAL_CONNECTOR_KEY (64 hex chars = 32 bytes).
 * When the key is missing or invalid, encryption/decryption throw a plain
 * Error naming the missing server configuration — callers translate that
 * into an honest NOT_CONFIGURED connector state. Tokens are NEVER logged
 * and NEVER sent to the frontend.
 */
function loadKey(): Buffer {
  const raw = (process.env[KEY_ENV] ?? '').trim();
  if (!raw) {
    throw new Error(
      'Connector storage is not configured on this server (SOCIAL_CONNECTOR_KEY is missing). ' +
        'Set it to 64 hex characters, then reconnect.',
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      'Connector storage is misconfigured on this server (SOCIAL_CONNECTOR_KEY must be 64 hex characters).',
    );
  }
  return Buffer.from(raw, 'hex');
}

export function isTokenVaultConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(plaintext: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptToken(payload: string): string {
  const key = loadKey();
  const parts = payload.split(':');
  if (parts.length !== 3) throw new Error('Stored connector credential is unreadable.');
  const [ivHex, tagHex, dataHex] = parts as [string, string, string];
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
