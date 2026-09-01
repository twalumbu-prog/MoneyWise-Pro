import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PricePoint, Timeframe } from './investChartData';
import { formatKwacha, formatAxisDate } from './investChartData';

interface InvestChartProps {
    data: PricePoint[];
    timeframe: Timeframe;
    positive: boolean;
}

const AXIS_LABEL_HEIGHT = 22;
const POSITIVE_COLOR = '#05C702';
const NEGATIVE_COLOR = '#dc2626';

export const InvestChart: React.FC<InvestChartProps> = ({ data, timeframe, positive }) => {
    const outerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const [size, setSize] = useState({ width: 320, height: 200 });

    useEffect(() => {
        const el = outerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const rect = entries[0]?.contentRect;
            if (rect) setSize({ width: rect.width, height: rect.height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const plotHeight = Math.max(size.height - AXIS_LABEL_HEIGHT, 60);

    const n = data.length;
    const pxPerPoint = n <= 10 ? 40 : n <= 40 ? 14 : n <= 120 ? 8 : 5;
    const width = Math.max(n * pxPerPoint, size.width);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollLeft = el.scrollWidth;
    }, [width, timeframe]);

    const { min, max } = useMemo(() => {
        let mn = Infinity, mx = -Infinity;
        for (const p of data) {
            if (p.price < mn) mn = p.price;
            if (p.price > mx) mx = p.price;
        }
        if (!isFinite(mn) || !isFinite(mx)) return { min: 0, max: 1 };
        const pad = (mx - mn) * 0.15 || mx * 0.05 || 1;
        return { min: mn - pad, max: mx + pad };
    }, [data]);

    const points = useMemo(() => data.map((p, i) => {
        const x = n === 1 ? width / 2 : (i / (n - 1)) * width;
        const y = plotHeight - ((p.price - min) / (max - min || 1)) * plotHeight;
        return { x, y, price: p.price, t: p.t };
    }), [data, width, plotHeight, min, max, n]);

    const activeIdx = hoverIdx ?? points.length - 1;
    const active = points[activeIdx];
    const isLive = activeIdx === points.length - 1;

    const updateHoverFromClientX = (clientX: number) => {
        const el = scrollRef.current;
        if (!el || n === 0) return;
        const rect = el.getBoundingClientRect();
        const xInScroll = clientX - rect.left + el.scrollLeft;
        let idx = Math.round((xInScroll / width) * (n - 1));
        idx = Math.max(0, Math.min(n - 1, idx));
        setHoverIdx(idx);
    };

    if (points.length === 0 || !active) return <div ref={outerRef} className="w-full h-full" />;

    const stroke = positive ? POSITIVE_COLOR : NEGATIVE_COLOR;
    const gradId = `investChartGrad-${positive ? 'pos' : 'neg'}`;

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${plotHeight} L ${points[0].x.toFixed(2)} ${plotHeight} Z`;

    // Subtle horizontal gridlines delineating price levels
    const gridLineCount = 4;
    const gridLines = Array.from({ length: gridLineCount + 1 }, (_, i) => (i / gridLineCount) * plotHeight);

    // Evenly spaced x-axis tick labels
    const tickCount = Math.min(6, n);
    const tickIndices = tickCount > 1
        ? Array.from({ length: tickCount }, (_, i) => Math.round((i / (tickCount - 1)) * (n - 1)))
        : [0];

    return (
        <div ref={outerRef} className="w-full h-full select-none">
            <div
                ref={scrollRef}
                className="w-full h-full overflow-x-auto no-scrollbar"
                style={{ touchAction: 'pan-x' }}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); updateHoverFromClientX(e.clientX); }}
                onPointerMove={(e) => { if (e.buttons === 1) updateHoverFromClientX(e.clientX); }}
                onPointerUp={() => setHoverIdx(null)}
                onPointerCancel={() => setHoverIdx(null)}
            >
                <div style={{ width, height: size.height }} className="relative flex-shrink-0">
                    <svg width={width} height={plotHeight} className="block overflow-visible">
                        <defs>
                            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
                                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                            </linearGradient>
                        </defs>

                        {/* Subtle horizontal gridlines */}
                        {gridLines.map((y, i) => (
                            <line key={i} x1={0} y1={y} x2={width} y2={y} stroke="#F1F3F5" strokeWidth="1" />
                        ))}

                        {/* Dashed horizontal reference line at the active price */}
                        <line x1={0} y1={active.y} x2={width} y2={active.y} stroke="#d1d5db" strokeWidth="1" strokeDasharray="3 4" />

                        <path d={areaPath} fill={`url(#${gradId})`} />
                        <path d={linePath} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

                        {/* Vertical crosshair while scrubbing */}
                        {hoverIdx !== null && (
                            <line x1={active.x} y1={0} x2={active.x} y2={plotHeight} stroke={stroke} strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
                        )}

                        {/* Live pulse — only when showing the current (latest) price */}
                        {isLive && (
                            <circle cx={active.x} cy={active.y} r="4" fill={stroke}>
                                <animate attributeName="r" values="4;11;4" dur="1.8s" repeatCount="indefinite" />
                                <animate attributeName="opacity" values="0.45;0;0.45" dur="1.8s" repeatCount="indefinite" />
                            </circle>
                        )}

                        <circle cx={active.x} cy={active.y} r="4" fill="white" stroke={stroke} strokeWidth="2" />
                    </svg>

                    {/* Tooltip pill */}
                    <div
                        className="absolute bg-zinc-800 text-white text-[9.5px] font-medium font-['Inter'] px-2 py-1 rounded whitespace-nowrap pointer-events-none z-10"
                        style={{
                            left: Math.min(Math.max(active.x, 28), width - 28),
                            top: Math.max(active.y - 32, 0),
                            transform: 'translateX(-50%)',
                        }}
                    >
                        {formatKwacha(active.price)}
                    </div>

                    {/* X-axis date labels */}
                    <div className="absolute left-0 right-0" style={{ top: plotHeight + 8, width }}>
                        {tickIndices.map(idx => (
                            <span
                                key={idx}
                                className="absolute text-neutral-400 text-[10px] font-bold font-['Inter'] whitespace-nowrap"
                                style={{ left: points[idx].x, transform: 'translateX(-50%)' }}
                            >
                                {formatAxisDate(points[idx].t, timeframe)}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
