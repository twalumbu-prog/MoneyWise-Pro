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
 *   META_WA_CONFIG_ID                   Embedded Signup configuration id (WhatsApp)
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

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const appHmac = (data: string) => crypto.createHmac('sha256', process.env.META_APP_SECRET as string).update(data).digest();
const sameBytes = (a: Buffer, b: Buffer) => a.length === b.length && crypto.timingSafeEqual(a, b);

/** Ties a Meta sign-up to the org and user who started it, for 15 minutes. */
export function signConnectState(p: { organizationId: string; userId: string }): string {
    const payload = b64url(JSON.stringify({ o: p.organizationId, u: p.userId, e: Date.now() + 15 * 60_000 }));
    return `${payload}.${b64url(appHmac(payload))}`;
}

export function verifyConnectState(state: unknown): { organizationId: string; userId: string } | null {
    if (typeof state !== 'string' || !process.env.META_APP_SECRET) return null;
    const [payload, sig] = state.split('.');
    if (!payload || !sig || !sameBytes(Buffer.from(sig, 'base64url'), appHmac(payload))) return null;
    try {
        const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return typeof d.e === 'number' && d.e > Date.now() && d.o && d.u ? { organizationId: d.o, userId: d.u } : null;
    } catch { return null; }
}

/** Meta's signed_request: base64url(HMAC-SHA256 of the payload).base64url(JSON). */
export function parseSignedRequest(signed: unknown): { userId: string } | null {
    if (typeof signed !== 'string' || !process.env.META_APP_SECRET) return null;
    const [sig, payload] = signed.split('.');
    if (!sig || !payload || !sameBytes(Buffer.from(sig, 'base64url'), appHmac(payload))) return null;
    try {
        const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return d.user_id ? { userId: String(d.user_id) } : null;
    } catch { return null; }
}

/** `friendly` is safe to show a user. The raw Graph message is only ever logged. */
export class MetaGraphError extends Error {
    constructor(message: string, public code: number | null, public friendly: string) { super(message); }
}

const friendlyGraphError = (code: number | null) => {
    if (code === 190) return 'Meta did not accept this sign-in. Please try connecting again.';
    if (code === 10 || code === 200) return 'Some permissions were declined. Try again and allow everything MoneyWise asks for.';
    return 'Meta could not finish this connection. Please try again.';
};

