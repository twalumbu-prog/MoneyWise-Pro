import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { MtnError, mtnRequest, mtnGatewayStatus, toMsisdn, validateAccountHolder, MTN_COUNTRY } from './mtn.service';

/**
 * Paying out to an MTN MoMo number through MTN's Payments API (POST /payments, payer = Blue Opus's MoMo account, payee = the customer).
 * These payouts leave the platform's own MTN account, so only super admins can make them. Safety rules:
 *  - one payout per idempotency key, so a retry never pays twice;
 *  - the number is checked to be a real MoMo account first;
 *  - a clear refusal from MTN is FAILED, but an unclear answer (timeout, 5xx) is UNKNOWN and is never re-sent: it is checked with MTN instead;
 *  - a callback never marks anything paid by itself. It only makes us ask MTN (GET /details/{id}) and we believe MTN's answer.
 * Not yet tied to any business's books: it records the payout and its status only.
 */
export class PayoutError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'INVALID') { super(message); }
}

export type PayoutStatus = 'CREATED' | 'SUBMITTED' | 'SUCCESSFUL' | 'FAILED' | 'UNKNOWN';
const MAX = () => Number(process.env.MTN_PAYOUT_MAX) || 5000;

/** The settings MTN needs that only MTN can tell us. Missing ones are named so nobody has to guess. */
export const PAYOUT_NEEDS = ['MTN_CONSUMER_KEY', 'MTN_CONSUMER_SECRET', 'MTN_CALLBACK_SECRET', 'MTN_CALLING_SYSTEM', 'MTN_TARGET_SYSTEM', 'MTN_PAYER_ID'];
/** The settings are secrets of the Supabase gateway; the API only asks which names are present, never their values. */
export async function payoutSettings(): Promise<{ missing: string[] }> {
    const st = await mtnGatewayStatus().catch(() => null);
    if (!st) return { missing: ['the MTN gateway (could not reach it)'] };
    return { missing: PAYOUT_NEEDS.filter((n) => !st.present[n]) };
}

/** The body for POST /payments, from MTN's Payments v1 spec. */
export function buildPaymentBody(p: { payoutId: string; phone: string; amount: number; currency: string; note: string | null }, s: { callingSystem: string; targetSystem: string; payerId: string; payerIdType: string; callbackUrl: string }) {
    const money = { amount: p.amount.toFixed(2), units: p.currency };
    return {
        correlatorId: p.payoutId,
        externalTransactionId: p.payoutId,
        callingSystem: s.callingSystem,
        targetSystem: s.targetSystem,
        callbackURL: s.callbackUrl,
        paymentDate: new Date().toISOString(),
        description: p.note || 'MoneyWise payout',
        countryCode: MTN_COUNTRY(),
        amount: money,
        totalAmount: money,
        payer: { payerIdType: s.payerIdType, payerId: s.payerId, payerNote: p.note || 'MoneyWise payout' },
        payee: [{ payeeIdType: 'MSISDN', payeeId: p.phone, payeeNote: p.note || 'MoneyWise payout', amount: money, totalAmount: money }],
    };
}

/** What MTN's wording means. Anything that isn't clearly a success or a failure stays open. */
export function mapMtnStatus(payload: any): { status: 'SUCCESSFUL' | 'FAILED' | null; code: string | null; message: string | null } {
    const d = payload?.data ?? payload ?? {};
    const code = String(payload?.statusCode ?? d?.statusCode ?? '') || null;
    const words = String(d?.status ?? d?.transactionStatus ?? payload?.status ?? '').toLowerCase();
    const message = String(payload?.statusMessage ?? d?.statusMessage ?? d?.status ?? '') || null;
    if (/^(success|successful|succeeded|completed|complete|approved|paid)$/.test(words)) return { status: 'SUCCESSFUL', code, message };
    if (/^(fail|failed|failure|rejected|declined|cancelled|canceled|expired|reversed)$/.test(words)) return { status: 'FAILED', code, message };
    return { status: null, code, message };
}

const row = async (id: string) => {
    const { data } = await supabase.from('mtn_payouts').select('*').eq('id', id).maybeSingle();
    return data;
};

