import { supabase } from '../lib/supabase';

/**
 * Reads the fund data Longhorn Associates publishes on its own website, so Longhorn's funds on MoneyWise carry its real prices without anyone
 * typing them in. The website gets this from three public pages of its technology provider; MoneyWise reads only those three, once a day,
 * and says who it is in the request. Each price is stored with the date Longhorn gives it and the source WEBSITE, so what investors see can
 * always be traced back. Longhorn can replace this at any time by sending prices itself on the Fund prices page.
 */

const BASE = 'https://onboarding.quantwavesystems.com';
const HEADERS = { 'User-Agent': 'MoneyWise/1.0 (reads the fund prices Longhorn Associates publishes)', Accept: 'application/json' };
const DAY = 86_400_000;

async function getJson(path: string): Promise<any> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20_000);
    try {
        const res = await fetch(`${BASE}${path}`, { headers: HEADERS, signal: ctl.signal });
        if (!res.ok) throw new Error(`${path} answered ${res.status}`);
        const j: any = await res.json();
        return Array.isArray(j) ? j : j?.results ?? [];
    } finally { clearTimeout(timer); }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const FREQ: Record<string, string> = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', quarterly: 'QUARTERLY' };
const money = (v: unknown) => (Number(v) >= 0 && v !== null && v !== '' ? `${Number(v)}%` : null);

/** The facts Longhorn publishes for a fund, in a few plain lines. */
function describe(f: any): string | null {
    const assets: { name: string; text: string }[] = (Array.isArray(f.asset_types) ? f.asset_types : [])
        .map((a: any) => ({ name: String(a.asset_type_name ?? '').trim(), text: String(a.asset_type_description ?? '').trim().replace(/\s+/g, ' ') }))
        .filter((a: { name: string }) => a.name);
    const lines = [
        f.fund_manager && `Managed by ${f.fund_manager}.`,
        f.trustee && `Trustee: ${f.trustee}.${f.custodian ? ` Custodian: ${f.custodian}.` : ''}`,
        f.regulator_name && `Regulated by the ${f.regulator_name}.`,
        f.minimum_investment_amount && `Minimum investment K${Number(f.minimum_investment_amount)}${f.minimum_investment_period ? ` for ${f.minimum_investment_period}` : ''}.`,
        f.annual_management_fee != null && `Fees: annual management ${money(f.annual_management_fee)}${f.initial_fee != null ? `, initial ${money(f.initial_fee)}` : ''}${f.withdrawal_fee != null ? `, withdrawal ${money(f.withdrawal_fee)}` : ''}${f.early_withdrawal_fee != null ? `, early withdrawal ${money(f.early_withdrawal_fee)}` : ''}.`,
        (f.valuation_frequency || f.pricing_frequency) && `Valued ${String(f.valuation_frequency ?? f.pricing_frequency).toLowerCase()}, priced ${String(f.pricing_frequency ?? f.valuation_frequency).toLowerCase()}.`,
        f.income_distribution_policy && `Income is ${String(f.income_distribution_policy).toLowerCase()}.`,
        assets.length > 0 && `Invests in: ${assets.map((a) => a.name).join(', ')}.`,
        ...assets.filter((a) => a.text).map((a) => `${a.name}: ${a.text.length > 200 ? `${a.text.slice(0, 197)}…` : a.text}`),
    ].filter(Boolean) as string[];
    return lines.length ? lines.join('\n') : null;
}

export async function pullLonghorn(): Promise<{ funds: number; prices: number; asOf: string | null; skipped?: string }> {
    const { data: target } = await supabase.from('investment_targets').select('id').eq('provider_key', 'longhorn').maybeSingle();
    if (!target) return { funds: 0, prices: 0, asOf: null, skipped: 'Longhorn is not set up as an investment company' };

    const [performance, facts] = await Promise.all([getJson('/api/fund-performance/'), getJson('/api/fund-facts/').catch(() => [] as any[])]);
    const factsByName = new Map<string, any>((facts as any[]).map((f) => [String(f.fund_name ?? f.fund).trim().toLowerCase(), f]));
    const today = new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);

    let funds = 0, prices = 0, asOf: string | null = null;
    for (const row of performance as any[]) {
        const name = String(row.fund ?? '').trim();
        const nav = Number(row.price);
        const date = String(row.date ?? '').slice(0, 10);
        if (!name || !(nav > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) continue;

        const f = factsByName.get(name.toLowerCase());
        const fundRow: any = {
            investment_target_id: target.id, key: slug(name), name, kind: /bond/i.test(name) ? 'BOND' : 'UNIT_TRUST', currency: 'ZMW', is_active: true,
            frequency: FREQ[String(f?.pricing_frequency ?? '').toLowerCase()] ?? 'DAILY',
            ...(f?.minimum_investment_amount ? { min_deposit: Number(f.minimum_investment_amount) } : {}),
            ...(f?.risk_profile ? { risk: String(f.risk_profile).slice(0, 40) } : {}),
            ...(f ? { description: describe(f) } : {}),
        };
        const { data: fund, error } = await supabase.from('fund_products').upsert(fundRow, { onConflict: 'investment_target_id,key' }).select('id').single();
        if (error || !fund) { console.error('[Funds] could not save fund', name, error?.message); continue; }
        funds++;

        // The yields Longhorn reports go with the price they were reported for.
        const yields = { m3: row.averageYieldThreeMonths ?? null, m6: row.averageYieldSixMonths ?? null, m12: row.averageYieldTwelveMonths ?? null };
        const { error: pe } = await supabase.from('fund_prices').upsert({ fund_id: fund.id, as_of: date, nav, source: 'WEBSITE', note: JSON.stringify({ yields }) }, { onConflict: 'fund_id,as_of' });
        if (pe) { console.error('[Funds] could not save price', name, pe.message); continue; }
        prices++;
        if (!asOf || date > asOf) asOf = date;
    }
    return { funds, prices, asOf };
}

let started = false;
/** Reads Longhorn's published prices shortly after the API starts, then every 6 hours (a new price is published once a day). */
export function startFundFeeds(): void {
    if (started || process.env.FUND_FEEDS_DISABLED === 'true') return;
    started = true;
    const run = async () => {
        try { const r = await pullLonghorn(); if (r.funds || r.skipped) console.log(`[Funds] Longhorn: ${r.skipped ?? `${r.funds} funds, ${r.prices} prices, as of ${r.asOf}`}`); }
        catch (e: any) { console.error('[Funds] Longhorn pull failed:', e?.message ?? e); }
        setTimeout(run, 6 * 3_600_000).unref?.();
    };
    setTimeout(run, 45_000).unref?.();
    void DAY;
}
