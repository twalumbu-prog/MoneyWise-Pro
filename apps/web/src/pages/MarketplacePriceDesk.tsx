import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import { CatalogPicker } from '../components/marketplace/CatalogPicker';
import type { CatalogItem } from '../components/marketplace/compareTypes';

const send = <T,>(method: string, path: string, body?: unknown) => apiJson<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const input = 'rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-[#0B57D0] focus:outline-none';
const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50';
const today = () => new Date().toISOString().slice(0, 10);

interface PricePoint { id: string; catalog_item_id: string; source_type: string; place_name: string; town: string | null; province: string | null; phone: string | null; price: number; min_qty: number | null; delivers: boolean; observed_on: string; status: string; trust: string; created_at: string }
interface Desk { items: CatalogItem[]; pricePoints: PricePoint[]; needsMigration: boolean }

interface OpenRfq { id: string; reference: string; title: string; quantity: number; unit: string; delivery_town: string | null; delivery_province: string | null; needed_by: string | null; buyer_name: string | null; quoteCount: number }

/** One open request, with a form to enter a quote a supplier gave by phone. */
const PhoneQuote: React.FC<{ r: OpenRfq; onSaved: () => void }> = ({ r, onSaved }) => {
    const [f, setF] = useState({ supplierName: '', supplierPhone: '', unitPrice: '', deliveryFee: '', validUntil: '', note: '' });
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const save = async () => {
        setBusy(true); setErr(null);
        try { await send('POST', `/admin/price-desk/rfq/${r.id}/quotes`, { ...f, unitPrice: Number(f.unitPrice), deliveryFee: Number(f.deliveryFee) || 0, validUntil: f.validUntil || undefined }); setF({ supplierName: '', supplierPhone: '', unitPrice: '', deliveryFee: '', validUntil: '', note: '' }); onSaved(); }
        catch (e: any) { setErr(e?.message || 'Could not save the quote.'); } finally { setBusy(false); }
    };
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-800">{r.quantity} {r.unit} · {r.title} <span className="font-normal text-slate-500">· {r.reference} · deliver to {[r.delivery_town, r.delivery_province].filter(Boolean).join(', ')}{r.needed_by ? ` · needed by ${r.needed_by}` : ''} · {r.quoteCount} quote{r.quoteCount === 1 ? '' : 's'} so far</span></p>
            {err && <p className="mt-2 text-xs text-[#B31412]">{err}</p>}
            <div className="mt-3 grid gap-2 md:grid-cols-3">
                <input className={input} placeholder="Supplier" value={f.supplierName} onChange={(e) => setF({ ...f, supplierName: e.target.value })} />
                <input className={input} placeholder="Supplier phone" value={f.supplierPhone} onChange={(e) => setF({ ...f, supplierPhone: e.target.value })} />
                <input className={input} placeholder={`Price per ${r.unit} (K)`} inputMode="decimal" value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: e.target.value })} />
                <input className={input} placeholder="Delivery charge (K)" inputMode="decimal" value={f.deliveryFee} onChange={(e) => setF({ ...f, deliveryFee: e.target.value })} />
                <input type="date" className={input} min={today()} value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} />
                <input className={input} placeholder="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            </div>
            <button disabled={busy || !f.supplierName.trim() || !(Number(f.unitPrice) > 0)} onClick={save} className={`${btn} mt-3 bg-[#0B57D0] text-white`}>Add quote</button>
        </div>
    );
};

interface HeldReport { id: string; place_name: string; town: string | null; price: number; observed_on: string; evidence_url: string | null; item: { name: string; unit: string } | null; typical: number | null }

const blank = { catalogItemId: '', placeName: '', town: '', province: '', phone: '', address: '', price: '', minQty: '', delivers: false, deliveryNote: '', observedOn: today(), trust: false };

