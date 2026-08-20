/**
 * reconcile.tools.ts — Bank statement reconciliation.
 *
 * Read-only: this compares an uploaded statement against the ledger and
 * reports what lines up and what doesn't. It never writes anything — fixing a
 * discrepancy (categorizing an entry, raising a requisition for something the
 * bank shows but the books don't) is a separate, approved write with an
 * existing tool. Keeping this read-only means it needs no approval card and
 * can run as many times as the user wants to re-check their filters.
 *
 * The file itself is uploaded straight from the browser to Supabase Storage
 * (bucket `bank-statements`, private — see the migration of the same name)
 * and only its storage path reaches this tool; the model never sees file
 * bytes, and the API fetches them here with the service-role client.
 */

import * as XLSX from 'xlsx';
import { supabase } from '../../../lib/supabase';
import { AgentContext, ToolDefinition } from '../types';

const num = (n: any) => Number(n ?? 0);
const MATCH_TOLERANCE = 0.01; // rounding slack, not a real amount difference
const DATE_WINDOW_DAYS = 3; // a transfer can clear a day or two after it's booked
const MAX_LISTED = 60;

// ─── Column detection ──────────────────────────────────────────────────────

const HEADER_KEYWORDS: Record<string, string[]> = {
    date: ['date', 'txn date', 'transaction date', 'value date', 'posting date', 'trans date'],
    description: ['description', 'narration', 'details', 'particulars', 'narrative', 'transaction details', 'remarks'],
    debit: ['debit', 'withdrawal', 'money out', 'paid out', 'dr'],
    credit: ['credit', 'deposit', 'money in', 'paid in', 'cr'],
    amount: ['amount', 'value'],
};

/**
 * A keyword only substring-matches a cell when it's long enough that a false
 * hit is implausible — short codes like "dr"/"cr" must match the whole cell
 * exactly, or "description" (which contains "cr") gets misread as a credit
 * column.
 */
function keywordMatches(cell: string, keyword: string): boolean {
    if (cell === keyword) return true;
    return keyword.length >= 4 && cell.includes(keyword);
}

/** Scans the first few rows for the header row, matching common bank export column names. */
function detectHeader(rows: any[][]): { rowIndex: number; cols: Record<string, number> } | null {
    const maxScan = Math.min(rows.length, 10);
    for (let i = 0; i < maxScan; i++) {
        const cells = (rows[i] ?? []).map(c => String(c ?? '').trim().toLowerCase());
        const cols: Record<string, number> = {};
        for (const [key, keywords] of Object.entries(HEADER_KEYWORDS)) {
            const idx = cells.findIndex(cell => cell.length > 0 && keywords.some(k => keywordMatches(cell, k)));
            if (idx !== -1) cols[key] = idx;
        }
        const hasDate = cols.date !== undefined;
        const hasAmount = cols.amount !== undefined || cols.debit !== undefined || cols.credit !== undefined;
        if (hasDate && hasAmount) return { rowIndex: i, cols };
    }
    return null;
}

