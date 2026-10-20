import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowLeft,
    Code2,
    Key,
    Copy,
    Check,
    Lock,
    Shield,
    Server,
    Layers,
    BookOpen,
    Search,
    Terminal,
    Sparkles,
    ChevronDown,
    ChevronUp,
    FileText
} from 'lucide-react';

interface EndpointParam {
    name: string;
    type: string;
    required?: boolean;
    description: string;
}

interface EndpointDoc {
    id: string;
    category: string;
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
    path: string;
    title: string;
    scope: 'read' | 'write';
    description: string;
    queryParams?: EndpointParam[];
    pathParams?: EndpointParam[];
    bodyParams?: EndpointParam[];
    exampleCurl?: string;
    exampleResponse: string;
}

const LLM_MARKDOWN_DOCS = `# MoneyWise Pro Public API (v1) Specification

## System Context & Integration Guide
This document contains the complete API specification for MoneyWise Pro. Use this reference when writing client SDKs, integration scripts, webhooks, or financial workflows for MoneyWise.

### Core Architecture & Conventions
- Production Base URL: https://moneywise.blueopus.cloud/api/v1
- Interactive Documentation: https://moneywise.blueopus.cloud/docs/api
- Default Currency: ZMW (Zambian Kwacha)
- Content-Type: application/json
- Authentication: Provide the secret API key in the 'Authorization: Bearer <key>' or 'X-Api-Key: <key>' header.
- Key Format: Keys start with prefix 'mwp_live_' (e.g. mwp_live_9f8a7b6c5d4e...).
- Scopes: Keys have either 'read', 'write', or both scopes.
- Plan Requirement: None. The API and OAuth are available on every plan, including Free.

---

### Authentication Headers
\`\`\`http
Authorization: Bearer mwp_live_YOUR_API_KEY
# or
X-Api-Key: mwp_live_YOUR_API_KEY
\`\`\`

---

### API Endpoints

#### 1. Organization Profile
- Method: GET
- Path: /v1/organization
- Scope Required: read
- Description: Returns organization details, contact info, and default currency.
- Response (200 OK):
\`\`\`json
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
\`\`\`

#### 2. List Wallets
- Method: GET
- Path: /v1/wallets
- Scope Required: read
- Description: Returns all wallets configured for the organization with live settled ledger balances.
- Response (200 OK):
\`\`\`json
{
  "data": [
    {
      "id": "01948d3c-9a2d-7bb0-8041-698fbfad4b3c",
      "name": "Main Operating Wallet",
      "is_main": true,
      "balance": 145000.50,
      "currency": "ZMW",
      "created_at": "2026-01-15T08:35:00Z"
    }
  ],
  "count": 1
}
\`\`\`

#### 3. Consolidated Balance Summary
- Method: GET
- Path: /v1/balance
- Scope Required: read
- Description: Returns total financial balance summed across all active wallets.
- Response (200 OK):
\`\`\`json
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
\`\`\`

#### 4. List Transactions (Cashbook Ledger)
- Method: GET
- Path: /v1/transactions
- Scope Required: read
- Description: Returns cursor-paginated transaction entries from the ledger.
- Query Parameters:
  - limit (integer, default: 50, max: 200)
  - cursor (string, base64url cursor from previous next_cursor)
  - start_date (string, YYYY-MM-DD)
  - end_date (string, YYYY-MM-DD)
  - type (string: INFLOW | OUTFLOW | TRANSFER)
  - status (string: COMPLETED | PENDING | REVERSED)
  - wallet_id (UUID)
  - account_id (UUID)
  - ledger (string, default: MONEYWISE_WALLET)
- Response (200 OK):
\`\`\`json
{
  "data": [
    {
      "id": "9a0f4410-a2e1-456d-8e65-728b74a38f32",
      "date": "2026-10-14",
      "description": "Customer payment for Invoice #1042",
      "debit": 2500.00,
      "credit": 0,
      "balance_after": 149850.50,
      "type": "INFLOW",
      "status": "COMPLETED",
      "ledger": "MONEYWISE_WALLET",
      "account": {
        "id": "18f5d130-9b64-4e2a-a92c-5b4d1ea407c1",
        "code": "4000",
        "name": "Sales Revenue"
      },
      "wallet_id": "01948d3c-9a2d-7bb0-8041-698fbfad4b3c",
      "reference": "LNC-PAY-89211",
      "created_at": "2026-10-14T11:20:00Z"
    }
  ],
  "count": 1,
  "next_cursor": "MjAyNi0xMC0xNHwyMDI2LTEwLTE0VDExOjIwOjAwWnw5YTBmNDQxMC1hMmUxLTQ1NmQtOGU2NS03MjhiNzRhMzhmMzI"
}
\`\`\`

#### 5. List Chart of Accounts
- Method: GET
- Path: /v1/accounts
- Scope Required: read
- Query Parameters:
  - type (string: ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE)
- Response (200 OK):
\`\`\`json
{
  "data": [
    {
      "id": "18f5d130-9b64-4e2a-a92c-5b4d1ea407c1",
      "code": "1000",
      "name": "Cash & Cash Equivalents",
      "type": "ASSET",
      "is_active": true,
      "created_at": "2026-01-15T08:30:00Z"
    }
  ],
  "count": 1
}
\`\`\`

#### 6. List Requisitions
- Method: GET
- Path: /v1/requisitions
- Scope Required: read
- Query Parameters:
  - status (string: PENDING | APPROVED | REJECTED | PAID | DISBURSED | SETTLED)
  - start_date (string, YYYY-MM-DD)
  - end_date (string, YYYY-MM-DD)
  - limit (integer, default 50, max 200)
- Response (200 OK):
\`\`\`json
{
  "data": [
    {
      "id": "402e1c94-b258-49f3-8f64-44dfd4193b2a",
      "reference_number": "REQ-2026-0042",
      "description": "Procurement of monthly network equipment",
      "type": "EXPENSE",
      "status": "APPROVED",
      "estimated_total": 4500.00,
      "actual_total": 4500.00,
      "department": "IT Operations",
      "created_at": "2026-10-12T09:00:00Z",
      "updated_at": "2026-10-12T14:30:00Z"
    }
  ],
  "count": 1
}
\`\`\`

#### 7. Get Requisition by ID
- Method: GET
- Path: /v1/requisitions/:id
- Scope Required: read
- Path Parameters:
  - id (UUID, required)
- Response (200 OK):
\`\`\`json
{
  "id": "402e1c94-b258-49f3-8f64-44dfd4193b2a",
  "reference_number": "REQ-2026-0042",
  "description": "Procurement of monthly network equipment",
  "type": "EXPENSE",
  "status": "APPROVED",
  "estimated_total": 4500.00,
  "actual_total": 4500.00,
  "department": "IT Operations",
  "payment_method": "MOBILE_MONEY",
  "created_at": "2026-10-12T09:00:00Z",
  "updated_at": "2026-10-12T14:30:00Z",
  "line_items": [
    {
      "id": "e72fa231-180b-4d7a-8f85-3bca928e4e71",
      "description": "Gigabit Ethernet Switch 24-Port",
      "quantity": 2,
      "unit_price": 2250.00,
      "estimated_amount": 4500.00,
      "actual_amount": 4500.00
    }
  ]
}
\`\`\`

#### 8. List Products & Services
- Method: GET
- Path: /v1/products
- Scope Required: read
- Query Parameters:
  - type (string)
  - limit (integer, default 50, max 200)
- Response (200 OK):
\`\`\`json
{
  "data": [
    {
      "id": "90bb2ef3-706d-4767-85b1-09de5394ef20",
      "name": "Standard Consultation (1 hr)",
      "description": "Professional advisory session",
      "price": 750.00,
      "type": "SERVICE",
      "category": "Advisory",
      "image_url": null,
      "is_active": true,
      "currency": "ZMW",
      "created_at": "2026-03-01T10:00:00Z"
    }
  ],
  "count": 1
}
\`\`\`

#### 9. List Payment Links
- Method: GET
- Path: /v1/payment-links
- Scope Required: read
- Query Parameters:
  - status (string: ACTIVE | PAID | CANCELLED)
  - product_id (UUID)
  - limit (integer, default 50, max 200)
- Response (200 OK):
\`\`\`json
{
  "data": [
    {
      "id": "673f8d22-d790-449e-b9bb-2287e02b7931",
      "token": "dGhpc19pc19hX3VuaXF1ZV90b2tlbl9leGFtcGxl",
      "product_id": "90bb2ef3-706d-4767-85b1-09de5394ef20",
      "customer_name": "Mutale Banda",
      "customer_phone": "+260977112233",
      "customer_email": "mutale@example.com",
      "amount": 750.00,
      "status": "ACTIVE",
      "reference": null,
      "created_at": "2026-10-14T10:15:00Z",
      "paid_at": null,
      "currency": "ZMW",
      "url": "https://moneywise.blueopus.cloud/pl/dGhpc19pc19hX3VuaXF1ZV90b2tlbl9leGFtcGxl"
    }
  ],
  "count": 1
}
\`\`\`

#### 10. Create Payment Link
- Method: POST
- Path: /v1/payment-links
- Scope Required: write
- Description: Generates a secure hosted checkout link that customers can open to pay online via Mobile Money (MTN, Airtel, Zamtel) or Visa/Mastercard.
- Request Body (JSON):
\`\`\`json
{
  "product_id": "90bb2ef3-706d-4767-85b1-09de5394ef20",
  "customer_name": "Mutale Banda",
  "customer_phone": "+260977112233",
  "customer_email": "mutale@example.com",
  "amount": 750.00
}
\`\`\`
- Response (201 Created):
\`\`\`json
{
  "id": "673f8d22-d790-449e-b9bb-2287e02b7931",
  "token": "dGhpc19pc19hX3VuaXF1ZV90b2tlbl9leGFtcGxl",
  "product_id": "90bb2ef3-706d-4767-85b1-09de5394ef20",
  "customer_name": "Mutale Banda",
  "customer_phone": "+260977112233",
  "customer_email": "mutale@example.com",
  "amount": 750.00,
  "status": "ACTIVE",
  "reference": null,
  "created_at": "2026-10-14T10:15:00Z",
  "paid_at": null,
  "currency": "ZMW",
  "url": "https://moneywise.blueopus.cloud/pl/dGhpc19pc19hX3VuaXF1ZV90b2tlbl9leGFtcGxl"
}
\`\`\`

---

### Error Handling & Response Format
All error responses return a standardized JSON structure:
\`\`\`json
{
  "error": "Short description of the error",
  "hint": "Optional guidance on resolving the error"
}
\`\`\`
- 400 Bad Request: Missing or malformed parameters (e.g. invalid date or UUID format).
- 401 Unauthorized: Missing, invalid, or revoked API key (mwp_live_...).
- 403 Forbidden: Insufficient scope (read vs write).
- 404 Not Found: Requested entity not found in your organization.
- 500 Internal Server Error: Server-side error.
`;

