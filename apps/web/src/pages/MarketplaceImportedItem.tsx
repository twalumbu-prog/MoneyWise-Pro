import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Globe, Lock, Minus, Plane, Plus, ShieldCheck, ShoppingBag } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../components/ui/Dialog';
import { daysText } from '../components/marketplace/importTypes';
import type { ImportOrder, ImportQuoteResponse } from '../components/marketplace/importTypes';
import { resized } from '../lib/images';

const PHONE_KEY = 'mw:bid-phone';
const readPhone = () => { try { return localStorage.getItem(PHONE_KEY) ?? ''; } catch { return ''; } };
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** One imported item: its pictures, the full price in kwacha (item, shipping, duty, fee) and the order form. */
export const MarketplaceImportedItem: React.FC = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const idempotencyKey = useRef(newKey());
    const [quantity, setQuantity] = useState(1);
    const [photo, setPhoto] = useState(0);
    const [optionNote, setOptionNote] = useState('');
    const [phone, setPhone] = useState(readPhone);
    const [address, setAddress] = useState('');
    const [walletId, setWalletId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<ImportOrder | null>(null);

    const { data: q, isPending, isError, error: loadError } = useQuery({
        queryKey: ['marketplace', 'imports', 'quote', id, quantity],
        queryFn: () => apiJson<ImportQuoteResponse>('/marketplace/imports/quote', { method: 'POST', body: JSON.stringify({ id, quantity }) }),
        placeholderData: keepPreviousData, staleTime: 30_000, retry: false,
    });
    useEffect(() => { if (q && !walletId && q.wallets.length) setWalletId((q.wallets.find((w) => w.is_main) ?? q.wallets[0]).id); }, [q, walletId]);

    const wallet = q?.wallets.find((w) => w.id === walletId);
    const total = q?.quote.totalZmw ?? 0;
    const short = !!wallet && wallet.balance + 0.005 < total;

    const pay = async () => {
        if (!q) return;
        if (!phone.trim()) { setError('Add a phone number so we can reach you.'); return; }
        if (!address.trim()) { setError('Add where we should bring it in Lusaka (or where you’ll collect it).'); return; }
        setBusy(true); setError(null);
        try {
            const r = await apiJson<{ order: ImportOrder }>('/marketplace/imports/orders', {
                method: 'POST', body: JSON.stringify({ productId: id, quantity, optionNote, phone, address, walletId, idempotencyKey: idempotencyKey.current }),
            });
            try { localStorage.setItem(PHONE_KEY, phone); } catch { /* storage unavailable */ }
            qc.invalidateQueries({ queryKey: ['wallets'] }); qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            setDone(r.order);
        } catch (e: any) {
            setError(e?.message || 'The payment didn’t go through. Nothing was taken from your wallet.');
            idempotencyKey.current = newKey();
        } finally { setBusy(false); }
    };

    if (done) {
        return (
            <PagePanel title="Imported" maxWidth="max-w-2xl">
                <div className="flex flex-col items-center py-10 text-center">
                    <span className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#34A853] text-[#34A853]"><Check size={40} strokeWidth={3} /></span>
                    <h2 className="mt-5 text-2xl font-bold text-[#1F1F1F]">Order received</h2>
                    <p className="mt-1 text-sm text-[#5F6368]">{formatKwacha(done.total_zmw)} paid. We’ll buy it now and tell you when it ships. You can follow every step in your import orders.</p>
                    <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row">
                        <PrimaryButton onClick={() => navigate('/marketplace/imported/orders')} className="flex-1">Track my order</PrimaryButton>
                        <TonalButton onClick={() => navigate('/marketplace/imported')} className="h-12 flex-1">Keep shopping</TonalButton>
                    </div>
                </div>
            </PagePanel>
        );
    }

    const p = q?.product;
    const row = (label: string, value: number, hint?: string) => (
        <div className="flex justify-between gap-3"><dt className="text-[#5F6368]">{label}{hint && <span className="block text-[11px] text-[#80868B]">{hint}</span>}</dt><dd className="tabular-nums">{formatKwacha(value)}</dd></div>
    );

    return (
        <PagePanel title="Imported" subtitle="Ordered for you from overseas" back="/marketplace/imported">
            {isPending && !q ? (
                <div className="grid gap-6 lg:grid-cols-[1fr_400px]"><div className="aspect-square animate-pulse rounded-2xl bg-[#F1F3F4]" /><div className="h-96 animate-pulse rounded-2xl bg-[#F1F3F4]" /></div>
            ) : isError || !q || !p ? (
                <div className="flex flex-col items-center py-20 text-center">
                    <Globe size={30} className="text-[#9AA0A6]" />
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">We can’t order this one</p>
                    <p className="mt-1 max-w-md text-sm text-[#5F6368]">{(loadError as any)?.message || 'It may have ended at the store.'}</p>
                    <PrimaryButton onClick={() => navigate('/marketplace/imported')} className="mt-5 h-11 px-6">Back to imported products</PrimaryButton>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
                    <div>
                        <div className="aspect-square max-h-[560px] w-full overflow-hidden rounded-2xl bg-[#F1F3F4]">
                            {p.images[photo] && <img src={resized(p.images[photo], 900)} alt={p.title} className="h-full w-full object-contain" />}
                        </div>
                        {p.images.length > 1 && (
                            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                                {p.images.map((src, i) => <button key={src} type="button" onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`} className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-[#F1F3F4] ${i === photo ? 'ring-2 ring-[#0B57D0]' : ''}`}><img src={resized(src, 120, { square: true })} alt="" className="h-full w-full object-cover" /></button>)}
                            </div>
                        )}
                        <h1 className="mt-5 text-xl font-bold leading-snug text-[#1F1F1F] md:text-2xl">{p.title}</h1>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-[#5F6368]"><Plane size={14} /> {p.origin ? `Ships from ${p.origin} · ` : ''}arrives in about {daysText(p.deliveryDaysMin, p.deliveryDaysMax)}</p>
                        {p.description && <p className="mt-4 text-sm leading-6 text-[#3C4043]">{p.description}</p>}
                        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
                            {[['We buy it', 'We order it from the store for you, so you never need a foreign card.'], ['We ship it', 'You get the store’s tracking number, then ours as it crosses the border.'], ['You collect', 'We bring it to you in Lusaka, or you collect it from us.']].map(([t, d], i) => (
                                <li key={t} className="rounded-2xl bg-[#F8FAFD] p-4"><p className="flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#D3E3FD] text-xs text-[#041E49]">{i + 1}</span>{t}</p><p className="mt-1 text-xs text-[#5F6368]">{d}</p></li>
                            ))}
                        </ol>
                    </div>

                    <aside className="lg:sticky lg:top-4 lg:self-start">
                        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5">
                            <h2 className="mb-3 text-base font-bold text-[#1F1F1F]">Your price</h2>
                            <div className="mb-4 inline-flex items-center rounded-full shadow-[inset_0_0_0_1px_#C4C7C5]">
                                <button type="button" aria-label="One fewer" onClick={() => setQuantity((n) => Math.max(1, n - 1))} className="flex h-9 w-9 items-center justify-center text-[#5F6368] hover:text-black"><Minus size={14} /></button>
                                <span className="w-8 text-center text-sm font-semibold tabular-nums">{quantity}</span>
                                <button type="button" aria-label="One more" onClick={() => setQuantity((n) => Math.min(20, n + 1))} className="flex h-9 w-9 items-center justify-center text-[#5F6368] hover:text-black"><Plus size={14} /></button>
                            </div>
                            <dl className="space-y-2 text-sm">
                                {row('Item', q.quote.itemZmw, q.quote.currency !== 'ZMW' ? `Converted at K${q.quote.rate} per ${q.quote.currency}` : undefined)}
                                {row('Shipping to Zambia', q.quote.shippingZmw)}
                                {row('Import duty and VAT', q.quote.taxesZmw, 'An estimate, included now')}
                                {row('MoneyWise fee', q.quote.feeZmw)}
                                <div className="flex justify-between border-t border-[rgba(116,119,117,0.2)] pt-3 text-lg font-bold"><dt>Total</dt><dd className="tabular-nums">{formatKwacha(total)}</dd></div>
                            </dl>
                            <p className="mt-2 text-[11px] text-[#80868B]">{q.taxNote}</p>

                            <div className="mt-5 space-y-3">
                                {p.options.length > 0 && <p className="text-xs text-[#5F6368]">Options at the store: {p.options.map((o) => `${o.name} (${o.values.join(', ')})`).join('; ')}</p>}
                                <div><label className={labelClass} htmlFor="im-opt">Colour, size or other choices</label><input id="im-opt" className={fieldClass} value={optionNote} onChange={(e) => setOptionNote(e.target.value)} placeholder="e.g. Black, size M" maxLength={200} /></div>
                                <div><label className={labelClass} htmlFor="im-phone">Your phone number</label><input id="im-phone" className={fieldClass} inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setError(null); }} placeholder="0971234567" /></div>
                                <div><label className={labelClass} htmlFor="im-addr">Where should we bring it?</label><textarea id="im-addr" rows={2} className="w-full rounded-xl border border-[#C4C7C5] bg-white px-4 py-3 text-sm placeholder:text-[#9AA0A6] focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]" value={address} onChange={(e) => { setAddress(e.target.value); setError(null); }} placeholder="Area, street, landmark, or “I’ll collect”" /></div>
                                <div className="rounded-2xl bg-[#F8FAFD] p-3">
                                    <label className={labelClass} htmlFor="im-wallet">Pay from</label>
                                    <select id="im-wallet" className={`${fieldClass} appearance-none`} value={walletId} onChange={(e) => { setWalletId(e.target.value); setError(null); }}>
                                        {q.wallets.length === 0 && <option value="">No wallets</option>}
                                        {q.wallets.map((w) => <option key={w.id} value={w.id}>{w.name} · {formatKwacha(w.balance)}</option>)}
                                    </select>
                                    {short && <p className="mt-2 text-xs text-[#B31412]">This wallet has {formatKwacha(wallet?.balance ?? 0)}. <button type="button" onClick={() => navigate('/cashbook')} className="font-bold underline">Add money</button> or choose another wallet.</p>}
                                </div>
                            </div>
                            <ErrorNote text={error} />
                            <PrimaryButton onClick={pay} busy={busy} disabled={!q.enabled || short || !walletId} className="mt-4 h-12 w-full text-base"><Lock size={16} /> {q.enabled ? `Pay ${formatKwacha(total)}` : 'Opening soon'}</PrimaryButton>
                            <p className="mt-3 flex items-start gap-2 text-xs text-[#5F6368]"><ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-[#0B57D0]" /> You pay MoneyWise from your wallet. If we can’t get the item, you’re refunded in full.</p>
                            <p className="mt-2 flex items-start gap-2 text-xs text-[#5F6368]"><ShoppingBag size={14} className="mt-0.5 flex-shrink-0 text-[#0B57D0]" /> Price from the store, checked {q.product.lastRefreshedAt ? new Date(q.product.lastRefreshedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'recently'}. If it changes before we buy, we’ll tell you first.</p>
                        </section>
                    </aside>
                </div>
            )}
        </PagePanel>
    );
};
