import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { accountService, Account } from '../../services/account.service';
import { journalService, JournalEntry } from '../../services/journal.service';
import { useAuth } from '../../context/AuthContext';

/** Wallet / cash accounts mirror real money and are only movable through the Cashbook — the API refuses them, so don't offer them. */
export const isWalletBackedAccount = (a: Pick<Account, 'code'>) =>
    !!a.code && (a.code === 'QB-1150040000' || a.code === 'CASH-ON-HAND' || a.code.startsWith('WAL-') || a.code.startsWith('QB-MF-'));

const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
const TYPE_LABEL: Record<string, string> = { ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Equity', INCOME: 'Income', EXPENSE: 'Expenses' };
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toCents = (v: string) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

interface Line { key: number; accountId: string; debit: string; credit: string; description: string }
let keySeq = 0;
const blank = (): Line => ({ key: ++keySeq, accountId: '', debit: '', credit: '', description: '' });

/** Searchable account dropdown (the chart can have 200+ accounts, so a plain <select> is unusable). */
const AccountPicker: React.FC<{ accounts: Account[]; value: string; onChange: (id: string) => void; invalid?: boolean }> = ({ accounts, value, onChange, invalid }) => {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const selected = accounts.find(a => a.id === value);

    // The list is rendered in a portal with fixed positioning: the modal and its table clip (overflow) anything that
    // overhangs them, which is what cut the dropdown off. It flips upward when there is more room above the field.
    const place = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (!r) return;
        const width = Math.max(r.width, 320);
        const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
        const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
        const down = below >= 260 || below >= above;
        setPos(down ? { left, width, top: r.bottom + 4, maxH: Math.min(360, below) } : { left, width, bottom: window.innerHeight - r.top + 4, maxH: Math.min(360, above) });
    };
    useEffect(() => {
        if (!open) return;
        place();
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!btnRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
        };
        const onScroll = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) place(); };
        document.addEventListener('mousedown', onDown);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', place);
        return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', place); };
    }, [open]);

    const groups = useMemo(() => {
        const needle = q.trim().toLowerCase();
        const hit = accounts.filter(a => !needle || a.name.toLowerCase().includes(needle) || (a.code || '').toLowerCase().includes(needle));
        return TYPE_ORDER.map(t => ({ t, items: hit.filter(a => a.type === t) })).filter(g => g.items.length);
    }, [accounts, q]);
    return (
        <>
            <button ref={btnRef} type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm rounded-lg border bg-white hover:border-[#006AFF] focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 ${invalid ? 'border-red-300' : 'border-[#E8EEF8]'}`}>
                <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>{selected ? selected.name : 'Select account'}</span>
                <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
            </button>
            {open && pos && createPortal(
                <div ref={listRef} style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
                    className="z-[70] bg-white border border-[#E8EEF8] rounded-xl shadow-xl flex flex-col font-['DM_Sans']">
                    <div className="p-2 border-b border-[#E8EEF8] flex-shrink-0">
                        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or code" className="w-full px-3 py-2 text-sm rounded-lg bg-[#F8FAFD] focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20" />
                    </div>
                    <div role="listbox" className="flex-1 overflow-y-auto py-1 min-h-0">
                        {groups.length === 0 && <p className="px-3 py-4 text-sm text-gray-400">No matching accounts</p>}
                        {groups.map(g => (
                            <div key={g.t}>
                                <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{TYPE_LABEL[g.t]}</p>
                                {g.items.map(a => (
                                    <button key={a.id} type="button" role="option" aria-selected={a.id === value} onClick={() => { onChange(a.id); setOpen(false); setQ(''); }}
                                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#F0F6FF] flex items-center justify-between gap-2 ${a.id === value ? 'bg-[#E6F0FF] text-[#0059D8]' : 'text-gray-800'}`}>
                                        <span className="truncate">{a.name}</span>
                                        {a.code && <span className="text-[11px] text-gray-400 flex-shrink-0">{a.code}</span>}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

interface Props { isOpen: boolean; onClose: () => void; onPosted?: (entry: JournalEntry) => void }

export const JournalEntryModal: React.FC<Props> = ({ isOpen, onClose, onPosted }) => {
    const { organizationId } = useAuth();
    const qc = useQueryClient();
    const [date, setDate] = useState(today());
    const [reference, setReference] = useState('');
    const [description, setDescription] = useState('');
    const [lines, setLines] = useState<Line[]>([blank(), blank()]);
    const [touched, setTouched] = useState(false);
    const [posted, setPosted] = useState<JournalEntry | null>(null);
    const [serverError, setServerError] = useState<string | null>(null);

    const { data: allAccounts = [], isLoading } = useQuery({ queryKey: ['accounts', organizationId], queryFn: () => accountService.getAll(), enabled: isOpen && !!organizationId, staleTime: 60_000 });
    const accounts = useMemo(() => allAccounts.filter(a => a.is_active !== false && !isWalletBackedAccount(a)), [allAccounts]);

    useEffect(() => {
        if (!isOpen) return;
        setDate(today()); setReference(''); setDescription(''); setLines([blank(), blank()]); setTouched(false); setPosted(null); setServerError(null);
    }, [isOpen]);

    const v = useMemo(() => {
        const dr = lines.reduce((s, l) => s + toCents(l.debit), 0), cr = lines.reduce((s, l) => s + toCents(l.credit), 0);
        const lineErrors = lines.map(l => {
            const d = Number(l.debit || 0), c = Number(l.credit || 0);
            if (!l.accountId) return 'Choose an account';
            if (d < 0 || c < 0) return 'Amounts must be positive';
            if (d > 0 && c > 0) return 'Enter a debit or a credit, not both';
            if (!(d > 0 || c > 0)) return 'Enter a debit or a credit';
            if (Math.abs(Math.round(d * 100) / 100 - d) > 1e-9 || Math.abs(Math.round(c * 100) / 100 - c) > 1e-9) return 'Max 2 decimals';
            return null;
        });
        const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date + 'T00:00:00').getTime());
        const diff = dr - cr;
        return {
            dr, cr, diff, lineErrors, dateOk,
            enoughLines: lines.length >= 2, descOk: description.trim().length > 0,
            balanced: dr === cr && dr > 0,
            valid: dateOk && description.trim().length > 0 && lines.length >= 2 && lineErrors.every(e => !e) && dr === cr && dr > 0,
        };
    }, [lines, date, description]);

    const setLine = (key: number, patch: Partial<Line>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
    // Typing in one side clears the other so a line can only ever be one-sided.
    const setDebit = (key: number, val: string) => setLine(key, { debit: val, ...(val ? { credit: '' } : {}) });
    const setCredit = (key: number, val: string) => setLine(key, { credit: val, ...(val ? { debit: '' } : {}) });
    // Offer the remaining difference on the other side of a fresh line.
    const balanceLine = (key: number) => {
        if (v.diff === 0) return;
        const line = lines.find(l => l.key === key);
        const own = toCents(line?.debit || '') - toCents(line?.credit || '');
        const target = v.diff - own; // difference excluding this line
        if (target > 0) setLine(key, { credit: (target / 100).toFixed(2), debit: '' });
        else if (target < 0) setLine(key, { debit: (-target / 100).toFixed(2), credit: '' });
        else setLine(key, { debit: '', credit: '' });
    };

    const post = useMutation({
        mutationFn: () => journalService.post({
            date, reference: reference.trim() || null, description: description.trim(),
            lines: lines.map(l => ({ account_id: l.accountId, debit: l.debit ? Number(l.debit) : null, credit: l.credit ? Number(l.credit) : null, description: l.description.trim() || null })),
        }),
        onSuccess: (entry) => {
            setPosted(entry);
            // Everything that reads the ledger: reports, balances, statements, journal lists.
            for (const key of ['report', 'statements', 'journal-entries', 'cashbook-overview', 'home-dashboard']) qc.invalidateQueries({ queryKey: [key] });
            qc.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith('report') });
            onPosted?.(entry);
        },
        onError: (e: any) => setServerError(e?.message || 'Could not post the journal entry'),
    });

    if (!isOpen) return null;
    const submit = () => { setTouched(true); setServerError(null); if (v.valid) post.mutate(); };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="je-title">
            <div className="absolute inset-0 bg-gray-900/60" onClick={() => !post.isPending && onClose()} />
            <div className="relative bg-white w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden font-['DM_Sans']">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EEF8]">
                    <div>
                        <h2 id="je-title" className="text-lg font-bold text-gray-900">New Journal Entry</h2>
                        <p className="text-xs text-gray-500">Post a balanced set of debits and credits straight to the general ledger.</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="p-2 rounded-full text-gray-400 hover:bg-gray-100"><X size={20} /></button>
                </div>

                {posted ? (
                    <div className="p-10 flex flex-col items-center text-center gap-3">
                        <CheckCircle2 size={48} className="text-[#03D47C]" />
                        <h3 className="text-xl font-bold text-gray-900">Journal {posted.journal_number} posted</h3>
                        <p className="text-sm text-gray-500">K{money(posted.total_debit)} debited and credited across {posted.lines.length} lines. It is now in your reports, account balances and ledger.</p>
                        <div className="flex gap-3 mt-4">
                            <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-[#006AFF] text-white font-semibold hover:bg-[#0059D8]">Done</button>
                            <button onClick={() => { setPosted(null); setReference(''); setDescription(''); setLines([blank(), blank()]); setTouched(false); }} className="px-5 py-2.5 rounded-xl bg-[#F0F6FF] text-[#0059D8] font-semibold hover:bg-[#E6F0FF]">Post another</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                <label className="block">
                                    <span className="text-xs font-semibold text-gray-500">Date</span>
                                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`mt-1 w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 ${touched && !v.dateOk ? 'border-red-300' : 'border-[#E8EEF8]'}`} />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold text-gray-500">Journal number</span>
                                    <input disabled value="Assigned on save (JV-…)" className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#E8EEF8] bg-[#F8FAFD] text-gray-400" />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold text-gray-500">Reference <span className="font-normal">(optional)</span></span>
                                    <input value={reference} onChange={e => setReference(e.target.value)} maxLength={100} placeholder="e.g. INV-1042" className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-[#E8EEF8] focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20" />
                                </label>
                                <label className="block sm:col-span-1">
                                    <span className="text-xs font-semibold text-gray-500">Description</span>
                                    <input value={description} onChange={e => setDescription(e.target.value)} maxLength={500} placeholder="What is this entry for?" className={`mt-1 w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 ${touched && !v.descOk ? 'border-red-300' : 'border-[#E8EEF8]'}`} />
                                </label>
                            </div>

                            <div className="border border-[#E8EEF8] rounded-2xl overflow-visible">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm min-w-[760px]">
                                        <thead>
                                            <tr className="bg-[#F8FAFD] text-[11px] uppercase tracking-wide text-gray-500">
                                                <th className="w-10 px-3 py-2 text-left">#</th>
                                                <th className="px-3 py-2 text-left w-[28%]">Account</th>
                                                <th className="px-3 py-2 text-right w-[16%]">Debit</th>
                                                <th className="px-3 py-2 text-right w-[16%]">Credit</th>
                                                <th className="px-3 py-2 text-left">Description</th>
                                                <th className="w-10" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lines.map((l, i) => (
                                                <tr key={l.key} className="border-t border-[#E8EEF8] align-top">
                                                    <td className="px-3 py-3 text-gray-400">{i + 1}</td>
                                                    <td className="px-2 py-2">
                                                        {isLoading ? <Loader2 className="animate-spin text-gray-400 mt-2" size={16} /> : <AccountPicker accounts={accounts} value={l.accountId} onChange={id => setLine(l.key, { accountId: id })} invalid={touched && !l.accountId} />}
                                                        {touched && v.lineErrors[i] && <p className="mt-1 text-[11px] text-red-500">{v.lineErrors[i]}</p>}
                                                    </td>
                                                    <td className="px-2 py-2"><input inputMode="decimal" type="number" min="0" step="0.01" value={l.debit} onChange={e => setDebit(l.key, e.target.value)} onFocus={e => e.currentTarget.select()} placeholder="0.00" className="w-full px-3 py-2 text-right rounded-lg border border-[#E8EEF8] focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20" aria-label={`Line ${i + 1} debit`} /></td>
                                                    <td className="px-2 py-2"><input inputMode="decimal" type="number" min="0" step="0.01" value={l.credit} onChange={e => setCredit(l.key, e.target.value)} onFocus={e => e.currentTarget.select()} placeholder="0.00" className="w-full px-3 py-2 text-right rounded-lg border border-[#E8EEF8] focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20" aria-label={`Line ${i + 1} credit`} /></td>
                                                    <td className="px-2 py-2">
                                                        <div className="flex gap-1">
                                                            <input value={l.description} onChange={e => setLine(l.key, { description: e.target.value })} maxLength={300} placeholder="Line note (optional)" className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[#E8EEF8] focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20" />
                                                            {v.diff !== 0 && !l.debit && !l.credit && <button type="button" onClick={() => balanceLine(l.key)} className="px-2 text-[11px] font-semibold text-[#0059D8] bg-[#E6F0FF] rounded-lg whitespace-nowrap hover:bg-[#d6e7ff]" title="Fill the amount that balances the entry">Balance</button>}
                                                        </div>
                                                    </td>
                                                    <td className="px-1 py-2 text-center">
                                                        <button type="button" disabled={lines.length <= 2} onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))} aria-label={`Remove line ${i + 1}`} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"><Trash2 size={15} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-[#E8EEF8] bg-[#F8FAFD] font-semibold">
                                                <td colSpan={2} className="px-3 py-3">
                                                    <button type="button" onClick={() => setLines(ls => [...ls, blank()])} className="inline-flex items-center gap-1.5 text-[#006AFF] hover:text-[#0059D8]"><Plus size={15} /> Add line</button>
                                                </td>
                                                <td className="px-3 py-3 text-right tabular-nums" data-testid="total-debit">{money(v.dr / 100)}</td>
                                                <td className="px-3 py-3 text-right tabular-nums" data-testid="total-credit">{money(v.cr / 100)}</td>
                                                <td colSpan={2} className="px-3 py-3">
                                                    {v.dr === 0 && v.cr === 0 ? <span className="text-gray-400 font-normal">Totals</span>
                                                        : v.diff === 0 ? <span className="inline-flex items-center gap-1 text-[#03A862]"><CheckCircle2 size={15} /> Balanced</span>
                                                            : <span className="inline-flex items-center gap-1 text-red-600" data-testid="difference"><AlertCircle size={15} /> Out of balance by {money(Math.abs(v.diff) / 100)}{v.diff > 0 ? ' (more debit)' : ' (more credit)'}</span>}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                            <p className="text-xs text-gray-400">Wallet and cash accounts are not listed — money in your wallets moves through the Cashbook so it always matches what is actually held.</p>
                            {serverError && <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" />{serverError}</div>}
                        </div>
                        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#E8EEF8] bg-white">
                            <p className="text-xs text-gray-500 hidden sm:block">{!v.balanced && (v.dr || v.cr) ? 'Debits must equal credits before you can save.' : 'Every entry needs at least two lines.'}</p>
                            <div className="flex gap-3 ml-auto">
                                <button onClick={onClose} disabled={post.isPending} className="px-5 py-2.5 rounded-xl text-gray-600 font-semibold hover:bg-gray-100">Cancel</button>
                                <button onClick={submit} disabled={post.isPending || !v.balanced} className="px-6 py-2.5 rounded-xl bg-[#006AFF] text-white font-semibold hover:bg-[#0059D8] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2">
                                    {post.isPending && <Loader2 size={16} className="animate-spin" />} Post entry
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
