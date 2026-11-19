# MoneyWise priority list

How we use this: work down each list in order, one item at a time, and mark it done here when it is built, tested and (where it
needs one) deployed. Status: `todo`, `doing`, `built` (written and tested, not yet live), `done`, `parked` (waiting on another company).

Written 2026-11-19 from the value-proposition review. Numbers on users, revenue and competitors were not available then, so ranking is
by how much we control and how much it builds trust or growth, not by measured impact. Revisit once real numbers exist.

---

## A. Quick wins: we can do these ourselves (work 1 to 7 in order)

| # | Item | Status | Done means |
|---|---|---|---|
| 1 | **Dependable, visible money movement.** Card Wallet bank payouts that succeed, a fixed IP for Lipila's whitelist (Oracle relay, `docs/lipila-relay.md`), the API deployed, and clear payment status and receipts everywhere money moves. | `doing` | A real payout from the Card Wallet to a bank succeeds from production, and every payment shows a status the person understands. |

Item 1, broken down:

| Part | Status | Who |
|---|---|---|
| Fee matches Master Fees (1.5%, K5 minimum) | done | |
| Relay code + API switch for a fixed IP (`relay/`, `LIPILA_RELAY_URL`, `LIPILA_RELAY_SECRET`) | built, tested locally | |
| Honest "Funds Disbursed" card: amber "Payment on its way" with a Check now button while the bank hasn't answered, red "Payment didn't go through" after a reversed payout (it used to show a green SUCCESS) | built, web only, not yet seen on a real payout | |
| Same honest status in the Expo app's requisition screen | todo | me |
| Oracle server with a reserved IP, running the relay (`docs/lipila-relay.md`) | todo | you |
| IP whitelisted in the Lipila wallet's Security settings; `LIPILA_RELAY_*` set in Vercel; API redeployed | todo | you |
| Whether the pushed code is live (I can't reach the live API from this machine, and the Vercel connection I have doesn't include the MoneyWise projects) | unknown | you |
| A live K10 bank payout to confirm it succeeds | todo | you, with me watching the logs |
| Ask Lipila (`lipilasupport@hobbiton.co.zm`) whether IP whitelisting is enforced for this wallet, or can be switched off or widened | todo | you |
| 2 | **Paid pages turn into personal sign-ups.** A "keep this receipt" card on the pay-link, store and quick-pay success screens, and a personal sign-up path. | `built` (web; uncommitted until committed) | Card seen on a real paid screen, sign-up from it works, PostHog shows shown/click/dismiss. Follow-ups: the mobile app, and "your receipt from X is waiting" after sign-up. |
| 3 | **Make rewards real.** A customer earns points at a business, redeems them for a voucher, and the discount is actually applied to what they pay. | `doing` | A customer redeems a voucher and the discount comes off a real payment, in the store and at the till. |

Item 3, broken down. **Correction:** an earlier note said points can't be redeemed. That is only true of MoneyWise's own platform points (referrals, price reports). A business's points already turn into a voucher code. What's missing is that **no sale screen applies the voucher**: staff have to take the money off by hand and then mark the code used.

| Part | Status |
|---|---|
| Earn points on store purchases; business sets the programme and its rewards; customer redeems points for a voucher code | done (already existed) |
| Discount rules in one tested place (`services/rewardDiscount.ts`): amount off, percent off, free item (one unit, the cheapest), covered products, never more than the order | built, 13 checks pass |
| Staff **Check** a voucher before using it (worth, what it covers, customer; changes nothing), then **Mark as used** (web: Rewards, Customer rewards) | built, 9 checks pass; not seen in a browser |
| Same Check step in the Expo app's customer-rewards screen | todo |
| **Apply a voucher at the store's checkout:** customer enters the code, the server works the discount out from its own prices, the voucher is held (45 minutes) while paying, marked used when the payment is confirmed (card, webhook and sync all pass one hook), and given back if the sale can't be recorded; the card amount check accepts exactly the voucher's discount; staff can't use a held voucher | built. 31 checks against the real intent handler and card path pass; the screen shows and rejects a bad code in a real browser. **Needs a deploy** (migration 20261119120000 is already applied to the live database; API startup version is 37). Not yet run with a real voucher and a real payment |
| Pay links, bookings, appointments, donations, and open-priced items with a voucher | todo: not allowed yet (the store says so) |
| Mobile-money amount: the browser still tells the server how much to charge (this was already so, and I did not change it); the server could check it against the recorded sale | todo, worth doing |
| Apply a voucher at the till (New Sale) | todo, after checkout |
| MoneyWise platform points (referrals, price reports) have somewhere to be spent, such as a discount on a MoneyWise plan | todo, your decision (it costs us money) |
| 4 | **Help businesses get paid faster.** Automatic WhatsApp reminders to the customer, with a pay link for the current balance, for unpaid invoices. | `built` (needs a deploy) | An overdue invoice sends the customer a reminder on a schedule the business sets, and stops when it is paid. |

