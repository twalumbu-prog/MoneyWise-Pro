/**
 * accountability.service.ts — the Accountability Safeguard.
 *
 * A person who asked for cash (an EXPENSE requisition) and hasn't reconciled it
 * yet (DISBURSED / EXPENSED) may still draft new requisitions, but no further
 * money is disbursed to them until that cycle is closed.
 *
 * The safeguard is keyed on requestor_id, so it is only meaningful for
 * requisitions a person actually raised. Scheduled payments and automations
 * insert requisitions with requestor_id = whoever set up the schedule or
 * automation, even though that person never asked for the funds and the money
 * goes to someone else. Counting those made one user's unreconciled
 * subscription payouts block a different user, so system-generated
 * requisitions are excluded on both sides: they never block anyone and are
 * never blocked.
 */

import { supabase } from '../lib/supabase';

const OUTSTANDING_STATUSES = ['DISBURSED', 'EXPENSED'];

export interface OutstandingRequisition {
    id: string;
    status: string;
    reference_number: string | null;
    description: string | null;
}

/** Ids among `ids` that were created by a schedule or an automation. */
async function systemGeneratedIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();

    const [scheduled, automated] = await Promise.all([
        supabase.from('scheduled_item_runs').select('requisition_id').in('requisition_id', ids),
        supabase.from('automation_runs').select('requisition_id').in('requisition_id', ids),
    ]);

    return new Set(
        [...(scheduled.data ?? []), ...(automated.data ?? [])]
            .map((r: any) => r.requisition_id as string | null)
            .filter((id): id is string => !!id)
    );
}

/** Expense requisitions this user raised and still has to reconcile, in this org. */
export async function getOutstandingRequisitions(
    userId: string,
    organizationId: string,
    excludeId?: string
): Promise<OutstandingRequisition[]> {
    let query = supabase
        .from('requisitions')
        .select('id, status, reference_number, description')
        .eq('requestor_id', userId)
        .eq('organization_id', organizationId)
        .in('status', OUTSTANDING_STATUSES)
        // LOAN/ADVANCE/PAYROLL are filed by an accountant on someone else's
        // behalf, so the requestor isn't the person holding the money.
        .or('type.is.null,type.eq.EXPENSE');
    if (excludeId) query = query.neq('id', excludeId);

    const { data, error } = await query;
    if (error) {
        console.error('[Accountability] Outstanding lookup failed:', error.message);
        return [];
    }

    const rows = (data ?? []) as OutstandingRequisition[];
    const system = await systemGeneratedIds(rows.map(r => r.id));
    return rows.filter(r => !system.has(r.id));
}

/**
 * User-facing refusal message when disbursing `requisitionId` must be blocked,
 * or null when it may proceed.
 */
export async function getAccountabilityBlock(requisitionId: string, organizationId: string): Promise<string | null> {
    const { data: target } = await supabase
        .from('requisitions')
        .select('requestor_id, type')
        .eq('id', requisitionId)
        .eq('organization_id', organizationId)
        .maybeSingle();

    if (!target?.requestor_id || (target.type && target.type !== 'EXPENSE')) return null;
    if ((await systemGeneratedIds([requisitionId])).size > 0) return null;

    const [outstanding] = await getOutstandingRequisitions(target.requestor_id, organizationId, requisitionId);
    if (!outstanding) return null;

    const ref = outstanding.reference_number || `#${outstanding.id.slice(0, 8)}`;
    return `Accountability Safeguard: the requestor has an outstanding requisition (${ref}, status ${outstanding.status}) that must be reconciled before more funds can be disbursed to them.`;
}
