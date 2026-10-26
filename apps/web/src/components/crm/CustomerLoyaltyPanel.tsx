import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { crmService, CustomerLoyalty } from '../../services/crm.service';
import { PurchaseHeatmap } from './PurchaseHeatmap';
import { Loader2, ShoppingBag, Trophy } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

    return (
        <div className="flex-1 overflow-y-auto flex flex-col gap-5 pr-1">
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
                                <div className="h-11 w-11 rounded-xl bg-[#0058DB]/10 overflow-hidden flex items-center justify-center shadow-inner flex-shrink-0">
                                    {p.image_url ? (
                                        <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <ShoppingBag className="h-5 w-5 text-[#0058DB]" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-xs font-semibold text-gray-900 truncate">{i + 1}. {p.name}</span>
                                        <span className="text-xs font-bold text-emerald-700 flex-shrink-0">
                                            Bought {p.times_bought}×
                                        </span>
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
