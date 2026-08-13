import React from 'react';
import {
    X, User, Phone, Mail, Calendar, Clock, Check, XCircle,
    Receipt, Copy, ExternalLink, CheckCircle2, BookOpen, Ban,
} from 'lucide-react';
import type { PaymentLink } from '../services/product.service';
import { invoiceNumber } from './InvoiceInbox';

interface InvoiceDetailModalProps {
    invoice: PaymentLink | null;
    isOpen: boolean;
    onClose: () => void;
}

const STATUS_CONFIG = {
    ACTIVE: {
        label: 'Awaiting Payment',
        icon: <Clock size={14} className="text-amber-500" />,
        containerClass: 'bg-amber-50 text-[#111827] border border-amber-200',
    },
    PAID: {
        label: 'Paid',
        icon: <CheckCircle2 size={14} className="text-emerald-500" />,
        containerClass: 'bg-emerald-50 text-[#111827] border border-emerald-200',
    },
    CANCELLED: {
        label: 'Cancelled',
        icon: <XCircle size={14} className="text-gray-400" />,
        containerClass: 'bg-gray-50 text-[#111827] border border-gray-200',
    },
} as const;

const ACCT_STATUS_CONFIG = {
    ACTIVE: {
        label: 'AR Raised',
        icon: <BookOpen size={14} className="text-[#0058DB]" />,
        containerClass: 'bg-[#F0F7FF] text-[#111827] border border-[#0058DB]/20',
    },
    PAID: {
        label: 'Settled',
        icon: <CheckCircle2 size={14} className="text-emerald-500" />,
        containerClass: 'bg-emerald-50 text-[#111827] border border-emerald-200',
    },
    CANCELLED: {
        label: 'Voided',
        icon: <Ban size={14} className="text-gray-400" />,
        containerClass: 'bg-gray-50 text-[#111827] border border-gray-200',
    },
} as const;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="space-y-2">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">{title}</h3>
        {children}
    </div>
);

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
    <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 text-gray-400">{icon}</div>
        <div className="min-w-0">
            <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{label}</div>
            <div className="text-sm text-gray-800 font-medium break-words">{value}</div>
        </div>
    </div>
);

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
    invoice,
    isOpen,
    onClose,
}) => {
    const [copied, setCopied] = React.useState(false);

    if (!invoice) return null;

    const cfg = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.ACTIVE;
    const acct = ACCT_STATUS_CONFIG[invoice.status] ?? ACCT_STATUS_CONFIG.ACTIVE;
    const items = invoice.items ?? [];
    const invNum = invoiceNumber(invoice.token);
    const paymentUrl = `${window.location.origin}/pl/${invoice.token}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(paymentUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const outstanding = invoice.status === 'ACTIVE' ? invoice.amount : 0;

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-brand-navy/40 backdrop-blur-sm z-[300] transition-opacity duration-300 ${
                    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onClick={onClose}
            />

            {/* Panel — slides in from the right on desktop, slides up on mobile */}
            <div
                className={`fixed z-[310] transition-all duration-300 ease-out
                    md:top-0 md:right-0 md:left-auto md:h-full md:w-[440px]
                    bottom-0 left-0 right-0 max-h-[92vh] md:max-h-none
                    bg-white md:rounded-none rounded-t-3xl shadow-2xl flex flex-col
                    ${isOpen
                        ? 'opacity-100 md:translate-x-0 translate-y-0'
                        : 'opacity-0 md:translate-x-full translate-y-full'
                    }`}
            >
                {/* Drag handle (mobile) */}
                <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
                    <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
                </div>

                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Invoice</p>
                        <h2 className="text-xl font-bold text-brand-navy">{invNum}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                    {/* Status badges — accounting left, payment right */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${acct.containerClass}`}>
                            {acct.icon}
                            {acct.label}
                        </div>
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${cfg.containerClass}`}>
                            {cfg.icon}
                            {cfg.label}
                        </div>
                    </div>

                    {/* Customer details */}
                    <Section title="Customer">
                        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                            <InfoRow
                                icon={<User size={14} />}
                                label="Name"
                                value={invoice.customer_name}
                            />
                            <InfoRow
                                icon={<Phone size={14} />}
                                label="Phone"
                                value={invoice.customer_phone}
                            />
                            {invoice.customer_email && (
                                <InfoRow
                                    icon={<Mail size={14} />}
                                    label="Email"
                                    value={invoice.customer_email}
                                />
                            )}
                        </div>
                    </Section>

                    {/* Invoice dates */}
                    <Section title="Dates">
                        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                            <InfoRow
                                icon={<Calendar size={14} />}
                                label="Invoice Date"
                                value={invoice.created_at
                                    ? new Date(invoice.created_at).toLocaleDateString('en-GB', {
                                        day: '2-digit', month: 'long', year: 'numeric',
                                    })
                                    : '—'}
                            />
                            {invoice.paid_at && (
                                <InfoRow
                                    icon={<Check size={14} />}
                                    label="Paid On"
                                    value={new Date(invoice.paid_at).toLocaleDateString('en-GB', {
                                        day: '2-digit', month: 'long', year: 'numeric',
                                    })}
                                />
                            )}
                        </div>
                    </Section>

                    {/* Line items */}
                    {items.length > 0 && (
                        <Section title="Order Summary">
                            <div className="bg-gray-50 rounded-2xl overflow-hidden">
                                {/* Column headings */}
                                <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2.5 border-b border-[#E8EEF8]">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Item</span>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 text-right">Qty</span>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 text-right">Amount</span>
                                </div>

                                {/* Rows */}
                                {items.map((item, i) => (
                                    <div
                                        key={i}
                                        className={`grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-3 ${
                                            i < items.length - 1 ? 'border-b border-[#E8EEF8]' : ''
                                        }`}
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-gray-800 truncate">{item.name}</div>
                                            {(item.check_in && item.check_out) ? (
                                                <div className="text-[10px] text-gray-400 mt-0.5">
                                                    {new Date(item.check_in).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                                    {' – '}
                                                    {new Date(item.check_out).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                                    {' '}({item.quantity} {item.quantity === 1 ? 'night' : 'nights'})
                                                </div>
                                            ) : (
                                                <div className="text-[10px] text-gray-400 mt-0.5">
                                                    @ K{(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} each
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-sm text-gray-500 text-right self-start pt-0.5">{item.quantity}</span>
                                        <span className="text-sm font-semibold text-gray-800 text-right self-start pt-0.5 whitespace-nowrap">
                                            K{((item.unit_price || 0) * (item.quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                ))}

                                {/* Total row */}
                                <div className="grid grid-cols-[1fr_auto] gap-2 px-4 py-3 bg-[#F3F5FC] border-t border-[#E8EEF8]">
                                    <span className="text-sm font-bold text-brand-navy">Total</span>
                                    <span className="text-sm font-bold text-brand-navy">
                                        K{(invoice.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </Section>
                    )}

                    {/* Payment history */}
                    <Section title="Payment History">
                        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                            {invoice.status === 'PAID' && invoice.paid_at ? (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                                            <Check size={12} className="text-emerald-600" />
                                        </div>
                                        <div>
                                            <div className="text-xs font-semibold text-gray-800">Payment received</div>
                                            <div className="text-[10px] text-gray-400">
                                                {new Date(invoice.paid_at).toLocaleDateString('en-GB', {
                                                    day: '2-digit', month: 'short', year: 'numeric',
                                                })}
                                                {invoice.reference && ` · ${invoice.reference}`}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-sm font-bold text-emerald-600">
                                        K{(invoice.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            ) : invoice.status === 'CANCELLED' ? (
                                <div className="text-sm text-gray-400 font-medium">Invoice was cancelled — no payment recorded.</div>
                            ) : (
                                <div className="flex items-center gap-2 text-amber-600">
                                    <Clock size={14} className="flex-shrink-0" />
                                    <span className="text-sm font-medium">No payment received yet</span>
                                </div>
                            )}
                        </div>
                    </Section>

                    {/* Balance summary */}
                    <Section title="Balance">
                        <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500 font-medium">Invoice Total</span>
                                <span className="text-sm font-semibold text-gray-800">
                                    K{(invoice.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500 font-medium">Amount Paid</span>
                                <span className="text-sm font-semibold text-emerald-600">
                                    K{(invoice.status === 'PAID' ? invoice.amount : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="border-t border-[#E8EEF8] pt-2 flex items-center justify-between">
                                <span className="text-sm font-bold text-brand-navy">Outstanding</span>
                                <span className={`text-sm font-bold ${outstanding > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                    K{outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    </Section>

                    {/* Payment link reference */}
                    {invoice.reference && (
                        <Section title="Transaction Reference">
                            <div className="bg-gray-50 rounded-2xl p-4">
                                <InfoRow
                                    icon={<Receipt size={14} />}
                                    label="Lenco Reference"
                                    value={<code className="font-mono text-[11px]">{invoice.reference}</code>}
                                />
                            </div>
                        </Section>
                    )}
                </div>

                {/* Footer actions */}
                {invoice.status === 'ACTIVE' && (
                    <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 flex-shrink-0 bg-white">
                        <button
                            onClick={handleCopy}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#0058DB] text-white font-bold text-sm rounded-2xl hover:bg-blue-700 active:scale-[0.98] transition-all"
                        >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                            {copied ? 'Copied!' : 'Copy Payment Link'}
                        </button>
                        <a
                            href={paymentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 border border-[#E8EEF8] rounded-2xl text-gray-400 hover:text-[#0058DB] hover:bg-[#F3F5FC] transition-all"
                            title="Open payment link"
                        >
                            <ExternalLink size={18} />
                        </a>
                    </div>
                )}
            </div>
        </>
    );
};
