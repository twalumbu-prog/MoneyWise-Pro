import PDFDocument from 'pdfkit';
import { supabase } from '../lib/supabase';
import * as acc from './accounting.service';
import * as controls from './accountingControls.service';
import * as reports from './accountingReports.service';
import * as purchasing from './purchasing.service';

/**
 * Any statement as a PDF, built on the server from the same figures the screens show, so the two always agree.
 * A report is described as a title and a few tables; one small renderer lays them out and handles page breaks.
 */

interface Col { label: string; width: number; align?: 'left' | 'right' }
interface Row { cells: string[]; bold?: boolean; indent?: boolean; shade?: boolean }
interface Block { heading?: string; columns: Col[]; rows: Row[] }
interface Doc { title: string; subtitle: string; blocks: Block[]; footnote?: string }

const money = (n: number) => `K ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nameOf = (a: { code?: string | null; name: string }) => `${a.code ? `${a.code} · ` : ''}${a.name}`;
const pct = (n: number | null) => (n == null ? '' : `${n > 0 ? '+' : ''}${n}%`);
const L = 50, R = 545, W = R - L;

function render(orgName: string, doc: Doc): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const pdf = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: doc.title, Author: orgName } });
        const chunks: Buffer[] = [];
        pdf.on('data', (c) => chunks.push(c)); pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject);

        pdf.fillColor('#0F172A').font('Helvetica-Bold').fontSize(16).text(orgName, L, 50);
        pdf.font('Helvetica-Bold').fontSize(13).fillColor('#006AFF').text(doc.title, L, pdf.y + 2);
        pdf.font('Helvetica').fontSize(9).fillColor('#64748b').text(doc.subtitle, L, pdf.y + 2);
        pdf.moveDown(0.8);

        const ensure = (h: number) => { if (pdf.y + h > 780) pdf.addPage(); };
        for (const b of doc.blocks) {
            ensure(60);
            if (b.heading) { pdf.font('Helvetica-Bold').fontSize(10).fillColor('#0F172A').text(b.heading.toUpperCase(), L, pdf.y + 6); pdf.moveDown(0.3); }
            const x0 = L; const total = b.columns.reduce((s, c) => s + c.width, 0); const scale = W / total;
            const draw = (cells: string[], opts: { bold?: boolean; indent?: boolean; head?: boolean; shade?: boolean }) => {
                ensure(18);
                const y = pdf.y;
                if (opts.shade) pdf.rect(L, y - 2, W, 16).fill('#f1f5f9');
                let x = x0;
                b.columns.forEach((c, i) => {
                    const w = c.width * scale - 8;
                    pdf.fillColor(opts.head ? '#64748b' : '#0F172A').font(opts.bold || opts.head ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.head ? 7.5 : 9);
                    pdf.text(opts.head ? c.label.toUpperCase() : (cells[i] ?? ''), x + (i === 0 && opts.indent ? 14 : 0), y, { width: w - (i === 0 && opts.indent ? 14 : 0), align: c.align ?? 'left', lineBreak: false, ellipsis: true });
                    x += c.width * scale;
                });
                pdf.y = y + 15;
                pdf.moveTo(L, pdf.y - 3).lineTo(R, pdf.y - 3).lineWidth(0.4).strokeColor('#e2e8f0').stroke();
            };
            draw([], { head: true });
            if (b.rows.length === 0) { pdf.font('Helvetica').fontSize(9).fillColor('#64748b').text('Nothing recorded.', L, pdf.y + 2); pdf.moveDown(0.6); }
            for (const r of b.rows) draw(r.cells, r);
            pdf.moveDown(0.6);
        }
        if (doc.footnote) pdf.font('Helvetica-Oblique').fontSize(8).fillColor('#64748b').text(doc.footnote, L, pdf.y + 4, { width: W });

        const range = pdf.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
            pdf.switchToPage(i);
            pdf.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(`Page ${i + 1} of ${range.count} · Produced ${new Date().toISOString().slice(0, 10)} by MoneyWise`, L, 805, { width: W, align: 'center', lineBreak: false });
        }
        pdf.end();
    });
}

const AMT: Col = { label: '', width: 1.4, align: 'right' };
const col = (label: string, width: number, align: 'left' | 'right' = 'left'): Col => ({ label, width, align });

function groupsToRows(groups: { name: string; total: number; lines: { name: string; code?: string | null; amount: number }[] }[]): Row[] {
    return groups.flatMap((g) => [{ cells: [g.name, money(g.total)], bold: true } as Row, ...g.lines.map((l) => ({ cells: [nameOf(l), money(l.amount)], indent: true } as Row))]);
}

export async function buildReportPdf(orgId: string, report: string, q: { from: string | null; to: string | null; accountId?: string; against?: string }): Promise<{ file: string; pdf: Buffer }> {
    const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
    const orgName = org?.name ?? 'MoneyWise';
    const to = q.to ?? new Date().toISOString().slice(0, 10);
    const from = q.from ?? `${to.slice(0, 4)}-01-01`;
    let doc: Doc;

    if (report === 'tb') {
        const d = await acc.trialBalance(orgId, to);
        doc = { title: 'Trial balance', subtitle: `As at ${to}`, blocks: [{ columns: [col('Account', 4), col('Debit', 1.5, 'right'), col('Credit', 1.5, 'right')], rows: [...d.rows.map((r) => ({ cells: [nameOf(r), r.debit ? money(r.debit) : '', r.credit ? money(r.credit) : ''] })), { cells: ['Total', money(d.totals.debit), money(d.totals.credit)], bold: true, shade: true }] }], footnote: d.balanced ? 'Debits equal credits.' : 'Debits and credits do not match.' };
    } else if (report === 'bs') {
        const d = await acc.balanceSheet(orgId, to);
        const two = [col('', 4), { ...AMT, label: 'Amount' }];
        doc = { title: 'Balance sheet', subtitle: `As at ${to}`, blocks: [
            { heading: 'Assets', columns: two, rows: [...groupsToRows(d.assets), { cells: ['Total assets', money(d.totalAssets)], bold: true, shade: true }] },
            { heading: 'Liabilities', columns: two, rows: [...groupsToRows(d.liabilities), { cells: ['Total liabilities', money(d.totalLiabilities)], bold: true, shade: true }] },
            { heading: 'Equity', columns: two, rows: [...groupsToRows(d.equity), { cells: ['Profit for the period', money(d.profitForPeriod)], bold: true }, { cells: ['Total equity', money(d.totalEquity)], bold: true, shade: true }] },
        ], footnote: d.balanced ? 'Assets equal liabilities plus equity.' : 'Assets do not equal liabilities plus equity.' };
    } else if (report === 'cf') {
        const d = await controls.cashFlow(orgId, from, to);
        const two = [col('', 4), { ...AMT, label: 'Amount' }];
        const sec = (heading: string, s: { groups: any[]; total: number }): Block | null => (s.groups.length ? { heading, columns: two, rows: [...groupsToRows(s.groups.map((g) => ({ name: g.name, total: g.total, lines: g.lines }))), { cells: [`Total ${heading.toLowerCase()}`, money(s.total)], bold: true, shade: true }] } : null);
        doc = { title: 'Cash flow statement', subtitle: `${from} to ${to}`, blocks: [
            { columns: two, rows: [{ cells: ['Cash at the start', money(d.openingCash)], bold: true }] },
            ...[sec('Day-to-day business', d.operating), sec('Equipment and property', d.investing), sec('Owners and loans', d.financing), sec('Uncategorised', d.other)].filter(Boolean) as Block[],
            { columns: two, rows: [{ cells: ['Net change in cash', money(d.netChange)], bold: true }, { cells: ['Cash at the end', money(d.closingCash)], bold: true, shade: true }] },
        ], footnote: d.reconciles ? 'The start, the movements and the end agree.' : 'The movements do not add up to the change in cash; check the Uncategorised group.' };
    } else if (report === 'ar' || report === 'ap') {
        const d = report === 'ar' ? await controls.receivablesAgeing(orgId) : await purchasing.payablesAgeing(orgId);
        const keys = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total'];
        const cols = [col(report === 'ar' ? 'Customer' : 'Supplier', 3), col('Current', 1.3, 'right'), col('1-30', 1.3, 'right'), col('31-60', 1.3, 'right'), col('61-90', 1.3, 'right'), col('90+', 1.3, 'right'), col('Total', 1.5, 'right')];
        doc = { title: report === 'ar' ? 'Receivables ageing' : 'Payables ageing', subtitle: `As at ${new Date().toISOString().slice(0, 10)}`, blocks: [{ columns: cols, rows: [...d.rows.map((r: any) => ({ cells: [r.customer ?? r.supplier, ...keys.map((k) => (r[k] ? money(r[k]) : ''))] })), ...(d.rows.length ? [{ cells: ['Total', ...keys.map((k) => money((d.totals as any)[k] ?? 0))], bold: true, shade: true }] : [])] }] };
    } else if (report === 'gl') {
        if (!q.accountId) throw new Error('Choose an account.');
        const d = await acc.generalLedger(orgId, q.accountId, from, to);
        doc = { title: `Account ledger: ${d.account.name}`, subtitle: `${from} to ${to}`, blocks: [{ columns: [col('Date', 1.5), col('Description', 5), col('Debit', 1.6, 'right'), col('Credit', 1.6, 'right'), col('Balance', 1.7, 'right')], rows: [{ cells: ['', 'Opening balance', '', '', money(d.opening)], bold: true }, ...d.lines.map((l) => ({ cells: [l.date, String(l.description ?? ''), l.debit ? money(l.debit) : '', l.credit ? money(l.credit) : '', money(l.balance)] })), { cells: ['', 'Closing balance', '', '', money(d.closing)], bold: true, shade: true }] }], footnote: d.truncated ? 'Only the first 3,000 lines are shown.' : undefined };
    } else if (report === 'budget') {
        const d = await reports.budgetVsActual(orgId, from, to);
        const cols = [col('', 4), col('Budget', 1.5, 'right'), col('Actual', 1.5, 'right'), col('Variance', 1.5, 'right')];
        const sec = (heading: string, s: { lines: any[]; budget: number; actual: number }, variance: number): Block => ({ heading, columns: cols, rows: [...s.lines.map((l) => ({ cells: [nameOf(l), l.budget ? money(l.budget) : '', money(l.actual), money(l.variance)] })), { cells: [`Total ${heading.toLowerCase()}`, money(s.budget), money(s.actual), money(variance)], bold: true, shade: true }] });
        doc = { title: 'Budget against actual', subtitle: `${from} to ${to}`, blocks: [sec('Income', d.income, r2(d.income.actual - d.income.budget)), sec('Expenses', d.expenses, r2(d.expenses.budget - d.expenses.actual)), { columns: cols, rows: [{ cells: ['Profit', money(d.budgetedProfit), money(d.actualProfit), money(d.actualProfit - d.budgetedProfit)], bold: true, shade: true }] }], footnote: 'Variance is room left: positive means under budget on costs, or ahead of target on income.' };
    } else if (report === 'compare') {
        const d = await reports.comparePeriods(orgId, from, to, q.against === 'year' ? 'year' : 'previous');
        const cols = [col('', 4), col('This period', 1.5, 'right'), col('Compared', 1.5, 'right'), col('Change', 1.4, 'right'), col('%', 0.9, 'right')];
        const rowsOf = (s: any): Row[] => s.groups.flatMap((g: any) => [{ cells: [g.name, money(g.current), money(g.previous), money(g.change), pct(g.changePct)], bold: true } as Row, ...g.lines.map((l: any) => ({ cells: [l.name, money(l.current), money(l.previous), money(l.change), pct(l.changePct)], indent: true } as Row))]);
        doc = { title: 'Profit and loss comparison', subtitle: `${from} to ${to} compared with ${d.comparedWith.from} to ${d.comparedWith.to}`, blocks: [
            { heading: 'Income', columns: cols, rows: [...rowsOf(d.income), { cells: ['Total income', money(d.income.current), money(d.income.previous), money(d.income.current - d.income.previous), ''], bold: true, shade: true }] },
            { heading: 'Expenses', columns: cols, rows: [...rowsOf(d.expenses), { cells: ['Total expenses', money(d.expenses.current), money(d.expenses.previous), money(d.expenses.current - d.expenses.previous), ''], bold: true, shade: true }] },
            { columns: cols, rows: [{ cells: ['Net profit', money(d.net.current), money(d.net.previous), money(d.net.change), pct(d.net.changePct)], bold: true, shade: true }] },
        ] };
    } else {
        throw new Error('Unknown report.');
    }
    return { file: `${report}-${to}.pdf`, pdf: await render(orgName, doc) };
}
function r2(n: number) { return Math.round(n * 100) / 100; }
