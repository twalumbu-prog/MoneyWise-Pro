import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { momoCaptureService, formatKwacha } from 'core';
import type { MomoBalanceCheck, MomoCaptureActivity, MomoCaptureStatus, MomoDiagnosis } from 'core';
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Smartphone, Scale, AlertCircle, CheckCircle2, FlaskConical } from 'lucide-react';

const PROVIDER: Record<string, string> = { MTN: 'MTN MoMo', AIRTEL: 'Airtel Money', ZAMTEL: 'Zamtel Kwacha', OTHER: 'Mobile money' };
const SOURCE: Record<string, string> = { ANDROID_SMS: 'Android SMS', ANDROID_NOTIFICATION: 'Android notification', IOS_SHORTCUT: 'iPhone Shortcut', PASTE: 'Pasted' };
const STATUS_STYLE: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
    POSTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    MATCHED: 'bg-sky-50 text-sky-700 border-sky-200',
    DISMISSED: 'bg-gray-100 text-gray-600 border-gray-200',
    OPEN: 'bg-amber-50 text-amber-800 border-amber-200',
    IN_SYNC: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ADJUSTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    SUPERSEDED: 'bg-gray-100 text-gray-600 border-gray-200',
    NO_ACCOUNT: 'bg-gray-100 text-gray-600 border-gray-200',
};
const STATUS_LABEL: Record<string, string> = {
    PENDING: 'To review', POSTED: 'Booked', MATCHED: 'Already in MoneyWise (Lenco)', DISMISSED: 'Dismissed',
    OPEN: 'Differs', IN_SYNC: 'Matches', ADJUSTED: 'Adjusted', SUPERSEDED: 'Replaced by a newer check', NO_ACCOUNT: 'Not compared (books to Cash)',
};

