import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { encryptToken } from '../lib/tokenCrypto';

/**
 * Meta messaging (WhatsApp Cloud API, Messenger, Instagram DMs).
 *
 * Env (set on the PROD API — webhooks are delivered there):
 *   META_APP_ID, META_APP_SECRET        Meta developer app credentials
 *   META_WEBHOOK_VERIFY_TOKEN           any random string; entered in the app's webhook config
 *   META_GRAPH_VERSION                  optional, default v21.0
 *   MESSAGING_TOKEN_KEY                 32-byte key for token encryption at rest
 *   META_WA_CONFIG_ID                   optional, Embedded Signup configuration id (WhatsApp)
 *
 * Phase 1 is read-only: messages are ingested and classified; nothing is sent back.
 */
export type MessagingPlatform = 'WHATSAPP' | 'FACEBOOK' | 'INSTAGRAM';

export const graphVersion = () => process.env.META_GRAPH_VERSION || 'v21.0';
export const isMetaConfigured = () =>
    !!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN && process.env.MESSAGING_TOKEN_KEY);

/** Constant-time check of Meta's X-Hub-Signature-256 ("sha256=<hex>") over the exact raw body. */
export function verifySignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
    const secret = process.env.META_APP_SECRET;
    if (!secret || !rawBody || !header?.startsWith('sha256=')) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const got = header.slice(7);
    if (got.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export interface InboundMessage {
    platform: MessagingPlatform;
    externalAccountId: string;   // phone_number_id / page id / IG account id — resolves the org
    externalMessageId: string;
    contactId: string;
    contactName?: string | null;
    contactPhone?: string | null;
    type: string;
    body: string | null;
    sentAt: Date;
    direction: 'IN' | 'OUT';
}

/** Flattens a Meta webhook payload (whatsapp_business_account | page | instagram) into messages. */
export function parseWebhook(payload: any): InboundMessage[] {
    const out: InboundMessage[] = [];
    const object = payload?.object;
    for (const entry of payload?.entry || []) {
        if (object === 'whatsapp_business_account') {
            for (const change of entry.changes || []) {
                const v = change.value || {};
                const phoneNumberId = v.metadata?.phone_number_id;
                if (!phoneNumberId) continue;
                const names = new Map<string, string>((v.contacts || []).map((c: any) => [c.wa_id, c.profile?.name]));
                for (const m of v.messages || []) {
                    out.push({
                        platform: 'WHATSAPP', externalAccountId: String(phoneNumberId), externalMessageId: m.id,
                        contactId: m.from, contactName: names.get(m.from) || null, contactPhone: m.from, type: m.type || 'text',
                        body: m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.image?.caption ?? null,
                        sentAt: new Date(Number(m.timestamp) * 1000), direction: 'IN',
                    });
                }
            }
        } else if (object === 'page' || object === 'instagram') {
            const platform: MessagingPlatform = object === 'page' ? 'FACEBOOK' : 'INSTAGRAM';
            for (const ev of entry.messaging || []) {
                if (!ev.message || ev.message.is_echo) continue; // echoes = our own outbound; skip in Phase 1
                out.push({
                    platform, externalAccountId: String(entry.id), externalMessageId: ev.message.mid,
                    contactId: String(ev.sender?.id), type: ev.message.attachments ? 'attachment' : 'text',
                    body: ev.message.text ?? null, sentAt: new Date(ev.timestamp || Date.now()), direction: 'IN',
                });
            }
        }
    }
    return out.filter(m => m.externalMessageId && m.contactId);
}

/** Stores messages for whichever org owns the receiving account; returns inserted row ids for classification. */
export async function ingestMessages(messages: InboundMessage[]): Promise<{ id: string; organization_id: string }[]> {
    const inserted: { id: string; organization_id: string }[] = [];
    for (const m of messages) {
        const { data: conn } = await supabase.from('messaging_connections').select('id, organization_id')
            .eq('platform', m.platform).eq('external_id', m.externalAccountId).neq('status', 'DISCONNECTED').maybeSingle();
        if (!conn) { console.warn(`[Meta] no connection for ${m.platform} ${m.externalAccountId}`); continue; }
        const { data, error } = await supabase.from('messaging_messages').upsert({
            organization_id: conn.organization_id, connection_id: conn.id, platform: m.platform, direction: m.direction,
            external_message_id: m.externalMessageId, contact_id: m.contactId, contact_name: m.contactName ?? null,
            contact_phone: m.contactPhone ?? null, message_type: m.type, body: m.body, sent_at: m.sentAt.toISOString(),
        }, { onConflict: 'connection_id,external_message_id', ignoreDuplicates: true }).select('id').maybeSingle();
        if (error) { console.error('[Meta] ingest failed:', error.message); continue; }
        if (data) {
            inserted.push({ id: data.id, organization_id: conn.organization_id });
            await supabase.from('messaging_connections').update({ last_message_at: new Date().toISOString() }).eq('id', conn.id);
        }
    }
    return inserted;
}

/** Saves a connection with its token encrypted. Used by the (stubbed) connect callbacks. */
export async function saveConnection(p: {
    organizationId: string; userId?: string; platform: MessagingPlatform; externalId: string; parentExternalId?: string;
    displayName?: string; displayPhone?: string; accessToken: string; expiresAt?: Date | null;
}) {
    return supabase.from('messaging_connections').upsert({
        organization_id: p.organizationId, connected_by: p.userId ?? null, platform: p.platform, external_id: p.externalId,
        parent_external_id: p.parentExternalId ?? null, display_name: p.displayName ?? null, display_phone: p.displayPhone ?? null,
        access_token_enc: encryptToken(p.accessToken), token_expires_at: p.expiresAt?.toISOString() ?? null,
        status: 'ACTIVE', last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'platform,external_id' }).select('id').single();
}
