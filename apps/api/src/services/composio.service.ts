import { pathToFileURL } from 'url';
import { supabase } from '../lib/supabase';
import { passesPrefilter, classifyEmail } from './emailIntent.service';
import { classifyMessage } from './messageIntent.service';
import { htmlToText } from './gmail.service';
import { ingestMessages, InboundMessage } from './meta.service';
import { extractList, otherParticipant, inboundMessages, gmailPage, parseTimestamp } from './composioParse';

/**
 * Composio as the SECOND way to connect Gmail / Facebook / Instagram (the first is our own OAuth, "DIRECT").
 * Composio holds the OAuth grant (its own, already-verified Google / Meta apps — so no Google CASA review or Meta App Review
 * of ours is needed) and we call its tools with the connected-account id. Same convention as Kaizen OS: Composio's
 * "user id" is the MoneyWise organisation id, so one org can only ever see its own connected accounts.
 *
 * Nothing here sends anything or writes to the ledger: it only reads mail / messages into inbound_emails and
 * messaging_messages (auth_mode = 'COMPOSIO'), exactly where the direct integrations put them, then classifies.
 *
 * WhatsApp is NOT supported: Composio can send WhatsApp messages but cannot read incoming ones (its history tool returns
 * delivery receipts and its only trigger is delivery-status updates), so reading WhatsApp stays on the direct Meta webhook.
 *
 * Env (PROD API): COMPOSIO_API_KEY (required); COMPOSIO_SYNC_MINUTES (optional, default 10 — every poll of a connection is
 * at least one billable Composio tool call, so this is the cost dial).
 */

export const COMPOSIO_TOOLKITS = ['gmail', 'facebook', 'instagram'] as const;
export type ComposioToolkit = typeof COMPOSIO_TOOLKITS[number];
export const isComposioToolkit = (s: string): s is ComposioToolkit => (COMPOSIO_TOOLKITS as readonly string[]).includes(s);

export const isComposioConfigured = () => !!process.env.COMPOSIO_API_KEY;

const FIRST_SYNC_DAYS = 7;
const MAX_EMAILS_PER_PAGE = 50;
const MAX_EMAIL_PAGES = 5;
/** A backfill that ran out of time/pages resumes from this cursor (kept in last_history_id): PT:<sinceSec>:<startedMs>:<pageToken>. */
const CURSOR = /^PT:(\d+):(\d+):(.+)$/;
const BODY_CAP = 20_000;
const SKIP_LABELS = ['SPAM', 'TRASH', 'DRAFT'];
const syncEveryMs = () => Math.max(1, Number(process.env.COMPOSIO_SYNC_MINUTES) || 10) * 60_000;

// @composio/core is ESM-only and this API compiles to CommonJS, where require() of an ES module is refused on Vercel
// (it worked locally, which hid it). So it is loaded with a native import(): `new Function` keeps TypeScript from
// rewriting import() into require(). require.resolve() is only there so Vercel's file tracing still bundles the package
// (and hands us its absolute path). Loaded lazily, so a failure here only ever breaks Composio — never the API at startup.
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
let cached: any = null;
async function client(): Promise<any> {
    if (!cached) {
        const { Composio } = await nativeImport(pathToFileURL(require.resolve('@composio/core')).href);
        cached = new Composio({ apiKey: process.env.COMPOSIO_API_KEY ?? '' });
    }
    return cached;
}

async function runTool(userId: string, slug: string, connectedAccountId: string, args: object): Promise<any> {
    const res = await (await client()).tools.execute(slug, { userId, connectedAccountId, arguments: args, dangerouslySkipVersionCheck: true });
    if (!res?.successful) throw new Error(`${slug} failed: ${String(res?.error ?? 'unknown error').slice(0, 300)}`);
    return res.data;
}

export type ConnectResult =
    | { ok: true; labels: string[]; remaining?: { id: string; name: string }[]; composioAccountId?: string }
    | { ok: false; message: string; choices?: { id: string; name: string }[]; composioAccountId?: string };

