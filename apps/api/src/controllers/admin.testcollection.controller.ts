import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { LencoService } from '../services/lenco.service';

/**
 * TEMPORARY: live-account test harness for validating the Collections API
 * (server-initiated mobile money) as a replacement for the LencoPay widget
 * redirect. Runs against a real, already-linked test organization's own Lenco
 * secret key/subaccount, so settlement follows the same per-org key pairing
 * production checkout already relies on. Remove once the migration is decided.
 */

async function getOrgLencoCreds(organizationId: string) {
    const { data, error } = await supabase
        .from('organizations')
        .select('name, lenco_subaccount_id, lenco_secret_key')
        .eq('id', organizationId)
        .single();
    if (error || !data) throw new Error('Organization not found');
    if (!data.lenco_secret_key) throw new Error('Organization has no Lenco secret key linked');
    return data;
}

export const testCollectionInitiate = async (req: Request, res: Response) => {
    try {
        const { organizationId, amount, phone, operator, reference } = req.body;
        if (!organizationId || !amount || !phone || !operator) {
            return res.status(400).json({ error: 'organizationId, amount, phone, and operator are required' });
        }

        const org = await getOrgLencoCreds(organizationId);
        const ref = reference || `LIVE-TEST-${Date.now()}`;

        const result = await LencoService.initiateMobileMoneyCollection({
            amount: Number(amount),
            reference: ref,
            phone,
            operator,
        }, org.lenco_secret_key);

        return res.json({ success: true, orgName: org.name, data: result });
    } catch (error: any) {
        console.error('[Admin Test Collection] Initiate error:', error.message);
        return res.status(500).json({ error: error.message });
    }
};

export const testCollectionStatusCheck = async (req: Request, res: Response) => {
    try {
        const { organizationId } = req.query;
        const { reference } = req.params;
        if (!organizationId || typeof organizationId !== 'string') {
            return res.status(400).json({ error: 'organizationId query param is required' });
        }

        const org = await getOrgLencoCreds(organizationId);
        const result = await LencoService.getCollectionStatus(reference, org.lenco_secret_key);

        return res.json({ success: true, data: result });
    } catch (error: any) {
        console.error('[Admin Test Collection] Status error:', error.message);
        return res.status(500).json({ error: error.message });
    }
};
