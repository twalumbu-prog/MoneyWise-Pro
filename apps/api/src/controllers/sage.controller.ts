import { Request, Response } from 'express';
import { SageService } from '../services/sage.service';

const orgOf = (req: Request) => (req as any).user?.organization_id as string | undefined;

/** Connecting stores a Sage login and pushing writes to the customer's books — admins only. */
const requireOrgAdmin = (req: Request, res: Response): string | null => {
    const organizationId = orgOf(req);
    if (!organizationId) { res.status(400).json({ error: 'User does not belong to an organization' }); return null; }
    if ((req as any).user?.role !== 'ADMIN') { res.status(403).json({ error: 'Only organization admins can manage the Sage integration' }); return null; }
    return organizationId;
};

const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** GET /integrations/sage/status */
export const getSageStatus = async (req: Request, res: Response) => {
    const organizationId = orgOf(req);
    if (!organizationId) return res.status(400).json({ error: 'User does not belong to an organization' });
    try {
        res.json(await SageService.getStatus(organizationId));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** POST /integrations/sage/connect { username, password, companyId? } */
export const connectSage = async (req: Request, res: Response) => {
    const organizationId = requireOrgAdmin(req, res);
    if (!organizationId) return;
    const { username, password, companyId } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Sage username and password are required' });
    if (!SageService.isConfigured()) return res.status(503).json({ error: 'Sage integration is not configured yet', configured: false });
    try {
        res.json(await SageService.connect(organizationId, String(username).trim(), String(password), companyId ? String(companyId) : undefined));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

/** DELETE /integrations/sage */
export const disconnectSage = async (req: Request, res: Response) => {
    const organizationId = requireOrgAdmin(req, res);
    if (!organizationId) return;
    try {
        await SageService.disconnect(organizationId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** GET /integrations/sage/accounts — the Sage chart of accounts. */
export const getSageAccounts = async (req: Request, res: Response) => {
    const organizationId = orgOf(req);
    if (!organizationId) return res.status(400).json({ error: 'User does not belong to an organization' });
    try {
        res.json(await SageService.fetchAccounts(organizationId));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** GET /integrations/sage/mappings — MoneyWise accounts with their Sage account. */
export const getSageMappings = async (req: Request, res: Response) => {
    const organizationId = orgOf(req);
    if (!organizationId) return res.status(400).json({ error: 'User does not belong to an organization' });
    try {
        res.json(await SageService.getMappings(organizationId));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** PUT /integrations/sage/mappings { accountId, sageAccountId | null, sageAccountName? } */
export const updateSageMapping = async (req: Request, res: Response) => {
    const organizationId = requireOrgAdmin(req, res);
    if (!organizationId) return;
    const { accountId, sageAccountId, sageAccountName } = req.body || {};
    if (!accountId) return res.status(400).json({ error: 'accountId is required' });
    try {
        await SageService.setMapping(organizationId, String(accountId), sageAccountId ? String(sageAccountId) : null, sageAccountName);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** POST /integrations/sage/sync { from?, to?, limit? } — push MoneyWise journals to Sage. Defaults to this month. */
export const syncSageNow = async (req: Request, res: Response) => {
    const organizationId = requireOrgAdmin(req, res);
    if (!organizationId) return;
    const now = new Date();
    const fromDate = isoDate(req.body?.from) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const toDate = isoDate(req.body?.to) || now.toISOString().split('T')[0];
    try {
        const result = await SageService.syncJournals(organizationId, { fromDate, toDate, limit: Number(req.body?.limit) || undefined });
        res.json({ fromDate, toDate, ...result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
