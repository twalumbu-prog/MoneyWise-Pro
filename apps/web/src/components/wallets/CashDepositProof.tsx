import React from 'react';
import { Check } from 'lucide-react';
import { CashbookEntry } from '../../services/cashbook.service';
import { LENCO_LOGO } from '../requisitions/RequisitionDocumentTemplates';

interface CashDepositProofProps {
    entry: CashbookEntry;
}

// ─────────────────────────────────────────────────────────
// PROOF OF DEPOSIT  (Lenco-style receipt, mirrors CashDisbursalProof)
// ─────────────────────────────────────────────────────────
export const CashDepositProof: React.FC<CashDepositProofProps> = ({ entry }) => {
    const amount = entry.credit || entry.debit || 0;
    const txRef = entry.external_reference || entry.reference_number || null;
    const method = entry.mf_payment_channel?.replace(/_/g, ' ') || entry.account_type?.replace(/_/g, ' ') || 'Deposit';
    const senderName = entry.sender_name || 'Unknown Sender';
    const senderPhone = entry.sender_phone || '—';
    const walletName = entry.accounts?.name || 'MoneyWise Wallet';
    const description = entry.description || `Deposit — ${entry.reference_number || entry.id.slice(0, 8)}`;

    const formattedDate = new Date(entry.date).toLocaleString('en-GB', {
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

                {txRef && (
                    <p className="text-[10px] sm:text-[11px] text-gray-400 font-medium mb-1">
                        Transaction Ref: <span className="font-bold text-gray-600">{txRef}</span>
                    </p>
                )}

                <h1 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">Proof of Deposit</h1>
                <p className="text-[11px] sm:text-xs text-gray-400">{formattedDate}</p>

                {/* Direction badge */}
                <div className="mt-4 inline-flex items-center gap-1.5 bg-gray-100 px-3 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 flex-shrink-0" />
                    <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">{method}</span>
                </div>
            </div>

            {/* ── Amount ────────────────────────────────────────── */}
            <div className="px-6 sm:px-10 py-6 sm:py-8 border-b border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Amount Received</p>
                <p className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
                    ZMW {Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 text-emerald-600">
                    <Check size={13} strokeWidth={3} />
                    <span className="text-[11px] font-bold">Deposit Successful</span>
                </div>
            </div>

            {/* ── To ───────────────────────────────────────────── */}
            <div className="px-6 sm:px-10 py-4 sm:py-5 border-b border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">To</p>
                <p className="text-sm font-semibold text-gray-900">{walletName} — MoneyWise Wallet</p>
            </div>

            {/* ── Sender's Details ───────────────────────────────── */}
            <div className="px-6 sm:px-10 py-5 sm:py-6 border-b border-gray-100">
                <p className="text-[11px] sm:text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                    Sender's Details
                </p>
                <div className="space-y-3">
                    {[
                        { label: 'Name',        value: senderName },
                        { label: 'Phone / Account', value: senderPhone },
                        { label: 'Description', value: description },
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
                    The deposit was successful and the wallet was credited. However, this transmission is subject to
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

export default CashDepositProof;