/** Excel serial dates, ISO strings, and DD/MM/YYYY (the ZM default when ambiguous). */
function parseStatementDate(raw: any): string | null {
    if (raw == null || raw === '') return null;

    if (typeof raw === 'number') {
        const d = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }

    const s = String(raw).trim();
    if (!s) return null;

    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
    if (m) {
        let day = Number(m[1]);
        let month = Number(m[2]);
        const year = m[3];
        // If the first number can't be a day, the format must be MM/DD.
        if (day > 12 && month <= 12) {
            // already DD/MM, nothing to do
        } else if (month > 12 && day <= 12) {
            [day, month] = [month, day];
        }
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const parsed = new Date(s);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/** Strips currency symbols/commas; "(1,200.00)" (accounting negative) parses to -1200. */
function parseStatementAmount(raw: any): number {
    if (raw == null || raw === '') return 0;
    if (typeof raw === 'number') return raw;
    let s = String(raw).trim();
    if (!s) return 0;
    let negative = false;
    if (/^\(.*\)$/.test(s)) {
        negative = true;
        s = s.slice(1, -1);
    }
    s = s.replace(/[^0-9.\-]/g, '');
    const n = parseFloat(s);
    if (isNaN(n)) return 0;
    return negative ? -Math.abs(n) : n;
}

interface StatementLine {
    date: string;
    description: string;
    in: number; // money into the bank account — compares against the ledger's debit
    out: number; // money out — compares against the ledger's credit
}

/** Exported for testing — parsing is the part with the most edge cases. */
export function parseStatement(buffer: Buffer): StatementLine[] {
    // raw:true + cellDates:false keeps every cell exactly as authored — CSV
    // date detection in `raw:false` mode silently reformats strings like
    // "01/07/2026" to "1/7/26" (2-digit year), which parseStatementDate's
    // 4-digit-year pattern then can't read at all. Excel date *cells* still
    // come through as their numeric serial either way, which the date parser
    // below already handles.
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: true, cellText: true, cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('INVALID_ARGUMENTS: The file has no readable sheet.');

    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    const header = detectHeader(rows);
    if (!header) {
        throw new Error(
            'INVALID_ARGUMENTS: Could not find a date column and an amount column in the first 10 rows. ' +
            'Tell the user MoneyWise could not read this statement\'s layout — it may need to be a plain ' +
            'export with a header row (Date, Description, Debit/Credit or Amount).'
        );
    }

    const { rowIndex, cols } = header;
    const lines: StatementLine[] = [];

    for (let i = rowIndex + 1; i < rows.length; i++) {
        const row = rows[i] ?? [];
        if (row.every((c: any) => String(c ?? '').trim() === '')) continue;

        const date = parseStatementDate(row[cols.date]);
        if (!date) continue; // footer/summary rows rarely have a parseable date

        const description = cols.description !== undefined ? String(row[cols.description] ?? '').trim() : '';

        let inAmt = 0;
        let outAmt = 0;
        if (cols.debit !== undefined || cols.credit !== undefined) {
            outAmt = Math.abs(parseStatementAmount(cols.debit !== undefined ? row[cols.debit] : 0));
            inAmt = Math.abs(parseStatementAmount(cols.credit !== undefined ? row[cols.credit] : 0));
        } else if (cols.amount !== undefined) {
            // Single-column statements: positive = money in, negative = money out.
            // This is the common convention but not universal — the tool says so
            // in its output rather than presenting it as fact.
            const amt = parseStatementAmount(row[cols.amount]);
            if (amt >= 0) inAmt = amt;
            else outAmt = Math.abs(amt);
        }

        if (inAmt === 0 && outAmt === 0) continue;
        lines.push({ date, description, in: inAmt, out: outAmt });
    }

    return lines;
}

// ─── Matching ────────────────────────────────────────────────────────────────

interface BookEntry {
    id: string;
    date: string;
    description: string;
    debit: number;
    credit: number;
    reference_number: string | null;
}

function daysBetween(a: string, b: string): number {
    return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

const reconcileBankStatement: ToolDefinition = {
    name: 'reconcile_bank_statement',
    description:
        'Compare an uploaded bank statement against the cashbook ledger for one wallet and report ' +
        'what matches, what is on the bank statement but missing from the books, and what is in the ' +
        'books but not on the statement. Requires a file the user has attached to the conversation — ' +
        'its storage path appears in the message as "storage path: ...". Do not call this without one; ' +
        'ask the user to attach a statement first (CSV or Excel export from their bank). This only ' +
        'reports differences — it does not fix them. Once you know what is missing, use ' +
        'categorize_transaction or create_requisition for anything that needs recording.',
    effect: 'read',
    parameters: {
        type: 'object',
        properties: {
            filePath: { type: 'string', description: 'The storage path from the attached-file message, e.g. "org-id/169...-statement.csv".' },
            walletName: { type: 'string', description: 'Wallet to reconcile against. Defaults to the main wallet.' },
        },
        required: ['filePath'],
    },
    handler: async (ctx: AgentContext, args) => {
        if (!args.filePath) {
            throw new Error('INVALID_ARGUMENTS: No file path given — ask the user to attach a bank statement first.');
        }

        const { data: fileData, error: dlError } = await supabase.storage
            .from('bank-statements')
            .download(String(args.filePath));
        if (dlError || !fileData) {
            throw new Error(`INVALID_ARGUMENTS: Could not read the attached file (${dlError?.message ?? 'not found'}). Ask the user to re-attach it.`);
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());
        const lines = parseStatement(buffer);
        if (!lines.length) {
            throw new Error('INVALID_ARGUMENTS: No transaction rows could be read from the statement. It may be empty or in an unsupported layout.');
        }

        // Resolve the wallet: named, or the org's main wallet by default.
        let walletQuery = supabase
            .from('organization_wallets')
            .select('id, name')
            .eq('organization_id', ctx.organizationId);
        walletQuery = args.walletName
            ? walletQuery.ilike('name', `%${args.walletName}%`)
            : walletQuery.eq('is_main', true);
        const { data: wallet } = await walletQuery.maybeSingle();
        if (!wallet) {
            throw new Error(
                args.walletName
                    ? `INVALID_ARGUMENTS: No wallet matching "${args.walletName}". Check list wallet names first.`
                    : 'INVALID_ARGUMENTS: Could not find the main wallet for this organisation.'
            );
        }

        const dates = lines.map(l => l.date).sort();
        const minDate = new Date(dates[0]);
        const maxDate = new Date(dates[dates.length - 1]);
        minDate.setDate(minDate.getDate() - DATE_WINDOW_DAYS);
        maxDate.setDate(maxDate.getDate() + DATE_WINDOW_DAYS);

        const { data: bookRows, error: bookErr } = await supabase
            .from('cashbook_entries')
            .select('id, date, description, debit, credit, reference_number')
            .eq('organization_id', ctx.organizationId)
            .eq('wallet_id', wallet.id)
            .neq('status', 'PENDING')
            .gte('date', minDate.toISOString().slice(0, 10))
            .lte('date', maxDate.toISOString().slice(0, 10))
            .limit(5000);
        if (bookErr) throw new Error(bookErr.message);

        const book: Array<BookEntry & { used: boolean }> = (bookRows ?? []).map((r: any) => ({
            id: r.id,
            date: r.date,
            description: r.description,
            debit: num(r.debit),
            credit: num(r.credit),
            reference_number: r.reference_number,
            used: false,
        }));

        const unmatchedBankLines: StatementLine[] = [];
        let matchedCount = 0;
        let matchedTotal = 0;

        for (const line of lines) {
            const direction: 'debit' | 'credit' = line.in > 0 ? 'debit' : 'credit';
            const amount = direction === 'debit' ? line.in : line.out;

            const candidates = book.filter(
                b => !b.used && Math.abs((direction === 'debit' ? b.debit : b.credit) - amount) <= MATCH_TOLERANCE
            );

            if (!candidates.length) {
                unmatchedBankLines.push(line);
                continue;
            }

            candidates.sort((a, b) => daysBetween(a.date, line.date) - daysBetween(b.date, line.date));
            const best = candidates[0];
            // A candidate more than the window away isn't really a match — it's
            // a coincidence of amount. Treat it as unmatched instead.
            if (daysBetween(best.date, line.date) > DATE_WINDOW_DAYS) {
                unmatchedBankLines.push(line);
                continue;
            }

            best.used = true;
            matchedCount += 1;
            matchedTotal += amount;
        }

        const unmatchedBookEntries = book.filter(b => !b.used && (b.debit > 0 || b.credit > 0));

        return {
            method:
                `Matched by exact amount (±K${MATCH_TOLERANCE}) within ${DATE_WINDOW_DAYS} days of the statement date. ` +
                'A single-column "Amount" statement is read as positive = money in, negative = money out — ' +
                'flag this to the user if the totals look inverted.',
            wallet: wallet.name,
            statement_period: { start: dates[0], end: dates[dates.length - 1] },
            statement_lines_parsed: lines.length,
            book_entries_considered: book.length,
            matched_count: matchedCount,
            matched_total: Number(matchedTotal.toFixed(2)),
            unmatched_bank_lines: {
                count: unmatchedBankLines.length,
                note: unmatchedBankLines.length > MAX_LISTED ? `Showing the first ${MAX_LISTED} of ${unmatchedBankLines.length}.` : undefined,
                lines: unmatchedBankLines.slice(0, MAX_LISTED),
            },
            unmatched_book_entries: {
                count: unmatchedBookEntries.length,
                note: unmatchedBookEntries.length > MAX_LISTED ? `Showing the first ${MAX_LISTED} of ${unmatchedBookEntries.length}.` : undefined,
                entries: unmatchedBookEntries.slice(0, MAX_LISTED).map(({ used, ...rest }) => rest),
            },
        };
    },
};

export const reconcileTools: ToolDefinition[] = [reconcileBankStatement];
