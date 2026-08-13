import React, { useState } from 'react';
import { ArrowLeft, X, AlertCircle, Loader2, ChevronRight, Building2 } from 'lucide-react';
import { requisitionService } from '../../services/requisition.service';
import { useAuth } from '../../context/AuthContext';

interface MobileStaffLoanWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type Stage = 1 | 2 | 3;

// ── External loan providers ───────────────────────────────────────────────────
const EXTERNAL_LOAN_PROVIDERS = [
    {
        id: 'unifi',
        name: 'UniFi',
        description: 'Fast personal loans with flexible repayment terms.',
        logo: '/loan-logos/unifi.jpeg',
        products: [
            { id: 'unifi-personal', name: 'UniFi Personal Loan',   interest: 18, maxPeriod: 48 },
            { id: 'unifi-salary',   name: 'UniFi Salary Advance',   interest: 12, maxPeriod: 12 },
        ],
    },
    {
        id: 'lolc',
        name: 'LOLC Finance',
        description: 'Micro and SME finance solutions across Zambia.',
        logo: '/loan-logos/lolc.jpg',
        products: [
            { id: 'lolc-micro',  name: 'LOLC Micro Loan',    interest: 20, maxPeriod: 36 },
            { id: 'lolc-salary', name: 'LOLC Salary Loan',   interest: 15, maxPeriod: 24 },
        ],
    },
    {
        id: 'finca',
        name: 'FINCA',
        description: 'Community-focused microfinance and personal loans.',
        logo: '/loan-logos/finca.png',
        products: [
            { id: 'finca-personal', name: 'FINCA Personal Loan',  interest: 19, maxPeriod: 36 },
            { id: 'finca-group',    name: 'FINCA Group Loan',      interest: 16, maxPeriod: 24 },
        ],
    },
    {
        id: 'agora',
        name: 'Agora Microfinance',
        description: 'Affordable microfinance for salaried employees.',
        logo: '/loan-logos/agora.png',
        products: [
            { id: 'agora-standard', name: 'Agora Standard Loan',   interest: 17, maxPeriod: 36 },
            { id: 'agora-express',  name: 'Agora Express Loan',    interest: 14, maxPeriod: 12 },
        ],
    },
    {
        id: 'bayport',
        name: 'Bayport',
        description: 'Payroll-linked personal loans with competitive rates.',
        logo: '/loan-logos/bayport.jpeg',
        products: [
            { id: 'bayport-personal', name: 'Bayport Personal Loan', interest: 16, maxPeriod: 60 },
            { id: 'bayport-top-up',   name: 'Bayport Top-Up Loan',   interest: 14, maxPeriod: 36 },
        ],
    },
    {
        id: 'mfz',
        name: 'Microfinance Zambia',
        description: 'Inclusive financial services for working Zambians.',
        logo: '/loan-logos/microfinance-zambia.jpeg',
        products: [
            { id: 'mfz-salary',   name: 'MFZ Salary Loan',    interest: 18, maxPeriod: 36 },
            { id: 'mfz-personal', name: 'MFZ Personal Loan',  interest: 21, maxPeriod: 48 },
        ],
    },
];

