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
    /** What each listener last saw and did with it. Absent on a binary built before these were added. */
    smsSeenAt?: number | null;
    smsSeenResult?: string | null;
    notifSeenAt?: number | null;
    notifSeenResult?: string | null;
    listenerState?: string | null;
    /** Whether Android lets MoneyWise show the Record / Dismiss prompt, and what happened to the last one. */
    canPrompt?: boolean;
    promptResult?: string | null;
}

interface MomoCaptureNative {
    configure(options: {
        apiUrl: string; token?: string; smsEnabled: boolean; notificationsEnabled: boolean;
        senderPattern?: string; providerPackages?: string[]; captureAll?: boolean;
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

export interface IosCaptureStatus {
    hasToken: boolean; queued: number; lastSentAt: number | null; lastError: string | null; intentAvailable: boolean;
    /** Messages the automation handed over that the phone's filter kept off the server (personal texts). 0.7.0+. */
    filteredCount?: number;
}
interface DeviceRules { amount: string; money: string; allow?: string }
interface MomoCaptureIosNative {
    configure(options: { apiUrl: string; token?: string; rules?: DeviceRules; notify?: boolean }): void;
    clear(): void;
    getStatus(): IosCaptureStatus;
    flush(): Promise<number>;
    // 0.7.0+: on-phone filter rules, "captured" notifications.
    setRules?(rules: DeviceRules): void;
    requestNotificationPermission?(): Promise<boolean>;
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

/**
 * While capture is being validated every message is sent (nothing is filtered on the phone); the server decides what
 * is a transaction and shows the rest as "not booked" with a reason. Flip to false to bring the phone filter back.
 */
const CAPTURE_EVERYTHING = true;

const DEVICE_ID_KEY = 'momo-capture:device-id';
/** This phone's own identity for capture: its key is its own, so other phones on the same account keep working. */
export async function deviceInfo(): Promise<{ deviceId: string; label: string; platform: 'ios' | 'android' }> {
    let id = await cacheStore.get(DEVICE_ID_KEY);
    if (!id) {
        const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        id = `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
        await cacheStore.set(DEVICE_ID_KEY, id);
    }
    const platform = Platform.OS === 'android' ? 'android' : 'ios';
    const name = (Constants as any).deviceName as string | undefined;
    return { deviceId: id, label: (name && name.trim()) || (platform === 'android' ? 'Android' : 'iPhone'), platform };
}

/** Issues a fresh capture key and keeps it in this iPhone's Keychain for the Shortcuts action. Nothing to paste. */
export async function connectIphone(): Promise<void> {
    if (!iosNative) throw new Error('Update MoneyWise to set up capture on this iPhone.');
    const { token } = await momoCaptureService.rotateToken(await deviceInfo());
    iosNative.configure({ apiUrl: API_URL, token });
    // The "captured: K2.00 received…" notification after each message. Declining is fine: capture still works.
    try { await iosNative.requestNotificationPermission?.(); } catch { /* ignore */ }
    await refreshIosRules();
}

/**
 * The phone keeps only messages that look like mobile money / bank messages (everything else never leaves it). The
 * rules ship with the app; the server's copy overrides them so new wording is a deploy, not an app release.
 */
export async function refreshIosRules(): Promise<void> {
    if (!iosNative?.setRules) return;
    // Capture-everything: open the phone filter right away (works offline too), then take the server's rules on top.
    if (CAPTURE_EVERYTHING) { try { iosNative.setRules({ amount: '(?s).', money: '(?s).', allow: '(?s).' }); } catch { /* ignore */ } }
    try { iosNative.setRules(await momoCaptureService.deviceRules()); } catch { /* keep the last rules */ }
}

export const pasteboardChangeCount = (): number | null => { try { return iosNative?.pasteboardChangeCount() ?? null; } catch { return null; } };
export const pasteboardMightBeMessage = async (): Promise<boolean> => { try { return (await iosNative?.pasteboardMightBeMessage()) ?? false; } catch { return false; } };

export function getAndroidStatus(): NativeStatus | null {
    try { return native?.getStatus() ?? null; } catch { return null; }
}

/**
 * Turns Android sources on/off. Fetches a capture key the first time (or when the server rejected the old one —
 * the native layer drops a rejected key).
 *
 * Switching a source on must take effect on the phone even when the network is down: issuing a key is the only part
 * that needs one. If that fails, the switch still turns on locally (capture itself stays off, since the native side
 * won't send without a key) and the screen's own "no capture key" hint explains why — rather than the toggle
 * silently doing nothing, which is what it looked like before this always ran. `flushQueued` retries the key on the
 * next foreground, so it recovers on its own once the connection is back.
 */
export async function setAndroidSources(sources: { notifications: boolean; sms: boolean }, opts: { askToPrompt?: boolean } = {}) {
    if (!native) throw new Error('This version of the app can’t capture messages yet. Update MoneyWise from the Play Store.');
    const status = native.getStatus();
    const anyOn = sources.notifications || sources.sms;
    let token: string | undefined;
    if (anyOn && !status.hasToken) {
        try { token = (await momoCaptureService.rotateToken(await deviceInfo())).token; }
        catch (e) { console.warn('[MoMo capture] could not issue a capture key; will retry later:', e); }
    }
    // The Record / Dismiss prompt is an ordinary notification, which Android 13+ only shows with this permission.
    if (anyOn && opts.askToPrompt !== false && Number(Platform.Version) >= 33) {
        try { await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS); } catch { /* capture still works without the prompt */ }
    }
    native.configure({
        apiUrl: API_URL, token, smsEnabled: sources.sms, notificationsEnabled: sources.notifications,
        senderPattern: SENDER_PATTERN, providerPackages: PROVIDER_PACKAGES, captureAll: CAPTURE_EVERYTHING,
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
export async function importSmsHistory(days = 30, max = 500): Promise<number> {
    if (!native) return 0;
    const n = await native.importSmsHistory(Date.now() - days * 24 * 3600 * 1000, max);
    return n;
}

/**
 * Catches the phone back up: queues the newest [max] matching SMS regardless of how long ago they are (the
 * original import only ever ran once, during setup, so anything since has no way back into Review captured short
 * of this). Safe to run as often as wanted — a message already booked, dismissed, or waiting is never duplicated,
 * both locally (the same text within 15 minutes is dropped before it's even queued) and on the server (a message
 * with the same transaction id, or the same wording within 15 minutes, is rejected outright).
 */
export async function importRecentMessages(max = 100): Promise<number> {
    return importSmsHistory(3650, max);
}

/**
 * Retries anything the background listeners couldn't send (no signal at the time). If a source is switched on but the
 * phone has lost its capture key (the server rejected it), a new key is issued first: otherwise capture stays silently
 * off while the switches still read on.
 */
export async function flushQueued(): Promise<void> {
    try {
        const s = native?.getStatus();
        if (s && !s.hasToken && (s.smsEnabled || s.notificationsEnabled)) {
            await setAndroidSources({ notifications: s.notificationsEnabled, sms: s.smsEnabled }, { askToPrompt: false });
        }
    } catch { /* signed out or offline: the next foreground tries again */ }
    try { await (native ?? iosNative)?.flush(); } catch { /* next foreground tries again */ }
}

let rulesFetchedAt = 0;
/** App foreground (iOS): send what's waiting, and refresh the on-phone filter rules at most every 6 hours. */
export async function onIosForeground(): Promise<void> {
    await flushQueued();
    if (Date.now() - rulesFetchedAt > 6 * 3600 * 1000) { rulesFetchedAt = Date.now(); await refreshIosRules(); }
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
    // Only this phone's key: the account's other phones keep capturing.
    await momoCaptureService.revokeToken((await deviceInfo()).deviceId);
}

/** On sign-out: forget the key locally (the next person to sign in must not send messages as this user). */
export function clearCaptureDevice() {
    try { native?.clear(); iosNative?.clear(); } catch { /* ignore */ }
    void markIosShortcutSetUp(false);
}
