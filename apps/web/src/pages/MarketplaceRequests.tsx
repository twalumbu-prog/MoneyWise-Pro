import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, CalendarDays, ClipboardList, MapPin, Phone, Plus, Truck } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { Dialog, ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../components/ui/Dialog';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import { CatalogPicker } from '../components/marketplace/CatalogPicker';
import type { CatalogItem, CompareResult } from '../components/marketplace/compareTypes';

interface Row { id: string; reference: string; title: string; quantity: number; unit: string; delivery_town: string | null; delivery_province: string | null; needed_by: string | null; expires_at: string; status: string; quoteCount?: number; bestTotal?: number | null; myQuote?: { status: string; total: number } | null }
interface QuoteView { id: string; supplierName: string; supplierPhone: string | null; onMoneyWise: boolean; unitPrice: number; quantity: number; deliveryFee: number; total: number; delivers: boolean; validUntil: string | null; note: string | null; status: string; payPath: string | null; cheapest?: boolean; extraVsBest?: number | null }
interface Detail {
    role: 'BUYER' | 'SUPPLIER';
    request: { id: string; reference: string; title: string; details: string | null; quantity: number; unit: string; deliveryTown: string | null; deliveryProvince: string | null; deliveryAddress: string | null; neededBy: string | null; status: string; expiresAt: string; catalogItem: CatalogItem | null };
    quotes: QuoteView[]; buyer: { name: string | null; phone: string | null; address: string | null } | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
    OPEN: { label: 'Open', cls: 'bg-[#E8F0FE] text-[#1967D2]' }, AWARDED: { label: 'Quote accepted', cls: 'bg-[#E6F4EA] text-[#137333]' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-[#F1F3F4] text-[#5F6368]' }, EXPIRED: { label: 'Ended', cls: 'bg-[#FEF7E0] text-[#B06000]' }, CLOSED: { label: 'Closed', cls: 'bg-[#F1F3F4] text-[#5F6368]' },
};
const Pill: React.FC<{ s: string }> = ({ s }) => <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS[s]?.cls ?? ''}`}>{STATUS[s]?.label ?? s}</span>;
const qty = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : String(n));
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
const today = () => new Date().toISOString().slice(0, 10);

/* ───────────── New request ───────────── */

const NewRequest: React.FC<{ preset?: CatalogItem | null; onClose: () => void; onDone: (id: string) => void }> = ({ preset, onClose, onDone }) => {
    const [itemId, setItemId] = useState(preset?.id ?? '');
    const [item, setItem] = useState<CatalogItem | null>(preset ?? null);
    const [title, setTitle] = useState(''); const [unit, setUnit] = useState(preset?.unit ?? ''); const [quantity, setQuantity] = useState('');
    const [town, setTown] = useState(''); const [province, setProvince] = useState(''); const [address, setAddress] = useState('');
    const [neededBy, setNeededBy] = useState(''); const [details, setDetails] = useState(''); const [phone, setPhone] = useState(''); const [days, setDays] = useState('7');
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const ready = (itemId || (title.trim() && unit.trim())) && Number(quantity) > 0 && town.trim();

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            const r = await apiJson<{ request: { id: string } }>('/marketplace/rfq', { method: 'POST', body: JSON.stringify({ catalogItemId: itemId || undefined, title: itemId ? undefined : title, unit: unit || undefined, quantity: Number(quantity), deliveryTown: town, deliveryProvince: province, deliveryAddress: address, neededBy: neededBy || undefined, details, phone, days: Number(days) }) });
            onDone(r.request.id);
        } catch (e: any) { setErr(e?.message || 'Could not send the request.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open size="lg" title="Ask for quotes" onClose={onClose}>
            <ErrorNote text={err} />
            <div className="space-y-3">
                <div><label className={labelClass}>What do you need?</label>
                    <CatalogPicker value={itemId} onChange={(id, i) => { setItemId(id); setItem(i ?? null); if (i) setUnit(i.unit); }} placeholder="Pick from the catalogue, e.g. cement, blocks" />
                    {!itemId && <input className={`${fieldClass} mt-2`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Or describe it, e.g. 75 mm roofing nails" maxLength={120} />}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>How many?</label><input className={fieldClass} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="500" /></div>
                    <div><label className={labelClass}>Counted in</label><input className={fieldClass} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="bags, pieces, tonnes" disabled={!!item} /></div>
                    <div><label className={labelClass}>Deliver to (town)</label><input className={fieldClass} value={town} onChange={(e) => setTown(e.target.value)} placeholder="Kabwe" /></div>
                    <div><label className={labelClass}>Province</label><input className={fieldClass} value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Central" /></div>
                    <div className="col-span-2"><label className={labelClass}>Site address or landmark (shared only with the supplier you choose)</label><input className={fieldClass} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
                    <div><label className={labelClass}>Needed by</label><input type="date" min={today()} className={fieldClass} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} /></div>
                    <div><label className={labelClass}>Quotes accepted for</label><select className={fieldClass} value={days} onChange={(e) => setDays(e.target.value)}>{['3', '7', '14', '30'].map((d) => <option key={d} value={d}>{d} days</option>)}</select></div>
                    <div className="col-span-2"><label className={labelClass}>Your phone (shared only with the supplier you choose)</label><input className={fieldClass} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0977 000 000" /></div>
                    <div className="col-span-2"><label className={labelClass}>Anything else suppliers should know</label><input className={fieldClass} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Brand, quality, delivery access…" maxLength={600} /></div>
                </div>
                <PrimaryButton busy={busy} onClick={save} disabled={!ready} className="w-full">Send request</PrimaryButton>
                <p className="text-[11px] text-[#5F6368]">Suppliers who sell this on MoneyWise are told straight away. Quotes show up here, and you choose one.</p>
            </div>
        </Dialog>
    );
};

/* ───────────── The lists ───────────── */

const ReqCard: React.FC<{ r: Row; onOpen: () => void; board?: boolean }> = ({ r, onOpen, board }) => (
    <li><button type="button" onClick={onOpen} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left shadow-[inset_0_0_0_1px_#E0E0E0] transition hover:shadow-[inset_0_0_0_1px_#0B57D0]">
        <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#1F1F1F]">{qty(r.quantity)} {r.unit} · {r.title}{!board && <Pill s={r.status} />}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5F6368]">
                <span className="inline-flex items-center gap-1"><MapPin size={12} /> {[r.delivery_town, r.delivery_province].filter(Boolean).join(', ')}</span>
                {r.needed_by && <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> Needed by {day(r.needed_by)}</span>}
                {r.status === 'OPEN' && <span>{daysLeft(r.expires_at)} days left</span>}
            </span>
        </span>
        <span className="text-right text-sm">
            {board ? (r.myQuote ? <span className="font-semibold text-[#137333]">You quoted {formatKwacha(r.myQuote.total)}</span> : <span className="font-bold text-[#0B57D0]">Send a quote</span>)
                : <><span className="block font-bold tabular-nums">{r.quoteCount ? `${r.quoteCount} quote${r.quoteCount > 1 ? 's' : ''}` : 'No quotes yet'}</span>{r.bestTotal != null && <span className="block text-xs text-[#137333]">Best {formatKwacha(r.bestTotal)}</span>}</>}
        </span>
    </button></li>
);

const Lists: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [params, setParams] = useSearchParams();
    const [tab, setTab] = useState<'mine' | 'board'>('mine');
    const [adding, setAdding] = useState(false);
    const [preset, setPreset] = useState<CatalogItem | null>(null);
    const mine = useQuery({ queryKey: ['rfq', 'mine'], queryFn: () => apiJson<{ requests: Row[]; needsMigration?: boolean }>('/marketplace/rfq'), retry: false });
    const board = useQuery({ queryKey: ['rfq', 'board'], queryFn: () => apiJson<{ requests: Row[] }>('/marketplace/rfq/board'), retry: false });

    // "Ask for quotes" from the comparison page arrives with the product in the address.
    const wanted = params.get('new');
    useEffect(() => {
        if (!wanted) return;
        apiJson<CompareResult>(`/marketplace/compare/${encodeURIComponent(wanted)}`).then((r) => { setPreset(r.item); setAdding(true); }).catch(() => setAdding(true)).finally(() => { params.delete('new'); setParams(params, { replace: true }); });
    }, [wanted]); // eslint-disable-line react-hooks/exhaustive-deps

    const list = tab === 'mine' ? mine : board;
    const rows = list.data?.requests ?? [];
    return (
        <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                    {([['mine', 'My requests'], ['board', 'Open requests']] as const).map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`h-10 rounded-full px-5 text-sm ${tab === id ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}>{label}</button>)}
                </div>
                <button type="button" onClick={() => { setPreset(null); setAdding(true); }} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#0B57D0] px-5 text-sm font-bold text-white hover:bg-[#0842A0]"><Plus size={16} /> Ask for quotes</button>
            </div>
            <p className="mb-4 text-sm text-[#5F6368]">{tab === 'mine' ? 'Need 500 blocks or 20 bags of cement delivered? Ask once and suppliers send you their prices.' : 'People looking for a price right now. Quote the ones you can supply.'}</p>
            {list.isPending ? <div className="h-32 animate-pulse rounded-2xl bg-[#F1F3F4]" /> : list.isError ? (
                <div className="py-12 text-center"><p className="text-sm text-[#5F6368]">Couldn’t load the requests.</p><TonalButton onClick={() => list.refetch()} className="mt-3">Try again</TonalButton></div>
            ) : rows.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-center"><ClipboardList size={30} className="text-[#9AA0A6]" /><p className="mt-3 text-base font-bold text-[#1F1F1F]">{tab === 'mine' ? 'No requests yet' : 'No open requests right now'}</p></div>
            ) : (
                <ul className="space-y-3">{rows.map((r) => <ReqCard key={r.id} r={r} board={tab === 'board'} onOpen={() => navigate(`/marketplace/requests/${r.id}`)} />)}</ul>
            )}
            {adding && <NewRequest preset={preset} onClose={() => setAdding(false)} onDone={(id) => { setAdding(false); qc.invalidateQueries({ queryKey: ['rfq'] }); navigate(`/marketplace/requests/${id}`); }} />}
        </>
    );
};

