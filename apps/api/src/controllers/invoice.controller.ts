import { Response } from 'express';
import { supabase } from '../lib/supabase';
import { emailService } from '../services/email.service';
import { buildCustomerInvoicePdf } from '../services/customerInvoicePdf';
import {
    InvoiceError,
    createInvoice,
    voidInvoice,
    listOpenInvoices,
    allocatePayment,
    getAllocationsForEntry,
    ensurePayLink,
    getActivePayLink,
    runInvoiceReminders,
} from '../services/customerInvoice.service';
import { getFrontendUrl } from '../utils/frontendUrl';

const fail = (res: Response, error: any, label: string) => {
    if (error instanceof InvoiceError) return res.status(error.status).json({ error: error.message });
    console.error(`[Invoices] ${label}:`, error);
    return res.status(500).json({ error: `Failed to ${label}`, details: error?.message });
};

const today = () => new Date().toISOString().split('T')[0];

/** Adds the derived fields the UI shows: outstanding balance and whether the follow-up date has passed. */
const decorate = (inv: any) => {
    const balance = Math.max(0, Math.round((Number(inv.total) - Number(inv.amount_paid || 0)) * 100) / 100);
    return { ...inv, balance, is_overdue: inv.status !== 'PAID' && inv.status !== 'VOID' && balance > 0 && inv.follow_up_date < today() };
};

const loadOwned = async (orgId: string, id: string) => {
    const { data } = await supabase.from('customer_invoices').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
    if (!data) throw new InvoiceError('Invoice not found.', 404);
    return data;
};

const withUrl = (req: any, link: { path: string } | null) => (link ? { ...link, url: `${getFrontendUrl(req)}${link.path}` } : null);

const emailInvoice = async (orgId: string, inv: any, to: string, frontendUrl: string): Promise<boolean> => {
    const link = await getActivePayLink(orgId, inv.id);
    const { data: org } = await supabase.from('organizations').select('name, logo_url').eq('id', orgId).single();
    const orgName = org?.name || 'the business';
    const pdf = await buildCustomerInvoicePdf({ orgName, invoice: inv });
    const sent = await emailService.sendCustomerInvoice({
        to, orgName, orgLogoUrl: org?.logo_url || null,
        customerName: inv.customer_name, invoiceNumber: inv.invoice_number,
        issueDate: inv.issue_date, followUpDate: inv.follow_up_date,
        items: inv.items, total: Number(inv.total), amountPaid: Number(inv.amount_paid || 0), pdf,
        payUrl: link ? `${frontendUrl}${link.path}` : null,
    });
    if (sent) {
        await supabase.from('customer_invoices')
            .update({ last_sent_at: new Date().toISOString(), sent_count: (inv.sent_count || 0) + 1 }).eq('id', inv.id);
    }
    return !!sent;
};

/** POST /invoices — record a credit sale. */
export const createCreditSale = async (req: any, res: Response): Promise<any> => {
    try {
        const orgId = req.user.organization_id;
        if (!orgId) return res.status(400).json({ error: 'User organization context missing' });
        const { items, customer, follow_up_date, issue_date, notes, send_email, create_pay_link } = req.body || {};
        const { invoice, customer_created } = await createInvoice(orgId, req.user.id, { items, customer, follow_up_date, issue_date, notes });

        // The pay-by-link link is created before the e-invoice goes out so the email can carry its "Pay now" button.
        let payLink: any = null;
        let payLinkError: string | null = null;
        if (create_pay_link !== false) {
            try { payLink = withUrl(req, await ensurePayLink(orgId, req.user.id, invoice.id)); }
            catch (e: any) { payLinkError = e?.message || 'Could not create the payment link.'; console.error('[Invoices] pay link failed (non-fatal):', e?.message); }
        }

        let emailSent = false;
        let emailError: string | null = null;
        if (send_email) {
            const to = (invoice.customer_email || '').trim();
            if (!to) emailError = 'No customer email on file.';
            else {
                try { emailSent = await emailInvoice(orgId, invoice, to, getFrontendUrl(req)); if (!emailSent) emailError = 'Email service is not configured.'; }
                catch (e: any) { emailError = e?.message || 'Email failed to send.'; console.error('[Invoices] email failed (non-fatal):', e?.message || e); }
            }
        }
        res.status(201).json({ ...decorate(invoice), customer_created, email_sent: emailSent, email_error: emailError, pay_link: payLink, pay_link_error: payLinkError });
    } catch (error) { fail(res, error, 'record the credit sale'); }
};

/** GET /invoices?status=OPEN|PARTIAL|PAID|VOID|ACTIVE&customer_id= */
export const listInvoices = async (req: any, res: Response): Promise<any> => {
    try {
        const orgId = req.user.organization_id;
        if (!orgId) return res.status(400).json({ error: 'User organization context missing' });
        let q = supabase.from('customer_invoices').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(1000);
        const status = String(req.query.status || '');
        if (status === 'ACTIVE') q = q.in('status', ['OPEN', 'PARTIAL']);
        else if (['OPEN', 'PARTIAL', 'PAID', 'VOID'].includes(status)) q = q.eq('status', status);
        if (req.query.customer_id) q = q.eq('customer_id', String(req.query.customer_id));
        const { data, error } = await q;
        if (error) throw error;
        res.json((data || []).map(decorate));
    } catch (error) { fail(res, error, 'list invoices'); }
};

