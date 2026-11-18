import { Response } from 'express';
import * as vat from '../services/vat.service';

const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const org = (req: any) => req.user.organization_id as string;
const run = (what: string, fn: (req: any) => Promise<any>) => async (req: any, res: Response) => {
    try { res.json(await fn(req)); }
    catch (e: any) {
        if (e instanceof vat.VatError) return res.status(e.httpStatus).json({ error: e.message });
        console.error(`[VAT] ${what}:`, e?.message ?? e); res.status(500).json({ error: `Could not ${what}.` });
    }
};
/** The period asked for, or last month when none is given. */
const period = (req: any) => {
    const now = new Date(); const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)); const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return { from: date(req.query.from) ?? first.toISOString().slice(0, 10), to: date(req.query.to) ?? last.toISOString().slice(0, 10) };
};

export const settings = run('load the VAT settings', (r) => vat.getSettings(org(r)));
export const saveSettings = run('save the VAT settings', (r) => vat.saveSettings(org(r), r.user.id, r.body));
export const vatReturn = run('build the VAT return', (r) => { const p = period(r); return vat.vatReturn(org(r), p.from, p.to); });
export const fileReturn = run('record the return', (r) => { const p = period({ query: r.body ?? {} }); return vat.fileReturn(org(r), r.user.id, p.from, p.to, r.body?.paymentReference); });
export const returns = run('load the filed returns', async (r) => ({ returns: await vat.listReturns(org(r)) }));
export const adjustment = run('add the VAT entry', (r) => vat.addAdjustment(org(r), r.user.id, r.body));
