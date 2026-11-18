import { supabase } from '../lib/supabase';

/**
 * Real fund prices. An investment company lists its funds and sends a price (NAV per unit) for each date; everything shown to investors
 * (the chart, today's price, the change over a day, week, month, three months and the year so far, and what a holding is worth) is worked
 * out from those prices. Nothing is estimated: a fund with no prices shows none, and an old price is labelled as old.
 */

export class FundError extends Error {
    constructor(message: string, public httpStatus = 400) { super(message); }
}
const missing = (e: any) => /fund_products|fund_prices|schema cache/i.test(String(e?.message ?? ''));
const round = (n: number, d = 6) => Math.round(n * 10 ** d) / 10 ** d;
const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const todayStr = () => isoDay(Date.now() + 2 * 3_600_000); // Lusaka's date
const FREQ_STALE_DAYS: Record<string, number> = { DAILY: 7, WEEKLY: 14, MONTHLY: 45, QUARTERLY: 110 };

export interface PricePoint { date: string; nav: number }

/** The last price on or before a date, or null when the series starts later. */
export function priceOn(series: PricePoint[], date: string): PricePoint | null {
    let best: PricePoint | null = null;
    for (const p of series) { if (p.date <= date) best = p; else break; }
    return best;
}

/** How much the price has moved since a date, in percent, from the latest price. Null when there isn't a price that old. */
export function changeSince(series: PricePoint[], sinceDate: string): number | null {
    if (series.length < 2) return null;
    const last = series[series.length - 1];
    const then = priceOn(series, sinceDate);
    if (!then || then.date === last.date) return null;
    return round(((last.nav - then.nav) / then.nav) * 100, 2);
}

export function changes(series: PricePoint[]) {
    if (series.length < 2) return { d1: null, w1: null, m1: null, m3: null, ytd: null };
    const last = series[series.length - 1];
    const lt = Date.parse(last.date);
    const prev = series[series.length - 2];
    return {
        d1: round(((last.nav - prev.nav) / prev.nav) * 100, 2),
        w1: changeSince(series, isoDay(lt - 7 * DAY)),
        m1: changeSince(series, isoDay(lt - 30 * DAY)),
        m3: changeSince(series, isoDay(lt - 91 * DAY)),
        // Year to date: from the last price of last year, or from the year's first price when the series starts this year.
        ytd: changeSince(series, `${last.date.slice(0, 4)}-01-01`) ?? (() => { const first = series.find((p) => p.date >= `${last.date.slice(0, 4)}-01-01`); return first && first.date !== last.date ? round(((last.nav - first.nav) / first.nav) * 100, 2) : null; })(),
    };
}

const isStale = (frequency: string, asOf: string) => Date.now() - Date.parse(asOf) > (FREQ_STALE_DAYS[frequency] ?? 7) * DAY;

async function seriesFor(fundIds: string[]): Promise<Map<string, PricePoint[]>> {
    const out = new Map<string, PricePoint[]>();
    if (!fundIds.length) return out;
    const { data } = await supabase.from('fund_prices').select('fund_id, as_of, nav').in('fund_id', fundIds).order('as_of', { ascending: true }).limit(50000);
    for (const r of (data ?? []) as any[]) out.set(r.fund_id, [...(out.get(r.fund_id) ?? []), { date: String(r.as_of), nav: Number(r.nav) }]);
    return out;
}

const FUND_COLS = 'id, investment_target_id, key, name, kind, currency, frequency, min_deposit, risk, description, is_active, created_at';

/** Every active fund with its latest price, how long ago that was and how it has moved. */
export async function listFunds() {
    const { data: funds, error } = await supabase.from('fund_products').select(`${FUND_COLS}, investment_targets(display_name, provider_key, logo_url)`).eq('is_active', true).order('name');
    if (error) { if (missing(error)) return []; throw error; }
    const series = await seriesFor((funds ?? []).map((f: any) => f.id));
    const yields = await latestYields((funds ?? []).map((f: any) => f.id));
    const { data: demoRows } = await supabase.from('fund_prices').select('fund_id').eq('source', 'DEMO').in('fund_id', (funds ?? []).map((f: any) => f.id)).limit(5000);
    const demoFunds = new Set((demoRows ?? []).map((r: any) => r.fund_id));
    return (funds ?? []).map((f: any) => {
        const s = series.get(f.id) ?? [];
        const last = s[s.length - 1] ?? null;
        const t = Array.isArray(f.investment_targets) ? f.investment_targets[0] : f.investment_targets;
        return {
            id: f.id, targetId: f.investment_target_id, providerKey: t?.provider_key ?? null, company: t?.display_name ?? null, name: f.name, kind: f.kind, currency: f.currency,
            frequency: f.frequency, minDeposit: f.min_deposit, risk: f.risk, description: f.description,
            latest: last, points: s.length, stale: last ? isStale(f.frequency, last.date) : true, change: changes(s), yields: yields.get(f.id) ?? null, demo: demoFunds.has(f.id),
        };
    });
}

