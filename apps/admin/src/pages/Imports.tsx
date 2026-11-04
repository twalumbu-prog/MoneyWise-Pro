import { useCallback, useEffect, useState } from 'react';
import { Globe, Loader2, RefreshCw } from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiPut } from '../lib/api';
import { formatDateTime } from '../lib/format';

interface Order {
    id: string; title: string; image_url: string | null; source: string | null; source_url: string | null; quantity: number; option_note: string | null; buyer_name: string; buyer_phone: string | null;
    delivery_address: string | null; notes: string | null; total_zmw: number; item_zmw: number; currency: string | null; unit_price: number | null; status: string;
    supplier_order_ref: string | null; tracking_number: string | null; carrier: string | null; created_at: string; events: { at: string; status: string; note?: string }[];
}
interface Product {
    id: string; source: string; title: string; price: number; currency: string; category: string | null; is_active: boolean; listed: boolean; views: number; last_refreshed_at: string | null; refresh_error: string | null; images: string[];
}
interface Feed { source: string; query: string; category?: string; limit?: number }
interface Overview {
    orders: Order[]; products: Product[]; settings: { fx: Record<string, number>; pricing: Record<string, number> }; feeds: Feed[];
    sources: { id: string; label: string; configured: boolean }[]; statuses: string[];
}

