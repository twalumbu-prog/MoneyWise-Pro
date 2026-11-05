# AI Transaction Capture — remaining tasks

As of 2026-11-04. Phase 0 code is written but not applied or committed (see PROGRESS.md). Each task below can be done and merged on its own; **Needs** lists the tasks that must land first. Paths are relative to `MoneyWise-Pro/`.

## Before anything else

- **D1 — Decide the `messaging_messages` columns.** `npx supabase db push` also applies `20261103120000_meta_messaging.sql`, which still has `intent`, `intent_*`, `match_status`, `matched_cashbook_entry_id` and `match_score`. The spec recommends dropping them because `transaction_captures` replaces them. Edit that file *before* the first push (simplest), or write a drop migration later (task P1-1).
- **D2 — Answer the spec's open questions** that block later phases: email provider and domain (P2-3), whether capture is a Pro-plan feature (G-2), and who owns the Meta App Review submission (N-1).

---

## Phase 0 — finish and pilot

**P0-1 Apply and switch on for pilots** (ops) · Needs D1
- Run `npx supabase db push`. `setup_internal_cron.ts` must already have been run, or the scheduler migration refuses.
- Insert `capture_settings (organization_id, enabled) VALUES ('<pilot org>', true)` for 2 pilot orgs.
- Done when: `/cron/capture-worker` heartbeats every minute in `job_heartbeats`, and a test upload drafts within 60 s.

**P0-2 Stop the upload-then-SMS double booking**
- In `ingest()` in `apps/api/src/services/momoCapture/momoCapture.service.ts`, before auto-posting, look up `transaction_captures` by `captureDedupeKey({ momoRowKey })`. If that capture already has a `cashbook_entry_id`, save the MoMo row as `MATCHED` to that entry instead of posting.
- Remove the `POSSIBLE_DUPLICATE_MOMO` branch in `services/capture/capture.momoMirror.ts`.
- Done when: a screenshot approved first, followed by the same SMS with auto-post on, leaves exactly one entry.

**P0-3 Ledger integrity check for captures**
- In `apps/api/src/services/ledgerIntegrity.service.ts`, add finding `CAPTURE_DOUBLE_BOOKED`: a capture with both `matched_cashbook_entry_id` and its own `cashbook_entry_id`, or two captures pointing at one entry.
- In `apps/api/src/scripts/test_ledger_scenarios.ts`, add scenarios L1 (1,000 mixed captures), L2 (approved, then Lenco arrives → Guardian neutralises) and L3 (30-day backdated capture keeps `balance_after` right).
- Done when: `npm run test:ledger` passes on a staging database.

**P0-4 Exact AI budget**
- Migration: `capture_ai_usage (organization_id, day, calls)`, plus an RPC `increment_capture_ai_usage(org)` that returns the new count.
- In `services/capture/capture.service.ts`, replace `aiCallsToday()` and increment the count around the OCR and `suggestCategory` calls.
- Done when: the 501st call of the day queues a capture without AI and flags it `AI_BUDGET_EXCEEDED`.

**P0-5 Source badge and "View evidence" in the ledger**
- API: `GET /captures/by-entry/:entryId` in `routes/captures.routes.ts` and `capture.service.ts`, scoped to the org.
- Web: `apps/web/src/pages/CashLedger.tsx` and its entry detail drawer show a "Captured" badge and a link that opens `CaptureReviewCard`.
- Done when: an approved capture's entry shows the badge, and totals are unchanged.

**P0-6 Edit line items on the review card**
- `components/capture/CaptureReviewCard.tsx`: make the line-items rows editable.
- `capture.service.ts`: add `line_items` to `EDITABLE` and store it on approve.

**P0-7 Integration tests (test database)** · Needs P0-1 on staging
- New `apps/api/src/scripts/test_capture_flow.ts`, using the throwaway-org pattern from `test_ledger_scenarios.ts`. Covers I1 (upload → job → capture → approve → balanced entry), I3 (capture first, Lenco 40 min later → rematch flips it to MERGED), I4 (two concurrent approves → one entry), I5 (undo → entry neutralised, balance restored) and I7 (OCR throws → retries, then NEEDS_REVIEW).
- Add `test:capture-flow` to `apps/api/package.json`.

**P0-8 Security tests** · Needs P0-1 on staging
- New `apps/api/src/scripts/test_capture_security.ts`. S1: every `/captures` route called with org A's session and org B's ids → 404. S2: anon and authenticated keys `select *` on the 3 new tables → 0 rows. Also checks a cashier gets 403 on approve.

**P0-9 Daily digest**
- `apps/api/src/services/notificationCounts.service.ts`: add the captures-to-review count.
- New cron route `/cron/capture-digest` in `controllers/cron.controller.ts` that sends "N captured, M need review" through `email.service.ts` and push. Register it in `internal_cron_jobs` with a migration.

