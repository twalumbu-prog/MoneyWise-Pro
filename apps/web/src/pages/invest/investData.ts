import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from 'core';
import { INVEST_PROVIDERS } from './InvestHome';
import type { InvestProduct, InvestProvider, ProductType } from './InvestHome';
import type { PricePoint, Timeframe } from './investChartData';

/** A fund with real prices, as the API reports it: what the company sent, not a formula. */
export interface RealFund {
    id: string; targetId: string; providerKey: string | null; company: string | null; name: string; kind: string; currency: string; frequency: string;
    minDeposit: number | null; risk: string | null; description: string | null;
    latest: { date: string; nav: number } | null; points: number; stale: boolean; yields?: Yields | null; demo?: boolean;
    change: { d1: number | null; w1: number | null; m1: number | null; m3: number | null; ytd: number | null };
}
export interface Yields { m3: number | null; m6: number | null; m12: number | null; asOf: string }
export interface FundSeries { demo?: boolean; company?: { name: string | null; factSheetUrl: string | null }; facts?: { description?: string | null } | null; yields?: Yields | null; fund: { id: string; name: string; kind: string; currency: string; frequency: string }; points: { date: string; nav: number }[]; latest: { date: string; nav: number } | null; stale: boolean; change: RealFund['change'] }

const KIND_TO_TYPE: Record<string, ProductType> = { UNIT_TRUST: 'UNIT_TRUST', MONEY_MARKET: 'UNIT_TRUST', BOND: 'BOND', FIXED_DEPOSIT: 'FIXED_DEPOSIT', OTHER: 'UNIT_TRUST' };
export const fmtNav = (nav: number) => `K${nav.toFixed(nav < 10 ? 4 : 2)}`;
export const pct = (n: number | null) => (n == null ? '–' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`);
export const prettyDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const toProduct = (f: RealFund): InvestProduct => ({
    id: f.id, fundId: f.id, name: f.name, price: f.latest ? fmtNav(f.latest.nav) : 'No price yet',
    ytd: f.demo ? 'Demo prices' : f.change.ytd != null ? `${pct(f.change.ytd)} YTD` : f.yields?.m12 != null ? `${pct(f.yields.m12)} 12M` : f.latest ? 'Since first price' : 'No prices sent yet',
    type: KIND_TO_TYPE[f.kind] ?? 'UNIT_TRUST', performance: f.latest ? `${fmtNav(f.latest.nav)} (${pct(f.change.ytd ?? f.yields?.m12 ?? f.change.m3 ?? f.change.m1)})` : 'Awaiting prices',
    lastUpdated: f.latest ? prettyDate(f.latest.date) : 'never', productInvestors: '', sample: !!f.demo,
});

/**
 * The companies and funds shown in Invest: only what companies have really sent. A company with no funds listed is left out, and with none at
 * all the page says so; there are no sample funds, prices or counts anywhere.
 */
export function useInvestProviders(): { providers: InvestProvider[]; funds: RealFund[]; loading: boolean } {
    const q = useQuery({ queryKey: ['invest', 'funds'], queryFn: () => apiJson<{ funds: RealFund[] }>('/investments/funds'), staleTime: 60_000, retry: false });
    const funds = q.data?.funds ?? [];
    const providers = useMemo(() => INVEST_PROVIDERS.map((p) => ({ ...p, products: funds.filter((f) => f.providerKey === p.id).map(toProduct) })).filter((p) => p.products.length > 0 || p.demo), [funds]);
    return { providers, funds, loading: q.isPending };
}

/** The real prices that fall inside a timeframe, as chart points. Fewer than two means there's nothing honest to draw for that period. */
export function realPoints(points: { date: string; nav: number }[], tf: Timeframe): PricePoint[] {
    if (!points.length) return [];
    const last = points[points.length - 1];
    const lt = Date.parse(`${last.date}T00:00:00Z`);
    const DAY = 86_400_000;
    let from: string;
    if (tf === '1D') from = points[Math.max(0, points.length - 2)].date;
    else if (tf === '1W') from = new Date(lt - 7 * DAY).toISOString().slice(0, 10);
    else if (tf === '1M') from = new Date(lt - 30 * DAY).toISOString().slice(0, 10);
    else if (tf === '3M') from = new Date(lt - 91 * DAY).toISOString().slice(0, 10);
    else from = `${last.date.slice(0, 4)}-01-01`;
    // Start from the last price on or before the start date, so the line covers the whole period.
    let startIdx = points.findIndex((p) => p.date >= from);
    if (startIdx < 0) startIdx = points.length - 1;
    if (startIdx > 0 && points[startIdx].date > from) startIdx -= 1;
    return points.slice(startIdx).map((p) => ({ t: Date.parse(`${p.date}T00:00:00Z`), price: p.nav }));
}

export const useFundSeries = (fundId: string | null | undefined) => useQuery({
    queryKey: ['invest', 'series', fundId], enabled: !!fundId, staleTime: 60_000, retry: false,
    queryFn: () => apiJson<FundSeries>(`/investments/funds/${fundId}/series`),
});
