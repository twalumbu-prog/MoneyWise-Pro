import React from 'react';
import { Layout } from '../../components/Layout';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';

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
                            {/* Company 1 */}
                            <div className="flex flex-col gap-4">
                                <div className="flex justify-between items-center pb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-md border border-violet-100 shadow-sm flex items-center justify-center p-1">
                                            <div className="text-red-500 font-bold text-xs">LHI</div>
                                        </div>
                                        <div className="text-black text-sm font-semibold font-['DM_Sans']">Long Horn Investments</div>
                                        <div className="w-4 h-4 flex items-center justify-center text-blue-600">
                                            <VerifiedIcon />
                                        </div>
                                    </div>
                                    <Link to="/invest/company/long-horn" className="text-neutral-700 text-xs font-normal hover:underline">
                                        See more &rarr;
                                    </Link>
                                </div>
                                <div className="flex gap-5 overflow-x-auto pb-4">
                                    {/* Product Cards */}
                                    {[
                                        { id: '1', name: 'Premium FX Fund', price: 'K25,502.0', ytd: '34% YTD', company: 'Longhorn Investment Capital Limited' },
                                        { id: '2', name: 'Equity Fund', price: 'K15,200.0', ytd: '21% YTD', company: 'Longhorn Investment Capital Limited' },
                                        { id: '3', name: 'Mixed Capital Fund', price: 'K8,400.0', ytd: '12% YTD', company: 'Longhorn Investment Capital Limited' }
                                    ].map(product => (
                                        <Link to={`/invest/product/${product.id}`} key={product.id} className="min-w-[224px] p-4 bg-white rounded-xl shadow-sm border border-[#E8EEF8] flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer">
                                            <div className="flex flex-col gap-3">
                                                <div>
                                                    <div className="text-black text-base font-medium font-['DM_Sans']">{product.name}</div>
                                                    <div className="text-stone-500 text-[10px]">{product.company}</div>
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
                                                            <StarIcon /> 4.9 (320 Reviews)
                                                        </div>
                                                        <div className="text-black text-[10px] flex items-center gap-1">
                                                            <UsersIcon /> 232k Investors
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

                            {/* Company 2 */}
                            <div className="flex flex-col gap-4">
                                <div className="flex justify-between items-center pb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-md border border-violet-100 shadow-sm flex items-center justify-center p-1">
                                            <div className="w-4 h-4 bg-green-600 rounded-full"></div>
                                        </div>
                                        <div className="text-black text-sm font-semibold font-['DM_Sans']">Hobbiton Investment Management</div>
                                        <div className="w-4 h-4 flex items-center justify-center text-blue-600">
                                            <VerifiedIcon />
                                        </div>
                                    </div>
                                    <Link to="/invest/company/hobbiton" className="text-neutral-700 text-xs font-normal hover:underline">
                                        See more &rarr;
                                    </Link>
                                </div>
                                <div className="flex gap-5 overflow-x-auto pb-4">
                                    {[
                                        { id: '4', name: 'Real Estate Trust', price: 'K55,000.0', ytd: '18% YTD', company: 'Hobbiton Investment Management' },
                                        { id: '5', name: 'Agri-Business Fund', price: 'K12,300.0', ytd: '42% YTD', company: 'Hobbiton Investment Management' }
                                    ].map(product => (
                                        <Link to={`/invest/product/${product.id}`} key={product.id} className="min-w-[224px] p-4 bg-white rounded-xl shadow-sm border border-[#E8EEF8] flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer">
                                            <div className="flex flex-col gap-3">
                                                <div>
                                                    <div className="text-black text-base font-medium font-['DM_Sans']">{product.name}</div>
                                                    <div className="text-stone-500 text-[10px]">{product.company}</div>
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
                                                            <StarIcon /> 4.8 (150 Reviews)
                                                        </div>
                                                        <div className="text-black text-[10px] flex items-center gap-1">
                                                            <UsersIcon /> 85k Investors
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

                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

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
