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
    Terminal
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
    method: 'GET' | 'POST' | 'DELETE' | 'PUT';
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
    const [activeSection, setActiveSection] = useState<string>('overview');
    const [copiedBaseUrl, setCopiedBaseUrl] = useState(false);

    const prodBaseUrl = 'https://moneywise.blueopus.cloud/api/v1';

    const copyBaseUrl = () => {
        navigator.clipboard.writeText(prodBaseUrl);
        setCopiedBaseUrl(true);
        setTimeout(() => setCopiedBaseUrl(false), 2000);
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
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
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
                        <button
                            onClick={copyBaseUrl}
                            className="hidden md:flex items-center gap-1.5 text-xs font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
                        >
                            <span>Base: {prodBaseUrl}</span>
                            {copiedBaseUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                        </button>
                        <Link
                            to="/settings?tab=api"
                            className="text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                            <Key className="w-3.5 h-3.5" />
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
                                        { id: 'overview', label: 'Overview' },
                                        { id: 'authentication', label: 'Authentication' },
                                        { id: 'scopes', label: 'Scopes & Permissions' },
                                        { id: 'errors', label: 'Errors & Rate Limits' },
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
                <main className="flex-1 min-w-0 space-y-10">
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
                            Note: The MoneyWise Developer API requires an active <strong>Premium</strong> subscription for your organization.
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
                                        <td className="py-2.5">Insufficient scope or free-tier plan.</td>
                                        <td className="py-2.5 text-slate-500">Calling POST endpoint with read-only key, or organization not on Premium.</td>
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
