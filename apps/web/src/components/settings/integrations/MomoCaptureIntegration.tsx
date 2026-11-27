import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { momoCaptureService, formatKwacha } from 'core';
import type { MomoAccountingOptions, MomoBalanceCheck, MomoCaptureActivity, MomoCaptureFields, MomoPostingPreview, MomoCaptureStatus, MomoDiagnosis, MomoEverythingItem } from 'core';
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
    const [moving, setMoving] = useState<MomoEverythingItem | null>(null);
    const [reviewing, setReviewing] = useState<string | null>(null);
    const options = useQuery({ queryKey: ['momo-web', 'accounting-options'], queryFn: () => momoCaptureService.accountingOptions(), staleTime: 60_000 });
    const createAccount = async (name: string): Promise<string | null> => {
        try {
            const a = await momoCaptureService.createAccount(name);
            await qc.invalidateQueries({ queryKey: ['momo-web', 'accounting-options'] });
            return a.id;
        } catch (e: any) { window.alert(e?.message || 'Could not add the account'); return null; }
    };
    const known = useMemo(() => ({
        counterparties: uniq((captured.data ?? []).map((c) => c.counterparty ?? '')),
        senders: uniq((captured.data ?? []).map((c) => c.sender ?? '')),
    }), [captured.data]);
    const saveCapture = useMutation({
        mutationFn: (v: { id: string; fields: MomoCaptureFields }) => momoCaptureService.editCapture(v.id, v.fields),
        onSuccess: refresh,
    });
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

            {s && (s.capturingHere === false || (s.elsewhere?.captures ?? 0) + (s.elsewhere?.ignored ?? 0) > 0) && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[240px]">
                        <p className="text-sm font-semibold text-amber-900">
                            {s.capturingHere ? 'Some messages went to another workspace' : `Your phone is sending messages to ${s.captureWorkspace?.name ?? 'another workspace'}, not this one`}
                        </p>
                        <p className="text-xs text-amber-800">
                            A capture key delivers into the one workspace it was set up in. {((s.elsewhere?.captures ?? 0) + (s.elsewhere?.ignored ?? 0))} message{((s.elsewhere?.captures ?? 0) + (s.elsewhere?.ignored ?? 0)) === 1 ? '' : 's'} already {((s.elsewhere?.captures ?? 0) + (s.elsewhere?.ignored ?? 0)) === 1 ? 'went' : 'went'} to your other workspaces (the Ignored tab lists them all, with where each went).
                        </p>
                    </div>
                    {s.capturingHere === false && (
                        <button onClick={() => moveHere.mutate()} disabled={moveHere.isPending}
                            className="px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-60">
                            {moveHere.isPending ? 'Moving…' : 'Capture into this workspace'}
                        </button>
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Capture key" value={s ? (s.hasToken ? 'Active' : 'Off') : '…'} sub={s?.hasToken ? `delivers to ${s.captureWorkspace?.name ?? 'a workspace'}` : undefined} good={!!s?.hasToken} />
                <Stat label="Last message" value={s?.lastCaptureAt ? when(s.lastCaptureAt) : 'None yet'} sub={s?.lastCaptureSource ? SOURCE[s.lastCaptureSource] : undefined} />
                <Stat label="Waiting for you" value={s ? String(s.pendingCount) : '…'} />
                <Stat label="Booking" value={s ? (s.autoPost ? 'Automatic' : 'After review') : '…'} sub={s ? (s.destination === 'CASH' ? 'to Cash' : 'to provider account') : undefined} />
            </div>

            <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2">
                <p className="text-sm font-semibold text-gray-900">Phones sending to this account</p>
                {(s?.devices?.length ?? 0) === 0 && <p className="text-xs text-gray-500">No phone has its own key yet. Set up capture in the mobile app on each phone; every phone you set up keeps working alongside the others.</p>}
                {s?.devices?.map((d) => (
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
                            {m.comment && <p className="text-xs text-gray-600"><span className="font-semibold">Note:</span> {m.comment}</p>}
                            {m.note && <p className="text-xs text-amber-700">Why: {m.note}</p>}
                            {m.kind === 'NOT_BOOKED' && m.movable && (
                                <div className="pt-1"><button onClick={() => setMoving(m)} className="px-3 py-1 rounded-full border border-brand-navy text-brand-navy text-xs font-semibold hover:bg-brand-navy hover:text-white">Move to Captured</button></div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {moving && <MoveDialog m={moving} known={known} defaultProvider={s?.defaultProvider ?? null} opts={options.data} onCreateAccount={createAccount} onClose={() => setMoving(null)}
                onDone={() => { setMoving(null); refresh(); void qc.invalidateQueries({ queryKey: ['momo-web'] }); setFilter('PENDING'); setTab('captured'); }} />}

            {reviewing && captured.data?.find((c) => c.id === reviewing) && options.data && (
                <ReviewDialog c={captured.data.find((c) => c.id === reviewing)!} opts={options.data} onCreateAccount={createAccount} onClose={() => setReviewing(null)}
                    onPosted={() => { setReviewing(null); refresh(); void qc.invalidateQueries({ queryKey: ['momo-web'] }); }} />
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
                    {captured.data?.map((c) => <CaptureRow key={c.id} c={c} known={known} opts={options.data} onCreateAccount={createAccount} onSave={(fields) => saveCapture.mutateAsync({ id: c.id, fields })} busy={act.isPending && act.variables?.id === c.id} onReview={() => setReviewing(c.id)} onDismiss={() => act.mutate({ kind: 'dismiss', id: c.id })} />)}
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


// ── Editable fields: a dropdown of suggestions you can also type over ─────────────────────────────

interface Opt { value: string; label: string }

/**
 * A text box with a dropdown. Pick a suggestion or type your own. With `strict` the typed text must match one of the
 * options (provider, direction) and snaps back to the chosen one otherwise.
 */
const Combo: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: Opt[]; strict?: boolean; placeholder?: string; disabled?: boolean; numeric?: boolean; onCreate?: (text: string) => void; hideLabel?: boolean }> =
({ label, value, onChange, options, strict, placeholder, disabled, numeric, onCreate, hideLabel }) => {
    const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;
    const [text, setText] = useState(strict ? labelFor(value) : value);
    const [open, setOpen] = useState(false);
    const [filtering, setFiltering] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => { setText(strict ? labelFor(value) : value); /* eslint-disable-next-line */ }, [value, strict]);
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); setFiltering(false); if (strict) setText(labelFor(value)); } };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
        // eslint-disable-next-line
    }, [open, value, strict]);
    const canCreate = !!onCreate && filtering && text.trim().length >= 2 && !options.some((o) => o.label.toLowerCase() === text.trim().toLowerCase());
    const shown = filtering && text.trim() ? options.filter((o) => o.label.toLowerCase().includes(text.trim().toLowerCase())) : options;
    return (
        <div ref={box} className="relative">
            {!hideLabel && <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>}
            <div className="flex">
                <input value={text} disabled={disabled} placeholder={placeholder ?? '—'} inputMode={numeric ? 'decimal' : undefined}
                    onFocus={() => setOpen(true)}
                    onChange={(e) => {
                        const v = numeric ? e.target.value.replace(/[^0-9.,]/g, '') : e.target.value;
                        setText(v); setFiltering(true); setOpen(true);
                        if (!strict) onChange(v);
                        else { const hit = options.find((o) => o.label.toLowerCase() === v.trim().toLowerCase()); if (hit) onChange(hit.value); }
                    }}
                    className="w-full min-w-0 text-sm border border-gray-300 rounded-l-lg px-2.5 py-1.5 bg-white disabled:bg-gray-50 disabled:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-navy/30" />
                <button type="button" disabled={disabled} tabIndex={-1} onClick={() => { setFiltering(false); setOpen((v) => !v); }} aria-label={`Show ${label} options`}
                    className="px-2 border border-l-0 border-gray-300 rounded-r-lg bg-gray-50 text-gray-500 disabled:opacity-40">▾</button>
            </div>
            {open && !disabled && (shown.length > 0 || canCreate) && (
                <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
                    {shown.map((o) => (
                        <li key={o.value}><button type="button" onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { onChange(o.value); setText(strict ? o.label : o.value); setOpen(false); setFiltering(false); }}
                            className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 ${o.value === value ? 'font-semibold text-brand-navy' : 'text-gray-800'}`}>{o.label}</button></li>
                    ))}
                    {canCreate && <li><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onCreate!(text.trim()); setOpen(false); setFiltering(false); }}
                        className="w-full text-left px-3 py-1.5 text-brand-navy font-semibold hover:bg-gray-50">＋ Add “{text.trim()}” as a new account</button></li>}
                </ul>
            )}
        </div>
    );
};

/** The accounts captures can be booked into: every account you have (banks too), plus the usual providers you have none for yet. */
const accountOptions = (opts?: MomoAccountingOptions): Opt[] => {
    const wallets = (opts?.wallets ?? []).map((w) => ({ value: w.id, label: `${w.name}${w.providerType === 'BANK' ? ' (bank)' : ''}` }));
    const have = new Set((opts?.wallets ?? []).map((w) => w.name.toLowerCase()));
    const missing = PROVIDER_OPTS.filter((p) => !have.has((DEFAULT_WALLET_NAME[p.value] ?? '').toLowerCase())).map((p) => ({ value: `prov:${p.value}`, label: `${p.label} (new account)` }));
    return [...wallets, ...missing];
};
const PROVIDER_OPTS: Opt[] = [{ value: 'MTN', label: 'MTN MoMo' }, { value: 'AIRTEL', label: 'Airtel Money' }, { value: 'ZAMTEL', label: 'Zamtel Kwacha' }, { value: 'OTHER', label: 'Mobile money' }];
const DIRECTION_OPTS: Opt[] = [{ value: 'IN', label: 'Money in' }, { value: 'OUT', label: 'Money out' }];
const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/** Things that can be picked out of the message text itself, offered as suggestions. */
function suggestFromText(text: string) {
    const amounts = uniq([...text.matchAll(/(?<![A-Za-z0-9.])\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?(?![A-Za-z0-9])|(?<![A-Za-z0-9.])\d+(?:\.\d{1,4})?(?![A-Za-z0-9])/g)].map((m) => m[0].replace(/,/g, '')).filter((v) => Number(v) > 0 && (v.includes('.') || v.length <= 7)));
    const refs = uniq([...text.matchAll(/\b[A-Za-z0-9][A-Za-z0-9.\-]{5,}\b/g)].map((m) => m[0].replace(/\.$/, '')).filter((v) => /\d/.test(v) || /^[A-Z]{6,}$/.test(v)));
    const names = uniq([
        ...[...text.matchAll(/\b(?:from|to|at|@)\s+(.{3,60}?)(?=\s+(?:on|at|ref|txn|tid|trans|transaction|id|via|your|new|balance|bal|fee|for|under)\b|[.,;]\s|[.,;]$|$)/gi)].map((m) => m[1]),
        ...[...text.matchAll(/\b[A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)+\b/g)].map((m) => m[0]),
    ]);
    return { amounts, refs, names };
}

interface Form { account: string; provider: string; direction: string; amount: string; fee: string; balanceAfter: string; counterparty: string; reference: string; sender: string; note: string }
const DEFAULT_WALLET_NAME: Record<string, string> = { MTN: 'MTN MoMo', AIRTEL: 'Airtel Money', ZAMTEL: 'Zamtel Kwacha', OTHER: 'Mobile Money' };
/** What the account dropdown shows first: the saved account, else the provider's usual one, else the provider itself. */
const accountFor = (walletId: string | null | undefined, provider: string, opts?: MomoAccountingOptions): string => {
    if (walletId) return walletId;
    const byName = opts?.wallets.find((w) => w.name.toLowerCase() === (DEFAULT_WALLET_NAME[provider] ?? '').toLowerCase());
    return byName ? byName.id : `prov:${provider}`;
};
const fromCapture = (c: MomoCaptureActivity, opts?: MomoAccountingOptions): Form => ({
    account: accountFor(c.external_wallet_id, c.provider, opts), provider: c.provider, direction: c.direction, amount: c.amount != null ? String(Number(c.amount)) : '', fee: c.fee ? String(Number(c.fee)) : '',
    balanceAfter: c.balance_after != null ? String(Number(c.balance_after)) : '', counterparty: c.counterparty ?? '', reference: c.provider_reference ?? '',
    sender: c.sender ?? '', note: c.note ?? '',
});
const toFields = (f: Form): MomoCaptureFields => ({
    ...(f.account.startsWith('prov:') ? { accountId: null, provider: f.account.slice(5) as MomoCaptureFields['provider'] } : { accountId: f.account }), direction: f.direction as 'IN' | 'OUT', amount: f.amount.replace(/,/g, ''),
    fee: f.fee.trim() ? f.fee.replace(/,/g, '') : null, balanceAfter: f.balanceAfter.trim() ? f.balanceAfter.replace(/,/g, '') : null,
    counterparty: f.counterparty.trim() || null, reference: f.reference.trim() || null, sender: f.sender.trim() || null, note: f.note.trim() || null,
});

/** The eight editable details plus a note for the AI. Used when a capture is expanded and when one is moved in by hand. */
const FieldsForm: React.FC<{ form: Form; set: (patch: Partial<Form>) => void; text: string; known: { counterparties: string[]; senders: string[] }; opts?: MomoAccountingOptions; onCreateAccount?: (name: string) => Promise<string | null>; disabled?: boolean }> = ({ form, set, text, known, opts, onCreateAccount, disabled }) => {
    const sug = useMemo(() => suggestFromText(text), [text]);
    const amountOpts = sug.amounts.map((v) => ({ value: v, label: v }));
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Combo label="Provider / account" strict value={form.account} options={accountOptions(opts)} disabled={disabled}
                    onChange={(v) => set({ account: v, provider: v.startsWith('prov:') ? v.slice(5) : (opts?.wallets.find((w) => w.id === v)?.provider ?? 'OTHER') })}
                    onCreate={onCreateAccount ? async (name) => { const id = await onCreateAccount(name); if (id) set({ account: id, provider: 'OTHER' }); } : undefined} />
                <Combo label="Direction" strict value={form.direction} onChange={(v) => set({ direction: v })} options={DIRECTION_OPTS} disabled={disabled} placeholder="Choose…" />
                <Combo label="Amount" numeric value={form.amount} onChange={(v) => set({ amount: v })} options={amountOpts} disabled={disabled} />
                <Combo label="Fee" numeric value={form.fee} onChange={(v) => set({ fee: v })} options={amountOpts} disabled={disabled} />
                <Combo label="Balance after" numeric value={form.balanceAfter} onChange={(v) => set({ balanceAfter: v })} options={amountOpts} disabled={disabled} />
                <Combo label="Counterparty" value={form.counterparty} onChange={(v) => set({ counterparty: v })} options={uniq([...sug.names, ...known.counterparties]).map((v) => ({ value: v, label: v }))} disabled={disabled} />
                <Combo label="Reference" value={form.reference} onChange={(v) => set({ reference: v })} options={sug.refs.map((v) => ({ value: v, label: v }))} disabled={disabled} />
                <Combo label="Sender" value={form.sender} onChange={(v) => set({ sender: v })} options={uniq(['MTN', 'AirtelMoney', 'Zamtel', ...known.senders]).map((v) => ({ value: v, label: v }))} disabled={disabled} />
            </div>
            <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">Note for the AI (optional)</p>
                <textarea value={form.note} disabled={disabled} onChange={(e) => set({ note: e.target.value })} rows={2} maxLength={500}
                    placeholder="What was this for? e.g. Rent for November, paid to the landlord. When you book it, this note goes to the AI that decides the account."
                    className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-navy/30" />
            </div>
        </div>
    );
};

/** Moves a message that was not booked into Captured: confirm or fix the details first. */
const MoveDialog: React.FC<{ m: MomoEverythingItem; known: { counterparties: string[]; senders: string[] }; defaultProvider: string | null; opts?: MomoAccountingOptions; onCreateAccount?: (name: string) => Promise<string | null>; onClose: () => void; onDone: () => void }> = ({ m, known, defaultProvider, opts, onCreateAccount, onClose, onDone }) => {
    const g = m.guess;
    const startProvider = g && g.provider !== 'OTHER' ? g.provider : (defaultProvider ?? 'OTHER');
    const [form, setForm] = useState<Form>({
        account: accountFor(null, startProvider, opts), provider: startProvider, direction: g?.direction ?? '', amount: g?.amount != null ? String(g.amount) : '',
        fee: g?.fee != null ? String(g.fee) : '', balanceAfter: g?.balanceAfter != null ? String(g.balanceAfter) : '', counterparty: g?.counterparty ?? '',
        reference: g?.reference ?? '', sender: '', note: '',
    });
    const move = useMutation({ mutationFn: () => momoCaptureService.moveToCaptured(m.id, toFields(form)), onSuccess: onDone });
    const ready = !!form.direction && Number(form.amount.replace(/,/g, '')) > 0;
    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-5 space-y-4">
                <div>
                    <h4 className="text-base font-bold text-brand-navy">Move to Captured</h4>
                    <p className="text-xs text-gray-500">MoneyWise didn't read this as a transaction. Check or fill in the details and it will be added to Captured, ready to book.</p>
                </div>
                <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 break-words">{m.text}</p>
                <FieldsForm form={form} set={(p) => setForm((f) => ({ ...f, ...p }))} text={m.text} known={known} opts={opts} onCreateAccount={onCreateAccount} />
                {move.error && <p className="text-sm text-red-600">{(move.error as Error).message}</p>}
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-1.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-600">Cancel</button>
                    <button disabled={!ready || move.isPending} onClick={() => move.mutate()} className="px-4 py-1.5 rounded-full bg-brand-navy text-white text-sm font-semibold disabled:opacity-50">{move.isPending ? 'Moving…' : 'Move to Captured'}</button>
                </div>
            </div>
        </div>
    );
};


const kwacha = (n: number) => (n === 0 ? '' : n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const lusakaDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Lusaka' });

/**
 * "Review & book": the double entry that booking will post, with every choice that changes it editable. Nothing is
 * posted until Post is pressed, and what is posted is exactly what the table shows.
 */
const ReviewDialog: React.FC<{ c: MomoCaptureActivity; opts: MomoAccountingOptions; onCreateAccount: (name: string) => Promise<string | null>; onClose: () => void; onPosted: () => void }> = ({ c, opts, onCreateAccount, onClose, onPosted }) => {
    const [account, setAccount] = useState<string>(accountFor(c.external_wallet_id, c.provider, opts));
    const [direction, setDirection] = useState<string>(c.direction);
    const [amount, setAmount] = useState(String(Number(c.amount)));
    const [fee, setFee] = useState(c.fee ? String(Number(c.fee)) : '');
    const [date, setDate] = useState(lusakaDay(c.occurred_at));
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');          // '' = the AI's suggestion
    const [feeCategory, setFeeCategory] = useState('');
    const [aiCategory, setAiCategory] = useState('');      // the suggestion, once seen: later previews reuse it instead of asking the AI again
    const [aiFeeCategory, setAiFeeCategory] = useState('');
    const [preview, setPreview] = useState<MomoPostingPreview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [posting, setPosting] = useState(false);
    const walletId = account.startsWith('prov:') ? '' : account;
    const catId = category || aiCategory, feeCatId = feeCategory || aiFeeCategory;

    useEffect(() => {
        let alive = true;
        setLoading(true);
        const t = setTimeout(async () => {
            try {
                const p = await momoCaptureService.previewPosting(c.id, {
                    walletId: walletId || null, direction: direction as 'IN' | 'OUT', amount: amount.replace(/,/g, ''), fee: fee.trim() ? fee.replace(/,/g, '') : null,
                    accountId: catId || undefined, feeAccountId: feeCatId || undefined, description: description.trim() || undefined, date,
                });
                if (!alive) return;
                setPreview(p); setError(null);
                if (!catId && p.category.accountId) setAiCategory(p.category.accountId);
                if (!feeCatId && p.fee_category?.accountId) setAiFeeCategory(p.fee_category.accountId);
            } catch (e: any) { if (alive) setError(e?.message || 'Could not work out the entry'); }
            finally { if (alive) setLoading(false); }
        }, 450);
        return () => { alive = false; clearTimeout(t); };
        // eslint-disable-next-line
    }, [walletId, direction, amount, fee, date, description, catId, feeCatId]);

    // Any account in the chart can sit on the debit or credit side. Income and expense first (the usual choice), then the rest.
    const TYPE_ORDER: Record<string, number> = { EXPENSE: 0, INCOME: 1, ASSET: 2, LIABILITY: 3, EQUITY: 4 };
    const chartOpts = [...opts.accounts].sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || a.name.localeCompare(b.name))
        .map((a) => ({ value: a.id, label: `${a.code ? a.code + ' · ' : ''}${a.name} — ${a.type.charAt(0) + a.type.slice(1).toLowerCase()}` }));
    const post = async () => {
        setPosting(true); setError(null);
        try {
            await momoCaptureService.post(c.id, {
                direction: direction as 'IN' | 'OUT', amount: amount.replace(/,/g, ''), accountId: catId || undefined, description: description.trim() || undefined,
                walletId: walletId || undefined, date, fee: fee.trim() ? fee.replace(/,/g, '') : null, feeAccountId: feeCatId || undefined,
            });
            onPosted();
        } catch (e: any) { setError(e?.message || 'Could not post'); setPosting(false); }
    };
    const ai = preview?.category.source === 'AI' && !category;

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !posting) onClose(); }}>
            <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-auto p-5 space-y-4">
                <div>
                    <h4 className="text-base font-bold text-brand-navy">Review &amp; book</h4>
                    <p className="text-xs text-gray-500">This is the double entry that will be posted. Pick the account on the debit and the credit side (type to search), fix anything that's wrong, then post it. Nothing is booked until you press Post.</p>
                </div>
                <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 break-words">{c.raw_text}</p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Combo label="Account" strict value={account} onChange={setAccount} options={accountOptions(opts)} onCreate={async (name) => { const id = await onCreateAccount(name); if (id) setAccount(id); }} />
                    <Combo label="Direction" strict value={direction} onChange={(v) => { setDirection(v); setCategory(''); setAiCategory(''); setFeeCategory(''); setAiFeeCategory(''); }} options={DIRECTION_OPTS} />
                    <Combo label="Amount" numeric value={amount} onChange={setAmount} options={[]} />
                    <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">Date</p>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-navy/30" />
                    </div>
                    <Combo label="Fee" numeric value={fee} onChange={(v) => { setFee(v); if (!v.trim()) { setFeeCategory(''); setAiFeeCategory(''); } }} options={[]} />
                </div>
                <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">Description in the ledger</p>
                    <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={preview?.description ?? 'Description'}
                        className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-navy/30" />
                    {preview?.note && <p className="text-xs text-gray-500 mt-1">Your note “{preview.note}” is added to the description and given to the AI.</p>}
                </div>

                <div className="border border-gray-200 rounded-xl">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-t-xl text-xs font-semibold text-gray-600">
                        <span>Accounting entry · {preview?.date ?? date}</span>
                        <span>{loading ? 'Updating…' : preview ? (preview.totals.balanced ? '✓ Balanced' : '⚠ Not balanced') : ''}</span>
                    </div>
                    <table className="w-full text-sm">
                        <thead><tr className="text-[11px] uppercase text-gray-400 text-left"><th className="px-3 py-1.5 font-medium">Account</th><th className="px-3 py-1.5 font-medium text-right w-28">Debit</th><th className="px-3 py-1.5 font-medium text-right w-28">Credit</th></tr></thead>
                        <tbody className={loading ? 'opacity-50' : ''}>
                            {preview?.lines.map((l, i) => (
                                <tr key={i} className="border-t border-gray-100 align-top">
                                    <td className={`px-3 py-2 ${l.credit > 0 ? 'pl-8' : ''}`}>
                                        {l.role === 'MONEY' || l.role === 'FEE_MONEY' ? (
                                            <Combo label="Account" hideLabel strict value={account} onChange={setAccount} options={accountOptions(opts)} disabled={l.role === 'FEE_MONEY'}
                                                onCreate={async (name) => { const id = await onCreateAccount(name); if (id) setAccount(id); }} />
                                        ) : (
                                            <Combo label={l.debit > 0 ? 'Debit account' : 'Credit account'} hideLabel strict value={l.role === 'FEE_CATEGORY' ? feeCatId : catId}
                                                onChange={l.role === 'FEE_CATEGORY' ? setFeeCategory : setCategory} options={chartOpts} placeholder="Choose an account (type to search)" />
                                        )}
                                        {l.note && <p className="text-xs text-gray-500">{l.note}</p>}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">{kwacha(l.debit)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{kwacha(l.credit)}</td>
                                </tr>
                            ))}
                            {preview && (
                                <tr className="border-t border-gray-200 bg-gray-50 font-semibold"><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right tabular-nums">{kwacha(preview.totals.debit)}</td><td className="px-3 py-2 text-right tabular-nums">{kwacha(preview.totals.credit)}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {ai && preview?.category.reasoning && <p className="text-xs text-sky-800 bg-sky-50 border border-sky-100 rounded-lg p-2">The AI chose this category{preview.category.confidence != null ? ` (${Math.round(preview.category.confidence * 100)}% sure)` : ''}: {preview.category.reasoning} You can change it above.</p>}
                {preview?.lines.some((l) => l.type === 'SUSPENSE') && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2">No category was chosen, so this would sit in Suspense. Pick a category above to account for it properly.</p>}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} disabled={posting} className="px-4 py-1.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-600">Cancel</button>
                    <button onClick={() => void post()} disabled={posting || loading || !preview || !preview.totals.balanced} className="px-5 py-1.5 rounded-full bg-brand-navy text-white text-sm font-semibold disabled:opacity-50">{posting ? 'Posting…' : 'Post to ledger'}</button>
                </div>
            </div>
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

const CaptureRow: React.FC<{ c: MomoCaptureActivity; busy: boolean; known: { counterparties: string[]; senders: string[] }; opts?: MomoAccountingOptions; onCreateAccount?: (name: string) => Promise<string | null>; onSave: (f: MomoCaptureFields) => Promise<unknown>; onReview: () => void; onDismiss: () => void }> = ({ c, busy, known, opts, onCreateAccount, onSave, onReview, onDismiss }) => {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState<Form>(() => fromCapture(c, opts));
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const original = useMemo(() => JSON.stringify(fromCapture(c, opts)), [c, opts]);
    const dirty = JSON.stringify(form) !== original;
    // A fresh copy from the server (after a save, or another tab's edit) replaces the form, unless there are unsaved changes.
    useEffect(() => { if (!dirty) setForm(fromCapture(c, opts)); /* eslint-disable-next-line */ }, [original]);
    const isIn = c.direction === 'IN';
    const open_ = c.status === 'PENDING' || c.status === 'MATCHED';
    const save = async (): Promise<boolean> => {
        setSaving(true); setErr(null);
        try { await onSave(toFields(form)); return true; } catch (e: any) { setErr(e?.message || 'Could not save'); return false; } finally { setSaving(false); }
    };
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
                    <FieldsForm form={form} set={(p) => setForm((f) => ({ ...f, ...p }))} text={c.raw_text} known={known} opts={opts} onCreateAccount={onCreateAccount} disabled={!open_ || saving} />
                    {!open_ && c.note && <p className="text-xs text-gray-600"><span className="font-semibold">Note:</span> {c.note}</p>}
                    {err && <p className="text-sm text-red-600">{err}</p>}
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
                            {busy || saving ? <span className="text-sm text-gray-500">Working…</span> : (<>
                                <button onClick={onDismiss} className="px-4 py-1.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-600">Dismiss</button>
                                {dirty && <button onClick={() => void save()} className="px-4 py-1.5 rounded-full border border-brand-navy text-brand-navy text-sm font-semibold">Save changes</button>}
                                <button onClick={async () => {
                                    if (c.status === 'MATCHED' && !window.confirm('This looks like a payment already in MoneyWise through your wallet. Booking it again would count it twice. Review it anyway?')) return;
                                    if (dirty && !(await save())) return;   // review exactly what is on screen
                                    onReview();
                                }} className="px-4 py-1.5 rounded-full bg-brand-navy text-white text-sm font-semibold">{c.status === 'MATCHED' ? 'Review & book anyway' : dirty ? 'Save & review' : 'Review & book'}</button>
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
                <Field k="Waiting since then" v={pending !== 0 ? `${pending > 0 ? '+' : '−'}${formatKwacha(Math.abs(pending))}` : 'None'} />
                <Field k="Difference" v={b.difference != null ? (Math.abs(diff) < 0.005 ? 'None' : `${diff > 0 ? '+' : '−'}${formatKwacha(Math.abs(diff))}`) : null} />
            </div>
            {b.status === 'OPEN' && (
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">The phone's figure plus what you've recorded since. Adjusting sets the account to match; it isn't counted as income or spending.</p>
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
