import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

/**
 * Routes a tapped push notification to the screen it's about, using the
 * `data.type`/`data.id` pushService stamps on every notification it sends
 * (see apps/api/src/services/push.service.ts) — kept in sync with that file
 * by hand since the two run in different runtimes.
 */
export function useNotificationNavigation() {
    const router = useRouter();

    useEffect(() => {
        const handle = (data: Record<string, any> | undefined) => {
            if (!data?.type) return;
            switch (data.type) {
                case 'requisition':
                    if (data.id) router.push(`/requisition/${data.id}`);
                    break;
                case 'requisitions':
                    router.push('/(tabs)');
                    break;
                case 'cashbook':
                    router.push('/(tabs)/wallet');
                    break;
                case 'organization_switch':
                    router.push('/(tabs)/menu');
                    break;
            }
        };

        // A tap while the app is backgrounded/killed is handled by the listener
        // below once it mounts; a tap that already launched the app (cold start)
        // needs this separate check for the response that got it there.
        Notifications.getLastNotificationResponseAsync().then((response) => {
            if (response) handle(response.notification.request.content.data as Record<string, any>);
        });

        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            handle(response.notification.request.content.data as Record<string, any>);
        });
        return () => sub.remove();
    }, [router]);
}
