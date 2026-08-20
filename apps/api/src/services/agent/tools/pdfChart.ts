/**
 * pdfChart.ts — Draws bar/line/area/pie/donut charts directly with pdfkit's
 * vector primitives.
 *
 * No headless browser, no server-side canvas or SVG rasteriser — those are
 * real dependencies with real failure modes (missing system fonts, native
 * binary builds) for something this app only ever needs to draw four shapes.
 * Everything here is rectangles, lines and polygons pdfkit already knows how
 * to fill.
 *
 * Colours match apps/web/.../WidgetRenderer.tsx's PALETTE so a chart looks
 * the same whether it was rendered inline in the chat or inside a PDF.
 */

import type { ChartSpec } from '../types';

export const PALETTE = ['#006AFF', '#00C48C', '#FFB020', '#7C3AED', '#F0507E', '#14B8A6', '#F97316', '#6366F1'];

const AXIS_COLOR = '#9CA3AF';
const GRID_COLOR = '#EEF0F3';
const LABEL_COLOR = '#6B7280';

interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Total vertical space this chart (plot + legend) will occupy, for pagination checks. */
export function chartHeight(spec: ChartSpec, plotHeight = 200): number {
    const legendRows = Math.ceil(Math.min(spec.series.length, 12) / 4);
    return plotHeight + 18 /* axis labels */ + legendRows * 14 + 10;
}

function formatValue(n: number, format: ChartSpec['valueFormat']): string {
    if (format === 'percent') return `${n.toFixed(0)}%`;
    if (format === 'number') return n.toLocaleString('en-ZM');
    return `K${n.toLocaleString('en-ZM', { maximumFractionDigits: 0 })}`;
}

/** Draws `spec` inside `box` and returns the y-coordinate just below it. */
export function drawChart(doc: PDFKit.PDFDocument, spec: ChartSpec, box: Box): number {
    const plotHeight = box.height - 18 - legendHeight(spec);
    const plot: Box = { x: box.x, y: box.y, width: box.width, height: Math.max(plotHeight, 60) };

    doc.fontSize(11).fillColor('#0B1220').text(spec.title, box.x, box.y - 16, { width: box.width });

    if (spec.kind === 'pie' || spec.kind === 'donut') {
        drawPie(doc, spec, plot);
    } else {
        drawCartesian(doc, spec, plot);
    }

    const legendY = plot.y + plot.height + 10;
    drawLegend(doc, spec, box.x, legendY, box.width);

    return legendY + legendHeight(spec);
}

function legendHeight(spec: ChartSpec): number {
    const perRow = 4;
    const rows = Math.ceil(Math.min(spec.series.length || spec.data.length, 12) / perRow);
    return rows * 14;
}

// ─── Bar / line / area ───────────────────────────────────────────────────────

