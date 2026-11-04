import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { loadAccounts } from './accounting.service';

/**
 * What an accountant needs around the books: locking a period, journal entries made by hand (and reversed, never edited),
 * the cash flow statement and who owes you money. Enterprise plan; the route enforces that.
 */

export class ControlsError extends Error { constructor(message: string, readonly httpStatus = 400) { super(message); } }

const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const audit = (entityType: string, entityId: string, action: string, userId: string, changes: any) =>
    supabase.from('audit_logs').insert({ entity_type: entityType, entity_id: entityId, action, user_id: userId, changes }).then(() => undefined, () => undefined);

// ---------- locking ----------

export async function getLock(orgId: string): Promise<{ lockedThrough: string | null }> {
    const { data } = await supabase.from('accounting_settings').select('locked_through').eq('organization_id', orgId).maybeSingle();
    return { lockedThrough: data?.locked_through ?? null };
}

export async function setLock(orgId: string, userId: string, date: string | null) {
    if (date !== null && !isDate(date)) throw new ControlsError('Choose a valid date.');
    if (date && date > today()) throw new ControlsError('You can only lock up to today.');
    const before = (await getLock(orgId)).lockedThrough;
    const { error } = await supabase.from('accounting_settings').upsert({ organization_id: orgId, locked_through: date, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' });
    if (error) throw new ControlsError(error.message, 500);
    await audit('ACCOUNTING_LOCK', orgId, date ? 'LOCKED' : 'UNLOCKED', userId, { from: before, to: date });
    return { lockedThrough: date };
}

async function assertOpen(orgId: string, date: string) {
    const { lockedThrough } = await getLock(orgId);
    if (lockedThrough && date <= lockedThrough) throw new ControlsError(`The books are locked through ${lockedThrough}. Choose a later date, or unlock the period first.`);
}

// ---------- journals ----------

export async function listJournals(orgId: string, from: string | null, to: string | null, search?: string) {
    let q = supabase.from('journal_entries').select('id, entry_date, description, reference_number, source_type, created_at, journal_lines(debit, credit, description, accounts(code, name))')
        .eq('organization_id', orgId).order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(300);
    if (from) q = q.gte('entry_date', from);
    if (to) q = q.lte('entry_date', to);
    if (search && search.trim()) q = q.or(`description.ilike.%${search.trim().replace(/[%,()]/g, '')}%,reference_number.ilike.%${search.trim().replace(/[%,()]/g, '')}%`);
    const { data, error } = await q;
    if (error) throw new ControlsError(error.message, 500);
    const rows = (data ?? []) as any[];
    const reversed = new Set(rows.filter((r) => String(r.reference_number ?? '').startsWith('REV-')).map((r) => String(r.reference_number).slice(4)));
    return rows.map((r) => ({ ...r, reversible: r.source_type === 'MANUAL' && !String(r.reference_number ?? '').startsWith('REV-') && !reversed.has(r.id) }));
}

interface JournalLineIn { accountId?: string; debit?: number; credit?: number; memo?: string }

async function validateLines(orgId: string, raw: JournalLineIn[]) {
    if (!Array.isArray(raw) || raw.length < 2) throw new ControlsError('A journal needs at least two lines.');
    if (raw.length > 100) throw new ControlsError('A journal can have up to 100 lines.');
    const accts = await loadAccounts(orgId);
    const lines = raw.map((l, i) => {
        const debit = r2(Number(l.debit) || 0), credit = r2(Number(l.credit) || 0);
        if (!l.accountId || !accts.has(l.accountId)) throw new ControlsError(`Line ${i + 1}: choose an account.`);
        if (debit < 0 || credit < 0) throw new ControlsError(`Line ${i + 1}: amounts can't be negative.`);
        if ((debit > 0) === (credit > 0)) throw new ControlsError(`Line ${i + 1}: enter either a debit or a credit, not both and not neither.`);
        return { accountId: l.accountId, debit, credit, memo: String(l.memo ?? '').slice(0, 200) || null };
    });
    const d = r2(lines.reduce((s, l) => s + l.debit, 0)), c = r2(lines.reduce((s, l) => s + l.credit, 0));
    if (Math.abs(d - c) >= 0.01) throw new ControlsError(`The journal doesn't balance: debits ${d.toFixed(2)}, credits ${c.toFixed(2)}.`);
    return lines;
}

async function insertJournal(orgId: string, userId: string, date: string, memo: string, ref: string, lines: { accountId: string; debit: number; credit: number; memo: string | null }[]) {
    const { data: je, error } = await supabase.from('journal_entries').insert({ organization_id: orgId, entry_date: date, description: memo, reference_number: ref, source_type: 'MANUAL', source_id: randomUUID(), created_by: userId }).select('id').single();
    if (error || !je) throw new ControlsError(error?.message ?? 'Could not post the journal.', 500);
    const { error: le } = await supabase.from('journal_lines').insert(lines.map((l) => ({ journal_entry_id: je.id, account_id: l.accountId, debit: l.debit, credit: l.credit, description: l.memo })));
    if (le) { await supabase.from('journal_entries').delete().eq('id', je.id); throw new ControlsError(le.message, 500); }
    return je.id as string;
}

export async function createJournal(orgId: string, userId: string, body: any) {
    const date = isDate(body?.date) ? body.date : today();
    const memo = String(body?.memo ?? '').trim().slice(0, 300);
    if (!memo) throw new ControlsError('Add a description so the entry can be understood later.');
    await assertOpen(orgId, date);
    const lines = await validateLines(orgId, body?.lines);
    const ref = `JNL-${Date.now().toString(36).toUpperCase()}`;
    const id = await insertJournal(orgId, userId, date, memo, ref, lines);
    await audit('JOURNAL', id, 'CREATED', userId, { date, memo, ref, lines: lines.length });
    return { id, reference: ref };
}

/** A posted entry is never edited. To correct one, reverse it (every line swapped) and post the right one. */
export async function reverseJournal(orgId: string, userId: string, id: string, body: any) {
    const { data: je } = await supabase.from('journal_entries').select('id, entry_date, description, reference_number, source_type, journal_lines(account_id, debit, credit, description)').eq('organization_id', orgId).eq('id', id).maybeSingle();
    if (!je) throw new ControlsError('Entry not found.', 404);
    if (je.source_type !== 'MANUAL') throw new ControlsError('Only journals made by hand can be reversed here. Entries from the cashbook, invoices or bills are corrected where they were made.');
    if (String(je.reference_number ?? '').startsWith('REV-')) throw new ControlsError('That is already a reversal.');
    const { data: prior } = await supabase.from('journal_entries').select('id').eq('organization_id', orgId).eq('reference_number', `REV-${je.id}`).maybeSingle();
    if (prior) throw new ControlsError('This entry has already been reversed.');
    const date = isDate(body?.date) ? body.date : today();
    await assertOpen(orgId, date);
    const lines = ((je as any).journal_lines ?? []).map((l: any) => ({ accountId: l.account_id, debit: Number(l.credit), credit: Number(l.debit), memo: l.description ?? null }));
    const newId = await insertJournal(orgId, userId, date, `Reversal of ${je.reference_number ?? ''} ${je.description ?? ''}`.trim().slice(0, 300), `REV-${je.id}`, lines);
    await audit('JOURNAL', newId, 'REVERSED', userId, { original: je.id, date });
    return { id: newId };
}

// ---------- cash flow ----------

const CASH = /(bank|wallet|cash|savings)/i;

/** Where the cash came from and went, from the ledger: each non-cash line of an entry that touched a bank or wallet account says why cash moved. */
export async function cashFlow(orgId: string, from: string | null, to: string | null) {
    const accts = await loadAccounts(orgId);
    const [{ data: eff, error }, { data: openBal }, { data: closeBal }] = await Promise.all([
        supabase.rpc('accounting_cash_effects', { p_org: orgId, p_from: from, p_to: to }).range(0, 9999),
        from ? supabase.rpc('accounting_balances', { p_org: orgId, p_from: null, p_to: new Date(Date.parse(from) - 86_400_000).toISOString().slice(0, 10) }).range(0, 9999) : Promise.resolve({ data: [] as any[] }),
        supabase.rpc('accounting_balances', { p_org: orgId, p_from: null, p_to: to }).range(0, 9999),
    ]);
    if (error) throw new ControlsError(`Could not read the ledger (${error.message}). Has the controls migration been applied?`, 500);
    const cashTotal = (rows: any[] | null) => r2((rows ?? []).reduce((s, r) => { const a = accts.get(r.account_id); return a && a.type === 'ASSET' && CASH.test(a.subtype ?? '') ? s + Number(r.debit) - Number(r.credit) : s; }, 0));

    type L = { accountId: string; name: string; amount: number };
    const groups: Record<'operating' | 'investing' | 'financing' | 'other', Map<string, L[]>> = { operating: new Map(), investing: new Map(), financing: new Map(), other: new Map() };
    for (const r of (eff ?? []) as any[]) {
        const a = accts.get(r.account_id); const amount = r2(Number(r.effect));
        if (!a || amount === 0) continue;
        const sub = a.subtype ?? a.type;
        const suspense = /suspense|uncategor|^SYS-/i.test(`${a.code ?? ''} ${a.name}`);
        let section: keyof typeof groups, label: string;
        if (suspense) { section = 'other'; label = 'Uncategorised movements'; }
        else if (a.type === 'INCOME') { section = 'operating'; label = 'Money received from sales and income'; }
        else if (a.type === 'EXPENSE') { section = 'operating'; label = 'Money paid for costs and expenses'; }
        else if (a.type === 'ASSET' && /fixed/i.test(sub)) { section = 'investing'; label = 'Equipment and property'; }
        else if (a.type === 'ASSET') { section = 'operating'; label = `Changes in ${sub.toLowerCase()}`; }
        else if (a.type === 'LIABILITY' && /long/i.test(sub)) { section = 'financing'; label = 'Long-term loans'; }
        else if (a.type === 'LIABILITY') { section = 'operating'; label = `Changes in ${sub.toLowerCase()}`; }
        else { section = 'financing'; label = 'Owners’ capital and drawings'; }
        const list = groups[section].get(label) ?? []; list.push({ accountId: a.id, name: a.name, amount }); groups[section].set(label, list);
    }
    const shape = (m: Map<string, L[]>) => [...m].map(([name, lines]) => ({ name, lines: lines.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount)), total: r2(lines.reduce((s, l) => s + l.amount, 0)) }));
    const sec = (k: keyof typeof groups) => { const g = shape(groups[k]); return { groups: g, total: r2(g.reduce((s, x) => s + x.total, 0)) }; };
    const operating = sec('operating'), investing = sec('investing'), financing = sec('financing'), other = sec('other');
    const opening = from ? cashTotal(openBal as any[]) : 0, closing = cashTotal(closeBal as any[]);
    const net = r2(operating.total + investing.total + financing.total + other.total);
    return { from, to, operating, investing, financing, other, netChange: net, openingCash: opening, closingCash: closing, reconciles: Math.abs(opening + net - closing) < 0.01 };
}

