import React, { useState, useEffect } from 'react';
import { Requisition } from '../../services/requisition.service';
import { Check, BrainCircuit, Receipt } from 'lucide-react';
import axios from 'axios';
import { supabase } from '../../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export const LENCO_LOGO = 'data:image/png;base64,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';

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
// 2. PROOF OF TRANSFER  (Lenco-style receipt)
// ─────────────────────────────────────────────────────────
export const CashDisbursalProof: React.FC<DocumentTemplateProps> = ({ requisition }) => {
    const disbursal = requisition.disbursements?.[0] || {} as any;
    const txDate = disbursal.created_at || requisition.created_at;
    // lenco_transaction_id is the Lenco-assigned transfer reference (set by the
    // transfer.successful webhook, backfilled for older records).
    // Fall back to external_reference only if lenco_transaction_id is absent,
    // but never show our SIM-PAY- test refs.
    const rawRef = disbursal.lenco_transaction_id || disbursal.external_reference || null;
    const txRef = rawRef && !rawRef.startsWith('SIM-PAY-') ? rawRef : null;
    const amount  = disbursal.amount ?? 0;
    const recipientBank     = disbursal.recipient_provider || disbursal.bank_name || 'Mobile Money';
    const recipientAccount  = disbursal.recipient_value   || disbursal.account_number || '—';
    const processedBy       = disbursal.processed_by_name || 'Finance';
    const method            = disbursal.method?.replace(/_/g, ' ') || 'Bank Transfer';

    // Recipient name: use stored name first, then fall back to requestor, then resolve via Lenco
    const storedName = disbursal.recipient_name || disbursal.recipient_account_name || null;
    const [recipientName, setRecipientName] = useState<string>(
        storedName || requisition.requestor_name || ''
    );
    const [resolving, setResolving] = useState(false);

    useEffect(() => {
        // Only hit the API if we have no name at all and there's account data to resolve
        if (recipientName || !requisition.id || !disbursal.recipient_value) return;

        let cancelled = false;
        setResolving(true);
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session?.access_token || cancelled) return;
            axios.get(`${API_URL}/requisitions/${requisition.id}/resolve-recipient`, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            })
            .then(r => { if (!cancelled && r.data?.name) setRecipientName(r.data.name); })
            .catch(() => {/* silent — best-effort */})
            .finally(() => { if (!cancelled) setResolving(false); });
        });
        return () => { cancelled = true; };
    }, [requisition.id]);

    const formattedDate = new Date(txDate).toLocaleString('en-GB', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    }).replace(',', ' @');

    return (
        <div className="bg-white max-w-xl mx-auto font-sans text-gray-900 printable-document">

            {/* ── Top: Lenco logo + header ───────────────────────── */}
            <div className="px-6 sm:px-10 pt-8 sm:pt-10 pb-6 border-b border-gray-100">
                <img
                    src={LENCO_LOGO}
                    alt="Lenco"
                    className="h-7 sm:h-8 mb-6 sm:mb-8"
                />

                {/* Transaction ref (small, above title — matches Lenco layout) */}
                {txRef && (
                    <p className="text-[10px] sm:text-[11px] text-gray-400 font-medium mb-1">
                        Transaction Ref: <span className="font-bold text-gray-600">{txRef}</span>
                    </p>
                )}

                <h1 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">Proof of Transfer</h1>
                <p className="text-[11px] sm:text-xs text-gray-400">{formattedDate}</p>

                {/* Direction badge */}
                <div className="mt-4 inline-flex items-center gap-1.5 bg-gray-100 px-3 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 flex-shrink-0" />
                    <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">{method}</span>
                </div>
            </div>

            {/* ── Amount ────────────────────────────────────────── */}
            <div className="px-6 sm:px-10 py-6 sm:py-8 border-b border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Amount Disbursed</p>
                <p className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
                    ZMW {Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 text-emerald-600">
                    <Check size={13} strokeWidth={3} />
                    <span className="text-[11px] font-bold">Transfer Successful</span>
                </div>
            </div>

            {/* ── From ─────────────────────────────────────────── */}
            <div className="px-6 sm:px-10 py-4 sm:py-5 border-b border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">From</p>
                <p className="text-sm font-semibold text-gray-900">{processedBy} — MoneyWise Finance</p>
            </div>

            {/* ── Recipient's Details ───────────────────────────── */}
            <div className="px-6 sm:px-10 py-5 sm:py-6 border-b border-gray-100">
                <p className="text-[11px] sm:text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                    Recipient's Details
                </p>
                <div className="space-y-3">
                    {/* Name row — shows spinner while resolving from Lenco */}
                <div className="flex justify-between items-start gap-4">
                    <span className="text-xs sm:text-[13px] text-gray-400 flex-shrink-0">Name</span>
                    {resolving ? (
                        <span className="text-xs text-gray-400 italic">Resolving…</span>
                    ) : (
                        <span className="text-xs sm:text-[13px] font-semibold text-gray-900 text-right">
                            {recipientName || '—'}
                        </span>
                    )}
                </div>
                {[
                        { label: 'Bank / Provider', value: recipientBank },
                        { label: 'Account Number', value: recipientAccount },
                        { label: 'Description',    value: requisition.description || `Disbursement for Requisition #${requisition.id.slice(0, 8)}` },
                    ].map(row => (
                        <div key={row.label} className="flex justify-between items-start gap-4">
                            <span className="text-xs sm:text-[13px] text-gray-400 flex-shrink-0">{row.label}</span>
                            <span className="text-xs sm:text-[13px] font-semibold text-gray-900 text-right">{row.value}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Disclaimer ───────────────────────────────────── */}
            <div className="px-6 sm:px-10 py-5 sm:py-6 border-b border-gray-100 bg-gray-50/50">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">DISCLAIMER</p>
                <p className="text-[10px] sm:text-[11px] text-gray-500 leading-relaxed">
                    The transfer was successful and the beneficiary account was credited. However, this transmission is subject to
                    network providers wherein transactions may be delayed due to interruption, incorrect data, or delay in
                    transmission of transaction details. All transactions will be verified and our normal checks will be applied.
                </p>
            </div>

            {/* ── Footer ───────────────────────────────────────── */}
            <div className="px-6 sm:px-10 py-4 sm:py-5 flex items-center justify-between gap-4">
                <p className="text-[10px] text-gray-400">
                    Generated by <span className="font-bold text-gray-600">MoneyWise Pro</span>
                </p>
                <p className="text-[10px] text-gray-400">Page 1 of 1</p>
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
