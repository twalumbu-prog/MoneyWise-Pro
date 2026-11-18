import React, { useState } from 'react';
import { apiJson } from 'core';
import { AlertCircle, CheckCircle, Loader2, Plus, Trash2, Send } from 'lucide-react';

/**
 * Changes MoneyWise makes in the school's Master Fees: record a payment, add a student, create an invoice, void one.
 * The school has to switch writing on in Master Fees first (Integrations, MoneyWise, Data feed, "Allow MoneyWise to make changes"); until then every
 * send is refused and this panel says so. Nothing here deletes anything: a mistake is corrected by voiding.
 */

type Kind = 'payment' | 'student' | 'invoice' | 'void';
const TABS: { id: Kind; label: string }[] = [
    { id: 'payment', label: 'Record a payment' }, { id: 'student', label: 'Add a student' }, { id: 'invoice', label: 'Create an invoice' }, { id: 'void', label: 'Void' },
];

const input = 'block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0B57D0] focus:ring-2 focus:ring-[#0B57D0]/20 disabled:bg-gray-50';
const label = 'mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500';
// One reference per attempt: sending the same form again after a timeout returns the first result instead of making a second record.
const newRef = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;
const today = () => new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10); // Lusaka date

/** Master Fees' own answers, in plain words for the common ones. */
function explain(err: any): string {
    const code = err?.data?.code as string | undefined;
    const msg = err?.data?.error || err?.message || 'Master Fees did not accept that.';
    if (code === 'write_disabled') return 'Writing is switched off for this school. In Master Fees open Integrations, MoneyWise, Data feed, and turn on “Allow MoneyWise to make changes”.';
    if (code === 'write_kind_disabled') return `${msg} Turn that kind of change on in the same place in Master Fees.`;
    if (code === 'not_connected') return 'Master Fees isn’t connected for this business. Connect it above first.';
    if (code === 'has_payments') return 'This invoice has a payment on it. Void the payment first, then the invoice.';
    if (code === 'wallet_payment') return 'That payment came through mobile money or card, so it can only be voided in Master Fees.';
    if (code === 'reference_reused') return 'That reference was already used for something different. Use a new reference.';
    if (code === 'already_invoiced') return 'That student is already invoiced for this term and year.';
    if (err?.data?.retryable) return `${msg} It is safe to press Send again: the same reference is never recorded twice.`;
    return msg;
}