/** What a company reported alongside its latest price (the 3, 6 and 12 month yields), from the price's note. */
async function latestYields(fundIds: string[]): Promise<Map<string, { m3: number | null; m6: number | null; m12: number | null; asOf: string }>> {
    const out = new Map<string, { m3: number | null; m6: number | null; m12: number | null; asOf: string }>();
    if (!fundIds.length) return out;
    const { data } = await supabase.from('fund_prices').select('fund_id, as_of, note').in('fund_id', fundIds).not('note', 'is', null).order('as_of', { ascending: false }).limit(fundIds.length * 5);
    for (const r of (data ?? []) as any[]) {
        if (out.has(r.fund_id)) continue;
        try { const y = JSON.parse(r.note)?.yields; if (y) out.set(r.fund_id, { m3: y.m3 ?? null, m6: y.m6 ?? null, m12: y.m12 ?? null, asOf: String(r.as_of) }); } catch { /* a note that isn't ours */ }
    }
    return out;
}

export async function getSeries(fundId: string) {
    const { data: f, error } = await supabase.from('fund_products').select(`${FUND_COLS}, investment_targets(display_name, fund_fact_sheet_url)`).eq('id', fundId).maybeSingle();
    if (error && missing(error)) throw new FundError('Fund prices are opening soon.', 409);
    if (!f) throw new FundError('Fund not found.', 404);
    const s = (await seriesFor([fundId])).get(fundId) ?? [];
    const last = s[s.length - 1] ?? null;
    const yields = (await latestYields([fundId])).get(fundId) ?? null;
    const { count: demoCount } = await supabase.from('fund_prices').select('fund_id', { count: 'exact', head: true }).eq('fund_id', fundId).eq('source', 'DEMO');
    return { fund: { id: f.id, name: f.name, kind: f.kind, currency: f.currency, frequency: f.frequency, minDeposit: f.min_deposit, risk: f.risk }, demo: (demoCount ?? 0) > 0, facts: { description: f.description }, company: (() => { const t: any = Array.isArray((f as any).investment_targets) ? (f as any).investment_targets[0] : (f as any).investment_targets; return { name: t?.display_name ?? null, factSheetUrl: t?.fund_fact_sheet_url ?? null }; })(), yields, points: s, latest: last, stale: last ? isStale(f.frequency, last.date) : true, change: changes(s) };
}

/* ───────────── The company side ───────────── */

async function targetOf(orgId: string) {
    const { data } = await supabase.from('investment_targets').select('id, display_name').eq('organization_id', orgId).maybeSingle();
    return data as { id: string; display_name: string } | null;
}

export async function myFunds(orgId: string) {
    const t = await targetOf(orgId);
    if (!t) return { isTarget: false, company: null, funds: [] as any[] };
    const { data: funds, error } = await supabase.from('fund_products').select(FUND_COLS).eq('investment_target_id', t.id).order('name');
    if (error) { if (missing(error)) return { isTarget: true, company: t.display_name, funds: [], needsMigration: true }; throw error; }
    const series = await seriesFor((funds ?? []).map((f: any) => f.id));
    return {
        isTarget: true, company: t.display_name,
        funds: (funds ?? []).map((f: any) => { const s = series.get(f.id) ?? []; return { ...f, latest: s[s.length - 1] ?? null, points: s.length, recent: s.slice(-12).reverse() }; }),
    };
}

const KINDS = ['UNIT_TRUST', 'MONEY_MARKET', 'BOND', 'FIXED_DEPOSIT', 'OTHER'];
const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'];

/** Adds a fund, or changes one (matched by its key). Only the investment company itself can do this. */
export async function saveFund(orgId: string, b: any) {
    const t = await targetOf(orgId);
    if (!t) throw new FundError('Only an investment company on MoneyWise can list funds.', 403);
    const name = String(b.name ?? '').trim().slice(0, 100);
    if (!name) throw new FundError('Give the fund a name.');
    const key = String(b.key ?? name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const row: any = {
        investment_target_id: t.id, key, name, kind: KINDS.includes(b.kind) ? b.kind : 'UNIT_TRUST', currency: String(b.currency ?? 'ZMW').toUpperCase().slice(0, 3),
        frequency: FREQS.includes(b.frequency) ? b.frequency : 'DAILY', min_deposit: Number(b.minDeposit) > 0 ? Number(b.minDeposit) : null,
        risk: String(b.risk ?? '').trim().slice(0, 40) || null, description: String(b.description ?? '').trim().slice(0, 800) || null, is_active: b.isActive !== false,
    };
    const { data, error } = await supabase.from('fund_products').upsert(row, { onConflict: 'investment_target_id,key' }).select(FUND_COLS).single();
    if (error) { if (missing(error)) throw new FundError('Fund prices are opening soon.', 409); throw error; }
    return data;
}

async function ownFund(orgId: string, fundId: string) {
    const t = await targetOf(orgId);
    if (!t) throw new FundError('Only an investment company on MoneyWise can send prices.', 403);
    const { data } = await supabase.from('fund_products').select('id, investment_target_id').eq('id', fundId).maybeSingle();
    if (!data || data.investment_target_id !== t.id) throw new FundError('That isn’t one of your funds.', 404);
    return data;
}

/** Turns pasted text ("2026-11-03, 1.2540" on each line) or a list into prices. Dates may be YYYY-MM-DD or DD/MM/YYYY. */
export function parsePrices(input: unknown): { date: string; nav: number }[] {
    const rows: { date: string; nav: number }[] = [];
    const add = (d: string, n: string | number) => {
        let date = String(d).trim();
        const m = date.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
        if (m) date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        const nav = Number(String(n).replace(/[^0-9.]/g, ''));
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && nav > 0) rows.push({ date, nav });
    };
    if (Array.isArray(input)) input.forEach((r: any) => add(r?.date, r?.nav));
    else String(input ?? '').split(/\r?\n/).forEach((line) => { const [d, n] = line.split(/[,;\t]/); if (d && n) add(d, n); });
    return rows;
}

