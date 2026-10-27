import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { androidCaptureAvailable, flushQueued } from '../lib/momoCapture';

/** Android only: each time the app comes to the foreground, send anything the capture listeners queued offline. */
export function useMomoCaptureFlush() {
    useEffect(() => {
        if (Platform.OS !== 'android' || !androidCaptureAvailable) return;
        void flushQueued();
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void flushQueued(); });
        return () => sub.remove();
    }, []);
}
