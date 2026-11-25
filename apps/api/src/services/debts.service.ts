import { supabase } from '../lib/supabase';
import { ensureAccount, postJournal } from './purchasing.service';
import { ledgerService } from './ledger.service';
import { releaseAllocationsIfNotReceivable } from './customerInvoice.service';
import { isPersonalOrgName } from './userPreferences.service';

/**
 * Debt tracking for personal workspaces: who you owe and who owes you, kept in the ledger.
 *
 * A transaction is TAGGED as part of a debt (loan received, repayment made, advance given, ...). The tag does two things: it points the transaction
 * at one of two ledger accounts (Debts I owe, a liability; Money owed to me, an asset) instead of income or expense, and it links it to a debt with a
 * person or a company. A debt's balance is then simply the total of its tagged transactions, so the list can never drift from the books.
 *
 * A company is another MoneyWise workspace the person also belongs to. Its side of the debt is not stored: the company's own debts page reads the
 * personal debts that name it and shows them the other way round.
 */

export class DebtError extends Error { constructor(message: string, readonly httpStatus = 400) { super(message); } }

export type Side = 'OWE' | 'OWED';
interface TagDef { key: string; label: string; hint: string; flow: 'IN' | 'OUT'; side: Side; sign: 1 | -1 }

/** Each tag: which way money moved, which side of a debt it belongs to, and whether it makes the debt bigger (+1) or smaller (-1). */
export const DEBT_TAGS: TagDef[] = [
    { key: 'LOAN_RECEIVED', label: 'Loan received', hint: 'Money you borrowed. You now owe it back.', flow: 'IN', side: 'OWE', sign: 1 },
    { key: 'ADVANCE_RECEIVED', label: 'Advance received', hint: 'Money paid to you ahead of work or a sale.', flow: 'IN', side: 'OWE', sign: 1 },
    { key: 'REPAID', label: 'Repayment made', hint: 'You paid back some of what you owe.', flow: 'OUT', side: 'OWE', sign: -1 },
    { key: 'LOAN_GIVEN', label: 'Loan given', hint: 'Money you lent. They owe it to you.', flow: 'OUT', side: 'OWED', sign: 1 },
    { key: 'ADVANCE_GIVEN', label: 'Advance given', hint: 'You paid something for them, like a company expense.', flow: 'OUT', side: 'OWED', sign: 1 },
    { key: 'REPAYMENT_RECEIVED', label: 'Repayment received', hint: 'They paid back some of what they owe you.', flow: 'IN', side: 'OWED', sign: -1 },
    { key: 'REIMBURSEMENT_RECEIVED', label: 'Reimbursement received', hint: 'A company paid you back for what you advanced.', flow: 'IN', side: 'OWED', sign: -1 },
];
const TAG = new Map(DEBT_TAGS.map((t) => [t.key, t]));
const r2 = (n: number) => Math.round(n * 100) / 100;
const clean = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const accountFor = (orgId: string, side: Side) => side === 'OWE'
    ? ensureAccount(orgId, 'DEBTS-OWED', 'Debts I owe', 'LIABILITY', 'Other Current Liabilities')
    : ensureAccount(orgId, 'DEBTS-OWED-TO-ME', 'Money owed to me', 'ASSET', 'Other Current Assets');

/** Personal by the stored flag, or by name: the same test the apps use (a workspace named "...Workspace" is personal even when the flag was never set). */
async function isPersonal(orgId: string): Promise<boolean> {
    const { data } = await supabase.from('organizations').select('is_personal, name').eq('id', orgId).maybeSingle();
    return data?.is_personal === true || isPersonalOrgName(data?.name);
}

/** The workspaces this person belongs to, other than the current one: the companies a debt can be with. */
export async function workspaces(userId: string, orgId: string) {
    const { data } = await supabase.from('user_organizations').select('organization_id, organizations(id, name, is_personal)').eq('user_id', userId).eq('status', 'ACTIVE');
    return (data ?? [])
        .map((r: any) => r.organizations)
        .filter((o: any) => o && o.id !== orgId && !o.is_personal && !isPersonalOrgName(o.name))
        .map((o: any) => ({ id: o.id as string, name: o.name as string }));
}

