import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CalendarDays, Check, CreditCard, Info, Loader2, Lock, Minus, Plus, ShieldCheck, Smartphone, Store, Truck, Wallet as WalletIcon } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../components/ui/Dialog';
import { CategoryArt } from '../components/marketplace/CategoryArt';
import { LISTINGS_KEY } from '../components/marketplace/parts';
import BookingCalendar from '../components/BookingCalendar';
import { getBookingTerminology } from '../services/product.service';
import { payLaterSchedule } from '../components/marketplace/orderTypes';
import { StockLine, VariantPicker } from '../components/marketplace/stockUi';
import type { DeliveryMethod, Order, PayLaterOffer, QuoteResponse, Speed } from '../components/marketplace/orderTypes';
import { resized } from '../lib/images';

const PHONE_KEY = 'mw:bid-phone';
const readPhone = () => { try { return localStorage.getItem(PHONE_KEY) ?? ''; } catch { return ''; } };
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** True on a phone or small tablet, where the summary and the ways to pay are stacked at the top and Pay sits in a bar at the bottom. */
const useNarrow = () => {
    const query = '(max-width: 1023px)';
    const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
    useEffect(() => {
        const m = window.matchMedia(query);
        const on = () => setNarrow(m.matches);
        m.addEventListener('change', on); on();
        return () => m.removeEventListener('change', on);
    }, []);
    return narrow;
};

const SPEEDS: { id: Speed; label: string; hint: string }[] = [
    { id: 'STANDARD', label: 'Standard', hint: 'Same day, may share the trip' }, { id: 'EXPRESS', label: 'Express', hint: 'A dedicated trip, about an hour' },
];

const Card: React.FC<{ step: number; title: string; children: React.ReactNode }> = ({ step, title, children }) => (
    <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-6">
        <h2 className="mb-4 flex items-center gap-3 text-base font-bold text-[#1F1F1F]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#D3E3FD] text-sm font-bold text-[#041E49]">{step}</span>
            {title}
        </h2>
        {children}
    </section>
);

/**
 * Checkout inside the app. Pay from your MoneyWise wallet by MoneyWise Pay (wallet to wallet, no fee); other ways to pay are listed
 * for later. Delivery works in Lusaka only: pick it up, have the seller bring it, or see what Opus Delivery will cost when it arrives.
 */
