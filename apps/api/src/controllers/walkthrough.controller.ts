import { supabase } from '../lib/supabase';
import { isPersonalOrganization } from '../lib/orgType';

/**
 * GET /onboarding/walkthrough — which of the getting-started steps this organization has ACTUALLY done.
 *
 * The app's walkthrough card decides "what to do next" from these facts, so a step ticks itself the moment the
 * person really does it (a deposit lands, a savings pot exists, a payment goes out …) rather than when they tap a button.
 * Cheap head-counts only; one round trip.
 */
const SENT_STATUSES = ['DISBURSED', 'PROCESSING', 'RECEIVED', 'EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZING', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'];

export const getWalkthroughProgress = async (req: any, res: any) => {
    try {
        const orgId = req.user?.organization_id;
        const userId = req.user?.id;
        if (!orgId) return res.status(400).json({ error: 'Organization context missing' });

        const count = async (q: any) => {
            const { count: c, error } = await q;
            return error ? 0 : (c ?? 0);
        };
        const head = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true });

        const [personal, orgRow, deposits, goals, funded, sent, invested, budgets, assistant, members] = await Promise.all([
            isPersonalOrganization(orgId),
            supabase.from('organizations').select('created_at, logo_url, phone, address, website, tax_id').eq('id', orgId).maybeSingle().then(r => r.data as any),
            // real money in: completed inflows that are not opening balances, savings movements or change returns
            count(head('cashbook_entries').eq('organization_id', orgId).eq('entry_type', 'INFLOW').neq('status', 'PENDING').gt('debit', 0)
                .not('description', 'ilike', '%savings%').not('description', 'ilike', 'Opening%').not('external_reference', 'like', 'CHG-%')),
            count(head('savings_goals').eq('organization_id', orgId)),
            supabase.from('savings_goals').select('id').eq('organization_id', orgId).then(async (r) => {
                const ids = (r.data || []).map((g: any) => g.id);
                if (ids.length === 0) return 0;
                return count(head('savings_contributions').in('goal_id', ids).eq('status', 'CONFIRMED'));
            }),
            count(head('requisitions').eq('organization_id', orgId).in('status', SENT_STATUSES)),
            count(head('investments').eq('investor_organization_id', orgId).neq('status', 'FAILED')),
            count(head('budgets').eq('organization_id', orgId)),
            count(head('agent_threads').eq('organization_id', orgId).eq('user_id', userId)),
            count(head('user_organizations').eq('organization_id', orgId)),
        ]);

        const created = orgRow?.created_at ? new Date(orgRow.created_at).getTime() : Date.now();
        res.json({
            accountType: personal ? 'PERSONAL' : 'BUSINESS',
            accountAgeDays: Math.max(0, Math.floor((Date.now() - created) / 86_400_000)),
            facts: {
                deposited: deposits > 0,
                savingsCreated: goals > 0,
                savingsFunded: funded > 0,
                sentMoney: sent > 0,
                invested: invested > 0,
                budgetSet: budgets > 0,
                usedAssistant: assistant > 0,
                teamInvited: members > 1,
                profilePhoto: !!orgRow?.logo_url,
                businessProfile: !!(orgRow?.phone || orgRow?.address || orgRow?.website || orgRow?.tax_id),
            },
        });
    } catch (e: any) {
        console.error('[Walkthrough] progress failed:', e?.message);
        res.status(500).json({ error: 'Could not load walkthrough progress' });
    }
};
