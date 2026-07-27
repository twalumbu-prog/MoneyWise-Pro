import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { requisitionService } from '../../services/requisition.service';

interface DesktopStaffLoanWorkspaceProps {
    onClose: () => void;
    onSuccess: () => void;
}

type Stage = 1 | 2;

export const DesktopStaffLoanWorkspace: React.FC<DesktopStaffLoanWorkspaceProps> = ({ onClose, onSuccess }) => {
    const [stage, setStage] = useState<Stage>(1);
    const [staffName, setStaffName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [amount, setAmount] = useState<number>(0);
    const [repaymentPeriod, setRepaymentPeriod] = useState(12);
    const [remarks, setRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const interestRate = 15;
    const totalRepayment = amount * (1 + interestRate / 100);
    const monthlyDeduction = repaymentPeriod > 0 ? totalRepayment / repaymentPeriod : 0;

    const handleProceed = () => {
        if (!staffName.trim()) { setError('Please enter the staff member\'s name.'); return; }
        if (!employeeId.trim()) { setError('Please enter the employee ID.'); return; }
        if (!amount || amount <= 0) { setError('Please enter a valid loan amount.'); return; }
        setError(null);
        setStage(2);
    };

    const handleBack = () => {
        setError(null);
        if (stage === 2) setStage(1);
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await requisitionService.create({
                description: `LOAN: ${staffName} - ${remarks || 'Staff Loan'}`,
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
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="bg-white rounded-[20px] p-3.5 flex flex-col gap-4 h-[calc(100vh-140px)] shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center justify-between shrink-0">
                <button
                    onClick={onClose}
                    className="h-8 pl-2.5 pr-3.5 bg-white rounded-lg outline outline-[0.5px] outline-offset-[-0.5px] outline-[#E8EEF8] flex items-center gap-1.5 hover:bg-[#F3F5FC] transition-colors"
                >
                    <ArrowLeft size={15} className="text-[#111827]" />
                    <span className="text-sm font-bold text-[#111827]">New Staff Loan</span>
                </button>
            </div>

            <div className="flex-1 min-h-0 rounded-2xl outline outline-[0.5px] outline-offset-[-0.5px] outline-[#E8EEF8] bg-white overflow-y-auto">
                <div className="max-w-2xl mx-auto p-8 animate-in fade-in zoom-in-95 duration-200 pb-20">
                    {error && (
                        <div className="mb-6 bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
                            <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-red-700 font-medium">{error}</p>
                        </div>
                    )}

                    {stage === 1 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Loan Details</h2>
                                <p className="text-xs text-gray-400 mt-1">Fill in the details for the staff loan</p>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Staff Member Name</label>
                                    <input
                                        type="text"
                                        value={staffName}
                                        onChange={e => setStaffName(e.target.value)}
                                        placeholder="Enter full name"
                                        className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Employee ID</label>
                                    <input
                                        type="text"
                                        value={employeeId}
                                        onChange={e => setEmployeeId(e.target.value)}
                                        placeholder="e.g. EMP-001"
                                        className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Loan Amount (K)</label>
                                    <input
                                        type="number"
                                        value={amount || ''}
                                        onChange={e => setAmount(Number(e.target.value))}
                                        placeholder="0.00"
                                        className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Repayment Period</label>
                                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                        {[3, 6, 12, 18, 24, 36].map(m => (
                                            <button
                                                key={m}
                                                onClick={() => setRepaymentPeriod(m)}
                                                className={`py-3 rounded-xl text-sm font-bold transition-all border ${
                                                    repaymentPeriod === m
                                                        ? 'bg-[#006AFF] text-white border-[#006AFF] shadow-md shadow-blue-100'
                                                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                                }`}
                                            >
                                                {m}mo
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Additional Remarks (optional)</label>
                                    <textarea
                                        value={remarks}
                                        onChange={e => setRemarks(e.target.value)}
                                        rows={3}
                                        placeholder="Any notes..."
                                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] transition-all"
                                    />
                                </div>
                            </div>

                            {/* Live Calculation Preview */}
                            {amount > 0 && (
                                <div className="bg-[#F3F5FC] border border-[#E8EEF8] rounded-xl p-5 mt-6">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">Estimated Repayment</p>
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-[10px] text-gray-500 mb-1">Monthly Deduction</p>
                                            <p className="text-2xl font-black text-[#0058DB]">K{monthlyDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] text-gray-500 mb-1">Total (incl. {interestRate}% interest)</p>
                                            <p className="text-base font-bold text-gray-900">K{totalRepayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {stage === 2 && (
                        <div className="max-w-md mx-auto space-y-6">
                            <div className="text-center py-6">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Loan Summary</h3>
                                <h2 className="text-4xl font-black text-gray-900">
                                    K{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </h2>
                            </div>

                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-5 space-y-4">
                                {[
                                    { label: 'Staff Member', value: staffName },
                                    { label: 'Employee ID', value: employeeId },
                                    { label: 'Repayment Period', value: `${repaymentPeriod} months` },
                                    { label: 'Interest Rate', value: `${interestRate}%` },
                                    { label: 'Monthly Deduction', value: `K${monthlyDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                                    { label: 'Total Repayment', value: `K${totalRepayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                                ].map(row => (
                                    <div key={row.label} className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">{row.label}</span>
                                        <span className="font-semibold text-gray-900">{row.value}</span>
                                    </div>
                                ))}
                                {remarks && (
                                    <div className="pt-4 border-t border-gray-200 mt-2">
                                        <p className="text-xs text-gray-500 whitespace-pre-wrap"><span className="font-semibold text-gray-900">Remarks:</span> {remarks}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between gap-4 pt-2 shrink-0">
                <button
                    onClick={handleBack}
                    disabled={stage === 1 || submitting}
                    className={`h-10 px-5 rounded-xl flex items-center gap-1.5 transition-all text-xs font-bold ${
                        stage > 1 
                            ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50' 
                            : 'bg-white border border-gray-100 text-gray-300 cursor-not-allowed'
                    }`}
                >
                    <ArrowLeft size={16} />
                    Previous
                </button>
                
                {stage === 1 ? (
                    <button
                        onClick={handleProceed}
                        className="h-10 px-6 rounded-xl bg-[#0058DB] text-xs font-bold text-white flex items-center gap-1.5 hover:bg-blue-700 transition-colors"
                    >
                        Next
                        <ArrowRight size={16} />
                    </button>
                ) : (
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="h-10 px-8 rounded-xl bg-[#0058DB] text-xs font-bold text-white flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                        {submitting ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={16} />
                                Submit Loan
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};
