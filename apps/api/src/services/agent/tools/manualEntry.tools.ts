/**
 * manualEntry.tools.ts — "I spent K10 cash on tomatoes": recording money that moved OUTSIDE MoneyWise (cash in hand, another bank,
 * a personal mobile-money number) against one of the person's external accounts, with its date and category.
 *
 * This moves no money — it is bookkeeping for money that already moved — so it is an ordinary approval-gated write. The category is
 * always fixed before the confirmation card is shown (the card the person approves is exactly what gets booked): if the model
 * hasn't chosen one, the handler asks the organisation's own categoriser and hands its suggestion back for the model to use.
 */
import { AgentContext, ToolDefinition, ToolProposal } from '../types';
import {
    listExternalWallets, matchExternalWallet, meansCash, ensureCashWallet, categoriesFor, suggestCategory, recordManualEntry,
} from '../../manualEntry.service';

const kwacha = (n: number) => `K${Number(n).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const invalid = (m: string): never => { throw new Error(`INVALID_ARGUMENTS: ${m}`); };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface TxArg { direction?: 'IN' | 'OUT'; amount: number; description: string; date?: string; account: string; categoryCode?: string }

interface Resolved {
    direction: 'IN' | 'OUT'; amount: number; description: string; date: string;
    wallet: { id: string; name: string } | null; createCash: boolean; category: { id: string; code: string; name: string };
}

async function resolve(ctx: AgentContext, list: TxArg[]): Promise<Resolved[]> {
    if (!Array.isArray(list) || list.length === 0) invalid('Give at least one transaction.');
    if (list.length > 25) invalid('Record at most 25 transactions at a time.');
    const wallets = await listExternalWallets(ctx.organizationId);
    const cats = { IN: await categoriesFor(ctx.organizationId, 'IN'), OUT: await categoriesFor(ctx.organizationId, 'OUT') };

    const out: Resolved[] = [];
    const missing: string[] = [];
    for (const [i, t] of list.entries()) {
        const n = i + 1;
        const direction = t.direction === 'IN' ? 'IN' : 'OUT';
        const amount = Math.round(Number(t.amount) * 100) / 100;
        if (!Number.isFinite(amount) || amount <= 0) invalid(`#${n}: the amount must be greater than zero.`);
        const description = String(t.description ?? '').replace(/\s+/g, ' ').trim();
        if (description.length < 2) invalid(`#${n}: say what it was for (e.g. "Tomatoes").`);
        const date = t.date ?? ctx.today;
        if (!ISO_DATE.test(date)) invalid(`#${n}: date must be YYYY-MM-DD (resolve words like "yesterday" yourself from today, ${ctx.today}).`);
        if (date > ctx.today) invalid(`#${n}: the date cannot be in the future.`);

        const said = String(t.account ?? '').trim();
        if (!said) invalid(`#${n}: which account was it paid from/into? e.g. "Cash" or one of: ${wallets.map((w) => w.name).join(', ') || '(no external accounts yet — "Cash" is created automatically)'}.`);
        const wallet = matchExternalWallet(wallets, said);
        const createCash = !wallet && meansCash(said);
        if (!wallet && !createCash) {
            invalid(`#${n}: there is no external account called "${said}". Existing ones: ${wallets.map((w) => w.name).join(', ') || 'none'}. Ask the user which one, or use "Cash". MoneyWise wallet transactions are recorded automatically and are never entered by hand.`);
        }

        const pool = cats[direction];
        if (!t.categoryCode) {
            const s = await suggestCategory(ctx.organizationId, direction, description, amount);
            missing.push(s
                ? `#${n} "${description}": suggested categoryCode "${s.account.code}" (${s.account.name})`
                : `#${n} "${description}": no confident match — pick a ${direction === 'IN' ? 'income' : 'expense'} account with list_accounts or ask the user`);
            continue;
        }
        const category = pool.find((a: any) => String(a.code).toLowerCase() === String(t.categoryCode).toLowerCase());
        if (!category) invalid(`#${n}: "${t.categoryCode}" is not an active ${direction === 'IN' ? 'income' : 'expense'} account. Use list_accounts to find the right code.`);
        out.push({ direction, amount, description, date, wallet: wallet ? { id: wallet.id, name: wallet.name } : null, createCash, category: { id: category.id, code: category.code, name: category.name } });
    }
    if (missing.length) {
        invalid(`Set categoryCode on every transaction before proposing. ${missing.join('; ')}. Re-call with these codes unless the user said otherwise.`);
    }
    return out;
}

