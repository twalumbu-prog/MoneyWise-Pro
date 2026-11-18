import { randomUUID, timingSafeEqual } from 'crypto';

/**
 * MTN MADAPI client (developers.mtn.com). The MTN keys live only in the Supabase edge function "mtn-gateway" (its secrets), never in this
 * API. Every call here goes: API -> mtn-gateway (authenticated with the project's service-role key) -> MTN. The gateway signs in to MTN,
 * adds the transactionId and x-country-code ZM, only lets through the MTN paths MoneyWise uses, and fills placeholders in the request:
 *   {{ENV:MTN_PAYER_ID}}  a named setting (MTN_CALLING_SYSTEM, MTN_TARGET_SYSTEM, MTN_PAYER_ID, MTN_SENDER_ACCOUNT_ID, MTN_CHANNEL_ID, MTN_USSD_SERVICE_CODE)
 *   {{CALLBACK:payments}} the secret address of the mtn-callback function for that product
 * Set MTN_CONSUMER_KEY and MTN_CONSUMER_SECRET here too only to bypass the gateway (local testing).
 */
const direct = () => !!(process.env.MTN_CONSUMER_KEY && process.env.MTN_CONSUMER_SECRET);
const gatewayUrl = () => `${(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/functions/v1/mtn-gateway`;
const DIRECT_BASE = () => (process.env.MTN_API_BASE || 'https://api.mtn.com/v1').replace(/\/$/, '');
export const MTN_COUNTRY = () => process.env.MTN_COUNTRY_CODE || 'ZM';

export class MtnError extends Error {
    constructor(message: string, public httpStatus: number, public statusCode?: string, public transactionId?: string, public missing?: string[]) { super(message); }
}

export const mtnConfigured = () => direct() || !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

/** What the gateway has (names only) and whether MTN accepts its sign-in. Cached for a minute unless a sign-in test is asked for. */
let statusCache: { at: number; value: { present: Record<string, boolean>; signIn: string; diagnosis?: unknown } } | null = null;
export async function mtnGatewayStatus(opts: { signIn?: boolean } = {}) {
    if (!opts.signIn && statusCache && Date.now() - statusCache.at < 60_000) return statusCache.value;
    const res = await fetch(`${gatewayUrl()}/status${opts.signIn ? '?signin=1' : ''}`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
    if (!res.ok) throw new MtnError(`The MTN gateway answered ${res.status}.`, 502);
    const value = await res.json();
    statusCache = { at: Date.now(), value };
    return value as { present: Record<string, boolean>; signIn: string; diagnosis?: unknown };
}

let cached: { token: string; expiresAt: number } | null = null;
/** Direct mode only (keys in this API's environment). */
export async function mtnAccessToken(): Promise<string> {
    if (!direct()) throw new MtnError('Sign-in happens inside the Supabase gateway; use mtnGatewayStatus({ signIn: true }).', 500);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const res = await fetch(`${DIRECT_BASE()}/oauth/access_token?grant_type=client_credentials`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ client_id: process.env.MTN_CONSUMER_KEY!, client_secret: process.env.MTN_CONSUMER_SECRET! }).toString(),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) throw new MtnError(`MTN refused the sign-in (${res.status}).`, 502, json?.statusCode);
    cached = { token: String(json.access_token), expiresAt: Date.now() + Math.max(60, Number(json.expires_in) || 3600) * 1000 };
    return cached.token;
}

/** One call to MTN (path relative to /v1, or /v2/… for Notification). Returns MTN's JSON and the transactionId used. */
export async function mtnRequest<T = any>(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string>; transactionId?: string } = {}): Promise<{ data: T; transactionId: string }> {
    const transactionId = opts.transactionId ?? randomUUID();
    const method = opts.method ?? 'GET';
    let status: number; let data: any;
    if (direct()) {
        const res = await fetch(`${DIRECT_BASE()}${path}`, {
            method, headers: { Authorization: `Bearer ${await mtnAccessToken()}`, Accept: 'application/json', 'Content-Type': 'application/json', transactionId, 'x-country-code': MTN_COUNTRY(), ...(opts.headers ?? {}) },
            body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        });
        status = res.status; data = await res.json().catch(() => ({}));
    } else {
        if (!mtnConfigured()) throw new MtnError('MTN isn’t reachable: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing here.', 503);
        const res = await fetch(gatewayUrl(), {
            method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, path, body: opts.body, headers: opts.headers, transactionId }),
        });
        const wrapped: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new MtnError(wrapped?.error || `The MTN gateway answered ${res.status}.`, res.status === 503 ? 503 : 502, undefined, transactionId, wrapped?.missing);
        status = wrapped.status; data = wrapped.body ?? {};
    }
    if (status >= 400) throw new MtnError(data?.statusMessage || `MTN answered ${status}.`, status, data?.statusCode, transactionId);
    return { data: data as T, transactionId };
}

/** 0971234567, +260971234567 or 260971234567 → 260971234567 (the form MTN expects). */
export function toMsisdn(phone: string): string {
    const d = String(phone).replace(/\D/g, '');
    if (d.startsWith('260')) return d;
    if (d.startsWith('0')) return `260${d.slice(1)}`;
    return `260${d}`;
}

/** Is this number a registered MTN MoMo account holder? (AccountHolders V1, read only.) */
export async function validateAccountHolder(phone: string): Promise<{ isValid: boolean; transactionId: string }> {
    const { data, transactionId } = await mtnRequest<any>(`/accountholders/${toMsisdn(phone)}/validate?identityType=msisdn`);
    return { isValid: data?.data?.isValid === true, transactionId };
}

/** The secret in the callback address, compared without leaking timing. Used only by the old Express callback route. */
export function callbackSecretOk(given: string | undefined): boolean {
    const want = process.env.MTN_CALLBACK_SECRET;
    if (!want || want.length < 16 || !given) return false;
    const a = Buffer.from(given), b = Buffer.from(want);
    return a.length === b.length && timingSafeEqual(a, b);
}
