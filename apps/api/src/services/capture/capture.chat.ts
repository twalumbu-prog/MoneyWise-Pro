/**
 * One inbound chat message through the pipeline: pre-filter → conversation → extraction → match → queue.
 * Replaces classifyMessage in the worker. A customer's words are always CLAIMED; only matching can corroborate them.
 */
import { supabase } from '../../lib/supabase';
import { getCaptureSettings } from './capture.settings';
import { matchAndRoute, reserveAiCall } from './capture.service';
import { shouldExtract } from './capture.prefilter';
import { storeMessageMedia } from './capture.media';
import { extractFromChat, parseExtraction, amountAppearsInText, matchProducts, type Extraction } from './capture.extract';
import { looksLikeInjection, lusakaDate, LENCO_WINDOW_MIN } from './capture.logic';

const CONVERSATION_WINDOW_MS = 6 * 3600_000;
const CONTEXT_MESSAGES = 10;
const phoneTail = (s: string | null | undefined) => String(s || '').replace(/\D/g, '').slice(-9);

async function conversationFor(msg: any): Promise<string> {
    if (msg.conversation_id) return msg.conversation_id;
    const since = new Date(new Date(msg.sent_at).getTime() - CONVERSATION_WINDOW_MS).toISOString();
    const { data: open } = await supabase.from('capture_conversations').select('id')
        .eq('organization_id', msg.organization_id).eq('connection_id', msg.connection_id).eq('contact_id', msg.contact_id)
        .gte('last_message_at', since).order('last_message_at', { ascending: false }).limit(1).maybeSingle();
    let id = open?.id as string | undefined;
    if (id) {
        await supabase.from('capture_conversations').update({ last_message_at: msg.sent_at }).eq('id', id).eq('organization_id', msg.organization_id);
    } else {
        const { data, error } = await supabase.from('capture_conversations').insert({
            organization_id: msg.organization_id, connection_id: msg.connection_id, contact_id: msg.contact_id, opened_at: msg.sent_at, last_message_at: msg.sent_at,
        }).select('id').single();
        if (error || !data) throw new Error(`Could not open conversation: ${error?.message}`);
        id = data.id as string;
    }
    await supabase.from('messaging_messages').update({ conversation_id: id }).eq('id', msg.id).eq('organization_id', msg.organization_id);
    return id;
}

/** CRM contact by phone, then by exact name. Only a single hit counts. */
async function findCustomer(orgId: string, phone: string | null, name: string | null): Promise<string | null> {
    const { data } = await supabase.from('customers').select('id, name, phone').eq('organization_id', orgId);
    const tail = phoneTail(phone);
    const byPhone = tail.length === 9 ? (data || []).filter((c: any) => phoneTail(c.phone) === tail) : [];
    if (byPhone.length === 1) return byPhone[0].id;
    const n = (name || '').trim().toLowerCase();
    const byName = n ? (data || []).filter((c: any) => (c.name || '').trim().toLowerCase() === n) : [];
    return byName.length === 1 ? byName[0].id : null;
}

