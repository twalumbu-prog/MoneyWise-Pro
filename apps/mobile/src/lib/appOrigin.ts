import { AppState } from 'react-native';

/**
 * Did the app just come to the front from another app (a browser, WhatsApp…)? Used to decide where closing a pay-link overlay
 * should go: back to the app the link was tapped in (Android), instead of leaving the person inside MoneyWise.
 * A cold start counts as "from another app" for the first few seconds. Imported once by the root layout.
 */
let becameActiveAt = Date.now();
AppState.addEventListener('change', (s) => { if (s === 'active') becameActiveAt = Date.now(); });

export const cameFromAnotherApp = (withinMs = 4000) => Date.now() - becameActiveAt < withinMs;
