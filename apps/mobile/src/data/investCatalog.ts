export type InvestProductType = 'UNIT_TRUST' | 'FIXED_DEPOSIT' | 'BOND';
export type InvestRisk = 'Low' | 'Medium' | 'High';

export interface InvestProduct {
    id: string;
    name: string;
    code: string;
    type: InvestProductType;
    price: string;
    priceUnit: string;
    ytd: string;
    performance: string;
    lastUpdated: string;
    reviews: string;
    investors: string;
    description: string;
    expectedReturn: string;
    risk: InvestRisk;
    isNew?: boolean;
    trending?: boolean;
}

export interface InvestProvider {
    id: string;
    name: string;
    description: string;
    logo: string;
    reviews: string;
    investors: string;
    products: InvestProduct[];
    /** Set for a real (non-demo) provider — funding it moves real money. */
    isReal?: boolean;
    organizationId?: string;
    walletId?: string;
    investmentTargetId?: string;
    /** False when the company has no account to invest into yet (set from the target). */
    requiresAccount?: boolean;
    /** Names for the application form's "Sales Person" picker. */
    salesPeople?: string[];
    /** Linked from the company's "fund fact sheet", shown in the declaration. */
    factSheetUrl?: string | null;
}

/**
 * Turns a real investment_targets row (see apps/api/src/controllers/invest.controller.ts)
 * into the same InvestProvider/InvestProduct shape the rest of the Invest UI
 * already renders, so real and demo providers can share one list. There's
 * only ever one generic "product" per real target today — a direct deposit
 * into that organization's wallet, not a fund with its own NAV/performance.
 */
type RealTarget = {
    id: string; organizationId: string; walletId: string;
    displayName: string; category: string | null; description: string | null; logoUrl: string | null;
    providerKey?: string | null; requiresAccount?: boolean; salesPeople?: string[]; factSheetUrl?: string | null;
};

/**
 * Real targets first. A target linked (providerKey) to a catalog provider takes over
 * that provider's entry — same products and branding, but funding it now moves real
 * money into the company's own MoneyWise wallet. Catalog providers with no company
 * behind them stay listed but can't be invested in yet (isReal is false).
 */
export function buildInvestProviders(targets: RealTarget[]): InvestProvider[] {
    const linked = new Set<string>();
    const real = targets.map((t) => {
        const demo = t.providerKey ? INVEST_PROVIDERS.find((p) => p.id === t.providerKey) : undefined;
        if (!demo) return toRealInvestProvider(t);
        linked.add(demo.id);
        return {
            ...demo,
            logo: t.logoUrl || demo.logo,
            isReal: true,
            organizationId: t.organizationId,
            walletId: t.walletId,
            investmentTargetId: t.id,
            requiresAccount: t.requiresAccount !== false,
            salesPeople: t.salesPeople ?? [],
            factSheetUrl: t.factSheetUrl ?? null,
        } as InvestProvider;
    });
    return [...real, ...INVEST_PROVIDERS.filter((p) => !linked.has(p.id))];
}

export function toRealInvestProvider(target: RealTarget): InvestProvider {
    return {
        id: `real-${target.id}`,
        name: target.displayName,
        description: target.description || target.category || 'Deposit directly into this organization\'s MoneyWise account.',
        logo: target.logoUrl || 'default',
        reviews: '',
        investors: '',
        isReal: true,
        organizationId: target.organizationId,
        walletId: target.walletId,
        investmentTargetId: target.id,
        requiresAccount: target.requiresAccount !== false,
        salesPeople: target.salesPeople ?? [],
        factSheetUrl: target.factSheetUrl ?? null,
        products: [],
    };
}

/**
 * The investment companies MoneyWise knows about: only their name, logo and a line about them. Their funds, prices and returns are never
 * written here. They come from the prices each company really sends (see useInvestProviders), so nothing on screen is invented, as on the web.
 */
export const INVEST_PROVIDERS: InvestProvider[] = [
    { id: 'longhorn', name: 'Longhorn Investment Associates', description: 'High-yield equity funds and diversified capital portfolios.', logo: 'longhorn', reviews: '', investors: '', products: [] },
    { id: 'hobbiton', name: 'Hobbiton Investments', description: 'Real estate trusts, agri-business and infrastructure funds.', logo: 'hobbiton', reviews: '', investors: '', products: [] },
    { id: 'aflife', name: 'Aflife Investments', description: 'Life savings plans, education trusts and balanced growth funds.', logo: 'aflife', reviews: '', investors: '', products: [] },
    { id: 'abc', name: 'ABC Asset Management', description: 'Money market, government bonds and diversified equity solutions.', logo: 'abc', reviews: '', investors: '', products: [] },
];

export function findProduct(
    productId: string,
    providers: InvestProvider[] = INVEST_PROVIDERS,
): { provider: InvestProvider; product: InvestProduct } | null {
    for (const provider of providers) {
        const product = provider.products.find((p) => p.id === productId);
        if (product) return { provider, product };
    }
    return null;
}

export const TYPE_CONFIG: Record<InvestProductType, { dot: string; label: string }> = {
    UNIT_TRUST: { dot: '#2563EB', label: 'Unit Trust' },
    FIXED_DEPOSIT: { dot: '#F472B6', label: 'Fixed Deposit' },
    BOND: { dot: '#A855F7', label: 'Bond' },
};
