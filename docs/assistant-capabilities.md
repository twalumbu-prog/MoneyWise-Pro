# Assistant capabilities and human-in-the-loop

What the MoneyWise Assistant can do for a personal account, where a person must step in, and what it still can't do.
Written 2026-10-27.

## The gaps we found

Before this change, the Assistant could read the books, draw charts and tables, export files, record manual transactions, draft requisitions, edit schedules and automations, classify entries, post to QuickBooks and change organisation settings. Almost nothing a *personal* account does every day was available to it:

| Area | Before | Gap |
|---|---|---|
| Balances | Ledger searches only | No wallet-by-wallet balance view |
| Receive money / QR | — | Couldn't show the pay link or its QR |
| Send money | Refused outright ("done from Disbursements") | The main thing a personal account does |
| Wallets | — | Couldn't create sub-wallets or external accounts, or move money between wallets |
| Savings | — | Couldn't list pots, create one, or add / withdraw |
| Budgets | — | Couldn't read or set budgets |
| Investing | — | Couldn't list companies, show account status, or invest |
| Settings | Organisation settings only | Couldn't read or change the person's own preferences |
| Approval | One tap for everything | No stronger check for money leaving the account |
| Widgets | chart / table / kpi / file | No QR widget |

## Human-in-the-loop tiers

| Tier | What happens | Tools |
|---|---|---|
| **0 · Read** | Runs straight away. Nothing changes. | `get_wallets`, `get_pay_link` (QR), `list_savings`, `get_budget_status`, `list_investments`, `find_recipient`, `get_my_settings`, `list_loan_providers` (tap-to-choose list), `list_my_loans`, `get_group_invite` (QR), `find_people_for_group` (tap-to-choose list), plus all the existing read tools |
| **1 · Change, no money moves** | An approval card with the exact details; one tap to approve | `create_wallet`, `create_external_account`, `set_budgets`, `update_my_preferences`, `create_savings_pot` (incl. GROUP), `add_group_member`, `join_group_savings`, `leave_group_savings`, `record_manual_transactions` |
| **2 · Money moves, stays the person's own** | Approval card | `transfer_between_wallets`, `add_to_savings` / `withdraw_from_savings` on their own pots |
| **3 · Money leaves the account, or a debt is taken on** | Approval card marked `strongAuth`. On the phone: Face ID when it's on, otherwise the app PIN, otherwise an "are you sure" dialog. On the web: a second confirmation dialog. | `send_money`, `invest`, contributions to someone else's group savings, `request_loan`, `request_salary_advance` |
| **Never from chat** | The Assistant explains where in the app to do it | PIN / Face ID / sign-in; opening an investment account (documents and consent); topping up a wallet (the person pays in, or shares their pay link) |

### Guards on money tools

- **Recipient verified first.** `send_money` resolves the recipient before the card exists: a MoneyWise search that needs one exact match, or a Lenco name lookup for mobile money and bank accounts. The card shows the verified name, and the prompt tells the Assistant to ask the person to check it.
- **Checked twice.** Balance, the fee and Lenco's K5 minimum are checked when the card is drawn, and checked again when the person approves.
- **Account holder only, and personal only.** Sending and investing are limited to the account holder (ADMIN), the same as the app's own auto-disburse endpoint. They are refused in a business org, where payments still go through a requisition and its approval.
- **Same code path as the app.** Every action calls the app's existing handler (`internalCall.ts`), so the Assistant can't do anything the app itself couldn't. `send_money` makes the same requisition plus auto-disburse calls as the Send Money screen, with the same fields.
- **No retries.** The prompt forbids re-sending. A send that comes back as "processing" is reported as processing, and the Assistant does not try it again.

### Known limit

`strongAuth` is enforced in the client. The PIN lives only on the device, so the server can't check it. The server still requires an approved proposal and re-runs every check on execute. Making this server-verifiable would need a short-lived signed token issued after the PIN check.

## Still to build

- **Deposit by mobile-money prompt from chat.** Needs a collection request plus polling. The agent flow can't yet wait on the payer's phone.
- **Web "Record recovery" UI** for employer loans (carried over from earlier).

## Loans, advances and group savings

- **The person picks the provider.** `list_loan_providers` shows a tap-to-choose list (the new `choices` widget). Employers come first, with an Employer badge and their logo, followed by the six outside lenders' products with their logos. Tapping one sends the choice as the person's next message. The prompt forbids the Assistant from choosing for them.
- **What the card shows.** It shows interest, the monthly amount, the total to repay and a debt warning, and is confirmed with the PIN / Face ID.
- **Employer requests.** They are filed in the employer's organization, exactly as the app does. Once the employer approves, the money is paid into the personal wallet and recovered through payroll. Salary advances come from employers only.
- **Outside lenders.** UniFi, Bayport and the rest are not integrated. The card and the reply say plainly that the request is recorded in MoneyWise only, and that the person must contact the lender.
- **Group savings.** A group is created with `create_savings_pot`, kind GROUP, which needs a target. Invites go out as a QR code or link. People are added by tapping a search result, never by a guessed name. Joining works with a code or link, and an organiser can't leave their own group.
- **Fixed along the way.** `createRequisition` never saved `repayment_period`, so loans filed from the app had no term either. It is now stored.

## Tests

`npm run build && node dist/scripts/test_personal_agent_tools.js` runs 12 checks against throwaway orgs, with Lenco stubbed. Money tools are tested up to the approval card only, and no money is moved. `node dist/scripts/test_loan_group_agent_tools.js` runs 12 checks covering loans, advances and group savings; requests are filed but nothing is paid out.
