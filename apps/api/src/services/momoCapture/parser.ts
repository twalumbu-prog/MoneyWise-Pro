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
const stripDialFooter = (s: string) => s.replace(/\bdial\s+\*\S*/gi, '');

/**
 * An ordinary phone number ("+260 97 123 4567", "0971234567"): 7+ digits and only number punctuation. Operators and
 * banks send from a name ("MoMo", "AirtelMoney", "Zanaco") or a short code ("115"), never from a personal number, so
 * a "You have received ZMW 1000" from one is a scam (the classic "I sent it by mistake, please send it back") and is
 * never a transaction, whatever it says.
 */
export function isPersonalNumber(sender?: string | null): boolean {
    const s = (sender ?? '').trim();
    return /^[+0-9 ().-]+$/.test(s) && (s.match(/\d/g)?.length ?? 0) >= 7;
}

export function detectProvider(text: string, sender?: string | null): MomoProvider {
    const hay = `${sender ?? ''} ${text}`.toLowerCase();
    if (/\bmtn\b|momo/.test(hay)) return 'MTN';
    if (/airtel/.test(hay) || /\bTID:?\s*(?:CI|PP)\d{6}\./i.test(text)) return 'AIRTEL';
    if (/zamtel|kwacha\b/.test(hay)) return 'ZAMTEL';
    return 'OTHER';
}

// Messages that mention money but don't move it: failures, OTPs, payment *requests*.
// Also data/airtime bundle notices ("You have received K10: 1GB - 30Days from 26096… valid until …"): the "K10" there
// is the bundle's name, not money moving. The payment for a bundle arrives as its own confirmation.
const NOT_A_TRANSACTION = /\b(fail(ed|ure)?|unsuccessful|declined|cancel(l)?ed|insufficient|otp|one[- ]time|verification code|has requested|requests? (you|payment)|wants you to pay|approve the|valid until|[0-9]+(\.[0-9]+)?\s?(gb|mb))\b/i;
// Airtime/call/data "balance" notices ("Your last call cost was K2.00. Your Current Balance is K15.00."): that
// figure is airtime credit, not the mobile money wallet. A general carrier sender (e.g. "MTNZM") sends both kinds
// under the same name, so only a plain balance enquiry (parseBalanceOnly) needs to tell them apart — a real
// transaction (which parseMomoMessage requires a transaction id for) is never one of these regardless of wording,
// so this only ever excludes a reading, never a booked payment (buying a data bundle is still real money moving).
const NOT_A_BALANCE_READING = /\b(call cost|airtime|data bundle|sms bundle|voice bundle|minutes bundle|bundle balance)\b/i;
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
const OUT_WORDS = /\b(success:?[^.]{0,80}\bcard\b|\bat [^.]{2,60}\bcard\s*\*?\d{4}|you have sent|you sent|sent|paid|payment (of|to)|you have paid|withdr[ae]wn?|withdrawal|debited|cash[- ]?out|transferred|transfer of|purchase[ds]?|bought|airtime)\b/i;

const NUM = '([0-9]{1,3}(?:,[0-9]{3})+(?:\\.[0-9]{1,4})?|[0-9]+(?:\\.[0-9]{1,4})?)';
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

const isBalance = (before: string) => /\b(bal(ance)?|avail(able)?)\b(\s+(is|of|now|was))*[^a-z]*$/.test(before);
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

