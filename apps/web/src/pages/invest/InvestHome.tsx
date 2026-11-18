import React, { useState } from 'react';
import { Layout } from '../../components/Layout';
import { Link } from 'react-router-dom';
import { Search, ChevronRight } from 'lucide-react';
import { SegmentedControl, AnimatedTabContent } from '../../components/AnimatedTabs';
import { useInvestProviders } from './investData';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from 'core';

// ── Types ─────────────────────────────────────────────────────────────────────
export type ProductType = 'UNIT_TRUST' | 'FIXED_DEPOSIT' | 'BOND';
type InvestTab = 'HOME' | 'TRENDING' | 'UNIT_TRUSTS';

export interface InvestProduct {
    id: string;
    name: string;
    // Desktop legacy fields
    price: string;
    ytd: string;
    // Mobile fields
    type: ProductType;
    performance: string;
    lastUpdated: string;
    productInvestors: string;
    isNew?: boolean;
    trending?: boolean;
    /** Invented figures, shown until the company sends real prices. */
    sample?: boolean;
    /** Set for a fund whose prices come from the company. */
    fundId?: string;
}

export interface InvestProvider {
    id: string;
    name: string;
    logo: string;
    route: string;
    reviews: string;
    investors: string;
    products: InvestProduct[];
    /** A firm set up to try the platform with: shown even before it has funds, and labelled so. */
    demo?: boolean;
}

export const TYPE_CONFIG: Record<ProductType, { dot: string; label: string }> = {
    UNIT_TRUST:    { dot: 'bg-blue-600',   label: 'Unit Trust'    },
    FIXED_DEPOSIT: { dot: 'bg-pink-400',   label: 'Fixed Deposit' },
    BOND:          { dot: 'bg-purple-500', label: 'Bond'          },
};

// ── Provider data ─────────────────────────────────────────────────────────────
/**
 * The investment companies MoneyWise knows about: only their name, logo and page. Their funds, prices and returns are never written here; they
 * come from the prices each company sends (see investData.ts), so nothing on screen is invented.
 */
export const INVEST_PROVIDERS: InvestProvider[] = [
    { id: 'longhorn', name: 'Longhorn Investment Associates', logo: '/invest-logos/longhorn.jpeg', route: '/invest/company/longhorn', reviews: '', investors: '', products: [] },
    { id: 'hobbiton', name: 'Hobbiton Investments', logo: '/invest-logos/hobbiton.png', route: '/invest/company/hobbiton', reviews: '', investors: '', products: [] },
    { id: 'aflife', name: 'Aflife Investments', logo: '/invest-logos/aflife.png', route: '/invest/company/aflife', reviews: '', investors: '', products: [] },
    { id: 'kapstone', name: 'Kapstone Capital', logo: 'https://ahatvfmvhecakpxtpnay.supabase.co/storage/v1/object/public/organization-logos/0dfe477d-2ee3-4d2b-a20f-f5c3a751d951/logo-1790775832178.jpg', route: '/invest/company/kapstone', reviews: '', investors: '', products: [], demo: true },
    { id: 'abc', name: 'ABC Asset Management', logo: '/invest-logos/abc.jpeg', route: '/invest/company/abc', reviews: '', investors: '', products: [] },
];

