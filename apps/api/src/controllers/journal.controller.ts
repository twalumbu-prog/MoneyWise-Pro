import { createManualJournal, getJournal, listJournals, reverseManualJournal, JournalError } from '../services/journalEntry.service';
import { trialBalance, cashFlowStatement, changesInEquity, generalLedger } from '../services/financialStatements.service';

const fail = (res: any, e: any, what: string) => {
    if (e instanceof JournalError || e?.status) return res.status(e.status || 400).json({ error: e.message, ...(e.details ? { details: e.details } : {}) });
    console.error(`[Journal] ${what}:`, e);
    return res.status(500).json({ error: `Failed to ${what}`, details: e?.message });
};
const ymd = /^\d{4}-\d{2}-\d{2}$/;
const orgOf = (req: any) => (req as any).user.organization_id as string | undefined;

export const postJournal = async (req: any, res: any) => {
    try {
        const orgId = orgOf(req); if (!orgId) return res.status(400).json({ error: 'Organization context missing' });
        const entry = await createManualJournal(orgId, req.user.id ?? null, req.body ?? {});
        res.status(201).json(entry);
    } catch (e) { fail(res, e, 'post the journal entry'); }
};

export const listJournalEntries = async (req: any, res: any) => {
    try {
        const orgId = orgOf(req); if (!orgId) return res.status(400).json({ error: 'Organization context missing' });
        const { from, to, search, source_type, limit, offset } = req.query;
        res.json(await listJournals(orgId, {
            from: ymd.test(String(from)) ? String(from) : undefined, to: ymd.test(String(to)) ? String(to) : undefined,
            search: search ? String(search) : undefined, sourceType: source_type ? String(source_type) : undefined,
            limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined,
        }));
    } catch (e) { fail(res, e, 'load journal entries'); }
};

export const getJournalEntry = async (req: any, res: any) => {
    try {
        const orgId = orgOf(req); if (!orgId) return res.status(400).json({ error: 'Organization context missing' });
        res.json(await getJournal(orgId, req.params.id));
    } catch (e) { fail(res, e, 'load the journal entry'); }
};

export const reverseJournalEntry = async (req: any, res: any) => {
    try {
        const orgId = orgOf(req); if (!orgId) return res.status(400).json({ error: 'Organization context missing' });
        const date = ymd.test(String(req.body?.date)) ? String(req.body.date) : undefined;
        res.status(201).json(await reverseManualJournal(orgId, req.user.id ?? null, req.params.id, date));
    } catch (e) { fail(res, e, 'reverse the journal entry'); }
};

/** Shared by the statement endpoints: validates ?startDate&endDate. */
function range(req: any, res: any): { orgId: string; start: string; end: string } | null {
    const orgId = orgOf(req);
    if (!orgId) { res.status(400).json({ error: 'Organization context missing' }); return null; }
    const start = String(req.query.startDate ?? ''), end = String(req.query.endDate ?? '');
    if (!ymd.test(start) || !ymd.test(end) || start > end) { res.status(400).json({ error: 'startDate and endDate (YYYY-MM-DD, start ≤ end) are required' }); return null; }
    return { orgId, start, end };
}

export const getTrialBalance = async (req: any, res: any) => { const r = range(req, res); if (!r) return; try { res.json(await trialBalance(r.orgId, r.start, r.end)); } catch (e) { fail(res, e, 'build the trial balance'); } };
export const getCashFlow = async (req: any, res: any) => { const r = range(req, res); if (!r) return; try { res.json(await cashFlowStatement(r.orgId, r.start, r.end)); } catch (e) { fail(res, e, 'build the cash flow statement'); } };
export const getChangesInEquity = async (req: any, res: any) => { const r = range(req, res); if (!r) return; try { res.json(await changesInEquity(r.orgId, r.start, r.end)); } catch (e) { fail(res, e, 'build the statement of changes in equity'); } };
export const getGeneralLedger = async (req: any, res: any) => {
    const r = range(req, res); if (!r) return;
    const accountId = String(req.query.accountId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(accountId)) return res.status(400).json({ error: 'accountId is required' });
    try { res.json(await generalLedger(r.orgId, accountId, r.start, r.end)); } catch (e) { fail(res, e, 'build the general ledger'); }
};
