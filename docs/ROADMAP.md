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
| 5 | **Templates by type of business** (school, salon, florist, restaurant, shop, hardware, consulting, repairs, church or NGO, lodge, farm): what businesses like yours usually sell, ready to add. | `built` | A new business of that type is selling in minutes. |

Item 5, broken down. The onboarding already asked for industries and store categories, but the Products step started empty: every listing had to be invented from scratch.

| Part | Status |
|---|---|
| 12 templates, 82 starter listings (`packages/core/src/onboarding/businessTemplates.ts`). **No prices are suggested** (a made-up price would be wrong for the business): the owner types their own for the items they want; quotes and donations need none. Each listing is the right kind (fixed-price service, per-night or per-day booking, appointment with its length, open-priced quote, donation). Added listings are for the business's own store and pay links, not the marketplace (no photos yet) | built; 22 checks pass, including that the real product creation accepts all 82 across every listing type |
| The onboarding industry picks suggest the matching template first (Education: school, Beauty: salon, Hotel: lodge, ...); a duplicate by name is skipped | built |
| "Or start from a template" on the empty onboarding Products step, and "From a template" on Products & Services (web): pick, tick, type prices, add | built, types check; **not seen in a browser** (needs a signed-in business) |
| Expo app: the same picker | todo |
| Templates that also set up fee categories, accounts and settings (for example a school's term fees feeding the fee reports, a salon's opening hours and deposits) | todo |
| More templates, and real prices from the price desk or marketplace catalogue for hardware and groceries | todo |
| Ask real businesses of each type what they actually sell, and fix the lists | todo (worth doing: the lists are my best guess) |
| 6 | **Finish what is half-built and test it for real.** USD in the store's card checkout, the marketplace in dollars, the mobile app's currency and share-link screens, Invest on real prices, the Master Fees screen. | `in progress` | Each one used in a real browser or phone, not only type-checked. |

Item 6, broken down (19 Nov 2026).

| Part | Status |
|---|---|
| USD pay link in a real browser (throwaway business, public page): shows K1,350.00 "Priced at $50.00 - K27.00 to $1 today"; the card tab charges **$52.08 USD** ($50 plus the 4% card fee grossed up); mobile money stays in kwacha | seen working |
| Store with a dollar product: listed as "K 1,350.00 - $50.00" | seen working |
| Voucher at the store checkout (real voucher, real browser): K100 cart, K20 off, K2 fee, pays K82. The breakdown did not show the voucher line, so the numbers did not add up on screen; fixed (`-K20.00 Reward voucher` row) | seen working after the fix |
| The live database was missing `products.currency` (the USD migration had only partly run). Added it; the API's startup SQL does the same on deploy | done |
| Store card checkout charging **real dollars** for a cart made only of dollar products (no voucher, delivery, booking or donation; the server works it out from the products, not the browser; mixed carts stay in kwacha). The card box and Pay button show dollars | built; 7 checks pass (`test_usd_cart.ts`); not yet seen in a browser with a real store |
| Marketplace in dollars: a dollar item is listed in kwacha at today's rate and keeps its dollar price; the browse pages show a **K / $ switch** (remembered; the first time, dollars for someone browsing from outside Zambia by device time zone, else kwacha) and convert other prices with "≈". Checkout and the Marketplace's wallets stay in kwacha, real dollar charging happens in the seller's store or pay link | built; 4 checks (`test_marketplace_usd.ts`); not seen in a browser (needs sign-in). Not done: a true country lookup (time zone is a guess), dollar prices in the filters and sort boxes (they are kwacha) |
| **Auctions** (20 Nov): an auction runs in the item's own currency, so a dollar item has dollar bids, prices and winning amount (the winner's payment link is a dollar link, and the wallet checkout converts at today's rate; before this a dollar product was charged at its dollar number as kwacha in the marketplace checkout). Changing a product to dollars converts a bid-free auction at today's rate; with bids it is refused until the auction is ended. The seller sees every bidder's full name, number and bid (others see masked names). New **Turn off auction** (in the item's edit screen, in the list, and on the Marketplace listing): the item becomes a normal buy-now listing; with bids it asks first and tells the bidders | built; 23 checks (`test_auction_currency.ts`); not seen in a browser |
| **Marketplace purchases** (20 Nov): (1) a seller with a payment account but **no public username** can now be bought from in the app (a wallet payment can address a seller by account; before, 4 of 14 blocked items were blocked only for this); (2) the checkout's **Mobile money or card** option, which was a greyed-out "Coming soon", now works: the buyer finishes on the same secure payment page the seller's store uses (MTN, Airtel, Zamtel, Visa, Mastercard; a dollar item is charged to a card in dollars). The order waits (PENDING_PAYMENT), turns PAID when the link is paid, and is cancelled with its stock returned after 2 hours unpaid. Not for rooms and rentals, Pay in 4 or Opus Delivery (these use the wallet). Still in the seller's store: appointments, quotes and digital items (7 listings) and sellers with no payment account (Kanyanta Lending) | built; 14 checks (`test_market_link.ts`); the payment page itself was not run with real money, and the checkout was not seen in a browser |
| Mobile app (Expo): Kwacha / US dollars chips on the product screen, dollar prices in the product list, and a new "One-Time Payment Link" screen (link icon on each product: customer, phone, currency, amount, copy, share). Easy badges no longer show a Start button | built, types check; not run on a phone |
| Invest on real prices: the price store, manager upload page, real series and "no sample funds" were already built (8 funds, 334 prices in the database today) | built earlier; this list was out of date. Not seen in a browser today. Still needed: ask each manager for their real fund list and a daily price feed (P4) |
| Master Fees screen used in a signed-in browser | todo (needs a signed-in business) |
| Server check of the sale amount (any payment method): a public-store order is refused if an item's price or the total is below the database price (dollar products at today's rate, 2% slack); totals above are fine (delivery). Pay links, till sales, vouchers, bookings and appointments already had their own checks | built; 4 more checks in `test_usd_cart.ts` (11 in all) |
| 7 | **Seed the marketplace.** Real prices, a store directory, share kits (QR, WhatsApp text) for store links. | `todo` | A new visitor finds real listings and real prices. |