/** Team only: the catalogue and the prices collected from places that aren't MoneyWise sellers (a depot's price list, a shelf price). */
export const MarketplacePriceDesk: React.FC = () => {
    const [desk, setDesk] = useState<Desk | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [tab, setTab] = useState<'prices' | 'requests' | 'reports' | 'catalogue'>('prices');
    const [held, setHeld] = useState<HeldReport[]>([]);
    const loadHeld = useCallback(async () => { try { setHeld((await send<{ reports: HeldReport[] }>('GET', '/admin/price-desk/reports')).reports ?? []); } catch { setHeld([]); } }, []);
    useEffect(() => { if (tab === 'reports') loadHeld(); }, [tab, loadHeld]);
    const [rfqs, setRfqs] = useState<OpenRfq[]>([]);
    const loadRfqs = useCallback(async () => { try { setRfqs((await send<{ requests: OpenRfq[] }>('GET', '/admin/price-desk/rfq')).requests ?? []); } catch { setRfqs([]); } }, []);
    useEffect(() => { if (tab === 'requests') loadRfqs(); }, [tab, loadRfqs]);
    const [form, setForm] = useState({ ...blank });
    const [item, setItem] = useState({ name: '', category: '', unit: '', unitDetail: '', brand: '', keywords: '' });

    const load = useCallback(async () => {
        try { setDesk(await send<Desk>('GET', '/admin/price-desk')); setError(null); } catch (e: any) { setError(e?.message || 'Could not load the price desk.'); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const names = useMemo(() => new Map((desk?.items ?? []).map((i) => [i.id, i])), [desk]);
    const categories = useMemo(() => [...new Set((desk?.items ?? []).map((i) => i.category))].sort(), [desk]);
    const run = async (fn: () => Promise<unknown>, ok?: string) => { setBusy(true); setError(null); setNotice(null); try { await fn(); if (ok) setNotice(ok); await load(); } catch (e: any) { setError(e?.message || 'That did not work.'); } finally { setBusy(false); } };

    const savePrice = () => run(async () => {
        await send('POST', '/admin/price-desk/prices', { ...form, price: Number(form.price), minQty: Number(form.minQty) || undefined, trust: form.trust ? 'VERIFIED' : 'ENTERED' });
        // Keep the place and date so the next price from the same visit is quick to enter.
        setForm({ ...blank, placeName: form.placeName, town: form.town, province: form.province, phone: form.phone, address: form.address, delivers: form.delivers, observedOn: form.observedOn });
    }, 'Price saved.');

    return (
        <PagePanel title="Marketplace" subtitle="Price desk: prices from places that aren’t MoneyWise sellers (team only)" tabs={<MarketplaceTabs active="price-desk" />}>
            {error && <p className="mb-4 rounded-xl bg-[#FCE8E6] px-4 py-3 text-sm text-[#B31412]">{error}</p>}
            {notice && <p className="mb-4 rounded-xl bg-[#E6F4EA] px-4 py-3 text-sm text-[#137333]">{notice}</p>}
            {desk?.needsMigration && <p className="mb-4 rounded-xl bg-[#FEF7E0] px-4 py-3 text-sm text-[#7A4B00]">The price tables aren’t set up yet.</p>}

            <div className="mb-5 flex gap-2">
                {([['prices', 'Prices'], ['reports', 'Reports to check'], ['requests', 'Open requests'], ['catalogue', 'Catalogue']] as const).map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`h-10 rounded-full px-5 text-sm ${tab === id ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5]'}`}>{label}</button>)}
            </div>

            {tab === 'prices' && (
                <>
                    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
                        <h2 className="mb-1 text-sm font-semibold text-slate-700">Add a price</h2>
                        <p className="mb-3 text-xs text-slate-500">From a supplier’s price list, a phone call or a shelf. One price for one unit of the product. The place and date stay filled in so you can enter several products from the same visit.</p>
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="md:col-span-2"><label className="mb-1 block text-xs text-slate-500">Product</label><CatalogPicker value={form.catalogItemId} onChange={(id) => setForm({ ...form, catalogItemId: id })} /></div>
                            <label className="text-xs text-slate-500">Place (shop, depot, supermarket branch)<input className={`${input} mt-0.5 w-full`} value={form.placeName} onChange={(e) => setForm({ ...form, placeName: e.target.value })} placeholder="e.g. ShopRite Garden City" /></label>
                            <label className="text-xs text-slate-500">Phone<input className={`${input} mt-0.5 w-full`} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0977 000 000" /></label>
                            <label className="text-xs text-slate-500">Town<input className={`${input} mt-0.5 w-full`} value={form.town} onChange={(e) => setForm({ ...form, town: e.target.value })} placeholder="Lusaka" /></label>
                            <label className="text-xs text-slate-500">Province<input className={`${input} mt-0.5 w-full`} value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} placeholder="Lusaka" /></label>
                            <label className="text-xs text-slate-500">Price per unit (K)<input className={`${input} mt-0.5 w-full`} inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
                            <label className="text-xs text-slate-500">Date the price was seen<input type="date" className={`${input} mt-0.5 w-full`} max={today()} value={form.observedOn} onChange={(e) => setForm({ ...form, observedOn: e.target.value })} /></label>
                            <label className="text-xs text-slate-500">Bulk price from this quantity (leave empty for a normal price)<input className={`${input} mt-0.5 w-full`} inputMode="numeric" value={form.minQty} onChange={(e) => setForm({ ...form, minQty: e.target.value })} /></label>
                            <label className="text-xs text-slate-500">Address or landmark<input className={`${input} mt-0.5 w-full`} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
                            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.delivers} onChange={(e) => setForm({ ...form, delivers: e.target.checked })} /> They deliver</label>
                            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.trust} onChange={(e) => setForm({ ...form, trust: e.target.checked })} /> We checked this price ourselves (shows “Checked by us”)</label>
                        </div>
                        <button disabled={busy || !form.catalogItemId || !form.placeName.trim() || !(Number(form.price) > 0)} onClick={savePrice} className={`${btn} mt-4 bg-[#0B57D0] text-white`}>Save price</button>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-5">
                        <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent prices</h2>
                        {(desk?.pricePoints ?? []).length === 0 && <p className="text-sm text-slate-500">No prices entered yet.</p>}
                        <div className="divide-y divide-slate-100">
                            {(desk?.pricePoints ?? []).map((p) => (
                                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                                    <div className="min-w-0"><p className="truncate font-medium text-slate-800">{names.get(p.catalog_item_id)?.name ?? 'Product'} · {p.place_name}</p><p className="text-xs text-slate-500">{[p.town, p.province].filter(Boolean).join(', ')} · seen {p.observed_on}{p.min_qty ? ` · from ${p.min_qty}` : ''}{p.delivers ? ' · delivers' : ''}{p.trust === 'VERIFIED' ? ' · checked' : ''}</p></div>
                                    <div className="flex items-center gap-3">
                                        <span className="font-semibold tabular-nums">{formatKwacha(p.price)}</span>
                                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${p.status === 'ACTIVE' ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#F1F3F4] text-[#5F6368]'}`}>{p.status === 'ACTIVE' ? 'Showing' : p.status.toLowerCase()}</span>
                                        {p.status === 'ACTIVE' ? <button disabled={busy} onClick={() => run(() => send('POST', `/admin/price-desk/prices/${p.id}/status`, { status: 'EXPIRED' }))} className={`${btn} text-red-600`}>Take down</button> : <button disabled={busy} onClick={() => run(() => send('POST', `/admin/price-desk/prices/${p.id}/status`, { status: 'ACTIVE' }))} className={`${btn} text-[#0B57D0]`}>Show again</button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </>
            )}

            {tab === 'reports' && (
                <div className="space-y-3">
                    <p className="text-sm text-slate-500">Prices shoppers reported that are far from the usual price. Approving shows the price and pays the shopper their points. Look at the photo if there is one.</p>
                    {held.length === 0 && <p className="text-sm text-slate-500">Nothing waiting to be checked.</p>}
                    {held.map((r) => (
                        <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-800">{r.item?.name ?? 'Product'} · {r.place_name}{r.town ? `, ${r.town}` : ''}</p>
                                <p className="text-xs text-slate-500">Reported {formatKwacha(r.price)} per {r.item?.unit ?? 'unit'}{r.typical ? ` · typical ${formatKwacha(r.typical)}` : ''} · seen {r.observed_on}{r.evidence_url ? '' : ' · no photo'}</p>
                                {r.evidence_url && <a href={r.evidence_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-[#0B57D0]">View photo</a>}
                            </div>
                            <div className="flex gap-2">
                                <button disabled={busy} onClick={() => run(async () => { await send('POST', `/admin/price-desk/reports/${r.id}/approve`, {}); await loadHeld(); }, 'Price shown.')} className={`${btn} bg-[#0B57D0] text-white`}>Approve</button>
                                <button disabled={busy} onClick={() => run(async () => { await send('POST', `/admin/price-desk/reports/${r.id}/reject`, {}); await loadHeld(); }, 'Report rejected.')} className={`${btn} text-red-600`}>Reject</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'requests' && (
                <div className="space-y-3">
                    <p className="text-sm text-slate-500">Requests people have sent. Phone suppliers who don’t use MoneyWise and enter their quotes here. The buyer sees them with the other quotes, and each one also becomes a price in the comparison.</p>
                    {rfqs.length === 0 && <p className="text-sm text-slate-500">No open requests right now.</p>}
                    {rfqs.map((r) => <PhoneQuote key={r.id} r={r} onSaved={() => { setNotice('Quote added.'); loadRfqs(); load(); }} />)}
                </div>
            )}

            {tab === 'catalogue' && (
                <>
                    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
                        <h2 className="mb-3 text-sm font-semibold text-slate-700">Add a product to the catalogue</h2>
                        <div className="grid gap-3 md:grid-cols-3">
                            <label className="text-xs text-slate-500 md:col-span-2">Name (include the size)<input className={`${input} mt-0.5 w-full`} value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} placeholder="Cement 50 kg bag (42.5)" /></label>
                            <label className="text-xs text-slate-500">Category<input list="desk-cats" className={`${input} mt-0.5 w-full`} value={item.category} onChange={(e) => setItem({ ...item, category: e.target.value })} /><datalist id="desk-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
                            <label className="text-xs text-slate-500">Unit one price is for<input className={`${input} mt-0.5 w-full`} value={item.unit} onChange={(e) => setItem({ ...item, unit: e.target.value })} placeholder="bag, piece, tonne, metre…" /></label>
                            <label className="text-xs text-slate-500">Size detail<input className={`${input} mt-0.5 w-full`} value={item.unitDetail} onChange={(e) => setItem({ ...item, unitDetail: e.target.value })} placeholder="50 kg" /></label>
                            <label className="text-xs text-slate-500">Brand<input className={`${input} mt-0.5 w-full`} value={item.brand} onChange={(e) => setItem({ ...item, brand: e.target.value })} /></label>
                            <label className="text-xs text-slate-500 md:col-span-3">Search words (other names people use)<input className={`${input} mt-0.5 w-full`} value={item.keywords} onChange={(e) => setItem({ ...item, keywords: e.target.value })} /></label>
                        </div>
                        <button disabled={busy || !item.name.trim() || !item.category.trim() || !item.unit.trim()} onClick={() => run(async () => { await send('POST', '/admin/price-desk/items', item); setItem({ name: '', category: item.category, unit: '', unitDetail: '', brand: '', keywords: '' }); }, 'Product added.')} className={`${btn} mt-4 bg-[#0B57D0] text-white`}>Add product</button>
                    </section>
                    <section className="rounded-xl border border-slate-200 bg-white p-5">
                        <h2 className="mb-3 text-sm font-semibold text-slate-700">{(desk?.items ?? []).length} products</h2>
                        {categories.map((c) => (
                            <div key={c} className="mb-4">
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{c}</p>
                                <div className="flex flex-wrap gap-1.5">{(desk?.items ?? []).filter((i) => i.category === c).map((i) => <span key={i.id} className={`rounded-full px-3 py-1 text-xs ${i.is_active ? 'bg-slate-100 text-slate-700' : 'bg-red-50 text-red-600 line-through'}`}>{i.name}</span>)}</div>
                            </div>
                        ))}
                    </section>
                </>
            )}
        </PagePanel>
    );
};
