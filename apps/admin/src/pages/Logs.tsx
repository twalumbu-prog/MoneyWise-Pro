import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiGet } from '../lib/api';
import type { VercelLogsResponse, VercelLogRow } from '../lib/types';
import { formatDateTime } from '../lib/format';

const PAGE_SIZE = 50;

const LEVEL_TONE: Record<string, string> = {
    error: 'bg-rose-50 text-rose-700',
    fatal: 'bg-rose-50 text-rose-700',
    warning: 'bg-amber-50 text-amber-700',
    info: 'bg-slate-100 text-slate-600',
};

function LevelBadge({ level }: { level: string | null }) {
    if (!level) return <span className="text-slate-300">—</span>;
    return (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_TONE[level] || 'bg-slate-100 text-slate-600'}`}>
            {level}
        </span>
    );
}

export default function Logs() {
    const [data, setData] = useState<VercelLogsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const [level, setLevel] = useState('');
    const [path, setPath] = useState('');
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
        if (level) params.set('level', level);
        if (path) params.set('path', path);
        if (search) params.set('search', search);
        apiGet<VercelLogsResponse>(`/admin/logs?${params.toString()}`)
            .then(setData)
            .catch((err) => setError(err?.message || 'Failed to load logs'))
            .finally(() => setLoading(false));
    }, [offset, level, path, search]);

    useEffect(load, [load]);

    const logs = data?.logs ?? [];
    const total = data?.total ?? 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-brand-navy">Function Logs</h1>
                    <p className="text-sm text-slate-500">Real Vercel Function invocations via Log Drain · server-side, network-independent</p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            <div className="flex flex-wrap gap-2">
                <select
                    value={level}
                    onChange={(e) => { setOffset(0); setLevel(e.target.value); }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                    <option value="">All levels</option>
                    <option value="info">info</option>
                    <option value="warning">warning</option>
                    <option value="error">error</option>
                    <option value="fatal">fatal</option>
                </select>
                <input
                    value={path}
                    onChange={(e) => { setOffset(0); setPath(e.target.value); }}
                    placeholder="Filter by path…"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                    value={search}
                    onChange={(e) => { setOffset(0); setSearch(e.target.value); }}
                    placeholder="Search message…"
                    className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
            </div>

            {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[800px] text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                            <th className="px-3 py-2 text-left font-semibold">Time</th>
                            <th className="px-3 py-2 text-left font-semibold">Level</th>
                            <th className="px-3 py-2 text-left font-semibold">Path</th>
                            <th className="px-3 py-2 text-right font-semibold">Status</th>
                            <th className="px-3 py-2 text-left font-semibold">Message</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                                </td>
                            </tr>
                        )}
                        {!loading && logs.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">No logs match these filters.</td>
                            </tr>
                        )}
                        {!loading && logs.map((row: VercelLogRow) => {
                            const expanded = expandedId === row.id;
                            return (
                                <tr
                                    key={row.id}
                                    onClick={() => setExpandedId(expanded ? null : row.id)}
                                    className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50"
                                >
                                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                                        {formatDateTime(row.vercelTimestamp || row.receivedAt)}
                                    </td>
                                    <td className="px-3 py-2"><LevelBadge level={row.level} /></td>
                                    <td className="px-3 py-2 text-slate-600">{row.path || '—'}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                                        {row.statusCode ?? '—'}
                                    </td>
                                    <td className={`px-3 py-2 text-slate-600 ${expanded ? 'whitespace-pre-wrap break-all' : 'max-w-[500px] truncate'}`}>
                                        {row.message || '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between text-sm text-slate-500">
                <span>{total} total</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                        disabled={offset === 0 || loading}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" /> Prev
                    </button>
                    <button
                        onClick={() => setOffset(offset + PAGE_SIZE)}
                        disabled={offset + PAGE_SIZE >= total || loading}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                        Next <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
