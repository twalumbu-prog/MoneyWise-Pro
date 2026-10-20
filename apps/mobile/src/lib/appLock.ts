import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * App lock: a 4-digit PIN (plus Face ID / fingerprint) that guards the app on this device.
 *
 * The PIN never leaves the phone. Only a salted SHA-256 of it is stored, in the iOS Keychain / Android Keystore via
 * SecureStore. Forgetting it is handled by emailing a code to the account address (see userService.requestPinRecovery),
 * after which a new PIN is chosen. Settings are per signed-in person, so two people sharing a phone don't share a PIN.
 */
export const PIN_LENGTH = 4;
const key = (userId: string, name: string) => `applock_${name}_${userId.replace(/-/g, '')}`;

export interface LockConfig { enabled: boolean; biometric: boolean }

export async function readLockConfig(userId: string): Promise<LockConfig> {
    try {
        const [hash, bio] = await Promise.all([
            SecureStore.getItemAsync(key(userId, 'hash')),
            SecureStore.getItemAsync(key(userId, 'bio')),
        ]);
        return { enabled: !!hash, biometric: !!hash && bio === '1' };
    } catch {
        return { enabled: false, biometric: false };
    }
}

async function digest(salt: string, pin: string): Promise<string> {
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function setPin(userId: string, pin: string): Promise<void> {
    if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) throw new Error(`The PIN must be ${PIN_LENGTH} digits.`);
    const salt = Array.from(await Crypto.getRandomBytesAsync(16)).map((b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(key(userId, 'salt'), salt);
    await SecureStore.setItemAsync(key(userId, 'hash'), await digest(salt, pin));
    await SecureStore.deleteItemAsync(key(userId, 'fails')).catch(() => undefined);
}

export async function clearPin(userId: string): Promise<void> {
    for (const n of ['hash', 'salt', 'bio', 'fails', 'until']) await SecureStore.deleteItemAsync(key(userId, n)).catch(() => undefined);
}

export async function setBiometric(userId: string, on: boolean): Promise<void> {
    if (on) await SecureStore.setItemAsync(key(userId, 'bio'), '1'); else await SecureStore.deleteItemAsync(key(userId, 'bio'));
}

export type PinCheck = { ok: true } | { ok: false; lockedForSeconds?: number; attemptsLeft?: number };

const MAX_FAILS = 5;
const lockoutSeconds = (fails: number) => Math.min(15 * 60, 30 * 2 ** Math.max(0, Math.floor(fails / MAX_FAILS) - 1));

/** Checks a PIN, counting wrong tries: 5 misses lock entry for 30 s, then longer. */
export async function verifyPin(userId: string, pin: string): Promise<PinCheck> {
    const until = Number(await SecureStore.getItemAsync(key(userId, 'until')) ?? 0);
    if (until > Date.now()) return { ok: false, lockedForSeconds: Math.ceil((until - Date.now()) / 1000) };

    const [salt, stored] = await Promise.all([SecureStore.getItemAsync(key(userId, 'salt')), SecureStore.getItemAsync(key(userId, 'hash'))]);
    if (!salt || !stored) return { ok: false };
    if ((await digest(salt, pin)) === stored) {
        await SecureStore.deleteItemAsync(key(userId, 'fails')).catch(() => undefined);
        await SecureStore.deleteItemAsync(key(userId, 'until')).catch(() => undefined);
        return { ok: true };
    }
    const fails = Number(await SecureStore.getItemAsync(key(userId, 'fails')) ?? 0) + 1;
    await SecureStore.setItemAsync(key(userId, 'fails'), String(fails));
    if (fails % MAX_FAILS === 0) {
        const secs = lockoutSeconds(fails);
        await SecureStore.setItemAsync(key(userId, 'until'), String(Date.now() + secs * 1000));
        return { ok: false, lockedForSeconds: secs };
    }
    return { ok: false, attemptsLeft: MAX_FAILS - (fails % MAX_FAILS) };
}

export interface BiometricInfo { available: boolean; kind: 'face' | 'fingerprint' | 'iris' | 'biometrics' }

export async function getBiometricInfo(): Promise<BiometricInfo> {
    try {
        const [hasHw, enrolled, types] = await Promise.all([
            LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync(), LocalAuthentication.supportedAuthenticationTypesAsync(),
        ]);
        const T = LocalAuthentication.AuthenticationType;
        const kind = types.includes(T.FACIAL_RECOGNITION) ? 'face' : types.includes(T.FINGERPRINT) ? 'fingerprint' : types.includes(T.IRIS) ? 'iris' : 'biometrics';
        return { available: hasHw && enrolled, kind };
    } catch {
        return { available: false, kind: 'biometrics' };
    }
}

export const biometricLabel = (k: BiometricInfo['kind'], ios: boolean) =>
    k === 'face' ? (ios ? 'Face ID' : 'Face unlock') : k === 'fingerprint' ? (ios ? 'Touch ID' : 'Fingerprint') : 'Biometrics';

/** Prompts Face ID / fingerprint. Resolves true only when the system confirms it is the owner. */
export async function promptBiometric(reason: string): Promise<boolean> {
    try {
        const r = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: 'Use PIN', disableDeviceFallback: true });
        return r.success;
    } catch {
        return false;
    }
}