const money = (n: number) => `K${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const input = 'rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-brand-navy focus:outline-none';
const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50';
const LABEL: Record<string, string> = { PAID: 'To buy', ORDERED: 'Bought', SHIPPED: 'Shipped', IN_TRANSIT: 'In transit', CUSTOMS: 'Customs', IN_LUSAKA: 'In Lusaka', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };

function OrderRow({ o, statuses, onSaved, onError }: { o: Order; statuses: string[]; onSaved: () => void; onError: (m: string) => void }) {
    const [status, setStatus] = useState(o.status);
    const [supplier, setSupplier] = useState(o.supplier_order_ref ?? '');
    const [tracking, setTracking] = useState(o.tracking_number ?? '');
    const [carrier, setCarrier] = useState(o.carrier ?? '');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const finished = ['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(o.status);

    const save = async () => {
        setBusy(true);
        try { await apiPatch(`/admin/imports/orders/${o.id}`, { status: status !== o.status ? status : undefined, supplierOrderRef: supplier, trackingNumber: tracking, carrier, note }); setNote(''); onSaved(); }
        catch (e: any) { onError(e?.message || 'Could not save.'); } finally { setBusy(false); }
    };
    const cancel = async () => {
        const reason = window.prompt('Why is this order being cancelled? The buyer is refunded in full and sees this.', '');
        if (reason === null) return;
        setBusy(true);
        try { await apiPost(`/admin/imports/orders/${o.id}/cancel`, { reason }); onSaved(); }
        catch (e: any) { onError(e?.message || 'Could not cancel.'); } finally { setBusy(false); }
    };

    return (
        <li className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                    {o.image_url && <img src={o.image_url} alt="" className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" />}
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{o.title}{o.quantity > 1 ? ` ×${o.quantity}` : ''}</p>
                        <p className="text-xs text-slate-500">{o.buyer_name} · {o.buyer_phone ?? 'no phone'} · paid {money(o.total_zmw)} · {formatDateTime(o.created_at)}</p>
                        <p className="text-xs text-slate-500">Buy at the source for {o.unit_price != null ? `${o.currency} ${o.unit_price}` : '?'} each{o.option_note ? ` · ${o.option_note}` : ''} · deliver to {o.delivery_address}</p>
                        {o.notes && <p className="text-xs text-slate-500">Note: {o.notes}</p>}
                        {o.source_url && <a href={o.source_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-navy underline">Open at {o.source ?? 'the store'}</a>}
                    </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{LABEL[o.status] ?? o.status}</span>
            </div>
            {!finished && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className={input}>{statuses.filter((s) => s !== 'CANCELLED').map((s) => <option key={s} value={s}>{LABEL[s] ?? s}</option>)}</select>
                    <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Store order number" className={input} />
                    <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking number" className={input} />
                    <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Carrier (UPS, DHL…)" className={input} />
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note the buyer will see" className={input} />
                </div>
            )}
            {!finished && (
                <div className="mt-3 flex gap-2">
                    <button disabled={busy} onClick={save} className={`${btn} bg-brand-navy text-white hover:opacity-90`}>Save update</button>
                    <button disabled={busy} onClick={cancel} className={`${btn} border border-slate-200 text-red-600 hover:bg-red-50`}>Cancel and refund</button>
                </div>
            )}
        </li>
    );
}

export default function Imports() {
    const [data, setData] = useState<Overview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState('ALL');
    const [busy, setBusy] = useState(false);
    const [q, setQ] = useState('');
    const [src, setSrc] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [fx, setFx] = useState<Record<string, string>>({});
    const [pricing, setPricing] = useState<Record<string, string>>({});
    const [feeds, setFeeds] = useState<Feed[]>([]);
    const [manual, setManual] = useState({ title: '', price: '', currency: 'USD', images: '', category: '', origin: '', weightKg: '', description: '' });

    const load = useCallback(async () => {
        setError(null);
        try {
            const r = await apiGet<Overview>('/admin/imports');
            setData(r);
            setFx(Object.fromEntries(Object.entries(r.settings.fx).map(([k, v]) => [k, String(v)])));
            setPricing(Object.fromEntries(Object.entries(r.settings.pricing).map(([k, v]) => [k, String(v)])));
            setFeeds(r.feeds);
        } catch (e: any) { setError(e?.message || 'Could not load.'); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); await load(); } catch (e: any) { setError(e?.message || 'That did not work.'); } finally { setBusy(false); } };
    const connected = (data?.sources ?? []).filter((s) => s.configured);
    const source = src && connected.some((s) => s.id === src) ? src : connected[0]?.id ?? '';
    const orders = (data?.orders ?? []).filter((o) => filter === 'ALL' || o.status === filter);
    const toBuy = (data?.orders ?? []).filter((o) => o.status === 'PAID').length;

    return (
        <div>
            <div className="mb-5 flex items-center gap-2"><Globe className="h-5 w-5 text-brand-navy" /><h1 className="text-lg font-semibold text-brand-navy">Imported products</h1></div>
            <p className="mb-5 max-w-2xl text-sm text-slate-500">Orders customers have paid for, the catalogue they browse, and the exchange rates and fees behind the prices.</p>
            {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
            {!data ? <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : (<>
                <section className="mb-8 rounded-xl border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                        <h2 className="text-sm font-semibold text-slate-700">Purchasing queue <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{toBuy} to buy</span></h2>
                        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={input}><option value="ALL">All orders</option>{data.statuses.map((s) => <option key={s} value={s}>{LABEL[s] ?? s}</option>)}</select>
                    </div>
                    {orders.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-400">No orders.</p> : <ul className="divide-y divide-slate-100">{orders.map((o) => <OrderRow key={o.id + o.status + o.events.length} o={o} statuses={data.statuses} onSaved={load} onError={setError} />)}</ul>}
                </section>

                <section className="mb-8 rounded-xl border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                        <h2 className="text-sm font-semibold text-slate-700">Catalogue ({data.products.length})</h2>
                        <div className="flex flex-wrap items-center gap-2">
                            {data.sources.map((s) => <span key={s.id} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s.label}: {s.configured ? 'connected' : 'not connected'}</span>)}
                            <button disabled={busy} onClick={() => run(() => apiPost('/admin/imports/refresh-now', {}, 120000))} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}><RefreshCw className="h-3.5 w-3.5" /> Refresh now</button>
                        </div>
                    </div>

                    {connected.length > 0 && (
                        <div className="border-b border-slate-100 px-5 py-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Find items to add</p>
                            <div className="flex gap-2"><select value={source} onChange={(e) => setSrc(e.target.value)} className={input}>{connected.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run(async () => setResults((await apiPost<{ items: any[] }>('/admin/imports/search', { source, q })).items))} placeholder="e.g. wireless earbuds" className={`${input} flex-1`} />
                                <button disabled={busy || !q.trim()} onClick={() => run(async () => setResults((await apiPost<{ items: any[] }>('/admin/imports/search', { source, q })).items))} className={`${btn} bg-brand-navy text-white`}>Search</button></div>
                            {results.length > 0 && <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{results.map((r) => (
                                <li key={r.sourceId} className="flex gap-2 rounded-lg border border-slate-200 p-2">
                                    {r.images[0] && <img src={r.images[0]} alt="" className="h-14 w-14 flex-shrink-0 rounded object-cover" />}
                                    <div className="min-w-0 flex-1"><p className="line-clamp-2 text-xs font-medium text-slate-700">{r.title}</p><p className="text-xs text-slate-500">{r.currency} {r.price}</p></div>
                                    <button disabled={busy} onClick={() => run(() => apiPost('/admin/imports/add', { source, sourceId: r.sourceId }))} className={`${btn} self-center border border-slate-200 text-slate-700`}>Add</button>
                                </li>))}</ul>}
                        </div>
                    )}

                    <details className="border-b border-slate-100 px-5 py-3">
                        <summary className="cursor-pointer text-sm font-medium text-brand-navy">Add a product by hand</summary>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <input className={input} placeholder="Title" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} />
                            <input className={input} placeholder="Price at the store" inputMode="decimal" value={manual.price} onChange={(e) => setManual({ ...manual, price: e.target.value })} />
                            <select className={input} value={manual.currency} onChange={(e) => setManual({ ...manual, currency: e.target.value })}>{Object.keys(data.settings.fx).filter((c) => c !== 'ZMW').map((c) => <option key={c}>{c}</option>)}<option>ZMW</option></select>
                            <input className={input} placeholder="Category" value={manual.category} onChange={(e) => setManual({ ...manual, category: e.target.value })} />
                            <input className={input} placeholder="Ships from (USA, China…)" value={manual.origin} onChange={(e) => setManual({ ...manual, origin: e.target.value })} />
                            <input className={input} placeholder="Weight in kg" inputMode="decimal" value={manual.weightKg} onChange={(e) => setManual({ ...manual, weightKg: e.target.value })} />
                            <input className={`${input} lg:col-span-2`} placeholder="Picture links, separated by spaces" value={manual.images} onChange={(e) => setManual({ ...manual, images: e.target.value })} />
                            <input className={`${input} sm:col-span-2 lg:col-span-4`} placeholder="Description" value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} />
                        </div>
                        <button disabled={busy || !manual.title.trim() || !manual.price} onClick={() => run(async () => { await apiPost('/admin/imports/products', { ...manual, price: Number(manual.price), weightKg: Number(manual.weightKg) || undefined }); setManual({ title: '', price: '', currency: 'USD', images: '', category: '', origin: '', weightKg: '', description: '' }); })} className={`${btn} mt-3 bg-brand-navy text-white`}>Add product</button>
                    </details>

                    {data.products.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-400">No products yet.</p> : (
                        <ul className="divide-y divide-slate-100">{data.products.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                                {p.images[0] ? <img src={p.images[0]} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="h-10 w-10 rounded bg-slate-100" />}
                                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{p.title}</p>
                                    <p className="text-xs text-slate-500">{p.source} · {p.currency} {p.price} · {p.category ?? 'no category'} · {p.views} views · {p.last_refreshed_at ? `checked ${formatDateTime(p.last_refreshed_at)}` : 'not checked yet'}{p.refresh_error ? ` · ${p.refresh_error}` : ''}</p></div>
                                <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={p.listed} onChange={(e) => run(() => apiPatch(`/admin/imports/products/${p.id}`, { listed: e.target.checked }))} /> Listed</label>
                                <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={p.is_active} onChange={(e) => run(() => apiPatch(`/admin/imports/products/${p.id}`, { isActive: e.target.checked }))} /> Active</label>
                                {p.source !== 'MANUAL' && <button disabled={busy} onClick={() => run(() => apiPost(`/admin/imports/products/${p.id}/refresh`, {}))} className={`${btn} border border-slate-200 text-slate-700`}><RefreshCw className="h-3.5 w-3.5" /></button>}
                            </li>))}</ul>
                    )}
                </section>

                <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
                    <h2 className="mb-3 text-sm font-semibold text-slate-700">Prices: exchange rates, fee, duty and shipping</h2>
                    <div className="grid gap-6 lg:grid-cols-2">
                        <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Kwacha per unit of each currency</p>
                            <div className="grid grid-cols-3 gap-2">{Object.keys(fx).filter((k) => k !== 'ZMW').map((k) => <label key={k} className="text-xs text-slate-500">{k}<input className={`${input} mt-0.5 w-full`} inputMode="decimal" value={fx[k]} onChange={(e) => setFx({ ...fx, [k]: e.target.value })} /></label>)}</div></div>
                        <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Fee, duty, VAT and shipping</p>
                            <div className="grid grid-cols-2 gap-2">{([['feePercent', 'Our fee %'], ['minFee', 'Minimum fee (K)'], ['dutyPercent', 'Import duty %'], ['vatPercent', 'VAT %'], ['shippingPerKgUsd', 'Shipping per kg (USD)']] as const).map(([k, l]) => <label key={k} className="text-xs text-slate-500">{l}<input className={`${input} mt-0.5 w-full`} inputMode="decimal" value={pricing[k] ?? ''} onChange={(e) => setPricing({ ...pricing, [k]: e.target.value })} /></label>)}</div></div>
                    </div>
                    <div className="mt-5">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Searches that keep the catalogue stocked (run once a day, when a source is connected)</p>
                        {feeds.map((f, i) => (
                            <div key={i} className="mb-2 flex flex-wrap gap-2">
                                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600">{f.source}</span>
                                <input className={`${input} flex-1`} value={f.query} placeholder="Search words" onChange={(e) => setFeeds(feeds.map((x, k) => (k === i ? { ...x, query: e.target.value } : x)))} />
                                <input className={`${input} w-40`} value={f.category ?? ''} placeholder="Category" onChange={(e) => setFeeds(feeds.map((x, k) => (k === i ? { ...x, category: e.target.value } : x)))} />
                                <input className={`${input} w-20`} value={f.limit ?? 10} inputMode="numeric" onChange={(e) => setFeeds(feeds.map((x, k) => (k === i ? { ...x, limit: Number(e.target.value) || 10 } : x)))} />
                                <button onClick={() => setFeeds(feeds.filter((_, k) => k !== i))} className={`${btn} text-red-600`}>Remove</button>
                            </div>))}
                        <button onClick={() => setFeeds([...feeds, { source: connected[0]?.id ?? 'EBAY', query: '', limit: 10 }])} className={`${btn} border border-slate-200 text-slate-700`}>Add a search</button>
                    </div>
                    <button disabled={busy} onClick={() => run(() => apiPut('/admin/imports/settings', { fx: Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, Number(v)])), pricing: Object.fromEntries(Object.entries(pricing).map(([k, v]) => [k, Number(v)])), feeds }))} className={`${btn} mt-5 bg-brand-navy text-white`}>Save prices and searches</button>
                </section>
            </>)}
        </div>
    );
}