const recordManualTransactions: ToolDefinition = {
    name: 'record_manual_transactions',
    description:
        'Record money the user spent or received OUTSIDE MoneyWise — cash in hand, another bank, a personal mobile-money number — ' +
        'e.g. "I spent K10 cash buying tomatoes" or "I got K500 cash from Mum". Each transaction is booked to one of their external ' +
        'accounts (a "Cash" account is created the first time cash is recorded) with its date and its chart-of-accounts category, ' +
        'and reduces or increases that account\'s balance. Use this for every such statement, several at once in one call. ' +
        'Money that moved through the MoneyWise wallet is recorded automatically — never use this for it. ' +
        'Always set categoryCode; if you leave it out the tool replies with a suggested code to use.',
    effect: 'write',
    allowedRoles: ['ADMIN', 'ACCOUNTANT', 'CASHIER', 'REQUESTOR'],
    parameters: {
        type: 'object',
        properties: {
            transactions: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        direction: { type: 'string', enum: ['OUT', 'IN'], description: 'OUT = spent / paid (default), IN = received.' },
                        amount: { type: 'number', description: 'Amount in ZMW.' },
                        description: { type: 'string', description: 'What it was, e.g. "Tomatoes".' },
                        date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today; work out "yesterday" etc. yourself.' },
                        account: { type: 'string', description: 'Which external account: "Cash", or the name of one of their external bank / mobile-money accounts.' },
                        categoryCode: { type: 'string', description: 'Chart-of-accounts code (an expense account for OUT, income for IN).' },
                    },
                    required: ['amount', 'description', 'account'],
                },
            },
        },
        required: ['transactions'],
    },
    handler: async (ctx, args): Promise<ToolProposal> => {
        const rows = await resolve(ctx, args.transactions);
        const total = rows.reduce((s, r) => s + (r.direction === 'OUT' ? -r.amount : r.amount), 0);
        const preview = rows.flatMap((r, i) => [
            { label: `${rows.length > 1 ? `${i + 1}. ` : ''}${r.description}`, value: `${r.direction === 'OUT' ? '−' : '+'}${kwacha(r.amount)}` },
            { label: '   Account', value: r.wallet ? r.wallet.name : 'Cash (new account)' },
            { label: '   Date', value: r.date },
            { label: '   Category', value: `${r.category.name} (${r.category.code})` },
        ]);
        if (rows.length > 1) preview.push({ label: 'Net change', value: `${total < 0 ? '−' : '+'}${kwacha(Math.abs(total))}` });
        return {
            __proposal: true,
            summary: rows.length === 1
                ? `Record ${rows[0].direction === 'OUT' ? 'spending' : 'money received'}: ${kwacha(rows[0].amount)} — ${rows[0].description}`
                : `Record ${rows.length} manual transactions`,
            preview,
            warning: rows.some((r) => r.createCash) ? 'A "Cash" account will be created to keep track of your cash.' : undefined,
        };
    },
    execute: async (ctx, args) => {
        const rows = await resolve(ctx, args.transactions);
        let cash: { id: string; name: string } | null = null;
        const recorded = [];
        for (const r of rows) {
            const wallet = r.wallet ?? (cash ??= await ensureCashWallet(ctx.organizationId));
            const res = await recordManualEntry({
                orgId: ctx.organizationId, userId: ctx.userId, direction: r.direction, amount: r.amount, description: r.description,
                date: r.date, externalWalletId: wallet.id, accountId: r.category.id, autoCategorize: false,
            });
            recorded.push({ entryId: res.entryId, reference: res.referenceNumber, amount: res.amount, direction: res.direction, date: res.date, account: res.externalWallet.name, category: res.category?.name });
        }
        return { recorded, count: recorded.length };
    },
};

export const manualEntryTools: ToolDefinition[] = [recordManualTransactions];
