import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Check, Ban, RotateCcw, Link2, FileText, Smartphone, ZoomIn, ZoomOut, AlertTriangle } from 'lucide-react';
import { captureApi, kwacha, type CaptureDetail, type CaptureRow } from './captureApi';
import { ConversationDrawer } from './ConversationDrawer';

interface Props {
    id: string;
    canReview: boolean;
    onClose: () => void;
    onChanged: () => void;
    onNext?: () => void;
    onPrev?: () => void;
}

type Form = { amount: string; occurred_on: string; direction: 'IN' | 'OUT'; wallet_id: string; account_id: string; description: string };

const FLAG_TEXT: Record<string, string> = {
    INJECTION_SUSPECTED: 'This evidence contains text that looks like instructions. Check it carefully.',
    NO_AMOUNT: 'No amount could be read. Enter it from the evidence.',
    UNCONVERTED_CURRENCY: 'This is not in Kwacha. Enter the Kwacha amount.',
    AI_BUDGET_EXCEEDED: "Today's reading limit was reached, so nothing was filled in.",
    AI_UNAVAILABLE: 'The receipt could not be read automatically.',
    MATCH_CONFLICT: 'The matching wallet entry is already linked to another capture.',
    POSSIBLE_LENCO_DUPLICATE: 'This same amount has since arrived in your MoneyWise wallet. If it is the same money, undo this entry.',
    AMOUNT_NOT_IN_TEXT: 'This amount does not appear in the chat. Check it before approving.',
    EXTRACTION_INVALID: 'The message could not be read automatically.',
    INVOICE_NOT_APPLIED: 'This was booked, but could not be applied to the open invoice. Apply it from the ledger.',
};