const fail = (message: string, extra: { choices?: { id: string; name: string }[]; composioAccountId?: string } = {}): ConnectResult => ({ ok: false, message, ...extra });
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** ACTIVE connected accounts Composio holds for this organisation (user id = org id) on one toolkit. */
async function activeAccounts(orgId: string, toolkit: ComposioToolkit): Promise<{ id: string }[]> {
    const list = await (await client()).connectedAccounts.list({ userIds: [orgId], toolkitSlugs: [toolkit], statuses: ['ACTIVE'] });
    return (list?.items ?? []).map((i: any) => ({ id: String(i.id) }));
}

/** Step 1: Composio's hosted sign-in link for this org. The browser comes back to callbackUrl afterwards. */
export async function startConnect(orgId: string, toolkit: ComposioToolkit, callbackUrl: string): Promise<string | null> {
    const composio = await client();
    // Only reuse a Composio-managed auth config — a custom one may have been created with placeholder credentials.
    const existing = await composio.authConfigs.list({ toolkit });
    const managed = (existing?.items ?? []).find((c: any) => c.isComposioManaged);
    const authConfigId = managed?.id ?? (await composio.authConfigs.create(toolkit)).id;
    const request = await composio.connectedAccounts.link(orgId, authConfigId, { callbackUrl, allowMultiple: true });
    return request?.redirectUrl ?? null;
}

/**
 * Step 2 (after the browser returns): registers what Composio now holds for this org as MoneyWise connections.
 * A mailbox / Page / account already connected to a DIFFERENT organisation is refused.
 */
export async function completeConnect(
    orgId: string, userId: string, toolkit: ComposioToolkit, opts: { externalId?: string; composioAccountId?: string } = {},
): Promise<ConnectResult> {
    try {
        const accounts = await activeAccounts(orgId, toolkit);
        if (!accounts.length) return fail('Sign-in was not completed. Please try connecting again.');
        // A client-supplied account id is only honoured if it is one of THIS org's accounts.
        const picked = opts.composioAccountId ? accounts.find(a => a.id === opts.composioAccountId) : undefined;
        if (opts.composioAccountId && !picked) return fail('That connection does not belong to your organisation.');

        if (toolkit === 'gmail') {
            const labels: string[] = [];
            for (const acc of picked ? [picked] : accounts) {
                const data = await runTool(orgId, 'GMAIL_GET_PROFILE', acc.id, { user_id: 'me' });
                const email = String(data?.emailAddress ?? data?.response_data?.emailAddress ?? '').toLowerCase();
                if (!email) return fail('Could not read the Gmail address for this connection.');

                const { data: taken } = await supabase.from('email_connections').select('organization_id, status')
                    .eq('provider', 'GMAIL').eq('email_address', email).maybeSingle();
                if (taken && taken.organization_id !== orgId && taken.status !== 'DISCONNECTED') {
                    return fail(`${email} is already connected to another organisation.`);
                }
                const { error } = await supabase.from('email_connections').upsert({
                    organization_id: orgId, connected_by: userId, provider: 'GMAIL', email_address: email,
                    auth_mode: 'COMPOSIO', composio_account_id: acc.id,
                    // Composio holds the grant: nothing token-shaped is kept here, even from an earlier DIRECT connection.
                    refresh_token_enc: null, access_token_enc: null, access_token_expires_at: null,
                    status: 'ACTIVE', last_error: null, last_history_id: null, updated_at: new Date().toISOString(),
                }, { onConflict: 'provider,email_address' });
                if (error) return fail(error.message);
                labels.push(email);
            }
            return { ok: true, labels };
        }

        const acc = picked ?? accounts[0];
        if (toolkit === 'instagram') {
            const data = await runTool(orgId, 'INSTAGRAM_GET_USER_INFO', acc.id, {});
            const info = (data?.response_data ?? data) as Record<string, any>;
            const externalId = String(info?.id ?? info?.data?.id ?? '');
            const username = String(info?.username ?? info?.data?.username ?? info?.name ?? externalId);
            if (!externalId) return fail('Could not read the Instagram account for this connection.');
            return saveMessagingConnection(orgId, userId, 'INSTAGRAM', externalId, username, acc.id);
        }

        // facebook: one Composio connection can manage several Pages; the user picks which to add.
        const pages = extractList(await runTool(orgId, 'FACEBOOK_LIST_MANAGED_PAGES', acc.id, {}))
            .map(p => ({ id: String(p.id), name: String(p.name ?? p.id) }));
        if (!pages.length) return fail('No Facebook Pages were found for this connection. You need to be an admin of a Page.');
        const wanted = opts.externalId ? pages.find(p => p.id === opts.externalId) : pages.length === 1 ? pages[0] : undefined;
        if (!wanted) {
            return fail(opts.externalId ? 'That Page is not managed by this connection.' : 'Choose which Page to add.', { choices: pages, composioAccountId: acc.id });
        }
        const saved = await saveMessagingConnection(orgId, userId, 'FACEBOOK', wanted.id, wanted.name, acc.id);
        if (saved.ok) {
            const { data: have } = await supabase.from('messaging_connections').select('external_id')
                .eq('organization_id', orgId).eq('platform', 'FACEBOOK').neq('status', 'DISCONNECTED');
            const haveIds = new Set((have ?? []).map((r: any) => r.external_id));
            saved.remaining = pages.filter(p => !haveIds.has(p.id));
            saved.composioAccountId = acc.id;
        }
        return saved;
    } catch (e) {
        console.error(`[Composio] complete ${toolkit} failed:`, reason(e));
        return fail(reason(e));
    }
}

