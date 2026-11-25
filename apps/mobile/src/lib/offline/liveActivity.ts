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

let peakWaiting = 0;       // the most that were waiting during this outage: what "synced" reports when the connection returns
let active = false;

/** Call whenever the connection or the number of saved items changes. */
export async function syncLiveActivity(online: boolean, waiting: number): Promise<void> {
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
