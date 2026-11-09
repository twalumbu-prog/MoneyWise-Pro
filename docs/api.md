# MoneyWise Public API (v1) Reference

## Overview
The MoneyWise REST API allows developers to integrate with MoneyWise Pro data to query wallets, ledger balances, cashbook transactions, accounts, requisitions, and create hosted checkout payment links.

- **Production Base URL:** `https://moneywise.blueopus.cloud/api/v1`
- **Interactive Web Documentation:** `https://moneywise.blueopus.cloud/docs/api`
- **Default Currency:** `ZMW` (Zambian Kwacha)

---

## Authentication
Every request to the public API must be authenticated using an API key generated in the MoneyWise dashboard (**Settings &rarr; MoneyWise API**).

API keys start with the prefix `mwp_live_`.

Pass the key using either:
```http
Authorization: Bearer mwp_live_...
```
or
```http
X-Api-Key: mwp_live_...
```

*Note: Access to the Developer API requires an active **Premium** organization subscription.*

---

## Scopes
- `read`: View organization metadata, wallets, balances, transactions, Chart of Accounts, products, requisitions, and payment links.
- `write`: Create resources (e.g., generate new hosted payment links, record sales).

---

## Endpoints

### 1. Organization
#### `GET /v1/organization`
- **Scope:** `read`
- **Description:** Returns organization identity, contact info, and default currency.
- **Example Response:**
```json
{
  "id": "e30209e7-5789-4089-a5f1-3ec70f4ec282",
  "name": "Acme Enterprises Ltd",
  "slug": "acme-enterprises",
  "logo_url": "https://storage.moneywise.blueopus.cloud/logos/acme.png",
  "email": "finance@acme.com",
  "phone": "+260971234567",
  "website": "https://acme.com",
  "created_at": "2026-01-15T08:30:00Z",
  "currency": "ZMW"
}
```

---

### 2. Wallets & Balances
#### `GET /v1/wallets`
- **Scope:** `read`
- **Description:** Returns all wallets configured for the organization with live ledger balances.
- **Response:** `{ "data": [...], "count": number }`

#### `GET /v1/balance`
- **Scope:** `read`
- **Description:** Consolidated total balance across all active organization wallets.
- **Example Response:**
```json
{
  "total_balance": 149850.50,
  "currency": "ZMW",
  "wallets": [
    {
      "id": "01948d3c-9a2d-7bb0-8041-698fbfad4b3c",
      "name": "Main Operating Wallet",
      "balance": 145000.50
    }
  ]
}
```

---

### 3. Transactions (Cashbook Ledger)
#### `GET /v1/transactions`
- **Scope:** `read`
- **Description:** Returns cursor-paginated ledger entries.
- **Query Parameters:**
  - `limit` *(integer, default 50, max 200)*
  - `cursor` *(string, pagination token from previous `next_cursor`)*
  - `start_date` *(YYYY-MM-DD)*
  - `end_date` *(YYYY-MM-DD)*
  - `type` *(`INFLOW`, `OUTFLOW`, `TRANSFER`)*
  - `status` *(`COMPLETED`, `PENDING`, `REVERSED`)*
  - `wallet_id` *(UUID)*
  - `account_id` *(UUID, Chart of Accounts)*
- **Response:** `{ "data": [...], "count": number, "next_cursor": string | null }`

---

### 4. Chart of Accounts
#### `GET /v1/accounts`
- **Scope:** `read`
- **Query Parameters:**
  - `type` *(`ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`)*
- **Response:** `{ "data": [...], "count": number }`

---

### 5. Requisitions
#### `GET /v1/requisitions`
- **Scope:** `read`
- **Query Parameters:**
  - `status` *(`PENDING`, `APPROVED`, `REJECTED`, `PAID`, `DISBURSED`, `SETTLED`)*
  - `start_date` *(YYYY-MM-DD)*
  - `end_date` *(YYYY-MM-DD)*
  - `limit` *(integer)*
- **Response:** `{ "data": [...], "count": number }`

#### `GET /v1/requisitions/:id`
- **Scope:** `read`
- **Description:** Returns requisition details and itemized `line_items`.

---

### 6. Products & Services
#### `GET /v1/products`
- **Scope:** `read`
- **Query Parameters:**
  - `type` *(string)*
  - `limit` *(integer)*
- **Response:** `{ "data": [...], "count": number }`

---

### 7. Payment Links
#### `GET /v1/payment-links`
- **Scope:** `read`
- **Query Parameters:**
  - `status` *(`ACTIVE`, `PAID`, `CANCELLED`)*
  - `product_id` *(UUID)*
  - `limit` *(integer)*