async function saveMessagingConnection(
    orgId: string, userId: string, platform: 'FACEBOOK' | 'INSTAGRAM', externalId: string, name: string, composioAccountId: string,
): Promise<ConnectResult> {
    const { data: taken } = await supabase.from('messaging_connections').select('organization_id, status')
        .eq('platform', platform).eq('external_id', externalId).maybeSingle();
    if (taken && taken.organization_id !== orgId && taken.status !== 'DISCONNECTED') {
        return fail(`${name} is already connected to another organisation.`);
    }
    const { error } = await supabase.from('messaging_connections').upsert({
        organization_id: orgId, connected_by: userId, platform, external_id: externalId, display_name: name,
        auth_mode: 'COMPOSIO', composio_account_id: composioAccountId, access_token_enc: null, token_expires_at: null,
        status: 'ACTIVE', last_error: null, last_synced_at: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'platform,external_id' });
    if (error) return fail(error.message);
    return { ok: true, labels: [name] };
}

/**
 * Disconnects a COMPOSIO connection (org-scoped) and, when nothing else uses that Composio account, deletes it at
 * Composio so the grant is really revoked. Returns false when the row isn't a Composio one (caller falls back to DIRECT).
 */
export async function disconnectComposioConnection(kind: 'email' | 'messaging', id: string, orgId: string): Promise<boolean> {
    const table = kind === 'email' ? 'email_connections' : 'messaging_connections';
    const { data: row } = await supabase.from(table).select('id, auth_mode, composio_account_id')
        .eq('id', id).eq('organization_id', orgId).maybeSingle();
    if (!row || row.auth_mode !== 'COMPOSIO') return false;

    await supabase.from(table).update({ status: 'DISCONNECTED', composio_account_id: null, updated_at: new Date().toISOString() })
        .eq('id', id).eq('organization_id', orgId);

    const acct = row.composio_account_id;
    if (acct) {
        const [a, b] = await Promise.all([
            supabase.from('email_connections').select('id', { count: 'exact', head: true }).eq('composio_account_id', acct).neq('status', 'DISCONNECTED'),
            supabase.from('messaging_connections').select('id', { count: 'exact', head: true }).eq('composio_account_id', acct).neq('status', 'DISCONNECTED'),
        ]);
        if (!(a.count ?? 0) && !(b.count ?? 0)) {
            try { await (await client()).connectedAccounts.delete(acct); }
            catch (e) { console.warn('[Composio] could not delete connected account (continuing):', reason(e)); }
        }
    }
    return true;
}

