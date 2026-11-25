import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { queryClient } from '../lib/queryClient';
import { isNetworkError, isOnline, markOffline, markOnline, onConnectivityChange, startConnectivityWatch } from '../lib/offline/connectivity';
import { flushOutbox, useOutbox } from '../lib/offline/outbox';
import { useOnline } from '../lib/offline/connectivity';
import { syncLiveActivity } from '../lib/offline/liveActivity';

/**
 * Keeps the phone's picture of "can I reach MoneyWise?" up to date and sends whatever was saved on the phone while it couldn't.
 * Mounted once, in the root layout. No UI of its own (see OfflineIndicator).
 */
export function useOfflineSync() {
    const { user, organizationId } = useAuth();
    const online = useOnline();
    const waiting = useOutbox().filter((i) => !i.failed).length;
    const ctx = useRef<{ userId: string; orgId: string | null } | null>(null);
    ctx.current = user ? { userId: user.id, orgId: organizationId } : null;

    // 1. Watch the connection, and learn from the app's own requests.
    useEffect(() => {
        startConnectivityWatch();
        return queryClient.getQueryCache().subscribe((ev) => {
            if (ev.type !== 'updated') return;
            const a = ev.action as any;
            if (a.type === 'error' && isNetworkError(a.error)) markOffline();
            else if (a.type === 'success') markOnline();
        });
    }, []);

    // The Dynamic Island / lock screen indicator follows the same state (iPhone, app version 0.8.0+; does nothing elsewhere).
    useEffect(() => { void syncLiveActivity(online, waiting); }, [online, waiting]);

    // 2. Send saved items: when signed in, when the connection comes back, and when the app is opened again.
    useEffect(() => {
        const run = () => { if (ctx.current && isOnline()) void flushOutbox(ctx.current); };
        run();
        const off = onConnectivityChange((on) => { if (on) run(); });
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run(); });
        return () => { off(); sub.remove(); };
    }, [user?.id, organizationId]);
}
