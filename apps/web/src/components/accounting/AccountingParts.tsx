import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, Lock, Upload } from 'lucide-react';
import { apiFetch, apiJson, formatKwacha } from 'core';
import { CreditNotes } from './CreditNotes';
import { Quotes } from './Quotes';
import { Dialog, ErrorNote, PrimaryButton, TonalButton, fieldClass, labelClass } from '../ui/Dialog';

const yearStart = () => `${new Date().getFullYear()}-01-01`;
const money = (n: number) => formatKwacha(n);

interface Group { name: string; total: number; lines: { accountId: string; code: string | null; name: string; amount: number }[] }

function download(name: string, rows: (string | number)[][]) {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

const Row: React.FC<{ label: React.ReactNode; value?: React.ReactNode; bold?: boolean; indent?: boolean }> = ({ label, value, bold, indent }) => (
    <div className={`flex items-center justify-between gap-3 border-b border-[#F1F3F4] py-2 text-sm ${bold ? 'font-semibold text-[#1F1F1F]' : 'text-[#3C4043]'} ${indent ? 'pl-4' : ''}`}>
        <span className="min-w-0 truncate">{label}</span><span className="tabular-nums">{value}</span>
    </div>
);

/** The blue summary banner Net Worth and Profit/Loss open with. */
/** Downloads a PDF the server builds for a statement. */
export async function downloadPdf(path: string) {
    try {
        const res = await apiFetch(path);
        const blob = await res.blob();
        const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'statement.pdf';
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
    } catch (e: any) { window.alert(e?.message || 'Could not make the PDF.'); }
}

const Hero: React.FC<{ label: string; value: string; action?: { label: string; onClick: () => void }; pdf?: string }> = ({ label, value, action, pdf }) => (
    <div className="flex h-24 w-full items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-l from-[#0B57D0] to-[#0842A0] p-5">
        <div className="flex flex-col items-start gap-2">
            <div className="font-['Figtree'] text-[10px] font-normal uppercase tracking-wider text-white/70">{label}</div>
            <div className="font-['DM_Sans'] text-3xl font-bold leading-none text-white">{value}</div>
        </div>
        <div className="flex gap-2">
            {pdf && <button onClick={() => downloadPdf(pdf)} className="rounded-lg bg-white px-4 py-2 font-['DM_Sans'] text-xs font-bold text-gray-900 transition-colors hover:bg-gray-100"><Download size={12} className="mr-1.5 inline" />PDF</button>}
            {action && <button onClick={action.onClick} className="rounded-lg bg-white/15 px-4 py-2 font-['DM_Sans'] text-xs font-bold text-white transition-colors hover:bg-white/25">{action.label}</button>}
        </div>
    </div>
);

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="font-['DM_Sans'] text-xl font-semibold leading-6 text-black">{children}</div>;

const CARD = 'w-full overflow-hidden rounded-xl bg-white outline outline-1 outline-offset-[-1px] outline-violet-100 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.05)]';
const CARD_HEAD = 'flex items-center justify-between border-b border-violet-100 px-6 py-4';

/** A statement section laid out like the Reports lists: a header with the count and total, then one row per group that opens to its accounts. */
const Section: React.FC<{ title: string; groups: Group[]; total: number; note?: string }> = ({ title, groups, total, note }) => {
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const count = groups.reduce((n, g) => n + g.lines.length, 0);
    return (
        <div className={CARD}>
            <div className={CARD_HEAD}>
                <span className="flex items-center gap-3 text-sm font-semibold text-gray-900"><ChevronDown size={14} className="text-gray-500" />{title}{count > 0 && <span className="rounded-full bg-gray-100 px-2 text-[10px] font-medium text-gray-500">{count}</span>}</span>
                <span className="text-sm font-bold tabular-nums text-gray-900">{money(total)}</span>
            </div>
            {groups.length === 0 && <p className="px-6 py-3 text-sm text-gray-500">Nothing recorded.</p>}
            {groups.map((g) => (
                <div key={g.name}>
                    <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.name]: !o[g.name] }))} className="flex h-10 w-full items-center justify-between px-6 text-left text-sm text-gray-900 hover:bg-gray-50">
                        <span className="flex items-center gap-3">{g.lines.length > 0 ? (open[g.name] ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />) : <span className="w-3.5" />}{g.name}</span>
                        <span className="tabular-nums">{money(g.total)}</span>
                    </button>
                    {open[g.name] && g.lines.map((l) => (
                        <div key={l.accountId} className="flex h-9 items-center justify-between bg-gray-50/60 pl-14 pr-6 text-sm text-gray-600"><span className="truncate">{l.code ? `${l.code} · ` : ''}{l.name}</span><span className="tabular-nums">{money(l.amount)}</span></div>
                    ))}
                </div>
            ))}
            {note && <p className="border-t border-violet-100 px-6 py-2 text-[11px] text-gray-500">{note}</p>}
        </div>
    );
};

export function Upgrade() {
    const navigate = useNavigate();
    return (
        <div className="mx-auto max-w-xl rounded-2xl border border-[#E0E0E0] bg-[#F8FAFD] p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#CFE4FF] text-[#0059D8]"><Lock size={22} /></div>
            <h2 className="text-lg font-semibold text-[#1F1F1F]">Accounting is part of MoneyWise Enterprise</h2>
            <p className="mt-2 text-sm text-[#5F6368]">Trial balance, profit and loss, balance sheet and account ledgers built from your live books, plus import of your history from QuickBooks, Sage, Xero or a spreadsheet.</p>
            <PrimaryButton className="mt-5" onClick={() => navigate('/support')}>Talk to us about Enterprise</PrimaryButton>
        </div>
    );
}

function useReport<T>(path: string, enabled = true) {
    return useQuery<T>({ queryKey: ['accounting', path], queryFn: () => apiJson<T>(path), enabled, retry: false });
}

interface Range { from: string; to: string }
const Stack: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="flex w-full flex-col gap-4">{children}</div>;

