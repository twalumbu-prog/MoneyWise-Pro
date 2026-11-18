import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Megaphone, X } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { formatDateTime } from '../lib/format';

interface Campaign {
    id: string; kind: string; label: string; store_name: string; product_name: string | null; start_date: string; end_date: string; days: number; price: number;
    phase: string; created_at: string; reviewed_by: string | null; reviewed_at: string | null; reject_reason: string | null; impressions: number; clicks: number;
}

const money = (n: number) => `K${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Ads() {
    const [pending, setPending] = useState<Campaign[]>([]);
    const [recent, setRecent] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [rejecting, setRejecting] = useState<string | null>(null);
    const [reason, setReason] = useState('');

    const load = useCallback(async () => {
        setError(null);
        try {
            const r = await apiGet<{ pending: Campaign[]; recent: Campaign[] }>('/admin/ads');
            setPending(r.pending); setRecent(r.recent);
        } catch (e: any) { setError(e?.message || 'Could not load the ads.'); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const act = async (id: string, path: 'approve' | 'reject', body?: object) => {
        setBusyId(id); setError(null);
        try { await apiPost(`/admin/ads/${id}/${path}`, body ?? {}); setRejecting(null); setReason(''); await load(); }
        catch (e: any) { setError(e?.message || 'That did not work.'); }
        finally { setBusyId(null); }
    };

    return (
        <div>
            <div className="mb-5 flex items-center gap-2"><Megaphone className="h-5 w-5 text-brand-navy" /><h1 className="text-lg font-semibold text-brand-navy">Marketplace ads</h1></div>
            <p className="mb-5 max-w-2xl text-sm text-slate-500">Sellers have paid for these. Approve to put them live on the dates they chose, or reject with a reason and their payment is returned automatically.</p>
            {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

            <section className="mb-8 rounded-xl border border-slate-200 bg-white">
                <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">Waiting for review ({pending.length})</h2>
                {loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                    : pending.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-400">Nothing waiting.</p> : (
                    <ul className="divide-y divide-slate-100">
                        {pending.map((c) => (
                            <li key={c.id} className="px-5 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-800">{c.label}{c.product_name ? ` · ${c.product_name}` : ''}</p>
                                        <p className="text-xs text-slate-500">{c.store_name} · {c.start_date} to {c.end_date} ({c.days} days) · {money(c.price)} · booked {formatDateTime(c.created_at)}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button disabled={busyId === c.id} onClick={() => act(c.id, 'approve')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Approve</button>
                                        <button disabled={busyId === c.id} onClick={() => { setRejecting(rejecting === c.id ? null : c.id); setReason(''); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"><X className="h-3.5 w-3.5" /> Reject</button>
                                    </div>
                                </div>
                                {rejecting === c.id && (
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Reason the seller will see" className="min-w-[260px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                                        <button disabled={!reason.trim() || busyId === c.id} onClick={() => act(c.id, 'reject', { reason })} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">{busyId === c.id ? 'Refunding…' : 'Reject and refund'}</button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white">
                <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">Recently decided</h2>
                {recent.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-400">No decisions yet.</p> : (
                    <ul className="divide-y divide-slate-100">
                        {recent.map((c) => (
                            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                                <span className="min-w-0"><span className="font-medium text-slate-800">{c.label}{c.product_name ? ` · ${c.product_name}` : ''}</span> <span className="text-slate-500">· {c.store_name}</span></span>
                                <span className="text-xs text-slate-500">{c.phase === 'REJECTED' ? `Rejected: ${c.reject_reason}` : `${c.phase.toLowerCase()} · ${c.impressions} views, ${c.clicks} clicks`}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
