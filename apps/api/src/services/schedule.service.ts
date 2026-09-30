/**
 * schedule.service.ts — Turns a scheduled item's due date into a requisition.
 *
 * Two callers share `triggerScheduledItem`: the "Run Now" button and the
 * scheduler (`processDueScheduledItems`, driven by the automations tick).
 * Until the scheduler existed nothing ever fired a scheduled item on its own —
 * items sat past their due date forever unless someone pressed Run Now.
 *
 * The requisition is created PENDING_APPROVAL either way: a schedule never
 * moves money by itself, a human still approves it.
 */

import { addDays, addWeeks, addMonths, addQuarters, format, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { emailService } from './email.service';
import { pushService } from './push.service';

/** Today in the users' timezone (Zambia, UTC+2, no DST) as yyyy-MM-dd. */
export function lusakaToday(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lusaka' });
}

export function advanceDueDate(currentDate: string, cadence: string): string {
    const d = parseISO(currentDate);
    let next: Date;
    switch (cadence) {
        case 'DAILY':     next = addDays(d, 1);     break;
        case 'WEEKLY':    next = addWeeks(d, 1);    break;
        case 'BIWEEKLY':  next = addWeeks(d, 2);    break;
        case 'QUARTERLY': next = addQuarters(d, 1); break;
        case 'MONTHLY':
        default:          next = addMonths(d, 1);   break;
    }
    return format(next, 'yyyy-MM-dd');
}

export interface TriggerResult {
    requisition: any;
    nextDueDate: string;
}

/**
 * Fire one occurrence of a scheduled item.
 *
 * `skipToFuture` (scheduler only): an item that is several cycles overdue is
 * fired ONCE and then moved to its next date after today, instead of being
 * fired again on every tick until it catches up.
 *
 * Returns null when another caller already claimed this occurrence.
 */
export async function triggerScheduledItem(
    item: any,
    requestorId: string,
    opts: { skipToFuture?: boolean } = {}
): Promise<TriggerResult | null> {
    const organizationId = item.organization_id;

    // Make sure a run row exists for this due date, then claim it. The
    // UPCOMING → PROCESSING flip is the lock: only one caller gets a row back.
    await supabase.from('scheduled_item_runs').upsert(
        { scheduled_item_id: item.id, organization_id: organizationId, due_date: item.next_due_date, status: 'UPCOMING' },
        { onConflict: 'scheduled_item_id,due_date', ignoreDuplicates: true }
    );

    const { data: claimed } = await supabase
        .from('scheduled_item_runs')
        .update({ status: 'PROCESSING', triggered_at: new Date().toISOString() })
        .eq('scheduled_item_id', item.id)
        .eq('due_date', item.next_due_date)
        .eq('status', 'UPCOMING')
        .select('id')
        .maybeSingle();

    if (!claimed) return null;

    const revertClaim = () =>
        supabase.from('scheduled_item_runs').update({ status: 'UPCOMING', triggered_at: null }).eq('id', claimed.id);

    const reqInsertData: Record<string, any> = {
        organization_id: organizationId,
        requestor_id: requestorId,
        estimated_total: item.amount,
        status: 'PENDING_APPROVAL',
        description: `Scheduled payment: ${item.title}`,
    };
    if (item.payment_method) {
        reqInsertData.payment_method = item.payment_method;
        reqInsertData.recipient_account = item.recipient_account ?? null;
        reqInsertData.recipient_bank_code = item.recipient_bank_code ?? null;
        reqInsertData.recipient_name = item.recipient_name ?? null;
    }

    const { data: requisition, error: reqErr } = await supabase
        .from('requisitions')
        .insert(reqInsertData)
        .select()
        .single();

    if (reqErr || !requisition) {
        await revertClaim();
        throw reqErr ?? new Error('Requisition insert returned no row');
    }

    await supabase.from('scheduled_item_runs').update({ requisition_id: requisition.id }).eq('id', claimed.id);

    let nextDueDate = advanceDueDate(item.next_due_date, item.cadence);
    if (opts.skipToFuture) {
        const today = lusakaToday();
        while (nextDueDate <= today) nextDueDate = advanceDueDate(nextDueDate, item.cadence);
    }

    await supabase
        .from('scheduled_items')
        .update({ next_due_date: nextDueDate, updated_at: new Date().toISOString() })
        .eq('id', item.id);

    await supabase.from('scheduled_item_runs').upsert(
        { scheduled_item_id: item.id, organization_id: organizationId, due_date: nextDueDate, status: 'UPCOMING' },
        { onConflict: 'scheduled_item_id,due_date', ignoreDuplicates: true }
    );

    // Same fan-out a hand-created requisition gets, so approvers actually hear about it.
    emailService.notifyRequisitionEvent(requisition.id, 'NEW_REQUISITION').catch(err =>
        console.error('[Schedule] NEW_REQUISITION email failed:', err)
    );
    pushService.notifyRequisitionEvent(requisition.id, 'NEW_REQUISITION').catch(err =>
        console.error('[Schedule] NEW_REQUISITION push failed:', err)
    );

    return { requisition, nextDueDate };
}

export interface DueScheduleSummary {
    due: number;
    triggered: number;
    failed: number;
    errors: string[];
}

/** Fire every ACTIVE scheduled item whose due date has arrived. */
export async function processDueScheduledItems(budgetMs = 20_000): Promise<DueScheduleSummary> {
    const started = Date.now();
    const summary: DueScheduleSummary = { due: 0, triggered: 0, failed: 0, errors: [] };

    const { data: dueItems, error } = await supabase
        .from('scheduled_items')
        .select('*')
        .eq('status', 'ACTIVE')
        .lte('next_due_date', lusakaToday())
        .order('next_due_date', { ascending: true })
        .limit(50);

    if (error) {
        summary.errors.push(`load due items: ${error.message}`);
        return summary;
    }

    summary.due = dueItems?.length ?? 0;

    for (const item of dueItems ?? []) {
        if (Date.now() - started > budgetMs) break;
        try {
            const result = await triggerScheduledItem(item, item.created_by, { skipToFuture: true });
            if (result) summary.triggered++;
        } catch (err: any) {
            summary.failed++;
            summary.errors.push(`${item.title}: ${err.message}`);
            console.error(`[Schedule] Could not trigger "${item.title}":`, err);
        }
    }

    return summary;
}

/**
 * Runs were only ever created as PROCESSING and never advanced, so the history
 * never showed a payment as Completed. Follow the requisition instead.
 */
export async function syncScheduledRunStatuses(): Promise<number> {
    const { data: runs } = await supabase
        .from('scheduled_item_runs')
        .select('id, requisition_id, requisitions(status)')
        .eq('status', 'PROCESSING')
        .not('requisition_id', 'is', null)
        .limit(200);

    let updated = 0;
    for (const run of runs ?? []) {
        const reqStatus = (run as any).requisitions?.status as string | undefined;
        if (!reqStatus) continue;

        let next: 'COMPLETED' | 'FAILED' | null = null;
        if (reqStatus === 'REJECTED') next = 'FAILED';
        else if (!['DRAFT', 'PENDING_APPROVAL', 'AUTHORISED', 'PROCESSING'].includes(reqStatus)) next = 'COMPLETED';

        if (next) {
            await supabase.from('scheduled_item_runs').update({ status: next }).eq('id', run.id);
            updated++;
        }
    }
    return updated;
}
