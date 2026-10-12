import { supabase } from '../lib/supabase';

/**
 * Plan entitlements — the single server-side source of truth for what an
 * organization's subscription allows. Previously the plan limits (e.g. the
 * Free plan's 1 team member) existed only as text in the billing UI, so
 * nothing stopped a Free org from adding members or connecting Master Fees.
 */

export type PlanEntitlements = {
    planId: string;
    status: string;
    isPremium: boolean;
    /** null = unlimited */
    maxMembers: number | null;
};

export class PlanLimitError extends Error {
    readonly code = 'PLAN_LIMIT';
    readonly httpStatus = 402;
    constructor(message: string) {
        super(message);
        this.name = 'PlanLimitError';
    }
}

export async function getEntitlements(organizationId: string): Promise<PlanEntitlements> {
    const { data: sub } = await supabase
        .from('organization_subscriptions')
        .select('plan_id, status')
        .eq('organization_id', organizationId)
        .maybeSingle();

    const planId = sub?.plan_id || 'free';
    const { data: plan } = await supabase
        .from('subscription_plans')
        .select('max_members')
        .eq('id', planId)
        .maybeSingle();

    return {
        planId,
        status: sub?.status || 'active',
        isPremium: planId === 'premium',
        // Unknown plan row => fall back to the Free plan's limit rather than unlimited.
        maxMembers: plan ? (plan.max_members ?? null) : 1,
    };
}

/** Members that count toward the plan limit: active + invited (pending) memberships. */
export async function countOrgMembers(organizationId: string): Promise<number> {
    const { count } = await supabase
        .from('user_organizations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('status', ['ACTIVE', 'PENDING', 'INVITED']);
    return count || 0;
}

/** Throws PlanLimitError when adding one more member would exceed the plan's cap. */
export async function assertCanAddMember(organizationId: string): Promise<void> {
    const ent = await getEntitlements(organizationId);
    if (ent.maxMembers === null) return;
    const current = await countOrgMembers(organizationId);
    if (current >= ent.maxMembers) {
        throw new PlanLimitError(
            `Your ${ent.planId === 'free' ? 'Free' : ent.planId} plan is limited to ${ent.maxMembers} team member${ent.maxMembers === 1 ? '' : 's'}. ` +
            'Upgrade to Premium under Settings → Subscription & Billing to add more people.'
        );
    }
}

/** Throws PlanLimitError unless the org is on Premium. `feature` is shown to the user. */
export async function assertPremium(organizationId: string, feature: string): Promise<void> {
    const ent = await getEntitlements(organizationId);
    if (!ent.isPremium) {
        throw new PlanLimitError(
            `${feature} requires a Premium plan. Upgrade under Settings → Subscription & Billing.`
        );
    }
}
