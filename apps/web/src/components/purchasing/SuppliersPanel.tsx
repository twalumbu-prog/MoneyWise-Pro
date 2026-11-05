import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { Dialog, ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../ui/Dialog';
import { Upgrade, useAccountingAccess, downloadPdf } from '../accounting/AccountingParts';
import BankSelect from '../BankSelect';
import { CreditNotes } from '../accounting/CreditNotes';
import { PurchaseOrders } from './PurchaseOrders';
import { lencoService } from '../../services/lenco.service';

const money = (n: number) => formatKwacha(n);
const today = () => new Date().toISOString().slice(0, 10);
const BILL_TONE: Record<string, string> = { OPEN: 'bg-[#E8F0FE] text-[#1967D2]', PARTIAL: 'bg-[#FEF7E0] text-[#B06000]', PAID: 'bg-[#E6F4EA] text-[#137333]', VOID: 'bg-[#F1F3F4] text-[#5F6368]' };

interface Supplier { id: string; name: string; contact_person: string | null; phone: string | null; email: string | null; address: string | null; tax_number: string | null; payout_method: string | null; payout_bank_code: string | null; payout_account: string | null; payout_account_name: string | null; payment_terms_days: number; notes: string | null; owed: number; overdue: number; bills: number }
interface Bill { id: string; supplier_id: string; bill_number: string | null; bill_date: string; due_date: string; status: string; total: number; amount_paid: number; requisition_id?: string | null; suppliers?: { name: string }; purchase_bill_lines?: any[]; bill_payments?: any[] }
interface Acct { id: string; code: string | null; name: string; type: string; subtype: string | null }

const useData = <T,>(key: string, path: string, enabled = true) => useQuery<T>({ queryKey: ['purchasing', key], queryFn: () => apiJson<T>(path), enabled, retry: false });
const Pill: React.FC<{ status: string }> = ({ status }) => <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${BILL_TONE[status] ?? ''}`}>{status === 'PARTIAL' ? 'Part paid' : status.charAt(0) + status.slice(1).toLowerCase()}</span>;

function SupplierForm({ supplier, onClose, onSaved }: { supplier: Partial<Supplier> | null; onClose: () => void; onSaved: () => void }) {
    const [f, setF] = useState({ name: supplier?.name ?? '', contactPerson: supplier?.contact_person ?? '', phone: supplier?.phone ?? '', email: supplier?.email ?? '', address: supplier?.address ?? '', taxNumber: supplier?.tax_number ?? '', paymentTermsDays: supplier?.payment_terms_days ?? 30, notes: supplier?.notes ?? '',
        payoutMethod: supplier?.payout_method ?? '', payoutBankCode: supplier?.payout_bank_code ?? '', payoutAccount: supplier?.payout_account ?? '', payoutAccountName: supplier?.payout_account_name ?? '' });
    const [banks, setBanks] = useState<{ id: string; name: string }[]>([]);
    useEffect(() => { lencoService.getBanks().then((b: any) => setBanks(b)).catch(() => undefined); }, []);
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));
    const save = async () => {
        setBusy(true); setErr(null);
        try { await apiJson(supplier?.id ? `/purchasing/suppliers/${supplier.id}` : '/purchasing/suppliers', { method: supplier?.id ? 'PUT' : 'POST', body: JSON.stringify(f) }); onSaved(); onClose(); }
        catch (e: any) { setErr(e?.message || 'Could not save.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open title={supplier?.id ? 'Edit supplier' : 'New supplier'} onClose={onClose}>
            <ErrorNote text={err} />
            <div className="space-y-3">
                <div><label className={labelClass}>Name</label><input className={fieldClass} value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>Contact person</label><input className={fieldClass} value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} /></div>
                    <div><label className={labelClass}>Phone</label><input className={fieldClass} value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
                </div>
                <div><label className={labelClass}>Email</label><input className={fieldClass} value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
                <div><label className={labelClass}>Address</label><input className={fieldClass} value={f.address} onChange={(e) => set('address', e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>TPIN</label><input className={fieldClass} value={f.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} /></div>
                    <div><label className={labelClass}>Pay within (days)</label><input type="number" min={0} className={fieldClass} value={f.paymentTermsDays} onChange={(e) => set('paymentTermsDays', e.target.value)} /></div>
                </div>
                <div><label className={labelClass}>Notes</label><textarea className={`${fieldClass} h-20 py-3`} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></div>
                <div className="rounded-xl border border-[#E0E0E0] bg-white p-3">
                    <label className={labelClass}>How to pay this supplier (optional)</label>
                    <select className={fieldClass} value={f.payoutMethod} onChange={(e) => { set('payoutMethod', e.target.value); set('payoutBankCode', ''); }}>
                        <option value="">Not saved, I record payments myself</option><option value="BANK">Bank account</option><option value="MOBILE_MONEY">Mobile money</option>
                    </select>
                    {f.payoutMethod === 'BANK' && (
                        <div className="mt-3 space-y-3">
                            {banks.length > 0
                                ? <BankSelect banks={banks as any} value={f.payoutBankCode} onChange={(v) => set('payoutBankCode', v)} className={fieldClass} placeholder="Select bank" />
                                : <input className={fieldClass} placeholder="Bank code" value={f.payoutBankCode} onChange={(e) => set('payoutBankCode', e.target.value)} />}
                            <input className={fieldClass} placeholder="Account number" value={f.payoutAccount} onChange={(e) => set('payoutAccount', e.target.value)} />
                            <input className={fieldClass} placeholder="Account name" value={f.payoutAccountName} onChange={(e) => set('payoutAccountName', e.target.value)} />
                        </div>
                    )}
                    {f.payoutMethod === 'MOBILE_MONEY' && (
                        <div className="mt-3 space-y-3">
                            <select className={fieldClass} value={f.payoutBankCode} onChange={(e) => set('payoutBankCode', e.target.value)}><option value="">Network…</option><option value="airtel">Airtel</option><option value="mtn">MTN</option><option value="zamtel">Zamtel</option></select>
                            <input className={fieldClass} placeholder="Phone number" value={f.payoutAccount} onChange={(e) => set('payoutAccount', e.target.value)} />
                            <input className={fieldClass} placeholder="Name on the account" value={f.payoutAccountName} onChange={(e) => set('payoutAccountName', e.target.value)} />
                        </div>
                    )}
                </div>
                <PrimaryButton busy={busy} onClick={save} disabled={!f.name.trim()} className="w-full">Save supplier</PrimaryButton>
            </div>
        </Dialog>
    );
}

interface LineForm { kind: 'product' | 'expense'; productId: string; variantId: string; taxCode: string; accountId: string; description: string; quantity: string; unitCost: string }
const emptyLine = (): LineForm => ({ kind: 'product', productId: '', variantId: '', taxCode: 'STANDARD', accountId: '', description: '', quantity: '1', unitCost: '' });

function BillForm({ suppliers, supplierId, onClose, onSaved }: { suppliers: Supplier[]; supplierId?: string; onClose: () => void; onSaved: () => void }) {
    const products = useQuery<any[]>({ queryKey: ['purchasing', 'products'], queryFn: () => apiJson<any[]>('/organizations/products'), retry: false });
    const accounts = useData<{ accounts: Acct[] }>('accounts', '/accounting/accounts');
    const vatSet = useData<{ registered: boolean; rate: number }>('vat', '/accounting/vat/settings');
    const [inclVat, setInclVat] = useState(false);
    const [sid, setSid] = useState(supplierId ?? ''); const [number, setNumber] = useState(''); const [billDate, setBillDate] = useState(today()); const [dueDate, setDueDate] = useState(''); const [notes, setNotes] = useState('');
    const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const stockProducts = (products.data ?? []).filter((p) => p.track_stock);
    const expenses = (accounts.data?.accounts ?? []).filter((a) => a.type === 'EXPENSE');
    const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
    const setLine = (i: number, patch: Partial<LineForm>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
    const save = async () => {
        setBusy(true); setErr(null);
        try {
            await apiJson('/purchasing/bills', { method: 'POST', body: JSON.stringify({
                supplierId: sid, billNumber: number, billDate, dueDate: dueDate || undefined, notes, pricesIncludeVat: inclVat,
                lines: lines.map((l) => ({ productId: l.kind === 'product' ? l.productId : undefined, variantId: l.kind === 'product' && l.variantId ? l.variantId : undefined, taxCode: l.taxCode, accountId: l.kind === 'expense' ? l.accountId : undefined, description: l.description, quantity: Number(l.quantity), unitCost: Number(l.unitCost) })),
            }) });
            onSaved(); onClose();
        } catch (e: any) { setErr(e?.message || 'Could not save the bill.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open size="lg" title="New purchase bill" onClose={onClose}>
            <ErrorNote text={err} />
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>Supplier</label>
                        <select className={fieldClass} value={sid} onChange={(e) => setSid(e.target.value)}><option value="">Choose…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                    <div><label className={labelClass}>Their bill number</label><input className={fieldClass} value={number} onChange={(e) => setNumber(e.target.value)} /></div>
                    <div><label className={labelClass}>Bill date</label><input type="date" className={fieldClass} value={billDate} onChange={(e) => setBillDate(e.target.value)} /></div>
                    <div><label className={labelClass}>Due date</label><input type="date" className={fieldClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
                </div>
                <label className={labelClass}>What was bought</label>
                {lines.map((l, i) => (
                    <div key={i} className="space-y-2 rounded-xl border border-[#E0E0E0] bg-white p-3">
                        <div className="flex gap-2">
                            <select className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value as any })}><option value="product">Stock item</option><option value="expense">Expense</option></select>
                            {l.kind === 'product'
                                ? <select className="h-9 flex-1 rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value, variantId: '' })}><option value="">Choose a product…</option>{stockProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                                : <select className="h-9 flex-1 rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })}><option value="">Expense account…</option>{expenses.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ''}{a.name}</option>)}</select>}
                            {lines.length > 1 && <button type="button" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} className="text-[#B31412]"><Trash2 size={15} /></button>}
                        </div>
                        {l.kind === 'product' && (stockProducts.find((p) => p.id === l.productId)?.variants ?? []).length > 0 && (
                            <select className="h-9 w-full rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.variantId} onChange={(e) => setLine(i, { variantId: e.target.value })}>
                                <option value="">Which option arrived…</option>{(stockProducts.find((p) => p.id === l.productId)?.variants ?? []).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                        )}
                        {l.kind === 'expense' && <input className="h-9 w-full rounded-lg border border-[#C4C7C5] px-2 text-xs" placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />}
                        {vatSet.data?.registered && (
                            <select className="h-9 w-full rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.taxCode} onChange={(e) => setLine(i, { taxCode: e.target.value })}>
                                <option value="STANDARD">VAT: standard rate ({vatSet.data.rate}%)</option><option value="ZERO">VAT: zero-rated</option><option value="EXEMPT">VAT: exempt</option>
                            </select>
                        )}
                        <div className="grid grid-cols-3 gap-2">
                            <input type="number" min={1} className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                            <input type="number" min={0} step="0.01" className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" placeholder="Unit cost" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} />
                            <div className="flex h-9 items-center justify-end text-xs font-semibold tabular-nums">{money((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}</div>
                        </div>
                    </div>
                ))}
                <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="text-xs font-semibold text-[#0059D8]"><Plus size={12} className="mr-1 inline" />Add a line</button>
                {stockProducts.length === 0 && !products.isLoading && <p className="text-[11px] text-[#B06000]">No products track stock yet. Turn on stock tracking on a product to receive it here.</p>}
                {vatSet.data?.registered && <label className="flex items-center gap-2 text-sm text-[#3C4043]"><input type="checkbox" checked={inclVat} onChange={(e) => setInclVat(e.target.checked)} />Prices typed above already include VAT</label>}
                <div><label className={labelClass}>Notes</label><input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                <div className="flex items-center justify-between pt-1"><span className="text-sm text-[#5F6368]">{vatSet.data?.registered ? (inclVat ? 'Total (VAT included)' : 'Subtotal (VAT added on top)') : 'Total'}</span><span className="text-lg font-bold tabular-nums">{money(total)}</span></div>
                <p className="text-[11px] text-[#5F6368]">Stock items go into inventory and raise the stock count. Everything is posted to your books, owed to the supplier until you pay it.</p>
                <PrimaryButton busy={busy} onClick={save} disabled={!sid || total <= 0} className="w-full">Save bill</PrimaryButton>
            </div>
        </Dialog>
    );
}

function PayForm({ bill, onClose, onSaved }: { bill: Bill; onClose: () => void; onSaved: () => void }) {
    const accounts = useData<{ accounts: Acct[] }>('accounts', '/accounting/accounts');
    const open = Number(bill.total) - Number(bill.amount_paid);
    const [amount, setAmount] = useState(String(open.toFixed(2))); const [paidOn, setPaidOn] = useState(today()); const [method, setMethod] = useState('Bank transfer'); const [reference, setReference] = useState(''); const [accountId, setAccountId] = useState('');
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const from = (accounts.data?.accounts ?? []).filter((a) => a.type === 'ASSET' && /bank|wallet|cash/i.test(`${a.subtype ?? ''} ${a.name}`));
    const save = async () => {
        setBusy(true); setErr(null);
        try { await apiJson(`/purchasing/bills/${bill.id}/pay`, { method: 'POST', body: JSON.stringify({ amount: Number(amount), paidOn, method, reference, accountId }) }); onSaved(); onClose(); }
        catch (e: any) { setErr(e?.message || 'Could not record the payment.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open title="Record a payment" onClose={onClose}>
            <ErrorNote text={err} />
            <p className="mb-3 text-sm text-[#5F6368]">{bill.suppliers?.name} · {bill.bill_number ? `bill ${bill.bill_number}` : 'bill'} · {money(open)} still owed</p>
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>Amount</label><input type="number" step="0.01" className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                    <div><label className={labelClass}>Paid on</label><input type="date" className={fieldClass} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></div>
                </div>
                <div><label className={labelClass}>Paid from</label>
                    <select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">Choose an account…</option>{from.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ''}{a.name}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>Method</label><input className={fieldClass} value={method} onChange={(e) => setMethod(e.target.value)} /></div>
                    <div><label className={labelClass}>Reference</label><input className={fieldClass} value={reference} onChange={(e) => setReference(e.target.value)} /></div>
                </div>
                <p className="text-[11px] text-[#5F6368]">This records a payment you made. It doesn’t send money from your wallet.</p>
                <PrimaryButton busy={busy} onClick={save} disabled={!accountId || !(Number(amount) > 0)} className="w-full">Record payment</PrimaryButton>
            </div>
        </Dialog>
    );
}

const Row: React.FC<{ onClick?: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
    <div onClick={onClick} className={`flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-3 text-sm text-gray-900 ${onClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}>{children}</div>
);

