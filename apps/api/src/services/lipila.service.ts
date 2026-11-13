/**
 * Lipila card payments (hosted checkout). Each business or individual connects its own Lipila wallet by saving that wallet's API key, so
 * card money from its customers lands in its own wallet. The card details are typed on Lipila's page and never reach MoneyWise.
 *
 * Trust model: a webhook body never decides success. It is only a signal to ask Lipila's status API, and that answer (looked up with the
 * key of the business that took the payment) is the source of truth. Recording the payment is idempotent, so a webhook, a polling
 * browser and a retry can all arrive together and the books still show the payment once.
 */
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { cashbookService } from './cashbook.service';
import { confirmBookingsForReference, markPaymentLinkPaid } from './product_routing.service';
import { whatsappService } from './whatsapp.service';
import { emailService } from './email.service';
import { pushService } from './push.service';

export class LipilaError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'LIPILA') { super(message); }
}

/** Lipila keeps this share of what it collects. The customer is charged more so the business still receives the full price. */
export const LIPILA_CARD_RATE = 0.04;
/** Every card payment reference starts with this, so status checks know which gateway to ask. */
export const CARD_REF_PREFIX = 'LPL-';
export const CARD_ACCOUNT_TYPE = 'LIPILA_WALLET';
/** Every payout sent from the Card Wallet has a reference starting with this, so status checks, webhooks and pollers ask Lipila, not Lenco. */
export const PAYOUT_REF_PREFIX = 'LPLPAY-';
export const isCardPayoutRef = (ref: unknown): boolean => typeof ref === 'string' && ref.startsWith(PAYOUT_REF_PREFIX);

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const grossUp = (net: number) => {
    const charged = round2(net / (1 - LIPILA_CARD_RATE));
    return { charged, fee: round2(charged - net) };
};

const baseUrl = (env: string) => (env === 'production' ? 'https://blz.lipila.io' : 'https://api.lipila.dev');

/* ───────────── Encryption of the stored keys ───────────── */

function encryptionKey(): Buffer | null {
    const raw = process.env.GATEWAY_CREDENTIALS_KEY || process.env.MESSAGING_TOKEN_KEY;
    if (!raw) return null;
    const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    return key.length === 32 ? key : null;
}
export const encryptionReady = () => !!encryptionKey();
const encrypt = (plain: string): string => {
    const key = encryptionKey();
    if (!key) throw new LipilaError('The server has no encryption key set for saving API keys, so nothing was saved. Ask your administrator to set GATEWAY_CREDENTIALS_KEY.', 503, 'NO_ENC_KEY');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
};
const decrypt = (enc: string): string => {
    const key = encryptionKey();
    if (!key) throw new LipilaError('The server has no encryption key set.', 503, 'NO_ENC_KEY');
    const [iv, tag, data] = enc.split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
};

/* ───────────── Who is allowed, and with which key ───────────── */

let rolloutCache: { at: number; all: boolean; orgs: Set<string> } | null = null;
/** Card payments are switched on business by business (app_settings "lipila_rollout": { all, orgs }). */
async function rollout() {
    if (rolloutCache && Date.now() - rolloutCache.at < 30_000) return rolloutCache;
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'lipila_rollout').maybeSingle();
    rolloutCache = { at: Date.now(), all: data?.value?.all === true, orgs: new Set<string>(Array.isArray(data?.value?.orgs) ? data!.value.orgs.map(String) : []) };
    return rolloutCache;
}
export const clearRolloutCache = () => { rolloutCache = null; };
export async function isInRollout(orgId: string): Promise<boolean> { const r = await rollout(); return r.all || r.orgs.has(orgId); }

export interface Credentials { apiKey: string; webhookSecret: string | null; env: 'sandbox' | 'production'; enabled: boolean }

export async function getCredentials(orgId: string): Promise<Credentials | null> {
    const { data } = await supabase.from('org_gateway_credentials').select('lipila_api_key_enc, lipila_webhook_secret_enc, lipila_env, lipila_enabled').eq('organization_id', orgId).maybeSingle();
    if (!data?.lipila_api_key_enc) return null;
    try {
        return {
            apiKey: decrypt(data.lipila_api_key_enc), webhookSecret: data.lipila_webhook_secret_enc ? decrypt(data.lipila_webhook_secret_enc) : null,
            env: data.lipila_env === 'production' ? 'production' : 'sandbox', enabled: data.lipila_enabled === true,
        };
    } catch (e: any) {
        console.error('[Lipila] Could not read the saved key for', orgId, e?.message);
        return null;
    }
}

/** True when this business may take card payments: in the rollout, has a saved key, and has switched cards on. */
export async function cardsEnabledFor(orgId: string): Promise<boolean> {
    if (!orgId || !(await isInRollout(orgId))) return false;
    const c = await getCredentials(orgId);
    return !!c?.enabled;
}