export async function createPayout(input: { adminId: string; phone: string; amount: number; note?: string; idempotencyKey: string }) {
    const key = String(input.idempotencyKey || '').trim();
    if (key.length < 8) throw new PayoutError('A payout needs an idempotency key (at least 8 characters) so a retry can’t pay twice.');
    const { data: existing } = await supabase.from('mtn_payouts').select('*').eq('idempotency_key', key).maybeSingle();
    if (existing) return existing;

    const amount = Math.round(Number(input.amount) * 100) / 100;
    if (!(amount > 0)) throw new PayoutError('Enter an amount above zero.');
    if (amount > MAX()) throw new PayoutError(`One payout can’t be more than K${MAX().toLocaleString()}.`, 400, 'LIMIT');
    const phone = toMsisdn(input.phone);
    if (!/^260\d{9}$/.test(phone)) throw new PayoutError('That doesn’t look like a Zambian mobile number.');

    const s = await payoutSettings();
    if (s.missing.length) throw new PayoutError(`MTN payouts aren’t set up yet. Missing: ${s.missing.join(', ')}.`, 503, 'NOT_CONFIGURED');

    // Only pay a number that really is a MoMo account.
    try {
        const v = await validateAccountHolder(phone);
        if (!v.isValid) throw new PayoutError('That number isn’t an MTN MoMo account, so it can’t be paid.', 422, 'NOT_MOMO');
    } catch (e: any) {
        if (e instanceof PayoutError) throw e;
        throw new PayoutError(`Couldn’t check that number with MTN (${e?.message ?? 'no answer'}). Nothing was sent.`, 502, 'CHECK_FAILED');
    }

    const id = randomUUID();
    const mtnTransactionId = randomUUID();
    const { error: insErr } = await supabase.from('mtn_payouts').insert({ id, idempotency_key: key, created_by: input.adminId, phone, amount, currency: 'ZMW', note: input.note?.slice(0, 200) || null, status: 'CREATED', mtn_transaction_id: mtnTransactionId });
    if (insErr) {
        // A parallel request with the same key won the insert: return that one.
        const { data: again } = await supabase.from('mtn_payouts').select('*').eq('idempotency_key', key).maybeSingle();
        if (again) return again;
        throw new PayoutError('Couldn’t record the payout. Nothing was sent.', 500, 'DB');
    }

    // The gateway fills these placeholders from its own secrets, so the values never pass through this API.
    const body = buildPaymentBody({ payoutId: id, phone, amount, currency: 'ZMW', note: input.note ?? null }, { callingSystem: '{{ENV:MTN_CALLING_SYSTEM}}', targetSystem: '{{ENV:MTN_TARGET_SYSTEM}}', payerId: '{{ENV:MTN_PAYER_ID}}', payerIdType: 'MSISDN', callbackUrl: '{{CALLBACK:payments}}' });
    try {
        const { data } = await mtnRequest<any>('/payments', { method: 'POST', body, transactionId: mtnTransactionId, headers: { countryCode: MTN_COUNTRY() } });
        const m = mapMtnStatus(data);
        await supabase.from('mtn_payouts').update({ status: m.status ?? 'SUBMITTED', status_code: m.code, status_message: m.message, last_response: data, updated_at: new Date().toISOString() }).eq('id', id);
    } catch (e: any) {
        // A clear 4xx from MTN means it did not take the payment. Anything else could have gone through, so it stays UNKNOWN.
        const refused = e instanceof MtnError && e.httpStatus >= 400 && e.httpStatus < 500;
        await supabase.from('mtn_payouts').update({ status: refused ? 'FAILED' : 'UNKNOWN', status_code: e?.statusCode ?? null, status_message: String(e?.message ?? 'No answer from MTN').slice(0, 300), updated_at: new Date().toISOString() }).eq('id', id);
    }
    return row(id);
}

/** Ask MTN where a payout stands, and record the answer. The only way a payout becomes SUCCESSFUL. */
export async function refreshPayout(id: string) {
    const p = await row(id);
    if (!p) throw new PayoutError('Payout not found.', 404, 'NOT_FOUND');
    if (p.status === 'SUCCESSFUL' || p.status === 'FAILED') return p;
    try {
        const { data } = await mtnRequest<any>(`/details/${p.mtn_transaction_id}`);
        const m = mapMtnStatus(data);
        await supabase.from('mtn_payouts').update({ ...(m.status ? { status: m.status } : {}), status_code: m.code ?? p.status_code, status_message: m.message ?? p.status_message, last_response: data, updated_at: new Date().toISOString() }).eq('id', id);
    } catch (e: any) {
        if (!(e instanceof MtnError)) throw e;
        // Leave the status alone: not hearing from MTN is not an answer.
        await supabase.from('mtn_payouts').update({ status_message: `Last check failed: ${String(e.message).slice(0, 200)}`, updated_at: new Date().toISOString() }).eq('id', id);
    }
    return row(id);
}

/** A callback from MTN. Its contents are not trusted: it only points at a payout, which is then re-checked with MTN. */
export async function handleCallback(body: any): Promise<void> {
    const text = JSON.stringify(body ?? {});
    const ids = [...new Set(text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [])].slice(0, 10);
    if (!ids.length) return;
    const { data } = await supabase.from('mtn_payouts').select('id').or(`id.in.(${ids.join(',')}),mtn_transaction_id.in.(${ids.join(',')})`).limit(5);
    for (const r of data ?? []) {
        await supabase.from('mtn_payouts').update({ callback_received_at: new Date().toISOString() }).eq('id', r.id);
        await refreshPayout(r.id);
    }
}

/**
 * Callbacks the Supabase function "mtn-callback" has stored. Each payments callback points at a payout, which is re-checked with MTN.
 * Other products are left alone until something handles them. Safe to run as often as wanted.
 */
export async function processCallbacks(limit = 50): Promise<{ processed: number }> {
    const { data } = await supabase.from('mtn_callbacks').select('id, body').is('processed_at', null).eq('product', 'payments').order('received_at').limit(limit);
    let processed = 0;
    for (const cb of data ?? []) {
        let err: string | null = null;
        try { await handleCallback(cb.body); } catch (e: any) { err = String(e?.message ?? e).slice(0, 300); }
        await supabase.from('mtn_callbacks').update({ processed_at: new Date().toISOString(), process_error: err }).eq('id', cb.id);
        processed++;
    }
    return { processed };
}

/** Payouts still waiting for an answer from MTN (older than half a minute), asked about one by one. */
export async function refreshOpenPayouts(limit = 20): Promise<{ checked: number }> {
    const cutoff = new Date(Date.now() - 30_000).toISOString();
    const { data } = await supabase.from('mtn_payouts').select('id').in('status', ['SUBMITTED', 'UNKNOWN']).lt('created_at', cutoff).order('created_at').limit(limit);
    for (const p of data ?? []) await refreshPayout(p.id).catch((e) => console.error('[MTN payout] refresh failed:', e?.message ?? e));
    return { checked: (data ?? []).length };
}

export async function listPayouts(limit = 50) {
    const { data } = await supabase.from('mtn_payouts').select('id, phone, amount, currency, note, status, status_code, status_message, callback_received_at, created_at').order('created_at', { ascending: false }).limit(limit);
    return data ?? [];
}
