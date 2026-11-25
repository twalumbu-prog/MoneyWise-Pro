# Mobile money capture

Books MTN MoMo / Airtel Money / Zamtel Kwacha transactions from the confirmation messages on the user's phone.
Banks are not covered — a bank SMS is never matched, by design (see "Flow" below).

| Piece | Where |
| --- | --- |
| Migration (tables `momo_capture_settings`, `momo_captures`) | `supabase/migrations/20261027120000_momo_capture.sql` |
| Parser (heuristic, server-side so wording changes are a deploy) | `apps/api/src/services/momoCapture/parser.ts`, checks: `npm run test:momo` |
| Ingest / review / booking | `apps/api/src/services/momoCapture/momoCapture.service.ts`, routes at `/momo-capture` |
| Android native module (SMS receiver + notification listener) | `apps/mobile/modules/momo-capture` |
| App wrapper | `apps/mobile/src/lib/momoCapture.ts` |
| Screens | Preferences → Mobile money capture (`app/settings/momo-capture.tsx`), setup walkthroughs (`app/settings/momo-capture-setup.tsx`), review queue (`app/momo-captures.tsx`) |

## Who can use it

Every plan, personal and business accounts alike. `/momo-capture` has no plan check, and booking goes through the ordinary manual-entry path. Only the combined **Captured** queue (`/captures`, AI Transaction Capture) is Premium: on other plans the MoMo row is simply not mirrored into it, and the app hides the "All captured transactions" row.

## Flow

1. A source sends the raw text to `POST /momo-capture/ingest` with header `X-Capture-Token: mwc_…`. The token is per user, only its SHA-256 is stored, it can only *add* messages, and "Turn off capture" revokes it. Captures go to the org that was active when the token was issued.
2. The server parses the message. **A message is only ever read as a transaction when it carries a real transaction id (a digit-bearing TID/Txn/Ref) — mobile money confirmations always have one; nothing else is trusted, however much it looks like a payment.** This is what keeps a promo mentioning a Kwacha figure ("Win K700!") from being booked as money received — one such message once created a whole wallet out of thin air before this rule existed. Non-transactions (OTPs, failures, payment requests, promos) are ignored. Duplicates (same provider reference, or the same wording within 15 minutes) collapse: the SMS and its notification are one row.
3. A message that states a balance but moves no money ("Your balance is ZMW 14.28") is read separately (`parseBalanceOnly`) — informational only, shown next to the ledger figure, never written into it — and only when the sender or text actually names MTN, Airtel or Zamtel; a provider the parser can't identify is never trusted as an anchor, for the same reason as above.
4. **Bank SMS is not supported.** The sender/provider check only recognises `momo|mtn|airtel|zamtel|kwacha`; a bank's SMS never matches and is ignored outright, by design, not as an oversight.
5. If a `MONEYWISE_WALLET` cashbook entry has the same amount and direction within ±30 min, the capture is `MATCHED` and **not booked**, because Lenco already has it.
6. Otherwise the capture is `PENDING`, or booked straight away if "Book automatically" is on. **Nothing moves a wallet's ledger balance except this step** — capturing a message, or a plain balance check, never does. Booking runs through `recordManualEntry` (the "what was this for?" card's category/note, or AI categorisation when neither is given) into a per-provider external account ("MTN MoMo", "Airtel Money", …; created on first use) or the Cash account, per the user's setting. A fee in the message is booked as a separate OUT entry.

## Android

- The native module manifest declares the `NotificationListenerService` and the `SMS_RECEIVED` receiver. `RECEIVE_SMS`/`READ_SMS` come from `app.config.ts`. Build with `MOMO_SMS_CAPTURE=0` to leave them out of a Play build until Google approves the **SMS permissions declaration** (use case: SMS-based money management). Notification capture needs no restricted permission.
- Messages are filtered on the phone: the sender or notification title must match `momo|mtn|airtel|zamtel|kwacha` and the text must contain an amount. Only the default SMS app's notifications are read (plus any provider app package ids added to `PROVIDER_PACKAGES`).
- Unsent messages queue in app-private storage and go with the next message or when the app comes to the foreground.
- Needs a new native build (version bumped to 0.3.0). An OTA update to an older binary just shows "Update needed".

## iOS (0.7.0+): built-in Shortcuts action, phone-side filter, save first

Apple lets no app read SMS or create Shortcuts automations, so iPhone capture is "one automation the person adds, running an action MoneyWise provides". Since 0.7.0 the automation is **Message Contains `.`** (a full stop). iOS refuses an empty trigger (Next stays disabled with Any Sender + no phrase), and a full stop matches almost every SMS. The phone decides what to keep.