function drawCartesian(doc: PDFKit.PDFDocument, spec: ChartSpec, plot: Box) {
    const data = spec.data;
    const series = spec.series;

    let maxValue = 0;
    for (const row of data) {
        if (spec.stacked) {
            const sum = series.reduce((s, ser) => s + Number(row[ser.key] ?? 0), 0);
            maxValue = Math.max(maxValue, sum);
        } else {
            for (const ser of series) maxValue = Math.max(maxValue, Number(row[ser.key] ?? 0));
        }
    }
    if (maxValue <= 0) maxValue = 1;
    // Round the ceiling up to a tidy number so gridline labels aren't fractions.
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
    maxValue = Math.ceil(maxValue / (magnitude / 2)) * (magnitude / 2);

    const axisLabelWidth = 44;
    const chartX = plot.x + axisLabelWidth;
    const chartWidth = plot.width - axisLabelWidth;
    const chartBottom = plot.y + plot.height;

    // Gridlines + value-axis labels, 4 bands.
    const bands = 4;
    doc.fontSize(7).fillColor(LABEL_COLOR);
    for (let i = 0; i <= bands; i++) {
        const y = chartBottom - (plot.height * i) / bands;
        const value = (maxValue * i) / bands;
        doc.strokeColor(i === 0 ? AXIS_COLOR : GRID_COLOR).lineWidth(0.5)
            .moveTo(chartX, y).lineTo(chartX + chartWidth, y).stroke();
        doc.text(formatValue(value, spec.valueFormat), plot.x, y - 3, { width: axisLabelWidth - 4, align: 'right' });
    }

    const n = data.length;
    const slot = chartWidth / n;

    if (spec.kind === 'bar') {
        const groupPad = slot * 0.2;
        const barsWidth = slot - groupPad * 2;
        data.forEach((row, i) => {
            const groupX = chartX + i * slot + groupPad;
            if (spec.stacked) {
                let stackY = chartBottom;
                for (const [si, ser] of series.entries()) {
                    const v = Number(row[ser.key] ?? 0);
                    const h = (v / maxValue) * plot.height;
                    doc.fillColor(PALETTE[si % PALETTE.length]).rect(groupX, stackY - h, barsWidth, h).fill();
                    stackY -= h;
                }
            } else {
                const barW = barsWidth / series.length;
                series.forEach((ser, si) => {
                    const v = Number(row[ser.key] ?? 0);
                    const h = (v / maxValue) * plot.height;
                    doc.fillColor(PALETTE[si % PALETTE.length]).rect(groupX + si * barW, chartBottom - h, Math.max(barW - 1.5, 1), h).fill();
                });
            }
        });
    } else {
        // line / area: one polyline per series, points at slot centres.
        series.forEach((ser, si) => {
            const points = data.map((row, i) => {
                const v = Number(row[ser.key] ?? 0);
                const x = chartX + i * slot + slot / 2;
                const y = chartBottom - (v / maxValue) * plot.height;
                return [x, y] as const;
            });

            if (spec.kind === 'area') {
                doc.save();
                doc.moveTo(points[0][0], chartBottom);
                for (const [x, y] of points) doc.lineTo(x, y);
                doc.lineTo(points[points.length - 1][0], chartBottom);
                doc.closePath();
                doc.fillOpacity(0.16).fillColor(PALETTE[si % PALETTE.length]).fill();
                doc.restore();
            }

            doc.strokeColor(PALETTE[si % PALETTE.length]).lineWidth(1.6);
            doc.moveTo(points[0][0], points[0][1]);
            for (const [x, y] of points.slice(1)) doc.lineTo(x, y);
            doc.stroke();

            for (const [x, y] of points) {
                doc.fillColor(PALETTE[si % PALETTE.length]).circle(x, y, 1.8).fill();
            }
        });
    }

    // Category-axis labels underneath, thinned out if there isn't room for all of them.
    doc.fontSize(6.5).fillColor(LABEL_COLOR);
    const labelEvery = Math.ceil((n * 32) / Math.max(chartWidth, 1)) || 1;
    data.forEach((row, i) => {
        if (i % labelEvery !== 0) return;
        const x = chartX + i * slot;
        // `ellipsis` only truncates a line when an explicit `height` is also
        // given — `lineBreak: false` alone still wraps. See export.tools.ts's
        // CELL_TEXT_HEIGHT comment for how this was actually confirmed.
        doc.text(String(row[spec.xKey] ?? ''), x, chartBottom + 3, { width: slot, height: 8, align: 'center', ellipsis: true });
    });
}

// ─── Pie / donut ─────────────────────────────────────────────────────────────

function drawPie(doc: PDFKit.PDFDocument, spec: ChartSpec, plot: Box) {
    const valueKey = spec.series[0]?.key;
    const slices = spec.data.map(row => ({
        label: String(row[spec.xKey] ?? ''),
        value: Math.max(0, Number(row[valueKey] ?? 0)),
    }));
    const total = slices.reduce((s, sl) => s + sl.value, 0) || 1;

    const cx = plot.x + plot.width / 2;
    const cy = plot.y + plot.height / 2;
    const radius = Math.min(plot.width, plot.height) / 2 - 4;

    let angle = -Math.PI / 2; // start at 12 o'clock
    const SEGMENTS_PER_TURN = 64;

    slices.forEach((sl, i) => {
        const sweep = (sl.value / total) * Math.PI * 2;
        if (sweep <= 0) return;
        const steps = Math.max(1, Math.round((sweep / (Math.PI * 2)) * SEGMENTS_PER_TURN));

        doc.moveTo(cx, cy);
        for (let s = 0; s <= steps; s++) {
            const a = angle + (sweep * s) / steps;
            doc.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
        }
        doc.closePath();
        doc.fillColor(PALETTE[i % PALETTE.length]).fill();
        angle += sweep;
    });

    if (spec.kind === 'donut') {
        doc.fillColor('#FFFFFF').circle(cx, cy, radius * 0.55).fill();
    }
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function drawLegend(doc: PDFKit.PDFDocument, spec: ChartSpec, x: number, y: number, width: number) {
    const isPie = spec.kind === 'pie' || spec.kind === 'donut';
    const entries = isPie
        ? spec.data.map(row => String(row[spec.xKey] ?? '')).slice(0, 12)
        : spec.series.map(s => s.label).slice(0, 12);

    const perRow = 4;
    const colWidth = width / perRow;
    doc.fontSize(7.5);

    entries.forEach((label, i) => {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const ex = x + col * colWidth;
        const ey = y + row * 14 + 3;
        doc.fillColor(PALETTE[i % PALETTE.length]).rect(ex, ey, 7, 7).fill();
        doc.fillColor(LABEL_COLOR).text(label, ex + 10, ey - 1, { width: colWidth - 12, height: 9, ellipsis: true });
    });
}
