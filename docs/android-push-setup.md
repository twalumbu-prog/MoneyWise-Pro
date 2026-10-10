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
5. **Rebuild Android** (`eas build -p android --profile production`), install on a real device, sign in, allow notifications.
6. **Verify** a row appears in `push_tokens` with `platform = 'android'`, then trigger any notification (e.g. a requisition approval).

Notes: Android 13+ shows the permission prompt at first launch of the notification request; emulators without Google Play
services cannot receive push.
