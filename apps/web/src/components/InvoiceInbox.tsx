import React, { useState, useRef, useEffect } from 'react';
import { FileText, Clock, Check, XCircle, BookOpen, CheckCircle2, Ban, MoreHorizontal, Pencil, Archive, Trash2 } from 'lucide-react';
import type { PaymentLink } from '../services/product.service';

interface InvoiceInboxProps {
    invoices: PaymentLink[];
    onRowClick?: (invoice: PaymentLink) => void;
    onEdit?: (invoice: PaymentLink) => void;
    onArchive?: (invoice: PaymentLink) => void;
    onDelete?: (invoice: PaymentLink) => void;
}

/** Human-readable invoice number derived from the token. */
export const invoiceNumber = (token: string) =>
    `INV-${token.slice(0, 8).toUpperCase()}`;

/** Payment status — right side of the status row. */
const STATUS_CONFIG = {
    ACTIVE: {
        label: 'Awaiting Payment',
        icon: <Clock size={12} className="text-amber-500" />,
        textClass: 'text-amber-600',
    },
    PAID: {
        label: 'Paid',
        icon: <Check size={12} className="text-emerald-500" />,
        textClass: 'text-emerald-600',
    },
    CANCELLED: {
        label: 'Cancelled',
        icon: <XCircle size={12} className="text-gray-400" />,
        textClass: 'text-gray-400',
    },
} as const;

/**
 * Accounting status — left side of the status row.
 */
const ACCT_STATUS_CONFIG = {
    ACTIVE: {
        label: 'AR Raised',
        icon: <BookOpen size={12} className="text-[#0058DB]" />,
        textClass: 'text-[#0058DB]',
    },
    PAID: {
        label: 'Settled',
        icon: <CheckCircle2 size={12} className="text-emerald-500" />,
        textClass: 'text-emerald-600',
    },
    CANCELLED: {
        label: 'Voided',
        icon: <Ban size={12} className="text-gray-400" />,
        textClass: 'text-gray-400',
    },
} as const;

/** Floating three-dot menu — renders at a fixed position to escape row overflow clipping. */
const KebabMenu: React.FC<{
    invoice: PaymentLink;
    onEdit?: (inv: PaymentLink) => void;
    onArchive?: (inv: PaymentLink) => void;
    onDelete?: (inv: PaymentLink) => void;
}> = ({ invoice, onEdit, onArchive, onDelete }) => {
    const [open, setOpen] = useState(false);
    const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const toggleMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
        }
        setOpen(v => !v);
    };

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (
                menuRef.current && !menuRef.current.contains(e.target as Node) &&
                btnRef.current && !btnRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Close on scroll (position would drift)
    useEffect(() => {
        if (!open) return;
        const handler = () => setOpen(false);
        window.addEventListener('scroll', handler, true);
        return () => window.removeEventListener('scroll', handler, true);
    }, [open]);

    const isPaid = invoice.status === 'PAID';

    return (
        <>
            <button
                ref={btnRef}
                onClick={toggleMenu}
                className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Invoice options"
            >
                <MoreHorizontal size={16} />
            </button>

            {open && menuPos && (
                <div
                    ref={menuRef}
                    style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 500 }}
                    className="w-44 bg-white rounded-xl shadow-lg border border-[#E8EEF8] py-1 text-sm"
                >
                    {/* Edit — not available on paid/cancelled invoices */}
                    <button
                        disabled={isPaid}
                        onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit?.(invoice); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Pencil size={14} className="text-gray-400" />
                        Edit invoice
                    </button>

                    {/* Archive */}
                    <button
                        onClick={(e) => { e.stopPropagation(); setOpen(false); onArchive?.(invoice); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        <Archive size={14} className="text-gray-400" />
                        Archive
                    </button>

                    {/* Divider */}
                    <div className="my-1 border-t border-[#E8EEF8]" />

                    {/* Delete */}
                    <button
                        disabled={isPaid}
                        onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete?.(invoice); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Trash2 size={14} className="text-red-500" />
                        Delete &amp; deactivate
                    </button>
                </div>
            )}
        </>
    );
};

export const InvoiceInbox: React.FC<InvoiceInboxProps> = ({ invoices, onRowClick, onEdit, onArchive, onDelete }) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const toggleSelected = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="bg-white rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex flex-col divide-y divide-[#E8EEF8]">
                {invoices.map((inv) => {
                    const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.ACTIVE;
                    const acct = ACCT_STATUS_CONFIG[inv.status] ?? ACCT_STATUS_CONFIG.ACTIVE;
                    const itemCount = inv.items?.length ?? 0;

                    return (
                        <div
                            key={inv.id}
                            onClick={() => onRowClick?.(inv)}
                            className={`group px-3 py-3.5 flex items-center gap-3 cursor-pointer transition-colors ${
                                selected.has(inv.id) ? 'bg-[#F0F7FF]' : 'hover:bg-gray-50/70'
                            }`}
                        >
                            {/* Checkbox */}
                            <div
                                className="w-5 h-4 flex-shrink-0 inline-flex justify-center items-center gap-4"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.has(inv.id)}
                                    onChange={() => toggleSelected(inv.id)}
                                    className="w-3.5 h-3.5 appearance-none bg-white rounded shadow-[inset_0px_2px_4px_0px_rgba(0,0,0,0.05)] border-[0.50px] border-indigo-300 checked:bg-[#0058DB] checked:border-[#0058DB] cursor-pointer"
                                />
                            </div>

                            {/* Main content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-sm truncate font-medium text-gray-700">
                                        {inv.customer_name}
                                    </span>
                                    <span className={`text-sm whitespace-nowrap font-semibold ${
                                        inv.status === 'PAID' ? 'text-emerald-600' : 'text-[#111827]'
                                    }`}>
                                        {inv.status === 'PAID' ? '+' : ''}K{(inv.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between mt-px">
                                    <span className="text-[10px] font-normal text-[#6B7280]">
                                        {invoiceNumber(inv.token)} · {itemCount} {itemCount === 1 ? 'item' : 'items'}
                                    </span>
                                    <span className="text-[10px] font-normal text-neutral-500">
                                        {inv.created_at
                                            ? new Date(inv.created_at).toLocaleDateString('en-GB')
                                            : '—'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    {/* Accounting status */}
                                    <div className="flex items-center gap-1">
                                        {acct.icon}
                                        <span className="text-[10px] font-normal text-gray-600">
                                            {acct.label}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-[#D1D5DB] select-none">·</span>
                                    {/* Payment status */}
                                    <div className="flex items-center gap-1">
                                        {cfg.icon}
                                        <span className="text-[10px] font-normal text-gray-600">
                                            {cfg.label}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Three-dot menu */}
                            <div onClick={(e) => e.stopPropagation()}>
                                <KebabMenu
                                    invoice={inv}
                                    onEdit={onEdit}
                                    onArchive={onArchive}
                                    onDelete={onDelete}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {invoices.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-6 border border-[#E8EEF8]">
                        <FileText size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-brand-navy">No invoices yet</h3>
                    <p className="text-gray-400 max-w-xs mx-auto text-sm font-medium mt-2">
                        Create an invoice from the New Sale flow to send a payment link to a customer.
                    </p>
                </div>
            )}
        </div>
    );
};
