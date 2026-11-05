import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, formatKwacha } from 'core';
import { Dialog, ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';
import { downloadPdf } from '../accounting/AccountingParts';

const money = (n: number) => formatKwacha(n);
const today = () => new Date().toISOString().slice(0, 10);
const TONE: Record<string, string> = { OPEN: 'bg-[#E8F0FE] text-[#1967D2]', PART_RECEIVED: 'bg-[#FEF7E0] text-[#B06000]', RECEIVED: 'bg-[#E6F4EA] text-[#137333]', CANCELLED: 'bg-[#F1F3F4] text-[#5F6368]' };
const LABEL: Record<string, string> = { OPEN: 'Waiting', PART_RECEIVED: 'Part received', RECEIVED: 'Received', CANCELLED: 'Cancelled' };

interface PoLine { id: string; description: string; quantity: number; unit_cost: number; received_qty: number }
interface Order { id: string; po_number: string; order_date: string; expected_date: string | null; status: string; suppliers?: { name: string }; purchase_order_lines: PoLine[]; value: number; orderedQty: number; receivedQty: number }
interface Form { kind: 'product' | 'expense'; productId: string; variantId: string; accountId: string; description: string; quantity: string; unitCost: string }
const blank = (): Form => ({ kind: 'product', productId: '', variantId: '', accountId: '', description: '', quantity: '1', unitCost: '' });

function NewOrder({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const suppliers = useQuery<{ suppliers: { id: string; name: string }[] }>({ queryKey: ['po', 'suppliers'], queryFn: () => apiJson('/purchasing/suppliers'), retry: false });
    const products = useQuery<any[]>({ queryKey: ['po', 'products'], queryFn: () => apiJson('/organizations/products'), retry: false });
    const accounts = useQuery<{ accounts: { id: string; code: string | null; name: string; type: string }[] }>({ queryKey: ['po', 'accounts'], queryFn: () => apiJson('/accounting/accounts'), retry: false });
    const [supplierId, setSupplierId] = useState(''); const [expected, setExpected] = useState(''); const [notes, setNotes] = useState(''); const [lines, setLines] = useState<Form[]>([blank()]);
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const stock = (products.data ?? []).filter((p) => p.track_stock);
    const set = (i: number, p: Partial<Form>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
    const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
    const save = async () => {
        setBusy(true); setErr(null);
        try {
            await apiJson('/purchasing/orders', { method: 'POST', body: JSON.stringify({ supplierId, expectedDate: expected || undefined, notes, lines: lines.map((l) => ({ productId: l.kind === 'product' ? l.productId : undefined, variantId: l.variantId || undefined, accountId: l.kind === 'expense' ? l.accountId : undefined, description: l.description, quantity: Number(l.quantity), unitCost: Number(l.unitCost) })) }) });
            onSaved(); onClose();
        } catch (e: any) { setErr(e?.message || 'Could not save the order.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open size="lg" title="New purchase order" onClose={onClose}>
            <ErrorNote text={err} />
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>Supplier</label><select className={fieldClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Choose…</option>{(suppliers.data?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                    <div><label className={labelClass}>Expected on</label><input type="date" className={fieldClass} value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
                </div>
                {lines.map((l, i) => {
                    const variants: any[] = l.kind === 'product' ? stock.find((p) => p.id === l.productId)?.variants ?? [] : [];
                    return (
                        <div key={i} className="space-y-2 rounded-xl border border-[#E0E0E0] bg-white p-3">
                            <div className="flex gap-2">
                                <select className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.kind} onChange={(e) => set(i, { kind: e.target.value as any })}><option value="product">Stock item</option><option value="expense">Expense</option></select>
                                {l.kind === 'product'
                                    ? <select className="h-9 flex-1 rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.productId} onChange={(e) => set(i, { productId: e.target.value, variantId: '' })}><option value="">Choose a product…</option>{stock.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                                    : <select className="h-9 flex-1 rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })}><option value="">Expense account…</option>{(accounts.data?.accounts ?? []).filter((a) => a.type === 'EXPENSE').map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ''}{a.name}</option>)}</select>}
                                {lines.length > 1 && <button type="button" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} className="text-[#B31412]">×</button>}
                            </div>
                            {variants.length > 0 && <select className="h-9 w-full rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.variantId} onChange={(e) => set(i, { variantId: e.target.value })}><option value="">Which option…</option>{variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>}
                            {l.kind === 'expense' && <input className="h-9 w-full rounded-lg border border-[#C4C7C5] px-2 text-xs" placeholder="Description" value={l.description} onChange={(e) => set(i, { description: e.target.value })} />}
                            <div className="grid grid-cols-3 gap-2">
                                <input type="number" min={1} className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" placeholder="Qty" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
                                <input type="number" min={0} step="0.01" className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" placeholder="Unit cost" value={l.unitCost} onChange={(e) => set(i, { unitCost: e.target.value })} />
                                <div className="flex h-9 items-center justify-end text-xs font-semibold tabular-nums">{money((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}</div>
                            </div>
                        </div>
                    );
                })}
                <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="text-xs font-semibold text-[#0059D8]">+ Add a line</button>
                <div><label className={labelClass}>Notes for the supplier</label><input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                <div className="flex items-center justify-between"><span className="text-sm text-[#5F6368]">Order value (before VAT)</span><span className="text-lg font-bold tabular-nums">{money(total)}</span></div>
                <p className="text-[11px] text-[#5F6368]">An order doesn’t touch your books. When the goods arrive, receive them here and a bill is made for what came.</p>
                <PrimaryButton busy={busy} onClick={save} disabled={!supplierId || total <= 0} className="w-full">Save order</PrimaryButton>
            </div>
        </Dialog>
    );
}

function Receive({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
    const vatSet = useQuery<{ registered: boolean }>({ queryKey: ['po', 'vat'], queryFn: () => apiJson('/accounting/vat/settings'), retry: false });
    const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(order.purchase_order_lines.map((l) => [l.id, String(l.quantity - l.received_qty)])));
    const [billNumber, setBillNumber] = useState(''); const [billDate, setBillDate] = useState(today()); const [incl, setIncl] = useState(false);
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const save = async () => {
        setBusy(true); setErr(null);
        try { await apiJson(`/purchasing/orders/${order.id}/receive`, { method: 'POST', body: JSON.stringify({ billNumber, billDate, pricesIncludeVat: incl, lines: order.purchase_order_lines.map((l) => ({ lineId: l.id, quantity: Number(qty[l.id]) || 0 })) }) }); onSaved(); onClose(); }
        catch (e: any) { setErr(e?.message || 'Could not receive the goods.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open title={`Receive goods for ${order.po_number}`} onClose={onClose}>
            <ErrorNote text={err} />
            <div className="space-y-3">
                {order.purchase_order_lines.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 flex-1 truncate">{l.description}<span className="block text-[11px] text-gray-500">{l.received_qty} of {l.quantity} already received</span></span>
                        <input type="number" min={0} max={l.quantity - l.received_qty} className="h-9 w-20 rounded-lg border border-[#C4C7C5] px-2 text-right text-xs" disabled={l.quantity - l.received_qty <= 0} value={qty[l.id]} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} />
                    </div>
                ))}
                <div className="grid grid-cols-2 gap-3"><div><label className={labelClass}>Supplier’s bill number</label><input className={fieldClass} value={billNumber} onChange={(e) => setBillNumber(e.target.value)} /></div><div><label className={labelClass}>Bill date</label><input type="date" className={fieldClass} value={billDate} onChange={(e) => setBillDate(e.target.value)} /></div></div>
                {vatSet.data?.registered && <label className="flex items-center gap-2 text-sm text-[#3C4043]"><input type="checkbox" checked={incl} onChange={(e) => setIncl(e.target.checked)} />Costs already include VAT</label>}
                <p className="text-[11px] text-[#5F6368]">A bill is made for what arrived, stock goes up, and what you owe the supplier is recorded.</p>
                <PrimaryButton busy={busy} onClick={save} className="w-full">Receive and make the bill</PrimaryButton>
            </div>
        </Dialog>
    );
}

/** Purchase orders, in the Suppliers app. */
export const PurchaseOrders: React.FC = () => {
    const qc = useQueryClient();
    const [adding, setAdding] = useState(false); const [receiving, setReceiving] = useState<Order | null>(null); const [err, setErr] = useState<string | null>(null);
    const { data, error, isLoading } = useQuery<{ orders: Order[] }>({ queryKey: ['purchasing', 'orders'], queryFn: () => apiJson('/purchasing/orders'), retry: false });
    const refresh = () => qc.invalidateQueries({ queryKey: ['purchasing'] });
    const cancel = async (o: Order) => {
        if (!window.confirm(`Cancel ${o.po_number}?`)) return;
        try { await apiJson(`/purchasing/orders/${o.id}/cancel`, { method: 'POST' }); refresh(); } catch (e: any) { setErr(e?.message || 'Could not cancel it.'); }
    };
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-['DM_Sans'] text-xl font-semibold text-black">Purchase orders</h3>
                <button onClick={() => setAdding(true)} className="h-8 rounded-[10px] bg-[#0B57D0] px-4 font-['DM_Sans'] text-[11px] font-bold text-white hover:bg-[#0842A0]">New order</button>
            </div>
            <ErrorNote text={err ?? (error as any)?.message} />
            <div className="w-full overflow-hidden rounded-xl bg-white outline outline-1 outline-offset-[-1px] outline-violet-100">
                {isLoading && <p className="p-5 text-sm text-gray-500">Loading…</p>}
                {!isLoading && (data?.orders ?? []).length === 0 && <p className="p-5 text-sm text-gray-500">No purchase orders yet.</p>}
                {(data?.orders ?? []).map((o) => (
                    <div key={o.id} className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-3 text-sm">
                        <div className="min-w-0"><div className="truncate font-medium text-gray-900">{o.po_number} · {o.suppliers?.name}</div><div className="text-[11px] text-gray-500">{o.order_date}{o.expected_date ? ` · expected ${o.expected_date}` : ''} · {o.receivedQty} of {o.orderedQty} received</div></div>
                        <div className="flex items-center gap-3">
                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${TONE[o.status] ?? ''}`}>{LABEL[o.status] ?? o.status}</span><span className="w-24 text-right tabular-nums">{money(o.value)}</span>
                            <button onClick={() => downloadPdf(`/accounting/pdf?report=po&id=${o.id}`)} className="text-xs font-semibold text-[#5F6368]">PDF</button>
                            {(o.status === 'OPEN' || o.status === 'PART_RECEIVED') && <button onClick={() => setReceiving(o)} className="text-xs font-semibold text-[#0059D8]">Receive</button>}
                            {o.status === 'OPEN' && <button onClick={() => cancel(o)} className="text-xs font-semibold text-[#B31412]">Cancel</button>}
                        </div>
                    </div>
                ))}
            </div>
            {adding && <NewOrder onClose={() => setAdding(false)} onSaved={refresh} />}
            {receiving && <Receive order={receiving} onClose={() => setReceiving(null)} onSaved={refresh} />}
        </div>
    );
};
