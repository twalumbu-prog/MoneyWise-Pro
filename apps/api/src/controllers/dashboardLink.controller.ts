/**
 * dashboardLink.controller.ts — the link between the Blue Opus dashboard's invoicing and this app.
 *
 * The dashboard issues invoices and records receipts for Blue Opus's own clients. This keeps one MoneyWise business (the one named in
 * DASHBOARD_LINK_ORG_ID, Blue Opus Software) in step with it, using MoneyWise's own credit-sale code so every posting is made the normal way:
 *
 *   invoice issued in the dashboard   → a credit sale here (Dr Accounts Receivable / Cr Income)
 *   receipt recorded in the dashboard → a money-in entry here, applied to that invoice (Dr Bank / Cr Accounts Receivable)
 *   money that arrives here first     → listed (unapplied money-in) so the dashboard can suggest which invoice it settles
 *
 * Nothing here is open to the app's users. Every route needs DASHBOARD_LINK_SECRET as a bearer token, and nothing outside the one
 * business can be read or changed. Each dashboard invoice is tagged "[dash:<id>]" in its notes so a repeated call finds it again
 * instead of making a second one.
 */
import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { InvoiceError, allocatePayment, createInvoice, getAllocationsForEntry, isReceivableAccount, voidInvoice } from '../services/customerInvoice.service';

const DEFAULT_ORG = 'fa99669d-6160-44fd-94ac-8ff1f065003f'; // Blue Opus Software
const orgId = () => process.env.DASHBOARD_LINK_ORG_ID || DEFAULT_ORG;
const round2 = (n: number) => Math.round(n * 100) / 100;
const isDate = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tagOf = (dashId: string) => `[dash:${dashId}]`;

/** Bearer secret, compared in constant time. Without DASHBOARD_LINK_SECRET set the whole link is switched off. */
export function requireLinkSecret(req: Request, res: Response, next: NextFunction): any {
    const secret = process.env.DASHBOARD_LINK_SECRET;
    if (!secret) return res.status(503).json({ error: 'The dashboard link is not set up (DASHBOARD_LINK_SECRET).' });
    const given = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(given), b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof InvoiceError) return res.status(e.status).json({ error: e.message });
    console.error(`[DashboardLink] ${what}:`, e?.message ?? e);
    res.status(500).json({ error: e?.message || `Could not ${what}.` });
};

/** Who the postings are made as: DASHBOARD_LINK_USER_ID, else an admin of the business. */
async function actingUser(org: string): Promise<string> {
    if (process.env.DASHBOARD_LINK_USER_ID && UUID.test(process.env.DASHBOARD_LINK_USER_ID)) return process.env.DASHBOARD_LINK_USER_ID;
    const { data } = await supabase.from('users').select('id').eq('organization_id', org).eq('role', 'ADMIN').order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!data?.id) throw new InvoiceError('No administrator is set up for this business to post as. Set DASHBOARD_LINK_USER_ID.', 500);
    return data.id;
}

const shape = (i: any) => {
    const m = /\[dash:([0-9a-f-]{36})\]/i.exec(String(i.notes || ''));
    return { id: i.id, invoice_number: i.invoice_number, dashboard_id: m ? m[1] : null, customer_name: i.customer_name, total: Number(i.total), amount_paid: Number(i.amount_paid || 0), balance: round2(Number(i.total) - Number(i.amount_paid || 0)), status: i.status, issue_date: i.issue_date, follow_up_date: i.follow_up_date };
};

/** GET /dashboard-link/status — is the link on, and which business does it post to. */
export const linkStatus = async (_req: Request, res: Response): Promise<any> => {
    try {
        const org = orgId();
        const { data } = await supabase.from('organizations').select('id, name').eq('id', org).maybeSingle();
        if (!data) return res.status(404).json({ error: 'The business set for the dashboard link was not found.' });
        res.json({ ok: true, organization: data });
    } catch (e) { fail(res, e, 'read the link status'); }
};

/** GET /dashboard-link/invoices — the invoices that came from the dashboard, with what has been paid on each. */
export const linkListInvoices = async (_req: Request, res: Response): Promise<any> => {
    try {
        const { data, error } = await supabase.from('customer_invoices').select('*').eq('organization_id', orgId()).like('notes', '%[dash:%').order('created_at', { ascending: false }).limit(1000);
        if (error) throw new Error(error.message);
        res.json({ invoices: (data || []).map(shape) });
    } catch (e) { fail(res, e, 'list the invoices'); }
};

/** GET /dashboard-link/open-invoices — every invoice still owing, whether it came from the dashboard or not (for matching money to them). */
export const linkOpenInvoices = async (_req: Request, res: Response): Promise<any> => {
    try {
        const { data, error } = await supabase.from('customer_invoices').select('*').eq('organization_id', orgId()).in('status', ['OPEN', 'PARTIAL']).order('issue_date', { ascending: true }).limit(1000);
        if (error) throw new Error(error.message);
        res.json({ invoices: (data || []).map(shape) });
    } catch (e) { fail(res, e, 'list the open invoices'); }
};

