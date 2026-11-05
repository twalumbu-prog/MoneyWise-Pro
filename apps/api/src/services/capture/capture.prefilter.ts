/**
 * Stage 1: drop chatter before any AI call. Keeps a message only if it has media, something that looks like money, or
 * a payment word. "I'll take 2" is dropped here on purpose: it still reaches the model as conversation context when
 * the payment message arrives.
 */
const DROP_TYPES = new Set(['sticker', 'reaction', 'system', 'unsupported', 'contacts', 'location', 'ephemeral']);

const MONEY = [
    /(?:^|[^a-z])(?:k|zmw|kwacha)\s?\d/i,   // K450, ZMW 1500, kwacha 200
    /\d\s?(?:k|kwacha|zmw)\b/i,             // 1.5k, 200 kwacha
    /\b\d{1,3}(?:,\d{3})+\b/,               // 1,500
];
const PAYMENT_WORDS = /\b(?:paid|pay|paying|payment|sent|send|deposit(?:ed)?|transfer(?:red)?|receipt|invoice|order(?:ed)?|momo|mobile money|airtel money|natuma|ndatuma|nalipila|ndalipila|ndalipira)\b/i;

export function shouldExtract(m: { type?: string | null; body?: string | null; hasMedia?: boolean }): boolean {
    if (DROP_TYPES.has(String(m.type || '').toLowerCase())) return false;
    if (m.hasMedia) return true;
    const body = String(m.body || '');
    return MONEY.some(r => r.test(body)) || PAYMENT_WORDS.test(body);
}