- **Response:** `{ "data": [...], "count": number }`

#### `POST /v1/payment-links`
- **Scope:** `write`
- **Description:** Create a hosted checkout link to receive payments online via Mobile Money or Card.
- **Request Body:**
```json
{
  "product_id": "90bb2ef3-706d-4767-85b1-09de5394ef20",
  "customer_name": "Mutale Banda",
  "customer_phone": "+260977112233",
  "customer_email": "mutale@example.com",
  "amount": 750.00
}
```
- **Response:** Returns created link object including public `url`: `https://moneywise.blueopus.cloud/pl/<token>`.

---

### 8. Sales (paid outside MoneyWise)
#### `POST /v1/sales`
- **Scope:** `write`
- **Description:** Record a sale whose money was already collected in cash, mobile money or bank (e.g. a handwritten receipt). It appears in the Inflows inbox, Reports and the cashbook like a sale entered on the New Sale screen.
- **Request Body:**
```json
{
  "external_reference": "kaizen:mew3:2026-10-28:1",
  "date": "2026-10-28",
  "amount": 950,
  "account_type": "CASH",
  "customer_name": "Svea Hannekum",
  "customer_phone": "+260971234567",
  "items": [
    { "product_id": "90bb2ef3-706d-4767-85b1-09de5394ef20", "quantity": 1, "price": 950, "check_in": "2026-10-28", "check_out": "2026-10-29" }
  ]
}
```
  A free-text item (no catalogue product) looks like:
```json
{ "name": "Accommodation – Room 6", "income_account": "Accommodation Revenue", "quantity": 1, "price": 950 }
```
- **Fields:**
  - `external_reference` *(string, required, ≤120 chars)* — your unique id for the sale.
  - `date` *(YYYY-MM-DD, required)* — sale date.
  - `amount` *(number, required, > 0)* — amount collected.
  - `account_type` *(required)* — `CASH`, `AIRTEL_MONEY` or `BANK`.
  - `customer_name`, `customer_phone` *(string, optional)*.
  - `items` *(array, required, 1–100)* — each `{ product_id, quantity, price, check_in?, check_out? }` or `{ name, income_account?, quantity, price }`. `quantity` defaults to 1.
- **Rules:**
  - An item has either a `product_id` (a catalogue product; may carry `check_in`/`check_out` to reserve a stay) or a free-text `name` plus `income_account`.
  - `income_account` is one of your INCOME accounts, given as its id, code or name (case-insensitive). If it is missing or not found, the sale posts to your income account whose name contains "Accommodation"; if you have none, the request fails with 400.
  - `amount` is what was collected. It is split across the items in proportion to `quantity × price`, and one ledger entry is booked per income account (the first carries your `external_reference`, the others `<external_reference>::g2`, `::g3`, …).
  - Idempotent: `external_reference` is unique per organization. Sending the same reference again books nothing and returns **200** with the existing sale and `"created": false`, so it is safe to retry.
  - The sale is booked straight to the ledger (Dr cash / mobile money / bank, Cr income) with a `REC-` receipt number, and booking dates are reserved immediately (CONFIRMED).
- **Response (201 Created):**
```json
{
  "data": {
    "id": "5b1f0c7e-3a52-4f7e-9d0a-6c2b8e41a9d3",
    "receipt_number": "REC-2026-00412",
    "external_reference": "kaizen:mew3:2026-10-28:1",
    "amount": 950,
    "date": "2026-10-28",
    "account_type": "CASH",
    "entry_ids": ["e7c2a9b4-1d3f-4a8e-b6c5-0f9d2e7a1b34"]
  },
  "created": true
}
```
- **Errors:** `400` validation (including an unknown `product_id` or no income account to post to); `409` a booked room is already taken for those dates (nothing is recorded); `503` the same reference is being recorded by a concurrent request — retry after the `Retry-After` seconds.

#### `GET /v1/sales?external_reference=...`
- **Scope:** `read`
- **Description:** Look up a sale recorded through `POST /v1/sales` by your reference.
- **Response (200 OK):**
```json
{
  "data": {
    "id": "5b1f0c7e-3a52-4f7e-9d0a-6c2b8e41a9d3",
    "receipt_number": "REC-2026-00412",
    "external_reference": "kaizen:mew3:2026-10-28:1",
    "amount": 950,
    "date": "2026-10-28",
    "account_type": "CASH",
    "entry_ids": ["e7c2a9b4-1d3f-4a8e-b6c5-0f9d2e7a1b34"]
  }
}
```
- `404` if no sale with that reference exists in your organization.
