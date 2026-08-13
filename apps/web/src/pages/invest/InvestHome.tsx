import React from 'react';
import { Layout } from '../../components/Layout';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';

// ── Provider data ─────────────────────────────────────────────────────────────
export const INVEST_PROVIDERS = [
    {
        id: 'longhorn',
        name: 'Longhorn Investment Associates',
        logo: '/invest-logos/longhorn.jpeg',
        route: '/invest/company/longhorn',
        reviews: '4.9 (320 Reviews)',
        investors: '232k Investors',
        products: [
            { id: 'lh-1', name: 'Premium FX Fund',     price: 'K25,502.0', ytd: '34% YTD' },
            { id: 'lh-2', name: 'Equity Growth Fund',  price: 'K15,200.0', ytd: '21% YTD' },
            { id: 'lh-3', name: 'Mixed Capital Fund',  price: 'K8,400.0',  ytd: '12% YTD' },
        ],
    },
    {
        id: 'hobbiton',
        name: 'Hobbiton Investments',
        logo: '/invest-logos/hobbiton.png',
        route: '/invest/company/hobbiton',
        reviews: '4.8 (150 Reviews)',
        investors: '85k Investors',
        products: [
            { id: 'hb-1', name: 'Real Estate Trust',  price: 'K55,000.0', ytd: '18% YTD' },
            { id: 'hb-2', name: 'Agri-Business Fund', price: 'K12,300.0', ytd: '42% YTD' },
            { id: 'hb-3', name: 'Infrastructure Bond', price: 'K9,800.0', ytd: '15% YTD' },
        ],
    },
    {
        id: 'aflife',
        name: 'Aflife Investments',
        logo: '/invest-logos/aflife.png',
        route: '/invest/company/aflife',
        reviews: '4.7 (98 Reviews)',
        investors: '41k Investors',
        products: [
            { id: 'af-1', name: 'Life Savings Plan',    price: 'K5,000.0',  ytd: '11% YTD' },
            { id: 'af-2', name: 'Education Trust Fund', price: 'K7,500.0',  ytd: '14% YTD' },
            { id: 'af-3', name: 'Balanced Growth Fund', price: 'K10,200.0', ytd: '19% YTD' },
        ],
    },
    {
        id: 'abc',
        name: 'ABC Asset Management',
        logo: '/invest-logos/abc.jpeg',
        route: '/invest/company/abc',
        reviews: '4.6 (212 Reviews)',
        investors: '120k Investors',
        products: [
            { id: 'abc-1', name: 'Money Market Fund',   price: 'K3,200.0',  ytd: '9% YTD'  },
            { id: 'abc-2', name: 'Government Bond Fund',price: 'K18,750.0', ytd: '16% YTD' },
            { id: 'abc-3', name: 'Diversified Equity',  price: 'K22,400.0', ytd: '28% YTD' },
        ],
    },
];

// ── InvestHome ────────────────────────────────────────────────────────────────
export const InvestHome: React.FC = () => {
    return (
        <Layout noPadding={true} backgroundColor="bg-slate-100">
            <div className="flex flex-col h-full bg-slate-100">
                {/* Top Tabs */}
                <div className="px-6 py-4">
                    <div className="inline-flex justify-start items-start gap-2">
                        <div className="w-28 h-7 px-1 py-2 rounded-tl-lg rounded-tr-lg inline-flex flex-col justify-center items-center gap-3 overflow-hidden cursor-pointer hover:bg-gray-200 transition-colors">
                            <div className="inline-flex justify-center items-center gap-5">
                                <div className="flex justify-center items-center gap-2">
                                    <div className="justify-center text-black text-xs font-medium font-['DM_Sans'] leading-4">Marketplace</div>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-1.5 bg-white rounded-tl-xl rounded-tr-xl border-l border-r inline-flex flex-col justify-center items-center gap-3 overflow-hidden cursor-pointer">
                            <div className="self-stretch inline-flex justify-center items-center">
                                <div className="flex justify-center items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                                    <div className="justify-center text-black text-xs font-semibold font-['DM_Sans'] leading-4">Invest</div>
                                </div>
                            </div>
                        </div>
                        <div className="w-28 h-7 px-1 py-2 rounded-tl-lg rounded-tr-lg inline-flex flex-col justify-center items-center gap-3 overflow-hidden cursor-pointer hover:bg-gray-200 transition-colors">
                            <div className="self-stretch inline-flex justify-center items-center gap-5">
                                <div className="flex justify-center items-center gap-2">
                                    <div className="justify-center text-black text-xs font-normal font-['DM_Sans'] leading-4">Loans</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="w-full bg-white rounded-[20px] p-6 shadow-sm flex flex-col gap-8 min-h-[600px]">

                        {/* Search Bar */}
                        <div className="w-96 h-8">
                            <div className="h-full px-4 bg-neutral-100 rounded-full flex items-center gap-3">
                                <Search className="w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Search investment products or companies..."
                                    className="bg-transparent border-none outline-none w-full text-sm placeholder:text-gray-400"
                                />
                            </div>
                        </div>

                        {/* Companies List */}
                        <div className="flex flex-col gap-9">
                            {INVEST_PROVIDERS.map(provider => (
                                <div key={provider.id} className="flex flex-col gap-4">
                                    {/* Company Header */}
                                    <div className="flex justify-between items-center pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-md border border-violet-100 shadow-sm flex items-center justify-center overflow-hidden p-0.5">
                                                <img
                                                    src={provider.logo}
                                                    alt={provider.name}
                                                    className="w-full h-full object-contain"
                                                />
                                            </div>
                                            <div className="text-black text-sm font-semibold font-['DM_Sans']">{provider.name}</div>
                                            <div className="w-4 h-4 flex items-center justify-center text-blue-600">
                                                <VerifiedIcon />
                                            </div>
                                        </div>
                                        <Link to={provider.route} className="text-neutral-700 text-xs font-normal hover:underline">
                                            See more &rarr;
                                        </Link>
                                    </div>

                                    {/* Product Cards */}
                                    <div className="flex gap-5 overflow-x-auto pb-4">
                                        {provider.products.map(product => (
                                            <Link
                                                to={`/invest/product/${product.id}`}
                                                key={product.id}
                                                className="min-w-[224px] p-4 bg-white rounded-xl shadow-sm border border-[#E8EEF8] flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer"
                                            >
                                                <div className="flex flex-col gap-3">
                                                    <div>
                                                        <div className="text-black text-base font-medium font-['DM_Sans']">{product.name}</div>
                                                        <div className="text-stone-500 text-[10px]">{provider.name}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-black text-lg font-bold">{product.price}</div>
                                                        <div className="text-green-600 text-xs font-bold flex items-center gap-1 mt-1">
                                                            <TrendingUpIcon /> {product.ytd}
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between items-end mt-0.5 gap-8">
                                                        <div className="flex items-center gap-3">
                                                            <div className="text-black text-[10px] flex items-center gap-1">
                                                                <StarIcon /> {provider.reviews}
                                                            </div>
                                                            <div className="text-black text-[10px] flex items-center gap-1">
                                                                <UsersIcon /> {provider.investors}
                                                            </div>
                                                        </div>
                                                        <div className="w-8 h-8 bg-neutral-100 rounded-full flex items-center justify-center">
                                                            &rarr;
                                                        </div>
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

// ── Shared icons ──────────────────────────────────────────────────────────────
export const TrendingUpIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
        <polyline points="17 6 23 6 23 12"></polyline>
    </svg>
);

export const StarIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-500">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
);

export const UsersIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
);

export const VerifiedIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-badge-check-icon lucide-badge-check"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>
);
