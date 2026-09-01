import React from 'react';
import { Layout } from '../../components/Layout';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { TrendingUpIcon, StarIcon, UsersIcon, VerifiedIcon, INVEST_PROVIDERS } from './InvestHome';

const TYPE_CONFIG = {
    UNIT_TRUST:    { dot: 'bg-blue-600',   label: 'Unit Trust'    },
    FIXED_DEPOSIT: { dot: 'bg-pink-400',   label: 'Fixed Deposit' },
    BOND:          { dot: 'bg-purple-500', label: 'Bond'          },
} as const;

const UpArrowIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="7" y1="17" x2="17" y2="7" />
        <polyline points="7 7 17 7 17 17" />
    </svg>
);

const InvestorsIcon = () => (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);

export const InvestCompany: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const provider = INVEST_PROVIDERS.find(p => p.id === id) ?? INVEST_PROVIDERS[0];

    return (
        <Layout noPadding backgroundColor="bg-white" mobileHeaderHidden>
            <div className="flex flex-col h-full overflow-hidden">

                {/* ── MOBILE ──────────────────────────────────────────────────── */}
                <div className="md:hidden flex-1 overflow-y-auto bg-white">

                    {/* Banner — starts at very top, frosted back button overlaid */}
                    <div className="relative w-full h-48 bg-gradient-to-br from-[#0058DB] via-[#1a6aff] to-[#0040b0] overflow-hidden flex-shrink-0">
                        {/* Decorative abstract circles */}
                        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10" />
                        <div className="absolute -bottom-14 -left-10 w-56 h-56 rounded-full bg-white/10" />
                        <div className="absolute top-6 right-20 w-24 h-24 rounded-full bg-white/5" />
                        <div className="absolute bottom-2 right-6 w-12 h-12 rounded-full bg-white/10" />

                        {/* Frosted back button */}
                        <button
                            onClick={() => navigate(-1)}
                            className="absolute top-12 left-5 z-20 w-9 h-9 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center active:opacity-70 transition-opacity"
                            aria-label="Go back"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 18l-6-6 6-6" />
                            </svg>
                        </button>
                    </div>

                    {/* Logo overlapping banner — left-aligned, above banner via z-index */}
                    <div className="px-6 relative z-10">
                        <div className="-mt-10 w-20 h-20 bg-white rounded-2xl shadow-[0px_4px_16px_0px_rgba(0,0,0,0.15)] border-2 border-white flex items-center justify-center overflow-hidden p-1.5 flex-shrink-0">
                            <img src={provider.logo} alt={provider.name} className="w-full h-full object-contain" />
                        </div>
                    </div>

                    {/* Company info */}
                    <div className="px-6 pt-3 pb-5">
                        <div className="flex items-center gap-2 mb-1.5">
                            <h1 className="text-gray-900 text-xl font-bold font-['DM_Sans'] leading-tight">{provider.name}</h1>
                            <div className="text-blue-600 flex-shrink-0 w-5 h-5">
                                <VerifiedIcon />
                            </div>
                        </div>
                        <div className="flex items-center gap-5 text-xs text-gray-500 font-['DM_Sans']">
                            <span className="flex items-center gap-1.5"><StarIcon /> {provider.reviews}</span>
                            <span className="flex items-center gap-1.5"><UsersIcon /> {provider.investors}</span>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-gray-100 mx-6 mb-5" />

                    {/* Products list */}
                    <div className="px-4 pb-10">
                        <h2 className="text-gray-900 text-sm font-bold font-['DM_Sans'] mb-4 px-2">All Investment Products</h2>

                        <div className="bg-white rounded-3xl outline outline-1 outline-offset-[-1px] outline-neutral-200 overflow-hidden">
                            {provider.products.map((product, idx) => (
                                <Link
                                    to={`/invest/product/${product.id}`}
                                    key={product.id}
                                    className={`px-6 py-4 flex items-center gap-3 bg-white active:bg-gray-50 transition-colors ${idx > 0 ? 'border-t border-neutral-100' : ''}`}
                                >
                                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                                        {/* Name + NEW badge */}
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <span className="text-black text-base font-medium font-['DM_Sans']">{product.name}</span>
                                            {product.isNew && (
                                                <span className="flex-shrink-0 bg-blue-600 rounded-[20px] px-[5px] py-0.5 text-white text-[8px] font-extrabold font-['DM_Sans'] leading-none">NEW</span>
                                            )}
                                        </div>

                                        {/* Performance */}
                                        <div className="flex items-center gap-1">
                                            <UpArrowIcon />
                                            <span className="text-green-600 text-[10px] font-bold font-['DM_Sans']">{product.performance}</span>
                                            <span className="text-neutral-700 text-[10px] font-normal font-['DM_Sans']"> Last Updated {product.lastUpdated}</span>
                                        </div>

                                        {/* Type badge + investors */}
                                        <div className="flex items-center gap-2">
                                            <div className="h-4 px-[5px] py-1 bg-white rounded-[20px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.25)] outline outline-[0.5px] outline-offset-[-0.5px] outline-neutral-200 flex items-center gap-[5px]">
                                                <div className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${TYPE_CONFIG[product.type as keyof typeof TYPE_CONFIG]?.dot ?? 'bg-gray-400'}`} />
                                                <span className="text-gray-800 text-[8px] font-medium font-['DM_Sans']">{TYPE_CONFIG[product.type as keyof typeof TYPE_CONFIG]?.label ?? product.type}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <InvestorsIcon />
                                                <span className="text-neutral-700 text-[8px] font-medium font-['DM_Sans']">{product.productInvestors} Investors</span>
                                            </div>
                                        </div>
                                    </div>

                                    <ChevronRight size={24} strokeWidth={2} className="text-gray-900 flex-shrink-0" />
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── DESKTOP ─────────────────────────────────────────────────── */}
                <div className="hidden md:block overflow-y-auto flex-1">
                    <div className="px-6 py-4">
                        <div className="w-full bg-white rounded-[20px] p-6 shadow-sm flex flex-col gap-6 min-h-[600px]">

                            {/* Company banner */}
                            <div className="w-full bg-slate-50 border border-[#E8EEF8] rounded-xl p-8 flex flex-col items-center gap-4">
                                <div className="w-20 h-20 bg-white rounded-xl shadow-md border border-violet-100 flex items-center justify-center overflow-hidden p-1">
                                    <img src={provider.logo} alt={provider.name} className="w-full h-full object-contain" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-gray-900 text-xl font-bold font-['DM_Sans']">{provider.name}</h1>
                                    <div className="w-4 h-4 flex items-center justify-center text-blue-600"><VerifiedIcon /></div>
                                </div>
                                <div className="flex items-center gap-6 text-xs text-gray-500">
                                    <span className="flex items-center gap-1"><StarIcon /> {provider.reviews}</span>
                                    <span className="flex items-center gap-1"><UsersIcon /> {provider.investors}</span>
                                </div>
                            </div>

                            {/* All products grid */}
                            <div className="flex flex-col gap-4 pt-4">
                                <h2 className="text-black text-sm font-semibold font-['DM_Sans'] pb-3">All Investment Products</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                    {provider.products.map((product, index) => (
                                        <Link
                                            to={`/invest/product/${product.id}`}
                                            key={index}
                                            className="p-4 bg-white rounded-xl shadow-sm border border-[#E8EEF8] flex flex-col gap-3 hover:shadow-md transition-shadow"
                                        >
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
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <div className="text-black text-[10px] flex items-center gap-1"><StarIcon /> {provider.reviews}</div>
                                                    <div className="text-black text-[10px] flex items-center gap-1"><UsersIcon /> {provider.investors}</div>
                                                </div>
                                                <div className="w-8 h-8 bg-neutral-100 rounded-full flex items-center justify-center">&rarr;</div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

            </div>
        </Layout>
    );
};
