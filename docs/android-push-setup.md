# Android push notifications (FCM) — setup

iOS push already works (APNs is managed by EAS). Android needs Firebase Cloud Messaging; until then no Android
device can mint a push token (production `push_tokens` has 0 Android rows).

The app side is ready: `apps/mobile/app.config.ts` picks up `google-services.json` automatically
(from the `GOOGLE_SERVICES_JSON` EAS file variable, or `apps/mobile/google-services.json`), the notification
channel and colour are set in `src/lib/push.ts` / the `expo-notifications` plugin, and the API already sends through Expo.

## Steps

1. **Firebase project** — https://console.firebase.google.com → Add project (can reuse the existing Google Cloud project).
2. **Add an Android app** with package name `cloud.blueopus.moneywise`. Download `google-services.json`.
3. **Give it to the build** (pick one):
   - EAS file variable (keeps it out of git): `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment production --visibility sensitive`
   - or copy it to `apps/mobile/google-services.json`.
4. **FCM V1 credentials for Expo's push service** — Firebase → Project settings → Service accounts → *Generate new private key*.
   Then `cd apps/mobile && eas credentials` → Android → production → *Google Service Account Key for FCM V1* → upload the JSON.
   Do steps 3 and 4 for **every EAS project you build with**: the FCM key is stored per EAS project, so a preview build
   made from a separate test project needs its own upload (and the `preview` environment for the file variable).
5. **Rebuild Android** (`eas build -p android --profile production`), install on a real device, sign in, allow notifications.
6. **Verify** a row appears in `push_tokens` with `platform = 'android'`, then go to **Settings → Preferences → Push
   notifications about** and press **Send a test** on each kind. Each test checks Firebase delivery, the Android channel,
   the action button and where a tap lands.

## Kinds of push (topics)

Every new push names a `topic` (`pushService.sendToUser(..., { topic, category })`). The topic picks the Android channel
and lets the person switch that kind off in Settings → Preferences (`users.preferences.notifications.topics`). Pushes
without a topic (requisitions, inflows, …) stay on the `default` channel, filtered only by the app/email choice.

| Topic | Android channel | Buttons (`category`) | Tap opens |
| --- | --- | --- | --- |
| `to_confirm` | Transactions to confirm | `to_confirm`: Review now | `/momo-captures?queue=1` |
| `reminders` | Money owed (high importance) | `debt_owed_to_me`: Send reminder · `debt_i_owe`: Pay back | Debts (Phase 3) |
| `insights` | Progress updates | — | `/grow` |

The channel ids, category ids and button ids are defined twice and kept in sync by hand:
`apps/api/src/services/push.service.ts` / `userPreferences.service.ts` and `apps/mobile/src/lib/notificationSetup.ts`.
Every button opens the app; ignoring or swiping the notification away is the "not now".

Notes: Android 13+ shows the permission prompt at first launch of the notification request; emulators without Google Play
services cannot receive push.
