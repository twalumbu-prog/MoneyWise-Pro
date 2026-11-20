import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, formatKwacha, productService } from 'core';
import { PackageX, Plus } from 'lucide-react';
import { Dialog, ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';

export const LOSS_KINDS: [string, string][] = [['DAMAGED', 'Damaged'], ['LOST', 'Lost'], ['STOLEN', 'Stolen'], ['EXPIRED', 'Expired'], ['MISCOUNT', 'Miscount'], ['OTHER', 'Other']];
const KIND_LABEL = Object.fromEntries(LOSS_KINDS) as Record<string, string>;

interface Loss { id: string; at: string; product: string; option: string | null; units: number; kind: string; inCharge: string | null; recordedBy: string | null; note: string | null; value: number }
interface LossLog { items: Loss[]; totalUnits: number; totalValue: number; byPerson: { name: string; count: number; units: number; value: number }[] }
interface TrackedProduct { id: string; name: string; stock_quantity: number | null; variants: { id: string; name: string; stock: number }[] | null }
interface StaffRow { id: string; name: string }

/** "Who was in charge": pick someone from the salon's staff, or type a name. Used by the loss form here and by the Adjust form under Stock & value. */
export function InChargePicker({ staff, staffId, name, onChange }: { staff: StaffRow[]; staffId: string; name: string; onChange: (v: { staffId: string; name: string }) => void }) {
    const other = staffId === '' && name !== '';
    return (
        <>
            <label className={labelClass}>Who was in charge of it?</label>
            {staff.length > 0 && (
                <select className={`${fieldClass} mb-2`} value={other ? '__other' : staffId} onChange={(e) => onChange(e.target.value === '__other' ? { staffId: '', name: ' ' } : { staffId: e.target.value, name: '' })}>
                    <option value="">Nobody in particular</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <option value="__other">Someone else…</option>
                </select>
            )}
            {(staff.length === 0 || other) && <input className={`${fieldClass} mb-3`} placeholder="Their name" value={name.trim() === '' && other ? '' : name} onChange={(e) => onChange({ staffId: '', name: e.target.value })} />}
            {staff.length > 0 && !other && <div className="mb-1" />}
        </>
    );
}

export function useStaffList() {
    return useQuery<StaffRow[]>({ queryKey: ['salon', 'staff', 'names'], queryFn: async () => ((await apiJson<{ staff: StaffRow[] }>('/salon/staff')).staff ?? []).map((s) => ({ id: s.id, name: s.name })), retry: false, staleTime: 60_000 });
}

function LossDialog({ products, staff, onClose, onSaved }: { products: TrackedProduct[]; staff: StaffRow[]; onClose: () => void; onSaved: () => void }) {
    const [productId, setProductId] = useState('');
    const [variantId, setVariantId] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [kind, setKind] = useState('DAMAGED');
    const [who, setWho] = useState({ staffId: '', name: '' });
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const product = products.find((p) => p.id === productId);
    const variants = product?.variants ?? [];
    const qty = Math.floor(Number(quantity));
    const save = async () => {
        setBusy(true); setErr(null);
        try {
            await apiJson('/stock/loss', { method: 'POST', body: JSON.stringify({ productId, variantId: variantId || undefined, quantity: qty, kind, inChargeStaffId: who.staffId || undefined, inChargeName: who.staffId ? undefined : who.name.trim() || undefined, note: note || undefined }) });
            onSaved(); onClose();
        } catch (e: any) { setErr(e?.message || 'Could not save.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open title="Record a loss" onClose={onClose}>
            <ErrorNote text={err} />
            <label className={labelClass}>Product</label>
            <select className={`${fieldClass} mb-3`} value={productId} onChange={(e) => { setProductId(e.target.value); setVariantId(''); }}>
                <option value="">Choose a product…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {variants.length > 0 && (
                <select className={`${fieldClass} mb-3`} value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                    <option value="">Which colour or size…</option>
                    {variants.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.stock} in stock)</option>)}
                </select>
            )}
            <label className={labelClass}>How many</label>
            <input type="number" min={1} className={`${fieldClass} mb-3`} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <label className={labelClass}>What happened</label>
            <div className="mb-3 flex flex-wrap gap-2">{LOSS_KINDS.map(([k, l]) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${kind === k ? 'border-[#0B57D0] bg-[#D3E3FD] text-[#041E49]' : 'border-[#C4C7C5] bg-white text-[#5F6368]'}`}>{l}</button>)}</div>
            <InChargePicker staff={staff} staffId={who.staffId} name={who.name} onChange={setWho} />
            <label className={labelClass}>Details (optional)</label>
            <input className={`${fieldClass} mb-4`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. bottle broke while cleaning" />
            <PrimaryButton busy={busy} onClick={save} disabled={!productId || (variants.length > 0 && !variantId) || !(qty > 0)} className="w-full">Take it out of stock</PrimaryButton>
        </Dialog>
    );
}

/** Stock that went missing or was spoiled: what, how many, why, who was in charge, and what it cost. */
export const StockLossPanel: React.FC = () => {
    const qc = useQueryClient();
    const log = useQuery<LossLog>({ queryKey: ['stock', 'losses'], queryFn: () => apiJson('/stock/losses'), retry: false });
    const products = useQuery<TrackedProduct[]>({ queryKey: ['stock', 'products'], queryFn: async () => ((await productService.getProducts()) as any[]).filter((p) => p.track_stock) as TrackedProduct[], retry: false });
    const staff = useStaffList();
    const [open, setOpen] = useState(false);
    const [who, setWho] = useState('');
    const refresh = () => qc.invalidateQueries({ queryKey: ['stock'] });
    const d = log.data;
    const items = (d?.items ?? []).filter((i) => !who || (i.inCharge ?? 'Nobody named') === who);

    return (
        <div className="flex flex-col gap-4 overflow-y-auto p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={() => setOpen(true)} disabled={(products.data ?? []).length === 0} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#0B57D0] px-5 text-sm font-bold text-white hover:bg-[#0842A0] disabled:opacity-50"><Plus size={15} /> Record a loss</button>
                {d && <div className="text-right"><div className="text-[10px] font-semibold uppercase tracking-wide text-[#5F6368]">Lost in total</div><div className="text-lg font-bold text-[#1F1F1F]">{d.totalUnits} item{d.totalUnits === 1 ? '' : 's'}{d.totalValue > 0 ? ` · ${formatKwacha(d.totalValue)}` : ''}</div></div>}
            </div>
            <ErrorNote text={(log.error as any)?.message} />

            {d && d.byPerson.length > 0 && (
                <section className="rounded-2xl bg-white p-4">
                    <h3 className="mb-2 text-sm font-bold text-[#1F1F1F]">Who was in charge</h3>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setWho('')} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${who === '' ? 'border-[#0B57D0] bg-[#D3E3FD] text-[#041E49]' : 'border-[#C4C7C5] bg-white text-[#5F6368]'}`}>Everyone</button>
                        {d.byPerson.map((p) => <button key={p.name} type="button" onClick={() => setWho(p.name)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${who === p.name ? 'border-[#0B57D0] bg-[#D3E3FD] text-[#041E49]' : 'border-[#C4C7C5] bg-white text-[#5F6368]'}`}>{p.name} · {p.units} lost{p.value > 0 ? ` · ${formatKwacha(p.value)}` : ''}</button>)}
                    </div>
                </section>
            )}

            <section className="rounded-2xl bg-white p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><PackageX size={15} className="text-[#B31412]" /> Losses</h3>
                {d && items.length === 0 && <p className="text-sm text-[#5F6368]">{d.items.length === 0 ? 'No losses recorded. When stock is damaged, lost, stolen or expires, record it here with who was in charge.' : 'Nothing recorded for this person.'}</p>}
                <ul className="divide-y divide-[rgba(116,119,117,0.15)]">
                    {items.map((i) => (
                        <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[#1F1F1F]">{i.product}{i.option ? ` · ${i.option}` : ''}</p>
                                <p className="text-[11px] text-[#5F6368]">{new Date(i.at).toLocaleDateString()} · {KIND_LABEL[i.kind] ?? i.kind} · In charge: <span className="font-semibold text-[#1F1F1F]">{i.inCharge ?? 'not named'}</span>{i.recordedBy ? ` · recorded by ${i.recordedBy}` : ''}{i.note ? ` · ${i.note}` : ''}</p>
                            </div>
                            <div className="text-right tabular-nums"><div className="text-sm font-bold text-[#B31412]">−{i.units}</div>{i.value > 0 && <div className="text-[11px] text-[#5F6368]">{formatKwacha(i.value)}</div>}</div>
                        </li>
                    ))}
                </ul>
            </section>

            {open && <LossDialog products={products.data ?? []} staff={staff.data ?? []} onClose={() => setOpen(false)} onSaved={refresh} />}
        </div>
    );
};
