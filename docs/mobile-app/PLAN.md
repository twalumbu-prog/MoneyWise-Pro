# MoneyWise Pro — Native Mobile App (Expo) Implementation Plan

**Branch:** `feat/mobile-expo-app` · **Target:** `apps/mobile` (iOS + Android) · **Backend:** unchanged

---

## 0. Decisions taken

| Decision | Choice | Why |
| --- | --- | --- |
| Framework | **Expo (SDK 54+) + expo-router, dev builds not Expo Go** | Native modules (secure store, notifications, biometrics, MMKV) rule out Expo Go from day one. |
| Code sharing | **`packages/core` for logic, native UI written fresh** | The 17 service modules are already pure `apiFetch` wrappers — they port with almost no change. The 64k LOC of Tailwind/DOM markup does not. |
| Repo | **Same monorepo, `apps/mobile`** | One pnpm workspace, one PR, one CI run. A contract change breaks web *and* mobile typechecks together — drift is caught by the compiler, not by memory. |
| Data | **Same Supabase project, same Express API, same RLS** | Full synchronisation is a non-goal-to-engineer: it is a consequence of both clients hitting one backend. |
| Offline | **React Query + MMKV persistence** | Mirrors the web's existing localStorage persister; the user base is on Zambian mobile networks where this matters more, not less. |

### Explicitly out of scope for the app
`/pay/:wallet_id`, `/pl/:token`, `/privacy`, `/terms`, `/disconnect` stay web-only. These are **customer-facing** surfaces consumed in a browser by the merchant's buyers — the app shares those URLs, it never renders them. The reconciliation console (`apps/admin`) also stays web-only.

---

## 1. What already exists (the survey this plan is built on)

```
apps/web/src        64,420 LOC   31 routes · 39 screens · 118 components · 17 services
apps/api/src                     244 endpoints across 21 route modules
packages/shared                  DB types + platform fee calculator (already isomorphic)
```

**The mobile UI is already designed.** `components/Layout.tsx` defines a 5-tab bottom
bar (Inbox · Wallet · BI · Reporting · Menu), a sticky mobile header with a
back-button page set, and a profile/org-switch overlay. `components/requisitions/`
already splits `Mobile*Wizard` from `Desktop*Workspace`. Those files are the visual
spec for the native build — not a starting point to reinterpret.

**Auth is portable as-is.** Supabase JWT (HS256) verified locally by
`apps/api/src/middleware/auth.ts`. No cookies, no CSRF, no session affinity —
a React Native client with a bearer token is indistinguishable from the web one.

**Payments need no native SDK.** Lenco collections are a USSD push to the payer's
handset followed by status polling (`PaymentWaitingScreen`). There is no redirect,
no widget, no WebView. This removes the single largest risk a fintech port usually
carries — and it keeps us clear of the app-store rules on in-app purchase, since
these are payments for real-world goods and services.

---

## 2. Target architecture

```
MoneyWise-Pro/
├── apps/
│   ├── web/          unchanged
│   ├── admin/        unchanged
│   ├── api/          unchanged (+ 3 additive endpoints, §6)
│   └── mobile/       NEW — Expo app
│       ├── app/                    expo-router file routes, 1:1 with web paths
│       │   ├── (auth)/             login · join · reset-password
│       │   ├── (tabs)/             inbox · wallet · bi · reporting · menu
│       │   └── ...                 stack screens (approvals, vouchers, payroll…)
│       ├── src/components/         native components
│       ├── src/theme/              tokens mirrored from tailwind.config.js
│       └── src/platform/           native impls of the core adapters
└── packages/
    ├── shared/       unchanged (DB types, fee calc)
    └── core/         NEW — everything both clients agree on
        ├── services/     17 modules, moved verbatim from apps/web/src/services
        ├── api/          apiFetch + token refresh/retry (platform-agnostic)
        ├── auth/         session logic extracted from AuthContext
        ├── query/        query keys, staleness policy, realtime invalidation
        ├── types/        Requisition, Wallet, Voucher… (currently inline in services)
        ├── format/       currency/date/number formatters
        └── platform.ts   the adapter interface (§3)
```

### 2.1 The adapter boundary

