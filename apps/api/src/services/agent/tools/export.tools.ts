/**
 * export.tools.ts — Downloadable PDF reports and Excel exports.
 *
 * These ride the exact same Widget/WidgetResult pipeline as render_chart/
 * render_table/render_kpis in viz.tools.ts (see FileSpec in types.ts) — the
 * loop, SSE framing and message persistence needed zero changes. The
 * difference from those tools is where the payload goes: a chart's data sits
 * in the widget JSON and reaches the model's context; a report's data is
 * baked into a file in Supabase Storage and the model only ever sees a
 * one-line ack plus a signed URL. That matters — a 500-row export would blow
 * the context budget as a table widget but costs nothing extra as a file.
 *
 * Nothing here writes to application data. Generating a report is a read
 * effect: it queries and formats, never mutates, so — like
 * reconcile_bank_statement — it needs no approval card.
 */

import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { supabase } from '../../../lib/supabase';
import { AgentContext, ChartSpec, TableSpec, ToolDefinition } from '../types';
import { WidgetResult } from './viz.tools';
import { chartHeight, drawChart } from './pdfChart';

const EXPORTS_BUCKET = 'agent-exports';
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const CHART_KINDS = ['bar', 'line', 'area', 'pie', 'donut'];
const MAX_CHART_POINTS = 30;
const MAX_CHART_SERIES = 6;
const MAX_TABLE_ROWS = 200;
const MAX_SECTIONS = 20;

function invalid(message: string): never {
    throw new Error(`INVALID_SPEC: ${message}`);
}

function sizeLabel(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function safeFilenamePart(s: string): string {
    return s.trim().replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '-').slice(0, 60) || 'export';
}

async function getOrgName(organizationId: string): Promise<string | undefined> {
    const { data } = await supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle();
    return data?.name;
}

async function uploadAndSign(ctx: AgentContext, filename: string, buffer: Buffer, contentType: string): Promise<{ url: string; sizeLabel: string }> {
    const path = `${ctx.organizationId}/${ctx.userId}/${Date.now()}-${filename}`;
    const { error: upErr } = await supabase.storage.from(EXPORTS_BUCKET).upload(path, buffer, { contentType, upsert: false });
    if (upErr) throw new Error(`Could not save the generated file: ${upErr.message}`);

    const { data, error: signErr } = await supabase.storage
        .from(EXPORTS_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: filename });
    if (signErr || !data) throw new Error(`Could not create a download link: ${signErr?.message ?? 'unknown error'}`);

    return { url: data.signedUrl, sizeLabel: sizeLabel(buffer.length) };
}

// ─── Report section types & validation ──────────────────────────────────────

interface HeadingSection { type: 'heading'; text: string }
interface ParagraphSection { type: 'paragraph'; text: string }
interface KpisSection { type: 'kpis'; title?: string; items: Array<{ label: string; value: string; hint?: string }> }
interface TableSection { type: 'table'; title?: string; columns: TableSpec['columns']; rows: TableSpec['rows']; total?: TableSpec['total'] }
interface ChartSection extends ChartSpec { type: 'chart' }
type ReportSection = HeadingSection | ParagraphSection | KpisSection | TableSection | ChartSection;

