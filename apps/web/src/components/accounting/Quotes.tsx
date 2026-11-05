import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, formatKwacha } from 'core';
import { Dialog, ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';
import { downloadPdf } from './AccountingParts';

const money = (n: number) => formatKwacha(n);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const TONE: Record<string, string> = { OPEN: 'bg-[#E8F0FE] text-[#1967D2]', ACCEPTED: 'bg-[#E6F4EA] text-[#137333]', DECLINED: 'bg-[#FCE8E6] text-[#B31412]', INVOICED: 'bg-[#E6F4EA] text-[#137333]', CANCELLED: 'bg-[#F1F3F4] text-[#5F6368]', EXPIRED: 'bg-[#FEF7E0] text-[#B06000]' };
const LABEL: Record<string, string> = { OPEN: 'Sent', ACCEPTED: 'Accepted', DECLINED: 'Declined', INVOICED: 'Invoiced', CANCELLED: 'Cancelled', EXPIRED: 'Expired' };

interface Quote { id: string; quote_number: string; customer_name: string; issue_date: string; valid_until: string; total: number; status: string; expired: boolean; invoice_id: string | null }
interface Line { productId: string; name: string; quantity: string; price: string }
const blank = (): Line => ({ productId: '', name: '', quantity: '1', price: '' });

function NewQuote({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const products = useQuery<any[]>({ queryKey: ['quotes', 'products'], queryFn: () => apiJson('/organizations/products'), retry: false });
    const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [valid, setValid] = useState(addDays(30)); const [notes, setNotes] = useState('');
    const [lines, setLines] = useState<Line[]>([blank()]); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const set = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
    const pick = (i: number, id: string) => { const p = (products.data ?? []).find((x) => x.id === id); set(i, { productId: id, name: p?.name ?? '', price: p && Number(p.price) > 0 ? String(p.price) : lines[i].price }); };
    const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0), 0);
    const save = async () => {
        setBusy(true); setErr(null);
        try {
            await apiJson('/accounting/quotes', { method: 'POST', body: JSON.stringify({ customerName: name, customerPhone: phone, customerEmail: email, validUntil: valid, notes, items: lines.map((l) => (l.productId ? { product_id: l.productId, quantity: Number(l.quantity), price: Number(l.price) } : { custom: true, name: l.name, quantity: Number(l.quantity), price: Number(l.price) })) }) });
            onSaved(); onClose();
        } catch (e: any) { setErr(e?.message || 'Could not save the quote.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open size="lg" title="New quote" onClose={onClose}>
            <ErrorNote text={err} />
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><label className={labelClass}>Customer</label><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
                    <div><label className={labelClass}>Phone</label><input className={fieldClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                    <div><label className={labelClass}>Email</label><input className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                    <div><label className={labelClass}>Valid until</label><input type="date" className={fieldClass} value={valid} onChange={(e) => setValid(e.target.value)} /></div>
                </div>
                {lines.map((l, i) => (
                    <div key={i} className="space-y-2 rounded-xl border border-[#E0E0E0] bg-white p-3">
                        <select className="h-9 w-full rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.productId} onChange={(e) => pick(i, e.target.value)}><option value="">Custom item (type below)</option>{(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                        {!l.productId && <input className="h-9 w-full rounded-lg border border-[#C4C7C5] px-2 text-xs" placeholder="Description" value={l.name} onChange={(e) => set(i, { name: e.target.value })} />}
                        <div className="grid grid-cols-3 gap-2">
                            <input type="number" min={1} className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" placeholder="Qty" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
                            <input type="number" min={0} step="0.01" className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" placeholder="Price" value={l.price} onChange={(e) => set(i, { price: e.target.value })} />
                            <div className="flex h-9 items-center justify-end text-xs font-semibold tabular-nums">{money((Number(l.quantity) || 0) * (Number(l.price) || 0))}</div>
                        </div>
                        {lines.length > 1 && <button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} className="text-[11px] font-semibold text-[#B31412]">Remove line</button>}
                    </div>
                ))}
                <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="text-xs font-semibold text-[#0059D8]">+ Add a line</button>
                <div><label className={labelClass}>Notes</label><input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                <div className="flex items-center justify-between"><span className="text-sm text-[#5F6368]">Total</span><span className="text-lg font-bold tabular-nums">{money(total)}</span></div>
                <p className="text-[11px] text-[#5F6368]">A quote doesn’t touch your books. When the customer accepts, turn it into an invoice.</p>
                <PrimaryButton busy={busy} onClick={save} disabled={!name.trim() || total <= 0} className="w-full">Save quote</PrimaryButton>
            </div>
        </Dialog>
    );
}

/** Quotes, in Reports → Receivables. */
export const Quotes: React.FC = () => {
    const qc = useQueryClient();
    const [adding, setAdding] = useState(false); const [err, setErr] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
    const { data, error, isLoading } = useQuery<{ quotes: Quote[] }>({ queryKey: ['accounting', 'quotes'], queryFn: () => apiJson('/accounting/quotes'), retry: false });
    const refresh = () => qc.invalidateQueries();
    const status = async (q: Quote, s: string) => { try { await apiJson(`/accounting/quotes/${q.id}/status`, { method: 'POST', body: JSON.stringify({ status: s }) }); refresh(); } catch (e: any) { setErr(e?.message || 'Could not update it.'); } };
    const convert = async (q: Quote) => {
        if (!window.confirm(`Turn ${q.quote_number} into an invoice for ${money(Number(q.total))}? It is posted to your books and the customer owes it.`)) return;
        try { const r = await apiJson<{ invoice: { invoice_number: string } }>(`/accounting/quotes/${q.id}/convert`, { method: 'POST', body: JSON.stringify({ issueDate: today() }) }); setNotice(`Invoice ${r.invoice.invoice_number} created.`); refresh(); } catch (e: any) { setErr(e?.message || 'Could not make the invoice.'); }
    };
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-['DM_Sans'] text-xl font-semibold text-black">Quotes</h3>
                <button onClick={() => setAdding(true)} className="h-8 rounded-[10px] bg-[#0B57D0] px-4 font-['DM_Sans'] text-[11px] font-bold text-white hover:bg-[#0842A0]">New quote</button>
            </div>
            <ErrorNote text={err ?? (error as any)?.message} />
            {notice && <p className="rounded-xl bg-[#E6F4EA] px-4 py-3 text-sm text-[#137333]">{notice}</p>}
            <div className="w-full overflow-hidden rounded-xl bg-white outline outline-1 outline-offset-[-1px] outline-violet-100">
                {isLoading && <p className="p-5 text-sm text-gray-500">Loading…</p>}
                {!isLoading && (data?.quotes ?? []).length === 0 && <p className="p-5 text-sm text-gray-500">No quotes yet.</p>}
                {(data?.quotes ?? []).map((q) => {
                    const st = q.expired ? 'EXPIRED' : q.status;
                    return (
                        <div key={q.id} className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-3 text-sm">
                            <div className="min-w-0"><div className="truncate font-medium text-gray-900">{q.quote_number} · {q.customer_name}</div><div className="text-[11px] text-gray-500">{q.issue_date} · valid until {q.valid_until}</div></div>
                            <div className="flex items-center gap-3">
                                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${TONE[st] ?? ''}`}>{LABEL[st] ?? st}</span><span className="w-24 text-right tabular-nums">{money(Number(q.total))}</span>
                                <button onClick={() => downloadPdf(`/accounting/pdf?report=quote&id=${q.id}`)} className="text-xs font-semibold text-[#5F6368]">PDF</button>
                                {q.status === 'OPEN' && <button onClick={() => status(q, 'ACCEPTED')} className="text-xs font-semibold text-[#137333]">Accepted</button>}
                                {q.status === 'OPEN' && <button onClick={() => status(q, 'DECLINED')} className="text-xs font-semibold text-[#B31412]">Declined</button>}
                                {(q.status === 'OPEN' || q.status === 'ACCEPTED') && <button onClick={() => convert(q)} className="text-xs font-semibold text-[#0059D8]">Make invoice</button>}
                            </div>
                        </div>
                    );
                })}
            </div>
            {adding && <NewQuote onClose={() => setAdding(false)} onSaved={refresh} />}
        </div>
    );
};