Item 4, broken down. **What already existed:** reminders to the business's own *finance team* (a weekly email about overdue customer invoices). **What this adds:** reminders to the *customer who owes the money*.

| Part | Status |
|---|---|
| Rules and message (`services/paymentReminders.service.ts`): off until the business switches it on; an open or part-paid invoice that has reached its follow-up date; repeat every 2 to 30 days (default 7), at most 1 to 6 (default 3); stops the moment it is paid or voided; the Lusaka date decides "due"; a message that couldn't go out is not counted and is tried again | built, 36 checks pass against real invoices with a stand-in for WhatsApp |
| Sent by the daily 07:00 UTC (09:00 Lusaka) job that already runs the finance-team reminders (`POST /invoices/tick`), so no new scheduler and nobody is messaged at night | built; **production needs a deploy** |
| "Remind on WhatsApp now" button on an invoice (any day, at most once a day to the same customer) and the automatic-reminder settings, in the invoice's detail window | built, types check; not seen in a browser (needs a signed-in business with an unpaid invoice) |
| Database: `payment_reminder_settings` table and two counters on `customer_invoices` (migration 20261119140000, already applied to the live database; startup version 38) | done |
| Uses the shared WaAPI WhatsApp number (the one pay-link receipts use). **Needs `WAAPI_API_TOKEN` and `WAAPI_INSTANCE_ID` set on the production API**; without them nothing is sent or counted | to check |
| Reminders for pay links and invoices created at the till that have no follow-up date | todo |
| Email as a second channel when there's no WhatsApp number; a reminder from the business's own WhatsApp rather than the shared number | todo |
| Expo app: the button and settings | todo |
| 5 | **Templates by type of business** (school, salon, retailer, florist): products, categories and settings pre-loaded. | `todo` | A new business of that type is selling in minutes. |
| 6 | **Finish what is half-built and test it for real.** USD in the store's card checkout, the marketplace in dollars, the mobile app's currency and share-link screens, Invest on real prices, the Master Fees screen. | `todo` | Each one used in a real browser or phone, not only type-checked. |
| 7 | **Seed the marketplace.** Real prices, a store directory, share kits (QR, WhatsApp text) for store links. | `todo` | A new visitor finds real listings and real prices. |

## B. Weaknesses: work these one by one after A

| # | Weakness | First step |
|---|---|---|
| W1 | Money movement isn't dependable yet | This is A1. |
| W2 | Breadth over depth: many things built, few run end to end | Keep a "built but never used for real" list and clear it (A6). Stop adding features until the top ones are used. |
| W3 | Dependence on partners we don't control | Park the partner list (section C) and keep a fallback for each rail. |
| W4 | Empty marketplace | This is A7. |
| W5 | Trust and process: development runs on the live database, some keys reach browsers | Give development its own database; move keys that still reach staff browsers to server-only storage; add a public status page. |
| W6 | Built around individual customers (Salon, Master Fees, Blue Opus) | For each vertical, ask if a second business wants it before extending it. A5 (templates) is the generic version. |
| W7 | Personal has no daily reason to open it | Section D. |

## C. Needs other companies (parked: not now)

| # | Who | For |
|---|---|---|
| P1 | MTN, Airtel, Zamtel (direct) | Lower fees, instant payouts, USSD for people without smartphones. MTN app approved; sign-in still failing. |
| P2 | A bank or card issuer | USD virtual cards: automatic overseas buying for imports, and international payments. |
| P3 | Banks | Statement feeds (automatic reconciliation) and bank alerts for the capture feature. |
| P4 | Fund managers (Longhorn, ABC, others) | Real daily prices for Invest. |
| P5 | ZRA, NAPSA, NHIMA | Tax and payroll compliance (check whether ZRA Smart Invoice applies to our customers). |
| P6 | Suppliers, retailers, delivery companies | Price feeds and delivery. |
| P7 | Channel partners: school groups, trader associations, churches | Onboarding many users at once. |
| P8 | Lenders | Working-capital and personal loans using the history MoneyWise holds. |

