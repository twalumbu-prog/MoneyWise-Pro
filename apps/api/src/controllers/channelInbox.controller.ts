import { Response } from 'express';
import { supabase } from '../lib/supabase';

/**
 * The business's connected-channel inbox: the emails (Gmail) and customer messages (Facebook, Instagram, WhatsApp) that the connections bring in,
 * with what the AI read from each (is it an order, a payment, an invoice…). Until now this data was collected and classified but nothing could
 * list it, so a connected inbox looked empty. Read-only: nothing here replies to anyone or moves money.
 */
export type InboxView = 'orders' | 'money' | 'other' | 'all';
const ORDER_INTENTS = ['ORDER', 'SALE_INTENT', 'ORDER_QUERY', 'PAYMENT_CLAIM'];
const MONEY_INTENTS = ['PAYMENT_CONFIRMATION', 'INVOICE', 'RECEIPT'];
const kindOf = (intent: string | null): 'orders' | 'money' | 'other' => (intent && ORDER_INTENTS.includes(intent) ? 'orders' : intent && MONEY_INTENTS.includes(intent) ? 'money' : 'other');

const INTENT_LABEL: Record<string, string> = {
    ORDER: 'Order', SALE_INTENT: 'Wants to buy', ORDER_QUERY: 'Asking about an order', PAYMENT_CLAIM: 'Says they paid',
    PAYMENT_CONFIRMATION: 'Payment', INVOICE: 'Invoice', RECEIPT: 'Receipt', OTHER: 'Other',
};

const clean = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** GET /integrations/inbox?view=orders|money|other|all&channel=ALL|GMAIL|FACEBOOK|INSTAGRAM|WHATSAPP&q=&limit=60 */
export const getChannelInbox = async (req: any, res: Response) => {
    try {
        const orgId: string | undefined = req.user?.organization_id;
        if (!orgId) return res.status(400).json({ error: 'No organisation' });
        const view = (['orders', 'money', 'other', 'all'].includes(String(req.query.view)) ? String(req.query.view) : 'orders') as InboxView;
        const channel = String(req.query.channel ?? 'ALL').toUpperCase();
        const q = String(req.query.q ?? '').trim().toLowerCase();
        const limit = Math.max(10, Math.min(150, Number(req.query.limit) || 60));

        const [emailsRes, msgsRes, emailConns, msgConns, noise] = await Promise.all([
            channel === 'ALL' || channel === 'GMAIL'
                ? supabase.from('inbound_emails').select('id, from_address, subject, snippet, received_at, has_attachments, intent, direction, intent_amount, intent_currency, counterparty, intent_confidence, intent_summary')
                    .eq('organization_id', orgId).eq('prefilter_passed', true).order('received_at', { ascending: false }).limit(400)
                : Promise.resolve({ data: [] as any[] }),
            channel === 'ALL' || channel !== 'GMAIL'
                ? supabase.from('messaging_messages').select('id, platform, contact_name, contact_phone, body, sent_at, intent, intent_amount, intent_summary, intent_confidence, match_status, matched_cashbook_entry_id')
                    .eq('organization_id', orgId).eq('direction', 'IN').order('sent_at', { ascending: false }).limit(400)
                : Promise.resolve({ data: [] as any[] }),
            supabase.from('email_connections').select('id, provider, email_address, status, last_synced_at, last_error, auth_mode').eq('organization_id', orgId).neq('status', 'DISCONNECTED'),
            supabase.from('messaging_connections').select('id, platform, display_name, status, last_synced_at, last_error, auth_mode').eq('organization_id', orgId).neq('status', 'DISCONNECTED'),
            supabase.from('inbound_emails').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('prefilter_passed', false),
        ]);

        const emails = (emailsRes.data ?? []).map((e: any) => ({
            id: e.id as string, source: 'email' as const, channel: 'GMAIL', who: clean(e.counterparty || e.from_address, 80), title: clean(e.subject, 140) || '(no subject)',
            preview: clean(e.intent_summary || e.snippet, 200), at: e.received_at as string, intent: (e.intent as string | null) ?? 'OTHER', amount: e.intent_amount != null ? Number(e.intent_amount) : null,
            currency: (e.intent_currency as string | null) ?? null, direction: (e.direction as string | null) ?? null, hasAttachments: !!e.has_attachments, match: null as string | null, matchedEntryId: null as string | null,
        }));
        const messages = (msgsRes.data ?? []).map((m: any) => ({
            id: m.id as string, source: 'message' as const, channel: String(m.platform ?? '').toUpperCase(), who: clean(m.contact_name || m.contact_phone, 80) || 'Customer', title: clean(m.intent_summary || m.body, 140) || '(message)',
            preview: clean(m.body, 200), at: m.sent_at as string, intent: (m.intent as string | null) ?? 'OTHER', amount: m.intent_amount != null ? Number(m.intent_amount) : null,
            currency: m.intent_amount != null ? 'ZMW' : null, direction: 'IN', hasAttachments: false, match: (m.match_status as string | null) ?? null, matchedEntryId: (m.matched_cashbook_entry_id as string | null) ?? null,
        }));
        const all = [...emails, ...messages].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

        const counts = { orders: 0, money: 0, other: 0, all: all.length };
        for (const i of all) counts[kindOf(i.intent)]++;
        const shown = all
            .filter((i) => (view === 'all' || kindOf(i.intent) === view) && (!q || `${i.who} ${i.title} ${i.preview}`.toLowerCase().includes(q)))
            .slice(0, limit)
            .map((i) => ({ ...i, intentLabel: INTENT_LABEL[i.intent] ?? 'Other', kind: kindOf(i.intent) }));

        const connections = [
            ...(emailConns.data ?? []).map((c: any) => ({ id: c.id, channel: 'GMAIL', name: c.email_address, status: c.status, lastSyncedAt: c.last_synced_at ?? null, lastError: c.last_error ?? null })),
            ...(msgConns.data ?? []).map((c: any) => ({ id: c.id, channel: String(c.platform).toUpperCase(), name: c.display_name, status: c.status, lastSyncedAt: c.last_synced_at ?? null, lastError: c.last_error ?? null })),
        ];
        res.json({ view, counts, items: shown, connections, filteredOut: (noise as any).count ?? 0 });
    } catch (e: any) {
        console.error('[ChannelInbox] list failed:', e?.message ?? e);
        res.status(500).json({ error: 'Couldn’t load your messages.' });
    }
};

