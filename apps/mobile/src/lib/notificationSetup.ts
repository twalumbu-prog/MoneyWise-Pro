import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * The Android notification channels and the action-button sets ("categories") that pushes from the API refer to by id.
 * Kept in sync by hand with apps/api/src/services/push.service.ts (PUSH_CATEGORIES, topic → channelId) and
 * userPreferences.service.ts (PUSH_TOPICS), since the two run in different runtimes.
 *
 * A push naming a channel the app has not created yet lands on Android's fallback channel, and one naming an unknown
 * category shows no buttons, so this runs at every app start (not only when the person first allows notifications).
 */

/** One channel per topic, so each kind can also be muted from the phone's own notification settings. */
const CHANNELS: { id: string; name: string; description: string; importance: Notifications.AndroidImportance }[] = [
    { id: 'default', name: 'General', description: 'Payments, requests and account updates', importance: Notifications.AndroidImportance.DEFAULT },
    { id: 'reminders', name: 'Money owed', description: 'Reminders about money people owe you, and money you owe', importance: Notifications.AndroidImportance.HIGH },
    { id: 'to_confirm', name: 'Transactions to confirm', description: 'Transactions waiting for you to pick a category', importance: Notifications.AndroidImportance.DEFAULT },
    { id: 'insights', name: 'Progress updates', description: 'How your spending, saving and growth are going', importance: Notifications.AndroidImportance.DEFAULT },
];

/** Button ids. A button press reaches useNotificationNavigation as `actionIdentifier`. */
export const NOTIFICATION_ACTIONS = {
    SEND_REMINDER: 'send_reminder',
    PAY_BACK: 'pay_back',
    REVIEW_NOW: 'review_now',
} as const;

/**
 * Every button opens the app: what each one does (open WhatsApp with the message, the send-money screen, the confirm
 * queue) needs the app on screen. Ignoring the push, or swiping it away, is the "not now".
 */
const CATEGORIES: { id: string; actions: Notifications.NotificationAction[] }[] = [
    { id: 'debt_owed_to_me', actions: [{ identifier: NOTIFICATION_ACTIONS.SEND_REMINDER, buttonTitle: 'Send reminder', options: { opensAppToForeground: true } }] },
    { id: 'debt_i_owe', actions: [{ identifier: NOTIFICATION_ACTIONS.PAY_BACK, buttonTitle: 'Pay back', options: { opensAppToForeground: true } }] },
    { id: 'to_confirm', actions: [{ identifier: NOTIFICATION_ACTIONS.REVIEW_NOW, buttonTitle: 'Review now', options: { opensAppToForeground: true } }] },
];

let done: Promise<void> | null = null;

/** Creates the channels and button sets. Safe to call repeatedly; runs once per app start. Never throws. */
export function setupNotificationsAsync(): Promise<void> {
    if (Platform.OS === 'web') return Promise.resolve();
    if (!done) {
        done = (async () => {
            if (Platform.OS === 'android') {
                await Promise.all(CHANNELS.map((c) =>
                    Notifications.setNotificationChannelAsync(c.id, { name: c.name, description: c.description, importance: c.importance }),
                ));
            }
            await Promise.all(CATEGORIES.map((c) => Notifications.setNotificationCategoryAsync(c.id, c.actions)));
        })().catch((err) => {
            console.warn('[Push] Notification setup failed:', err);
            done = null; // let the next call try again
        });
    }
    return done;
}