---

## D. Competing with the Airtel, MTN and bank apps

**The honest starting point.** Those apps own the money rail: cash in and out, agents, airtime, trust. We cannot beat them at that, so we
should not try. We win by being the thing they cannot be: **neutral, across all of them, and about what you do with your money, not just
that it moved.** Each one only knows its own network or its own bank. Each shows a list of transactions and stops there.

### Why use MoneyWise over the Airtel app, the MTN app or a bank app

| Their gap | What MoneyWise does about it | What exists today |
|---|---|---|
| Each app sees only its own money | **One view of all money:** MTN, Airtel, Zamtel and (next) banks together | Captures MTN, Airtel and Zamtel messages; banks not yet |
| A list of transactions, no meaning | **Knows what each payment was for**, learns it ("last time you paid this number it was rent"), and asks only when unsure | Asks "what was this for?" per capture; does not yet learn |
| No incentive to tell you what you lose to fees | **Shows what fees cost you each month** and the cheaper route | Fees are captured; no report or advice yet |
| Nothing for recurring obligations | **Bills and school fees you pay every month, found automatically,** with reminders | Schedules exist; not linked to captures |
| No receipts or proof | **A searchable receipt for everything**, exportable for work claims or tax | Receipts exist for payments made through MoneyWise |
| Single-player | **Shared money:** chilimba and savings groups, splitting a bill, a family budget | Savings groups and requests exist |
| Savings that need the telco's product | **Goals you can track without moving money**, then optionally fund them | Savings and Grow exist; tracking-only goals not yet |
| Your history belongs to them | **Your financial record is yours:** proof of income for a loan or a landlord | Loans pages exist; no proof-of-income view |
| No tools for a side hustle | **Switch to business mode:** invoice, take payments, keep books, in the same app | Pro exists; no clear step from personal to business |
| Needs data and the app | **WhatsApp-first:** message "spent 50 lunch", ask "how much on transport this month?" | Meta/WhatsApp integration exists for businesses |
| Can't pay a business on better terms | **Pay a MoneyWise business cheaper than a card, and earn rewards there** | Wallet pay is free to the customer; card costs 4%; rewards not redeemable yet |

### How a free user becomes an in-app user (the path)

Don't ask people to move money first. Earn it with value from data they already give us:

1. **Free capture (live):** no money in the app. We read their mobile-money messages and track spending.
2. **Make it useful without any effort:** it learns what payments are for, shows weekly summaries and fee leaks, and reminds them of bills. They now open the app because it tells them something their telco app never does.
3. **Make it hard to leave:** their history, receipts, budgets and goals live here. Shared savings groups bring in friends and family.
4. **Give a reason to move money (the first money feature should be cheaper or better, not just different):** paying a MoneyWise business with the wallet (cheaper than card, with rewards), getting paid by an invoice, joining a group's pot.
5. **Then hold a balance,** only once savings earn something or payments are clearly better.

### Ideas to build, easiest first

| # | Idea | Why | Effort |
|---|---|---|---|
| C1 | Remember what a payment was for (same number or merchant, same category) | The popup becomes rare; the app feels smart | Small |
| C2 | Weekly summary (push and WhatsApp): where it went, biggest spend, fees paid | A daily-habit reason to open, and nothing the telco app does | Small |
| C3 | Fees report: what mobile money cost you this month and a cheaper way | A reason telcos won't copy | Small |
| C4 | Find recurring payments from captures and remind before the next one | Turns tracking into something useful | Medium |
| C5 | Goals you can track without moving money | Builds the savings habit before any money moves | Small |
| C6 | Read bank alert messages (Zanaco, Stanbic, Absa, FNB, and others) the way mobile-money messages are read | Makes it the one view across everything | Medium |
| C7 | A proof-of-income view the user can share with a lender or landlord | Uses the history they already gave us | Medium |
| C8 | Personal-to-business switch: "you received K12,000 this month: invoice your customers" | Bridges the two products | Medium |
| C9 | WhatsApp assistant for logging and questions | Meets people where they already are | Medium |
| C10 | Group savings (chilimba) and bill splitting that work from captured payments | Brings friends and family, the strongest word of mouth | Larger |