/** GET /integrations/inbox/:source/:id  The whole message, for the reading pane. */
export const getChannelInboxItem = async (req: any, res: Response) => {
    try {
        const orgId: string | undefined = req.user?.organization_id;
        if (!orgId) return res.status(400).json({ error: 'No organisation' });
        const { source, id } = req.params;
        if (source === 'email') {
            const { data } = await supabase.from('inbound_emails').select('id, from_address, to_address, subject, body_text, snippet, received_at, attachments, intent, direction, intent_amount, intent_currency, counterparty, intent_summary').eq('id', id).eq('organization_id', orgId).maybeSingle();
            if (!data) return res.status(404).json({ error: 'Message not found' });
            return res.json({ source, id, from: data.from_address, to: data.to_address, subject: data.subject, body: String(data.body_text || data.snippet || '').slice(0, 20_000), at: data.received_at, attachments: Array.isArray(data.attachments) ? data.attachments.map((a: any) => ({ name: clean(a?.filename ?? a?.name, 120) })) : [], intent: data.intent, summary: data.intent_summary, amount: data.intent_amount, currency: data.intent_currency, counterparty: data.counterparty });
        }
        if (source === 'message') {
            const { data } = await supabase.from('messaging_messages').select('id, platform, contact_name, contact_phone, body, sent_at, intent, intent_amount, intent_summary, match_status').eq('id', id).eq('organization_id', orgId).maybeSingle();
            if (!data) return res.status(404).json({ error: 'Message not found' });
            return res.json({ source, id, from: data.contact_name || data.contact_phone, to: null, subject: null, body: String(data.body ?? '').slice(0, 20_000), at: data.sent_at, attachments: [], intent: data.intent, summary: data.intent_summary, amount: data.intent_amount, currency: data.intent_amount != null ? 'ZMW' : null, counterparty: data.contact_name, channel: String(data.platform).toUpperCase(), match: data.match_status });
        }
        res.status(400).json({ error: 'Unknown message type' });
    } catch (e: any) {
        console.error('[ChannelInbox] item failed:', e?.message ?? e);
        res.status(500).json({ error: 'Couldn’t open that message.' });
    }
};
