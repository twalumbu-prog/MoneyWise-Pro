import React, { useState } from 'react';
import { ArrowLeft, X, AlertCircle, Loader2, Landmark, TrendingUp, ChevronRight, Star, Users } from 'lucide-react';
import { requisitionService } from '../../services/requisition.service';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface MobileInvestWizardProps {
    isOpen: boolean;
    onClose: () => void;
}

type Stage = 1 | 2 | 3 | 4;

const INVEST_PROVIDERS = [
    {
        id: 'lenco',
        name: 'Lenco Capital',
        description: 'High yield mutual funds and managed portfolios.',
        icon: TrendingUp,
        color: 'text-emerald-500',
        bg: 'bg-emerald-50',
        products: [
            { 
                id: 'mutual', 
                name: 'Equity Fund',
                code: 'Lenco Inv Ltd. (LHE5)',
                price: 'K478.0',
                priceUnit: '/unit',
                ytdPerformance: 'K4,275 - (34%) YTD',
                reviews: '4.9 (320 Reviews)',
                investors: '232,000 Investors',
                description: 'A diversified mutual fund focusing on high-growth equities and stable government bonds. Managed by expert portfolio managers.',
                expectedReturn: '12-15%', 
                risk: 'Medium' 
            }
        ]
    },
    {
        id: 'stanbic',
        name: 'Stanbic Bank',
        description: 'Secure fixed deposits and government bonds.',
        icon: Landmark,
        color: 'text-blue-500',
        bg: 'bg-blue-50',
        products: [
            { 
                id: 'fixed', 
                name: 'Fixed Deposit',
                code: 'Stanbic Bank Ltd. (SB-FD)',
                price: 'K1,000.0',
                priceUnit: '/min. deposit',
                ytdPerformance: 'K90 - (9%) YTD',
                reviews: '4.7 (120 Reviews)',
                investors: '150,000 Investors',
                description: 'A secure fixed deposit offering guaranteed returns over a fixed period. Low risk and highly stable.',
                expectedReturn: '9%', 
                risk: 'Low' 
            },
            { 
                id: 'bonds', 
                name: 'Gov Bonds',
                code: 'Bank of Zambia (BOZ-GB)',
                price: 'K5,000.0',
                priceUnit: '/min. deposit',
                ytdPerformance: 'K550 - (11%) YTD',
                reviews: '4.8 (85 Reviews)',
                investors: '45,000 Investors',
                description: 'Government backed bonds providing secure and steady interest payments over 5 to 10 years.',
                expectedReturn: '11%', 
                risk: 'Low' 
            }
        ]
    }
];

