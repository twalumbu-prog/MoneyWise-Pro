import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { getPortfolio } from './investmentPortfolio.service';

/**
 * Keeps the ledger in step with what an investment is worth. Deposits are booked as they happen (Dr "Investment – <company>" / Cr wallet),
 * but gains are not money moving, so nothing booked them: Reports and net worth read the ledger and stayed at cost plus whatever someone
 * had journalled by hand. After every price change this posts the difference between the holding's value (units × latest price) and the
 * investment account's balance as Dr/Cr "Investments & Dividends". It is relative to the balance, so running it twice posts nothing.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const todayStr = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
/** A gap bigger than this is more likely a missing or wrong deposit than a market move, so it is reported instead of booked as a gain. */
const MAX_AUTO_SHARE = 0.15;

async function gainsAccount(orgId: string): Promise<string> {
    const { data: found } = await supabase.from('accounts').select('id, name, code').eq('organization_id', orgId).eq('type', 'INCOME').eq('is_active', true);
    const hit = found?.find((a: any) => a.code === 'INV-GAINS') ?? found?.find((a: any) => /^investments?\s*(&|and)\s*dividends$/i.test(String(a.name).trim()));
    if (hit) return hit.id;
    const { data, error } = await supabase.from('accounts').insert({
        organization_id: orgId, code: 'INV-GAINS', name: 'Investment Gains', type: 'INCOME', subtype: 'Other Income',
        description: 'Growth in the value of investments held through MoneyWise Invest (units × price).', is_active: true,
    }).select('id').single();
    if (error || !data) throw new Error(`Could not create the investment gains account: ${error?.message}`);
    return data.id;
}

async function balanceOf(accountId: string): Promise<number> {
    let bal = 0;
    for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('journal_lines').select('debit, credit').eq('account_id', accountId).range(from, from + 999);
        for (const l of data ?? []) bal += Number((l as any).debit || 0) - Number((l as any).credit || 0);
        if ((data?.length ?? 0) < 1000) break;
    }
    return r2(bal);
}

export interface RevalueResult { target: string; value: number; ledgerBefore: number; posted: number; status: 'posted' | 'in_step' | 'needs_review' | 'skipped'; note?: string }

export async function revalueOrg(orgId: string, userId?: string | null): Promise<RevalueResult[]> {
    const portfolio = await getPortfolio(orgId);
    const out: RevalueResult[] = [];
    for (const h of portfolio.holdings) {
        const mine = portfolio.positions.filter((p) => p.targetId === h.targetId);
        const priced = r2(mine.reduce((s, p) => s + p.invested, 0));
        if (!mine.length || Math.abs(priced - h.invested) > 0.5) { out.push({ target: h.name, value: h.currentValue, ledgerBefore: 0, posted: 0, status: 'skipped', note: 'Not every deposit is matched to a priced fund yet.' }); continue; }
        const value = r2(mine.reduce((s, p) => s + p.value, 0));
        const { data: acct } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', `INV-${h.targetId.slice(0, 8).toUpperCase()}`).maybeSingle();
        if (!acct) { out.push({ target: h.name, value, ledgerBefore: 0, posted: 0, status: 'skipped', note: 'No investment account in the ledger.' }); continue; }
        const before = await balanceOf(acct.id);
        const delta = r2(value - before);
        if (Math.abs(delta) < 0.01) { out.push({ target: h.name, value, ledgerBefore: before, posted: 0, status: 'in_step' }); continue; }
        if (Math.abs(delta) > Math.max(50, value * MAX_AUTO_SHARE)) { out.push({ target: h.name, value, ledgerBefore: before, posted: 0, status: 'needs_review', note: `The ledger is K${before} but the holding is worth K${value}. That is too large to book as a market move; check the deposits.` }); continue; }

        const asOf = mine.map((p) => p.asOf).sort().pop() ?? todayStr();
        const date = asOf > todayStr() ? todayStr() : asOf;
        const gains = await gainsAccount(orgId);
        const desc = `${h.name} holdings valued at ${date} (units x NAV)`;
        const { data: je, error } = await supabase.from('journal_entries').insert({
            organization_id: orgId, entry_date: date, description: desc, reference_number: `REVAL-${date.replace(/-/g, '')}-${randomUUID().slice(0, 4).toUpperCase()}`,
            source_type: 'MANUAL', source_id: randomUUID(), created_by: userId ?? null,
        }).select('id').single();
        if (error || !je) throw new Error(`Could not book the revaluation: ${error?.message}`);
        const amt = Math.abs(delta);
        const { error: le } = await supabase.from('journal_lines').insert([
            { journal_entry_id: je.id, account_id: acct.id, debit: delta > 0 ? amt : 0, credit: delta > 0 ? 0 : amt, description: desc },
            { journal_entry_id: je.id, account_id: gains, debit: delta > 0 ? 0 : amt, credit: delta > 0 ? amt : 0, description: desc },
        ]);
        if (le) { await supabase.from('journal_entries').delete().eq('id', je.id); throw new Error(`Could not book the revaluation lines: ${le.message}`); }
        out.push({ target: h.name, value, ledgerBefore: before, posted: delta, status: 'posted' });
    }
    return out;
}

/** Revalues every investor that holds something with a company (used after the price feed runs). */
export async function revalueTarget(targetId: string): Promise<number> {
    const { data } = await supabase.from('investments').select('investor_organization_id').eq('investment_target_id', targetId).eq('status', 'CONFIRMED');
    const orgs = [...new Set((data ?? []).map((r: any) => r.investor_organization_id as string))];
    let posted = 0;
    for (const o of orgs) {
        try { posted += (await revalueOrg(o)).filter((r) => r.status === 'posted').length; }
        catch (e: any) { console.error('[Revalue] failed for', o, e?.message ?? e); }
    }
    return posted;
}
