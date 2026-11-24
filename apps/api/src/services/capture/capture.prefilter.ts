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

const NEWSLETTER_SENDER = /(?:^|[<\s"])(?:newsletter|newsletters|news|marketing|promo|promotions|mailer|campaign)[._-]?[a-z0-9]*@/i;

/** Mailing lists are dropped unless they carry a file or a real amount. Anything else needs money or a payment word. */
export function shouldExtractEmail(e: { from?: string | null; subject?: string | null; text?: string | null; headers?: Record<string, string> | null; hasAttachment?: boolean }): boolean {
    const body = `${e.subject || ''}\n${e.text || ''}`;
    const hasMoney = MONEY.some(r => r.test(body));
    const headers = Object.keys(e.headers || {}).map(h => h.toLowerCase());
    const isList = NEWSLETTER_SENDER.test(e.from || '') || headers.includes('list-unsubscribe');
    if (isList) return !!e.hasAttachment && hasMoney;
    return !!e.hasAttachment || hasMoney || PAYMENT_WORDS.test(body);
}
