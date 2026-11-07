# Virtual card providers: shortlist for MoneyWise

Prepared 7 November 2026. Everything here comes from web searches, mostly the providers' own pages and press articles. **Nothing has been confirmed with any provider.** Treat every row as a lead to verify, not a fact.

## What we need

MoneyWise Personal users keep money in a MoneyWise wallet (kwacha). We want them to spend it online without first sending it to a bank or mobile money.

- A **virtual card** each user can get inside the app, funded from their wallet in kwacha.
- Mostly **USD** (Amazon, apps, subscriptions), because that is what overseas merchants take. A kwacha card is a bonus.
- **Every card payment shown inside MoneyWise** (amount, merchant, date), plus freeze, limits and single-use cards.
- A **provider that holds the licence and card-scheme membership**, so MoneyWise does not have to become a card issuer itself.
- **KYC we already do** (Smile ID) should be reusable.

## The shortlist

| # | Provider | What we know | Zambia | Currency | Worry |
|---|---|---|---|---|---|
| 1 | **Fyatu** (fyatu.com) | Card-issuing API for Visa and Mastercard. Published fees: $0.50 to $2 per card issued, KYC $0.60 to $1.40 per cardholder (free with shared KYC), 2.5% cross-border, deposit fee $0.50 to $1 or 0.5% to 0.8%. Which tier applies to us is not stated. | Named in its Africa card markets | USD, EUR | No kwacha card. Check who the card issuer is and what happens if they stop. |
| 2 | **Bridgecard** (bridgecard.cards) | Card issuer for Africa, in about 20 countries. Uses Smile ID for KYC, which we already use. | Not confirmed | Not stated | Zambia may not be covered. Ask. |
| 3 | **Union54** (Zambian company) | Card-issuing API for fintechs, spun out of the Zambian wallet Zazu. Flutterwave was a partner. | Zambian | Not stated | July 2022 outage: its cards went down after a sponsor-bank delay and card-fraud flags from Mastercard. Ask for its current status and how it fixed that. |
| 4 | **Tutuka** | Payments enabler with APIs in about 25 countries. Powered Zazu's Mastercard virtual card in 2020. | Via Zazu in 2020 | Not stated | Probably heavier and aimed at larger programmes. The 2020 setup may no longer exist. |
| 5 | **Sudo Africa** | Card issuing and payments company. Many fintechs moved to it after the Union54 outage. | Not confirmed | Not stated | Mostly West Africa. Ask. |
| 6 | **Eisy** (eisyglobal.com) | USD virtual Visa or Mastercard for people in Zambia, about $2 to $3 to create and $1.50 to fund. | Yes (consumer product) | USD | Looks like a retail card, not an issuing API. Possibly useful as a stopgap for the company's own overseas purchases, not for our users. |

**For a kwacha card, or a sponsor bank:** ask the banks that have run card programmes with Mastercard or Visa. From 2019 and later reports these include National Savings and Credit Bank (NatSave), Zambia Industrial and Commercial Bank (ZICB), and United Bank for Africa (UBA Africard, a prepaid Visa). The reports are old. Ask whether they will sponsor a card programme for a fintech.

**Lenco:** no confirmation that it issues cards. It offers corporate cards for businesses. Ask the Lenco account manager whether that could cover the company's own overseas purchases, and whether it works with a card issuer.

**Not a candidate:** Flutterwave holds a Bank of Zambia payment licence (February 2025), but its Zambia offering is accepting payments and paying out, not issuing cards. It could be a way to fund, not to issue.

## Questions for every provider

**Coverage and licence**
1. Do you issue cards to customers in Zambia today? In which currencies?
2. Who is the issuer of record and the sponsor bank? Is that arrangement licensed by the Bank of Zambia?
3. Does MoneyWise need its own Bank of Zambia licence or designation if we use your cards? In writing, please.

**Money flow (the hard part)**
4. How do we fund the cards in USD when our balance is in kwacha? Do we pre-fund a USD balance with you?
5. How do you settle with us, and in which currency? How fast?
6. What exchange rate and margin applies, and who sets it?
7. Can unspent card money be returned to the wallet?

**Customers and compliance**
8. What KYC do you need per cardholder? Can you accept the checks we already run (Smile ID)?
9. Which merchants or categories are blocked (gambling, crypto, adult)?
10. Who carries fraud and chargeback losses?

**Product**
11. Single-use and multi-use virtual cards? Freeze, unfreeze, spending limits?
12. Do we see the full card number, or is it shown through your secure screen (affects our compliance burden)?
13. Webhooks for every transaction so we can show history in MoneyWise? Is there a sandbox?
14. 3-D Secure and one-time-code handling: do you take it or do we?

**Money and risk**
15. Full fee schedule: per card, per transaction, funding, FX, monthly minimums, setup.
16. Limits per card, per day and per month.
17. Your uptime and incident record. What happened in any outage, and how are we protected if you stop?
18. Can we move to another provider and keep our cardholders (contract exit and data portability)?

## Scorecard to fill in

Score each 1 to 5, then add up.

| | Fyatu | Bridgecard | Union54 | Tutuka | Sudo | Bank (NatSave/ZICB) |
|---|---|---|---|---|---|---|
| Serves Zambia now | | | | | | |
| Sponsor bank and licence clear | | | | | | |
| Fees (total cost per user) | | | | | | |
| Funding route works for kwacha | | | | | | |
| KYC we can reuse | | | | | | |
| API and sandbox quality | | | | | | |
| Track record | | | | | | |
| **Total** | | | | | | |

## Draft first message (edit before sending)

> Hello,
>
> I'm with MoneyWise, a Zambian business wallet and personal money app. Our users hold kwacha in their MoneyWise wallet and we'd like to let them get a virtual card inside the app and fund it from their wallet, so they can pay online without moving money to a bank first.
>
> We'd like to understand whether you can support this in Zambia. Could you tell us:
> 1. Whether you issue to Zambian customers today, in which currencies, and who the issuer and sponsor bank are.
> 2. How funding and settlement work when our users' money is in kwacha.
> 3. What KYC you need per cardholder.
> 4. Your pricing for card issuance, funding, FX and transactions.
> 5. Whether we can get sandbox access and API documentation.
>
> We can share volumes and our compliance set-up on a call.
>
> Thank you,
> [Name], MoneyWise

## Also ask the Bank of Zambia

The regulator, not a provider, decides whether MoneyWise can distribute another company's cards. The 2023 e-money directives (Government Gazette No. 7473, 14 July 2023) define the rules. A short, direct question to the Bank of Zambia payment systems department saves months:

> If MoneyWise offers virtual cards to its wallet users through a licensed issuer, what licence or designation does MoneyWise need, and does the Regulatory Sandbox apply?

## Sources

- Fyatu: card issuing, Africa markets and pricing pages (fyatu.com)
- Eisy: virtual dollar card in Zambia (eisyglobal.com/virtual-card/zambia)
- Bridgecard (bridgecard.cards) and its Smile ID case study (usesmileid.com)
- Union54: TechCrunch (October 2021), Techloy and TechCabal (2022 funding and outage coverage)
- Zazu and Tutuka: Fintech Futures (July 2020)
- Flutterwave Zambia licence: The Paypers and Techpoint (February 2025)
- Bank of Zambia 2023 e-money directives: Zambia Government Gazette No. 7473
- NatSave and ZICB Mastercard programmes: Mastercard newsroom (2019)
