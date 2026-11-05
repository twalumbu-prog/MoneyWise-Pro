import crypto from 'crypto';
import axios from 'axios';
import { supabase } from '../lib/supabase';
import { encryptToken, decryptToken } from '../lib/tokenCrypto';
import { passesPrefilter, classifyEmail } from './emailIntent.service';

/**
 * Gmail capture (AI Transaction Capture). A business connects its mailbox with "Sign in with Google"
 * (scope gmail.readonly); a cron pulls new mail, keeps what looks like money and classifies it.
 * READ-ONLY: nothing is sent, labelled or deleted in the mailbox and nothing is posted to the ledger.
 *
 * Env (set on the PROD API — the callback and the cron both run there):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  OAuth client (Google Cloud → APIs & Services → Credentials, type "Web application")
 *   GOOGLE_OAUTH_REDIRECT_URI               optional, default https://money-wise-pro-api.vercel.app/integrations/gmail/callback
 *   MESSAGING_TOKEN_KEY                     32-byte key for token encryption at rest (shared with Meta)
 *
 * gmail.readonly is a Google "restricted" scope: until the app passes Google verification + the CASA assessment,
 * only test users added on the OAuth consent screen can connect (max 100), and their refresh tokens last 7 days.
 */
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly'];
const STATE_TTL_MS = 15 * 60_000;
const INITIAL_QUERY = 'newer_than:7d -in:spam -in:trash -in:drafts';
const INITIAL_LIMIT = 50;
const BODY_CAP = 20_000;
const SKIP_LABELS = ['SPAM', 'TRASH', 'DRAFT'];

export class GmailAuthError extends Error {}

export const redirectUri = () =>
    process.env.GOOGLE_OAUTH_REDIRECT_URI || 'https://money-wise-pro-api.vercel.app/integrations/gmail/callback';
export const isGmailConfigured = () =>
    !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.MESSAGING_TOKEN_KEY);

// ── Signed OAuth state ──────────────────────────────────────────────────────
// Unlike the plain "org:<id>" state of the older integrations, this one is HMAC-signed and expires, so a
// forged callback can't attach someone's mailbox to another org.
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (payload: string) => crypto.createHmac('sha256', process.env.GOOGLE_CLIENT_SECRET || '').update(payload).digest('base64url');

export function createState(organizationId: string, userId: string): string {
    const payload = b64url(JSON.stringify({ o: organizationId, u: userId, t: Date.now(), n: crypto.randomBytes(8).toString('hex') }));
    return `${payload}.${sign(payload)}`;
}

export function readState(state: string): { organizationId: string; userId: string } | null {
    const [payload, sig] = String(state || '').split('.');
    if (!payload || !sig) return null;
    const expected = sign(payload);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
        const { o, u, t } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!o || !u || typeof t !== 'number' || Date.now() - t > STATE_TTL_MS) return null;
        return { organizationId: o, userId: u };
    } catch {
        return null;
    }
}

export function buildAuthUrl(organizationId: string, userId: string): string {
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        redirect_uri: redirectUri(),
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',            // always returns a refresh token, also on reconnect
        include_granted_scopes: 'true',
        state: createState(organizationId, userId),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ── Tokens ──────────────────────────────────────────────────────────────────
async function tokenRequest(body: Record<string, string>) {
    const { data } = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        ...body,
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000 });
    return data as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
}

/** Code → tokens → mailbox address, then upsert the connection. Throws a user-readable Error on failure. */
export async function completeConnection(code: string, organizationId: string, userId: string): Promise<{ email: string }> {
    const tokens = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
    if (!tokens.scope?.includes('gmail.readonly')) throw new Error('Gmail access was not granted. Tick the Gmail box on the Google screen and try again.');
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token. Please try connecting again.');

    const { data: profile } = await axios.get(`${GMAIL}/profile`, { headers: { Authorization: `Bearer ${tokens.access_token}` }, timeout: 10_000 });
    const email = String(profile.emailAddress || '').toLowerCase();
    if (!email) throw new Error('Could not read the mailbox address from Google.');

    const { data: existing } = await supabase.from('email_connections').select('id, organization_id, status')
        .eq('provider', 'GMAIL').eq('email_address', email).maybeSingle();
    if (existing && existing.organization_id !== organizationId && existing.status === 'ACTIVE') {
        throw new Error(`${email} is already connected to another MoneyWise business. Disconnect it there first.`);
    }

    const now = new Date();
    const row = {
        organization_id: organizationId,
        connected_by: userId,
        provider: 'GMAIL',
        email_address: email,
        refresh_token_enc: encryptToken(tokens.refresh_token),
        access_token_enc: encryptToken(tokens.access_token),
        access_token_expires_at: new Date(now.getTime() + tokens.expires_in * 1000).toISOString(),
        // Moving to another org (or reconnecting) starts a fresh 7-day window rather than replaying old history.
        last_history_id: existing && existing.organization_id === organizationId ? undefined : null,
        status: 'ACTIVE',
        last_error: null,
        updated_at: now.toISOString(),
    };
    const { error } = await supabase.from('email_connections').upsert(row, { onConflict: 'provider,email_address' });
    if (error) throw new Error(`Could not save the connection: ${error.message}`);
    return { email };
}

