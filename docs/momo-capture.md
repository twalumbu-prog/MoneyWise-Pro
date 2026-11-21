# Mobile money capture

Books MTN MoMo / Airtel Money / Zamtel Kwacha transactions from the confirmation messages on the user's phone.

| Piece | Where |
| --- | --- |
| Migration (tables `momo_capture_settings`, `momo_captures`) | `supabase/migrations/20261027120000_momo_capture.sql` |
| Parser (heuristic, server-side so wording changes are a deploy) | `apps/api/src/services/momoCapture/parser.ts`, checks: `npm run test:momo` |
| Ingest / review / booking | `apps/api/src/services/momoCapture/momoCapture.service.ts`, routes at `/momo-capture` |
| Android native module (SMS receiver + notification listener) | `apps/mobile/modules/momo-capture` |
| App wrapper | `apps/mobile/src/lib/momoCapture.ts` |
| Screens | Preferences → Mobile money capture (`app/settings/momo-capture.tsx`), setup walkthroughs (`app/settings/momo-capture-setup.tsx`), review queue (`app/momo-captures.tsx`) |

## Flow

1. A source sends the raw text to `POST /momo-capture/ingest` with header `X-Capture-Token: mwc_…`. The token is per user, only its SHA-256 is stored, it can only *add* messages, and "Turn off capture" revokes it. Captures go to the org that was active when the token was issued.
2. The server parses the message. Non-transactions (OTPs, failures, payment requests) are ignored. Duplicates (same provider reference, or the same text) collapse: the SMS and its notification are one row.
3. If a `MONEYWISE_WALLET` cashbook entry has the same amount and direction within ±30 min, the capture is `MATCHED` and **not booked**, because Lenco already has it.
4. Otherwise the capture is `PENDING`, or booked straight away if "Book automatically" is on. Booking runs through `recordManualEntry` (AI categorisation included) into a per-provider external account ("MTN MoMo", "Airtel Money", …; created on first use) or the Cash account, per the user's setting. A fee in the message is booked as a separate OUT entry.

## Android

- The native module manifest declares the `NotificationListenerService` and the `SMS_RECEIVED` receiver. `RECEIVE_SMS`/`READ_SMS` come from `app.config.ts`. Build with `MOMO_SMS_CAPTURE=0` to leave them out of a Play build until Google approves the **SMS permissions declaration** (use case: SMS-based money management). Notification capture needs no restricted permission.
- Messages are filtered on the phone: the sender or notification title must match `momo|mtn|airtel|zamtel|kwacha` and the text must contain an amount. Only the default SMS app's notifications are read (plus any provider app package ids added to `PROVIDER_PACKAGES`).
- Unsent messages queue in app-private storage and go with the next message or when the app comes to the foreground.
- Needs a new native build (version bumped to 0.3.0). An OTA update to an older binary just shows "Update needed".

## iOS (0.6.0+): built-in Shortcuts action

Apple lets no app read SMS or create Shortcuts automations, so iPhone capture is "one automation the person adds, running an action MoneyWise provides":

- **App Intent** `Capture mobile money message` (`modules/momo-capture/app-target/MoneyWiseCaptureIntent.swift`) plus an `AppShortcutsProvider`, so Shortcuts lists it as soon as the app is installed. It must be compiled into the app target (Shortcuts doesn't discover intents in pods), so `modules/momo-capture/plugin/withMomoCaptureIntents.js` copies it in at prebuild.
- **MomoCapture pod** (`modules/momo-capture/ios`): `MomoCaptureStore` keeps the capture key in the Keychain (`AfterFirstUnlockThisDeviceOnly`, so locked-phone messages still send), posts to `/momo-capture/ingest`, queues on no signal (flushed with the next message or on app foreground), and drops the key on a 401. The RN module also exposes clipboard checks (`changeCount`, `detectPatterns`) that never trigger the paste banner.
- **Setup** (`app/settings/momo-capture-setup.tsx`, `mode=ios`): *Connect this iPhone* issues a key straight into the Keychain (nothing to paste), then five illustrated taps: Automation → New Automation → Message, contains `ZMW` → Run Immediately → Create New Shortcut, search MoneyWise → *Capture mobile money message* → Message → Select Variable → *Shortcut Input*. (Checked on the iOS 26.5 Simulator: the action is listed after install, Run Immediately is offered, but the automation's quick-pick list doesn't show it and the Message parameter isn't filled automatically.) A verify step watches for the first send.
- **Zero-setup fallback**: `ClipboardCapturePrompt` offers "Copied a mobile money message? Capture" when the app opens after a likely SMS was copied; the text is only read after the tap.
- Binaries before 0.6.0 fall back to the hand-made iCloud shortcut (`EXPO_PUBLIC_MOMO_SHORTCUT_URL` + pasted key).

## Before going live

- Apply the migration (SQL editor; the MCP is still pointed at the old project).
- Collect real MTN, Airtel and Zamtel messages from Zambian phones (with names and numbers changed), add them to `test_momo_parser.ts`, and tune the parser. The current samples are representative, not verbatim.
