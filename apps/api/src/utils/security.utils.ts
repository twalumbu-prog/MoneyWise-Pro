import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

// Get the key from environment and validate it
const getEncryptionKey = (): Buffer => {
    const keyString = process.env.QB_TOKEN_ENCRYPTION_KEY;
    if (!keyString) {
        throw new Error('QB_TOKEN_ENCRYPTION_KEY is not defined in environment variables');
    }
    // The key should be a base64 encoded 32-byte string
    return Buffer.from(keyString, 'base64');
};

export const encrypt = (text: string): string => {
    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const tag = cipher.getAuthTag();

        // Format: iv:auth_tag:ciphertext
        return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
    } catch (error) {
        console.error('[Encryption] Error encrypting data:', error);
        throw new Error('Encryption failed');
    }
};

export const decrypt = (encryptedText: string): string => {
    try {
        const key = getEncryptionKey();
        const parts = encryptedText.split(':');

        if (parts.length !== 3) {
            throw new Error('Invalid encrypted text format');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const tag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('[Encryption] Error decrypting data:', error);
        throw new Error('Decryption failed');
    }
};
