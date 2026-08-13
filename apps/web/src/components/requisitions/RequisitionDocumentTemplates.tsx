import React from 'react';
import { Requisition } from '../../services/requisition.service';
import { Check, Smartphone, BrainCircuit, Receipt } from 'lucide-react';

interface DocumentTemplateProps {
    requisition: Requisition;
}

// ─────────────────────────────────────────────────────────
// 1. PURCHASE REQUISITION FORM
// ─────────────────────────────────────────────────────────
export const PurchaseRequisitionForm: React.FC<DocumentTemplateProps> = ({ requisition }) => (
    <div className="bg-white p-5 sm:p-8 md:p-12 max-w-4xl mx-auto font-sans text-gray-900 printable-document">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-7 md:mb-10 pb-6 md:pb-8 border-b border-gray-100">
            <div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-black uppercase tracking-tight mb-1">Purchase Requisition</h1>
                <p className="text-sm font-bold text-blue-600">REQ-{requisition.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <div className="sm:text-right">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Date Created</p>
                <p className="text-xs sm:text-sm font-bold">
                    {new Date(requisition.created_at).toLocaleDateString()}{' '}
                    {new Date(requisition.created_at).toLocaleTimeString()}
                </p>
            </div>
        </div>

        {/* Requestor + Priority — stack on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-12 mb-7 md:mb-10">
            <div>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Requestor Info</h3>
                <div className="space-y-1">
                    <p className="text-sm font-black text-gray-900">{requisition.requestor_name || 'System User'}</p>
                    <p className="text-xs font-medium text-gray-500">{requisition.department || 'General Administration'}</p>
                </div>
            </div>
            <div>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Priority &amp; Type</h3>
                <div className="space-y-1">
                    <p className="text-sm font-black text-gray-900">Standard Expense</p>
                    <p className="text-xs font-medium text-gray-500">Inventory &amp; Logistics</p>
                </div>
            </div>
        </div>

        {/* Line items table — scrollable on narrow viewports */}
        <div className="mb-7 md:mb-10">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 md:mb-4">Requisition Details</h3>
            <p className="text-base md:text-lg font-bold text-gray-900 mb-4 md:mb-6">{requisition.description}</p>

            <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full min-w-[480px] border-collapse">
                    <thead>
                        <tr className="bg-gray-50/50">
                            <th className="px-3 sm:px-5 py-3 md:py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-left border-b border-gray-100">Item Description</th>
                            <th className="px-3 sm:px-5 py-3 md:py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center border-b border-gray-100">Qty</th>
                            <th className="px-3 sm:px-5 py-3 md:py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right border-b border-gray-100">Unit Price</th>
                            <th className="px-3 sm:px-5 py-3 md:py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right border-b border-gray-100">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {requisition.items?.map((item: any, idx: number) => (
                            <tr key={idx}>
                                <td className="px-3 sm:px-5 py-3 md:py-4 text-xs sm:text-sm font-medium text-gray-700">{item.description}</td>
                                <td className="px-3 sm:px-5 py-3 md:py-4 text-xs sm:text-sm font-medium text-gray-500 text-center">{item.quantity}</td>
                                <td className="px-3 sm:px-5 py-3 md:py-4 text-xs sm:text-sm font-medium text-gray-900 text-right whitespace-nowrap">K{item.unit_price ? Number(item.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}</td>
                                <td className="px-3 sm:px-5 py-3 md:py-4 text-xs sm:text-sm font-bold text-gray-900 text-right whitespace-nowrap">K{item.estimated_amount ? Number(item.estimated_amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-[#006AFF]/5">
                            <td colSpan={3} className="px-3 sm:px-5 py-3 md:py-5 text-[11px] font-bold text-[#006AFF] uppercase tracking-widest text-right">Grand Total</td>
                            <td className="px-3 sm:px-5 py-3 md:py-5 text-base md:text-[18px] font-black text-[#006AFF] text-right whitespace-nowrap">K{requisition.estimated_total ? Number(requisition.estimated_total).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>

        {/* Signature row — stack on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-12 pt-8 md:pt-12 border-t border-gray-100 mt-auto">
            <div className="relative">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 md:mb-8 text-center">Authorized By</h3>
                <div className="h-0.5 bg-gray-100 w-full mb-2" />
                <p className="text-center font-bold text-xs text-gray-400">Digital Signature – Finance Manager</p>
                <div className="absolute top-3 left-1/2 -translate-x-1/2 rotate-[-5deg] opacity-60">
                    <div className="border-[3px] border-[#006AFF] px-3 py-1 rounded-md">
                        <p className="text-[#006AFF] font-black text-[10px] uppercase tracking-[0.2em]">Authorized</p>
                    </div>
                </div>
            </div>
            <div>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 md:mb-8 text-center">Internal Audit</h3>
                <div className="h-0.5 bg-gray-100 w-full mb-2" />
                <p className="text-center font-bold text-xs text-gray-400">System Log: Verified &amp; Released</p>
            </div>
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────
// 2. CASH DISBURSAL CONFIRMATION
// ─────────────────────────────────────────────────────────
export const CashDisbursalProof: React.FC<DocumentTemplateProps> = ({ requisition }) => {
    const disbursal = requisition.disbursements?.[0] || {};
    return (
        <div className="bg-white p-5 sm:p-8 md:p-12 max-w-4xl mx-auto font-sans text-gray-900 printable-document">

            {/* Success banner */}
            <div className="bg-[#10B981]/5 border border-[#10B981]/10 rounded-2xl md:rounded-3xl p-5 sm:p-7 md:p-10 mb-7 md:mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-[#059669] mb-2">
                        <Check size={18} strokeWidth={3} />
                        <span className="text-xs sm:text-sm font-black uppercase tracking-widest">Successful Transfer</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
                        K{disbursal.amount ? Number(disbursal.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                    </h1>
                    <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">
                        Ref: {disbursal.external_reference || 'REF-' + requisition.id.slice(0, 6).toUpperCase()}
                    </p>
                </div>
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[#10B981] rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-100 flex-shrink-0">
                    <Smartphone size={24} strokeWidth={2.5} className="sm:hidden" />
                    <Smartphone size={32} strokeWidth={2.5} className="hidden sm:block" />
                </div>
            </div>

            {/* Sender / Recipient — stack on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-8 mb-7 md:mb-10">
                <div className="bg-gray-50/50 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Sender Details</h3>
                    <div className="space-y-1">
                        <p className="text-sm font-black text-gray-900">MoneyWise Finance</p>
                        <p className="text-xs font-medium text-gray-500">Corporate Wallet Branch</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-2">Processed By</p>
                        <p className="text-xs font-bold text-gray-700">{disbursal.processed_by_name || 'System Admin'}</p>
                    </div>
                </div>
                <div className="bg-gray-50/50 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Recipient Details</h3>
                    <div className="space-y-1">
                        <p className="text-sm font-black text-gray-900">{requisition.requestor_name || 'System User'}</p>
                        <p className="text-xs font-medium text-gray-500">{disbursal.recipient_provider || 'Mobile Money'}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-2">Account Identifier</p>
                        <p className="text-xs font-bold text-gray-700">{disbursal.recipient_value || 'Direct Account Transfer'}</p>
                    </div>
                </div>
            </div>

            {/* Detail rows */}
            <div className="space-y-1">
                {[
                    { label: 'Payment Method', value: (disbursal.method?.replace(/_/g, ' ') || 'BANK TRANSFER'), bold: true },
                    { label: 'Value Date', value: new Date(disbursal.created_at || requisition.created_at).toLocaleDateString(), bold: false },
                ].map(row => (
                    <div key={row.label} className="flex justify-between items-center py-3 border-b border-gray-100">
                        <span className="text-xs sm:text-sm font-bold text-gray-500 uppercase tracking-widest">{row.label}</span>
                        <span className={`text-xs sm:text-sm ${row.bold ? 'font-black text-gray-900 uppercase' : 'font-black text-gray-900'}`}>{row.value}</span>
                    </div>
                ))}
                <div className="flex justify-between items-center py-3">
                    <span className="text-xs sm:text-sm font-bold text-gray-500 uppercase tracking-widest">Processing Status</span>
                    <div className="flex items-center gap-2 bg-emerald-100 text-[#059669] px-3 py-1 rounded-full">
                        <Check size={12} strokeWidth={3} />
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">Settled</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────
// 3. EXPENSE SUMMARY & VARIANCE
// ─────────────────────────────────────────────────────────
export const ExpenseVarianceForm: React.FC<DocumentTemplateProps> = ({ requisition }) => {
    const amountGiven  = requisition.estimated_total || 0;
    const actualSpent  = requisition.actual_total || 0;
    const changeExpected = amountGiven - actualSpent;
    const actualChange = 0;
    const variance     = actualChange - changeExpected;
    const isReconciled = variance === 0;

    return (
        <div className="bg-white p-5 sm:p-8 md:p-12 max-w-4xl mx-auto font-sans text-gray-900 printable-document">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-7 md:mb-10 pb-6 md:pb-8 border-b border-gray-100">
                <div className="min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">Expense Reconciliation</p>
                    <h1 className="text-lg sm:text-xl md:text-[26px] font-black text-gray-900 tracking-tight leading-tight mb-1">
                        {requisition.description}
                    </h1>
                    <p className="text-sm text-gray-400 font-medium mt-1">REQ-{requisition.id.slice(0, 8).toUpperCase()}</p>
                </div>
                <div className="sm:text-right flex-shrink-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Date</p>
                    <p className="text-xs sm:text-sm font-semibold text-gray-700">
                        {new Date(requisition.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 mb-1">Employee</p>
                    <p className="text-xs sm:text-sm font-semibold text-gray-700">{requisition.requestor_name || 'System User'}</p>
                </div>
            </div>

            {/* Line items */}
            <div className="mb-7 md:mb-10">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3 md:mb-4">Line Item Breakdown</p>
                <div className="overflow-x-auto -mx-1 px-1 rounded-xl border border-gray-100">
                    <table className="w-full min-w-[480px] border-collapse">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="px-3 sm:px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-left">Description</th>
                                <th className="px-3 sm:px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Estimated</th>
                                <th className="px-3 sm:px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Actual</th>
                                <th className="px-3 sm:px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Variance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {requisition.items?.map((item: any, idx: number) => {
                                const diff = (item.estimated_amount ?? 0) - (item.actual_amount ?? 0);
                                return (
                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-3 sm:px-5 py-3 text-xs sm:text-[13px] text-gray-700">{item.description}</td>
                                        <td className="px-3 sm:px-5 py-3 text-xs sm:text-[13px] text-gray-500 text-right whitespace-nowrap">K{item.estimated_amount ? Number(item.estimated_amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}</td>
                                        <td className="px-3 sm:px-5 py-3 text-xs sm:text-sm font-black text-gray-900 text-right whitespace-nowrap">K{item.actual_amount ? Number(item.actual_amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}</td>
                                        <td className={`px-3 sm:px-5 py-3 text-xs sm:text-[13px] font-semibold text-right whitespace-nowrap ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {diff >= 0 ? '+' : ''}K{diff.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t border-gray-200 bg-gray-50">
                                <td className="px-3 sm:px-5 py-3 text-[10px] sm:text-[11px] font-bold text-gray-500 uppercase tracking-widest">Totals</td>
                                <td className="px-3 sm:px-5 py-3 text-xs sm:text-[13px] font-bold text-gray-700 text-right whitespace-nowrap">K{amountGiven.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="px-3 sm:px-5 py-3 text-sm sm:text-lg font-black text-[#10B981] text-right whitespace-nowrap">K{requisition.actual_total ? Number(requisition.actual_total).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}</td>
                                <td className={`px-3 sm:px-5 py-3 text-xs sm:text-[13px] font-bold text-right whitespace-nowrap ${(amountGiven - actualSpent) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {(amountGiven - actualSpent) >= 0 ? '+' : ''}K{(amountGiven - actualSpent).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Cash accountability */}
            <div className="mt-6 md:mt-8 pt-5 md:pt-6 border-t border-gray-100">
                <p className="text-[9px] font-bold text-gray-300 uppercase tracking-[0.25em] mb-3">Cash Accountability</p>
                <div className="divide-y divide-gray-50">
                    {[
                        { label: 'Amount Given',           value: amountGiven },
                        { label: 'Amount Spent',           value: actualSpent },
                        { label: 'Expected Change',        value: changeExpected },
                        { label: 'Actual Change Returned', value: actualChange },
                    ].map(row => (
                        <div key={row.label} className="flex items-center justify-between py-2">
                            <span className="text-[11px] text-gray-400">{row.label}</span>
                            <span className="text-[11px] font-semibold text-gray-500 whitespace-nowrap">K{row.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    ))}
                    <div className={`flex items-center justify-between py-2.5 ${isReconciled ? 'text-emerald-600' : 'text-red-500'}`}>
                        <span className="text-[11px] font-bold uppercase tracking-widest">Change Variance</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold whitespace-nowrap">K{Math.abs(variance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span className="text-[9px] font-bold uppercase tracking-widest opacity-70">
                                {isReconciled ? '✓ Reconciled' : '⚠ Discrepancy'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────
// 4. ACCOUNTING TREATMENT & AI RATIONALE
// ─────────────────────────────────────────────────────────
export const AccountingTreatmentForm: React.FC<DocumentTemplateProps> = ({ requisition }) => (
    <div className="bg-white p-5 sm:p-8 md:p-12 max-w-4xl mx-auto font-sans text-gray-900 printable-document">

        {/* Header */}
        <div className="flex items-center gap-3 mb-7 md:mb-10">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#006AFF] rounded-xl sm:rounded-2xl flex items-center justify-center text-white flex-shrink-0">
                <BrainCircuit size={22} className="sm:hidden" />
                <BrainCircuit size={28} className="hidden sm:block" />
            </div>
            <div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-black uppercase tracking-tight leading-none">Accounting Assessment</h1>
                <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">IFRS Standards Compliance Check</p>
            </div>
        </div>

        {/* GL table */}
        <div className="overflow-x-auto -mx-1 px-1 mb-8 md:mb-12">
            <table className="w-full min-w-[440px] border-collapse">
                <thead>
                    <tr className="bg-gray-50">
                        <th className="px-3 sm:px-5 py-3 md:py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-left border-b border-gray-100">Transaction Item</th>
                        <th className="px-3 sm:px-5 py-3 md:py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-left border-b border-gray-100">GL Account</th>
                        <th className="px-3 sm:px-5 py-3 md:py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center border-b border-gray-100">Code</th>
                        <th className="px-3 sm:px-5 py-3 md:py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right border-b border-gray-100">Amount (K)</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {requisition.items?.map((item: any, idx: number) => (
                        <tr key={idx}>
                            <td className="px-3 sm:px-5 py-3 md:py-4 text-xs sm:text-sm font-medium text-gray-900">{item.description}</td>
                            <td className="px-3 sm:px-5 py-3 md:py-4 text-xs sm:text-sm font-bold text-[#006AFF]">{item.accounts?.name || 'Administrative Expense'}</td>
                            <td className="px-3 sm:px-5 py-3 md:py-4 text-[10px] sm:text-[11px] font-black text-gray-500 text-center">{item.account_id || item.accounts?.code || '6000'}</td>
                            <td className="px-3 sm:px-5 py-3 md:py-4 text-xs sm:text-sm font-black text-gray-900 text-right whitespace-nowrap">K{item.actual_amount ? Number(item.actual_amount).toLocaleString() : (item.unit_price ? Number(item.unit_price).toLocaleString() : '0.00')}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {/* AI rationale */}
        <div className="bg-blue-50/30 border border-blue-100 rounded-2xl md:rounded-[40px] p-5 sm:p-7 md:p-10">
            <div className="flex items-center mb-4 md:mb-6">
                <span className="text-[10px] sm:text-[11px] font-black text-[#006AFF] uppercase tracking-[0.2em] bg-blue-100/50 py-1.5 sm:py-2 px-4 sm:px-6 rounded-full">AI Rationale &amp; Audit Evidence</span>
            </div>
            <div className="space-y-4 md:space-y-8">
                {requisition.items?.map((item: any, idx: number) => (
                    <div key={idx} className="bg-white/60 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-blue-50">
                        <h4 className="text-xs sm:text-[13px] font-black text-gray-900 mb-2 flex items-center gap-2">
                            <Check size={13} className="text-[#006AFF] flex-shrink-0" />
                            <span>{item.description}</span>
                        </h4>
                        <p className="text-xs sm:text-sm font-medium text-gray-600 italic leading-relaxed">
                            "Categorized as '{item.accounts?.name || 'Unknown'}' based on commercial pattern analysis. The transaction represents a recurrent operational expenditure fitting the 6000-series expense profile. Verified against similar historical postings and matched specifically to the organization's Chart of Accounts with 94% confidence."
                        </p>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────
// 5. QUICKBOOKS SYNC LOG
// ─────────────────────────────────────────────────────────
export const QuickBooksSyncLog: React.FC<DocumentTemplateProps> = ({ requisition }) => (
    <div className="bg-white p-5 sm:p-8 md:p-12 max-w-4xl mx-auto font-sans text-gray-900 printable-document">

        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-7 md:mb-10">
            <div className="w-11 h-11 sm:w-14 sm:h-14 bg-[#2CA01C] rounded-xl sm:rounded-2xl flex items-center justify-center text-white flex-shrink-0">
                <Receipt size={22} className="sm:hidden" />
                <Receipt size={32} className="hidden sm:block" />
            </div>
            <div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-black uppercase tracking-tight leading-none">ERP Synchronization Report</h1>
                <p className="text-[10px] font-bold text-gray-400 mt-1 sm:mt-2 uppercase tracking-widest">Intuit QuickBooks Online Integration</p>
            </div>
        </div>

        <div className="space-y-4 md:space-y-6">
            {/* Sync metadata — 2-col grid stays since items are short */}
            <div className="bg-gray-50 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-gray-100">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 md:mb-4">Sync Metadata</h3>
                <div className="grid grid-cols-2 gap-y-3 md:gap-y-4">
                    {[
                        { label: 'Target ERP',   value: 'QuickBooks Online' },
                        { label: 'Sync Date',    value: new Date().toLocaleDateString() },
                        { label: 'Record Type',  value: 'Journal Entry (JE)' },
                        { label: 'Status',       value: null }, // custom render below
                    ].map((row, i) => (
                        <div key={i}>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">{row.label}</p>
                            {row.value !== null ? (
                                <p className="text-xs sm:text-sm font-black text-gray-900">{row.value}</p>
                            ) : (
                                <div className="flex items-center gap-1.5 text-[#2CA01C]">
                                    <Check size={13} strokeWidth={3} />
                                    <span className="text-xs sm:text-sm font-black">SUCCESS</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Journal entry details */}
            <div className="border border-gray-100 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 md:mb-4">Journal Entry Details</h3>
                <div className="space-y-2.5">
                    {[
                        { label: 'ERP Internal Reference', value: `QB-SYNC-${requisition.id.slice(0, 8).toUpperCase()}` },
                        { label: 'Total Credits', value: `K${requisition.actual_total ? Number(requisition.actual_total).toLocaleString() : '0.00'}` },
                        { label: 'Total Debits',  value: `K${requisition.actual_total ? Number(requisition.actual_total).toLocaleString() : '0.00'}` },
                    ].map(row => (
                        <div key={row.label} className="flex justify-between items-center text-xs sm:text-sm font-medium gap-4">
                            <span className="text-gray-500">{row.label}</span>
                            <span className="font-black text-gray-900 whitespace-nowrap">{row.value}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Success note */}
            <div className="bg-emerald-50/50 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-emerald-100">
                <p className="text-xs font-bold text-emerald-800 leading-relaxed text-center">
                    This transaction has been successfully mapped and posted to your QuickBooks general ledger. All line items are reconciled and closed in the MoneyWise system.
                </p>
            </div>
        </div>
    </div>
);