/**
 * POST /dashboard-link/invoices — post a dashboard invoice as a credit sale.
 * body: { dashboard_id, number, customer: { name, email?, phone? }, items: [{ description, amount, quantity? }], issue_date, due_date, notes? }
 */
export const linkPostInvoice = async (req: Request, res: Response): Promise<any> => {
    try {
        const org = orgId();
        const b: any = req.body || {};
        if (!UUID.test(String(b.dashboard_id || ''))) return res.status(400).json({ error: 'dashboard_id is required.' });
        const tag = tagOf(b.dashboard_id);

        // Already posted? Give back the one that exists.
        const { data: existing } = await supabase.from('customer_invoices').select('*').eq('organization_id', org).like('notes', `%${tag}%`).maybeSingle();
        if (existing) return res.json({ ...shape(existing), created: false });

        const items = (Array.isArray(b.items) ? b.items : []).map((it: any) => {
            const qty = Number(it.quantity) > 0 ? Number(it.quantity) : 1;
            const amount = Number(it.amount);
            return { custom: true, name: String(it.description || '').trim().slice(0, 200), quantity: qty, price: round2(amount / qty) };
        });
        const issue = isDate(b.issue_date) ? b.issue_date : new Date().toISOString().slice(0, 10);
        const due = isDate(b.due_date) && b.due_date >= issue ? b.due_date : issue;
        const userId = await actingUser(org);
        const note = `Dashboard invoice ${String(b.number || '').slice(0, 40)}${b.notes ? ` - ${String(b.notes).slice(0, 300)}` : ''} ${tag}`.trim();
        const { invoice } = await createInvoice(org, userId, {
            items, customer: { name: String(b.customer?.name || ''), email: b.customer?.email || null, phone: b.customer?.phone || null },
            follow_up_date: due, issue_date: issue, notes: note,
        });
        res.status(201).json({ ...shape(invoice), created: true });
    } catch (e) { fail(res, e, 'post the invoice'); }
};

/** POST /dashboard-link/invoices/:id/void — void a posted invoice (refused by MoneyWise if payments are already applied). */
export const linkVoidInvoice = async (req: Request, res: Response): Promise<any> => {
    try { res.json(shape(await voidInvoice(orgId(), String(req.params.id)))); } catch (e) { fail(res, e, 'void the invoice'); }
};

/**
 * Applies part of a money-in entry to one invoice without disturbing what that entry already settles elsewhere
 * (allocatePayment replaces an entry's whole allocation, so the existing split is read and kept).
 */
async function applyToInvoice(org: string, userId: string | null, entryId: string, invoiceId: string, amount: number) {
    const current = (await getAllocationsForEntry(org, entryId)) as any[];
    const kept = current.filter(a => a.invoice_id !== invoiceId).map(a => ({ invoice_id: a.invoice_id, amount: Number(a.amount) }));
    // `amount` is what this entry settles on THIS invoice (set, not added), so repeating a call never doubles it.
    return allocatePayment(org, userId, entryId, [...kept, { invoice_id: invoiceId, amount }]);
}

const accountTypeFor = (method: string) => (/mobile|airtel|mtn|momo/i.test(method) ? 'AIRTEL_MONEY' : /cash/i.test(method) ? 'CASH' : 'BANK');

/**
 * POST /dashboard-link/receipts — a receipt recorded in the dashboard: book the money in, then apply it to the invoice.
 * body: { dashboard_receipt_id, receipt_no, invoice_id (MoneyWise's), amount, date_paid, method, bank_name?, received_from?, entry_id? }
 * With entry_id the money is already here: it is only applied. Repeating the call never books the money twice.
 */
