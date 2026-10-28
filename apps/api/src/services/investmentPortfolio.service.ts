/**
 * investmentPortfolio.service.ts — what a person has invested with each company, and what it is worth now.
 *
 * "Invested" is the confirmed money put in (investments.amount_received). MoneyWise has no live price feed from the investment
 * companies, so the current value is the latest value the person (or their accountant) recorded for that company, plus anything
 * put in since. With no value recorded the holding is shown as unchanged (value = invested, 0%) and flagged `valued: false`, so the
 * app can say the value hasn't been updated rather than pretend it knows.
 */
import { supabase } from '../lib/supabase';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

export class PortfolioError extends Error { constructor(message: string, public httpStatus = 400) { super(message); } }

export interface Holding {
    targetId: string;
    name: string;
    logoUrl: string | null;
    invested: number;
    currentValue: number;
    gain: number;
    gainPct: number;
    valued: boolean;
    valuedAt: string | null;
}

export interface InvestmentRow { investment_target_id: string; amount: number; at: string }
export interface ValuationRow { investment_target_id: string; value: number; created_at: string }

/** Pure: turns confirmed investments + recorded values into holdings. Newest valuation wins; later deposits add on top of it. */
export function buildHoldings(
    investments: InvestmentRow[],
    valuations: ValuationRow[],
    targets: Map<string, { name: string; logoUrl: string | null }>,
): Holding[] {
    const byTarget = new Map<string, InvestmentRow[]>();
    for (const i of investments) byTarget.set(i.investment_target_id, [...(byTarget.get(i.investment_target_id) ?? []), i]);

    const holdings: Holding[] = [];
    for (const [targetId, rows] of byTarget) {
        const invested = round2(rows.reduce((s, r) => s + Number(r.amount || 0), 0));
        if (!(invested > 0)) continue;
        const latest = valuations
            .filter((v) => v.investment_target_id === targetId)
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        let currentValue = invested;
        if (latest) {
            const since = rows.filter((r) => String(r.at) > String(latest.created_at)).reduce((s, r) => s + Number(r.amount || 0), 0);
            currentValue = round2(Number(latest.value) + since);
        }
        const gain = round2(currentValue - invested);
        const t = targets.get(targetId);
        holdings.push({
            targetId, name: t?.name ?? 'Investment', logoUrl: t?.logoUrl ?? null,
            invested, currentValue, gain, gainPct: round2((gain / invested) * 100),
            valued: !!latest, valuedAt: latest?.created_at ?? null,
        });
    }
    return holdings.sort((a, b) => b.currentValue - a.currentValue);
}

export async function getPortfolio(orgId: string) {
    const { data: inv } = await supabase.from('investments')
        .select('investment_target_id, amount_received, amount_paid, confirmed_at, created_at')
        .eq('investor_organization_id', orgId).eq('status', 'CONFIRMED');
    const rows: InvestmentRow[] = (inv ?? []).map((i: any) => ({
        investment_target_id: i.investment_target_id, amount: Number(i.amount_received ?? i.amount_paid ?? 0), at: i.confirmed_at ?? i.created_at,
    }));
    const ids = [...new Set(rows.map((r) => r.investment_target_id))];
    if (ids.length === 0) return { holdings: [] as Holding[], totals: { invested: 0, currentValue: 0, gain: 0, gainPct: 0 } };

    const [{ data: ts }, { data: vs }] = await Promise.all([
        supabase.from('investment_targets').select('id, display_name, logo_url, organizations(logo_url)').in('id', ids),
        supabase.from('investment_valuations').select('investment_target_id, value, created_at').eq('investor_organization_id', orgId).in('investment_target_id', ids),
    ]);
    const targets = new Map<string, { name: string; logoUrl: string | null }>((ts ?? []).map((t: any) => {
        const org = Array.isArray(t.organizations) ? t.organizations[0] : t.organizations;
        return [t.id, { name: t.display_name, logoUrl: t.logo_url || org?.logo_url || null }];
    }));
    const holdings = buildHoldings(rows, (vs ?? []) as ValuationRow[], targets);
    const invested = round2(holdings.reduce((s, h) => s + h.invested, 0));
    const currentValue = round2(holdings.reduce((s, h) => s + h.currentValue, 0));
    const gain = round2(currentValue - invested);
    return { holdings, totals: { invested, currentValue, gain, gainPct: invested > 0 ? round2((gain / invested) * 100) : 0 } };
}

/** Records what an investment is worth now. Only for companies the organization has actually invested in. */
export async function setValue(orgId: string, userId: string, targetId: string, value: unknown): Promise<Holding> {
    const v = round2(Number(value));
    if (!Number.isFinite(v) || v < 0 || v > 1_000_000_000_000) throw new PortfolioError('Enter what the investment is worth today, in kwacha.');
    const before = await getPortfolio(orgId);
    if (!before.holdings.some((h) => h.targetId === targetId)) throw new PortfolioError("You haven't invested with this company.", 404);
    const { error } = await supabase.from('investment_valuations').insert({ investor_organization_id: orgId, investment_target_id: targetId, value: v, recorded_by: userId });
    if (error) throw new Error(error.message);
    const after = await getPortfolio(orgId);
    return after.holdings.find((h) => h.targetId === targetId)!;
}

export const investmentPortfolioService = { getPortfolio, setValue };
