# Cost ledger: what it costs to serve each client

Every billable thing MoneyWise does for a business (an AI call, a message sent, a payment fee) is written to one table, `usage_events`, with the business it was for. A separate system pulls from it to work out cost per client. The app only records; it does no reporting.

## What is recorded

| category | kind | when | cost |
|---|---|---|---|
| ai | `llm_chat` | assistant turns, categorization, any text model call (OpenRouter, Gemini, Perplexity) | from `cost_rates` by tokens; the assistant also records OpenRouter's own reported cost when it sends one |
| ai | `llm_vision`, `ocr` | receipt/invoice reading, marketplace photo search | same |
| ai | `embedding` | memory embeddings | same |
| messaging | `email` | every email Resend accepts, one unit per recipient | `cost_rates` per unit |
| messaging | `whatsapp` | every WhatsApp message sent | per unit |
| messaging | `push` | every push notification sent, one unit per device | per unit |
| payments | `card_collection` | a Lipila card payment recorded (the card fee, 4%, is Lipila's cut) | real fee, ZMW |
| payments | `payout` (provider `lipila`) | a Card Wallet payout confirmed (1.5% of the amount) | real fee, ZMW |
| payments | `payout` (provider `lenco`) | a Lenco wallet payout confirmed | Lenco's fee, ZMW (not for MoneyWise Pay, which is free) |

Not recorded (on purpose): Lenco mobile money collection fees, because the payer pays that 1% on top, so it isn't your cost; and shared infrastructure, which goes in `infra_costs` below.

Which business an event belongs to comes from the signed-in request that caused it. Webhooks and scheduled jobs that know the business say so. An event with no business has `organization_id` null: it is platform work, not any one client.

## Tables

`usage_events` (append-only): `id`, `occurred_at`, `organization_id`, `user_id`, `category`, `kind`, `provider`, `model`, `input_tokens`, `output_tokens`, `units`, `unit`, `cost_amount`, `cost_currency`, `rate_missing`, `reference`, `meta`. A payment is recorded once: `(kind, reference)` is unique.

`cost_rates` (you fill this in): key `ai:<model>` or `ai:<provider>` (`input_per_million`, `output_per_million`), or `messaging:<kind>` (`per_unit`), with a currency. Most specific key wins. **No rates are set yet**, so every AI and messaging event is saved with `rate_missing = true` and `cost_amount = null` (tokens and units are still recorded). Add rates, then run `select reprice_usage_events();` to fill in the past. Prices are never invented.

`infra_costs` (you fill this in): one row per month and item (`month` = first of the month, `item`, `amount`, `currency`): Supabase, Vercel, domains and so on.

Views: `org_cost_monthly` (direct cost per business, month, category, kind, currency) and `org_infra_share_monthly` (each business's share of that month's `infra_costs`, split by how many events it caused).

All of it is server-only: no access for the app's users or the public key.

## Pulling the data

Set `USAGE_EXPORT_KEY` (a long random secret) on the API. Then:

```
GET /usage/export?view=events|monthly|infra_share
    &from=YYYY-MM-DD &to=YYYY-MM-DD   (to is exclusive)
    &organizationId=<uuid>  &category=ai|messaging|payments  &kind=...
    &limit=1000 (max 5000)  &after=<next from the last page>
header: x-export-key: <the secret>
```

`events` is paged: while `next` is not null, call again with `after=<next>`. Without the key set the route answers 503; with a wrong key, 401. You can also read the tables and views directly with the database's service credentials.

## Reading it

Cost to serve one client in a month = their `org_cost_monthly` rows (by currency) + their `org_infra_share_monthly` rows. Amounts are in the event's own currency: AI and messaging in USD, payment fees in ZMW. Convert in the central system with whatever rate you use. `events_without_rate` in the monthly view tells you how much of a number is still unpriced.

## Checking it

`npx tsx src/scripts/test_usage_cost.ts` (from `apps/api`) creates and deletes its own rows and checks attribution, pricing, once-per-payment, the missing-rate flag, repricing and the monthly view.
