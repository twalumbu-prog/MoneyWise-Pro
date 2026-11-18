import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Loader2, Plus, Printer, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { accountService } from '../services/account.service';
import { statementsService, journalService, JournalEntry } from '../services/journal.service';
import { JournalEntryModal } from './accounting/JournalEntryModal';

export type StatementTab = 'TRIAL' | 'CASHFLOW' | 'EQUITY' | 'LEDGER' | 'JOURNAL';
export const STATEMENT_TABS: { id: StatementTab; label: string }[] = [
    { id: 'CASHFLOW', label: 'Cash Flow' },
    { id: 'EQUITY', label: 'Changes in Equity' },
    { id: 'TRIAL', label: 'Trial Balance' },
    { id: 'LEDGER', label: 'General Ledger' },
    { id: 'JOURNAL', label: 'Journal Report' },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const num = (n: number) => (n < 0 ? `(${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const nz = (n: number) => (Math.abs(n) < 0.005 ? '–' : num(n));
const pretty = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const presets = () => {
    const t = new Date(), y = t.getFullYear(), q = Math.floor(t.getMonth() / 3);
    return [
        { label: 'This month', start: iso(new Date(y, t.getMonth(), 1)), end: iso(t) },
        { label: 'This quarter', start: iso(new Date(y, q * 3, 1)), end: iso(t) },
        { label: 'Year to date', start: iso(new Date(y, 0, 1)), end: iso(t) },
        { label: 'Last year', start: iso(new Date(y - 1, 0, 1)), end: iso(new Date(y - 1, 11, 31)) },
    ];
};

const Check: React.FC<{ ok: boolean; good: string; bad: string }> = ({ ok, good, bad }) => (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${ok ? 'bg-[#E8FBF2] text-[#03A862]' : 'bg-red-50 text-red-600'}`}>
        {ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}{ok ? good : bad}
    </span>
);
const LedgerWarning: React.FC<{ complete?: boolean }> = ({ complete }) => complete === false ? (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 text-amber-800 text-xs">
        <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
        <span>Some wallet transactions are not yet posted to the general ledger. These statements read the ledger only, so they can differ from the older Profit/Loss and Net Worth screens until posting catches up.</span>
    </div>
) : null;
const Title: React.FC<{ name: string; sub: string; org?: string | null }> = ({ name, sub, org }) => (
    <div className="text-center mb-4">
        {org && <p className="text-xs uppercase tracking-wide text-gray-500">{org}</p>}
        <h2 className="text-xl font-bold text-gray-900">{name}</h2>
        <p className="text-sm text-gray-500">{sub}</p>
    </div>
);
const Row: React.FC<{ label: React.ReactNode; amount?: number; bold?: boolean; indent?: boolean; top?: boolean; dim?: boolean }> = ({ label, amount, bold, indent, top, dim }) => (
    <div className={`flex justify-between gap-6 py-1.5 text-sm ${bold ? 'font-bold text-gray-900' : dim ? 'text-gray-400' : 'text-gray-700'} ${top ? 'border-t border-gray-300 mt-1 pt-2' : ''}`}>
        <span className={indent ? 'pl-5' : ''}>{label}</span>
        {amount !== undefined && <span className="tabular-nums whitespace-nowrap">{nz(amount)}</span>}
    </div>
);
const Loading = () => <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#006AFF]" /></div>;
const Err: React.FC<{ e: any }> = ({ e }) => <div className="p-4 rounded-xl bg-red-50 text-red-700 text-sm">{e?.message || 'Could not load this report.'}</div>;