const REFERENCE = /\b(financial transaction id|transaction id|trans(?:action)?\.?\s*id|txn\.?\s*id|txn|tid|ref(?:erence)?(?:\s*no)?\.?)\s*[:#.]?\s*([A-Z0-9][A-Z0-9.\-]{5,})/gi;
/**
 * A transaction id normally carries a digit; "Ref: School fees" is a note, and using it would make every later message
 * with the same note look like a duplicate. The exception is an id introduced by an explicit transaction-id label and
 * written in capitals — Zamtel's are all letters ("Txn ID: FLPFCKRP").
 */
function findReference(text: string): string | null {
    for (const m of text.matchAll(REFERENCE)) {
        const ref = m[2].replace(/\.$/, '');
        if (/[0-9]/.test(ref)) return ref;
        const labelledId = !/^ref/i.test(m[1]);
        if (labelledId && /^[A-Z]{6,}$/.test(ref)) return ref;
    }
    return null;
}
const TILL_NAME = /\btill (?:number|no\.?)\s+(.{2,80}?)(?=[.,;]\s|[.,;]$|$)/i;

export function parseMomoMessage(rawText: string, sender?: string | null): ParsedMomoMessage | null {
    const full = clean(rawText || '');
    if (full.length > 1200) return null;
    const text = withoutPromo(full.replace(SENDER_NOTE, ''));
    if (text.length < 12) return null;
    // Receipts often end "Dial *115# to check balance". That's a footer, not an approval prompt, so it must not
    // trip the filter ("has requested … Dial *115# to approve" is still caught by its own words).
    if (NOT_A_TRANSACTION.test(stripDialFooter(text))) return null;

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

    const reference = findReference(text);
    // A mobile money confirmation always carries a transaction id. Without one, this is read as a promo, a balance
    // reminder, or some other message that merely mentions an amount — never as money that actually moved.
    if (!reference) return null;

    const balance = hits.find((h) => h !== main && isBalance(h.before));
    const fee = hits.find((h) => h !== main && isFee(h.before));
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
 *
 * Deliberately strict, since nothing here is confirmed by a transaction id the way a real confirmation is: the
 * sender or the text must actually name MTN, Airtel or Zamtel (never OTHER — that is how a promo mentioning a
 * Kwacha figure, from a sender that isn't even a provider, once created a balance out of thin air), and the amount
 * must sit right next to the word "balance", not just be the only figure in the message.
 */
export function parseBalanceOnly(rawText: string, sender?: string | null): { provider: MomoProvider; balance: number } | null {
    const full = clean(rawText || '');
    if (full.length > 1200) return null;
    const text = withoutPromo(full.replace(SENDER_NOTE, ''));
    if (text.length < 6 || NOT_A_TRANSACTION.test(text) || NOT_A_BALANCE_READING.test(text)) return null;
    if (IN_WORDS.test(text) || OUT_WORDS.test(text)) return null; // a real transaction, not a plain enquiry

    const provider = detectProvider(text, sender);
    if (provider === 'OTHER') return null;
    // A carrier's general sender (e.g. "MTNZM") sends airtime/call notices too, under the same name as mobile money
    // ones. The NOT_A_TRANSACTION check above catches the wordings seen so far; this is the other half — require the
    // message to actually say so, unless the sender is a dedicated mobile money one that sends nothing else.
    const DEDICATED_SENDER = /\b(momo|airtelmoney|zamtelkwacha)\b/i;
    const MOBILE_MONEY_CONTEXT = /\b(mobile money|momo|e-? ?wallet)\b/i;
    if (!(sender && DEDICATED_SENDER.test(sender)) && !MOBILE_MONEY_CONTEXT.test(text)) return null;
    const hits = moneyHits(text);
    const reading = hits.find((h) => isBalance(h.before));
    if (!reading) return null;
    return { provider, balance: Math.round(reading.value * 100) / 100 };
}

export interface ParsedBalanceCheck {
    provider: MomoProvider;
    balance: number;
}

// Balances of things that are not the money account: airtime, data, bundles, minutes, loyalty points.
const NOT_MONEY_BALANCE = /\b(airtime|data|bundle|bundles|mb|gb|minutes|mins|sms|points|bonus|loan|credit limit|overdraft)\b/i;

/**
 * "Your MTN MoMo balance is ZMW 105.00" — a balance enquiry reply. Only called after parseMomoMessage() returned null,
 * so anything that moved money has already been handled. Needs a balance word right before exactly one amount, so a
 * mini-statement or an airtime/data balance is ignored rather than misread.
 */
export function parseBalanceMessage(rawText: string, sender?: string | null): ParsedBalanceCheck | null {
    const text = clean(rawText || '');
    if (text.length < 10 || text.length > 600) return null;
    // Balance replies routinely end "Dial *115# for more", which the transaction filter reads as an approval prompt.
    const withoutDial = stripDialFooter(text);
    if (NOT_A_TRANSACTION.test(withoutDial) || NOT_MONEY_BALANCE.test(withoutDial)) return null;
    const hits = moneyHits(text);
    const balances = hits.filter((h) => isBalance(h.before));
    if (balances.length !== 1 || hits.length !== 1) return null;
    const provider = detectProvider(text, sender);
    return { provider, balance: Math.round(balances[0].value * 100) / 100 };
}

export type Diagnosis =
    | { kind: 'TRANSACTION'; parsed: ParsedMomoMessage }
    | { kind: 'BALANCE'; balance: ParsedBalanceCheck }
    | { kind: 'IGNORED'; reason: string; sensitive: boolean };

/** What the server makes of a message and, when it ignores it, why — used by the ignored-messages log and the web tester. */
export function diagnoseMessage(rawText: string, sender?: string | null): Diagnosis {
    const parsed = parseMomoMessage(rawText, sender);
    if (parsed) return { kind: 'TRANSACTION', parsed };
    const balance = parseBalanceMessage(rawText, sender);
    if (balance) return { kind: 'BALANCE', balance };

    const text = clean(rawText || '');
    if (text.length < 12) return { kind: 'IGNORED', reason: 'Too short to be a transaction message', sensitive: false };
    if (text.length > 1200) return { kind: 'IGNORED', reason: 'Too long to be a transaction message', sensitive: false };
    const bad = NOT_A_TRANSACTION.exec(stripDialFooter(text));
    if (bad) {
        const sensitive = /otp|one[- ]time|verification code/i.test(bad[0]);
        return { kind: 'IGNORED', reason: `Looks like a failure, a code or a request (matched "${bad[0].trim()}")`, sensitive };
    }
    const hits = moneyHits(text);
    if (hits.length === 0) return { kind: 'IGNORED', reason: 'No amount found (needs ZMW, K or an "Amt:" figure)', sensitive: false };
    if (NOT_MONEY_BALANCE.test(text)) return { kind: 'IGNORED', reason: 'An airtime, data or bundle balance, not the money account', sensitive: false };
    if (!hits.some((h) => !isBalance(h.before) && !isFee(h.before))) {
        return { kind: 'IGNORED', reason: hits.filter((h) => isBalance(h.before)).length > 1 ? 'Several balances in one message, so it is unclear which to compare' : 'Only a fee or balance amount, no money movement', sensitive: false };
    }
    return { kind: 'IGNORED', reason: 'No "received" or "sent/paid" wording found next to the amount', sensitive: false };
}

/** Same balance reply arriving by SMS and by notification collapses; a later check of the same figure does not. */
export function balanceDedupeKey(provider: MomoProvider, balance: number, observedAt: string): string {
    const bucket = Math.floor(new Date(observedAt).getTime() / (5 * 60 * 1000));
    return `${provider}:BAL:${balance.toFixed(2)}:${bucket}`;
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