async function graph(path: string, opts: { method?: string; token?: string; query?: Record<string, string> } = {}): Promise<any> {
    const url = new URL(`https://graph.facebook.com/${graphVersion()}/${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const resp = await fetch(url, { method: opts.method ?? 'GET', headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : undefined });
    const body: any = await resp.json().catch(() => ({}));
    if (!resp.ok || body?.error) {
        const code = typeof body?.error?.code === 'number' ? body.error.code : null;
        throw new MetaGraphError(`Graph ${path.split('?')[0]} failed (${resp.status}, code ${code})`, code, friendlyGraphError(code));
    }
    return body;
}

/** Everything Meta needs for one WhatsApp number. Throws before anything is saved. */
export async function connectWhatsApp(p: { code: string; wabaId: string; phoneNumberId: string }) {
    const exchanged = await graph('oauth/access_token', {
        query: { client_id: process.env.META_APP_ID as string, client_secret: process.env.META_APP_SECRET as string, code: p.code },
    });
    const accessToken: string | undefined = exchanged.access_token;
    if (!accessToken) throw new MetaGraphError('No access token returned', null, friendlyGraphError(null));

    // The ids came from the browser, so confirm this token really controls this number.
    const numbers = await graph(`${encodeURIComponent(p.wabaId)}/phone_numbers`, { token: accessToken, query: { fields: 'id,verified_name,display_phone_number' } });
    const number = (numbers.data || []).find((n: any) => String(n.id) === p.phoneNumberId);
    if (!number) throw new MetaGraphError('Number not in this account', null, 'That WhatsApp number does not belong to the account you picked.');

    await graph(`${encodeURIComponent(p.wabaId)}/subscribed_apps`, { method: 'POST', token: accessToken });
    return {
        accessToken, displayName: number.verified_name as string | undefined, displayPhone: number.display_phone_number as string | undefined,
        expiresAt: exchanged.expires_in ? new Date(Date.now() + Number(exchanged.expires_in) * 1000) : null,
    };
}

export async function unsubscribeApp(accountId: string, token: string): Promise<void> {
    await graph(`${encodeURIComponent(accountId)}/subscribed_apps`, { method: 'DELETE', token });
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
    /** WhatsApp media id, or a Messenger/Instagram attachment URL. Downloaded by the worker. */
    mediaRef?: string | null;
    mediaMime?: string | null;
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
                        body: m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.image?.caption ?? m.document?.caption ?? null,
                        sentAt: new Date(Number(m.timestamp) * 1000), direction: 'IN',
                        mediaRef: m.image?.id ?? m.document?.id ?? null, mediaMime: m.image?.mime_type ?? m.document?.mime_type ?? null,
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
                    mediaRef: ev.message.attachments?.find((a: any) => a?.type === 'image' || a?.type === 'file')?.payload?.url ?? null,
                });
            }
        }
    }
    return out.filter(m => m.externalMessageId && m.contactId);
}

/** Stores messages for whichever org owns the receiving account; returns inserted row ids for classification. */

export async function ingestMessages(
    messages: InboundMessage[]
): Promise<{ id: string; organization_id: string }[]> {

    const results = await Promise.all(
        messages.map(async (m) => {
            const { data, error } = await supabase.rpc('ingest_meta_message', {
                p_platform: m.platform,
                p_external_account_id: m.externalAccountId,
                p_external_message_id: m.externalMessageId,
                p_contact_id: m.contactId,
                p_contact_name: m.contactName ?? null,
                p_contact_phone: m.contactPhone ?? null,
                p_message_type: m.type,
                p_body: m.body,
                p_sent_at: m.sentAt.toISOString(),
                p_media_ref: m.mediaRef ?? null,
                p_media_mime: m.mediaMime ?? null,
            });

            // A database failure must propagate so Meta can retry.
            if (error) {
                console.error('[Meta] atomic message ingestion failed:', error.message);
                throw new Error(`Meta message ingestion failed: ${error.message}`);
            }

            const result = data as {
                status: 'inserted' | 'duplicate' | 'unknown_connection';
                message_id?: string;
                organization_id?: string;
            } | null;

            if (!result) {
                throw new Error('[Meta] ingestion function returned an empty result');
            }

            if (result.status === 'unknown_connection') {
                console.warn(
                    `[Meta] no connection for ${m.platform} ${m.externalAccountId}; message discarded`
                );
                return null;
            }

            if (result.status === 'duplicate') {
                return null;
            }

            if (result.status !== 'inserted' || !result.message_id || !result.organization_id) {
                throw new Error('[Meta] ingestion function returned an unexpected result');
            }

            return {
                id: result.message_id,
                organization_id: result.organization_id,
            };
        })
    );

    return results.filter(
        (item): item is { id: string; organization_id: string } => item !== null
    );
}


/** Saves a connection with its token encrypted. */
export async function saveConnection(p: {
    organizationId: string; userId?: string; platform: MessagingPlatform; externalId: string; parentExternalId?: string;
    displayName?: string; displayPhone?: string; accessToken: string; expiresAt?: Date | null;
}) {
    return supabase.from('messaging_connections').upsert({
        organization_id: p.organizationId, connected_by: p.userId ?? null, platform: p.platform, external_id: p.externalId,
        parent_external_id: p.parentExternalId ?? null, display_name: p.displayName ?? null, display_phone: p.displayPhone ?? null,
        access_token_enc: encryptToken(p.accessToken), token_expires_at: p.expiresAt?.toISOString() ?? null,
        status: 'ACTIVE', last_error: null, notified_expired_at: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'platform,external_id' }).select('id').single();
}
