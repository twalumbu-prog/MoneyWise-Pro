/**
 * messageIntent.service.ts — flags sales intent in inbound customer messages and proposes a match to a real
 * Lenco inflow. DRAFT ONLY: it writes suggestion columns on messaging_messages; it never replies, never posts a
 * journal and never moves money. A user confirms or dismisses the suggestion in the Inbox.
 *
 * The chat alone can't prove a sale — the money arriving in the wallet does. So the model extracts
 * {intent, amount}, then we look for an unmatched inflow of that amount shortly after the message.
 */
import { supabase } from '../lib/supabase';
import { openRouterComplete } from './ai/ai.provider';

const MIN_CONFIDENCE = 0.5;
const MATCH_WINDOW_HOURS = 48;

const SYSTEM = `You read one customer message sent to a small business in Zambia (currency ZMW/Kwacha, "K"). Reply with JSON only:
{"intent":"SALE_INTENT|PAYMENT_CLAIM|ORDER_QUERY|OTHER","confidence":0-1,"amount":number|null,"summary":"<=120 chars"}
SALE_INTENT = customer wants to buy / places an order. PAYMENT_CLAIM = customer says they have paid or are paying (mobile money, bank).
ORDER_QUERY = asks about price, stock or an existing order. OTHER = anything else. amount only if explicitly stated.`;

export async function classifyMessage(
    messageId: string,
    organizationId: string
): Promise<void> {
    try {
        const { data: msg, error: fetchError } = await supabase
            .from('messaging_messages')
            .select('*')
            .eq('id', messageId)
            .eq('organization_id', organizationId)
            .maybeSingle();

        if (fetchError) {
            throw new Error(`Message lookup failed: ${fetchError.message}`);
        }

        // Missing, outgoing, empty or already-classified messages
        // do not need further processing.
        if (!msg || msg.direction !== 'IN' || !msg.body || msg.classified_at) {
            return;
        }

        const raw = await openRouterComplete(
            msg.body.slice(0, 1000),
            {
                system: SYSTEM,
                jsonObject: true,
                timeoutMs: 15_000
            }
        );

        const r = JSON.parse(raw);

        const intent = [
            'SALE_INTENT',
            'PAYMENT_CLAIM',
            'ORDER_QUERY',
            'OTHER'
        ].includes(r.intent) ? r.intent : 'OTHER';

        const confidence = Math.max(
            0,
            Math.min(1, Number(r.confidence) || 0)
        );

        const amount = Number(r.amount) > 0
            ? Number(r.amount)
            : null;

        const update: Record<string, any> = {
            intent,
            intent_confidence: confidence,
            intent_amount: amount,
            intent_summary: String(r.summary || '').slice(0, 200) || null,
            classified_at: new Date().toISOString()
        };

        if (
            (intent === 'SALE_INTENT' || intent === 'PAYMENT_CLAIM') &&
            confidence >= MIN_CONFIDENCE
        ) {
            const match = await findInflowMatch(
                organizationId,
                msg,
                amount
            );

            if (match) {
                Object.assign(update, {
                    match_status: 'SUGGESTED',
                    matched_cashbook_entry_id: match.id,
                    match_score: match.score
                });
            }
        }

        const { error: updateError } = await supabase
            .from('messaging_messages')
            .update(update)
            .eq('id', messageId)
            .eq('organization_id', organizationId);

        if (updateError) {
            throw new Error(`Message classification update failed: ${updateError.message}`);
        }

    } catch (e: any) {
        console.error(`[MessageIntent] ${messageId}:`, e?.message);
        throw e;
    }
}

/** Scores unmatched inflows within the window: amount equality (0.6) + proximity in time (0.2) + phone in description (0.2). */
async function findInflowMatch(organizationId: string, msg: any, amount: number | null): Promise<{ id: string; score: number } | null> {
    if (!amount) return null;
    const sent = new Date(msg.sent_at).getTime();
    const from = new Date(sent - 60 * 60_000).toISOString();
    const to = new Date(sent + MATCH_WINDOW_HOURS * 3600_000).toISOString();

    const { data: entries } = await supabase.from('cashbook_entries')
        .select('id, debit, description, created_at, external_reference')
        .eq('organization_id', organizationId).eq('entry_type', 'INFLOW')
        .gte('created_at', from).lte('created_at', to).limit(200);

    // Entries already suggested/confirmed for another message aren't candidates again.
    const ids = (entries || []).map((e: any) => e.id);
    const { data: taken } = ids.length
        ? await supabase.from('messaging_messages').select('matched_cashbook_entry_id')
            .eq('organization_id', organizationId).in('matched_cashbook_entry_id', ids).neq('match_status', 'DISMISSED')
        : { data: [] as any[] };
    const used = new Set((taken || []).map((t: any) => t.matched_cashbook_entry_id));

    const phoneTail = String(msg.contact_phone || '').replace(/\D/g, '').slice(-9);
    let best: { id: string; score: number } | null = null;
    for (const e of entries || []) {
        if (used.has(e.id) || Math.abs(Number(e.debit) - amount) > 0.009) continue;
        const hoursAfter = (new Date(e.created_at).getTime() - sent) / 3600_000;
        let score = 0.6 + (hoursAfter >= -1 && hoursAfter <= 6 ? 0.2 : 0.05);
        if (phoneTail.length === 9 && String(e.description || '').replace(/\D/g, '').includes(phoneTail)) score += 0.2;
        if (!best || score > best.score) best = { id: e.id, score: Math.round(score * 1000) / 1000 };
    }
    return best;
}
