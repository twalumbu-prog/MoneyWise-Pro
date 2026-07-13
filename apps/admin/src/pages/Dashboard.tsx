import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    RefreshCw, Loader2, ChevronRight, AlertTriangle, CheckCircle2, CircleSlash, Building2,
} from 'lucide-react';
import { apiGet } from '../lib/api';
import type { OverviewResponse, OrgReconSummary, SectionRecon } from '../lib/types';
import { money, isWithinTolerance, formatDateTime } from '../lib/format';
import { StatusBadge } from '../components/StatusBadge';
import { PaymentLinkAnalyticsCard } from '../components/PaymentLinkAnalyticsCard';

function DiffCell({ value }: { value: number | null | undefined }) {
    if (value === null || value === undefined) {
        return <td className="px-3 py-3 text-right text-slate-300">—</td>;
    }
    const clean = isWithinTolerance(value);
    return (
        <td
            className={`px-3 py-3 text-right tabular-nums font-medium ${clean ? 'text-emerald-600' : 'text-rose-600'}`}
        >
            {money(value)}
        </td>
    );
}

function SectionCells({ section, pending }: { section: SectionRecon | null; pending?: boolean }) {
    if (!section) {
        return (
            <>
                <td className="px-3 py-3 text-right text-slate-300">—</td>
                <td className="px-3 py-3 text-right text-slate-300">—</td>
                <td className="px-3 py-3 text-right text-slate-300">—</td>
            </>
        );
    }
    return (
        <>
            <td className="px-3 py-3 text-right tabular-nums text-slate-700">{money(section.moneywise)}</td>
            {pending ? (
                <>
                    <td className="px-3 py-3 text-right text-slate-300">…</td>
                    <td className="px-3 py-3 text-right text-slate-300">…</td>
                </>
            ) : (
                <>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{money(section.lenco)}</td>
                    <DiffCell value={section.difference} />
                </>
            )}
        </>
    );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className={`text-2xl font-bold ${tone}`}>{value}</div>
            <div className="text-xs font-medium text-slate-500">{label}</div>
        </div>
    );
}

