import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { loadAccounts, Acct } from './accounting.service';

/**
 * Brings books in from other software (QuickBooks, Sage, Xero or any spreadsheet) as CSV. Three kinds:
 *   accounts : the chart of accounts
 *   opening  : a trial balance, posted as one opening-balances entry on a chosen date
 *   journals : the transactions (journal report), posted entry by entry
 * Every import is first run as a preview that changes nothing and lists what would happen and what is wrong. A committed import is tagged
 * with a batch id so it can be undone. Columns are found by their usual names in each package's exports, so people don't have to rearrange files.
 */

export type ImportKind = 'accounts' | 'opening' | 'journals';
export type ImportSource = 'quickbooks' | 'sage' | 'xero' | 'csv';
type DateOrder = 'dmy' | 'mdy' | 'ymd';
export interface ImportRequest { kind: ImportKind; source: ImportSource; csv: string; dateOrder?: DateOrder; asOf?: string; plugDifference?: boolean; commit?: boolean }
export interface ImportResult {
    ok: boolean; committed: boolean; batchId?: string; summary: string[]; sample: Record<string, any>[]; errors: string[]; warnings: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const MAX_ROWS = 50_000;

/** A small CSV reader that handles quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [], cell = '', q = false;
    const src = text.replace(/^﻿/, '');
    const comma = (src.split('\n')[0].match(/;/g)?.length ?? 0) > (src.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
        else if (c === '"') q = true;
        else if (c === comma) { row.push(cell); cell = ''; }
        else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
        else cell += c;
        if (rows.length > MAX_ROWS) throw new Error(`That file has more than ${MAX_ROWS.toLocaleString()} rows. Split it by year and import each part.`);
    }
    row.push(cell); if (row.some((x) => x.trim() !== '')) rows.push(row);
    return rows;
}

const ALIASES: Record<string, string[]> = {
    code: ['code', 'accountcode', 'accountnumber', 'number', 'accountno', 'acno', 'nominalcode', 'nominal', 'acct', 'accountid'],
    name: ['name', 'accountname', 'account', 'accountdescription', 'description', 'nominalname', 'fullname'],
    type: ['type', 'accounttype', 'category', 'class', 'classification', 'detailtype'],
    date: ['date', 'transactiondate', 'entrydate', 'postingdate', 'txndate'],
    ref: ['num', 'number', 'ref', 'reference', 'journalno', 'journalnumber', 'journalid', 'entryno', 'transactionno', 'no', 'docno', 'jnl'],
    memo: ['memo', 'description', 'narration', 'details', 'memodescription', 'note', 'notes', 'comment', 'transactiondescription'],
    debit: ['debit', 'debits', 'dr', 'debitamount'],
    credit: ['credit', 'credits', 'cr', 'creditamount'],
    balance: ['balance', 'amount', 'closingbalance', 'netbalance'],
};

function columns(header: string[]) {
    const idx = header.map(norm);
    const find = (key: string, skip: number[] = []) => {
        for (const a of ALIASES[key]) { const i = idx.findIndex((h, n) => h === a && !skip.includes(n)); if (i >= 0) return i; }
        return -1;
    };
    return find;
}

export function money(raw: unknown): number | null {
    let s = String(raw ?? '').trim();
    if (!s) return null;
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /cr$/i.test(s);
    s = s.replace(/[^0-9.,]/g, '');
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes(',') && /,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return neg ? -n : n;
}

export function parseDate(raw: string, order: DateOrder): string | null {
    const s = raw.trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    let y: number, mo: number, d: number;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
        let a = +m[1], b = +m[2]; y = +m[3]; if (y < 100) y += 2000;
        if (a > 12) { d = a; mo = b; } else if (b > 12) { mo = a; d = b; } else if (order === 'mdy') { mo = a; d = b; } else { d = a; mo = b; }
    } else { const t = Date.parse(s); if (Number.isNaN(t)) return null; const dt = new Date(t); return dt.toISOString().slice(0, 10); }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Works out the MoneyWise account type from the wording used by QuickBooks, Sage, Xero and others. */
export function mapType(raw: string): { type: string; subtype: string } | null {
    const t = raw.toLowerCase();
    const sub = raw.trim() || 'Imported';
    if (/receivable|debtor/.test(t)) return { type: 'ASSET', subtype: 'Accounts Receivable' };
    if (/payable|creditor|liabilit|credit card|loan|\bvat\b|tax payable/.test(t)) return { type: 'LIABILITY', subtype: sub };
    if (/equity|capital|reserve|retained|drawing|share/.test(t)) return { type: 'EQUITY', subtype: 'Equity' };
    if (/cost of (goods|sales)|cogs|direct cost/.test(t)) return { type: 'EXPENSE', subtype: 'Cost of Goods Sold' };
    if (/expense|overhead|purchase|depreciation/.test(t)) return { type: 'EXPENSE', subtype: 'Expense' };
    if (/income|revenue|sales|turnover/.test(t)) return { type: 'INCOME', subtype: /other/.test(t) ? 'Other Income' : 'Income' };
    if (/asset|bank|cash|inventory|stock|prepay|deposit|current|fixed/.test(t)) return { type: 'ASSET', subtype: /fixed/.test(t) ? 'Fixed Asset' : /bank|cash/.test(t) ? 'Bank' : sub };
    return null;
}

const BATCH_REF = (batch: string) => `IMP-${batch.slice(0, 8)}`;

interface Resolver { byCode: Map<string, Acct>; byName: Map<string, Acct> }
const resolverOf = (accts: Map<string, Acct>): Resolver => {
    const byCode = new Map<string, Acct>(), byName = new Map<string, Acct>();
    for (const a of accts.values()) { if (a.code) byCode.set(a.code.trim().toLowerCase(), a); byName.set(a.name.trim().toLowerCase(), a); }
    return { byCode, byName };
};
const lookup = (r: Resolver, code: string, name: string) => {
    const c = code.trim().toLowerCase(), n = name.trim().toLowerCase();
    return (c && r.byCode.get(c)) || (n && r.byName.get(n)) || (c && r.byName.get(c)) || (n && r.byCode.get(n)) || null;
};

function blank(): ImportResult { return { ok: true, committed: false, summary: [], sample: [], errors: [], warnings: [] }; }

export async function runImport(orgId: string, userId: string, req: ImportRequest): Promise<ImportResult> {
    const res = blank();
    const order: DateOrder = req.dateOrder ?? (req.source === 'quickbooks' ? 'mdy' : 'dmy');
    const table = parseCsv(String(req.csv ?? ''));
    if (table.length < 2) { res.ok = false; res.errors.push('The file is empty, or has only a header row.'); return res; }

    // The header is the first row that has at least two recognisable column names (exports often start with a title).
    let h = 0;
    for (let i = 0; i < Math.min(table.length, 12); i++) { const idx = table[i].map(norm); if (idx.filter((x) => Object.values(ALIASES).some((al) => al.includes(x))).length >= 2) { h = i; break; } }
    const header = table[h], body = table.slice(h + 1);
    const find = columns(header);
    const batch = randomUUID();

    if (req.kind === 'accounts') return importAccounts(orgId, req, body, header, find, batch, res);
    if (req.kind === 'opening') return importOpening(orgId, userId, req, body, find, batch, res, order);
    if (req.kind === 'journals') return importJournals(orgId, userId, req, body, find, batch, res, order);
    res.ok = false; res.errors.push('Unknown import type.'); return res;
}

async function importAccounts(orgId: string, req: ImportRequest, body: string[][], _header: string[], find: ReturnType<typeof columns>, batch: string, res: ImportResult) {
    const cCode = find('code'), cName = find('name', []), cType = find('type');
    if (cName < 0 || cType < 0) { res.ok = false; res.errors.push('I need a column for the account name and one for the account type.'); return res; }
    const existing = resolverOf(await loadAccounts(orgId));
    const toCreate: { code: string | null; name: string; type: string; subtype: string }[] = [];
    let skipped = 0;
    body.forEach((row, i) => {
        const name = (row[cName] ?? '').trim(), rawType = (row[cType] ?? '').trim(), code = cCode >= 0 && cCode !== cName ? (row[cCode] ?? '').trim() : '';
        if (!name) return;
        if (lookup(existing, code, name)) { skipped++; return; }
        const t = mapType(rawType);
        if (!t) { res.errors.push(`Row ${i + 2}: can’t tell what kind of account “${rawType || '(blank)'}” is for “${name}”.`); return; }
        toCreate.push({ code: code || null, name, ...t });
    });
    res.summary.push(`${toCreate.length} new accounts`, `${skipped} already in MoneyWise (left as they are)`);
    res.sample = toCreate.slice(0, 15);
    if (res.errors.length) res.ok = false;
    if (!req.commit || !res.ok) return res;

    // Accounts that came without a number get one that can't clash with an existing code.
    const used = new Set([...existing.byCode.keys()]);
    let n = 9000;
    const rows = toCreate.map((a) => {
        let code = a.code;
        if (!code || used.has(code.toLowerCase())) { do { code = `X${++n}`; } while (used.has(code.toLowerCase())); }
        used.add(code.toLowerCase());
        return { organization_id: orgId, code, name: a.name, type: a.type, subtype: a.subtype, is_active: true, description: `Imported from ${req.source} (${BATCH_REF(batch)})` };
    });
    for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from('accounts').insert(rows.slice(i, i + 200));
        if (error) { res.ok = false; res.errors.push(`Stopped after ${i} accounts: ${error.message}. Use Undo for this import to clean up.`); res.batchId = BATCH_REF(batch); res.committed = true; return res; }
    }
    res.committed = true; res.batchId = BATCH_REF(batch);
    return res;
}

