import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, formatKwacha, productService } from 'core';
import { AlertTriangle, Minus, PackagePlus, TrendingDown } from 'lucide-react';
import { Dialog, ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';

const money = (n: number) => formatKwacha(n);

interface LowRow { productId: string; name: string; variantId: string | null; variantName: string | null; stock: number; threshold: number; out: boolean }
interface Spending {
    total: number;
    byMonth: { month: string; spent: number; quantity: number }[];
    byItem: { productId: string; name: string; variantId: string | null; variantName: string | null; quantity: number; spent: number }[];
    purchases: { at: string; name: string; variantName: string | null; quantity: number; unitCost: number; spent: number; source: string; note: string | null }[];
}
interface TrackedProduct { id: string; name: string; stock_quantity: number | null; low_stock_threshold: number | null; cost_price: number | null; variants: { id: string; name: string; stock: number }[] | null }

const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/** One dialog for both everyday actions: "use stock" (taking it out because it was used) and "restock" (putting it in, with what it cost). */
function StockDialog({ mode, products, preset, onClose, onSaved }: { mode: 'use' | 'restock'; products: TrackedProduct[]; preset?: { productId: string; variantId: string | null }; onClose: () => void; onSaved: () => void }) {
    const [productId, setProductId] = useState(preset?.productId ?? '');
    const [variantId, setVariantId] = useState(preset?.variantId ?? '');
    const [quantity, setQuantity] = useState('');
    const [unitCost, setUnitCost] = useState('');
    const [supplier, setSupplier] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const product = products.find((p) => p.id === productId);
    const variants = product?.variants ?? [];
    const available = product ? (variants.length ? variants.find((v) => v.id === variantId)?.stock : product.stock_quantity) : undefined;
    const qty = Math.floor(Number(quantity));
    const total = mode === 'restock' && qty > 0 && Number(unitCost) >= 0 && unitCost !== '' ? qty * Number(unitCost) : null;

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            await apiJson(mode === 'use' ? '/stock/use' : '/stock/restock', {
                method: 'POST',
                body: JSON.stringify({ productId, variantId: variantId || undefined, quantity: qty, note: note || undefined, ...(mode === 'restock' ? { unitCost: Number(unitCost), supplier: supplier || undefined } : {}) }),
            });
            onSaved(); onClose();
        } catch (e: any) { setErr(e?.message || 'Could not save.'); } finally { setBusy(false); }
    };
    const ready = !!productId && (variants.length === 0 || !!variantId) && qty > 0 && (mode === 'use' || (unitCost !== '' && Number(unitCost) >= 0));

    return (
        <Dialog open title={mode === 'use' ? 'Use stock' : 'Add stock you bought'} onClose={onClose}>
            <ErrorNote text={err} />
            <label className={labelClass}>Product</label>
            <select className={`${fieldClass} mb-3`} value={productId} onChange={(e) => { setProductId(e.target.value); setVariantId(''); }}>
                <option value="">Choose a product…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {variants.length > 0 && (
                <>
                    <label className={labelClass}>Colour or size</label>
                    <select className={`${fieldClass} mb-3`} value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                        <option value="">Which one…</option>
                        {variants.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.stock} in stock)</option>)}
                    </select>
                </>
            )}
            <label className={labelClass}>{mode === 'use' ? 'How many used' : 'How many bought'}</label>
            <input type="number" min={1} className={`${fieldClass} mb-1`} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 3" />
            {available != null && <p className="mb-3 text-[11px] text-[#5F6368]">{available} in stock now{mode === 'use' && qty > 0 ? `, ${Math.max(0, available - qty)} after` : qty > 0 ? `, ${available + qty} after` : ''}.</p>}
            {mode === 'restock' && (
                <>
                    <label className={labelClass}>Cost of each (K)</label>
                    <input type="number" min={0} step="0.01" className={`${fieldClass} mb-1`} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" />
                    {total != null && <p className="mb-3 text-[11px] text-[#5F6368]">That is {money(total)} spent.</p>}
                    <label className={labelClass}>Bought from (optional)</label>
                    <input className={`${fieldClass} mb-3`} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier or shop" />
                </>
            )}
            <label className={labelClass}>{mode === 'use' ? 'What for (optional)' : 'Note (optional)'}</label>
            <input className={`${fieldClass} mb-4`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'use' ? 'Client name or service' : ''} />
            <PrimaryButton busy={busy} onClick={save} disabled={!ready} className="w-full">{mode === 'use' ? 'Take it out of stock' : 'Add to stock'}</PrimaryButton>
        </Dialog>
    );
}

