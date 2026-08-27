import React, { useEffect, useState } from 'react';
import {
    X,
    Package,
    MapPin,
    Truck,
    ShoppingBag,
    Loader2,
    Receipt,
    AlertCircle,
    CheckCircle2,
    Clock,
    RotateCcw,
    AlertTriangle,
} from 'lucide-react';
import axios from 'axios';
import { supabase } from '../lib/supabase';
import { inflowTitle } from './InflowInbox';
import type { InflowRow } from './InflowInbox';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

interface ProductSale {
    id: string;
    product_id: string;
    customer_name: string;
    customer_phone: string;
    quantity: number;
    amount_paid: number;
    status: string;
    created_at: string;
    order_details?: {
        mode?: 'deliver' | 'pickup';
        country?: string;
        state?: string;
        street?: string;
        apartment?: string;
        rider_service?: string;
        rider_service_name?: string;
        delivery_charge?: number;
    } | null;
    products?: {
        id: string;
        name: string;
        description?: string;
        image_url?: string | null;
        product_type?: string;
    } | null;
}

interface InflowDetailDrawerProps {
    inflow: InflowRow | null;
    onClose: () => void;
}

const STATUS_MAP: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    COMPLETED: {
        label: 'Completed',
        icon: <CheckCircle2 size={13} className="text-emerald-500" />,
        color: 'text-emerald-600',
    },
    PENDING: {
        label: 'Pending',
        icon: <Clock size={13} className="text-[#0058DB]" />,
        color: 'text-[#0058DB]',
    },
    FAILED: {
        label: 'Failed',
        icon: <AlertTriangle size={13} className="text-red-500" />,
        color: 'text-red-600',
    },
    PROCESSING: {
        label: 'Processing',
        icon: <RotateCcw size={13} className="text-gray-400" />,
        color: 'text-gray-500',
    },
};

const statusCfg = (s: string) => STATUS_MAP[s] ?? STATUS_MAP.PENDING;

