import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Globe, Package } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { PrimaryButton, TonalButton } from '../components/ui/Dialog';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import { IMPORT_STEPS } from '../components/marketplace/importTypes';
import type { ImportOrder } from '../components/marketplace/importTypes';
import { resized } from '../lib/images';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const Steps: React.FC<{ status: ImportOrder['status'] }> = ({ status }) => {
    const at = IMPORT_STEPS.findIndex((s) => s.id === status);
    return (
        <ol className="flex items-start" aria-label="Where it is">
            {IMPORT_STEPS.map((s, i) => {
                const reached = at >= i;
                return (
                    <li key={s.id} className="flex min-w-0 flex-1 flex-col items-center text-center">
                        <div className="flex w-full items-center">
                            <span className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : at >= i ? 'bg-[#34A853]' : 'bg-[#DADCE0]'}`} />
                            <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${reached ? 'bg-[#34A853] text-white' : 'bg-[#DADCE0]'}`}>{reached && <Check size={12} strokeWidth={3} />}</span>
                            <span className={`h-0.5 flex-1 ${i === IMPORT_STEPS.length - 1 ? 'opacity-0' : at > i ? 'bg-[#34A853]' : 'bg-[#DADCE0]'}`} />
                        </div>
                        <span className={`mt-1 px-0.5 text-[10px] leading-tight ${at === i ? 'font-bold text-[#1F1F1F]' : 'text-[#80868B]'}`}>{s.label}</span>
                    </li>
                );
            })}
        </ol>
    );
};

/** Everything ordered from overseas: where each order is, the tracking number, and what has happened so far. */
export const MarketplaceImportOrders: React.FC = () => {
    const navigate = useNavigate();
    const { data, isPending, isError, refetch } = useQuery({ queryKey: ['marketplace', 'imports', 'orders'], queryFn: () => apiJson<{ orders: ImportOrder[] }>('/marketplace/imports/orders'), refetchInterval: 60_000 });
    const orders = data?.orders ?? [];
    return (
        <PagePanel title="Marketplace" subtitle="Your orders from overseas" tabs={<MarketplaceTabs active="import-orders" />}>
            {isError ? (
                <div className="py-14 text-center"><p className="text-sm text-[#5F6368]">Couldn’t load your import orders.</p><TonalButton onClick={() => refetch()} className="mt-3">Try again</TonalButton></div>
            ) : isPending ? (
                <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-[#F1F3F4]" />)}</div>
            ) : orders.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                    <Package size={30} className="text-[#9AA0A6]" />
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">No import orders yet</p>
                    <p className="mt-1 max-w-sm text-sm text-[#5F6368]">Order something from an overseas store and you’ll follow it here, from the store to your door.</p>
                    <PrimaryButton onClick={() => navigate('/marketplace/imported')} className="mt-5 h-11 px-6"><Globe size={16} /> Browse imported products</PrimaryButton>
                </div>
            ) : (
                <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {orders.map((o) => {
                        const cancelled = o.status === 'CANCELLED' || o.status === 'REFUNDED';
                        return (
                            <li key={o.id} className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4">
                                <div className="flex gap-3">
                                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-[#F1F3F4]">{o.image_url && <img src={resized(o.image_url, 160, { square: true })} alt="" className="h-full w-full object-cover" />}</div>
                                    <div className="min-w-0 flex-1">
                                        <p className="line-clamp-2 text-sm font-semibold text-[#1F1F1F]">{o.title}{o.quantity > 1 ? ` ×${o.quantity}` : ''}</p>
                                        <p className="text-xs text-[#5F6368]">{formatKwacha(o.total_zmw)} · ordered {when(o.created_at)}{o.option_note ? ` · ${o.option_note}` : ''}</p>
                                    </div>
                                    {cancelled && <span className="h-fit rounded-full bg-[#FCE8E6] px-2.5 py-1 text-[11px] font-bold text-[#B31412]">Cancelled</span>}
                                </div>
                                {!cancelled && <div className="mt-4"><Steps status={o.status} /></div>}
                                {(o.tracking_number || o.supplier_order_ref) && (
                                    <p className="mt-3 rounded-xl bg-[#F8FAFD] px-3 py-2 text-xs text-[#3C4043]">
                                        {o.tracking_number && <>Tracking <span className="font-bold tabular-nums">{o.tracking_number}</span>{o.carrier ? ` with ${o.carrier}` : ''}. </>}
                                        {o.supplier_order_ref && <>Store order <span className="font-semibold">{o.supplier_order_ref}</span>.</>}
                                    </p>
                                )}
                                {o.events.length > 0 && (
                                    <ul className="mt-3 space-y-1.5 border-l-2 border-[#E3E5E8] pl-3">
                                        {[...o.events].reverse().map((e, i) => (
                                            <li key={`${e.at}-${i}`} className="text-xs"><span className="text-[#80868B]">{when(e.at)}</span> <span className="text-[#1F1F1F]">{e.note || e.status}</span></li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </PagePanel>
    );
};
