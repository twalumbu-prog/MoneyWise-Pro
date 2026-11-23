import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { NOTIFICATION_ACTIONS, setupNotificationsAsync } from '../lib/notificationSetup';

const TEST_RESULTS: Record<string, string> = {
    [NOTIFICATION_ACTIONS.SEND_REMINDER]: 'The "Send reminder" button works. Real reminders will open WhatsApp or SMS with the message ready.',
    [NOTIFICATION_ACTIONS.PAY_BACK]: 'The "Pay back" button works. Real ones will open the send-money screen, filled in.',
    [NOTIFICATION_ACTIONS.REVIEW_NOW]: 'The "Review now" button works. It opens your transactions to confirm.',
};

/**
 * Routes a tapped push notification to the screen it's about, using the
 * `data.type`/`data.id` pushService stamps on every notification it sends
 * (see apps/api/src/services/push.service.ts) — kept in sync with that file
 * by hand since the two run in different runtimes.
 */
export function useNotificationNavigation() {
    const router = useRouter();

    useEffect(() => {
        // Push notifications are a phone feature; the browser build has no notification module to ask.
        if (Platform.OS === 'web') return;
        // Channels and button sets must exist before a push that names them arrives, not only after sign-in.
        void setupNotificationsAsync();

        // `action` is the button pressed, or Notifications.DEFAULT_ACTION_IDENTIFIER for a tap on the notification itself.
        const handle = (data: Record<string, any> | undefined, action?: string) => {
            if (!data?.type) return;
            // A sample from Settings → Preferences: say what was pressed. The test for "to confirm" still opens the real screen.
            if (data.test && data.type !== 'momo_confirm') {
                Alert.alert('Test notification received', (action && TEST_RESULTS[action]) || 'Notifications of this kind are working on this phone.');
                return;
            }
            switch (data.type) {
                case 'momo_confirm':
                    // Captures waiting for a category. `queue=1` asks for the one-after-another confirm mode.
                    router.push('/momo-captures?queue=1');
                    break;
                case 'insights':
                    router.push('/grow');
                    break;
                case 'grow_setup':
                    router.push('/grow/setup');
                    break;
                case 'requisition':
                    if (data.id) router.push(`/requisition/${data.id}`);
                    break;
                case 'requisitions':
                    router.push('/(tabs)');
                    break;
                case 'cashbook':
                    router.push('/(tabs)/wallet');
                    break;
                case 'savings_group':
                    if (data.id) router.push(`/savings/${data.id}`);
                    break;
                case 'invest_application':
                    router.push('/apps/invest/applications');
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
            if (response) handle(response.notification.request.content.data as Record<string, any>, response.actionIdentifier);
        });

        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            handle(response.notification.request.content.data as Record<string, any>, response.actionIdentifier);
            // A button press does not clear the notification by itself on Android.
            if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
                void Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});
            }
        });
        return () => sub.remove();
    }, [router]);
}
