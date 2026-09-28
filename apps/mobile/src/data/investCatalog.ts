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
}

/**
 * Turns a real investment_targets row (see apps/api/src/controllers/invest.controller.ts)
 * into the same InvestProvider/InvestProduct shape the rest of the Invest UI
 * already renders, so real and demo providers can share one list. There's
 * only ever one generic "product" per real target today — a direct deposit
 * into that organization's wallet, not a fund with its own NAV/performance.
 */
export function toRealInvestProvider(target: {
    id: string; organizationId: string; walletId: string;
    displayName: string; category: string | null; description: string | null; logoUrl: string | null;
}): InvestProvider {
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
        products: [{
            id: `real-${target.id}-direct`,
            name: 'Direct Investment',
            code: target.displayName,
            type: 'FIXED_DEPOSIT',
            price: 'K1.0',
            priceUnit: '/deposit',
            ytd: '0% YTD',
            performance: 'Direct deposit',
            lastUpdated: 'now',
            reviews: 'New',
            investors: '—',
            description: target.description || `Fund ${target.displayName}'s MoneyWise account directly via mobile money or an internal wallet transfer.`,
            expectedReturn: 'Market-linked',
            risk: 'Medium',
        }],
    };
}

/**
 * Unified catalog matching web's demo data (InvestHome.tsx + MobileInvestWizard.tsx,
 * which each hold their own slightly-differing copy of the same products).
 * There is no backend behind this — apps/web/src/pages/invest/* is a pure UI
 * showcase, confirmed by grepping for API calls (there are none). Kept as one
 * source here instead of two, and porting the numbers verbatim so amounts
 * quoted in the app match the desktop screens exactly.
 */
