import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    ArrowLeft, Loader2, RefreshCw, Info, ArrowDownLeft, ArrowUpRight, AlertTriangle,
    ChevronRight, Layers,
} from 'lucide-react';
import { apiGet } from '../lib/api';
import type { OrgDetailResponse, SectionRecon, TxnMatchStatus, ReconTxnRow } from '../lib/types';
import { money, isWithinTolerance, formatDate, formatDateTime } from '../lib/format';
import { StatusBadge, MatchBadge } from '../components/StatusBadge';

type Filter = 'ALL' | TxnMatchStatus;

const FILTERS: { key: Filter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'MATCHED', label: 'Matched' },
    { key: 'MONEYWISE_ONLY', label: 'MoneyWise only' },
    { key: 'LENCO_ONLY', label: 'Lenco only' },
];

function SummaryCard({ title, section, accent }: { title: string; section: SectionRecon | null; accent: string }) {
    const known = !!section && section.difference !== null;
    const clean = known && isWithinTolerance(section!.difference);
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className={`mb-3 text-sm font-semibold ${accent}`}>{title}</div>
            <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                    <dt className="text-slate-500">MoneyWise</dt>
                    <dd className="tabular-nums font-medium text-slate-700">{money(section?.moneywise)}</dd>
                </div>
                <div className="flex justify-between">
                    <dt className="text-slate-500">Lenco</dt>
                    <dd className="tabular-nums font-medium text-slate-700">{money(section?.lenco)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-1.5">
                    <dt className="text-slate-500">Difference</dt>
                    <dd className={`tabular-nums font-semibold ${!known ? 'text-slate-300' : clean ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {money(section?.difference)}
                    </dd>
                </div>
            </dl>
        </div>
    );
}

/** One reconciliation transaction row; `indent` renders it as a batch sub-line. */
function TxnRowTr({ r, indent }: { r: ReconTxnRow; indent?: boolean }) {
    return (
        <tr className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${indent ? 'bg-slate-50/40' : ''}`}>
            <td className={`whitespace-nowrap px-4 py-3 text-slate-500 ${indent ? 'pl-9' : ''}`}>{formatDate(r.date)}</td>
            <td className="px-3 py-3">
                <div className="max-w-[320px] truncate text-slate-700" title={r.description}>
                    {indent && <span className="mr-1 text-slate-300">└</span>}
                    {r.description || '—'}
                </div>
                {(r.reference || r.lencoId) && (
                    <div className="max-w-[320px] truncate text-[11px] text-slate-400" title={r.reference || r.lencoId || ''}>
                        {r.reference || r.lencoId}
                    </div>
                )}
                {r.category !== 'NORMAL' && (
                    <span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        r.category === 'PLATFORM_FEE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                        {r.category === 'PLATFORM_FEE' ? 'MoneyWise fee' : 'Change return'}
                    </span>
                )}
            </td>
            <td className="px-3 py-3 text-center">
                {r.direction === 'inflow' ? (
                    <ArrowDownLeft className="mx-auto h-4 w-4 text-emerald-500" />
                ) : (
                    <ArrowUpRight className="mx-auto h-4 w-4 text-rose-500" />
                )}
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-slate-700">{money(r.moneywiseAmount)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-slate-700">{money(r.lencoAmount)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-slate-400">{r.bankFee ? money(r.bankFee) : '—'}</td>
            <td
                className={`px-3 py-3 text-right tabular-nums font-medium ${
                    isWithinTolerance(r.difference) ? 'text-emerald-600' : 'text-rose-600'
                }`}
            >
                {money(r.difference)}
            </td>
            <td className="px-3 py-3">
                <MatchBadge status={r.matchStatus} />
            </td>
        </tr>
    );
}

export default function OrgDetail() {
    const { orgId } = useParams<{ orgId: string }>();
    const [data, setData] = useState<OrgDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>('ALL');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiGet<OrgDetailResponse>(`/admin/reconciliation/${orgId}`);
            setData(res);
        } catch (err: any) {
            setError(err?.message || 'Failed to load organization');
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo<ReconTxnRow[]>(() => {
        const rows = data?.transactions ?? [];
        if (filter === 'ALL') return rows;
        return rows.filter((r) => r.matchStatus === filter);
    }, [data, filter]);

    // Group batch payouts (≥2 outflow rows sharing a requisition, e.g. payroll) into one
    // consolidated line that expands to its per-payment sub-lines — requisition-style.
    // Reconciliation still happens per sub-line; the parent just aggregates them.
    const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});
    type DisplayItem = { kind: 'row'; row: ReconTxnRow } | { kind: 'batch'; reqId: string; rows: ReconTxnRow[] };
    const displayItems = useMemo<DisplayItem[]>(() => {
        const byReq = new Map<string, ReconTxnRow[]>();
        for (const r of filtered) {
            if (r.requisitionId && r.direction === 'outflow') {
                const list = byReq.get(r.requisitionId) ?? [];
                list.push(r);
                byReq.set(r.requisitionId, list);
            }
        }
        const items: DisplayItem[] = [];
        const consumed = new Set<string>();
        for (const r of filtered) {
            const batch = r.requisitionId && r.direction === 'outflow' ? byReq.get(r.requisitionId) : undefined;
            if (batch && batch.length > 1) {
                if (consumed.has(r.requisitionId!)) continue;
                consumed.add(r.requisitionId!);
                items.push({ kind: 'batch', reqId: r.requisitionId!, rows: batch });
            } else {
                items.push({ kind: 'row', row: r });
            }
        }
        return items;
    }, [filtered]);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="space-y-4">
                <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-navy">
                    <ArrowLeft className="h-4 w-4" /> Back
                </Link>
                <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <AlertTriangle className="h-4 w-4" />
                    {error || 'Not found'}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-navy">
                <ArrowLeft className="h-4 w-4" /> All organizations
            </Link>

            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl font-bold text-brand-navy">{data.name}</h1>
                        <StatusBadge status={data.status} />
                        {data.reconciliationPct !== null && (
                            <span className="text-sm font-medium text-slate-400">{data.reconciliationPct}% match</span>
                        )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                        {data.lencoSubaccountId ? (
                            <>Lenco sub-account <code className="rounded bg-slate-100 px-1">{data.lencoSubaccountId}</code></>
                        ) : (
                            'Not linked to a Lenco sub-account'
                        )}
                        {' · '}checked {formatDateTime(data.generatedAt)}
                    </p>
                </div>
                <button
                    onClick={() => load()}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryCard title="Inflows" section={data.inflows} accent="text-emerald-600" />
                <SummaryCard title="Outflows" section={data.outflows} accent="text-rose-500" />
                <SummaryCard title="Closing balance" section={data.closing} accent="text-brand-blue" />
            </div>

            {data.fees && (
                <div className="grid grid-cols-2 gap-3 sm:max-w-lg">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="text-sm font-semibold text-slate-600">Bank fees (Lenco)</div>
                        <div className="mt-1 text-lg font-bold tabular-nums text-slate-700">{money(data.fees.bankFees)}</div>
                        <div className="text-xs text-slate-400">Embedded in debit balance-drops, over the synced history.</div>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="text-sm font-semibold text-emerald-700">MoneyWise fees (our revenue)</div>
                        <div className="mt-1 text-lg font-bold tabular-nums text-emerald-700">{money(data.fees.platformFees)}</div>
                        <div className="text-xs text-emerald-600/70">Platform commission swept from this org to settlement.</div>
                    </div>
                </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-4 py-3 text-xs text-slate-600">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
                <span>
                    The <strong>closing balance</strong> is the authoritative reconciliation signal. Inflow/outflow
                    totals are informational: Lenco debit amounts exclude per-transaction bank fees, and the sync
                    deliberately drops fee / “Split payment” legs — so a non-zero <strong>Outflows</strong> difference is
                    usually expected bank-fee leakage, not an error. Transactions are matched on the Lenco transaction
                    id stored in <code className="rounded bg-white px-1">external_reference</code>.
                </span>
            </div>

            {/* Filter tabs with counts */}
            <div className="flex flex-wrap items-center gap-2">
                {FILTERS.map((f) => {
                    const count =
                        f.key === 'ALL'
                            ? data.transactions.length
                            : f.key === 'MATCHED'
                                ? data.counts.matched
                                : f.key === 'MONEYWISE_ONLY'
                                    ? data.counts.moneywiseOnly
                                    : data.counts.lencoOnly;
                    const active = filter === f.key;
                    return (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                active ? 'bg-brand-navy text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            {f.label} <span className={active ? 'text-white/70' : 'text-slate-400'}>{count}</span>
                        </button>
                    );
                })}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                            <th className="px-4 py-2 text-left font-semibold">Date</th>
                            <th className="px-3 py-2 text-left font-semibold">Description</th>
                            <th className="px-3 py-2 text-center font-semibold">Dir</th>
                            <th className="px-3 py-2 text-right font-semibold">MoneyWise</th>
                            <th className="px-3 py-2 text-right font-semibold">Lenco</th>
                            <th className="px-3 py-2 text-right font-semibold">Bank fee</th>
                            <th className="px-3 py-2 text-right font-semibold">Difference</th>
                            <th className="px-3 py-2 text-left font-semibold">Match</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayItems.map((item, i) => {
                            if (item.kind === 'row') {
                                return <TxnRowTr key={`r-${item.row.lencoId ?? item.row.reference ?? i}-${i}`} r={item.row} />;
                            }
                            const { reqId, rows } = item;
                            const open = !!expandedBatches[reqId];
                            const sum = (f: (r: ReconTxnRow) => number | null) =>
                                Math.round(rows.reduce((s, r) => s + (f(r) ?? 0), 0) * 100) / 100;
                            const mwSum = sum((r) => r.moneywiseAmount);
                            const lencoSum = sum((r) => r.lencoAmount);
                            const diffSum = sum((r) => r.difference);
                            const feeSum = sum((r) => r.bankFee);
                            const matchedCount = rows.filter((r) => r.matchStatus === 'MATCHED').length;
                            return (
                                <Fragment key={`b-${reqId}`}>
                                    <tr
                                        className="cursor-pointer border-b border-slate-100 bg-slate-50/60 hover:bg-slate-100"
                                        onClick={() => setExpandedBatches((p) => ({ ...p, [reqId]: !p[reqId] }))}
                                    >
                                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                                            <span className="inline-flex items-center gap-1">
                                                <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
                                                {formatDate(rows[0].date)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="flex items-center gap-1.5 font-medium text-brand-navy">
                                                <Layers className="h-3.5 w-3.5 text-slate-400" />
                                                Batch payout — {rows.length} payments
                                            </div>
                                            <div className="text-[11px] text-slate-400">
                                                Requisition #{reqId.slice(0, 8)} · {matchedCount}/{rows.length} matched to Lenco
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <ArrowUpRight className="mx-auto h-4 w-4 text-rose-500" />
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums font-medium text-slate-700">{money(mwSum)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums font-medium text-slate-700">{money(lencoSum)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-slate-400">{feeSum ? money(feeSum) : '—'}</td>
                                        <td className={`px-3 py-3 text-right tabular-nums font-semibold ${
                                            isWithinTolerance(diffSum) ? 'text-emerald-600' : 'text-rose-600'
                                        }`}>
                                            {money(diffSum)}
                                        </td>
                                        <td className="px-3 py-3">
                                            {matchedCount === rows.length
                                                ? <MatchBadge status="MATCHED" />
                                                : <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">{matchedCount}/{rows.length} matched</span>}
                                        </td>
                                    </tr>
                                    {open && rows.map((r, j) => (
                                        <TxnRowTr key={`bc-${reqId}-${j}`} r={r} indent />
                                    ))}
                                </Fragment>
                            );
                        })}
                        {displayItems.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                                    No transactions in this view.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
