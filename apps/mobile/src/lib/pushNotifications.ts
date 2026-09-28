import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// Foreground behavior: a push that arrives while the app is open still shows
// a banner/appears in notification list — without this, expo-notifications
// silently swallows it, which reads as "push notifications don't work" the
// moment anyone tests with the app open.
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

/**
 * Requests permission and returns this device's Expo push token, or null if
 * permission was denied, this is a simulator (no APNs/FCM registration
 * possible), or no EAS project id is configured yet (app.config.ts has none
 * until `eas init` is run — see PLAN.md). Never throws: a push-registration
 * failure must not block sign-in.
 */
export async function registerForPushNotificationsAsync(): Promise<{ token: string; platform: 'ios' | 'android' } | null> {
    try {
        if (!Device.isDevice) {
            console.log('[Push] Skipping registration — simulators/emulators cannot receive real push.');
            return null;
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            console.log('[Push] Permission not granted.');
            return null;
        }

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.DEFAULT,
            });
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (!projectId) {
            console.warn('[Push] No EAS project id configured — cannot mint an Expo push token yet.');
            return null;
        }

        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        return { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' };
    } catch (err) {
        console.warn('[Push] Registration failed:', err);
        return null;
    }
}
