/**
 * Manual journal entries (double entry).
 *
 * A manual journal is a free-form, balanced set of debits and credits an accountant posts straight to the general
 * ledger — accruals, depreciation, reclassifications, corrections, opening balances. It lives in the same
 * `journal_entries` / `journal_lines` tables as every other posting, with `source_type = 'MANUAL'`, so it flows into the
 * trial balance, balance sheet, P&L and the new statements with no special casing.
 *
 * Rules enforced here (the API is the only writer):
 *   - ≥ 2 lines; every line has an account of this organization and exactly ONE of debit / credit, > 0, ≤ 2 decimals;
 *   - Σ debits = Σ credits (to the ngwee) — otherwise nothing is written;
 *   - the date is a real calendar date;
 *   - lines may NOT touch a wallet / cash account that mirrors a real wallet (Main Wallet, sub-wallets, Cash on Hand,
 *     Master Fees collection accounts). Those balances must equal the money actually held (the ledger audit's wallet tie),
 *     and the only way to move that money is through the cashbook. Everything else — receivables, payables, equity,
 *     income, expense, fixed assets, Suspense — is fair game.
 *   - journal numbers (JV-<year>-<n>) are generated per organization and never truncated past 9999 (see the lpad bug fixed in
 *     migration 20261102150000: padStart does not truncate, unlike Postgres lpad).
 *
 * Period locks: this codebase has no period-lock / closed-books concept for the GL (cashbook "close" only reconciles a
 * physical cash count), so there is nothing to respect yet. When one is added, `assertPeriodOpen` below is the single hook.
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';

export class JournalError extends Error {
    constructor(message: string, public status = 400, public details?: any) { super(message); }
}

const TOL = 0.005;
const cents = (n: number) => Math.round(n * 100);
const PROTECTED_CODES = new Set(['QB-1150040000', 'CASH-ON-HAND']);
const isProtectedCode = (code?: string | null) => !!code && (PROTECTED_CODES.has(code) || code.startsWith('WAL-') || code.startsWith('QB-MF-'));

export interface JournalLineInput { account_id: string; debit?: number | string | null; credit?: number | string | null; description?: string | null }
export interface JournalInput { date: string; reference?: string | null; description: string; lines: JournalLineInput[] }

export interface NormalisedLine { account_id: string; debit: number; credit: number; description: string | null }

/** Pure validation (no I/O) — shared by the API and the tests. Returns the cleaned lines + totals, or throws JournalError. */
export function validateJournalInput(input: JournalInput): { date: string; description: string; reference: string | null; lines: NormalisedLine[]; totalDebit: number; totalCredit: number } {
    const date = String(input?.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new JournalError('Enter a valid date (YYYY-MM-DD).');
    const d = new Date(`${date}T00:00:00Z`);
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date || d.getUTCFullYear() < 1990 || d.getUTCFullYear() > 2100) throw new JournalError('Enter a valid date.');

    const description = String(input?.description ?? '').trim();
    if (!description) throw new JournalError('A description is required.');
    if (description.length > 500) throw new JournalError('The description is too long (500 characters max).');
    const reference = String(input?.reference ?? '').trim() || null;
    if (reference && reference.length > 100) throw new JournalError('The reference is too long (100 characters max).');

    if (!Array.isArray(input?.lines) || input.lines.length < 2) throw new JournalError('A journal entry needs at least two lines.');
    if (input.lines.length > 200) throw new JournalError('A journal entry can have at most 200 lines.');

    let dr = 0, cr = 0;
    const lines: NormalisedLine[] = input.lines.map((l, i) => {
        const n = i + 1;
        if (!l?.account_id) throw new JournalError(`Line ${n}: choose an account.`);
        const debit = Number(l.debit === '' || l.debit == null ? 0 : l.debit);
        const credit = Number(l.credit === '' || l.credit == null ? 0 : l.credit);
        if (!Number.isFinite(debit) || !Number.isFinite(credit)) throw new JournalError(`Line ${n}: amounts must be numbers.`);
        if (debit < 0 || credit < 0) throw new JournalError(`Line ${n}: amounts must be positive.`);
        if (Math.abs(cents(debit) / 100 - debit) > 1e-9 || Math.abs(cents(credit) / 100 - credit) > 1e-9) throw new JournalError(`Line ${n}: amounts can have at most 2 decimals.`);
        if (debit > 0 && credit > 0) throw new JournalError(`Line ${n}: enter either a debit or a credit, not both.`);
        if (debit === 0 && credit === 0) throw new JournalError(`Line ${n}: enter a debit or a credit amount.`);
        dr += cents(debit); cr += cents(credit);
        return { account_id: String(l.account_id), debit, credit, description: String(l.description ?? '').trim().slice(0, 300) || null };
    });
    if (dr !== cr) throw new JournalError(`The entry is out of balance by ${(Math.abs(dr - cr) / 100).toFixed(2)} (debits ${(dr / 100).toFixed(2)} vs credits ${(cr / 100).toFixed(2)}).`, 400, { difference: (dr - cr) / 100 });
    return { date, description, reference, lines, totalDebit: dr / 100, totalCredit: cr / 100 };
}

