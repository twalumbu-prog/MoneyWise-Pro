import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson, investmentService } from 'core';
import { buildInvestProviders, type InvestProduct, type InvestProductType, type InvestProvider, type InvestRisk } from '../data/investCatalog';

/** A fund with real prices, as the API reports it: what the company sent, not a formula. */
export interface RealFund {
    id: string; targetId: string; providerKey: string | null; company: string | null; name: string; kind: string; currency: string; frequency: string;
    minDeposit: number | null; risk: string | null; description: string | null;
    latest: { date: string; nav: number } | null; points: number; stale: boolean; demo?: boolean;
    yields?: { m3: number | null; m6: number | null; m12: number | null; asOf: string } | null;
    change: { d1: number | null; w1: number | null; m1: number | null; m3: number | null; ytd: number | null };
}

const KIND_TO_TYPE: Record<string, InvestProductType> = { UNIT_TRUST: 'UNIT_TRUST', MONEY_MARKET: 'UNIT_TRUST', BOND: 'BOND', FIXED_DEPOSIT: 'FIXED_DEPOSIT', OTHER: 'UNIT_TRUST' };
const fmtNav = (nav: number) => `K${nav.toFixed(nav < 10 ? 4 : 2)}`;
const pct = (n: number | null | undefined) => (n == null ? '–' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`);
const prettyDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const risk = (r: string | null): InvestRisk => (/low/i.test(r ?? '') ? 'Low' : /high/i.test(r ?? '') ? 'High' : 'Medium');

/** One real fund, in the shape the Invest screens already show. Nothing is made up: no price means it says so. */
export function fundToProduct(f: RealFund, companyName: string): InvestProduct {
    const change = f.change?.ytd ?? f.yields?.m12 ?? f.change?.m3 ?? f.change?.m1 ?? null;
    return {
        id: f.id,
        name: f.name,
        code: f.company || companyName,
        type: KIND_TO_TYPE[f.kind] ?? 'UNIT_TRUST',
        price: f.latest ? fmtNav(f.latest.nav) : 'No price yet',
        priceUnit: '/unit',
        ytd: f.demo ? 'Demo prices' : f.change?.ytd != null ? `${pct(f.change.ytd)} YTD` : f.yields?.m12 != null ? `${pct(f.yields.m12)} 12M` : f.latest ? 'Since first price' : 'No prices sent yet',
        performance: f.latest ? `${fmtNav(f.latest.nav)} (${pct(change)})` : 'Awaiting prices',
        lastUpdated: f.latest ? prettyDate(f.latest.date) : 'never',
        reviews: '',
        investors: '',
        description: f.description || '',
        expectedReturn: f.yields?.m12 != null ? `${pct(f.yields.m12)} over 12 months` : '—',
        risk: risk(f.risk),
    };
}

/**
 * The companies and funds shown in Invest: only what companies have really sent, the same as the web. A company with no funds listed is left
 * out, and with none at all the page says so; there are no sample funds, prices or counts anywhere. Real investment targets (see
 * apps/api/src/controllers/invest.controller.ts) still carry the company's account, so funding a fund moves real money to the right place.
 */
export function useInvestProviders(): InvestProvider[] {
    const targets = useQuery({ queryKey: ['investment-targets'], queryFn: () => investmentService.getTargets(), staleTime: 60_000 });
    const funds = useQuery({ queryKey: ['invest', 'funds'], queryFn: () => apiJson<{ funds: RealFund[] }>('/investments/funds'), staleTime: 60_000, retry: false });

    return useMemo(() => {
        const all = funds.data?.funds ?? [];
        return buildInvestProviders(targets.data || [])
            .map((p) => ({
                ...p,
                products: all
                    .filter((f) => f.providerKey === p.id || (!!p.investmentTargetId && f.targetId === p.investmentTargetId))
                    .map((f) => fundToProduct(f, p.name)),
            }))
            .filter((p) => p.products.length > 0);
    }, [targets.data, funds.data]);
}