export const MobileInvestWizard: React.FC<MobileInvestWizardProps> = ({ isOpen, onClose }) => {
    const [stage, setStage] = useState<Stage>(1);
    const [providerId, setProviderId] = useState<string | null>(null);
    const [productId, setProductId] = useState<string | null>(null);

    const [amount, setAmount] = useState<number>(0);
    const [frequency, setFrequency] = useState<'ONCE' | 'MONTHLY'>('MONTHLY');
    const [remarks, setRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedProvider = INVEST_PROVIDERS.find(p => p.id === providerId);
    const selectedProduct = selectedProvider?.products.find(p => p.id === productId);

    const reset = () => {
        setStage(1);
        setProviderId(null);
        setProductId(null);
        setAmount(0);
        setFrequency('MONTHLY');
        setRemarks('');
        setError(null);
    };

    React.useEffect(() => {
        if (isOpen) reset();
    }, [isOpen]);

    const handleClose = () => { reset(); onClose(); };

    const handleBack = () => {
        if (stage === 4) setStage(3);
        else if (stage === 3) setStage(2);
        else if (stage === 2) setStage(1);
        else handleClose();
    };

    const handleProceedProvider = (pId: string) => {
        setProviderId(pId);
        setStage(2);
    };

    const handleProceedProduct = (prodId: string) => {
        setProductId(prodId);
        setStage(3);
    };

    const handleSubmit = async () => {
        if (!amount || amount <= 0) { setError('Please enter a valid investment amount.'); return; }
        setSubmitting(true);
        setError(null);
        try {
            await requisitionService.create({
                description: `INVESTMENT: ${selectedProvider?.name} - ${selectedProduct?.name} (${frequency})`,
                department: 'HR',
                type: 'OTHER',
                estimated_total: amount,
                remarks: remarks || `Auto-Invest: ${frequency}`,
                items: [
                    {
                        description: `Investment Deduction - ${selectedProduct?.name}`,
                        quantity: 1,
                        unit_price: amount
                    }
                ]
            } as any);
            reset();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const title = stage === 3 || stage === 4 ? selectedProduct?.name || 'Invest' : 'Invest';

    return (
        <div className="fixed inset-0 z-[80] bg-white flex flex-col font-['Figtree'] overflow-hidden">
            {/* Top Bar matching user request */}
            <div className="w-full h-16 inline-flex flex-col justify-center items-center gap-1 shrink-0 bg-white z-10">
                <div className="self-stretch px-5 py-3 bg-white border-b border-gray-100 inline-flex justify-between items-center gap-4">
                    <button onClick={handleBack} className="w-8 h-8 flex justify-center items-center active:scale-95 transition-all text-black hover:bg-gray-50 rounded-full">
                        <ArrowLeft size={24} />
                    </button>
                    <div className="flex-1 text-center text-black text-base font-semibold truncate px-2">{title}</div>
                    <button onClick={handleClose} className="w-8 h-8 flex justify-center items-center active:scale-95 transition-all text-gray-400 hover:bg-gray-50 rounded-full">
                        <X size={24} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto w-full relative">
                {error && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3 m-5">
                        <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-red-700 font-medium">{error}</p>
                    </div>
                )}

                {stage === 1 && (
                    <div className="px-5 py-6 space-y-6">
                        <div>
                            <h2 className="text-[20px] font-bold text-gray-900">Choose a Partner</h2>
                            <p className="text-[13px] text-gray-500 mt-1">Select an investment provider to see their products.</p>
                        </div>
                        <div className="space-y-4">
                            {INVEST_PROVIDERS.map(provider => (
                                <button
                                    key={provider.id}
                                    onClick={() => handleProceedProvider(provider.id)}
                                    className="w-full text-left bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4 hover:border-emerald-200 hover:shadow-md transition-all active:scale-[0.98]"
                                >
                                    <div className={`w-12 h-12 rounded-xl ${provider.bg} ${provider.color} flex items-center justify-center shrink-0`}>
                                        <provider.icon size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-gray-900">{provider.name}</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">{provider.description}</p>
                                    </div>
                                    <ChevronRight size={20} className="text-gray-300" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {stage === 2 && selectedProvider && (
                    <div className="px-5 py-6 space-y-6">
                        <div>
                            <h2 className="text-[20px] font-bold text-gray-900">Select a Product</h2>
                            <p className="text-[13px] text-gray-500 mt-1">Available investment options from {selectedProvider.name}.</p>
                        </div>
                        <div className="space-y-4">
                            {selectedProvider.products.map(product => (
                                <button
                                    key={product.id}
                                    onClick={() => handleProceedProduct(product.id)}
                                    className="w-full text-left bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between hover:border-emerald-200 hover:shadow-md transition-all active:scale-[0.98]"
                                >
                                    <div>
                                        <h3 className="font-bold text-gray-900">{product.name}</h3>
                                        <div className="flex gap-3 mt-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                {product.expectedReturn} Return
                                            </span>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                {product.risk} Risk
                                            </span>
                                        </div>
                                    </div>
                                    <ChevronRight size={20} className="text-gray-300" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {stage === 3 && selectedProduct && selectedProvider && (
                    <div className="w-full pb-36">
                        {/* Product Header Info */}
                        <div className="w-full border-b border-gray-100 inline-flex justify-start items-center gap-2.5 bg-white">
                            <div className="flex-1 px-8 py-4 inline-flex flex-col justify-start items-start gap-1">
                                <div className="inline-flex justify-center items-center gap-2.5">
                                    <div className="justify-start text-zinc-500 text-sm font-medium">{selectedProduct.code}</div>
                                </div>
                                <div className="self-stretch h-11 inline-flex justify-start items-center gap-24">
                                    <div className="flex-1 flex justify-start items-end">
                                        <div className="justify-end">
                                            <span className="text-black text-4xl font-bold">{selectedProduct.price}</span>
                                            <span className="text-black text-base font-normal">{selectedProduct.priceUnit}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="self-stretch inline-flex justify-start items-center gap-1">
                                    <div className="h-4 py-0.5 rounded-[50px] flex justify-start items-center gap-1">
                                        <TrendingUp size={14} className="text-green-500" />
                                        <div className="justify-end text-green-500 text-xs font-bold">{selectedProduct.ytdPerformance}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 px-8 py-4 inline-flex flex-col justify-center items-end gap-1">
                                <div className="w-14 h-14 p-2.5 bg-white rounded-full shadow-[0px_1px_1px_0px_rgba(0,0,0,0.25)] outline outline-1 outline-offset-[-1px] outline-gray-300 flex flex-col justify-center items-center gap-2.5 overflow-hidden">
                                    <div className={`w-8 h-8 rounded-full ${selectedProvider.bg} ${selectedProvider.color} flex items-center justify-center shrink-0`}>
                                        <selectedProvider.icon size={16} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Chart Area Mock */}
                        <div className="w-full relative py-6 flex flex-col items-center">
                            <div className="w-full h-56 relative px-4 flex mb-6">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={[
                                        { label: 'Jan', value: 30000 },
                                        { label: 'Feb', value: 34000 },
                                        { label: 'Mar', value: 32000 },
                                        { label: 'Apr', value: 45000 },
                                        { label: 'May', value: 58000 },
                                        { label: 'Jun', value: 67000 },
                                    ]}>
                                        <defs>
                                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis 
                                            dataKey="label" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 600 }} 
                                            dy={10}
                                        />
                                        <YAxis 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                            tickFormatter={v => (v / 1000) + 'k'}
                                            dx={-10}
                                        />
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            itemStyle={{ color: '#10B981', fontWeight: 'bold' }}
                                        />
                                        <Area 
                                            type="monotone" 
                                            dataKey="value" 
                                            stroke="#10B981" 
                                            strokeWidth={3}
                                            fillOpacity={1} 
                                            fill="url(#colorValue)" 
                                            activeDot={{ r: 6, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Timeframe Controls */}
                            <div className="w-full px-8 h-8 inline-flex justify-start items-center">
                                <div className="flex-1 self-stretch flex justify-between items-center">
                                    <div className="w-8 h-7 px-1 py-2.5 bg-gray-100 rounded-md inline-flex flex-col justify-center items-center gap-2.5 cursor-pointer">
                                        <div className="self-stretch text-center justify-end text-black text-[10px] font-bold font-['Inter']">1D</div>
                                    </div>
                                    <div className="w-8 h-7 px-1 py-2.5 rounded-md inline-flex flex-col justify-center items-center gap-2.5 cursor-pointer">
                                        <div className="self-stretch text-center justify-end text-neutral-400 text-[10px] font-bold font-['Inter']">1W</div>
                                    </div>
                                    <div className="w-8 h-7 px-1 py-2.5 rounded-md inline-flex flex-col justify-center items-center gap-2.5 cursor-pointer">
                                        <div className="self-stretch text-center justify-end text-neutral-400 text-[10px] font-bold font-['Inter']">1M</div>
                                    </div>
                                    <div className="w-8 h-7 px-1 py-2.5 rounded-md inline-flex flex-col justify-center items-center gap-2.5 cursor-pointer">
                                        <div className="self-stretch text-center justify-end text-neutral-400 text-[10px] font-bold font-['Inter']">3M</div>
                                    </div>
                                    <div className="w-8 h-7 px-1 py-2.5 rounded-md inline-flex flex-col justify-center items-center gap-2.5 cursor-pointer">
                                        <div className="text-center justify-end text-neutral-400 text-[10px] font-bold font-['Inter']">YTD</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* About Section */}
                        <div className="w-full px-8 py-6 inline-flex flex-col justify-start items-start gap-4">
                            <div className="h-6 inline-flex justify-start items-center gap-6">
                                <div className="flex justify-center items-center gap-1.5">
                                    <Star size={14} className="text-yellow-500 fill-yellow-500" />
                                    <div className="justify-start text-black text-xs font-normal font-['DM_Sans']">{selectedProduct.reviews}</div>
                                </div>
                                <div className="flex justify-center items-center gap-1.5">
                                    <Users size={14} className="text-black" />
                                    <div className="justify-start text-black text-xs font-normal font-['DM_Sans']">{selectedProduct.investors}</div>
                                </div>
                            </div>
                            <div className="self-stretch inline-flex justify-start items-start gap-1">
                                <div className="flex-1 justify-start text-neutral-800 text-sm leading-relaxed font-light">
                                    {selectedProduct.description}
                                </div>
                            </div>
                            <div className="inline-flex justify-start items-center gap-1 cursor-pointer">
                                <div className="justify-end text-neutral-800 text-sm font-normal underline">Read Full Prospectus</div>
                            </div>
                        </div>
                    </div>
                )}

                {stage === 4 && selectedProduct && (
                    <div className="px-6 py-6 space-y-6">
                        <div>
                            <h2 className="text-[20px] font-bold text-gray-900">Investment Setup</h2>
                            <p className="text-[13px] text-gray-500 mt-1">Configure your investment for {selectedProduct.name}</p>
                        </div>

                        <div className="space-y-5">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Amount (K)</label>
                                <input
                                    type="number"
                                    value={amount || ''}
                                    onChange={e => setAmount(Number(e.target.value))}
                                    placeholder="0.00"
                                    className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#10B981]/20 focus:border-[#10B981] transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Deduction Frequency</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setFrequency('ONCE')}
                                        className={`py-3 rounded-2xl text-sm font-bold transition-all border ${
                                            frequency === 'ONCE'
                                                ? 'bg-black text-white border-black shadow-lg'
                                                : 'bg-gray-50 text-gray-600 border-gray-100'
                                        }`}
                                    >
                                        One-Time
                                    </button>
                                    <button
                                        onClick={() => setFrequency('MONTHLY')}
                                        className={`py-3 flex flex-col items-center justify-center rounded-2xl transition-all border ${
                                            frequency === 'MONTHLY'
                                                ? 'bg-black text-white border-black shadow-lg'
                                                : 'bg-gray-50 text-gray-600 border-gray-100'
                                        }`}
                                    >
                                        <span className="text-sm font-bold">Auto-Invest</span>
                                        <span className={`text-[9px] font-medium uppercase tracking-widest ${frequency === 'MONTHLY' ? 'text-gray-300' : 'text-gray-400'}`}>
                                            Monthly Payroll
                                        </span>
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Additional Remarks (optional)</label>
                                <textarea
                                    value={remarks}
                                    onChange={e => setRemarks(e.target.value)}
                                    rows={3}
                                    placeholder="Any notes..."
                                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-[#10B981]/20 focus:border-[#10B981] transition-all"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Sticky Action Bars */}
            {stage === 3 && selectedProduct && (
                <div className="w-full h-auto px-7 py-5 absolute bottom-0 bg-white border-t border-gray-100 inline-flex flex-col justify-start items-center gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
                    <div className="w-full inline-flex justify-center items-center gap-2">
                        <div className="text-center justify-start text-zinc-600 text-xs font-normal">Secure payments powered by {selectedProvider?.name}</div>
                    </div>
                    <button
                        onClick={() => setStage(4)}
                        className="w-full h-14 bg-black hover:bg-neutral-800 rounded-xl inline-flex justify-center items-center text-white text-lg font-bold active:scale-[0.98] transition-all"
                    >
                        Invest
                    </button>
                </div>
            )}

            {stage === 4 && (
                <div className="w-full h-auto px-7 py-5 absolute bottom-0 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || amount <= 0}
                        className="w-full h-14 bg-black hover:bg-neutral-800 rounded-xl inline-flex justify-center items-center text-white text-lg font-bold active:scale-[0.98] transition-all disabled:opacity-60 gap-2"
                    >
                        {submitting ? <><Loader2 size={18} className="animate-spin" />Processing...</> : 'Confirm Investment'}
                    </button>
                </div>
            )}
        </div>
    );
};