export const MasterfeesWritePanel: React.FC = () => {
    const [kind, setKind] = useState<Kind>('payment');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);

    // payment
    const [payRef, setPayRef] = useState(newRef('MW'));
    const [payStudent, setPayStudent] = useState('');
    const [payAmount, setPayAmount] = useState('');
    const [payDate, setPayDate] = useState(today());
    const [payMethod, setPayMethod] = useState('bank');
    const [payInvoice, setPayInvoice] = useState('');
    const [payPayer, setPayPayer] = useState('');
    const [payNotes, setPayNotes] = useState('');
    // student
    const [stu, setStu] = useState({ first_name: '', last_name: '', gender: '', date_of_birth: '', admission_number: '', grade: '', year: String(new Date().getFullYear()) });
    // invoice
    const [invRef, setInvRef] = useState(newRef('INV'));
    const [invStudent, setInvStudent] = useState('');
    const [invTerm, setInvTerm] = useState('1');
    const [invYear, setInvYear] = useState(String(new Date().getFullYear()));
    const [invDue, setInvDue] = useState('');
    const [items, setItems] = useState([{ description: '', amount: '', category: '' }]);
    // void
    const [voidWhat, setVoidWhat] = useState<'payments' | 'invoices'>('payments');
    const [voidId, setVoidId] = useState('');
    const [voidReason, setVoidReason] = useState('');

    const base = '/integrations/masterfees/write';
    const send = async (path: string, method: 'POST' | 'PATCH', body: unknown, headers: Record<string, string> = {}) => {
        setBusy(true); setError(null); setDone(null);
        try {
            const r = await apiJson<any>(`${base}${path}`, { method, body: JSON.stringify(body), headers });
            return r;
        } catch (e: any) {
            setError(explain(e));
            return null;
        } finally { setBusy(false); }
    };
    const repeatNote = (r: any) => (r?.idempotent ? ' (this reference was already recorded: nothing new was made)' : '');

    const submitPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(payStudent.trim());
        const r = await send('/payments', 'POST', {
            external_reference: payRef.trim(), amount: payAmount, payment_date: payDate || undefined, payment_method: payMethod,
            ...(looksLikeId ? { student_id: payStudent.trim() } : { admission_number: payStudent.trim() }),
            invoice_id: payInvoice.trim() || undefined, payer_name: payPayer.trim() || undefined, notes: payNotes.trim() || undefined,
        });
        if (!r) return;
        const parts = (r.payments || []).length;
        setDone(`Payment recorded: K${Number(r.total).toLocaleString(undefined, { minimumFractionDigits: 2 })} in ${parts} record${parts === 1 ? '' : 's'}${Number(r.unallocated) > 0 ? `, K${Number(r.unallocated).toLocaleString()} kept as credit` : ''}.${repeatNote(r)}`);
        setPayRef(newRef('MW')); setPayAmount(''); setPayInvoice(''); setPayNotes('');
    };

    const submitStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        const r = await send('/students', 'POST', { ...stu, gender: stu.gender || undefined, date_of_birth: stu.date_of_birth || undefined, admission_number: stu.admission_number.trim() || undefined, grade: stu.grade.trim() || undefined, year: stu.year ? Number(stu.year) : undefined });
        if (!r) return;
        setDone(`Student added: ${stu.first_name} ${stu.last_name}.${repeatNote(r)}${r?.student?.student_id ? ` Student id: ${r.student.student_id}` : ''}`);
        setStu({ ...stu, first_name: '', last_name: '', date_of_birth: '', admission_number: '' });
    };

    const submitInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        const r = await send('/invoices', 'POST', {
            external_reference: invRef.trim(), student_id: invStudent.trim(), term: Number(invTerm), year: Number(invYear), due_date: invDue,
            items: items.filter((i) => i.description.trim() || i.amount).map((i) => ({ description: i.description.trim(), amount: i.amount, category: i.category.trim() || undefined })),
        });
        if (!r) return;
        setDone(`Invoice created${r?.invoice?.invoice_number ? `: ${r.invoice.invoice_number}` : ''}.${repeatNote(r)}`);
        setInvRef(newRef('INV')); setItems([{ description: '', amount: '', category: '' }]);
    };

    const submitVoid = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!window.confirm(`Void this ${voidWhat === 'payments' ? 'payment' : 'invoice'} in Master Fees? It stays on record, marked void.`)) return;
        const r = await send(`/${voidWhat}/${voidId.trim()}/void`, 'POST', { reason: voidReason.trim() });
        if (!r) return;
        setDone(`Voided.${repeatNote(r)}`); setVoidId(''); setVoidReason('');
    };

    const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

    return (
        <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-6">
            <h4 className="text-sm font-bold text-gray-900">Make changes in Master Fees</h4>
            <p className="mt-1 text-xs text-gray-500">
                Record a payment, add a student, create an invoice or void one, in this school’s Master Fees. The school must have turned on
                “Allow MoneyWise to make changes” in Master Fees (Integrations, MoneyWise, Data feed). Nothing is ever deleted: a mistake is corrected by voiding.
            </p>

            <div className="mt-4 flex flex-wrap gap-2" role="tablist">
                {TABS.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={kind === t.id} onClick={() => { setKind(t.id); setError(null); setDone(null); }}
                        className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${kind === t.id ? 'border-[#0B57D0] bg-[#E8F0FE] text-[#0B57D0]' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {error && <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /><span>{error}</span></div>}
            {done && <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700"><CheckCircle size={14} className="mt-0.5 flex-shrink-0" /><span>{done}</span></div>}

            {kind === 'payment' && (
                <form onSubmit={submitPayment} className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div><label className={label}>Student (admission number or student id)</label><input className={input} value={payStudent} onChange={(e) => setPayStudent(e.target.value)} required disabled={busy} placeholder="A1042" /></div>
                    <div><label className={label}>Amount (K)</label><input className={input} type="number" step="0.01" min="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required disabled={busy} /></div>
                    <div><label className={label}>Payment date</label><input className={input} type="date" max={today()} value={payDate} onChange={(e) => setPayDate(e.target.value)} disabled={busy} /></div>
                    <div><label className={label}>How it was paid</label>
                        <select className={input} value={payMethod} onChange={(e) => setPayMethod(e.target.value)} disabled={busy}><option value="bank">Bank</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="manual">Manual</option></select>
                        <p className="mt-1 text-[11px] text-gray-400">Mobile money and card payments are made through Master Fees, not here.</p></div>
                    <div><label className={label}>Payer name (optional)</label><input className={input} value={payPayer} onChange={(e) => setPayPayer(e.target.value)} disabled={busy} /></div>
                    <div><label className={label}>Put on one invoice (optional id)</label><input className={input} value={payInvoice} onChange={(e) => setPayInvoice(e.target.value)} disabled={busy} placeholder="Leave empty: oldest open invoices first" /></div>
                    <div className="sm:col-span-2"><label className={label}>Note (optional)</label><input className={input} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} disabled={busy} /></div>
                    <div className="sm:col-span-2"><label className={label}>Reference</label><input className={input} value={payRef} onChange={(e) => setPayRef(e.target.value)} required disabled={busy} />
                        <p className="mt-1 text-[11px] text-gray-400">Yours. Sending the same reference again never records the payment twice.</p></div>
                    <Submit busy={busy} text="Record payment" />
                </form>
            )}

            {kind === 'student' && (
                <form onSubmit={submitStudent} className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div><label className={label}>First name</label><input className={input} value={stu.first_name} onChange={(e) => setStu({ ...stu, first_name: e.target.value })} required disabled={busy} /></div>
                    <div><label className={label}>Last name</label><input className={input} value={stu.last_name} onChange={(e) => setStu({ ...stu, last_name: e.target.value })} required disabled={busy} /></div>
                    <div><label className={label}>Gender</label><select className={input} value={stu.gender} onChange={(e) => setStu({ ...stu, gender: e.target.value })} disabled={busy}><option value="">Not said</option><option value="female">Female</option><option value="male">Male</option></select></div>
                    <div><label className={label}>Date of birth</label><input className={input} type="date" value={stu.date_of_birth} onChange={(e) => setStu({ ...stu, date_of_birth: e.target.value })} disabled={busy} /></div>
                    <div><label className={label}>Admission number</label><input className={input} value={stu.admission_number} onChange={(e) => setStu({ ...stu, admission_number: e.target.value })} disabled={busy} /></div>
                    <div><label className={label}>Grade (as named in Master Fees)</label><input className={input} value={stu.grade} onChange={(e) => setStu({ ...stu, grade: e.target.value })} disabled={busy} placeholder="Grade 5" /></div>
                    <div><label className={label}>Year</label><input className={input} type="number" value={stu.year} onChange={(e) => setStu({ ...stu, year: e.target.value })} disabled={busy} /></div>
                    <Submit busy={busy} text="Add student" />
                </form>
            )}

            {kind === 'invoice' && (
                <form onSubmit={submitInvoice} className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2"><label className={label}>Student id</label><input className={input} value={invStudent} onChange={(e) => setInvStudent(e.target.value)} required disabled={busy} placeholder="The student’s id in Master Fees" /></div>
                    <div><label className={label}>Term</label><select className={input} value={invTerm} onChange={(e) => setInvTerm(e.target.value)} disabled={busy}><option value="1">Term 1</option><option value="2">Term 2</option><option value="3">Term 3</option></select></div>
                    <div><label className={label}>Year</label><input className={input} type="number" value={invYear} onChange={(e) => setInvYear(e.target.value)} required disabled={busy} /></div>
                    <div><label className={label}>Due date</label><input className={input} type="date" value={invDue} onChange={(e) => setInvDue(e.target.value)} required disabled={busy} /></div>
                    <div><label className={label}>Reference</label><input className={input} value={invRef} onChange={(e) => setInvRef(e.target.value)} required disabled={busy} /></div>
                    <div className="sm:col-span-2">
                        <label className={label}>Items</label>
                        <div className="space-y-2">
                            {items.map((it, i) => (
                                <div key={i} className="flex gap-2">
                                    <input className={input} placeholder="Description" value={it.description} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} disabled={busy} />
                                    <input className={`${input} max-w-[8rem]`} type="number" step="0.01" min="0.01" placeholder="Amount" value={it.amount} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} disabled={busy} />
                                    <button type="button" aria-label="Remove item" disabled={busy || items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))} className="rounded-xl border border-gray-200 px-3 text-gray-500 hover:bg-gray-50 disabled:opacity-40"><Trash2 size={14} /></button>
                                </div>
                            ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                            <button type="button" disabled={busy || items.length >= 50} onClick={() => setItems([...items, { description: '', amount: '', category: '' }])} className="inline-flex items-center gap-1 text-xs font-bold text-[#0B57D0]"><Plus size={14} /> Add item</button>
                            <span className="text-xs font-bold text-gray-700">Total K{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                    <Submit busy={busy} text="Create invoice" />
                </form>
            )}

            {kind === 'void' && (
                <form onSubmit={submitVoid} className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div><label className={label}>What to void</label><select className={input} value={voidWhat} onChange={(e) => setVoidWhat(e.target.value as 'payments' | 'invoices')} disabled={busy}><option value="payments">A payment (recorded by hand)</option><option value="invoices">An invoice</option></select></div>
                    <div><label className={label}>Its id</label><input className={input} value={voidId} onChange={(e) => setVoidId(e.target.value)} required disabled={busy} /></div>
                    <div className="sm:col-span-2"><label className={label}>Reason</label><input className={input} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} required disabled={busy} placeholder="Why it is being voided" /></div>
                    <p className="sm:col-span-2 text-[11px] text-gray-400">An invoice with a payment on it can’t be voided: void the payment first. Mobile money and card payments are voided in Master Fees.</p>
                    <Submit busy={busy} text="Void" />
                </form>
            )}
        </div>
    );
};

const Submit: React.FC<{ busy: boolean; text: string }> = ({ busy, text }) => (
    <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#0B57D0] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0A4DBA] disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{busy ? 'Sending…' : text}
        </button>
    </div>
);
