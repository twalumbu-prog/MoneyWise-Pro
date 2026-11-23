import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { androidCaptureAvailable, iosIntentAvailable, flushQueued } from '../lib/momoCapture';

/** Each time the app comes to the foreground, send anything capture queued offline (Android listeners, iOS action). */
export function useMomoCaptureFlush() {
    useEffect(() => {
        if (!(Platform.OS === 'android' ? androidCaptureAvailable : iosIntentAvailable)) return;
        void flushQueued();
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void flushQueued(); });
        return () => sub.remove();
    }, []);
}
