import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, formatKwacha } from 'core';
import { Dialog, ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';

const money = (n: number) => formatKwacha(n);
const today = () => new Date().toISOString().slice(0, 10);
type Dir = 'CUSTOMER' | 'SUPPLIER';

interface Note { id: string; direction: Dir; note_number: string; party_name: string; issue_date: string; total: number; amount_applied: number; status: string; reason: string | null; invoice_id: string | null; bill_id: string | null }
interface Acct { id: string; code: string | null; name: string; type: string }
interface Line { description: string; amount: string; taxCode: string; accountId: string }
const blank = (): Line => ({ description: '', amount: '', taxCode: 'STANDARD', accountId: '' });
const TONE: Record<string, string> = { ISSUED: 'bg-[#FEF7E0] text-[#B06000]', APPLIED: 'bg-[#E6F4EA] text-[#137333]', VOID: 'bg-[#F1F3F4] text-[#5F6368]' };

function Form({ dir, onClose, onSaved }: { dir: Dir; onClose: () => void; onSaved: () => void }) {
    const customer = dir === 'CUSTOMER';
    const invoices = useQuery<any[]>({ queryKey: ['credit-notes', 'invoices'], queryFn: () => apiJson('/invoices'), enabled: customer, retry: false });
    const bills = useQuery<{ bills: any[] }>({ queryKey: ['credit-notes', 'bills'], queryFn: () => apiJson('/purchasing/bills'), enabled: !customer, retry: false });
    const suppliers = useQuery<{ suppliers: { id: string; name: string }[] }>({ queryKey: ['credit-notes', 'suppliers'], queryFn: () => apiJson('/purchasing/suppliers'), enabled: !customer, retry: false });
    const accounts = useQuery<{ accounts: Acct[] }>({ queryKey: ['credit-notes', 'accounts'], queryFn: () => apiJson('/accounting/accounts'), retry: false });
    const vatSet = useQuery<{ registered: boolean; rate: number }>({ queryKey: ['credit-notes', 'vat'], queryFn: () => apiJson('/accounting/vat/settings'), retry: false });
    const [targetId, setTargetId] = useState(''); const [supplierId, setSupplierId] = useState(''); const [customerName, setCustomerName] = useState('');
    const [full, setFull] = useState(false); const [date, setDate] = useState(today()); const [reason, setReason] = useState(''); const [lines, setLines] = useState<Line[]>([blank()]);
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const set = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
    const list = customer ? (invoices.data ?? []).filter((i) => i.status !== 'VOID') : (bills.data?.bills ?? []).filter((b) => b.status !== 'VOID');
    const accts = (accounts.data?.accounts ?? []).filter((a) => (customer ? a.type === 'INCOME' : a.type === 'EXPENSE' || (a.type === 'ASSET' && /inventory/i.test(a.name))));
    const save = async () => {
        setBusy(true); setErr(null);
        try {
            const body: any = { issueDate: date, reason, lines: lines.map((l) => ({ description: l.description, amount: Number(l.amount), taxCode: l.taxCode, accountId: l.accountId || undefined })) };
            if (customer) { body.invoiceId = targetId || undefined; body.customerName = customerName || undefined; body.fullCredit = full && !!targetId; }
            else { body.billId = targetId || undefined; body.supplierId = supplierId || undefined; }
            await apiJson(`/accounting/credit-notes/${customer ? 'customer' : 'supplier'}`, { method: 'POST', body: JSON.stringify(body) });
            onSaved(); onClose();
        } catch (e: any) { setErr(e?.message || 'Could not save the credit note.'); } finally { setBusy(false); }
    };
    const needsLines = !(customer && full && targetId);
    return (
        <Dialog open size="lg" title={customer ? 'New customer credit note' : 'New supplier credit note'} onClose={onClose}>
            <ErrorNote text={err} />
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><label className={labelClass}>{customer ? 'Credit against an invoice' : 'Credit against a bill'} (optional)</label>
                        <select className={fieldClass} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                            <option value="">{customer ? 'No invoice, a general credit' : 'No bill, a general credit'}</option>
                            {list.map((x: any) => customer
                                ? <option key={x.id} value={x.id}>{x.invoice_number} · {x.customer_name} · {money(Number(x.total))}</option>
                                : <option key={x.id} value={x.id}>{x.suppliers?.name} · {x.bill_number ?? 'bill'} · {money(Number(x.total))}</option>)}
                        </select></div>
                    {!targetId && customer && <div className="col-span-2"><label className={labelClass}>Customer name</label><input className={fieldClass} value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>}
                    {!targetId && !customer && <div className="col-span-2"><label className={labelClass}>Supplier</label><select className={fieldClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Choose…</option>{(suppliers.data?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
                    <div><label className={labelClass}>Date</label><input type="date" className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
                    <div><label className={labelClass}>Reason</label><input className={fieldClass} placeholder="Return, discount, mistake…" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
                </div>
                {customer && targetId && <label className="flex items-center gap-2 text-sm text-[#3C4043]"><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />Credit the whole invoice</label>}
                {needsLines && (<>
                    <label className={labelClass}>What is being credited (amounts {vatSet.data?.registered ? 'include VAT' : 'in kwacha'})</label>
                    {lines.map((l, i) => (
                        <div key={i} className="space-y-2 rounded-xl border border-[#E0E0E0] bg-white p-3">
                            <input className="h-9 w-full rounded-lg border border-[#C4C7C5] px-2 text-xs" placeholder="Description" value={l.description} onChange={(e) => set(i, { description: e.target.value })} />
                            <div className="grid grid-cols-3 gap-2">
                                <input type="number" step="0.01" min={0} className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" placeholder="Amount" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} />
                                <select className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })}><option value="">{customer ? 'Income account (default)' : 'Account…'}</option>{accts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ''}{a.name}</option>)}</select>
                                {vatSet.data?.registered ? <select className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.taxCode} onChange={(e) => set(i, { taxCode: e.target.value })}><option value="STANDARD">VAT {vatSet.data.rate}%</option><option value="ZERO">Zero-rated</option><option value="EXEMPT">Exempt</option></select> : <span />}
                            </div>
                            {lines.length > 1 && <button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} className="text-[11px] font-semibold text-[#B31412]">Remove line</button>}
                        </div>
                    ))}
                    <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="text-xs font-semibold text-[#0059D8]">+ Add a line</button>
                    <div className="flex items-center justify-between pt-1"><span className="text-sm text-[#5F6368]">Credit total</span><span className="text-lg font-bold tabular-nums">{money(total)}</span></div>
                </>)}
                <p className="text-[11px] text-[#5F6368]">{customer ? 'It is posted to your books, lowers what the customer owes, and is taken off the invoice. Anything left over stays as credit.' : 'It is posted to your books and lowers what you owe the supplier. It does not change stock; record a stock adjustment for goods sent back.'}</p>
                <PrimaryButton busy={busy} onClick={save} disabled={needsLines ? !(total > 0) : false} className="w-full">Save credit note</PrimaryButton>
            </div>
        </Dialog>
    );
}

