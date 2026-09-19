/**
 * Bank-statement parsing, shared by both clients.
 *
 * The server does the matching and reconciliation; the client's only job is to
 * turn a downloaded statement into rows of the agreed shape. That mapping is
 * exactly the kind of logic that must not diverge — a column detected on the
 * desktop but missed on the phone would silently import a different ledger.
 */

export interface ParsedStatementRow {
    /** ISO `YYYY-MM-DD`. */
    date: string;
    details: string;
    debit: number;
    credit: number;
    balance: number;
}

export class StatementFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StatementFormatError';
    }
}

/** Strips currency symbols, thousands separators and stray spaces. */
function toNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const n = parseFloat(String(value ?? '0').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
}

/**
 * Excel stores dates as days since 1899-12-30. A statement exported to .xlsx
 * therefore arrives as a number, while the same statement as .csv arrives as
 * text — both have to land on the same ISO date.
 */
function toIsoDate(value: unknown): string | null {
    if (value == null || value === '') return null;
    if (typeof value === 'number') {
        const d = new Date((value - 25569) * 86400 * 1000);
        return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const HEADER_ALIASES = {
    date:    ['date'],
    details: ['detail', 'description', 'narrative'],
    debit:   ['debit', 'withdrawal'],
    credit:  ['credit', 'deposit'],
    balance: ['balance'],
} as const;

/**
 * Maps a raw sheet (first row = headers) into statement rows.
 *
 * Rows with an unparseable date are skipped rather than failing the import:
 * bank exports routinely carry footer totals and page breaks, and rejecting the
 * whole file over them would make the feature unusable.
 */
export function parseStatementRows(sheet: unknown[][]): ParsedStatementRow[] {
    if (!sheet.length) throw new StatementFormatError('That file has no rows.');

    const headers = (sheet[0] ?? []).map((h) => String(h ?? '').toLowerCase().trim());
    const find = (aliases: readonly string[]) =>
        headers.findIndex((h) => aliases.some((a) => h.includes(a)));

    const idx = {
        date: find(HEADER_ALIASES.date),
        details: find(HEADER_ALIASES.details),
        debit: find(HEADER_ALIASES.debit),
        credit: find(HEADER_ALIASES.credit),
        balance: find(HEADER_ALIASES.balance),
    };

    const missing = Object.entries(idx).filter(([, i]) => i === -1).map(([k]) => k);
    if (missing.length) {
        throw new StatementFormatError(
            'Statement must contain Date, Details/Description, Debit, Credit and Balance columns. ' +
            `Missing: ${missing.join(', ')}.`,
        );
    }

    const rows: ParsedStatementRow[] = [];
    for (let i = 1; i < sheet.length; i++) {
        const raw = sheet[i] ?? [];
        if (raw.every((c) => c == null || c === '')) continue;

        const date = toIsoDate(raw[idx.date]);
        if (!date) continue; // footer/subtotal line, not a transaction

        rows.push({
            date,
            details: String(raw[idx.details] ?? '').trim(),
            debit: toNumber(raw[idx.debit]),
            credit: toNumber(raw[idx.credit]),
            balance: toNumber(raw[idx.balance]),
        });
    }

    if (rows.length === 0) throw new StatementFormatError('No valid transaction rows found.');
    return rows;
}

/**
 * Minimal RFC-4180 CSV reader — quoted fields, escaped quotes, embedded commas
 * and newlines. Written out rather than pulled from a dependency because the
 * native app cannot use the SheetJS build the web app relies on, and a bank
 * statement with a comma inside a merchant name is the normal case, not an edge one.
 */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    // Normalise line endings so a Windows-exported statement parses the same.
    const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (inQuotes) {
            if (c === '"') {
                if (src[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += c;
            continue;
        }
        if (c === '"') { inQuotes = true; continue; }
        if (c === ',') { row.push(field); field = ''; continue; }
        if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
        field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
