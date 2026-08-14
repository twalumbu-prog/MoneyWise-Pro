/**
 * guide.tools.ts — "How do I use this app?" retrieval.
 *
 * This is the only genuinely retrieval-shaped part of the assistant, and it is
 * deliberately a curated corpus rather than an embedding index: the app has a
 * few dozen concepts, not a document warehouse, and keyword scoring over
 * hand-written entries beats a vector search over scraped UI strings. The
 * ranking function is swappable for embeddings later without touching the
 * tool contract.
 */

import { ToolDefinition } from '../types';

interface GuideEntry {
    id: string;
    title: string;
    /** Route in the web app, so the answer can point somewhere. */
    route?: string;
    /** Extra search terms users are likely to say that aren't in the body. */
    keywords: string[];
    body: string;
}

const GUIDE: GuideEntry[] = [
    {
        id: 'requisition-lifecycle',
        title: 'How a requisition moves through the system',
        route: '/requisitions',
        keywords: ['requisition', 'request', 'approve', 'workflow', 'status', 'lifecycle', 'draft', 'submit'],
        body:
            'A requisition is a request to spend money. It moves: DRAFT (being written) → SUBMITTED (sent for ' +
            'approval) → AUTHORISED (approved) → DISBURSED (money sent) → RECEIVED (recipient confirmed) → ' +
            'COMPLETED (receipts uploaded and expenses categorised). REJECTED ends it. CHANGE_SUBMITTED means ' +
            'the actual spend differed from the estimate and a change was filed for review. Only DRAFT ' +
            'requisitions can be freely edited; after submission changes go through the change flow.',
    },
    {
        id: 'create-requisition',
        title: 'Creating a requisition',
        route: '/requisitions/new',
        keywords: ['new requisition', 'create', 'raise', 'line item', 'request money'],
        body:
            'New Requisition asks for a description, department and one or more line items, each with a ' +
            'quantity and unit price. The estimated total is the sum of the line items. Save as draft to ' +
            'keep editing, or submit to send it for approval. On mobile this is a step-by-step wizard; on ' +
            'desktop it is a single workspace.',
    },
    {
        id: 'expenses-categorisation',
        title: 'Expense categorisation and receipts',
        route: '/requisitions',
        keywords: ['receipt', 'categorise', 'categorize', 'expense', 'account', 'chart of accounts', 'ocr', 'scan'],
        body:
            'After money is disbursed, upload receipts against each line item. Receipts are read automatically ' +
            'and each line is matched to an account from the chart of accounts. Suggestions carry a confidence ' +
            'score; confirming or correcting one teaches the system, so the same vendor is categorised the same ' +
            'way next time. Categorisation must be confirmed before a requisition can be completed.',
    },
    {
        id: 'cashbook',
        title: 'The cashbook (ledger)',
        route: '/cashbook',
        keywords: ['cashbook', 'ledger', 'balance', 'transactions', 'reconcile', 'debit', 'credit'],
        body:
            'The cashbook is the running record of every money movement. Debit is money in, credit is money out, ' +
            'and each row carries the balance after that entry. Entries arrive from bank sync, from ' +
            'disbursements, and from manual entries. Filter by wallet, date range or description to reconcile ' +
            'a period.',
    },
    {
        id: 'wallets',
        title: 'Wallets and sub-wallets',
        route: '/cashbook',
        keywords: ['wallet', 'sub-wallet', 'account balance', 'transfer', 'main wallet'],
        body:
            'Money is held in wallets. Every organisation has a main wallet and may have additional sub-wallets ' +
            'for ring-fencing funds (a project, a department, a savings pot). Each wallet has its own running ' +
            'balance and you can transfer between them. A wallet balance is the balance_after value of its most ' +
            'recent non-pending cashbook entry.',
    },
    {
        id: 'schedules',
        title: 'Scheduled expenses',
        route: '/schedules',
        keywords: ['schedule', 'recurring', 'bill', 'subscription', 'loan repayment', 'due', 'cadence'],
        body:
            'Scheduled expenses track recurring commitments: bills, subscriptions, investments, loan repayments ' +
            'and general expenses. Each has an amount, a cadence (daily, weekly, biweekly, monthly, quarterly) ' +
            'and a next due date. "Run now" turns an occurrence into a requisition. Archiving an item stops it ' +
            'recurring without deleting its history. Proof of payment can be sent automatically when an ' +
            'occurrence is paid.',
    },
    {
        id: 'disbursements',
        title: 'Disbursing money',
        route: '/disbursements',
        keywords: ['disburse', 'pay out', 'send money', 'payment', 'transfer', 'proof of payment'],
        body:
            'Authorised requisitions are paid from the Disbursements screen. You pick the source wallet and the ' +
            'recipient, and the transfer goes out through the connected bank. Proof of transfer is attached to ' +
            'the requisition automatically. The recipient then acknowledges receipt, which moves the ' +
            'requisition to RECEIVED.',
    },
    {
        id: 'payment-links',
        title: 'Collecting money with payment links',
        route: '/products',
        keywords: ['payment link', 'collect', 'get paid', 'customer', 'checkout', 'invoice link'],
        body:
            'Payment links let customers pay you without an account. Products can be sold through a reusable ' +
            'link, or you can generate a one-time link for a specific amount. Paid links land in the cashbook ' +
            'and route to the wallet and income account configured on the product. A platform fee applies to ' +
            'external-link collections.',
    },
    {
        id: 'reporting',
        title: 'Reports',
        route: '/reporting',
        keywords: ['report', 'profit and loss', 'p&l', 'balance sheet', 'export', 'financial statements'],
        body:
            'Reporting produces financial statements from the ledger — income and expenditure by account, ' +
            'balances and period comparisons. Reports respect the chart of accounts, so categorisation quality ' +
            'directly determines report quality. Reports can be exported to PDF and Excel.',
    },
    {
        id: 'audit',
        title: 'Audit scores',
        route: '/audit',
        keywords: ['audit', 'score', 'compliance', 'documentation', 'receipts missing'],
        body:
            'Each requisition gets an audit score measuring how well documented it is: receipts present, ' +
            'amounts matching, categorisation confirmed, approvals in order. The Audit screen surfaces the ' +
            'weakest records so gaps can be closed before they matter.',
    },
    {
        id: 'payroll',
        title: 'Payroll',
        route: '/apps/payroll',
        keywords: ['payroll', 'salary', 'staff', 'employee', 'pay run', 'wages'],
        body:
            'Payroll holds your staff list and runs pay cycles. A pay run produces a requisition per cycle so ' +
            'salaries flow through the same approval, disbursement and accounting path as any other spend. ' +
            'Staff can be imported in bulk.',
    },
    {
        id: 'settings',
        title: 'Settings',
        route: '/settings',
        keywords: ['settings', 'configure', 'organisation', 'organization', 'users', 'roles', 'integrations'],
        body:
            'Settings covers the organisation profile (name, contacts, tax id), users and their roles, ' +
            'departments, the chart of accounts, product configuration, integrations such as QuickBooks and ' +
            'the bank connection, and AI model configuration. Most settings are admin-only.',
    },
    {
        id: 'roles',
        title: 'User roles',
        route: '/settings',
        keywords: ['role', 'permission', 'admin', 'accountant', 'authoriser', 'requestor', 'cashier', 'access'],
        body:
            'There are five roles. ADMIN has full access including settings and users. AUTHORISER approves ' +
            'requisitions. ACCOUNTANT works across finance: ledger, categorisation, reports. REQUESTOR raises ' +
            'requisitions and uploads receipts. CASHIER handles point-of-sale takings. What you can do in the ' +
            'app — and what this assistant can do on your behalf — follows your role.',
    },
];

