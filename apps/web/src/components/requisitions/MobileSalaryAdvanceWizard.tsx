import React, { useState } from 'react';
import { ArrowRight, X, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { requisitionService } from '../../services/requisition.service';

interface MobileSalaryAdvanceWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const DEPARTMENTS = ['Finance', 'Admin', 'HR', 'IT', 'Education', 'Transportation', 'Stocks', 'Maintenance', 'Catering'];

type Stage = 1 | 2;

export const MobileSalaryAdvanceWizard: React.FC<MobileSalaryAdvanceWizardProps> = ({ isOpen, onClose, onSuccess }) => {
    const [stage, setStage] = useState<Stage>(1);
    const [staffName, setStaffName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [department, setDepartment] = useState('');
    const [amount, setAmount] = useState<number>(0);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setStage(1);
        setStaffName('');
        setEmployeeId('');
        setDepartment('');
        setAmount(0);
        setReason('');
        setError(null);
    };

    React.useEffect(() => {
        if (isOpen) {
            reset();
        }
    }, [isOpen]);

    const handleClose = () => { reset(); onClose(); };

    const handleProceed = () => {
        if (!staffName.trim()) { setError('Please enter the staff member\'s name.'); return; }
        if (!employeeId.trim()) { setError('Please enter the employee ID.'); return; }
        if (!amount || amount <= 0) { setError('Please enter a valid advance amount.'); return; }
        if (!department) { setError('Please select a department.'); return; }
        setError(null);
        setStage(2);
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await requisitionService.create({
                description: `ADVANCE: ${staffName} - ${reason || 'Salary Advance'}`,
                department,
                type: 'ADVANCE',
                estimated_total: amount,
                staff_name: staffName,
                employee_id: employeeId,
                loan_amount: amount,
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
        <div className="fixed inset-0 z-[80] bg-white flex flex-col md:hidden">
            {/* App Top Bar - Logo and User */}
            <div className="h-16 bg-white border-b border-gray-100 px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center">
                    <span className="text-xl font-medium text-brand-navy tracking-tight">MoneyWise</span>
                    <span className="text-xl font-bold text-[#006AFF] ml-1 tracking-tight">Pro</span>
                </div>
            </div>

            {/* Header with Title and Cancel Button */}
            <div className="px-6 py-4 flex items-center justify-between shrink-0">
                <h1 className="text-[18px] font-bold text-brand-navy">New Salary Advance</h1>
                <button
                    onClick={handleClose}
                    className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-brand-navy shadow-[0_4px_12px_rgba(0,106,255,0.4)] active:scale-95 transition-all"
                >
                    <X size={16} strokeWidth={3} />
                </button>
            </div>

            {/* Progress */}
            <div className="px-6 pt-4 shrink-0">
                <div className="flex gap-2">
                    {([1, 2] as Stage[]).map(s => (
                        <div key={s} className={`h-1 flex-1 rounded-full transition-all ${stage >= s ? 'bg-emerald-500' : 'bg-gray-100'}`} />
                    ))}
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                    Step {stage} of 2 — {stage === 1 ? 'Advance Details' : 'Summary'}
                </p>
            </div>

            {/* Content */}
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
                            <h2 className="text-[20px] font-bold text-brand-navy">Advance Details</h2>
                            <p className="text-[13px] text-gray-400 mt-1">Fill in the details for the salary advance</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Staff Member Name</label>
                                <input
                                    type="text"
                                    value={staffName}
                                    onChange={e => setStaffName(e.target.value)}
                                    placeholder="Enter full name"
                                    className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Employee ID</label>
                                <input
                                    type="text"
                                    value={employeeId}
                                    onChange={e => setEmployeeId(e.target.value)}
                                    placeholder="e.g. EMP-001"
                                    className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Department</label>
                                <div className="relative">
                                    <select
                                        value={department}
                                        onChange={e => setDepartment(e.target.value)}
                                        className="w-full appearance-none border border-gray-200 rounded-2xl px-4 py-3.5 text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                    >
                                        <option value="">Select Department</option>
                                        {DEPARTMENTS.map(d => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Advance Amount (K)</label>
                                <input
                                    type="number"
                                    value={amount || ''}
                                    onChange={e => setAmount(Number(e.target.value))}
                                    placeholder="0.00"
                                    className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Reason for Advance (optional)</label>
                                <textarea
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    rows={3}
                                    placeholder="Briefly explain why this advance is needed..."
                                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                            </div>
                        </div>

                        {amount > 0 && (
                            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white">
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-2">Advance Amount</p>
                                <p className="text-3xl font-black">K{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                <p className="text-[11px] opacity-70 mt-1">To be deducted from next payroll</p>
                            </div>
                        )}
                    </>
                )}

                {stage === 2 && (
                    <>
                        <div>
                            <h2 className="text-[20px] font-bold text-brand-navy">Advance Summary</h2>
                            <p className="text-[13px] text-gray-400 mt-1">Review and confirm the advance request</p>
                        </div>

                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-3">
                            {[
                                { label: 'Staff Member', value: staffName },
                                { label: 'Employee ID', value: employeeId },
                                { label: 'Department', value: department },
                                { label: 'Advance Amount', value: `K${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
                            ].map(row => (
                                <div key={row.label} className="flex justify-between items-center">
                                    <span className="text-xs text-gray-500">{row.label}</span>
                                    <span className="text-sm font-bold text-gray-900">{row.value}</span>
                                </div>
                            ))}
                            {reason && (
                                <div className="pt-2 border-t border-gray-200">
                                    <p className="text-xs text-gray-400">Reason: {reason}</p>
                                </div>
                            )}
                        </div>

                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                            <p className="text-xs text-emerald-700 font-medium">This salary advance will be deducted from the employee's next payroll cycle.</p>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="w-full h-14 bg-emerald-500 rounded-2xl text-white font-black text-base active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {submitting ? <><Loader2 size={18} className="animate-spin" />Submitting...</> : 'Submit Advance Request'}
                        </button>
                    </>
                )}
            </div>

            {stage === 1 && (
                <div className="shrink-0 p-6 pb-8 flex justify-end">
                    <button onClick={handleProceed} className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center text-white active:scale-90 transition-all">
                        <ArrowRight size={24} />
                    </button>
                </div>
            )}
        </div>
    );
};