/** Exported for testing. */
export function validateSection(raw: any, index: number): ReportSection {
    const at = `Section ${index + 1}`;
    if (!raw || typeof raw !== 'object') invalid(`${at} is not an object.`);

    switch (raw.type) {
        case 'heading':
        case 'paragraph':
            if (!raw.text?.trim()) invalid(`${at} (${raw.type}) needs "text".`);
            return { type: raw.type, text: raw.text.trim() };

        case 'kpis': {
            if (!Array.isArray(raw.items) || !raw.items.length) invalid(`${at} (kpis) needs at least one item.`);
            if (raw.items.length > 4) invalid(`${at} (kpis) has ${raw.items.length} items; show at most 4.`);
            return {
                type: 'kpis',
                title: raw.title,
                items: raw.items.map((it: any, i: number) => {
                    if (!it.label || it.value === undefined) invalid(`${at} (kpis) item ${i + 1} needs "label" and "value".`);
                    return { label: it.label, value: String(it.value), hint: it.hint };
                }),
            };
        }

        case 'table': {
            if (!Array.isArray(raw.columns) || !raw.columns.length) invalid(`${at} (table) needs at least one column.`);
            if (!Array.isArray(raw.rows) || !raw.rows.length) invalid(`${at} (table) needs at least one row.`);
            if (raw.rows.length > MAX_TABLE_ROWS) invalid(`${at} (table) has ${raw.rows.length} rows; cap it at ${MAX_TABLE_ROWS} or split into multiple exports.`);
            return {
                type: 'table',
                title: raw.title,
                columns: raw.columns.map((c: any) => ({
                    key: c.key,
                    label: c.label,
                    align: c.align ?? (c.format === 'currency' || c.format === 'number' ? 'right' : 'left'),
                    format: c.format ?? 'text',
                })),
                rows: raw.rows,
                total: raw.total,
            };
        }

        case 'chart': {
            if (!CHART_KINDS.includes(raw.kind)) invalid(`${at} (chart) kind must be one of: ${CHART_KINDS.join(', ')}.`);
            if (!raw.title?.trim()) invalid(`${at} (chart) needs "title".`);
            if (!Array.isArray(raw.series) || !raw.series.length) invalid(`${at} (chart) needs at least one series.`);
            if (raw.series.length > MAX_CHART_SERIES) invalid(`${at} (chart) has ${raw.series.length} series; cap it at ${MAX_CHART_SERIES} for legibility.`);
            if (!Array.isArray(raw.data) || !raw.data.length) invalid(`${at} (chart) needs at least one data row.`);
            if (raw.data.length > MAX_CHART_POINTS) invalid(`${at} (chart) has ${raw.data.length} rows; aggregate down to ${MAX_CHART_POINTS} or fewer for a static chart.`);

            const keys = new Set(Object.keys(raw.data[0] ?? {}));
            if (!keys.has(raw.xKey)) invalid(`${at} (chart) xKey "${raw.xKey}" is not present in the data rows.`);
            for (const s of raw.series) {
                if (!keys.has(s.key)) invalid(`${at} (chart) series key "${s.key}" is not present in the data rows.`);
            }

            return {
                type: 'chart',
                kind: raw.kind,
                title: raw.title.trim(),
                subtitle: raw.subtitle,
                xKey: raw.xKey,
                series: raw.series.map((s: any) => ({ key: s.key, label: s.label })),
                data: raw.data.map((row: any) => {
                    const out: Record<string, string | number> = { [raw.xKey]: String(row[raw.xKey] ?? '') };
                    for (const s of raw.series) out[s.key] = Number(row[s.key] ?? 0);
                    return out;
                }),
                valueFormat: raw.valueFormat ?? 'currency',
                stacked: !!raw.stacked,
            };
        }

        default:
            invalid(`${at} has an unrecognised type "${raw.type}". Use heading, paragraph, kpis, table or chart.`);
    }
}

// ─── PDF rendering ───────────────────────────────────────────────────────────

const PAGE_MARGIN = 48;

/**
 * `lineBreak: false` on the table cell text() calls below only suppresses
 * *automatic* wrapping when a line is too wide for the column — it does
 * nothing about a literal "\n" already in the string, which pdfkit always
 * honours as an explicit line break. A model that joins an array of reasons
 * with newlines into one cell value produced exactly that: several lines of
 * text spilling out of their fixed-height row and overlapping the row below.
 * Collapsing embedded newlines here is what actually guarantees one line per
 * cell — `lineBreak: false` alone was never enough.
 */
