import { supabase } from '../lib/supabase';
import { revalueOrg } from './investmentRevaluation.service';

/**
 * Portal confirmations. The investment company's own portal (e.g. Longhorn's) is the source of truth for what an investor holds. The investor
 * (or their accountant) types in what the portal shows (valid deposits, total units, available value) as often as they like, and pastes the
 * portal's order book (one row per deposit with its units). From those:
 *   - the price per unit for that day is available value ÷ total units, saved as a STATEMENT price (a verified point on the price history,
 *     which beats anything the website scraper reads for the same day),
 *   - each order-book row is matched to a confirmed investment and stamped with the portal's real units,
 *   - anything that doesn't tie (deposits, units) is reported, never silently adjusted.
 */

export class PortalError extends Error { constructor(message: string, public httpStatus = 400) { super(message); } }

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const r6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
const todayStr = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
const DAY = 86_400_000;
const num = (v: unknown) => Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));

/** Funds the investor has confirmed money in, so a typo can't create a snapshot for a fund they don't hold. */
async function heldFund(orgId: string, targetId: string, fundId: string) {
    const { data: fund } = await supabase.from('fund_products').select('id, name, investment_target_id, frequency').eq('id', fundId).maybeSingle();
    if (!fund || fund.investment_target_id !== targetId) throw new PortalError('That fund doesn’t belong to this company.', 404);
    const { data: inv } = await supabase.from('investments').select('id').eq('investor_organization_id', orgId).eq('investment_target_id', targetId).eq('status', 'CONFIRMED').ilike('product_name', fund.name).limit(1);
    if (!inv?.length) throw new PortalError('You have no confirmed investment in this fund.', 404);
    return fund as { id: string; name: string; investment_target_id: string };
}

async function confirmedFor(orgId: string, fund: { investment_target_id: string; name: string }) {
    const { data } = await supabase.from('investments')
        .select('id, amount_received, amount_paid, confirmed_at, created_at, units, flow_code, portal_verified_at')
        .eq('investor_organization_id', orgId).eq('investment_target_id', fund.investment_target_id).eq('status', 'CONFIRMED').ilike('product_name', fund.name)
        .order('confirmed_at', { ascending: true });
    return (data ?? []).map((i: any) => ({
        id: i.id as string, amount: Number(i.amount_received ?? i.amount_paid ?? 0), date: String(i.confirmed_at ?? i.created_at).slice(0, 10),
        units: i.units != null ? Number(i.units) : null, flowCode: (i.flow_code as string | null) ?? null, verifiedAt: (i.portal_verified_at as string | null) ?? null,
    }));
}

/** A price can't replace a verified one for the same day unless it is also verified (the scraper must never overwrite a portal figure). */
export async function savePrice(fundId: string, date: string, nav: number, source: 'STATEMENT' | 'WEBSITE', note: string | null, userId?: string): Promise<boolean> {
    if (source === 'WEBSITE') {
        const { data: ex } = await supabase.from('fund_prices').select('source').eq('fund_id', fundId).eq('as_of', date).maybeSingle();
        if (ex && ex.source !== 'WEBSITE') return false;
    }
    const { error } = await supabase.from('fund_prices').upsert({ fund_id: fundId, as_of: date, nav: r6(nav), source, note, created_by: userId ?? null }, { onConflict: 'fund_id,as_of' });
    if (error) throw error;
    return true;
}

export interface PortalTotalsInput { targetId: string; fundId: string; asOf?: string; validDeposits?: number | string; totalUnits: number | string; availableValue: number | string }

