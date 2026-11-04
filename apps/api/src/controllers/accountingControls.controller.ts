import { Response } from 'express';
import * as svc from '../services/accountingControls.service';

const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const fail = (res: Response, e: any, what: string) => {
    if (e instanceof svc.ControlsError) return res.status(e.httpStatus).json({ error: e.message });
    const msg = String(e?.message ?? '');
    // The database refuses entries inside a locked period; say so plainly.
    if (/books are locked/i.test(msg)) return res.status(423).json({ error: msg });
    console.error(`[Accounting] ${what}:`, msg);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};
const org = (req: any) => req.user.organization_id as string;
const run = (what: string, fn: (req: any) => Promise<any>) => async (req: any, res: Response) => { try { res.json(await fn(req)); } catch (e) { fail(res, e, what); } };

export const getLock = run('load the lock', (r) => svc.getLock(org(r)));
export const setLock = run('change the lock', (r) => svc.setLock(org(r), r.user.id, r.body?.lockedThrough ?? null));
export const journals = run('load the journals', async (r) => ({ journals: await svc.listJournals(org(r), date(r.query.from), date(r.query.to), r.query.q as string | undefined) }));
export const createJournal = run('post the journal', (r) => svc.createJournal(org(r), r.user.id, r.body));
export const reverseJournal = run('reverse the journal', (r) => svc.reverseJournal(org(r), r.user.id, r.params.id, r.body));
export const cashFlow = run('build the cash flow statement', (r) => svc.cashFlow(org(r), date(r.query.from), date(r.query.to)));
export const receivables = run('load what customers owe', (r) => svc.receivablesAgeing(org(r)));
