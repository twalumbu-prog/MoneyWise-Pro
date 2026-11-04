import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, Megaphone, MousePointerClick, Package, Rocket, Store } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../components/ui/Dialog';
import { resized } from '../lib/images';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import type { Wallet } from '../components/marketplace/orderTypes';

type Kind = 'FEATURED_ITEM' | 'BOOSTED_ITEM' | 'FEATURED_STORE';
interface Price { days: number; price: number; perDay: number }
interface KindInfo { kind: Kind; label: string; blurb: string; needsItem: boolean; prices: Price[] }
interface Campaign {
    id: string; kind: Kind; label: string; phase: 'PENDING_REVIEW' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'REJECTED' | 'CANCELLED' | 'FAILED' | 'PENDING_PAYMENT';
    product_name: string | null; start_date: string; end_date: string; days: number; price: number; impressions: number; clicks: number; ctr: number;
    reject_reason: string | null; refunded_at: string | null;
}
interface Overview { catalog: { enabled: boolean; kinds: KindInfo[] }; campaigns: Campaign[]; items: { id: string; name: string; image_url: string | null; price: number }[]; wallets: Wallet[] }

const PHASE: Record<Campaign['phase'], { label: string; cls: string }> = {
    PENDING_REVIEW: { label: 'In review', cls: 'bg-[#FEF7E0] text-[#B06000]' },
    SCHEDULED: { label: 'Scheduled', cls: 'bg-[#E8F0FE] text-[#1967D2]' },
    LIVE: { label: 'Live', cls: 'bg-[#E6F4EA] text-[#137333]' },
    ENDED: { label: 'Ended', cls: 'bg-[#F1F3F4] text-[#3C4043]' },
    REJECTED: { label: 'Not approved', cls: 'bg-[#FCE8E6] text-[#B31412]' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-[#F1F3F4] text-[#3C4043]' },
    FAILED: { label: 'Payment failed', cls: 'bg-[#FCE8E6] text-[#B31412]' },
    PENDING_PAYMENT: { label: 'Awaiting payment', cls: 'bg-[#FEF7E0] text-[#B06000]' },
};
const ICON: Record<Kind, React.ReactNode> = { FEATURED_ITEM: <Rocket size={18} />, BOOSTED_ITEM: <Megaphone size={18} />, FEATURED_STORE: <Store size={18} /> };
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const todayIso = () => new Date().toISOString().split('T')[0];

/** Where a seller buys Marketplace ads and sees how they are doing. Ads are reviewed before they run. */
export const MarketplaceAds: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const key = useRef(newKey());
    const { data, isPending } = useQuery({ queryKey: ['marketplace', 'ads'], queryFn: () => apiJson<Overview>('/marketplace/ads'), staleTime: 15_000 });

    const [kind, setKind] = useState<Kind>('FEATURED_ITEM');
    const [productId, setProductId] = useState('');
    const [days, setDays] = useState(7);
    const [start, setStart] = useState(todayIso());
    const [walletId, setWalletId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const info = data?.catalog.kinds.find((k) => k.kind === kind);
    const price = info?.prices.find((p) => p.days === days);
    const wallet = data?.wallets.find((w) => w.id === walletId) ?? data?.wallets.find((w) => w.is_main) ?? data?.wallets[0];
    const short = !!wallet && !!price && wallet.balance + 0.005 < price.price;
    const enabled = !!data?.catalog.enabled;
    const canBuy = enabled && !!price && !short && (!info?.needsItem || !!productId);
    const end = new Date(Date.parse(`${start}T00:00:00`) + (days - 1) * 86_400_000).toISOString().split('T')[0];

    const buy = async () => {
        setBusy(true); setError(null); setDone(false);
        try {
            await apiJson('/marketplace/ads', { method: 'POST', body: JSON.stringify({ kind, productId: info?.needsItem ? productId : undefined, days, startDate: start, walletId: wallet?.id, idempotencyKey: key.current }) });
            key.current = newKey();
            setDone(true); setProductId('');
            await Promise.all([qc.invalidateQueries({ queryKey: ['marketplace', 'ads'] }), qc.invalidateQueries({ queryKey: ['wallets'] })]);
        } catch (e: any) { setError(e?.message || 'The ad couldn’t be booked. Nothing was taken from your wallet.'); key.current = newKey(); }
        finally { setBusy(false); }
    };

    const cancel = async (c: Campaign) => {
        setError(null);
        try { await apiJson(`/marketplace/ads/${c.id}/cancel`, { method: 'POST' }); await Promise.all([qc.invalidateQueries({ queryKey: ['marketplace', 'ads'] }), qc.invalidateQueries({ queryKey: ['wallets'] })]); }
        catch (e: any) { setError(e?.message || 'Couldn’t cancel the ad.'); }
    };

    return (
        <PagePanel title="Marketplace" subtitle="Advertise: put your items or store in front of shoppers" tabs={<MarketplaceTabs active="ads" />}>
            {isPending || !data ? (
                <div className="space-y-4"><div className="h-40 animate-pulse rounded-2xl bg-[#F1F3F4]" /><div className="h-64 animate-pulse rounded-2xl bg-[#F1F3F4]" /></div>
            ) : (
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)] lg:items-start">
                    <div>
                    {!enabled && <p className="mb-5 rounded-2xl bg-[#FEF7E0] px-4 py-3 text-sm text-[#B06000]"><span className="font-bold">Ads are opening soon.</span> You can see the prices now; booking switches on shortly.</p>}

                    <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-5">
                        <h2 className="mb-4 text-base font-bold text-[#1F1F1F]">New ad</h2>

                        <label className={labelClass}>What do you want to promote?</label>
                        <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                            {data.catalog.kinds.map((k) => (
                                <button key={k.kind} type="button" onClick={() => { setKind(k.kind); setError(null); setDone(false); }} className={`rounded-2xl border p-4 text-left transition ${kind === k.kind ? 'border-[#0B57D0] bg-[#F0F6FF] shadow-[0_0_0_3px_rgba(11,87,208,0.12)]' : 'border-[rgba(116,119,117,0.3)] hover:border-[#0B57D0]/40'}`}>
                                    <span className="flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><span className="text-[#0B57D0]">{ICON[k.kind]}</span>{k.label}</span>
                                    <span className="mt-1 block text-xs text-[#5F6368]">{k.blurb}</span>
                                    <span className="mt-2 block text-xs font-semibold text-[#041E49]">from {formatKwacha(Math.min(...k.prices.map((p) => p.perDay)))} a day</span>
                                </button>
                            ))}
                        </div>

                        {info?.needsItem && (
                            <div className="mb-5">
                                <label className={labelClass}>Which item?</label>
                                {data.items.length === 0 ? (
                                    <p className="rounded-xl bg-[#F8FAFD] px-4 py-3 text-sm text-[#5F6368]">You have no items listed on the Marketplace yet. <button type="button" onClick={() => navigate('/products')} className="font-semibold text-[#0B57D0] underline">List one</button> first.</p>
                                ) : (
                                    <ul className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                                        {data.items.map((it) => (
                                            <li key={it.id}>
                                                <button type="button" onClick={() => { setProductId(it.id); setError(null); }} aria-pressed={productId === it.id} className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${productId === it.id ? 'border-[#0B57D0] bg-[#F0F6FF]' : 'border-[rgba(116,119,117,0.3)] hover:border-[#0B57D0]/40'}`}>
                                                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F1F3F4]">{it.image_url ? <img src={resized(it.image_url, 100, { square: true })} alt="" className="h-full w-full object-cover" /> : <Package size={18} className="text-[#9AA0A6]" />}</span>
                                                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#1F1F1F]">{it.name}</span><span className="text-xs text-[#5F6368]">{formatKwacha(Number(it.price))}</span></span>
                                                    {productId === it.id && <Check size={16} className="ml-auto flex-shrink-0 text-[#0B57D0]" />}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className={labelClass}>For how long?</label>
                                <div className="flex gap-2">
                                    {info?.prices.map((p) => (
                                        <button key={p.days} type="button" onClick={() => { setDays(p.days); setError(null); }} className={`flex-1 rounded-xl px-2 py-2.5 text-center transition ${days === p.days ? 'bg-[#D3E3FD] shadow-[inset_0_0_0_2px_#0B57D0]' : 'bg-white shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}>
                                            <span className="block text-sm font-bold text-[#1F1F1F]">{p.days} days</span>
                                            <span className="block text-xs tabular-nums text-[#5F6368]">{formatKwacha(p.price)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className={labelClass} htmlFor="ad-start">Starts</label>
                                <input id="ad-start" type="date" className={fieldClass} value={start} min={todayIso()} onChange={(e) => { setStart(e.target.value || todayIso()); setError(null); }} />
                            </div>
                        </div>

                        <div className="mb-5">
                            <label className={labelClass} htmlFor="ad-wallet">Pay from</label>
                            <select id="ad-wallet" className={`${fieldClass} appearance-none`} value={wallet?.id ?? ''} onChange={(e) => setWalletId(e.target.value)}>
                                {data.wallets.map((w) => <option key={w.id} value={w.id}>{w.name} · {formatKwacha(w.balance)}</option>)}
                            </select>
                            {short && <p className="mt-2 text-xs text-[#B31412]">This wallet has {formatKwacha(wallet?.balance ?? 0)}. <button type="button" onClick={() => navigate('/cashbook')} className="font-bold underline">Add money</button> or choose another wallet.</p>}
                        </div>

                        <div className="rounded-2xl bg-[#F8FAFD] p-4 text-sm">
                            <div className="flex items-center justify-between"><span className="text-[#5F6368]">{info?.label}{info?.needsItem && productId ? ` · ${data.items.find((i) => i.id === productId)?.name}` : ''}</span><span className="font-bold tabular-nums text-[#1F1F1F]">{price ? formatKwacha(price.price) : ''}</span></div>
                            <p className="mt-1 text-xs text-[#5F6368]">Runs {day(start)} to {day(end)} once approved. Ads are reviewed first; if yours isn’t approved, the payment goes straight back to your wallet.</p>
                        </div>

                        <ErrorNote text={error} />
                        {done && <p role="status" className="mt-3 rounded-xl bg-[#E6F4EA] px-4 py-2.5 text-sm font-semibold text-[#137333]">Booked. Your ad is in review and you’ll be told when it’s approved.</p>}
                        <PrimaryButton onClick={buy} busy={busy} disabled={!canBuy} className="mt-4 h-12 w-full text-base">{enabled ? `Pay ${price ? formatKwacha(price.price) : ''} and send for review` : 'Opening soon'}</PrimaryButton>
                    </section>
                    </div>
                    <div>
                    <h2 className="mb-3 text-lg font-bold text-[#1F1F1F]">Your ads</h2>
                    {data.campaigns.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-[#C4C7C5] p-8 text-center text-sm text-[#5F6368]">No ads yet. Book one above.</p>
                    ) : (
                        <ul className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
                            {data.campaigns.map((c) => (
                                <li key={c.id} className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-[#1F1F1F]">{c.label}{c.product_name ? ` · ${c.product_name}` : ''}</p>
                                            <p className="text-xs text-[#5F6368]">{day(c.start_date)} to {day(c.end_date)} · {formatKwacha(Number(c.price))}</p>
                                        </div>
                                        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PHASE[c.phase].cls}`}>{PHASE[c.phase].label}</span>
                                    </div>
                                    {['LIVE', 'ENDED'].includes(c.phase) && (
                                        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#5F6368]">
                                            <span className="inline-flex items-center gap-1"><Eye size={13} /> {c.impressions.toLocaleString()} views</span>
                                            <span className="inline-flex items-center gap-1"><MousePointerClick size={13} /> {c.clicks.toLocaleString()} clicks</span>
                                            <span>{c.ctr}% click rate</span>
                                        </p>
                                    )}
                                    {c.phase === 'REJECTED' && <p className="mt-2 text-xs text-[#B31412]">{c.reject_reason}{c.refunded_at ? ' Your payment was returned.' : ''}</p>}
                                    {c.phase === 'CANCELLED' && c.refunded_at && <p className="mt-2 text-xs text-[#5F6368]">Your payment was returned.</p>}
                                    {c.phase === 'PENDING_REVIEW' && <div className="mt-3"><TonalButton onClick={() => cancel(c)} className="h-9 px-4 text-xs">Cancel and get a refund</TonalButton></div>}
                                </li>
                            ))}
                        </ul>
                    )}
                    </div>
                </div>
            )}
        </PagePanel>
    );
};