const Pill: React.FC<{ status: string }> = ({ status }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${STATUS_STYLE[status] ?? STATUS_STYLE.DISMISSED}`}>{STATUS_LABEL[status] ?? status}</span>
);
const when = (iso: string) => new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

type Tab = 'all' | 'captured' | 'balances' | 'ignored' | 'test';

export const MomoCaptureIntegration: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const qc = useQueryClient();
    const [tab, setTab] = useState<Tab>('all');
    const [filter, setFilter] = useState<MomoCaptureStatus | 'ALL'>('ALL');

    const settings = useQuery({ queryKey: ['momo-web', 'settings'], queryFn: () => momoCaptureService.getSettings(), refetchInterval: 15_000 });
    const captured = useQuery({ queryKey: ['momo-web', 'activity', filter], queryFn: () => momoCaptureService.activity(filter === 'ALL' ? undefined : filter), refetchInterval: 15_000, enabled: tab === 'captured' });
    const balances = useQuery({ queryKey: ['momo-web', 'balances'], queryFn: () => momoCaptureService.allBalanceChecks(), refetchInterval: 15_000, enabled: tab === 'balances' });
    const everything = useQuery({ queryKey: ['momo-web', 'everything'], queryFn: () => momoCaptureService.everything(300), refetchInterval: 10_000, enabled: tab === 'all' });
    const ignored = useQuery({ queryKey: ['momo-web', 'ignored'], queryFn: () => momoCaptureService.ignored(), refetchInterval: 15_000, enabled: tab === 'ignored' });

    const refresh = () => { void qc.invalidateQueries({ queryKey: ['momo-web'] }); void qc.invalidateQueries({ queryKey: ['cashbook-entries'] }); };
    const act = useMutation({
        mutationFn: (v: { kind: 'post' | 'dismiss' | 'adjust' | 'ignore'; id: string }): Promise<unknown> =>
            v.kind === 'post' ? momoCaptureService.post(v.id) : v.kind === 'dismiss' ? momoCaptureService.dismiss(v.id)
            : v.kind === 'adjust' ? momoCaptureService.adjustBalance(v.id) : momoCaptureService.dismissBalanceCheck(v.id),
        onSuccess: refresh,
        onError: (e: Error) => { window.alert(e.message); refresh(); },
    });

    const s = settings.data;
    const setProvider = useMutation({
        mutationFn: (p: 'MTN' | 'AIRTEL' | 'ZAMTEL' | null) => momoCaptureService.updateSettings({ defaultProvider: p }),
        onSuccess: refresh,
        onError: (e: Error) => window.alert(e.message),
    });
    const removeDevice = useMutation({
        mutationFn: (id: string) => momoCaptureService.removeDevice(id),
        onSuccess: refresh,
        onError: (e: Error) => window.alert(e.message),
    });
    const moveHere = useMutation({
        mutationFn: () => momoCaptureService.captureHere(),
        onSuccess: refresh,
        onError: (e: Error) => window.alert(e.message),
    });
    return (
        <div className="space-y-6">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
                <ArrowLeft className="h-4 w-4" /> Back to integrations
            </button>
            <div>
                <h3 className="text-lg font-bold text-brand-navy">Mobile money &amp; SMS</h3>
                <p className="text-sm text-gray-500">Everything your phone sends from mobile money messages: what was received, how it was read and where it was booked. Set the phone up in the mobile app under Preferences → Mobile money capture.</p>
            </div>

            {s && (!s.capturingHere || s.elsewhere.captures + s.elsewhere.ignored > 0) && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[240px]">
                        <p className="text-sm font-semibold text-amber-900">
                            {s.capturingHere ? 'Some messages went to another workspace' : `Your phone is sending messages to ${s.captureWorkspace.name ?? 'another workspace'}, not this one`}
                        </p>
                        <p className="text-xs text-amber-800">
                            A capture key delivers into the one workspace it was set up in. {s.elsewhere.captures + s.elsewhere.ignored} message{s.elsewhere.captures + s.elsewhere.ignored === 1 ? '' : 's'} already {s.elsewhere.captures + s.elsewhere.ignored === 1 ? 'went' : 'went'} to your other workspaces (the Ignored tab lists them all, with where each went).
                        </p>
                    </div>
                    {!s.capturingHere && (
                        <button onClick={() => moveHere.mutate()} disabled={moveHere.isPending}
                            className="px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-60">
                            {moveHere.isPending ? 'Moving…' : 'Capture into this workspace'}
                        </button>
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Capture key" value={s ? (s.hasToken ? 'Active' : 'Off') : '…'} sub={s?.hasToken ? `delivers to ${s.captureWorkspace.name ?? 'a workspace'}` : undefined} good={!!s?.hasToken} />
                <Stat label="Last message" value={s?.lastCaptureAt ? when(s.lastCaptureAt) : 'None yet'} sub={s?.lastCaptureSource ? SOURCE[s.lastCaptureSource] : undefined} />
                <Stat label="Waiting for you" value={s ? String(s.pendingCount) : '…'} />
                <Stat label="Booking" value={s ? (s.autoPost ? 'Automatic' : 'After review') : '…'} sub={s ? (s.destination === 'CASH' ? 'to Cash' : 'to provider account') : undefined} />
            </div>

            <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2">
                <p className="text-sm font-semibold text-gray-900">Phones sending to this account</p>
                {(s?.devices.length ?? 0) === 0 && <p className="text-xs text-gray-500">No phone has its own key yet. Set up capture in the mobile app on each phone; every phone you set up keeps working alongside the others.</p>}
                {s?.devices.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-gray-800">{d.label || (d.platform === 'android' ? 'Android' : d.platform === 'ios' ? 'iPhone' : 'Phone')} <span className="text-xs text-gray-500">· {d.lastSeenAt ? `last sent ${when(d.lastSeenAt)}` : 'nothing sent yet'}</span></span>
                        <button onClick={() => { if (window.confirm('Turn off capture on this phone?')) removeDevice.mutate(d.id); }} className="text-xs text-red-600 hover:underline">Turn off</button>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl">
                <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">This phone's mobile money provider</p>
                    <p className="text-xs text-gray-500">Used for messages that don't name a provider, such as "Your balance is ZMW 10.00", so they file under the right account.</p>
                </div>
                <select value={s?.defaultProvider ?? ''} disabled={!s || setProvider.isPending}
                    onChange={(e) => setProvider.mutate(e.target.value === '' ? null : (e.target.value as 'MTN' | 'AIRTEL' | 'ZAMTEL'))}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white">
                    <option value="">Not set</option>
                    <option value="MTN">MTN MoMo</option>
                    <option value="AIRTEL">Airtel Money</option>
                    <option value="ZAMTEL">Zamtel Kwacha</option>
                </select>
            </div>

            <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
                {([['all', 'All messages'], ['captured', 'Captured'], ['balances', 'Balance checks'], ['ignored', 'Ignored'], ['test', 'Try a message']] as [Tab, string][]).map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)}
                        className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === id ? 'border-brand-navy text-brand-navy' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{label}</button>
                ))}
            </div>

            {tab === 'all' && (
                <div className="space-y-3">
                    <p className="text-xs text-gray-500">Every message your phones have sent, newest first: transactions, balance readings and messages that were not booked (with why). Updates by itself.</p>
                    {everything.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
                    {!everything.isLoading && (everything.data?.length ?? 0) === 0 && <Empty text="No messages yet." />}
                    {everything.data?.map((m) => (
                        <div key={`${m.kind}-${m.id}`} className="p-4 bg-white border border-gray-200 rounded-xl space-y-1">
                            <div className="flex justify-between gap-2 text-xs text-gray-500">
                                <span className="flex flex-wrap items-center gap-1.5">
                                    <span className={`px-2 py-0.5 rounded-full font-semibold ${m.kind === 'TRANSACTION' ? 'bg-blue-100 text-blue-800' : m.kind === 'BALANCE' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
                                        {m.kind === 'TRANSACTION' ? `${m.direction === 'IN' ? 'Received' : 'Sent'} ${m.amount !== null ? `K${m.amount.toLocaleString()}` : ''} · ${m.status.toLowerCase()}` : m.kind === 'BALANCE' ? `Balance K${m.amount?.toLocaleString()}` : 'Not booked'}
                                    </span>
                                    <span>{SOURCE[m.source as keyof typeof SOURCE] ?? m.source}</span>
                                    {m.device && <span>· {m.device}</span>}
                                    {m.elsewhere && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">in {m.workspace ?? 'another workspace'}</span>}
                                </span>
                                <span className="shrink-0">{when(m.receivedAt)}</span>
                            </div>
                            <p className="text-sm text-gray-800 break-words">{m.text}</p>
                            {m.note && <p className="text-xs text-amber-700">Why: {m.note}</p>}
                        </div>
                    ))}
                </div>
            )}

            {tab === 'captured' && (
                <div className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                        {(['ALL', 'PENDING', 'POSTED', 'MATCHED', 'DISMISSED'] as const).map((f) => (
                            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-full text-xs font-semibold border ${filter === f ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-gray-600 border-gray-200'}`}>
                                {f === 'ALL' ? 'All' : STATUS_LABEL[f]}
                            </button>
                        ))}
                    </div>
                    {captured.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
                    {!captured.isLoading && (captured.data?.length ?? 0) === 0 && <Empty text="No captured transactions yet. Messages that move money appear here within seconds of arriving on the phone." />}
                    {captured.data?.map((c) => <CaptureRow key={c.id} c={c} busy={act.isPending && act.variables?.id === c.id} onPost={() => act.mutate({ kind: 'post', id: c.id })} onDismiss={() => act.mutate({ kind: 'dismiss', id: c.id })} />)}
                </div>
            )}

            {tab === 'balances' && (
                <div className="space-y-3">
                    {balances.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
                    {!balances.isLoading && (balances.data?.length ?? 0) === 0 && <Empty text="No balance checks yet. Check your mobile money balance on the phone and the reply shows up here." />}
                    {balances.data?.map((b) => <BalanceRow key={b.id} b={b} busy={act.isPending && act.variables?.id === b.id} onAdjust={() => act.mutate({ kind: 'adjust', id: b.id })} onIgnore={() => act.mutate({ kind: 'ignore', id: b.id })} />)}
                </div>
            )}

            {tab === 'ignored' && (
                <div className="space-y-3">
                    <p className="text-xs text-gray-500">Messages the phone sent that were not a transaction or a balance, with the reason. Kept for 30 days. One-time codes are never stored.</p>
                    {ignored.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
                    {!ignored.isLoading && (ignored.data?.length ?? 0) === 0 && <Empty text="Nothing ignored yet." />}
                    {ignored.data?.map((m) => (
                        <div key={m.id} className="p-4 bg-white border border-gray-200 rounded-xl space-y-1">
                            <div className="flex justify-between gap-2 text-xs text-gray-500"><span>{SOURCE[m.source]}{m.elsewhere && <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">in {m.workspace ?? 'another workspace'}</span>}</span><span>{when(m.created_at)}</span></div>
                            <p className="text-sm text-gray-800 break-words">{m.raw_text}</p>
                            <p className="text-xs text-amber-700">Why: {m.reason}</p>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'test' && <Tester />}
        </div>
    );
};

const Stat: React.FC<{ label: string; value: string; sub?: string; good?: boolean }> = ({ label, value, sub, good }) => (
    <div className="p-3 bg-white border border-gray-200 rounded-xl">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-sm font-bold ${good ? 'text-emerald-700' : 'text-gray-900'}`}>{value}</p>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
    <div className="flex gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-600"><Smartphone className="h-5 w-5 shrink-0" /><div>{text}</div></div>
);

const Field: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
    <div><p className="text-[11px] uppercase tracking-wide text-gray-400">{k}</p><p className="text-sm text-gray-800 break-words">{v ?? '—'}</p></div>
);

const CaptureRow: React.FC<{ c: MomoCaptureActivity; busy: boolean; onPost: () => void; onDismiss: () => void }> = ({ c, busy, onPost, onDismiss }) => {
    const [open, setOpen] = useState(false);
    const isIn = c.direction === 'IN';
    const open_ = c.status === 'PENDING' || c.status === 'MATCHED';
    return (
        <div className="bg-white border border-gray-200 rounded-xl">
            <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 p-4 text-left">
                <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${isIn ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    {isIn ? <ArrowDownLeft className="h-4 w-4 text-emerald-700" /> : <ArrowUpRight className="h-4 w-4 text-red-600" />}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.counterparty || (isIn ? 'Money received' : 'Money sent')}</p>
                    <p className="text-xs text-gray-500">{PROVIDER[c.provider]} · {SOURCE[c.source]} · {when(c.occurred_at)}</p>
                </div>
                <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${isIn ? 'text-emerald-700' : 'text-gray-900'}`}>{isIn ? '+' : '−'}{formatKwacha(Number(c.amount))}</p>
                    <Pill status={c.status} />
                </div>
            </button>
            {open && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 break-words">{c.raw_text}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Field k="Provider" v={PROVIDER[c.provider]} />
                        <Field k="Direction" v={isIn ? 'Money in' : 'Money out'} />
                        <Field k="Amount" v={formatKwacha(Number(c.amount))} />
                        <Field k="Fee" v={c.fee ? formatKwacha(Number(c.fee)) : null} />
                        <Field k="Balance after" v={c.balance_after != null ? formatKwacha(Number(c.balance_after)) : null} />
                        <Field k="Counterparty" v={c.counterparty} />
                        <Field k="Reference" v={c.provider_reference} />
                        <Field k="Sender" v={c.sender} />
                    </div>
                    {c.entry && (
                        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 grid grid-cols-2 md:grid-cols-4 gap-3">
                            <Field k="Booked to" v={c.entry.account} />
                            <Field k="Category" v={c.entry.category ? `${c.entry.category.code ? c.entry.category.code + ' · ' : ''}${c.entry.category.name}` : 'Uncategorised'} />
                            <Field k="Entry" v={c.entry.reference_number} />
                            <Field k="Entry status" v={c.entry.status} />
                        </div>
                    )}
                    {c.status === 'MATCHED' && <p className="text-xs text-sky-700">The same amount and direction is already on your Lenco wallet within 30 minutes, so this was not booked again.</p>}
                    {open_ && (
                        <div className="flex justify-end gap-2">
                            {busy ? <span className="text-sm text-gray-500">Working…</span> : (<>
                                <button onClick={onDismiss} className="px-4 py-1.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-600">Dismiss</button>
                                <button onClick={() => { if (c.status !== 'MATCHED' || window.confirm('This looks like a payment already in MoneyWise through your wallet. Booking it again would count it twice. Book anyway?')) onPost(); }}
                                    className="px-4 py-1.5 rounded-full bg-brand-navy text-white text-sm font-semibold">{c.status === 'MATCHED' ? 'Book anyway' : 'Book it'}</button>
                            </>)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const BalanceRow: React.FC<{ b: MomoBalanceCheck; busy: boolean; onAdjust: () => void; onIgnore: () => void }> = ({ b, busy, onAdjust, onIgnore }) => {
    const diff = Number(b.difference ?? 0);
    const pending = Number(b.pending_net ?? 0);
    return (
        <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
            <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0"><Scale className="h-4 w-4 text-amber-700" /></div>
                <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{PROVIDER[b.provider]} · phone says {formatKwacha(Number(b.balance))}</p>
                    <p className="text-xs text-gray-500">{when(b.observed_at)}</p>
                </div>
                <Pill status={b.status} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field k="MoneyWise balance" v={b.ledger_balance != null ? formatKwacha(Number(b.ledger_balance)) : null} />
                <Field k="Waiting for review" v={pending !== 0 ? `${pending > 0 ? '+' : '−'}${formatKwacha(Math.abs(pending))}` : 'None'} />
                <Field k="Difference" v={b.difference != null ? (Math.abs(diff) < 0.005 ? 'None' : `${diff > 0 ? '+' : '−'}${formatKwacha(Math.abs(diff))}`) : null} />
            </div>
            {b.status === 'OPEN' && (
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">{diff > 0 ? 'A payment may be missing from MoneyWise.' : 'MoneyWise may hold something the provider never charged.'} Review waiting messages first.</p>
                    {busy ? <span className="text-sm text-gray-500">Working…</span> : (
                        <div className="flex gap-2 shrink-0">
                            <button onClick={onIgnore} className="px-4 py-1.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-600">Ignore</button>
                            <button onClick={onAdjust} className="px-4 py-1.5 rounded-full bg-brand-navy text-white text-sm font-semibold">Adjust to match</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const Tester: React.FC = () => {
    const [text, setText] = useState('');
    const test = useMutation({ mutationFn: () => momoCaptureService.testParse(text) });
    const r: MomoDiagnosis | undefined = test.data;
    return (
        <div className="space-y-4">
            <div className="flex gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-600">
                <FlaskConical className="h-5 w-5 shrink-0" />
                <div>Paste any mobile money or bank SMS to see exactly how MoneyWise would read it. Nothing is saved or booked.</div>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="You have received ZMW 250.00 from…"
                className="w-full p-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-navy/30" />
            <button disabled={text.trim().length < 5 || test.isPending} onClick={() => test.mutate()}
                className="px-5 py-2 rounded-full bg-brand-navy text-white text-sm font-semibold disabled:opacity-50">{test.isPending ? 'Reading…' : 'Read it'}</button>
            {test.error && <p className="text-sm text-red-600">{(test.error as Error).message}</p>}
            {r?.kind === 'TRANSACTION' && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Read as a transaction</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Field k="Provider" v={PROVIDER[r.parsed.provider]} />
                        <Field k="Direction" v={r.parsed.direction === 'IN' ? 'Money in' : 'Money out'} />
                        <Field k="Amount" v={formatKwacha(r.parsed.amount)} />
                        <Field k="Fee" v={r.parsed.fee != null ? formatKwacha(r.parsed.fee) : null} />
                        <Field k="Balance after" v={r.parsed.balanceAfter != null ? formatKwacha(r.parsed.balanceAfter) : null} />
                        <Field k="Counterparty" v={r.parsed.counterparty} />
                        <Field k="Reference" v={r.parsed.reference} />
                    </div>
                </div>
            )}
            {r?.kind === 'BALANCE' && (
                <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 text-sm text-sky-900">
                    <p className="font-semibold">Read as a balance check</p>
                    <p>{PROVIDER[r.balance.provider]} balance {formatKwacha(r.balance.balance)}. It would be compared with the account in MoneyWise.</p>
                </div>
            )}
            {r?.kind === 'IGNORED' && (
                <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <div><p className="font-semibold">Ignored</p><p>{r.reason}</p></div>
                </div>
            )}
        </div>
    );
};
