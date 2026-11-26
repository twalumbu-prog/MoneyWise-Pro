import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * The system-level "MoneyWise is offline" indicator: a Live Activity that shows in the Dynamic Island, and as a banner on the lock
 * screen of iPhones without one, even after the person has left the app. (The in-app capsule, OfflineIndicator, covers while the
 * app is open and on every other phone.)
 *
 * Needs the OfflineActivity native module, which ships from app version 0.8.0. On Android, on older iPhone builds, or when the person
 * has switched Live Activities off, every call here quietly does nothing.
 */

interface OfflineActivityNative {
    isSupported(): boolean;
    show(waiting: number, online: boolean, synced: number): Promise<boolean>;
    end(waiting: number, synced: number, dismissAfter: number): Promise<void>;
}

const native: OfflineActivityNative | null = Platform.OS === 'ios' ? requireOptionalNativeModule<OfflineActivityNative>('OfflineActivity') : null;

let supported: boolean | null = null;
export const liveActivityAvailable = (): boolean => {
    if (!native) return false;
    if (supported === null) { try { supported = native.isSupported(); } catch { supported = false; } }
    return supported;
};

/**
 * Android 16+: the same status in the phone's OWN island / status-bar chip (HyperOS Super Island, Samsung Now Bar, Pixel chip),
 * via a "Live Update" notification posted by the momo-capture module. When this is available the in-app pill is not drawn, so the
 * person never sees two islands. Older phones and older app binaries (no such function) keep the in-app pill.
 */
interface AndroidStatusNative {
    systemStatusSupported?(): boolean;
    showSystemStatus?(chip: string, title: string, text: string): boolean;
    clearSystemStatus?(): void;
}
const androidNative: AndroidStatusNative | null = Platform.OS === 'android' ? requireOptionalNativeModule<AndroidStatusNative>('MomoCapture') : null;

/** True when this Android phone shows MoneyWise's connection status in its own island / chip (so the app draws nothing). */
export const androidSystemStatusAvailable = (): boolean => {
    try { return !!androidNative?.systemStatusSupported?.(); } catch { return false; }
};

let androidShown = false;
let androidClearTimer: ReturnType<typeof setTimeout> | null = null;
function syncAndroidStatus(online: boolean, waiting: number) {
    if (!androidNative?.showSystemStatus || !androidSystemStatusAvailable()) return;
    try {
        if (androidClearTimer) { clearTimeout(androidClearTimer); androidClearTimer = null; }
        if (!online) {
            peakWaiting = Math.max(peakWaiting, waiting);
            androidShown = androidNative.showSystemStatus('Offline', 'MoneyWise is offline',
                waiting > 0 ? `${waiting} saved on your phone. They sync when you're back online.` : "Working from your phone. Changes sync when you're back online.");
        } else if (androidShown) {
            const synced = peakWaiting;
            androidNative.showSystemStatus('Online', 'Back online', synced > 0 ? `${synced} synced` : 'All caught up');
            androidShown = false; peakWaiting = 0;
            androidClearTimer = setTimeout(() => { try { androidNative.clearSystemStatus?.(); } catch { /* ignore */ } }, 4000);
        }
    } catch { /* never let an indicator break the app */ }
}

let peakWaiting = 0;       // the most that were waiting during this outage: what "synced" reports when the connection returns
let active = false;

/** Call whenever the connection or the number of saved items changes. */
export async function syncLiveActivity(online: boolean, waiting: number): Promise<void> {
    if (Platform.OS === 'android') { syncAndroidStatus(online, waiting); return; }
    if (!native || !liveActivityAvailable()) return;
    try {
        if (!online) {
            peakWaiting = Math.max(peakWaiting, waiting);
            active = await native.show(waiting, false, 0);
        } else if (active) {
            // Back online: say so for a few seconds, then take it down.
            const synced = peakWaiting;
            await native.end(0, synced, 4);
            active = false; peakWaiting = 0;
        }
    } catch { /* never let an indicator break the app */ }
}
