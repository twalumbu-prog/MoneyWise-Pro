import { auditOrganization, healOrganization } from '../services/ledgerIntegrity.service';

/** GET /admin/ledger-audit/:orgId — do this organization's books tie to its wallets? (super-admin only) */
export const getLedgerAudit = async (req: any, res: any) => {
    try {
        res.json(await auditOrganization(req.params.orgId));
    } catch (e: any) {
        res.status(500).json({ error: 'Audit failed', details: e?.message });
    }
};

/** POST /admin/ledger-audit/:orgId/heal — rebuild the ledger from the cashbook, then audit again. */
export const healLedger = async (req: any, res: any) => {
    try {
        const healed = await healOrganization(req.params.orgId, { deadlineMs: Date.now() + 40_000 });
        res.json({ healed, audit: await auditOrganization(req.params.orgId) });
    } catch (e: any) {
        res.status(500).json({ error: 'Heal failed', details: e?.message });
    }
};
