import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import {
    MasterFeesClient,
    getMasterFeesIntegration,
    detectLencoMode,
    syncMasterfees,
    reconcileMasterfees,
    MasterFeesConfig,
} from '../services/masterfees.service';

const PROVIDER = 'MASTERFEES';

/** Connect (or re-connect) a Master Fees school to this organization. */
export const connectMasterFees = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const { schoolId, publicKey, baseUrl } = req.body || {};
        if (!schoolId || !publicKey) {
            return res.status(400).json({ error: 'schoolId and publicKey are required.' });
        }

        const config: MasterFeesConfig = { schoolId: String(schoolId).trim(), publicKey: String(publicKey).trim(), baseUrl: baseUrl?.trim() || undefined };
        const client = new MasterFeesClient(config);

        // Validate credentials by hitting the API (also surfaces a disabled master switch).
        const ping = await client.ping();
        config.schoolName = ping.school_name;

        // Auto-detect whether Master Fees shares this org's Lenco account.
        config.lencoMode = await detectLencoMode(organizationId, client);
        config.lencoModeOverridden = false;

        // Upsert the integration row (one per org+provider).
        const existing = await getMasterFeesIntegration(organizationId);
        const merged = existing ? { ...existing.config, ...config } : config;
        const { error } = await supabase
            .from('integrations')
            .upsert({
                provider: PROVIDER,
                organization_id: organizationId,
                config: merged,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'organization_id,provider' });
        if (error) throw error;

        // Kick an initial sync (non-blocking so connect returns fast).
        syncMasterfees(organizationId).catch(err => console.error('[MasterFees] initial sync failed:', err.message));

        res.json({ connected: true, schoolName: config.schoolName, lencoMode: config.lencoMode, categories: ping.categories?.length || 0 });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getMasterFeesStatus = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const integration = await getMasterFeesIntegration(organizationId);
        if (!integration) return res.json({ connected: false });
        const { publicKey, ...safe } = integration.config; // never leak the key back
        res.json({
            connected: true,
            schoolId: safe.schoolId,
            schoolName: safe.schoolName,
            lencoMode: safe.lencoMode,
            lencoModeOverridden: safe.lencoModeOverridden,
            categoryMap: safe.categoryMap || {},
            lastSyncedAt: safe.lastSyncedAt,
            lastSyncError: safe.lastSyncError,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const disconnectMasterFees = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const { error } = await supabase
            .from('integrations')
            .delete()
            .eq('provider', PROVIDER)
            .eq('organization_id', organizationId);
        if (error) throw error;
        // Journals + provisioned accounts are intentionally left in place so historical
        // reports stay intact; reconnecting resumes idempotently.
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** List the Master Fees fee categories with their current income-account mapping. */
export const getMasterFeesFeeCategories = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const integration = await getMasterFeesIntegration(organizationId);
        if (!integration) return res.status(404).json({ error: 'Master Fees is not connected.' });
        const client = new MasterFeesClient(integration.config);
        const categories = await client.getFeeCategories();
        const map = integration.config.categoryMap || {};
        res.json(categories.map((c: any) => {
            const id = c.id || c.category_id || c.fee_category_id;
            return { id, name: c.name, amount: c.amount ?? c.price ?? null, accountId: id ? map[id]?.accountId || null : null };
        }));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** Override the income account a fee category posts to. */
export const updateMasterFeesCategoryMapping = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const { categoryId, accountId, name } = req.body || {};
        if (!categoryId || !accountId) return res.status(400).json({ error: 'categoryId and accountId are required.' });

        const integration = await getMasterFeesIntegration(organizationId);
        if (!integration) return res.status(404).json({ error: 'Master Fees is not connected.' });

        const map = { ...(integration.config.categoryMap || {}) };
        map[categoryId] = { accountId, name: name || map[categoryId]?.name || categoryId };
        const { error } = await supabase
            .from('integrations')
            .update({ config: { ...integration.config, categoryMap: map }, updated_at: new Date().toISOString() })
            .eq('provider', PROVIDER)
            .eq('organization_id', organizationId);
        if (error) throw error;
        res.json({ success: true, categoryMap: map });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** Manually override the auto-detected shared/separate Lenco mode. */
export const updateMasterFeesLencoMode = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const { lencoMode } = req.body || {};
        if (!['shared', 'separate'].includes(lencoMode)) {
            return res.status(400).json({ error: "lencoMode must be 'shared' or 'separate'." });
        }
        const integration = await getMasterFeesIntegration(organizationId);
        if (!integration) return res.status(404).json({ error: 'Master Fees is not connected.' });
        const { error } = await supabase
            .from('integrations')
            .update({ config: { ...integration.config, lencoMode, lencoModeOverridden: true }, updated_at: new Date().toISOString() })
            .eq('provider', PROVIDER)
            .eq('organization_id', organizationId);
        if (error) throw error;
        res.json({ success: true, lencoMode });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** Manual "Sync now". */
export const syncMasterFeesNow = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const summary = await syncMasterfees(organizationId);
        res.json({ success: true, summary });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getMasterFeesReconciliation = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const result = await reconcileMasterfees(organizationId);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Cron entry point: sync every organization that has a Master Fees integration.
 * Secured by MASTERFEES_SYNC_SECRET (falls back to LENCO_SYNC_SECRET for reuse of
 * the existing scheduling pipeline). Bounded by a time budget like the Lenco sync.
 */
export const syncAllMasterFees = async (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    const syncSecret = process.env.MASTERFEES_SYNC_SECRET || process.env.LENCO_SYNC_SECRET;
    if (syncSecret && authHeader !== `Bearer ${syncSecret}`) {
        return res.status(401).json({ error: 'Unauthorized: Invalid sync secret' });
    }

    const START = Date.now();
    const BUDGET_MS = 20_000;
    try {
        const { data: rows, error } = await supabase
            .from('integrations')
            .select('organization_id')
            .eq('provider', PROVIDER)
            .not('organization_id', 'is', null);
        if (error) throw error;

        const results: any[] = [];
        for (const row of rows || []) {
            if (Date.now() - START > BUDGET_MS) {
                console.warn(`[MasterFees Sync] Time budget exceeded — deferring ${(rows!.length) - results.length} org(s).`);
                break;
            }
            try {
                const summary = await syncMasterfees(row.organization_id);
                results.push({ organizationId: row.organization_id, success: true, summary });
            } catch (err: any) {
                results.push({ organizationId: row.organization_id, success: false, error: err.message });
            }
        }
        res.json({ success: true, processed: results.length, results });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
