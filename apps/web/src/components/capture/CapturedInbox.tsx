import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Receipt, Smartphone, MessageCircle, Mail, Sparkles, CheckCheck, Inbox } from 'lucide-react';
import { captureApi, kwacha, readFileAsBase64, type CaptureRow } from './captureApi';
import { CaptureReviewCard } from './CaptureReviewCard';

const SOURCE_ICON: Record<CaptureRow['source'], React.ReactNode> = {
    RECEIPT_UPLOAD: <Receipt className="h-4 w-4" />, MOMO_SMS: <Smartphone className="h-4 w-4" />, EMAIL: <Mail className="h-4 w-4" />,
    WHATSAPP: <MessageCircle className="h-4 w-4" />, FACEBOOK: <MessageCircle className="h-4 w-4" />, INSTAGRAM: <MessageCircle className="h-4 w-4" />,
};
const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
    NEEDS_REVIEW: { label: 'To review', cls: 'bg-amber-50 text-amber-700' },
    POSTING: { label: 'Booking…', cls: 'bg-gray-100 text-gray-600' },
    APPROVED: { label: 'Booked', cls: 'bg-emerald-50 text-emerald-700' },
    AUTO_POSTED: { label: 'Auto', cls: 'bg-[#F0F7FF] text-[#006AFF]' },
    MERGED: { label: 'Matched', cls: 'bg-emerald-50 text-emerald-700' },
    DISMISSED: { label: 'Dismissed', cls: 'bg-gray-100 text-gray-500' },
    FAILED: { label: 'Failed', cls: 'bg-red-50 text-red-700' },
};
const ready = (c: CaptureRow) => c.status === 'NEEDS_REVIEW' && Number(c.zmw_amount) > 0 && !!c.suggested_account_id
    && (!!c.momo_capture_id || !!c.suggested_wallet_id || c.payment_method === 'CASH');
const dayLabel = (iso: string) => {
    const d = new Date(iso); const today = new Date(); const y = new Date(Date.now() - 86400_000);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-ZM', { weekday: 'short', day: 'numeric', month: 'short' });
};

interface Props { canReview: boolean; onCountChange?: (n: number) => void }