/** Turns signed or two-column amounts into a debit/credit pair. */
function sides(row: string[], cDebit: number, cCredit: number, cBalance: number): { debit: number; credit: number } | null {
    if (cDebit >= 0 || cCredit >= 0) {
        const d = money(row[cDebit]) ?? 0, c = money(row[cCredit]) ?? 0;
        if (d < 0 || c < 0) return { debit: d < 0 ? 0 : d + (c < 0 ? -c : 0), credit: c < 0 ? 0 : c + (d < 0 ? -d : 0) };
        return { debit: d, credit: c };
    }
    if (cBalance >= 0) { const b = money(row[cBalance]); if (b == null) return null; return b >= 0 ? { debit: b, credit: 0 } : { debit: 0, credit: -b }; }
    return null;
}

async function postEntries(orgId: string, userId: string, source: ImportSource, batch: string, entries: { date: string; ref: string; memo: string; lines: { accountId: string; debit: number; credit: number; memo: string }[] }[], res: ImportResult) {
    let done = 0;
    for (let i = 0; i < entries.length; i += 100) {
        const chunk = entries.slice(i, i + 100);
        const heads = chunk.map((e, k) => ({ organization_id: orgId, entry_date: e.date, description: e.memo || `Imported from ${source}`, reference_number: `${BATCH_REF(batch)}-${i + k + 1}`, source_type: 'IMPORT', source_id: randomUUID(), created_by: userId }));
        const { data: made, error } = await supabase.from('journal_entries').insert(heads).select('id, reference_number');
        if (error || !made) { res.ok = false; res.errors.push(`Stopped after ${done} entries: ${error?.message}. Use Undo for this import to clean up.`); break; }
        const idOf = new Map(made.map((m: any) => [m.reference_number, m.id]));
        // One insert per entry so the database's balance check sees each entry's lines together.
        for (let k = 0; k < chunk.length; k++) {
            const jid = idOf.get(heads[k].reference_number);
            const { error: le } = await supabase.from('journal_lines').insert(chunk[k].lines.map((l) => ({ journal_entry_id: jid, account_id: l.accountId, debit: l.debit, credit: l.credit, description: l.memo || null })));
            if (le) { await supabase.from('journal_entries').delete().eq('id', jid); res.ok = false; res.errors.push(`Entry ${i + k + 1} was refused: ${le.message}`); }
            else done++;
        }
    }
    res.committed = true; res.batchId = BATCH_REF(batch);
    res.summary.push(`${done} entries posted`);
}