const Field: React.FC<{ label: string; ai: boolean; children: React.ReactNode }> = ({ label, ai, children }) => (
    <label className="block">
        <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 mb-1">
            {label}{ai && <Sparkles className="h-3 w-3 text-[#006AFF]" aria-label="Filled in by MoneyWise" />}
        </span>
        {children}
    </label>
);
const inputCls = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-[#006AFF]/30 disabled:bg-gray-50';

export const CaptureReviewCard: React.FC<Props> = ({ id, canReview, onClose, onChanged, onNext, onPrev }) => {
    const [d, setD] = useState<CaptureDetail | null>(null);
    const [form, setForm] = useState<Form | null>(null);
    const [items, setItems] = useState<any[]>([]);
    const [touched, setTouched] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [threadOpen, setThreadOpen] = useState(false);
    const [others, setOthers] = useState<CaptureRow[] | null>(null);
    const amountRef = useRef<HTMLInputElement>(null);

    const load = async () => {
        setError(null);
        try {
            const r = await captureApi.detail(id);
            setD(r);
            const c = r.capture;
            setForm({
                amount: c.zmw_amount != null ? String(c.zmw_amount) : '', occurred_on: c.occurred_on || '', direction: c.direction || 'OUT',
                wallet_id: c.suggested_wallet_id || '', account_id: c.suggested_account_id || '', description: c.evidence_summary || c.counterparty_name || '',
            });
            setItems(c.line_items || []);
            setTouched(new Set());
            setZoom(1);
        } catch (e: any) { setError(e?.message || 'Could not load this capture'); }
    };
    useEffect(() => { setD(null); load(); }, [id]);

    const c = d?.capture;
    const open = !!c && ['NEW', 'NEEDS_REVIEW'].includes(c.status);
    const editable = canReview && open;
    const isMomo = !!c?.momo_capture_id;
    const set = (k: keyof Form, v: string) => { setForm(f => (f ? { ...f, [k]: v } : f)); setTouched(t => new Set(t).add(k)); };
    const editItem = (i: number, k: string, v: string) => {
        setItems(all => all.map((li, n) => (n === i ? { ...li, [k]: v } : li)));
        setTouched(t => new Set(t).add('line_items'));
    };
    const ai = (k: keyof Form, filled: boolean) => filled && !touched.has(k) && !c?.deterministic;

    const act = async (fn: () => Promise<unknown>, advance = true) => {
        setBusy(true); setError(null);
        try { await fn(); onChanged(); if (advance && onNext) onNext(); else await load(); }
        catch (e: any) { setError(e?.message || 'That did not work'); }
        finally { setBusy(false); }
    };
    const approve = () => form && act(() => captureApi.approve(id, {
        amount: Number(form.amount), occurred_on: form.occurred_on, direction: form.direction, description: form.description,
        account_id: form.account_id || null, ...(isMomo ? {} : { wallet_id: form.wallet_id || null }),
        ...(touched.has('line_items') ? { line_items: items } : {}),
    }));

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (e.metaKey || e.ctrlKey || e.altKey || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            const k = e.key.toLowerCase();
            if (k === 'escape') onClose();
            else if (k === 'j' && onNext) onNext();
            else if (k === 'k' && onPrev) onPrev();
            else if (editable && !busy && k === 'a') { e.preventDefault(); approve(); }
            else if (editable && !busy && k === 'd') { e.preventDefault(); act(() => captureApi.dismiss(id)); }
            else if (editable && k === 'e') { e.preventDefault(); amountRef.current?.focus(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const candidates = (c?.match_candidates || []).filter((m: any) => m.kind === 'LENCO_ENTRY')
        .map((m: any) => ({ ...m, entry: d?.entries.find(e => e.id === m.id) })).filter((m: any) => m.entry);
    const matched = c?.matched_cashbook_entry_id ? d?.entries.find(e => e.id === c.matched_cashbook_entry_id) : null;
    const canUndo = canReview && !!c && (c.status === 'DISMISSED' || (c.status === 'MERGED' && c.match_type === 'LENCO_ENTRY' && !isMomo)
        || (['APPROVED', 'AUTO_POSTED'].includes(c.status) && !!d?.undoAvailableUntil && new Date(d.undoAvailableUntil) > new Date()));

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={onClose}>
            <div className="w-full md:max-w-5xl max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl md:rounded-3xl shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="text-base font-bold text-brand-navy">Review captured transaction</h3>
                        <p className="text-[11px] text-gray-400 hidden md:block">A approve · E edit · D not a transaction · J/K next/previous</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5 text-gray-500" /></button>
                </div>

                {error && <div className="mx-5 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
                {!d && !error && <div className="p-16 text-center text-sm text-gray-400">Loading…</div>}

                {d && c && form && (
                    <div className="grid md:grid-cols-2 gap-5 p-5">
                        {/* Evidence */}
                        <div className="space-y-3">
                            {d.attachments.map(a => a.mime === 'application/pdf' ? (
                                <a key={a.id} href={a.url ?? '#'} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-4 rounded-2xl border border-gray-200 text-sm text-[#006AFF] font-semibold">
                                    <FileText className="h-5 w-5" /> Open PDF
                                </a>
                            ) : (
                                <div key={a.id} className="relative rounded-2xl border border-gray-200 bg-gray-50 overflow-auto max-h-[60vh]">
                                    {a.url && <img src={a.url} alt="Receipt" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }} className="w-full transition-transform" />}
                                    <div className="absolute top-2 right-2 flex gap-1">
                                        <button onClick={() => setZoom(z => Math.min(z + 0.5, 3))} className="p-1.5 rounded-lg bg-white/90 shadow" aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
                                        <button onClick={() => setZoom(z => Math.max(z - 0.5, 1))} className="p-1.5 rounded-lg bg-white/90 shadow" aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
                                    </div>
                                </div>
                            ))}
                            {d.momoMessages.map(m => (
                                <div key={m.id} className="p-4 rounded-2xl bg-[#F0F7FF] text-sm text-brand-navy">
                                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 mb-1"><Smartphone className="h-3.5 w-3.5" /> {m.provider} message</div>
                                    {m.raw_text}
                                </div>
                            ))}
                            {(d.emails ?? []).map(e => (
                                <div key={e.id} className="p-4 rounded-2xl bg-gray-50 text-sm text-brand-navy space-y-1">
                                    <div className="font-semibold">{e.subject || 'Email'}</div>
                                    <div className="text-[11px] text-gray-500">{e.from}</div>
                                    <div className="text-xs text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto">{e.snippet}</div>
                                </div>
                            ))}
                            {(d.chatMessages ?? []).length > 0 && (
                                <div className="space-y-1.5 rounded-2xl bg-gray-50 p-3 max-h-64 overflow-y-auto">
                                    {d.chatMessages.map(m => (
                                        <div key={m.id} className={`max-w-[85%] w-fit rounded-xl px-3 py-1.5 text-sm ${m.direction === 'OUT' ? 'ml-auto bg-[#CFE4FF]' : 'bg-white border border-gray-100'}`}>
                                            {m.body || `[${m.message_type}]`}
                                        </div>
                                    ))}
                                    <button onClick={() => setThreadOpen(true)} className="text-xs font-semibold text-[#006AFF]">View full conversation</button>
                                </div>
                            )}
                            {items.length > 0 && (
                                <div className="rounded-2xl border border-gray-100 p-3 text-xs text-gray-600 space-y-1.5">
                                    {items.map((li: any, i: number) => editable ? (
                                        <div key={i} className="flex items-center gap-2">
                                            <input className="w-12 rounded-lg border border-gray-200 px-2 py-1" inputMode="decimal" aria-label="Quantity" value={li.qty ?? ''} onChange={e => editItem(i, 'qty', e.target.value)} />
                                            <input className="flex-1 min-w-0 rounded-lg border border-gray-200 px-2 py-1" aria-label="Item" value={li.name ?? ''} onChange={e => editItem(i, 'name', e.target.value)} />
                                            <input className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-right" inputMode="decimal" aria-label="Total" value={li.total ?? ''} onChange={e => editItem(i, 'total', e.target.value)} />
                                            <button onClick={() => { setItems(all => all.filter((_, n) => n !== i)); setTouched(t => new Set(t).add('line_items')); }} className="p-1 text-gray-400 hover:text-red-600" aria-label="Remove item"><X className="h-3.5 w-3.5" /></button>
                                        </div>
                                    ) : (
                                        <div key={i} className="flex justify-between gap-2"><span>{li.qty ? `${li.qty} × ` : ''}{li.name}</span><span>{li.total != null ? kwacha(li.total) : ''}</span></div>
                                    ))}
                                </div>
                            )}
                            {c.flags.map(f => (
                                <div key={f} className="flex gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                                    <AlertTriangle className="h-4 w-4 shrink-0" /> {FLAG_TEXT[f] ?? f}
                                </div>
                            ))}
                            {c.claim_state === 'CLAIMED' && c.direction === 'IN' && (
                                <p className="text-xs text-gray-500">Not yet seen in any wallet. Approve only if you know the money arrived.</p>
                            )}
                        </div>

                        {/* Draft */}
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Amount (K)" ai={ai('amount', !!c.zmw_amount)}>
                                    <input ref={amountRef} className={inputCls} inputMode="decimal" value={form.amount} disabled={!editable} onChange={e => set('amount', e.target.value)} />
                                </Field>
                                <Field label="Date" ai={ai('occurred_on', !!c.occurred_on)}>
                                    <input type="date" className={inputCls} value={form.occurred_on} disabled={!editable} onChange={e => set('occurred_on', e.target.value)} />
                                </Field>
                            </div>
                            <Field label="Direction" ai={ai('direction', !!c.direction)}>
                                <select className={inputCls} value={form.direction} disabled={!editable} onChange={e => set('direction', e.target.value)}>
                                    <option value="IN">Money in</option><option value="OUT">Money out</option>
                                </select>
                            </Field>
                            {!isMomo && (
                                <Field label="Paid through" ai={ai('wallet_id', !!c.suggested_wallet_id)}>
                                    <select className={inputCls} value={form.wallet_id} disabled={!editable} onChange={e => set('wallet_id', e.target.value)}>
                                        <option value="">{c.payment_method === 'CASH' ? 'Cash' : 'Choose an account'}</option>
                                        {d.wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    </select>
                                </Field>
                            )}
                            <Field label="Category" ai={ai('account_id', !!c.suggested_account_id)}>
                                <select className={inputCls} value={form.account_id} disabled={!editable} onChange={e => set('account_id', e.target.value)}>
                                    <option value="">Uncategorised</option>
                                    {d.categories.map(a => <option key={a.id} value={a.id}>{a.emoji ? `${a.emoji} ` : ''}{a.name}</option>)}
                                </select>
                            </Field>
                            <Field label="Description" ai={ai('description', !!c.evidence_summary)}>
                                <input className={inputCls} value={form.description} disabled={!editable} onChange={e => set('description', e.target.value)} />
                            </Field>

                            {canReview && !c.suggested_crm_contact_id && !!c.counterparty_name && (
                                <button disabled={busy} onClick={() => act(() => captureApi.createContact(id), false)} className="text-xs font-semibold text-[#006AFF] disabled:opacity-40">
                                    Add {c.counterparty_name} to customers
                                </button>
                            )}
                            {matched && (
                                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                                    Matches wallet {Number(matched.debit) > 0 ? 'inflow' : 'payment'} {kwacha(Number(matched.debit) || Number(matched.credit))} on {matched.date}. No new entry is created.
                                </div>
                            )}
                            {editable && candidates.length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-[11px] font-semibold text-gray-500">Possible matches in your MoneyWise wallet</div>
                                    {candidates.map((m: any) => (
                                        <button key={m.id} disabled={busy} onClick={() => act(() => captureApi.merge(id, { cashbookEntryId: m.id, accountId: form.account_id || undefined }))}
                                            className="w-full flex items-center justify-between gap-2 p-3 rounded-xl border border-gray-200 hover:border-[#006AFF] text-left text-xs">
                                            <span className="truncate">{m.entry.description}<span className="block text-gray-400">{(m.entry.transaction_at || m.entry.created_at).slice(0, 16).replace('T', ' ')}{m.phoneMatch ? ' · same phone' : ''}</span></span>
                                            <span className="flex items-center gap-1 font-semibold text-[#006AFF] shrink-0"><Link2 className="h-3.5 w-3.5" /> Merge</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {editable && !others && (
                                <button onClick={() => captureApi.list('NEEDS_REVIEW').then(r => setOthers(r.items.filter(o => o.id !== id))).catch((e: any) => setError(e?.message || 'Could not load captures'))}
                                    className="text-xs font-semibold text-[#006AFF]">Merge with another capture</button>
                            )}
                            {editable && others && (
                                <div className="space-y-1.5">
                                    {others.length === 0 && <p className="text-xs text-gray-500">No other captures are waiting for review.</p>}
                                    {others.map(o => (
                                        <button key={o.id} disabled={busy} onClick={() => act(() => captureApi.merge(id, { captureId: o.id }))}
                                            className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border border-gray-200 hover:border-[#006AFF] text-left text-xs">
                                            <span className="truncate">{o.counterparty_name || 'Capture'}{o.occurred_on ? ` · ${o.occurred_on}` : ''}</span>
                                            <span className="font-semibold shrink-0">{kwacha(o.zmw_amount)}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2 pt-2">
                                {editable && (<>
                                    <button disabled={busy} onClick={approve} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-[#006AFF] text-white disabled:opacity-40">
                                        <Check className="h-4 w-4" /> {touched.size ? 'Save & approve' : 'Approve'}
                                    </button>
                                    <button disabled={busy} onClick={() => act(() => captureApi.dismiss(id))} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 disabled:opacity-40">
                                        <Ban className="h-4 w-4" /> Not a transaction
                                    </button>
                                </>)}
                                {canUndo && (
                                    <button disabled={busy} onClick={() => act(() => captureApi.undo(id), false)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 disabled:opacity-40">
                                        <RotateCcw className="h-4 w-4" /> Undo
                                    </button>
                                )}
                                {!open && <span className="self-center text-xs text-gray-400">{c.status === 'AUTO_POSTED' ? 'Booked automatically' : c.status.replace('_', ' ').toLowerCase()}</span>}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {threadOpen && <ConversationDrawer captureId={id} canReply={canReview} onClose={() => setThreadOpen(false)} />}
        </div>
    );
};