export const linkPostReceipt = async (req: Request, res: Response): Promise<any> => {
    try {
        const org = orgId();
        const b: any = req.body || {};
        const amount = round2(Number(b.amount));
        if (!UUID.test(String(b.invoice_id || '')) || !(amount > 0)) return res.status(400).json({ error: 'invoice_id and an amount above zero are required.' });
        const userId = await actingUser(org);
        const { data: inv } = await supabase.from('customer_invoices').select('id, invoice_number, customer_name, status').eq('id', b.invoice_id).eq('organization_id', org).maybeSingle();
        if (!inv) return res.status(404).json({ error: 'That invoice was not found in MoneyWise.' });

        let entryId: string | null = UUID.test(String(b.entry_id || '')) ? b.entry_id : null;
        let booked = false;
        if (!entryId) {
            const ref = `DASH-RCT:${String(b.dashboard_receipt_id || b.receipt_no || '').slice(0, 60)}`;
            if (ref === 'DASH-RCT:') return res.status(400).json({ error: 'dashboard_receipt_id is required to book new money.' });
            const { data: have } = await supabase.from('cashbook_entries').select('id').eq('organization_id', org).eq('external_reference', ref).eq('entry_type', 'INFLOW').maybeSingle();
            if (have) entryId = have.id;
            else {
                const method = String(b.method || 'Bank Transfer');
                const entry = await cashbookService.createEntry(org, {
                    date: isDate(b.date_paid) ? b.date_paid : new Date().toISOString().slice(0, 10),
                    description: `Receipt ${b.receipt_no || ''} from ${b.received_from || inv.customer_name} | ${inv.invoice_number}${b.bank_name ? ` | ${String(b.bank_name).slice(0, 60)}` : ''}`.replace(/\s+/g, ' ').trim(),
                    debit: amount, credit: 0, entry_type: 'INFLOW', status: 'UNACCOUNTED', account_type: accountTypeFor(method),
                    external_reference: ref, sender_name: b.received_from || inv.customer_name, created_by: userId, skip_inflow_notification: true,
                } as any);
                entryId = (entry as any).id;
                booked = true;
            }
        }
        const result = await applyToInvoice(org, userId, entryId!, inv.id, amount);
        const { data: after } = await supabase.from('customer_invoices').select('*').eq('id', inv.id).maybeSingle();
        res.json({ entry_id: entryId, booked, applied: result.applied, invoice: after ? shape(after) : null });
    } catch (e) { fail(res, e, 'post the receipt'); }
};

/**
 * GET /dashboard-link/inflows?days=180 — money that has come in and is not yet applied to an invoice.
 * An entry counts when it is not pending and is either unclassified or already sitting in a receivable account; entries already
 * booked as sales or transfers are left out. `remaining` is what is still free to apply.
 */
export const linkInflows = async (req: Request, res: Response): Promise<any> => {
    try {
        const org = orgId();
        const days = Math.min(730, Math.max(7, Number(req.query.days) || 180));
        const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
        const { data: entries, error } = await supabase.from('cashbook_entries')
            .select('id, date, description, debit, status, account_type, account_id, external_reference, reference_number, sender_name, sender_phone, created_at')
            .eq('organization_id', org).eq('entry_type', 'INFLOW').neq('status', 'PENDING').gte('date', since).gt('debit', 0)
            .order('date', { ascending: false }).limit(500);
        if (error) throw new Error(error.message);
        const rows = entries || [];
        const acctIds = [...new Set(rows.map((r: any) => r.account_id).filter(Boolean))] as string[];
        const { data: accts } = acctIds.length ? await supabase.from('accounts').select('id, type, subtype, name, code').in('id', acctIds) : { data: [] as any[] };
        const receivable = new Set((accts || []).filter((a: any) => isReceivableAccount(a)).map((a: any) => a.id));
        const ids = rows.map((r: any) => r.id);
        const { data: used } = ids.length ? await supabase.from('invoice_payments').select('cashbook_entry_id, amount, invoice_id').in('cashbook_entry_id', ids) : { data: [] as any[] };
        const applied = new Map<string, number>();
        (used || []).forEach((u: any) => applied.set(u.cashbook_entry_id, round2((applied.get(u.cashbook_entry_id) || 0) + Number(u.amount))));
        const out = rows
            .filter((r: any) => !r.account_id || receivable.has(r.account_id))
            .map((r: any) => ({ id: r.id, date: r.date, description: r.description, amount: Number(r.debit), applied: applied.get(r.id) || 0, remaining: round2(Number(r.debit) - (applied.get(r.id) || 0)), account_type: r.account_type, reference: r.external_reference || r.reference_number || null, from: r.sender_name || null, phone: r.sender_phone || null, from_dashboard: String(r.external_reference || '').startsWith('DASH-RCT:') }))
            .filter((r: any) => r.remaining > 0.005 && !r.from_dashboard);
        res.json({ inflows: out });
    } catch (e) { fail(res, e, 'list the money in'); }
};

/** POST /dashboard-link/allocate — apply money already in MoneyWise to an invoice. body: { entry_id, invoice_id, amount } */
export const linkAllocate = async (req: Request, res: Response): Promise<any> => {
    try {
        const org = orgId();
        const { entry_id, invoice_id } = req.body || {};
        const amount = round2(Number(req.body?.amount));
        if (!UUID.test(String(entry_id || '')) || !UUID.test(String(invoice_id || '')) || !(amount > 0)) return res.status(400).json({ error: 'entry_id, invoice_id and an amount above zero are required.' });
        const userId = await actingUser(org);
        const r = await applyToInvoice(org, userId, entry_id, invoice_id, amount);
        const { data: after } = await supabase.from('customer_invoices').select('*').eq('id', invoice_id).eq('organization_id', org).maybeSingle();
        res.json({ applied: r.applied, unapplied: r.unapplied, invoice: after ? shape(after) : null });
    } catch (e) { fail(res, e, 'apply the money'); }
};
