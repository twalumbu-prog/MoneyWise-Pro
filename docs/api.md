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
- `write`: Create resources (e.g., generate new hosted payment links).

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