function TrialBalance({ to }: Range) {
    const { data, error, isLoading } = useReport<any>(`/accounting/trial-balance?asOf=${to}`);
    const csv = () => download(`trial-balance-${to}.csv`, [['Code', 'Account', 'Debit', 'Credit'], ...data.rows.map((r: any) => [r.code ?? '', r.name, r.debit, r.credit])]);
    return (
        <Stack>
            <Hero label="Total debits" value={data ? money(data.totals.debit) : '…'} pdf={`/accounting/pdf?report=tb&to=${to}`} action={data ? { label: 'Export CSV', onClick: csv } : undefined} />
            <Heading>Trial balance</Heading>
            <ErrorNote text={(error as any)?.message} />
            {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {data && (
                <div className={CARD}>
                    <div className={`${CARD_HEAD} text-[10px] font-semibold uppercase tracking-wider text-gray-500`}><span>Account</span><span className="flex gap-10"><span className="w-28 text-right">Debit</span><span className="w-28 text-right">Credit</span></span></div>
                    {data.rows.map((r: any) => (
                        <div key={r.accountId} className="flex h-10 items-center justify-between px-6 text-sm text-gray-900">
                            <span className="truncate">{r.code ? `${r.code} · ` : ''}{r.name}</span>
                            <span className="flex gap-10 tabular-nums"><span className="w-28 text-right">{r.debit ? money(r.debit) : ''}</span><span className="w-28 text-right">{r.credit ? money(r.credit) : ''}</span></span>
                        </div>
                    ))}
                    <div className="flex h-11 items-center justify-between border-t border-violet-100 px-6 text-sm font-bold text-gray-900"><span>Total</span><span className="flex gap-10 tabular-nums"><span className="w-28 text-right">{money(data.totals.debit)}</span><span className="w-28 text-right">{money(data.totals.credit)}</span></span></div>
                    <p className={`border-t border-violet-100 px-6 py-2 text-[11px] ${data.balanced ? 'text-[#137333]' : 'text-[#B31412]'}`}>{data.balanced ? 'Debits equal credits.' : 'Debits and credits do not match. Check the ledger integrity.'}</p>
                </div>
            )}
        </Stack>
    );
}

function BalanceSheet({ to }: Range) {
    const { data, error, isLoading } = useReport<any>(`/accounting/balance-sheet?asOf=${to}`);
    const csv = () => download(`balance-sheet-${to}.csv`, [['Section', 'Group', 'Account', 'Amount'], ...(['assets', 'liabilities', 'equity'] as const).flatMap((k) => data[k].flatMap((g: Group) => g.lines.map((l) => [k, g.name, l.name, l.amount]))), ['equity', 'Profit for the period', '', data.profitForPeriod]]);
    return (
        <Stack>
            <Hero label="Total assets" value={data ? money(data.totalAssets) : '…'} pdf={`/accounting/pdf?report=bs&to=${to}`} action={data ? { label: 'Export CSV', onClick: csv } : undefined} />
            <Heading>Balance sheet</Heading>
            <ErrorNote text={(error as any)?.message} />
            {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {data && (<>
                <Section title="Assets" groups={data.assets} total={data.totalAssets} />
                <Section title="Liabilities" groups={data.liabilities} total={data.totalLiabilities} />
                <Section title="Equity" groups={[...data.equity, { name: 'Profit for the period', total: data.profitForPeriod, lines: [] }]} total={data.totalEquity}
                    note={data.balanced ? 'Assets equal liabilities plus equity.' : 'Assets do not equal liabilities plus equity. Check the ledger integrity.'} />
            </>)}
        </Stack>
    );
}

function AccountLedger({ from, to }: Range) {
    const [accountId, setAccountId] = useState('');
    const accounts = useReport<{ accounts: { id: string; code: string | null; name: string }[] }>('/accounting/accounts');
    const { data, error, isFetching } = useReport<any>(`/accounting/general-ledger?accountId=${accountId}&from=${from}&to=${to}`, !!accountId);
    const csv = () => download(`ledger-${data.account.name}-${from}-${to}.csv`, [['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'], ...data.lines.map((l: any) => [l.date, l.reference ?? '', l.description ?? '', l.debit, l.credit, l.balance])]);
    return (
        <Stack>
            <Hero label={data ? `${data.account.name} · closing balance` : 'Account ledger'} value={data ? money(data.closing) : 'Choose an account'} pdf={accountId ? `/accounting/pdf?report=gl&accountId=${accountId}&from=${from}&to=${to}` : undefined} action={data ? { label: 'Export CSV', onClick: csv } : undefined} />
            <div className="flex items-center justify-between gap-3">
                <Heading>Ledger</Heading>
                <select className="h-8 max-w-[60%] rounded-[10px] bg-slate-100 px-3 font-['DM_Sans'] text-[11px] text-gray-900 outline-none" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">Choose an account…</option>
                    {(accounts.data?.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ''}{a.name}</option>)}
                </select>
            </div>
            <ErrorNote text={(error as any)?.message} />
            {isFetching && <p className="text-sm text-gray-500">Loading…</p>}
            {data && (
                <div className={CARD}>
                    <div className={`${CARD_HEAD} text-[10px] font-semibold uppercase tracking-wider text-gray-500`}><span>Opening balance</span><span className="text-sm font-bold normal-case tabular-nums text-gray-900">{money(data.opening)}</span></div>
                    {data.lines.length === 0 && <p className="px-6 py-3 text-sm text-gray-500">No movements in this period.</p>}
                    {data.lines.map((l: any, i: number) => (
                        <div key={i} className="flex h-10 items-center gap-4 px-6 text-sm text-gray-900">
                            <span className="w-24 shrink-0 text-gray-500">{l.date}</span><span className="min-w-0 flex-1 truncate">{l.description}</span>
                            <span className="w-28 text-right tabular-nums">{l.debit ? money(l.debit) : ''}</span><span className="w-28 text-right tabular-nums">{l.credit ? money(l.credit) : ''}</span><span className="w-28 text-right font-medium tabular-nums">{money(l.balance)}</span>
                        </div>
                    ))}
                    {data.truncated && <p className="border-t border-violet-100 px-6 py-2 text-[11px] text-[#B06000]">Showing the first 3,000 lines. Narrow the dates to see the rest.</p>}
                </div>
            )}
        </Stack>
    );
}

const SOURCES = [
    { id: 'quickbooks', label: 'QuickBooks', hint: { accounts: 'Reports → Account List → Export', opening: 'Reports → Trial Balance → Export to CSV', journals: 'Reports → Journal → Export to CSV' } },
    { id: 'sage', label: 'Sage', hint: { accounts: 'Chart of accounts → Export', opening: 'Reports → Trial Balance → Export', journals: 'Reports → Nominal / journal listing → Export' } },
    { id: 'xero', label: 'Xero', hint: { accounts: 'Accounting → Chart of accounts → Export', opening: 'Reports → Trial Balance → Export CSV', journals: 'Reports → Journal Report → Export CSV' } },
    { id: 'csv', label: 'Spreadsheet (CSV)', hint: { accounts: 'Columns: code, name, type', opening: 'Columns: account, debit, credit', journals: 'Columns: date, number, account, memo, debit, credit' } },
] as const;
const KINDS = [{ id: 'accounts', label: '1. Chart of accounts' }, { id: 'opening', label: '2. Opening balances' }, { id: 'journals', label: '3. Transactions' }] as const;

export function ImportTool() {
    const [source, setSource] = useState<(typeof SOURCES)[number]['id']>('quickbooks');
    const [kind, setKind] = useState<(typeof KINDS)[number]['id']>('accounts');
    const [csv, setCsv] = useState(''); const [fileName, setFileName] = useState('');
    const [asOf, setAsOf] = useState(yearStart()); const [plug, setPlug] = useState(false); const [dateOrder, setDateOrder] = useState<'' | 'dmy' | 'mdy'>('');
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);
    const batches = useReport<{ batches: { batch: string; entries: number; createdAt: string; from: string; to: string }[] }>('/accounting/import/batches');
    const hint = SOURCES.find((s) => s.id === source)!.hint[kind];

    const run = async (commit: boolean) => {
        setBusy(true); setErr(null);
        try {
            const r = await apiJson<any>('/accounting/import', { method: 'POST', body: JSON.stringify({ kind, source, csv, asOf, plugDifference: plug, dateOrder: dateOrder || undefined, commit }) });
            setResult(r); if (commit) batches.refetch();
        } catch (e: any) { setErr(e?.message || 'Could not read that file.'); } finally { setBusy(false); }
    };
    const undo = async (batch: string) => {
        if (!window.confirm('Remove everything this import added?')) return;
        try { await apiJson(`/accounting/import/${batch}`, { method: 'DELETE' }); batches.refetch(); } catch (e: any) { setErr(e?.message || 'Could not undo.'); }
    };

    return (
        <div className="max-w-3xl">
            <p className="mb-4 text-sm text-[#5F6368]">Bring your history across in three steps. Every file is checked first and nothing is saved until you confirm. Each import can be undone.</p>
            <div className="mb-3 flex flex-wrap gap-2">{SOURCES.map((s) => <button key={s.id} onClick={() => { setSource(s.id); setResult(null); }} className={`rounded-full px-4 py-1.5 text-sm ${source === s.id ? 'bg-[#CFE4FF] font-medium text-[#0059D8]' : 'bg-[#F1F3F4] text-[#3C4043]'}`}>{s.label}</button>)}</div>
            <div className="mb-3 flex flex-wrap gap-2">{KINDS.map((k) => <button key={k.id} onClick={() => { setKind(k.id); setResult(null); }} className={`rounded-full px-4 py-1.5 text-sm ${kind === k.id ? 'bg-[#0059D8] font-medium text-white' : 'bg-[#F1F3F4] text-[#3C4043]'}`}>{k.label}</button>)}</div>
            <p className="mb-3 text-xs text-[#5F6368]">Export from {SOURCES.find((s) => s.id === source)!.label}: {hint}</p>
            <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#C4C7C5] p-4 text-sm text-[#3C4043]">
                <Upload size={16} />{fileName || 'Choose a CSV file'}
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setFileName(f.name); setCsv(await f.text()); setResult(null); }} />
            </label>
            {kind === 'opening' && (<div className="mb-3 flex flex-wrap items-end gap-4">
                <div><label className={labelClass}>Balances as at</label><input type="date" className={`${fieldClass} w-44`} value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
                <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" checked={plug} onChange={(e) => setPlug(e.target.checked)} />Put any difference in Opening Balance Equity</label>
            </div>)}
            {kind === 'journals' && (<div className="mb-3"><label className={labelClass}>Date format in the file</label>
                <select className={`${fieldClass} w-60`} value={dateOrder} onChange={(e) => setDateOrder(e.target.value as any)}><option value="">Automatic for {SOURCES.find((s) => s.id === source)!.label}</option><option value="dmy">Day / month / year</option><option value="mdy">Month / day / year</option></select></div>)}
            <div className="flex gap-2">
                <TonalButton disabled={!csv || busy} onClick={() => run(false)}>{busy ? 'Checking…' : 'Check the file'}</TonalButton>
                {result?.ok && !result.committed && <PrimaryButton busy={busy} onClick={() => run(true)}>Import now</PrimaryButton>}
            </div>
            <ErrorNote text={err} />
            {result && (
                <div className="mt-4 rounded-xl border border-[#E0E0E0] p-4 text-sm">
                    <p className={`font-medium ${result.ok ? 'text-[#137333]' : 'text-[#B31412]'}`}>{result.committed ? (result.ok ? 'Imported.' : 'Imported with problems.') : result.ok ? 'The file looks good.' : 'The file needs fixing before it can be imported.'}</p>
                    <ul className="mt-1 list-disc pl-5 text-[#3C4043]">{result.summary.map((s: string) => <li key={s}>{s}</li>)}</ul>
                    {result.warnings.map((w: string) => <p key={w} className="mt-2 text-xs text-[#B06000]">{w}</p>)}
                    {result.errors.length > 0 && <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-[#B31412]">{result.errors.slice(0, 50).map((e: string) => <li key={e}>{e}</li>)}</ul>}
                    {result.errors.length > 50 && <p className="mt-1 text-xs text-[#5F6368]">…and {result.errors.length - 50} more.</p>}
                </div>
            )}
            {(batches.data?.batches ?? []).length > 0 && (
                <div className="mt-8"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#5F6368]">Past imports</h3>
                    {batches.data!.batches.map((b) => <Row key={b.batch} label={`${b.entries} entries, ${b.from} to ${b.to}`} value={<button className="text-xs font-medium text-[#B31412]" onClick={() => undo(b.batch)}>Undo</button>} />)}
                </div>
            )}
        </div>
    );
}

