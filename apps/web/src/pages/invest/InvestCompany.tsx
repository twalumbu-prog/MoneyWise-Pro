import React from 'react';
import { Layout } from '../../components/Layout';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Search, MoreVertical, ChevronLeft } from 'lucide-react';
import { TrendingUpIcon, StarIcon, UsersIcon, VerifiedIcon } from './InvestHome';

export const InvestCompany: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams();

    // Mock data based on id
    const companyName = id === 'hobbiton' ? 'Hobbiton Investment Management' : 'Longhorn Investment Associates Ltd.';
    const companyCode = id === 'hobbiton' ? 'HIM' : 'LHI';
    const logoColor = id === 'hobbiton' ? 'bg-green-600' : 'text-red-500 font-bold';

    const products = [
        { id: '1', name: 'Premium FX Fund', price: 'K25,502.0', ytd: '34% YTD', company: companyName },
        { id: '2', name: 'Equity Fund', price: 'K25,502.0', ytd: '30% YTD', company: companyName },
        { id: '3', name: 'Mixed Capital Fund', price: 'K25,502.0', ytd: '34% YTD', company: companyName },
        { id: '4', name: 'Premium FX Fund', price: 'K25,502.0', ytd: '34% YTD', company: companyName },
        { id: '5', name: 'Equity Fund', price: 'K25,502.0', ytd: '34% YTD', company: companyName },
        { id: '6', name: 'Equity Fund', price: 'K25,502.0', ytd: '34% YTD', company: companyName }
    ];

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
                    <div className="w-full bg-white rounded-[20px] p-6 shadow-sm flex flex-col gap-6 min-h-[600px]">
                        
                        {/* Header */}
                        <div className="flex justify-between items-center pb-2">
                            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-black hover:text-gray-600 transition-colors">
                                <ChevronLeft className="w-5 h-5" />
                                <span className="text-xs font-semibold font-['DM_Sans']">Back</span>
                            </button>
                            <button className="text-gray-500 hover:text-black">
                                <MoreVertical className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Company Banner */}
                        <div className="w-full bg-slate-50 border border-[#E8EEF8] rounded-xl p-8 flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-white rounded-xl shadow-md border border-violet-100 flex items-center justify-center text-xl">
                                {id === 'hobbiton' ? <div className={logoColor + ' w-8 h-8 rounded-full'}></div> : <div className={logoColor}>{companyCode}</div>}
                            </div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-gray-900 text-xl font-bold font-['DM_Sans']">{companyName}</h1>
                                <div className="w-4 h-4 flex items-center justify-center text-blue-600">
                                    <VerifiedIcon />
                                </div>
                            </div>
                        </div>

                        {/* Most Popular */}
                        <div className="flex flex-col gap-4">
                            <div className="pb-3">
                                <h2 className="text-black text-sm font-semibold font-['DM_Sans']">Most Popular</h2>
                            </div>
                            <div className="flex gap-5 overflow-x-auto pb-4">
                                {products.slice(0, 2).map(product => (
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

                        {/* All Products */}
                        <div className="flex flex-col gap-4 pt-4 border-t border-slate-200">
                            <div className="flex justify-between items-center pb-3">
                                <h2 className="text-black text-sm font-semibold font-['DM_Sans']">All Investment Products</h2>
                                <div className="flex items-center gap-4 text-gray-500">
                                    <Search className="w-4 h-4 cursor-pointer" />
                                    {/* Sort/Filter Icons */}
                                    <div className="flex gap-1 cursor-pointer">
                                        <div className="w-3 h-0.5 bg-gray-500 rounded"></div>
                                        <div className="w-2 h-0.5 bg-gray-500 rounded"></div>
                                        <div className="w-1 h-0.5 bg-gray-500 rounded"></div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {products.map((product, index) => (
                                    <Link to={`/invest/product/${product.id}`} key={index} className="p-4 bg-white rounded-xl shadow-sm border border-[#E8EEF8] flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer">
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

                    </div>
                </div>
            </div>
        </Layout>
    );
};