function formatCell(raw: any, format?: string): string {
    if (raw === null || raw === undefined || raw === '') return '';
    if (format === 'currency') return `K${Number(raw).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (format === 'number') return Number(raw).toLocaleString('en-ZM');
    if (format === 'date') return String(raw).slice(0, 10);
    return String(raw).replace(/\s*[\r\n]+\s*/g, ' · ').trim();
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
    const bottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + needed > bottom) doc.addPage();
}

function estimateHeight(doc: PDFKit.PDFDocument, section: ReportSection, pageWidth: number): number {
    switch (section.type) {
        case 'heading': return 26;
        case 'paragraph':
            doc.fontSize(10);
            return doc.heightOfString(section.text, { width: pageWidth }) + 14;
        case 'kpis': return (section.title ? 18 : 0) + 50 + 10;
        case 'table': return (section.title ? 18 : 0) + 16 * 2 + 10;
        case 'chart': return chartHeight(section) + 30;
    }
}

/**
 * `lineBreak: false` alone does not stop pdfkit wrapping a cell's text — it
 * still wraps to fit `width` and spills past the row's height regardless.
 * `ellipsis: true` only truncates once an explicit `height` is also given, so
 * that's what actually keeps every cell to one line. Verified empirically —
 * this isn't documented anywhere obvious in pdfkit's own docs.
 */
const CELL_TEXT_HEIGHT = 10;

function renderTableSection(doc: PDFKit.PDFDocument, section: TableSection, pageWidth: number) {
    const { columns } = section;
    const weights = columns.map(c => Math.max(c.label.length, 6));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const colWidths = weights.map(w => (w / totalWeight) * pageWidth);

    if (section.title) {
        doc.fontSize(12).fillColor('#0B1220').text(section.title, { width: pageWidth });
        doc.moveDown(0.3);
    }

    const startX = doc.page.margins.left;
    const rowHeight = 16;

    const drawHeaderRow = () => {
        const y = doc.y;
        doc.rect(startX, y, pageWidth, rowHeight).fill('#F3F4F6');
        let x = startX;
        doc.fontSize(8).fillColor('#374151');
        columns.forEach((c, i) => {
            doc.text(c.label, x + 4, y + 4, { width: colWidths[i] - 8, height: CELL_TEXT_HEIGHT, align: c.align, ellipsis: true });
            x += colWidths[i];
        });
        doc.y = y + rowHeight;
    };

    drawHeaderRow();

    section.rows.forEach((row, ri) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + rowHeight > bottom) {
            doc.addPage();
            drawHeaderRow();
        }
        const y = doc.y;
        if (ri % 2 === 1) doc.rect(startX, y, pageWidth, rowHeight).fill('#FAFAFA');
        let x = startX;
        doc.fontSize(8).fillColor('#1F2937');
        columns.forEach((c, i) => {
            doc.text(formatCell(row[c.key], c.format), x + 4, y + 4, { width: colWidths[i] - 8, height: CELL_TEXT_HEIGHT, align: c.align, ellipsis: true });
            x += colWidths[i];
        });
        doc.y = y + rowHeight;
    });

    if (section.total) {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + rowHeight > bottom) {
            doc.addPage();
            drawHeaderRow();
        }
        const y = doc.y;
        doc.rect(startX, y, pageWidth, rowHeight).fill('#EEF2FF');
        let x = startX;
        doc.fontSize(8).fillColor('#0B1220').font('Helvetica-Bold');
        columns.forEach((c, i) => {
            const raw = section.total?.[c.key];
            doc.text(raw === undefined ? '' : formatCell(raw, c.format), x + 4, y + 4, { width: colWidths[i] - 8, height: CELL_TEXT_HEIGHT, align: c.align, ellipsis: true });
            x += colWidths[i];
        });
        doc.font('Helvetica');
        doc.y = y + rowHeight;
    }

    doc.moveDown(0.8);
}

function renderKpisSection(doc: PDFKit.PDFDocument, section: KpisSection, pageWidth: number) {
    if (section.title) {
        doc.fontSize(12).fillColor('#0B1220').text(section.title, { width: pageWidth });
        doc.moveDown(0.3);
    }
    const colWidth = pageWidth / section.items.length;
    const y = doc.y;
    section.items.forEach((item, i) => {
        const x = doc.page.margins.left + i * colWidth;
        doc.fontSize(8).fillColor('#9CA3AF').text(item.label, x, y, { width: colWidth - 10, height: CELL_TEXT_HEIGHT, ellipsis: true });
        doc.fontSize(16).fillColor('#0B1220').font('Helvetica-Bold').text(item.value, x, y + 12, { width: colWidth - 10, height: 18, ellipsis: true });
        doc.font('Helvetica');
        if (item.hint) doc.fontSize(7).fillColor('#9CA3AF').text(item.hint, x, y + 34, { width: colWidth - 10, height: CELL_TEXT_HEIGHT, ellipsis: true });
    });
    doc.y = y + 52;
    doc.moveDown(0.4);
}

/** Exported for testing — this is the part with the most layout edge cases. */
export async function renderPdfReport(params: { title: string; subtitle?: string; sections: ReportSection[]; orgName?: string }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
            bufferPages: true, // lets the footer loop revisit earlier pages for numbering
        });
        const chunks: Buffer[] = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        // Header strip: org name left, date right, on one row.
        const headerY = doc.y;
        doc.fontSize(9).fillColor('#9CA3AF')
            .text(params.orgName ?? 'MoneyWise Pro', doc.page.margins.left, headerY, { width: pageWidth / 2 });
        doc.text(
            new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            doc.page.margins.left + pageWidth / 2, headerY, { width: pageWidth / 2, align: 'right' }
        );
        doc.y = headerY + 16;

        doc.fontSize(20).fillColor('#0B1220').font('Helvetica-Bold').text(params.title, { width: pageWidth });
        doc.font('Helvetica');
        if (params.subtitle) {
            doc.moveDown(0.2);
            doc.fontSize(11).fillColor('#6B7280').text(params.subtitle, { width: pageWidth });
        }
        doc.moveDown(0.8);
        doc.strokeColor('#E5E7EB').lineWidth(1)
            .moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
        doc.moveDown(1);

        for (const section of params.sections) {
            ensureSpace(doc, estimateHeight(doc, section, pageWidth));

            // KPI rows and chart legends both draw multiple text() calls at
            // explicit x positions (one per column), and pdfkit's cursor
            // (doc.x) is left wherever the last of those calls put it — often
            // far right. The next section's title then flows from THAT x with
            // the full page width added on top, running clean off the page
            // edge. Resetting to the margin before every section is what a
            // flowing-text call after any explicit-position block needs.
            doc.x = doc.page.margins.left;

            switch (section.type) {
                case 'heading':
                    doc.fontSize(14).fillColor('#0B1220').font('Helvetica-Bold').text(section.text, { width: pageWidth });
                    doc.font('Helvetica');
                    doc.moveDown(0.4);
                    break;
                case 'paragraph':
                    doc.fontSize(10).fillColor('#374151').text(section.text, { width: pageWidth });
                    doc.moveDown(0.6);
                    break;
                case 'kpis':
                    renderKpisSection(doc, section, pageWidth);
                    break;
                case 'table':
                    renderTableSection(doc, section, pageWidth);
                    break;
                case 'chart': {
                    const box = { x: doc.page.margins.left, y: doc.y + 16, width: pageWidth, height: chartHeight(section) - 16 };
                    const endY = drawChart(doc, section, box);
                    doc.y = endY + 12;
                    break;
                }
            }
        }

        // Footer: page numbers, added last so every buffered page can be revisited.
        // pdfkit's text() auto-adds a page whenever the given y falls past
        // `page.height - margins.bottom` — true even with an explicit x/y — so
        // writing *into* the bottom margin silently doubled the page count
        // (an 8-page file for 4 pages of content). Zeroing the bottom margin
        // for just this call is the standard workaround: it makes the target y
        // legal again without touching where any other content was laid out.
        const range = doc.bufferedPageRange();
        const bottomMargin = doc.page.margins.bottom;
        for (let i = 0; i < range.count; i++) {
            doc.switchToPage(range.start + i);
            doc.page.margins.bottom = 0;
            doc.fontSize(8).fillColor('#9CA3AF').text(
                `Generated by the MoneyWise Pro Assistant · Page ${i + 1} of ${range.count}`,
                doc.page.margins.left,
                doc.page.height - bottomMargin + 22,
                { width: pageWidth, align: 'center' }
            );
            doc.page.margins.bottom = bottomMargin;
        }

        doc.end();
    });
}

// ─── export_pdf_report ───────────────────────────────────────────────────────

const exportPdfReport: ToolDefinition = {
    name: 'export_pdf_report',
    description:
        'Generate a downloadable, multi-section PDF report and return a link the user can open ' +
        'or save. Use this when the user asks to "export", "download", "email me", "print" or ' +
        'wants a shareable document — not for something meant to stay in the conversation, which ' +
        'is what render_chart/render_table/render_kpis are for. Build sections from data you ' +
        'already fetched with the read tools; do not invent figures. A report can mix headings, ' +
        'paragraphs, KPI rows, tables and charts in any order.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            title: { type: 'string', description: 'Report title, e.g. "July 2026 Spending Review".' },
            subtitle: { type: 'string', description: 'Optional context line under the title, e.g. the period covered.' },
            sections: {
                type: 'array',
                description: `Up to ${MAX_SECTIONS} sections, in reading order. Each object has "type" plus that type's fields:\n` +
                    '- heading: {type:"heading", text}\n' +
                    '- paragraph: {type:"paragraph", text}\n' +
                    '- kpis: {type:"kpis", title?, items:[{label,value,hint?}]} — max 4 items\n' +
                    '- table: {type:"table", title?, columns:[{key,label,align?,format?}], rows:[...], total?} — max 200 rows\n' +
                    '- chart: {type:"chart", kind, title, subtitle?, xKey, series:[{key,label}], data:[...], valueFormat?, stacked?} — max 30 rows, 6 series',
                items: { type: 'object' },
            },
        },
        required: ['title', 'sections'],
    },
    handler: async (ctx: AgentContext, args) => {
        if (!args.title?.trim()) invalid('title is required.');
        if (!Array.isArray(args.sections) || !args.sections.length) invalid('At least one section is required.');
        if (args.sections.length > MAX_SECTIONS) invalid(`${args.sections.length} sections given; cap it at ${MAX_SECTIONS}.`);

        const sections = args.sections.map((s: any, i: number) => validateSection(s, i));
        const orgName = await getOrgName(ctx.organizationId);

        const buffer = await renderPdfReport({ title: args.title.trim(), subtitle: args.subtitle, sections, orgName });
        const filename = `${safeFilenamePart(args.title)}.pdf`;
        const { url, sizeLabel: size } = await uploadAndSign(ctx, filename, buffer, 'application/pdf');

        const result: WidgetResult = {
            __widget: true,
            widget: { type: 'file', spec: { name: filename, url, kind: 'pdf', sizeLabel: size } },
            ack: `PDF "${filename}" generated (${size}, ${sections.length} section${sections.length === 1 ? '' : 's'}) and offered as a download. Do not restate its contents — just confirm briefly that it's ready.`,
        };
        return result;
    },
};

