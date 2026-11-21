# MoneyWise Personal — new onboarding flow

Status: **M1–M7 built (all 15 steps), uncommitted, not deployed.** Both migrations (20261129100000, 20261129110000) applied to prod 2026-11-21. Flag `PERSONAL_ONBOARDING_V2` off. Date: 2026-11-21.

### M1 as built

| Piece | Where |
| --- | --- |
| Migration: `onboarding_progress.flow` (`LEGACY` / `PERSONAL_V2`) + `steps` JSONB; `users.first_name`, `last_name`, `date_of_birth`, `avatar_url` | `supabase/migrations/20261129100000_personal_onboarding_v2.sql` |
| Step keys + rules (names, date of birth, required steps, seed row) | `apps/api/src/services/personalOnboarding/steps.ts`; checks: `npm run test:onboarding` (13, incl. parity with core) |
| API: `GET /onboarding/personal/state`, `PUT /onboarding/personal/steps/:key`, `POST /onboarding/personal/complete` | `apps/api/src/controllers/personalOnboarding.controller.ts` |
| Flag: new personal orgs get `PERSONAL_V2` only when the API has `PERSONAL_ONBOARDING_V2=1` | `onboardingSeedRow` (email + Google/Apple sign-up) |
| Step registry (order, chapters, copy, `built`) | `packages/core/src/onboarding/personalSteps.ts` |
| Wizard (`/personal-onboarding`, or `?step=<key>&single=1` for one step), shell, Name + Date of birth, All set | `apps/mobile/app/personal-onboarding.tsx`, `src/components/onboarding/personal/*` |
| Home "Finish setting up" card | `FinishSetupCard.tsx` on `HomeScreen` |
| Funnel events: `onboarding_step_viewed/completed/skipped/error` (app), `onboarding_completed` (API) | `src/lib/analytics.ts` `track()` |

### M2–M7 as built

| Milestone | What | Where |
| --- | --- | --- |
| M2 | Welcome carousel (drawn art, auto-advance, reduced motion), Personal/Pro chooser + compare sheet, first-run vs returning routing | `app/(auth)/welcome.tsx`, `app/(auth)/choose.tsx`, `AccountTypeChooser.tsx`, `complete-profile.tsx`, `app/index.tsx` |
| M3 | Phone with 6-digit code on **WhatsApp** (no SMS provider exists), avatar (photo / sign-in photo / 8 characters / initials), intents | `StepPhone/StepAvatar/StepIntents.tsx`; API `/personal/phone/*`, `/personal/avatar`; migration `20261129110000` |
| M4 | Accounts with opening balances (`OPENING_BALANCE` entry, ref `ONB-OPEN-<wallet>`, against Personal Equity), capture (Android permissions / iPhone Shortcuts + tester), Gmail (app-return auth session, 90-day findings), assets & debts (own account + manual journal, ref `ONB-HOLD-<account>`), net worth ring | `StepAccounts/Capture/Gmail/Assets/NetWorth.tsx`; `personalMoney.controller.ts`; `services/personalOnboarding/money.ts` |
| M5 | Bills as scheduled items (email, loans, then common Zambian list; due dates become payment requests to approve), Grow plan in one screen (saved where Grow reads it), reminders + app lock | `StepBills/StepGrow/StepReminders.tsx`; core `BILL_SUGGESTIONS`, `nextBillDue`, `billMonthly` |
| M6 | Identity via the shared KYC profile (+ Gmail statement as proof of residence, direct Google connections only), wallet (18+, KYC first, pool empty handled, deposit found server-side) | `StepKyc/StepWallet.tsx`; API `/personal/kyc/statement-from-gmail`, `/personal/wallet/check`; `gmail.service.downloadEmailAttachment` |
| M7 | Walked every screen in the iOS Simulator with the preview server; fixes: bank initials instead of blank remote logos, single-colour ring gap, wrong-code clears, signed amounts, Grow plan length kept | — |