/* ───────────── One request ───────────── */

const Detailed: React.FC<{ id: string }> = ({ id }) => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ['rfq', 'one', id], queryFn: () => apiJson<Detail>(`/marketplace/rfq/${id}`), retry: false, refetchInterval: 30_000 });
    const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState<{ name: string; phone: string | null } | null>(null);
    const [unitPrice, setUnitPrice] = useState(''); const [fee, setFee] = useState(''); const [valid, setValid] = useState(''); const [note, setNote] = useState('');
    const refresh = () => { qc.invalidateQueries({ queryKey: ['rfq'] }); return refetch(); };

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-[#F1F3F4]" />;
    if (isError || !data) return <div className="py-14 text-center"><p className="text-sm text-[#5F6368]">{(error as any)?.message || 'Couldn’t load the request.'}</p><TonalButton onClick={() => refetch()} className="mt-3">Try again</TonalButton></div>;
    const { request: r, quotes } = data;
    const open = r.status === 'OPEN';
    const act = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e: any) { setErr(e?.message || 'That did not work.'); } finally { setBusy(false); } };

    const accept = (q: QuoteView) => {
        if (!window.confirm(`Accept ${q.supplierName}’s quote of ${formatKwacha(q.total)}? The other suppliers will be told you chose another quote.`)) return;
        void act(async () => {
            const a = await apiJson<{ payPath: string | null; supplier: { name: string; phone: string | null } }>(`/marketplace/rfq/quotes/${q.id}/accept`, { method: 'POST' });
            await refresh();
            if (a.payPath) navigate(a.payPath); else setDone(a.supplier);
        });
    };
    const send = () => act(async () => { await apiJson(`/marketplace/rfq/${id}/quotes`, { method: 'POST', body: JSON.stringify({ unitPrice: Number(unitPrice), deliveryFee: Number(fee) || 0, validUntil: valid || undefined, note }) }); await refresh(); });
    const myTotal = (Number(unitPrice) || 0) * r.quantity + (Number(fee) || 0);

    return (
        <>
            <button type="button" onClick={() => navigate('/marketplace/requests')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B57D0]"><ArrowLeft size={16} /> Requests</button>
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold text-[#1F1F1F]">{qty(r.quantity)} {r.unit} · {r.title}</h2><Pill s={r.status} /></div>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#5F6368]">
                <span>{r.reference}</span><span className="inline-flex items-center gap-1"><MapPin size={14} /> {[r.deliveryTown, r.deliveryProvince].filter(Boolean).join(', ')}</span>
                {r.neededBy && <span className="inline-flex items-center gap-1"><CalendarDays size={14} /> Needed by {day(r.neededBy)}</span>}
                {open && <span>{daysLeft(r.expiresAt)} days left</span>}
            </p>
            {r.details && <p className="mt-3 rounded-2xl bg-[#F8FAFD] p-4 text-sm text-[#3C4043]">{r.details}</p>}
            {r.catalogItem && <button type="button" onClick={() => navigate(`/marketplace/compare/${r.catalogItem!.slug}`)} className="mt-3 text-sm font-semibold text-[#0B57D0]">See typical prices for {r.catalogItem.name}</button>}
            <ErrorNote text={err} />

            {data.role === 'BUYER' ? (
                <>
                    <h3 className="mb-3 mt-6 text-base font-bold text-[#1F1F1F]">Quotes {quotes.length ? `(${quotes.length})` : ''}</h3>
                    {quotes.length === 0 && <p className="rounded-2xl bg-[#FEF7E0] px-4 py-3 text-sm text-[#7A4B00]">No quotes yet. Suppliers have been told, and we’ll let you know when one arrives.</p>}
                    <ul className="space-y-3">
                        {quotes.map((q) => (
                            <li key={q.id} className={`rounded-2xl bg-white p-4 ${q.cheapest && q.status === 'SUBMITTED' ? 'shadow-[inset_0_0_0_1px_#137333]' : 'shadow-[inset_0_0_0_1px_#E0E0E0]'} ${q.status === 'DECLINED' ? 'opacity-60' : ''}`}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="flex flex-wrap items-center gap-2 text-base font-bold">{q.supplierName}
                                            {q.onMoneyWise ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F0FE] px-2.5 py-0.5 text-[11px] font-bold text-[#1967D2]"><BadgeCheck size={11} /> On MoneyWise: pay with buyer protection</span> : <span className="rounded-full bg-[#F1F3F4] px-2.5 py-0.5 text-[11px] font-bold text-[#5F6368]">Phone quote</span>}
                                            {q.cheapest && q.status === 'SUBMITTED' && <span className="rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-[11px] font-bold text-[#137333]">Lowest total</span>}
                                            {q.status === 'ACCEPTED' && <span className="rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-[11px] font-bold text-[#137333]">You accepted this</span>}
                                            {q.status === 'DECLINED' && <span className="rounded-full bg-[#F1F3F4] px-2.5 py-0.5 text-[11px] font-bold text-[#5F6368]">Not chosen</span>}
                                        </p>
                                        <p className="mt-1 text-xs text-[#5F6368]">{formatKwacha(q.unitPrice)} per {r.unit} × {qty(q.quantity)}{q.deliveryFee > 0 ? ` + ${formatKwacha(q.deliveryFee)} delivery` : q.delivers ? ' · delivery included' : ' · no delivery'}{q.validUntil ? ` · valid until ${day(q.validUntil)}` : ''}</p>
                                        {q.note && <p className="mt-1 text-sm text-[#3C4043]">“{q.note}”</p>}
                                    </div>
                                    <div className="text-right"><p className="text-xl font-bold tabular-nums">{formatKwacha(q.total)}</p>{q.status === 'SUBMITTED' && q.extraVsBest ? <p className="text-xs font-semibold text-[#B31412]">{formatKwacha(q.extraVsBest)} more than lowest</p> : null}</div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {open && q.status === 'SUBMITTED' && <PrimaryButton busy={busy} onClick={() => accept(q)} className="h-10 px-5">Accept this quote</PrimaryButton>}
                                    {q.status === 'ACCEPTED' && q.payPath && <button type="button" onClick={() => navigate(q.payPath!)} className="h-10 rounded-full bg-[#0B57D0] px-5 text-sm font-bold text-white hover:bg-[#0842A0]">Pay {formatKwacha(q.total)}</button>}
                                    {q.status === 'ACCEPTED' && q.supplierPhone && <a href={`tel:${q.supplierPhone.replace(/[^+\d]/g, '')}`} className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5]"><Phone size={14} /> Call {q.supplierPhone}</a>}
                                </div>
                            </li>
                        ))}
                    </ul>
                    {open && <div className="mt-5"><TonalButton onClick={() => { if (window.confirm('Cancel this request? Suppliers will no longer be able to quote.')) void act(async () => { await apiJson(`/marketplace/rfq/${id}/cancel`, { method: 'POST' }); await refresh(); }); }} disabled={busy}>Cancel request</TonalButton></div>}
                </>
            ) : (
                <>
                    {data.buyer && (
                        <div className="mt-5 rounded-2xl bg-[#E6F4EA] p-4 text-sm text-[#137333]"><b>Your quote was accepted.</b> The buyer will pay through MoneyWise. Their details: {data.buyer.name}{data.buyer.phone ? ` · ${data.buyer.phone}` : ''}{data.buyer.address ? ` · ${data.buyer.address}` : ''}</div>
                    )}
                    {quotes[0] ? (
                        <div className="mt-5 rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_#E0E0E0]">
                            <p className="text-sm font-bold">Your quote: {formatKwacha(quotes[0].total)} <span className="font-normal text-[#5F6368]">({formatKwacha(quotes[0].unitPrice)} per {r.unit}{quotes[0].deliveryFee ? ` + ${formatKwacha(quotes[0].deliveryFee)} delivery` : ''})</span></p>
                            <p className="mt-1 text-xs text-[#5F6368]">{quotes[0].status === 'SUBMITTED' ? 'Waiting for the buyer. You can send a new price below.' : quotes[0].status === 'ACCEPTED' ? 'Accepted.' : 'The buyer chose another quote.'}</p>
                            {quotes[0].status === 'SUBMITTED' && open && <button type="button" disabled={busy} onClick={() => act(async () => { await apiJson(`/marketplace/rfq/quotes/${quotes[0].id}/withdraw`, { method: 'POST' }); await refresh(); })} className="mt-2 text-xs font-semibold text-[#B31412]">Withdraw my quote</button>}
                        </div>
                    ) : null}
                    {open && (!quotes[0] || quotes[0].status === 'SUBMITTED') && (
                        <div className="mt-5 rounded-2xl bg-[#F8FAFD] p-4">
                            <h3 className="mb-3 text-base font-bold">{quotes[0] ? 'Change your quote' : 'Send your quote'}</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelClass}>Price per {r.unit} (K)</label><input className={fieldClass} inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} /></div>
                                <div><label className={labelClass}>Delivery charge (K)</label><input className={fieldClass} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0 if included or none" /></div>
                                <div><label className={labelClass}>Quote valid until</label><input type="date" min={today()} className={fieldClass} value={valid} onChange={(e) => setValid(e.target.value)} /></div>
                                <div className="flex items-end justify-end text-right"><div><p className="text-xs text-[#5F6368]">Total for {qty(r.quantity)} {r.unit}</p><p className="text-xl font-bold tabular-nums">{formatKwacha(myTotal)}</p></div></div>
                                <div className="col-span-2"><label className={labelClass}>Note (stock, when you can deliver…)</label><input className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></div>
                            </div>
                            <PrimaryButton busy={busy} onClick={send} disabled={!(Number(unitPrice) > 0)} className="mt-4 w-full"><Truck size={16} /> {quotes[0] ? 'Update quote' : 'Send quote'}</PrimaryButton>
                        </div>
                    )}
                </>
            )}

            {done && (
                <Dialog open size="sm" title="Quote accepted" onClose={() => setDone(null)}>
                    <p className="text-sm text-[#3C4043]">{done.name} gave this quote by phone, so it isn’t paid through MoneyWise. Contact them to arrange delivery and payment.</p>
                    {done.phone && <a href={`tel:${done.phone.replace(/[^+\d]/g, '')}`} className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-[#0B57D0] px-6 text-sm font-bold text-white"><Phone size={16} /> Call {done.phone}</a>}
                </Dialog>
            )}
        </>
    );
};

/** Requests for quote: ask suppliers for a price on a quantity, or quote other people's requests. */
export const MarketplaceRequests: React.FC = () => {
    const { id } = useParams();
    return (
        <PagePanel title="Marketplace" subtitle="Requests for quote: get suppliers to send you their best price" tabs={<MarketplaceTabs active="requests" />}>
            {id ? <Detailed id={id} /> : <Lists />}
        </PagePanel>
    );
};
