import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { MtnError, mtnRequest, toMsisdn } from './mtn.service';
import { mapMtnStatus, PayoutError } from './mtnPayout.service';

/**
 * The rest of MTN's products, for super admins: account lookups, the catalogue, plans and subscriptions (read), buying airtime and data
 * bundles, agent cash-out (MoMo Withdrawals) and the USSD controls. Anything that spends or moves money is recorded in mtn_operations under an
 * idempotency key and follows the same rules as payouts: a clear refusal from MTN is FAILED, an unclear answer is UNKNOWN and never re-sent.
 *
 * IMPORTANT: the request shapes below come from MTN's Swagger files. Several values MTN's files leave open (airtime balanceType, which field
 * carries the agent code, how a subscription names the customer) are set to the most likely choice and are marked UNVERIFIED. If MTN
 * disagrees it refuses the request (4xx) and nothing is charged; fix the shape from MTN's answer, which is stored with each operation.
 */
const money = (n: number) => ({ amount: n.toFixed(2), units: 'ZMW' });
const MAX_AIRTIME = () => Number(process.env.MTN_AIRTIME_MAX) || 1000;
const MAX_WITHDRAWAL = () => Number(process.env.MTN_WITHDRAWAL_MAX) || 3000;

// ---- Reads -------------------------------------------------------------------------------------------------------------------------------

export const accountInfo = (phone: string) => mtnRequest(`/accountholders/${toMsisdn(phone)}?includeoffnet=true`).then((r) => r.data);
export const customerPlans = (phone: string) => mtnRequest(`/customers/${toMsisdn(phone)}/plans`).then((r) => r.data);
export const customerSubscriptions = (phone: string) => mtnRequest(`/customers/${toMsisdn(phone)}/subscriptions`).then((r) => r.data);
export const catalogue = (p: { siteId: string; senderId: string; topOffers?: boolean }) =>
    mtnRequest(`/products/productOfferings?siteId=${encodeURIComponent(p.siteId)}${p.topOffers ? '&topOffers=true' : ''}`, { headers: { senderId: p.senderId } }).then((r) => r.data);

// ---- Spending operations -----------------------------------------------------------------------------------------------------------------

type Kind = 'AIRTIME' | 'DATA_BUNDLE' | 'AGENT_WITHDRAWAL';
interface Run { kind: Kind; adminId: string; idempotencyKey: string; phone: string; amount?: number; reference?: string; path: (opId: string, phone: string) => string; method?: string; body: (opId: string, phone: string) => unknown; headers?: Record<string, string> }