`packages/core` must not import `window`, `localStorage`, `fetch` streaming, or
`import.meta.env`. Everything environment-specific goes through one injected object:

```ts
export interface Platform {
  storage: { get(k): Promise<string|null>; set(k, v): Promise<void>; del(k): Promise<void> };
  secureStorage: Platform['storage'];        // web: localStorage · native: expo-secure-store
  env: { apiUrl: string; supabaseUrl: string; supabaseAnonKey: string; appVersion: string };
  files: { pick(opts): Promise<PickedFile[]>; compressImage(f): Promise<PickedFile> };
  stream: (url, init) => AsyncIterable<string>;  // web: body.getReader · native: expo/fetch
  openExternal(url: string): Promise<void>;
}
```

`configureCore(platform)` is called once at each app's entry point. This is the
seam that lets one service layer serve a DOM app and a native app without either
knowing about the other.

### 2.2 Migration order (deliberately non-breaking)

`packages/core` starts as re-exports of the web files. Then, module by module,
the implementation *moves* into core and `apps/web/src/services/*.ts` becomes a
one-line re-export. The web app keeps building green at every commit; there is no
big-bang cutover, and no window in which `main` is broken.

---

## 3. Native replacements for browser APIs

Machine-generated from the source (see `PARITY.generated.md` §6):

| Browser API | Files | Native replacement | Notes |
| --- | --- | --- | --- |
| `window`/`document` | 60 | RN primitives + `Dimensions` | Mostly layout/measure inside JSX being rewritten anyway |
| file input + `FileReader` | 13 | `expo-image-picker`, `expo-document-picker` | Receipts, logos, product images, bank statements |
| `Blob`/`createObjectURL` | 10 | `expo-file-system` + `expo-sharing` | |
| `localStorage` | 10 | `react-native-mmkv` (cache), `expo-secure-store` (tokens) | Tokens must **not** land in MMKV |
| SheetJS `xlsx` | 6 | Server-side export endpoint | API already depends on `xlsx` |
| `jspdf` | 4 | Server-side render | API already depends on `pdfkit` |
| `recharts` | 3 | `victory-native` + `react-native-svg` | Reporting, BI widgets, invest chart |
| `browser-image-compression` | 3 | `expo-image-manipulator` | |
| `heic2any` | 2 | Server-side (API has `heic-convert`) | iPhone photos arrive HEIC — this is on the hot path |
| `qrcode.react` | 1 | `react-native-qrcode-svg` | |
| `framer-motion` | 1 | `react-native-reanimated` | |
| `getUserMedia` | 1 | `expo-audio` | Assistant voice composer |
| `react-markdown` | 1 | `react-native-markdown-display` | Assistant messages |
| `body.getReader()` (SSE) | 1 | `expo/fetch` streaming | **The one genuine unknown.** RN's stock `fetch` has no `ReadableStream`; `expo/fetch` does. Prototype this in P0, before the Intelligence screen is scheduled. |

### 3.1 Design tokens

`apps/web/tailwind.config.js` + `src/index.css` are the source of truth:
brand green `#03D47C`, blue `#006AFF`, navy `#002E3B`, pink `#FF2970`;
fonts Advercase (display), DM Sans (body), Space Grotesk, Figtree.
These are mirrored into `apps/mobile/src/theme/tokens.ts` by a small codegen step
so a palette change on web cannot silently skip the app. Advercase ships as
`.woff2` in `apps/web/public/fonts/` — the app needs `.ttf`/`.otf` originals
loaded via `expo-font`. **Action: confirm the Advercase licence permits app
embedding before the first store submission.**

---

## 4. Phased delivery

Each phase ends with a build installable on a real device and a parity-check run.