/** Side-panel drawer that shows inflow details including sold items + delivery info. */
const InflowDetailDrawer: React.FC<InflowDetailDrawerProps> = ({ inflow, onClose }) => {
    const [sales, setSales] = useState<ProductSale[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!inflow) return;
        setSales([]);
        setError(null);

        // Only fetch product sales when the description suggests it's a product sale.
        // References for public-portal sales start with "DEP-" or come from manual sales.
        const ref = inflow.reference_number;
        if (!ref) return;

        (async () => {
            setLoading(true);
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.access_token) return;
                const res = await axios.get(
                    `${API_URL}/organizations/products/sales-by-reference/${encodeURIComponent(ref)}`,
                    { headers: { Authorization: `Bearer ${session.access_token}` } }
                );
                setSales(Array.isArray(res.data) ? res.data : []);
            } catch (err: any) {
                // 404 just means no product sales for this inflow — that's fine.
                if (err?.response?.status !== 404) {
                    setError('Could not load order details.');
                }
            } finally {
                setLoading(false);
            }
        })();
    }, [inflow?.id]);

    if (!inflow) return null;

    const title = inflowTitle(inflow.description);
    const amount = inflow.debit || 0;
    const dateStr = new Date(inflow.date).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
    const cfg = statusCfg(inflow.status || 'COMPLETED');

    // Grab delivery details from the first sale that has them.
    const deliverySale = sales.find(s => s.order_details);
    const delivery = deliverySale?.order_details;
    const hasDelivery = !!delivery;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] animate-in fade-in duration-150"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white shadow-xl flex flex-col animate-in slide-in-from-right duration-250">
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between shrink-0">
                    <div className="flex-1 min-w-0 pr-3">
                        <h2 className="text-base font-bold text-gray-900 leading-snug truncate">{title}</h2>
                        <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 transition-colors flex-shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {/* Amount + status */}
                    <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-2xl">
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Amount received</p>
                            <p className="text-2xl font-bold text-gray-900 mt-0.5">
                                K{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className={`flex items-center gap-1.5 text-xs font-semibold ${cfg.color}`}>
                            {cfg.icon}
                            {cfg.label}
                        </div>
                    </div>

                    {/* Basic info */}
                    <div className="space-y-2">
                        {inflow.reference_number && (
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400 flex items-center gap-1.5"><Receipt size={13} />Reference</span>
                                <span className="text-gray-700 font-semibold text-xs font-mono">{inflow.reference_number}</span>
                            </div>
                        )}
                        {inflow.account_type && (
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400 flex items-center gap-1.5"><Package size={13} />Channel</span>
                                <span className="text-gray-700 font-semibold capitalize text-xs">
                                    {inflow.account_type.replace(/_/g, ' ').toLowerCase()}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Items sold */}
                    {loading && (
                        <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                            <Loader2 size={14} className="animate-spin" />
                            Loading order details…
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    )}

                    {!loading && sales.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Items Ordered</h3>
                            <div className="space-y-2">
                                {sales.map(sale => (
                                    <div key={sale.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl">
                                        <div className="w-10 h-10 rounded-xl bg-[#0058DB]/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                                            {sale.products?.image_url ? (
                                                <img src={sale.products.image_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <ShoppingBag size={16} className="text-[#0058DB]" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-800 truncate">
                                                {sale.products?.name ?? 'Unknown product'}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                Qty {sale.quantity} · K{Number(sale.amount_paid).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                            sale.status === 'COMPLETED'
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'bg-gray-100 text-gray-500'
                                        }`}>
                                            {sale.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Customer info (from first sale) */}
                    {!loading && sales.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Customer</h3>
                            <div className="p-3 bg-gray-50 rounded-2xl space-y-1.5">
                                <p className="text-sm font-semibold text-gray-800">{sales[0].customer_name}</p>
                                <p className="text-xs text-gray-500">{sales[0].customer_phone}</p>
                            </div>
                        </div>
                    )}

                    {/* Delivery details */}
                    {!loading && hasDelivery && (
                        <div>
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                {delivery!.mode === 'pickup' ? 'Pick-Up Order' : 'Delivery Details'}
                            </h3>
                            <div className="p-4 bg-blue-50 rounded-2xl space-y-3">
                                {/* Mode badge */}
                                <div className="flex items-center gap-2">
                                    {delivery!.mode === 'pickup' ? (
                                        <>
                                            <ShoppingBag size={15} className="text-[#0058DB]" />
                                            <span className="text-sm font-bold text-[#0058DB]">Customer will pick up</span>
                                        </>
                                    ) : (
                                        <>
                                            <Truck size={15} className="text-[#0058DB]" />
                                            <span className="text-sm font-bold text-[#0058DB]">Deliver to customer</span>
                                        </>
                                    )}
                                </div>

                                {/* Address */}
                                {delivery!.mode === 'deliver' && (
                                    <div className="space-y-1.5">
                                        {delivery!.street && (
                                            <div className="flex items-start gap-2">
                                                <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                                                <div className="text-xs text-gray-700 space-y-0.5">
                                                    {delivery!.street && <p className="font-medium">{delivery!.street}</p>}
                                                    {delivery!.apartment && <p className="text-gray-500">{delivery!.apartment}</p>}
                                                    {(delivery!.state || delivery!.country) && (
                                                        <p className="text-gray-500">
                                                            {[delivery!.state, delivery!.country].filter(Boolean).join(', ')}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Rider service */}
                                        {delivery!.rider_service_name && (
                                            <div className="flex items-center gap-2 pt-1 border-t border-blue-100">
                                                <Truck size={13} className="text-gray-400 flex-shrink-0" />
                                                <div>
                                                    <span className="text-xs font-semibold text-gray-700">{delivery!.rider_service_name}</span>
                                                    {delivery!.delivery_charge != null && (
                                                        <span className="text-xs text-gray-500 ml-1">
                                                            · K{Number(delivery!.delivery_charge).toFixed(2)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Own delivery charge */}
                                        {!delivery!.rider_service_name && delivery!.delivery_charge != null && delivery!.delivery_charge > 0 && (
                                            <div className="flex items-center gap-2 pt-1 border-t border-blue-100">
                                                <Truck size={13} className="text-gray-400 flex-shrink-0" />
                                                <span className="text-xs text-gray-700">
                                                    Delivery charge: <span className="font-bold">K{Number(delivery!.delivery_charge).toFixed(2)}</span>
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {!loading && !error && sales.length === 0 && inflow.reference_number && (
                        <div className="text-xs text-gray-400 text-center py-4">
                            No product line items found for this transaction.
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default InflowDetailDrawer;
