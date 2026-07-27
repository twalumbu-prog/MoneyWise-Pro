# Lenco Collections API Payment Integration

How MoneyWise's public checkout surfaces (the catalogue/storefront portal and one-time
payment links) collect mobile money payments directly through Lenco's Collections API,
instead of the old LencoPay redirect widget.

Applies to two checkout surfaces, which share the same design and mechanics:

- **Catalogue/storefront checkout** — `apps/web/src/pages/PublicPay.tsx` (`/pay/:wallet_id`)
- **One-time payment link checkout** — `apps/web/src/pages/PublicPaymentLink.tsx` (`/pl/:token`)

Both use the shared `apps/web/src/components/PaymentWaitingScreen.tsx` component for the
processing UI, and the same backend endpoints in
`apps/api/src/controllers/lenco.controller.ts`.

---

## 1. Why this exists

The previous flow used the LencoPay widget: an iframe/redirect checkout SDK that opens a
popup, the customer approves on their phone, and the widget calls back `onSuccess`/`onClose`
in the browser. The problem: if the customer closed the popup before the webhook/confirmation
landed — or their connection dropped — the frontend had no reliable way to know what actually
happened, and a slow-but-successful payment could look "lost" to the customer.

The Collections API flow instead:

- Initiates the mobile money charge **server-side** (`POST /collections/mobile-money`), so the
  payment is tracked by its `reference` from the moment it's dispatched — independent of
  whatever the browser does afterwards.
- Renders our **own UI** for the wait (no widget iframe, no popup to accidentally close).
- Polls **our own backend**, which polls Lenco's `/collections/status/:reference`, to learn
  the final outcome.
- Persists a small recovery record in `localStorage` so a reload (or the customer closing and
  reopening the tab) can resume watching the same reference instead of losing track of it.

**Important constraint that shapes several design decisions below**: Lenco's Collections API
has **no cancel/void/recall endpoint**. Once a USSD prompt has been dispatched to the telco, it
cannot be recalled — "Cancel" in our UI can only stop *us* from waiting on it; the prompt may
still arrive on the customer's phone regardless.

---

## 2. Architecture overview

```
Customer                 apps/web (React)                apps/api (Express)              Lenco
   │                            │                                │                          │
   │  Fill mobile money number  │                                │                          │
   ├───────────────────────────>│                                │                          │
   │                            │  POST /public-wallet-deposit-  │                          │
   │                            │  intent (log PENDING intent)   │                          │
   │                            ├────────────────────────────────>                          │
   │                            │                                │                          │
   │                            │  POST /lenco/public-collection/ │                          │
   │                            │  mobile-money                   │                          │
   │                            ├────────────────────────────────>│  POST /collections/      │
   │                            │                                │  mobile-money             │
   │                            │                                ├──────────────────────────>│
   │                            │                                │<── pay-offline/pending ───┤
   │  <── USSD prompt arrives ──┼────────────────────────────────┼──────────────────────────>│ (async, telco-side)
   │                            │                                │                          │
   │  Enter PIN, approve        │                                │                          │
   │                            │  GET /lenco/public-verify-      │                          │
   │                            │  status/:reference (poll 2s)    │                          │
   │                            ├────────────────────────────────>│  GET /collections/       │
   │                            │                                │  status/:reference        │
   │                            │                                ├──────────────────────────>│
   │                            │                                │<─────── successful ───────┤
   │                            │                                │  finalize ledger, sweep   │
   │                            │                                │  commission, mark PAID    │
   │                            │<─── { verified: true, ... } ───┤                          │
   │  <── Success screen ───────┤                                │                          │
```

The **collection amount is gross** (subtotal + platform fee) — matching what the old widget
charged — while the PENDING intent logged in step 1 stores the **net subtotal**, so
finalization can still derive and sweep the same commission split it always has.

### Feature flag

Both `getPublicWalletContext` and `getPaymentLinkContext` return a
`collections_api_enabled` flag sourced from the `LENCO_COLLECTIONS_API_ENABLED` env var. The
frontend reads this once on load (`collectionsApiEnabled` state) and only offers the
mobile-money-via-Collections-API path when it's `true`; otherwise the old LencoPay widget path
(`channels: ['card', 'mobile-money']`, `LencoPay.getPaid(...)`) remains available as a fallback,
and is still the only path for card payments (the Collections API integration here only covers
mobile money).

