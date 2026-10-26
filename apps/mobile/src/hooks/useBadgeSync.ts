import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useQuery } from '@tanstack/react-query';
import { userService } from 'core';
import { useAuth } from '../context/AuthContext';

/**
 * The red number on the iPhone home-screen icon: how many things need the person's attention (requests to approve,
 * unread updates, payouts to send…). Kept in step with the server every minute and whenever the app opens; while the app is
 * closed, each push notification carries the up-to-date number itself (see push.service on the API). Cleared on sign-out.
 */
function useAttentionQuery() {
    const { session, organizationId } = useAuth();
    const signedIn = !!session && !!organizationId;
    const query = useQuery({
        queryKey: ['badge-total', organizationId],
        queryFn: async () => {
            const c = await userService.getNotificationCounts();
            return c.requisitions + c.approvals + c.vouchers + c.disbursements + c.settings;
        },
        enabled: signedIn,
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
        retry: false,
    });
    return { signedIn, ...query };
}

/** How many things need the person's attention right now (the same number as the app-icon badge). */
export function useAttentionCount(): number {
    return useAttentionQuery().data ?? 0;
}

export function useBadgeSync() {
    const { signedIn, data, refetch } = useAttentionQuery();

    useEffect(() => {
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && signedIn) void refetch(); });
        return () => sub.remove();
    }, [signedIn, refetch]);

    useEffect(() => {
        Notifications.setBadgeCountAsync(signedIn ? (data ?? 0) : 0).catch(() => undefined);
    }, [signedIn, data]);
}