// ─── export_excel ────────────────────────────────────────────────────────────

interface ExcelSheetInput {
    name: string;
    columns: TableSpec['columns'];
    rows: TableSpec['rows'];
    total?: TableSpec['total'];
}

function excelCellValue(raw: any, format?: string): string | number {
    if (raw === null || raw === undefined || raw === '') return '';
    if (format === 'currency' || format === 'number') {
        const n = Number(raw);
        return Number.isFinite(n) ? n : String(raw);
    }
    return String(raw);
}

/** Exported for testing. */
export function buildWorkbook(sheets: ExcelSheetInput[]): Buffer {
    const wb = XLSX.utils.book_new();
    const usedNames = new Set<string>();

    for (const sheet of sheets) {
        const header = sheet.columns.map(c => c.label);
        const dataRows = sheet.rows.map(row => sheet.columns.map(c => excelCellValue(row[c.key], c.format)));
        const aoa: Array<Array<string | number>> = [header, ...dataRows];
        if (sheet.total) {
            aoa.push(sheet.columns.map(c => (sheet.total?.[c.key] !== undefined ? excelCellValue(sheet.total[c.key], c.format) : '')));
        }

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        // Column widths sized off the header — good enough without measuring every cell.
        ws['!cols'] = sheet.columns.map(c => ({ wch: Math.max(c.label.length + 2, 10) }));

        // Sheet names: Excel caps at 31 chars and forbids a few characters; dedupe on collision.
        let name = sheet.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet';
        let suffix = 2;
        while (usedNames.has(name)) {
            name = `${name.slice(0, 28)} ${suffix++}`;
        }
        usedNames.add(name);

        XLSX.utils.book_append_sheet(wb, ws, name);
    }

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const exportExcel: ToolDefinition = {
    name: 'export_excel',
    description:
        'Generate a downloadable Excel workbook (.xlsx) with one or more sheets and return a link. ' +
        'Numbers are written as real Excel numbers, not text, so the user can sum and format them ' +
        'natively. Use this for raw data the user wants to work with further — a full transaction ' +
        'export, an aged listing — rather than for something meant to stay in the conversation. ' +
        'Unlike render_table there is no practical row limit here; do not truncate data to fit a ' +
        'chat display, this goes straight into a file.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            title: { type: 'string', description: 'Used as the filename, e.g. "Transactions July 2026".' },
            sheets: {
                type: 'array',
                description: 'One or more sheets. Each: {name, columns:[{key,label,format?}], rows:[...], total?}.',
                items: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        columns: { type: 'array', items: { type: 'object' } },
                        rows: { type: 'array', items: { type: 'object' } },
                        total: { type: 'object' },
                    },
                    required: ['name', 'columns', 'rows'],
                },
            },
        },
        required: ['title', 'sheets'],
    },
    handler: async (ctx: AgentContext, args) => {
        if (!args.title?.trim()) invalid('title is required.');
        if (!Array.isArray(args.sheets) || !args.sheets.length) invalid('At least one sheet is required.');
        if (args.sheets.length > 20) invalid(`${args.sheets.length} sheets given; cap it at 20.`);

        const sheets: ExcelSheetInput[] = args.sheets.map((s: any, i: number) => {
            if (!s.name?.trim()) invalid(`Sheet ${i + 1} needs a name.`);
            if (!Array.isArray(s.columns) || !s.columns.length) invalid(`Sheet "${s.name}" needs at least one column.`);
            if (!Array.isArray(s.rows) || !s.rows.length) invalid(`Sheet "${s.name}" needs at least one row.`);
            return {
                name: s.name.trim(),
                columns: s.columns.map((c: any) => ({
                    key: c.key,
                    label: c.label,
                    format: c.format ?? 'text',
                    align: c.align,
                })),
                rows: s.rows,
                total: s.total,
            };
        });

        const buffer = buildWorkbook(sheets);
        const filename = `${safeFilenamePart(args.title)}.xlsx`;
        const { url, sizeLabel: size } = await uploadAndSign(
            ctx, filename, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        const totalRows = sheets.reduce((s, sh) => s + sh.rows.length, 0);
        const result: WidgetResult = {
            __widget: true,
            widget: { type: 'file', spec: { name: filename, url, kind: 'xlsx', sizeLabel: size } },
            ack: `Excel file "${filename}" generated (${size}, ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}, ${totalRows} rows total) and offered as a download. Do not restate the data — just confirm briefly that it's ready.`,
        };
        return result;
    },
};