export const MarketplaceCheckout: React.FC = () => {
    const { productId = '' } = useParams();
    const [params] = useSearchParams();
    const auctionId = params.get('auction') ?? undefined;
    const navigate = useNavigate();
    const qc = useQueryClient();
    const narrow = useNarrow();
    const idempotencyKey = useRef(newKey());

    const [quantity, setQuantity] = useState(1);
    // A room or rental: the dates picked on the calendar.
    const [stayDates, setStayDates] = useState<{ checkIn: string; checkOut: string } | null>(null);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [variantId, setVariantId] = useState<string | null>(params.get('variant'));
    const [area, setArea] = useState('');
    const [method, setMethod] = useState<DeliveryMethod>('PICKUP');
    const [address, setAddress] = useState('');
    const [notes, setNotes] = useState('');
    const [phone, setPhone] = useState(readPhone);
    const [walletId, setWalletId] = useState('');
    const [speed, setSpeed] = useState<Speed>('STANDARD');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<Order | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [payMode, setPayMode] = useState<'NOW' | 'LATER'>('NOW');

    const { data: q, isPending, isError, error: loadError } = useQuery({
        queryKey: ['marketplace', 'quote', productId, auctionId, variantId, quantity, area, speed, stayDates?.checkIn, stayDates?.checkOut],
        queryFn: () => apiJson<QuoteResponse>('/marketplace/checkout/quote', { method: 'POST', body: JSON.stringify({ productId, auctionId, variantId: variantId || undefined, quantity, area: area || undefined, speed, checkIn: stayDates?.checkIn, checkOut: stayDates?.checkOut }) }),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
        retry: false,
    });

    useEffect(() => { if (q && !walletId && q.wallets.length) setWalletId((q.wallets.find((w) => w.is_main) ?? q.wallets[0]).id); }, [q, walletId]);
    // If the chosen way of getting it stops being available (area cleared, say), fall back to pick-up.
    useEffect(() => {
        const opt = q?.delivery.options.find((o) => o.method === method);
        if (method !== 'PICKUP' && opt && !opt.available) setMethod('PICKUP');
    }, [q, method]);

    const options = q?.delivery.options ?? [];
    const chosen = options.find((o) => o.method === method);
    const deliveryFee = method !== 'PICKUP' && chosen?.available ? chosen.fee : 0;
    const itemTotal = q?.item.itemTotal ?? 0;
    const total = Math.round((itemTotal + deliveryFee) * 100) / 100;
    const wallet = q?.wallets.find((w) => w.id === walletId);
    const pl: PayLaterOffer = q?.payLater ?? { enabled: false, eligible: false, score: 0, limit: 0, available: 0, reasons: [], instalments: 4, gapDays: 14, minOrder: 40, lateFee: '', stats: { accountAgeDays: 0, inflow90d: 0, depositMonths: 0, averageMonthlyInflow: 0, completedPlans: 0, latePayments: 0 } };
    const payLaterOpen = pl.enabled && pl.eligible;
    const laterAllowed = payLaterOpen && method !== 'OPUS' && total >= pl.minOrder && total <= pl.available + 0.005;
    const laterPlan = useMemo(() => payLaterSchedule(total), [total]);
    const later = payMode === 'LATER' && payLaterOpen;
    const due = later ? laterPlan[0].amount : total;
    const short = !!wallet && wallet.balance + 0.005 < due;
    // A physical product can be delivered or collected. Everything else (a service, a rental, a ticket, a room) is just booked or paid for.
    const isThing = !q || q.item.type === 'PRODUCT';
    const canChangeQty = !!q && !q.auction && q.item.type === 'PRODUCT';
    // Out of stock, or an option still to choose: nothing can be paid for yet.
    const stay = q?.stay ?? null;
    const stayWords = getBookingTerminology(q?.item.type ?? '');
    const stayBlocked = !!stay && !!stay.problem;
    const stockBlocked = !!q?.stock.tracked && (q.stock.soldOut || (q.stock.variants.length > 0 && !q.stock.variantId) || (q.stock.variantId !== null && q.stock.maxQuantity < 1));

    const pay = async () => {
        if (!q) return;
        if (method !== 'PICKUP' && (!area || !address.trim())) { setError('Add your area and delivery address.'); return; }
        if (later && !laterAllowed) { setError('Pay in 4 isn’t available for this order. Pay now, or change the order.'); return; }
        if (stay?.problem) { setError(stay.problem); return; }
        if (!phone.trim()) { setError('Add a phone number so the seller can reach you.'); return; }
        setBusy(true); setError(null);
        try {
            const r = await apiJson<{ order: Order; notice?: string | null }>('/marketplace/orders', {
                method: 'POST',
                body: JSON.stringify({ productId, auctionId, variantId: variantId || undefined, quantity, area: area || undefined, speed, checkIn: stayDates?.checkIn, checkOut: stayDates?.checkOut, deliveryMethod: method, address, notes, phone, walletId, idempotencyKey: idempotencyKey.current, payLater: later }),
            });
            try { localStorage.setItem(PHONE_KEY, phone); } catch { /* storage unavailable */ }
            qc.invalidateQueries({ queryKey: LISTINGS_KEY });
            qc.invalidateQueries({ queryKey: ['wallets'] });
            qc.invalidateQueries({ queryKey: ['cashbook-entries'] });
            qc.invalidateQueries({ queryKey: ['marketplace', 'orders'] });
            setNotice(r.notice ?? null);
            setDone(r.order);
        } catch (e: any) {
            setError(e?.message || 'The payment didn’t go through. Nothing was taken from your wallet.');
            // A retry after a failure is a new attempt.
            idempotencyKey.current = newKey();
        } finally {
            setBusy(false);
        }
    };

    const when = useMemo(() => (q?.auction ? new Date(q.auction.payBy).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''), [q?.auction]);

    // Ways to pay: next to the total on a phone, in its own step on a wide screen.
    const renderPayment = (q: QuoteResponse) => (
<div className="flex flex-col gap-2.5">
                                <button type="button" role="radio" aria-checked={payMode === 'NOW'} onClick={() => { setPayMode('NOW'); setError(null); }} className={`rounded-2xl border p-3 text-left transition md:p-4 ${payMode === 'NOW' ? 'border-[#0B57D0] bg-[#F0F6FF] shadow-[0_0_0_3px_rgba(11,87,208,0.12)]' : 'border-[rgba(116,119,117,0.3)] bg-white hover:border-[#0B57D0]/40'}`}>
                                    <div className="flex items-start gap-3">
                                        <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 md:h-5 md:w-5 ${payMode === 'NOW' ? 'border-[#0B57D0]' : 'border-[#9AA0A6]'}`}>{payMode === 'NOW' && <span className="h-2 w-2 rounded-full bg-[#0B57D0] md:h-2.5 md:w-2.5" />}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><WalletIcon size={15} className="text-[#0B57D0]" /> MoneyWise Pay <span className="rounded bg-[#E6F4EA] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#137333]">No fees</span></span>
                                            <span className="mt-0.5 block text-xs text-[#5F6368]">Straight to the seller. Instant and free.</span>
                                        </span>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={payMode === 'LATER'}
                                    disabled={!payLaterOpen}
                                    onClick={() => { setPayMode('LATER'); setError(null); }}
                                    className={`rounded-2xl border p-3 text-left transition md:p-4 ${payMode === 'LATER' ? 'border-[#0B57D0] bg-[#F0F6FF] shadow-[0_0_0_3px_rgba(11,87,208,0.12)]' : 'border-[rgba(116,119,117,0.3)] bg-white hover:border-[#0B57D0]/40'} ${!payLaterOpen ? 'cursor-not-allowed opacity-70 hover:border-[rgba(116,119,117,0.3)]' : ''}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 md:h-5 md:w-5 ${payMode === 'LATER' ? 'border-[#0B57D0]' : 'border-[#9AA0A6]'}`}>{payMode === 'LATER' && <span className="h-2 w-2 rounded-full bg-[#0B57D0] md:h-2.5 md:w-2.5" />}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#1F1F1F]"><CalendarClock size={15} className="text-[#0B57D0]" /> Pay in 4
                                                {!pl.enabled ? <span className="rounded bg-[#FEF7E0] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#B06000]">Coming soon</span>
                                                    : pl.eligible ? <span className="rounded bg-[#E6F4EA] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#137333]">You qualify</span>
                                                    : <span className="rounded bg-[#F1F3F4] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#5F6368]">Not yet</span>}
                                            </span>
                                            <span className="mt-0.5 block text-xs text-[#5F6368]">
                                                {!pl.enabled ? 'Split it into four interest-free payments, two weeks apart. Opening soon.'
                                                    : pl.eligible ? `Four interest-free payments, two weeks apart. You have ${formatKwacha(pl.available)} available.`
                                                    : pl.reasons[0] ?? 'Not available for you yet.'}
                                            </span>
                                        </span>
                                    </div>
                                    {payMode === 'LATER' && payLaterOpen && (
                                        <div className="mt-3 md:mt-4 md:pl-8">
                                            {!laterAllowed ? (
                                                <p className="rounded-xl bg-[#FCE8E6] px-3 py-2 text-xs text-[#B31412]">
                                                    {method === 'OPUS' ? 'Pay in 4 can’t be used with Opus Delivery.' : total < pl.minOrder ? `Pay in 4 starts at ${formatKwacha(pl.minOrder)}.` : `This is over your available ${formatKwacha(pl.available)}.`}
                                                </p>
                                            ) : (
                                                <>
                                                    <ol className="grid grid-cols-4 gap-2">
                                                        {laterPlan.map((p) => (
                                                            <li key={p.seq} className="rounded-xl bg-white p-2.5 text-center shadow-[inset_0_0_0_1px_#C4C7C5]">
                                                                <p className="text-sm font-bold tabular-nums text-[#1F1F1F]">{formatKwacha(p.amount)}</p>
                                                                <p className="mt-0.5 text-[10px] text-[#5F6368]">{p.seq === 1 ? 'Today' : p.dueDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
                                                            </li>
                                                        ))}
                                                    </ol>
                                                    <p className="mt-2 text-[11px] text-[#80868B]">No interest. If a payment is more than a day late there’s a one-off fee ({pl.lateFee}). We collect each payment from your wallet on the day if the money is there.</p>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </button>

                                <div className="rounded-2xl bg-[#F8FAFD] p-4">
                                    <label className={labelClass} htmlFor="co-wallet">{payMode === 'LATER' ? 'First payment from' : 'Pay from'}</label>
                                    <select id="co-wallet" className={`${fieldClass} appearance-none`} value={walletId} onChange={(e) => { setWalletId(e.target.value); setError(null); }}>
                                        {q.wallets.length === 0 && <option value="">No wallets</option>}
                                        {q.wallets.map((w) => <option key={w.id} value={w.id}>{w.name} · {formatKwacha(w.balance)}</option>)}
                                    </select>
                                    {short && (
                                        <p className="mt-2 text-xs text-[#B31412]">
                                            This wallet has {formatKwacha(wallet?.balance ?? 0)}. <button type="button" onClick={() => navigate('/cashbook')} className="font-bold underline">Add money</button> or choose another wallet.
                                        </p>
                                    )}
                                </div>
                                {[{ icon: Smartphone, label: 'Mobile money', note: 'MTN, Airtel and Zamtel' }, { icon: CreditCard, label: 'Card', note: 'Visa and Mastercard' }].map((m) => (
                                    <div key={m.label} aria-disabled className="hidden items-start gap-3 md:flex rounded-2xl border border-[rgba(116,119,117,0.3)] p-4 opacity-60">
                                        <span className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full border-2 border-[#C4C7C5]" />
                                        <span className="flex-1">
                                            <span className="flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><m.icon size={15} /> {m.label} <span className="rounded bg-[#FEF7E0] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#B06000]">Coming soon</span></span>
                                            <span className="mt-0.5 block text-xs text-[#5F6368]">{m.note}</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
    );

    const payButton = q ? (
        <PrimaryButton onClick={pay} busy={busy} disabled={short || !walletId || (later && !laterAllowed) || stockBlocked || stayBlocked} className="h-12 w-full text-base"><Lock size={16} /> {later ? `Pay ${formatKwacha(laterPlan[0].amount)} today` : `Pay ${formatKwacha(total)}`}</PrimaryButton>
    ) : null;

    /* ── Paid ── */
    if (done) {
        const processing = done.status === 'PAYMENT_PROCESSING';
        return (
            <PagePanel title="Checkout" maxWidth="max-w-2xl">
                <div className="flex flex-col items-center py-10 text-center">
                    <span className={`flex h-20 w-20 items-center justify-center rounded-full border-4 ${processing ? 'border-[#FBBC04] text-[#E37400]' : 'border-[#34A853] text-[#34A853]'}`}>
                        {processing ? <Loader2 size={36} className="animate-spin" /> : <Check size={40} strokeWidth={3} />}
                    </span>
                    <h2 className="mt-5 text-2xl font-bold text-[#1F1F1F]">{processing ? 'Payment on its way' : 'Order placed'}</h2>
                    <p className="mt-1 text-sm text-[#5F6368]">
                        {processing ? 'Your wallet transfer is being confirmed. The order updates by itself once it lands.' : done.payment_method === 'PAY_LATER' ? `${q?.seller.name ?? 'The seller'} has been paid in full. You paid the first of four instalments (${formatKwacha(laterPlan[0].amount)}); the rest are due every two weeks under Pay in 4.` : `${formatKwacha(done.total)} paid to ${q?.seller.name ?? 'the seller'} from your wallet. They’ve been told.`}
                    </p>
                    <div className="mt-6 w-full rounded-2xl bg-[#F8FAFD] p-5 text-left text-sm">
                        <p className="font-bold text-[#1F1F1F]">{done.product_name}{done.quantity > 1 ? ` ×${done.quantity}` : ''}</p>
                        <p className="mt-1 text-[#5F6368]">{done.delivery_method !== 'PICKUP' ? `${done.delivery_method === 'OPUS' ? 'Opus Delivery' : 'Delivery'} to ${done.delivery_area}${done.delivery_address ? `, ${done.delivery_address}` : ''}` : (/^Stay /.test((done as any).variant_label ?? '') ? 'Your dates are booked. The seller has been told.' : isThing ? 'Pick-up from the seller' : 'The seller will contact you to arrange it')}</p>
                        {notice && <p className="mt-2 text-[#B06000]">{notice}</p>}
                    </div>
                    <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row">
                        <PrimaryButton onClick={() => navigate('/marketplace/orders')} className="flex-1">View my orders</PrimaryButton>
                        <TonalButton onClick={() => navigate('/marketplace')} className="h-12 flex-1">Keep shopping</TonalButton>
                    </div>
                </div>
            </PagePanel>
        );
    }

    return (
        <PagePanel title="Checkout" subtitle="Pay from your MoneyWise wallet, no fees" back={`/marketplace/${productId}`}>
            {isPending && !q ? (
                <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
                    <div className="space-y-4"><div className="h-48 animate-pulse rounded-2xl bg-[#F1F3F4]" /><div className="h-48 animate-pulse rounded-2xl bg-[#F1F3F4]" /></div>
                    <div className="h-72 animate-pulse rounded-2xl bg-[#F1F3F4]" />
                </div>
            ) : isError || !q ? (
                <div className="flex flex-col items-center py-20 text-center">
                    <Store size={30} className="text-[#9AA0A6]" />
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">We can’t check out this item</p>
                    <p className="mt-1 max-w-md text-sm text-[#5F6368]">{(loadError as any)?.message || 'It may have been sold or taken down.'}</p>
                    <PrimaryButton onClick={() => navigate('/marketplace')} className="mt-5 h-11 px-6">Back to the Marketplace</PrimaryButton>
                </div>
            ) : !q.supported ? (
                <div className="mx-auto max-w-xl rounded-2xl border border-[rgba(116,119,117,0.22)] p-8 text-center">
                    <Info size={28} className="mx-auto text-[#0B57D0]" />
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">{q.item.name}</p>
                    <p className="mt-1 text-sm text-[#5F6368]">{q.unsupportedReason}</p>
                    {q.storePath && <PrimaryButton onClick={() => navigate(q.storePath)} className="mt-5 h-11 px-6"><Store size={16} /> Continue in the seller’s store</PrimaryButton>}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
                    <div className="flex flex-col gap-5">
                        {q.auction && (
                            <p className="flex items-start gap-2 rounded-xl bg-[#E6F4EA] px-4 py-3 text-sm text-[#137333]"><Check size={16} className="mt-0.5 flex-shrink-0" /> You won this auction. Pay by {when} to claim it.</p>
                        )}

                        <Card step={1} title={isThing ? 'How do you want to get it?' : stay ? 'Your dates and details' : 'Your details'}>
                            {stay && (
                                <div className="mb-4">
                                    <p className={labelClass}>{stayWords.unit === 'day' ? 'Which days?' : 'Which nights?'}</p>
                                    <button type="button" onClick={() => { setCalendarOpen(true); setError(null); }} className="flex w-full items-center gap-3 rounded-2xl border border-[rgba(116,119,117,0.3)] bg-white p-4 text-left hover:border-[#0B57D0]">
                                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-[#0B57D0]"><CalendarDays size={18} /></span>
                                        <span className="min-w-0 flex-1">
                                            {stay.checkIn && stay.checkOut && !stay.problem
                                                ? <><span className="block text-sm font-bold text-[#1F1F1F]">{new Date(`${stay.checkIn}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })} to {new Date(`${stay.checkOut}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</span><span className="block text-xs text-[#5F6368]">{stay.nights} {stayWords.unit === 'day' ? (stay.nights === 1 ? 'day' : 'days') : (stay.nights === 1 ? 'night' : 'nights')} · {formatKwacha(q.item.unitPrice)} each</span></>
                                                : <><span className="block text-sm font-bold text-[#1F1F1F]">Choose your dates</span><span className="block text-xs text-[#5F6368]">{stay.problem && stay.checkIn ? stay.problem : `${formatKwacha(q.item.unitPrice)} per ${stayWords.unit}. Dates already booked are greyed out.`}</span></>}
                                        </span>
                                        <span className="text-sm font-semibold text-[#0B57D0]">{stay.checkIn && stay.checkOut ? 'Change' : 'Pick'}</span>
                                    </button>
                                </div>
                            )}
                            {isThing && (<>
<p className="mb-4 flex items-start gap-2 rounded-xl bg-[#F8FAFD] px-3 py-2.5 text-xs text-[#5F6368]"><Truck size={14} className="mt-0.5 flex-shrink-0 text-[#0B57D0]" /> Delivery works in Lusaka only for now. Everywhere else, collect from the seller.</p>

                            <div className="mb-4">
                                <label className={labelClass} htmlFor="co-area">Your area in Lusaka</label>
                                <select id="co-area" className={`${fieldClass} appearance-none`} value={area} onChange={(e) => { setArea(e.target.value); setError(null); }}>
                                    <option value="">Not in Lusaka / choose later</option>
                                    {q.delivery.areas.map((a) => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>

                            <div role="radiogroup" aria-label="Delivery method" className="flex flex-col gap-2.5">
                                {options.map((o) => {
                                    const on = method === o.method;
                                    const disabled = !o.available;
                                    return (
                                        <button
                                            key={o.method}
                                            type="button"
                                            role="radio"
                                            aria-checked={on}
                                            aria-disabled={disabled}
                                            disabled={disabled}
                                            onClick={() => { setMethod(o.method); setError(null); }}
                                            className={`flex items-start gap-2.5 rounded-2xl border p-3 text-left transition md:gap-3 md:p-4 ${on ? 'border-[#0B57D0] bg-[#F0F6FF] shadow-[0_0_0_3px_rgba(11,87,208,0.12)]' : 'border-[rgba(116,119,117,0.3)] bg-white hover:border-[#0B57D0]/40'} ${disabled ? 'cursor-not-allowed opacity-60 hover:border-[rgba(116,119,117,0.3)]' : ''}`}
                                        >
                                            <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 md:h-5 md:w-5 ${on ? 'border-[#0B57D0]' : 'border-[#9AA0A6]'}`}>{on && <span className="h-2 w-2 rounded-full bg-[#0B57D0] md:h-2.5 md:w-2.5" />}</span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2 text-sm font-bold text-[#1F1F1F]">
                                                    {o.label}
                                                    {o.comingSoon && <span className="rounded bg-[#FEF7E0] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#B06000]">Coming soon</span>}
                                                </span>
                                                <span className="mt-0.5 block text-xs text-[#5F6368]">{o.note}</span>
                                            </span>
                                            <span className="text-sm font-bold tabular-nums text-[#1F1F1F]">{o.method === 'PICKUP' ? 'Free' : o.fee > 0 ? `${o.method === 'OPUS' ? '~' : ''}${formatKwacha(o.fee)}` : o.available ? 'Free' : '–'}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {method !== 'PICKUP' && (
                                <div className="mt-4">
                                    <label className={labelClass} htmlFor="co-address">Delivery address</label>
                                    <textarea id="co-address" rows={2} className="w-full rounded-xl border border-[#C4C7C5] bg-white px-4 py-3 text-sm placeholder:text-[#9AA0A6] focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]" value={address} onChange={(e) => { setAddress(e.target.value); setError(null); }} placeholder="House or plot number, street, landmark" />
                                </div>
                            )}

                            {/* Opus Delivery: the price it will have, worked out like a courier's quote */}
                            {q.delivery.opus && (
                                <div className="mt-4 rounded-2xl border border-dashed border-[#C4C7C5] p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="flex items-center gap-2 text-sm font-bold text-[#1F1F1F]">Opus Delivery {q.delivery.opus.comingSoon && <span className="rounded bg-[#FEF7E0] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#B06000]">Coming soon</span>}</p>
                                            <p className="text-xs text-[#5F6368]">{q.delivery.opus.distanceKm} km · about {q.delivery.opus.etaMinutes} min door to door</p>
                                        </div>
                                        <p className="text-lg font-bold tabular-nums text-[#1F1F1F]">{q.delivery.opus.comingSoon ? '~' : ''}{formatKwacha(q.delivery.opus.fee)}</p>
                                    </div>
                                    <div className="mt-3 flex gap-1">{SPEEDS.map((s) => <button key={s.id} type="button" title={s.hint} onClick={() => setSpeed(s.id)} className={`flex-1 rounded-full py-1.5 text-xs ${speed === s.id ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'text-[#5F6368] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}>{s.label}</button>)}</div>
                                    <details className="mt-3 text-xs text-[#5F6368]">
                                        <summary className="cursor-pointer font-semibold text-[#0B57D0]">How is this worked out?</summary>
                                        <dl className="mt-2 space-y-1">
                                            <div className="flex justify-between"><dt>Base</dt><dd className="tabular-nums">{formatKwacha(q.delivery.opus.breakdown.base)}</dd></div>
                                            <div className="flex justify-between"><dt>Distance and driving time</dt><dd className="tabular-nums">{formatKwacha(q.delivery.opus.breakdown.distance + q.delivery.opus.breakdown.time)}</dd></div>
                                            {q.delivery.opus.breakdown.loadAdjustment + q.delivery.opus.breakdown.handling > 0 && <div className="flex justify-between"><dt>Load ({q.delivery.opus.weightKg} kg{q.parcel.setBySeller ? '' : ', estimated'})</dt><dd className="tabular-nums">{formatKwacha(q.delivery.opus.breakdown.loadAdjustment + q.delivery.opus.breakdown.handling)}</dd></div>}
                                            {q.delivery.opus.breakdown.surge > 0 && <div className="flex justify-between"><dt>Peak hours</dt><dd className="tabular-nums">{formatKwacha(q.delivery.opus.breakdown.surge)}</dd></div>}
                                            {q.delivery.opus.breakdown.speedAdjustment > 0 && <div className="flex justify-between"><dt>Express</dt><dd className="tabular-nums">{formatKwacha(q.delivery.opus.breakdown.speedAdjustment)}</dd></div>}
                                        </dl>
                                        <p className="mt-2">Waiting at your door is free for {q.delivery.opus.waiting.freeMinutes} minutes, then K{q.delivery.opus.waiting.perMinute} a minute (up to K{q.delivery.opus.waiting.cap}), paid to the rider.{q.delivery.opus.comingSoon ? ' Prices are estimates until Opus Delivery launches.' : ''}</p>
                                    </details>
                                </div>
                            )}

                            </>)}
<div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className={labelClass} htmlFor="co-phone">Your phone number</label>
                                    <input id="co-phone" className={fieldClass} inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setError(null); }} placeholder="0971234567" />
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="co-notes">Note to the seller (optional)</label>
                                    <input id="co-notes" className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Colour, size, best time…" maxLength={300} />
                                </div>
                            </div>
                        </Card>

                        {!narrow && (
                        <Card step={2} title="How do you want to pay?">
                            {renderPayment(q)}
                        </Card>
                        )}
                    </div>

                    {/* Summary */}
                    <aside className="order-first lg:order-none lg:sticky lg:top-4 lg:self-start">
                        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:p-5">
                            <h2 className="mb-3 text-base font-bold text-[#1F1F1F] md:mb-4">Order summary</h2>
                            <div className="flex gap-3">
                                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-[#F1F3F4]">
                                    {q.item.imageUrl ? <img src={resized(q.item.imageUrl, 160, { square: true })} alt="" className="h-full w-full object-cover" /> : <CategoryArt category={null} productType={q.item.type} compact />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="line-clamp-2 text-sm font-semibold text-[#1F1F1F]">{q.item.name}</p>
                                    <p className="text-xs text-[#5F6368]">Sold by {q.seller.name}</p>
                                    {canChangeQty && (
                                        <div className="mt-2 inline-flex items-center rounded-full shadow-[inset_0_0_0_1px_#C4C7C5]">
                                            <button type="button" aria-label="One fewer" onClick={() => setQuantity((n) => Math.max(1, n - 1))} className="flex h-8 w-8 items-center justify-center text-[#5F6368] hover:text-black"><Minus size={14} /></button>
                                            <span className="w-7 text-center text-sm font-semibold tabular-nums">{quantity}</span>
                                            <button type="button" aria-label="One more" onClick={() => setQuantity((n) => Math.min(q.stock.tracked ? Math.max(1, q.stock.maxQuantity) : 20, n + 1))} className="flex h-8 w-8 items-center justify-center text-[#5F6368] hover:text-black"><Plus size={14} /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {q.stock.tracked && (
                                <div className="mt-4 space-y-2.5">
                                    <VariantPicker variants={q.stock.variants} value={variantId} onChange={(v) => { setVariantId(v); setQuantity(1); setError(null); }} />
                                    <StockLine stock={{ tracked: true, available: q.stock.available, low: q.stock.low, soldOut: q.stock.soldOut, variants: q.stock.variants }} variantId={variantId} />
                                </div>
                            )}
                            <dl className="mt-5 space-y-2 border-t border-[rgba(116,119,117,0.2)] pt-4 text-sm">
                                <div className="flex justify-between"><dt className="text-[#5F6368]">{stay && stay.nights > 0 ? `${formatKwacha(q.item.unitPrice)} × ${stay.nights} ${stayWords.unit === 'day' ? (stay.nights === 1 ? 'day' : 'days') : (stay.nights === 1 ? 'night' : 'nights')}` : q.item.quantity > 1 ? `${formatKwacha(q.item.unitPrice)} × ${q.item.quantity}` : q.auction ? 'Winning bid' : 'Item'}</dt><dd className="tabular-nums">{formatKwacha(itemTotal)}</dd></div>
                                <div className="flex justify-between"><dt className="text-[#5F6368]">Delivery</dt><dd className="tabular-nums">{method !== 'PICKUP' ? formatKwacha(deliveryFee) : 'Free'}</dd></div>
                                <div className="flex justify-between"><dt className="text-[#5F6368]">MoneyWise fee</dt><dd className="tabular-nums text-[#137333]">K0.00</dd></div>
                                <div className="flex justify-between border-t border-[rgba(116,119,117,0.2)] pt-3 text-lg font-bold"><dt>Total</dt><dd className="tabular-nums">{formatKwacha(total)}</dd></div>
                            </dl>
                            {narrow && (
                                <div className="mt-4 border-t border-[rgba(116,119,117,0.2)] pt-4">
                                    <p className="mb-2.5 text-sm font-bold text-[#1F1F1F]">How do you want to pay?</p>
                                    {renderPayment(q)}
                                </div>
                            )}
                            {!narrow && (<>
                                <ErrorNote text={error} />
                                <div className="mt-4">{payButton}</div>
                            </>)}
                            <p className="mt-3 flex items-start gap-2 text-xs text-[#5F6368]"><ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-[#0B57D0]" /> Your wallet pays the seller’s wallet directly. If something goes wrong, you can report a problem from your orders.</p>
                        </section>
                    </aside>
                </div>
            )}
            {narrow && q && q.supported && !isError && (
                <>
                    <div className="h-28" aria-hidden />
                    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(116,119,117,0.22)] bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
                        <ErrorNote text={error} />
                        <div className={error ? 'mt-2' : ''}>{payButton}</div>
                    </div>
                </>
            )}
            {calendarOpen && q?.stay && (
                <BookingCalendar
                    productName={q.item.name}
                    nightlyPrice={q.item.unitPrice}
                    unavailable={q.stay.booked}
                    initial={stayDates}
                    onClose={() => setCalendarOpen(false)}
                    onConfirm={(checkIn, checkOut) => { setStayDates({ checkIn, checkOut }); setCalendarOpen(false); }}
                    {...stayWords}
                />
            )}
        </PagePanel>
    );
};