export async function settingsView(orgId: string, apiBase: string | null) {
    const available = await isInRollout(orgId);
    const { data } = await supabase.from('org_gateway_credentials').select('lipila_api_key_enc, lipila_webhook_secret_enc, lipila_env, lipila_enabled, key_hint, updated_at').eq('organization_id', orgId).maybeSingle();
    return {
        available, encryptionReady: encryptionReady(), configured: !!data?.lipila_api_key_enc, enabled: data?.lipila_enabled === true, env: (data?.lipila_env ?? 'sandbox') as 'sandbox' | 'production',
        keyHint: data?.key_hint ?? null, hasWebhookSecret: !!data?.lipila_webhook_secret_enc, updatedAt: data?.updated_at ?? null,
        webhookUrl: apiBase ? `${apiBase.replace(/\/$/, '')}/webhooks/lipila` : null, feeNote: `Lipila keeps ${LIPILA_CARD_RATE * 100}% of each card payment. Customers are charged a little more so you receive the full price.`,
    };
}

export interface SaveInput { apiKey?: string; webhookSecret?: string; env?: string; enabled?: boolean }

export async function saveCredentials(orgId: string, userId: string, input: SaveInput, apiBase: string | null) {
    if (!(await isInRollout(orgId))) throw new LipilaError('Card payments aren’t available for this account yet.', 403, 'NOT_AVAILABLE');
    const env = input.env === 'production' ? 'production' : 'sandbox';
    const { data: existing } = await supabase.from('org_gateway_credentials').select('organization_id, lipila_api_key_enc').eq('organization_id', orgId).maybeSingle();
    const key = String(input.apiKey ?? '').trim();
    const row: Record<string, unknown> = { organization_id: orgId, lipila_env: env, updated_by: userId, updated_at: new Date().toISOString() };
    if (key) {
        if (key.length < 12 || /\s/.test(key)) throw new LipilaError('That doesn’t look like a Lipila API key.', 400, 'BAD_KEY');
        row.lipila_api_key_enc = encrypt(key);
        row.key_hint = `…${key.slice(-4)}`;
    } else if (!existing?.lipila_api_key_enc) {
        throw new LipilaError('Paste your Lipila API key.', 400, 'NO_KEY');
    }
    if (input.webhookSecret !== undefined) {
        const secret = String(input.webhookSecret).trim();
        row.lipila_webhook_secret_enc = secret ? encrypt(secret) : null;
    }
    // Turning cards on needs a saved key; the status of the connection is shown in the screen.
    row.lipila_enabled = input.enabled === true;
    const { error } = await supabase.from('org_gateway_credentials').upsert(row, { onConflict: 'organization_id' });
    if (error) throw error;
    return settingsView(orgId, apiBase);
}

export async function removeCredentials(orgId: string) {
    await supabase.from('org_gateway_credentials').delete().eq('organization_id', orgId);
    return { ok: true };
}

/* ───────────── Talking to Lipila ───────────── */