// ── Sync ────────────────────────────────────────────────────────────────────

export interface ComposioSyncResult { connectionId: string; kind: 'email' | 'messaging'; fetched: number; stored: number; classified: number; error?: string }

const looksExpired = (msg: string) => /expired|revoked|invalid_grant|unauthori[sz]ed|\b401\b|\b403\b|not connected|no active connection/i.test(msg);

async function markFailure(table: string, id: string, message: string) {
    await supabase.from(table).update({
        last_error: message.slice(0, 300), ...(looksExpired(message) ? { status: 'EXPIRED' } : {}), updated_at: new Date().toISOString(),
    }).eq('id', id);
}

/**
 * Fetches pages of mail for one Gmail query and STORES them (bulk writes, no AI), so running out of time never loses mail. Returns the token to resume
 * from, or null when Gmail has no further page. Shared by the regular sync and by the deeper look back (mailboxBackfill).
 */
export async function pullEmailPages(conn: any, query: string, startToken: string | null, deadline: number, result: ComposioSyncResult, fresh: { id: string; organization_id: string }[]): Promise<string | null> {
    let pageToken: string | null = startToken;
    for (let page = 0; page < MAX_EMAIL_PAGES && Date.now() < deadline - 3_000; page++) {
        const data = await runTool(conn.organization_id, 'GMAIL_FETCH_EMAILS', conn.composio_account_id, {
            user_id: 'me',
            query,
            max_results: MAX_EMAILS_PER_PAGE, include_payload: true, verbose: true,
            ...(pageToken ? { page_token: pageToken } : {}),
        });
            const { messages, nextPageToken } = gmailPage(data);

            const rows: any[] = [];
            for (const raw of messages) {
                const id = String(raw.messageId ?? raw.id ?? '');
                if (!id) continue;
                result.fetched++;
                const labels: string[] = Array.isArray(raw.labelIds) ? raw.labelIds : [];
                if (labels.some(l => SKIP_LABELS.includes(l))) continue;

                const rawBody = String(raw.messageText ?? raw.body ?? raw.snippet ?? '');
                const text = (/<\/?[a-z][\s\S]*>/i.test(rawBody) ? htmlToText(rawBody) : rawBody).slice(0, BODY_CAP);
                const attachments = (Array.isArray(raw.attachmentList) ? raw.attachmentList : Array.isArray(raw.attachments) ? raw.attachments : [])
                    .filter((a: any) => a && typeof a === 'object')
                    .map((a: any) => ({
                        filename: String(a.filename ?? a.name ?? ''), mime_type: String(a.mimeType ?? a.mime_type ?? ''),
                        size: Number(a.size ?? 0), attachment_id: a.attachmentId ?? a.attachment_id ?? null,
                    }));
                const subject = raw.subject ? String(raw.subject) : null;
                rows.push({
                    organization_id: conn.organization_id, connection_id: conn.id, provider_message_id: id,
                    thread_id: raw.threadId ? String(raw.threadId) : null,
                    from_address: raw.sender ?? raw.from ?? null, to_address: raw.to ?? null, subject,
                    snippet: raw.snippet ? String(raw.snippet) : raw.preview ? String(raw.preview) : null, body_text: text || null,
                    received_at: parseTimestamp(raw.messageTimestamp ?? raw.internalDate ?? raw.date).toISOString(),
                    has_attachments: attachments.length > 0, attachments,
                    prefilter_passed: passesPrefilter(subject, text, attachments),
                });
            }
            if (rows.length) {
                // ignoreDuplicates: only rows we did not already have come back.
                const { data: ins, error } = await supabase.from('inbound_emails')
                    .upsert(rows, { onConflict: 'connection_id,provider_message_id', ignoreDuplicates: true }).select('id, prefilter_passed');
                if (error) throw new Error(`store failed: ${error.message}`);
                for (const r of ins ?? []) {
                    result.stored++;
                    if (r.prefilter_passed) fresh.push({ id: r.id, organization_id: conn.organization_id });
                }
            }
            pageToken = nextPageToken;
            if (!pageToken) break;
        }
    return pageToken;
}

