# How MoneyWise Keeps Lenco Collections Verification Reliable

This is a companion to [`lenco-collections-payment-integration.md`](./lenco-collections-payment-integration.md)
(which covers the checkout UI/UX). This document is backend-focused: **why MoneyWise's
Collections API payments verify consistently**, for comparison against another platform
(MasterFees) reporting the opposite symptom — valid payments going through on Lenco's side but
the checkout's processing screen never picking them up, inconsistently, under real customer
volume.

If MasterFees is seeing "stuck on processing, payment never lands in the DB" for *some*
payments while others go through fine, the likely causes are the gaps this document's
mechanisms specifically close. Read §8 first if you're triaging.

---

## 1. The core problem this architecture solves

A single client-side poll loop calling Lenco once and trusting the answer is fragile in
production for reasons that don't show up in testing:

- Lenco's collection record can be **not-yet-visible** for a few seconds right after
  initiation (a `404`/"not found" immediately after dispatch is normal, not a failure).
- A **webhook and a client poll can race** — both may try to write the same successful
  payment into the ledger at nearly the same moment.
- The **customer's connection can die** mid-wait (mobile money customers are disproportionately
  on flaky connections) — a client-only poll loop dies with the tab.
- **Cloudflare can occasionally 403 a legitimate request** to Lenco's API from certain networks.
- At volume, **every layer needs to be idempotent**, because the same successful payment can be
  reported to your backend three different ways (webhook, client poll, background sync) and
  must only ever be recorded once.

MoneyWise's answer is not one mechanism — it's **four independent paths to the same
finalization function**, each covering the failure mode the others miss, all funneling through
one idempotent write.

```
                    ┌─────────────────────────────────────────┐
                    │   handleCollectionSuccessful(data)       │
                    │   (single idempotent finalization path)  │
                    └─────────────────────────────────────────┘
                       ▲            ▲              ▲
                       │            │              │
      ┌────────────────┘   ┌────────┘    ┌─────────┘
      │                    │              │
 ① Webhook          ② Client poll   ③ Background sync (pg_cron
 (real-time push,   (every 2s while  every 5min → edge function
 <1s typical)       customer waits)  → /lenco/sync, safety net for
                                      anything that fell through ①②)
```

A fourth layer, ④ **server-held long-poll** (`/public-collection-longpoll`), exists as a lower-
latency alternative to ② but is not yet wired into the checkout UI — see §7.

---

## 2. Path ① — Webhook (`POST /lenco/webhook`)

`apps/api/src/controllers/lenco.webhook.controller.ts` → `handleLencoWebhook`

This is the fastest path (Lenco pushes it the moment the mobile money network confirms) and is
the primary way most payments actually get recorded — the client poll (§3) exists to *catch up*
the UI, not to be the thing that writes the ledger entry in the common case.

### Signature verification — dual-key, not single-key

```ts
const webhookHashKey = crypto.createHash('sha256').update(secretKey).digest('hex');
const expectedSignature = crypto.createHmac('sha512', webhookHashKey).update(rawBody).digest('hex');
```