---

## 3. Identity: resolving the mobile money account name

Before charging a number, the frontend calls
`POST /lenco/public-collection/resolve-momo` (`resolvePublicMobileMoneyName`), which hits
Lenco's `resolve/mobile-money` endpoint and returns the account holder's name. This is shown
live under the phone number field ("Account Holder: ...") as a trust signal, mirroring the
internal disbursement wizard.

This also lets checkout **skip a separate name/phone form** — the customer's identity for the
receipt/ledger comes straight from the resolved account name (`resolvedAccountName`) and the
number the prompt was sent to (`checkoutPhone`), rather than asking them to type their name
again. If resolution fails, the flow doesn't block — `resolveFailed` is just shown as an inline
note ("Could not verify — check the number") and the customer can still proceed; a failed
lookup is not the same as a failed payment.

Operator (Airtel / MTN / Zamtel) is auto-detected from the phone number prefix via
`detectOperator()` in `PublicPay.tsx`/`PublicPaymentLink.tsx` — no operator picker shown to the
customer.

---

## 4. The phase state machine

The processing UI is driven by a `PaymentPhase` union
(`apps/web/src/components/PaymentWaitingScreen.tsx`):

```ts
type PaymentPhase = 'initiating' | 'confirm' | 'polling' | 'success' | 'failed' | 'cancelled';
```

| Phase | Meaning | Entered from |
|---|---|---|
| `initiating` | The intent-log + collection-initiate network calls are in flight. | `handlePayMobileMoney` starts. |
| `confirm` | The USSD prompt has been dispatched; waiting on the customer to approve on their phone. | Collection call returns `pay-offline`/`pending`/`successful`. |
| `polling` | Same underlying poll loop as `confirm`, but the heading/copy shifts to reassurance-style copy once ~6s have elapsed (`elapsedSeconds >= 6`), since by then the prompt has likely been seen. | Automatic time-based transition, or resumed-on-reload always starts here. |
| `success` | Verified paid. | Poll finds `verified: true`. |
| `failed` | Either an explicit Lenco decline, or our poll gave up waiting (ambiguous — see §7). | Poll finds `status: 'failed'`, or hits `maxAttempts`. |
| `cancelled` | Customer pressed "Cancel payment" — we've stopped polling on our side, but the prompt is not recalled (see §1). | `handleCancelPayment`. |

Note the `confirm`→`polling` split is purely cosmetic timing on top of one continuous poll
loop — it isn't a separate network call.

---

## 5. Initiation flow (`handlePayMobileMoney`)

Located in `PublicPay.tsx` (and mirrored in `PublicPaymentLink.tsx`):

1. Validate: at least one cart item / valid amount, a recognized Zambian mobile money number
   (`detectOperator` must return non-null).
2. Derive identity from the resolved account name + phone (§3); no separate name/phone form.
3. Generate a client-side reference: `` `DEP-${Date.now()}-${subaccountId.slice(0,8)}-PUB` ``.
4. Enter the processing screen immediately at `phase: 'initiating'` (`setStep('VERIFYING')`) —
   the customer sees the UI respond instantly, before any network round trip completes.
5. Fire `trackEvent(..., 'payment', 'started', {...})` (see §9 for the full analytics list).
6. **Step A** — `POST /lenco/public-wallet-deposit-intent`: logs a PENDING `cashbook_entries`
   row (and `product_sales` rows / booking holds, if applicable) for the **net subtotal**. This
   is the same intent-logging call the old widget flow used — nothing here changed.
7. **Step B** — `POST /lenco/public-collection/mobile-money`: server resolves the org's Lenco
   secret key from the public `walletId` (`resolveOrgFromWallet`), then calls Lenco's
   `POST /collections/mobile-money` with the **gross** `amount` (§2). Lenco responds with a
   status of `pay-offline`, `pending`, or `successful` — anything else throws.
8. On success: `savePendingPayment(...)` writes the recovery record to `localStorage` (§6),
   phase moves to `confirm`, and `startCompletionPoll(...)` begins (§7).
9. On failure (Step A or B throws): clear any stale recovery record, drop back to the
   `CHECKOUT` step with an inline error message, and fire a `payment`/`failed` analytics event
   tagged `error_code` from the HTTP status or error message.