/** Lipila's own answer for a payment. Anything that isn't an explicit "Failed" stays pending, so a slow or unavailable Lipila never fails a payment. */
export async function checkStatus(reference: string, apiKey: string, env: string): Promise<{ status: 'successful' | 'failed' | 'pending'; message?: string; httpStatus?: number }> {
    try {
        const res = await fetch(`${baseUrl(env)}/api/v1/collections/check-status?referenceId=${encodeURIComponent(reference)}`, { method: 'GET', headers: { accept: 'application/json', 'x-api-key': apiKey }, signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return { status: 'pending', message: `Lipila answered ${res.status}`, httpStatus: res.status };
        const data: any = await res.json().catch(() => null);
        const s = String(data?.status ?? '').toLowerCase();
        if (s === 'successful') return { status: 'successful' };
        if (s === 'failed') return { status: 'failed', message: data?.message || 'The card payment failed.' };
        return { status: 'pending', message: data?.message };
    } catch (e: any) {
        return { status: 'pending', message: e?.message || String(e) };
    }
}

/** Checks the saved key works: a wrong key is refused (401), a right one just says it hasn't heard of this reference (404). */
export async function testKey(orgId: string) {
    const c = await getCredentials(orgId);
    if (!c) throw new LipilaError('Save your API key first.', 400, 'NO_KEY');
    const probe = `TEST-${crypto.randomBytes(6).toString('hex')}`;
    try {
        const res = await fetch(`${baseUrl(c.env)}/api/v1/collections/check-status?referenceId=${probe}`, { headers: { accept: 'application/json', 'x-api-key': c.apiKey }, signal: AbortSignal.timeout(15_000) });
        if (res.status === 401 || res.status === 403) return { ok: false, message: `Lipila refused this key. Check that it is a ${c.env} key and that the environment above matches it.` };
        if (res.status >= 500) return { ok: false, message: 'Lipila isn’t answering right now. Try again in a moment.' };
        return { ok: true, message: `Connected to Lipila (${c.env}).` };
    } catch (e: any) { return { ok: false, message: `Couldn’t reach Lipila: ${e?.message ?? e}` }; }
}

/* ───────────── Paying out from the Card Wallet ───────────── */

/** The mobile networks Lipila pays to. Payouts to banks need a SWIFT code and more details, so they are not offered from the Card Wallet. */
export const PAYOUT_NETWORKS = ['mtn', 'airtel', 'zamtel'];

/** Lipila's payout charge is 1.5% of the amount, taken from the wallet on top of it. */
export const PAYOUT_FEE_RATE = 0.015;
/**
 * The charge for a payout of this amount, to the ngwee. Kept in this one place (and mirrored in core's lencoService) so it is easy to
 * correct if Lipila changes it. Lipila gave the rate as 1.5%; its docs' table of fixed charges is no longer used.
 */
export function payoutFee(amount: number): number {
    return Math.round(Number(amount) * PAYOUT_FEE_RATE * 100) / 100;
}

/** A Zambian mobile number Lipila can pay: 260 and nine digits. */
export const isPayableNumber = (phone: string): boolean => /^260\d{9}$/.test(payoutNumber(phone));

/** 0971234567 / +260971234567 / 260971234567 → 260971234567, the form Lipila expects. */
export function payoutNumber(phone: string): string {
    const d = String(phone ?? '').replace(/\D/g, '');
    return d.startsWith('260') ? d : d.startsWith('0') ? `260${d.slice(1)}` : `260${d}`;
}

export interface PayoutAnswer { status: 'pending' | 'successful' | 'failed'; identifier?: string | null; message?: string | null }

/** Lipila's own wording for a payout. Anything that isn't clearly Successful or Failed stays pending. */
export function payoutStatusOf(data: any): PayoutAnswer['status'] {
    const s = String(data?.status ?? '').toLowerCase();
    return s === 'successful' || s === 'success' ? 'successful' : s === 'failed' || s === 'failure' ? 'failed' : 'pending';
}

const liveCache = new Map<string, { at: number; value: number | null }>();
/**
 * What Lipila itself says the Card Wallet holds, asked with this business's key. This (not the books) is what a payout can actually draw on:
 * money can sit in Lipila that was never recorded here. Cached for 30 seconds so a picker isn't slow; `fresh` skips the cache (used when
 * a payout is about to be sent). Null means Lipila couldn't be asked, and callers fall back to the books.
 */
export async function liveCardBalance(orgId: string, opts: { fresh?: boolean; waitMs?: number } = {}): Promise<number | null> {
    const hit = liveCache.get(orgId);
    if (!opts.fresh && hit && Date.now() - hit.at < 30_000) return hit.value;
    const ask = walletSummary(orgId).then((w) => (typeof w.balance === 'number' && Number.isFinite(w.balance) ? w.balance : null)).catch(() => null);
    const value = opts.waitMs ? await Promise.race([ask, new Promise<null>((r) => setTimeout(() => r(null), opts.waitMs))]) : await ask;
    liveCache.set(orgId, { at: Date.now(), value });
    return value;
}

/** Can this business pay out from its Card Wallet? It needs its own Lipila key and to be in the rollout. */
export async function payoutsReady(orgId: string): Promise<boolean> {
    return walletConnected(orgId);
}

export class PayoutUnknownError extends Error { outcomeUnknown = true; constructor(message: string) { super(message); } }

/**
 * Sends money from the business's Lipila wallet to a mobile money number (POST /disbursements/mobile-money). A clear refusal (bad key,
 * bad request, rate limit) throws a LipilaError: nothing was sent. No answer, or a server error, throws PayoutUnknownError: the money
 * may be on its way, so the caller must ask Lipila by reference before deciding anything.
 */
export async function createMobileMoneyPayout(input: { orgId: string; reference: string; amount: number; phone: string; narration: string; apiBase?: string | null }): Promise<PayoutAnswer> {
    if (!input.reference.startsWith(PAYOUT_REF_PREFIX)) throw new LipilaError('Invalid payout reference.', 400, 'REFERENCE');
    const creds = await getCredentials(input.orgId);
    if (!creds || !(await isInRollout(input.orgId))) throw new LipilaError('The Card Wallet isn’t connected for this business.', 403, 'NOT_ENABLED');
    // Exactly the request shape Master Fees uses successfully in production: no callback header and no extra body fields. Lipila has no
    // reliable payout callback, so the outcome is confirmed by polling check-status with this reference.
    const body = { referenceId: input.reference, amount: round2(input.amount), accountNumber: payoutNumber(input.phone), currency: 'ZMW', narration: input.narration.slice(0, 100) };
    let res: Response;
    try {
        res = await fetch(`${baseUrl(creds.env)}/api/v1/disbursements/mobile-money`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', accept: 'application/json', 'x-api-key': creds.apiKey },
            body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
        });
    } catch (e: any) { throw new PayoutUnknownError(`Lipila didn’t answer (${e?.name === 'TimeoutError' ? 'timed out' : e?.message ?? e}).`); }
    const data: any = await res.json().catch(() => null);
    if (res.status >= 500) throw new PayoutUnknownError(`Lipila had a problem (${res.status}).`);
    if (!res.ok) {
        const detail = data?.message || data?.title || (data?.errors ? JSON.stringify(data.errors).slice(0, 200) : '');
        console.error('[Lipila] payout refused', res.status, JSON.stringify(data)?.slice(0, 300));
        if (res.status === 401) throw new LipilaError('Lipila answered 401 to this payout: it doesn’t accept this API key for sending money. In the Lipila dashboard, check that the key is the one for this wallet, is allowed to send money (payouts), and matches the environment (live or sandbox). Reading the balance can work while payouts are refused.', 502, 'BAD_KEY');
        if (res.status === 403) throw new LipilaError('Lipila answered 403 to this payout: the key is inactive, or this server’s IP address isn’t whitelisted on the wallet. In the Lipila dashboard, open the wallet’s Security settings and add this server’s IP address to IP Whitelisting.', 502, 'IP_OR_INACTIVE');
        if (res.status === 429) throw new LipilaError('Lipila is busy. Wait a moment and try again.', 429, 'RATE');
        throw new LipilaError(detail || 'Lipila couldn’t accept this payout. Check the number and amount.', 400, 'REFUSED');
    }
    return { status: payoutStatusOf(data), identifier: data?.identifier ?? null, message: data?.message ?? null };
}

/**
 * Where a payout stands, asked of Lipila by its reference. `notfound` means Lipila has no such payout (a 404): it is reported as such
 * and never treated as a failure by itself. A check that errors or times out is `pending`.
 */
export async function checkPayoutStatus(orgId: string, reference: string): Promise<PayoutAnswer & { notFound?: boolean; exists?: boolean }> {
    const creds = await getCredentials(orgId);
    if (!creds) return { status: 'pending', message: 'No Lipila key is saved for this business.' };
    try {
        const res = await fetch(`${baseUrl(creds.env)}/api/v1/disbursements/check-status?referenceId=${encodeURIComponent(reference)}`, { headers: { accept: 'application/json', 'x-api-key': creds.apiKey }, signal: AbortSignal.timeout(15_000) });
        // A reference Lipila has never seen answers 404 or 400: that is "no record", not an error.
        if (res.status === 404 || res.status === 400) return { status: 'pending', notFound: true, message: 'Lipila has no payout with this reference.' };
        if (!res.ok) return { status: 'pending', message: `Lipila answered ${res.status}` };
        const data: any = await res.json().catch(() => null);
        return { status: payoutStatusOf(data), identifier: data?.identifier ?? null, message: data?.message ?? null, exists: !!data };
    } catch (e: any) { return { status: 'pending', message: e?.message || String(e) }; }
}

/* ───────────── The business's Lipila wallet: balance and activity ───────────── */

/** True when this business has a saved Lipila key and is in the rollout, so its wallet shows on the Wallets page (even if cards are switched off). */
export async function walletConnected(orgId: string): Promise<boolean> {
    if (!orgId || !(await isInRollout(orgId))) return false;
    const { data } = await supabase.from('org_gateway_credentials').select('lipila_api_key_enc').eq('organization_id', orgId).maybeSingle();
    return !!data?.lipila_api_key_enc;
}

/** Reads a number out of whatever shape Lipila answers with ({ success, data: { balance } } is the documented one). */
const pickNumber = (...vals: unknown[]): number | null => { for (const v of vals) { const n = typeof v === 'string' ? Number(v) : v; if (typeof n === 'number' && Number.isFinite(n)) return n; } return null; };

/** Lipila's own figure for the wallet balance, asked live with this business's key. Never throws: a problem is reported alongside what we do know. */
export async function walletSummary(orgId: string) {
    const ledger = await supabase.from('cashbook_entries').select('debit, credit').eq('organization_id', orgId).eq('account_type', CARD_ACCOUNT_TYPE).neq('status', 'PENDING').limit(20000);
    const recorded = round2((ledger.data ?? []).reduce((s: number, r: any) => s + num(r.debit) - num(r.credit), 0));
    const base = { connected: false, env: null as string | null, balance: null as number | null, booked: null as number | null, currency: 'ZMW', recordedSales: recorded, fetchedAt: new Date().toISOString(), error: null as string | null };
    const creds = await getCredentials(orgId);
    if (!creds) return { ...base, error: 'No Lipila key is saved.' };
    try {
        // Exactly as Lipila documents it: only accept and x-api-key. A content-type on this bodiless GET is a known cause of a generic 400.
        const res = await fetch(`${baseUrl(creds.env)}/api/v1/merchants/balance`, { method: 'GET', headers: { accept: 'application/json', 'x-api-key': creds.apiKey }, signal: AbortSignal.timeout(20_000) });
        const text = await res.text().catch(() => '');
        let body: any = null; try { body = text ? JSON.parse(text) : null; } catch { body = null; }
        if (!res.ok) {
            // Lipila's headline can be generic ("One or more errors occurred!"); the real reason is in `errors`, so it is shown.
            const detail = body?.errors ? JSON.stringify(body.errors).slice(0, 240) : text.slice(0, 200);
            const why = res.status === 401 ? `The key was refused. Check that it is a ${creds.env === 'production' ? 'live' : 'testing'} key and that the environment saved in Integrations matches it.`
                : res.status === 403 ? 'The key is inactive or not allowed. Check it is active in Lipila (and, if Lipila asks for it, that this server’s address is whitelisted).'
                : res.status === 429 ? 'Too many requests. Wait a moment and refresh.' : '';
            return { ...base, connected: true, env: creds.env, error: `${why ? `${why} ` : ''}Lipila said: ${body?.message || 'error'} (HTTP ${res.status}${detail ? `: ${detail}` : ''})` };
        }
        const d = body?.data ?? body ?? {};
        const balance = pickNumber(d.balance, d.availableBalance, d.available, body?.balance, body?.availableBalance);
        const booked = pickNumber(d.bookedBalance, d.booked, body?.bookedBalance);
        if (balance === null) return { ...base, connected: true, env: creds.env, booked, error: 'Lipila answered, but the balance wasn’t in the answer.' };
        // Kept as Lipila sends it (up to three decimals); the page rounds it only to display it.
        return { ...base, connected: true, env: creds.env, balance, booked, currency: String(d.currency ?? body?.currency ?? 'ZMW') };
    } catch (e: any) {
        return { ...base, connected: true, env: creds.env, error: `Couldn’t reach Lipila: ${e?.message ?? e}` };
    }
}

/** Card payments started on this business's pages, including ones that were abandoned or declined (the Wallets list only shows paid ones). */
export async function recentCardPayments(orgId: string, limit = 50) {
    const { data, error } = await supabase.from('lipila_card_sessions').select('reference, net_amount, charged_amount, fee_amount, status, customer, context, failure_reason, record_error, created_at, finalized_at').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(Math.min(200, Math.max(1, limit)));
    if (error) throw error;
    return (data ?? []).map((s: any) => ({
        reference: s.reference, status: s.status as string, net: num(s.net_amount), charged: num(s.charged_amount), fee: num(s.fee_amount), customer: s.customer?.name ?? null, phone: s.customer?.phone ?? null,
        source: s.context?.kind ?? null, reason: s.failure_reason ?? null, problem: s.record_error ?? null, startedAt: s.created_at, finishedAt: s.finalized_at,
    }));
}

/* ───────────── Starting a card payment ───────────── */

export interface InitiateInput {
    organizationId: string; reference: string; apiBase: string | null; returnUrl?: string;
    customer?: { firstName?: string; lastName?: string; email?: string; phone?: string };
    context?: Record<string, unknown>;
}

/** What the business should receive, taken from the pending sale the checkout already recorded (never from the browser). */
async function pendingNet(orgId: string, reference: string): Promise<{ net: number; description: string | null } | null> {
    const find = async (q: any) => (await q).data as any[] | null;
    let rows = await find(supabase.from('cashbook_entries').select('id, status, debit, description').eq('organization_id', orgId).eq('external_reference', reference).limit(5));
    if (!rows?.length) rows = await find(supabase.from('cashbook_entries').select('id, status, debit, description').eq('organization_id', orgId).like('description', `%${reference}%`).limit(5));
    const pending = (rows ?? []).find((r) => r.status === 'PENDING');
    return pending && num(pending.debit) > 0 ? { net: round2(num(pending.debit)), description: pending.description ?? null } : null;
}

/**
 * The checkout records the sale from what the browser sends, so the amount to charge is checked here against what the server knows:
 * a payment link's own amount, and the real price of every product in the order. A tampered amount is refused before any card is charged.
 * (A quick-pay amount is chosen by the customer, so there is nothing to check it against.)
 */
async function assertAmountIsRight(orgId: string, reference: string, net: number, ctx?: Record<string, unknown>): Promise<void> {
    const wrong = () => new LipilaError('The amount doesn’t match this order. Please go back and try again.', 409, 'AMOUNT');
    if (ctx?.kind === 'payment_link' && ctx?.token) {
        const { data: link } = await supabase.from('payment_links').select('amount, status, organization_id').eq('token', String(ctx.token)).maybeSingle();
        if (!link || link.organization_id !== orgId) throw new LipilaError('That payment link can’t be found.', 404, 'LINK');
        if (link.status && link.status !== 'ACTIVE') throw new LipilaError('This payment link has already been paid or is closed.', 409, 'LINK_CLOSED');
        if (Math.abs(num(link.amount) - net) > 0.01) throw wrong();
    }
    const { data: lines } = await supabase.from('product_sales').select('product_id, quantity, amount_paid').eq('organization_id', orgId).eq('reference', reference);
    if (lines?.length) {
        const sum = round2(lines.reduce((s: number, l: any) => s + num(l.amount_paid), 0));
        if (Math.abs(sum - net) > 0.01) throw wrong();
        const ids = [...new Set(lines.map((l: any) => l.product_id).filter(Boolean))];
        const { data: prods } = ids.length ? await supabase.from('products').select('id, price').in('id', ids).eq('organization_id', orgId) : { data: [] as any[] };
        const price = new Map<string, number>((prods ?? []).map((p: any) => [p.id, num(p.price)]));
        // A product with a price can't be bought for less. (Donations have no price: the payer chooses.)
        for (const l of lines) { const p = price.get(l.product_id) ?? 0; if (p > 0 && num(l.amount_paid) + 0.01 < round2(p * num(l.quantity))) throw wrong(); }
    }
}

export async function initiateCard(input: InitiateInput) {
    const { organizationId: orgId, reference } = input;
    if (!reference.startsWith(CARD_REF_PREFIX)) throw new LipilaError('Invalid payment reference.', 400, 'REFERENCE');
    if (!(await cardsEnabledFor(orgId))) throw new LipilaError('Card payments aren’t available for this business yet. Please use Mobile Money.', 403, 'NOT_ENABLED');
    const creds = await getCredentials(orgId);
    if (!creds) throw new LipilaError('Card payments aren’t set up for this business yet.', 403, 'NOT_ENABLED');

    // A repeated request for the same payment returns the same card page instead of starting a second one.
    const { data: prior } = await supabase.from('lipila_card_sessions').select('*').eq('reference', reference).maybeSingle();
    if (prior) {
        if (prior.organization_id !== orgId) throw new LipilaError('Invalid payment reference.', 400, 'REFERENCE');
        if (prior.status === 'SUCCESSFUL') return { redirectUrl: null, alreadyPaid: true, charged: num(prior.charged_amount), fee: num(prior.fee_amount) };
        if (prior.status === 'INITIATED' && prior.redirect_url) return { redirectUrl: prior.redirect_url as string, alreadyPaid: false, charged: num(prior.charged_amount), fee: num(prior.fee_amount) };
    }

    const pend = await pendingNet(orgId, reference);
    if (!pend) throw new LipilaError('Start the payment from the checkout page first.', 409, 'NO_INTENT');
    await assertAmountIsRight(orgId, reference, pend.net, input.context);
    const { charged, fee } = grossUp(pend.net);

    const c = input.customer ?? {};
    const email = String(c.email ?? '').trim() || 'no-reply@moneywise.co';
    const callbackUrl = input.apiBase ? `${input.apiBase.replace(/\/$/, '')}/webhooks/lipila` : '';
    const payload = {
        customerInfo: { firstName: String(c.firstName || 'Customer').slice(0, 60), lastName: String(c.lastName || 'User').slice(0, 60), phoneNumber: String(c.phone ?? '').slice(0, 20), city: 'Lusaka', country: 'ZM', address: 'Lusaka', zip: '10101', email },
        collectionRequest: { referenceId: reference, amount: charged, narration: 'Payment', accountNumber: email, currency: 'ZMW', backUrl: input.returnUrl || 'https://moneywise.co', referenceData: reference },
    };
    const res = await fetch(`${baseUrl(creds.env)}/api/v1/collections/card`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', accept: 'application/json', 'x-api-key': creds.apiKey, ...(callbackUrl ? { callbackUrl } : {}) }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000),
    }).catch((e: any) => { throw new LipilaError(`Couldn’t reach the card provider: ${e?.message ?? e}`, 502, 'UPSTREAM'); });
    const data: any = await res.json().catch(() => null);
    if (!res.ok || !data?.cardRedirectionUrl) {
        const detail = data?.message || data?.title || data?.error || (data?.errors ? JSON.stringify(data.errors).slice(0, 200) : '');
        console.error('[Lipila] initiate failed', res.status, JSON.stringify(data)?.slice(0, 300));
        if (res.status === 401 || res.status === 403) throw new LipilaError('The card provider refused this business’s key. The owner needs to check the Lipila settings.', 502, 'BAD_KEY');
        throw new LipilaError(detail || 'Couldn’t start the card payment. Please try again or use Mobile Money.', 502, 'UPSTREAM');
    }

    const row = {
        reference, organization_id: orgId, net_amount: pend.net, charged_amount: charged, fee_amount: fee, currency: 'ZMW', status: 'INITIATED', redirect_url: data.cardRedirectionUrl,
        customer: { name: [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || null, phone: c.phone ?? null, email: c.email ?? null }, context: input.context ?? {}, updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('lipila_card_sessions').upsert(row, { onConflict: 'reference' });
    if (error) throw error;
    return { redirectUrl: data.cardRedirectionUrl as string, alreadyPaid: false, charged, fee };
}

/**
 * A signed-in member tops up the business's card wallet by card. The amount is what the business should end up with; the card is charged
 * that plus Lipila's fee. The pending deposit is written here, on the server, so the card payment is built on our own record of it.
 */
export const DEPOSIT_MIN = 10;
export const DEPOSIT_MAX = 50_000;
export async function initiateDeposit(input: { organizationId: string; userId: string; amount: unknown; apiBase: string | null; returnUrl?: string; customer?: InitiateInput['customer'] }) {
    const orgId = input.organizationId;
    const amount = round2(num(input.amount));
    if (!(amount >= DEPOSIT_MIN)) throw new LipilaError(`The smallest card deposit is K${DEPOSIT_MIN}.`, 400, 'AMOUNT');
    if (amount > DEPOSIT_MAX) throw new LipilaError(`The largest card deposit is K${DEPOSIT_MAX.toLocaleString()}.`, 400, 'AMOUNT');
    if (!(await cardsEnabledFor(orgId))) throw new LipilaError('Card payments aren’t available for this business yet.', 403, 'NOT_ENABLED');

    const reference = `${CARD_REF_PREFIX}DEP-${Date.now()}-${orgId.slice(0, 8)}-${crypto.randomBytes(3).toString('hex')}`;
    const { error } = await supabase.from('cashbook_entries').insert({
        organization_id: orgId, entry_type: 'INFLOW', account_type: CARD_ACCOUNT_TYPE, description: `PENDING_INTENT: Card deposit | Ref: ${reference}`,
        debit: amount, credit: 0, balance_after: 0, date: new Date().toISOString().split('T')[0], status: 'PENDING', wallet_id: null, external_reference: reference,
    });
    if (error) throw new LipilaError('Couldn’t start the deposit. Please try again.', 500, 'INTENT');
    try {
        const r = await initiateCard({ organizationId: orgId, reference, apiBase: input.apiBase, returnUrl: input.returnUrl, customer: input.customer, context: { kind: 'deposit', user: input.userId } });
        return { reference, ...r };
    } catch (e) {
        await supabase.from('cashbook_entries').delete().eq('organization_id', orgId).eq('external_reference', reference).eq('status', 'PENDING');
        throw e;
    }
}

/* ───────────── The webhook ───────────── */

const TOLERANCE_SECONDS = 300;
const b64 = (s: string) => Buffer.from(s, 'base64');

/** Standard Webhooks: HMAC-SHA256 of `${id}.${timestamp}.${rawBody}` with the base64-decoded secret, signatures as "v1,<base64>" (space-separated during a key rotation). */
export function verifySignature(secret: string, id: string, timestamp: string, rawBody: string, header: string, nowMs = Date.now()): boolean {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_SECONDS) return false;
    const mac = crypto.createHmac('sha256', b64(secret.replace(/^whsec_/, ''))).update(`${id}.${ts}.${rawBody}`).digest();
    for (const part of header.split(' ')) {
        const [version, sig] = part.split(',');
        if (version !== 'v1' || !sig) continue;
        try { const got = b64(sig); if (got.length === mac.length && crypto.timingSafeEqual(got, mac)) return true; } catch { /* try the next */ }
    }
    return false;
}

/**
 * Finds which business a webhook is for from the (still unverified) body, then checks the signature with THAT business's secret.
 * Reading the body first is safe: a forged body still has to carry a valid signature for that business's secret.
 */
export async function verifyWebhook(rawBody: string, headers: Record<string, any>): Promise<{ ok: boolean; reference: string | null; reason?: string }> {
    const id = String(headers['webhook-id'] ?? ''); const ts = String(headers['webhook-timestamp'] ?? ''); const sig = String(headers['webhook-signature'] ?? '');
    if (!id || !ts || !sig) return { ok: false, reference: null, reason: 'missing signature headers' };
    let event: any; try { event = JSON.parse(rawBody); } catch { return { ok: false, reference: null, reason: 'invalid JSON' }; }
    const candidates = [event?.identifier, event?.referenceId].filter((v) => typeof v === 'string' && v.startsWith(CARD_REF_PREFIX)) as string[];
    let session: any = null;
    if (candidates.length) { const { data } = await supabase.from('lipila_card_sessions').select('reference, organization_id').in('reference', candidates).maybeSingle(); session = data; }
    // A payout from the Card Wallet is found through its disbursement record instead of a card session.
    let payout: { reference: string; organization_id: string } | null = null;
    if (!session) {
        const payCandidates = [event?.referenceId, event?.identifier].filter((v) => typeof v === 'string' && v.startsWith(PAYOUT_REF_PREFIX)) as string[];
        if (payCandidates.length) { const { data } = await supabase.from('disbursements').select('external_reference, organization_id').in('external_reference', payCandidates).limit(1).maybeSingle(); if (data) payout = { reference: data.external_reference, organization_id: data.organization_id }; }
    }
    // A payment for a business with its own secret is verified only with that secret. Anything else falls back to the shared one.
    const ownerOrg = session?.organization_id ?? payout?.organization_id ?? null;
    const own = ownerOrg ? (await getCredentials(ownerOrg))?.webhookSecret ?? null : null;
    const secret = own || process.env.LIPILA_WEBHOOK_SECRET || null;
    if (!secret) return { ok: false, reference: null, reason: 'no signing secret' };
    if (!verifySignature(secret, id, ts, rawBody, sig)) return { ok: false, reference: null, reason: 'bad signature' };
    return { ok: true, reference: session?.reference ?? payout?.reference ?? null };
}

/* ───────────── Deciding the outcome and recording it ───────────── */

export interface Outcome { state: 'successful' | 'failed' | 'pending'; referenceNumber?: string | null; message?: string }

const STALE_PROCESSING_MS = 90_000;

async function receiptNumber(orgId: string, reference: string): Promise<string | null> {
    const { data } = await supabase.from('cashbook_entries').select('reference_number, status').eq('organization_id', orgId).eq('external_reference', reference).neq('status', 'PENDING').limit(1).maybeSingle();
    return data?.reference_number ?? null;
}

/** Asks Lipila (with this business's key) and, when it says successful, records the payment once. Safe to call from anywhere, any number of times. */
export async function finalizeCard(reference: string): Promise<Outcome> {
    const { data: s } = await supabase.from('lipila_card_sessions').select('*').eq('reference', reference).maybeSingle();
    if (!s) throw new LipilaError('Payment not found.', 404, 'NOT_FOUND');
    if (s.status === 'SUCCESSFUL') return { state: 'successful', referenceNumber: await receiptNumber(s.organization_id, reference) };
    if (s.status === 'FAILED') return { state: 'failed', message: s.failure_reason || 'The card payment failed. Nothing was charged.' };

    const creds = await getCredentials(s.organization_id);
    if (!creds) return { state: 'pending', message: 'Waiting for the card provider.' };
    const st = await checkStatus(reference, creds.apiKey, creds.env);
    if (st.status === 'failed') {
        await supabase.from('lipila_card_sessions').update({ status: 'FAILED', failure_reason: st.message ?? null, updated_at: new Date().toISOString(), finalized_at: new Date().toISOString() }).eq('reference', reference).in('status', ['INITIATED', 'PROCESSING']);
        return { state: 'failed', message: st.message || 'The card payment failed. Nothing was charged.' };
    }
    if (st.status !== 'successful') return { state: 'pending', message: st.message };

    // Take the work: only one caller records a given payment. A claim that went quiet for 90 seconds can be taken over.
    const now = new Date().toISOString();
    let { data: claimed } = await supabase.from('lipila_card_sessions').update({ status: 'PROCESSING', updated_at: now }).eq('reference', reference).eq('status', 'INITIATED').select('reference');
    if (!claimed?.length) {
        const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
        ({ data: claimed } = await supabase.from('lipila_card_sessions').update({ updated_at: now }).eq('reference', reference).eq('status', 'PROCESSING').lt('updated_at', cutoff).select('reference'));
    }
    if (!claimed?.length) {
        const { data: again } = await supabase.from('lipila_card_sessions').select('status').eq('reference', reference).maybeSingle();
        if (again?.status === 'SUCCESSFUL') return { state: 'successful', referenceNumber: await receiptNumber(s.organization_id, reference) };
        return { state: 'pending', message: 'Recording your payment…' };
    }

    try {
        await recordPayment(s);
        await supabase.from('lipila_card_sessions').update({ status: 'SUCCESSFUL', record_error: null, updated_at: new Date().toISOString(), finalized_at: new Date().toISOString() }).eq('reference', reference);
        return { state: 'successful', referenceNumber: await receiptNumber(s.organization_id, reference) };
    } catch (e: any) {
        // Lipila confirmed the money but we could not write it down. Keep the real error and stay open: the next check retries.
        console.error(`[Lipila] PAID BUT NOT RECORDED: ${reference}:`, e?.message ?? e);
        await supabase.from('lipila_card_sessions').update({ status: 'INITIATED', record_error: String(e?.message ?? e).slice(0, 500), updated_at: new Date().toISOString() }).eq('reference', reference);
        return { state: 'pending', message: 'Your payment was received and is being recorded.' };
    }
}

/** Writes the payment into the books once, on its own Lipila wallet account, and does what a finished sale needs. */
async function recordPayment(s: any): Promise<void> {
    const orgId: string = s.organization_id; const reference: string = s.reference; const net = num(s.net_amount);
    const date = new Date().toISOString().split('T')[0];

    const { data: rows } = await supabase.from('cashbook_entries').select('*').eq('organization_id', orgId).or(`external_reference.eq.${reference},description.like.%${reference}%`).limit(10);
    const done = (rows ?? []).find((r: any) => r.status !== 'PENDING');
    const pendings = (rows ?? []).filter((r: any) => r.status === 'PENDING');

    if (!done) {
        let narration = pendings[0]?.description ? String(pendings[0].description).replace('PENDING_INTENT: ', '').replace('PENDING_INTENT:', '').split(' | Ref:')[0].trim() : '';
        if (!narration) narration = 'Card payment';
        if (!narration.includes(reference)) narration = `${narration} | Ref: ${reference}`;
        const isSale = narration.startsWith('Sale:') || narration.startsWith('Revenue:') || /-(PUB|PL)\b/.test(reference);
        // The sale the checkout recorded shares this reference, and a reference can only be used once, so it steps aside for the real
        // entry. If the real entry can't be written, the sale is put back exactly as it was.
        for (const p of pendings) await supabase.from('cashbook_entries').delete().eq('id', p.id).eq('status', 'PENDING');
        try {
            await cashbookService.createEntry(orgId, {
                date, description: narration, debit: net, credit: 0, entry_type: 'INFLOW', account_type: CARD_ACCOUNT_TYPE, status: 'UNACCOUNTED', wallet_id: null, external_reference: reference,
                skip_inflow_notification: isSale, sender_name: s.customer?.name ?? null, sender_phone: s.customer?.phone ?? null,
            } as any);
        } catch (e) {
            for (const p of pendings) await supabase.from('cashbook_entries').insert(p).then(() => undefined, () => undefined);
            throw e;
        }
    } else {
        for (const p of pendings) await supabase.from('cashbook_entries').delete().eq('id', p.id).eq('status', 'PENDING');
    }

    await supabase.from('product_sales').update({ status: 'COMPLETED', updated_at: new Date().toISOString() }).eq('reference', reference);
    await confirmBookingsForReference(orgId, reference).catch((e) => console.error('[Lipila] bookings:', e?.message));
    const linkPaid = await markPaymentLinkPaid(orgId, reference).catch(() => false);
    const notify = linkPaid
        ? [whatsappService.notifyPaymentLinkPaid(orgId, reference), emailService.notifyPaymentLinkPaid(orgId, reference), pushService.notifyPaymentLinkPaid(orgId, reference)]
        : [whatsappService.notifyPublicSalePaid(orgId, reference), emailService.notifyPublicSalePaid(orgId, reference), pushService.notifyPublicSalePaid(orgId, reference)];
    Promise.all(notify).catch((e) => console.error('[Lipila] notifications:', e?.message));
    try { const { postProcessQuickLinkPayment } = await import('../controllers/lenco.webhook.controller'); await postProcessQuickLinkPayment(reference); } catch (e: any) { console.error('[Lipila] quick link:', e?.message); }
}