export const CapturedInbox: React.FC<Props> = ({ canReview, onCountChange }) => {
    const navigate = useNavigate();
    const [items, setItems] = useState<CaptureRow[]>([]);
    const [enabled, setEnabled] = useState(true);
    const [planEligible, setPlanEligible] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const load = async () => {
        try {
            const s = await captureApi.settings();
            setPlanEligible(s.planEligible);
            if (!s.planEligible) { setItems([]); setError(null); onCountChange?.(0); return; }
            const r = await captureApi.list();
            setItems(r.items); setEnabled(r.enabled); setError(null);
            onCountChange?.(r.items.filter(i => i.status === 'NEEDS_REVIEW').length);
        } catch (e: any) { setError(e?.message || 'Could not load captured transactions'); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);
    // Uploads are drafted in the background; refresh while anything is still being read.
    useEffect(() => {
        if (!notice) return;
        const t = setInterval(load, 5000);
        const stop = setTimeout(() => { clearInterval(t); setNotice(null); }, 90_000);
        return () => { clearInterval(t); clearTimeout(stop); };
    }, [notice]);

    const groups = useMemo(() => {
        const m = new Map<string, CaptureRow[]>();
        for (const c of items) { const k = dayLabel(c.created_at); m.set(k, [...(m.get(k) || []), c]); }
        return Array.from(m.entries());
    }, [items]);
    const order = items.map(i => i.id);
    const selectedRows = items.filter(i => selected.has(i.id));
    const bulkReady = selectedRows.length > 0 && selectedRows.every(ready);

    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setBusy(true); setError(null);
        try {
            const r = await captureApi.upload(await readFileAsBase64(file), file.type);
            setNotice(r.duplicate ? 'This receipt was already uploaded.' : 'Reading your receipt… the draft appears here in a few seconds.');
            await load();
        } catch (err: any) { setError(err?.message || 'Upload failed'); }
        finally { setBusy(false); }
    };

    const bulkApprove = async () => {
        setBusy(true); setError(null);
        try {
            const r = await captureApi.bulkApprove(selectedRows.map(s => s.id));
            const failed = r.results.filter(x => !x.ok).length;
            setNotice(failed ? `${r.results.length - failed} approved, ${failed} need attention.` : `${r.results.length} approved.`);
            setSelected(new Set());
            await load();
        } catch (err: any) { setError(err?.message || 'Could not approve'); }
        finally { setBusy(false); }
    };

    if (!loading && !planEligible) {
        return (
            <div className="bg-gray-50/60 rounded-2xl p-16 text-center">
                <Inbox className="h-10 w-10 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-brand-navy">Transaction capture is a Premium feature</h3>
                <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">An active Premium plan turns receipts and mobile money messages into ready-to-approve entries.</p>
                <button onClick={() => navigate('/settings?tab=billing')} className="mt-5 px-4 py-2 rounded-xl text-sm font-semibold bg-[#006AFF] text-white">View plans</button>
            </div>
        );
    }

    if (!loading && !enabled && items.length === 0) {
        return (
            <div className="bg-gray-50/60 rounded-2xl p-16 text-center">
                <Inbox className="h-10 w-10 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-brand-navy">Capture is not turned on</h3>
                <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">Turn on transaction capture to turn receipts and mobile money messages into ready-to-approve entries.</p>
                <button onClick={() => navigate('/settings?tab=integrations')} className="mt-5 px-4 py-2 rounded-xl text-sm font-semibold bg-[#006AFF] text-white">Go to Integrations</button>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                {enabled && (
                    <button disabled={busy} onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#006AFF] text-white disabled:opacity-40">
                        <Camera className="h-4 w-4" /> Add receipt
                    </button>
                )}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="hidden" onChange={onFile} />
                {canReview && selected.size > 0 && (
                    <button disabled={busy || !bulkReady} onClick={bulkApprove} title={bulkReady ? '' : 'Every selected item needs an amount, account and category'}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-brand-navy text-white disabled:opacity-40">
                        <CheckCheck className="h-4 w-4" /> Approve {selected.size}
                    </button>
                )}
                {notice && <span className="text-xs text-gray-500">{notice}</span>}
            </div>
            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
            {loading && <div className="p-16 text-center text-sm text-gray-400">Loading…</div>}
            {!loading && items.length === 0 && (
                <div className="bg-gray-50/60 rounded-2xl p-16 text-center">
                    <h3 className="text-lg font-bold text-brand-navy">Nothing captured yet</h3>
                    <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">Add a receipt photo, or set up mobile money capture on your phone.</p>
                    <button onClick={() => navigate('/settings?tab=integrations')} className="mt-4 text-sm font-semibold text-[#006AFF]">Set up capture</button>
                </div>
            )}

            {groups.map(([day, rows]) => (
                <div key={day}>
                    <div className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">{day}</div>
                    <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
                        {rows.map(c => {
                            const chip = STATUS_CHIP[c.status] ?? STATUS_CHIP.NEEDS_REVIEW;
                            return (
                                <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => setOpenId(c.id)}>
                                    {canReview && (
                                        <input type="checkbox" className="h-4 w-4 accent-[#006AFF]" disabled={c.status !== 'NEEDS_REVIEW'} checked={selected.has(c.id)}
                                            onClick={e => e.stopPropagation()}
                                            onChange={() => setSelected(s => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
                                    )}
                                    <div className="h-9 w-9 rounded-xl bg-[#F0F7FF] text-[#006AFF] flex items-center justify-center shrink-0">{SOURCE_ICON[c.source]}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-brand-navy truncate">{c.counterparty_name || (c.source === 'RECEIPT_UPLOAD' ? 'Receipt' : 'Mobile money')}</div>
                                        <div className="text-[11px] text-gray-400">{c.direction === 'IN' ? 'Money in' : c.direction === 'OUT' ? 'Money out' : 'Unknown'}{c.occurred_on ? ` · ${c.occurred_on}` : ''}</div>
                                    </div>
                                    {c.confidence != null && !c.deterministic && c.status === 'NEEDS_REVIEW' && (
                                        <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-gray-500"><Sparkles className="h-3 w-3" />{Math.round(Number(c.confidence) * 100)}%</span>
                                    )}
                                    <div className={`text-sm font-bold ${c.direction === 'IN' ? 'text-emerald-600' : 'text-brand-navy'}`}>{kwacha(c.zmw_amount ?? c.amount)}</div>
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${chip.cls}`}>{chip.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {openId && (
                <CaptureReviewCard
                    id={openId}
                    canReview={canReview}
                    onClose={() => setOpenId(null)}
                    onChanged={load}
                    onNext={() => { const i = order.indexOf(openId); setOpenId(i >= 0 && i < order.length - 1 ? order[i + 1] : null); }}
                    onPrev={() => { const i = order.indexOf(openId); if (i > 0) setOpenId(order[i - 1]); }}
                />
            )}
        </div>
    );
};
