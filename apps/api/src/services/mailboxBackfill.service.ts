import { supabase } from '../lib/supabase';
import { pullEmailPages, type ComposioSyncResult } from './composio.service';
import { classifyEmail } from './emailIntent.service';

/**
 * A deeper look back through the mailbox. A mailbox is only read from the day it was connected (a first sync looks back a week), so a bill that has been
 * arriving for months can't be seen to repeat. This pulls the last year of money-related mail (invoices, receipts, subscriptions, renewals, payments),
 * oldest part last, in time-boxed steps that can be repeated until done. Each step remembers where it stopped, so nothing is fetched twice.
 *
 * Only Quick-connect (Composio) mailboxes are covered here; a mailbox connected directly keeps its own sync.
 */
const DAYS = 365;
const STEP_MS = 22_000;           // fetch time per call
const CLASSIFY_MS = 20_000;       // then read what was fetched, for the same call
const stateKey = (connectionId: string) => `mail_backfill:${connectionId}`;
const QUERY = '(invoice OR receipt OR subscription OR renewal OR bill OR "amount due" OR payment OR statement) -in:spam -in:trash -in:drafts';

interface State { after: number; before: number; pageToken: string | null; done: boolean }

export interface BackfillStep { fetched: number; stored: number; classified: number; unread: number; done: boolean; connections: number; oldest: string | null }

export async function backfillMailbox(orgId: string): Promise<BackfillStep> {
    const out: BackfillStep = { fetched: 0, stored: 0, classified: 0, unread: 0, done: true, connections: 0, oldest: null };
    // Reading the mailbox goes through MoneyWise's mailbox connection (Composio). A server without its key (a local one) can't, so say so plainly.
    if (!process.env.COMPOSIO_API_KEY) throw new Error('This server isn’t connected to the mailbox service (COMPOSIO_API_KEY isn’t set here), so it can’t read further back. It works on the deployed app, or here once the key is added.');
    const { data: conns } = await supabase.from('email_connections').select('*').eq('organization_id', orgId).eq('status', 'ACTIVE').not('composio_account_id', 'is', null);
    const fetchUntil = Date.now() + STEP_MS;

    for (const conn of (conns ?? []) as any[]) {
        out.connections++;
        const { data: row } = await supabase.from('app_settings').select('value').eq('key', stateKey(conn.id)).maybeSingle();
        let st: State | null = (row?.value as State | undefined) ?? null;
        if (!st) {
            const { data: first } = await supabase.from('inbound_emails').select('received_at').eq('connection_id', conn.id).order('received_at', { ascending: true }).limit(1).maybeSingle();
            st = { after: Math.floor((Date.now() - DAYS * 86_400_000) / 1000), before: Math.floor((first ? Date.parse(first.received_at) : Date.now()) / 1000), pageToken: null, done: false };
        }
        if (st.done) continue;
        const result: ComposioSyncResult = { connectionId: conn.id, kind: 'email', fetched: 0, stored: 0, classified: 0 };
        const fresh: { id: string; organization_id: string }[] = [];
        try {
            const next = await pullEmailPages(conn, `${QUERY} after:${st.after} before:${st.before}`, st.pageToken, fetchUntil, result, fresh);
            st = { ...st, pageToken: next, done: next === null };
        } catch (e: any) {
            throw new Error(`Could not read further back in the mailbox: ${String(e?.message ?? e).slice(0, 200)}`);
        }
        await supabase.from('app_settings').upsert({ key: stateKey(conn.id), value: st, description: 'How far back the deeper mailbox look has got', updated_at: new Date().toISOString() });
        out.fetched += result.fetched; out.stored += result.stored;
        if (!st.done) out.done = false;
    }

    // Read what has been stored and not yet read (this call's mail first, then any earlier backlog), within the time left.
    const readUntil = Date.now() + CLASSIFY_MS;
    const tried = new Set<string>();   // an email the reader failed on is left for the next call, not retried in a loop
    for (;;) {
        if (Date.now() > readUntil) break;
        const { data: todo } = await supabase.from('inbound_emails').select('id').eq('organization_id', orgId).eq('prefilter_passed', true).is('classified_at', null).order('received_at', { ascending: false }).limit(12);
        const next = ((todo ?? []) as any[]).filter((e) => !tried.has(e.id));
        if (!next.length) break;
        for (const e of next) { if (Date.now() > readUntil) break; tried.add(e.id); if (await classifyEmail(e.id, orgId)) out.classified++; }
    }
    const { count } = await supabase.from('inbound_emails').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('prefilter_passed', true).is('classified_at', null);
    out.unread = count ?? 0;
    if (out.unread > 0) out.done = false;
    const { data: oldest } = await supabase.from('inbound_emails').select('received_at').eq('organization_id', orgId).order('received_at', { ascending: true }).limit(1).maybeSingle();
    out.oldest = oldest?.received_at ? String(oldest.received_at).slice(0, 10) : null;
    return out;
}
