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
 * ("When I get a message containing ZMW → Capture mobile money message"). From 0.6.0 the action is an App Intent built
 * into MoneyWise (modules/momo-capture/app-target), so it's in Shortcuts as soon as the app is installed and it reads
 * the capture key from the Keychain. Older binaries fall back to the hand-made iCloud shortcut + pasted key.
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

export interface IosCaptureStatus { hasToken: boolean; queued: number; lastSentAt: number | null; lastError: string | null; intentAvailable: boolean }
interface MomoCaptureIosNative {
    configure(options: { apiUrl: string; token?: string }): void;
    clear(): void;
    getStatus(): IosCaptureStatus;
    flush(): Promise<number>;
    pasteboardChangeCount(): number;
    pasteboardMightBeMessage(): Promise<boolean>;
}
/** null on Android, and on an iPhone binary older than 0.6.0. */
const iosNative: MomoCaptureIosNative | null = Platform.OS === 'ios' ? requireOptionalNativeModule<MomoCaptureIosNative>('MomoCapture') : null;

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
/** This iPhone has the built-in "Capture mobile money message" action (0.6.0+). */
export const iosIntentAvailable = !!iosNative;
/** Older iPhone binaries can still use the hand-made iCloud shortcut, if one is published. */
export const iosShortcutAvailable = Platform.OS === 'ios' && !iosNative && !!SHORTCUT_URL;
export const iosCaptureAvailable = iosIntentAvailable || iosShortcutAvailable;

export function getIosStatus(): IosCaptureStatus | null {
    try { return iosNative?.getStatus() ?? null; } catch { return null; }
}

/** Issues a fresh capture key and keeps it in this iPhone's Keychain for the Shortcuts action. Nothing to paste. */
export async function connectIphone(): Promise<void> {
    if (!iosNative) throw new Error('Update MoneyWise to set up capture on this iPhone.');
    const { token } = await momoCaptureService.rotateToken();
    iosNative.configure({ apiUrl: API_URL, token });
}

export const pasteboardChangeCount = (): number | null => { try { return iosNative?.pasteboardChangeCount() ?? null; } catch { return null; } };
export const pasteboardMightBeMessage = async (): Promise<boolean> => { try { return (await iosNative?.pasteboardMightBeMessage()) ?? false; } catch { return false; } };

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
    try { await (native ?? iosNative)?.flush(); } catch { /* next foreground tries again */ }
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
    try { native?.clear(); iosNative?.clear(); } catch { /* ignore */ }
    await markIosShortcutSetUp(false);
    await momoCaptureService.revokeToken();
}

/** On sign-out: forget the key locally (the next person to sign in must not send messages as this user). */
export function clearCaptureDevice() {
    try { native?.clear(); iosNative?.clear(); } catch { /* ignore */ }
    void markIosShortcutSetUp(false);
}