// ── Cash flow ────────────────────────────────────────────────────────────────
const CashFlowView: React.FC<{ start: string; end: string; org?: string | null }> = ({ start, end, org }) => {
    const { organizationId } = useAuth();
    const q = useQuery({ queryKey: ['statements', 'cash-flow', organizationId, start, end], queryFn: () => statementsService.cashFlow(start, end), enabled: !!organizationId });
    if (q.isLoading) return <Loading />;
    if (q.error || !q.data) return <Err e={q.error} />;
    const d = q.data;
    return (
        <div className="space-y-4">
            <LedgerWarning complete={d.ledgerComplete} />
            <div className="bg-white border border-[#E8EEF8] rounded-2xl p-6 max-w-3xl mx-auto w-full">
                <Title org={org} name="Statement of Cash Flows" sub={`For the period ${pretty(start)} to ${pretty(end)} · Indirect method`} />
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mt-2">Operating activities</p>
                <Row label="Net profit / (loss) for the period" amount={d.netProfit} />
                {d.operating.adjustments.length > 0 && <p className="text-xs text-gray-400 pt-1">Adjustments for non-cash items and working capital</p>}
                {d.operating.adjustments.map((l, i) => <Row key={l.account_id ?? i} indent label={l.label} amount={l.amount} />)}
                <Row bold top label="Net cash from operating activities" amount={d.operating.total} />
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mt-4">Investing activities</p>
                {d.investing.lines.length === 0 && <Row dim indent label="No investing activity" />}
                {d.investing.lines.map((l, i) => <Row key={l.account_id ?? i} indent label={l.label} amount={l.amount} />)}
                <Row bold top label="Net cash from investing activities" amount={d.investing.total} />
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mt-4">Financing activities</p>
                {d.financing.lines.length === 0 && <Row dim indent label="No financing activity" />}
                {d.financing.lines.map((l, i) => <Row key={l.account_id ?? i} indent label={l.label} amount={l.amount} />)}
                <Row bold top label="Net cash from financing activities" amount={d.financing.total} />
                <div className="mt-4 border-t-2 border-gray-800 pt-2">
                    <Row bold label="Net increase / (decrease) in cash" amount={d.netChange} />
                    <Row label="Cash at beginning of period" amount={d.openingCash} />
                    <Row bold label="Cash at end of period" amount={d.closingCash} />
                </div>
                <div className="mt-5 pt-4 border-t border-[#E8EEF8]">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">Cash &amp; wallet accounts at {pretty(end)} (ties to the balance sheet)</p>
                    {d.cashAccounts.map(a => <Row key={a.account_id} indent label={a.name} amount={a.closing} />)}
                    <div className="flex flex-wrap gap-2 mt-3">
                        <Check ok={d.checks.cashChangeTiesToBalanceSheet} good="Cash movement ties to the balance sheet" bad={`Off by ${num(d.checks.difference)}`} />
                        <Check ok={d.checks.ledgerBalanced} good="Ledger balanced" bad={`Ledger out of balance by ${num(d.checks.ledgerGap)}`} />
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Changes in equity ────────────────────────────────────────────────────────
const EquityView: React.FC<{ start: string; end: string; org?: string | null }> = ({ start, end, org }) => {
    const { organizationId } = useAuth();
    const q = useQuery({ queryKey: ['statements', 'equity', organizationId, start, end], queryFn: () => statementsService.changesInEquity(start, end), enabled: !!organizationId });
    if (q.isLoading) return <Loading />;
    if (q.error || !q.data) return <Err e={q.error} />;
    const d = q.data;
    return (
        <div className="space-y-4">
            <LedgerWarning complete={d.ledgerComplete} />
            <div className="bg-white border border-[#E8EEF8] rounded-2xl p-6 max-w-4xl mx-auto w-full overflow-x-auto">
                <Title org={org} name="Statement of Changes in Equity" sub={`For the period ${pretty(start)} to ${pretty(end)}`} />
                <table className="w-full text-sm min-w-[620px]">
                    <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-300">
                            <th className="text-left py-2 font-semibold">Component of equity</th>
                            <th className="text-right py-2 font-semibold">Opening balance</th>
                            <th className="text-right py-2 font-semibold">Profit / (loss)</th>
                            <th className="text-right py-2 font-semibold">Contributions, drawings &amp; other</th>
                            <th className="text-right py-2 font-semibold">Closing balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {d.rows.map((r, i) => (
                            <tr key={r.account_id ?? `r${i}`} className="border-b border-[#F0F4FA]">
                                <td className="py-2 text-gray-800">{r.name}{r.kind === 'SUSPENSE' && <span className="ml-2 text-[10px] text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">uncategorised</span>}</td>
                                <td className="py-2 text-right tabular-nums">{nz(r.opening)}</td>
                                <td className="py-2 text-right tabular-nums">{nz(r.profit)}</td>
                                <td className="py-2 text-right tabular-nums">{nz(r.other_movements)}</td>
                                <td className="py-2 text-right tabular-nums font-medium">{nz(r.closing)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="font-bold border-t-2 border-gray-800">
                            <td className="py-2">Total equity</td>
                            <td className="py-2 text-right tabular-nums">{nz(d.totals.opening)}</td>
                            <td className="py-2 text-right tabular-nums">{nz(d.totals.profit)}</td>
                            <td className="py-2 text-right tabular-nums">{nz(d.totals.other_movements)}</td>
                            <td className="py-2 text-right tabular-nums">{nz(d.totals.closing)}</td>
                        </tr>
                    </tfoot>
                </table>
                <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-[#E8EEF8]">
                    <Check ok={d.checks.closingTiesToBalanceSheet} good={`Closing equity ties to the balance sheet (assets − liabilities = ${num(d.balanceSheetEquity)})`} bad={`Closing equity differs from the balance sheet by ${num(d.checks.difference)}`} />
                    <Check ok={d.checks.rollForwardOk} good="Opening + movements = closing" bad="Roll-forward does not add up" />
                </div>
            </div>
        </div>
    );
};

// ── Trial balance ────────────────────────────────────────────────────────────
const TrialView: React.FC<{ start: string; end: string; org?: string | null }> = ({ start, end, org }) => {
    const { organizationId } = useAuth();
    const q = useQuery({ queryKey: ['statements', 'trial', organizationId, start, end], queryFn: () => statementsService.trialBalance(start, end), enabled: !!organizationId });
    if (q.isLoading) return <Loading />;
    if (q.error || !q.data) return <Err e={q.error} />;
    const d = q.data;
    const label: Record<string, string> = { ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Equity', INCOME: 'Income', EXPENSE: 'Expenses' };
    let last = '';
    return (
        <div className="space-y-4">
            <LedgerWarning complete={d.ledgerComplete} />
            <div className="bg-white border border-[#E8EEF8] rounded-2xl p-6 max-w-4xl mx-auto w-full overflow-x-auto">
                <Title org={org} name="Trial Balance" sub={`As at ${pretty(end)} · activity from ${pretty(start)}`} />
                <table className="w-full text-sm min-w-[620px]">
                    <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-300">
                            <th className="text-left py-2 font-semibold">Account</th>
                            <th className="text-right py-2 font-semibold">Period debits</th>
                            <th className="text-right py-2 font-semibold">Period credits</th>
                            <th className="text-right py-2 font-semibold">Debit</th>
                            <th className="text-right py-2 font-semibold">Credit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {d.rows.map(r => {
                            const head = r.type !== last ? (last = r.type, <tr key={`h-${r.type}`}><td colSpan={5} className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{label[r.type]}</td></tr>) : null;
                            return (
                                <React.Fragment key={r.account_id}>
                                    {head}
                                    <tr className="border-b border-[#F0F4FA]">
                                        <td className="py-1.5 text-gray-800">{r.code && <span className="text-gray-400 mr-2 text-xs">{r.code}</span>}{r.name}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-500">{nz(r.period_debit)}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-500">{nz(r.period_credit)}</td>
                                        <td className="py-1.5 text-right tabular-nums">{nz(r.debit)}</td>
                                        <td className="py-1.5 text-right tabular-nums">{nz(r.credit)}</td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="font-bold border-t-2 border-gray-800">
                            <td className="py-2">Total</td>
                            <td className="py-2 text-right tabular-nums">{nz(d.totals.period_debit)}</td>
                            <td className="py-2 text-right tabular-nums">{nz(d.totals.period_credit)}</td>
                            <td className="py-2 text-right tabular-nums">{nz(d.totals.debit)}</td>
                            <td className="py-2 text-right tabular-nums">{nz(d.totals.credit)}</td>
                        </tr>
                    </tfoot>
                </table>
                <div className="mt-4"><Check ok={d.balanced} good="Debits equal credits" bad={`Out of balance by ${num(d.totals.debit - d.totals.credit)}`} /></div>
            </div>
        </div>
    );
};

// ── General ledger ───────────────────────────────────────────────────────────
const LedgerView: React.FC<{ start: string; end: string; org?: string | null }> = ({ start, end, org }) => {
    const { organizationId } = useAuth();
    const [accountId, setAccountId] = useState('');
    const accounts = useQuery({ queryKey: ['accounts', organizationId, 'all'], queryFn: () => accountService.getAll(true), enabled: !!organizationId, staleTime: 60_000 });
    const sorted = useMemo(() => [...(accounts.data ?? [])].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)), [accounts.data]);
    const q = useQuery({ queryKey: ['statements', 'ledger', organizationId, accountId, start, end], queryFn: () => statementsService.generalLedger(accountId, start, end), enabled: !!organizationId && !!accountId });
    return (
        <div className="space-y-4">
            <div className="max-w-5xl mx-auto w-full">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Account</label>
                <select value={accountId} onChange={e => setAccountId(e.target.value)} className="w-full sm:w-96 px-3 py-2 text-sm rounded-lg border border-[#E8EEF8] bg-white focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20">
                    <option value="">Select an account…</option>
                    {['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map(t => (
                        <optgroup key={t} label={t.charAt(0) + t.slice(1).toLowerCase()}>
                            {sorted.filter(a => a.type === t).map(a => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ''}{a.name}{a.is_active === false ? ' (inactive)' : ''}</option>)}
                        </optgroup>
                    ))}
                </select>
            </div>
            {!accountId ? <p className="text-center text-sm text-gray-400 py-12">Choose an account to see every posting to it, with a running balance.</p>
                : q.isLoading ? <Loading /> : q.error || !q.data ? <Err e={q.error} /> : (
                    <div className="bg-white border border-[#E8EEF8] rounded-2xl p-6 max-w-5xl mx-auto w-full overflow-x-auto">
                        <Title org={org} name={`General Ledger — ${q.data.account.name}`} sub={`${pretty(start)} to ${pretty(end)} · ${q.data.normalBalance === 'DEBIT' ? 'debit' : 'credit'}-normal account`} />
                        <table className="w-full text-sm min-w-[720px]">
                            <thead>
                                <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-300">
                                    <th className="text-left py-2 font-semibold w-24">Date</th><th className="text-left py-2 font-semibold w-32">Journal</th><th className="text-left py-2 font-semibold">Description</th>
                                    <th className="text-right py-2 font-semibold">Debit</th><th className="text-right py-2 font-semibold">Credit</th><th className="text-right py-2 font-semibold">Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="bg-[#F8FAFD] font-medium"><td colSpan={5} className="py-2 px-2">Opening balance</td><td className="py-2 text-right tabular-nums">{num(q.data.opening)}</td></tr>
                                {q.data.rows.map(r => (
                                    <tr key={r.id} className="border-b border-[#F0F4FA]">
                                        <td className="py-1.5 text-gray-600 whitespace-nowrap">{pretty(r.date)}</td>
                                        <td className="py-1.5 text-gray-500 text-xs">{r.reference || r.source_type}</td>
                                        <td className="py-1.5 text-gray-800 max-w-[340px] truncate" title={r.description}>{r.description}</td>
                                        <td className="py-1.5 text-right tabular-nums">{r.debit ? num(r.debit) : ''}</td>
                                        <td className="py-1.5 text-right tabular-nums">{r.credit ? num(r.credit) : ''}</td>
                                        <td className="py-1.5 text-right tabular-nums font-medium">{num(r.balance)}</td>
                                    </tr>
                                ))}
                                {q.data.rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-gray-400">No postings in this period.</td></tr>}
                            </tbody>
                            <tfoot>
                                <tr className="font-bold border-t-2 border-gray-800"><td colSpan={3} className="py-2">Closing balance</td><td className="py-2 text-right tabular-nums">{num(q.data.totalDebit)}</td><td className="py-2 text-right tabular-nums">{num(q.data.totalCredit)}</td><td className="py-2 text-right tabular-nums">{num(q.data.closing)}</td></tr>
                            </tfoot>
                        </table>
                        {q.data.truncated && <p className="mt-3 text-xs text-amber-700">Showing the first postings only — narrow the date range to see the rest.</p>}
                    </div>
                )}
        </div>
    );
};

// ── Journal report ───────────────────────────────────────────────────────────
const SOURCE_LABEL: Record<string, string> = { MANUAL: 'Manual', CASHBOOK: 'Wallet', INVOICE: 'Invoice', MASTERFEES: 'Master Fees', LINE_ITEMS: 'Requisition', OPENING: 'Opening', RECLASS: 'Reclass' };
const JournalReport: React.FC<{ start: string; end: string; canPost: boolean; org?: string | null }> = ({ start, end, canPost, org }) => {
    const { organizationId } = useAuth();
    const qc = useQueryClient();
    const [source, setSource] = useState<'' | 'MANUAL'>('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [open, setOpen] = useState<Set<string>>(new Set());
    const [modal, setModal] = useState(false);
    const PAGE = 50;
    const q = useQuery({ queryKey: ['journal-entries', organizationId, start, end, source, search, page], queryFn: () => journalService.list({ from: start, to: end, sourceType: source || undefined, search: search || undefined, limit: PAGE, offset: page * PAGE }), enabled: !!organizationId });
    const reverse = useMutation({
        mutationFn: (id: string) => journalService.reverse(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal-entries'] }); qc.invalidateQueries({ queryKey: ['statements'] }); qc.invalidateQueries({ predicate: x => String(x.queryKey[0]).startsWith('report') }); },
    });
    const toggle = (id: string) => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const total = q.data?.total ?? 0;
    return (
        <div className="space-y-4 max-w-5xl mx-auto w-full">
            <div className="flex flex-wrap items-center gap-3">
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search description or journal number" className="flex-1 min-w-[200px] px-3 py-2 text-sm rounded-lg border border-[#E8EEF8] bg-white focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20" />
                <select value={source} onChange={e => { setSource(e.target.value as any); setPage(0); }} className="px-3 py-2 text-sm rounded-lg border border-[#E8EEF8] bg-white">
                    <option value="">All journals</option><option value="MANUAL">Manual journals only</option>
                </select>
                {canPost && <button onClick={() => setModal(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#006AFF] text-white text-sm font-semibold hover:bg-[#0059D8]"><Plus size={16} /> New journal entry</button>}
            </div>
            <div className="bg-white border border-[#E8EEF8] rounded-2xl p-6">
                <Title org={org} name="Journal Report" sub={`${pretty(start)} to ${pretty(end)} · ${total.toLocaleString()} entr${total === 1 ? 'y' : 'ies'}`} />
                {q.isLoading ? <Loading /> : q.error ? <Err e={q.error} /> : (q.data?.entries.length ?? 0) === 0 ? <p className="text-center text-sm text-gray-400 py-10">No journal entries in this period.</p> : (
                    <ul className="divide-y divide-[#E8EEF8]">
                        {q.data!.entries.map((e: JournalEntry) => (
                            <li key={e.id} className="py-2">
                                <button onClick={() => toggle(e.id)} className="w-full flex items-center gap-3 text-left py-1">
                                    {open.has(e.id) ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                                    <span className="w-24 text-xs text-gray-500 whitespace-nowrap">{pretty(e.entry_date)}</span>
                                    <span className="w-28 text-xs font-semibold text-[#0059D8] truncate">{e.journal_number || '—'}</span>
                                    <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">{e.description}</span>
                                    <span className="text-[10px] font-bold uppercase rounded px-1.5 py-0.5 bg-[#F0F6FF] text-[#0059D8]">{SOURCE_LABEL[e.source_type] || e.source_type}</span>
                                    <span className="w-28 text-right text-sm tabular-nums font-medium">{num(e.total_debit)}</span>
                                </button>
                                {open.has(e.id) && (
                                    <div className="ml-7 mt-2 mb-2 rounded-xl bg-[#F8FAFD] p-3">
                                        <table className="w-full text-sm">
                                            <thead><tr className="text-[10px] uppercase tracking-wide text-gray-500"><th className="text-left py-1">Account</th><th className="text-right py-1">Debit</th><th className="text-right py-1">Credit</th></tr></thead>
                                            <tbody>
                                                {e.lines.map(l => (
                                                    <tr key={l.id}><td className={`py-1 ${l.credit > 0 ? 'pl-6' : ''} text-gray-800`}>{l.account_name}{l.description && <span className="ml-2 text-xs text-gray-400">{l.description}</span>}</td><td className="py-1 text-right tabular-nums">{l.debit ? num(l.debit) : ''}</td><td className="py-1 text-right tabular-nums">{l.credit ? num(l.credit) : ''}</td></tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                                            <span>{e.reference ? `Ref ${e.reference} · ` : ''}{e.created_by_name ? `Posted by ${e.created_by_name}` : ''}</span>
                                            {canPost && e.source_type === 'MANUAL' && (
                                                <button onClick={() => { if (window.confirm(`Post a reversing entry for ${e.journal_number}? The original stays on record.`)) reverse.mutate(e.id); }} disabled={reverse.isPending}
                                                    className="inline-flex items-center gap-1 font-semibold text-[#0059D8] hover:underline disabled:opacity-50"><RotateCcw size={12} /> Reverse</button>
                                            )}
                                        </div>
                                        {reverse.isError && <p className="mt-2 text-xs text-red-600">{(reverse.error as any)?.message}</p>}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {total > PAGE && (
                    <div className="flex items-center justify-between mt-4 text-sm">
                        <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg bg-[#F0F6FF] text-[#0059D8] font-semibold disabled:opacity-40">Previous</button>
                        <span className="text-gray-500">{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}</span>
                        <button disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg bg-[#F0F6FF] text-[#0059D8] font-semibold disabled:opacity-40">Next</button>
                    </div>
                )}
            </div>
            <JournalEntryModal isOpen={modal} onClose={() => setModal(false)} />
        </div>
    );
};

// ── Shell ────────────────────────────────────────────────────────────────────
/**
 * The statements workspace. Inside Reporting it is driven by the page's own tab strip (`tab`);
 * it accepts `start` and `end` from Reporting's date filter.
 */
export const FinancialStatements: React.FC<{
    tab?: StatementTab;
    start?: string;
    end?: string;
    onTabChange?: (t: StatementTab) => void;
    showTabs?: boolean;
    showDateFilter?: boolean;
}> = ({ tab: tabProp, start: startProp, end: endProp, onTabChange, showTabs = false, showDateFilter = false }) => {
    const { userRole, organizationName } = useAuth();
    const [own, setOwn] = useState<StatementTab>('CASHFLOW');
    const tab = tabProp ?? own;
    const setTab = (t: StatementTab) => { setOwn(t); onTabChange?.(t); };
    const ps = useMemo(presets, []);
    const [range, setRange] = useState({ start: ps[2].start, end: ps[2].end });
    const activeStart = startProp ?? range.start;
    const activeEnd = endProp ?? range.end;
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(activeStart) && /^\d{4}-\d{2}-\d{2}$/.test(activeEnd) && activeStart <= activeEnd;
    const canPost = userRole === 'ACCOUNTANT' || userRole === 'ADMIN';

    return (
        <div className="font-['DM_Sans'] space-y-4 p-1 md:p-2">
            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                {(showTabs || tabProp === undefined) && (
                    <div className="flex gap-1 p-1 bg-[#F8FAFD] rounded-[10px] overflow-x-auto no-scrollbar max-w-full">
                        {STATEMENT_TABS.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                className={`px-3.5 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${tab === t.id ? 'bg-white text-gray-900 font-bold shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-[#E8EEF8] hover:bg-gray-50 shadow-sm transition-colors"
                        title="Print or save as PDF"
                    >
                        <Printer size={14} /> Print
                    </button>
                </div>
            </div>
            {showDateFilter && (
                <div className="flex flex-wrap items-end gap-3 print:hidden">
                    <div className="flex gap-1.5 flex-wrap">
                        {ps.map(p => (
                            <button
                                key={p.label}
                                onClick={() => setRange({ start: p.start, end: p.end })}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${range.start === p.start && range.end === p.end ? 'bg-[#E6F0FF] border-[#006AFF]/40 text-[#0059D8]' : 'bg-white border-[#E8EEF8] text-gray-600 hover:border-[#006AFF]/40'}`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <label className="text-xs text-gray-500">From<input type="date" value={range.start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))} className="ml-1.5 px-2 py-1.5 text-sm rounded-lg border border-[#E8EEF8] bg-white" /></label>
                    <label className="text-xs text-gray-500">To<input type="date" value={range.end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))} className="ml-1.5 px-2 py-1.5 text-sm rounded-lg border border-[#E8EEF8] bg-white" /></label>
                </div>
            )}
            {!valid ? <p className="text-sm text-red-600">Choose a valid date range (start on or before end).</p> : (
                <>
                    {tab === 'CASHFLOW' && <CashFlowView start={activeStart} end={activeEnd} org={organizationName} />}
                    {tab === 'EQUITY' && <EquityView start={activeStart} end={activeEnd} org={organizationName} />}
                    {tab === 'TRIAL' && <TrialView start={activeStart} end={activeEnd} org={organizationName} />}
                    {tab === 'LEDGER' && <LedgerView start={activeStart} end={activeEnd} org={organizationName} />}
                    {tab === 'JOURNAL' && <JournalReport start={activeStart} end={activeEnd} canPost={canPost} org={organizationName} />}
                </>
            )}
        </div>
    );
};
