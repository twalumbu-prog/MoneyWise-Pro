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

## iOS: building the shortcut (one-time, by hand)

Apple offers no API for this, so the shortcut has to be made in the Shortcuts app and shared as an iCloud link:

1. Create a new shortcut named **MoneyWise MoMo Capture**. In its settings, turn on *Show in Share Sheet* so it accepts **Text** input.
2. Add a **Text** action containing a placeholder, e.g. `PASTE-KEY`.
3. Add **Get Contents of URL**:
   - URL: `https://moneywise.blueopus.cloud/api/momo-capture/ingest`
   - Method: POST. Headers: `X-Capture-Token` = *Text* (the variable from step 2).
   - Request Body: JSON, with `source` = `IOS_SHORTCUT` and `text` = *Shortcut Input*.
4. Share → **Copy iCloud Link**. In the share options, set up an **Import Question** on the Text action: "Paste your MoneyWise capture key".
5. Put the link in the EAS env var `EXPO_PUBLIC_MOMO_SHORTCUT_URL`. Until it is set, the app shows "Coming soon on iPhone" and offers paste only.

The in-app walkthrough copies a fresh key to the clipboard, opens the link, and then guides the user through creating the *Message contains "ZMW" → Run Immediately* automation.

## Before going live

- Apply the migration (SQL editor; the MCP is still pointed at the old project).
- Collect real MTN, Airtel and Zamtel messages from Zambian phones (with names and numbers changed), add them to `test_momo_parser.ts`, and tune the parser. The current samples are representative, not verbatim.