export default function Dashboard() {
    const navigate = useNavigate();
    const [data, setData] = useState<OverviewResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (refresh = false) => {
        setError(null);
        try {
            if (refresh) {
                setRefreshing(true);
                setData(await apiGet<OverviewResponse>('/admin/reconciliation?refresh=1'));
            } else {
                // Phase 1: instant MoneyWise-only paint (no Lenco calls).
                setLoading(true);
                setData(await apiGet<OverviewResponse>('/admin/reconciliation?quick=1', 30000));
                setLoading(false);
                // Phase 2: live Lenco comparison fills in (~10-15s).
                setRefreshing(true);
                setData(await apiGet<OverviewResponse>('/admin/reconciliation'));
            }
        } catch (err: any) {
            setError(err?.message || 'Failed to load reconciliation data');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const orgs = data?.organizations ?? [];
    const stats = {
        total: orgs.length,
        reconciled: orgs.filter((o) => o.status === 'RECONCILED').length,
        drift: orgs.filter((o) => o.status === 'MINOR_DRIFT').length,
        outOfBalance: orgs.filter((o) => o.status === 'OUT_OF_BALANCE' || o.status === 'ERROR').length,
        notLinked: orgs.filter((o) => o.status === 'NOT_LINKED' || o.status === 'NO_WALLET').length,
    };

    if (loading) {
        return (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
                <div className="text-sm text-slate-500">
                    Fetching live balances &amp; transactions from Lenco…
                    <div className="text-xs text-slate-400">First load can take ~10–15s; later loads are cached.</div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-brand-navy">Organizations</h1>
                    <p className="text-sm text-slate-500">
                        MoneyWise ledger vs Lenco · tolerance ±{money(data?.tolerance ?? 1)}
                        {data?.generatedAt && (
                            <span className="text-slate-400"> · checked {formatDateTime(data.generatedAt)}</span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => load(true)}
                    disabled={refreshing}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh from Lenco
                </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <StatCard label="Organizations" value={stats.total} tone="text-brand-navy" />
                <StatCard label="Reconciled" value={stats.reconciled} tone="text-emerald-600" />
                <StatCard label="Minor drift" value={stats.drift} tone="text-amber-600" />
                <StatCard label="Out of balance" value={stats.outOfBalance} tone="text-rose-600" />
                <StatCard label="Not linked" value={stats.notLinked} tone="text-slate-400" />
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <AlertTriangle className="h-4 w-4" />
                    {error}
                </div>
            )}

            <PaymentLinkAnalyticsCard />

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[1100px] border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                            <th rowSpan={2} className="px-4 py-2 text-left font-semibold">Organization</th>
                            <th rowSpan={2} className="px-3 py-2 text-left font-semibold">Status</th>
                            <th colSpan={3} className="border-l border-slate-200 px-3 py-2 text-center font-semibold text-emerald-600">
                                Inflows
                            </th>
                            <th colSpan={3} className="border-l border-slate-200 px-3 py-2 text-center font-semibold text-rose-500">
                                Outflows
                            </th>
                            <th colSpan={3} className="border-l border-slate-200 px-3 py-2 text-center font-semibold text-brand-blue">
                                Closing balance
                            </th>
                            <th colSpan={2} className="border-l border-slate-200 px-3 py-2 text-center font-semibold text-slate-500">
                                Fees
                            </th>
                            <th rowSpan={2} className="px-3 py-2" />
                        </tr>
                        <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                            {['MoneyWise', 'Lenco', 'Diff', 'MoneyWise', 'Lenco', 'Diff', 'MoneyWise', 'Lenco', 'Diff'].map(
                                (h, i) => (
                                    <th
                                        key={i}
                                        className={`px-3 py-1.5 text-right font-medium ${i % 3 === 0 ? 'border-l border-slate-200' : ''}`}
                                    >
                                        {h}
                                    </th>
                                ),
                            )}
                            <th className="border-l border-slate-200 px-3 py-1.5 text-right font-medium">Bank</th>
                            <th className="px-3 py-1.5 text-right font-medium">MoneyWise</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orgs.map((org: OrgReconSummary) => (
                            <tr
                                key={org.orgId}
                                onClick={() => navigate(`/org/${org.orgId}`)}
                                className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                            >
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-4 w-4 shrink-0 text-slate-300" />
                                        <div>
                                            <div className="font-medium text-brand-navy">{org.name}</div>
                                            <div className="text-xs text-slate-400">
                                                {org.walletCount} wallet{org.walletCount === 1 ? '' : 's'}
                                                {org.reconciliationPct !== null && (
                                                    <> · {org.reconciliationPct}% reconciled</>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-3 py-3">
                                    <StatusBadge status={org.status} />
                                    {org.status === 'ERROR' && org.error && (
                                        <div className="mt-1 max-w-[160px] truncate text-[11px] text-rose-400" title={org.error}>
                                            {org.error}
                                        </div>
                                    )}
                                </td>
                                <SectionCells section={org.inflows} pending={org.status === 'CHECKING'} />
                                <SectionCells section={org.outflows} pending={org.status === 'CHECKING'} />
                                <SectionCells section={org.closing} pending={org.status === 'CHECKING'} />
                                <td className="border-l border-slate-200 px-3 py-3 text-right tabular-nums text-slate-500">
                                    {org.fees ? money(org.fees.bankFees) : <span className="text-slate-300">{org.status === 'CHECKING' ? '…' : '—'}</span>}
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums font-medium text-emerald-700" title="MoneyWise platform commission from this org">
                                    {org.fees ? money(org.fees.platformFees) : <span className="text-slate-300">{org.status === 'CHECKING' ? '…' : '—'}</span>}
                                </td>
                                <td className="px-3 py-3 text-slate-300">
                                    <ChevronRight className="h-4 w-4" />
                                </td>
                            </tr>
                        ))}
                        {orgs.length === 0 && (
                            <tr>
                                <td colSpan={14} className="px-4 py-10 text-center text-sm text-slate-400">
                                    No organizations found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Difference within ±{money(data?.tolerance ?? 1)}
                </span>
                <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500" /> Out of tolerance — needs review
                </span>
                <span className="flex items-center gap-1">
                    <CircleSlash className="h-3.5 w-3.5" /> Not linked to a Lenco sub-account
                </span>
                <span className="ml-auto italic">
                    Closing balance is the authoritative tie. Outflow gaps are largely Lenco bank fees (excluded from
                    the synced ledger).
                </span>
            </div>
        </div>
    );
}
