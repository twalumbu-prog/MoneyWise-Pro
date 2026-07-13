interface Segment {
    label: string;
    value: number;
    color: string;
}

/** Simple conic-gradient pie chart — no charting library needed for two static charts. */
export function PieChart({ segments, size = 180 }: { segments: Segment[]; size?: number }) {
    const total = segments.reduce((sum, s) => sum + s.value, 0);

    if (total === 0) {
        return (
            <div
                className="flex items-center justify-center rounded-full border border-dashed border-slate-200 text-xs text-slate-400"
                style={{ width: size, height: size }}
            >
                No data
            </div>
        );
    }

    let cursor = 0;
    const stops = segments
        .filter((s) => s.value > 0)
        .map((s) => {
            const start = (cursor / total) * 100;
            cursor += s.value;
            const end = (cursor / total) * 100;
            return `${s.color} ${start}% ${end}%`;
        })
        .join(', ');

    return (
        <div className="flex items-center gap-5">
            <div
                className="shrink-0 rounded-full"
                style={{ width: size, height: size, background: `conic-gradient(${stops})` }}
            />
            <div className="space-y-1.5">
                {segments.map((s) => {
                    const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                    return (
                        <div key={s.label} className="flex items-center gap-2 text-sm">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                            <span className="text-slate-600">{s.label}</span>
                            <span className="text-slate-400">
                                {s.value} ({pct}%)
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
