import {
    getReconciliationOverview,
    getQuickOverview,
    getOrgReconciliationDetail,
    RECON_TOLERANCE,
} from '../services/reconciliation.service';

/**
 * GET /admin/me
 * Lightweight whoami used by the admin frontend to gate the UI. Reaching this
 * handler at all means requireAuth + requireSuperAdmin already passed.
 */
export const whoami = (req: any, res: any) => {
    res.json({
        email: req.user?.email ?? null,
        superAdmin: true,
    });
};

/**
 * GET /admin/reconciliation?refresh=1
 * One row per organization: Inflows / Outflows / Closing, each as
 * { moneywise, lenco, difference }, plus a closing-balance-driven status + %.
 */
export const getReconciliationList = async (req: any, res: any) => {
    try {
        // quick=1 → MoneyWise-only fast first paint (no live Lenco calls).
        if (req.query?.quick === '1' || req.query?.quick === 'true') {
            const organizations = await getQuickOverview();
            return res.json({ tolerance: RECON_TOLERANCE, generatedAt: new Date().toISOString(), organizations });
        }
        const forceRefresh = req.query?.refresh === '1' || req.query?.refresh === 'true';
        const organizations = await getReconciliationOverview(forceRefresh);
        res.json({
            tolerance: RECON_TOLERANCE,
            generatedAt: new Date().toISOString(),
            organizations,
        });
    } catch (err: any) {
        console.error('[AdminRecon] overview failed:', err?.message || err);
        res.status(500).json({ error: 'Failed to build reconciliation overview', details: err?.message });
    }
};

/**
 * GET /admin/reconciliation/:orgId
 * Full per-org detail including the transaction-level Matched / MoneyWise-only /
 * Lenco-only drill-down.
 */
export const getOrgReconciliation = async (req: any, res: any) => {
    try {
        const { orgId } = req.params;
        const detail = await getOrgReconciliationDetail(orgId);
        if (!detail) return res.status(404).json({ error: 'Organization not found' });
        res.json({ tolerance: RECON_TOLERANCE, generatedAt: new Date().toISOString(), ...detail });
    } catch (err: any) {
        console.error('[AdminRecon] org detail failed:', err?.message || err);
        res.status(500).json({ error: 'Failed to build org reconciliation', details: err?.message });
    }
};