**This is the single most important correctness detail if you're multi-tenant.** Lenco signs
each webhook with the secret key of the **account that owns the event** — for an org with its
own `lenco_secret_key` (a sub-account, not the platform's own account), the signature is
computed with *that org's* key, not your platform's global key. Verifying only against one
global secret key means every webhook for every sub-account **silently fails signature
verification and gets rejected with a 401** — Lenco will retry a few times then give up, and
those payments simply never post. This is exactly the "some payments work, most don't, no
obvious pattern" symptom.

The fix: resolve the org from the event's (unverified) `accountId`, look up *that org's*
`lenco_secret_key`, and accept a signature match against **either** the global key or the
resolved org's key. A forged `accountId` can't exploit this — it just fails verification
against both candidate keys.

```ts
const candidateKeys = new Set<string>();
if (process.env.LENCO_SECRET_KEY) candidateKeys.add(process.env.LENCO_SECRET_KEY);
if (accountId) {
    const { data: keyOrg } = await supabase.from('organizations')
        .select('lenco_secret_key').eq('lenco_subaccount_id', accountId).maybeSingle();
    if (keyOrg?.lenco_secret_key) candidateKeys.add(keyOrg.lenco_secret_key);
}
const isValidSignature = [...candidateKeys].some(key => /* HMAC check */);
```

**If MasterFees has one platform account signing on behalf of multiple sub-merchants (or
multiple Lenco accounts across environments), check this first** — a single hardcoded secret
key in the webhook signature check is the highest-probability cause of "webhook silently never
arrives to the app for some payments."

### Organization identification — two independent strategies

The webhook payload doesn't reliably carry your own internal organization ID, so it's derived,
in order:

1. **Regex-extract a UUID out of the `reference` string.** MoneyWise's references are shaped
   `DEP-<timestamp>-<subaccount-prefix>-<orgId-suffix>` — a UUID regex pulls candidate IDs out
   and checks each against the `organizations` table (checked from the end of the string
   first, since that's where the org-identifying segment lives by convention).
2. **Fallback: look up by `accountId`** (Lenco sub-account ID) if step 1 finds nothing.

If *neither* resolves, the event is dropped with a logged `payment_collection_org_unidentified`
analytics event — **this is a diagnosable dead end, not a silent one**. If MasterFees's
reference format doesn't embed an unambiguous org identifier, or its sub-account→org mapping
table can go stale, this is a second place payments can vanish without a trace in the app
(while still being real, successful transactions on Lenco's side — the exact symptom
described).

### Deduplication — multi-row-safe, not `.single()`

```ts
const { data: byRef } = await supabase.from('cashbook_entries')
    .select('id, status, ...')
    .eq('organization_id', organizationId)
    .eq('external_reference', reference)
    .limit(5);
```

Looked up with `.limit(5)` + explicit filtering in code, **never** `.single()`/`.maybeSingle()`
directly on a reference lookup. A finalized entry can coexist with a stale `PENDING` twin (e.g.
the intent-log call succeeded, then something raced it), and `.maybeSingle()` **errors out and
returns null** the moment more than one row matches — which silently reads as "not found" and
lets a duplicate be inserted, or worse, breaks the whole handler with an unhandled error. The
fix fetches candidates and explicitly picks the finalized one if present, self-healing the
leftover `PENDING` twin in the same pass (deletes it, and flips any still-`PENDING`
`product_sales` row tied to the same reference to `COMPLETED`).

If a finalized duplicate is found, the event is a no-op (idempotent) — logged as
`payment_collection_deduplicated`, never double-posted.

---

## 3. Path ② — Client-side poll (`GET /lenco/public-verify-status/:reference`)

`verifyCollectionStatus` in `lenco.controller.ts`. This is what the checkout UI polls every 2s
(see the UI doc). Its resolution order is deliberately layered so the *common* case (webhook
already landed) costs one cheap DB read, not a Lenco API round trip:

1. **DB-first.** Query `cashbook_entries` by `external_reference` OR a `LIKE %reference%` match
   on `description` (covers legacy intents that only ever embedded the reference in free text).
   If a **non-PENDING** row already exists, return `verified: true` immediately — no Lenco call
   at all. This is what makes the poll cheap and fast when the webhook already did the work
   (the common case), and it's also what makes duplicate-webhook-plus-poll races harmless: the
   poll just sees the already-finalized row.
2. **By `transactionId`**, if the initiating call captured one — `getTransactionById`.
3. **Fallback: `GET /collections/status/:reference`** directly against Lenco. On `successful`,
   calls the *same* `handleCollectionSuccessful(...)` the webhook calls — one finalization
   function, two entry points, so there's exactly one place that ever writes the ledger entry
   for a successful collection, and it's naturally idempotent against being called twice (via
   the dedup logic in §2).

### Handling "not found yet" without destroying the intent

Right after a collection is initiated, Lenco's own record of it may not have propagated yet —
a `404`/"not found" in the first few seconds is **expected, not an error**. The original
version of this code deleted the pending intent on any "not found" response, which destroyed
real intents for payments that went on to succeed seconds later (the money then showed up as an
unmatched raw inflow via the background sync — reconciled, but with none of the product-routing
/ booking-confirmation / notification side effects a proper finalization does).

The fix: a **15-minute grace window**. A "not found" only triggers cleanup of the `PENDING`
`cashbook_entries` / `product_sales` / `product_bookings` rows if they're **already older than
15 minutes** — otherwise the poll just reports `pending` and keeps waiting.

```ts
const GRACE_MINUTES = 15;
const stale = intents.filter(i => new Date(i.created_at).getTime() < cutoffMs);
if (!intents.length || stale.length === intents.length) { /* safe to clean up */ }
```

**If MasterFees's poll deletes or gives up on a pending intent the first time Lenco returns
"not found," that is very likely the bug** — it would produce exactly the reported symptom
(valid payments going through, but not landing, inconsistently — inconsistent because it
depends on exactly how fast Lenco's own record propagates relative to your poll timing, which
varies transaction to transaction).

### Cloudflare 403 handling

`LencoService.getCollectionStatus` distinguishes a `403` (Cloudflare WAF challenge, observed
intermittently from certain networks) from a genuine API error, and surfaces a specific
"blocked by security filters, try again later" message instead of a generic failure — so a
transient WAF block doesn't get misclassified as a payment failure and doesn't trigger the
stale-intent cleanup path.

### Secret-key caching

Because this endpoint can be hit up to ~90 times over one payment's wait, the org's
`lenco_secret_key` lookup is cached in-process for 60s (`apps/api/src/lib/orgSecretKeyCache.ts`)
rather than re-querying the DB on every poll tick — pure latency/load optimization, TTL kept
short because a rotated key needs to propagate quickly.

### Failure classification

Lenco's `reasonForFailure` is free text, not an enum. `classifyLencoFailureReason` (see the UI
doc §8) turns it into a stable `{code, message}` pair — this matters for reliability too, since
a specific failure classification lets you distinguish "genuinely declined" (safe to give up)
from "ambiguous" (keep the recovery record, might still resolve) rather than treating every
non-success as a hard stop.

