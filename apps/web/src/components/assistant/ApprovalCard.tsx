/**
 * ApprovalCard.tsx — The gate between the agent and your data.
 *
 * Shows exactly what will be written, field by field, before anything happens.
 * Once decided, the card collapses to a one-line record rather than staying
 * fully expanded — the field-by-field detail matters while you're deciding,
 * not after. It's still there on scroll-back (click to re-expand), just not
 * competing for space with everything said afterward.
 */

import React, { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Loader2, ShieldCheck, X } from 'lucide-react';
import type { Proposal } from '../../lib/agentClient';

/** Tool names are internal; users get plain language. */
const ACTION_LABELS: Record<string, string> = {
    create_requisition: 'Create requisition',
    update_requisition: 'Update requisition',
    create_scheduled_item: 'Add scheduled expense',
    update_scheduled_item: 'Update scheduled expense',
    categorize_transaction: 'Classify transaction',
    categorize_requisition_expense: 'Classify expense line item',
    update_org_settings: 'Change settings',
};

interface Props {
    toolName: string;
    proposal: Proposal;
    status: 'pending' | 'approving' | 'approved' | 'declined';
    onDecide: (approved: boolean) => void;
}

export const ApprovalCard: React.FC<Props> = ({ toolName, proposal, status, onDecide }) => {
    const decided = status === 'approved' || status === 'declined';
    const busy = status === 'approving';
    // Collapsed the moment a decision lands — expandable on demand, but the
    // default view of a resolved card is the one-liner, not the full form.
    const [expanded, setExpanded] = useState(false);

    const actionLabel = ACTION_LABELS[toolName] ?? 'Confirm change';

    if (decided && !expanded) {
        const approved = status === 'approved';
        return (
            <button
                onClick={() => setExpanded(true)}
                className={`my-3 flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    approved
                        ? 'border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50'
                        : 'border-gray-100 bg-gray-50/50 hover:bg-gray-50'
                }`}
            >
                <div
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${
                        approved ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-500'
                    }`}
                >
                    {approved ? <Check size={12} /> : <X size={12} />}
                </div>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-gray-600">
                    <span className={approved ? 'text-emerald-700' : 'text-gray-500'}>
                        {approved ? 'Approved' : 'Declined'}
                    </span>
                    <span className="text-gray-400"> · {actionLabel} — {proposal.summary}</span>
                </span>
                <ChevronDown size={13} className="flex-shrink-0 text-gray-300" />
            </button>
        );
    }

    return (
        <div
            className={`my-4 overflow-hidden rounded-2xl border transition-colors ${
                status === 'approved'
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : status === 'declined'
                    ? 'border-gray-200 bg-gray-50/60'
                    : 'border-[#006AFF]/25 bg-[#006AFF]/[0.03] shadow-[0_4px_24px_rgba(0,106,255,0.08)]'
            }`}
        >
            <div
                className={`flex items-start gap-3 border-b border-black/[0.06] px-4 py-3 ${decided ? 'cursor-pointer' : ''}`}
                onClick={decided ? () => setExpanded(false) : undefined}
            >
                <div
                    className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${
                        status === 'approved' ? 'bg-emerald-100 text-emerald-600'
                        : status === 'declined' ? 'bg-gray-200 text-gray-500'
                        : 'bg-[#006AFF]/10 text-[#006AFF]'
                    }`}
                >
                    {status === 'approved' ? <Check size={16} /> : status === 'declined' ? <X size={16} /> : <ShieldCheck size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                        {actionLabel}
                        {status === 'approved' && ' · approved'}
                        {status === 'declined' && ' · declined'}
                    </p>
                    <p className="mt-0.5 text-[14px] font-black leading-snug tracking-tight text-brand-navy">
                        {proposal.summary}
                    </p>
                </div>
                {decided && <ChevronDown size={14} className="mt-1.5 flex-shrink-0 rotate-180 text-gray-300" />}
            </div>

            <dl className="divide-y divide-black/[0.04] px-4">
                {proposal.preview.map((row, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
                        <dt className="text-[12px] font-semibold text-gray-500">{row.label}</dt>
                        <dd className="text-right text-[13px] font-bold tabular-nums text-brand-navy">{row.value}</dd>
                    </div>
                ))}
            </dl>

            {proposal.warning && (
                <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
                    <p className="text-[12px] font-medium leading-snug text-amber-800">{proposal.warning}</p>
                </div>
            )}

            {!decided && (
                <div className="flex items-center gap-2 px-4 pb-4 pt-1">
                    <button
                        onClick={() => onDecide(true)}
                        disabled={busy}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#006AFF] px-4 py-2.5 text-[13px] font-black text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-[#0057d4] disabled:opacity-60"
                    >
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                        {busy ? 'Applying…' : 'Approve'}
                    </button>
                    <button
                        onClick={() => onDecide(false)}
                        disabled={busy}
                        className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] font-black text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-60"
                    >
                        Decline
                    </button>
                </div>
            )}
        </div>
    );
};
