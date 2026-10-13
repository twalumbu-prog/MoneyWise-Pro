import React from 'react';
import { Clock, AlertTriangle, CheckCircle2, CircleDot } from 'lucide-react';
import type { CustomerInvoice } from '../services/invoice.service';

interface CreditInvoiceInboxProps {
    invoices: CustomerInvoice[];
    onRowClick?: (invoice: CustomerInvoice) => void;
}

const money = (n: number) => `K${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export const formatInvoiceDate = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return iso || '—';
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

/** Whole days from today to the follow-up date (negative = days overdue). */
const daysUntil = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return 0;
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - today) / 86400000);
};

export const InvoiceStatusPill: React.FC<{ invoice: CustomerInvoice }> = ({ invoice }) => {
    if (invoice.status === 'PAID') {
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><CheckCircle2 size={12} /> Paid</span>;
    }
    if (invoice.status === 'VOID') {
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400"><CircleDot size={12} /> Void</span>;
    }
    if (invoice.is_overdue) {
        const d = Math.abs(daysUntil(invoice.follow_up_date));
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertTriangle size={12} /> Overdue · {d} day{d === 1 ? '' : 's'}</span>;
    }
    const d = daysUntil(invoice.follow_up_date);
    return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
            <Clock size={12} /> {invoice.status === 'PARTIAL' ? 'Part paid' : 'Awaiting payment'} · {d === 0 ? 'follow up today' : `follow up in ${d} day${d === 1 ? '' : 's'}`}
        </span>
    );
};

/** Credit-sale invoices (accounts receivable): one row per invoice with balance + follow-up status. */
export const CreditInvoiceInbox: React.FC<CreditInvoiceInboxProps> = ({ invoices, onRowClick }) => {
    if (invoices.length === 0) return null;
    return (
        <div className="bg-white rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex flex-col divide-y divide-[#E8EEF8]">
                {invoices.map(inv => (
                    <div
                        key={inv.id}
                        onClick={() => onRowClick?.(inv)}
                        className="px-3 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-gray-50/70 transition-colors"
                    >
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-[13px] font-semibold text-[#111827] truncate">{inv.customer_name}</p>
                                    <p className="text-[11px] text-gray-400 font-medium truncate">
                                        {inv.invoice_number} · {inv.items?.length ?? 0} item{(inv.items?.length ?? 0) === 1 ? '' : 's'} · due {formatInvoiceDate(inv.follow_up_date)}
                                    </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-[13px] font-bold text-[#111827]">{money(inv.status === 'PAID' ? inv.total : inv.balance)}</p>
                                    {inv.status === 'PARTIAL' && <p className="text-[10px] text-gray-400 font-medium">of {money(inv.total)}</p>}
                                </div>
                            </div>
                            <div className="mt-1.5 flex items-center justify-between gap-4">
                                <InvoiceStatusPill invoice={inv} />
                                <span className="text-[10px] font-bold uppercase tracking-wide text-[#0058DB] bg-[#F0F7FF] rounded px-1.5 py-0.5">Credit sale</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CreditInvoiceInbox;
