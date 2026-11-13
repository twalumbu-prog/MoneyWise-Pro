/**
 * momoCapture/parser.ts — turns an MTN MoMo / Airtel Money / Zamtel Kwacha transaction message into structured fields.
 *
 * Deliberately heuristic rather than one template per provider: the operators reword their messages without notice,
 * so this looks for the parts every confirmation carries (an amount in ZMW/K, a direction verb, a counterparty after
 * "from"/"to", a transaction id, the new balance) instead of matching whole sentences. Parsing lives on the server so a
 * new wording is a deploy, not an app release. Anything it can't read confidently returns null and is ignored.
 */
import crypto from 'crypto';

export type MomoProvider = 'MTN' | 'AIRTEL' | 'ZAMTEL' | 'OTHER';

export interface ParsedMomoMessage {
    provider: MomoProvider;
    direction: 'IN' | 'OUT';
    amount: number;
    fee: number | null;
    balanceAfter: number | null;
    counterparty: string | null;
    reference: string | null;
}

const clean = (s: string) => s.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();

export function detectProvider(text: string, sender?: string | null): MomoProvider {
    const hay = `${sender ?? ''} ${text}`.toLowerCase();
    if (/\bmtn\b|momo/.test(hay)) return 'MTN';
    if (/airtel/.test(hay)) return 'AIRTEL';
    if (/zamtel|kwacha\b/.test(hay)) return 'ZAMTEL';
    return 'OTHER';
}

