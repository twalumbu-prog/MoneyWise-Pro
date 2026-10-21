import React, { useEffect, useState } from 'react';
import {
    X, Package, MapPin, Truck, ShoppingBag, Loader2, AlertCircle, CheckCircle2, Clock,
    RotateCcw, AlertTriangle, Download, User, Phone, CreditCard, BookOpen, ClipboardList, PackageCheck,
} from 'lucide-react';
import { productService, buildInflowReceipt, channelLabel, paymentMethodLabel, isDeliverable, formatReceiptDate } from 'core';
import type { InflowDetail, ProductSale } from 'core';
import { inflowTitle } from './InflowInbox';
import type { InflowRow } from './InflowInbox';
import { downloadInflowReceiptPdf } from '../utils/inflowReceiptPdf';

interface InflowDetailDrawerProps {
    inflow: InflowRow | null;
    onClose: () => void;
}

const STATUS_MAP: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    COMPLETED: { label: 'Completed', icon: <CheckCircle2 size={13} className="text-emerald-500" />, color: 'text-emerald-600' },
    ACCOUNTED: { label: 'Accounted', icon: <CheckCircle2 size={13} className="text-emerald-500" />, color: 'text-emerald-600' },
    PENDING: { label: 'Pending', icon: <Clock size={13} className="text-[#0058DB]" />, color: 'text-[#0058DB]' },
    FAILED: { label: 'Failed', icon: <AlertTriangle size={13} className="text-red-500" />, color: 'text-red-600' },
    PROCESSING: { label: 'Processing', icon: <RotateCcw size={13} className="text-gray-400" />, color: 'text-gray-500' },
};
const statusCfg = (s: string) => STATUS_MAP[s] ?? STATUS_MAP.COMPLETED;
const kwacha = (n: number) => `K${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
    <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">{icon}{children}</h3>
);

const Row: React.FC<{ label: string; value?: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) =>
    value ? (
        <div className="flex items-start justify-between gap-4 text-sm">
            <span className="text-gray-400 shrink-0">{label}</span>
            <span className={`text-gray-800 font-semibold text-right break-all ${mono ? 'font-mono text-xs' : 'text-[13px]'}`}>{value}</span>
        </div>
    ) : null;

/** Side-panel drawer that shows inflow details including sold items + delivery info. */
const InflowDetailDrawer: React.FC<InflowDetailDrawerProps> = ({ inflow, onClose }) => {
    const [detail, setDetail] = useState<InflowDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    useEffect(() => {
        setDetail(null);
        setError(null);
        if (!inflow) return;
        let cancelled = false;
        setLoading(true);
        productService.getInflowDetail(inflow.id, inflow.reference_number)
            .then((d) => { if (!cancelled) setDetail(d); })
            .catch(() => { if (!cancelled) setError('Could not load the full details for this inflow.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [inflow?.id]);

    if (!inflow) return null;

    const sales: ProductSale[] = detail?.sales ?? [];
    const receipt = detail ? buildInflowReceipt(detail, inflow) : null;
    const title = inflowTitle(inflow.description);
    const amount = receipt?.amount ?? (inflow.debit || 0);
    const dateStr = new Date(inflow.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const cfg = statusCfg(inflow.status || 'COMPLETED');
    const delivery = sales.find((x) => x.order_details)?.order_details;
    const deliverable = sales.filter(isDeliverable);
    const deliveredCount = deliverable.filter((x) => x.delivery_status === 'DELIVERED').length;

    const toggleDelivered = async (sale: ProductSale) => {
        const next = sale.delivery_status !== 'DELIVERED';
        setTogglingId(sale.id);
        try {
            const res = await productService.setSaleDelivery(sale.id, next);
            setDetail((d) => d && ({
                ...d,
                sales: d.sales.map((x) => x.id === sale.id ? { ...x, delivery_status: res.delivery_status as any, delivered_at: res.delivered_at } : x),
            }));
        } catch {
            setError('Could not update the delivery status. Please try again.');
        } finally {
            setTogglingId(null);
        }
    };

    const card = 'p-4 bg-gray-50 rounded-2xl';

    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] animate-in fade-in duration-150" onClick={onClose} />

            <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-xl flex flex-col animate-in slide-in-from-right duration-250">
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between shrink-0">
                    <div className="flex-1 min-w-0 pr-3">
                        <h2 className="text-base font-bold text-gray-900 leading-snug truncate">{title}</h2>
                        <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 transition-colors flex-shrink-0">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {/* Amount + status */}
                    <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-2xl">
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Amount received</p>
                            <p className="text-2xl font-bold text-gray-900 mt-0.5">{kwacha(amount)}</p>
                        </div>
                        <div className={`flex items-center gap-1.5 text-xs font-semibold ${cfg.color}`}>{cfg.icon}{cfg.label}</div>
                    </div>

                    {loading && (
                        <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                            <Loader2 size={14} className="animate-spin" />Loading details…
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">
                            <AlertCircle size={14} />{error}
                        </div>
                    )}

                    {/* Payment details */}
                    <div>
                        <SectionTitle icon={<CreditCard size={12} />}>Payment</SectionTitle>
                        <div className={`${card} space-y-2`}>
                            <Row label="Reference" value={inflow.reference_number} mono />
                            <Row label="Payment method" value={receipt?.paymentMethod ?? paymentMethodLabel(inflow.account_type)} />
                            <Row label="Channel" value={receipt?.channel ?? channelLabel(inflow.account_type)} />
                            <Row label="Received into" value={receipt?.wallet} />
                        </div>
                    </div>

                    {/* Customer contact */}
                    {receipt && (receipt.payer.name || receipt.payer.phone) && (
                        <div>
                            <SectionTitle icon={<User size={12} />}>Customer</SectionTitle>
                            <div className={`${card} space-y-1.5`}>
                                {receipt.payer.name && <p className="text-sm font-semibold text-gray-800">{receipt.payer.name}</p>}
                                {receipt.payer.phone && (
                                    <a href={`tel:${receipt.payer.phone}`} className="text-xs text-gray-500 flex items-center gap-1.5 hover:text-[#0058DB]">
                                        <Phone size={12} />{receipt.payer.phone}
                                    </a>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Items, collected info and delivery per line */}
                    {sales.length > 0 && (
                        <div>
                            <SectionTitle icon={<ShoppingBag size={12} />}>Items Ordered</SectionTitle>
                            <div className="space-y-2.5">
                                {sales.map((sale) => {
                                    const canDeliver = isDeliverable(sale);
                                    const done = sale.delivery_status === 'DELIVERED';
                                    return (
                                        <div key={sale.id} className="bg-gray-50 rounded-2xl overflow-hidden">
                                            <div className="flex items-center gap-3 p-3">
                                                <div className="w-11 h-11 rounded-xl bg-[#0058DB]/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                                                    {sale.products?.image_url
                                                        ? <img src={sale.products.image_url} alt="" className="w-full h-full object-cover" />
                                                        : <ShoppingBag size={16} className="text-[#0058DB]" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-800 truncate">{sale.products?.name ?? 'Unknown product'}</p>
                                                    <p className="text-xs text-gray-400">Qty {sale.quantity} · {kwacha(sale.amount_paid)}</p>
                                                </div>
                                            </div>

                                            {sale.customer_responses && sale.customer_responses.length > 0 && (
                                                <div className="px-3 pb-3">
                                                    <div className="rounded-xl bg-white border border-gray-100 divide-y divide-gray-100">
                                                        {sale.customer_responses.map((r) => (
                                                            <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                                                                <span className="text-gray-400">{r.label}</span>
                                                                <span className="font-semibold text-gray-800 text-right">{r.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {canDeliver && (
                                                <div className={`flex items-center justify-between gap-3 px-3 py-2.5 border-t ${done ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {done ? <PackageCheck size={15} className="text-emerald-600 shrink-0" /> : <Package size={15} className="text-amber-600 shrink-0" />}
                                                        <div className="min-w-0">
                                                            <p className={`text-xs font-bold ${done ? 'text-emerald-700' : 'text-amber-700'}`}>{done ? 'Delivered' : 'Not yet delivered'}</p>
                                                            {done && sale.delivered_at && <p className="text-[10px] text-emerald-600/80">{formatReceiptDate(sale.delivered_at)}</p>}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => toggleDelivered(sale)}
                                                        disabled={togglingId === sale.id}
                                                        className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition-colors disabled:opacity-60 ${done ? 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50' : 'bg-[#0058DB] text-white hover:bg-[#004bb8]'}`}
                                                    >
                                                        {togglingId === sale.id ? '…' : done ? 'Undo' : 'Mark delivered'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {deliverable.length > 1 && (
                                <p className="text-[11px] text-gray-400 mt-2">{deliveredCount} of {deliverable.length} items delivered</p>
                            )}
                        </div>
                    )}

                    {/* Delivery / pick-up details */}
                    {delivery && (
                        <div>
                            <SectionTitle icon={<Truck size={12} />}>{delivery.mode === 'pickup' ? 'Pick-Up Order' : 'Delivery Details'}</SectionTitle>
                            <div className="p-4 bg-blue-50 rounded-2xl space-y-3">
                                <div className="flex items-center gap-2 text-sm font-bold text-[#0058DB]">
                                    {delivery.mode === 'pickup' ? <ShoppingBag size={15} /> : <Truck size={15} />}
                                    {delivery.mode === 'pickup' ? 'Customer will pick up' : 'Deliver to customer'}
                                </div>
                                {delivery.mode === 'deliver' && delivery.street && (
                                    <div className="flex items-start gap-2">
                                        <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                                        <div className="text-xs text-gray-700 space-y-0.5">
                                            <p className="font-medium">{delivery.street}</p>
                                            {delivery.apartment && <p className="text-gray-500">{delivery.apartment}</p>}
                                            {(delivery.state || delivery.country) && <p className="text-gray-500">{[delivery.state, delivery.country].filter(Boolean).join(', ')}</p>}
                                        </div>
                                    </div>
                                )}
                                {delivery.mode === 'deliver' && (delivery.rider_service_name || (delivery.delivery_charge ?? 0) > 0) && (
                                    <div className="flex items-center gap-2 pt-2 border-t border-blue-100 text-xs text-gray-700">
                                        <Truck size={13} className="text-gray-400 flex-shrink-0" />
                                        <span className="font-semibold">{delivery.rider_service_name || 'Delivery charge'}</span>
                                        {delivery.delivery_charge != null && <span className="text-gray-500">· {kwacha(delivery.delivery_charge)}</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Accounting treatment */}
                    {receipt && (
                        <div>
                            <SectionTitle icon={<BookOpen size={12} />}>Accounting Treatment</SectionTitle>
                            <div className={`${card} space-y-3`}>
                                <p className="text-xs text-gray-600 leading-relaxed">{receipt.accounting.summary}</p>
                                {receipt.accounting.lines.length > 0 && (
                                    <div className="rounded-xl bg-white border border-gray-100 overflow-hidden text-xs">
                                        <div className="grid grid-cols-[1fr_72px_72px] gap-2 px-3 py-1.5 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase">
                                            <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span>
                                        </div>
                                        {receipt.accounting.lines.map((l, i) => (
                                            <div key={i} className="grid grid-cols-[1fr_72px_72px] gap-2 px-3 py-2 border-t border-gray-100">
                                                <span className="text-gray-700 font-medium break-words">{l.account}</span>
                                                <span className="text-right text-gray-800">{l.debit ? kwacha(l.debit) : ''}</span>
                                                <span className="text-right text-gray-800">{l.credit ? kwacha(l.credit) : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="space-y-1.5">
                                    <Row label="Category" value={receipt.accounting.category} />
                                    <Row label="Recorded by" value={receipt.accounting.recordedBy} />
                                </div>
                            </div>
                        </div>
                    )}

                    {!loading && !error && sales.length === 0 && detail && (
                        <div className="text-xs text-gray-400 text-center py-2 flex items-center justify-center gap-1.5">
                            <ClipboardList size={13} />No product line items for this transaction.
                        </div>
                    )}
                </div>

                {/* Receipt */}
                <div className="px-5 py-4 border-t border-gray-100 shrink-0">
                    <button
                        onClick={() => receipt && downloadInflowReceiptPdf(receipt)}
                        disabled={!receipt}
                        className="w-full flex items-center justify-center gap-2 bg-[#0058DB] hover:bg-[#004bb8] disabled:opacity-50 text-white text-sm font-bold rounded-2xl py-3 transition-colors"
                    >
                        <Download size={16} />Download receipt
                    </button>
                </div>
            </div>
        </>
    );
};

export default InflowDetailDrawer;
