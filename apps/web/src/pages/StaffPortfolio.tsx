import React, { useState } from 'react';
import { ChevronDown, ArrowUpRight, Search } from 'lucide-react';
import { SegmentedControl, AnimatedTabContent } from '../components/AnimatedTabs';
export const StaffPortfolio: React.FC = () => {
    const [portfolioView, setPortfolioView] = useState<'INVESTMENTS' | 'LOANS'>('INVESTMENTS');

    // Mocks for now until we have real data from the backend
    const totals = {
        netWorth: 0,
        netWorthChange: { value: 0, isIncrease: true },
        totalInvestments: 0,
        totalLoans: 0
    };

    const portfolioViewIndex = portfolioView === 'INVESTMENTS' ? 0 : 1;

    return (
        <div className="flex flex-col bg-gray-50 pt-2 pb-28 min-h-[100dvh] overflow-x-hidden w-full">
            {/* Top Summary Card (Net Worth) */}
            <div
                className="mx-5 mb-5 rounded-2xl p-5 text-white shadow-[0px_2px_6px_3px_rgba(0,0,0,0.25)] relative overflow-hidden bg-gradient-to-l from-blue-950 to-slate-900"
                style={{
                    animation: 'atabs-fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
            >
                <div className="flex items-center justify-between mb-1">
                    <p className="font-figtree text-xs font-normal uppercase tracking-wide leading-4 text-white">
                        Net Worth
                    </p>
                </div>
                <div className="flex items-baseline justify-between">
                    <h2 className="text-[34px] font-black leading-none">
                        K{totals.netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h2>
                    <span className="text-[28px] font-black leading-none font-bold">
                        <span className="text-[#4D9FFF]">{totals.netWorthChange.isIncrease ? '+' : '-'}</span>
                        <span className="text-white">{totals.netWorthChange.value}%</span>
                    </span>
                </div>
                
                {/* Secondary Band */}
                <div className="bg-white/10 rounded-2xl px-4 py-3 mt-5 flex justify-between items-center text-[10px] font-bold text-white/90">
                    <div className="flex items-center gap-1.5">
                        <ArrowUpRight size={14} className="text-[#34D399]" />
                        <span>Total Investments <strong className="font-extrabold text-white">K{totals.totalInvestments.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
                    </div>
                    <div className="h-3 w-px bg-white/20"></div>
                    <div className="flex items-center gap-1.5">
                        <ChevronDown size={14} className="text-[#F87171]" />
                        <span>Total Loans <strong className="font-extrabold text-white">K{totals.totalLoans.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
                    </div>
                </div>
            </div>

            {/* View Toggles below the card */}
            <SegmentedControl
                className="mx-4 mb-4"
                variant="capsule"
                value={portfolioView}
                onChange={(v) => setPortfolioView(v as 'INVESTMENTS' | 'LOANS')}
                options={[
                    { value: 'INVESTMENTS', label: 'Investments' },
                    { value: 'LOANS', label: 'Loans' },
                ]}
            />

            <div className="px-5 mt-2">
                <AnimatedTabContent tabKey={portfolioView} index={portfolioViewIndex}>
                    {portfolioView === 'INVESTMENTS' ? (
                        <div className="bg-white rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-[0px_4px_4px_0px_rgba(0,0,0,0.05)] outline outline-1 outline-offset-[-1px] outline-gray-200 mt-2">
                            <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                                <Search size={28} />
                            </div>
                            <h3 className="text-lg font-bold text-brand-navy">You have no investments yet</h3>
                            <p className="text-sm text-gray-400 mt-2">Use the Invest option in the Inbox to start growing your money.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-[0px_4px_4px_0px_rgba(0,0,0,0.05)] outline outline-1 outline-offset-[-1px] outline-gray-200 mt-2">
                            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
                                <Search size={28} />
                            </div>
                            <h3 className="text-lg font-bold text-brand-navy">You have no loans yet</h3>
                            <p className="text-sm text-gray-400 mt-2">Use the New Staff Loan option in the Inbox if you need funds.</p>
                        </div>
                    )}
                </AnimatedTabContent>
            </div>
        </div>
    );
};