## Badges, streaks and points (added 20 Nov 2026)

Tiered badges (bronze, silver, gold, platinum), a daily-use streak, XP, points and fee credit. The server is the source of truth (`apps/api/src/services/progress.service.ts`).

| Part | Status |
|---|---|
| 29 badges in four groups: look around (12 easy "open this page" badges), guided missions (5), consistent use (3, 7, 30, 100 days in a row), money movement (1, 10, 50, 250 confirmed entries; K1,000, K10,000, K100,000, K1,000,000 moved). Only confirmed INFLOW, DISBURSEMENT and EXPENSE entries count, not opening balances or adjustments | built; all checks pass (`test_progress.ts`) |
| XP is the sum of the badges earned (never stored, so it can't drift); levels 1 to 10 | built |
| XP to points (20 XP = 1 point, **once a calendar month**, enforced in the database), points to fee credit (10 points = K1, in whole kwacha). So 200 XP is worth K1. Gold badges gift 5 points (K0.50), platinum 25 (K2.50). Done in the database under a per-person lock; two taps at once cannot spend the same XP or points twice (tested) | built |
| Web: Missions, Badges (tier colours, progress bars toward streak and money badges, gift notes) and Rewards (level, streak, points, credit, convert and redeem) tabs; the celebration shows the tier and the gift | built, types check; **not seen in a browser** (needs sign-in) |
| Fee credit pays part of a **Marketplace Ads** purchase (tick "Use my fee credit"; at least K1 still comes from the wallet). A cancelled or rejected ad returns the cash paid as cash and the credit as credit, never credit as money. Spending is atomic and once per ad (tested). It **cannot** reduce Lipila or Lenco fees: they take those from the wallet themselves, so crediting them would mean MoneyWise paying real money | built (credit use and return tested; the ad purchase and refund themselves need a live ads account and were not run) |
| Other MoneyWise-set charges that credit could pay (billing plan upgrade, premium features) | todo |
| Badges and rewards screens in the Expo app (it still shows the old local list) | todo |
| Rates are now 20 XP per point and 10 points per K1: the most one person can earn in credit over a lifetime is about K20 (all badges), so it is cheap. Change them in `progress.service.ts` (`XP_PER_POINT`, `POINTS_PER_KWACHA`, `GIFT_POINTS`) | set |
| Guided-mission badges are reported by the app, so a script could claim them. Each is once per person, so the total is capped, but treat the credit as a marketing cost until fees use it | known |

## Blue Opus share offers (added 22 Nov 2026)

A private, personal agreement to buy shares in Blue Opus (not publicly listed), on the Invest page ("Own a piece of Blue Opus", `/invest/blue-opus`). Post-money valuation K7,500,000 (the investor deck's K1.5M for 20%; the round is capped at K1.5M): ownership = amount / K7,500,000, fixed when the person signs.

| Part | Status |
|---|---|
| Page: valuation, amount calculator (percentage), the agreement text with the person's own numbers, risk warning, typed-name signature, "your offers" with withdraw | built, types check; not seen in a browser (needs sign-in) |
| Rules: minimum K1,000, optional per-person maximum and round cap, at most 3 open offers per person, round can be closed, a signed offer keeps its valuation (all in `app_settings` key `blue_opus_round`) | built; 31 checks (`test_share_round.ts`) |
| Blue Opus side (platform super-admins only, on the same page): accept (countersign), mark paid, decline, with a note the person sees; the person is notified | built |
| **No money moves.** The page records the signed offer only; Blue Opus tells the person how to pay. | by design |
| **Invite-only.** Only people Blue Opus invites can see the offer: a one-time code per named person (`BO-XXXXXXXX`, optional expiry, revocable, optional investor cap, link or typed). Without one the page says only "This is a private offer" and shows no figures; the Invest tile is hidden. Wrong guesses are throttled | built; checks in `test_share_round.ts` |
| **Lawyer gate.** Nobody can sign until a lawyer's approval of the current wording version is recorded (name and date, super-admin only); a change to the wording blocks offers again until re-approved. Investors tick four declarations (invited, 18+, can afford to lose it, own decision), stored with the offer | built |
| **The agreement text is still a DRAFT** written by me, not a lawyer. The brief to hand them, with the questions and the full text, is `docs/BLUE_OPUS_LEGAL_BRIEF.md`. A private company inviting the public to buy shares is regulated; the page is now invite-only, but the lawyer must confirm it is lawful, what exemption applies and whether the SEC must be told | **needs a lawyer** |
| Set the real minimum, per-person maximum and the size of the round; set the share count, price per share and a share register | todo |
| A share certificate / countersigned PDF for each paid offer; KYC check before accepting | todo |

## Connected inbox and bank statement import (20 Nov 2026)

| Part | Status |
|---|---|
| **Orders & messages inbox** (`/messages`, a button on the Inbox and a link on the Gmail card). Gmail, Facebook and Instagram connections already collected and AI-classified emails and customer messages, but **no screen or API listed them**, so a connected inbox looked empty by construction. Now: tabs for Orders (orders, "wants to buy", "asking about an order", "says they paid"), Payments & invoices, Other, Everything; search; connection status and last sync; open a message to read it | built; 11 checks (`test_channel_inbox.ts`) against the 599 real emails already stored; not seen in a browser |
| Orders tab is empty for the one connected mailbox because none of its 599 emails is an order (they are payment alerts, invoices and notifications). It fills when customers message a connected Facebook Page or Instagram, or send orders by email | explained |
| **Instagram and Facebook never connected** for this workspace (no connection rows exist): the Quick connect sign-in did not finish registering them. Cause not visible from here (server logs of the `complete` call would say). Reconnect and note the message the card shows | open |
| Reply from inside the inbox, confirm or dismiss a suggested payment match, and an "ORDER" kind of customer message for Instagram/Facebook comments | todo |
| **Bank statement import** (`apps/api/src/scripts/import_bank_statement.ts`): reads a Standard Chartered CSV, checks every balance line adds up, matches against the workspace's bank account, categorises, and writes what is missing as ledger entries (dry run by default; re-running adds nothing). Run on Louis Siwale's Workspace: 135 lines, 136 entries (incl. an opening balance of K24.21), 50 to 186 journal entries | done; see the summary in the chat for what needs a category |

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
