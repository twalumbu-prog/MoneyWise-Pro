import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, formatKwacha } from 'core';
import { Dialog, ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';
import { Upgrade, useAccountingAccess } from '../accounting/AccountingParts';

const money = (n: number) => formatKwacha(n);
interface Valuation { rows: { productId: string; name: string; quantity: number; unitCost: number; value: number; low: boolean; costKnown: boolean; variants: { id: string; name: string; stock: number }[] }[]; totalValue: number; withoutCost: number; ledgerInventory: number | null }
interface Movement { id: string; product_id: string; quantity_change: number; unit_cost: number | null; reason: string; note: string | null; balance_after: number | null; created_at: string; products?: { name: string } }
const REASON: Record<string, string> = { PURCHASE: 'Bought', ADJUSTMENT: 'Adjusted', COUNT: 'Stock count', SALE: 'Sold', RETURN: 'Returned', VOID: 'Bill cancelled' };

function Adjust({ row, onClose, onSaved }: { row: Valuation['rows'][number]; onClose: () => void; onSaved: () => void }) {
    const [mode, setMode] = useState<'count' | 'change'>('count'); const [value, setValue] = useState(''); const [note, setNote] = useState(''); const [variantId, setVariantId] = useState('');
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const save = async () => {
        setBusy(true); setErr(null);
        try { await apiJson('/purchasing/stock/adjust', { method: 'POST', body: JSON.stringify({ productId: row.productId, variantId: variantId || undefined, [mode === 'count' ? 'countedQuantity' : 'change']: Number(value), note }) }); onSaved(); onClose(); }
        catch (e: any) { setErr(e?.message || 'Could not adjust the stock.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open title={`Adjust ${row.name}`} onClose={onClose}>
            <ErrorNote text={err} />
            <p className="mb-3 text-sm text-[#5F6368]">Now {row.quantity} in stock.</p>
            {row.variants.length > 0 && (
                <select className={`${fieldClass} mb-3`} value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                    <option value="">Which option…</option>{row.variants.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.stock})</option>)}
                </select>
            )}
            <div className="mb-3 flex gap-2">{([['count', 'I counted'], ['change', 'Add or remove']] as const).map(([id, l]) => <button key={id} type="button" onClick={() => setMode(id)} className={`rounded-full px-4 py-1.5 text-sm ${mode === id ? 'bg-[#CFE4FF] font-medium text-[#0059D8]' : 'bg-[#F1F3F4] text-[#3C4043]'}`}>{l}</button>)}</div>
            <label className={labelClass}>{mode === 'count' ? 'Counted quantity' : 'Change (use a minus to remove)'}</label>
            <input type="number" className={`${fieldClass} mb-3`} value={value} onChange={(e) => setValue(e.target.value)} />
            <label className={labelClass}>Why</label>
            <input className={`${fieldClass} mb-3`} placeholder="Damaged, lost, miscount…" value={note} onChange={(e) => setNote(e.target.value)} />
            <p className="mb-3 text-[11px] text-[#5F6368]">{row.costKnown ? 'The difference is valued at the average cost and posted to your books as an inventory adjustment.' : 'No cost is recorded for this product yet, so nothing is posted to your books. Receive it on a purchase bill to set its cost.'}</p>
            <PrimaryButton busy={busy} onClick={save} disabled={value === '' || (row.variants.length > 0 && !variantId)} className="w-full">Save</PrimaryButton>
        </Dialog>
    );
}