// Messages that mention money but don't move it: failures, OTPs, payment *requests*.
// Also data/airtime bundle notices ("You have received K10: 1GB - 30Days from 26096… valid until …"): the "K10" there
// is the bundle's name, not money moving. The payment for a bundle arrives as its own confirmation.
const NOT_A_TRANSACTION = /\b(fail(ed|ure)?|unsuccessful|declined|cancel(l)?ed|insufficient|otp|one[- ]time|verification code|has requested|requests? (you|payment)|wants you to pay|approve the|valid until|[0-9]+(\.[0-9]+)?\s?(gb|mb))\b/i;
// The free-text note the sender typed ("Message from sender: rent", "Message -: CBP", "Message:- top up"). It can say
// anything, including words like "failed" or an amount, so it is removed before the message is read. It runs up to
// the next fixed part of the confirmation.
const SENDER_NOTE = /\bmessage(?: from sender)?\s*[-:]+\s*.*?(?=\s*(?:your (?:new |available )?bal|financial transaction|transaction id|txn\b|tid\b|dial \*)|$)/i;
// Promo / help lines. Operators tack these onto real confirmations ("… Dial *115# to check your balance"), so they
// only remove their own sentence; a message that is nothing but promo has no transaction left to parse.
const PROMO_SENTENCE = /(\bdial \*|\bwin\b|\bbonus offer\b|\bbundle offer\b|\bdid you know\b|https?:\/\/|\bwww\.)/i;
// Sentences end at ". " but operators also run them together ("…Stephen Kapambwe.Dial *115# to check…"), so a full
// stop straight before a capitalised word is a boundary too. Amounts ("5.00") and ids ("PP261113.0858.J46616") have a
// digit after the stop and are left whole.
const withoutPromo = (text: string) => text.split(/(?<=[.!?])\s+|\.(?=[A-Z][a-z])/).filter((s) => !PROMO_SENTENCE.test(s))
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`)).join(' ');

const IN_WORDS = /\b(you have received|you received|received|has sent you|sent you|deposit(ed)?|credited|cash[- ]?in|reversal|reversed|refund(ed)?)\b/i;
// Wordings that mean money came in even though they contain an "out" verb ("You have been paid", "Payment received
// from", "X has transferred ZMW 50 to your account").
const STRONG_IN = /\b(has sent you|sent you|received from|payment received|money received|paid you|been (paid|credited)|credited (to|with)|(in)?to your (account|wallet|number|mobile money))\b/i;
const YOU_DID_IT = /\byou(?: have)? (sent|paid|withdrawn|withdrew|transferred|bought|purchased)\b/i;
const OUT_WORDS = /\b(you have sent|you sent|sent|paid|payment (of|to)|you have paid|withdr[ae]wn?|withdrawal|debited|cash[- ]?out|transferred|transfer of|purchase[ds]?|bought|airtime)\b/i;

const NUM = '([0-9]{1,3}(?:,[0-9]{3})+(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)';
// "ZMW 1,250.00", "ZMW1250", "K 50", "K50.00", "ZK 20" — and "Amt: 100.00" / "amount 100" without a currency.
// MTN puts the currency after the number in places ("Your new balance:0.36 ZMW").
const MONEY = new RegExp(`(?:\\b(?:ZMW|ZK)\\s?|(?<![A-Za-z0-9])K\\s?)${NUM}|\\b(?:amount|amt)\\s*[:.]?\\s*(?:ZMW|ZK|K)?\\s?${NUM}|(?<![A-Za-z0-9.,])${NUM}\\s?(?:ZMW|ZK)\\b`, 'gi');

interface MoneyHit { value: number; index: number; before: string }

function moneyHits(text: string): MoneyHit[] {
    const hits: MoneyHit[] = [];
    for (const m of text.matchAll(MONEY)) {
        const raw = m[1] ?? m[2] ?? m[3];
        const value = Number(raw.replace(/,/g, ''));
        if (!Number.isFinite(value) || value <= 0) continue;
        hits.push({ value, index: m.index ?? 0, before: text.slice(Math.max(0, (m.index ?? 0) - 28), m.index).toLowerCase() });
    }
    return hits;
}

const isBalance = (before: string) => /\b(bal(ance)?|avail(able)?)\b(\s+(is|of|now|was))?[^a-z]*$/.test(before);
const isFee = (before: string) => /\b(fee|charge[ds]?|cost|levy|tax)\b(\s+(is|of|was))?[^a-z]*$/.test(before);

function firstMatchIndex(re: RegExp, text: string): number {
    const m = re.exec(text);
    return m ? m.index : -1;
}

function counterpartyAfter(text: string, word: 'from' | 'to'): string | null {
    const re = new RegExp(`\\b${word}\\s+(.{2,80}?)(?=\\s+(?:on|at|ref|txn|trans|transaction|id|via|your|new|balance|bal|fee|for|successful|is)\\b|[.,;]\\s|[.,;]$|\\s*\\(|$)`, 'i');
    const m = re.exec(text);
    if (!m) return null;
    const name = clean(m[1]).replace(/[.:,;]+$/, '');
    // "to your account" / "from your wallet" carry no counterparty.
    if (!name || /^(your|you|the|a|an)\b/i.test(name) || /^(ZMW|ZK|K)\s?[0-9]/i.test(name)) return null;
    return name.slice(0, 80);
}

const REFERENCE = /\b(?:financial transaction id|transaction id|trans(?:action)?\.?\s*id|txn\.?\s*id|txn|tid|ref(?:erence)?(?:\s*no)?\.?)\s*[:#.]?\s*([A-Z0-9][A-Z0-9.\-]{5,})/gi;
/** A transaction id always carries a digit; "Ref: School fees" is a note, and using it would make every later message with the same note look like a duplicate. */
function findReference(text: string): string | null {
    for (const m of text.matchAll(REFERENCE)) {
        const ref = m[1].replace(/\.$/, '');
        if (/[0-9]/.test(ref)) return ref;
    }
    return null;
}
const TILL_NAME = /\btill (?:number|no\.?)\s+(.{2,80}?)(?=[.,;]\s|[.,;]$|$)/i;

export function parseMomoMessage(rawText: string, sender?: string | null): ParsedMomoMessage | null {
    const full = clean(rawText || '');
    if (full.length > 1200) return null;
    const text = withoutPromo(full.replace(SENDER_NOTE, ''));
    if (text.length < 12) return null;
    if (NOT_A_TRANSACTION.test(text)) return null;

    const hits = moneyHits(text);
    const main = hits.find((h) => !isBalance(h.before) && !isFee(h.before));
    if (!main) return null;

    const inAt = firstMatchIndex(IN_WORDS, text);
    const outAt = firstMatchIndex(OUT_WORDS, text);
    let direction: 'IN' | 'OUT';
    if (inAt === -1 && outAt === -1) return null;
    else if (inAt === -1) direction = (STRONG_IN.test(text) && !YOU_DID_IT.test(text)) ? 'IN' : 'OUT';
    else if (outAt === -1) direction = 'IN';
    // "X has sent you" contains "sent" too, so the earlier, more specific phrase wins only when it really is first.
    else direction = (STRONG_IN.test(text) && !YOU_DID_IT.test(text)) ? 'IN' : /has sent you|sent you/i.test(text) ? 'IN' : inAt < outAt ? 'IN' : 'OUT';

    const balance = hits.find((h) => h !== main && isBalance(h.before));
    const fee = hits.find((h) => h !== main && isFee(h.before));
    const reference = findReference(text);
    const till = TILL_NAME.exec(text);

    return {
        provider: detectProvider(text, sender),
        direction,
        amount: Math.round(main.value * 100) / 100,
        fee: fee ? fee.value : null,
        balanceAfter: balance ? balance.value : null,
        counterparty: direction === 'IN'
            ? counterpartyAfter(text, 'from')
            // A till payment names the shop after "Till Number"; a withdrawal names the agent after "from".
            : counterpartyAfter(text, 'to') ?? (till ? clean(till[1]).slice(0, 80) : null) ?? counterpartyAfter(text, 'from'),
        reference,
    };
}

/**
 * A plain "what's my balance" reply (a dial-code check, or MTN/Airtel's own balance SMS) — no money moved, but its
 * figure is the most trustworthy anchor for the running wallet balance, better than only inferring one from
 * transaction messages. Must not also look like a transaction: checked after parseMomoMessage returns null.
 */
export function parseBalanceOnly(rawText: string, sender?: string | null): { provider: MomoProvider; balance: number } | null {
    const full = clean(rawText || '');
    if (full.length > 1200) return null;
    const text = withoutPromo(full.replace(SENDER_NOTE, ''));
    if (text.length < 6 || NOT_A_TRANSACTION.test(text)) return null;
    if (IN_WORDS.test(text) || OUT_WORDS.test(text)) return null; // a real transaction, not a plain enquiry

    const hits = moneyHits(text);
    if (hits.length === 0) return null;
    const reading = hits.find((h) => isBalance(h.before)) ?? (hits.length === 1 ? hits[0] : null);
    if (!reading) return null;
    return { provider: detectProvider(text, sender), balance: Math.round(reading.value * 100) / 100 };
}

/** Same message arriving by SMS, by notification, or twice from the Shortcut must collapse to one row. */
export function dedupeKey(parsed: ParsedMomoMessage, rawText: string): string {
    if (parsed.reference) return `${parsed.provider}:REF:${parsed.reference.toUpperCase()}`;
    const norm = rawText.toLowerCase().replace(/[^a-z0-9.]/g, '');
    return `${parsed.provider}:H:${crypto.createHash('sha256').update(norm).digest('hex').slice(0, 40)}`;
}

/** Ledger description for a captured movement, e.g. "MTN MoMo · Received from John Banda". */
export function describe(p: ParsedMomoMessage): string {
    const label = { MTN: 'MTN MoMo', AIRTEL: 'Airtel Money', ZAMTEL: 'Zamtel Kwacha', OTHER: 'Mobile money' }[p.provider];
    const what = p.direction === 'IN'
        ? (p.counterparty ? `Received from ${p.counterparty}` : 'Money received')
        : (p.counterparty ? `Paid to ${p.counterparty}` : 'Money sent');
    return `${label} · ${what}`;
}