/** The tags that fit one transaction: money in takes the "in" tags, money out the "out" ones. */
export function tagsFor(entry: { debit?: unknown; credit?: unknown }) {
    const flow = Number(entry.debit || 0) >= Number(entry.credit || 0) ? 'IN' : 'OUT';
    return DEBT_TAGS.filter((t) => t.flow === flow);
}

const amountOf = (e: any) => r2(Math.abs(Number(e.debit || 0) - Number(e.credit || 0)));

async function balances(debtIds: string[]) {
    const out = new Map<string, { balance: number; entries: number; lastAt: string | null }>();
    if (!debtIds.length) return out;
    const { data } = await supabase.from('cashbook_entries').select('debt_id, debt_tag, debit, credit, date, status').in('debt_id', debtIds).range(0, 9999);
    for (const e of (data ?? []) as any[]) {
        if (e.status === 'PENDING') continue;
        const t = TAG.get(e.debt_tag); if (!t) continue;
        const cur = out.get(e.debt_id) ?? { balance: 0, entries: 0, lastAt: null };
        cur.balance = r2(cur.balance + t.sign * amountOf(e)); cur.entries++;
        if (!cur.lastAt || String(e.date) > cur.lastAt) cur.lastAt = String(e.date);
        out.set(e.debt_id, cur);
    }
    // Opening balances (a debt that began before the books did) count too. A database without the table yet simply has none.
    const { data: open, error: oe } = await supabase.from('debt_opening_balances').select('debt_id, amount, as_of').in('debt_id', debtIds);
    if (!oe) for (const o of (open ?? []) as any[]) {
        const cur = out.get(o.debt_id) ?? { balance: 0, entries: 0, lastAt: null };
        cur.balance = r2(cur.balance + Number(o.amount)); cur.entries++;
        if (!cur.lastAt || String(o.as_of) > cur.lastAt) cur.lastAt = String(o.as_of);
        out.set(o.debt_id, cur);
    }
    return out;
}

const shape = (d: any, b?: { balance: number; entries: number; lastAt: string | null }) => ({
    id: d.id as string, side: d.side as Side, type: d.counterparty_type as 'PERSON' | 'COMPANY', name: d.counterparty_name as string, orgId: (d.counterparty_org_id as string | null) ?? null,
    dueDate: (d.due_date as string | null) ?? null, note: (d.note as string | null) ?? null, balance: b?.balance ?? 0, entries: b?.entries ?? 0, lastAt: b?.lastAt ?? null,
    overdue: !!d.due_date && (b?.balance ?? 0) > 0.004 && String(d.due_date) < new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10),
});

/** Everything for the Debts page: what you owe, what you are owed, the totals, and (for a company workspace) what the people who belong to it have with it. */
export async function overview(orgId: string) {
    const { data } = await supabase.from('debts').select('*').eq('organization_id', orgId).order('counterparty_name');
    const rows = (data ?? []) as any[];
    const bal = await balances(rows.map((r) => r.id));
    const all = rows.map((r) => shape(r, bal.get(r.id)));
    const open = (side: Side) => all.filter((d) => d.side === side && d.balance > 0.004).sort((a, b) => b.balance - a.balance);
    const settled = all.filter((d) => d.balance <= 0.004 && d.entries > 0);
    const owe = open('OWE'), owed = open('OWED');
    const sum = (xs: { balance: number }[]) => r2(xs.reduce((s, d) => s + d.balance, 0));
    return { owe, owed, settled, totals: { owe: sum(owe), owed: sum(owed), net: r2(sum(owed) - sum(owe)) }, mirror: await mirrorFor(orgId) };
}

/**
 * The other side of a person's debts with this workspace, read from their personal workspaces and shown the other way round: when a member's
 * workspace says "the company owes me K639", the company sees "we owe them K639". Only counts a person who belongs to this workspace.
 */