const ENDPOINTS: EndpointDoc[] = [
    {
        id: 'get-organization',
        category: 'Organization',
        method: 'GET',
        path: '/v1/organization',
        title: 'Get Organization Profile',
        scope: 'read',
        description: 'Retrieves metadata about your organization including identity, business contacts, and default currency (ZMW).',
        exampleCurl: `curl -X GET "https://moneywise.blueopus.cloud/api/v1/organization" \\
  -H "Authorization: Bearer mwp_live_..."`,
        exampleResponse: `{
  "id": "e30209e7-5789-4089-a5f1-3ec70f4ec282",
  "name": "Acme Enterprises Ltd",
  "slug": "acme-enterprises",
  "logo_url": "https://storage.moneywise.blueopus.cloud/logos/acme.png",
  "email": "finance@acme.com",
  "phone": "+260971234567",
  "website": "https://acme.com",
  "created_at": "2026-01-15T08:30:00Z",
  "currency": "ZMW"
}`
    },
    {
        id: 'get-wallets',
        category: 'Finance',
        method: 'GET',
        path: '/v1/wallets',
        title: 'List Wallets',
        scope: 'read',
        description: 'Returns all financial wallets and accounts configured for the organization along with their current real-time ledger balance.',
        exampleCurl: `curl -X GET "https://moneywise.blueopus.cloud/api/v1/wallets" \\
  -H "Authorization: Bearer mwp_live_..."`,
        exampleResponse: `{
  "data": [
    {
      "id": "01948d3c-9a2d-7bb0-8041-698fbfad4b3c",
      "name": "Main Operating Wallet",
      "is_main": true,
      "balance": 145000.50,
      "currency": "ZMW",
      "created_at": "2026-01-15T08:35:00Z"
    },
    {
      "id": "01948d3e-4b2a-7182-9ff2-77491cf2c12a",
      "name": "Petty Cash",
      "is_main": false,
      "balance": 4850.00,
      "currency": "ZMW",
      "created_at": "2026-02-01T10:15:00Z"
    }
  ],
  "count": 2
}`
    },
    {
        id: 'get-balance',
        category: 'Finance',
        method: 'GET',
        path: '/v1/balance',
        title: 'Get Balance Summary',
        scope: 'read',
        description: 'Returns the consolidated organization balance summed across all active wallets, plus individual wallet breakdowns.',
        exampleCurl: `curl -X GET "https://moneywise.blueopus.cloud/api/v1/balance" \\
  -H "Authorization: Bearer mwp_live_..."`,
        exampleResponse: `{
  "total_balance": 149850.50,
  "currency": "ZMW",
  "wallets": [
    {
      "id": "01948d3c-9a2d-7bb0-8041-698fbfad4b3c",
      "name": "Main Operating Wallet",
      "balance": 145000.50
    },
    {
      "id": "01948d3e-4b2a-7182-9ff2-77491cf2c12a",
      "name": "Petty Cash",
      "balance": 4850.00
    }
  ]
}`
    },
    {
        id: 'get-transactions',
        category: 'Finance',
        method: 'GET',
        path: '/v1/transactions',
        title: 'List Transactions (Cashbook)',
        scope: 'read',
        description: 'Returns cursor-paginated transaction entries from the ledger. Supports filtering by date range, transaction type, status, and wallet.',
        queryParams: [
            { name: 'limit', type: 'integer', description: 'Number of rows to return (default: 50, maximum: 200).' },
            { name: 'cursor', type: 'string', description: 'Opaque pagination cursor from next_cursor in the previous response.' },
            { name: 'start_date', type: 'string', description: 'Filter entries on or after date in YYYY-MM-DD format.' },
            { name: 'end_date', type: 'string', description: 'Filter entries on or before date in YYYY-MM-DD format.' },
            { name: 'type', type: 'string', description: 'Entry type: INFLOW, OUTFLOW, or TRANSFER.' },
            { name: 'status', type: 'string', description: 'Transaction status: COMPLETED, PENDING, or REVERSED.' },
            { name: 'wallet_id', type: 'UUID', description: 'Limit to transactions in a specific wallet.' },
            { name: 'account_id', type: 'UUID', description: 'Limit to transactions linked to a specific Chart of Accounts ID.' },
            { name: 'ledger', type: 'string', description: 'Account ledger type (defaults to MONEYWISE_WALLET).' }
        ],
        exampleCurl: `curl -X GET "https://moneywise.blueopus.cloud/api/v1/transactions?limit=25&type=INFLOW" \\
  -H "Authorization: Bearer mwp_live_..."`,
        exampleResponse: `{
  "data": [
    {
      "id": "9a0f4410-a2e1-456d-8e65-728b74a38f32",
      "date": "2026-10-14",
      "description": "Customer payment for Invoice #1042",
      "debit": 2500.00,
      "credit": 0,
      "balance_after": 149850.50,
      "type": "INFLOW",
      "status": "COMPLETED",
      "ledger": "MONEYWISE_WALLET",
      "account": {
        "id": "18f5d130-9b64-4e2a-a92c-5b4d1ea407c1",
        "code": "4000",
        "name": "Sales Revenue"
      },
      "wallet_id": "01948d3c-9a2d-7bb0-8041-698fbfad4b3c",
      "reference": "LNC-PAY-89211",
      "created_at": "2026-10-14T11:20:00Z"
    }
  ],
  "count": 1,
  "next_cursor": "MjAyNi0xMC0xNHwyMDI2LTEwLTE0VDExOjIwOjAwWnw5YTBmNDQxMC1hMmUxLTQ1NmQtOGU2NS03MjhiNzRhMzhmMzI"
}`
    },
    {
        id: 'get-accounts',
        category: 'Finance',
        method: 'GET',
        path: '/v1/accounts',
        title: 'List Chart of Accounts',
        scope: 'read',
        description: 'Returns the organization Chart of Accounts (COA) used for classifying income, expenses, assets, and liabilities.',
        queryParams: [
            { name: 'type', type: 'string', description: 'Filter by account type: ASSET, LIABILITY, EQUITY, REVENUE, or EXPENSE.' }
        ],
        exampleCurl: `curl -X GET "https://moneywise.blueopus.cloud/api/v1/accounts" \\
  -H "Authorization: Bearer mwp_live_..."`,
        exampleResponse: `{
  "data": [
    {
      "id": "18f5d130-9b64-4e2a-a92c-5b4d1ea407c1",
      "code": "1000",
      "name": "Cash & Cash Equivalents",
      "type": "ASSET",
      "is_active": true,
      "created_at": "2026-01-15T08:30:00Z"
    },
    {
      "id": "33c948e1-5120-410a-8bf8-09db1e72e121",
      "code": "5010",
      "name": "Office Supplies & Stationeries",
      "type": "EXPENSE",
      "is_active": true,
      "created_at": "2026-01-15T08:30:00Z"
    }
  ],
  "count": 2
}`
    },
    {
        id: 'get-requisitions',
        category: 'Requisitions',
        method: 'GET',
        path: '/v1/requisitions',
        title: 'List Requisitions',
        scope: 'read',
        description: 'Returns requisitions submitted across your organization, with optional status and date filters.',
        queryParams: [
            { name: 'status', type: 'string', description: 'Filter by status: PENDING, APPROVED, REJECTED, PAID, DISBURSED, or SETTLED.' },
            { name: 'start_date', type: 'string', description: 'Filter requisitions created on or after YYYY-MM-DD.' },
            { name: 'end_date', type: 'string', description: 'Filter requisitions created on or before YYYY-MM-DD.' },
            { name: 'limit', type: 'integer', description: 'Number of rows to return (default: 50, maximum: 200).' }
        ],
        exampleCurl: `curl -X GET "https://moneywise.blueopus.cloud/api/v1/requisitions?status=APPROVED" \\
  -H "Authorization: Bearer mwp_live_..."`,
        exampleResponse: `{
  "data": [
    {
      "id": "402e1c94-b258-49f3-8f64-44dfd4193b2a",
      "reference_number": "REQ-2026-0042",
      "description": "Procurement of monthly network equipment",
      "type": "EXPENSE",
      "status": "APPROVED",
      "estimated_total": 4500.00,
      "actual_total": 4500.00,
      "department": "IT Operations",
      "created_at": "2026-10-12T09:00:00Z",
      "updated_at": "2026-10-12T14:30:00Z"
    }
  ],
  "count": 1
}`
    },
    {
        id: 'get-requisition-by-id',
        category: 'Requisitions',
        method: 'GET',
        path: '/v1/requisitions/:id',
        title: 'Get Requisition Details',
        scope: 'read',
        description: 'Retrieves full details of a specific requisition including individual line items, amounts, and payment method.',
        pathParams: [
            { name: 'id', type: 'UUID', required: true, description: 'The unique UUID of the requisition.' }
        ],
        exampleCurl: `curl -X GET "https://moneywise.blueopus.cloud/api/v1/requisitions/402e1c94-b258-49f3-8f64-44dfd4193b2a" \\
  -H "Authorization: Bearer mwp_live_..."`,
        exampleResponse: `{
  "id": "402e1c94-b258-49f3-8f64-44dfd4193b2a",
  "reference_number": "REQ-2026-0042",
  "description": "Procurement of monthly network equipment",
  "type": "EXPENSE",
  "status": "APPROVED",
  "estimated_total": 4500.00,
  "actual_total": 4500.00,
  "department": "IT Operations",
  "payment_method": "MOBILE_MONEY",
  "created_at": "2026-10-12T09:00:00Z",
  "updated_at": "2026-10-12T14:30:00Z",
  "line_items": [
    {
      "id": "e72fa231-180b-4d7a-8f85-3bca928e4e71",
      "description": "Gigabit Ethernet Switch 24-Port",
      "quantity": 2,
      "unit_price": 2250.00,
      "estimated_amount": 4500.00,
      "actual_amount": 4500.00
    }
  ]
}`
    },
    {
        id: 'get-products',
        category: 'Products',
        method: 'GET',
        path: '/v1/products',
        title: 'List Products & Services',
        scope: 'read',
        description: 'Returns active products, catalog items, and services configured in your organization.',
        queryParams: [
            { name: 'type', type: 'string', description: 'Filter by product type category.' },
            { name: 'limit', type: 'integer', description: 'Maximum products to return (default: 50, maximum: 200).' }
        ],
        exampleCurl: `curl -X GET "https://moneywise.blueopus.cloud/api/v1/products" \\
  -H "Authorization: Bearer mwp_live_..."`,
        exampleResponse: `{
  "data": [
    {
      "id": "90bb2ef3-706d-4767-85b1-09de5394ef20",
      "name": "Standard Consultation (1 hr)",
      "description": "Professional advisory and financial audit session",
      "price": 750.00,
      "type": "SERVICE",
      "category": "Advisory",
      "image_url": null,
      "is_active": true,
      "currency": "ZMW",
      "created_at": "2026-03-01T10:00:00Z"
    }
  ],
  "count": 1
}`
    },
    {
        id: 'get-product',
        category: 'Products',
        method: 'GET',
        path: '/v1/products/:id',
        title: 'Get a Product',
        scope: 'read',
        description: 'Returns one product (active or not) from your organization, including where its payments are routed.',
        pathParams: [
            { name: 'id', type: 'UUID', required: true, description: 'Product ID.' }
        ],
        exampleCurl: `curl -X GET "https://moneywise.blueopus.cloud/api/v1/products/37759f07-95af-48ff-8112-b04fec3cdc2a" \\
  -H "Authorization: Bearer mwp_live_..."`,
        exampleResponse: `{
  "id": "37759f07-95af-48ff-8112-b04fec3cdc2a",
  "name": "Eagles Nest School — Platform access",
  "description": "Student access fee for Eagles Nest School on Project Genius (one-time payment).",
  "price": 150,
  "type": "SERVICE_FIXED",
  "category": "Project Genius",
  "image_url": null,
  "wallet_id": "48ad2128-b737-49d7-a241-587df8149600",
  "income_account_id": null,
  "is_active": true,
  "currency": "ZMW",
  "created_at": "2026-10-20T08:07:01Z"
}`
    },
    {
        id: 'create-product',
        category: 'Products',
        method: 'POST',
        path: '/v1/products',
        title: 'Create a Product',
        scope: 'write',
        description: 'Creates a product in your organization so you can sell it through payment links. Every payment for it is then tracked against the product in MoneyWise (sales per product, money routed to the wallet and booked to the income account you choose). Digital and booking products can only be created in the MoneyWise app.',
        bodyParams: [
            { name: 'name', type: 'string', required: true, description: 'Product name (1–120 characters).' },
            { name: 'price', type: 'number', required: true, description: 'Price in ZMW (non-negative). Not used for DONATION products.' },
            { name: 'type', type: 'string', required: false, description: 'PRODUCT (default), SERVICE_FIXED, SERVICE_VARIABLE or DONATION.' },
            { name: 'description', type: 'string', required: false, description: 'Up to 1000 characters.' },
            { name: 'category', type: 'string', required: false, description: 'Free-text grouping used in reports (e.g. your app name).' },
            { name: 'wallet_id', type: 'UUID', required: false, description: 'Wallet that receives the payments (from GET /v1/wallets). Defaults to the main wallet.' },
            { name: 'income_account_id', type: 'UUID', required: false, description: 'Income account the sales are booked to (from GET /v1/accounts?type=INCOME). Defaults to MoneyWise automatic categorisation.' }
        ],
        exampleCurl: `curl -X POST "https://moneywise.blueopus.cloud/api/v1/products" \\
  -H "Authorization: Bearer mwp_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Eagles Nest School — Platform access",
    "price": 150,
    "type": "SERVICE_FIXED",
    "category": "Project Genius"
  }'`,
        exampleResponse: `{
  "id": "37759f07-95af-48ff-8112-b04fec3cdc2a",
  "name": "Eagles Nest School — Platform access",
  "description": "Student access fee for Eagles Nest School on Project Genius (one-time payment).",
  "price": 150,
  "type": "SERVICE_FIXED",
  "category": "Project Genius",
  "image_url": null,
  "wallet_id": "48ad2128-b737-49d7-a241-587df8149600",
  "income_account_id": null,
  "is_active": true,
  "currency": "ZMW",
  "created_at": "2026-10-20T08:07:01Z"
}`
    },
    {
        id: 'update-product',
        category: 'Products',
        method: 'PATCH',
        path: '/v1/products/:id',
        title: 'Update a Product',
        scope: 'write',
        description: 'Changes a product\'s name, description, price, category, routing, or switches it on/off with is_active. Send only the fields you want to change. Existing payment links keep their own amount.',
        pathParams: [
            { name: 'id', type: 'UUID', required: true, description: 'Product ID.' }
        ],
        bodyParams: [
            { name: 'name', type: 'string', required: false, description: '1–120 characters.' },
            { name: 'description', type: 'string | null', required: false, description: 'Up to 1000 characters.' },
            { name: 'price', type: 'number', required: false, description: 'Non-negative price in ZMW.' },
            { name: 'category', type: 'string | null', required: false, description: 'Reporting group.' },
            { name: 'wallet_id', type: 'UUID | null', required: false, description: 'null resets to the main wallet.' },
            { name: 'income_account_id', type: 'UUID | null', required: false, description: 'null resets to automatic categorisation.' },
            { name: 'is_active', type: 'boolean', required: false, description: 'false stops new payment links being created for the product.' }
        ],
        exampleCurl: `curl -X PATCH "https://moneywise.blueopus.cloud/api/v1/products/37759f07-95af-48ff-8112-b04fec3cdc2a" \\
  -H "Authorization: Bearer mwp_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "price": 175 }'`,
        exampleResponse: `{
  "id": "37759f07-95af-48ff-8112-b04fec3cdc2a",
  "name": "Eagles Nest School — Platform access",
  "description": "Student access fee for Eagles Nest School on Project Genius (one-time payment).",
  "price": 150,
  "type": "SERVICE_FIXED",
  "category": "Project Genius",
  "image_url": null,
  "wallet_id": "48ad2128-b737-49d7-a241-587df8149600",
  "income_account_id": null,
  "is_active": true,
  "currency": "ZMW",
  "created_at": "2026-10-20T08:07:01Z"
}`
    },
    {
        id: 'get-payment-links',
        category: 'Payment Links',
        method: 'GET',
        path: '/v1/payment-links',
        title: 'List Payment Links',
        scope: 'read',
        description: 'Returns active and past payment links generated for collecting customer payments online.',
        queryParams: [
            { name: 'status', type: 'string', description: 'Filter by status: ACTIVE, PAID, or CANCELLED.' },
            { name: 'product_id', type: 'UUID', description: 'Filter links generated for a specific product ID.' },
            { name: 'limit', type: 'integer', description: 'Maximum records to return (default: 50, maximum: 200).' }
        ],
        exampleCurl: `curl -X GET "https://moneywise.blueopus.cloud/api/v1/payment-links?status=ACTIVE" \\
  -H "Authorization: Bearer mwp_live_..."`,
        exampleResponse: `{
  "data": [
    {
      "id": "673f8d22-d790-449e-b9bb-2287e02b7931",
      "token": "dGhpc19pc19hX3VuaXF1ZV90b2tlbl9leGFtcGxl",
      "product_id": "90bb2ef3-706d-4767-85b1-09de5394ef20",
      "customer_name": "Mutale Banda",
      "customer_phone": "+260977112233",
      "customer_email": "mutale@example.com",
      "amount": 750.00,
      "status": "ACTIVE",
      "reference": null,
      "created_at": "2026-10-14T10:15:00Z",
      "paid_at": null,
      "currency": "ZMW",
      "url": "https://moneywise.blueopus.cloud/pl/dGhpc19pc19hX3VuaXF1ZV90b2tlbl9leGFtcGxl"
    }
  ],
  "count": 1
}`
    },
    {
        id: 'get-payment-link',
        category: 'Payment Links',
        method: 'GET',
        path: '/v1/payment-links/:id',
        title: 'Get a Payment Link',
        scope: 'read',
        description: 'Returns one payment link, including its current status (ACTIVE, PAID or CANCELLED) and paid_at. Poll this to find out whether a customer has paid.',
        pathParams: [
            { name: 'id', type: 'UUID', required: true, description: 'Payment link ID (the id returned when you created it).' }
        ],
        exampleCurl: `curl -X GET "https://moneywise.blueopus.cloud/api/v1/payment-links/673f8d22-d790-449e-b9bb-2287e02b7931" \\
  -H "Authorization: Bearer mwp_live_..."`,
        exampleResponse: `{
  "id": "673f8d22-d790-449e-b9bb-2287e02b7931",
  "token": "dGhpc19pc19hX3VuaXF1ZV90b2tlbl9leGFtcGxl",
  "product_id": "90bb2ef3-706d-4767-85b1-09de5394ef20",
  "customer_name": "Mutale Banda",
  "customer_phone": "+260977112233",
  "customer_email": "mutale@example.com",
  "amount": 750.00,
  "status": "PAID",
  "reference": "REF-1760000000000",
  "created_at": "2026-10-14T10:15:00Z",
  "paid_at": "2026-10-14T10:18:42Z",
  "currency": "ZMW",
  "url": "https://moneywise.blueopus.cloud/pl/dGhpc19pc19hX3VuaXF1ZV90b2tlbl9leGFtcGxl"
}`
    },
    {
        id: 'create-payment-link',
        category: 'Payment Links',
        method: 'POST',
        path: '/v1/payment-links',
        title: 'Create Payment Link',
        scope: 'write',
        description: 'Generates a secure checkout link that customers can open to pay online via Mobile Money (MTN, Airtel, Zamtel) or Visa/MasterCard. Funds automatically settle to your organization wallet.',
        bodyParams: [
            { name: 'product_id', type: 'UUID', required: true, description: 'ID of an active product or service in your organization.' },
            { name: 'customer_name', type: 'string', required: true, description: 'Full name of the payer.' },
            { name: 'customer_phone', type: 'string', required: true, description: 'Payer mobile phone number (e.g. +26097... or 097...).' },
            { name: 'amount', type: 'number', required: true, description: 'Payment amount in ZMW (positive decimal).' },
            { name: 'customer_email', type: 'string', required: false, description: 'Payer email address for automated receipts.' }
        ],
        exampleCurl: `curl -X POST "https://moneywise.blueopus.cloud/api/v1/payment-links" \\
  -H "Authorization: Bearer mwp_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "product_id": "90bb2ef3-706d-4767-85b1-09de5394ef20",
    "customer_name": "Mutale Banda",
    "customer_phone": "+260977112233",
    "customer_email": "mutale@example.com",
    "amount": 750.00
  }'`,
        exampleResponse: `{
  "id": "673f8d22-d790-449e-b9bb-2287e02b7931",
  "token": "dGhpc19pc19hX3VuaXF1ZV90b2tlbl9leGFtcGxl",
  "product_id": "90bb2ef3-706d-4767-85b1-09de5394ef20",
  "customer_name": "Mutale Banda",
  "customer_phone": "+260977112233",
  "customer_email": "mutale@example.com",
  "amount": 750.00,
  "status": "ACTIVE",
  "reference": null,
  "created_at": "2026-10-14T10:15:00Z",
  "paid_at": null,
  "currency": "ZMW",
  "url": "https://moneywise.blueopus.cloud/pl/dGhpc19pc19hX3VuaXF1ZV90b2tlbl9leGFtcGxl"
}`
    }
];

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group bg-slate-900 text-slate-100 rounded-xl overflow-hidden font-mono text-xs my-3 border border-slate-800">
            <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-950/70 border-b border-slate-800 text-[11px] text-slate-400">
                <span>{language}</span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 hover:text-white transition-colors text-slate-400 p-1"
                    title="Copy code"
                >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
            </div>
            <pre className="p-4 overflow-x-auto leading-relaxed text-slate-200">
                <code>{code}</code>
            </pre>
        </div>
    );
}

