import type { PaymentLinkAttempt } from '../lib/types';
import { formatDateTime } from '../lib/format';

export function AttemptsTable({ attempts, showReason }: { attempts: PaymentLinkAttempt[]; showReason: boolean }) {
    if (attempts.length === 0) {
        return <div className="py-3 text-sm text-slate-400">No attempts in the last 30 days.</div>;
    }

    return (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-100">
            <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                        <th className="px-3 py-2 text-left font-semibold">Date &amp; time</th>
                        <th className="px-3 py-2 text-left font-semibold">Status</th>
                        <th className="px-3 py-2 text-left font-semibold">Link type</th>
                        <th className="px-3 py-2 text-right font-semibold">Load time</th>
                        {showReason && <th className="px-3 py-2 text-left font-semibold">Reason</th>}
                    </tr>
                </thead>
                <tbody>
                    {attempts.map((a, i) => (
                        <tr key={i} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-600">{formatDateTime(a.timestamp)}</td>
                            <td className="px-3 py-2">
                                <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                        a.status === 'loaded' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                    }`}
                                >
                                    {a.status === 'loaded' ? 'Loaded' : 'Failed'}
                                </span>
                            </td>
                            <td className="px-3 py-2 text-slate-500">{a.linkType || '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                                {a.durationMs != null ? `${a.durationMs}ms` : '—'}
                            </td>
                            {showReason && <td className="px-3 py-2 text-slate-500">{a.errorReason || '—'}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