---

## 6. Client-side recovery (`apps/web/src/lib/paymentRecovery.ts`)

Because a mobile money confirmation can take 30–60s+ and customers on flaky connections often
refresh or briefly background the tab, a minimal recovery record is persisted to
`localStorage` under the key `mw_pending_payment`:

```ts
interface SavedPayment {
    reference: string;
    contextId: string; // wallet_id (catalogue) or token (payment link)
    orgId: string;
    phone: string;
    amount: number;
    businessName: string;
    startedAt: number; // epoch ms
}
```

- `savePendingPayment(p)` — written right after the collection is successfully initiated.
- `loadPendingPayment(contextId)` — read on page load; returns `null` if there's no record, the
  `contextId` doesn't match (a different wallet/link than the one open), or it's older than the
  15-minute TTL (matching the server's own stale-intent cleanup window, see §7).
- `clearPendingPayment()` — called on a final outcome: success, an explicit decline, or a fresh
  "Try again"/dismiss. **Deliberately NOT called on a poll timeout** — an ambiguous timeout
  might still resolve later, so the record needs to survive for a reload or manual recheck to
  pick it back up (§7).

### Resume-on-reload (`loadContext`)

On mount, after fetching public context, if `collections_api_enabled` is true and no resume has
happened yet this session (`resumedRef` guard — see below), `loadPendingPayment(walletId)` is
checked. If a record is found:

- State is rehydrated (`currentReference`, `checkoutPhone`, `resumedPayment`, etc.)
- The UI jumps straight to `phase: 'polling'` (skipping `initiating`/`confirm`, since the
  collection was already dispatched in a previous page load) with `elapsedSeconds` computed
  from `Date.now() - saved.startedAt`, so the progress feels continuous rather than restarting.
- `startCompletionPoll` resumes against the same `reference`.
- A `resume`/`started` analytics event fires with `elapsed_seconds_at_resume`.

**React StrictMode guard**: `loadContext` can run twice under StrictMode. `resumedRef` (a
`useRef(false)`) is set synchronously the first time a resume happens, and every fallback state
transition (`setStep('SHOP')`, etc.) is gated behind `if (!resumedRef.current)` — otherwise a
second `loadContext` invocation could clobber the just-resumed `VERIFYING` state back to the
shop screen.

---

## 7. Polling (`startCompletionPoll`)

One shared poll function used by both a fresh payment and a resumed one:

```ts
startCompletionPoll(ref, orgId, startedAt, analytics?)
```

- Polls `GET /lenco/public-verify-status/:reference?organizationId=...` every **2000ms**, up to
  **90 attempts** (~3 minutes total).
- A `pollCancelledRef` flag lets `handleCancelPayment` stop the loop immediately without racing
  an in-flight request.
- Three outcomes:
  - **`verifyRes.data.verified === true`** → `phase: 'success'`, `clearPendingPayment()`, fires
    `payment`/`succeeded` with `duration_ms` measured from `startedAt` (so a resumed payment's
    duration reflects the *original* start, not the reload).
  - **`verifyRes.data.status === 'failed'`** → an **explicit decline from Lenco**. `phase:
    'failed'`, `failureIsDeclined = true`, `clearPendingPayment()` (nothing to recover — Lenco
    confirmed it didn't go through), fires `payment`/`failed` with `error_code:
    reasonCode` and `error_message: reason` (see §8 for how these are classified).
  - **Neither, and `attempts < maxAttempts`** → `setTimeout(pollStatus, 2000)`, loop continues.
  - **`attempts >= maxAttempts`** (timeout) → `phase: 'failed'`, `failureIsDeclined = false`
    (ambiguous — distinct copy and distinct analytics: `trackVerificationTimeout` instead of a
    `payment`/`failed` event). **The recovery record is deliberately kept** — the payment may
    still be processing on Lenco's side; a reload or a manual "Check payment status" click can
    still catch it.

### Backend verify-status resolution order (`verifyPublicPayment` in `lenco.controller.ts`)

`GET /lenco/public-verify-status/:reference` checks, in order:

1. **Local DB** — is there already a finalized (non-`PENDING`) `cashbook_entries` row matching
   this reference? If so, return `verified: true` immediately without calling Lenco at all
   (idempotent — handles the case where a webhook already finalized it).
2. **By `transactionId`** (if the widget path passed one) — `LencoService.getTransactionById`.
3. **Fallback: Collections status** — `LencoService.getCollectionStatus(reference)` →
   `GET /collections/status/:reference`. On `successful`, triggers
   `handleCollectionSuccessful(...)` which finalizes the ledger entry, sweeps the commission,
   routes product revenue, confirms bookings, and flips a payment link to `PAID`. On `failed`,
   classifies the reason (§8) and returns it. Otherwise, returns `pending`.

`getCollectionStatus` treats a `404`/"Payment details was not found" from Lenco as `null`
(not-yet-visible-to-Lenco, not an error), and specifically detects a `403` as a **Cloudflare
WAF block** — surfacing `"Access to Lenco API was blocked by security filters"` rather than a
generic API error, since this has been observed intermittently from certain networks.

---

## 8. Failure reason classification (`classifyLencoFailureReason`)

`apps/api/src/services/lenco.service.ts` turns Lenco's free-text `reasonForFailure` (not an
enumerated/documented set of strings) into a stable `{ code, message }` pair, matched by
substring:

| Pattern matched | `code` | Customer-facing `message` |
|---|---|---|
| `insufficient` | `insufficient_funds` | "Insufficient funds. Please top up your mobile money account and try again." |
| `pin` | `invalid_pin` | "Incorrect PIN entered on the mobile money prompt. Please try again." |
| `timeout` / `timed out` / `expir*` | `prompt_expired` | "The prompt expired before it was approved. Please try again." |
| `cancel` / `declin*` / `reject` / `not approved` | `declined` | "The payment was declined on your phone." |
| anything else non-empty | `failed` | Lenco's raw reason text, verbatim (better than masking it) |
| empty/missing reason | `declined` | "The payment was declined or not approved on your phone." |

This means the failed-screen banner can say something specific ("Insufficient funds...")
instead of a generic decline message whenever Lenco provides a reason — this replaced an
earlier version where every failure got the same generic copy.

---

## 9. Cancel semantics — the non-destructive fix

`handleCancelPayment` → `POST /lenco/public-collection/cancel` (`cancelPublicCollectionIntent`):

- Sets `pollCancelledRef.current = true` (stops our own polling immediately).
- Calls the backend endpoint, which **only fires an analytics event** — it does **not** touch
  Lenco (no cancel API exists — §1) and does **not** delete anything in our database.
- Regardless of the API call's outcome (success or failure), moves to `phase: 'cancelled'`.
- The recovery record is **kept** (not cleared) — if the customer approves the lingering
  prompt anyway after "cancelling," the webhook/poll can still finalize it correctly.

**This was a real bug fix.** The endpoint originally deleted the PENDING `cashbook_entries` /
`product_sales` rows on cancel. If the customer then approved the prompt anyway (which Lenco
cannot stop), the webhook would find no PENDING row to finalize and the payment landed as an
orphaned generic inflow — losing product revenue routing, booking confirmation, and the
payment-link PAID flip. The fix removed the deletes entirely; genuine abandonment is still
cleaned up later by the existing 15-minute grace-window logic during verification.

The `cancelled` screen explicitly sets this expectation for the customer: *"A prompt may still
show on [number] a couple of times — you can safely ignore it. It expires on its own and
you're only charged if you enter your PIN."*

---

## 10. Manual recheck (`handleRecheckPayment`)

Available from both the `failed` and `cancelled` screens via a **"Check payment status"**
button (`onRecheck` prop) — lets the customer re-query the same reference on demand rather than
waiting for automatic polling (which has already given up in these two phases):

- Calls the same `GET /lenco/public-verify-status/:reference` endpoint once.
- Three outcomes, all reflected inline as `recheckNote` text under the button (no full-page
  transition needed for "still pending"):
  - `verified` → `phase: 'success'`, `clearPendingPayment()`.
  - `status: 'failed'` → note shows the decline message, `clearPendingPayment()`.
  - Neither → `"Not confirmed yet. If you just approved it, wait a few seconds and check again."`
- Fires `recheck`/`started` → `succeeded`/`failed` analytics with `from_phase` and (on success)
  `recheck_outcome` + `duration_ms`.

This is also the mechanism that prevents a double-charge scenario: if a customer who cancelled
approves the prompt anyway, "Check payment status" (or a reload) is how they discover it
actually succeeded, instead of re-attempting payment from scratch.

---

## 11. The processing UI (`PaymentWaitingScreen.tsx`)

A single component renders every phase, built to match a provided design handoff (v2 — a
single breathing status orb rather than the earlier multi-step/avatar version). Structure,
top to bottom:

### Layout
The component fills whatever fixed-height frame its parent page provides
(`flex flex-1 flex-col min-h-0` — no hardcoded pixel height), so its bottom panel pins to the
actual bottom of the screen regardless of phase content height. This was a deliberate fix:
an earlier version used a fixed `height: 560` that didn't match the real viewport frame other
checkout steps use, causing the panel to render mid-screen instead of bottom-anchored on
real devices. The fix also required marking the `VERIFYING` step as a full-viewport step
(`isAppStep` in `PublicPay.tsx`) so its wrapping card gets the same `h-[100dvh]`
mobile/`max-h-[90vh]` desktop treatment as the rest of the checkout.

### Header
Centered "Send money" label with a dismiss (X) button on the right. `handleDismiss` routes
contextually by phase: `success` → `onDone` (view receipt), `failed`/`cancelled` → `onDismiss`
(leave the flow), anything else → `onCancel` (stop waiting).

### Status orb
A 92×92px circle (`background: #F7F8FA`) that breathes continuously
(`mwpw-breathe`: scale 1 → 1.045 → 1, 3.2s ease-in-out infinite) with a "ZMW" label inside.

- During `initiating`/`confirm`/`polling`: a thin rotating arc (`stroke-dasharray="60 198"`)
  spins around it at 1.4s/rotation (`mwpw-spin`, linear, infinite) — the visual "working" cue.
- On `success`: the arc disappears and a solid blue badge pops in over the orb
  (`mwpw-popin`: scale 0 → 1.14 → 1 with an overshoot cubic-bezier) containing a checkmark that
  draws itself via `stroke-dashoffset` animation (`mwpw-draw`).
- On `failed`: same pop-in mechanic but in red (`#E5484D`), plus a shake
  (`mwpw-shake`: alternating small `translateX` steps) and an X mark.

### Heading
A phase-specific title + subtitle pair (`useMemo` keyed on `phase` and its dependencies):

- `initiating`: "Setting up your payment" / "Securely reaching {OPERATOR}…"
- `confirm`: "Approve on your phone" / "Open the prompt on {masked phone} and enter your PIN to approve."
- `polling`: "Confirming your payment" / a rotating reassurance line (see below)
- `success`: "Payment successful" / "{amount} paid to {business}."
- `failed` (declined): "Payment not completed" / "The prompt wasn't approved in time. Nothing has been charged."
- `failed` (ambiguous/timeout): "Not confirmed yet" / the server's message or a generic "we haven't received confirmation" fallback
- `cancelled`: "Payment stopped" / "You stopped waiting for this payment."

Phone numbers are masked in-UI via `maskPhone()`: `"09X ••• XXXX"` pattern (first 3 digits +
last 4), never the full number.

**Polling copy rotation** — cycles through reassurance lines
(`'Verifying with the network…'`, `'Confirming your payment…'`, `'Almost there…'`, plus a
slow-network-specific line when applicable), advancing one step every
`POLLING_TIP_INTERVAL_SECONDS = 4` seconds (`Math.floor(elapsedSeconds / 4) % tips.length`).
This interval was deliberately slowed down after user testing found the original
per-second rotation switched too fast to actually read.

### Contextual panel (per phase, bottom-anchored via `flex-1 justify-end`)

- **`initiating`**: a continuously sweeping progress bar (see below) + a small lock icon with
  "Encrypted & secured".
- **`confirm`**: a monospace "USSD mock" card (blinking status dot, "Pay / Amount / To / Enter
  PIN to confirm" lines, a blinking cursor after three dots) + a pulsing-ring dot with "Waiting
  for your approval on your phone".
- **`polling`**: the same sweeping progress bar + "Keep this screen open — it updates
  automatically." + a **"Cancel payment"** button (disabled + spinner while the cancel request
  is in flight) + a small disclaimer: "Stops waiting here. If a prompt still arrives and you
  approve it, the payment will still complete automatically."
- **`success`**: a receipt-style summary card (Amount / Paid to / Reference) + a **"View
  receipt"** button.
- **`failed`**: a red banner (declined) or amber banner (ambiguous) with the relevant message,
  an optional `recheckNote` line, a **"Try again"** button, a **"Check payment status"** button
  (only rendered if `onRecheck` was passed), and a plain-text **"Cancel"** link.
- **`cancelled`**: a neutral gray banner explaining the lingering-prompt expectation (§9), an
  optional `recheckNote`, a **"Check payment status"** primary button (if `onRecheck` passed),
  and a dismiss button labeled by `dismissLabel` ("Back to cart" / "Close").

### Progress bar animation (`mwpw-barslide`)

```css
@keyframes mwpw-barslide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
```
Applied `linear`, on a 40%-wide segment, looping every 1.3s (`initiating`) or 1.15s
(`polling`). This was a deliberate fix from the original design values
(`-45%` → `260%`, `ease-in-out`): with those numbers, an `ease-in-out` timing function spends
most of its cycle time at low velocity near the start/end, and the -45%/260% travel range put
most of the visible track time off-screen — the net effect looked like an occasional flicker
rather than a continuous sweep. The current values (wider travel range, `linear` timing,
narrower segment) were verified by sampling the live `transform` value across multiple
animation frames to confirm continuous, visible motion.

### Other animations
- `mwpw-rise` — each phase's panel content fades/rises in on mount (`opacity 0→1`,
  `translateY(14px)→0`).
- `mwpw-attn` — the `confirm` phase's USSD card gets a soft pulsing box-shadow to draw the eye.
- `mwpw-blink` — the status dot and cursor in the USSD card.
- `mwpw-pulsering` — an expanding/fading ring behind the "waiting for approval" dot.

Removed during design iteration (per explicit instruction to match the handoff exactly): the
multi-avatar/arc "3-step indicator" from an earlier design version, marching-dash connector
lines, and a scrolling AI-chat-style narration feed box — the final version keeps only the
single rotating status line described above.

---

## 12. Success screens (separate from `PaymentWaitingScreen`)

After `phase: 'success'` and the customer taps **"View receipt"**, each surface shows its own
full success screen (not part of the shared waiting component):

- **`PublicPay.tsx`** — a "Congratulations" screen with a scalloped `BadgeCheck` icon. Brand
  colors: outer seal `#002962` (dark navy) with `fill="#006AFF"` (sky blue), and a white
  checkmark overlaid on top:
  ```jsx
  <div className="relative w-24 h-24 ...">
      <BadgeCheck className="w-24 h-24 text-[#002962]" fill="#006AFF" strokeWidth={1.5}
          style={{ filter: 'drop-shadow(-5px 5px 0 rgba(0,41,98,1))' }} />
      <Check className="absolute inset-0 m-auto w-9 h-9 text-white" strokeWidth={3} />
  </div>
  ```
  **Important implementation detail**: the `drop-shadow` filter must be applied to the
  `BadgeCheck` icon itself, not a shared parent wrapper — applying it to the parent div also
  shadowed the white `Check` overlay, producing an unwanted shadow behind the tick. These
  colors replaced the original green (`text-green-600`/`fill-green-100`-style) icon.
- **`PublicPaymentLink.tsx`** — a plain circular badge (not scalloped), same brand colors:
  ```jsx
  <div className="... rounded-full ..." style={{ backgroundColor: '#006AFF1A', color: '#002962' }}>
      <CheckCircle2 size={32} strokeWidth={2.5} />
  </div>
  ```

---

## 13. Edge cases & recovery — summary table

| Scenario | Detection | Recovery / UX |
|---|---|---|
| Customer closes tab / loses connection mid-poll | On reload, `loadPendingPayment(contextId)` finds a non-expired record | Resumes polling the same `reference` from `phase: 'polling'`, `elapsedSeconds` computed from original `startedAt` |
| Customer explicitly declines the prompt (wrong PIN too many times, presses cancel on phone, insufficient funds) | Lenco returns `status: 'failed'` with a `reasonForFailure` | `phase: 'failed'`, `failureIsDeclined: true`, specific message via `classifyLencoFailureReason`, recovery record cleared (nothing to recover) |
| Prompt never approved / poll gives up after ~3 min | `attempts >= maxAttempts` in `startCompletionPoll` | `phase: 'failed'`, `failureIsDeclined: false`, ambiguous copy + "Check payment status" button, recovery record **kept** |
| Customer presses "Cancel payment" mid-wait | `handleCancelPayment` | Stops our polling only; prompt is not recalled (Lenco has no such API); `phase: 'cancelled'` with an explanatory banner; recovery record kept |
| Customer approves the prompt anyway after cancelling | N/A — happens on Lenco/telco side, outside our control | Webhook or a later "Check payment status"/reload still finds and finalizes the PENDING intent correctly, since cancel never deletes it |
| Customer taps "Check payment status" from failed/cancelled | `handleRecheckPayment` | One-off re-query; inline `recheckNote`, transitions to `success` if it actually went through |
| Lenco API blocked by Cloudflare WAF (observed intermittently from some networks) | `getCollectionStatus` catches HTTP 403 | Surfaces "Access to Lenco API was blocked by security filters. Please try again later." instead of a generic error; poll loop just retries on the next tick |
| Mobile money name resolution fails | `resolvePublicMobileMoneyName` throws / times out | Non-blocking — inline "Could not verify — check the number," customer can still pay |
| Webhook already finalized the entry before verify-status is even polled | Local DB check (step 1 of `verifyPublicPayment`) finds a non-PENDING row | Returns `verified: true` immediately, no Lenco call needed |
| `collections_api_enabled` is false for an org | Feature flag from `getPublicWalletContext`/`getPaymentLinkContext` | Falls back to the LencoPay widget flow entirely (also the only path for card payments) |

---

## 14. Analytics (PostHog)

All events use the shared `trackEvent(feature, action, status, props)` helper
(`apps/web/src/lib/analytics.ts`), which fires a `{feature}_{action}_{status}` event. Feature
namespace is `public_catalogue_checkout` (PublicPay.tsx) or `payment_link_checkout`
(PublicPaymentLink.tsx).

| Action | Statuses fired | Key props |
|---|---|---|
| `payment` | `started`, `succeeded`, `failed` | `workflow_id` (reference), `organization_id`, `wallet_id`/`token`, `subtotal`, `total_payable`, `payment_method`, `duration_ms`, and on failure: `error_code`, `error_message` |
| `cancel` | `started`, `succeeded` | `workflow_id`, `organization_id`, `payment_method` |
| `recheck` | `started`, `succeeded`, `failed` | `workflow_id`, `organization_id`, `from_phase`, and on success: `recheck_outcome` (`verified`/`declined`/`pending`), `duration_ms` |
| `resume` | `started` | `workflow_id`, `organization_id`, `elapsed_seconds_at_resume` |

A poll-timeout (ambiguous failure) additionally fires `trackVerificationTimeout(feature, {...})`
— a distinct event from `payment`/`failed`, since a timeout is not the same signal as Lenco
explicitly confirming a decline (`error_code: 'declined'` on the latter).

The backend also fires its own `captureEvent(...)` calls independently for
`payment_link_collection_initiated` and `payment_collection_cancelled_by_customer`, giving
server-side confirmation that's not dependent on the customer's browser successfully reporting
the client-side event.

---

## 15. Key files

| File | Role |
|---|---|
| `apps/web/src/pages/PublicPay.tsx` | Catalogue/storefront checkout (`/pay/:wallet_id`) |
| `apps/web/src/pages/PublicPaymentLink.tsx` | One-time payment link checkout (`/pl/:token`) |
| `apps/web/src/components/PaymentWaitingScreen.tsx` | Shared phase-driven processing UI |
| `apps/web/src/lib/paymentRecovery.ts` | localStorage-based recovery record (save/load/clear) |
| `apps/web/src/lib/analytics.ts` | `trackEvent` / `trackVerificationTimeout` helpers |
| `apps/api/src/controllers/lenco.controller.ts` | Public collection endpoints, verify-status resolution, `resolveOrgFromWallet` |
| `apps/api/src/services/lenco.service.ts` | Lenco HTTP client: `initiateMobileMoneyCollection`, `getCollectionStatus`, `resolveMobileMoney`, `classifyLencoFailureReason` |