/** Credit notes for customers (shown in Reports → Receivables) or suppliers (in the Suppliers app). */
export const CreditNotes: React.FC<{ direction: Dir }> = ({ direction }) => {
    const qc = useQueryClient();
    const [adding, setAdding] = useState(false); const [err, setErr] = useState<string | null>(null);
    const { data, error, isLoading } = useQuery<{ creditNotes: Note[] }>({ queryKey: ['accounting', 'credit-notes', direction], queryFn: () => apiJson(`/accounting/credit-notes?direction=${direction}`), retry: false });
    const refresh = () => qc.invalidateQueries();
    const voidIt = async (n: Note) => {
        if (!window.confirm(`Cancel credit note ${n.note_number}? What it was applied to will owe the money again.`)) return;
        try { await apiJson(`/accounting/credit-notes/${n.id}/void`, { method: 'POST' }); refresh(); } catch (e: any) { setErr(e?.message || 'Could not cancel it.'); }
    };
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-['DM_Sans'] text-xl font-semibold text-black">Credit notes</h3>
                <button onClick={() => setAdding(true)} className="h-8 rounded-[10px] bg-[#0B57D0] px-4 font-['DM_Sans'] text-[11px] font-bold text-white hover:bg-[#0842A0]">New credit note</button>
            </div>
            <ErrorNote text={err ?? (error as any)?.message} />
            <div className="w-full overflow-hidden rounded-xl bg-white outline outline-1 outline-offset-[-1px] outline-violet-100">
                {isLoading && <p className="p-5 text-sm text-gray-500">Loading…</p>}
                {!isLoading && (data?.creditNotes ?? []).length === 0 && <p className="p-5 text-sm text-gray-500">No credit notes yet.</p>}
                {(data?.creditNotes ?? []).map((n) => (
                    <div key={n.id} className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-3 text-sm">
                        <div className="min-w-0"><div className="truncate font-medium text-gray-900">{n.note_number} · {n.party_name}</div><div className="text-[11px] text-gray-500">{n.issue_date}{n.reason ? ` · ${n.reason}` : ''}{Number(n.amount_applied) > 0 ? ` · ${money(Number(n.amount_applied))} applied` : ''}</div></div>
                        <div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${TONE[n.status] ?? ''}`}>{n.status === 'ISSUED' && Number(n.amount_applied) === 0 ? 'Unused' : n.status === 'ISSUED' ? 'Part used' : n.status.charAt(0) + n.status.slice(1).toLowerCase()}</span><span className="w-24 text-right tabular-nums">{money(Number(n.total))}</span>
                            {n.status !== 'VOID' && <button onClick={() => voidIt(n)} className="text-xs font-semibold text-[#B31412]">Cancel</button>}</div>
                    </div>
                ))}
            </div>
            {adding && <Form dir={direction} onClose={() => setAdding(false)} onSaved={refresh} />}
        </div>
    );
};
