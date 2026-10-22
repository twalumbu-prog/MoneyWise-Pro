import React, { useMemo } from 'react';

interface Props {
    /** Keyed by local calendar day (YYYY-MM-DD). */
    daily: Record<string, { orders: number; amount: number }>;
}

const WEEKS = 53;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LEVELS = ['bg-slate-100', 'bg-emerald-200', 'bg-emerald-400', 'bg-emerald-600', 'bg-emerald-800'];
const level = (orders: number) => (orders <= 0 ? 0 : Math.min(orders, 4));
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const money = (n: number) => n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** GitHub-style contribution graph, but each square is a day the customer made a purchase. */
export const PurchaseHeatmap: React.FC<Props> = ({ daily }) => {
    const { columns, monthLabels } = useMemo(() => {
        // The API buckets by Zambian (UTC+2) calendar day, so "today" must be computed the same way.
        const todayMs = Date.parse(dayKey(Date.now() + 2 * 3_600_000));
        const last = new Date(todayMs);
        // Last column ends on this week's Saturday, so today sits in the final column like GitHub.
        const endMs = todayMs + (6 - last.getUTCDay()) * 86_400_000;
        const startMs = endMs - (WEEKS * 7 - 1) * 86_400_000;

        const cols: { key: string; future: boolean; orders: number; amount: number }[][] = [];
        const labels: { col: number; text: string }[] = [];
        let prevMonth = -1;
        for (let w = 0; w < WEEKS; w++) {
            const col = [];
            for (let d = 0; d < 7; d++) {
                const ms = startMs + (w * 7 + d) * 86_400_000;
                const key = dayKey(ms);
                col.push({ key, future: ms > todayMs, orders: daily[key]?.orders || 0, amount: daily[key]?.amount || 0 });
            }
            const month = new Date(startMs + w * 7 * 86_400_000).getUTCMonth();
            if (month !== prevMonth && (w > 0 || new Date(startMs).getUTCDate() <= 7)) labels.push({ col: w, text: MONTHS[month] });
            prevMonth = month;
            cols.push(col);
        }
        return { columns: cols, monthLabels: labels };
    }, [daily]);

    const CELL = 11;
    const GAP = 3;
    const step = CELL + GAP;

    return (
        <div className="overflow-x-auto pb-1">
            <div className="inline-block min-w-max">
                <div className="relative h-4 ml-7 text-[9px] text-gray-400" style={{ width: WEEKS * step }}>
                    {monthLabels.map(l => (
                        <span key={`${l.col}-${l.text}`} className="absolute" style={{ left: l.col * step }}>{l.text}</span>
                    ))}
                </div>
                <div className="flex">
                    <div className="w-7 flex flex-col text-[9px] text-gray-400" style={{ gap: GAP }}>
                        {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((t, i) => (
                            <span key={i} style={{ height: CELL, lineHeight: `${CELL}px` }}>{t}</span>
                        ))}
                    </div>
                    <div className="flex" style={{ gap: GAP }}>
                        {columns.map((col, ci) => (
                            <div key={ci} className="flex flex-col" style={{ gap: GAP }}>
                                {col.map(cell => cell.future ? (
                                    <span key={cell.key} style={{ width: CELL, height: CELL }} />
                                ) : (
                                    <span
                                        key={cell.key}
                                        style={{ width: CELL, height: CELL }}
                                        className={`rounded-[2px] ${LEVELS[level(cell.orders)]}`}
                                        title={cell.orders
                                            ? `${cell.orders} purchase${cell.orders === 1 ? '' : 's'} · K${money(cell.amount)} on ${cell.key}`
                                            : `No purchases on ${cell.key}`}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex items-center justify-end gap-1.5 mt-2 text-[9px] text-gray-400">
                    Less
                    {LEVELS.map(c => <span key={c} className={`rounded-[2px] ${c}`} style={{ width: CELL, height: CELL }} />)}
                    More
                </div>
            </div>
        </div>
    );
};
