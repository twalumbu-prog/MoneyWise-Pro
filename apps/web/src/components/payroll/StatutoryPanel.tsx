import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { Dialog, ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';
import { Upgrade, useAccountingAccess, downloadPdf } from '../accounting/AccountingParts';

const money = (n: number) => formatKwacha(n);
const AGENCY_NAME: Record<string, string> = { PAYE: 'ZRA (PAYE)', NAPSA: 'NAPSA', NHIMA: 'NHIMA' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Statutory {
    year: number; month: number; due: string; approvedRuns: number; pendingRuns: number; employeesMissingNumbers: number;
    runs: { id: string; period_label: string; status: string; accrued_at: string | null }[];
    employees: { staffId: string | null; name: string; napsaNumber: string | null; nhimaNumber: string | null; tpin: string | null; gross: number; paye: number; napsaEe: number; napsaEr: number; nhimaEe: number; nhimaEr: number }[];
    totals: { gross: number; paye: number; napsaEmployee: number; napsaEmployer: number; nhimaEmployee: number; nhimaEmployer: number };
    agencies: { agency: string; owed: number; paid: number; outstanding: number }[];
    payments: { id: string; agency: string; amount: number; paid_on: string; method: string | null; reference: string | null }[];
}

function download(name: string, rows: (string | number)[][]) {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function PaymentForm({ agency, year, month, outstanding, accrualOn, onClose, onSaved }: { agency: string; year: number; month: number; outstanding: number; accrualOn: boolean; onClose: () => void; onSaved: () => void }) {
    const accounts = useQuery<{ accounts: { id: string; code: string | null; name: string; type: string; subtype: string | null }[] }>({ queryKey: ['payroll-acct', 'accounts'], queryFn: () => apiJson('/accounting/accounts'), enabled: accrualOn, retry: false });
    const [amount, setAmount] = useState(outstanding.toFixed(2)); const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
    const [method, setMethod] = useState('Bank transfer'); const [reference, setReference] = useState(''); const [accountId, setAccountId] = useState('');
    const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
    const from = (accounts.data?.accounts ?? []).filter((a) => a.type === 'ASSET' && /bank|wallet|cash/i.test(`${a.subtype ?? ''} ${a.name}`));
    const save = async () => {
        setBusy(true); setErr(null);
        try { await apiJson('/accounting/payroll/statutory/payments', { method: 'POST', body: JSON.stringify({ agency, year, month, amount: Number(amount), paidOn, method, reference, accountId: accountId || undefined }) }); onSaved(); onClose(); }
        catch (e: any) { setErr(e?.message || 'Could not record the payment.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open title={`Record a payment to ${AGENCY_NAME[agency]}`} onClose={onClose}>
            <ErrorNote text={err} />
            <p className="mb-3 text-sm text-[#5F6368]">{MONTHS[month - 1]} {year} · {money(outstanding)} still to pay</p>
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>Amount</label><input type="number" step="0.01" className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                    <div><label className={labelClass}>Paid on</label><input type="date" className={fieldClass} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></div>
                </div>
                {accrualOn && <div><label className={labelClass}>Paid from</label><select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">Choose an account…</option>{from.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ''}{a.name}</option>)}</select></div>}
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>Method</label><input className={fieldClass} value={method} onChange={(e) => setMethod(e.target.value)} /></div>
                    <div><label className={labelClass}>Reference</label><input className={fieldClass} value={reference} onChange={(e) => setReference(e.target.value)} /></div>
                </div>
                <p className="text-[11px] text-[#5F6368]">{accrualOn ? 'This records a payment you made. It posts to your books and clears what is owed. It doesn’t send money from your wallet.' : 'Payroll accruals are off, so this is kept as a record only and nothing is posted to your books.'}</p>
                <PrimaryButton busy={busy} onClick={save} disabled={!(Number(amount) > 0) || (accrualOn && !accountId)} className="w-full">Record payment</PrimaryButton>
            </div>
        </Dialog>
    );
}

/** PAYE, NAPSA and NHIMA for each pay month, and payroll in the books. Shown in the Payroll page; Enterprise plan. */
export const StatutoryPanel: React.FC = () => {
    const access = useAccountingAccess();
    const qc = useQueryClient();
    const enabled = !!access.data?.enabled;
    const now = new Date(); const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const [year, setYear] = useState(prev.getUTCFullYear()); const [month, setMonth] = useState(prev.getUTCMonth() + 1);
    const [paying, setPaying] = useState<{ agency: string; outstanding: number } | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
    const status = useQuery<{ enabled: boolean; accrualFrom: string | null }>({ queryKey: ['payroll-acct', 'status'], queryFn: () => apiJson('/accounting/payroll/status'), enabled, retry: false });
    const data = useQuery<Statutory>({ queryKey: ['payroll-acct', 'statutory', year, month], queryFn: () => apiJson(`/accounting/payroll/statutory?year=${year}&month=${month}`), enabled, retry: false });
    const refresh = () => qc.invalidateQueries({ queryKey: ['payroll-acct'] });
    if (access.isLoading) return <p className="p-4 text-sm text-gray-500">Loading…</p>;
    if (!enabled) return <div className="p-5"><Upgrade /></div>;

    const toggle = async (on: boolean) => {
        if (on && !window.confirm('Turn on payroll in your books? From today, each approved payroll run posts gross pay, employer contributions and what is owed to ZRA, NAPSA and NHIMA to your accounts. Runs approved before today are not changed.')) return;
        setBusy(true); setErr(null);
        try { await apiJson('/accounting/payroll/accrual', { method: 'PUT', body: JSON.stringify({ enabled: on }) }); refresh(); } catch (e: any) { setErr(e?.message || 'Could not change it.'); } finally { setBusy(false); }
    };
    const post = async (runId: string) => {
        try { await apiJson('/accounting/payroll/accrue', { method: 'POST', body: JSON.stringify({ runId }) }); refresh(); } catch (e: any) { setErr(e?.message || 'Could not post the run.'); }
    };
    const d = data.data;
    const csv = (agency: string) => {
        if (!d) return;
        const head = agency === 'PAYE' ? ['Employee', 'TPIN', 'Gross pay', 'PAYE'] : ['Employee', agency === 'NAPSA' ? 'NAPSA no.' : 'NHIMA no.', 'Gross pay', 'Employee', 'Employer', 'Total'];
        const rows = d.employees.map((e) => agency === 'PAYE' ? [e.name, e.tpin ?? '', e.gross, e.paye] : agency === 'NAPSA' ? [e.name, e.napsaNumber ?? '', e.gross, e.napsaEe, e.napsaEr, e.napsaEe + e.napsaEr] : [e.name, e.nhimaNumber ?? '', e.gross, e.nhimaEe, e.nhimaEr, e.nhimaEe + e.nhimaEr]);
        download(`${agency.toLowerCase()}-${year}-${String(month).padStart(2, '0')}.csv`, [head, ...rows]);
    };
    const unposted = status.data?.enabled ? (d?.runs ?? []).filter((r) => r.status === 'CLEARED' && !r.accrued_at) : [];

    return (
        <div className="flex flex-col gap-4 overflow-y-auto p-5">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                    <div><div className="font-['DM_Sans'] text-sm font-bold text-gray-900">Payroll in your books</div>
                        <p className="mt-0.5 text-[12px] text-gray-600">{status.data?.enabled ? `On since ${status.data.accrualFrom}. Each approved run posts gross pay, employer NAPSA and NHIMA, and what is owed to ZRA, NAPSA and NHIMA. Paying staff clears what you owe them.` : 'Off. Payroll runs still pay staff and the schedules below still work, but only net pay reaches your books, and the PAYE, NAPSA and NHIMA you owe aren’t shown there.'}</p></div>
                    <button disabled={busy} onClick={() => toggle(!status.data?.enabled)} className={`h-8 shrink-0 rounded-[10px] px-4 font-['DM_Sans'] text-[11px] font-bold ${status.data?.enabled ? 'bg-[#F1F3F4] text-gray-700' : 'bg-[#0B57D0] text-white'}`}>{status.data?.enabled ? 'Turn off' : 'Turn on'}</button>
                </div>
            </div>
            <ErrorNote text={err ?? (data.error as any)?.message} />
            <div className="flex flex-wrap items-center gap-2">
                <select className="h-8 rounded-[10px] bg-slate-100 px-3 font-['DM_Sans'] text-[11px] outline-none" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                <select className="h-8 rounded-[10px] bg-slate-100 px-3 font-['DM_Sans'] text-[11px] outline-none" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[0, 1, 2, 3].map((k) => <option key={k} value={now.getUTCFullYear() - k}>{now.getUTCFullYear() - k}</option>)}</select>
                {d && <span className="text-[11px] text-gray-500">Pay month. Each agency is due by {d.due}, the 10th of the next month (confirm the dates with ZRA, NAPSA and NHIMA).</span>}
            </div>
            {data.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {d && d.approvedRuns === 0 && <p className="rounded-xl bg-[#FEF7E0] px-4 py-3 text-[12px] text-[#B06000]">No approved payroll run for {MONTHS[month - 1]} {year}{d.pendingRuns ? ` (${d.pendingRuns} waiting for approval)` : ''}.</p>}
            {unposted.map((r) => <div key={r.id} className="flex items-center justify-between rounded-xl bg-[#FEF7E0] px-4 py-3 text-[12px] text-[#B06000]"><span>{r.period_label} is approved but not posted to your books.</span><button onClick={() => post(r.id)} className="font-bold underline">Post to books</button></div>)}
            {d && d.employeesMissingNumbers > 0 && <p className="rounded-xl bg-[#FEF7E0] px-4 py-3 text-[12px] text-[#B06000]">{d.employeesMissingNumbers} employee{d.employeesMissingNumbers === 1 ? ' has' : 's have'} no NAPSA number or TPIN on record. Add them on the Staff Members tab before filing.</p>}
            {d && d.approvedRuns > 0 && (<>
                <div className="grid gap-3 md:grid-cols-3">
                    {d.agencies.map((a) => (
                        <div key={a.agency} className="rounded-xl bg-white p-4 outline outline-1 outline-offset-[-1px] outline-violet-100">
                            <div className="font-['DM_Sans'] text-sm font-bold text-gray-900">{AGENCY_NAME[a.agency]}</div>
                            <div className="mt-2 font-['DM_Sans'] text-2xl font-bold tabular-nums text-gray-900">{money(a.outstanding)}</div>
                            <div className="text-[11px] text-gray-500">still to pay · {money(a.owed)} owed · {money(a.paid)} paid</div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button onClick={() => downloadPdf(`/accounting/pdf?report=statutory&agency=${a.agency}&year=${year}&month=${month}`)} className="h-8 rounded-[10px] bg-[#CFE4FF] px-3 font-['DM_Sans'] text-[11px] font-bold text-[#0059D8]"><Download size={11} className="mr-1 inline" />PDF</button>
                                <button onClick={() => csv(a.agency)} className="h-8 rounded-[10px] bg-[#F1F3F4] px-3 font-['DM_Sans'] text-[11px] font-bold text-gray-700">CSV</button>
                                {a.outstanding > 0.005 && <button onClick={() => setPaying({ agency: a.agency, outstanding: a.outstanding })} className="h-8 rounded-[10px] bg-[#0B57D0] px-3 font-['DM_Sans'] text-[11px] font-bold text-white">Record payment</button>}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="overflow-x-auto rounded-xl bg-white outline outline-1 outline-offset-[-1px] outline-violet-100">
                    <table className="w-full min-w-[820px] text-sm tabular-nums">
                        <thead><tr className="border-b border-violet-100 text-[10px] uppercase tracking-wider text-gray-500"><th className="px-4 py-3 text-left font-semibold">Employee</th><th className="px-2 text-left font-semibold">NAPSA no.</th><th className="px-2 text-left font-semibold">TPIN</th><th className="px-2 text-right font-semibold">Gross</th><th className="px-2 text-right font-semibold">PAYE</th><th className="px-2 text-right font-semibold">NAPSA</th><th className="px-2 text-right font-semibold">NHIMA</th></tr></thead>
                        <tbody>
                            {d.employees.map((e) => <tr key={e.staffId ?? e.name} className="border-b border-gray-100"><td className="px-4 py-2.5 font-sans">{e.name}</td><td className={`px-2 ${e.napsaNumber ? '' : 'text-[#B06000]'}`}>{e.napsaNumber ?? 'missing'}</td><td className={`px-2 ${e.tpin ? '' : 'text-[#B06000]'}`}>{e.tpin ?? 'missing'}</td><td className="px-2 text-right">{money(e.gross)}</td><td className="px-2 text-right">{money(e.paye)}</td><td className="px-2 text-right">{money(e.napsaEe + e.napsaEr)}</td><td className="px-2 text-right">{money(e.nhimaEe + e.nhimaEr)}</td></tr>)}
                            <tr className="bg-gray-50 font-bold"><td className="px-4 py-3 font-sans">Total</td><td /><td /><td className="px-2 text-right">{money(d.totals.gross)}</td><td className="px-2 text-right">{money(d.totals.paye)}</td><td className="px-2 text-right">{money(d.totals.napsaEmployee + d.totals.napsaEmployer)}</td><td className="px-2 text-right">{money(d.totals.nhimaEmployee + d.totals.nhimaEmployer)}</td></tr>
                        </tbody>
                    </table>
                </div>
                {d.payments.length > 0 && (
                    <div><h3 className="mb-2 font-['DM_Sans'] text-base font-semibold text-black">Payments recorded</h3>
                        <div className="rounded-xl bg-white outline outline-1 outline-offset-[-1px] outline-violet-100">{d.payments.map((p) => <div key={p.id} className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 text-sm"><span>{AGENCY_NAME[p.agency]} · {p.paid_on}{p.reference ? ` · ${p.reference}` : ''}</span><span className="tabular-nums">{money(Number(p.amount))}</span></div>)}</div></div>
                )}
            </>)}
            {paying && <PaymentForm agency={paying.agency} year={year} month={month} outstanding={paying.outstanding} accrualOn={!!status.data?.enabled} onClose={() => setPaying(null)} onSaved={refresh} />}
        </div>
    );
};