/** Everyday stock for every plan: what is running low, using stock up, restocking with a cost, and what has been spent on stock. */
export const StockPanel: React.FC = () => {
    const qc = useQueryClient();
    const low = useQuery<{ rows: LowRow[]; out: number; low: number }>({ queryKey: ['stock', 'low'], queryFn: () => apiJson('/stock/low'), retry: false });
    const spend = useQuery<Spending>({ queryKey: ['stock', 'spending'], queryFn: () => apiJson('/stock/spending'), retry: false });
    const products = useQuery<TrackedProduct[]>({
        queryKey: ['stock', 'products'],
        queryFn: async () => ((await productService.getProducts()) as any[]).filter((p) => p.track_stock && p.is_active !== false) as TrackedProduct[],
        retry: false,
    });
    const [dialog, setDialog] = useState<{ mode: 'use' | 'restock'; preset?: { productId: string; variantId: string | null } } | null>(null);
    const refresh = () => qc.invalidateQueries({ queryKey: ['stock'] });
    const tracked = products.data ?? [];
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthSpend = spend.data?.byMonth.find((m) => m.month === thisMonth)?.spent ?? 0;

    return (
        <div className="flex flex-col gap-4 overflow-y-auto p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                    <button type="button" onClick={() => setDialog({ mode: 'use' })} disabled={tracked.length === 0} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#0B57D0] px-5 text-sm font-bold text-white hover:bg-[#0842A0] disabled:opacity-50"><Minus size={15} /> Use stock</button>
                    <button type="button" onClick={() => setDialog({ mode: 'restock' })} disabled={tracked.length === 0} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#C4C7C5] bg-white px-5 text-sm font-bold text-[#1F1F1F] hover:bg-[#F8FAFD] disabled:opacity-50"><PackagePlus size={15} /> Add stock bought</button>
                </div>
                {spend.data && <div className="text-right"><div className="text-[10px] font-semibold uppercase tracking-wide text-[#5F6368]">Spent on stock this month</div><div className="text-lg font-bold text-[#1F1F1F]">{money(monthSpend)}</div></div>}
            </div>
            {products.isSuccess && tracked.length === 0 && (
                <p className="rounded-2xl bg-white p-4 text-sm text-[#5F6368]">No products are tracking stock yet. Open a product under Products and turn on stock tracking, then add its colours or sizes and how many you have.</p>
            )}
            <ErrorNote text={(low.error as any)?.message || (spend.error as any)?.message} />

            <section className="rounded-2xl bg-white p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><AlertTriangle size={15} className="text-[#B06000]" /> Running low {low.data ? `(${low.data.rows.length})` : ''}</h3>
                {low.data && low.data.rows.length === 0 && <p className="text-sm text-[#5F6368]">Nothing is running low.</p>}
                <ul className="divide-y divide-[rgba(116,119,117,0.15)]">
                    {(low.data?.rows ?? []).map((r) => (
                        <li key={`${r.productId}-${r.variantId ?? ''}`} className="flex items-center justify-between gap-3 py-2.5">
                            <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#1F1F1F]">{r.name}{r.variantName ? ` · ${r.variantName}` : ''}</p><p className="text-[11px] text-[#5F6368]">Alert level {r.threshold}</p></div>
                            <div className="flex items-center gap-3">
                                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${r.out ? 'bg-[#FCE8E6] text-[#B31412]' : 'bg-[#FEF7E0] text-[#B06000]'}`}>{r.out ? 'Out of stock' : `${r.stock} left`}</span>
                                <button type="button" onClick={() => setDialog({ mode: 'restock', preset: { productId: r.productId, variantId: r.variantId } })} className="text-xs font-bold text-[#0B57D0] hover:underline">Restock</button>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="rounded-2xl bg-white p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><TrendingDown size={15} className="text-[#0B57D0]" /> Spent on stock</h3>
                {spend.data && spend.data.byMonth.length === 0 && <p className="text-sm text-[#5F6368]">No purchases recorded yet. Use “Add stock bought” each time you buy, with what it cost.</p>}
                {spend.data && spend.data.byMonth.length > 0 && (
                    <>
                        <p className="mb-3 text-sm text-[#5F6368]">In total: <span className="font-bold text-[#1F1F1F]">{money(spend.data.total)}</span></p>
                        <div className="mb-4 grid gap-2 sm:grid-cols-2">
                            {spend.data.byMonth.slice(0, 6).map((m) => (
                                <div key={m.month} className="flex items-center justify-between rounded-xl bg-[#F8FAFD] px-3 py-2"><span className="text-sm text-[#5F6368]">{monthName(m.month)}</span><span className="text-sm font-bold text-[#1F1F1F]">{money(m.spent)}</span></div>
                            ))}
                        </div>
                        <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#5F6368]">By item</h4>
                        <ul className="divide-y divide-[rgba(116,119,117,0.15)]">
                            {spend.data.byItem.slice(0, 12).map((i) => (
                                <li key={`${i.productId}-${i.variantId ?? ''}`} className="flex items-center justify-between gap-3 py-2"><span className="truncate text-sm text-[#1F1F1F]">{i.name}{i.variantName ? ` · ${i.variantName}` : ''} <span className="text-[11px] text-[#5F6368]">({i.quantity} bought)</span></span><span className="text-sm font-bold text-[#1F1F1F]">{money(i.spent)}</span></li>
                            ))}
                        </ul>
                    </>
                )}
            </section>

            {dialog && <StockDialog mode={dialog.mode} products={tracked} preset={dialog.preset} onClose={() => setDialog(null)} onSaved={refresh} />}
        </div>
    );
};