// ── InvestHome ────────────────────────────────────────────────────────────────
export const InvestHome: React.FC = () => {
    const [search, setSearch]         = useState('');
    const [activeTab, setActiveTab]   = useState<InvestTab>('HOME');
    const TAB_ORDER: InvestTab[]      = ['HOME', 'TRENDING', 'UNIT_TRUSTS'];
    const activeTabIndex              = TAB_ORDER.indexOf(activeTab);

    // Filter products per tab and search
    const { providers: allProviders } = useInvestProviders();
    const myCompany = useQuery({ queryKey: ['invest', 'funds', 'mine'], queryFn: () => apiJson<{ isTarget: boolean }>('/investments/funds/mine'), retry: false, staleTime: 5 * 60_000 });
    const mobileProviders = allProviders.flatMap(provider => {
        let products = provider.products;

        if (activeTab === 'TRENDING')    products = products.filter(p => p.trending);
        if (activeTab === 'UNIT_TRUSTS') products = products.filter(p => p.type === 'UNIT_TRUST');

        if (search) {
            const q = search.toLowerCase();
            products = products.filter(p =>
                p.name.toLowerCase().includes(q) ||
                provider.name.toLowerCase().includes(q)
            );
        }

        if (products.length === 0 && !(provider.demo && !search && activeTab === 'HOME')) return [];
        return [{ provider, products }];
    });

    // Desktop search filter
    const desktopFiltered = allProviders.filter(p =>
        search === '' ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.products.some(pr => pr.name.toLowerCase().includes(search.toLowerCase()))
    );

    const TABS: { id: InvestTab; label: string; icon: React.ReactNode }[] = [
        { id: 'HOME',        label: 'Home',        icon: <HomeIcon /> },
        { id: 'TRENDING',    label: 'Trending',    icon: <TrendingTabIcon /> },
        { id: 'UNIT_TRUSTS', label: 'Unit Trusts', icon: <div className="w-[5px] h-[5px] bg-blue-600 rounded-full flex-shrink-0" /> },
    ];

    return (
        <Layout noPadding backgroundColor="bg-white">
            <div className="flex flex-col h-full overflow-hidden">

                {/* ── MOBILE: white search + tabs ─────────────────────────── */}
                <div className="md:hidden bg-white shrink-0 px-5 pb-4 space-y-3">
                    {/* Search bar — 54px tall */}
                    <div className="flex items-center h-[54px] bg-gray-100 rounded-[64px] pl-5 pr-3">
                        <Search size={16} className="text-black mr-3 flex-shrink-0" strokeWidth={1.5} />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search investment products"
                            className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-black placeholder:text-black/40 font-normal font-['DM_Sans']"
                        />
                    </div>

                    {/* Animated tab filters */}
                    <SegmentedControl
                        options={TABS.map(tab => ({
                            value: tab.id,
                            label: (
                                <div className="flex items-center justify-center gap-1.5">
                                    {tab.icon}
                                    <span className="font-medium font-['DM_Sans'] leading-5">{tab.label}</span>
                                </div>
                            ),
                        }))}
                        value={activeTab}
                        onChange={v => setActiveTab(v as InvestTab)}
                        variant="capsule"
                        trackBgClassName="bg-transparent"
                        inactiveTextClassName="text-gray-900"
                        className="h-12"
                    />
                </div>

                {/* ── DESKTOP: search bar ──────────────────────────────────── */}
                <div className="hidden md:flex items-center px-6 pt-3 pb-3 shrink-0">
                    <div className="flex-1 flex items-center bg-white rounded-[32px] pl-5 pr-3 py-2 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)] outline outline-1 outline-offset-[-1px] outline-black/5">
                        <Search className="text-zinc-500 mr-3 flex-shrink-0" size={18} strokeWidth={1.5} />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search products or companies…"
                            className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs text-[#1F1F1F] placeholder:text-stone-300 font-normal"
                        />
                    </div>
                    <div className="ml-3 flex flex-shrink-0 gap-2">
                        {myCompany.data?.isTarget && <Link to="/invest/prices" className="inline-flex h-10 items-center rounded-full bg-[#0B57D0] px-4 text-xs font-semibold text-white hover:bg-[#0842A0]">Fund prices</Link>}
                        <Link to="/invest/accounts" className="inline-flex h-10 items-center rounded-full bg-[#D3E3FD] px-4 text-xs font-semibold text-[#041E49] hover:bg-[#C2D7FA]">Investor accounts</Link>
                        <Link to="/invest/kyc" className="inline-flex h-10 items-center rounded-full px-4 text-xs font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]">KYC profile</Link>
                    </div>
                </div>

                {/* ── Scrollable content ───────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto">

                    {/* ── MOBILE: provider list ──────────────────────────────── */}
                    <div className="md:hidden bg-gray-50 min-h-full">
                    <AnimatedTabContent tabKey={activeTab} index={activeTabIndex} className="px-4 py-4 space-y-8">
                        {mobileProviders.length === 0 ? (
                            <div className="py-16 text-center text-sm text-gray-400">
                                No results{search ? ` for "${search}"` : ''}
                            </div>
                        ) : mobileProviders.map(({ provider, products }) => (
                            <div key={provider.id}>
                                {/* Provider header — logo left-aligned with card text (px-6) */}
                                <div className="px-6 py-2 flex justify-between items-center gap-2">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="w-9 h-9 bg-white rounded-lg shadow-[0px_0px_8px_4px_rgba(141,115,115,0.15)] flex items-center justify-center overflow-hidden p-1 flex-shrink-0">
                                            <img src={provider.logo} alt={provider.name} className="w-full h-full object-contain" />
                                        </div>
                                        <span className="text-gray-900 text-sm font-semibold font-['DM_Sans'] truncate min-w-0">{provider.name}</span>{provider.demo && <span className="ml-1.5 flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">Demo firm</span>}
                                    </div>
                                    <Link to={provider.route} className="flex items-center gap-0.5 text-sm text-gray-900 font-normal font-['DM_Sans'] flex-shrink-0">
                                        See more <ChevronRight size={14} strokeWidth={1.5} />
                                    </Link>
                                </div>

                                {/* Product card — no drop shadow */}
                                <div className="bg-white rounded-3xl outline outline-1 outline-offset-[-1px] outline-neutral-200 overflow-hidden">
                                    {products.map((product) => (
                                        <Link
                                            to={`/invest/product/${product.id}`}
                                            key={product.id}
                                            className="px-6 py-4 flex items-center gap-3 bg-white active:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex-1 flex flex-col gap-1 min-w-0">
                                                {/* Name + NEW badge */}
                                                <div className="flex items-center gap-2.5 flex-wrap">
                                                    <span className="text-black text-base font-medium font-['DM_Sans']">{product.name}</span>
                                                    {product.isNew && (
                                                        <span className="flex-shrink-0 bg-blue-600 rounded-[20px] px-[5px] py-0.5 text-white text-[8px] font-extrabold font-['DM_Sans'] leading-none">NEW</span>
                                                    )}
                                                </div>

                                                {/* Performance line */}
                                                <div className="flex items-center gap-1">
                                                    <UpArrowIcon />
                                                    <span className="text-green-600 text-[10px] font-bold font-['DM_Sans']">{product.performance}</span>
                                                    <span className="text-neutral-700 text-[10px] font-normal font-['DM_Sans']"> Last Updated {product.lastUpdated}</span>
                                                </div>

                                                {/* Type badge + investors */}
                                                <div className="flex items-center gap-2">
                                                    <div className="h-4 px-[5px] py-1 bg-white rounded-[20px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.25)] outline outline-[0.5px] outline-offset-[-0.5px] outline-neutral-200 flex items-center gap-[5px]">
                                                        <div className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${TYPE_CONFIG[product.type].dot}`} />
                                                        <span className="text-gray-800 text-[8px] font-medium font-['DM_Sans']">{TYPE_CONFIG[product.type].label}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right chevron */}
                                            <ChevronRight size={24} strokeWidth={2} className="text-gray-900 flex-shrink-0" />
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </AnimatedTabContent>
                    </div>

                    {/* ── DESKTOP: white card ─────────────────────────────────── */}
                    <div className="hidden md:block px-6 pb-6">
                        <div className="bg-white rounded-[20px] p-6 shadow-sm flex flex-col gap-8 md:border md:border-gray-200">
                            {desktopFiltered.length === 0 ? (
                                <div className="py-12 text-center text-sm text-gray-400">{search ? <>No results for “{search}”</> : 'No funds to show yet. Investment companies appear here once their real prices are in.'}</div>
                            ) : desktopFiltered.map(provider => (
                                <div key={provider.id} className="flex flex-col gap-3">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-md border border-violet-100 shadow-sm flex items-center justify-center overflow-hidden p-0.5 flex-shrink-0">
                                                <img src={provider.logo} alt={provider.name} className="w-full h-full object-contain" />
                                            </div>
                                            <span className="text-sm font-semibold text-gray-900 font-['DM_Sans'] truncate">{provider.name}</span>{provider.demo && <span className="ml-1.5 flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">Demo firm</span>}
                                            <div className="w-4 h-4 flex items-center justify-center text-blue-600 flex-shrink-0">
                                                <VerifiedIcon />
                                            </div>
                                        </div>
                                        <Link to={provider.route} className="text-[#0B57D0] text-xs font-semibold flex-shrink-0 ml-2">
                                            See all →
                                        </Link>
                                    </div>

                                    <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 md:mx-0 md:px-0 md:flex-wrap">
                                        {provider.products.map(product => (
                                            <Link
                                                to={`/invest/product/${product.id}`}
                                                key={product.id}
                                                className="min-w-[224px] p-4 bg-white rounded-xl shadow-sm border border-[rgba(116,119,117,0.22)] flex flex-col justify-between active:shadow-md transition-shadow"
                                            >
                                                <div className="flex flex-col gap-2.5">
                                                    <div>
                                                        <div className="text-gray-900 text-sm font-semibold font-['DM_Sans'] leading-tight">{product.name}</div>
                                                        <div className="text-gray-400 text-[10px] mt-0.5">{provider.name}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-gray-900 text-base font-bold">{product.price}</div>
                                                        <div className="text-green-600 text-xs font-bold flex items-center gap-1 mt-0.5">
                                                            <TrendingUpIcon /> {product.ytd}
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between items-center mt-1">
                                                        <span />
                                                        <div className="w-7 h-7 bg-neutral-100 rounded-full flex items-center justify-center text-xs">→</div>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </Layout>
    );
};

// ── Icons ─────────────────────────────────────────────────────────────────────
const HomeIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B57D0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
    </svg>
);

const TrendingTabIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="17 7 21 7 21 11" />
    </svg>
);

const UpArrowIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1E8E3E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="7" y1="17" x2="17" y2="7" />
        <polyline points="7 7 17 7 17 17" />
    </svg>
);


export const TrendingUpIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
    </svg>
);

export const StarIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-500">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
);

export const UsersIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);

export const VerifiedIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
        <path d="m9 12 2 2 4-4" />
    </svg>
);
