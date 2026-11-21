/**
 * "Your money" chapter of personal onboarding: provider catalogue, amounts, asset/debt kinds, and what a connected
 * Gmail suggests. Pure, tested by `npm run test:onboarding`.
 */

export type ProviderType = 'MOBILE_MONEY' | 'BANK' | 'CUSTOM';

export interface ProviderDef { code: string; name: string; type: ProviderType; /** lower-case, no spaces; matched against email senders */ keys: string[] }

/** Keep codes in step with packages/core/src/reference/providers.ts (both clients show the same list). */
export const PROVIDERS: ProviderDef[] = [
    { code: 'MTN', name: 'MTN MoMo', type: 'MOBILE_MONEY', keys: ['mtn', 'momo'] },
    { code: 'AIRTEL', name: 'Airtel Money', type: 'MOBILE_MONEY', keys: ['airtel'] },
    { code: 'ZAMTEL', name: 'Zamtel Kwacha', type: 'MOBILE_MONEY', keys: ['zamtel'] },
    { code: 'ZANACO', name: 'Zanaco', type: 'BANK', keys: ['zanaco'] },
    { code: 'FNB', name: 'FNB', type: 'BANK', keys: ['fnb', 'firstnational'] },
    { code: 'STANBIC', name: 'Stanbic Bank', type: 'BANK', keys: ['stanbic'] },
    { code: 'ABSA', name: 'Absa Bank', type: 'BANK', keys: ['absa', 'barclays'] },
    { code: 'ACCESS', name: 'Access Bank', type: 'BANK', keys: ['accessbank', 'atlasmara'] },
    { code: 'INDO_ZAMBIA', name: 'Indo Zambia Bank', type: 'BANK', keys: ['izb', 'indozambia'] },
    { code: 'ECOBANK', name: 'Ecobank', type: 'BANK', keys: ['ecobank'] },
    { code: 'FIRST_CAPITAL', name: 'First Capital Bank', type: 'BANK', keys: ['firstcapital', 'fcb'] },
    { code: 'STANDARD_CHARTERED', name: 'Standard Chartered', type: 'BANK', keys: ['standardchartered', 'sc.com'] },
    { code: 'AB_BANK', name: 'AB Bank', type: 'BANK', keys: ['abbank'] },
    { code: 'ZNBS', name: 'ZNBS', type: 'BANK', keys: ['znbs'] },
    { code: 'NATSAVE', name: 'Natsave', type: 'BANK', keys: ['natsave'] },
    { code: 'FIRST_ALLIANCE', name: 'First Alliance Bank', type: 'BANK', keys: ['firstalliance', 'fabank'] },
    { code: 'BANK_OF_CHINA', name: 'Bank of China', type: 'BANK', keys: ['bankofchina', 'boc'] },
    { code: 'CITI', name: 'Citibank', type: 'BANK', keys: ['citi'] },
    { code: 'UBA', name: 'UBA', type: 'BANK', keys: ['ubagroup', 'uba'] },
];

export const providerByCode = (code: unknown) => PROVIDERS.find((p) => p.code === code);

/** Money typed by a person: ≥ 0, at most 2 decimals, under 10 billion. Commas and "K" are allowed. */
export function parseMoney(raw: unknown): { value: number } | { error: string } {
    if (typeof raw === 'number') {
        if (!Number.isFinite(raw) || raw < 0) return { error: 'Enter an amount of zero or more' };
        if (Math.abs(raw * 100 - Math.round(raw * 100)) > 1e-6) return { error: 'Use at most 2 decimals' };
        if (raw >= 1e10) return { error: 'That amount is too large' };
        return { value: Math.round(raw * 100) / 100 };
    }
    const s = String(raw ?? '').trim().replace(/^(zmw|k)\s*/i, '').replace(/,/g, '');
    if (!s) return { error: 'Enter an amount' };
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: s.includes('-') ? 'Enter an amount of zero or more' : 'Use digits, with at most 2 decimals' };
    const v = Number(s);
    if (v >= 1e10) return { error: 'That amount is too large' };
    return { value: v };
}

/**
 * Things a person owns or owes besides cash. The account name carries the kind's word so Grow buckets it right
 * (Grow reads savings / investment from the account name).
 */
export const HOLDING_KINDS = {
    savings: { label: 'Savings or fixed deposit', type: 'ASSET', subtype: 'Savings', word: 'Savings' },
    investments: { label: 'Investments (shares, bonds, T-bills)', type: 'ASSET', subtype: 'Investments', word: 'Investment' },
    pension: { label: 'Pension', type: 'ASSET', subtype: 'Investments', word: 'Pension' },
    property: { label: 'Property', type: 'ASSET', subtype: 'Fixed Assets', word: 'Property' },
    vehicle: { label: 'Vehicle', type: 'ASSET', subtype: 'Fixed Assets', word: 'Vehicle' },
    business: { label: 'Business stake', type: 'ASSET', subtype: 'Investments', word: 'Business stake' },
    owed_to_me: { label: 'Money people owe you', type: 'ASSET', subtype: 'Receivables', word: 'Owed to me' },
    loan: { label: 'Loan', type: 'LIABILITY', subtype: 'Loans', word: 'Loan' },
    credit_card: { label: 'Credit card or overdraft', type: 'LIABILITY', subtype: 'Credit Cards', word: 'Credit' },
    owed_by_me: { label: 'Money you owe people', type: 'LIABILITY', subtype: 'Payables', word: 'Owed by me' },
} as const;
export type HoldingKind = keyof typeof HOLDING_KINDS;
export const isHoldingKind = (k: unknown): k is HoldingKind => typeof k === 'string' && k in HOLDING_KINDS;