export async function mirrorFor(orgId: string) {
    const { data: debts } = await supabase.from('debts').select('*').eq('counterparty_org_id', orgId).limit(500);
    const rows = (debts ?? []) as any[];
    if (!rows.length) return [];
    const { data: members } = await supabase.from('user_organizations').select('user_id').eq('organization_id', orgId).eq('status', 'ACTIVE');
    const memberIds = new Set((members ?? []).map((m: any) => m.user_id));
    const mine = rows.filter((d) => d.created_by && memberIds.has(d.created_by));
    const bal = await balances(mine.map((d) => d.id));
    const who = new Map<string, string>();
    const { data: orgs } = mine.length ? await supabase.from('organizations').select('id, name').in('id', [...new Set(mine.map((d) => d.organization_id))]) : { data: [] as any[] };
    for (const o of orgs ?? []) who.set((o as any).id, (o as any).name);
    return mine.map((d) => {
        const s = shape(d, bal.get(d.id));
        // Their OWED (the company owes them) is the company's OWE, and the other way round.
        return { ...s, side: (d.side === 'OWED' ? 'OWE' : 'OWED') as Side, name: who.get(d.organization_id) ?? 'A member’s workspace', mirror: true };
    }).filter((d) => d.balance > 0.004);
}

export async function detail(orgId: string, debtId: string) {
    const { data: d } = await supabase.from('debts').select('*').eq('organization_id', orgId).eq('id', debtId).maybeSingle();
    if (!d) throw new DebtError('Debt not found.', 404);
    const { data: es } = await supabase.from('cashbook_entries').select('id, date, description, debit, credit, debt_tag, status').eq('debt_id', debtId).order('date', { ascending: false }).range(0, 999);
    const bal = await balances([debtId]);
    const { data: opens } = await supabase.from('debt_opening_balances').select('id, amount, as_of, note').eq('debt_id', debtId);
    const openEntries = ((opens ?? []) as any[]).map((o) => ({ id: `open:${o.id}` as string, date: String(o.as_of).slice(0, 10), description: (o.note as string | null) || 'Opening balance', amount: r2(Number(o.amount)), tag: 'OPENING', label: 'Opening balance', increases: true }));
    const entries = ((es ?? []) as any[]).map((e) => ({ id: e.id as string, date: String(e.date).slice(0, 10), description: e.description as string, amount: amountOf(e), tag: e.debt_tag as string, label: TAG.get(e.debt_tag)?.label ?? e.debt_tag, increases: (TAG.get(e.debt_tag)?.sign ?? 1) > 0 }));
    return { debt: shape(d, bal.get(debtId)), entries: [...entries, ...openEntries].sort((a, b) => b.date.localeCompare(a.date)) };
}

export async function updateDebt(orgId: string, debtId: string, body: any) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body?.dueDate !== undefined) { const v = body.dueDate; if (v !== null && v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new DebtError('Enter the due date as a date.'); patch.due_date = v || null; }
    if (body?.note !== undefined) patch.note = clean(body.note, 300) || null;
    const { data, error } = await supabase.from('debts').update(patch).eq('organization_id', orgId).eq('id', debtId).select('id').maybeSingle();
    if (error || !data) throw new DebtError(error?.message ?? 'Debt not found.', error ? 500 : 404);
    return detail(orgId, debtId);
}

/**
 * Tag a transaction as part of a debt. Finds or starts the debt with that person or company, points the transaction at the debt's ledger account,
 * and reposts it, so it leaves income or expense. Tagging again moves it.
 */