async function importOpening(orgId: string, userId: string, req: ImportRequest, body: string[][], find: ReturnType<typeof columns>, batch: string, res: ImportResult, _order: DateOrder) {
    const asOf = req.asOf && /^\d{4}-\d{2}-\d{2}$/.test(req.asOf) ? req.asOf : null;
    if (!asOf) { res.ok = false; res.errors.push('Choose the date these opening balances are as at.'); return res; }
    const cCode = find('code'), cName = find('name'), cDebit = find('debit'), cCredit = find('credit'), cBal = find('balance');
    if (cCode < 0 && cName < 0) { res.ok = false; res.errors.push('I need a column with the account name or code.'); return res; }
    const accts = await loadAccounts(orgId), rs = resolverOf(accts);
    const lines: { accountId: string; debit: number; credit: number; memo: string }[] = [];
    body.forEach((row, i) => {
        const code = cCode >= 0 ? (row[cCode] ?? '') : '', name = cName >= 0 && cName !== cCode ? (row[cName] ?? '') : '';
        if (!code.trim() && !name.trim()) return;
        if (/^total/i.test((name || code).trim())) return;
        const amt = sides(row, cDebit, cCredit, cBal);
        if (!amt || (amt.debit === 0 && amt.credit === 0)) return;
        const a = lookup(rs, code, name);
        if (!a) { res.errors.push(`Row ${i + 2}: no account matches “${name || code}”. Import the chart of accounts first.`); return; }
        lines.push({ accountId: a.id, debit: r2(amt.debit), credit: r2(amt.credit), memo: 'Opening balance' });
    });
    const debit = r2(lines.reduce((s, l) => s + l.debit, 0)), credit = r2(lines.reduce((s, l) => s + l.credit, 0)), diff = r2(debit - credit);
    res.summary.push(`${lines.length} accounts`, `Debits ${debit.toFixed(2)}, credits ${credit.toFixed(2)}`);
    res.sample = lines.slice(0, 15).map((l) => ({ account: accts.get(l.accountId)?.name, debit: l.debit, credit: l.credit }));
    if (Math.abs(diff) >= 0.01) {
        if (req.plugDifference) res.warnings.push(`Out of balance by ${Math.abs(diff).toFixed(2)}. The difference will be put in “Opening Balance Equity”.`);
        else res.errors.push(`The balances are out of balance by ${Math.abs(diff).toFixed(2)} (debits ${debit.toFixed(2)}, credits ${credit.toFixed(2)}). Fix the file, or tick the option to put the difference in Opening Balance Equity.`);
    }
    if (!lines.length) res.errors.push('No balances found in the file.');
    if (res.errors.length) res.ok = false;
    if (!req.commit || !res.ok) return res;

    if (Math.abs(diff) >= 0.01) {
        let plug = [...accts.values()].find((a) => a.name.toLowerCase() === 'opening balance equity');
        if (!plug) {
            const { data } = await supabase.from('accounts').insert({ organization_id: orgId, code: 'OBE', name: 'Opening Balance Equity', type: 'EQUITY', subtype: 'Equity', is_active: true, description: `Created by an import (${BATCH_REF(batch)})` }).select('id, code, name, type, subtype').single();
            plug = data as Acct | undefined;
        }
        if (!plug) { res.ok = false; res.errors.push('Could not create Opening Balance Equity.'); return res; }
        lines.push({ accountId: plug.id, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, memo: 'Opening balance difference' });
    }
    await postEntries(orgId, userId, req.source, batch, [{ date: asOf, ref: '', memo: `Opening balances (${req.source})`, lines }], res);
    return res;
}