**P0-10 Mobile review screens**
- New `apps/mobile/app/captures.tsx` (list) and `apps/mobile/app/captures/[id].tsx` (review), using the same `/captures` API.
- Share-sheet target for images and PDFs that calls `/captures/upload`.
- Move MoMo Capture settings under `apps/mobile/app/settings/integrations.tsx`.

**P0-11 Pilot gate** (ops)
- 2 orgs for 2 weeks, zero duplicates, at least 70% approved without edit. The rate is approved captures whose `edits.diff` is empty divided by all approved. Add a SQL view or admin query for it.

---

## Phase 1 — WhatsApp

**P1-1 Messaging schema clean-up and conversations**
- Migration: drop the `messaging_messages` intent/match columns (if D1 didn't), allow `direction = 'OUT'` rows from echoes, and create `capture_conversations` (organization_id, connection_id, contact_id, opened_at, last_message_at, crm_contact_id) with RLS on, no policies, grants revoked.

**P1-2 Connect API**
- `apps/api/src/controllers/meta.controller.ts`:
  - `getMetaConnectUrl` returns the Embedded Signup config (`META_WA_CONFIG_ID`) with an HMAC-signed `state` (org, user, expiry).
  - `metaOAuthCallback` becomes `POST /integrations/meta/callback`. It checks the role, verifies `state`, exchanges the code for a token, lists the WABA's phone numbers, `POST /{waba}/subscribed_apps`, then calls `saveConnection()`.
- Refuse a number already connected to another org, and say who to contact.
- `apps/api/src/routes/integrations.routes.ts`: add `requireRole(['OWNER','ADMIN','ACCOUNTANT'])`.
- Write an audit row on connect.

**P1-3 Connect button (web)**
- New `apps/web/src/components/settings/integrations/ConnectMetaButton.tsx`. It loads the Facebook JS SDK on click, runs `FB.login` with `config_id`, and posts the code to `/integrations/meta/callback`. Shows 3-step progress and maps Meta errors to plain English.
- `MetaMessagingIntegration.tsx` uses it. Card states: Not connected, Connecting, Connected (name, number, last message), Needs reconnect, Error. Add per-channel toggles for capture and auto-post.

**P1-4 Disconnect properly**
- In `disconnectMeta`: role check, `DELETE /{waba or page}/subscribed_apps` with the decrypted token, an audit row, and keep existing captures.
- Done when: new messages stop within 1 minute.

**P1-5 Token health**
- New cron `/cron/meta-token-health`. Connections within 7 days of `token_expires_at` get `status = 'PENDING'` (card shows Reconnect).
- In the worker, a Graph error 190 sets `EXPIRED` and emails the owner once; track this with a `notified_expired_at` column.

**P1-6 Media download**
- `services/meta.service.ts` `parseWebhook`: keep the media id and mime for image and document messages.
- New `services/capture/capture.media.ts`: fetch the media URL with the decrypted token, download it immediately, then insert `capture_attachments` (`source_table='messaging_messages'`) and an `ATTACHMENT` job. Identical files are deduped by sha256.

**P1-7 Pre-filter (Stage 1)**
- New `services/capture/capture.prefilter.ts`. Pure function: drop greetings, stickers, reactions and "ok thanks"; keep money patterns (K, ZMW, kwacha, `1.5k`, `1,500`), payment words or an attachment.
- Test: `scripts/test_capture_prefilter.ts` with a labelled set in `scripts/fixtures/prefilter_lines.json` (U4: at least 98% of transaction lines kept, at least 70% of chatter dropped).

**P1-8 Chat extraction (Stage 2 text)**
- New `services/capture/capture.extract.ts`. One `openRouterComplete` call with a strict JSON schema; the context is the last 10 conversation messages, the product list and the currency. No tools. Invalid JSON or no amount → NEEDS_REVIEW. Always `claim_state = 'CLAIMED'`; run `looksLikeInjection`.
- `capture.worker.ts`: the `META_MESSAGE` branch runs prefilter → conversation grouping → extract → `matchAndRoute`, instead of `classifyMessage`.
- Delete `services/messageIntent.service.ts`.
- Done when: "I'll take 2" … "sent K450" yields one capture.

**P1-9 Products and CRM matching (Stage 4)**
- `capture.extract.ts` and `capture.service.ts`: map line items to `product_id`, using the product's income account and routing from `product_routing.service.ts`.
- Set `suggested_crm_contact_id` by phone, then by name.

**P1-10 Invoice matching**
- `capture.service.ts` `matchAndRoute`: after the MoMo step, call `listOpenInvoices(org, contact)` from `customerInvoice.service.ts` and match on amount → `match_type = 'INVOICE'`.
- On approve, call `allocatePayment()` with the booked entry.

**P1-11 Chat evidence and ConversationDrawer**
- `CaptureReviewCard.tsx`: render chat bubbles from `messaging_messages`, with `detail()` returning them.
- New `components/capture/ConversationDrawer.tsx`: the full thread plus linked captures (read-only in Phase 1).

**P1-12 Data deletion callback**
- `POST /integrations/meta/data-deletion`: parse Meta's signed request, delete that user's messages and attachments (storage objects too), and return `{ url, confirmation_code }`.
- New public status page `apps/web/src/pages/DataDeletionStatus.tsx`.

**P1-13 Privacy and terms**
- `apps/web/src/pages/PrivacyPolicy.tsx` and `TermsOfService.tsx`: say that message text and receipts are sent to AI providers, list retention periods, and explain deletion.

**P1-14 Retention purge**
- New cron `/cron/capture-retention`: delete message bodies and attachments of non-transaction or dismissed items older than 90 days. Keep evidence for booked captures.

**P1-15 Key rotation**
- New `apps/api/src/scripts/rotate_messaging_token_key.ts`: decrypt each token with the old key and re-encrypt with the new one (`lib/tokenCrypto.ts`).

**P1-16 Phase 1 tests**
- U1/U2/U3: `scripts/test_meta_webhook.ts` with recorded payloads in `scripts/fixtures/meta/`.
- U5 golden set (200 labelled messages, receipts and emails): `scripts/fixtures/golden/` plus `scripts/test_capture_golden.ts`. Note this calls AI.
- I6, I8, S3, the S4 50-message corpus, and S5 (grep logs and PostHog for `EAA` / `IGQ`).
- Load tests P1/P2/P3/P5 as k6 scripts in new `apps/api/loadtest/`.

**P1-17 Phase 1 gate** (ops): 5 orgs for 2 weeks, webhook p95 under 1 s, zero cross-org leaks.

---

## Phase 2 — Facebook & Instagram, email, replies

**P2-1 Facebook & Instagram connect**
- Extend P1-2 and P1-3 with Facebook Login for Business (`META_LOGIN_CONFIG_ID`): list Pages and linked IG accounts, `POST /{page}/subscribed_apps`, store the 60-day IG token expiry.
- Errors for a personal IG account or a Page the user doesn't admin.

**P2-2 Messenger and IG extraction**
- Reuse P1-6 to P1-8 for `FACEBOOK` / `INSTAGRAM`. There is no phone, so matching relies on single-candidate merges or a CRM link.

**P2-3 Email forwarding** · Needs D2
- Migration: `inbound_emails` table, plus `capture_settings.email_alias` (unique).
- `POST /integrations/email/inbound` checks the provider signature, resolves the org from the alias, stores the email, and queues an `EMAIL` job. Attachments go to `capture_attachments`. Drop known newsletter senders.
- `capture.extract.ts` handles email text; PDFs go through the existing ATTACHMENT path. Lenco window ±24 h.
- New `components/settings/integrations/EmailCaptureSetup.tsx`: copy the address, Gmail and Outlook steps, and a "Send test email" check.

**P2-4 Assisted replies**
- `meta.service.ts` `sendMessage()`. The reply box in `ConversationDrawer.tsx` shows an AI draft, a 24-hour window indicator and a Send button. Only send after the user taps Send; store it as an OUT message; write an audit row.

**P2-5 CRM**
- `apps/web/src/pages/CRM.tsx` plus the CRM API: captured transactions and linked chats on the contact page, and "Create contact" from a capture (`ensureCustomer`).

**P2-6 Phase 2 gate** (ops): 20 orgs, with sends verified in the audit logs.

---

## Phase 3 — Gmail and general availability

**P3-1 Gmail direct**: "Sign in with Google" OAuth (read-only scope), Gmail `watch` through Pub/Sub, and a new `GMAIL` source reusing the P2-3 pipeline. Blocked on Google verification and CASA (N-2).

**P3-2 GA**: per-org confidence tuning from approve-without-edit rates (Stage 6); remove the pilot-only defaults; run the P6 30-day replay and confirm reports are byte-identical for orgs with no connections.

---

## Cross-cutting

- **G-1 No-regression checks** before each gate: Lenco sync, payment links and POS replay with zero diff; QuickBooks posts a capture entry once (I9); Vercel CPU per org within 10%.
- **G-2 Plan gating**: if capture is Pro-only, check it in `routes/captures.routes.ts` and the settings card.
- **G-3 ESLint**: the repo has a root `.eslintrc.json` but no `eslint` dependency, so lint can't run. Add `eslint@8` to the workspace, or migrate to `eslint.config.js`.

## Not code (start now — long lead times)

- **N-1 Meta**: verified Business portfolio (PACRA certificate and proof of address), Tech Provider status, and App Review with a screencast for each of the 8 permissions. Also check whether WhatsApp coexistence works for +260 numbers.
- **N-2 Google**: restricted-scope verification and the yearly CASA assessment (Phase 3 only).
- **N-3 Env vars** on the production API: `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `META_WA_CONFIG_ID`, `META_LOGIN_CONFIG_ID`, `MESSAGING_TOKEN_KEY`, and the email provider key and domain.

## Found along the way (not in the spec)

- `updateEntryAccount` in `apps/api/src/controllers/cashbook.controller.ts:745` updates an entry by id **without filtering by organization_id**. That is a cross-org write. Fix it separately.