export async function tagEntry(orgId: string, userId: string, body: any) {
    if (!(await isPersonal(orgId))) throw new DebtError('Debt tracking is for personal accounts.', 403);
    const entryId = String(body?.entryId ?? '');
    const tag = TAG.get(String(body?.tag ?? ''));
    if (!isUuid(entryId)) throw new DebtError('Choose a transaction.');
    if (!tag) throw new DebtError('Choose a tag.');
    const { data: e } = await supabase.from('cashbook_entries').select('id, organization_id, debit, credit, status, debt_id, entry_type').eq('id', entryId).eq('organization_id', orgId).maybeSingle();
    if (!e) throw new DebtError('Transaction not found.', 404);
    if (!tagsFor(e).some((t) => t.key === tag.key)) throw new DebtError(tag.flow === 'IN' ? `“${tag.label}” is for money that came in; this one went out.` : `“${tag.label}” is for money that went out; this one came in.`);

    // who the debt is with
    let name = clean(body?.counterpartyName, 80), companyOrgId: string | null = null, type: 'PERSON' | 'COMPANY' = 'PERSON';
    if (isUuid(body?.counterpartyOrgId)) {
        const mine = (await workspaces(userId, orgId)).find((w) => w.id === body.counterpartyOrgId);
        if (!mine) throw new DebtError('You can only pick a company you belong to.');
        companyOrgId = mine.id; name = mine.name; type = 'COMPANY';
    }
    let debtId: string | null = isUuid(body?.debtId) ? body.debtId : null;
    if (debtId) {
        const { data: d } = await supabase.from('debts').select('id, side').eq('organization_id', orgId).eq('id', debtId).maybeSingle();
        if (!d) throw new DebtError('Debt not found.', 404);
        if (d.side !== tag.side) throw new DebtError(tag.side === 'OWE' ? '“' + tag.label + '” belongs with money you owe, not money owed to you.' : '“' + tag.label + '” belongs with money owed to you, not money you owe.');
    } else {
        if (!name) throw new DebtError('Say who this is with.');
        const { data: found } = await supabase.from('debts').select('id').eq('organization_id', orgId).eq('side', tag.side).ilike('counterparty_name', name.replace(/[%_]/g, '\\$&')).maybeSingle();
        if (found) debtId = found.id;
        else {
            const { data: made, error } = await supabase.from('debts').insert({ organization_id: orgId, side: tag.side, counterparty_type: type, counterparty_name: name, counterparty_org_id: companyOrgId, created_by: userId }).select('id').single();
            if (error || !made) {
                const { data: again } = await supabase.from('debts').select('id').eq('organization_id', orgId).eq('side', tag.side).ilike('counterparty_name', name.replace(/[%_]/g, '\\$&')).maybeSingle();
                if (!again) throw new DebtError(error?.message ?? 'Could not start the debt.', 500);
                debtId = again.id;
            } else debtId = made.id;
        }
    }

    const accountId = await accountFor(orgId, tag.side);
    const { error: ue } = await supabase.from('cashbook_entries').update({ account_id: accountId, debt_id: debtId, debt_tag: tag.key, ...(e.status === 'UNACCOUNTED' ? { status: 'COMPLETED' } : {}) }).eq('id', entryId);
    if (ue) throw new DebtError(ue.message, 500);
    await releaseAllocationsIfNotReceivable(orgId, entryId, accountId).catch(() => undefined);
    await ledgerService.repostForCashbookEntry(entryId);
    return detail(orgId, debtId!);
}

/** Take the tag off: the transaction goes back to uncategorised and the debt's balance follows. */
export async function untagEntry(orgId: string, entryId: string) {
    if (!isUuid(entryId)) throw new DebtError('Choose a transaction.');
    const { data: e } = await supabase.from('cashbook_entries').select('id, debt_id').eq('id', entryId).eq('organization_id', orgId).maybeSingle();
    if (!e || !e.debt_id) throw new DebtError('That transaction isn’t tagged as a debt.', 404);
    const { error } = await supabase.from('cashbook_entries').update({ debt_id: null, debt_tag: null, account_id: null, status: 'UNACCOUNTED' }).eq('id', entryId);
    if (error) throw new DebtError(error.message, 500);
    await ledgerService.repostForCashbookEntry(entryId);
    return { ok: true };
}

/** Who a debt could be with: the people already used, and the workspaces this person belongs to. */
export async function counterparties(userId: string, orgId: string) {
    const { data } = await supabase.from('debts').select('id, side, counterparty_name, counterparty_org_id').eq('organization_id', orgId);
    return { people: [...new Map(((data ?? []) as any[]).filter((d) => !d.counterparty_org_id).map((d) => [d.counterparty_name.toLowerCase(), { name: d.counterparty_name as string }])).values()], companies: await workspaces(userId, orgId), debts: ((data ?? []) as any[]).map((d) => ({ id: d.id as string, side: d.side as Side, name: d.counterparty_name as string })) };
}

/** The debt with a person or company for one side, started if it is new. */
async function debtFor(orgId: string, userId: string, side: Side, name: string, companyOrgId: string | null): Promise<string> {
    const like = name.replace(/[%_]/g, '\\$&');
    const { data: found } = await supabase.from('debts').select('id').eq('organization_id', orgId).eq('side', side).ilike('counterparty_name', like).maybeSingle();
    if (found) return found.id;
    const { data: made, error } = await supabase.from('debts').insert({ organization_id: orgId, side, counterparty_type: companyOrgId ? 'COMPANY' : 'PERSON', counterparty_name: name, counterparty_org_id: companyOrgId, created_by: userId }).select('id').single();
    if (error || !made) {
        const { data: again } = await supabase.from('debts').select('id').eq('organization_id', orgId).eq('side', side).ilike('counterparty_name', like).maybeSingle();
        if (!again) throw new DebtError(error?.message ?? 'Could not start the debt.', 500);
        return again.id;
    }
    return made.id;
}