async function importJournals(orgId: string, userId: string, req: ImportRequest, body: string[][], find: ReturnType<typeof columns>, batch: string, res: ImportResult, order: DateOrder) {
    const cDate = find('date'), cRef = find('ref'), cMemo = find('memo'), cDebit = find('debit'), cCredit = find('credit'), cBal = find('balance');
    let cCode = find('code'), cName = find('name');
    if (cName === cMemo) cName = -1;
    if (cCode === cRef) cCode = -1;
    if (cDate < 0 || (cDebit < 0 && cCredit < 0 && cBal < 0) || (cName < 0 && cCode < 0)) { res.ok = false; res.errors.push('I need columns for the date, the account and the debit and credit amounts.'); return res; }
    const accts = await loadAccounts(orgId), rs = resolverOf(accts);

    // Continuation lines leave the date and number blank (QuickBooks does this), so they inherit the previous line's.
    const groups = new Map<string, { date: string; memo: string; lines: { accountId: string; debit: number; credit: number; memo: string }[]; firstRow: number }>();
    let lastDate: string | null = null, lastRef = '';
    body.forEach((row, i) => {
        const rawDate = (row[cDate] ?? '').trim();
        const code = cCode >= 0 ? (row[cCode] ?? '') : '', name = cName >= 0 ? (row[cName] ?? '') : '';
        if (!rawDate && !code.trim() && !name.trim()) return;
        if (/^total/i.test((name || code || rawDate).trim())) return;
        if (rawDate) { const d = parseDate(rawDate, order); if (!d) { res.errors.push(`Row ${i + 2}: can’t read the date “${rawDate}”.`); return; } lastDate = d; if (cRef >= 0 && (row[cRef] ?? '').trim()) lastRef = row[cRef].trim(); }
        if (!lastDate) return;
        const amt = sides(row, cDebit, cCredit, cBal);
        if (!amt || (amt.debit === 0 && amt.credit === 0)) return;
        const a = lookup(rs, code, name);
        if (!a) { res.errors.push(`Row ${i + 2}: no account matches “${name || code}”. Import the chart of accounts first.`); return; }
        const key = cRef >= 0 && lastRef ? `${lastRef}|${lastDate}` : `${lastDate}|${i}`;
        const g = groups.get(key) ?? { date: lastDate, memo: cMemo >= 0 ? (row[cMemo] ?? '').trim().slice(0, 200) : '', lines: [], firstRow: i + 2 };
        g.lines.push({ accountId: a.id, debit: r2(amt.debit), credit: r2(amt.credit), memo: cMemo >= 0 ? (row[cMemo] ?? '').trim().slice(0, 200) : '' });
        groups.set(key, g);
    });
    if (cRef < 0) res.warnings.push('There is no entry-number column, so each line is its own entry only if the file balances line by line. Add an entry number to group lines.');

    const entries = [...groups.values()].filter((g) => {
        const d = r2(g.lines.reduce((s, l) => s + l.debit, 0)), c = r2(g.lines.reduce((s, l) => s + l.credit, 0));
        if (Math.abs(d - c) >= 0.01) { res.errors.push(`Entry starting at row ${g.firstRow} (${g.date}) doesn’t balance: debits ${d.toFixed(2)}, credits ${c.toFixed(2)}.`); return false; }
        return g.lines.length >= 2;
    }).map((g) => ({ date: g.date, ref: '', memo: g.memo, lines: g.lines }));
    const dates = entries.map((e) => e.date).sort();
    res.summary.push(`${entries.length} entries`, dates.length ? `From ${dates[0]} to ${dates[dates.length - 1]}` : 'No dates found');
    res.sample = entries.slice(0, 8).map((e) => ({ date: e.date, memo: e.memo, lines: e.lines.length, amount: r2(e.lines.reduce((s, l) => s + l.debit, 0)) }));
    if (!entries.length) res.errors.push('No postable entries found.');
    if (res.errors.length) res.ok = false;
    if (!req.commit || !res.ok) return res;
    await postEntries(orgId, userId, req.source, batch, entries, res);
    return res;
}