async function markConnection(id: string, patch: Record<string, any>) {
    await supabase.from('email_connections').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
}

/** A valid access token, refreshing when it's within a minute of expiry. invalid_grant → EXPIRED + GmailAuthError. */
async function getAccessToken(conn: any): Promise<string> {
    const exp = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0;
    if (conn.access_token_enc && exp - Date.now() > 60_000) return decryptToken(conn.access_token_enc);
    if (!conn.refresh_token_enc) throw new GmailAuthError('No refresh token');
    try {
        const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decryptToken(conn.refresh_token_enc) });
        await markConnection(conn.id, {
            access_token_enc: encryptToken(t.access_token),
            access_token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
            ...(t.refresh_token ? { refresh_token_enc: encryptToken(t.refresh_token) } : {}),
        });
        return t.access_token;
    } catch (e: any) {
        if (e?.response?.data?.error === 'invalid_grant') {
            await markConnection(conn.id, { status: 'EXPIRED', access_token_enc: null, last_error: 'Google access expired or was revoked. Reconnect Gmail.' });
            throw new GmailAuthError('invalid_grant');
        }
        throw e;
    }
}

/** Revokes at Google (best effort) and marks the row DISCONNECTED with tokens wiped. Org-scoped. */
export async function disconnectConnection(id: string, organizationId: string): Promise<boolean> {
    const { data: conn } = await supabase.from('email_connections').select('id, refresh_token_enc')
        .eq('id', id).eq('organization_id', organizationId).maybeSingle();
    if (!conn) return false;
    if (conn.refresh_token_enc) {
        try {
            await axios.post('https://oauth2.googleapis.com/revoke', new URLSearchParams({ token: decryptToken(conn.refresh_token_enc) }).toString(),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8_000 });
        } catch (e: any) {
            console.warn('[Gmail] revoke failed (continuing):', e?.response?.status || e?.message);
        }
    }
    await markConnection(id, { status: 'DISCONNECTED', refresh_token_enc: null, access_token_enc: null, access_token_expires_at: null });
    return true;
}

// ── Message parsing ─────────────────────────────────────────────────────────
const header = (msg: any, name: string): string | null =>
    msg.payload?.headers?.find((h: any) => String(h.name).toLowerCase() === name.toLowerCase())?.value ?? null;

const decode = (data?: string) => (data ? Buffer.from(data, 'base64url').toString('utf8') : '');

export function htmlToText(html: string): string {
    return html
        .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}

/** Walks the MIME tree: text/plain preferred, stripped text/html as fallback; attachments as metadata only. */
export function extractContent(payload: any): { text: string; attachments: { filename: string; mime_type: string; size: number; attachment_id: string | null }[] } {
    let plain = '', html = '';
    const attachments: { filename: string; mime_type: string; size: number; attachment_id: string | null }[] = [];
    const walk = (part: any) => {
        if (!part) return;
        if (part.filename) {
            attachments.push({ filename: part.filename, mime_type: part.mimeType, size: part.body?.size ?? 0, attachment_id: part.body?.attachmentId ?? null });
        } else if (part.mimeType === 'text/plain' && part.body?.data) {
            plain += decode(part.body.data) + '\n';
        } else if (part.mimeType === 'text/html' && part.body?.data) {
            html += decode(part.body.data) + '\n';
        }
        (part.parts || []).forEach(walk);
    };
    walk(payload);
    const text = (plain.trim() || htmlToText(html)).slice(0, BODY_CAP);
    return { text, attachments };
}