export async function processMessageJob(job: { message_id: string; organization_id: string; attempts: number }) {
    const orgId = job.organization_id;
    const { data: msg, error } = await supabase.from('messaging_messages').select('*').eq('id', job.message_id).eq('organization_id', orgId).maybeSingle();
    if (error) throw new Error(`Message lookup failed: ${error.message}`);
    if (!msg || msg.direction !== 'IN') return { skipped: 'not_inbound' };
    if (!shouldExtract({ type: msg.message_type, body: msg.body, hasMedia: !!msg.media_ref })) return { skipped: 'prefilter' };

    const { data: already } = await supabase.from('transaction_captures').select('id').eq('organization_id', orgId).contains('source_ids', [msg.id]).limit(1).maybeSingle();
    if (already) return { captureId: already.id };

    const conversationId = await conversationFor(msg);
    // Media goes through the same OCR job as an uploaded receipt.
    if (msg.media_ref) return { media: await storeMessageMedia({ ...msg, conversation_id: conversationId }) };

    const settings = await getCaptureSettings(orgId);
    const { data: recent } = await supabase.from('messaging_messages').select('direction, body, sent_at')
        .eq('organization_id', orgId).eq('connection_id', msg.connection_id).eq('contact_id', msg.contact_id).lte('sent_at', msg.sent_at)
        .order('sent_at', { ascending: false }).limit(CONTEXT_MESSAGES);
    const messages = (recent || []).reverse();
    const chatText = messages.map((m: any) => m.body || '').join('\n');

    const flags: string[] = [];
    if (looksLikeInjection(chatText)) flags.push('INJECTION_SUSPECTED');

    let x: Extraction | null = null;
    let aiCalls = 0;
    const { data: products } = await supabase.from('products').select('id, name, price, income_account_id').eq('organization_id', orgId).limit(100);
    if (await reserveAiCall(orgId, settings.dailyAiBudget)) {
        aiCalls = 1;
        try {
            x = parseExtraction(await extractFromChat({ messages, products: products || [], currency: 'ZMW' }));
            if (!x) flags.push('EXTRACTION_INVALID');
        } catch (e) {
            if (job.attempts < 3) throw e;
            flags.push('AI_UNAVAILABLE');
        }
    } else {
        flags.push('AI_BUDGET_EXCEEDED');
    }
    if (x?.intent === 'NOT_TRANSACTION' && !flags.includes('INJECTION_SUSPECTED')) return { skipped: 'not_transaction' };

    const amount = x?.amount ?? null;
    const currency = x?.currency || (amount ? 'ZMW' : null);
    const zmw = currency === 'ZMW' ? amount : null;
    if (x && amount && !amountAppearsInText(amount, chatText)) flags.push('AMOUNT_NOT_IN_TEXT');
    if (x && !amount && x.intent !== 'ORDER_ONLY') flags.push('NO_AMOUNT');
    if (amount && !zmw) flags.push('UNCONVERTED_CURRENCY');

    const lineItems = matchProducts(x?.line_items ?? [], products || []);
    const productIds = new Set(lineItems.map(l => l.product_id).filter(Boolean));
    const product = productIds.size === 1 ? (products || []).find((p: any) => productIds.has(p.id)) : null;
    const name = x?.counterparty || msg.contact_name || null;
    const occurredAt = msg.sent_at as string;

    const fields = {
        direction: x?.direction ?? null, amount, currency, zmw_amount: zmw, line_items: lineItems,
        occurred_at: occurredAt, occurred_on: x?.date ?? lusakaDate(occurredAt), counterparty_name: name, counterparty_phone: msg.contact_phone ?? null,
        payment_method: x?.payment_method ?? 'UNKNOWN', intent: x?.intent === 'NOT_TRANSACTION' ? null : x?.intent ?? null, confidence: x?.confidence ?? null,
        model: x ? 'openrouter' : null, evidence_summary: x?.evidence_summary ?? (msg.body || '').slice(0, 200), deterministic: false, claim_state: 'CLAIMED',
        suggested_account_id: x?.direction === 'IN' ? product?.income_account_id ?? null : null,
        suggested_crm_contact_id: await findCustomer(orgId, msg.contact_phone, name), conversation_id: conversationId, flags,
    };
    // One conversation and one amount is one transaction, however many messages mention it.
    const dedupeKey = amount && x?.direction ? `conv:${conversationId}:${x.direction}:${amount}` : `msg:${msg.id}`;

    const { data: created, error: insErr } = await supabase.from('transaction_captures').insert({
        ...fields, organization_id: orgId, source: msg.platform, source_ids: [msg.id], dedupe_key: dedupeKey, ai_calls: aiCalls, status: 'NEW',
    }).select('*').single();

    if (insErr?.code === '23505') {
        const { data: twin } = await supabase.from('transaction_captures').select('*').eq('organization_id', orgId).eq('dedupe_key', dedupeKey).maybeSingle();
        if (!twin) throw new Error('Capture conflict with no matching row');
        const sourceIds = Array.from(new Set([...(twin.source_ids || []), msg.id]));
        // The order is now paid for: promote it from context into the queue.
        if (twin.status === 'NEW' && twin.intent === 'ORDER_ONLY' && x?.intent !== 'ORDER_ONLY') {
            const { data: promoted, error: upErr } = await supabase.from('transaction_captures').update({ ...fields, source_ids: sourceIds, updated_at: new Date().toISOString() })
                .eq('id', twin.id).eq('organization_id', orgId).select('*').single();
            if (upErr || !promoted) throw new Error(`Could not update capture: ${upErr?.message}`);
            await matchAndRoute(promoted, settings, { windowMin: LENCO_WINDOW_MIN, categorise: true });
            return { captureId: twin.id, promoted: true };
        }
        await supabase.from('transaction_captures').update({ source_ids: sourceIds, updated_at: new Date().toISOString() }).eq('id', twin.id).eq('organization_id', orgId);
        return { captureId: twin.id, merged: true };
    }
    if (insErr || !created) throw new Error(`Could not save capture: ${insErr?.message}`);

    // ORDER_ONLY stays NEW: kept for context, never listed in the queue.
    if (x?.intent !== 'ORDER_ONLY') await matchAndRoute(created, settings, { windowMin: LENCO_WINDOW_MIN, categorise: true });
    return { captureId: created.id };
}
