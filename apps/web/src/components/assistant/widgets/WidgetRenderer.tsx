/**
 * WidgetRenderer.tsx — Maps a validated widget spec onto a vetted component.
 *
 * The model chooses *what* to render, never *how*: an unrecognised widget type
 * renders nothing rather than being trusted.
 */

import React from 'react';
import {
    Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
    Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import type { ChartSpec, FileSpec, KpiSpec, TableSpec, Widget } from 'core';

// A single ordered palette keeps every chart in the conversation consistent.
const PALETTE = ['#006AFF', '#00C48C', '#FFB020', '#7C3AED', '#F0507E', '#14B8A6', '#F97316', '#6366F1'];

// Chart entry animations are off throughout. These charts mount mid-stream,
// while the surrounding message is still re-rendering on every token — the
// animation restarts on each of those renders and can leave shapes stranded at
// their zero-size first frame.

const kwacha = (n: number) =>
    `K${Number(n).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const compact = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `K${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `K${(n / 1_000).toFixed(1)}k`;
    return `K${n}`;
};

function formatValue(value: unknown, format?: string): string {
    if (value == null || value === '') return '—';
    const n = Number(value);
    switch (format) {
        case 'currency': return Number.isFinite(n) ? kwacha(n) : String(value);
        case 'number': return Number.isFinite(n) ? n.toLocaleString('en-ZM') : String(value);
        case 'percent': return Number.isFinite(n) ? `${n.toFixed(1)}%` : String(value);
        case 'date': return String(value);
        default: return String(value);
    }
}

function axisFormatter(format?: string) {
    if (format === 'percent') return (v: number) => `${v}%`;
    if (format === 'number') return (v: number) => v.toLocaleString('en-ZM');
    return (v: number) => compact(v);
}

const TOOLTIP_STYLE = {
    borderRadius: 14,
    border: '1px solid #F0F0F3',
    boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
    fontSize: 12,
    padding: '10px 12px',
};

const AXIS_STYLE = { fontSize: 11, fill: '#9CA3AF' } as const;

// ─── Chart ───────────────────────────────────────────────────────────────────

const ChartWidget: React.FC<{ spec: ChartSpec }> = ({ spec }) => {
    const fmt = spec.valueFormat ?? 'currency';
    const tooltipFormatter = (value: any, name: any) => [formatValue(value, fmt), name];

    const body = () => {
        switch (spec.kind) {
            case 'pie':
            case 'donut': {
                const key = spec.series[0]?.key;
                if (!key) return null;
                return (
                    <PieChart>
                        <Pie
                            data={spec.data}
                            dataKey={key}
                            nameKey={spec.xKey}
                            innerRadius={spec.kind === 'donut' ? '55%' : 0}
                            outerRadius="80%"
                            paddingAngle={2}
                            isAnimationActive={false}
                        >
                            {spec.data.map((_, i) => (
                                <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="#fff" strokeWidth={2} />
                            ))}
                        </Pie>
                        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                    </PieChart>
                );
            }
            case 'line':
                return (
                    <LineChart data={spec.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                        <XAxis dataKey={spec.xKey} tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={axisFormatter(fmt)} width={54} />
                        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} />
                        {spec.series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
                        {spec.series.map((s, i) => (
                            <Line
                                key={s.key}
                                type="monotone"
                                dataKey={s.key}
                                name={s.label}
                                stroke={PALETTE[i % PALETTE.length]}
                                strokeWidth={2.5}
                                dot={false}
                                activeDot={{ r: 5 }}
                                isAnimationActive={false}
                            />
                        ))}
                    </LineChart>
                );
            case 'area':
                return (
                    <AreaChart data={spec.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <defs>
                            {spec.series.map((s, i) => (
                                <linearGradient key={s.key} id={`grad-${s.key}-${i}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.28} />
                                    <stop offset="100%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.02} />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                        <XAxis dataKey={spec.xKey} tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={axisFormatter(fmt)} width={54} />
                        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} />
                        {spec.series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
                        {spec.series.map((s, i) => (
                            <Area
                                key={s.key}
                                type="monotone"
                                dataKey={s.key}
                                name={s.label}
                                stackId={spec.stacked ? 'stack' : undefined}
                                stroke={PALETTE[i % PALETTE.length]}
                                strokeWidth={2.5}
                                fill={`url(#grad-${s.key}-${i})`}
                                isAnimationActive={false}
                            />
                        ))}
                    </AreaChart>
                );
            default:
                return (
                    <BarChart data={spec.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                        <XAxis dataKey={spec.xKey} tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={axisFormatter(fmt)} width={54} />
                        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#F9FAFB' }} />
                        {spec.series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
                        {spec.series.map((s, i) => (
                            <Bar
                                key={s.key}
                                dataKey={s.key}
                                name={s.label}
                                stackId={spec.stacked ? 'stack' : undefined}
                                fill={PALETTE[i % PALETTE.length]}
                                radius={[6, 6, 0, 0]}
                                maxBarSize={48}
                                isAnimationActive={false}
                            />
                        ))}
                    </BarChart>
                );
        }
    };

    return (
        <figure className="my-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)]">
            <figcaption className="mb-3 px-1">
                <h4 className="text-[14px] font-black tracking-tight text-brand-navy">{spec.title}</h4>
                {spec.subtitle && <p className="mt-0.5 text-[11px] font-medium text-gray-400">{spec.subtitle}</p>}
            </figcaption>
            <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    {body() as any}
                </ResponsiveContainer>
            </div>
        </figure>
    );
};

// ─── Table ───────────────────────────────────────────────────────────────────

const TableWidget: React.FC<{ spec: TableSpec }> = ({ spec }) => (
    <div className="my-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.03)]">
        <div className="border-b border-gray-100 px-4 py-3">
            <h4 className="text-[14px] font-black tracking-tight text-brand-navy">{spec.title}</h4>
        </div>
        {/* Wide tables scroll inside the card rather than stretching the message. */}
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
                <thead className="bg-gray-50/60">
                    <tr>
                        {spec.columns.map(col => (
                            <th
                                key={col.key}
                                className={`whitespace-nowrap px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 ${
                                    col.align === 'right' ? 'text-right' : 'text-left'
                                }`}
                            >
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {spec.rows.map((row, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
                            {spec.columns.map(col => (
                                <td
                                    key={col.key}
                                    className={`whitespace-nowrap px-4 py-3 text-[13px] text-gray-700 ${
                                        col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                                    }`}
                                >
                                    {formatValue(row[col.key], col.format)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                {spec.total && (
                    <tfoot>
                        <tr className="border-t-2 border-gray-100 bg-gray-50/60">
                            {spec.columns.map(col => (
                                <td
                                    key={col.key}
                                    className={`px-4 py-3 text-[13px] font-black text-brand-navy ${
                                        col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                                    }`}
                                >
                                    {spec.total![col.key] != null ? formatValue(spec.total![col.key], col.format) : ''}
                                </td>
                            ))}
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    </div>
);

// ─── KPIs ────────────────────────────────────────────────────────────────────

const KpiWidget: React.FC<{ spec: KpiSpec }> = ({ spec }) => (
    <div className="my-4">
        {spec.title && <h4 className="mb-2 px-1 text-[13px] font-black tracking-tight text-brand-navy">{spec.title}</h4>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {spec.items.map((item, i) => (
                <div key={i} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)]">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{item.label}</p>
                    <p className="mt-1.5 text-[19px] font-black tracking-tight text-brand-navy tabular-nums">{item.value}</p>
                    <div className="mt-1 flex items-center gap-2">
                        {item.delta !== undefined && (
                            <span
                                className={`text-[11px] font-black ${
                                    item.delta >= 0 ? 'text-emerald-600' : 'text-rose-500'
                                }`}
                            >
                                {item.delta >= 0 ? '▲' : '▼'} {Math.abs(item.delta).toFixed(1)}%
                            </span>
                        )}
                        {item.hint && <span className="text-[11px] font-medium text-gray-400">{item.hint}</span>}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

// ─── File download ───────────────────────────────────────────────────────────

/**
 * The link is a signed Supabase Storage URL, time-limited (7 days server-side)
 * — a plain anchor is enough, the browser handles the actual download via the
 * signed URL's own `download` disposition.
 */
const FileWidget: React.FC<{ spec: FileSpec }> = ({ spec }) => {
    const isPdf = spec.kind === 'pdf';
    return (
        <a
            href={spec.url}
            target="_blank"
            rel="noopener noreferrer"
            className="my-4 flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)] transition-colors hover:border-blue-200 hover:bg-blue-50/20"
        >
            <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${isPdf ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-600'}`}>
                {isPdf ? <FileText size={20} /> : <FileSpreadsheet size={20} />}
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-black text-brand-navy">{spec.name}</p>
                <p className="text-[11px] font-medium text-gray-400">
                    {isPdf ? 'PDF document' : 'Excel workbook'}
                    {spec.sizeLabel ? ` · ${spec.sizeLabel}` : ''}
                </p>
            </div>
            <Download size={16} className="flex-shrink-0 text-gray-300" />
        </a>
    );
};

export const WidgetRenderer: React.FC<{ widget: Widget }> = ({ widget }) => {
    switch (widget.type) {
        case 'chart': return <ChartWidget spec={widget.spec} />;
        case 'table': return <TableWidget spec={widget.spec} />;
        case 'kpi': return <KpiWidget spec={widget.spec} />;
        case 'file': return <FileWidget spec={widget.spec} />;
        default: return null;
    }
};