// ── Sync ────────────────────────────────────────────────────────────────────
async function gmailGet(token: string, path: string, params: Record<string, any> = {}) {
    const { data } = await axios.get(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${token}` }, params, timeout: 10_000 });
    return data;
}

async function initialIds(token: string): Promise<string[]> {
    const r = await gmailGet(token, '/messages', { q: INITIAL_QUERY, maxResults: INITIAL_LIMIT });
    return (r.messages || []).map((m: any) => m.id);
}

/** New message ids since startHistoryId; null when Google says the history id is too old (404) → caller re-seeds. */
async function idsSinceHistory(token: string, startHistoryId: string, deadline: number): Promise<{ ids: string[]; historyId: string | null } | null> {
    const ids = new Set<string>();
    let pageToken: string | undefined, latest: string | null = null;
    try {
        do {
            const r = await gmailGet(token, '/history', { startHistoryId, historyTypes: 'messageAdded', maxResults: 500, ...(pageToken ? { pageToken } : {}) });
            for (const h of r.history || []) for (const a of h.messagesAdded || []) {
                if (!(a.message?.labelIds || []).some((l: string) => SKIP_LABELS.includes(l))) ids.add(a.message.id);
            }
            latest = r.historyId ?? latest;
            pageToken = r.nextPageToken;
        } while (pageToken && Date.now() < deadline);
    } catch (e: any) {
        if (e?.response?.status === 404) return null;
        throw e;
    }
    return { ids: [...ids], historyId: pageToken ? null : latest }; // unfinished paging → don't advance past what we didn't read
}

export interface SyncResult { connectionId: string; fetched: number; stored: number; classified: number; error?: string }

export async function syncConnection(conn: any, deadline: number): Promise<SyncResult> {
    const result: SyncResult = { connectionId: conn.id, fetched: 0, stored: 0, classified: 0 };
    try {
        const token = await getAccessToken(conn);
        let ids: string[];
        let nextHistoryId: string | null;

        const since = conn.last_history_id ? await idsSinceHistory(token, conn.last_history_id, deadline) : null;
        if (since) {
            ids = since.ids;
            nextHistoryId = since.historyId;
        } else {
            // First sync, or history expired: seed from the last 7 days and the mailbox's current history id.
            const profile = await gmailGet(token, '/profile');
            ids = await initialIds(token);
            nextHistoryId = String(profile.historyId);
        }

        // Skip ids already stored (re-runs, overlapping history windows).
        let fresh = ids;
        if (ids.length) {
            const { data: have } = await supabase.from('inbound_emails').select('provider_message_id')
                .eq('connection_id', conn.id).in('provider_message_id', ids);
            const seen = new Set((have || []).map((r: any) => r.provider_message_id));
            fresh = ids.filter(id => !seen.has(id));
        }

        let complete = true;
        for (const id of fresh) {
            if (Date.now() > deadline) { complete = false; break; }
            const msg = await gmailGet(token, `/messages/${id}`, { format: 'full' });
            result.fetched++;
            if ((msg.labelIds || []).some((l: string) => SKIP_LABELS.includes(l))) continue;

            const { text, attachments } = extractContent(msg.payload);
            const subject = header(msg, 'Subject');
            const row = {
                organization_id: conn.organization_id,
                connection_id: conn.id,
                provider_message_id: msg.id,
                thread_id: msg.threadId ?? null,
                from_address: header(msg, 'From'),
                to_address: header(msg, 'To'),
                subject,
                snippet: msg.snippet ?? null,
                body_text: text || null,
                received_at: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString(),
                has_attachments: attachments.length > 0,
                attachments,
                prefilter_passed: passesPrefilter(subject, text, attachments),
            };
            const { data: ins, error } = await supabase.from('inbound_emails')
                .upsert(row, { onConflict: 'connection_id,provider_message_id', ignoreDuplicates: true })
                .select('id, prefilter_passed');
            if (error) throw new Error(`store failed: ${error.message}`);
            const stored = ins?.[0];
            if (!stored) continue;
            result.stored++;
            if (stored.prefilter_passed && Date.now() < deadline - 3_000) {
                if (await classifyEmail(stored.id, conn.organization_id)) result.classified++;
            }
        }

        await markConnection(conn.id, {
            last_synced_at: new Date().toISOString(),
            last_error: null,
            // Only advance the cursor once every message up to it was read; otherwise the next run repeats this window.
            ...(complete && nextHistoryId ? { last_history_id: nextHistoryId } : {}),
        });
    } catch (e: any) {
        result.error = e instanceof GmailAuthError ? 'auth_expired' : (e?.response?.data?.error?.message || e?.message || 'sync failed');
        if (!(e instanceof GmailAuthError)) await markConnection(conn.id, { last_error: String(result.error).slice(0, 300) });
        console.error(`[Gmail] sync ${conn.id}:`, result.error);
    }
    return result;
}

/**
 * One cron tick: oldest-synced ACTIVE connections first, within budgetMs, then any emails that passed the
 * pre-filter but weren't classified in time (previous runs ran out of budget).
 */
export async function syncAllGmail(budgetMs = 15_000): Promise<{ connections: SyncResult[]; backlogClassified: number }> {
    const deadline = Date.now() + budgetMs;
    const { data: conns } = await supabase.from('email_connections').select('*')
        .eq('status', 'ACTIVE').order('last_synced_at', { ascending: true, nullsFirst: true }).limit(25);

    const connections: SyncResult[] = [];
    for (const conn of conns || []) {
        if (Date.now() > deadline - 2_000) break;
        connections.push(await syncConnection(conn, deadline));
    }

    let backlogClassified = 0;
    if (Date.now() < deadline - 3_000) {
        const { data: backlog } = await supabase.from('inbound_emails').select('id, organization_id')
            .eq('prefilter_passed', true).is('classified_at', null).order('created_at', { ascending: true }).limit(10);
        for (const b of backlog || []) {
            if (Date.now() > deadline - 3_000) break;
            if (await classifyEmail(b.id, b.organization_id)) backlogClassified++;
        }
    }
    return { connections, backlogClassified };
}