export async function addPrices(orgId: string, userId: string, fundId: string, input: unknown, source = 'MANAGER') {
    await ownFund(orgId, fundId);
    const rows = parsePrices(input);
    if (!rows.length) throw new FundError('No valid prices found. Use one line per day, like 2026-11-03, 1.2540.');
    const today = todayStr();
    if (rows.some((r) => r.date > today)) throw new FundError('A price can’t be for a day that hasn’t happened yet.');
    if (rows.length > 3000) throw new FundError('Send at most 3,000 prices at a time.');
    const { error } = await supabase.from('fund_prices').upsert(rows.map((r) => ({ fund_id: fundId, as_of: r.date, nav: r.nav, source, created_by: userId })), { onConflict: 'fund_id,as_of' });
    if (error) throw error;
    return { saved: rows.length };
}

export async function deletePrice(orgId: string, fundId: string, date: string) {
    await ownFund(orgId, fundId);
    await supabase.from('fund_prices').delete().eq('fund_id', fundId).eq('as_of', date);
    return { ok: true };
}

/* ───────────── Investors' positions ───────────── */

export interface Position {
    fundId: string; targetId: string; name: string; units: number; invested: number; averagePrice: number; latestNav: number; asOf: string; stale: boolean;
    value: number; gain: number; gainPct: number;
}

/**
 * What an investor holds in each fund, in units: every confirmed investment is matched to a fund by company and product name, and its units are
 * the money put in divided by that fund's price on the day (the last price on or before it). An investment with no price that old, or with no
 * matching fund, has no units, and the caller then falls back to its older way of valuing the holding.
 */
export async function positionsFor(inv: { investment_target_id: string; product_name: string | null; amount: number; at: string }[]): Promise<{ positions: Position[]; unmatchedTargets: Set<string> }> {
    const targetIds = [...new Set(inv.map((i) => i.investment_target_id))];
    const unmatchedTargets = new Set<string>(targetIds);
    if (!targetIds.length) return { positions: [], unmatchedTargets };
    const { data: funds, error } = await supabase.from('fund_products').select('id, investment_target_id, name, frequency').in('investment_target_id', targetIds).eq('is_active', true);
    if (error || !funds?.length) return { positions: [], unmatchedTargets };
    const series = await seriesFor(funds.map((f: any) => f.id));
    const byKey = new Map<string, any>(funds.map((f: any) => [`${f.investment_target_id}|${String(f.name).trim().toLowerCase()}`, f]));

    const acc = new Map<string, { fund: any; units: number; invested: number }>();
    const covered = new Map<string, { all: number; priced: number }>();
    for (const i of inv) {
        const c = covered.get(i.investment_target_id) ?? { all: 0, priced: 0 };
        c.all++;
        const fund = byKey.get(`${i.investment_target_id}|${String(i.product_name ?? '').trim().toLowerCase()}`);
        const s = fund ? series.get(fund.id) ?? [] : [];
        const at = priceOn(s, String(i.at).slice(0, 10));
        if (fund && at) {
            const e = acc.get(fund.id) ?? { fund, units: 0, invested: 0 };
            e.units += i.amount / at.nav; e.invested += i.amount; acc.set(fund.id, e);
            c.priced++;
        }
        covered.set(i.investment_target_id, c);
    }
    const positions: Position[] = [];
    for (const [fundId, e] of acc) {
        const s = series.get(fundId) ?? [];
        const last = s[s.length - 1];
        if (!last) continue;
        const value = round(e.units * last.nav, 2);
        positions.push({
            fundId, targetId: e.fund.investment_target_id, name: e.fund.name, units: round(e.units, 4), invested: round(e.invested, 2), averagePrice: round(e.invested / e.units, 4),
            latestNav: last.nav, asOf: last.date, stale: isStale(e.fund.frequency, last.date), value, gain: round(value - e.invested, 2), gainPct: round(((value - e.invested) / e.invested) * 100, 2),
        });
    }
    // A company counts as fully priced only when every investment with it was matched to a fund and a price.
    for (const [t, c] of covered) if (c.all > 0 && c.priced === c.all) unmatchedTargets.delete(t);
    return { positions, unmatchedTargets };
}

export const fundPriceService = { listFunds, getSeries, myFunds, saveFund, addPrices, deletePrice, positionsFor };
