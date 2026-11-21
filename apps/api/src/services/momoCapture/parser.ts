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

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export function detectProvider(text: string, sender?: string | null): MomoProvider {
    const hay = `${sender ?? ''} ${text}`.toLowerCase();
    if (/\bmtn\b|momo/.test(hay)) return 'MTN';
    if (/airtel/.test(hay)) return 'AIRTEL';
    if (/zamtel|kwacha\b/.test(hay)) return 'ZAMTEL';
    return 'OTHER';
}

// Messages that mention money but don't move it: failures, OTPs, payment *requests*, promos.
const NOT_A_TRANSACTION = /\b(fail(ed|ure)?|unsuccessful|declined|cancel(l)?ed|insufficient|otp|one[- ]time|verification code|has requested|requests? (you|payment)|wants you to pay|approve the|dial \*|win |bonus offer|bundle offer)\b/i;

const IN_WORDS = /\b(you have received|you received|received|has sent you|sent you|deposit(ed)? (to|into) your|credited|cash[- ]?in|reversal|refund(ed)?)\b/i;
const OUT_WORDS = /\b(you have sent|you sent|sent|paid|payment (of|to)|you have paid|withdr[ae]wn?|withdrawal|debited|cash[- ]?out|transferred|transfer of|purchase[ds]?|bought|airtime)\b/i;

const NUM = '([0-9]{1,3}(?:,[0-9]{3})+(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)';
// "ZMW 1,250.00", "ZMW1250", "K 50", "K50.00", "ZK 20" — and "Amt: 100.00" / "amount 100" without a currency.
const MONEY = new RegExp(`(?:\\b(?:ZMW|ZK)\\s?|(?<![A-Za-z0-9])K\\s?)${NUM}|\\b(?:amount|amt)\\s*[:.]?\\s*(?:ZMW|ZK|K)?\\s?${NUM}`, 'gi');

interface MoneyHit { value: number; index: number; before: string }

function moneyHits(text: string): MoneyHit[] {
    const hits: MoneyHit[] = [];
    for (const m of text.matchAll(MONEY)) {
        const raw = m[1] ?? m[2];
        const value = Number(raw.replace(/,/g, ''));
        if (!Number.isFinite(value) || value <= 0) continue;
        hits.push({ value, index: m.index ?? 0, before: text.slice(Math.max(0, (m.index ?? 0) - 28), m.index).toLowerCase() });
    }
    return hits;
}

const isBalance = (before: string) => /\b(bal(ance)?|avail(able)?|new bal)\b[^a-z]*$/.test(before) || /balance (is|now)[^a-z]*$/.test(before);
const isFee = (before: string) => /\b(fee|charge[ds]?|cost|levy|tax)\b[^a-z]*$/.test(before);

function firstMatchIndex(re: RegExp, text: string): number {
    const m = re.exec(text);
    return m ? m.index : -1;
}

function counterpartyAfter(text: string, word: 'from' | 'to'): string | null {
    const re = new RegExp(`\\b${word}\\s+(.{2,80}?)(?=\\s+(?:on|at|ref|txn|trans|transaction|id|via|your|new|balance|bal|fee|for)\\b|[.,;]\\s|[.,;]$|\\s*\\(|$)`, 'i');
    const m = re.exec(text);
    if (!m) return null;
    const name = clean(m[1]).replace(/[.:,;]+$/, '');
    // "to your account" / "from your wallet" carry no counterparty.
    if (!name || /^(your|you|the|a|an)\b/i.test(name) || /^(ZMW|ZK|K)\s?[0-9]/i.test(name)) return null;
    return name.slice(0, 80);
}

const REFERENCE = /\b(?:financial transaction id|transaction id|trans(?:action)?\.?\s*id|txn\.?\s*id|txn|tid|ref(?:erence)?(?:\s*no)?\.?)\s*[:#.]?\s*([A-Z0-9][A-Z0-9.\-]{5,})/i;

export function parseMomoMessage(rawText: string, sender?: string | null): ParsedMomoMessage | null {
    const text = clean(rawText || '');
    if (text.length < 12 || text.length > 1200) return null;
    if (NOT_A_TRANSACTION.test(text)) return null;

    const hits = moneyHits(text);
    const main = hits.find((h) => !isBalance(h.before) && !isFee(h.before));
    if (!main) return null;

    const inAt = firstMatchIndex(IN_WORDS, text);
    const outAt = firstMatchIndex(OUT_WORDS, text);
    let direction: 'IN' | 'OUT';
    if (inAt === -1 && outAt === -1) return null;
    else if (inAt === -1) direction = 'OUT';
    else if (outAt === -1) direction = 'IN';
    // "X has sent you" contains "sent" too, so the earlier, more specific phrase wins only when it really is first.
    else direction = /has sent you|sent you/i.test(text) ? 'IN' : inAt < outAt ? 'IN' : 'OUT';

    const balance = hits.find((h) => h !== main && isBalance(h.before));
    const fee = hits.find((h) => h !== main && isFee(h.before));
    const ref = REFERENCE.exec(text);

    return {
        provider: detectProvider(text, sender),
        direction,
        amount: Math.round(main.value * 100) / 100,
        fee: fee ? fee.value : null,
        balanceAfter: balance ? balance.value : null,
        counterparty: direction === 'IN' ? counterpartyAfter(text, 'from') : counterpartyAfter(text, 'to'),
        reference: ref ? ref[1].replace(/\.$/, '') : null,
    };
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
    const withoutDial = text.replace(/\bdial\s+\*\S*/gi, '');
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
    const bad = NOT_A_TRANSACTION.exec(text);
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