async function run(r: Run) {
    const key = String(r.idempotencyKey || '').trim();
    if (key.length < 8) throw new PayoutError('This needs an idempotency key (at least 8 characters) so a retry can’t do it twice.');
    const { data: existing } = await supabase.from('mtn_operations').select('*').eq('idempotency_key', key).maybeSingle();
    if (existing) return existing;
    const phone = toMsisdn(r.phone);
    if (!/^260\d{9}$/.test(phone)) throw new PayoutError('That doesn’t look like a Zambian mobile number.');

    const id = randomUUID(), tx = randomUUID();
    const { error } = await supabase.from('mtn_operations').insert({ id, kind: r.kind, idempotency_key: key, created_by: r.adminId, phone, amount: r.amount ?? null, reference: r.reference?.slice(0, 120) ?? null, status: 'CREATED', mtn_transaction_id: tx });
    if (error) {
        const { data: again } = await supabase.from('mtn_operations').select('*').eq('idempotency_key', key).maybeSingle();
        if (again) return again;
        throw new PayoutError('Couldn’t record the request. Nothing was sent.', 500, 'DB');
    }
    try {
        const { data } = await mtnRequest<any>(r.path(id, phone), { method: r.method ?? 'POST', body: r.body(id, phone), transactionId: tx, headers: r.headers });
        const m = mapMtnStatus(data);
        // A bare success code means MTN accepted the request. For airtime and bundles that is the whole answer; cash-out stays open until MTN says completed.
        const accepted = (m.code === '0000' || m.code === '200') && r.kind !== 'AGENT_WITHDRAWAL';
        await supabase.from('mtn_operations').update({ status: m.status ?? (accepted ? 'SUCCESSFUL' : 'SUBMITTED'), status_code: m.code, status_message: m.message, last_response: data, updated_at: new Date().toISOString() }).eq('id', id);
    } catch (e: any) {
        if (e instanceof MtnError && e.missing?.length) {
            // Never reached MTN: a setting is missing in the gateway. Safe to call it failed, and say what is missing.
            await supabase.from('mtn_operations').update({ status: 'FAILED', status_message: `Not sent. Missing: ${e.missing.join(', ')}`, updated_at: new Date().toISOString() }).eq('id', id);
        } else {
            const refused = e instanceof MtnError && e.httpStatus >= 400 && e.httpStatus < 500;
            await supabase.from('mtn_operations').update({ status: refused ? 'FAILED' : 'UNKNOWN', status_code: e?.statusCode ?? null, status_message: String(e?.message ?? 'No answer from MTN').slice(0, 300), updated_at: new Date().toISOString() }).eq('id', id);
        }
    }
    const { data } = await supabase.from('mtn_operations').select('*').eq('id', id).maybeSingle();
    return data;
}

/** Airtime top-up from our MTN reseller account (Balance Management). UNVERIFIED: balanceType and amount.type. */
export function buyAirtime(i: { adminId: string; phone: string; amount: number; idempotencyKey: string }) {
    const amount = Math.round(Number(i.amount) * 100) / 100;
    if (!(amount > 0) || amount > MAX_AIRTIME()) throw new PayoutError(`Airtime must be above zero and at most K${MAX_AIRTIME()}.`);
    return run({
        kind: 'AIRTIME', adminId: i.adminId, idempotencyKey: i.idempotencyKey, phone: i.phone, amount,
        path: (_id, phone) => `/accounts/${phone}/topUp`, headers: { 'x-channel-id': '{{ENV:MTN_CHANNEL_ID}}' },
        body: (id) => ({ currency: 'ZMW', clientReference: id, balanceType: process.env.MTN_AIRTIME_BALANCE_TYPE || 'AIRTIME', senderAccountId: '{{ENV:MTN_SENDER_ACCOUNT_ID}}', amount: { type: 'MONETARY', value: amount.toFixed(2), unit: 'ZMW' } }),
    });
}

/** Activate a catalogue product (data bundle) for a number (Product Offering v3, POST /products). UNVERIFIED: which fields MTN needs beyond these. */
export function buyBundle(i: { adminId: string; phone: string; productId: string; idempotencyKey: string }) {
    if (!String(i.productId || '').trim()) throw new PayoutError('Choose a product.');
    return run({
        kind: 'DATA_BUNDLE', adminId: i.adminId, idempotencyKey: i.idempotencyKey, phone: i.phone, reference: `product:${i.productId}`,
        path: () => '/products', body: (_id, phone) => ({ productId: i.productId, customerId: phone, startDateTime: new Date().toISOString() }),
    });
}

/** Subscribe a number to a data bundle subscription (Subscriptions v2, POST /customers/subscribe). UNVERIFIED: how the customer is named. */
export function subscribe(i: { adminId: string; phone: string; subscriptionId: string; providerId?: string; name?: string; idempotencyKey: string }) {
    if (!String(i.subscriptionId || '').trim()) throw new PayoutError('Choose a subscription.');
    return run({
        kind: 'DATA_BUNDLE', adminId: i.adminId, idempotencyKey: i.idempotencyKey, phone: i.phone, reference: `subscription:${i.subscriptionId}`,
        path: () => '/customers/subscribe',
        body: (_id, phone) => ({ subscriptionId: i.subscriptionId, subscriptionProviderId: i.providerId, subscriptionName: i.name, customerDetails: [{ name: 'msisdn', value: phone }], beneficiaryId: phone, registrationChannel: 'API', sendSMSNotification: true }),
    });
}

