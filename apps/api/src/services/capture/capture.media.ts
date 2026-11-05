/**
 * Downloads a chat attachment into the private bucket. WhatsApp sends a media id that must be resolved with the
 * connection's token; Messenger and Instagram send a URL that expires. Either way the file is kept once, by hash.
 */
import crypto from 'crypto';
import { supabase } from '../../lib/supabase';
import { decryptToken } from '../../lib/tokenCrypto';
import { graphVersion } from '../meta.service';
import { CAPTURE_BUCKET } from './capture.service';
import { lusakaDate } from './capture.logic';

const MAX_BYTES = 10 * 1024 * 1024;
const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

async function markExpired(connectionId: string) {
    await supabase.from('messaging_connections').update({ status: 'EXPIRED', last_error: 'Token rejected by Meta', updated_at: new Date().toISOString() }).eq('id', connectionId);
}

export async function storeMessageMedia(msg: any): Promise<{ attachmentId: string } | null> {
    const orgId = msg.organization_id as string;
    const { data: conn } = await supabase.from('messaging_connections').select('id, access_token_enc')
        .eq('id', msg.connection_id).eq('organization_id', orgId).maybeSingle();
    if (!conn?.access_token_enc) throw new Error('Connection has no token');
    const headers = { Authorization: `Bearer ${decryptToken(conn.access_token_enc)}` };

    let url: string = msg.media_ref;
    const isGraphId = !/^https?:/i.test(url);
    if (isGraphId) {
        const meta = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(url)}`, { headers });
        const body: any = await meta.json().catch(() => ({}));
        if (body?.error?.code === 190) { await markExpired(conn.id); throw new Error('Meta token expired'); }
        if (!meta.ok || !body?.url) throw new Error(`Could not resolve media (${meta.status})`);
        url = body.url;
    }

    const file = await fetch(url, isGraphId ? { headers } : undefined);
    if (!file.ok) throw new Error(`Could not download media (${file.status})`);
    const mime = String(msg.media_mime || file.headers.get('content-type') || '');
    return saveEvidenceFile({ orgId, buf: Buffer.from(await file.arrayBuffer()), mime, sourceTable: 'messaging_messages', sourceId: msg.id });
}

/** Stores a file once per org and queues it for OCR. Returns null for types we can't read (voice notes, video). */
export async function saveEvidenceFile(f: { orgId: string; buf: Buffer; mime: string; sourceTable: 'messaging_messages' | 'inbound_emails'; sourceId: string }): Promise<{ attachmentId: string } | null> {
    const mime = f.mime.split(';')[0].trim().toLowerCase();
    if (!MIME_EXT[mime] || f.buf.length === 0 || f.buf.length > MAX_BYTES) return null;

    const sha256 = crypto.createHash('sha256').update(f.buf).digest('hex');
    const { data: dup } = await supabase.from('capture_attachments').select('id').eq('organization_id', f.orgId).eq('sha256', sha256).maybeSingle();
    if (dup) return { attachmentId: dup.id };

    const path = `${f.orgId}/${lusakaDate(new Date().toISOString()).slice(0, 7)}/${sha256}.${MIME_EXT[mime]}`;
    const { error: upErr } = await supabase.storage.from(CAPTURE_BUCKET).upload(path, f.buf, { contentType: mime, upsert: false });
    if (upErr && !/exists/i.test(upErr.message)) throw new Error(`Could not store file: ${upErr.message}`);
    const { data: att, error } = await supabase.from('capture_attachments').insert({
        organization_id: f.orgId, source_table: f.sourceTable, source_id: f.sourceId, storage_path: path, mime, size_bytes: f.buf.length, sha256,
    }).select('id').single();
    if (error || !att) throw new Error(`Could not save file: ${error?.message}`);
    const { error: jobErr } = await supabase.from('capture_jobs').insert({ kind: 'ATTACHMENT', attachment_id: att.id, organization_id: f.orgId });
    if (jobErr) throw new Error(`Could not queue file: ${jobErr.message}`);
    return { attachmentId: att.id };
}
