import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, LinkIcon, KeyRound, ChevronRight } from 'lucide-react';
import { apiGet, apiPut } from '../lib/api';
import type { PaymentLinkAnalyticsResponse } from '../lib/types';

/**
 * Pulls payment-link load success/failure + error-reason breakdown straight
 * from PostHog via our own API, since the PostHog shared-dashboard view for
 * this data has been unreliable (blank on load).
 */
export function PaymentLinkAnalyticsCard() {
    const [data, setData] = useState<PaymentLinkAnalyticsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        apiGet<PaymentLinkAnalyticsResponse>('/admin/analytics/payment-links')
            .then(setData)
            .catch((err) => setError(err?.message || 'Failed to load'))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const saveKey = async () => {
        if (!apiKeyInput.trim()) return;
        setSaving(true);
        setSaveMessage(null);
        try {
            await apiPut('/admin/analytics/posthog-key', { apiKey: apiKeyInput.trim() });
            setApiKeyInput('');
            setSaveMessage('Saved. Loading data…');
            load();
        } catch (err: any) {
            setSaveMessage(err?.message || 'Failed to save key');
        } finally {
            setSaving(false);
        }
    };

    const total = (data?.loaded ?? 0) + (data?.failed ?? 0);
    const failurePct = total > 0 ? Math.round(((data?.failed ?? 0) / total) * 100) : 0;

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 text-slate-400" />
                    <h2 className="text-sm font-semibold text-brand-navy">Payment Link Analytics</h2>
                    <span className="text-xs text-slate-400">last 30 days · via PostHog</span>
                </div>
                {data?.configured && !data.queryError && (
                    <Link
                        to="/analytics/payment-links"
                        className="flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline"
                    >
                        View details <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                )}
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
            )}

            {!loading && error && (
                <div className="space-y-2">
                    <div className="text-sm text-rose-600">{error}</div>
                    <button
                        onClick={load}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                        Retry
                    </button>
                </div>
            )}

            {!loading && !error && data && (!data.configured || data.queryError) && (
                <div className="space-y-2">
                    {data.queryError ? (
                        <div className="text-sm text-rose-600">
                            A key is saved, but PostHog rejected it: {data.queryError}. Paste a corrected key below.
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <KeyRound className="h-3.5 w-3.5" />
                            Not configured yet — paste a PostHog Personal API Key (query:read scope) to enable this panel.
                        </div>
                    )}
                    <div className="flex gap-2">
                        <input
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            placeholder="phx_..."
                            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
                        />
                        <button
                            onClick={saveKey}
                            disabled={saving || !apiKeyInput.trim()}
                            className="rounded-lg bg-brand-blue px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                        </button>
                    </div>
                    {saveMessage && <div className="text-xs text-slate-500">{saveMessage}</div>}
                </div>
            )}

            {!loading && !error && data?.configured && !data.queryError && (
                <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                            <div className="text-xl font-bold text-emerald-600">{data.loaded}</div>
                            <div className="text-xs font-medium text-slate-500">Loaded successfully</div>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                            <div className="text-xl font-bold text-rose-600">{data.failed}</div>
                            <div className="text-xs font-medium text-slate-500">Failed to load</div>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                            <div className="text-xl font-bold text-brand-navy">{failurePct}%</div>
                            <div className="text-xs font-medium text-slate-500">Failure rate</div>
                        </div>
                    </div>

                    {data.errorsByReason.length > 0 && (
                        <div>
                            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                Errors by reason
                            </div>
                            <div className="space-y-1.5">
                                {data.errorsByReason.map(({ reason, count }) => {
                                    const pct = data.failed > 0 ? Math.round((count / data.failed) * 100) : 0;
                                    return (
                                        <div key={reason} className="flex items-center gap-2 text-sm">
                                            <div className="w-40 shrink-0 truncate text-slate-600" title={reason}>
                                                {reason}
                                            </div>
                                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                                                <div className="h-full rounded-full bg-rose-400" style={{ width: `${pct}%` }} />
                                            </div>
                                            <div className="w-8 shrink-0 text-right tabular-nums text-slate-500">{count}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
