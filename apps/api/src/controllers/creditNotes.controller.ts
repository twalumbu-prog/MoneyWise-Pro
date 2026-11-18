import { Response } from 'express';
import * as cn from '../services/creditNotes.service';

const org = (req: any) => req.user.organization_id as string;
const run = (what: string, fn: (req: any) => Promise<any>) => async (req: any, res: Response) => {
    try { res.json(await fn(req)); }
    catch (e: any) {
        if (e instanceof cn.CreditNoteError) return res.status(e.httpStatus).json({ error: e.message });
        if (/books are locked/i.test(String(e?.message))) return res.status(423).json({ error: e.message });
        console.error(`[Credit notes] ${what}:`, e?.message ?? e); res.status(500).json({ error: `Could not ${what}.` });
    }
};

export const list = run('load the credit notes', async (r) => ({ creditNotes: await cn.listCreditNotes(org(r), r.query.direction as string | undefined) }));
export const createCustomer = run('issue the credit note', async (r) => ({ creditNote: await cn.createCustomerCreditNote(org(r), r.user.id, r.body) }));
export const createSupplier = run('record the credit note', async (r) => ({ creditNote: await cn.createSupplierCreditNote(org(r), r.user.id, r.body) }));
export const applyInvoice = run('apply the credit note', (r) => cn.applyToInvoice(org(r), r.user.id, r.params.id, String(r.body?.invoiceId ?? ''), r.body?.amount));
export const applyBill = run('apply the credit note', (r) => cn.applyToBill(org(r), r.user.id, r.params.id, String(r.body?.billId ?? ''), r.body?.amount));
export const voidNote = run('cancel the credit note', async (r) => ({ creditNote: await cn.voidCreditNote(org(r), r.user.id, r.params.id) }));
