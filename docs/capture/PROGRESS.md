# AI Transaction Capture — progress (updated 2026-11-04)

**Done — Phase 0 (shared queue, not applied).** Migration `20261104120000_transaction_capture_phase0.sql` adds `capture_settings` (per-org flag/kill switch, off by default), `capture_attachments`, `transaction_captures` and the private bucket, generalises `capture_jobs` and schedules `capture-worker`. Also: `services/capture/*` (deterministic logic, upload→OCR→match→draft, one-to-one Lenco/MoMo matching both ways, approve/merge/dismiss/undo, MoMo mirror), `/captures` API, Inflows → Captured tab + review card, Integrations card, `npm run test:capture` (19 checks).

**Assumptions**

- Built Phase 0 because no phase was named; Meta/email/invoice matching untouched.
- Undo of a booked capture uses Guardian's neutralise (zero + tag, drop journal, rebuild balances). No void endpoint exists for manual entries.
- "Transactional" approve = conditional POSTING lock + deterministic `CAPTURE-<id>-<seq>` reference reused on retry. Booking runs in JS, so a single DB transaction isn't possible.
- Receipt uploads are CLAIMED and never auto-post; only provider-parsed MoMo rows or wallet matches count as CORROBORATED.
- Kill switch blocks upload, processing, mirroring, matching and auto-post. Approve, dismiss and undo of existing rows stay allowed. Cashiers can upload; only Owner/Admin/Accountant can review.
- MoMo rows still book through MoMo Capture's `post`; MoMo-sourced entries can't be undone from the queue.

**D1 — Legacy Meta columns**

- Retain the existing `messaging_messages` classification and matching columns for now. `capture.worker.ts` still processes `META_MESSAGE` jobs through `classifyMessage()` in `messageIntent.service.ts`, and `ingest_meta_message()` continues to enqueue those jobs.
- Leave `20261103120000_meta_messaging.sql` unchanged. Do not drop these columns until the Meta message workflow is migrated to `transaction_captures` or retired. Verify the actual schema for `intent_currency` and `intent_category` before deciding their status.

**D2 — Email provider and domain (P2-3)**

- Reuse Resend for both outbound notifications and inbound transaction-capture email. The existing outbound integration uses `RESEND_API_KEY` and defaults to `MoneyWise <notifications@moneywise.blueopus.cloud>`. The `moneywise.blueopus.cloud` domain is shown as verified in Resend.
- A dedicated Resend inbox has been created using the "Use a receiving address" option. Its generated receiving address is `fb01cfdd@naunal.resend.app`. This option was selected instead of enabling receiving through the domain's MX records, so existing outbound email configuration should remain unaffected.
- Resend's webhook event list includes `email.received`, but no webhook has been created yet.
- Before implementation, verify the exact `email.received` payload, webhook signature verification, message and attachment retrieval, retry/idempotency behaviour, and safe mapping of receiving addresses to MoneyWise-Pro organisations. Do not assume the event itself contains the full email contents or attachments.

**D2 — AI Transaction Capture plan access (G-2)**

- AI Transaction Capture is a Premium-plan feature. Only organisations with `plan_id = 'premium'` and `status = 'active'` may use it.
- The existing billing system identifies the paid plan as `premium` (display name: Premium, K250/month). No additional subscription plan will be created.
- Enforce plan eligibility in the backend, including capture API requests and background processing. Frontend visibility is not sufficient.
- Retain the existing per-organisation capture-enabled setting as an additional control.

**D2 — Meta App Review ownership (N-1)**
- The Blue Opus Team owns the Meta App Review process, including Developer account management, permission justifications, demonstration preparation, submission, and responding to Meta's review feedback.
- The implementation team must provide the technical documentation and working demonstrations needed to support the review.

**Open issues**

- Not run: `test:ledger` and `test_manual_entry_tool` (they write to the live DB), and ESLint (no eslint dependency or v9 config in the repo).
- Fixed 2026-11-05: Premium + active is enforced on `/captures` (402 `PLAN_LIMIT`) and in background work through `getCaptureSettings`. Deferred jobs keep their attempts (`20261105120000_capture_defer_keeps_attempts.sql`, not applied or run yet). Open to every plan: `GET /captures/settings` and a zero `/captures/count`. A lapsed org can't review or undo existing captures until it renews.
- Jobs for orgs with capture off are re-deferred every 5 minutes indefinitely; add an expiry if Meta volume grows.
- Do not run `supabase db push`: production migration history is out of sync with the repo. Confirm production's contents first.
- Approve of an upload capture before its MoMo SMS arrives can still double-book if MoMo auto-post is on (flagged `POSSIBLE_DUPLICATE_MOMO`). Guardian check "no Lenco-matched capture has its own entry" not added. AI budget counts captures, not calls. Mobile app screens not built.

**Added 2026-11-05 (uncommitted, untested against a database)**

- Phase 0: double-booking fix, integrity check, exact AI budget, ledger evidence link, editable line items, daily digest, mobile Captured screens.
- Phase 1: pre-filter, chat extraction, conversations, product/customer/invoice matching, media download. The worker now runs `capture.chat.ts`; `messageIntent.service.ts` is unused and stays until the legacy columns go.
- New migrations, in order after Phase 0: `20261105120000`, `20261105130000`, `20261105140000`, `20261105150000`.
- Deploy order matters: apply `20261105150000_capture_chat.sql` before the API, because `ingestMessages` now sends the media arguments. Otherwise Meta webhooks fail.
- Assumptions: a conversation lasts 6 hours; two same-amount payments from one contact in that window merge into one capture (a missed entry is safer than a duplicate). Files sent in chat are treated as money in.

**Next:** Meta connect, disconnect and token health; data deletion; privacy wording; retention; key rotation. Then Phase 2. Test everything once a staging database exists.