export async function recordTotals(orgId: string, userId: string, b: PortalTotalsInput) {
    const fund = await heldFund(orgId, String(b.targetId), String(b.fundId));
    const asOf = String(b.asOf ?? todayStr()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) throw new PortalError('Give the date as YYYY-MM-DD.');
    if (asOf > todayStr()) throw new PortalError('The portal date can’t be in the future.');
    const units = num(b.totalUnits), value = num(b.availableValue), deposits = b.validDeposits === undefined || b.validDeposits === '' ? null : num(b.validDeposits);
    if (!(units > 0) || !(value > 0)) throw new PortalError('Enter the total units and the available value exactly as the portal shows them.');
    if (deposits != null && !(deposits >= 0)) throw new PortalError('Valid deposits must be zero or more.');
    const nav = value / units;
    if (!(nav > 0.01 && nav < 100000)) throw new PortalError('Those figures give an unlikely price per unit. Check the units and value.');

    // Sanity: a new price shouldn't jump wildly from the previous one (a typo guard, e.g. units and value swapped).
    const { data: prev } = await supabase.from('fund_prices').select('as_of, nav').eq('fund_id', fund.id).lte('as_of', asOf).order('as_of', { ascending: false }).limit(1);
    if (prev?.[0] && Math.abs(nav / Number(prev[0].nav) - 1) > 0.25) throw new PortalError(`That price (${r6(nav)}) is more than 25% away from the last one (${Number(prev[0].nav)}). Check the figures.`);

    const order = await confirmedFor(orgId, fund);
    const moneywiseDeposits = r2(order.reduce((s, o) => s + o.amount, 0));
    const orderUnits = order.every((o) => o.units != null) ? r4(order.reduce((s, o) => s + (o.units ?? 0), 0)) : null;

    await savePrice(fund.id, asOf, nav, 'STATEMENT', `Portal ${asOf}: available value ${r2(value)} / total units ${r4(units)}`, userId);
    const { error } = await supabase.from('investment_portal_snapshots').insert({
        investor_organization_id: orgId, investment_target_id: fund.investment_target_id, fund_id: fund.id, as_of: asOf,
        valid_deposits: deposits, total_units: r4(units), available_value: r2(value), nav: r6(nav), recorded_by: userId,
    });
    if (error) throw new Error(error.message);

    const ledger = await revalueOrg(orgId, userId).catch((e: any) => { console.error('[Portal] revaluation failed:', e?.message ?? e); return null; });
    return {
        fund: fund.name, asOf, nav: r6(nav), ledger,
        checks: {
            deposits: deposits == null ? null : { portal: r2(deposits), moneywise: moneywiseDeposits, diff: r2(deposits - moneywiseDeposits), ok: Math.abs(deposits - moneywiseDeposits) < 0.5 },
            units: orderUnits == null ? { portal: r4(units), moneywise: null, diff: null, ok: false, note: 'Paste the order book to confirm units deposit by deposit.' } : { portal: r4(units), moneywise: orderUnits, diff: r4(units - orderUnits), ok: Math.abs(units - orderUnits) < 0.05 },
        },
    };
}

export interface OrderBookRow { flowCode?: string; date: string; amount: number | string; units: number | string; status?: string }

/** Turns pasted portal rows ("TXN/2026/0030818, 2026-10-12, 489.00, 141.80" per line, or a list) into rows. */
export function parseOrderBook(input: unknown): OrderBookRow[] {
    const out: OrderBookRow[] = [];
    const add = (flowCode: string, d: string, amount: unknown, units: unknown, status?: string) => {
        let date = String(d).trim();
        const m = date.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
        if (m) date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && num(amount) > 0 && num(units) > 0) out.push({ flowCode: flowCode.trim() || undefined, date, amount: num(amount), units: num(units), status });
    };
    if (Array.isArray(input)) input.forEach((r: any) => add(String(r?.flowCode ?? ''), r?.date, r?.amount, r?.units, r?.status));
    else String(input ?? '').split(/\r?\n/).forEach((line) => {
        // Tabs, semicolons, or a comma followed by a space separate columns; a bare comma is a thousands separator (1,985.00).
        const parts = line.split(/\s*[;\t]\s*|,\s+/).map((s) => s.trim());
        if (parts.length === 3) add('', parts[0], parts[1], parts[2]);
        else if (parts.length >= 4) add(parts[0], parts[1], parts[2], parts[3], parts[4]);
    });
    return out;
}