/** Hook for a future period lock / closed-books feature. No-op today (none exists). */
async function assertPeriodOpen(_orgId: string, _date: string): Promise<void> { /* no period locks in this codebase yet */ }

/** Loads the organization's accounts that lines reference and rejects foreign / inactive / wallet-backed ones. */
async function assertPostableAccounts(orgId: string, lines: NormalisedLine[]): Promise<void> {
    const ids = [...new Set(lines.map(l => l.account_id))];
    const { data: accts, error } = await supabase.from('accounts').select('id, code, name, type, is_active, organization_id').in('id', ids);
    if (error) throw new JournalError(`Could not check the accounts: ${error.message}`, 500);
    const byId = new Map((accts || []).map((a: any) => [a.id, a]));
    const { data: wallets } = await supabase.from('organization_wallets').select('name').eq('organization_id', orgId);
    const walletNames = new Set((wallets || []).map((w: any) => String(w.name || '').trim().toLowerCase()).filter(Boolean));
    lines.forEach((l, i) => {
        const a: any = byId.get(l.account_id);
        if (!a || a.organization_id !== orgId) throw new JournalError(`Line ${i + 1}: that account does not belong to this organization.`);
        if (a.is_active === false) throw new JournalError(`Line ${i + 1}: "${a.name}" is inactive.`);
        if (isProtectedCode(a.code) || (a.type === 'ASSET' && walletNames.has(String(a.name || '').trim().toLowerCase()))) {
            throw new JournalError(`Line ${i + 1}: "${a.name}" is a wallet/cash account whose balance must match the money actually held. Record movements through the Cashbook, or post to a different account.`);
        }
    });
}

const nextNumberChain = new Map<string, Promise<unknown>>();

/** Next JV number for the org+year: highest issued + 1, formatted without ever truncating. */
async function nextJournalNumber(orgId: string, year: number, bump = 0): Promise<string> {
    let max = 0;
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('journal_entries').select('reference_number')
            .eq('organization_id', orgId).eq('source_type', 'MANUAL').like('reference_number', `JV-${year}-%`).range(from, from + 999);
        if (error) throw new JournalError(`Could not generate a journal number: ${error.message}`, 500);
        for (const r of data || []) {
            const m = /-(\d+)$/.exec(String((r as any).reference_number ?? ''));
            if (m) max = Math.max(max, parseInt(m[1], 10));
        }
        if (!data || data.length < 1000) break;
    }
    return `JV-${year}-${String(max + 1 + bump).padStart(4, '0')}`;
}

const isMissingColumn = (e: any) => /external_reference/.test(String(e?.message ?? '')) && /column|schema cache/i.test(String(e?.message ?? ''));

export async function createManualJournal(orgId: string, userId: string | null, input: JournalInput) {
    const v = validateJournalInput(input);
    await assertPeriodOpen(orgId, v.date);
    await assertPostableAccounts(orgId, v.lines);

    // Serialise number generation per org inside this process; the unique index (migration 20261105150000) is the
    // cross-process backstop and we retry on a collision.
    const prev = nextNumberChain.get(orgId) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(() => insertWithNumber(orgId, userId, v));
    nextNumberChain.set(orgId, run.catch(() => undefined));
    return run;
}