- **App Intent** `Capture mobile money message` (`modules/momo-capture/app-target/MoneyWiseCaptureIntent.swift`) plus an `AppShortcutsProvider`, listed in Shortcuts after install. It is compiled into the app target (Shortcuts doesn't discover intents in pods): `modules/momo-capture/plugin/withMomoCaptureIntents.js` copies it in and adds the BGTask permission + `fetch` background mode.
- **Filter on the phone** (`MomoCaptureStore.looksLikeMoneyMessage`): keep only text with an amount AND an operator/bank marker (ZMW code, provider or bank name, TID/Txn/Ref, a balance). Everything else never leaves the iPhone; only a count is kept. The rules ship in the app and are overridden from `GET /momo-capture/device-rules` (`DEVICE_RULES` in the service, refreshed on app foreground every 6 h), so new wording is a deploy. Keep the Swift defaults and `DEVICE_RULES` identical.
- **Save first, send second.** The intent writes the message to a local queue before any network call, then sends the queue in order with ≤8 s timeouts within an 8 s budget, and returns. Items leave the queue only when the server answers. The old code waited on the network first, so iOS could kill the run mid-request and the message was lost. Leftovers go out with the next message, on app foreground, or in a `BGAppRefreshTask` (`MomoCaptureAppDelegate`, best-effort; iOS decides when). A 401 drops the key but keeps the messages until the app reconnects.
- **Notifications** after each capture say what happened and name the workspace (`ingest` now returns `workspace`): "New: K2.00 received", "Already in MoneyWise", "Saved on your phone…", "Sent 3 saved messages…". They need notification permission (asked in Connect this iPhone).
- **Setup**: *Connect this iPhone* (key into the Keychain, notification permission, rules), then the guide (`app/capture-guide.tsx`, screenshots in `assets/capture-guide`, video via `scripts/capture-guide/make-video.swift`).
- **Zero-setup fallback**: `ClipboardCapturePrompt` offers to capture a copied SMS when the app opens.
- Tests: the store compiles on macOS with a test `main.swift` + a fake ingest server (filter, offline queue, ordering, 401, rules override).

## Before going live

- Apply the migration (SQL editor; the MCP is still pointed at the old project).
- Collect real MTN, Airtel and Zamtel messages from Zambian phones (with names and numbers changed), add them to `test_momo_parser.ts`, and tune the parser. The current samples are representative, not verbatim.

## Prompt when a transaction happens (Android)

When a live message is captured and is waiting for a decision, the native layer shows a notification straight away
("Received K250.00 from John Banda · Airtel Money · balance K4.44") with **Record** and **Dismiss** buttons. It is
posted natively, so it appears with the app closed; tapping the prompt opens Review captured.

- The buttons call `POST /momo-capture/ingest/:id/post` and `/ingest/:id/dismiss` with the capture key. The key can
  only settle a waiting message that belongs to its own owner.
- No prompt for an SMS history import, for a duplicate, or when "Book automatically" already recorded it.
- Needs the Android notification permission (asked when a source is switched on). The capture screen says so when
  it is off, and shows what happened to the last prompt.

## Wallet balances

`GET /momo-capture/balances` returns, per provider, the balance stated in the newest captured message
("Your bal is ZMW 4.44"). It is the operator's own figure, so it stays right even when some transactions were never
captured or recorded. The capture screen lists these under "Wallet balances".

### Balances and the external accounts

What a wallet holds is a *running* balance, not just the newest stated figure: find the most recent reading of the
actual balance — a transaction message that stated one (MTN only does on money OUT; Airtel does either way), or a
plain "what's my balance" check, whichever is more recent — then add or subtract every later transaction's amount in
order, including ones, like an MTN deposit, that never state a balance themselves. Without this, money received
would sit unrecognised until the next message that happens to restate the balance.

A plain balance check (a dial-code reply, or the operator's own balance SMS) carries no transaction, but its figure
is the most trustworthy anchor there is — nothing inferred, no wording to misread — so it is saved (one per provider,
on the capture settings row) and always wins over an older reading, whichever kind. If it never shows up in the
review list, that is correct: there is nothing to record.

Every captured message counts toward this, even one later dismissed — the money still moved on the phone regardless
of how it was booked here — except a message the *current* parser no longer reads as a transaction at all (an advert
mis-captured before a parser fix, say): a parser fix cleans up that old noise automatically, not just new messages. A
provider with no message that has ever stated a balance has nothing to anchor to and is left out rather than guessed.

This running balance IS the account's displayed balance for a mobile money external account — the Wallet page's
`GET /cashbook` shows it (`orgWalletBalances`, matched to the account by name), not the sum of what has been booked
so far. A real account's balance is what the provider says it is; showing anything else would just read as the app
having got it wrong. The ledger (the entries actually listed under that account, the journal, reports) is untouched
by this and still only contains what was explicitly booked, so the two won't fully reconcile until the backlog is
cleared — same as a real bank statement whose headline balance is ahead of a transaction still settling.

Nothing here writes to the ledger. An amount only ever reaches it through booking — the "Done" button on the review
card, auto-post, or an explicit "Book it" — never from merely capturing a message or a balance check. (An earlier
version kept the ledger itself equal to this running figure automatically, through a balancing entry; that is what
let one misread promo inject a balance into a wallet that was never booked at all. Removed — this is a display
figure now, nothing more.)

## What keeps a transaction from being missed

Checked against 117 real MTN and Airtel messages from a test phone (parser cases live in `test_momo_parser.ts`).

- **Parser:** the sender's free-text note is removed before reading (it can say "failed" or quote an amount);
  a help line run onto the confirmation without a space no longer hides it; currency after the number
  ("0.36 ZMW"); money-in wordings that use an "out" verb ("Payment received from", "You have been paid");
  a transaction id must contain a digit; data-bundle notices ("K10: 1GB ... valid until") are not money.
- **Duplicates:** a message with no id is a repeat only within 15 minutes; later, the same wording is a new
  transaction. The same id in the opposite direction (a reversal) is kept.
- **Phone:** only an answer from the capture service settles a queued message (a login page, redirect or 404 keeps
  it); queued messages are re-sent by a job when the phone is back online; with no capture key, messages are kept
  and sent after reconnecting, and a notification says capture has stopped; an unknown sender id is accepted when
  the text names the provider and carries a transaction id.

Not covered: a phone that blocks background apps (some brands need "auto-start" / "no battery restrictions" for
MoneyWise), bank messages, and Zamtel wording, which has not been seen on a real phone yet.