| Phase | Scope | Units |
| --- | --- | --- |
| **P0 — Foundation** | `packages/core` extraction (all 17 services, 158 methods) · Expo app scaffold · auth (login, username-resolve, join, password reset deep link) · secure token storage · MMKV query persistence · realtime invalidation channel · SSE spike | 182 |
| **P1 — Shell + Inbox** | Bottom tabs · mobile header/back-button behaviour · profile & org-switch sheet · Inbox list · requisition detail · `MobileRequisitionWizard` port · attachments & chat | 49 |
| **P2 — Wallet** | CashLedger (2.8k LOC, 10 overlays) · wallets & sub-wallets · external wallets · transfers · deposit proof · inflow inbox · statement import · New Sale (POS) · Lenco USSD collection + polling | 64 |
| **P3 — Approvals chain** | Approvals · Cashier disbursements · vouchers + detail · server-rendered voucher PDF | 12 |
| **P4 — Reporting & BI** | Reporting with native charts · exports via server + `expo-sharing` · Intelligence streaming assistant (chat, tool timeline, approval cards, widgets) | 27 |
| **P5 — Menu hub** | Settings (profile, general, team, integrations, billing) · Products & Services · Audit · Schedules · full Onboarding wizard | 74 |
| **P6 — Apps** | Payroll (config, staff, batch import, run wizard) · Invest (home, company, product, payment flow) | 30 |
| **P7 — Native platform** | Push notifications (Expo push, wired to the existing broadcast) · biometric unlock · camera receipt capture · deep links & universal links · offline queue · `expo-updates` OTA | — |
| **P8 — Store readiness** | Icons/splash · privacy manifests & data-safety forms · account deletion path (Apple 5.1.1(v) — required, we have sign-up in-app) · TestFlight + Play internal testing · submission | — |

Phases P1–P6 are independently shippable to internal testers; P7 items are pulled
forward where a phase depends on them (camera in P1 for receipts, deep links in P0
for password reset).

---

## 5. Keeping web and app aligned — the GitHub structure

This is the part that has to be mechanical, because "remember to update both" fails.

### 5.1 Branching

```
main
├── feat/mobile-expo-app          long-lived integration branch for the port
│   ├── feat/mobile-p0-core       one branch per phase, PR'd into the integration branch
│   ├── feat/mobile-p1-inbox
│   └── …
└── feat/<normal web work>        unchanged; continues to target main
```

`feat/mobile-expo-app` rebases on `main` weekly. Once P2 lands and the app is
usable end-to-end, it merges to `main` and subsequent phases branch off `main`
directly — after that point, **web and mobile changes ship in the same PR**.

### 5.2 The three gates

1. **Shared-contract gate.** `packages/core` is consumed by both apps, so CI runs
   `turbo run typecheck` across the workspace. Changing a service signature for web
   fails the mobile typecheck in the same run. This is the primary drift defence and
   it costs nothing to maintain.

2. **Parity gate.** `node scripts/parity/generate-inventory.mjs --check` re-derives
   the inventory from source on every PR. A new route, screen, service method, or API
   endpoint with no entry in `parity.status.json` fails CI with the exact keys to add.
   You cannot add a feature to the web app without making an explicit, recorded
   decision about the app.

3. **CODEOWNERS + labels.** `packages/core/**` and `apps/api/src/routes/**` require
   review from both owners; a PR touching them is auto-labelled `affects:mobile`.

