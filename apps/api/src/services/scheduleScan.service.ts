import { supabase } from '../lib/supabase';
import { classifyEmail } from './emailIntent.service';
import { scheduleFromEmailPatterns } from './scheduleAuto.service';

/**
 * Reads the emails that were classified BEFORE bills could be told apart (before the reader knew about due dates and repeating), so a bill that is
 * already in the mailbox, like last month's Supabase invoice, can still be added to Schedules. Money-out invoices and receipts from the last
 * year or so are re-read a few at a time (one AI call each); each is marked as read, so nothing is read twice. Anything that repeats is added by the
 * same rules as a new email (see scheduleAuto.scheduleFromEmail).
 */
const WINDOW_DAYS = 400;
const BATCH = 10;

const pending = (orgId: string) => supabase.from('inbound_emails').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId).eq('prefilter_passed', true).in('intent', ['INVOICE', 'RECEIPT']).eq('direction', 'OUT')
    .is('schedule_scanned_at', null).gte('received_at', new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString());

export async function scanEmailsForBills(orgId: string): Promise<{ scanned: number; added: number; remaining: number }> {
    const { data: batch } = await supabase.from('inbound_emails').select('id, scheduled_item_id')
        .eq('organization_id', orgId).eq('prefilter_passed', true).in('intent', ['INVOICE', 'RECEIPT']).eq('direction', 'OUT')
        .is('schedule_scanned_at', null).gte('received_at', new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString())
        .order('received_at', { ascending: false }).limit(BATCH);
    let scanned = 0, added = 0;
    for (const e of (batch ?? []) as any[]) {
        await classifyEmail(e.id, orgId, { force: true });
        // marked read even if the reading failed, so one bad email can't be retried forever
        await supabase.from('inbound_emails').update({ schedule_scanned_at: new Date().toISOString() }).eq('id', e.id).eq('organization_id', orgId);
        scanned++;
        if (!e.scheduled_item_id) {
            const { data: after } = await supabase.from('inbound_emails').select('scheduled_item_id, intent_cadence').eq('id', e.id).maybeSingle();
            if (after?.scheduled_item_id) {
                const { data: item } = await supabase.from('scheduled_items').select('source_email_id').eq('id', after.scheduled_item_id).maybeSingle();
                if (item?.source_email_id === e.id) added++;   // this email made a new item (it did not just point at an existing one)
            }
        }
    }
    const { count } = await pending(orgId);
    // When every email has been read, look across them for a payee that bills on a regular rhythm.
    if ((count ?? 0) === 0) added += await scheduleFromEmailPatterns(orgId);
    return { scanned, added, remaining: count ?? 0 };
}
