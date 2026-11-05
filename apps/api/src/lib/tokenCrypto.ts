import crypto from 'crypto';

/**
 * AES-256-GCM encryption for third-party access tokens at rest (Meta page / WhatsApp tokens).
 * Key: MESSAGING_TOKEN_KEY — 32 bytes, as 64 hex chars or base64. Generate with `openssl rand -hex 32`.
 * Format: base64(iv).base64(tag).base64(ciphertext)
 */
function getKey(): Buffer {
    const raw = process.env.MESSAGING_TOKEN_KEY;
    if (!raw) throw new Error('MESSAGING_TOKEN_KEY not configured');
    const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('MESSAGING_TOKEN_KEY must be 32 bytes (64 hex chars or base64)');
    return key;
}

export function encryptToken(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}

export function decryptToken(enc: string): string {
    const [iv, tag, data] = enc.split('.').map(p => Buffer.from(p, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