/**
 * A debt that began before the books did: an amount owed to or by a person or company, with no transaction behind it (an advance that was never
 * recorded here). It adds to the debt's balance and is posted to the ledger against Opening balance equity, so the books stay balanced. Passing a
 * source and source_id makes an import safe to repeat: the same one is never added twice.
 */
export async function recordOpening(orgId: string, userId: string, body: any) {
    if (!(await isPersonal(orgId))) throw new DebtError('Debt tracking is for personal accounts.', 403);
    const side: Side | null = body?.side === 'OWE' || body?.side === 'OWED' ? body.side : null;
    if (!side) throw new DebtError('Say whether you owe it or are owed it.');
    const amount = r2(Number(body?.amount));
    if (!(amount > 0) || amount > 1_000_000_000) throw new DebtError('Enter the amount.');
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.asOf ?? '')) ? String(body.asOf) : new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
    let name = clean(body?.counterpartyName, 80), companyOrgId: string | null = null;
    if (isUuid(body?.counterpartyOrgId)) {
        const mine = (await workspaces(userId, orgId)).find((w) => w.id === body.counterpartyOrgId);
        if (!mine) throw new DebtError('You can only pick a company you belong to.');
        companyOrgId = mine.id; name = mine.name;
    }
    if (!name) throw new DebtError('Say who this is with.');
    const source = body?.source ? clean(body.source, 40) : null, sourceId = isUuid(body?.sourceId) ? body.sourceId : null;
    if (source && sourceId) {
        const { data: same } = await supabase.from('debt_opening_balances').select('id, debt_id').eq('organization_id', orgId).eq('source', source).eq('source_id', sourceId).maybeSingle();
        if (same) return { ...(await detail(orgId, same.debt_id)), repeated: true };
    }
    const debtId = await debtFor(orgId, userId, side, name, companyOrgId);
    const { data: row, error } = await supabase.from('debt_opening_balances').insert({ organization_id: orgId, debt_id: debtId, amount, as_of: asOf, note: clean(body?.note, 200) || null, source, source_id: sourceId, created_by: userId }).select('id').single();
    if (error || !row) throw new DebtError(error?.message ?? 'Could not record it.', 500);
    try {
        const equity = await ensureAccount(orgId, 'OPENING-BAL-EQUITY', 'Opening balance equity', 'EQUITY', 'Owner Equity');
        const debtAcct = await accountFor(orgId, side);
        await postJournal(orgId, userId, asOf, `Opening balance: ${side === 'OWE' ? 'you owe' : 'owed by'} ${name}`, `DEBT-OPEN-${row.id.slice(0, 8)}`, 'OPENING', row.id,
            side === 'OWE' ? [{ accountId: equity, debit: amount, credit: 0 }, { accountId: debtAcct, debit: 0, credit: amount }] : [{ accountId: debtAcct, debit: amount, credit: 0 }, { accountId: equity, debit: 0, credit: amount }]);
    } catch (e: any) {
        await supabase.from('debt_opening_balances').delete().eq('id', row.id);
        throw new DebtError(e?.message ?? 'Could not post it to the books.', 500);
    }
    return detail(orgId, debtId);
}

/** Take an opening balance out again: its ledger posting goes with it. */
export async function removeOpening(orgId: string, openingId: string) {
    const id = String(openingId).replace(/^open:/, '');
    if (!isUuid(id)) throw new DebtError('Choose an opening balance.');
    const { data: row } = await supabase.from('debt_opening_balances').select('id').eq('id', id).eq('organization_id', orgId).maybeSingle();
    if (!row) throw new DebtError('That opening balance wasn’t found.', 404);
    await supabase.from('journal_entries').delete().eq('organization_id', orgId).eq('source_type', 'OPENING').eq('source_id', id);
    const { error } = await supabase.from('debt_opening_balances').delete().eq('id', id);
    if (error) throw new DebtError(error.message, 500);
    return { ok: true };
}