async function syncEmail(conn: any, deadline: number): Promise<ComposioSyncResult> {
    const result: ComposioSyncResult = { connectionId: conn.id, kind: 'email', fetched: 0, stored: 0, classified: 0 };
    try {
        if (!conn.composio_account_id) throw new Error('Composio connection is missing; reconnect it.');

        // Resume an unfinished backfill (same query window + page token), else start a new window.
        const resume = CURSOR.exec(conn.last_history_id ?? '');
        const startedMs = resume ? Number(resume[2]) : Date.now();
        const sinceSec = resume ? Number(resume[1])
            : Math.floor((conn.last_synced_at ? Date.parse(conn.last_synced_at) - 3_600_000 : Date.now() - FIRST_SYNC_DAYS * 86_400_000) / 1000);
        let pageToken: string | null = resume ? resume[3] : null;
        const fresh: { id: string; organization_id: string }[] = [];

        // Phase 1 — fetch and STORE everything (bulk writes, no AI), so running out of time never loses mail.
        pageToken = await pullEmailPages(conn, `after:${sinceSec} -in:spam -in:trash -in:drafts`, pageToken, deadline, result, fresh);

        // Done only when Gmail has no further page. Otherwise remember where to resume and keep the old sync time.
        await supabase.from('email_connections').update(pageToken
            ? { last_history_id: `PT:${sinceSec}:${startedMs}:${pageToken}`, last_error: null }
            : { last_history_id: null, last_synced_at: new Date(startedMs).toISOString(), last_error: null }).eq('id', conn.id);

        // Phase 2 — classify what is new while time allows; the rest is picked up by classifyBacklog().
        for (const f of fresh) {
            if (Date.now() > deadline - 3_000) break;
            if (await classifyEmail(f.id, f.organization_id)) result.classified++;
        }
    } catch (e) {
        result.error = reason(e);
        await markFailure('email_connections', conn.id, result.error);
        console.error(`[Composio] email sync ${conn.id}:`, result.error);
    }
    return result;
}

async function syncSocial(conn: any, deadline: number): Promise<ComposioSyncResult> {
    const result: ComposioSyncResult = { connectionId: conn.id, kind: 'messaging', fetched: 0, stored: 0, classified: 0 };
    try {
        if (!conn.composio_account_id) throw new Error('Composio connection is missing; reconnect it.');
        const fb = conn.platform === 'FACEBOOK';
        const own = { ids: [String(conn.external_id)], username: fb ? undefined : conn.display_name ?? undefined };
        const orgId = conn.organization_id;
        const since = conn.last_synced_at ? Date.parse(conn.last_synced_at) - 3_600_000 : Date.now() - 2 * 86_400_000;

        const convs = fb
            ? await runTool(orgId, 'FACEBOOK_GET_PAGE_CONVERSATIONS', conn.composio_account_id, { page_id: conn.external_id, limit: 25, fields: 'id,updated_time,participants' })
            : await runTool(orgId, 'INSTAGRAM_LIST_ALL_CONVERSATIONS', conn.composio_account_id, { ig_user_id: conn.external_id, platform: 'instagram', limit: 25, fields: 'id,updated_time,participants' });

        const batch: InboundMessage[] = [];
        let complete = true;
        for (const conv of extractList(convs)) {
            const updated = Date.parse(String(conv.updated_time ?? ''));
            if (Number.isFinite(updated) && updated < since) continue;
            const contact = otherParticipant(conv, own);
            if (!contact || !conv.id) continue;
            if (Date.now() > deadline - 3_000) { complete = false; break; }

            const msgs = fb
                ? await runTool(orgId, 'FACEBOOK_GET_CONVERSATION_MESSAGES', conn.composio_account_id, { page_id: conn.external_id, conversation_id: String(conv.id), limit: 20, fields: 'id,message,from,created_time' })
                : await runTool(orgId, 'INSTAGRAM_LIST_ALL_MESSAGES', conn.composio_account_id, { conversation_id: String(conv.id), limit: 20, fields: 'id,message,from,created_time' });

            for (const m of inboundMessages(msgs, own)) {
                if (m.at < since) continue;
                result.fetched++;
                batch.push({
                    platform: conn.platform, externalAccountId: String(conn.external_id), externalMessageId: m.id,
                    // Same key the webhook uses (the sender's page-scoped id), so both routes agree on who the contact is.
                    contactId: contact.id, contactName: contact.name || m.fromName, type: 'text', body: m.text,
                    sentAt: new Date(m.at), direction: 'IN',
                });
            }
        }

        const inserted = await ingestMessages(batch);
        result.stored = inserted.length;
        for (const m of inserted) {
            if (Date.now() > deadline - 2_000) break;
            await classifyMessage(m.id, m.organization_id);
            result.classified++;
        }
        // An unfinished pass leaves the cursor where it was; the next run repeats the window (duplicates are ignored).
        await supabase.from('messaging_connections').update({ last_error: null, ...(complete ? { last_synced_at: new Date().toISOString() } : {}) }).eq('id', conn.id);
    } catch (e) {
        result.error = reason(e);
        await markFailure('messaging_connections', conn.id, result.error);
        console.error(`[Composio] ${conn.platform} sync ${conn.id}:`, result.error);
    }
    return result;
}

