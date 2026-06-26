<wizard-report>
# PostHog post-wizard report

The wizard has completed a full PostHog integration for **MoneyWise Pro** (`apps/web`). PostHog is initialised once on app boot via `src/lib/posthog.ts` (imported in `main.tsx`) using `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` environment variables. Users are identified with `posthog.identify()` as soon as their role and organisation are loaded from Supabase, and `posthog.reset()` is called on sign-out to avoid cross-user contamination. Fourteen business-critical events are captured across authentication, the public checkout portal, payment links, requisitions, POS sales, and cash inflows.

| Event name | Description | File |
|---|---|---|
| `user_signed_in` | A user successfully signs in with their password or username. | `src/context/AuthContext.tsx` |
| `organization_created` | A user registers a new organisation during signup. | `src/context/AuthContext.tsx` |
| `organization_join_requested` | A user submits a request to join an existing organisation. | `src/context/AuthContext.tsx` |
| `user_signed_out` | A user signs out of their session. | `src/context/AuthContext.tsx` |
| `checkout_initiated` | A customer proceeds from the product catalogue to their cart on the public payment portal. | `src/pages/PublicPay.tsx` |
| `checkout_payment_started` | A customer submits their details and triggers the Lenco payment gateway. | `src/pages/PublicPay.tsx` |
| `checkout_payment_completed` | A public portal payment is verified and the ledger entry is confirmed. | `src/pages/PublicPay.tsx` |
| `receipt_downloaded` | A customer downloads their PDF receipt after a successful checkout. | `src/pages/PublicPay.tsx` |
| `payment_link_paid` | A one-time payment link is paid and verified successfully. | `src/pages/PublicPaymentLink.tsx` |
| `requisition_submitted` | A staff member submits a new requisition (expense, payroll, loan, etc.). | `src/pages/RequisitionCreate.tsx` |
| `requisition_approved` | An administrator authorises a pending requisition. | `src/pages/Approvals.tsx` |
| `requisition_rejected` | An administrator rejects a pending requisition. | `src/pages/Approvals.tsx` |
| `pos_sale_completed` | A POS sale is finalized by a cashier (manual or MoneyWise POS channel). | `src/pages/NewSale.tsx` |
| `inflow_recorded` | A cash inflow is manually recorded in the cash ledger. | `src/components/CashInflowModal.tsx` |

## Next steps

We've built a dashboard and five insights to keep an eye on user behaviour, based on the events just instrumented:

- **Dashboard** — [Analytics basics (wizard)](https://us.posthog.com/project/486845/dashboard/1763757)
- [Checkout Conversion Funnel (wizard)](https://us.posthog.com/project/486845/insights/egbaBNZd) — 3-step funnel: checkout_initiated → payment_started → payment_completed
- [Revenue Events Over Time (wizard)](https://us.posthog.com/project/486845/insights/lc3NOFXR) — Daily counts of completed payments across all channels
- [New Users & Organizations (wizard)](https://us.posthog.com/project/486845/insights/bq1okf5j) — Daily sign-ins, new organisations, and join requests
- [Requisition Approvals vs Rejections (wizard)](https://us.posthog.com/project/486845/insights/taeDBOQB) — Approval vs rejection trend over time
- [Requisition Submission to Approval Funnel (wizard)](https://us.posthog.com/project/486845/insights/LzX1jYF3) — Conversion from submission to approval

## Verify before merging

- [ ] Run a full production build (`pnpm build` from the monorepo root) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` to `.env.example` and any bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or Vite's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` — the current implementation identifies on every `onAuthStateChange` callback (both fresh login and session restore), so returning sessions should already be covered; verify in PostHog that the same person ID is used across sessions.
- [ ] Run `pnpm add posthog-js` from the monorepo root (`/Users/kim_life/Documents/MoneyWise-Pro`) to add `posthog-js` to the workspace lockfile (`pnpm-lock.yaml`) — the wizard placed the package in `apps/web/node_modules` manually due to sandbox restrictions, but the lockfile entry is needed for CI and team installs.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-javascript_node/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
