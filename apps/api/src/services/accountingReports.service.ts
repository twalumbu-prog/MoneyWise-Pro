import { supabase } from '../lib/supabase';
import { loadAccounts, balances, Acct } from './accounting.service';

/** Budget against what actually happened, and one period against another. Enterprise plan; the route enforces that. */

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (change: number, base: number) => (base !== 0 ? Math.round((change / Math.abs(base)) * 1000) / 10 : null);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

interface Line { accountId: string; code: string | null; name: string; budget: number; actual: number; variance: number; usedPct: number | null }

/**
 * Budget against actual for a date range. Budgets are the ones set on the Reports page whose dates fall inside the range, matched to accounts
 * by their QuickBooks id. Variance is "how much room is left": positive means under budget on costs, or ahead of target on income.
 */
export async function budgetVsActual(orgId: string, from: string, to: string) {
    const [accts, bal, { data: buds }] = await Promise.all([
        loadAccounts(orgId), balances(orgId, from, to),
        supabase.from('budgets').select('qb_account_id, amount').eq('organization_id', orgId).gte('start_date', from).lte('end_date', to).range(0, 4999),
    ]);
    const { data: withQb } = await supabase.from('accounts').select('id, qb_account_id').eq('organization_id', orgId).not('qb_account_id', 'is', null).range(0, 4999);
    const byQb = new Map<string, string>((withQb ?? []).map((a: any) => [String(a.qb_account_id), a.id]));
    const budget = new Map<string, number>();
    for (const b of (buds ?? []) as any[]) { const id = byQb.get(String(b.qb_account_id)); if (id) budget.set(id, r2((budget.get(id) ?? 0) + Number(b.amount))); }

    const build = (type: 'INCOME' | 'EXPENSE') => {
        const lines: Line[] = [];
        for (const a of accts.values()) {
            if (a.type !== type) continue;
            const b = bal.get(a.id);
            const actual = b ? r2(type === 'INCOME' ? b.credit - b.debit : b.debit - b.credit) : 0;
            const bud = budget.get(a.id) ?? 0;
            if (!actual && !bud) continue;
            const variance = r2(type === 'INCOME' ? actual - bud : bud - actual);
            lines.push({ accountId: a.id, code: a.code, name: a.name, budget: bud, actual, variance, usedPct: bud > 0 ? Math.round((actual / bud) * 1000) / 10 : null });
        }
        lines.sort((x, y) => Math.abs(y.actual) + y.budget - (Math.abs(x.actual) + x.budget));
        return { lines, budget: r2(lines.reduce((s, l) => s + l.budget, 0)), actual: r2(lines.reduce((s, l) => s + l.actual, 0)) };
    };
    const income = build('INCOME'), expenses = build('EXPENSE');
    return { from, to, income, expenses, budgetedProfit: r2(income.budget - expenses.budget), actualProfit: r2(income.actual - expenses.actual), anyBudget: budget.size > 0 };
}

export function comparisonRange(from: string, to: string, against: 'previous' | 'year') {
    if (against === 'year') {
        const f = new Date(from + 'T00:00:00Z'), t = new Date(to + 'T00:00:00Z');
        f.setUTCFullYear(f.getUTCFullYear() - 1); t.setUTCFullYear(t.getUTCFullYear() - 1);
        return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) };
    }
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
    return { from: addDays(from, -days), to: addDays(from, -1) };
}

/** Profit and loss for a range beside the same figures for an earlier range (the period just before it, or the same dates a year earlier). */
export async function comparePeriods(orgId: string, from: string, to: string, against: 'previous' | 'year') {
    const prev = comparisonRange(from, to, against);
    const [accts, cur, old] = await Promise.all([loadAccounts(orgId), balances(orgId, from, to), balances(orgId, prev.from, prev.to)]);
    const amount = (a: Acct, m: Map<string, { debit: number; credit: number }>) => { const b = m.get(a.id); return b ? r2(a.type === 'INCOME' ? b.credit - b.debit : b.debit - b.credit) : 0; };
    const section = (type: 'INCOME' | 'EXPENSE') => {
        const groups = new Map<string, { name: string; current: number; previous: number; lines: { accountId: string; name: string; current: number; previous: number; change: number; changePct: number | null }[] }>();
        for (const a of accts.values()) {
            if (a.type !== type) continue;
            const c = amount(a, cur), p = amount(a, old);
            if (!c && !p) continue;
            const key = a.subtype || a.type;
            const g = groups.get(key) ?? { name: key, current: 0, previous: 0, lines: [] };
            g.current = r2(g.current + c); g.previous = r2(g.previous + p);
            g.lines.push({ accountId: a.id, name: a.name, current: c, previous: p, change: r2(c - p), changePct: pct(c - p, p) });
            groups.set(key, g);
        }
        const list = [...groups.values()].map((g) => ({ ...g, change: r2(g.current - g.previous), changePct: pct(g.current - g.previous, g.previous), lines: g.lines.sort((x, y) => Math.abs(y.current) - Math.abs(x.current)) }));
        list.sort((x, y) => Math.abs(y.current) - Math.abs(x.current));
        return { groups: list, current: r2(list.reduce((s, g) => s + g.current, 0)), previous: r2(list.reduce((s, g) => s + g.previous, 0)) };
    };
    const income = section('INCOME'), expenses = section('EXPENSE');
    const net = { current: r2(income.current - expenses.current), previous: r2(income.previous - expenses.previous) };
    return {
        from, to, against, comparedWith: prev, income, expenses,
        net: { ...net, change: r2(net.current - net.previous), changePct: pct(net.current - net.previous, net.previous) },
    };
}

// ---------- change history ----------

export async function listChanges(orgId: string, opts: { table?: string; before?: string; limit?: number }) {
    let q = supabase.from('accounting_changes').select('id, table_name, row_id, op, changed, actor, at').eq('organization_id', orgId).order('at', { ascending: false }).limit(Math.min(500, opts.limit ?? 200));
    if (opts.table) q = q.eq('table_name', opts.table);
    if (opts.before) q = q.lt('at', opts.before);
    const { data, error } = await q;
    if (error) throw new Error(`Could not read the history (${error.message}). Has the history migration been applied?`);
    const actors = [...new Set((data ?? []).map((r: any) => r.actor).filter(Boolean))] as string[];
    const { data: users } = actors.length ? await supabase.from('users').select('id, name').in('id', actors) : { data: [] as any[] };
    const nameOf = new Map<string, string>((users ?? []).map((u: any) => [u.id, u.name]));
    return (data ?? []).map((r: any) => ({ ...r, actorName: r.actor ? nameOf.get(r.actor) ?? null : null }));
}