### 5.3 Workflows

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` (extend existing) | every PR | install · `turbo typecheck lint build` across web + api + admin + mobile + core |
| `parity.yml` | every PR | regenerate inventory, `--check`, and post the scorecard diff as a PR comment |
| `mobile-preview.yml` | PR touching `apps/mobile` or `packages/core` | `eas build --profile preview` for both platforms + `eas update` preview channel |
| `mobile-release.yml` | tag `mobile-v*` | production EAS build + `eas submit` to TestFlight / Play internal |

### 5.4 Release channels

`expo-updates` channels map to the same environments the web already uses:
`preview` (PR builds) → `staging` → `production`. JS-only changes ship OTA in
minutes; native module changes require a store build. Version policy: app
`runtimeVersion` is pinned to the native ABI, and OTA updates only ever target a
matching runtime, so an OTA can never ship JS that calls a native module the
installed binary lacks.

---

## 6. Backend work required

The API is intentionally almost untouched. Three additive changes:

1. **Server-side document rendering.** Move voucher/report PDF and Excel generation
   behind endpoints (`POST /reports/export`, `GET /vouchers/:id/pdf`) returning a
   signed URL. Removes `jspdf` + `xlsx` from the client entirely — and the web app
   gets a smaller bundle as a side effect.
2. **HEIC conversion + image compression endpoint**, or accept HEIC on upload and
   normalise server-side. iPhone photos are the default receipt input; this cannot be
   left to the client.
3. **Push notification dispatch.** The org broadcast channel that already drives
   `RealtimeCacheSync` gains a fan-out to Expo push tokens, with a new
   `device_tokens` table (`user_id`, `org_id`, `expo_token`, `platform`, `last_seen`).
   A socket only reaches a foregrounded app; approvals and disbursements need to
   reach a backgrounded one.

### 6.1 Security prerequisite (blocking for store submission)

`docs/` and prior work record a known **cross-tenant `USING(true)` RLS policy** on
`products`, `wallets`, `payment_links` and others. Today the web app never reads
those tables directly, so the gap is not reachable in practice. Shipping a mobile
binary changes the risk profile: the anon key is extractable from any installed
app, and a permissive policy becomes directly exploitable against every tenant.
**This must be closed before the first public build.** Tracked as a P0 blocker,
not a P8 checklist item.

---

## 7. The parity check — how "nothing untouched" is enforced

Three layers, in increasing cost and confidence.

**Layer 1 — Inventory (automated, every PR).** `PARITY.generated.md` is derived
from source: 31 routes, 39 screens, 118 components, 158 service methods, 244
endpoints = **472 tracked units**, each with a state
(`DONE` / `IN_PROGRESS` / `PLANNED` / `WEB_ONLY` / `NOT_APPLICABLE`), a phase, and
a note. Current baseline: 438 PLANNED · 27 WEB_ONLY · 7 NOT_APPLICABLE · 0 untriaged.

**Layer 2 — Behavioural parity suite (per phase).** For each ported screen, a
Maestro flow runs the same user journey on both surfaces (Playwright on web,
Maestro on iOS + Android) against a shared seeded org, asserting identical
outcomes: same list contents, same totals, same permission-gated actions per role.
Roles matter here — `REQUESTOR`, `AUTHORISER`, `CASHIER`, `ACCOUNTANT`, `ADMIN`
each see different tabs and actions, so every flow runs five times.

**Layer 3 — Manual parity sweep (phase exit).** A reviewer walks the phase's
screens side by side on a physical device and the web mobile breakpoint, filling in
`docs/mobile-app/parity-sweep-P<n>.md`: every control, empty state, error state,
loading state, and permission variant. A phase is not done until its sweep is
signed off and its units flip to `DONE` in `parity.status.json` — which is the same
file CI reads, so the scorecard in the generated doc is always the truth.

**Financial-correctness parity (non-negotiable).** Beyond UI, a fixture org runs the
same sequence of transactions through both clients and asserts byte-identical
ledger state: wallet balances, journal entries, disbursement nets, platform fees,
and the change-deposit netting behaviour. A rounding difference between clients on
a money app is a defect class of its own, and it is the one thing a UI sweep will
never catch.

---

## 8. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Open RLS policies + extractable anon key | **Critical** — cross-tenant data exposure | Close before first public build; P0 blocker (§6.1) |
| SSE streaming on RN | Blocks Intelligence (P4) | Spike in P0, well ahead of the dependent phase |
| CashLedger is 2.8k LOC with 10 overlays | P2 slips | Decompose into ~12 native components before writing any; treat as its own mini-project |
| Advercase font licence | Blocks submission | Verify embedding rights now, not at P8 |
| Apple 5.1.1(v) account deletion | Rejection | In-app deletion path built in P5 with Settings |
| Vercel cost regression from a second client | Billing | App polls no more aggressively than web; push replaces polling, per the existing 30s-poll lesson |
| Batch payroll 30s ceiling | P6 | Known limit — app must show async job state, not block on a request |

---

## 9. Immediate next steps

1. Scaffold `packages/core` and move `lib/api.ts` + one service (`user.service`) through the adapter boundary, keeping web green. *(Proves the seam.)*
2. Scaffold `apps/mobile` with expo-router, tokens, fonts, and a login screen that authenticates against production and renders the Inbox list from the real API. *(Proves the loop end-to-end.)*
3. Land the `parity.yml` and typecheck gates so every subsequent PR is measured.
4. Open the RLS remediation ticket as a P0 blocker.
5. SSE spike on `expo/fetch`.
