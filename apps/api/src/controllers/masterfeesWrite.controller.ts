import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getMasterFeesIntegration, MasterFeesClient, MasterFeesRateLimitError } from '../services/masterfees.service';
import { masterFeesWrites, replacePayment, replaceInvoice, MasterFeesWriteError } from '../services/masterfees_write';

/**
 * Changes MoneyWise makes in the school's Master Fees (see services/masterfees_write.ts). Administrators only, and only for the signed-in
 * business's own connected school: the school is never taken from the request.
 */
async function run(req: AuthRequest, res: Response, label: string, send: (config: any) => Promise<{ status: number; idempotent: boolean; data: any }>) {
    return runAny(req, res, label, async (c) => { const r = await send(c); return { status: r.status, body: r.data, note: r.idempotent ? ' (repeat)' : '' }; });
}

async function runAny(req: AuthRequest, res: Response, label: string, send: (config: any) => Promise<{ status: number; body: any; note?: string }>) {
    try {
        const organizationId = req.user?.organization_id;
        if (!organizationId) return res.status(400).json({ error: 'No business on this sign-in.' });
        if (String(req.user?.role || '').toUpperCase() !== 'ADMIN') return res.status(403).json({ error: 'Only an administrator can change data in Master Fees.' });
        const integration = await getMasterFeesIntegration(organizationId);
        if (!integration?.config?.publicKey || !integration.config.schoolId) return res.status(409).json({ error: 'Master Fees isn’t connected for this business.', code: 'not_connected' });
        const result = await send(integration.config);
        // The audit of record is Master Fees' own (partner_api_audit); this line says who asked, from MoneyWise's side.
        console.log(`[MasterFees write] ${label} org=${organizationId} user=${req.user?.id} -> ${result.status}${result.note ?? ''}`);
        return res.status(result.status).json(result.body);
    } catch (e: any) {
        if (e instanceof MasterFeesWriteError) {
            // Master Fees' 401 means the key it holds is wrong: from the MoneyWise user's side that is a connection problem, not their sign-in.
            const status = e.status === 401 ? 502 : e.status >= 400 && e.status < 600 ? e.status : 502;
            return res.status(status).json({ error: e.message, code: e.code, details: e.details, retryable: e.retryable });
        }
        console.error(`[MasterFees write] ${label} failed:`, e?.message);
        return res.status(500).json({ error: 'Couldn’t send that change to Master Fees.' });
    }
}

export const mfRecordPayment = (req: AuthRequest, res: Response) => run(req, res, 'payment', (c) => masterFeesWrites.recordPayment(c, req.body, { idempotencyKey: String(req.headers['idempotency-key'] || '') || undefined }));
export const mfVoidPayment = (req: AuthRequest, res: Response) => run(req, res, 'void payment', (c) => masterFeesWrites.voidPayment(c, req.params.id, req.body));
export const mfCreateStudent = (req: AuthRequest, res: Response) => run(req, res, 'create student', (c) => masterFeesWrites.createStudent(c, req.body));
export const mfUpdateStudent = (req: AuthRequest, res: Response) => run(req, res, 'update student', (c) => masterFeesWrites.updateStudent(c, req.params.id, req.body));
export const mfCreateInvoice = (req: AuthRequest, res: Response) => run(req, res, 'invoice', (c) => masterFeesWrites.createInvoice(c, req.body, { idempotencyKey: String(req.headers['idempotency-key'] || '') || undefined }));
export const mfVoidInvoice = (req: AuthRequest, res: Response) => run(req, res, 'void invoice', (c) => masterFeesWrites.voidInvoice(c, req.params.id, req.body));

const keyOf = (req: AuthRequest) => String(req.headers['idempotency-key'] || '') || undefined;

/** Edit = void the old record and record the corrected one under a new reference (see replacePayment). The body carries `edit_reason` and the corrected record. */
export const mfReplacePayment = (req: AuthRequest, res: Response) => runAny(req, res, 'replace payment', async (c) => {
    const r = await replacePayment(c, req.params.id, req.body, { idempotencyKey: keyOf(req) });
    return { status: 201, body: { success: true, voided: r.voided.data, created: r.created.data }, note: r.created.idempotent ? ' (repeat)' : '' };
});
export const mfReplaceInvoice = (req: AuthRequest, res: Response) => runAny(req, res, 'replace invoice', async (c) => {
    const r = await replaceInvoice(c, req.params.id, req.body, { idempotencyKey: keyOf(req) });
    return { status: 201, body: { success: true, voided: r.voided.data, created: r.created.data }, note: r.created.idempotent ? ' (repeat)' : '' };
});

/** GET .../write/recent?type=payments|invoices: the latest records, so the one to edit can be picked and its details pre-filled. */
export const mfRecent = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user?.organization_id;
        if (!organizationId) return res.status(400).json({ error: 'No business on this sign-in.' });
        if (String(req.user?.role || '').toUpperCase() !== 'ADMIN') return res.status(403).json({ error: 'Only an administrator can change data in Master Fees.' });
        const integration = await getMasterFeesIntegration(organizationId);
        if (!integration?.config?.publicKey || !integration.config.schoolId) return res.status(409).json({ error: 'Master Fees isn’t connected for this business.', code: 'not_connected' });
        const invoices = req.query.type === 'invoices';
        const rows = await new MasterFeesClient(integration.config).getRecent(invoices ? 'invoices' : 'transactions', 50);
        res.json({ type: invoices ? 'invoices' : 'payments', rows });
    } catch (e: any) {
        if (e instanceof MasterFeesRateLimitError) return res.status(429).json({ error: e.message, retry_after_seconds: e.retryAfterSeconds });
        res.status(502).json({ error: e?.message || 'Couldn’t load the records from Master Fees.' });
    }
};
