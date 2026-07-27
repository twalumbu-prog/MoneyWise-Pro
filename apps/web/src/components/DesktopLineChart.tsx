import React, { useEffect, useMemo, useRef, useState } from 'react';

interface ChartPoint {
    label: string;
    shortLabel: string;
    value: number;
}

interface DesktopLineChartProps {
    data: ChartPoint[];
    color?: string;
    /** Formats the raw value for the tooltip and end-label (e.g. "K1,234.56"). */
    formatValue: (value: number) => string;
}

const PAD_X = 8;
const PAD_TOP = 24;
const PAD_BOTTOM = 28;

/**
 * A single-series line/area chart for the desktop Reports view — deliberately
 * simple (one hue, one series) since a single number over time doesn't need
 * more. Fills whatever height its parent gives it (measured via ResizeObserver,
 * so the viewBox is always a true 1:1 pixel match — no non-uniform scaling
 * distortion of strokes/dots/text). Parent must be a positioned flex/grid box
 * with a real height (e.g. `flex-1 min-h-0`), not one that just hugs content.
 */
export const DesktopLineChart: React.FC<DesktopLineChartProps> = ({
    data,
    color = '#0058DB',
    formatValue,
}) => {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (!entry) return;
            const { width, height } = entry.contentRect;
            setSize({ w: Math.round(width), h: Math.round(height) });
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const viewW = size.w || 1;
    const viewH = size.h || 1;
    const plotW = Math.max(1, viewW - PAD_X * 2);
    const plotH = Math.max(1, viewH - PAD_TOP - PAD_BOTTOM);

    const { points, yTicks, minV, maxV } = useMemo(() => {
        if (data.length === 0 || size.w === 0) return { points: [] as { x: number; y: number }[], yTicks: [] as number[], minV: 0, maxV: 0 };

        const values = data.map(d => d.value);
        let min = Math.min(...values, 0);
        let max = Math.max(...values, 0);
        if (min === max) { min -= 1; max += 1; }
        // A little headroom so the line/dots never touch the plot edge.
        const span = max - min;
        min -= span * 0.08;
        max += span * 0.08;

        const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
        const pts = data.map((d, i) => ({
            x: PAD_X + i * stepX,
            y: PAD_TOP + plotH - ((d.value - min) / (max - min)) * plotH,
        }));

        const ticks = [min, min + (max - min) / 2, max];
        return { points: pts, yTicks: ticks, minV: min, maxV: max };
    }, [data, plotW, plotH, size.w]);

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const areaPath = points.length > 0
        ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${(PAD_TOP + plotH).toFixed(2)} L ${points[0].x.toFixed(2)} ${(PAD_TOP + plotH).toFixed(2)} Z`
        : '';

    // Thin x-axis labels to roughly 6 evenly-spaced ticks so long timeframes
    // (e.g. daily-for-a-year) don't collide into an unreadable smear.
    const labelEvery = Math.max(1, Math.ceil(data.length / 6));

    const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        const svg = svgRef.current;
        if (!svg || points.length === 0) return;
        const rect = svg.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        let nearest = 0;
        let nearestDist = Infinity;
        points.forEach((p, i) => {
            const dist = Math.abs(p.x - relX);
            if (dist < nearestDist) { nearestDist = dist; nearest = i; }
        });
        setHoverIdx(nearest);
    };

    const hovered = hoverIdx !== null ? points[hoverIdx] : null;
    const hoveredPoint = hoverIdx !== null ? data[hoverIdx] : null;

    // Tooltip anchored in pixel units, then flipped near the right edge so it
    // never renders off-canvas.
    const tooltipOnLeft = hovered ? hovered.x > viewW * 0.7 : false;

    return (
        <div ref={containerRef} className="relative w-full h-full select-none">
            {data.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                    No data for this period.
                </div>
            ) : size.w > 0 && (
                <svg
                    ref={svgRef}
                    width={viewW}
                    height={viewH}
                    viewBox={`0 0 ${viewW} ${viewH}`}
                    className="block"
                    onPointerMove={handlePointerMove}
                    onPointerLeave={() => setHoverIdx(null)}
                >
                    <defs>
                        <linearGradient id="desktopChartFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.1} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>

                    {/* Gridlines — recessive hairlines with value labels */}
                    {yTicks.map((tick, i) => {
                        const y = PAD_TOP + plotH - ((tick - minV) / (maxV - minV)) * plotH;
                        return (
                            <g key={i}>
                                <line x1={PAD_X} y1={y} x2={viewW - PAD_X} y2={y} stroke="#E8EEF8" strokeWidth={1} />
                                <text x={PAD_X} y={y - 4} fontSize={10} fill="#9AA0A7" fontFamily="DM Sans, sans-serif">
                                    {formatValue(tick)}
                                </text>
                            </g>
                        );
                    })}

                    {/* Area + line */}
                    <path d={areaPath} fill="url(#desktopChartFill)" stroke="none" />
                    <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

                    {/* End-point label (direct label, per spec: lines label the endpoint) */}
                    {points.length > 0 && (
                        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={4} fill={color} stroke="#FFFFFF" strokeWidth={2} />
                    )}

                    {/* X-axis labels */}
                    {data.map((d, i) => (
                        i % labelEvery === 0 || i === data.length - 1 ? (
                            <text
                                key={i}
                                x={points[i]?.x ?? 0}
                                y={viewH - 8}
                                fontSize={10}
                                fill="#9AA0A7"
                                textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                                fontFamily="DM Sans, sans-serif"
                            >
                                {d.shortLabel}
                            </text>
                        ) : null
                    ))}

                    {/* Hover crosshair + snapped dot */}
                    {hovered && (
                        <>
                            <line x1={hovered.x} y1={PAD_TOP} x2={hovered.x} y2={PAD_TOP + plotH} stroke="#9AA0A7" strokeWidth={1} strokeDasharray="3 3" />
                            <circle cx={hovered.x} cy={hovered.y} r={5} fill={color} stroke="#FFFFFF" strokeWidth={2} />
                        </>
                    )}
                </svg>
            )}

            {/* Tooltip — HTML overlay for crisp text rendering */}
            {hovered && hoveredPoint && (
                <div
                    className="absolute top-2 pointer-events-none bg-[#111827] text-white rounded-lg px-3 py-2 text-xs shadow-lg z-10"
                    style={{
                        left: tooltipOnLeft ? undefined : hovered.x,
                        right: tooltipOnLeft ? viewW - hovered.x : undefined,
                        transform: tooltipOnLeft ? 'translateX(8px)' : 'translateX(-50%)',
                    }}
                >
                    <div className="font-bold whitespace-nowrap">{formatValue(hoveredPoint.value)}</div>
                    <div className="text-white/60 whitespace-nowrap">{hoveredPoint.label}</div>
                </div>
            )}
        </div>
    );
};

export default DesktopLineChart;
