import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { crmService, CustomerLoyalty } from '../../services/crm.service';
import { PurchaseHeatmap } from './PurchaseHeatmap';
import { SegmentBadge } from './loyaltyUi';
import { Loader2, Trophy } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const ago = (days: number | null) => (days === null ? '—' : days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`);

export const CustomerLoyaltyPanel: React.FC<{ customerId: string }> = ({ customerId }) => {
    const { data, isLoading, isError } = useQuery<CustomerLoyalty>({
        queryKey: ['crm-customer-loyalty', customerId],
        queryFn: () => crmService.getCustomerLoyalty(customerId),
    });

    if (isLoading) {
        return <div className="flex items-center justify-center h-32 gap-2 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" /> Loading loyalty…</div>;
    }
    if (isError || !data) {
        return <div className="flex items-center justify-center h-32 text-sm text-red-500">Couldn't load loyalty data for this customer.</div>;
    }

    const yearPurchases = Object.values(data.daily).reduce((s, d) => s + d.orders, 0);
    const maxTimes = Math.max(1, ...data.top_products.map(p => p.times_bought));

    const stats = [
        { label: 'Purchases', value: `${data.order_count}` },
        { label: 'Last purchase', value: ago(data.days_since_last_purchase) },
        { label: 'Buys about every', value: data.avg_days_between_orders === null ? '—' : `${data.avg_days_between_orders} days` },
        { label: 'First purchase', value: fmtDate(data.first_purchase_at) },
        { label: 'Lifetime value', value: `K${fmt(data.total_spent)}` },
    ];

    return (
        <div className="flex-1 overflow-y-auto flex flex-col gap-5 pr-1">
            <div className="flex items-center gap-3 flex-wrap">
                <SegmentBadge segment={data.segment} className="!text-xs !px-3 !py-1" />
                {stats.map(s => (
                    <div key={s.label} className="flex flex-col px-3 py-1.5 rounded-lg border border-gray-100 bg-gray-50/60">
                        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">{s.label}</span>
                        <span className="text-xs font-bold text-gray-900">{s.value}</span>
                    </div>
                ))}
            </div>

            <section className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-baseline justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-900 font-['DM_Sans']">Purchase activity</h3>
                    <span className="text-[11px] text-gray-400">
                        {yearPurchases} purchase{yearPurchases === 1 ? '' : 's'} on {data.active_days_last_year} day{data.active_days_last_year === 1 ? '' : 's'} in the last year
                    </span>
                </div>
                <PurchaseHeatmap daily={data.daily} />
            </section>

            <section className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-baseline justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-900 font-['DM_Sans'] flex items-center gap-2"><Trophy size={14} className="text-amber-500" /> Top 5 favourite products</h3>
                    <span className="text-[11px] text-gray-400">{data.distinct_products} different product{data.distinct_products === 1 ? '' : 's'} bought</span>
                </div>
                {data.top_products.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">No product purchases recorded for this customer yet.</p>
                ) : (
                    <ol className="flex flex-col gap-3">
                        {data.top_products.map((p, i) => (
                            <li key={p.key} className="flex items-center gap-3">
                                <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-xs font-semibold text-gray-900 truncate">{p.name}</span>
                                        <span className="text-xs font-bold text-emerald-700 flex-shrink-0">
                                            Bought {p.times_bought}×
                                        </span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-gray-100 mt-1.5 overflow-hidden">
                                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(p.times_bought / maxTimes) * 100}%` }} />
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1">{p.quantity} unit{p.quantity === 1 ? '' : 's'} in total · K{fmt(p.total_spent)} spent</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </section>
        </div>
    );
};