// ── Wizard ────────────────────────────────────────────────────────────────────
export const MobileStaffLoanWizard: React.FC<MobileStaffLoanWizardProps> = ({ isOpen, onClose, onSuccess }) => {
    const { organizationName, organizationLogoUrl } = useAuth();

    const [stage, setStage] = useState<Stage>(1);
    const [providerId, setProviderId] = useState<string | null>(null);
    const [productId, setProductId] = useState<string | null>(null);

    const [staffName, setStaffName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [amount, setAmount] = useState<number>(0);
    const [repaymentPeriod, setRepaymentPeriod] = useState(12);
    const [remarks, setRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Build full provider list: internal org first, then externals
    const LOAN_PROVIDERS = [
        {
            id: 'internal',
            name: `Internal Organization`,
            description: `Direct staff loan from ${organizationName ?? 'your organisation'} with favourable rates.`,
            logo: organizationLogoUrl ?? null,
            products: [
                { id: 'standard', name: 'Standard Staff Loan', interest: 15, maxPeriod: 36 },
            ],
        },
        ...EXTERNAL_LOAN_PROVIDERS,
    ];

    const selectedProvider = LOAN_PROVIDERS.find(p => p.id === providerId);
    const selectedProduct  = selectedProvider?.products.find(p => p.id === productId);

    const interestRate    = selectedProduct?.interest ?? 15;
    const totalRepayment  = amount * (1 + interestRate / 100);
    const monthlyDeduction = repaymentPeriod > 0 ? totalRepayment / repaymentPeriod : 0;

    const reset = () => {
        setStage(1);
        setProviderId(null);
        setProductId(null);
        setStaffName('');
        setEmployeeId('');
        setAmount(0);
        setRepaymentPeriod(12);
        setRemarks('');
        setError(null);
    };

    React.useEffect(() => { if (isOpen) reset(); }, [isOpen]);

    const handleClose   = () => { reset(); onClose(); };
    const handleBack    = () => {
        if (stage === 3) setStage(2);
        else if (stage === 2) setStage(1);
        else handleClose();
    };

    const handleProceedProvider = (pId: string) => { setProviderId(pId); setStage(2); };
    const handleProceedProduct  = (prodId: string) => { setProductId(prodId); setStage(3); };

    const handleSubmit = async () => {
        if (!staffName.trim()) { setError("Please enter the staff member's name."); return; }
        if (!employeeId.trim()) { setError('Please enter the employee ID.'); return; }
        if (!amount || amount <= 0) { setError('Please enter a valid loan amount.'); return; }
        setError(null);
        setSubmitting(true);
        try {
            await requisitionService.create({
                description: `LOAN: ${staffName} - ${selectedProvider?.name} - ${selectedProduct?.name} - ${remarks || 'Staff Loan'}`,
                department: 'HR',
                type: 'LOAN',
                estimated_total: amount,
                staff_name: staffName,
                employee_id: employeeId,
                loan_amount: amount,
                repayment_period: repaymentPeriod,
                interest_rate: interestRate,
                monthly_deduction: monthlyDeduction,
            } as any);
            reset();
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    // Dynamic top-bar title
    const title = stage === 1
        ? 'New Staff Loan'
        : stage === 2
            ? selectedProvider?.name ?? 'New Staff Loan'
            : `${selectedProvider?.name ?? ''} — ${selectedProduct?.name ?? ''}`;

    return (
        <div className="fixed inset-0 z-[80] bg-white flex flex-col font-['Figtree'] overflow-hidden">

            {/* ── Top bar (same pattern as MobileInvestWizard) ── */}
            <div className="w-full h-16 shrink-0 bg-white z-10">
                <div className="self-stretch px-5 py-3 h-full bg-white border-b border-gray-100 flex justify-between items-center gap-4">
                    <button
                        onClick={handleBack}
                        className="w-8 h-8 flex justify-center items-center active:scale-95 transition-all text-black hover:bg-gray-50 rounded-full"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div className="flex-1 text-center text-black text-base font-semibold truncate px-2">{title}</div>
                    <button
                        onClick={handleClose}
                        className="w-8 h-8 flex justify-center items-center active:scale-95 transition-all text-gray-400 hover:bg-gray-50 rounded-full"
                    >
                        <X size={24} />
                    </button>
                </div>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto w-full relative">

                {error && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3 m-5">
                        <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-red-700 font-medium">{error}</p>
                    </div>
                )}

                {/* Stage 1 — Select Provider */}
                {stage === 1 && (
                    <div className="px-5 py-6 space-y-6">
                        <div>
                            <h2 className="text-[20px] font-bold text-gray-900">Select a Provider</h2>
                            <p className="text-[13px] text-gray-500 mt-1">Choose where you want to request your loan from.</p>
                        </div>
                        <div className="space-y-4">
                            {LOAN_PROVIDERS.map(provider => (
                                <button
                                    key={provider.id}
                                    onClick={() => handleProceedProvider(provider.id)}
                                    className="w-full text-left bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4 hover:border-blue-200 hover:shadow-md transition-all active:scale-[0.98]"
                                >
                                    {/* Logo / fallback icon */}
                                    <div className="w-12 h-12 rounded-xl border border-gray-100 bg-white shadow-sm flex items-center justify-center shrink-0 overflow-hidden p-1">
                                        {provider.logo ? (
                                            <img src={provider.logo} alt={provider.name} className="w-full h-full object-contain" />
                                        ) : (
                                            <Building2 size={24} className="text-blue-400" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-gray-900 truncate">{provider.name}</h3>
                                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{provider.description}</p>
                                    </div>
                                    <ChevronRight size={20} className="text-gray-300 shrink-0" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Stage 2 — Select Product */}
                {stage === 2 && selectedProvider && (
                    <div className="px-5 py-6 space-y-6">
                        <div>
                            <h2 className="text-[20px] font-bold text-gray-900">Select a Product</h2>
                            <p className="text-[13px] text-gray-500 mt-1">Choose a loan product from {selectedProvider.name}.</p>
                        </div>
                        <div className="space-y-4">
                            {selectedProvider.products.map(product => (
                                <button
                                    key={product.id}
                                    onClick={() => handleProceedProduct(product.id)}
                                    className="w-full text-left bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between hover:border-blue-200 hover:shadow-md transition-all active:scale-[0.98]"
                                >
                                    <div>
                                        <h3 className="font-bold text-gray-900">{product.name}</h3>
                                        <div className="flex gap-3 mt-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                                {product.interest}% Interest
                                            </span>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                Up to {product.maxPeriod}mo
                                            </span>
                                        </div>
                                    </div>
                                    <ChevronRight size={20} className="text-gray-300 shrink-0" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Stage 3 — Loan Details */}
                {stage === 3 && selectedProduct && selectedProvider && (
                    <div className="px-5 py-6 space-y-5 pb-32">
                        <div>
                            <h2 className="text-[20px] font-bold text-gray-900">Loan Details</h2>
                            <p className="text-[13px] text-gray-500 mt-1">Fill in the details for your {selectedProduct.name}.</p>
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Staff Member Name</label>
                            <input
                                type="text"
                                value={staffName}
                                onChange={e => setStaffName(e.target.value)}
                                placeholder="Enter full name"
                                className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Employee ID</label>
                            <input
                                type="text"
                                value={employeeId}
                                onChange={e => setEmployeeId(e.target.value)}
                                placeholder="e.g. EMP-001"
                                className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Loan Amount (K)</label>
                            <input
                                type="number"
                                value={amount || ''}
                                onChange={e => setAmount(Number(e.target.value))}
                                placeholder="0.00"
                                className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Repayment Period</label>
                            <div className="grid grid-cols-3 gap-2">
                                {[3, 6, 12, 18, 24, 36].filter(m => m <= selectedProduct.maxPeriod).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setRepaymentPeriod(m)}
                                        className={`py-3 rounded-2xl text-sm font-bold transition-all border ${
                                            repaymentPeriod === m
                                                ? 'bg-[#006AFF] text-white border-[#006AFF] shadow-lg shadow-blue-100'
                                                : 'bg-gray-50 text-gray-600 border-gray-100'
                                        }`}
                                    >
                                        {m}mo
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Additional Remarks (optional)</label>
                            <textarea
                                value={remarks}
                                onChange={e => setRemarks(e.target.value)}
                                rows={3}
                                placeholder="Any notes..."
                                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] transition-all"
                            />
                        </div>

                        {amount > 0 && (
                            <div className="bg-gradient-to-br from-[#006AFF] to-blue-600 rounded-2xl p-5 text-white shadow-xl shadow-blue-500/20">
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-4 text-blue-100">Repayment Preview</p>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-baseline border-b border-white/10 pb-3">
                                        <span className="text-xs text-blue-100">Monthly Deduction (Payroll)</span>
                                        <span className="text-xl font-black">K{monthlyDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between items-baseline pt-1">
                                        <span className="text-xs text-blue-100">Total (incl. {interestRate}% interest)</span>
                                        <span className="text-sm font-bold">K{totalRepayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Sticky submit button (stage 3 only) ── */}
            {stage === 3 && (
                <div className="w-full px-5 py-5 absolute bottom-0 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || amount <= 0 || !staffName.trim() || !employeeId.trim()}
                        className="w-full h-14 bg-black hover:bg-neutral-800 rounded-xl inline-flex justify-center items-center text-white text-lg font-bold active:scale-[0.98] transition-all disabled:opacity-60 gap-2"
                    >
                        {submitting ? <><Loader2 size={18} className="animate-spin" />Submitting...</> : 'Submit Request'}
                    </button>
                </div>
            )}
        </div>
    );
};
