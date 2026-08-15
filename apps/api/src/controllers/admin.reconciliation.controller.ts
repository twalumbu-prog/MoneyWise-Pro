import {
    getReconciliationOverview,
    getQuickOverview,
    getOrgReconciliationDetail,
    getRawLencoTransactions,
    healMissingPlatformFees,
    healMissingPlatformFeesForAllOrgs,
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

/**
 * GET /admin/reconciliation/:orgId/raw-lenco-txns
 * Unfiltered, uncategorized dump of every Lenco transaction for this org — for a
 * from-first-principles penny-by-penny balance reconstruction, independent of any
 * matching/classification logic elsewhere in this file.
 */
export const getRawLencoTxns = async (req: any, res: any) => {
    try {
        const { orgId } = req.params;
        const result = await getRawLencoTransactions(orgId);
        if (!result) return res.status(404).json({ error: 'Organization not found or not linked to Lenco' });
        res.json(result);
    } catch (err: any) {
        console.error('[AdminRecon] raw-lenco-txns failed:', err?.message || err);
        res.status(500).json({ error: 'Failed to fetch raw Lenco transactions', details: err?.message });
    }
};

/**
 * POST /admin/reconciliation/:orgId/heal-platform-fees?dryRun=1
 * Posts any genuinely-unposted MoneyWise platform-fee sweep for this org as an
 * EXPENSE entry (see healMissingPlatformFees for the root cause). Idempotent —
 * safe to call repeatedly. dryRun=1 reports what WOULD be posted without writing.
 */
export const healOrgPlatformFees = async (req: any, res: any) => {
    try {
        const { orgId } = req.params;
        const apply = !(req.query?.dryRun === '1' || req.query?.dryRun === 'true');
        const result = await healMissingPlatformFees(orgId, { apply });
        res.json({ ...result, applied: apply });
    } catch (err: any) {
        console.error('[AdminRecon] heal-platform-fees failed:', err?.message || err);
        res.status(500).json({ error: 'Failed to heal platform fees', details: err?.message });
    }
};

/**
 * POST /admin/reconciliation/heal-platform-fees
 * Cron entry point — runs the same healing pass across every Lenco-linked org.
 * Called on a schedule (see supabase/migrations/*_setup_fee_heal_cron.sql) so a
 * gap like Twalumbu's K868.11 (2026-08-15) can never again sit undetected for
 * two months — this closes it automatically within one cron cycle of appearing.
 */
export const healAllOrgsPlatformFees = async (_req: any, res: any) => {
    try {
        const results = await healMissingPlatformFeesForAllOrgs();
        const totalPosted = results.reduce((s, r) => s + r.totalPosted, 0);
        res.json({ orgsWithHealing: results.length, totalPosted: Math.round(totalPosted * 100) / 100, results });
    } catch (err: any) {
        console.error('[AdminRecon] heal-all failed:', err?.message || err);
        res.status(500).json({ error: 'Failed to heal platform fees across orgs', details: err?.message });
    }
};