export async function recordOrderBook(orgId: string, userId: string, b: { targetId: string; fundId: string; rows?: unknown; text?: unknown }) {
    const fund = await heldFund(orgId, String(b.targetId), String(b.fundId));
    const rows = parseOrderBook(b.rows ?? b.text).filter((r) => !r.status || /valid/i.test(r.status));
    if (!rows.length) throw new PortalError('No valid rows found. Use one line per deposit: flow code, date, amount, units.');
    const order = await confirmedFor(orgId, fund);
    const used = new Set<string>();
    const matched: any[] = [], missingInMoneywise: any[] = [];

    for (const r of rows) {
        const amount = num(r.amount), units = num(r.units), t = Date.parse(r.date);
        // The portal books a deposit on its bank value date; MoneyWise on the day it was confirmed (within a few days of each other, net of fees).
        const cand = order.filter((o) => !used.has(o.id) && Math.abs(Date.parse(o.date) - t) <= 5 * DAY && Math.abs(o.amount - amount) <= Math.max(0.5, amount * 0.03))
            .sort((a, c) => Math.abs(a.amount - amount) - Math.abs(c.amount - amount) || Math.abs(Date.parse(a.date) - t) - Math.abs(Date.parse(c.date) - t))[0];
        if (!cand) { missingInMoneywise.push({ flowCode: r.flowCode ?? null, date: r.date, amount, units }); continue; }
        used.add(cand.id);
        const { error } = await supabase.from('investments').update({ units: r4(units), flow_code: r.flowCode ?? cand.flowCode, portal_verified_at: new Date().toISOString() }).eq('id', cand.id);
        if (error) throw new Error(error.message);
        // Each verified deposit is itself a verified point on the price history: what one unit cost that day.
        await savePrice(fund.id, r.date, amount / units, 'STATEMENT', `Portal order book ${r.flowCode ?? ''}: ${amount} / ${units} units`.trim(), userId);
        matched.push({ investmentId: cand.id, flowCode: r.flowCode ?? null, date: r.date, amount, units: r4(units), moneywiseAmount: cand.amount });
    }
    const notInPortal = order.filter((o) => !used.has(o.id)).map((o) => ({ investmentId: o.id, date: o.date, amount: o.amount }));
    const ledger = await revalueOrg(orgId, userId).catch((e: any) => { console.error('[Portal] revaluation failed:', e?.message ?? e); return null; });
    return { fund: fund.name, ledger, matched, missingInMoneywise, notInPortal, allTied: missingInMoneywise.length === 0 && notInPortal.length === 0 };
}

/** What the investor sees: per fund, the position, the latest portal confirmation, the order book and the verified-price history. */
export async function portalView(orgId: string) {
    const { data: inv } = await supabase.from('investments').select('investment_target_id, product_name').eq('investor_organization_id', orgId).eq('status', 'CONFIRMED');
    const targetIds = [...new Set((inv ?? []).map((i: any) => i.investment_target_id))];
    if (!targetIds.length) return { funds: [] as any[] };
    const names = new Set((inv ?? []).map((i: any) => `${i.investment_target_id}|${String(i.product_name ?? '').trim().toLowerCase()}`));
    const { data: funds } = await supabase.from('fund_products').select('id, name, investment_target_id, frequency, investment_targets(display_name)').in('investment_target_id', targetIds).eq('is_active', true);
    const mine = (funds ?? []).filter((f: any) => names.has(`${f.investment_target_id}|${String(f.name).trim().toLowerCase()}`));
    const out: any[] = [];
    for (const f of mine as any[]) {
        const [order, { data: snaps }, { data: prices }] = await Promise.all([
            confirmedFor(orgId, f),
            supabase.from('investment_portal_snapshots').select('as_of, valid_deposits, total_units, available_value, nav, created_at').eq('investor_organization_id', orgId).eq('fund_id', f.id).order('as_of', { ascending: false }).order('created_at', { ascending: false }).limit(60),
            supabase.from('fund_prices').select('as_of, nav, source').eq('fund_id', f.id).order('as_of', { ascending: false }).limit(60),
        ]);
        const units = order.every((o) => o.units != null) ? r4(order.reduce((s, o) => s + (o.units ?? 0), 0)) : null;
        const latest = prices?.[0] ?? null;
        const latestVerified = (prices ?? []).find((p: any) => p.source !== 'WEBSITE') ?? null;
        const latestWebsite = (prices ?? []).find((p: any) => p.source === 'WEBSITE') ?? null;
        const t: any = Array.isArray(f.investment_targets) ? f.investment_targets[0] : f.investment_targets;
        out.push({
            fundId: f.id, targetId: f.investment_target_id, company: t?.display_name ?? null, name: f.name,
            deposits: r2(order.reduce((s, o) => s + o.amount, 0)), units, latestNav: latest ? Number(latest.nav) : null, latestDate: latest?.as_of ?? null,
            value: units != null && latest ? r2(units * Number(latest.nav)) : null,
            lastPortalCheck: snaps?.[0] ?? null,
            // The scraper is "behind" when a portal-verified price is newer than anything the website gave.
            websiteBehind: !!(latestVerified && (!latestWebsite || String(latestVerified.as_of) > String(latestWebsite.as_of))), latestWebsiteDate: latestWebsite?.as_of ?? null,
            orderBook: order.map((o) => ({ investmentId: o.id, date: o.date, amount: o.amount, units: o.units, flowCode: o.flowCode, verified: !!o.verifiedAt })),
            snapshots: snaps ?? [], prices: (prices ?? []).map((p: any) => ({ date: p.as_of, nav: Number(p.nav), source: p.source })),
        });
    }
    return { funds: out };
}

export const portfolioPortalService = { recordTotals, recordOrderBook, portalView, savePrice, parseOrderBook };
