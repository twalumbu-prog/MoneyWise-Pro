import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, AlertCircle, Loader2, CheckCircle, ChevronDown } from 'lucide-react';
import { requisitionService } from '../../services/requisition.service';

interface DesktopSalaryAdvanceWorkspaceProps {
    onClose: () => void;
    onSuccess: () => void;
}

const DEPARTMENTS = ['Finance', 'Admin', 'HR', 'IT', 'Education', 'Transportation', 'Stocks', 'Maintenance', 'Catering'];

type Stage = 1 | 2;

export const DesktopSalaryAdvanceWorkspace: React.FC<DesktopSalaryAdvanceWorkspaceProps> = ({ onClose, onSuccess }) => {
    const [stage, setStage] = useState<Stage>(1);
    const [staffName, setStaffName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [department, setDepartment] = useState('');
    const [amount, setAmount] = useState<number>(0);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleProceed = () => {
        if (!staffName.trim()) { setError('Please enter the staff member\'s name.'); return; }
        if (!employeeId.trim()) { setError('Please enter the employee ID.'); return; }
        if (!department) { setError('Please select a department.'); return; }
        if (!amount || amount <= 0) { setError('Please enter a valid advance amount.'); return; }
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
                description: `ADVANCE: ${staffName} - ${reason || 'Salary Advance'}`,
                department,
                type: 'ADVANCE',
                estimated_total: amount,
                staff_name: staffName,
                employee_id: employeeId,
                loan_amount: amount,
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
                    <span className="text-sm font-bold text-[#111827]">New Salary Advance</span>
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
                                <h2 className="text-lg font-bold text-gray-900">Advance Details</h2>
                                <p className="text-xs text-gray-400 mt-1">Fill in the details for the salary advance</p>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Staff Member Name</label>
                                    <input
                                        type="text"
                                        value={staffName}
                                        onChange={e => setStaffName(e.target.value)}
                                        placeholder="Enter full name"
                                        className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Employee ID</label>
                                    <input
                                        type="text"
                                        value={employeeId}
                                        onChange={e => setEmployeeId(e.target.value)}
                                        placeholder="e.g. EMP-001"
                                        className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Department</label>
                                    <div className="relative">
                                        <select
                                            value={department}
                                            onChange={e => setDepartment(e.target.value)}
                                            className="w-full appearance-none h-12 bg-white border border-gray-200 rounded-xl px-4 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                        >
                                            <option value="">Select Department</option>
                                            {DEPARTMENTS.map(d => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Advance Amount (K)</label>
                                    <input
                                        type="number"
                                        value={amount || ''}
                                        onChange={e => setAmount(Number(e.target.value))}
                                        placeholder="0.00"
                                        className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Reason for Advance (optional)</label>
                                    <textarea
                                        value={reason}
                                        onChange={e => setReason(e.target.value)}
                                        rows={3}
                                        placeholder="Briefly explain why this advance is needed..."
                                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                    />
                                </div>
                            </div>

                            {amount > 0 && (
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 mt-6">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/70 mb-2">Advance Amount</p>
                                    <p className="text-3xl font-black text-emerald-600">K{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    <p className="text-[11px] text-emerald-700/80 mt-1">To be deducted from next payroll</p>
                                </div>
                            )}
                        </div>
                    )}

                    {stage === 2 && (
                        <div className="max-w-md mx-auto space-y-6">
                            <div className="text-center py-6">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Advance Summary</h3>
                                <h2 className="text-4xl font-black text-gray-900">
                                    K{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </h2>
                            </div>

                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-5 space-y-4">
                                {[
                                    { label: 'Staff Member', value: staffName },
                                    { label: 'Employee ID', value: employeeId },
                                    { label: 'Department', value: department },
                                ].map(row => (
                                    <div key={row.label} className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">{row.label}</span>
                                        <span className="font-semibold text-gray-900">{row.value}</span>
                                    </div>
                                ))}
                                {reason && (
                                    <div className="pt-4 border-t border-gray-200 mt-2">
                                        <p className="text-xs text-gray-500 whitespace-pre-wrap"><span className="font-semibold text-gray-900">Reason:</span> {reason}</p>
                                    </div>
                                )}
                            </div>

                            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mt-4">
                                <p className="text-xs text-emerald-700 font-medium">This salary advance will be deducted from the employee's next payroll cycle.</p>
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
                        className="h-10 px-6 rounded-xl bg-emerald-500 text-xs font-bold text-white flex items-center gap-1.5 hover:bg-emerald-600 transition-colors"
                    >
                        Next
                        <ArrowRight size={16} />
                    </button>
                ) : (
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="h-10 px-8 rounded-xl bg-emerald-500 text-xs font-bold text-white flex items-center justify-center gap-2 hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                    >
                        {submitting ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={16} />
                                Submit Advance
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};