// ---------- receivables ----------

/** Customer invoices still unpaid, by how late they are. An invoice is due on its follow-up date, or 30 days after it was issued. */
export async function receivablesAgeing(orgId: string) {
    const { data } = await supabase.from('customer_invoices').select('id, invoice_number, customer_id, customer_name, issue_date, follow_up_date, total, amount_paid, status, voided_at').eq('organization_id', orgId).in('status', ['OPEN', 'PARTIAL']).is('voided_at', null).range(0, 49999);
    const now = Date.parse(today());
    const keys = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const;
    const by = new Map<string, any>();
    for (const i of (data ?? []) as any[]) {
        const open = r2(Number(i.total) - Number(i.amount_paid)); if (open <= 0) continue;
        const due = i.follow_up_date ?? new Date(Date.parse(i.issue_date) + 30 * 86_400_000).toISOString().slice(0, 10);
        const late = Math.floor((now - Date.parse(due)) / 86_400_000);
        const k = late <= 0 ? 'current' : late <= 30 ? 'd1_30' : late <= 60 ? 'd31_60' : late <= 90 ? 'd61_90' : 'd90_plus';
        const key = i.customer_id ?? i.customer_name ?? 'unknown';
        const x = by.get(key) ?? { customerId: i.customer_id, customer: i.customer_name ?? 'Customer', current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
        x[k] = r2(x[k] + open); x.total = r2(x.total + open); by.set(key, x);
    }
    const rows = [...by.values()].sort((a, b) => b.total - a.total);
    const totals: Record<string, number> = { total: 0 }; for (const k of keys) totals[k] = 0;
    for (const r of rows) { for (const k of keys) totals[k] = r2(totals[k] + r[k]); totals.total = r2(totals.total + r.total); }
    return { rows, totals };
}