/** VAT: settings and the return, shown in Settings. Enterprise plan; other plans see the upgrade card. */
export const VatSettingsPanel: React.FC = () => {
    const access = useAccountingAccess();
    const qc = useQueryClient();
    const enabled = !!access.data?.enabled;
    const settings = useReport<VatSettings>('/accounting/vat/settings', enabled);
    const now = new Date();
    const [from, setFrom] = useState(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10));
    const [to, setTo] = useState(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10));
    if (access.isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
    if (!enabled) return <Upgrade />;
    if (settings.isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
    if (settings.error) return <ErrorNote text={(settings.error as any)?.message} />;
    return (
        <div className="flex max-w-4xl flex-col gap-5">
            <div>
                <h2 className="font-['DM_Sans'] text-lg font-bold text-gray-900">VAT</h2>
                <p className="mt-0.5 text-sm text-gray-600">Whether this business charges VAT, the rate, and the return for a period. Invoices and supplier bills then carry VAT.</p>
            </div>
            <VatSettingsForm key={JSON.stringify(settings.data)} initial={settings.data!} onSaved={() => qc.invalidateQueries({ queryKey: ['accounting'] })} />
            {settings.data?.registered && (<>
                <div className="flex flex-wrap items-end gap-2">
                    <div><label className={labelClass}>Return period from</label><input type="date" className="h-9 rounded-[10px] bg-slate-100 px-3 font-['DM_Sans'] text-[11px] outline-none" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
                    <div><label className={labelClass}>to</label><input type="date" className="h-9 rounded-[10px] bg-slate-100 px-3 font-['DM_Sans'] text-[11px] outline-none" value={to} onChange={(e) => setTo(e.target.value)} /></div>
                </div>
                <Vat from={from} to={to} />
            </>)}
        </div>
    );
};

export function useAccountingAccess() {
    return useQuery({ queryKey: ['accounting', 'access'], queryFn: () => apiJson<{ enabled: boolean; planId: string }>('/accounting/access'), retry: false });
}

/** Trial balance, profit and loss, balance sheet and account ledger, shown inside Reports. A business without Enterprise sees the upgrade card. */
function CashFlow({ from, to }: Range) {
    const { data, error, isLoading } = useReport<any>(`/accounting/cash-flow?from=${from}&to=${to}`);
    const csv = () => download(`cash-flow-${from}-${to}.csv`, [['Section', 'Group', 'Account', 'Amount'], ...(['operating', 'investing', 'financing', 'other'] as const).flatMap((k) => data[k].groups.flatMap((g: Group) => g.lines.map((l) => [k, g.name, l.name, l.amount]))), ['', '', 'Opening cash', data.openingCash], ['', '', 'Closing cash', data.closingCash]]);
    const part = (title: string, sec: { groups: Group[]; total: number }) => (sec.groups.length > 0 ? <Section key={title} title={title} groups={sec.groups} total={sec.total} /> : null);
    return (
        <Stack>
            <Hero label="Net change in cash" value={data ? money(data.netChange) : '…'} pdf={`/accounting/pdf?report=cf&from=${from}&to=${to}`} action={data ? { label: 'Export CSV', onClick: csv } : undefined} />
            <Heading>Cash flow</Heading>
            <ErrorNote text={(error as any)?.message} />
            {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {data && (<>
                <div className={CARD}><div className={CARD_HEAD}><span className="text-sm font-semibold text-gray-900">Cash at the start</span><span className="text-sm font-bold tabular-nums text-gray-900">{money(data.openingCash)}</span></div></div>
                {part('Day-to-day business', data.operating)}{part('Equipment and property', data.investing)}{part('Owners and loans', data.financing)}{part('Uncategorised', data.other)}
                <div className={CARD}>
                    <div className={CARD_HEAD}><span className="text-sm font-semibold text-gray-900">Cash at the end</span><span className="text-sm font-bold tabular-nums text-gray-900">{money(data.closingCash)}</span></div>
                    <p className={`px-6 py-2 text-[11px] ${data.reconciles ? 'text-[#137333]' : 'text-[#B06000]'}`}>{data.reconciles ? 'The start, the movements and the end agree.' : 'The movements don’t add up to the change in cash. Some entries touch cash without a matching account, so check the Uncategorised group.'}</p>
                </div>
            </>)}
        </Stack>
    );
}

function Receivables() {
    const { data, error, isLoading } = useReport<{ rows: any[]; totals: Record<string, number> }>('/accounting/receivables-ageing');
    const cols = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total'] as const;
    const csv = () => download('receivables-ageing.csv', [['Customer', 'Current', '1-30', '31-60', '61-90', '90+', 'Total'], ...data!.rows.map((r) => [r.customer, ...cols.map((k) => r[k])])]);
    return (
        <Stack>
            <Hero label="Owed to you" value={data ? money(data.totals.total ?? 0) : '…'} pdf="/accounting/pdf?report=ar" action={data ? { label: 'Export CSV', onClick: csv } : undefined} />
            <Heading>Who owes you</Heading>
            <ErrorNote text={(error as any)?.message} />
            {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {data && (
                <div className={CARD}>
                    <div className="grid grid-cols-[1fr_repeat(6,5.5rem)] gap-2 border-b border-violet-100 px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500"><span>Customer</span><span className="text-right">Current</span><span className="text-right">1-30</span><span className="text-right">31-60</span><span className="text-right">61-90</span><span className="text-right">90+</span><span className="text-right">Total</span></div>
                    {data.rows.length === 0 && <p className="px-6 py-4 text-sm text-gray-500">No unpaid invoices.</p>}
                    {data.rows.map((r) => (
                        <div key={r.customerId ?? r.customer} className="grid grid-cols-[1fr_repeat(6,5.5rem)] gap-2 border-b border-gray-100 px-6 py-3 text-sm tabular-nums"><span className="truncate font-sans">{r.customer}</span>{cols.map((k) => <span key={k} className={`text-right ${k === 'total' ? 'font-bold' : ''} ${k === 'd90_plus' && r[k] > 0 ? 'text-[#B31412]' : ''}`}>{r[k] ? money(r[k]) : ''}</span>)}</div>
                    ))}
                    {data.rows.length > 0 && <div className="grid grid-cols-[1fr_repeat(6,5.5rem)] gap-2 bg-gray-50 px-6 py-3 text-sm font-bold tabular-nums"><span>Total</span>{cols.map((k) => <span key={k} className="text-right">{money(data.totals[k] ?? 0)}</span>)}</div>}
                    <p className="border-t border-violet-100 px-6 py-2 text-[11px] text-gray-500">An invoice counts as due on its follow-up date, or 30 days after it was issued.</p>
                </div>
            )}
            <Quotes />
            <CreditNotes direction="CUSTOMER" />
        </Stack>
    );
}

interface JLine { accountId: string; debit: string; credit: string; memo: string }
const blankLine = (): JLine => ({ accountId: '', debit: '', credit: '', memo: '' });

function JournalForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const accounts = useReport<{ accounts: { id: string; code: string | null; name: string }[] }>('/accounting/accounts');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [memo, setMemo] = useState('');
    const [lines, setLines] = useState<JLine[]>([blankLine(), blankLine()]);
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const d = lines.reduce((t, l) => t + (Number(l.debit) || 0), 0), c = lines.reduce((t, l) => t + (Number(l.credit) || 0), 0);
    const set = (i: number, patch: Partial<JLine>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
    const save = async () => {
        setBusy(true); setErr(null);
        try { await apiJson('/accounting/journals', { method: 'POST', body: JSON.stringify({ date, memo, lines: lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, memo: l.memo })) }) }); onSaved(); onClose(); }
        catch (e: any) { setErr(e?.message || 'Could not post the journal.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open size="lg" title="New journal entry" onClose={onClose}>
            <ErrorNote text={err} />
            <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                    <div><label className={labelClass}>Date</label><input type="date" className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
                    <div className="col-span-2"><label className={labelClass}>Description</label><input className={fieldClass} placeholder="What is this entry for?" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
                </div>
                {lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-[1fr_6rem_6rem_1.5rem] items-center gap-2">
                        <select className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })}><option value="">Account…</option>{(accounts.data?.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ''}{a.name}</option>)}</select>
                        <input type="number" step="0.01" min={0} placeholder="Debit" className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} />
                        <input type="number" step="0.01" min={0} placeholder="Credit" className="h-9 rounded-lg border border-[#C4C7C5] px-2 text-xs" value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} />
                        {lines.length > 2 ? <button type="button" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} className="text-[#B31412]">×</button> : <span />}
                    </div>
                ))}
                <button type="button" onClick={() => setLines((ls) => [...ls, blankLine()])} className="text-xs font-semibold text-[#0059D8]">+ Add a line</button>
                <div className={`flex items-center justify-between rounded-xl px-4 py-2 text-sm ${Math.abs(d - c) < 0.005 && d > 0 ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#FEF7E0] text-[#B06000]'}`}><span>Debits {money(d)} · Credits {money(c)}</span><span>{Math.abs(d - c) < 0.005 && d > 0 ? 'Balanced' : `Out by ${money(Math.abs(d - c))}`}</span></div>
                <p className="text-[11px] text-[#5F6368]">A posted journal is never edited. To correct one, reverse it and post the right one.</p>
                <PrimaryButton busy={busy} onClick={save} disabled={!memo.trim() || d <= 0 || Math.abs(d - c) >= 0.005} className="w-full">Post journal</PrimaryButton>
            </div>
        </Dialog>
    );
}