export const INVEST_PROVIDERS: InvestProvider[] = [
    {
        id: 'longhorn',
        name: 'Longhorn Investment Associates',
        description: 'High-yield equity funds and diversified capital portfolios.',
        logo: 'longhorn',
        reviews: '4.9 (320 Reviews)',
        investors: '232k Investors',
        products: [
            {
                id: 'lh-1', name: 'Premium FX Fund', code: 'Longhorn Inv Ltd. (LH-FX)',
                type: 'UNIT_TRUST', price: 'K25,502.0', priceUnit: '/unit', ytd: '34% YTD',
                performance: 'K25,502 (34%)', lastUpdated: 'today',
                reviews: '4.9 (320 Reviews)', investors: '232,000',
                description: 'A premium foreign-exchange linked fund targeting high-growth currency markets. Actively managed by seasoned portfolio specialists for maximum returns.',
                expectedReturn: '30-34%', risk: 'Medium', isNew: true, trending: true,
            },
            {
                id: 'lh-2', name: 'Equity Growth Fund', code: 'Longhorn Inv Ltd. (LH-EQ)',
                type: 'FIXED_DEPOSIT', price: 'K15,200.0', priceUnit: '/unit', ytd: '21% YTD',
                performance: '21% APR', lastUpdated: 'today',
                reviews: '4.8 (210 Reviews)', investors: '85,000',
                description: 'A diversified equity fund investing in top-performing regional and pan-African stocks for long-term capital appreciation.',
                expectedReturn: '18-21%', risk: 'Medium',
            },
            {
                id: 'lh-3', name: 'Mixed Capital Fund', code: 'Longhorn Inv Ltd. (LH-MC)',
                type: 'BOND', price: 'K8,400.0', priceUnit: '/unit', ytd: '12% YTD',
                performance: 'K8,400 (12%)', lastUpdated: 'today',
                reviews: '4.7 (140 Reviews)', investors: '41,000',
                description: 'A balanced blend of equities, bonds and money-market instruments designed for steady, lower-volatility growth.',
                expectedReturn: '10-12%', risk: 'Low', trending: true,
            },
        ],
    },
    {
        id: 'hobbiton',
        name: 'Hobbiton Investments',
        description: 'Real estate trusts, agri-business and infrastructure funds.',
        logo: 'hobbiton',
        reviews: '4.8 (150 Reviews)',
        investors: '85k Investors',
        products: [
            {
                id: 'hb-1', name: 'Real Estate Trust', code: 'Hobbiton Inv. (HB-RE)',
                type: 'UNIT_TRUST', price: 'K55,000.0', priceUnit: '/unit', ytd: '18% YTD',
                performance: 'K55,000 (18%)', lastUpdated: 'today',
                reviews: '4.8 (150 Reviews)', investors: '85,000',
                description: 'A real-estate investment trust (REIT) holding commercial and residential properties across Zambia, distributing quarterly rental income.',
                expectedReturn: '16-18%', risk: 'Low', trending: true,
            },
            {
                id: 'hb-2', name: 'Agri-Business Fund', code: 'Hobbiton Inv. (HB-AG)',
                type: 'FIXED_DEPOSIT', price: 'K12,300.0', priceUnit: '/min. deposit', ytd: '42% YTD',
                performance: '42% APR', lastUpdated: 'today',
                reviews: '4.9 (88 Reviews)', investors: '120,000',
                description: "Invests in high-yield agricultural enterprises — crop farming, livestock and agri-processing — capitalising on Zambia's fertile land belt.",
                expectedReturn: '38-42%', risk: 'High', isNew: true,
            },
            {
                id: 'hb-3', name: 'Infrastructure Bond', code: 'Hobbiton Inv. (HB-IB)',
                type: 'BOND', price: 'K9,800.0', priceUnit: '/min. deposit', ytd: '15% YTD',
                performance: 'K9,800 (15%)', lastUpdated: 'today',
                reviews: '4.6 (62 Reviews)', investors: '41,000',
                description: 'Government-backed infrastructure bonds financing roads, energy and water projects with guaranteed coupon payments.',
                expectedReturn: '13-15%', risk: 'Low',
            },
        ],
    },
    {
        id: 'aflife',
        name: 'Aflife Investments',
        description: 'Life savings plans, education trusts and balanced growth funds.',
        logo: 'aflife',
        reviews: '4.7 (98 Reviews)',
        investors: '41k Investors',
        products: [
            {
                id: 'af-1', name: 'Life Savings Plan', code: 'Aflife Inv. (AF-LSP)',
                type: 'UNIT_TRUST', price: 'K5,000.0', priceUnit: '/min. deposit', ytd: '11% YTD',
                performance: 'K5,000 (11%)', lastUpdated: 'today',
                reviews: '4.7 (98 Reviews)', investors: '41,000',
                description: 'A long-term life-linked savings plan providing guaranteed growth plus life-cover benefits, ideal for retirement planning.',
                expectedReturn: '9-11%', risk: 'Low',
            },
            {
                id: 'af-2', name: 'Education Trust Fund', code: 'Aflife Inv. (AF-ETF)',
                type: 'FIXED_DEPOSIT', price: 'K7,500.0', priceUnit: '/min. deposit', ytd: '14% YTD',
                performance: '14% APR', lastUpdated: 'today',
                reviews: '4.8 (75 Reviews)', investors: '32,000',
                description: 'A dedicated trust fund accumulating education savings with tax-advantaged growth, payable at school-entry milestones.',
                expectedReturn: '12-14%', risk: 'Low', trending: true,
            },
            {
                id: 'af-3', name: 'Balanced Growth Fund', code: 'Aflife Inv. (AF-BGF)',
                type: 'BOND', price: 'K10,200.0', priceUnit: '/unit', ytd: '19% YTD',
                performance: 'K10,200 (19%)', lastUpdated: 'today',
                reviews: '4.7 (112 Reviews)', investors: '28,000',
                description: 'A medium-term balanced fund blending fixed-income securities with select equities for consistent, inflation-beating growth.',
                expectedReturn: '16-19%', risk: 'Medium',
            },
        ],
    },
    {
        id: 'abc',
        name: 'ABC Asset Management',
        description: 'Money market, government bonds and diversified equity solutions.',
        logo: 'abc',
        reviews: '4.6 (212 Reviews)',
        investors: '120k Investors',
        products: [
            {
                id: 'abc-1', name: 'Money Market Fund', code: 'ABC Asset Mgmt. (ABC-MM)',
                type: 'UNIT_TRUST', price: 'K3,200.0', priceUnit: '/unit', ytd: '9% YTD',
                performance: 'K3,200 (9%)', lastUpdated: 'today',
                reviews: '4.6 (212 Reviews)', investors: '120,000',
                description: 'A highly liquid money-market fund investing in short-term government securities and bank instruments for capital preservation.',
                expectedReturn: '8-9%', risk: 'Low',
            },
            {
                id: 'abc-2', name: 'Government Bond Fund', code: 'ABC Asset Mgmt. (ABC-GB)',
                type: 'BOND', price: 'K18,750.0', priceUnit: '/min. deposit', ytd: '16% YTD',
                performance: 'K18,750 (16%)', lastUpdated: 'today',
                reviews: '4.7 (165 Reviews)', investors: '95,000', isNew: true,
                description: 'Invests exclusively in Zambian government treasury bills and bonds, providing secure and predictable coupon income.',
                expectedReturn: '14-16%', risk: 'Low',
            },
            {
                id: 'abc-3', name: 'Diversified Equity', code: 'ABC Asset Mgmt. (ABC-DE)',
                type: 'FIXED_DEPOSIT', price: 'K22,400.0', priceUnit: '/unit', ytd: '28% YTD',
                performance: '28% APR', lastUpdated: 'today',
                reviews: '4.8 (190 Reviews)', investors: '75,000', trending: true,
                description: 'A multi-sector equity portfolio spanning financial, consumer, energy and technology sectors across sub-Saharan Africa.',
                expectedReturn: '24-28%', risk: 'Medium',
            },
        ],
    },
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
