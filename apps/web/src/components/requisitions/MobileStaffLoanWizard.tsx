import React, { useState } from 'react';
import { ArrowRight, X, AlertCircle, Loader2, Building, Landmark, ChevronRight } from 'lucide-react';
import { requisitionService } from '../../services/requisition.service';

interface MobileStaffLoanWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type Stage = 1 | 2 | 3;

const LOAN_PROVIDERS = [
    {
        id: 'school',
        name: 'Internal (The School)',
        description: 'Direct staff loans from the institution with favorable rates.',
        icon: Building,
        color: 'text-blue-500',
        bg: 'bg-blue-50',
        products: [
            { id: 'standard', name: 'Standard Staff Loan', interest: 15, maxPeriod: 36 }
        ]
    },
    {
        id: 'zanaco',
        name: 'Zanaco',
        description: 'External bank loans with longer repayment periods.',
        icon: Landmark,
        color: 'text-orange-500',
        bg: 'bg-orange-50',
        products: [
            { id: 'personal', name: 'Zanaco Personal Loan', interest: 21, maxPeriod: 60 },
            { id: 'auto', name: 'Zanaco Auto Loan', interest: 18, maxPeriod: 48 }
        ]
    }
];

export const MobileStaffLoanWizard: React.FC<MobileStaffLoanWizardProps> = ({ isOpen, onClose, onSuccess }) => {
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

    const selectedProvider = LOAN_PROVIDERS.find(p => p.id === providerId);
    const selectedProduct = selectedProvider?.products.find(p => p.id === productId);

    const interestRate = selectedProduct?.interest || 15;
    const totalRepayment = amount * (1 + interestRate / 100);
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

    React.useEffect(() => {
        if (isOpen) reset();
    }, [isOpen]);

    const handleClose = () => { reset(); onClose(); };

    const handleProceedProvider = (pId: string) => {
        setProviderId(pId);
        setStage(2);
    };

    const handleProceedProduct = (prodId: string) => {
        setProductId(prodId);
        setStage(3);
    };

    const handleProceedDetails = () => {
        if (!staffName.trim()) { setError('Please enter the staff member\'s name.'); return; }
        if (!employeeId.trim()) { setError('Please enter the employee ID.'); return; }
        if (!amount || amount <= 0) { setError('Please enter a valid loan amount.'); return; }
        setError(null);
        handleSubmit();
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
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

    return (
        <div className="fixed inset-0 z-[80] bg-white flex flex-col">
            <div className="h-16 bg-white border-b border-gray-100 px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center">
                    <span className="text-xl font-medium text-brand-navy tracking-tight">MoneyWise</span>
                    <span className="text-xl font-bold text-[#006AFF] ml-1 tracking-tight">Pro</span>
                </div>
            </div>

            <div className="px-6 py-4 flex items-center justify-between shrink-0">
                <h1 className="text-[18px] font-bold text-brand-navy">New Staff Loan</h1>
                <button
                    onClick={handleClose}
                    className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-brand-navy shadow-[0_4px_12px_rgba(0,106,255,0.4)] active:scale-95 transition-all"
                >
                    <X size={16} strokeWidth={3} />
                </button>
            </div>

            <div className="px-6 pt-4 shrink-0">
                <div className="flex gap-2">
                    {([1, 2, 3] as Stage[]).map(s => (
                        <div key={s} className={`h-1 flex-1 rounded-full transition-all ${stage >= s ? 'bg-[#006AFF]' : 'bg-gray-100'}`} />
                    ))}
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                    Step {stage} of 3 — {stage === 1 ? 'Select Provider' : stage === 2 ? 'Select Product' : 'Loan Details'}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
                {error && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
                        <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-red-700 font-medium">{error}</p>
                    </div>
                )}

                {stage === 1 && (
                    <>
                        <div>
                            <h2 className="text-[20px] font-bold text-brand-navy">Select a Provider</h2>
                            <p className="text-[13px] text-gray-400 mt-1">Choose where you want to request your loan from.</p>
                        </div>
                        <div className="space-y-4">
                            {LOAN_PROVIDERS.map(provider => (
                                <button
                                    key={provider.id}
                                    onClick={() => handleProceedProvider(provider.id)}
                                    className="w-full text-left bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4 hover:border-blue-200 hover:shadow-md transition-all active:scale-[0.98]"
                                >
                                    <div className={`w-12 h-12 rounded-xl ${provider.bg} ${provider.color} flex items-center justify-center shrink-0`}>
                                        <provider.icon size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-brand-navy">{provider.name}</h3>
                                        <p className="text-xs text-gray-400 mt-0.5">{provider.description}</p>
                                    </div>
                                    <ChevronRight size={20} className="text-gray-300" />
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {stage === 2 && selectedProvider && (
                    <>
                        <div>
                            <h2 className="text-[20px] font-bold text-brand-navy">Select a Product</h2>
                            <p className="text-[13px] text-gray-400 mt-1">Choose a loan product from {selectedProvider.name}.</p>
                        </div>
                        <div className="space-y-4">
                            {selectedProvider.products.map(product => (
                                <button
                                    key={product.id}
                                    onClick={() => handleProceedProduct(product.id)}
                                    className="w-full text-left bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between hover:border-blue-200 hover:shadow-md transition-all active:scale-[0.98]"
                                >
                                    <div>
                                        <h3 className="font-bold text-brand-navy">{product.name}</h3>
                                        <p className="text-xs text-gray-400 mt-1">Interest: <span className="font-bold text-gray-700">{product.interest}%</span></p>
                                    </div>
                                    <ChevronRight size={20} className="text-gray-300" />
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {stage === 3 && selectedProduct && (
                    <>
                        <div>
                            <h2 className="text-[20px] font-bold text-brand-navy">Loan Details</h2>
                            <p className="text-[13px] text-gray-400 mt-1">Fill in the details for your {selectedProduct.name}</p>
                        </div>

                        <div className="space-y-4 pb-20">
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
                    </>
                )}
            </div>

            {stage === 3 && (
                <div className="fixed bottom-0 left-0 right-0 p-6 bg-white border-t border-gray-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-10">
                    <button
                        onClick={handleProceedDetails}
                        disabled={submitting || amount <= 0}
                        className="w-full h-14 bg-[#006AFF] rounded-2xl text-white font-black text-base active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {submitting ? <><Loader2 size={18} className="animate-spin" />Submitting...</> : 'Submit Request'}
                    </button>
                </div>
            )}
        </div>
    );
};