/** Stock value and the history of every stock change. Shown in Products & Services. */
export const InventoryPanel: React.FC = () => {
    const access = useAccountingAccess();
    const qc = useQueryClient();
    const enabled = !!access.data?.enabled;
    const val = useQuery<Valuation>({ queryKey: ['purchasing', 'valuation'], queryFn: () => apiJson('/purchasing/stock/valuation'), enabled, retry: false });
    const mv = useQuery<{ movements: Movement[] }>({ queryKey: ['purchasing', 'movements'], queryFn: () => apiJson('/purchasing/stock/movements'), enabled, retry: false });
    const [adjusting, setAdjusting] = useState<Valuation['rows'][number] | null>(null);
    if (access.isLoading) return <p className="p-4 text-sm text-gray-500">Loading…</p>;
    if (!enabled) return <div className="p-5"><Upgrade /></div>;
    const refresh = () => qc.invalidateQueries({ queryKey: ['purchasing'] });
    const v = val.data;
    return (
        <div className="flex flex-col gap-4 overflow-y-auto p-5">
            <div className="flex h-24 w-full items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-l from-[#0B57D0] to-[#0842A0] p-5">
                <div className="flex flex-col gap-2"><div className="font-['Figtree'] text-[10px] uppercase tracking-wider text-white/70">Stock value at cost</div><div className="font-['DM_Sans'] text-3xl font-bold leading-none text-white">{v ? money(v.totalValue) : '…'}</div></div>
                {v?.ledgerInventory != null && <div className="text-right text-[11px] text-white/80">In your books<br /><span className="text-sm font-bold text-white">{money(v.ledgerInventory)}</span></div>}
            </div>
            <ErrorNote text={(val.error as any)?.message} />
            {v && v.withoutCost > 0 && <p className="text-[11px] text-[#B06000]">{v.withoutCost} product{v.withoutCost === 1 ? ' has' : 's have'} stock but no cost yet, so they count as zero here. Receive them on a purchase bill to set a cost.</p>}
            <div className="w-full overflow-hidden rounded-xl bg-white outline outline-1 outline-offset-[-1px] outline-violet-100">
                <div className="grid grid-cols-[1fr_5rem_6rem_7rem_4rem] gap-2 border-b border-violet-100 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500"><span>Product</span><span className="text-right">In stock</span><span className="text-right">Avg cost</span><span className="text-right">Value</span><span /></div>
                {(v?.rows ?? []).length === 0 && !val.isLoading && <p className="p-5 text-sm text-gray-500">No product tracks stock yet.</p>}
                {(v?.rows ?? []).map((r) => (
                    <div key={r.productId} className="grid grid-cols-[1fr_5rem_6rem_7rem_4rem] items-center gap-2 border-b border-gray-100 px-5 py-3 text-sm tabular-nums">
                        <span className="truncate font-sans">{r.name}{r.low && <span className="ml-2 rounded-full bg-[#FEF7E0] px-2 py-0.5 text-[10px] font-semibold text-[#B06000]">Low</span>}</span>
                        <span className="text-right">{r.quantity}</span><span className="text-right">{r.costKnown ? money(r.unitCost) : '—'}</span><span className="text-right font-medium">{money(r.value)}</span>
                        <button onClick={() => setAdjusting(r)} className="text-right text-xs font-semibold text-[#0059D8]">Adjust</button>
                    </div>
                ))}
            </div>
            <div>
                <h3 className="mb-2 font-['DM_Sans'] text-xl font-semibold text-black">Stock history</h3>
                <div className="w-full overflow-hidden rounded-xl bg-white outline outline-1 outline-offset-[-1px] outline-violet-100">
                    {(mv.data?.movements ?? []).length === 0 && !mv.isLoading && <p className="p-5 text-sm text-gray-500">No stock changes recorded yet. Bills and adjustments will appear here.</p>}
                    {(mv.data?.movements ?? []).map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-3 text-sm">
                            <div className="min-w-0"><div className="truncate font-medium">{m.products?.name ?? 'Product'}</div><div className="text-[11px] text-gray-500">{new Date(m.created_at).toLocaleDateString()} · {REASON[m.reason] ?? m.reason}{m.note ? ` · ${m.note}` : ''}</div></div>
                            <div className="text-right tabular-nums"><div className={m.quantity_change < 0 ? 'text-[#B31412]' : 'text-[#137333]'}>{m.quantity_change > 0 ? '+' : ''}{m.quantity_change}</div>{m.balance_after != null && <div className="text-[11px] text-gray-500">now {m.balance_after}</div>}</div>
                        </div>
                    ))}
                </div>
            </div>
            {adjusting && <Adjust row={adjusting} onClose={() => setAdjusting(null)} onSaved={refresh} />}
        </div>
    );
};
