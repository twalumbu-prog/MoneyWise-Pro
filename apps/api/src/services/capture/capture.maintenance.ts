/** Daily housekeeping: expired Meta connections, and the 90-day purge of evidence that never became a transaction. */
import { supabase } from '../../lib/supabase';
import { emailService } from '../email.service';
import { CAPTURE_BUCKET } from './capture.service';

const RETENTION_DAYS = 90;
const BATCH = 200;

export async function checkMetaTokens() {
    const now = new Date().toISOString();
    await supabase.from('messaging_connections').update({ status: 'EXPIRED', updated_at: now })
        .eq('status', 'ACTIVE').lt('token_expires_at', now);

    const { data: expired, error } = await supabase.from('messaging_connections')
        .select('id, organization_id, platform, display_name').eq('status', 'EXPIRED').is('notified_expired_at', null).limit(100);
    if (error) throw new Error(`Could not load connections: ${error.message}`);

    let notified = 0;
    for (const c of expired || []) {
        const to = await emailService.getEmailsByRoles(c.organization_id, ['OWNER', 'ADMIN']);
        if (to.length) {
            const name = c.display_name || 'Your messaging account';
            await emailService.sendEmail({
                to, orgId: c.organization_id, subject: `Reconnect ${name} to MoneyWise`,
                html: `<p>${name} has been disconnected from MoneyWise, so new messages are not being captured.</p><p>Open Settings → Integrations and tap Reconnect.</p>`,
            });
        }
        // Stamped even with no recipients: the owner gets one email at most, never one a day.
        await supabase.from('messaging_connections').update({ notified_expired_at: new Date().toISOString() }).eq('id', c.id);
        notified++;
    }
    return { notified };
}

/** Ids from `ids` that a live capture still relies on. A dismissed capture doesn't count. */
async function keptBy(ids: string[]): Promise<Set<string>> {
    const { data, error } = await supabase.from('transaction_captures').select('source_ids').overlaps('source_ids', ids).neq('status', 'DISMISSED');
    if (error) throw new Error(`Could not check captures: ${error.message}`);
    return new Set((data || []).flatMap((c: any) => c.source_ids || []));
}

export async function purgeOldEvidence(budgetMs: number) {
    const deadline = Date.now() + budgetMs;
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
    const result = { messages: 0, files: 0 };

    // Bodies are blanked rather than rows deleted, so duplicate webhook deliveries are still recognised.
    let from = 0;
    while (Date.now() < deadline) {
        const { data: msgs, error } = await supabase.from('messaging_messages').select('id, conversation_id')
            .lt('sent_at', cutoff).not('body', 'is', null).order('sent_at').range(from, from + BATCH - 1);
        if (error) throw new Error(`Could not load messages: ${error.message}`);
        if (!msgs?.length) break;
        const ids = msgs.map((m: any) => m.id);
        const kept = await keptBy(ids);
        const conversationIds = Array.from(new Set(msgs.map((m: any) => m.conversation_id).filter(Boolean)));
        const { data: liveThreads, error: threadErr } = conversationIds.length
            ? await supabase.from('transaction_captures').select('conversation_id').in('conversation_id', conversationIds).neq('status', 'DISMISSED')
            : { data: [] as any[], error: null };
        if (threadErr) throw new Error(`Could not check conversations: ${threadErr.message}`);
        const liveThread = new Set((liveThreads || []).map((c: any) => c.conversation_id));
        const purge = msgs.filter((m: any) => !kept.has(m.id) && !liveThread.has(m.conversation_id)).map((m: any) => m.id);
        if (purge.length) {
            const { error: upErr } = await supabase.from('messaging_messages').update({ body: null, media_ref: null }).in('id', purge);
            if (upErr) throw new Error(`Could not purge messages: ${upErr.message}`);
            result.messages += purge.length;
        }
        from += ids.length - purge.length;   // kept rows stay in the result set, so step over them
    }

    from = 0;
    while (Date.now() < deadline) {
        const { data: atts, error } = await supabase.from('capture_attachments').select('id, storage_path')
            .lt('created_at', cutoff).order('created_at').range(from, from + BATCH - 1);
        if (error) throw new Error(`Could not load files: ${error.message}`);
        if (!atts?.length) break;
        const kept = await keptBy(atts.map((a: any) => a.id));
        const purge = atts.filter((a: any) => !kept.has(a.id));
        if (purge.length) {
            await supabase.storage.from(CAPTURE_BUCKET).remove(purge.map((a: any) => a.storage_path));
            await supabase.from('capture_attachments').delete().in('id', purge.map((a: any) => a.id));
            result.files += purge.length;
        }
        from += atts.length - purge.length;
    }
    return result;
}
