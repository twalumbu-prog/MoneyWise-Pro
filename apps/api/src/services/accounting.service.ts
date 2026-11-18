import { supabase } from '../lib/supabase';

/**
 * Financial statements read straight from the double-entry ledger (journal_entries / journal_lines). Enterprise plan only; the route enforces that.
 * Assets and expenses carry debit balances; liabilities, equity and income carry credit balances.
 * The ledger is never "closed", so profit earned to date appears on the balance sheet as "Profit for the period" and the statement still balances.
 */

export interface Acct { id: string; code: string | null; name: string; type: string; subtype: string | null }
interface Bal { debit: number; credit: number }
const r2 = (n: number) => Math.round(n * 100) / 100;
const isDebitNormal = (t: string) => t === 'ASSET' || t === 'EXPENSE';

export async function loadAccounts(orgId: string): Promise<Map<string, Acct>> {
    const out = new Map<string, Acct>();
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('accounts').select('id, code, name, type, subtype').eq('organization_id', orgId).order('code').range(from, from + 999);
        if (error) throw new Error(error.message);
        for (const a of (data ?? []) as Acct[]) out.set(a.id, a);
        if (!data || data.length < 1000) break;
    }
    return out;
}

export async function balances(orgId: string, from: string | null, to: string | null): Promise<Map<string, Bal>> {
    const { data, error } = await supabase.rpc('accounting_balances', { p_org: orgId, p_from: from, p_to: to }).range(0, 9999);
    if (error) throw new Error(`Could not read the ledger (${error.message}). Has the Enterprise migration been applied?`);
    const m = new Map<string, Bal>();
    for (const r of (data ?? []) as any[]) m.set(r.account_id, { debit: Number(r.debit), credit: Number(r.credit) });
    return m;
}

const orderKey = (a: Acct) => `${a.code ?? '~'}`.padStart(12, ' ') + a.name;

export async function trialBalance(orgId: string, asOf: string | null) {
    const [accts, bal] = await Promise.all([loadAccounts(orgId), balances(orgId, null, asOf)]);
    const rows = [...bal.entries()].map(([id, b]) => {
        const a = accts.get(id);
        const net = r2(b.debit - b.credit);
        return { accountId: id, code: a?.code ?? null, name: a?.name ?? '(deleted account)', type: a?.type ?? 'UNKNOWN', debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
    }).filter((r) => r.debit !== 0 || r.credit !== 0).sort((x, y) => orderKey({ ...x, id: '', subtype: null } as Acct).localeCompare(orderKey({ ...y, id: '', subtype: null } as Acct)));
    const debit = r2(rows.reduce((s, r) => s + r.debit, 0)), credit = r2(rows.reduce((s, r) => s + r.credit, 0));
    return { asOf, rows, totals: { debit, credit }, balanced: Math.abs(debit - credit) < 0.01 };
}

interface Line { accountId: string; code: string | null; name: string; amount: number }
interface Group { name: string; lines: Line[]; total: number }

function grouped(accts: Map<string, Acct>, bal: Map<string, Bal>, types: string[], sign: 1 | -1): Map<string, Group> {
    const out = new Map<string, Group>();
    for (const [id, b] of bal) {
        const a = accts.get(id);
        if (!a || !types.includes(a.type)) continue;
        const amount = r2(sign * (b.debit - b.credit));
        if (amount === 0) continue;
        const key = a.subtype || a.type;
        const g = out.get(key) ?? { name: key, lines: [], total: 0 };
        g.lines.push({ accountId: id, code: a.code, name: a.name, amount }); g.total = r2(g.total + amount);
        out.set(key, g);
    }
    for (const g of out.values()) g.lines.sort((x, y) => (x.code ?? '~').localeCompare(y.code ?? '~') || x.name.localeCompare(y.name));
    return out;
}
const sum = (m: Map<string, Group>) => r2([...m.values()].reduce((s, g) => s + g.total, 0));

export async function profitAndLoss(orgId: string, from: string | null, to: string | null) {
    const [accts, bal] = await Promise.all([loadAccounts(orgId), balances(orgId, from, to)]);
    const income = grouped(accts, bal, ['INCOME'], -1);
    const all = grouped(accts, bal, ['EXPENSE'], 1);
    const cogs = new Map([...all].filter(([k]) => /cost of (goods|sales)|direct cost/i.test(k)));
    const expenses = new Map([...all].filter(([k]) => !cogs.has(k)));
    const totalIncome = sum(income), totalCogs = sum(cogs), totalExpenses = sum(expenses);
    return {
        from, to, income: [...income.values()], costOfSales: [...cogs.values()], expenses: [...expenses.values()],
        totalIncome, totalCostOfSales: totalCogs, grossProfit: r2(totalIncome - totalCogs), totalExpenses, netProfit: r2(totalIncome - totalCogs - totalExpenses),
    };
}

export async function balanceSheet(orgId: string, asOf: string | null) {
    const [accts, bal] = await Promise.all([loadAccounts(orgId), balances(orgId, null, asOf)]);
    const assets = grouped(accts, bal, ['ASSET'], 1), liabilities = grouped(accts, bal, ['LIABILITY'], -1), equity = grouped(accts, bal, ['EQUITY'], -1);
    const profit = r2(sum(grouped(accts, bal, ['INCOME'], -1)) - sum(grouped(accts, bal, ['EXPENSE'], 1)));
    const totalAssets = sum(assets), totalLiabilities = sum(liabilities), totalEquity = r2(sum(equity) + profit);
    return {
        asOf, assets: [...assets.values()], liabilities: [...liabilities.values()], equity: [...equity.values()], profitForPeriod: profit,
        totalAssets, totalLiabilities, totalEquity, balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    };
}

export async function generalLedger(orgId: string, accountId: string, from: string | null, to: string | null) {
    const { data: acct } = await supabase.from('accounts').select('id, code, name, type').eq('organization_id', orgId).eq('id', accountId).maybeSingle();
    if (!acct) throw new Error('Account not found');
    const sign = isDebitNormal(acct.type) ? 1 : -1;
    let opening = 0;
    if (from) {
        const before = new Date(Date.parse(from) - 86_400_000).toISOString().slice(0, 10);
        const b = (await balances(orgId, null, before)).get(accountId);
        if (b) opening = r2(sign * (b.debit - b.credit));
    }
    const LIMIT = 3000;
    const rows: any[] = [];
    for (let start = 0; rows.length < LIMIT; start += 1000) {
        let q = supabase.from('journal_lines')
            .select('debit, credit, description, journal_entries!inner(entry_date, description, reference_number, source_type, organization_id)')
            .eq('account_id', accountId).eq('journal_entries.organization_id', orgId);
        if (from) q = q.gte('journal_entries.entry_date', from);
        if (to) q = q.lte('journal_entries.entry_date', to);
        const { data, error } = await q.order('entry_date', { referencedTable: 'journal_entries', ascending: true }).range(start, start + 999);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
    }
    rows.sort((a, b) => String(a.journal_entries.entry_date).localeCompare(String(b.journal_entries.entry_date)));
    let running = opening;
    const lines = rows.slice(0, LIMIT).map((l) => {
        const debit = Number(l.debit), credit = Number(l.credit);
        running = r2(running + sign * (debit - credit));
        const e = l.journal_entries;
        return { date: e.entry_date, reference: e.reference_number, source: e.source_type, description: l.description || e.description, debit, credit, balance: running };
    });
    return { account: acct, from, to, opening, lines, closing: running, truncated: rows.length > LIMIT };
}