function Journals({ from, to }: Range) {
    const qc = useQueryClient();
    const [q, setQ] = useState(''); const [open, setOpen] = useState<string | null>(null); const [adding, setAdding] = useState(false); const [locking, setLocking] = useState(false);
    const [err, setErr] = useState<string | null>(null); const [lockDate, setLockDate] = useState(''); const [view, setView] = useState<'entries' | 'history'>('entries');
    const list = useReport<{ journals: any[] }>(`/accounting/journals?from=${from}&to=${to}&q=${encodeURIComponent(q)}`);
    const lock = useReport<{ lockedThrough: string | null }>('/accounting/lock');
    const refresh = () => qc.invalidateQueries({ queryKey: ['accounting'] });
    const reverse = async (id: string) => {
        if (!window.confirm('Reverse this journal? A new entry that cancels it will be posted dated today.')) return;
        try { await apiJson(`/accounting/journals/${id}/reverse`, { method: 'POST', body: '{}' }); refresh(); } catch (e: any) { setErr(e?.message || 'Could not reverse it.'); }
    };
    const saveLock = async (date: string | null) => {
        try { await apiJson('/accounting/lock', { method: 'PUT', body: JSON.stringify({ lockedThrough: date }) }); setLocking(false); refresh(); } catch (e: any) { setErr(e?.message || 'Could not change the lock.'); }
    };
    const locked = lock.data?.lockedThrough;
    return (
        <Stack>
            <Hero label="Books locked through" value={locked ?? 'Not locked'} />
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Heading>Journals</Heading>
                <div className="flex gap-2">
                    <button onClick={() => { setLockDate(locked ?? ''); setLocking(true); }} className="h-8 rounded-[10px] bg-[#CFE4FF] px-4 font-['DM_Sans'] text-[11px] font-bold text-[#0059D8] hover:bg-[#BBD7FF]">{locked ? 'Change lock' : 'Lock a period'}</button>
                    <button onClick={() => setAdding(true)} className="h-8 rounded-[10px] bg-[#0B57D0] px-4 font-['DM_Sans'] text-[11px] font-bold text-white hover:bg-[#0842A0]">New journal</button>
                </div>
            </div>
            <div className="flex h-8 w-fit items-center gap-1 rounded-[10px] bg-slate-100 p-1 md:bg-[#F8FAFD]">
                {([['entries', 'Entries'], ['history', 'Change history']] as const).map(([id, label]) => <button key={id} onClick={() => setView(id)} className={`h-full rounded-lg px-4 font-['DM_Sans'] text-[11px] ${view === id ? 'bg-white font-bold text-gray-900 shadow-[0px_2px_4px_0px_rgba(0,0,0,0.10)]' : 'text-gray-900 hover:bg-white/50'}`}>{label}</button>)}
            </div>
            {view === 'history' ? <ChangeHistory /> : <>
            <input className="h-9 rounded-[10px] bg-slate-100 px-3 font-['DM_Sans'] text-[11px] outline-none" placeholder="Search by description or reference…" value={q} onChange={(e) => setQ(e.target.value)} />
            <ErrorNote text={err ?? (list.error as any)?.message} />
            {list.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {list.data && (
                <div className={CARD}>
                    {list.data.journals.length === 0 && <p className="px-6 py-4 text-sm text-gray-500">No entries in this period.</p>}
                    {list.data.journals.map((j: any) => {
                        const total = j.journal_lines.reduce((t: number, l: any) => t + Number(l.debit), 0);
                        return (
                            <div key={j.id} className="border-b border-gray-100">
                                <button type="button" onClick={() => setOpen(open === j.id ? null : j.id)} className="flex w-full items-center justify-between gap-4 px-6 py-3 text-left text-sm hover:bg-gray-50">
                                    <span className="min-w-0"><span className="block truncate font-medium text-gray-900">{j.description || j.reference_number}</span><span className="text-[11px] text-gray-500">{j.entry_date} · {j.reference_number ?? ''} · {String(j.source_type).toLowerCase()}</span></span>
                                    <span className="tabular-nums">{money(total)}</span>
                                </button>
                                {open === j.id && (
                                    <div className="bg-gray-50/60 px-6 pb-3">
                                        {j.journal_lines.map((l: any, i: number) => (
                                            <div key={i} className="grid grid-cols-[1fr_6rem_6rem] gap-2 py-1 text-[13px] text-gray-700"><span className="truncate">{l.accounts?.code ? `${l.accounts.code} · ` : ''}{l.accounts?.name}</span><span className="text-right tabular-nums">{Number(l.debit) ? money(Number(l.debit)) : ''}</span><span className="text-right tabular-nums">{Number(l.credit) ? money(Number(l.credit)) : ''}</span></div>
                                        ))}
                                        {j.reversible && <button onClick={() => reverse(j.id)} className="mt-2 text-xs font-semibold text-[#B31412]">Reverse this entry</button>}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {list.data.journals.length >= 300 && <p className="px-6 py-2 text-[11px] text-[#B06000]">Showing the latest 300. Narrow the dates to see others.</p>}
                </div>
            )}
            </>}
            {adding && <JournalForm onClose={() => setAdding(false)} onSaved={refresh} />}
            {locking && (
                <Dialog open title="Lock the books" onClose={() => setLocking(false)}>
                    <p className="mb-3 text-sm text-[#5F6368]">Nothing dated on or before this day can be added, changed or removed, whether it comes from the cashbook, invoices, bills or journals. This is what makes a closed month or year final.</p>
                    <label className={labelClass}>Locked through</label>
                    <input type="date" className={`${fieldClass} mb-4`} value={lockDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setLockDate(e.target.value)} />
                    <div className="flex gap-2">
                        <PrimaryButton onClick={() => saveLock(lockDate || null)} disabled={!lockDate} className="flex-1">Lock</PrimaryButton>
                        {locked && <TonalButton onClick={() => saveLock(null)} className="flex-1">Unlock everything</TonalButton>}
                    </div>
                    <p className="mt-3 text-[11px] text-[#5F6368]">Every lock and unlock is recorded in the audit log.</p>
                </Dialog>
            )}
        </Stack>
    );
}

const TABLE_LABEL: Record<string, string> = { accounts: 'Chart of accounts', cashbook_entries: 'Cashbook entry', journal_entries: 'Journal', suppliers: 'Supplier', purchase_bills: 'Supplier bill', customer_invoices: 'Customer invoice', accounting_settings: 'Period lock' };
const FIELD_LABEL: Record<string, string> = { account_id: 'account', entry_date: 'date', due_date: 'due date', bill_date: 'bill date', follow_up_date: 'follow-up date', locked_through: 'locked through', tax_number: 'TPIN', payment_terms_days: 'payment terms', is_active: 'active', voided_at: 'cancelled' };
const show = (v: any) => (v === null || v === undefined || v === '' ? 'empty' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function describe(c: any): { title: string; detail: string } {
    const ch = c.changed ?? {};
    const name = ch.name ?? ch.description ?? ch.reference_number ?? ch.code ?? '';
    if (c.op === 'UPDATE') return { title: `${TABLE_LABEL[c.table_name] ?? c.table_name} changed`, detail: Object.entries(ch).map(([k, v]: [string, any]) => `${FIELD_LABEL[k] ?? k.replace(/_/g, ' ')}: ${show(v.from)} → ${show(v.to)}`).join(' · ') };
    return { title: `${TABLE_LABEL[c.table_name] ?? c.table_name} ${c.op === 'INSERT' ? 'added' : 'removed'}`, detail: String(name).slice(0, 120) };
}

function ChangeHistory() {
    const [table, setTable] = useState('');
    const { data, error, isLoading } = useReport<{ changes: any[] }>(`/accounting/changes${table ? `?table=${table}` : ''}`);
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-500">Changes to your chart of accounts, journals, cashbook classifications, bills, invoices and the lock. The system’s own automatic postings aren’t listed.</p>
                <select className="h-8 rounded-[10px] bg-slate-100 px-3 font-['DM_Sans'] text-[11px] outline-none" value={table} onChange={(e) => setTable(e.target.value)}>
                    <option value="">Everything</option>{Object.entries(TABLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
            </div>
            <ErrorNote text={(error as any)?.message} />
            {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {data && (
                <div className={CARD}>
                    {data.changes.length === 0 && <p className="px-6 py-4 text-sm text-gray-500">No changes recorded yet. From now on, edits will appear here.</p>}
                    {data.changes.map((c) => { const d = describe(c); return (
                        <div key={c.id} className="border-b border-gray-100 px-6 py-3 text-sm">
                            <div className="flex items-center justify-between gap-4"><span className="font-medium text-gray-900">{d.title}</span><span className="shrink-0 text-[11px] text-gray-500">{new Date(c.at).toLocaleString()}{c.actorName ? ` · ${c.actorName}` : ''}</span></div>
                            {d.detail && <p className="mt-0.5 break-words text-[12px] text-gray-600">{d.detail}</p>}
                        </div>
                    ); })}
                </div>
            )}
        </div>
    );
}

function Performance({ from, to }: Range) {
    const [view, setView] = useState<'budget' | 'compare'>('budget'); const [against, setAgainst] = useState<'previous' | 'year'>('previous');
    const bud = useReport<any>(`/accounting/budget-vs-actual?from=${from}&to=${to}`, view === 'budget');
    const cmp = useReport<any>(`/accounting/compare?from=${from}&to=${to}&against=${against}`, view === 'compare');
    const pctText = (n: number | null) => (n == null ? '' : `${n > 0 ? '+' : ''}${n}%`);
    const budgetCsv = () => download(`budget-vs-actual-${from}-${to}.csv`, [['Type', 'Account', 'Budget', 'Actual', 'Variance'], ...(['income', 'expenses'] as const).flatMap((k) => bud.data[k].lines.map((l: any) => [k, l.name, l.budget, l.actual, l.variance]))]);
    const cmpCsv = () => download(`compare-${from}-${to}.csv`, [['Type', 'Account', 'This period', 'Compared', 'Change', 'Change %'], ...(['income', 'expenses'] as const).flatMap((k) => cmp.data[k].groups.flatMap((g: any) => g.lines.map((l: any) => [k, l.name, l.current, l.previous, l.change, l.changePct ?? '']))), ['', 'Net profit', cmp.data.net.current, cmp.data.net.previous, cmp.data.net.change, cmp.data.net.changePct ?? '']]);
    const toggle = (
        <div className="flex h-8 w-fit items-center gap-1 rounded-[10px] bg-slate-100 p-1 md:bg-[#F8FAFD]">
            {([['budget', 'Budget vs actual'], ['compare', 'Compare periods']] as const).map(([id, label]) => <button key={id} onClick={() => setView(id)} className={`h-full rounded-lg px-4 font-['DM_Sans'] text-[11px] ${view === id ? 'bg-white font-bold text-gray-900 shadow-[0px_2px_4px_0px_rgba(0,0,0,0.10)]' : 'text-gray-900 hover:bg-white/50'}`}>{label}</button>)}
        </div>
    );
    if (view === 'budget') {
        const d = bud.data;
        const part = (title: string, s: any, varianceOf: (s: any) => number) => (
            <div className={CARD}>
                <div className={CARD_HEAD}><span className="text-sm font-semibold text-gray-900">{title}</span><span className="text-sm font-bold tabular-nums text-gray-900">{money(s.actual)} <span className="font-normal text-gray-500">of {money(s.budget)}</span></span></div>
                {s.lines.length === 0 && <p className="px-6 py-3 text-sm text-gray-500">Nothing recorded.</p>}
                {s.lines.map((l: any) => (
                    <div key={l.accountId} className="grid grid-cols-[1fr_6.5rem_6.5rem_6.5rem] items-center gap-2 border-b border-gray-100 px-6 py-2 text-sm tabular-nums">
                        <span className="truncate font-sans text-gray-900">{l.name}{l.usedPct != null && <span className={`ml-2 text-[10px] ${l.usedPct > 100 && title === 'Expenses' ? 'text-[#B31412]' : 'text-gray-500'}`}>{l.usedPct}%</span>}</span>
                        <span className="text-right text-gray-500">{l.budget ? money(l.budget) : '—'}</span><span className="text-right">{money(l.actual)}</span>
                        <span className={`text-right font-medium ${l.variance < 0 ? 'text-[#B31412]' : 'text-[#137333]'}`}>{l.budget ? money(l.variance) : ''}</span>
                    </div>
                ))}
                <div className="flex items-center justify-between border-t border-violet-100 bg-gray-50 px-6 py-3 text-sm font-semibold"><span>{title === 'Income' ? 'Ahead of target' : 'Room left'}</span><span className="tabular-nums">{money(varianceOf(s))}</span></div>
            </div>
        );
        return (
            <Stack>
                <Hero label="Profit against budget" value={d ? money(d.actualProfit) : '…'} pdf={`/accounting/pdf?report=budget&from=${from}&to=${to}`} action={d ? { label: 'Export CSV', onClick: budgetCsv } : undefined} />
                <div className="flex items-center justify-between gap-3"><Heading>Budget vs actual</Heading>{toggle}</div>
                <ErrorNote text={(bud.error as any)?.message} />
                {bud.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
                {d && !d.anyBudget && <p className="rounded-xl bg-[#FEF7E0] px-4 py-3 text-[12px] text-[#B06000]">No budgets are set inside these dates. Set budgets on the Profit/Loss tab, then they show here beside what really happened.</p>}
                {d && (<>{part('Income', d.income, (s) => Math.round((s.actual - s.budget) * 100) / 100)}{part('Expenses', d.expenses, (s) => Math.round((s.budget - s.actual) * 100) / 100)}</>)}
            </Stack>
        );
    }
    const d = cmp.data;
    const grp = (title: string, s: any) => (
        <div className={CARD}>
            <div className={CARD_HEAD}><span className="text-sm font-semibold text-gray-900">{title}</span><span className="text-sm font-bold tabular-nums text-gray-900">{money(s.current)}</span></div>
            {s.groups.length === 0 && <p className="px-6 py-3 text-sm text-gray-500">Nothing recorded.</p>}
            {s.groups.map((g: any) => (
                <div key={g.name} className="grid grid-cols-[1fr_6.5rem_6.5rem_6.5rem_4rem] items-center gap-2 border-b border-gray-100 px-6 py-2.5 text-sm tabular-nums">
                    <span className="truncate font-sans text-gray-900">{g.name}</span><span className="text-right">{money(g.current)}</span><span className="text-right text-gray-500">{money(g.previous)}</span>
                    <span className="text-right">{money(g.change)}</span><span className={`text-right text-[11px] ${(g.changePct ?? 0) > 0 === (title === 'Income') ? 'text-[#137333]' : 'text-[#B31412]'}`}>{pctText(g.changePct)}</span>
                </div>
            ))}
        </div>
    );
    return (
        <Stack>
            <Hero label="Net profit" value={d ? money(d.net.current) : '…'} pdf={`/accounting/pdf?report=compare&from=${from}&to=${to}&against=${against}`} action={d ? { label: 'Export CSV', onClick: cmpCsv } : undefined} />
            <div className="flex flex-wrap items-center justify-between gap-3"><Heading>Compare periods</Heading>
                <div className="flex items-center gap-2">{toggle}
                    <select className="h-8 rounded-[10px] bg-slate-100 px-3 font-['DM_Sans'] text-[11px] outline-none" value={against} onChange={(e) => setAgainst(e.target.value as any)}><option value="previous">Against the period before</option><option value="year">Against the same dates last year</option></select></div></div>
            <ErrorNote text={(cmp.error as any)?.message} />
            {cmp.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {d && (<>
                <p className="text-[11px] text-gray-500">{d.from} to {d.to} compared with {d.comparedWith.from} to {d.comparedWith.to}. Columns: this period, compared period, change, change %.</p>
                {grp('Income', d.income)}{grp('Expenses', d.expenses)}
                <div className={CARD}><div className="grid grid-cols-[1fr_6.5rem_6.5rem_6.5rem_4rem] items-center gap-2 px-6 py-3 text-sm font-bold tabular-nums"><span className="font-sans">Net profit</span><span className="text-right">{money(d.net.current)}</span><span className="text-right text-gray-500">{money(d.net.previous)}</span><span className="text-right">{money(d.net.change)}</span><span className="text-right text-[11px]">{pctText(d.net.changePct)}</span></div></div>
            </>)}
        </Stack>
    );
}

interface VatSettings { registered: boolean; rate: number; tpin: string | null; vatNumber: string | null }

function VatSettingsForm({ initial, onSaved, compact }: { initial: VatSettings; onSaved: () => void; compact?: boolean }) {
    const [f, setF] = useState({ registered: initial.registered, rate: String(initial.rate), tpin: initial.tpin ?? '', vatNumber: initial.vatNumber ?? '' });
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const save = async () => {
        setBusy(true); setErr(null);
        try { await apiJson('/accounting/vat/settings', { method: 'PUT', body: JSON.stringify({ ...f, rate: Number(f.rate) }) }); onSaved(); }
        catch (e: any) { setErr(e?.message || 'Could not save.'); } finally { setBusy(false); }
    };
    return (
        <div className={`${CARD} p-5`}>
            <ErrorNote text={err} />
            <label className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900"><input type="checkbox" checked={f.registered} onChange={(e) => setF({ ...f, registered: e.target.checked })} />This business is registered for VAT</label>
            {f.registered && (
                <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
                    <div><label className={labelClass}>VAT rate %</label><input type="number" step="0.01" className={fieldClass} value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></div>
                    <div><label className={labelClass}>TPIN</label><input className={fieldClass} value={f.tpin} onChange={(e) => setF({ ...f, tpin: e.target.value })} /></div>
                    <div className="col-span-2"><label className={labelClass}>VAT registration number</label><input className={fieldClass} value={f.vatNumber} onChange={(e) => setF({ ...f, vatNumber: e.target.value })} /></div>
                </div>
            )}
            <p className="mt-3 text-[11px] text-gray-500">When on, invoice prices are treated as including VAT, and supplier bills add the VAT you can claim back. The standard rate is usually 16%; confirm the rate and your filing dates with ZRA.</p>
            <PrimaryButton busy={busy} onClick={save} className="mt-3">Save VAT settings</PrimaryButton>
        </div>
    );
}

function VatEntryForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const accounts = useReport<{ accounts: { id: string; code: string | null; name: string; type: string }[] }>('/accounting/accounts');
    const [direction, setDirection] = useState<'OUTPUT' | 'INPUT'>('OUTPUT'); const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [gross, setGross] = useState(''); const [accountId, setAccountId] = useState(''); const [taxCode, setTaxCode] = useState('STANDARD'); const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const list = (accounts.data?.accounts ?? []).filter((a) => a.type === (direction === 'OUTPUT' ? 'INCOME' : 'EXPENSE'));
    const save = async () => {
        setBusy(true); setErr(null);
        try { await apiJson('/accounting/vat/adjustments', { method: 'POST', body: JSON.stringify({ direction, date, gross: Number(gross), accountId, taxCode, note }) }); onSaved(); onClose(); }
        catch (e: any) { setErr(e?.message || 'Could not add it.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open title="Add VAT for sales or costs without an invoice" onClose={onClose}>
            <ErrorNote text={err} />
            <p className="mb-3 text-sm text-[#5F6368]">For cash sales already recorded at their full price, or costs you paid directly. Enter the total including VAT; the VAT is split out and moved to the right VAT account.</p>
            <div className="mb-3 flex gap-2">{([['OUTPUT', 'Sales I made'], ['INPUT', 'Costs I paid']] as const).map(([id, l]) => <button key={id} type="button" onClick={() => { setDirection(id); setAccountId(''); }} className={`rounded-full px-4 py-1.5 text-sm ${direction === id ? 'bg-[#CFE4FF] font-medium text-[#0059D8]' : 'bg-[#F1F3F4] text-[#3C4043]'}`}>{l}</button>)}</div>
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>Date</label><input type="date" className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
                    <div><label className={labelClass}>Total including VAT</label><input type="number" step="0.01" className={fieldClass} value={gross} onChange={(e) => setGross(e.target.value)} /></div>
                </div>
                <div><label className={labelClass}>{direction === 'OUTPUT' ? 'Income account they were recorded in' : 'Expense account they were recorded in'}</label>
                    <select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">Choose…</option>{list.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ''}{a.name}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>VAT type</label><select className={fieldClass} value={taxCode} onChange={(e) => setTaxCode(e.target.value)}><option value="STANDARD">Standard rate</option><option value="ZERO">Zero-rated</option><option value="EXEMPT">Exempt</option></select></div>
                    <div><label className={labelClass}>Note</label><input className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} /></div>
                </div>
                <PrimaryButton busy={busy} onClick={save} disabled={!accountId || !(Number(gross) > 0)} className="w-full">Add</PrimaryButton>
            </div>
        </Dialog>
    );
}

function Vat({ from, to }: Range) {
    const qc = useQueryClient();
    const navigate = useNavigate();
    const settings = useReport<VatSettings>('/accounting/vat/settings');
    const ret = useReport<any>(`/accounting/vat/return?from=${from}&to=${to}`, !!settings.data?.registered);
    const past = useReport<{ returns: any[] }>('/accounting/vat/returns', !!settings.data?.registered);
    const [adding, setAdding] = useState(false); const [filing, setFiling] = useState(false); const [ref, setRef] = useState(''); const [err, setErr] = useState<string | null>(null); const [showTx, setShowTx] = useState(false);
    const refresh = () => qc.invalidateQueries({ queryKey: ['accounting'] });
    const file = async () => {
        try { await apiJson('/accounting/vat/return/file', { method: 'POST', body: JSON.stringify({ from, to, paymentReference: ref }) }); setFiling(false); refresh(); }
        catch (e: any) { setErr(e?.message || 'Could not record it.'); }
    };
    if (settings.isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
    if (settings.error) return <ErrorNote text={(settings.error as any)?.message} />;
    if (!settings.data?.registered) return (
        <Stack>
            <Hero label="VAT" value="Not switched on" />
            <Heading>VAT</Heading>
            <div className={`${CARD} p-5`}>
                <p className="text-sm text-gray-700">VAT is switched off for this business. Turn it on and set your rate and TPIN in Settings, and your VAT return will build here.</p>
                <PrimaryButton className="mt-3" onClick={() => navigate('/settings?tab=vat')}>Open VAT settings</PrimaryButton>
            </div>
        </Stack>
    );
    const d = ret.data;
    const row = (label: string, value: string, vat?: string, bold?: boolean) => (
        <div className={`grid grid-cols-[1fr_8rem_8rem] items-center gap-2 border-b border-gray-100 px-6 py-2.5 text-sm tabular-nums ${bold ? 'bg-gray-50 font-bold' : ''}`}><span className="font-sans">{label}</span><span className="text-right">{value}</span><span className="text-right">{vat ?? ''}</span></div>
    );
    const csv = () => download(`vat-return-${from}-${to}.csv`, [['Date', 'Direction', 'Type', 'Net', 'VAT', 'Source', 'Reference', 'Party'], ...d.transactions.map((t: any) => [t.tx_date, t.direction, t.tax_code, t.net, t.vat, t.source_type, t.reference ?? '', t.counterparty ?? ''])]);
    return (
        <Stack>
            <Hero label={d ? (d.position === 'PAYABLE' ? 'VAT payable to ZRA' : 'VAT refundable') : 'VAT return'} value={d ? money(Math.abs(d.netVat)) : '…'} pdf={`/accounting/pdf?report=vat&from=${from}&to=${to}`} action={d ? { label: 'Export CSV', onClick: csv } : undefined} />
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Heading>VAT return</Heading>
                <div className="flex gap-2">
                    <button onClick={() => setAdding(true)} className="h-8 rounded-[10px] bg-[#CFE4FF] px-4 font-['DM_Sans'] text-[11px] font-bold text-[#0059D8] hover:bg-[#BBD7FF]">Add VAT entry</button>
                    {d && !d.filed && <button onClick={() => setFiling(true)} className="h-8 rounded-[10px] bg-[#0B57D0] px-4 font-['DM_Sans'] text-[11px] font-bold text-white hover:bg-[#0842A0]">Record as filed</button>}
                </div>
            </div>
            <ErrorNote text={err ?? (ret.error as any)?.message} />
            {ret.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {d && (<>
                <p className="text-[11px] text-gray-500">Period {d.from} to {d.to}. Due by {d.dueBy} (the 18th of the following month, confirm with ZRA). Use the date button at the top to change the period.{d.filed ? ` Recorded as filed on ${new Date(d.filed.filed_at).toLocaleDateString()}.` : ''}</p>
                <div className={CARD}>
                    <div className={`${CARD_HEAD} text-[10px] font-semibold uppercase tracking-wider text-gray-500`}><span>Sales</span><span className="flex gap-10"><span className="w-28 text-right">Value</span><span className="w-28 text-right">VAT</span></span></div>
                    {row('Standard-rated sales', money(d.sales.standardNet), money(d.sales.standardVat))}{row('Zero-rated sales', money(d.sales.zeroNet), money(0))}{row('Exempt sales', money(d.sales.exemptNet), money(0))}{row('Output VAT', '', money(d.outputVat), true)}
                </div>
                <div className={CARD}>
                    <div className={`${CARD_HEAD} text-[10px] font-semibold uppercase tracking-wider text-gray-500`}><span>Purchases</span><span className="flex gap-10"><span className="w-28 text-right">Value</span><span className="w-28 text-right">VAT</span></span></div>
                    {row('Standard-rated purchases', money(d.purchases.standardNet), money(d.purchases.standardVat))}{row('Zero-rated purchases', money(d.purchases.zeroNet), money(0))}{row('Exempt purchases', money(d.purchases.exemptNet), money(0))}{row('Input VAT recoverable', '', money(d.inputVat), true)}
                </div>
                <div className={`rounded-xl px-4 py-3 text-[12px] ${d.ledger.agrees ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#FEF7E0] text-[#B06000]'}`}>{d.ledger.agrees ? 'These figures agree with the VAT accounts in your books.' : `The VAT accounts in your books show output ${money(d.ledger.outputVat)} and input ${money(d.ledger.inputVat)} for this period, which differs from the records above. Check for VAT posted by hand.`}</div>
                <button onClick={() => setShowTx((v) => !v)} className="w-fit text-xs font-semibold text-[#0059D8]">{showTx ? 'Hide' : 'Show'} the {d.transactions.length} entries behind this return</button>
                {showTx && (
                    <div className={CARD}>
                        {d.transactions.length === 0 && <p className="px-6 py-3 text-sm text-gray-500">No VAT entries in this period.</p>}
                        {d.transactions.map((t: any) => (
                            <div key={t.id} className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-2 text-sm"><span className="min-w-0"><span className="block truncate text-gray-900">{t.reference ?? t.source_type}{t.counterparty ? ` · ${t.counterparty}` : ''}</span><span className="text-[11px] text-gray-500">{t.tx_date} · {t.direction === 'OUTPUT' ? 'sale' : 'purchase'} · {t.tax_code.toLowerCase()}</span></span><span className="text-right tabular-nums">{money(Number(t.net))}<span className="block text-[11px] text-gray-500">VAT {money(Number(t.vat))}</span></span></div>
                        ))}
                    </div>
                )}
            </>)}
            {(past.data?.returns ?? []).length > 0 && (
                <div><h3 className="mb-2 font-['DM_Sans'] text-xl font-semibold text-black">Filed returns</h3>
                    <div className={CARD}>{past.data!.returns.map((r) => <div key={r.id} className="flex items-center justify-between border-b border-gray-100 px-6 py-3 text-sm"><span>{r.period_start} to {r.period_end}{r.payment_reference ? ` · ${r.payment_reference}` : ''}</span><span className="tabular-nums">{money(Number(r.totals?.netVat ?? 0))}</span></div>)}</div></div>
            )}
            <button onClick={() => navigate('/settings?tab=vat')} className="w-fit text-xs font-semibold text-[#0059D8]">VAT settings (rate, TPIN, registration)</button>
            {adding && <VatEntryForm onClose={() => setAdding(false)} onSaved={refresh} />}
            {filing && (
                <Dialog open title="Record this return as filed" onClose={() => setFiling(false)}>
                    <p className="mb-3 text-sm text-[#5F6368]">This keeps a copy of the figures for {from} to {to}. It does not send anything to ZRA; file on TaxOnline first, then record it here.</p>
                    <label className={labelClass}>ZRA payment or filing reference (optional)</label>
                    <input className={`${fieldClass} mb-4`} value={ref} onChange={(e) => setRef(e.target.value)} />
                    <PrimaryButton onClick={file} className="w-full">Record as filed</PrimaryButton>
                </Dialog>
            )}
        </Stack>
    );
}

export const StatementsPanel: React.FC<{ view: 'tb' | 'bs' | 'gl' | 'cf' | 'jn' | 'ar' | 'pf' | 'vat'; from: string; to: string }> = ({ view, from, to }) => {
    const access = useAccountingAccess();
    if (access.isLoading) return <p className="p-4 text-sm text-gray-500">Loading…</p>;
    if (access.error) return <ErrorNote text={(access.error as any)?.message} />;
    if (!access.data?.enabled) return <Upgrade />;
    return <>{view === 'tb' && <TrialBalance from={from} to={to} />}{view === 'bs' && <BalanceSheet from={from} to={to} />}{view === 'gl' && <AccountLedger from={from} to={to} />}{view === 'cf' && <CashFlow from={from} to={to} />}{view === 'jn' && <Journals from={from} to={to} />}{view === 'ar' && <Receivables />}{view === 'pf' && <Performance from={from} to={to} />}{view === 'vat' && <Vat from={from} to={to} />}</>;
};

/** Import from other software, shown in Settings next to the Chart of Accounts. */
export const ImportPanel: React.FC = () => {
    const access = useAccountingAccess();
    if (access.isLoading) return <p className="text-sm text-[#5F6368]">Loading…</p>;
    if (!access.data?.enabled) return <Upgrade />;
    return <ImportTool />;
};
