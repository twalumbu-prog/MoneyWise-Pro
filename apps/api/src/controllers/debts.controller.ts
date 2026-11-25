import { Response } from 'express';
import * as svc from '../services/debts.service';

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof svc.DebtError) return res.status(e.httpStatus).json({ error: e.message });
    console.error(`[Debts] ${what}:`, e?.message ?? e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};
const org = (req: any) => req.user.organization_id as string;
const run = (what: string, fn: (req: any) => Promise<any>) => async (req: any, res: Response) => { try { res.json(await fn(req)); } catch (e) { fail(res, e, what); } };

export const tags = run('load the tags', async () => ({ tags: svc.DEBT_TAGS }));
export const overview = run('load your debts', (r) => svc.overview(org(r)));
export const detail = run('load that debt', (r) => svc.detail(org(r), r.params.id));
export const update = run('save the debt', (r) => svc.updateDebt(org(r), r.params.id, r.body));
export const tagEntry = run('tag the transaction', (r) => svc.tagEntry(org(r), r.user.id, r.body));
export const untagEntry = run('remove the tag', (r) => svc.untagEntry(org(r), r.params.entryId));
export const counterparties = run('load who debts can be with', (r) => svc.counterparties(r.user.id, org(r)));
export const recordOpening = run('record the opening balance', (r) => svc.recordOpening(org(r), r.user.id, r.body));
export const removeOpening = run('remove the opening balance', (r) => svc.removeOpening(org(r), r.params.id));
