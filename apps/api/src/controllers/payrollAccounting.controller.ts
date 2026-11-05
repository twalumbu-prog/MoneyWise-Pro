import { Response } from 'express';
import * as pa from '../services/payrollAccounting.service';

const org = (req: any) => req.user.organization_id as string;
const run = (what: string, fn: (req: any) => Promise<any>) => async (req: any, res: Response) => {
    try { res.json(await fn(req)); }
    catch (e: any) {
        if (e instanceof pa.PayrollAcctError) return res.status(e.httpStatus).json({ error: e.message });
        if (/books are locked/i.test(String(e?.message))) return res.status(423).json({ error: e.message });
        console.error(`[Payroll accounting] ${what}:`, e?.message ?? e); res.status(500).json({ error: `Could not ${what}.` });
    }
};
const ym = (req: any) => { const n = new Date(); const prev = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)); return { year: Number(req.query.year) || prev.getUTCFullYear(), month: Number(req.query.month) || prev.getUTCMonth() + 1 }; };

export const status = run('load the payroll accounting status', (r) => pa.getStatus(org(r)));
export const setAccrual = run('change payroll accruals', (r) => pa.setAccrual(org(r), r.user.id, !!r.body?.enabled));
export const statutory = run('build the statutory schedule', (r) => { const p = ym(r); return pa.statutory(org(r), p.year, p.month); });
export const periods = run('load the payroll months', async (r) => ({ periods: await pa.periods(org(r)) }));
export const payment = run('record the payment', (r) => pa.recordPayment(org(r), r.user.id, r.body));
export const accrue = run('post the run to the books', (r) => pa.accrueRun(org(r), r.user.id, String(r.body?.runId ?? '')));
