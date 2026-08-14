/**
 * viz.tools.ts — Inline visualizations.
 *
 * The model never authors markup or code. It calls these with a *spec*, the
 * spec is validated here, and the client maps it onto vetted recharts
 * components. An invalid spec comes back as a tool error the model can fix,
 * rather than a blank card in the user's chat.
 */

import { ChartSpec, KpiSpec, TableSpec, ToolDefinition, Widget } from '../types';

const CHART_KINDS = ['bar', 'line', 'area', 'pie', 'donut'];
const MAX_POINTS = 60;
const MAX_TABLE_ROWS = 50;

function invalid(message: string): never {
    throw new Error(`INVALID_SPEC: ${message}`);
}

/** Widgets ride back to the loop wrapped like this so it knows to emit an event. */
export interface WidgetResult {
    __widget: true;
    widget: Widget;
    /** What the model sees as the tool result — deliberately terse. */
    ack: string;
}

export function isWidgetResult(v: unknown): v is WidgetResult {
    return !!v && typeof v === 'object' && (v as any).__widget === true;
}

const renderChart: ToolDefinition = {
    name: 'render_chart',
    description:
        'Draw a chart in the conversation. Use it whenever a comparison, trend or breakdown ' +
        'would read better visually than as a list — a spending trend, a department comparison, ' +
        'a revenue split. Get the numbers from a data tool first; do not invent data points. ' +
        'After calling this, write a short interpretation rather than restating every number.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            kind: { type: 'string', enum: CHART_KINDS, description: 'bar and line suit trends; pie/donut suit shares of a whole.' },
            title: { type: 'string' },
            subtitle: { type: 'string', description: 'Optional context, e.g. the period covered.' },
            xKey: { type: 'string', description: 'The key in each data row holding the label, e.g. "month".' },
            series: {
                type: 'array',
                description: 'The measures to plot. One entry for a simple chart.',
                items: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'Key in each data row holding this measure.' },
                        label: { type: 'string', description: 'Human label for the legend.' },
                    },
                    required: ['key', 'label'],
                },
            },
            data: {
                type: 'array',
                description: 'Rows of plot data, e.g. [{"month":"2026-07","spend":12400}]. Max 60 rows.',
                items: { type: 'object' },
            },
            valueFormat: { type: 'string', enum: ['currency', 'number', 'percent'], description: 'Default currency (ZMW).' },
            stacked: { type: 'boolean', description: 'Stack multiple series instead of grouping them.' },
        },
        required: ['kind', 'title', 'xKey', 'series', 'data'],
    },
    handler: async (_ctx, args) => {
        if (!CHART_KINDS.includes(args.kind)) invalid(`kind must be one of: ${CHART_KINDS.join(', ')}.`);
        if (!args.title?.trim()) invalid('title is required.');
        if (!Array.isArray(args.series) || !args.series.length) invalid('At least one series is required.');
        if (!Array.isArray(args.data) || !args.data.length) invalid('data must contain at least one row.');
        if (args.data.length > MAX_POINTS) invalid(`data has ${args.data.length} rows; aggregate it down to ${MAX_POINTS} or fewer.`);

        // Every declared key must exist on the rows, or the chart renders empty.
        const keys = new Set(Object.keys(args.data[0] ?? {}));
        if (!keys.has(args.xKey)) invalid(`xKey "${args.xKey}" is not present in the data rows. Available keys: ${[...keys].join(', ')}.`);
        for (const s of args.series) {
            if (!keys.has(s.key)) invalid(`series key "${s.key}" is not present in the data rows. Available keys: ${[...keys].join(', ')}.`);
        }

        const spec: ChartSpec = {
            kind: args.kind,
            title: args.title.trim(),
            subtitle: args.subtitle,
            xKey: args.xKey,
            series: args.series.map((s: any) => ({ key: s.key, label: s.label })),
            // Coerce measures to numbers — strings silently break recharts scales.
            data: args.data.map((row: any) => {
                const out: Record<string, string | number> = { [args.xKey]: String(row[args.xKey] ?? '') };
                for (const s of args.series) out[s.key] = Number(row[s.key] ?? 0);
                return out;
            }),
            valueFormat: args.valueFormat ?? 'currency',
            stacked: !!args.stacked,
        };

        const result: WidgetResult = {
            __widget: true,
            widget: { type: 'chart', spec },
            ack: `Chart "${spec.title}" rendered with ${spec.data.length} points. Now interpret it briefly — do not list the raw values again.`,
        };
        return result;
    },
};