/** Cash-out at an agent (MoMo Withdrawals v1). UNVERIFIED: the agent code is sent as `resource` and as additionalInformation AgentCode. */
export function withdrawAtAgent(i: { adminId: string; phone: string; agentCode: string; amount: number; idempotencyKey: string }) {
    const amount = Math.round(Number(i.amount) * 100) / 100;
    const agent = String(i.agentCode || '').trim();
    if (!/^[A-Za-z0-9-]{3,20}$/.test(agent)) throw new PayoutError('Enter the agent code (letters and numbers).');
    if (!(amount > 0) || amount > MAX_WITHDRAWAL()) throw new PayoutError(`A withdrawal must be above zero and at most K${MAX_WITHDRAWAL()}.`);
    return run({
        kind: 'AGENT_WITHDRAWAL', adminId: i.adminId, idempotencyKey: i.idempotencyKey, phone: i.phone, amount, reference: `agent:${agent}`,
        path: () => '/withdraw',
        body: (id, phone) => ({
            correlatorId: id, customerId: phone, resource: agent, transactionRequestDate: new Date().toISOString(),
            callingSystem: '{{ENV:MTN_CALLING_SYSTEM}}', targetSystem: '{{ENV:MTN_TARGET_SYSTEM}}', description: `MoneyWise cash-out at agent ${agent}`,
            amount: { amount, units: 'ZMW' }, status: 'Pending', externalReference: id, additionalInformation: [{ name: 'AgentCode', description: agent }],
        }),
    });
}

/** One-time: tell MTN (Notification v2) where to send withdrawal completions. Safe to repeat; MTN answers 409 if already registered. */
export async function registerWithdrawalCallback() {
    const { data } = await mtnRequest('/v2/notification/register/3PP', { method: 'POST', body: { notificationType: 'POST', notificationUrl: '{{CALLBACK:withdrawals}}', targetSystem: '{{ENV:MTN_TARGET_SYSTEM}}', code: '{{ENV:MTN_CALLING_SYSTEM}}' } });
    return data;
}

export async function listOperations(limit = 50) {
    const { data } = await supabase.from('mtn_operations').select('id, kind, phone, amount, reference, status, status_code, status_message, created_at').order('created_at', { ascending: false }).limit(limit);
    return data ?? [];
}

// ---- USSD control ------------------------------------------------------------------------------------------------------------------------

/** Register our short code with MTN so its USSD traffic comes to the mtn-callback function (product "ussd"). */
export async function ussdSubscribe(serviceCode?: string) {
    const { data } = await mtnRequest('/messages/ussd/subscription', { method: 'POST', body: { serviceCode: serviceCode || '{{ENV:MTN_USSD_SERVICE_CODE}}', callbackUrl: '{{CALLBACK:ussd}}', targetSystem: '{{ENV:MTN_TARGET_SYSTEM}}' } });
    return data;
}
export const ussdUnsubscribe = (subscriptionId: string) => mtnRequest(`/messages/ussd/subscription/${encodeURIComponent(subscriptionId)}`, { method: 'DELETE' }).then((r) => r.data);
/** Push a USSD message to a phone. messageType: 0 begin, 1 continue, 2 end, 3 notification. */
export const ussdPush = (i: { msisdn: string; serviceCode: string; text: string; sessionId?: string; messageType?: number }) =>
    mtnRequest('/messages/ussd/outbound', { method: 'POST', body: { sessionId: i.sessionId || randomUUID().slice(0, 12), messageType: String(i.messageType ?? 3), msisdn: toMsisdn(i.msisdn), serviceCode: i.serviceCode, ussdString: i.text.slice(0, 160) } }).then((r) => r.data);