Also changed on the way: shared bank list grew to 16 (`core/reference/providers.ts`, web shows them too); MTN/Airtel captures find a nicknamed account of the same provider (`momoCapture.service.ts walletFor`).

Not done / not verified: none of M2–M6 server code has run against the real database; dark mode not handled (the app's tokens are light-only today); web has no Personal onboarding (mobile only); Android not run.

Go-live order: (migrations done) deploy the API → set `PERSONAL_ONBOARDING_V2=1` and redeploy → ship the app (OTA is enough: no new native code). Until the flag is on, nothing changes for anyone except the new welcome screen and Personal/Pro chooser, which every new install sees. Scope: the mobile app (`apps/mobile`) first; web follows the same step keys later.

## 1. Goal

A new user installs the app and, in about 5 minutes, ends up with:

- an account (Apple, Google or email),
- the right product (Personal or Pro),
- their real money in MoneyWise: every mobile money, bank and cash account with today's balance,
- automatic capture switched on (SMS/notifications on Android, the Shortcuts action on iPhone, Gmail for bank emails),
- a net-worth figure, their recurring bills on the schedule, and a Grow plan,
- optionally KYC done and the MoneyWise wallet activated.

The flow must never trap anyone. Only four things are required: **sign in, pick Personal, first + last name, date of birth.** Everything else can be skipped and comes back as a "Finish setting up" checklist on Home.

## 2. What already exists (reuse, don't rebuild)

| Need | Already in the codebase |
| --- | --- |
| Apple / Google sign-in | `apps/mobile/src/lib/socialAuth.ts` (native Apple, Google via web auth session; creates the account on first login) |
| Email sign-up/in, Personal vs Business toggle | `apps/mobile/app/(auth)/login.tsx` (Personal creates "`<name>`'s Workspace") |
| Signed-in gate → onboarding redirect | `apps/mobile/app/index.tsx` (`onboardingService.getState()` → `/onboarding`) |
| Wizard state per org, resume | `onboarding_progress` table + `/onboarding/*` routes; `apps/mobile/app/onboarding.tsx` (Personal currently = 3 steps: Welcome, Personal categories, Logo) |
| Progress header, step UI kit, confetti, completion screen | `apps/mobile/src/components/onboarding/*` |
| External accounts (MTN MoMo, Airtel Money, banks, Cash) | `external_wallets`, `manualEntry.service.ts` (`listExternalWallets`, `ensureCashWallet`) |
| SMS / notification capture (Android) and Shortcuts action (iPhone) | `modules/momo-capture`, `src/lib/momoCapture.ts`, `app/settings/momo-capture-setup.tsx` (iOS `mode=ios` walkthrough + verify step), `ClipboardCapturePrompt` |
| Gmail connection and transaction parsing | `/integrations/gmail/*`, `gmail.service.ts`, `emailIntent.service.ts`, Composio quick connect |
| KYC form, document upload, AI document check | `KycProfileForm.tsx` (NRC/Passport/Licence, front/back, photo, proof of residence), `kycDocumentCheck.service.ts` (scores, expiry, "proof of residence is recent") |
| Recurring bills | `scheduled_items` + `/schedules` routes, `app/schedules.tsx` |
| Grow targets and projection | `app/grow/setup.tsx`, `core/grow` (`projectGrowPlan`, `monthlyEquivalent`), saved in `users.preferences.grow[orgId]` |
| Net worth today | `useNetWorthToday` |
| Contacts | `src/lib/contacts.ts` (`expo-contacts`) |
| Wallet activation (Lenco wallet pool + activation fee) | `/onboarding/wallet`, `/wallet/claim`, `/wallet/activation-confirm`, `StepWalletActivation.tsx` |
| Analytics | `posthog-react-native` |

Gaps found while mapping:

1. ~~No organisation type column.~~ Corrected in M1: `organizations.is_personal` already exists (migration 20260928140000) and is used as-is. Email sign-up didn't set it; M1 fixes that. The app still guesses from the org name because `is_personal` isn't sent to the client.
2. **Onboarding steps are integers** (`current_step`, `completed_steps INT[]`, existing orgs grandfathered as `{1..10}`). The Personal flow will be reordered over time, so it needs **string step keys** with a done/skipped state each.
3. No date of birth on the user profile; avatar exists only as the org logo.
4. External wallets have no "opening balance as at onboarding" entry path that is clearly separated from real transactions.
5. No "suggest recurring bills" source other than the user typing them.

## 3. Recommended sequence

Four chapters after sign-up. The progress header shows the chapter name and a bar for the whole flow; each screen does one job.

```
Pre-account     0 Welcome carousel ─ 1 Sign in / sign up ─ 2 Personal or Pro
                                                              │
Chapter 1       3 Your name ─ 4 Date of birth ─ 5 Phone ─ 6 Avatar
"About you"
Chapter 2       7 What brings you here ─ 8 Your accounts & balances ─ 9 Auto-capture
"Your money"    ─ 10 Gmail ─ 11 Other assets & debts ─ 12 Net worth reveal
Chapter 3       13 Recurring bills ─ 14 Grow plan ─ 15 Reminders & app lock
"Your plan"
Chapter 4       16 Verify your identity (KYC) ─ 17 Activate MoneyWise wallet
"Unlock"        ─ 18 All set
```

Why this order, where it differs from the brief:

- **Accounts before Gmail.** Gmail is the step most likely to lose people: it leaves the app for Google's consent screen, and a restricted-scope app shows warnings until Google's verification is done. Putting it after the person has already added their accounts means (a) they have already invested in the setup, and (b) the Gmail step can say exactly what it adds ("we'll read your Zanaco and Stanbic alerts"). After Gmail connects, any bank it finds that the person didn't add is offered: "We also found FNB emails. Add FNB?"
- **Auto-capture right after accounts,** and only for the mobile money providers they picked. That is when "keep this balance up to date automatically" makes the most sense.
- **Net worth reveal is the reward** at the end of Chapter 2, the emotional peak, before asking for more work.
- **Bills before Grow,** so the Grow expense target can be prefilled from the bills total.
- **Contacts are not asked in onboarding.** A permission asked with no immediate use is usually refused, and on iOS a refusal is permanent until Settings. Ask at the first "Send money" / "Split" / "Invite to group savings". (If you still want it in onboarding, it fits as an optional card in step 15; see open questions.)
- **KYC and wallet activation last** and skippable: they are the heaviest steps and only needed for the wallet. KYC is placed directly before activation so the reason is obvious.

## 4. Screen-by-screen design and acceptance criteria

Common layout for every step (matches the reference screenshots): back chevron top-left, help (?) top-right opening a short sheet for that step, large title, one-line grey subtitle, content, then a bottom bar with **Skip** (secondary, left) and **Continue** (primary, right; disabled until valid). Required steps show no Skip. Keyboard never covers the bottom bar.

### Global acceptance criteria

- G1. Every step is saved server-side when Continue or Skip is tapped. Killing the app and reopening returns to the same step with entered values kept.
- G2. Back works on every step and never loses what was entered further ahead.
- G3. Only steps 1, 2, 3, 4 are mandatory. Skipping any other step never blocks a later step, except: wallet activation requires KYC (it offers to do KYC inline).
- G4. Every skipped or unfinished step appears on Home in a "Finish setting up" card (n of m done, tap opens that step on its own, outside the wizard), and the card disappears when all are done or dismissed.
- G5. Existing users never see the new flow. Existing Personal orgs are marked completed by the migration.
- G6. Works offline-tolerant: a failed save shows an inline retry, never a dead end, and nothing is lost.
- G7. PostHog events: `onboarding_step_viewed`, `onboarding_step_completed`, `onboarding_step_skipped`, `onboarding_step_error` with `{ step_key, chapter, platform, ms_on_step }`, plus `onboarding_completed { total_ms, skipped_keys }`. A funnel dashboard by step exists before launch.
- G8. Median time from first open to "All set" is under 6 minutes in testing with the required steps plus accounts, capture and bills.
- G9. Dynamic type up to the largest size, VoiceOver/TalkBack labels on every control, minimum 44pt tap targets, works in dark mode.
- G10. iOS and Android both pass every step; platform-specific steps (9) branch correctly.

### Step 0 — Welcome carousel (no account yet)

Top 55% media (Lottie or short looped video per slide), bottom: title, subtitle, page dots, buttons.

Slides (swipe or auto-advance every 5s, pauses on touch):
1. "All your money in one place" — MoMo, bank, cash balances together.
2. "Captured automatically" — SMS/Gmail turn into transactions.
3. "Never miss a bill" — schedule + reminders.
4. "Watch your net worth grow" — Grow chart.

Buttons, always visible: **Continue with Apple** (iOS; Android shows it below Google), **Continue with Google**, **Continue with email**; text link **I already have an account**. Small print: Terms of Use and Privacy Policy links.

Acceptance:
- 0.1 Shown only when there is no session. A signed-in user never sees it.
- 0.2 Slides swipe both ways; dots reflect position; reduced-motion setting stops auto-advance and animations.
- 0.3 Terms and Privacy open in an in-app browser and return to the same slide.
- 0.4 Media is bundled (no network needed to render the carousel).

### Step 1 — Sign in / sign up

- Apple/Google: native sheet; on success go straight to step 2 (new user) or to the gate in `app/index.tsx` (existing user).
- Email: one field, then "Create a password" (new) or "Enter password" (existing), detected from the email. Forgot password stays as today.
- Name and photo from Apple/Google are kept to prefill steps 3 and 6.

Acceptance:
- 1.1 Cancelling the Apple/Google sheet returns to the carousel with no error toast.
- 1.2 An email that already exists goes to the password screen, not to sign-up.
- 1.3 An existing user signing in on a new phone goes to their org, never into onboarding again.
- 1.4 Apple "Hide my email" relay addresses work and are stored as the user's email.

### Step 2 — Personal or Pro

Two large cards with an illustration, three bullet differences each, and a "Compare" link to a sheet with a side-by-side table.

- **MoneyWise Personal** — your own money: accounts, auto-capture, bills, savings goals, net worth.
- **MoneyWise Pro** — run a business: sales, payment links, products, payroll, requisitions, accounting, team.

Choosing Pro hands off to the existing business wizard (unchanged by this plan). Footnote: "You can add the other one later from Menu."

Acceptance:
- 2.1 Creates the org with `kind = PERSONAL` or `BUSINESS`; Personal org named "`<first name>`'s Workspace" once the name is known (rename after step 3).
- 2.2 Choosing is reversible until the first data is saved (back from step 3 returns here and changes the choice without creating a second org).
- 2.3 A user who already has one kind and adds the other later reaches this screen from Menu with the owned kind marked "You have this".

### Step 3 — Your name (required)

First name and last name on one screen (prefilled from Apple/Google). Hint: "As it appears on your NRC or passport" (needed for KYC matching later).

Acceptance:
- 3.1 Continue disabled until both have at least 1 letter; leading/trailing spaces trimmed; title-cased on save, but an explicit casing the user typed (e.g. "McDonald") is kept.
- 3.2 Saved to the user profile and the workspace renamed.

### Step 4 — Date of birth (required)

Native date wheel, default 25 years ago.

Acceptance:
- 4.1 Must be in the past and at most 120 years ago.
- 4.2 Under 18: may continue and use tracking, but the wallet activation step later explains it needs an adult and is hidden from the checklist. (Confirm, see open questions.)

### Step 5 — Phone number (skippable)

Country picker defaulting to Zambia (+260), number pad, "We'll send a one-time code". Then a 6-digit OTP screen with auto-fill from SMS (Android SMS Retriever, iOS one-time-code content type), resend after 30s.

Why here: it is the default sender match for capture, WhatsApp confirmations and wallet activation.

Acceptance:
- 5.1 Zambian numbers validated to 9 digits after +260 and prefix 09x/07x; network (MTN/Airtel/Zamtel) detected from the prefix and remembered as a suggestion for step 8.
- 5.2 OTP auto-fills on both platforms where supported; wrong code shows inline error; 5 failures lock for 10 minutes.
- 5.3 Skip leaves the phone empty and adds "Verify phone" to the checklist.

### Step 6 — Avatar (skippable)

Large circle with the initials, an edit pencil. Options sheet: Take photo, Choose from library, Use my Google/Apple photo (if any), Pick a character (set of 8 illustrated avatars in brand colours).

Acceptance:
- 6.1 Photo cropped to a square, compressed to ≤ 300 KB, uploaded to storage, URL saved on the user (not the org logo).
- 6.2 Camera/library permission asked only when that option is tapped; a refusal shows how to enable it in Settings and leaves the other options usable.
- 6.3 Skip keeps the initials avatar.

### Step 7 — What brings you here (skippable, 1 tap)

Multi-select chips: Track my spending, Save for something, Pay bills on time, Grow my net worth, Manage money with family, Get a loan. Personalises copy and order later (e.g. "Save for something" adds a "Create your first goal" item to the checklist; "Get a loan" moves KYC earlier on the checklist).

Acceptance:
- 7.1 Saved to `users.preferences.onboarding.intents`; Continue works with none selected.

### Step 8 — Your accounts and balances (skippable, the core step)

Title: "Where do you keep your money?" Segmented toggle: **Mobile money | Bank | Cash & other**.

- Mobile money grid: MTN MoMo, Airtel Money, Zamtel Kwacha (logos). The network detected in step 5 is preselected.
- Bank grid: Zanaco, Stanbic, FNB, Absa, Atlas Mara/Access, Indo Zambia, Ecobank, First Capital, Citi, Standard Chartered, UBA, AB Bank, plus "Other bank" (type the name).
- Cash & other: Cash at hand, plus "Other" (e.g. a savings club).

Each tick opens a small sheet: nickname (default "MTN MoMo"), current balance (ZMW, number pad, can be 0), and for banks optional last 4 digits. The list below the grid shows the added accounts with balances and a running total.

Acceptance:
- 8.1 Each added account creates (or reuses by name) one `external_wallet` and posts an **opening balance** entry dated today against Opening Balance Equity, flagged `source = ONBOARDING_OPENING` so reports and reconciliation can tell it from real activity.
- 8.2 Editing the balance before leaving the step updates that same opening entry; it never creates a second one. Removing an account before leaving deletes its wallet and entry.
- 8.3 The same provider can be added twice with different nicknames (e.g. two MTN lines).
- 8.4 Amount accepts up to 2 decimals, thousands separators shown, negative not allowed (an overdraft is added in step 11 as a debt).
- 8.5 The running total equals the sum of the opening entries posted.
- 8.6 Skipping creates only the Cash wallet at 0 (as today via `ensureCashWallet`).

### Step 9 — Automatic capture (shown only if a mobile money account was added; skippable)

Title: "Keep MTN MoMo up to date automatically". Short explainer with an illustration of an SMS turning into a transaction, and a privacy line: "Only messages from MTN, Airtel and Zamtel are read. Nothing else leaves your phone."

**Android:** "Turn on" → system prompt for SMS (when the build includes it) and then the notification-access settings page, with a "come back here" hint. On return, the screen shows each as ✓ or "Not allowed – try again".

**iPhone:** reuse the `momo-capture-setup` `mode=ios` walkthrough inside the wizard: *Connect this iPhone* (key to Keychain), then the five illustrated taps with a "Open Shortcuts" button, then the verify screen. "Do this later" is always visible because it takes a minute.

Both: a verify step "Waiting for your next mobile money message…" with a "Test with a message" option (paste any past MoMo SMS into the in-app tester) so people don't need to wait for a real transaction.

Acceptance:
- 9.1 A capture token is issued for this user + workspace only when the person taps Turn on / Connect.
- 9.2 Android: the step reads the real permission and listener state on return from Settings (AppState foreground), not what was tapped.
- 9.3 Android Play builds without SMS (`MOMO_SMS_CAPTURE=0`) show notification capture only, with no mention of SMS.
- 9.4 iOS: binaries older than 0.6.0 show the legacy shortcut path; 0.6.0+ show the App Intent path.
- 9.5 The test-message tester books nothing; it shows the parsed amount, direction and provider.
- 9.6 The first real capture during onboarding is shown as ✓ "Captured K…" and goes to Review captured, not auto-booked, unless the person turns on "Book automatically" here.
- 9.7 Skip adds "Turn on automatic capture" to the checklist.

### Step 10 — Connect Gmail (skippable)

Title: "Pick up bank alerts and receipts from email". Lists the banks they added that send email alerts. "Connect Gmail" opens Google consent (or Composio quick connect).

After connecting, a short scan (last 90 days) shows:
- banks found that aren't added yet → "Add FNB?" one-tap into step 8's sheet;
- recurring senders that look like bills (DStv, ZESCO, Netflix, internet provider) → carried into step 13 as suggestions;
- the newest bank statement PDF → offered in step 16 as proof of residence.

Acceptance:
- 10.1 Returning from Google with consent lands back on this step showing "Connected as name@gmail.com"; cancelling lands back here with no error.
- 10.2 The scan runs server-side, finishes or times out in 20 s, and the person can continue while it runs (results appear on the later steps when ready).
- 10.3 Nothing found is booked during onboarding; transactions found go to the normal review flow after onboarding ends.
- 10.4 A statement offered later is only attached to KYC if the person taps to use it.

### Step 11 — Other assets and debts (skippable)

"Anything else you own or owe?" Tiles: Savings/fixed deposit, Investments (shares, bonds, T-bills), Pension, Property, Vehicle, Business stake, Money people owe you; and Loans, Credit card/overdraft, Money you owe people. Each opens a sheet: name, value, (for loans) monthly repayment and day.

Acceptance:
- 11.1 Assets create asset accounts and debts create liability accounts with an opening balance entry (`ONBOARDING_OPENING`), so net worth = assets − liabilities from the books.
- 11.2 A loan with a monthly repayment is carried to step 13 prefilled.

### Step 12 — Net worth reveal (no input)

Animated count-up to today's net worth with a breakdown donut (mobile money, bank, cash, investments, other, minus debts). Line: "This is your starting point. Let's plan where it goes."

Acceptance:
- 12.1 The figure equals `useNetWorthToday` after the opening entries post (no separate calculation on the client).
- 12.2 Zero or negative net worth shows encouraging copy, not an empty chart.

### Step 13 — Recurring bills (skippable)

"What do you pay every month?" Suggestion chips, ordered by what Gmail found and then by common Zambian bills: Rent, ZESCO electricity, Water, Talk time, Data bundles, DStv/GOtv, Internet/Wi‑Fi, School fees, Transport, Groceries, Church/tithe, Insurance, Loan repayment, Gym, Netflix/Showmax, Family support. "+ Add another".

Tapping a chip opens a sheet: amount, how often (weekly / monthly / every term / yearly), next due date (a day of the month for monthly), pay from (accounts from step 8), and a reminder toggle.

Acceptance:
- 13.1 Each saved bill creates one `scheduled_items` row with the right frequency and next due date; it appears in Schedules after onboarding.
- 13.2 Bills are reminders only: nothing is paid or auto-debited by onboarding.
- 13.3 The monthly total of the added bills is shown and passed to step 14 as the expense suggestion.
- 13.4 Suggestions found in Gmail show a small "from your email" tag and the amount found.

### Step 14 — Your Grow plan (skippable)

Embed the existing Grow setup in wizard mode: income target, expense target (prefilled from bills), savings, investment, horizon, then the projection chart from today's net worth.

Acceptance:
- 14.1 Saves to the same place as Grow (`users.preferences.grow[orgId]`), so Reporting → Grow shows it without setting it up again.
- 14.2 Start net worth = the step 12 figure.
- 14.3 Expenses above income shows the warning Grow already shows, and still lets them continue.

### Step 15 — Reminders and app lock (skippable)

Two cards:
- **Notifications** — "Get reminded before bills are due and when money comes in." Native permission asked only on "Turn on".
- **App lock** — Face ID / fingerprint, with a 4-digit PIN fallback.

Acceptance:
- 15.1 Each permission is asked once, only after the person taps its button; refusal is accepted silently and the card shows "Turn on in Settings".
- 15.2 App lock, once on, is required on the next cold start.

### Step 16 — Verify your identity (skippable)

Shown with the reason: "Needed to activate your MoneyWise wallet and apply for loans." Reuse `KycProfileForm` pieces, split into small screens like the reference:

1. Choose document: NRC, Passport, Driver's licence.
2. Front, then back (camera frame with edge guide, "Choose existing" option). The AI document check runs right after each capture; a poor score shows the issue ("glare on the right side") and Retake.
3. Selfie.
4. Proof of residence: if step 10 found a recent bank statement, show "Use your Zanaco statement from 3 Nov" first; else upload a utility bill, bank statement or lease.
5. Review: details read from the ID (name, NRC number, DOB) prefilled and editable, checked against steps 3–4.

Acceptance:
- 16.1 Uses the existing KYC profile store, so the investment and loan flows see the same documents with no re-upload.
- 16.2 Name or DOB on the ID not matching steps 3–4 sets `needsReview`, shown to admins, and never blocks the user here.
- 16.3 A proof of residence older than 3 months is flagged by the existing check with a clear message.
- 16.4 Expired ID is rejected with a clear message.
- 16.5 Documents go to the private KYC bucket; no document image is kept in the device's photo library by the app.

### Step 17 — Activate your MoneyWise wallet (skippable)

Reuse `StepWalletActivation`: what the wallet gives (receive with a link, pay, save in groups), the activation amount from `app_settings`, pay from mobile money.

Acceptance:
- 17.1 Without KYC, the step offers "Verify first" which opens step 16 and returns here.
- 17.2 If the wallet pool has no free wallet, the step says activation is temporarily unavailable, adds it to the checklist, and lets them finish.
- 17.3 Activation is only marked done after the existing activation-confirm succeeds.

### Step 18 — All set

Confetti, the summary (accounts added, capture on/off, bills, net worth), and the checklist of skipped items with "Do it now" links. "Go to my dashboard".

Acceptance:
- 18.1 Marks the personal onboarding completed; the gate in `app/index.tsx` sends them to tabs from now on.
- 18.2 Home shows the "Finish setting up" card for any skipped items (G4).

## 5. Data and API changes

1. **Migration** (one file, applied with the code):
   - `organizations.kind TEXT CHECK (kind IN ('PERSONAL','BUSINESS'))`, backfilled with the current name rule; `app/index.tsx` and `login.tsx` read `kind`, with the name rule only as a fallback.
   - `onboarding_progress.flow TEXT DEFAULT 'BUSINESS_V1'` and `onboarding_progress.steps JSONB DEFAULT '{}'` (`{ "name": {"state":"done","at":…}, "gmail": {"state":"skipped",…} }`). New personal orgs get `flow = 'PERSONAL_V2'`. Existing personal orgs stay `COMPLETED`.
   - `users.date_of_birth DATE`, `users.avatar_url TEXT` (if not already present), `users.phone_verified_at`.
   - Cashbook/journal entries: allow `source = 'ONBOARDING_OPENING'`.
2. **API** (`onboarding.routes.ts`):
   - `GET /onboarding/personal/state` → flow, step states, prefill (name/photo from auth, detected network, Gmail findings).
   - `PUT /onboarding/personal/steps/:key` `{ state: 'done'|'skipped', data? }` → idempotent.
   - `POST /onboarding/personal/accounts` → create/update external wallet + opening entry (idempotent by client-generated id, so retries don't double-post).
   - `POST /onboarding/personal/assets` → asset/liability accounts + opening entries.
   - `GET /onboarding/personal/gmail-findings` → banks, bill senders, latest statement.
   - `GET /onboarding/personal/bill-suggestions` → merged Gmail + default list.
   - Bills reuse `POST /schedules`; Grow reuses its existing save; KYC and wallet reuse their existing routes.
3. **Mobile**: new route group `app/onboarding/personal/[step].tsx` driven by one ordered step registry (`key`, `chapter`, `required`, `visibleWhen`, component), so reordering is a config change. Business keeps `app/onboarding.tsx`.
4. **Core**: `onboardingService.personal.*` in `packages/core` so web can reuse it.

## 6. Delivery milestones

| # | Milestone | Contents | Done when |
| --- | --- | --- | --- |
| M1 | Foundations | Migration, `kind`, step registry, state API, analytics events, checklist card | A new personal user can go 0 → 4 → All set and resume after a kill; funnel visible in PostHog |
| M2 | Front door | Carousel, new auth screen, Personal/Pro chooser | 0.x, 1.x, 2.x pass on iOS + Android |
| M3 | About you | Name, DOB, phone + OTP, avatar, intents | 3.x–7.x pass |
| M4 | Your money | Accounts + opening balances, capture (both platforms), Gmail + findings, assets/debts, net worth reveal | 8.x–12.x pass; ledger integrity tests (`npm run test:ledger`) still pass with opening entries |
| M5 | Your plan | Bills + suggestions, Grow embed, notifications + app lock | 13.x–15.x pass |
| M6 | Unlock | KYC split screens, wallet activation embed | 16.x–17.x pass |
| M7 | Polish & launch | Media for the carousel, copy review, accessibility pass, dark mode, test with 5 real users, OTA + store build | G1–G10 pass; median time ≤ 6 min |

M2 and M3 can be built in parallel with M4 once M1 lands.

## 7. Test plan

- Unit: step registry visibility rules; opening-entry idempotency; bill frequency → next-due date; Zambian phone validation and network detection.
- API: each `/onboarding/personal/*` route, including repeated calls with the same client id (no double posting).
- Ledger: after onboarding with 3 accounts and 2 assets/1 loan, trial balance balances and net worth equals assets − liabilities.
- Device: full run on iOS Simulator and an Android device; Android with and without SMS build flag; iOS on 0.5.x and 0.6.0 binaries; airplane mode mid-step; kill and resume at every chapter.
- Drop-off review: after launch, check the PostHog funnel weekly; any step losing > 15% of those who reach it gets redesigned or moved to the checklist.

## 8. Open questions for you

1. Under-18 users: allow tracking only (my suggestion), or block sign-up?
2. Is KYC needed for anything other than wallet activation and loans (e.g. receiving above a limit)? That decides whether it stays skippable.
3. Should the activation fee be payable during onboarding, or should activation always be a later step?
4. Bank list: confirm the banks to show and whether any have logos we're allowed to use.
5. Contacts: ask at first use (my suggestion) or as an optional card in step 15?
6. Gmail: is the Google restricted-scope verification done? If not, Composio quick connect should be the default in step 10 to avoid the unverified-app warning.
7. Should a Personal user be able to add Pro later from the same login (step 2.3), or are they separate logins?