/** "Laptop fund" + savings → "Laptop fund (Savings)"; a name already saying the kind is kept. */
export function holdingAccountName(kind: HoldingKind, name: unknown): string {
    const word = HOLDING_KINDS[kind].word;
    const n = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!n) return word;
    return n.toLowerCase().includes(word.toLowerCase()) ? n : `${n} (${word})`;
}

/** Wallet name from provider + optional nickname; a nickname wins when given. */
export function walletName(provider: ProviderDef | undefined, nickname: unknown, customName?: unknown): string {
    const nick = String(nickname ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (nick) return nick;
    if (provider) return provider.name;
    const c = String(customName ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return c || 'Cash';
}

// ── Gmail findings ───────────────────────────────────────────────────────────

export interface EmailRow { from_address: string | null; subject: string | null; received_at: string; has_attachments?: boolean; attachments?: any; intent_amount?: number | null; id?: string }

/** Common regular bills and who sends their emails. Keys are matched against the sender + subject. */
export const BILL_SENDERS: { key: string; label: string; match: RegExp }[] = [
    { key: 'dstv', label: 'DStv', match: /dstv|multichoice/i },
    { key: 'gotv', label: 'GOtv', match: /gotv/i },
    { key: 'zesco', label: 'ZESCO electricity', match: /zesco/i },
    { key: 'water', label: 'Water', match: /lwsc|water\s*(and|&)\s*sewerage|lusaka water/i },
    { key: 'netflix', label: 'Netflix', match: /netflix/i },
    { key: 'showmax', label: 'Showmax', match: /showmax/i },
    { key: 'spotify', label: 'Spotify', match: /spotify/i },
    { key: 'internet', label: 'Internet / Wi-Fi', match: /liquid|starlink|iconnect|zamnet|paratus/i },
    { key: 'insurance', label: 'Insurance', match: /insurance|assurance|madison|prudential/i },
    { key: 'gym', label: 'Gym', match: /\bgym\b|fitness/i },
    { key: 'school_fees', label: 'School fees', match: /school fees|tuition|masterfees/i },
];

const senderText = (e: EmailRow) => `${e.from_address ?? ''} ${e.subject ?? ''}`.toLowerCase();
const compact = (s: string) => s.replace(/[^a-z0-9.]/g, '');
const isStatement = (e: EmailRow) => /statement/i.test(e.subject ?? '')
    || (Array.isArray(e.attachments) && e.attachments.some((a: any) => /statement/i.test(String(a?.filename ?? ''))));

/**
 * What a mailbox says about someone's money: banks and mobile money that email them (by provider code), regular
 * bills (with the latest amount seen), and the newest statement (for proof of residence). Only the last 90 days.
 */
export function findingsFromEmails(rows: EmailRow[], now = Date.now()) {
    const since = now - 90 * 24 * 3600 * 1000;
    const recent = rows.filter((r) => new Date(r.received_at).getTime() >= since);
    const providers = new Set<string>();
    const bills = new Map<string, { key: string; label: string; amount: number | null; lastSeen: string }>();
    let statement: { emailId: string | null; provider: string | null; receivedAt: string; filename: string | null } | null = null;

    for (const e of recent) {
        const text = compact(senderText(e));
        const prov = PROVIDERS.find((p) => p.keys.some((k) => text.includes(k)));
        if (prov) providers.add(prov.code);
        for (const b of BILL_SENDERS) {
            if (!b.match.test(senderText(e))) continue;
            const prev = bills.get(b.key);
            if (!prev || prev.lastSeen < e.received_at) {
                bills.set(b.key, { key: b.key, label: b.label, amount: e.intent_amount != null ? Number(e.intent_amount) : prev?.amount ?? null, lastSeen: e.received_at });
            }
        }
        if (isStatement(e) && prov?.type === 'BANK' && (!statement || statement.receivedAt < e.received_at)) {
            const att = Array.isArray(e.attachments) ? e.attachments.find((a: any) => /\.pdf$/i.test(String(a?.filename ?? ''))) : null;
            statement = { emailId: e.id ?? null, provider: prov.code, receivedAt: e.received_at, filename: att?.filename ?? null };
        }
    }
    return { providers: [...providers], bills: [...bills.values()], statement };
}
