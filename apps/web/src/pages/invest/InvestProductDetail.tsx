import React, { useMemo, useState } from 'react';
import { Layout } from '../../components/Layout';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, MoreVertical } from 'lucide-react';
import { StarIcon, UsersIcon, VerifiedIcon, INVEST_PROVIDERS, TYPE_CONFIG } from './InvestHome';
import { InvestChart } from './InvestChart';
import { InvestPaymentFlow } from './InvestPaymentFlow';
import { SegmentedControl } from '../../components/AnimatedTabs';
import {
    generateDailyHistory,
    generateIntradayHistory,
    sliceForTimeframe,
    type Timeframe,
} from './investChartData';

const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', 'YTD'];

const DESCRIPTIONS: Record<string, string> = {
    UNIT_TRUST: 'A professionally managed pooled fund investing across diversified equities and money market instruments, aiming for long-term capital growth while spreading risk across sectors.',
    FIXED_DEPOSIT: 'A fixed-term deposit that locks in your capital for the selected duration in exchange for a guaranteed annual interest rate, paid out at maturity or on a recurring schedule.',
    BOND: 'A debt instrument that pays a fixed coupon over its term, backed by the issuer, offering a predictable income stream with lower volatility than equities.',
};

const UpArrowIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#05C702" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="7" y1="17" x2="17" y2="7" />
        <polyline points="7 7 17 7 17 17" />
    </svg>
);

const ShieldIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4z" />
        <path d="m9 12 2 2 4-4" />
    </svg>
);

