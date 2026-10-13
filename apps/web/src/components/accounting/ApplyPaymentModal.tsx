import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, User, Receipt, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { invoiceService, CustomerInvoice, EntryAllocation } from '../../services/invoice.service';
import { cashbookService } from '../../services/cashbook.service';
import type { Account } from '../../services/account.service';
import { formatInvoiceDate } from '../CreditInvoiceInbox';

/** A customer-receivable ASSET account (not the school-fees Master Fees pool, which has its own flow). */
export const isReceivableAccount = (a?: Pick<Account, 'type' | 'subtype' | 'name' | 'code'> | null): boolean =>
    !!a && a.type === 'ASSET' && a.code !== 'QB-MF-AR' && (/receivable/i.test(a.subtype || '') || /receivable/i.test(a.name || ''));

const money = (n: number) => `K${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

interface EntryLike {
    id: string;
    debit?: number | string | null;
    description?: string | null;
    reference_number?: string | null;
    sender_name?: string | null;
    date?: string;
}

interface ApplyPaymentModalProps {
    isOpen: boolean;
    entry: EntryLike | null;
    /** The receivable account the user picked for this inflow. */
    receivableAccountId: string | null;
    onClose: () => void;
    /** Called after the payment was applied (or classified without invoices) so the ledger can reload. */
    onDone: () => void;
}

interface Row {
    invoice: CustomerInvoice;
    /** What this payment could settle on the invoice: its balance plus whatever THIS entry already applied. */
    available: number;
}

/**
 * "Classify as Accounts Receivable" → pick the customer and the invoice(s) a received payment settles.
 * Re-opening it on an already-applied payment edits the split.
 */
export const ApplyPaymentModal: React.FC<ApplyPaymentModalProps> = ({ isOpen, entry, receivableAccountId, onClose, onDone }) => {
    const queryClient = useQueryClient();
    const received = Number(entry?.debit || 0);

    const { data: open = [], isLoading: loadingOpen } = useQuery<CustomerInvoice[]>({
        queryKey: ['open-invoices'],
        queryFn: () => invoiceService.listOpen(),
        enabled: isOpen,
        staleTime: 0,
    });
    const { data: existing = [], isLoading: loadingExisting } = useQuery<EntryAllocation[]>({
        queryKey: ['entry-allocations', entry?.id],
        queryFn: () => invoiceService.getEntryAllocations(entry!.id),
        enabled: isOpen && !!entry?.id,
        staleTime: 0,
    });

    const [customerKey, setCustomerKey] = useState('');
    const [amounts, setAmounts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Every invoice this payment could be applied to, including ones it already (fully) settled.
    const rows: Row[] = useMemo(() => {
        const mine = new Map(existing.map(a => [a.invoice_id, Number(a.amount)]));
        const list: Row[] = open.map(inv => ({ invoice: inv, available: r2(inv.balance + (mine.get(inv.id) || 0)) }));
        for (const a of existing) {
            if (list.some(r => r.invoice.id === a.invoice_id) || !a.customer_invoices) continue;
            const ci = a.customer_invoices;
            list.push({
                invoice: { id: a.invoice_id, invoice_number: ci.invoice_number, customer_id: ci.customer_id, customer_name: ci.customer_name, total: ci.total, amount_paid: ci.amount_paid, status: ci.status, balance: 0, follow_up_date: '', issue_date: '', is_overdue: false } as CustomerInvoice,
                available: r2(Number(ci.total) - (Number(ci.amount_paid) - Number(a.amount))),
            });
        }
        return list;
    }, [open, existing]);

    const keyOf = (inv: CustomerInvoice) => inv.customer_id || `name:${inv.customer_name.trim().toLowerCase()}`;
    const customers = useMemo(() => {
        const map = new Map<string, { key: string; name: string; owed: number; count: number }>();
        for (const r of rows) {
            const k = keyOf(r.invoice);
            const c = map.get(k) || { key: k, name: r.invoice.customer_name, owed: 0, count: 0 };
            c.owed += r.available; c.count += 1;
            map.set(k, c);
        }
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    }, [rows]);

    const customerRows = rows
        .filter(r => keyOf(r.invoice) === customerKey)
        .sort((a, b) => (a.invoice.issue_date || '').localeCompare(b.invoice.issue_date || '') || a.invoice.invoice_number.localeCompare(b.invoice.invoice_number));

    // Oldest-first suggestion for a customer's invoices, capped at what was received.
    const suggest = (list: Row[]) => {
        let left = received;
        const next: Record<string, string> = {};
        for (const r of list) {
            if (left <= 0.004) break;
            const amt = r2(Math.min(left, r.available));
            if (amt > 0) { next[r.invoice.id] = amt.toFixed(2); left = r2(left - amt); }
        }
        return next;
    };

    // Initialise when the data lands: restore an earlier split, else pre-pick the customer whose name matches the payer.
    useEffect(() => {
        if (!isOpen || loadingOpen || loadingExisting) return;
        setError(null);
        if (existing.length > 0) {
            const first = existing[0].customer_invoices;
            setCustomerKey(first?.customer_id || `name:${(first?.customer_name || '').trim().toLowerCase()}`);
            setAmounts(Object.fromEntries(existing.map(a => [a.invoice_id, Number(a.amount).toFixed(2)])));
            return;
        }
        const payer = `${entry?.sender_name || ''} ${entry?.description || ''}`.toLowerCase();
        const match = customers.find(c => c.name && payer.includes(c.name.trim().toLowerCase())) || (customers.length === 1 ? customers[0] : null);
        if (match) {
            setCustomerKey(match.key);
            setAmounts(suggest(rows.filter(r => keyOf(r.invoice) === match.key).sort((a, b) => (a.invoice.issue_date || '').localeCompare(b.invoice.issue_date || ''))));
        } else {
            setCustomerKey('');
            setAmounts({});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, loadingOpen, loadingExisting, entry?.id, existing.length, open.length]);

    if (!isOpen || !entry) return null;

    const applied = r2(customerRows.reduce((s, r) => s + (Number(amounts[r.invoice.id]) || 0), 0));
    const unapplied = r2(received - applied);
    const overApplied = unapplied < -0.004;
    const rowTooMuch = customerRows.find(r => (Number(amounts[r.invoice.id]) || 0) > r.available + 0.004);

    const pickCustomer = (key: string) => {
        setCustomerKey(key);
        setError(null);
        setAmounts(suggest(rows.filter(r => keyOf(r.invoice) === key).sort((a, b) => (a.invoice.issue_date || '').localeCompare(b.invoice.issue_date || ''))));
    };

    const toggleRow = (r: Row, on: boolean) => {
        setAmounts(prev => {
            const next = { ...prev };
            if (!on) { delete next[r.invoice.id]; return next; }
            const used = customerRows.reduce((s, x) => s + (x.invoice.id === r.invoice.id ? 0 : Number(next[x.invoice.id]) || 0), 0);
            const room = Math.max(0, r2(received - used));
            next[r.invoice.id] = Math.min(room > 0 ? room : r.available, r.available).toFixed(2);
            return next;
        });
    };

    const apply = async () => {
        setError(null);
        const allocations = customerRows
            .map(r => ({ invoice_id: r.invoice.id, amount: Number(amounts[r.invoice.id]) || 0 }))
            .filter(a => a.amount > 0);
        if (allocations.length === 0) return setError('Choose at least one invoice and an amount to apply.');
        if (overApplied) return setError(`You are applying ${money(applied)} but only ${money(received)} was received.`);
        if (rowTooMuch) return setError(`${rowTooMuch.invoice.invoice_number} only has ${money(rowTooMuch.available)} outstanding.`);
        setSaving(true);
        try {
            await invoiceService.allocate(entry.id, allocations);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['credit-invoices'] }),
                queryClient.invalidateQueries({ queryKey: ['open-invoices'] }),
                queryClient.invalidateQueries({ queryKey: ['entry-allocations', entry.id] }),
                queryClient.invalidateQueries({ queryKey: ['crm'] }),
            ]);
            onDone();
            onClose();
        } catch (e: any) {
            setError(e?.message || 'Could not apply the payment.');
        } finally {
            setSaving(false);
        }
    };

    // "Skip": still classify the inflow as receivable (e.g. an old balance, or an invoice from another system).
    const classifyOnly = async () => {
        if (!receivableAccountId) return;
        setSaving(true); setError(null);
        try {
            await cashbookService.updateAccount(entry.id, receivableAccountId);
            onDone();
            onClose();
        } catch (e: any) {
            setError(e?.message || 'Could not classify the payment.');
        } finally {
            setSaving(false);
        }
    };

    const loading = loadingOpen || loadingExisting;

    return (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
                    <div className="h-10 w-10 rounded-xl bg-[#F0F7FF] text-[#0058DB] flex items-center justify-center"><Receipt size={20} /></div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-[#111827]">Apply payment to invoice</h3>
                        <p className="text-xs text-gray-400 font-medium truncate">{entry.reference_number ? `${entry.reference_number} · ` : ''}{money(received)} received</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:bg-gray-100" aria-label="Close"><X size={18} /></button>
                </div>

                <div className="overflow-y-auto px-6 py-5 space-y-5">
                    {loading ? (
                        <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-gray-300" size={26} /></div>
                    ) : customers.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-sm font-bold text-[#111827]">No customers owe you anything yet</p>
                            <p className="text-xs text-gray-400 font-medium mt-1.5 max-w-xs mx-auto leading-relaxed">Record a credit sale from Inbox → Inflows → New Sale → Credit Sale, then apply payments to it here.</p>
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Customer</label>
                                <div className="relative">
                                    <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    <select
                                        value={customerKey}
                                        onChange={e => pickCustomer(e.target.value)}
                                        className="w-full pl-9 pr-9 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-[#111827] outline-none focus:border-[#0058DB] appearance-none"
                                    >
                                        <option value="">Select customer…</option>
                                        {customers.map(c => <option key={c.key} value={c.key}>{c.name} — owes {money(c.owed)} ({c.count} invoice{c.count === 1 ? '' : 's'})</option>)}
                                    </select>
                                    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                </div>
                            </div>

                            {customerKey && (
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Invoices</label>
                                        <button type="button" onClick={() => setAmounts(suggest(customerRows))} className="text-[11px] font-bold text-[#0058DB]">Auto-apply oldest first</button>
                                    </div>
                                    <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100">
                                        {customerRows.map(r => {
                                            const checked = amounts[r.invoice.id] !== undefined;
                                            return (
                                                <div key={r.invoice.id} className={`px-4 py-3 flex items-center gap-3 ${checked ? 'bg-[#F7FAFF]' : ''}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={e => toggleRow(r, e.target.checked)}
                                                        className="w-4 h-4 rounded border-gray-300 accent-[#0058DB] cursor-pointer"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold text-[#111827]">{r.invoice.invoice_number}</p>
                                                        <p className="text-[11px] text-gray-400 font-medium">
                                                            {r.invoice.issue_date ? `Issued ${formatInvoiceDate(r.invoice.issue_date)} · ` : ''}
                                                            <span className={r.invoice.is_overdue ? 'text-red-500 font-bold' : ''}>{r.invoice.follow_up_date ? `${r.invoice.is_overdue ? 'overdue since' : 'due'} ${formatInvoiceDate(r.invoice.follow_up_date)}` : ''}</span>
                                                        </p>
                                                        <p className="text-[11px] text-gray-500 font-semibold">Outstanding {money(r.available)}</p>
                                                    </div>
                                                    <div className="relative w-28 flex-shrink-0">
                                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">K</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            disabled={!checked}
                                                            value={amounts[r.invoice.id] ?? ''}
                                                            onChange={e => setAmounts(prev => ({ ...prev, [r.invoice.id]: e.target.value }))}
                                                            className="w-full pl-6 pr-2 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-right outline-none focus:border-[#0058DB] disabled:bg-gray-50 disabled:text-gray-300"
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-3 rounded-2xl bg-gray-50 px-4 py-3 space-y-1.5 text-xs">
                                        <div className="flex justify-between font-semibold text-gray-500"><span>Payment received</span><span>{money(received)}</span></div>
                                        <div className="flex justify-between font-semibold text-gray-500"><span>Applied to invoices</span><span>{money(applied)}</span></div>
                                        <div className={`flex justify-between font-bold pt-1.5 border-t border-gray-200 ${overApplied ? 'text-red-600' : unapplied > 0.004 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                            <span>{overApplied ? 'Over-applied' : unapplied > 0.004 ? 'Not applied' : 'Fully applied'}</span>
                                            <span className="flex items-center gap-1">{unapplied <= 0.004 && !overApplied && <CheckCircle2 size={13} />}{money(Math.abs(unapplied))}</span>
                                        </div>
                                    </div>
                                    {unapplied > 0.004 && (
                                        <p className="mt-2 text-[11px] text-amber-600 font-medium flex gap-1.5 leading-relaxed"><AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> The unapplied {money(unapplied)} stays on Accounts Receivable as credit for this customer.</p>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                    {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
                </div>

                <div className="px-6 py-4 border-t border-gray-100 space-y-2.5">
                    <button
                        onClick={apply}
                        disabled={saving || loading || !customerKey}
                        className="w-full py-3.5 rounded-xl bg-[#0058DB] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Apply payment
                    </button>
                    {receivableAccountId && (
                        <button onClick={classifyOnly} disabled={saving} className="w-full py-2 text-xs font-bold text-gray-400 hover:text-gray-600 disabled:opacity-40">
                            Classify as Accounts Receivable without choosing an invoice
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

/**
 * Shown under the account selector of an inflow that is classified as Accounts Receivable:
 * which invoices the payment settled, with a way to change it.
 */
export const ReceivableAllocationPanel: React.FC<{ entry: EntryLike; onEdit: () => void }> = ({ entry, onEdit }) => {
    const { data: allocs = [], isLoading } = useQuery<EntryAllocation[]>({
        queryKey: ['entry-allocations', entry.id],
        queryFn: () => invoiceService.getEntryAllocations(entry.id),
        staleTime: 15_000,
    });
    if (isLoading) return null;
    const applied = allocs.reduce((s, a) => s + Number(a.amount), 0);
    const received = Number(entry.debit || 0);
    return (
        <div className="mt-2.5 rounded-xl bg-[#F7FAFF] border border-[#0058DB]/15 p-3">
            <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#0058DB]">Applied to invoices</p>
                <button type="button" onClick={onEdit} className="text-[11px] font-bold text-[#0058DB] hover:underline">{allocs.length ? 'Change' : 'Apply to invoice'}</button>
            </div>
            {allocs.length === 0 ? (
                <p className="text-[11px] text-gray-500 font-medium leading-relaxed">Not tied to a customer invoice yet — it sits on Accounts Receivable as unapplied credit.</p>
            ) : (
                <div className="space-y-1">
                    {allocs.map(a => (
                        <div key={a.id} className="flex justify-between text-[11px] font-semibold text-gray-600">
                            <span className="truncate pr-2">{a.customer_invoices?.invoice_number} · {a.customer_invoices?.customer_name}</span>
                            <span className="flex-shrink-0 text-emerald-600">{money(Number(a.amount))}</span>
                        </div>
                    ))}
                    {received - applied > 0.004 && <div className="flex justify-between text-[11px] font-semibold text-amber-600 pt-1 border-t border-[#0058DB]/10"><span>Unapplied credit</span><span>{money(received - applied)}</span></div>}
                </div>
            )}
        </div>
    );
};

export default ApplyPaymentModal;
