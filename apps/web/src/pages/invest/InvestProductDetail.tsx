import React, { useState } from 'react';
import { Layout } from '../../components/Layout';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, MoreVertical } from 'lucide-react';
import { StarIcon, UsersIcon, VerifiedIcon, INVEST_PROVIDERS } from './InvestHome';

export const InvestProductDetail: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);

    // Resolve the product + provider from the shared data
    const provider = INVEST_PROVIDERS.find(p => p.products.some(pr => pr.id === id)) ?? INVEST_PROVIDERS[0];
    const product   = provider.products.find(pr => pr.id === id) ?? provider.products[0];

    const companyName  = provider.name;
    const companyLogo  = provider.logo;
    const productName  = product.name;
    const productSubName = `${provider.name} (${product.id.toUpperCase()})`;
    const price        = product.price;
    const priceChange  = `${product.ytd}`;
    const currentTotal = product.price.replace('K', '').replace(',', '');

    return (
        <Layout noPadding={true} backgroundColor="bg-slate-100">
            <div className="flex flex-col h-full bg-slate-100 p-6">
                <div className="w-full bg-white rounded-[20px] p-6 shadow-sm flex flex-col gap-6 min-h-[600px]">
                    
                    {/* Header: Company Name & Back Button */}
                    <div className="flex justify-between items-center pb-2">
                        <div className="flex items-center gap-4">
                            <button onClick={() => navigate(-1)} className="flex flex-col items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors">
                                <ChevronLeft className="w-5 h-5 text-black" />
                            </button>
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-md border border-violet-100 shadow-sm flex items-center justify-center overflow-hidden p-0.5">
                                    <img src={companyLogo} alt={companyName} className="w-full h-full object-contain" />
                                </div>
                                <div className="text-black text-xs font-medium font-['DM_Sans']">{companyName}</div>
                                <div className="w-4 h-4 flex items-center justify-center text-blue-600">
                                    <VerifiedIcon />
                                </div>
                            </div>
                        </div>
                        <button className="text-gray-500 hover:text-black">
                            <MoreVertical className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="h-px bg-slate-200 w-full"></div>

                    {/* Product Banner & Buy Button */}
                    <div className="flex justify-between items-center py-4 border-b border-gray-100">
                        <div className="flex flex-col gap-1">
                            <h1 className="text-black text-2xl font-semibold font-['DM_Sans']">{productName}</h1>
                            <div className="text-zinc-500 text-sm font-medium font-['Figtree']">{productSubName}</div>
                        </div>
                        <div>
                            <button 
                                onClick={() => setIsBuyModalOpen(true)}
                                className="px-6 py-2 bg-blue-600 text-white text-sm font-bold font-['DM_Sans'] rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Buy Units
                            </button>
                        </div>
                    </div>

                    {/* Price Info */}
                    <div className="flex flex-col sm:flex-row gap-6 border-b border-gray-100 py-4">
                        <div className="flex-1 flex flex-col gap-2">
                            <div className="text-zinc-500 text-sm font-medium font-['Figtree']">Current Price</div>
                            <div className="flex items-end gap-1">
                                <span className="text-black text-4xl font-bold font-['Figtree']">{price}</span>
                                <span className="text-black text-base font-normal font-['Figtree'] mb-1">/unit</span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <div className="text-green-500 text-xs font-bold font-['Figtree'] flex items-center gap-1 bg-green-50 px-2 py-1 rounded-full">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transform rotate-45">
                                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                                        <polyline points="17 6 23 6 23 12"></polyline>
                                    </svg>
                                    {priceChange}
                                </div>
                            </div>
                        </div>
                        <div className="w-14 h-14 bg-gray-100 rounded-[36px] flex items-center justify-center">
                            {/* Icon or mini-chart placeholder */}
                        </div>
                    </div>

                    {/* Chart Section */}
                    <div className="relative w-full h-64 mt-4">
                        {/* Mock Chart SVG */}
                        <div className="absolute inset-0 flex flex-col justify-between pt-4 pb-8 pl-4 pr-12">
                            {/* Grid Lines */}
                            {[70000, 60000, 50000, 40000, 30000, 20000, 0].map((val, i) => (
                                <div key={i} className="flex items-center w-full relative">
                                    <div className="w-full h-px bg-gray-200"></div>
                                    <div className="absolute right-[-40px] text-neutral-400 text-[10px] font-normal font-['Figtree']">{val === 0 ? '0' : val.toLocaleString()}</div>
                                </div>
                            ))}
                            {/* X-axis labels */}
                            <div className="absolute bottom-0 left-4 right-12 flex justify-between text-neutral-400 text-[10px] font-bold font-['Inter']">
                                <span>January</span>
                                <span>March</span>
                                <span>June</span>
                                <span>August</span>
                            </div>
                        </div>
                        {/* The line */}
                        <svg className="absolute inset-0 w-full h-full pt-4 pb-8 pl-4 pr-12" preserveAspectRatio="none" viewBox="0 0 100 100">
                            <polyline
                                fill="none"
                                stroke="#22c55e"
                                strokeWidth="1.5"
                                points="0,85 15,84 25,80 40,81 50,75 65,77 80,75 90,65 95,50 100,45"
                            />
                            <circle cx="100" cy="45" r="2" fill="#22c55e" />
                        </svg>
                        {/* Current value pill */}
                        <div className="absolute left-[15%] top-[55%] -translate-x-1/2 -translate-y-1/2 bg-neutral-800 text-white text-[8px] font-semibold px-2 py-1 rounded-[10px]">
                            {currentTotal}
                        </div>
                    </div>

                    {/* Footer / Description */}
                    <div className="flex flex-col gap-4 mt-8">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-1 text-black text-xs font-normal">
                                <StarIcon /> 4.9 (320 Reviews)
                            </div>
                            <div className="flex items-center gap-1 text-black text-xs font-normal">
                                <UsersIcon /> 232,000 Investors
                            </div>
                        </div>
                        <div className="text-neutral-800 text-base font-light font-['Figtree'] max-w-3xl leading-relaxed">
                            A highly diversified equity fund aiming for long-term capital appreciation by investing in top-performing regional and international markets. Carefully managed by experts to ensure balanced risk and substantial returns.
                        </div>
                        <div className="text-neutral-800 text-base font-normal font-['Figtree'] underline cursor-pointer hover:text-blue-600 transition-colors">
                            Read Full Prospectus
                        </div>
                    </div>

                </div>
            </div>

            {/* Buy Modal */}
            {isBuyModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
                    <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl relative">
                        <button onClick={() => setIsBuyModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                        <h2 className="text-xl font-bold mb-4">Buy {productName} Units</h2>
                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (K)</label>
                                <input type="number" className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-600 focus:outline-none" placeholder="Enter amount to invest" />
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <input type="checkbox" id="recurring" className="rounded border-gray-300 text-blue-600 focus:ring-blue-600" />
                                <label htmlFor="recurring" className="text-sm text-gray-700">Make this a recurring investment</label>
                            </div>
                            <div className="text-xs text-gray-500 mt-4 p-3 bg-blue-50 rounded-lg">
                                Funds will be transferred from your main wallet to the designated investment account.
                            </div>
                            <button onClick={() => {
                                alert("Proceeding with purchase (Transfer to destination account pending...)");
                                setIsBuyModalOpen(false);
                            }} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl mt-4 hover:bg-blue-700 transition-colors">
                                Confirm Purchase
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};