const renderTable: ToolDefinition = {
    name: 'render_table',
    description:
        'Render a sortable data table in the conversation. Prefer this over a markdown table ' +
        'whenever there are more than about five rows or any currency columns.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            title: { type: 'string' },
            columns: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        key: { type: 'string' },
                        label: { type: 'string' },
                        align: { type: 'string', enum: ['left', 'right'] },
                        format: { type: 'string', enum: ['currency', 'number', 'date', 'text'] },
                    },
                    required: ['key', 'label'],
                },
            },
            rows: { type: 'array', items: { type: 'object' }, description: 'Max 50 rows.' },
            total: { type: 'object', description: 'Optional totals row, keyed like the columns.' },
        },
        required: ['title', 'columns', 'rows'],
    },
    handler: async (_ctx, args) => {
        if (!args.title?.trim()) invalid('title is required.');
        if (!Array.isArray(args.columns) || !args.columns.length) invalid('At least one column is required.');
        if (!Array.isArray(args.rows) || !args.rows.length) invalid('rows must contain at least one row.');
        if (args.rows.length > MAX_TABLE_ROWS) invalid(`rows has ${args.rows.length} entries; show the top ${MAX_TABLE_ROWS} and say so.`);

        const spec: TableSpec = {
            title: args.title.trim(),
            columns: args.columns.map((c: any) => ({
                key: c.key,
                label: c.label,
                align: c.align ?? (c.format === 'currency' || c.format === 'number' ? 'right' : 'left'),
                format: c.format ?? 'text',
            })),
            rows: args.rows.slice(0, MAX_TABLE_ROWS),
            total: args.total,
        };

        const result: WidgetResult = {
            __widget: true,
            widget: { type: 'table', spec },
            ack: `Table "${spec.title}" rendered with ${spec.rows.length} rows. Summarise the takeaway rather than repeating the rows.`,
        };
        return result;
    },
};

const renderKpis: ToolDefinition = {
    name: 'render_kpis',
    description:
        'Render a row of headline figures — two to four at most. Good for opening an answer ' +
        'about overall position before the detail.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            title: { type: 'string' },
            items: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        label: { type: 'string' },
                        value: { type: 'string', description: 'Pre-formatted, e.g. "K124,500.00".' },
                        delta: { type: 'number', description: 'Percent change vs the comparison period, e.g. -12.4.' },
                        hint: { type: 'string', description: 'Small print under the value.' },
                    },
                    required: ['label', 'value'],
                },
            },
        },
        required: ['items'],
    },
    handler: async (_ctx, args) => {
        if (!Array.isArray(args.items) || !args.items.length) invalid('At least one KPI item is required.');
        if (args.items.length > 4) invalid('Show at most 4 KPIs — pick the ones that matter.');

        const spec: KpiSpec = {
            title: args.title,
            items: args.items.map((i: any) => ({
                label: i.label,
                value: String(i.value),
                delta: i.delta === undefined ? undefined : Number(i.delta),
                hint: i.hint,
            })),
        };

        const result: WidgetResult = {
            __widget: true,
            widget: { type: 'kpi', spec },
            ack: `${spec.items.length} KPIs rendered. Continue with the analysis.`,
        };
        return result;
    },
};

export const vizTools: ToolDefinition[] = [renderChart, renderTable, renderKpis];
