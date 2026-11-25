import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, BookOpen, Building2, Calendar, ChevronRight, HandCoins, ListChecks, Loader2, Scale, Users, X } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { ErrorNote, PrimaryButton, fieldClass, labelClass } from '../ui/Dialog';

interface Debt { id: string; side: 'OWE' | 'OWED'; type: 'PERSON' | 'COMPANY'; name: string; orgId: string | null; dueDate: string | null; note: string | null; balance: number; entries: number; lastAt: string | null; overdue: boolean; mirror?: boolean }
interface Overview { owe: Debt[]; owed: Debt[]; settled: Debt[]; totals: { owe: number; owed: number; net: number }; mirror: Debt[] }
interface Detail { debt: Debt; entries: { id: string; date: string; description: string; amount: number; label: string; increases: boolean }[] }
type Filter = 'ALL' | 'OWE' | 'OWED' | 'SETTLED';

const when = (iso: string | null) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

/** One debt, in the same row style as a scheduled bill: an avatar, the name and what's behind it, a due date, and the balance. */
const DebtRow: React.FC<{ d: Debt; label?: string; onOpen?: () => void; last: boolean }> = ({ d, label, onOpen, last }) => {
    const settled = d.balance <= 0.004;
    return (
        <div onClick={onOpen} className={`flex items-center gap-5 px-4 py-4 transition ${onOpen ? 'cursor-pointer hover:bg-gray-50' : ''} ${last ? '' : 'border-b border-gray-100'}`}>
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-[12px] font-bold ${d.type === 'COMPANY' ? 'bg-blue-100 text-blue-700' : d.side === 'OWE' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {d.type === 'COMPANY' ? <Building2 size={15} /> : initials(d.name)}
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{label ?? d.name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px] text-gray-500"><ListChecks size={10} /> {d.entries} transaction{d.entries === 1 ? '' : 's'}</span>
                    {d.lastAt && <span className="flex items-center gap-1 text-[11px] text-gray-500"><Calendar size={10} /> Last {when(d.lastAt)}</span>}
                    {d.dueDate && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${d.overdue ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{d.overdue ? 'Overdue · ' : 'Due '}{when(d.dueDate)}</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${settled ? 'bg-gray-100 text-gray-600' : d.side === 'OWE' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{settled ? 'Settled' : d.side === 'OWE' ? 'You owe' : 'Owed to you'}</span>
                </div>
            </div>
            <p className={`flex-shrink-0 text-sm font-bold tabular-nums ${settled ? 'text-gray-400' : 'text-gray-900'}`}>{formatKwacha(d.balance)}</p>
            {onOpen && <ChevronRight size={16} className="flex-shrink-0 text-gray-300" />}
        </div>
    );
};

/** One debt: the transactions behind its balance, a due date and a note, and taking a transaction out of it. */
const DebtDrawer: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
    const qc = useQueryClient();
    const q = useQuery({ queryKey: ['debts', 'detail', id], retry: false, queryFn: () => apiJson<Detail>(`/debts/${id}`) });
    const [due, setDue] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const d = q.data?.debt;
    const refresh = () => qc.invalidateQueries({ queryKey: ['debts'] });
    const save = async () => {
        setBusy(true); setErr(null);
        try { await apiJson(`/debts/${id}`, { method: 'PATCH', body: JSON.stringify({ dueDate: due ?? d?.dueDate ?? null, note: note ?? d?.note ?? '' }) }); setDue(null); setNote(null); await refresh(); }
        catch (e: any) { setErr(e?.message || 'Could not save.'); } finally { setBusy(false); }
    };
    const untag = async (entryId: string) => {
        if (!window.confirm(entryId.startsWith('open:') ? 'Remove this opening balance? It comes off the debt and out of your books.' : 'Take this transaction out of the debt? It goes back to uncategorised.')) return;
        setErr(null);
        try { await apiJson(entryId.startsWith('open:') ? `/debts/opening/${entryId}` : `/debts/tag/${entryId}`, { method: 'DELETE' }); await refresh(); } catch (e: any) { setErr(e?.message || 'Could not remove it.'); }
    };
    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-bold text-gray-900">{d?.name ?? 'Debt'}</h2>
                        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{d ? (d.side === 'OWE' ? 'You owe' : 'Owed to you') : ''}</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100" aria-label="Close"><X size={20} className="text-gray-400" /></button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {q.isPending ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#0B57D0]" /></div> : q.isError || !d ? <p className="text-sm text-[#C5221F]">Couldn’t load this debt.</p> : (
                        <>
                            <p className="text-3xl font-bold tabular-nums text-[#1F1F1F]">{formatKwacha(d.balance)}</p>
                            <p className="mb-5 text-xs text-[#5F6368]">{d.balance <= 0.004 ? 'Settled' : d.side === 'OWE' ? 'still to pay' : 'still to receive'}</p>
                            <ErrorNote text={err} />
                            <div className="mb-4 grid grid-cols-2 gap-3">
                                <div><label className={labelClass}>Due date</label><input type="date" className={fieldClass} value={due ?? d.dueDate ?? ''} onChange={(e) => setDue(e.target.value)} /></div>
                                <div><label className={labelClass}>Note</label><input className={fieldClass} value={note ?? d.note ?? ''} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>
                            </div>
                            <PrimaryButton busy={busy} onClick={save} disabled={due === null && note === null} className="mb-6 h-10 w-full">Save</PrimaryButton>
                            <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-400">Transactions</h3>
                            <ul className="divide-y divide-gray-100">
                                {q.data!.entries.map((e) => (
                                    <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                                        <div className="min-w-0"><p className="truncate text-sm font-medium text-gray-700">{e.description}</p><p className="text-[10px] text-[#5F6368]">{when(e.date)} · {e.label}</p></div>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-sm font-semibold tabular-nums ${e.increases ? 'text-[#1F1F1F]' : 'text-[#137333]'}`}>{e.increases ? '+' : '−'}{formatKwacha(e.amount)}</span>
                                            <button type="button" onClick={() => untag(e.id)} className="text-[11px] font-semibold text-[#B31412] hover:underline">Remove</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

/** The headline: net position on a blue card (the same one the stock value uses), with a bar showing how what you owe compares with what you're owed. */
const NetCard: React.FC<{ owe: number; owed: number; net: number }> = ({ owe, owed, net }) => {
    const total = owe + owed;
    const owePct = total > 0 ? Math.round((owe / total) * 100) : 0;
    const line = total === 0 ? 'No debts open' : net === 0 ? 'What you owe and what you’re owed cancel out' : net > 0 ? 'You’re owed more than you owe' : 'You owe more than you’re owed';
    return (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B57D0] to-[#0842A0] p-5 text-white shadow-[0_8px_24px_-12px_rgba(11,87,208,0.6)]">
            <div className="relative">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/70"><Scale size={12} /> Net position</p>
                <p className="mt-1.5 text-[34px] font-bold leading-none tabular-nums">{net < 0 ? '−' : ''}{formatKwacha(Math.abs(net))}</p>
                <p className="mt-1.5 text-xs text-white/75">{line}</p>
                <div className="mt-4" aria-hidden>
                    <div className="flex h-2 overflow-hidden rounded-full bg-white/20">
                        {total > 0 && <><div className="bg-rose-300" style={{ width: `${owePct}%` }} /><div className="bg-emerald-300" style={{ width: `${100 - owePct}%` }} /></>}
                    </div>
                    <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-white/70"><span>You owe</span><span>Owed to you</span></div>
                </div>
            </div>
        </div>
    );
};

const SideStat: React.FC<{ tone: 'owe' | 'owed'; label: string; value: number; count: number }> = ({ tone, label, value, count }) => {
    const owe = tone === 'owe';
    return (
        <div className="flex flex-col justify-between rounded-2xl bg-[#F8FAFD] p-5">
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${owe ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>{owe ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}</span>
            </div>
            <div className="mt-3">
                <p className={`text-2xl font-bold tabular-nums ${value > 0 ? (owe ? 'text-rose-700' : 'text-emerald-700') : 'text-gray-900'}`}>{formatKwacha(value)}</p>
                <p className="mt-0.5 text-xs text-gray-500">{count === 0 ? (owe ? 'Nothing to pay back' : 'Nobody owes you') : `${owe ? 'to' : 'from'} ${count} ${count === 1 ? 'person or company' : 'people and companies'}`}</p>
            </div>
        </div>
    );
};

const Step: React.FC<{ n: number; title: string; text: string }> = ({ n, title, text }) => (
    <div className="flex gap-3 text-left">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-[11px] font-bold text-[#0B57D0]">{n}</span>
        <div><p className="text-sm font-semibold text-gray-900">{title}</p><p className="text-xs text-gray-500">{text}</p></div>
    </div>
);

/**
 * Who you owe and who owes you, shown as a tab of Schedules in the same card, filter pills and rows as a scheduled bill. Debts are made by tagging a
 * transaction (Loan received, Repayment made, Advance given, ...) in the cash ledger; a company workspace also sees what its members have with it.
 */
export const DebtsPanel: React.FC = () => {
    const navigate = useNavigate();
    const q = useQuery({ queryKey: ['debts', 'overview'], retry: false, queryFn: () => apiJson<Overview>('/debts') });
    const [filter, setFilter] = useState<Filter>('ALL');
    const [open, setOpen] = useState<string | null>(null);
    const d = q.data;

    if (q.isPending) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-[#0B57D0]" /></div>;
    if (q.isError || !d) return <p className="py-16 text-center text-sm text-gray-500">Couldn’t load your debts.</p>;

    const nothing = d.owe.length + d.owed.length + d.settled.length + d.mirror.length === 0;
    const rows: Debt[] = filter === 'OWE' ? d.owe : filter === 'OWED' ? d.owed : filter === 'SETTLED' ? d.settled : [...d.owe, ...d.owed];
    const tabs: { key: Filter; label: string; n: number }[] = [{ key: 'ALL', label: 'All', n: d.owe.length + d.owed.length }, { key: 'OWE', label: 'You owe', n: d.owe.length }, { key: 'OWED', label: 'Owed to you', n: d.owed.length }, { key: 'SETTLED', label: 'Settled', n: d.settled.length }];
    const overdue = [...d.owe, ...d.owed].filter((x) => x.overdue).length;

    return (
        <div>
            <div className="mb-5 grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
                <NetCard owe={d.totals.owe} owed={d.totals.owed} net={d.totals.net} />
                <SideStat tone="owe" label="You owe" value={d.totals.owe} count={d.owe.length} />
                <SideStat tone="owed" label="Owed to you" value={d.totals.owed} count={d.owed.length} />
            </div>

            {nothing ? (
                <div className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 text-center">
                    <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0B57D0]"><HandCoins size={22} /></span>
                    <p className="text-base font-bold text-gray-900">No debts yet</p>
                    <p className="mx-auto mb-6 mt-1 max-w-md text-sm text-gray-500">Track money you’ve borrowed, lent or paid on someone’s behalf. A debt starts when you tag a transaction.</p>
                    <div className="mx-auto mb-6 grid max-w-md gap-4 text-left">
                        <Step n={1} title="Open a transaction" text="In your cash ledger, pick the one that was a loan, an advance or a repayment." />
                        <Step n={2} title="Choose a debt tag" text="Loan received, Repayment made, Loan given, Advance given and more, in its category list." />
                        <Step n={3} title="Say who it’s with" text="A person, or one of your company workspaces. The balance builds up here." />
                    </div>
                    <button type="button" onClick={() => navigate('/cashbook')} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0B57D0] px-4 text-xs font-bold text-white hover:opacity-90"><BookOpen size={13} /> Open the cash ledger</button>
                </div>
            ) : (
                <>
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 md:bg-[#F8FAFD]">
                            {tabs.map((t) => (
                                <button key={t.key} type="button" onClick={() => setFilter(t.key)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${filter === t.key ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}>
                                    {t.label}
                                    {t.n > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${filter === t.key ? 'bg-[#0B57D0] text-white' : 'bg-gray-200 text-gray-500'}`}>{t.n}</span>}
                                </button>
                            ))}
                        </div>
                        {overdue > 0 && <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">{overdue} overdue</span>}
                        <div className="flex-1" />
                        <button type="button" onClick={() => navigate('/cashbook')} className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]"><BookOpen size={13} /> Tag a transaction</button>
                    </div>

                    {rows.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">Nothing here.</p>
                    ) : (
                        <div className="rounded-2xl">{rows.map((x, i) => <DebtRow key={x.id} d={x} onOpen={() => setOpen(x.id)} last={i === rows.length - 1} />)}</div>
                    )}

                    {d.mirror.length > 0 && (
                        <section className="mt-6">
                            <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-gray-900"><Users size={14} className="text-[#0B57D0]" /> With the people in this workspace</h3>
                            <p className="mb-1 text-[11px] text-gray-500">What members of this workspace have recorded with it, from the company’s side.</p>
                            <div className="rounded-2xl">{d.mirror.map((x, i) => <DebtRow key={x.id} d={x} label={`${x.side === 'OWE' ? 'We owe' : 'Owed to us by'} ${x.name}`} last={i === d.mirror.length - 1} />)}</div>
                        </section>
                    )}
                </>
            )}
            {open && <DebtDrawer id={open} onClose={() => setOpen(null)} />}
        </div>
    );
};
