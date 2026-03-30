import React from 'react';
import { Requisition } from '../../services/requisition.service';
import { Check, Smartphone, BrainCircuit, Receipt } from 'lucide-react';

interface DocumentTemplateProps {
    requisition: Requisition;
}

// 1. PURCHASE REQUISITION FORM
export const PurchaseRequisitionForm: React.FC<DocumentTemplateProps> = ({ requisition }) => (
    <div className="bg-white p-12 max-w-4xl mx-auto shadow-sm border border-gray-100 font-sans text-gray-900 printable-document">
        <div className="flex justify-between items-start mb-10 pb-8 border-b border-gray-100">
            <div>
                <h1 className="text-2xl font-black uppercase tracking-tight mb-1">Purchase Requisition</h1>
                <p className="text-sm font-bold text-blue-600">REQ-{requisition.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <div className="text-right">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Date Created</p>
                <p className="text-sm font-bold">{new Date(requisition.created_at).toLocaleDateString()} {new Date(requisition.created_at).toLocaleTimeString()}</p>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-12 mb-10">
            <div>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Requestor Info</h3>
                <div className="space-y-1">
                    <p className="text-sm font-black text-gray-900">{requisition.requestor_name || 'System User'}</p>
                    <p className="text-xs font-medium text-gray-500">{requisition.department || 'General Administration'}</p>
                </div>
            </div>
            <div>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Priority & Type</h3>
                <div className="space-y-1">
                    <p className="text-sm font-black text-gray-900">Standard Expense</p>
                    <p className="text-xs font-medium text-gray-500">Inventory & Logistics</p>
                </div>
            </div>
        </div>

        <div className="mb-10">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Requisition Details</h3>
            <p className="text-lg font-bold text-gray-900 mb-6">{requisition.description}</p>
            
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-gray-50/50">
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-left border-b border-gray-100">Item Description</th>
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center border-b border-gray-100">Quantity</th>
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right border-b border-gray-100">Unit Price</th>
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right border-b border-gray-100">Estimated Total</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {requisition.items?.map((item: any, idx: number) => (
                        <tr key={idx}>
                            <td className="px-5 py-4 text-sm font-medium text-gray-700">{item.description}</td>
                            <td className="px-5 py-4 text-sm font-medium text-gray-500 text-center">{item.quantity}</td>
                            <td className="px-5 py-4 text-sm font-medium text-gray-900 text-right">K{item.unit_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="px-5 py-4 text-sm font-bold text-gray-900 text-right">K{item.estimated_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="bg-[#006AFF]/5">
                        <td colSpan={3} className="px-5 py-5 text-[11px] font-bold text-[#006AFF] uppercase tracking-widest text-right">Grand Total</td>
                        <td className="px-5 py-5 text-[18px] font-black text-[#006AFF] text-right">K{requisition.estimated_total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <div className="grid grid-cols-2 gap-12 pt-12 border-t border-gray-100 mt-auto">
            <div className="relative">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-8 text-center">Authorized By</h3>
                <div className="h-0.5 bg-gray-100 w-full mb-2" />
                <p className="text-center font-bold text-xs text-gray-400">Digital Signature - Finance Manager</p>
                <div className="absolute top-4 left-1/2 -translate-x-1/2 rotate-[-5deg] opacity-60">
                    <div className="border-[3px] border-[#006AFF] px-4 py-1 rounded-md">
                        <p className="text-[#006AFF] font-black text-xs uppercase tracking-[0.2em]">Authorized</p>
                    </div>
                </div>
            </div>
            <div>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-8 text-center">Internal Audit</h3>
                <div className="h-0.5 bg-gray-100 w-full mb-2" />
                <p className="text-center font-bold text-xs text-gray-400">System Log: Verified & Released</p>
            </div>
        </div>
    </div>
);

// 2. CASH DISBURSAL CONFIRMATION
export const CashDisbursalProof: React.FC<DocumentTemplateProps> = ({ requisition }) => {
    const disbursal = requisition.disbursements?.[0] || {};
    return (
        <div className="bg-white p-12 max-w-4xl mx-auto shadow-sm border border-gray-100 font-sans text-gray-900 printable-document">
            <div className="bg-[#10B981]/5 border border-[#10B981]/10 rounded-3xl p-10 mb-10 flex items-center justify-between">
                <div>
                    <div className="flex items-center space-x-2 text-[#059669] mb-2">
                        <Check size={20} strokeWidth={3} />
                        <span className="text-sm font-black uppercase tracking-widest">Successful Transfer</span>
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">K{disbursal.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h1>
                    <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">Transaction Ref: {disbursal.external_reference || 'REF-' + requisition.id.slice(0, 6).toUpperCase()}</p>
                </div>
                <div className="w-16 h-16 bg-[#10B981] rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-100">
                    <Smartphone size={32} strokeWidth={2.5} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-10">
                <div className="bg-gray-50/50 rounded-2xl p-6">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Sender Details</h3>
                    <div className="space-y-1">
                        <p className="text-sm font-black text-gray-900">MoneyWise Finance</p>
                        <p className="text-xs font-medium text-gray-500">Corporate Wallet Branch</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-2">Processed By</p>
                        <p className="text-xs font-bold text-gray-700">{disbursal.processed_by_name || 'System Admin'}</p>
                    </div>
                </div>
                <div className="bg-gray-50/50 rounded-2xl p-6">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Recipient Details</h3>
                    <div className="space-y-1">
                        <p className="text-sm font-black text-gray-900">{requisition.requestor_name || 'System User'}</p>
                        <p className="text-xs font-medium text-gray-500">{disbursal.recipient_provider || 'Mobile Money'}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-2">Account identifier</p>
                        <p className="text-xs font-bold text-gray-700">{disbursal.recipient_value || 'Direct Account Transfer'}</p>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex justify-between items-center py-4 border-b border-gray-100">
                    <span className="text-sm font-bold text-gray-500 uppercase tracking-widest px-1">Payment Method</span>
                    <span className="text-sm font-black text-gray-900 uppercase">{disbursal.method?.replace(/_/g, ' ') || 'BANK TRANSFER'}</span>
                </div>
                <div className="flex justify-between items-center py-4 border-b border-gray-100">
                    <span className="text-sm font-bold text-gray-500 uppercase tracking-widest px-1">Value Date</span>
                    <span className="text-sm font-black text-gray-900">{new Date(disbursal.created_at || requisition.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between items-center py-4">
                    <span className="text-sm font-bold text-gray-500 uppercase tracking-widest px-1">Processing Status</span>
                    <div className="flex items-center space-x-2 bg-emerald-100 text-[#059669] px-3 py-1 rounded-full">
                        <Check size={12} strokeWidth={3} />
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">Settled</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 3. EXPENSE SUMMARY & VARIANCE
export const ExpenseVarianceForm: React.FC<DocumentTemplateProps> = ({ requisition }) => {
    const amountGiven = requisition.estimated_total || 0;
    const actualSpent = requisition.actual_total || 0;
    const changeExpected = amountGiven - actualSpent;
    const actualChange = 0; // TODO: Pull from change_submissions
    const variance = actualChange - changeExpected;
    const isReconciled = variance === 0;

    return (
        <div className="bg-white p-12 max-w-4xl mx-auto font-sans text-gray-900 printable-document">

            {/* Document Header */}
            <div className="flex items-start justify-between mb-10 pb-8 border-b border-gray-100">
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">Expense Reconciliation</p>
                    <h1 className="text-[26px] font-black text-gray-900 tracking-tight leading-none mb-1">
                        {requisition.description}
                    </h1>
                    <p className="text-sm text-gray-400 font-medium mt-2">REQ-{requisition.id.slice(0, 8).toUpperCase()}</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Date</p>
                    <p className="text-sm font-semibold text-gray-700">{new Date(requisition.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-3 mb-1">Employee</p>
                    <p className="text-sm font-semibold text-gray-700">{requisition.requestor_name || 'System User'}</p>
                </div>
            </div>

            {/* Line Items Table */}
            <div className="mb-10">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Line Item Breakdown</p>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-left">Description</th>
                                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Estimated</th>
                                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Actual</th>
                                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Variance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {requisition.items?.map((item: any, idx: number) => {
                                const diff = (item.estimated_amount || 0) - (item.actual_amount || 0);
                                return (
                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-5 py-4 text-[13px] text-gray-700">{item.description}</td>
                                        <td className="px-5 py-4 text-[13px] text-gray-500 text-right">K{(item.estimated_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="px-5 py-4 text-[13px] font-semibold text-gray-900 text-right">K{(item.actual_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className={`px-5 py-4 text-[13px] font-semibold text-right ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {diff >= 0 ? '+' : ''}K{diff.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t border-gray-200 bg-gray-50">
                                <td className="px-5 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest">Totals</td>
                                <td className="px-5 py-4 text-[13px] font-bold text-gray-700 text-right">K{amountGiven.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="px-5 py-4 text-[13px] font-bold text-gray-900 text-right">K{actualSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className={`px-5 py-4 text-[13px] font-bold text-right ${(amountGiven - actualSpent) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {(amountGiven - actualSpent) >= 0 ? '+' : ''}K{(amountGiven - actualSpent).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Cash Accountability Breakdown — Compact */}
            <div className="mt-8 pt-6 border-t border-gray-100">
                <p className="text-[9px] font-bold text-gray-300 uppercase tracking-[0.25em] mb-3">Cash Accountability</p>
                <div className="divide-y divide-gray-50">
                    {[
                        { label: 'Amount Given', value: amountGiven, color: 'text-gray-500' },
                        { label: 'Amount Spent', value: actualSpent, color: 'text-gray-500' },
                        { label: 'Expected Change', value: changeExpected, color: 'text-gray-500' },
                        { label: 'Actual Change Returned', value: actualChange, color: 'text-gray-500' },
                    ].map(row => (
                        <div key={row.label} className="flex items-center justify-between py-2">
                            <span className="text-[11px] text-gray-400">{row.label}</span>
                            <span className={`text-[11px] font-semibold ${row.color}`}>K{row.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    ))}
                    <div className={`flex items-center justify-between py-2.5 ${isReconciled ? 'text-emerald-600' : 'text-red-500'}`}>
                        <span className="text-[11px] font-bold uppercase tracking-widest">Change Variance</span>
                        <div className="flex items-center space-x-2">
                            <span className="text-[11px] font-bold">K{Math.abs(variance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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

// 4. ACCOUNTING TREATMENT & AI RATIONALE
export const AccountingTreatmentForm: React.FC<DocumentTemplateProps> = ({ requisition }) => {
    return (
        <div className="bg-white p-12 max-w-4xl mx-auto shadow-sm border border-gray-100 font-sans text-gray-900 printable-document">
            <div className="flex items-center space-x-3 mb-10">
                <div className="w-12 h-12 bg-[#006AFF] rounded-2xl flex items-center justify-center text-white">
                    <BrainCircuit size={28} />
                </div>
                <div>
                    <h1 className="text-2xl font-black uppercase tracking-tight leading-none">Accounting Assessment</h1>
                    <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">IFRS Standards Compliance Check</p>
                </div>
            </div>

            <table className="w-full border-collapse mb-12">
                <thead>
                    <tr className="bg-gray-50">
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-left border-b border-gray-100">Transaction Item</th>
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-left border-b border-gray-100">GL Account</th>
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center border-b border-gray-100">Code</th>
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right border-b border-gray-100">Amount (K)</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {requisition.items?.map((item: any, idx: number) => (
                        <tr key={idx}>
                            <td className="px-5 py-4 text-sm font-medium text-gray-900">{item.description}</td>
                            <td className="px-5 py-4 text-sm font-bold text-[#006AFF]">{item.accounts?.name || 'Administrative Expense'}</td>
                            <td className="px-5 py-4 text-[11px] font-black text-gray-500 text-center">{item.account_id || item.accounts?.code || '6000'}</td>
                            <td className="px-5 py-4 text-sm font-black text-gray-900 text-right">K{item.actual_amount?.toLocaleString() || item.unit_price?.toLocaleString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="bg-blue-50/30 border border-blue-100 rounded-[40px] p-10">
                <div className="flex items-center space-x-3 mb-6">
                    <span className="text-[11px] font-black text-[#006AFF] uppercase tracking-[0.2em] bg-blue-100/50 py-2 px-6 rounded-full">AI Rationale & Audit Evidence</span>
                </div>
                
                <div className="space-y-8">
                    {requisition.items?.map((item: any, idx: number) => (
                        <div key={idx} className="bg-white/60 p-6 rounded-3xl border border-blue-50">
                            <h4 className="text-[13px] font-black text-gray-900 mb-2 flex items-center space-x-2">
                                <Check size={14} className="text-[#006AFF]" />
                                <span>{item.description}</span>
                            </h4>
                            <p className="text-sm font-medium text-gray-600 italic leading-relaxed">
                                "Categorized as '{item.accounts?.name || 'Unknown'}' based on commercial pattern analysis. The transaction represents a recurrent operational expenditure fitting the 6000-series expense profile. Verified against similar historical postings and matched specifically to the organization's Chart of Accounts with 94% confidence."
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// 5. QUICKBOOKS LOG
export const QuickBooksSyncLog: React.FC<DocumentTemplateProps> = ({ requisition }) => (
    <div className="bg-white p-12 max-w-4xl mx-auto shadow-sm border border-gray-100 font-sans text-gray-900 printable-document">
        <div className="flex items-center space-x-4 mb-10">
            <div className="w-14 h-14 bg-[#2CA01C] rounded-2xl flex items-center justify-center text-white">
                <Receipt size={32} />
            </div>
            <div>
                <h1 className="text-2xl font-black uppercase tracking-tight leading-none">ERP Synchronization Report</h1>
                <p className="text-xs font-bold text-gray-400 mt-2 uppercase tracking-widest">Intuit QuickBooks Online Integration</p>
            </div>
        </div>

        <div className="space-y-6">
            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Sync Metadata</h3>
                <div className="grid grid-cols-2 gap-y-4">
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Target ERP</p>
                        <p className="text-sm font-black text-gray-900">QuickBooks Online</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Sync Date</p>
                        <p className="text-sm font-black text-gray-900">{new Date().toLocaleDateString()}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Record Type</p>
                        <p className="text-sm font-black text-gray-900">Journal Entry (JE)</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Status</p>
                        <div className="flex items-center space-x-2 text-[#2CA01C]">
                            <Check size={14} strokeWidth={3} />
                            <span className="text-sm font-black">SUCCESS</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="border border-gray-100 rounded-2xl p-6">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Journal Entry Details</h3>
                <div className="space-y-3">
                    <div className="flex justify-between text-sm font-medium">
                        <span className="text-gray-500">ERP Internal Reference</span>
                        <span className="font-black text-gray-900">QB-SYNC-{requisition.id.slice(0, 8).toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                        <span className="text-gray-500">Total Credits</span>
                        <span className="font-black text-gray-900">K{requisition.actual_total?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                        <span className="text-gray-500">Total Debits</span>
                        <span className="font-black text-gray-900">K{requisition.actual_total?.toLocaleString()}</span>
                    </div>
                </div>
            </div>
            
            <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100">
                <p className="text-xs font-bold text-emerald-800 leading-relaxed text-center">
                    This transaction has been successfully mapped and posted to your QuickBooks general ledger. All line items are reconciled and closed in the MoneyWise system.
                </p>
            </div>
        </div>
    </div>
);