async function insertWithNumber(orgId: string, userId: string | null, v: ReturnType<typeof validateJournalInput>) {
    const year = new Date(`${v.date}T00:00:00Z`).getUTCFullYear();
    const sourceId = randomUUID();
    let lastErr: any = null;
    for (let attempt = 0; attempt < 6; attempt++) {
        const number = await nextJournalNumber(orgId, year, attempt);
        const base: any = { organization_id: orgId, entry_date: v.date, description: v.description, reference_number: number, source_type: 'MANUAL', source_id: sourceId, created_by: userId };
        let { data: je, error } = await supabase.from('journal_entries').insert({ ...base, external_reference: v.reference }).select('id').single();
        if (error && isMissingColumn(error)) {
            // Migration 20261105150000 not applied yet → keep the user's reference in the description instead of losing it.
            ({ data: je, error } = await supabase.from('journal_entries').insert({ ...base, description: v.reference ? `${v.description} (Ref: ${v.reference})` : v.description }).select('id').single());
        }
        if (error) {
            lastErr = error;
            if ((error as any).code === '23505') continue; // number collision with a concurrent poster → take the next one
            throw new JournalError(`Could not post the journal entry: ${error.message}`, 500);
        }
        const { error: lineErr } = await supabase.from('journal_lines').insert(v.lines.map(l => ({ journal_entry_id: (je as any).id, ...l })));
        if (lineErr) {
            await supabase.from('journal_entries').delete().eq('id', (je as any).id); // never leave a header without its lines
            throw new JournalError(`Could not post the journal lines: ${lineErr.message}`, 500);
        }
        return getJournal(orgId, (je as any).id);
    }
    throw new JournalError(`Could not allocate a journal number: ${lastErr?.message ?? 'too many collisions'}`, 500);
}

function shape(je: any, users: Map<string, string>) {
    const lines = (je.journal_lines || []).map((l: any) => ({
        id: l.id, account_id: l.account_id, account_name: l.accounts?.name ?? null, account_code: l.accounts?.code ?? null, account_type: l.accounts?.type ?? null,
        debit: Number(l.debit || 0), credit: Number(l.credit || 0), description: l.description ?? null,
    }));
    return {
        id: je.id, entry_date: je.entry_date, description: je.description, journal_number: je.reference_number, reference: je.external_reference ?? null,
        source_type: je.source_type, created_at: je.created_at, created_by: je.created_by, created_by_name: je.created_by ? users.get(je.created_by) ?? null : null,
        total_debit: lines.reduce((s: number, l: any) => s + l.debit, 0), total_credit: lines.reduce((s: number, l: any) => s + l.credit, 0), lines,
    };
}

async function userNames(ids: string[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (!uniq.length) return new Map();
    const { data } = await supabase.from('users').select('id, name').in('id', uniq);
    return new Map((data || []).map((u: any) => [u.id, u.name]));
}

export async function getJournal(orgId: string, id: string) {
    // external_reference may not exist yet (migration pending) → select * on the header, lines via the relation.
    const { data, error } = await supabase.from('journal_entries').select('*, journal_lines(id, account_id, debit, credit, description, accounts(id, code, name, type))')
        .eq('organization_id', orgId).eq('id', id).maybeSingle();
    if (error) throw new JournalError(`Could not load the journal entry: ${error.message}`, 500);
    if (!data) throw new JournalError('Journal entry not found.', 404);
    return shape(data, await userNames([(data as any).created_by]));
}

export interface ListJournalsOpts { from?: string; to?: string; search?: string; sourceType?: string; limit?: number; offset?: number }

/** Journal register: newest first, with lines. `sourceType` omitted = every journal (cashbook postings, invoices, manual…). */
export async function listJournals(orgId: string, opts: ListJournalsOpts = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    let q = supabase.from('journal_entries').select('*, journal_lines(id, account_id, debit, credit, description, accounts(id, code, name, type))', { count: 'exact' })
        .eq('organization_id', orgId);
    if (opts.from) q = q.gte('entry_date', opts.from);
    if (opts.to) q = q.lte('entry_date', opts.to);
    if (opts.sourceType) q = q.eq('source_type', opts.sourceType);
    if (opts.search) {
        const s = opts.search.replace(/[%,()]/g, ' ').trim();
        if (s) q = q.or(`description.ilike.%${s}%,reference_number.ilike.%${s}%`);
    }
    const { data, error, count } = await q.order('entry_date', { ascending: false }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw new JournalError(`Could not load journal entries: ${error.message}`, 500);
    const names = await userNames((data || []).map((j: any) => j.created_by));
    return { entries: (data || []).map((j: any) => shape(j, names)), total: count ?? (data || []).length, limit, offset };
}

/** Reverses a manual journal by posting a mirror entry dated `date` (default today). The original stays — audit trail. */
export async function reverseManualJournal(orgId: string, userId: string | null, id: string, date?: string) {
    const original = await getJournal(orgId, id);
    if (original.source_type !== 'MANUAL') throw new JournalError('Only manual journal entries can be reversed here.');
    return createManualJournal(orgId, userId, {
        date: date || new Date().toISOString().slice(0, 10),
        reference: original.journal_number,
        description: `Reversal of ${original.journal_number} — ${original.description}`,
        lines: original.lines.map((l: any) => ({ account_id: l.account_id, debit: l.credit || null, credit: l.debit || null, description: l.description })),
    });
}
