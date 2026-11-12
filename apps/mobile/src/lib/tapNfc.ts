import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

interface TapNfcNative {
    getState(): 'unsupported' | 'off' | 'on';
    setUrl(url: string): boolean;
    clear(): void;
    openNfcSettings(): void;
}

// Only Android phones can act as the tag. The module is missing in Expo Go and in builds made before it was added; then there is no tap and
// the QR code and link are used.
const native: TapNfcNative | null = Platform.OS === 'android' ? requireOptionalNativeModule<TapNfcNative>('TapNfc') : null;

export type NfcShareState = 'unsupported' | 'off' | 'on';

/** Can this phone share a request by tap right now? */
export function nfcShareState(): NfcShareState {
    try { return native ? native.getState() : 'unsupported'; } catch { return 'unsupported'; }
}

/** From now until stopNfcShare, other phones that touch this one read the request's link. */
export function startNfcShare(url: string): boolean {
    try { return !!native && native.getState() === 'on' && native.setUrl(url); } catch { return false; }
}

export function stopNfcShare(): void {
    try { native?.clear(); } catch { /* nothing to stop */ }
}

export function openNfcSettings(): void {
    try { native?.openNfcSettings(); } catch { /* settings unavailable */ }
}