export async function listBatches(orgId: string) {
    const { data } = await supabase.from('journal_entries').select('reference_number, entry_date, created_at').eq('organization_id', orgId).eq('source_type', 'IMPORT').order('created_at', { ascending: false }).range(0, 9999);
    const m = new Map<string, { batch: string; entries: number; createdAt: string; from: string; to: string }>();
    for (const r of (data ?? []) as any[]) {
        const b = String(r.reference_number).split('-').slice(0, 2).join('-');
        const x = m.get(b) ?? { batch: b, entries: 0, createdAt: r.created_at, from: r.entry_date, to: r.entry_date };
        x.entries++; if (r.entry_date < x.from) x.from = r.entry_date; if (r.entry_date > x.to) x.to = r.entry_date;
        m.set(b, x);
    }
    return [...m.values()];
}

/** Removes everything one import created: its journal entries, then any accounts it added that nothing uses. */
export async function undoBatch(orgId: string, batch: string) {
    if (!/^IMP-[0-9a-f]{8}$/.test(batch)) throw new Error('Unknown import');
    const { data: heads } = await supabase.from('journal_entries').select('id').eq('organization_id', orgId).eq('source_type', 'IMPORT').like('reference_number', `${batch}-%`).range(0, 49999);
    const ids = (heads ?? []).map((h: any) => h.id);
    for (let i = 0; i < ids.length; i += 200) {
        await supabase.from('journal_lines').delete().in('journal_entry_id', ids.slice(i, i + 200));
        await supabase.from('journal_entries').delete().in('id', ids.slice(i, i + 200));
    }
    const { data: made } = await supabase.from('accounts').select('id').eq('organization_id', orgId).like('description', `%(${batch})`);
    let removed = 0;
    for (const a of made ?? []) {
        const { count } = await supabase.from('journal_lines').select('id', { count: 'exact', head: true }).eq('account_id', a.id);
        if (!count) { const { error } = await supabase.from('accounts').delete().eq('id', a.id); if (!error) removed++; }
    }
    return { entriesRemoved: ids.length, accountsRemoved: removed };
}