// ─── export_transactions_excel ───────────────────────────────────────────────

const BULK_EXPORT_ROW_CAP = 20_000;

/**
 * Why this exists alongside export_excel: that tool needs the model to supply
 * `rows` as tool-call arguments, which means the model has to have *fetched*
 * them first — and search_transactions caps at 200 for the same reason every
 * read tool caps its output, to protect the model's own context window. A
 * "full quarter" export can easily be 500+ rows, which search_transactions
 * structurally cannot hand back and export_excel structurally cannot accept
 * without the model choking on its own tool-call arguments trying to carry
 * them. Watched a real model spend its entire turn reasoning in circles about
 * this exact contradiction instead of just saying so.
 *
 * The fix is this tool querying the database directly and writing straight to
 * the workbook — the row data never becomes something the model has to see,
 * hold, or pass along. It only ever receives a count and a link.
 */
const exportTransactionsExcel: ToolDefinition = {
    name: 'export_transactions_excel',
    description:
        'Export cashbook transactions straight to an Excel file for a date range — no row limit, ' +
        'because unlike search_transactions this never routes the data through you. Use this instead ' +
        'of fetching with search_transactions and building export_excel yourself whenever the user ' +
        'wants "all", "the full listing", "everything for [period]" or anything else where the row ' +
        'count could plausibly exceed a couple hundred. Same filters as search_transactions.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            startDate: { type: 'string', description: 'Inclusive ISO date. Omit for all time.' },
            endDate: { type: 'string', description: 'Inclusive ISO date. Omit for up to today.' },
            walletName: { type: 'string', description: 'Restrict to one wallet by name.' },
            direction: { type: 'string', enum: ['in', 'out', 'both'], description: 'Default both.' },
            unaccountedOnly: { type: 'boolean', description: 'Only entries with no chart-of-accounts classification yet.' },
            title: { type: 'string', description: 'Used as the filename, e.g. "Transactions Q2 2026".' },
        },
        required: ['title'],
    },
    handler: async (ctx: AgentContext, args) => {
        if (!args.title?.trim()) invalid('title is required.');

        let walletId: string | undefined;
        if (args.walletName) {
            const { data: w } = await supabase
                .from('organization_wallets')
                .select('id')
                .eq('organization_id', ctx.organizationId)
                .ilike('name', `%${args.walletName}%`)
                .maybeSingle();
            if (!w) invalid(`No wallet matching "${args.walletName}".`);
            walletId = w!.id;
        }

        let q = supabase
            .from('cashbook_entries')
            .select('date, description, debit, credit, balance_after, entry_type, reference_number, status, account_id, accounts(name)')
            .eq('organization_id', ctx.organizationId)
            .neq('status', 'PENDING')
            .order('date', { ascending: true })
            .limit(BULK_EXPORT_ROW_CAP);

        if (walletId) q = q.eq('wallet_id', walletId);
        if (args.startDate) q = q.gte('date', args.startDate);
        if (args.endDate) q = q.lte('date', args.endDate);
        if (args.direction === 'in') q = q.gt('debit', 0);
        if (args.direction === 'out') q = q.gt('credit', 0);
        if (args.unaccountedOnly) q = q.is('account_id', null);

        const { data, error } = await q;
        if (error) throw new Error(error.message);
        if (!data?.length) invalid('No transactions match those filters — nothing to export.');

        const rows = data.map((r: any) => ({
            date: r.date,
            description: r.description,
            debit: r.debit,
            credit: r.credit,
            balance_after: r.balance_after,
            entry_type: r.entry_type,
            reference_number: r.reference_number,
            status: r.status,
            account: r.accounts?.name ?? 'Unclassified',
        }));

        const buffer = buildWorkbook([{
            name: 'Transactions',
            columns: [
                { key: 'date', label: 'Date', format: 'date' },
                { key: 'description', label: 'Description', format: 'text' },
                { key: 'debit', label: 'Money In', format: 'currency' },
                { key: 'credit', label: 'Money Out', format: 'currency' },
                { key: 'balance_after', label: 'Balance', format: 'currency' },
                { key: 'entry_type', label: 'Type', format: 'text' },
                { key: 'reference_number', label: 'Reference', format: 'text' },
                { key: 'status', label: 'Status', format: 'text' },
                { key: 'account', label: 'Account', format: 'text' },
            ],
            rows,
        }]);

        const filename = `${safeFilenamePart(args.title)}.xlsx`;
        const { url, sizeLabel: size } = await uploadAndSign(
            ctx, filename, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        const truncated = data.length >= BULK_EXPORT_ROW_CAP;
        const result: WidgetResult = {
            __widget: true,
            widget: { type: 'file', spec: { name: filename, url, kind: 'xlsx', sizeLabel: size } },
            ack:
                `Excel file "${filename}" generated (${size}, ${rows.length} transactions) and offered as a download.` +
                (truncated ? ` Hit the ${BULK_EXPORT_ROW_CAP}-row export cap — tell the user the range may need narrowing for a fully complete file.` : '') +
                ' Do not restate the data — just confirm briefly that it\'s ready.',
        };
        return result;
    },
};

export const exportTools: ToolDefinition[] = [exportPdfReport, exportExcel, exportTransactionsExcel];