/**
 * Keyword scoring: title and explicit keywords weigh more than body text, and
 * multi-term queries reward entries matching more of the terms.
 */
function score(entry: GuideEntry, terms: string[]): number {
    const title = entry.title.toLowerCase();
    const body = entry.body.toLowerCase();
    const keywords = entry.keywords.join(' ').toLowerCase();

    let total = 0;
    for (const t of terms) {
        if (keywords.includes(t)) total += 3;
        if (title.includes(t)) total += 2;
        if (body.includes(t)) total += 1;
    }
    return total;
}

const searchAppGuide: ToolDefinition = {
    name: 'search_app_guide',
    description:
        'Look up how MoneyWise Pro itself works — what a screen does, what a status means, how a ' +
        'workflow runs, what a role can access. Use this for "how do I…" and "what does … mean" ' +
        'questions instead of answering from memory, so the guidance matches this app rather than ' +
        'accounting software in general.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'What the user wants to understand, in their own words.' },
        },
        required: ['query'],
    },
    handler: async (_ctx, args) => {
        const terms = String(args.query ?? '')
            .toLowerCase()
            .split(/[^a-z&]+/)
            .filter(t => t.length > 2);

        if (!terms.length) return { matches: GUIDE.map(g => ({ title: g.title, route: g.route })) };

        const ranked = GUIDE
            .map(entry => ({ entry, s: score(entry, terms) }))
            .filter(r => r.s > 0)
            .sort((a, b) => b.s - a.s)
            .slice(0, 3);

        if (!ranked.length) {
            return {
                matches: [],
                available_topics: GUIDE.map(g => g.title),
                note: 'Nothing matched. Say so plainly rather than inventing app behaviour, and offer the topics above.',
            };
        }

        return {
            matches: ranked.map(r => ({
                title: r.entry.title,
                screen: r.entry.route,
                guidance: r.entry.body,
            })),
        };
    },
};

export const guideTools: ToolDefinition[] = [searchAppGuide];
