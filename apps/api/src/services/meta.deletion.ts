/**
 * Meta's data-deletion callback. Removes the person's messages and files and strips their details from captures.
 * Ledger entries stay: they are the business's own accounting records.
 */
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { CAPTURE_BUCKET } from './capture/capture.service';

const BATCH = 200;

export async function deleteMetaUserData(metaUserId: string): Promise<string> {
    const code = crypto.randomBytes(12).toString('hex');
    const userHash = crypto.createHash('sha256').update(metaUserId).digest('hex');
    const { error } = await supabase.from('meta_deletion_requests').insert({ confirmation_code: code, user_hash: userHash });
    if (error) throw new Error(`Could not record the request: ${error.message}`);

    let deleted = 0;
    try {
        for (;;) {
            const { data: msgs, error: readErr } = await supabase.from('messaging_messages').select('id').eq('contact_id', metaUserId).limit(BATCH);
            if (readErr) throw new Error(readErr.message);
            if (!msgs?.length) break;
            const ids = msgs.map((m: any) => m.id);

            const { data: atts } = await supabase.from('capture_attachments').select('id, storage_path')
                .eq('source_table', 'messaging_messages').in('source_id', ids);
            if (atts?.length) {
                await supabase.storage.from(CAPTURE_BUCKET).remove(atts.map((a: any) => a.storage_path));
                await supabase.from('capture_attachments').delete().in('id', atts.map((a: any) => a.id));
            }
            await supabase.from('transaction_captures')
                .update({ counterparty_name: null, counterparty_phone: null, evidence_summary: null, updated_at: new Date().toISOString() })
                .overlaps('source_ids', ids);
            const { error: delErr } = await supabase.from('messaging_messages').delete().in('id', ids);
            if (delErr) throw new Error(delErr.message);
            deleted += ids.length;
        }
        await supabase.from('capture_conversations').delete().eq('contact_id', metaUserId);
        await supabase.from('meta_deletion_requests').update({ status: 'COMPLETE', messages_deleted: deleted, completed_at: new Date().toISOString() }).eq('confirmation_code', code);
    } catch (e) {
        await supabase.from('meta_deletion_requests').update({ status: 'FAILED', messages_deleted: deleted }).eq('confirmation_code', code);
        throw e;
    }
    return code;
}

export async function deletionStatus(code: string): Promise<string | null> {
    if (!/^[0-9a-f]{24}$/.test(code)) return null;
    const { data } = await supabase.from('meta_deletion_requests').select('status').eq('confirmation_code', code).maybeSingle();
    return data?.status ?? null;
}