/**
 * Mail / messages that were stored but not classified before an earlier run's time ran out (the direct Gmail sync does the
 * same for its own mail, but only when Google is configured — Quick connect must not depend on that).
 */
async function classifyBacklog(deadline: number): Promise<number> {
    let done = 0;
    if (Date.now() < deadline - 3_000) {
        const { data: mails } = await supabase.from('inbound_emails').select('id, organization_id')
            .eq('prefilter_passed', true).is('classified_at', null).order('created_at', { ascending: true }).limit(10);
        for (const m of mails ?? []) {
            if (Date.now() > deadline - 3_000) break;
            if (await classifyEmail(m.id, m.organization_id)) done++;
        }
    }
    if (Date.now() < deadline - 3_000) {
        const { data: msgs } = await supabase.from('messaging_messages').select('id, organization_id')
            .eq('direction', 'IN').is('classified_at', null).not('body', 'is', null).order('created_at', { ascending: true }).limit(10);
        for (const m of msgs ?? []) {
            if (Date.now() > deadline - 2_000) break;
            await classifyMessage(m.id, m.organization_id);
            done++;
        }
    }
    return done;
}

/** One cron tick: the longest-unsynced COMPOSIO connections (mail and messages together) that are due, within budgetMs. */
export async function syncAllComposio(budgetMs = 15_000): Promise<{ connections: ComposioSyncResult[]; backlogClassified: number }> {
    const deadline = Date.now() + budgetMs;
    const dueBefore = new Date(Date.now() - syncEveryMs()).toISOString();
    const due = (q: any) => q.eq('status', 'ACTIVE').eq('auth_mode', 'COMPOSIO')
        .or(`last_synced_at.is.null,last_synced_at.lt.${dueBefore}`).order('last_synced_at', { ascending: true, nullsFirst: true }).limit(15);

    const [emails, social] = await Promise.all([
        due(supabase.from('email_connections').select('*')),
        due(supabase.from('messaging_connections').select('*').in('platform', ['FACEBOOK', 'INSTAGRAM'])),
    ]);

    const queue = [
        ...(emails.data ?? []).map((c: any) => ({ kind: 'email' as const, c })),
        ...(social.data ?? []).map((c: any) => ({ kind: 'messaging' as const, c })),
    ].sort((x, y) => (Date.parse(x.c.last_synced_at ?? '') || 0) - (Date.parse(y.c.last_synced_at ?? '') || 0));

    const connections: ComposioSyncResult[] = [];
    for (const { kind, c } of queue) {
        if (Date.now() > deadline - 2_000) break;
        connections.push(kind === 'email' ? await syncEmail(c, deadline) : await syncSocial(c, deadline));
    }
    const backlogClassified = await classifyBacklog(deadline);
    return { connections, backlogClassified };
}
