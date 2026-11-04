import { Response } from 'express';
import * as reports from '../services/accountingReports.service';
import { buildReportPdf } from '../services/accountingPdf.service';

const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const org = (req: any) => req.user.organization_id as string;
const range = (req: any) => { const to = date(req.query.to) ?? new Date().toISOString().slice(0, 10); return { from: date(req.query.from) ?? `${to.slice(0, 4)}-01-01`, to }; };
const run = (what: string, fn: (req: any) => Promise<any>) => async (req: any, res: Response) => {
    try { res.json(await fn(req)); } catch (e: any) { console.error(`[Accounting] ${what}:`, e?.message ?? e); res.status(500).json({ error: e?.message || `Could not ${what}.` }); }
};

export const budget = run('build the budget report', (r) => { const { from, to } = range(r); return reports.budgetVsActual(org(r), from, to); });
export const compare = run('compare the periods', (r) => { const { from, to } = range(r); return reports.comparePeriods(org(r), from, to, r.query.against === 'year' ? 'year' : 'previous'); });
export const changes = run('load the change history', async (r) => ({ changes: await reports.listChanges(org(r), { table: r.query.table as string | undefined, before: r.query.before as string | undefined }) }));

/** GET /accounting/pdf?report=tb|bs|cf|ar|ap|gl|budget|compare&from&to&accountId&against */
export const pdf = async (req: any, res: Response) => {
    try {
        const { from, to } = range(req);
        const out = await buildReportPdf(org(req), String(req.query.report ?? ''), { from, to, accountId: req.query.accountId as string | undefined, against: req.query.against as string | undefined });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${out.file}"`);
        res.send(out.pdf);
    } catch (e: any) { console.error('[Accounting] pdf:', e?.message ?? e); res.status(400).json({ error: e?.message || 'Could not make the PDF.' }); }
};
