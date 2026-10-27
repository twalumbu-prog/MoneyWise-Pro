import { PermissionsAndroid, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { momoCaptureService } from 'core';
import { cacheStore } from '../platform/storage';

/**
 * Mobile money capture on this device.
 *
 * Android: the local `momo-capture` native module (modules/momo-capture) runs an SMS receiver and a notification
 * listener that keep working with the app closed; they send matching messages straight to the API with the user's
 * capture key, so this file only configures them, reports their status and walks the permission screens.
 *
 * iOS: no app can read SMS or other apps' notifications, so capture runs through a Shortcuts automation
 * ("When I get a message containing ZMW → run MoneyWise MoMo Capture"). The app installs the shortcut from an iCloud
 * link and hands it the capture key via the clipboard; the person adds the automation once.
 */

interface NativeStatus {
    notificationAccess: boolean;
    smsPermission: boolean;
    smsReadPermission: boolean;
    hasToken: boolean;
    smsEnabled: boolean;
    notificationsEnabled: boolean;
    queued: number;
    lastSentAt: number | null;
    lastError: string | null;
}

interface MomoCaptureNative {
    configure(options: {
        apiUrl: string; token?: string; smsEnabled: boolean; notificationsEnabled: boolean;
        senderPattern?: string; providerPackages?: string[];
    }): void;
    clear(): void;
    getStatus(): NativeStatus;
    openNotificationAccessSettings(): void;
    openAppSettings(): void;
    flush(): Promise<number>;
    importSmsHistory(sinceMs: number, max: number): Promise<number>;
}

/** null on iOS, and on an Android binary built before the module existed (an OTA can't add native code). */
const native: MomoCaptureNative | null = Platform.OS === 'android' ? requireOptionalNativeModule<MomoCaptureNative>('MomoCapture') : null;

const API_URL: string = (Constants.expoConfig?.extra as any)?.apiUrl ?? '';
const SHORTCUT_URL: string = (Constants.expoConfig?.extra as any)?.momoShortcutUrl ?? '';

/** Sender IDs / notification titles that count as a provider. Matched case-insensitively, natively. */
const SENDER_PATTERN = '(momo|mtn|airtel|zamtel|kwacha)';
/**
 * Provider apps whose own notifications should be read too (besides the default SMS app). Add package ids here once
 * confirmed on a real device — a wrong id is harmless, it just never matches.
 */
const PROVIDER_PACKAGES: string[] = [];

export const MOMO_SETTINGS_KEY = ['momo-capture', 'settings'];
export const MOMO_CAPTURES_KEY = ['momo-capture', 'list'];

export const androidCaptureAvailable = !!native;
export const iosShortcutAvailable = Platform.OS === 'ios' && !!SHORTCUT_URL;

export function getAndroidStatus(): NativeStatus | null {
    try { return native?.getStatus() ?? null; } catch { return null; }
}

/**
 * Turns Android sources on/off. Fetches a capture key the first time (or when the server rejected the old one —
 * the native layer drops a rejected key).
 */
export async function setAndroidSources(sources: { notifications: boolean; sms: boolean }) {
    if (!native) throw new Error('This version of the app can’t capture messages yet. Update MoneyWise from the Play Store.');
    const status = native.getStatus();
    const anyOn = sources.notifications || sources.sms;
    let token: string | undefined;
    if (anyOn && !status.hasToken) token = (await momoCaptureService.rotateToken()).token;
    native.configure({
        apiUrl: API_URL, token, smsEnabled: sources.sms, notificationsEnabled: sources.notifications,
        senderPattern: SENDER_PATTERN, providerPackages: PROVIDER_PACKAGES,
    });
}

export async function requestSmsPermission(): Promise<'granted' | 'denied' | 'blocked'> {
    if (Platform.OS !== 'android') return 'denied';
    const res = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        PermissionsAndroid.PERMISSIONS.READ_SMS,
    ]);
    const values = Object.values(res);
    if (values.every((v) => v === PermissionsAndroid.RESULTS.GRANTED)) return 'granted';
    return values.some((v) => v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) ? 'blocked' : 'denied';
}

export const openNotificationAccessSettings = () => native?.openNotificationAccessSettings();
export const openAppSettings = () => (native ? native.openAppSettings() : Linking.openSettings());

/** Queues the last [days] of provider SMS from the inbox. Server-side dedupe makes re-running safe. */
export async function importSmsHistory(days = 30): Promise<number> {
    if (!native) return 0;
    const n = await native.importSmsHistory(Date.now() - days * 24 * 3600 * 1000, 500);
    return n;
}

/** Retries anything the background listeners couldn't send (no signal at the time). */
export async function flushQueued(): Promise<void> {
    try { await native?.flush(); } catch { /* next foreground tries again */ }
}

// ── iOS Shortcut ─────────────────────────────────────────────────────────────

const IOS_SETUP_KEY = 'momo-capture:ios-setup-v1';

export async function isIosShortcutSetUp(): Promise<boolean> {
    return (await cacheStore.get(IOS_SETUP_KEY)) === '1';
}
export async function markIosShortcutSetUp(done: boolean) {
    if (done) await cacheStore.set(IOS_SETUP_KEY, '1'); else await cacheStore.remove(IOS_SETUP_KEY);
}

/**
 * Issues a new capture key, puts it on the clipboard and opens the shortcut's iCloud page. The shortcut's import
 * question ("Paste your MoneyWise capture key") takes it from there. Re-running replaces the key — the old shortcut
 * copy stops working, which is what "reconnect" should mean.
 */
export async function installIosShortcut(): Promise<void> {
    if (!SHORTCUT_URL) throw new Error('The MoneyWise shortcut isn’t published yet.');
    const { token } = await momoCaptureService.rotateToken();
    await Clipboard.setStringAsync(token);
    await Linking.openURL(SHORTCUT_URL);
}

export const openShortcutsApp = () => Linking.openURL('shortcuts://').catch(() => undefined);

/** Stops capture on this device and invalidates the key, so a forgotten shortcut or old phone can't keep sending. */
export async function disconnectCapture(): Promise<void> {
    try { native?.clear(); } catch { /* ignore */ }
    await markIosShortcutSetUp(false);
    await momoCaptureService.revokeToken();
}

/** On sign-out: forget the key locally (the next person to sign in must not send messages as this user). */
export function clearCaptureDevice() {
    try { native?.clear(); } catch { /* ignore */ }
    void markIosShortcutSetUp(false);
}
