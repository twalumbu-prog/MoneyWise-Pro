import Constants from 'expo-constants';

/**
 * The public web app. Customer-facing surfaces (`/pay/:wallet_id`, `/pl/:token`)
 * and the legal pages are deliberately NOT ported — the app hands those to a
 * browser instead. See PLAN.md §2.
 */
export const WEB_ORIGIN: string =
    (Constants.expoConfig?.extra as any)?.webOrigin ?? 'https://moneywise.blueopus.cloud';