---

## 4. Path ③ — Background reconciliation sync

**Trigger chain**: Supabase `pg_cron` (every 5 minutes) → Edge Function
(`supabase/functions/sync-lenco-transactions/index.ts`) → `POST /lenco/sync` on the production
API (`syncAllLencoTransactions` in `lenco.controller.ts`).

The edge function itself is intentionally a thin trigger — it does no reconciliation logic of
its own, it just calls the real API with a shared secret (`LENCO_SYNC_SECRET`) as bearer auth:

```ts
const response = await fetch(`${apiUrl}/lenco/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${syncSecret}` }
});
```

### The pg_cron setup (`supabase/migrations/20260606080000_setup_lenco_sync_cron.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
    'sync-lenco-transactions-cron',
    '*/5 * * * *',
    $$
        SELECT net.http_post(
            url := 'https://<project-ref>.supabase.co/functions/v1/sync-lenco-transactions',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := '{}'::jsonb
        );
    $$
);
```

`pg_net` is what lets a Postgres-side cron job fire an HTTP request at all (`net.http_post` runs
async inside Postgres, not from the edge function's own runtime) — `pg_cron` alone only
schedules SQL, it can't reach out to an HTTP endpoint by itself. The migration re-runs
`cron.unschedule` first (wrapped in a no-op-on-error block) so re-applying it is idempotent
rather than erroring on a duplicate schedule name.

Note the edge function call carries **no auth header** — the actual bearer auth
(`LENCO_SYNC_SECRET`) is added by the edge function itself when it calls the Node API, not by
this cron job when it calls the edge function. The edge function is reachable by anyone who
knows its URL (standard for a Supabase Edge Function); the API-facing secret is what actually
gates the privileged reconciliation work.

### `heal-platform-fees` — a second, narrower scheduled safety net

`supabase/functions/heal-platform-fees/index.ts`, scheduled every 6 hours via
`supabase/migrations/20260815120000_setup_fee_heal_cron.sql`, follows the identical thin-trigger
pattern (fetches `POST /admin/reconciliation/heal-platform-fees` on the Node API, authenticated
with the Supabase service-role key rather than `LENCO_SYNC_SECRET`).

It exists to close one specific class of bug found in production: `syncAllLencoTransactions`
(§4 above) *trusts, but never independently verifies*, that a "Split payment"/"Split-Inflow
Payment" debit line is already accounted for by its matching net-booked collection. When that
assumption breaks — e.g. Lenco's sub-account split-payment configuration stops auto-sweeping
some collections — the platform commission fee silently disappears from the ledger with no
trace, because the general sync has no reason to flag a debit it believes is already explained.
`heal-platform-fees` re-runs the same matching logic used to find and fix that gap by hand,
across every linked org, on its own schedule, so a future recurrence of the same gap surfaces
and gets posted within hours instead of sitting undetected for months (the original incident it
was built for went unnoticed for an extended period precisely because nothing was watching for
it).

**Relevant to MasterFees if its collection flow includes any comparable split/auto-sweep step**
(a portion of the collected amount forwarded automatically to a second account) — that's exactly
the kind of step whose failure mode is silent unless something specifically re-verifies it
later, independent of whatever synced the raw transaction data.

This is the **safety net** — it catches anything that both the webhook (§2) and every client
poll (§3) missed: a webhook that never fired (misconfigured endpoint, signature rejected — see
§2), a customer who closed the tab before any poll could confirm success, or a transient Lenco
API failure during every poll attempt.

Reliability details worth calling out, all learned from real incidents:

- **Least-recently-synced org first** (`order('last_lenco_synced_at', ascending, nullsFirst)`),
  with **every attempted org stamped immediately**, even before its own sync work runs. Vercel
  kills the function at a 30s hard limit; without ordering, whichever orgs happened to sort last
  after that cutoff simply never got synced, cycle after cycle — this is literally how one
  org's inflows went unrecorded for days in production before the fix. Stamping the org
  *before* doing its work (not after) means a hung/slow org doesn't get to monopolize the front
  of the queue on the next cycle either.
- **A hard internal time budget (15s) that only gates starting a new org**, not interrupting one
  already in flight — deliberately generous, because truncating an org's pagination mid-fetch
  to save time was found to **re-log duplicate inflows** on the next cycle (an incomplete
  settlement map is worse than a slower cycle). Correctness > packing more orgs into one run.
- **Idempotent by construction** — the same dedup-by-reference logic as the webhook path
  applies here too, so re-syncing an already-recorded transaction is a safe no-op.

At scale, this is the layer that guarantees **eventual** consistency even if the other three all
fail for a given transaction — worth having even if webhook + poll reliability is solid,
precisely because it's the only layer with zero dependency on the customer's browser or a
webhook delivery succeeding.

---

## 5. One finalization function, called from every path

`handleCollectionSuccessful(data, forcedOrganizationId?)` in `lenco.webhook.controller.ts` is
the **only** function that writes a successful collection into the ledger — called from the
webhook (§2), the client poll fallback (§3), and (indirectly, via the same dedup path) the
background sync (§4). This single-writer design is what makes the multi-path redundancy safe
instead of a duplicate-posting risk: no matter which of the three paths "wins" the race to
detect success first, the other two see an already-finalized row and no-op.

Inside, it also does the ledger-adjacent work atomically with the ledger write: commission
sweep to the settlement merchant (idempotent via a deterministic `SPLIT-<ref>` transfer
reference, checked before transferring), product revenue routing, booking confirmation, and
payment-link PAID flip — all deliberately part of the *same* finalization call, so a customer's
poll or the webhook doesn't just log a raw inflow that then needs a second pass to become a
correctly-routed sale.

---

## 6. What the client owns vs. what the server owns

A deliberate split, described in the UI doc in more depth:

- The **client's poll loop is disposable** — it can die (tab closed, connection lost) without
  losing the payment, because verification state lives entirely server-side, keyed by
  `reference`. `apps/web/src/lib/paymentRecovery.ts` persists just enough (`reference`,
  `orgId`, `startedAt`) in `localStorage` to resume polling the *same* reference after a
  reload — it is not itself a source of truth, purely a resumption hint.
- **Cancelling never deletes the pending intent.** Lenco has no cancel-collection endpoint — a
  dispatched USSD prompt can still arrive and be approved after the customer "cancels" in the
  UI. If the pending intent were deleted at that point, a late approval would land as an
  orphaned raw inflow with none of the product-routing/booking/notification side effects. The
  UI's cancel button only stops the *browser* from polling; the server-side intent and every
  reconciliation path continue to be able to find and finalize it correctly later.

---

## 7. An available but not-yet-adopted lower-latency path

`GET /lenco/public-collection-longpoll/:reference` (`longPollCollectionStatus`) + a paired
`POST /lenco/public-collection-finalize/:reference` (`finalizeCollection`) already exist in the
backend but the checkout UI still uses the plain 2-second client poll (§3), not this path.

The idea: the server holds one request open and polls Lenco itself at 1-second intervals from
Frankfurt (a fast EU→EU hop to Lenco) for up to ~22s (inside Vercel's 30s limit), so the client
gets a same-request answer instead of round-tripping from Zambia every 2 seconds. Finalization
is deliberately a **separate** POST from the long-poll GET, so the payer sees success the
instant Lenco's status flips, without waiting on ledger writes/routing/bookings/notifications to
complete first.

Mentioned here because if MasterFees is building this fresh, a server-held long-poll is a
meaningfully lower-latency design than a naive client setInterval, and the code already exists
in this repo as a reference if useful — it just hasn't been swapped in as the checkout's default
path yet.

---

## 8. Triage checklist for "processing page never finds payments"

In rough order of likelihood, given the symptom as described (works sometimes, inconsistent,
volume-sensitive):

1. **Webhook signature check uses one hardcoded/global secret key.** If merchants have
   individual Lenco accounts/sub-accounts, Lenco signs with *their* key — a single-key check
   silently 401-rejects most webhooks. This is the #1 suspect for "some worked, most didn't, no
   clear pattern." → See §2.
2. **Poll gives up (or deletes the pending record) on the first "not found" from Lenco.**
   Right after initiation, Lenco's own record can lag a few seconds — treating that as
   terminal failure is a race that depends on network timing, which explains inconsistency
   under load specifically (more concurrent load → more variance in how fast Lenco's status
   propagates). → See §3's 15-minute grace window.
3. **No background reconciliation safety net at all.** If the only two ways a payment can be
   recorded are "the customer's browser polls successfully" and "the webhook fires and is
   correctly verified," there's no backstop for either failing — which is consistent with
   "some payments never get inserted" with no path to recover them after the fact. → See §4.
4. **Non-idempotent or `.single()`-based dedup lookups.** Under real concurrent volume (500+
   people paying around the same time), webhook and poll can race on the *same* reference; a
   lookup that isn't multi-row-safe can throw or silently miss, and a write path that isn't
   idempotent can double-post or drop. → See §2/§3's `.limit(5)` + explicit-pick pattern.
5. **Org/reference identification depends on data that isn't always present.** If your
   reference format doesn't reliably embed a unique org key, or the accountId→org mapping can
   be stale/missing for some merchants, some fraction of webhooks/polls will resolve to "unknown
   org" and get dropped — which reads exactly as "worked for some, not others."
6. **Function timeouts silently truncating work under load**, if running on a similarly
   constrained serverless runtime (a hard wall-clock limit per invocation) — check whether
   whatever does the verification work has a real chance of being killed mid-flight once
   concurrency rises, and whether that failure mode is visible in logs at all.

---

## 9. Key files (MoneyWise reference)

| File | Role |
|---|---|
| `apps/api/src/controllers/lenco.webhook.controller.ts` | Webhook receipt + signature verification (`handleLencoWebhook`), single finalization function (`handleCollectionSuccessful`) |
| `apps/api/src/controllers/lenco.controller.ts` | Client poll endpoint (`verifyCollectionStatus`), background sync (`syncAllLencoTransactions`), long-poll pair (`longPollCollectionStatus` / `finalizeCollection`) |
| `apps/api/src/services/lenco.service.ts` | Lenco HTTP client, `classifyLencoFailureReason` |
| `apps/api/src/lib/orgSecretKeyCache.ts` | 60s in-process secret-key cache for the hot poll path |
| `apps/web/src/lib/paymentRecovery.ts` | Client-side resumption hint (not a source of truth) |
| `supabase/functions/sync-lenco-transactions/index.ts` | Thin edge-function trigger for the pg_cron-driven background sync (every 5 min) |
| `supabase/migrations/20260606080000_setup_lenco_sync_cron.sql` | pg_cron + pg_net schedule for the above |
| `supabase/functions/heal-platform-fees/index.ts` | Thin edge-function trigger for the platform-fee healing pass (every 6h) |
| `supabase/migrations/20260815120000_setup_fee_heal_cron.sql` | pg_cron schedule for the above |
| `apps/api/src/controllers/admin.reconciliation.controller.ts` | `POST /admin/reconciliation/heal-platform-fees` — the actual fee-gap matching logic |
