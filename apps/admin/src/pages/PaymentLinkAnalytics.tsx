import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { apiGet } from '../lib/api';
import type { PaymentLinkAnalyticsResponse, PaymentLinkAttemptsResponse } from '../lib/types';
import { PieChart } from '../components/PieChart';
import { AttemptsTable } from '../components/AttemptsTable';

const REASON_COLORS = ['#FF2970', '#006AFF', '#03D47C', '#F59E0B', '#8B5CF6', '#0EA5E9'];

export default function PaymentLinkAnalytics() {
    const [data, setData] = useState<PaymentLinkAnalyticsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const [attempts, setAttempts] = useState<PaymentLinkAttemptsResponse | null>(null);
    const [attemptsLoading, setAttemptsLoading] = useState(false);
    const [attemptsError, setAttemptsError] = useState<string | null>(null);
    const [showRatioData, setShowRatioData] = useState(false);
    const [showReasonData, setShowReasonData] = useState(false);

    useEffect(() => {
        apiGet<PaymentLinkAnalyticsResponse>('/admin/analytics/payment-links')
            .then(setData)
            .catch((err) => setError(err?.message || 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);

    const ensureAttemptsLoaded = () => {
        if (attempts || attemptsLoading) return;
        setAttemptsLoading(true);
        apiGet<PaymentLinkAttemptsResponse>('/admin/analytics/payment-links/attempts')
            .then(setAttempts)
            .catch((err) => setAttemptsError(err?.message || 'Failed to load attempts'))
            .finally(() => setAttemptsLoading(false));
    };

    const toggleRatioData = () => {
        ensureAttemptsLoaded();
        setShowRatioData((v) => !v);
    };

    const toggleReasonData = () => {
        ensureAttemptsLoaded();
        setShowReasonData((v) => !v);
    };

    const attemptsList = attempts?.attempts ?? [];
    const failedAttempts = attemptsList.filter((a) => a.status === 'failed');

    return (
        <div className="space-y-5">
            <div>
                <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-navy">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to overview
                </Link>
                <h1 className="mt-2 text-xl font-bold text-brand-navy">Payment Link Analytics</h1>
                <p className="text-sm text-slate-500">Public payment link load outcomes · last 30 days · sourced from PostHog</p>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
            )}

            {!loading && error && <div className="text-sm text-rose-600">{error}</div>}

            {!loading && !error && data && (!data.configured || data.queryError) && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                    {data.queryError
                        ? `PostHog rejected the saved key: ${data.queryError}. Fix it from the overview page.`
                        : 'Not configured yet — set up the PostHog API key from the overview page.'}
                </div>
            )}

            {!loading && !error && data?.configured && !data.queryError && (
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <h2 className="mb-4 text-sm font-semibold text-brand-navy">Load Success vs Failure Ratio</h2>
                        <PieChart
                            segments={[
                                { label: 'Loaded Successfully', value: data.loaded, color: '#03D47C' },
                                { label: 'Failed to Load', value: data.failed, color: '#FF2970' },
                            ]}
                        />
                        <button
                            onClick={toggleRatioData}
                            className="mt-4 flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline"
                        >
                            View data {showRatioData ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        {showRatioData && (
                            <div className="mt-3">
                                {attemptsLoading && (
                                    <div className="flex items-center gap-2 text-sm text-slate-400">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Loading attempts…
                                    </div>
                                )}
                                {!attemptsLoading && attemptsError && <div className="text-sm text-rose-600">{attemptsError}</div>}
                                {!attemptsLoading && !attemptsError && attempts && (
                                    <AttemptsTable attempts={attemptsList} showReason />
                                )}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <h2 className="mb-4 text-sm font-semibold text-brand-navy">Payment Link Errors by Reason</h2>
                        {data.errorsByReason.length > 0 ? (
                            <PieChart
                                segments={data.errorsByReason.map((r, i) => ({
                                    label: r.reason,
                                    value: r.count,
                                    color: REASON_COLORS[i % REASON_COLORS.length],
                                }))}
                            />
                        ) : (
                            <div className="text-sm text-slate-400">No failures recorded — nothing to break down yet.</div>
                        )}
                        <button
                            onClick={toggleReasonData}
                            className="mt-4 flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline"
                        >
                            View data {showReasonData ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        {showReasonData && (
                            <div className="mt-3">
                                {attemptsLoading && (
                                    <div className="flex items-center gap-2 text-sm text-slate-400">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Loading attempts…
                                    </div>
                                )}
                                {!attemptsLoading && attemptsError && <div className="text-sm text-rose-600">{attemptsError}</div>}
                                {!attemptsLoading && !attemptsError && attempts && (
                                    <AttemptsTable attempts={failedAttempts} showReason />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