export const SuppliersPanel: React.FC = () => {
    const access = useAccountingAccess();
    const qc = useQueryClient();
    const [view, setView] = useState<'suppliers' | 'orders' | 'bills' | 'owed' | 'credits'>('suppliers');
    const [form, setForm] = useState<Partial<Supplier> | null | false>(false);
    const [billFor, setBillFor] = useState<string | null | false>(false);
    const [paying, setPaying] = useState<Bill | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const enabled = !!access.data?.enabled;
    const sup = useData<{ suppliers: Supplier[] }>('suppliers', '/purchasing/suppliers', enabled);
    const bills = useData<{ bills: Bill[] }>('bills', '/purchasing/bills', enabled && view === 'bills');
    const ageing = useData<{ rows: any[]; totals: Record<string, number> }>('ageing', '/purchasing/reports/payables-ageing', enabled && view === 'owed');
    const detail = useQuery<{ supplier: Supplier; bills: Bill[] }>({ queryKey: ['purchasing', 'detail', openId], queryFn: () => apiJson(`/purchasing/suppliers/${openId}`), enabled: !!openId, retry: false });
    const refresh = () => qc.invalidateQueries({ queryKey: ['purchasing'] });

    if (access.isLoading) return <p className="p-4 text-sm text-gray-500">Loading…</p>;
    if (!enabled) return <Upgrade />;

    const voidBill = async (b: Bill) => {
        if (!window.confirm('Cancel this bill? Stock it added will be taken back out.')) return;
        try { await apiJson(`/purchasing/bills/${b.id}/void`, { method: 'POST' }); refresh(); } catch (e: any) { setErr(e?.message || 'Could not cancel the bill.'); }
    };
    const walletPay = async (b: Bill) => {
        if (!window.confirm(`Ask to pay ${money(Number(b.total) - Number(b.amount_paid))} to ${b.suppliers?.name ?? 'the supplier'} from your wallet? It goes to your Inbox for approval like any payment request.`)) return;
        try { await apiJson(`/purchasing/bills/${b.id}/wallet-pay`, { method: 'POST', body: '{}' }); setNotice('Payment request sent. Approve and pay it from your Inbox; the bill is marked paid when it goes out.'); refresh(); }
        catch (e: any) { setErr(e?.message || 'Could not request the payment.'); }
    };
    const suppliers = sup.data?.suppliers ?? [];
    const BillRow = (b: Bill) => (
        <Row key={b.id}>
            <div className="min-w-0"><div className="truncate font-medium">{b.suppliers?.name ?? ''} {b.bill_number ? `· ${b.bill_number}` : ''}</div><div className="text-[11px] text-gray-500">{b.bill_date} · due {b.due_date}</div></div>
            <div className="flex items-center gap-3"><Pill status={b.status} /><span className="w-24 text-right tabular-nums">{money(Number(b.total))}</span>
                {(b.status === 'OPEN' || b.status === 'PARTIAL') && (b.requisition_id
                    ? <span className="text-[11px] font-medium text-[#B06000]">Payment awaiting approval</span>
                    : <><button onClick={() => walletPay(b)} className="text-xs font-semibold text-[#0059D8]">Pay from wallet</button><button onClick={() => { setOpenId(null); setPaying(b); }} className="text-xs font-semibold text-[#5F6368]">Record payment</button></>)}
                {(b.status === 'OPEN') && <button onClick={() => voidBill(b)} className="text-xs font-semibold text-[#B31412]">Cancel</button>}</div>
        </Row>
    );

    return (
        <div className="flex flex-col gap-3 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex h-8 items-center gap-1 rounded-[10px] bg-slate-100 p-1 md:bg-[#F8FAFD]">
                    {([['suppliers', 'Suppliers'], ['orders', 'Purchase orders'], ['bills', 'Bills'], ['owed', 'What we owe'], ['credits', 'Credit notes']] as const).map(([id, label]) => (
                        <button key={id} onClick={() => setView(id)} className={`h-full rounded-lg px-4 text-[11px] font-['DM_Sans'] ${view === id ? 'bg-white font-bold text-gray-900 shadow-[0px_2px_4px_0px_rgba(0,0,0,0.10)]' : 'text-gray-900 hover:bg-white/50'}`}>{label}</button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setBillFor(null)} className="h-8 rounded-[10px] bg-[#CFE4FF] px-4 font-['DM_Sans'] text-[11px] font-bold text-[#0059D8] transition-colors hover:bg-[#BBD7FF]">New bill</button>
                    <button onClick={() => setForm({})} className="h-8 rounded-[10px] bg-[#0B57D0] px-4 font-['DM_Sans'] text-[11px] font-bold text-white transition-colors hover:bg-[#0842A0]">Add supplier</button>
                </div>
            </div>
            <ErrorNote text={err ?? (sup.error as any)?.message} />
            {notice && <p className="rounded-xl bg-[#E6F4EA] px-4 py-3 text-sm text-[#137333]">{notice}</p>}

            {view === 'suppliers' && (
                <div className="overflow-hidden rounded-xl outline outline-1 outline-offset-[-1px] outline-violet-100">
                    {sup.isLoading && <p className="p-5 text-sm text-gray-500">Loading…</p>}
                    {!sup.isLoading && suppliers.length === 0 && <p className="p-5 text-sm text-gray-500">No suppliers yet. Add the first one to start recording what you buy.</p>}
                    {suppliers.map((s) => (
                        <Row key={s.id} onClick={() => setOpenId(s.id)}>
                            <div className="min-w-0"><div className="truncate font-medium">{s.name}</div><div className="text-[11px] text-gray-500">{[s.contact_person, s.phone].filter(Boolean).join(' · ') || 'No contact details'}</div></div>
                            <div className="text-right"><div className="tabular-nums">{s.owed > 0 ? money(s.owed) : 'Nothing owed'}</div>{s.overdue > 0 && <div className="text-[11px] text-[#B31412]">{money(s.overdue)} overdue</div>}</div>
                        </Row>
                    ))}
                </div>
            )}
            {view === 'orders' && <PurchaseOrders />}
            {view === 'credits' && <CreditNotes direction="SUPPLIER" />}
            {view === 'bills' && (
                <div className="overflow-hidden rounded-xl outline outline-1 outline-offset-[-1px] outline-violet-100">
                    {bills.isLoading && <p className="p-5 text-sm text-gray-500">Loading…</p>}
                    {!bills.isLoading && (bills.data?.bills ?? []).length === 0 && <p className="p-5 text-sm text-gray-500">No bills yet.</p>}
                    {(bills.data?.bills ?? []).map(BillRow)}
                </div>
            )}
            {view === 'owed' && (
                <div className="flex flex-col gap-3">
                <button onClick={() => downloadPdf('/accounting/pdf?report=ap')} className="h-8 w-fit rounded-[10px] bg-[#CFE4FF] px-4 font-['DM_Sans'] text-[11px] font-bold text-[#0059D8] hover:bg-[#BBD7FF]">Download PDF</button>
                <div className="overflow-hidden rounded-xl outline outline-1 outline-offset-[-1px] outline-violet-100">
                    <div className="grid grid-cols-[1fr_repeat(6,5.5rem)] gap-2 border-b border-violet-100 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500"><span>Supplier</span><span className="text-right">Current</span><span className="text-right">1-30</span><span className="text-right">31-60</span><span className="text-right">61-90</span><span className="text-right">90+</span><span className="text-right">Total</span></div>
                    {(ageing.data?.rows ?? []).length === 0 && !ageing.isLoading && <p className="p-5 text-sm text-gray-500">Nothing is owed to suppliers.</p>}
                    {(ageing.data?.rows ?? []).map((r) => (
                        <div key={r.supplierId} className="grid grid-cols-[1fr_repeat(6,5.5rem)] gap-2 border-b border-gray-100 px-5 py-3 text-sm tabular-nums"><span className="truncate font-sans">{r.supplier}</span>{(['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total'] as const).map((k) => <span key={k} className={`text-right ${k === 'total' ? 'font-bold' : ''} ${k === 'd90_plus' && r[k] > 0 ? 'text-[#B31412]' : ''}`}>{r[k] ? money(r[k]) : ''}</span>)}</div>
                    ))}
                    {ageing.data && ageing.data.rows.length > 0 && <div className="grid grid-cols-[1fr_repeat(6,5.5rem)] gap-2 bg-gray-50 px-5 py-3 text-sm font-bold tabular-nums"><span>Total</span>{(['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total'] as const).map((k) => <span key={k} className="text-right">{money(ageing.data!.totals[k] ?? 0)}</span>)}</div>}
                </div>
                </div>
            )}

            {form !== false && <SupplierForm supplier={form} onClose={() => setForm(false)} onSaved={refresh} />}
            {billFor !== false && <BillForm suppliers={suppliers} supplierId={billFor ?? undefined} onClose={() => setBillFor(false)} onSaved={refresh} />}
            {paying && <PayForm bill={paying} onClose={() => setPaying(null)} onSaved={refresh} />}
            {openId && (
                <Dialog open size="lg" title={detail.data?.supplier.name ?? 'Supplier'} onClose={() => setOpenId(null)}>
                    {detail.data && (<>
                        <p className="mb-3 text-sm text-[#5F6368]">{[detail.data.supplier.contact_person, detail.data.supplier.phone, detail.data.supplier.email].filter(Boolean).join(' · ') || 'No contact details'}{detail.data.supplier.tax_number ? ` · TPIN ${detail.data.supplier.tax_number}` : ''} · pays within {detail.data.supplier.payment_terms_days} days</p>
                        <div className="mb-3 flex gap-2"><TonalButton onClick={() => { setForm(detail.data!.supplier); setOpenId(null); }}>Edit</TonalButton><PrimaryButton onClick={() => { setBillFor(openId); setOpenId(null); }}>New bill</PrimaryButton></div>
                        <div className="overflow-hidden rounded-xl bg-white">{detail.data.bills.length === 0 ? <p className="p-4 text-sm text-gray-500">No bills from this supplier yet.</p> : detail.data.bills.map((b) => BillRow({ ...b, suppliers: { name: detail.data!.supplier.name } }))}</div>
                    </>)}
                </Dialog>
            )}
        </div>
    );
};