/** GET /invoices/open?customer_id= — invoices a received payment can be applied to. */
export const listOpen = async (req: any, res: Response): Promise<any> => {
    try {
        const orgId = req.user.organization_id;
        if (!orgId) return res.status(400).json({ error: 'User organization context missing' });
        const rows = await listOpenInvoices(orgId, req.query.customer_id ? String(req.query.customer_id) : undefined);
        res.json(rows.map(decorate));
    } catch (error) { fail(res, error, 'list open invoices'); }
};

/** GET /invoices/:id — invoice + the payments applied to it. */
export const getInvoice = async (req: any, res: Response): Promise<any> => {
    try {
        const orgId = req.user.organization_id;
        const inv = await loadOwned(orgId, req.params.id);
        const { data: payments } = await supabase.from('invoice_payments')
            .select('id, amount, created_at, cashbook_entry_id, cashbook_entries(reference_number, date, description, account_type)')
            .eq('invoice_id', inv.id).order('created_at', { ascending: true });
        res.json({ ...decorate(inv), payments: payments || [], pay_link: withUrl(req, await getActivePayLink(orgId, inv.id)) });
    } catch (error) { fail(res, error, 'load the invoice'); }
};

/** GET /invoices/:id/pdf */
export const downloadInvoicePdf = async (req: any, res: Response): Promise<any> => {
    try {
        const orgId = req.user.organization_id;
        const inv = await loadOwned(orgId, req.params.id);
        const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).single();
        const pdf = await buildCustomerInvoicePdf({ orgName: org?.name || 'MoneyWise', invoice: inv });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${inv.invoice_number}.pdf"`);
        res.send(pdf);
    } catch (error) { fail(res, error, 'build the invoice PDF'); }
};

/** POST /invoices/:id/send { email? } — (re)send the e-invoice. */
export const sendInvoice = async (req: any, res: Response): Promise<any> => {
    try {
        const orgId = req.user.organization_id;
        const inv = await loadOwned(orgId, req.params.id);
        if (inv.status === 'VOID') throw new InvoiceError('A voided invoice cannot be sent.');
        const email = String(req.body?.email || inv.customer_email || '').trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new InvoiceError('Enter a valid customer email address.');
        if (email !== inv.customer_email) {
            await supabase.from('customer_invoices').update({ customer_email: email }).eq('id', inv.id);
            // Keep the CRM contact in step so the next invoice is pre-filled.
            if (inv.customer_id) await supabase.from('customers').update({ email }).eq('id', inv.customer_id).is('email', null);
            inv.customer_email = email;
        }
        const sent = await emailInvoice(orgId, inv, email, getFrontendUrl(req));
        if (!sent) throw new InvoiceError('The email service is not configured, so the invoice could not be sent.', 503);
        res.json({ success: true, sent_to: email });
    } catch (error) { fail(res, error, 'send the invoice'); }
};

/** POST /invoices/:id/void */
export const voidCreditSale = async (req: any, res: Response): Promise<any> => {
    try {
        const inv = await voidInvoice(req.user.organization_id, req.params.id);
        res.json(decorate(inv));
    } catch (error) { fail(res, error, 'void the invoice'); }
};

/** GET /invoices/allocations/:entryId — what a received payment has been applied to. */
export const entryAllocations = async (req: any, res: Response): Promise<any> => {
    try {
        res.json(await getAllocationsForEntry(req.user.organization_id, req.params.entryId));
    } catch (error) { fail(res, error, 'load the allocation'); }
};

/** POST /invoices/allocate { entry_id, allocations: [{ invoice_id, amount }] } */
export const allocate = async (req: any, res: Response): Promise<any> => {
    try {
        const { entry_id, allocations } = req.body || {};
        if (!entry_id) return res.status(400).json({ error: 'entry_id is required' });
        res.json(await allocatePayment(req.user.organization_id, req.user.id, entry_id, Array.isArray(allocations) ? allocations : []));
    } catch (error) { fail(res, error, 'apply the payment'); }
};

/** POST /invoices/:id/pay-link — the invoice's one-time "Pay now" link (created on demand, always for the current balance). */
export const payLink = async (req: any, res: Response): Promise<any> => {
    try {
        res.json(withUrl(req, await ensurePayLink(req.user.organization_id, req.user.id, req.params.id)));
    } catch (error) { fail(res, error, 'create the payment link'); }
};

/** POST /invoices/tick — cron entry point (secured by LENCO_SYNC_SECRET): follow-up reminders to the finance team. */
export const reminderTick = async (req: any, res: Response): Promise<any> => {
    const secret = process.env.LENCO_SYNC_SECRET;
    if (secret && req.headers['authorization'] !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
    try {
        res.json({ success: true, ...(await runInvoiceReminders()) });
    } catch (error) { fail(res, error, 'run invoice reminders'); }
};
