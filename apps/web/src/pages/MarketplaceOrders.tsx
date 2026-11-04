import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, MapPin, Package, Phone, Store, Truck } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { Dialog, ErrorNote, PrimaryButton, TonalButton } from '../components/ui/Dialog';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import { LocationNudge } from '../components/marketplace/LocationNudge';
import type { Order, OrderStatus } from '../components/marketplace/orderTypes';

const STEPS: { status: OrderStatus; label: string }[] = [
    { status: 'PAID', label: 'Paid' }, { status: 'PROCESSING', label: 'Preparing' }, { status: 'READY', label: 'Ready' }, { status: 'COMPLETED', label: 'Received' },
];
const RANK: Record<string, number> = { PAYMENT_PROCESSING: 0, PAID: 0, PROCESSING: 1, READY: 2, OUT_FOR_DELIVERY: 2, COMPLETED: 3 };

const BADGE: Record<OrderStatus, { label: string; cls: string }> = {
    PENDING_PAYMENT: { label: 'Awaiting payment', cls: 'bg-[#FEF7E0] text-[#B06000]' },
    PAYMENT_PROCESSING: { label: 'Payment confirming', cls: 'bg-[#FEF7E0] text-[#B06000]' },
    PAID: { label: 'Paid', cls: 'bg-[#E8F0FE] text-[#1967D2]' },
    PROCESSING: { label: 'Preparing', cls: 'bg-[#E8F0FE] text-[#1967D2]' },
    READY: { label: 'Ready', cls: 'bg-[#E8F0FE] text-[#1967D2]' },
    OUT_FOR_DELIVERY: { label: 'On the way', cls: 'bg-[#E8F0FE] text-[#1967D2]' },
    COMPLETED: { label: 'Completed', cls: 'bg-[#E6F4EA] text-[#137333]' },
    DISPUTED: { label: 'Problem reported', cls: 'bg-[#FCE8E6] text-[#B31412]' },
    FAILED: { label: 'Payment failed', cls: 'bg-[#FCE8E6] text-[#B31412]' },
    REFUNDED: { label: 'Refunded', cls: 'bg-[#F1F3F4] text-[#3C4043]' },
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const Steps: React.FC<{ order: Order }> = ({ order }) => {
    if (order.status === 'DISPUTED' || order.status === 'REFUNDED' || order.status === 'FAILED' || order.status === 'PENDING_PAYMENT') return null;
    const at = RANK[order.status] ?? 0;
    return (
        <ol className="mt-4 flex items-center">
            {STEPS.map((s, i) => (
                <li key={s.status} className="flex flex-1 items-center last:flex-none">
                    <span className="flex flex-col items-center gap-1">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${i <= at ? 'bg-[#0B57D0] text-white' : 'bg-[#E9EEF6] text-[#5F6368]'}`}>{i < at ? <Check size={13} /> : i + 1}</span>
                        <span className={`text-[11px] ${i <= at ? 'font-semibold text-[#1F1F1F]' : 'text-[#80868B]'}`}>{s.label}</span>
                    </span>
                    {i < STEPS.length - 1 && <span className={`mx-1 mb-4 h-0.5 flex-1 ${i < at ? 'bg-[#0B57D0]' : 'bg-[#E9EEF6]'}`} />}
                </li>
            ))}
        </ol>
    );
};

type Role = 'buyer' | 'seller';

const OrderCard: React.FC<{ order: Order; role: Role; onChanged: () => void }> = ({ order, role, onChanged }) => {
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dialog, setDialog] = useState<'report' | 'respond' | 'refund' | null>(null);
    const [text, setText] = useState('');
    const badge = BADGE[order.status];
    const live = !['COMPLETED', 'DISPUTED', 'FAILED', 'PENDING_PAYMENT', 'REFUNDED'].includes(order.status);
    const refundable = ['PAID', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'DISPUTED'].includes(order.status);

    const call = async (key: string, path: string, body?: object) => {
        setBusy(key); setError(null);
        try { await apiJson(`/marketplace/orders/${order.id}${path}`, { method: 'POST', body: JSON.stringify(body ?? {}) }); setDialog(null); setText(''); onChanged(); }
        catch (e: any) { setError(e?.message || 'That didn’t work. Try again.'); }
        finally { setBusy(null); }
    };

    const sellerNext: { status: OrderStatus; label: string } | null =
        order.status === 'PAID' ? { status: 'PROCESSING', label: 'Start preparing' }
        : order.status === 'PROCESSING' ? { status: 'READY', label: order.delivery_method === 'PICKUP' ? 'Ready for pick-up' : order.delivery_method === 'OPUS' ? 'Packed, ready for the rider' : 'Ready to deliver' }
        : order.status === 'READY' && order.delivery_method === 'SELLER' ? { status: 'OUT_FOR_DELIVERY', label: 'Out for delivery' }
        : order.status === 'READY' || order.status === 'OUT_FOR_DELIVERY' ? { status: 'COMPLETED', label: 'Mark handed over' }
        : null;

    return (
        <li className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-base font-bold text-[#1F1F1F]">{order.product_name}{order.quantity > 1 ? ` ×${order.quantity}` : ''}</p>
                    <p className="mt-0.5 text-xs text-[#5F6368]">
                        {role === 'buyer' ? <>From {order.seller_name}</> : <>For {order.buyer_name}</>} · {when(order.created_at)}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-base font-bold tabular-nums text-[#1F1F1F]">{formatKwacha(order.total)}</p>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badge.cls}`}>{badge.label}</span>
                </div>
            </div>

            <Steps order={order} />

            <div className="mt-4 grid gap-1.5 text-xs text-[#5F6368]">
                <p className="flex items-start gap-1.5"><Truck size={13} className="mt-0.5 flex-shrink-0" />{order.delivery_method !== 'PICKUP' ? `${order.delivery_method === 'OPUS' ? 'Opus Delivery' : 'Delivery'} to ${order.delivery_area}${order.delivery_address ? `, ${order.delivery_address}` : ''}` : 'Pick-up, or arranged with the seller'}{order.delivery_fee > 0 ? ` (${formatKwacha(order.delivery_fee)})` : ''}</p>
                {role === 'seller' && order.buyer_phone && <p className="flex items-center gap-1.5"><Phone size={13} /><a href={`tel:${order.buyer_phone}`} className="font-semibold text-[#0B57D0] hover:underline">{order.buyer_phone}</a></p>}
                {order.delivery_notes && <p className="flex items-start gap-1.5"><MapPin size={13} className="mt-0.5 flex-shrink-0" />“{order.delivery_notes}”</p>}
            </div>

            {order.status === 'DISPUTED' && (
                <div className="mt-4 rounded-xl bg-[#FCE8E6] p-4 text-sm text-[#B31412]">
                    <p className="flex items-center gap-2 font-bold"><AlertTriangle size={15} /> Problem reported</p>
                    <p className="mt-1 text-[#3C4043]">“{order.dispute_reason}”</p>
                    {order.dispute_response && <p className="mt-2 text-[#3C4043]"><span className="font-semibold">Seller replied:</span> “{order.dispute_response}”</p>}
                    <p className="mt-2 text-xs text-[#5F6368]">MoneyWise support reviews reported problems. If the seller agrees, they can refund you straight to your wallet; MoneyWise support can help if they don’t.</p>
                </div>
            )}
            {order.status === 'REFUNDED' && <p className="mt-4 rounded-xl bg-[#F1F3F4] p-3 text-sm text-[#3C4043]">{formatKwacha(order.refund_amount ?? order.total)} was sent back to {role === 'buyer' ? 'your wallet' : 'the buyer’s wallet'}{order.refunded_at ? ` on ${when(order.refunded_at)}` : ''}.</p>}
            {order.status === 'FAILED' && <p className="mt-4 rounded-xl bg-[#FCE8E6] p-3 text-sm text-[#B31412]">The payment didn’t go through and nothing was taken from your wallet.</p>}

            <ErrorNote text={error} />

            <div className="mt-4 flex flex-wrap gap-2">
                {role === 'seller' && sellerNext && <PrimaryButton busy={busy === 'step'} onClick={() => call('step', '/status', { status: sellerNext.status })} className="h-10 px-5">{sellerNext.label}</PrimaryButton>}
                {role === 'seller' && order.status === 'DISPUTED' && !order.dispute_response && <TonalButton onClick={() => setDialog('respond')} className="h-10">Reply to the problem</TonalButton>}
                {role === 'seller' && refundable && <button type="button" onClick={() => setDialog('refund')} className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-[#B31412] shadow-[inset_0_0_0_1px_#B31412] hover:bg-[#FCE8E6]">Refund buyer</button>}
                {role === 'buyer' && live && order.status !== 'PAYMENT_PROCESSING' && <PrimaryButton busy={busy === 'done'} onClick={() => call('done', '/status', { status: 'COMPLETED' })} className="h-10 px-5">I received it</PrimaryButton>}
                {role === 'buyer' && (live || order.status === 'COMPLETED') && <button type="button" onClick={() => setDialog('report')} className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-[#B31412] hover:bg-[#FCE8E6]">Report a problem</button>}
            </div>

            <Dialog open={dialog === 'refund'} onClose={() => setDialog(null)} title="Refund the buyer?">
                <p className="mb-3 text-sm text-[#3C4043]">
                    {formatKwacha(order.delivery_method === 'OPUS' ? order.item_total : order.total)} goes from your main wallet back to {order.buyer_name} with no fee. This can’t be undone.
                    {order.delivery_method === 'OPUS' && ' The Opus delivery fee was paid to Opus and isn’t part of this refund.'}
                </p>
                <ErrorNote text={error} />
                <div className="mt-4 flex gap-2">
                    <TonalButton onClick={() => setDialog(null)} className="h-11 flex-1">Cancel</TonalButton>
                    <PrimaryButton busy={busy === 'refund'} onClick={() => call('refund', '/refund')} className="flex-1">Send refund</PrimaryButton>
                </div>
            </Dialog>

            <Dialog open={dialog === 'report' || dialog === 'respond'} onClose={() => setDialog(null)} title={dialog === 'report' ? 'Report a problem' : 'Reply to the buyer'}>
                <p className="mb-3 text-sm text-[#5F6368]">{dialog === 'report' ? 'Tell us what went wrong. The seller is notified and support can step in. You have 14 days after payment.' : 'Say how you will put this right.'}</p>
                <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} className="w-full rounded-xl border border-[#C4C7C5] px-4 py-3 text-sm focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]" placeholder="Write a few lines…" />
                <ErrorNote text={error} />
                <div className="mt-4 flex gap-2">
                    <TonalButton onClick={() => setDialog(null)} className="h-11 flex-1">Cancel</TonalButton>
                    <PrimaryButton busy={busy === 'dialog'} disabled={text.trim().length < 5} onClick={() => call('dialog', dialog === 'report' ? '/dispute' : '/dispute/respond', dialog === 'report' ? { reason: text } : { note: text })} className="flex-1">Send</PrimaryButton>
                </div>
            </Dialog>
        </li>
    );
};

export const MarketplaceOrders: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [role, setRole] = useState<Role>('buyer');
    const { data, isPending } = useQuery({
        queryKey: ['marketplace', 'orders', role],
        queryFn: () => apiJson<{ orders: Order[] }>(`/marketplace/orders?role=${role}`),
        refetchInterval: 20_000,
        staleTime: 5_000,
    });
    const refresh = useMutation({ mutationFn: async () => undefined, onSettled: () => qc.invalidateQueries({ queryKey: ['marketplace', 'orders'] }) });
    const orders = data?.orders ?? [];

    return (
        <PagePanel title="Marketplace" subtitle="Your orders: what you bought and what you sold" tabs={<MarketplaceTabs active="orders" />}>
            <div role="tablist" className="mb-6 inline-flex gap-2">
                {([['buyer', 'Bought'], ['seller', 'Sold']] as const).map(([id, label]) => (
                    <button key={id} role="tab" aria-selected={role === id} onClick={() => setRole(id)} className={`h-10 rounded-full px-5 text-sm transition ${role === id ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}>{label}</button>
                ))}
            </div>
            {role === 'seller' && <LocationNudge className="mb-5" />}
            {isPending ? (
                <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-[#F1F3F4]" />)}</div>
            ) : orders.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                    <Package size={30} className="text-[#9AA0A6]" />
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">{role === 'buyer' ? 'You haven’t bought anything yet' : 'No sales yet'}</p>
                    <p className="mt-1 text-sm text-[#5F6368]">{role === 'buyer' ? 'Orders you place on the Marketplace show up here.' : 'When someone buys from your store, the order appears here.'}</p>
                    <PrimaryButton onClick={() => navigate(role === 'buyer' ? '/marketplace' : '/products')} className="mt-5 h-11 px-6"><Store size={16} /> {role === 'buyer' ? 'Browse the Marketplace' : 'Manage listings'}</PrimaryButton>
                </div>
            ) : (
                <ul className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">{orders.map((o) => <OrderCard key={o.id} order={o} role={role} onChanged={() => refresh.mutate()} />)}</ul>
            )}
        </PagePanel>
    );
};