export const InvestProductDetail: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
    const [timeframe, setTimeframe] = useState<Timeframe>('3M');

    const provider = INVEST_PROVIDERS.find(p => p.products.some(pr => pr.id === id)) ?? INVEST_PROVIDERS[0];
    const product = provider.products.find(pr => pr.id === id) ?? provider.products[0];

    const companyName = provider.name;
    const companyLogo = provider.logo;
    const productName = product.name;
    const productSubName = `${provider.name} (${product.id.toUpperCase()})`;
    const price = product.price;
    const priceChange = product.ytd;
    const unitLabel = TYPE_CONFIG[product.type].label.toLowerCase();
    const description = DESCRIPTIONS[product.type];

    // ── Synthetic 3-year price history, deterministic per product ──────────────
    const dailyHistory = useMemo(
        () => generateDailyHistory(product.id, product.price, product.ytd, product.type),
        [product.id, product.price, product.ytd, product.type]
    );
    const intradayHistory = useMemo(
        () => generateIntradayHistory(product.id, dailyHistory),
        [product.id, dailyHistory]
    );
    const chartData = useMemo(
        () => sliceForTimeframe(dailyHistory, intradayHistory, timeframe),
        [dailyHistory, intradayHistory, timeframe]
    );
    const chartPositive = chartData.length >= 2
        ? chartData[chartData.length - 1].price >= chartData[0].price
        : true;

    return (
        <Layout noPadding backgroundColor="bg-white" mobileHeaderHidden>
            <div className="flex flex-col h-full overflow-hidden">

                {/* ── MOBILE: full-screen redesign ────────────────────────────── */}
                <div className="md:hidden flex flex-col h-full overflow-hidden bg-white">

                    {/* Header: back + centered product name (no divider) */}
                    <div className="shrink-0 px-4 py-3 flex items-center gap-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="w-8 h-8 flex items-center justify-center text-black active:opacity-60 transition-opacity flex-shrink-0"
                            aria-label="Go back"
                        >
                            <ChevronLeft size={22} strokeWidth={2} />
                        </button>
                        <div className="flex-1 text-center text-black text-base font-semibold font-['DM_Sans'] truncate">
                            {productName}
                        </div>
                        <div className="w-8 h-8 flex-shrink-0" />
                    </div>

                    {/* Price + chart — ~2/3 of remaining screen, chart runs edge to edge */}
                    <div className="flex-[2] min-h-0 flex flex-col">
                        {/* Company + price row */}
                        <div className="shrink-0 px-6 pb-2 flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <div className="text-zinc-500 text-sm font-medium font-['DM_Sans'] mb-1 truncate">{productSubName}</div>
                                <div className="flex items-end gap-1 flex-wrap">
                                    <span className="text-black text-4xl font-bold font-['DM_Sans']">{price}</span>
                                    <span className="text-black text-base font-normal font-['DM_Sans'] mb-1">/{unitLabel}</span>
                                </div>
                                <div className="flex items-center gap-1 mt-1">
                                    <UpArrowIcon />
                                    <span className="text-[#05C702] text-xs font-bold font-['DM_Sans']">{priceChange}</span>
                                    <span className="text-neutral-700 text-xs font-normal font-['DM_Sans']"> Last Updated today</span>
                                </div>
                            </div>
                            <div className="w-14 h-14 bg-white rounded-[38px] shadow-[0px_1px_1px_0px_rgba(0,0,0,0.25)] outline outline-1 outline-offset-[-1px] outline-gray-300 flex items-center justify-center overflow-hidden p-2.5 flex-shrink-0">
                                <img src={companyLogo} alt={companyName} className="w-full h-full object-contain" />
                            </div>
                        </div>

                        {/* Chart — edge to edge, fills remaining height of this block */}
                        <div className="flex-1 min-h-0">
                            <InvestChart data={chartData} timeframe={timeframe} positive={chartPositive} />
                        </div>
                    </div>

                    {/* Scrollable info section */}
                    <div className="flex-1 overflow-y-auto min-h-0">

                        {/* Timeframe tabs — animated sliding pill */}
                        <div className="px-6 mt-2">
                            <SegmentedControl
                                options={TIMEFRAMES.map(tf => ({
                                    value: tf,
                                    label: <span className="text-[10px] font-bold font-['Inter']">{tf}</span>,
                                }))}
                                value={timeframe}
                                onChange={v => setTimeframe(v as Timeframe)}
                                variant="flat"
                                inactiveTextClassName="text-neutral-400"
                                className="h-9"
                            />
                        </div>

                        {/* Type badge + investors */}
                        <div className="px-6 mt-5 flex items-center gap-6">
                            <div className="h-5 px-[5px] py-1 bg-white rounded-[20px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.25)] outline outline-[0.5px] outline-offset-[-0.5px] outline-neutral-200 flex items-center gap-[5px]">
                                <div className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${TYPE_CONFIG[product.type].dot}`} />
                                <span className="text-gray-800 text-xs font-medium font-['DM_Sans']">{TYPE_CONFIG[product.type].label}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <UsersIcon />
                                <span className="text-black text-xs font-normal font-['DM_Sans']">{product.productInvestors} Investors</span>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="px-6 mt-5">
                            <p className="text-neutral-800 text-sm font-light font-['DM_Sans'] leading-relaxed">
                                {description}
                            </p>
                            <button className="text-neutral-800 text-sm font-normal font-['DM_Sans'] underline mt-3">
                                Read Full Prospectus
                            </button>
                        </div>

                        <div className="h-4" />
                    </div>

                    {/* Fixed bottom CTA — tighter padding */}
                    <div className="shrink-0 border-t border-gray-100 bg-white px-6 pt-3 pb-3">
                        <div className="flex items-center justify-center gap-2 text-zinc-600 text-xs font-normal font-['DM_Sans'] mb-2.5">
                            <ShieldIcon />
                            Secure payments powered by Lenco
                        </div>
                        <button
                            onClick={() => setIsBuyModalOpen(true)}
                            className="w-full h-11 bg-black text-white text-xs font-bold font-['DM_Sans'] rounded-lg active:opacity-80 transition-opacity"
                        >
                            Invest
                        </button>
                    </div>
                </div>

                {/* ── DESKTOP: unchanged legacy layout ────────────────────────── */}
                <div className="hidden md:block overflow-y-auto flex-1 bg-slate-100">
                    <div className="flex flex-col p-6">
                        <div className="w-full bg-white rounded-[20px] p-6 shadow-sm flex flex-col gap-6 min-h-[600px]">

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

                            <div className="flex justify-between items-center py-4 border-b border-gray-100">
                                <div className="flex flex-col gap-1">
                                    <h1 className="text-black text-2xl font-semibold font-['DM_Sans']">{productName}</h1>
                                    <div className="text-zinc-500 text-sm font-medium font-['Figtree']">{productSubName}</div>
                                </div>
                                <button
                                    onClick={() => setIsBuyModalOpen(true)}
                                    className="px-6 py-2 bg-blue-600 text-white text-sm font-bold font-['DM_Sans'] rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    Buy Units
                                </button>
                            </div>

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
                            </div>

                            <div className="px-2 pt-2 h-[260px]">
                                <InvestChart data={chartData} timeframe={timeframe} positive={chartPositive} />
                            </div>

                            <div className="flex items-center gap-2">
                                {TIMEFRAMES.map(tf => {
                                    const active = tf === timeframe;
                                    return (
                                        <button
                                            key={tf}
                                            onClick={() => setTimeframe(tf)}
                                            className={`px-3 py-1.5 rounded-md text-center text-xs font-bold font-['Inter'] transition-colors ${
                                                active ? 'bg-gray-100 text-black' : 'text-neutral-400 hover:text-gray-600'
                                            }`}
                                        >
                                            {tf}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex flex-col gap-4 mt-4">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-1 text-black text-xs font-normal">
                                        <StarIcon /> {provider.reviews}
                                    </div>
                                    <div className="flex items-center gap-1 text-black text-xs font-normal">
                                        <UsersIcon /> {product.productInvestors} Investors
                                    </div>
                                </div>
                                <div className="text-neutral-800 text-base font-light font-['Figtree'] max-w-3xl leading-relaxed">
                                    {description}
                                </div>
                                <div className="text-neutral-800 text-base font-normal font-['Figtree'] underline cursor-pointer hover:text-blue-600 transition-colors">
                                    Read Full Prospectus
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

            </div>

            <InvestPaymentFlow
                open={isBuyModalOpen}
                onClose={() => setIsBuyModalOpen(false)}
                product={product}
                provider={provider}
            />
        </Layout>
    );
};