export const ApiDocs: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeSection, setActiveSection] = useState<string>('llm-context');
    const [copiedBaseUrl, setCopiedBaseUrl] = useState(false);
    const [copiedLlmDocs, setCopiedLlmDocs] = useState(false);
    const [showLlmPreview, setShowLlmPreview] = useState(false);

    const prodBaseUrl = 'https://moneywise.blueopus.cloud/api/v1';

    const copyBaseUrl = () => {
        navigator.clipboard.writeText(prodBaseUrl);
        setCopiedBaseUrl(true);
        setTimeout(() => setCopiedBaseUrl(false), 2000);
    };

    const copyLlmMarkdown = () => {
        navigator.clipboard.writeText(LLM_MARKDOWN_DOCS.trim());
        setCopiedLlmDocs(true);
        setTimeout(() => setCopiedLlmDocs(false), 2500);
    };

    const filteredEndpoints = ENDPOINTS.filter(ep => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        return (
            ep.title.toLowerCase().includes(query) ||
            ep.path.toLowerCase().includes(query) ||
            ep.category.toLowerCase().includes(query) ||
            ep.description.toLowerCase().includes(query)
        );
    });

    const scrollTo = (id: string) => {
        setActiveSection(id);
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Link
                            to="/settings?tab=api"
                            className="p-2 -ml-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span className="hidden sm:inline">Settings</span>
                        </Link>
                        <div className="h-4 w-px bg-slate-200 hidden sm:block" />
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white shadow-sm">
                                <Code2 className="w-4 h-4" />
                            </div>
                            <span className="font-bold text-slate-900 tracking-tight text-base sm:text-lg">
                                MoneyWise <span className="text-violet-600">API Docs</span>
                            </span>
                            <span className="text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5 ml-1">
                                v1
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Copy for LLM in header */}
                        <button
                            onClick={copyLlmMarkdown}
                            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-all shadow-sm ${
                                copiedLlmDocs
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-transparent'
                            }`}
                            title="Copy entire documentation formatted for LLMs and AI prompts"
                        >
                            {copiedLlmDocs ? <Check className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                            <span>{copiedLlmDocs ? 'Copied for LLM!' : 'Copy for LLM'}</span>
                        </button>

                        <button
                            onClick={copyBaseUrl}
                            className="hidden md:flex items-center gap-1.5 text-xs font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg border border-slate-200 transition-colors"
                        >
                            <span>Base: {prodBaseUrl}</span>
                            {copiedBaseUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                        </button>

                        <Link
                            to="/settings?tab=api"
                            className="hidden sm:flex text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-3 py-2 rounded-lg transition-colors items-center gap-1.5"
                        >
                            <Key className="w-3.5 h-3.5 text-violet-600" />
                            Manage Keys
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main Layout */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col lg:flex-row gap-8">
                {/* Left Sidebar */}
                <aside className="w-full lg:w-64 flex-shrink-0">
                    <div className="sticky top-24 space-y-5 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        {/* Search */}
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                            <input
                                type="text"
                                placeholder="Search endpoints..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                        </div>

                        {/* Navigation Sections */}
                        <nav className="space-y-4 text-xs">
                            <div>
                                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] mb-1.5">
                                    Getting Started
                                </p>
                                <ul className="space-y-1">
                                    {[
                                        { id: 'llm-context', label: 'Copy for LLM (AI Context)' },
                                        { id: 'overview', label: 'Overview & Base URL' },
                                        { id: 'authentication', label: 'Authentication' },
                                        { id: 'oauth', label: 'OAuth (Connect with MoneyWise)' },
                                        { id: 'scopes', label: 'Scopes & Permissions' },
                                        { id: 'errors', label: 'Errors & Status Codes' },
                                    ].map(item => (
                                        <li key={item.id}>
                                            <button
                                                onClick={() => scrollTo(item.id)}
                                                className={`w-full text-left px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                                                    activeSection === item.id
                                                        ? 'bg-violet-50 text-violet-700 font-semibold'
                                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                                }`}
                                            >
                                                {item.label}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] mb-1.5">
                                    Endpoints ({filteredEndpoints.length})
                                </p>
                                <ul className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
                                    {filteredEndpoints.map(ep => (
                                        <li key={ep.id}>
                                            <button
                                                onClick={() => scrollTo(ep.id)}
                                                className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors flex items-center justify-between gap-1.5 ${
                                                    activeSection === ep.id
                                                        ? 'bg-violet-50 text-violet-700 font-semibold'
                                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                                }`}
                                            >
                                                <span className="truncate">{ep.title}</span>
                                                <span
                                                    className={`text-[9px] font-bold px-1 rounded uppercase ${
                                                        ep.method === 'POST'
                                                            ? 'bg-indigo-100 text-indigo-700'
                                                            : ep.method === 'PATCH'
                                                            ? 'bg-amber-100 text-amber-700'
                                                            : 'bg-emerald-100 text-emerald-700'
                                                    }`}
                                                >
                                                    {ep.method}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </nav>
                    </div>
                </aside>

                {/* Right Content Area */}
                <main className="flex-1 min-w-0 space-y-8">
                    {/* TOP SECTION: LLM & AI Context Card */}
                    <section
                        id="llm-context"
                        className="p-6 sm:p-7 rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50/50 shadow-sm relative overflow-hidden scroll-mt-24"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1.5">
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold text-[11px]">
                                    <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                                    AI &amp; LLM Ready
                                </div>
                                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                                    Copy Full Documentation for LLM
                                </h2>
                                <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                                    Need to prompt Claude, ChatGPT, Cursor, Copilot, or an autonomous agent with the MoneyWise API?
                                    Copy the complete formatted specification in one click.
                                </p>
                            </div>

                            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 flex-shrink-0">
                                <button
                                    onClick={copyLlmMarkdown}
                                    className={`flex items-center gap-2 text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl shadow transition-all ${
                                        copiedLlmDocs
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-violet-600 hover:bg-violet-700 text-white'
                                    }`}
                                >
                                    {copiedLlmDocs ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    <span>{copiedLlmDocs ? 'Copied to Clipboard!' : 'Copy Full Spec for LLM'}</span>
                                </button>
                                <button
                                    onClick={() => setShowLlmPreview(v => !v)}
                                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors"
                                >
                                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                                    <span>{showLlmPreview ? 'Hide Preview' : 'Preview'}</span>
                                    {showLlmPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        </div>

                        {/* Collapsible Preview */}
                        {showLlmPreview && (
                            <div className="mt-5 pt-4 border-t border-violet-100">
                                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                                    <span>Full Markdown context payload (ready to paste):</span>
                                    <a
                                        href="/llms.txt"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-violet-600 hover:underline font-medium"
                                    >
                                        Open raw /llms.txt &rarr;
                                    </a>
                                </div>
                                <CodeBlock code={LLM_MARKDOWN_DOCS.trim()} language="markdown" />
                            </div>
                        )}
                    </section>

                    {/* Getting Started: Overview */}
                    <section id="overview" className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm scroll-mt-24">
                        <div className="flex items-center gap-2 text-violet-600 font-bold text-xs uppercase tracking-wider mb-1">
                            <BookOpen className="w-4 h-4" />
                            Getting Started
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                            MoneyWise Public API Reference
                        </h1>
                        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                            The MoneyWise REST API enables your team and external systems to automate financial operations,
                            query organization wallets and ledger balances, inspect transactions and requisitions, and programmatically
                            create checkout payment links.
                        </p>

                        <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
                            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Server className="w-4 h-4 text-violet-500" />
                                Production Base URL
                            </p>
                            <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200">
                                <code className="text-xs sm:text-sm font-mono text-slate-800 break-all">
                                    {prodBaseUrl}
                                </code>
                                <button
                                    onClick={copyBaseUrl}
                                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                                    title="Copy Base URL"
                                >
                                    {copiedBaseUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-2">
                                All API requests must be served over HTTPS. Requests made over insecure HTTP will be rejected.
                            </p>
                        </div>
                    </section>

                    {/* Getting Started: Authentication */}
                    <section id="authentication" className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm scroll-mt-24">
                        <div className="flex items-center gap-2 text-violet-600 font-bold text-xs uppercase tracking-wider mb-1">
                            <Lock className="w-4 h-4" />
                            Security
                        </div>
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                            Authentication
                        </h2>
                        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                            Authenticate your API requests by providing your secret API key. API keys start with the prefix{' '}
                            <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-xs text-violet-700">mwp_live_</code>.
                            You can generate, inspect, and revoke API keys inside your MoneyWise dashboard under{' '}
                            <Link to="/settings?tab=api" className="text-violet-600 hover:underline font-semibold">
                                Settings &rarr; MoneyWise API
                            </Link>.
                        </p>

                        <div className="mt-4 space-y-3">
                            <p className="text-xs font-medium text-slate-700">
                                You can provide the API key using either of the following HTTP headers:
                            </p>
                            <CodeBlock
                                code={`# Option 1: Standard Authorization Bearer header (Recommended)
Authorization: Bearer mwp_live_abc123...

# Option 2: Custom X-Api-Key header
X-Api-Key: mwp_live_abc123...`}
                                language="http"
                            />
                        </div>

                        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed flex items-start gap-3">
                            <Shield className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold">Keep your secret keys secure:</span> Never commit API keys to public repositories or expose them in client-side mobile/browser bundles.
                                If a key is compromised, immediately revoke it in the Settings dashboard and generate a replacement.
                            </div>
                        </div>
                    </section>

                    {/* Getting Started: OAuth */}
                    <section id="oauth" className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm scroll-mt-24">
                        <div className="flex items-center gap-2 text-violet-600 font-bold text-xs uppercase tracking-wider mb-1">
                            <Lock className="w-4 h-4" />
                            Connect with MoneyWise
                        </div>
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                            OAuth 2.0
                        </h2>
                        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                            Let users connect your app to their organisation without copying API keys. Your app sends the user to MoneyWise,
                            an organisation admin approves it, and MoneyWise sends them back with a code you exchange for tokens.
                            It uses the authorization code flow with <strong>PKCE (S256)</strong>, which is required for every app.
                            Access tokens work on every <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-xs text-violet-700">/v1</code> endpoint
                            exactly like an API key, limited to the scopes the admin approved. Apps must be registered first (you get a{' '}
                            <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-xs text-violet-700">client_id</code>).
                        </p>

                        <h3 className="mt-5 text-sm font-bold text-slate-900">0. Register your app</h3>
                        <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                            An organisation admin registers each app under{' '}
                            <Link to="/settings?tab=api" className="text-violet-600 hover:underline font-semibold">Settings &rarr; MoneyWise API &rarr; Your apps</Link>{' '}
                            and chooses:
                        </p>
                        <ul className="mt-2 ml-5 list-disc text-sm text-slate-600 space-y-1">
                            <li><strong>App name</strong> and optional description &mdash; shown to admins on the approval screen.</li>
                            <li><strong>Callback URLs</strong> (up to 5) &mdash; where MoneyWise sends users back. They must match your app's redirect exactly, including the path. Use <code className="bg-slate-100 px-1 rounded font-mono text-xs text-violet-700">https://</code>, or <code className="bg-slate-100 px-1 rounded font-mono text-xs text-violet-700">http://localhost</code> for testing.</li>
                            <li><strong>App type</strong> &mdash; <em>server-side</em> apps get a <code className="bg-slate-100 px-1 rounded font-mono text-xs text-violet-700">client_id</code> and a <code className="bg-slate-100 px-1 rounded font-mono text-xs text-violet-700">client_secret</code> (shown once; keep it in server environment variables). <em>Mobile or browser-only</em> apps get only a client_id and rely on PKCE.</li>
                            <li><strong>Access</strong> &mdash; new apps are <em>Unverified</em> and limited to <code className="bg-slate-100 px-1 rounded font-mono text-xs text-violet-700">read</code>. Admins see an &ldquo;Unverified app&rdquo; warning when approving. Write access is unlocked once MoneyWise verifies the app.</li>
                        </ul>

                        <h3 className="mt-5 text-sm font-bold text-slate-900">1. Send the user to MoneyWise</h3>
                        <CodeBlock
                            code={`# Generate per login attempt:
#   code_verifier  = random string, 43-128 chars (A-Z a-z 0-9 - . _ ~)
#   code_challenge = base64url( SHA256(code_verifier) )   (no padding)

GET https://moneywise.blueopus.cloud/oauth/authorize
  ?response_type=code
  &client_id=mwc_your_client_id
  &redirect_uri=https://yourapp.com/callback
  &scope=read%20write
  &state=RANDOM_CSRF_VALUE
  &code_challenge=BASE64URL_SHA256_OF_VERIFIER
  &code_challenge_method=S256`}
                            language="http"
                        />

                        <h3 className="mt-5 text-sm font-bold text-slate-900">2. Receive the callback</h3>
                        <CodeBlock
                            code={`# Approved
https://yourapp.com/callback?code=mwa_...&state=RANDOM_CSRF_VALUE

# Denied
https://yourapp.com/callback?error=access_denied&state=RANDOM_CSRF_VALUE`}
                            language="http"
                        />
                        <p className="mt-2 text-xs text-slate-500">
                            Always check that <code className="font-mono">state</code> matches what you sent. Codes expire after 5 minutes and work once.
                        </p>

                        <h3 className="mt-5 text-sm font-bold text-slate-900">3. Exchange the code for tokens</h3>
                        <CodeBlock
                            code={`curl -X POST https://moneywise.blueopus.cloud/api/oauth/token \\
  -d grant_type=authorization_code \\
  -d client_id=mwc_your_client_id \\
  -d code=mwa_... \\
  -d redirect_uri=https://yourapp.com/callback \\
  -d code_verifier=YOUR_CODE_VERIFIER
  # server-side apps also send: -d client_secret=mws_...

{
  "access_token": "mwo_...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "mwr_...",
  "scope": "read write",
  "organization_id": "..."
}`}
                            language="bash"
                        />

                        <h3 className="mt-5 text-sm font-bold text-slate-900">4. Call the API, then refresh</h3>
                        <CodeBlock
                            code={`curl https://moneywise.blueopus.cloud/api/v1/balance \\
  -H "Authorization: Bearer mwo_..."

# When the access token expires (401 "Access token expired"), refresh it:
curl -X POST https://moneywise.blueopus.cloud/api/oauth/token \\
  -d grant_type=refresh_token \\
  -d client_id=mwc_your_client_id \\
  -d refresh_token=mwr_...

# Disconnect (revokes the app's access for that organisation):
curl -X POST https://moneywise.blueopus.cloud/api/oauth/revoke \\
  -d client_id=mwc_your_client_id -d token=mwr_...`}
                            language="bash"
                        />

                        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed flex items-start gap-3">
                            <Shield className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold">Refresh tokens rotate:</span> every refresh returns a new refresh token and the old one stops working.
                                Always store the newest one. Reusing an old refresh token is treated as theft and disconnects the app.
                                Access tokens last 1 hour; refresh tokens 60 days. Admins can disconnect any app under{' '}
                                <Link to="/settings?tab=api" className="underline font-semibold">Settings &rarr; MoneyWise API &rarr; Connected apps</Link>.
                            </div>
                        </div>
                    </section>

                    {/* Getting Started: Scopes & Permissions */}
                    <section id="scopes" className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm scroll-mt-24">
                        <div className="flex items-center gap-2 text-violet-600 font-bold text-xs uppercase tracking-wider mb-1">
                            <Layers className="w-4 h-4" />
                            Authorization
                        </div>
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                            Scopes &amp; Permissions
                        </h2>
                        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                            Every key is granted one or more granular scopes when created. Endpoints enforce the minimum required scope:
                        </p>

                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                                        read
                                    </span>
                                    <span className="text-xs font-semibold text-slate-700">Read Access</span>
                                </div>
                                <p className="text-xs text-slate-600 mt-1">
                                    Allows reading organization profile, wallets, ledger balances, transactions, Chart of Accounts, products, requisitions, and existing payment links.
                                </p>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold font-mono bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                                        write
                                    </span>
                                    <span className="text-xs font-semibold text-slate-700">Write Access</span>
                                </div>
                                <p className="text-xs text-slate-600 mt-1">
                                    Allows creating new resources, such as creating hosted public checkout links (<code className="font-mono text-[11px]">POST /v1/payment-links</code>).
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 text-xs text-slate-500">
                            Note: The MoneyWise Developer API is available on every plan, including Free.
                        </div>
                    </section>

                    {/* Getting Started: Errors */}
                    <section id="errors" className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm scroll-mt-24">
                        <div className="flex items-center gap-2 text-violet-600 font-bold text-xs uppercase tracking-wider mb-1">
                            <Terminal className="w-4 h-4" />
                            Protocols
                        </div>
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                            Errors &amp; Status Codes
                        </h2>
                        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                            The API uses conventional HTTP response codes to indicate the success or failure of an API request:
                        </p>

                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-xs text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px]">
                                        <th className="py-2 pr-4">Code</th>
                                        <th className="py-2 pr-4">Description</th>
                                        <th className="py-2">Example Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                    <tr>
                                        <td className="py-2.5 font-mono font-bold text-emerald-600">200 OK</td>
                                        <td className="py-2.5">Request succeeded.</td>
                                        <td className="py-2.5 text-slate-500">Standard successful GET response.</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2.5 font-mono font-bold text-emerald-600">201 Created</td>
                                        <td className="py-2.5">Resource created.</td>
                                        <td className="py-2.5 text-slate-500">Payment link successfully created.</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2.5 font-mono font-bold text-amber-600">400 Bad Request</td>
                                        <td className="py-2.5">Malformed request or missing parameter.</td>
                                        <td className="py-2.5 text-slate-500">Invalid date format (must be YYYY-MM-DD) or missing customer name.</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2.5 font-mono font-bold text-red-600">401 Unauthorized</td>
                                        <td className="py-2.5">Missing or invalid API key.</td>
                                        <td className="py-2.5 text-slate-500">Key revoked or header missing.</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2.5 font-mono font-bold text-red-600">403 Forbidden</td>
                                        <td className="py-2.5">Insufficient scope.</td>
                                        <td className="py-2.5 text-slate-500">Calling a POST endpoint with a read-only key or token.</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2.5 font-mono font-bold text-slate-600">404 Not Found</td>
                                        <td className="py-2.5">Resource does not exist.</td>
                                        <td className="py-2.5 text-slate-500">Product or Requisition ID not found in your organization.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Endpoints List */}
                    <div className="space-y-8 pt-4">
                        <div className="border-b border-slate-200 pb-2">
                            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                                API Endpoints Reference
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">
                                Complete specification for all MoneyWise Public API v1 endpoints.
                            </p>
                        </div>

                        {filteredEndpoints.map(ep => (
                            <article
                                key={ep.id}
                                id={ep.id}
                                className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm scroll-mt-24 space-y-6"
                            >
                                {/* Header */}
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap mb-2">
                                        <span
                                            className={`text-xs font-bold font-mono px-2 py-0.5 rounded uppercase tracking-wider ${
                                                ep.method === 'POST'
                                                    ? 'bg-indigo-600 text-white'
                                                    : ep.method === 'PATCH'
                                                    ? 'bg-amber-600 text-white'
                                                    : 'bg-emerald-600 text-white'
                                            }`}
                                        >
                                            {ep.method}
                                        </span>
                                        <code className="text-sm sm:text-base font-mono font-semibold text-slate-900">
                                            {ep.path}
                                        </code>
                                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full ml-auto">
                                            Scope: <code className="text-violet-700">{ep.scope}</code>
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900">{ep.title}</h3>
                                    <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                                        {ep.description}
                                    </p>
                                </div>

                                {/* Path Parameters */}
                                {ep.pathParams && ep.pathParams.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                                            Path Parameters
                                        </h4>
                                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                                            <table className="w-full text-xs text-left">
                                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[10px] uppercase">
                                                    <tr>
                                                        <th className="py-2 px-3">Parameter</th>
                                                        <th className="py-2 px-3">Type</th>
                                                        <th className="py-2 px-3">Description</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {ep.pathParams.map(p => (
                                                        <tr key={p.name}>
                                                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                                                                {p.name}
                                                                {p.required && <span className="text-red-500 ml-1">*</span>}
                                                            </td>
                                                            <td className="py-2.5 px-3 font-mono text-slate-500">{p.type}</td>
                                                            <td className="py-2.5 px-3 text-slate-600">{p.description}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Query Parameters */}
                                {ep.queryParams && ep.queryParams.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                                            Query Parameters
                                        </h4>
                                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                                            <table className="w-full text-xs text-left">
                                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[10px] uppercase">
                                                    <tr>
                                                        <th className="py-2 px-3">Parameter</th>
                                                        <th className="py-2 px-3">Type</th>
                                                        <th className="py-2 px-3">Description</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {ep.queryParams.map(p => (
                                                        <tr key={p.name}>
                                                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                                                                {p.name}
                                                                {p.required && <span className="text-red-500 ml-1">*</span>}
                                                            </td>
                                                            <td className="py-2.5 px-3 font-mono text-slate-500">{p.type}</td>
                                                            <td className="py-2.5 px-3 text-slate-600">{p.description}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Body Parameters */}
                                {ep.bodyParams && ep.bodyParams.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                                            Request Body Parameters
                                        </h4>
                                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                                            <table className="w-full text-xs text-left">
                                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[10px] uppercase">
                                                    <tr>
                                                        <th className="py-2 px-3">Field</th>
                                                        <th className="py-2 px-3">Type</th>
                                                        <th className="py-2 px-3">Description</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {ep.bodyParams.map(p => (
                                                        <tr key={p.name}>
                                                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                                                                {p.name}
                                                                {p.required && <span className="text-red-500 ml-1">*</span>}
                                                            </td>
                                                            <td className="py-2.5 px-3 font-mono text-slate-500">{p.type}</td>
                                                            <td className="py-2.5 px-3 text-slate-600">{p.description}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Code Snippet: cURL */}
                                {ep.exampleCurl && (
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">
                                            Example Request (cURL)
                                        </h4>
                                        <CodeBlock code={ep.exampleCurl} language="bash" />
                                    </div>
                                )}

                                {/* Code Snippet: Example Response */}
                                <div>
                                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">
                                        Example Response (200 OK)
                                    </h4>
                                    <CodeBlock code={ep.exampleResponse} language="json" />
                                </div>
                            </article>
                        ))}
                    </div>
                </main>
            </div>
        </div>
    );
};
