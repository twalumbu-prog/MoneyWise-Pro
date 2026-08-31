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
    const [search, setSearch] = React.useState('');

    const filtered = INVEST_PROVIDERS.filter(p =>
        search === '' ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.products.some(pr => pr.name.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <Layout noPadding={true} backgroundColor="bg-[#F5FAFF]">
            <div className="flex flex-col h-full overflow-hidden">
                {/* Search bar — home page style but thinner */}
                <div className="px-4 md:px-6 pt-3 pb-3 shrink-0">
                    <div className="flex items-center bg-white rounded-[32px] pl-5 pr-3 py-2 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)] outline outline-1 outline-offset-[-1px] outline-black/5">
                        <Search className="text-zinc-500 mr-3 flex-shrink-0" size={18} strokeWidth={1.5} />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search products or companies…"
                            className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs text-brand-navy placeholder:text-stone-300 font-normal"
                        />
                    </div>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6">
                    <div className="bg-white rounded-[20px] p-4 md:p-6 shadow-sm flex flex-col gap-8">
                        {filtered.length === 0 ? (
                            <div className="py-12 text-center text-sm text-gray-400">No results for "{search}"</div>
                        ) : filtered.map(provider => (
                            <div key={provider.id} className="flex flex-col gap-3">
                                {/* Company header */}
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-md border border-violet-100 shadow-sm flex items-center justify-center overflow-hidden p-0.5 flex-shrink-0">
                                            <img src={provider.logo} alt={provider.name} className="w-full h-full object-contain" />
                                        </div>
                                        <span className="text-sm font-semibold text-gray-900 font-['DM_Sans'] truncate">{provider.name}</span>
                                        <div className="w-4 h-4 flex items-center justify-center text-blue-600 flex-shrink-0">
                                            <VerifiedIcon />
                                        </div>
                                    </div>
                                    <Link to={provider.route} className="text-[#006AFF] text-xs font-semibold flex-shrink-0 ml-2">
                                        See all →
                                    </Link>
                                </div>

                                {/* Product cards — horizontal scroll on mobile */}
                                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
                                    {provider.products.map(product => (
                                        <Link
                                            to={`/invest/product/${product.id}`}
                                            key={product.id}
                                            className="min-w-[180px] md:min-w-[224px] p-4 bg-white rounded-xl shadow-sm border border-[#E8EEF8] flex flex-col justify-between active:shadow-md transition-shadow"
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
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                                                            <StarIcon /> {provider.reviews}
                                                        </span>
                                                    </div>
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
