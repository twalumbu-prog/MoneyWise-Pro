// The only place MoneyWise's MTN keys live. The API never sees MTN_CONSUMER_KEY / MTN_CONSUMER_SECRET: it calls this function with the
// project's service-role key, and this function signs in to MTN and forwards the call. Only a short list of MTN paths is allowed.
//   POST { method, path, body?, headers?, transactionId? }  ->  { status, body }
//   GET  /status  ->  which settings are present (names only, never values)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function safeEqual(a: string, b: string): boolean {
    const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
    if (x.length !== y.length) return false;
    let d = 0;
    for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
    return d === 0;
}

const env = (k: string) => Deno.env.get(k) ?? '';
const ROOT = () => (env('MTN_API_ROOT') || 'https://api.mtn.com').replace(/\/$/, '');
// Where each product lives. Withdrawals are on MTN's pre-production host in the spec we were given; set MTN_WITHDRAW_BASE when MTN gives the live one.
const WITHDRAW_BASE = () => (env('MTN_WITHDRAW_BASE') || 'https://preprod.mtn.com/v1').replace(/\/$/, '');

// The MTN paths MoneyWise may use (from the nine specs). Anything else is refused.
const ALLOWED: RegExp[] = [
    /^\/accountholders(\/|$)/, /^\/accountholderidentification\//,                  // AccountHolders V1
    /^\/accounts\/\d+\/topUp$/,                                                      // Balance Management (airtime top-up)
    /^\/products(\/|$)/,                                                             // Product Offering v3
    /^\/customers\/[^/]+\/(plans|subscriptions)(\/|$)/, /^\/customers\/(subscribe|list|bulk|menu-codes)(\/|$)/, /^\/subscriptions\//, // Plans v2, Subscriptions v2
    /^\/(payments|merchant-payment|fee|reverse-payment|payment-link)$/, /^\/details\//,  // Payments v1
    /^\/withdraw$/,                                                                  // MoMo Withdrawals v1
    /^\/messages\/ussd\//,                                                           // USSD
    /^\/v2\/notification\//,                                                         // Notification v2
];

// Settings the API may refer to by name without ever seeing the value. {{ENV:NAME}} is replaced here; {{CALLBACK:product}} becomes the
// secret address of the mtn-callback function for that product. A placeholder that can't be filled stops the call.
const FILLABLE = ['MTN_CALLING_SYSTEM', 'MTN_TARGET_SYSTEM', 'MTN_PAYER_ID', 'MTN_SENDER_ACCOUNT_ID', 'MTN_CHANNEL_ID', 'MTN_USSD_SERVICE_CODE'];
function fill(text: string): { text: string; unfilled: string[] } {
    const unfilled: string[] = [];
    const out = text
        .replace(/\{\{CALLBACK:([a-z0-9_-]{1,40})\}\}/g, (m, p) => { const s = env('MTN_CALLBACK_SECRET'); if (s.length < 16) { unfilled.push('MTN_CALLBACK_SECRET'); return m; } return `${env('SUPABASE_URL')}/functions/v1/mtn-callback/${s}/${p}`; })
        .replace(/\{\{ENV:([A-Z_]+)\}\}/g, (m, n) => { if (!FILLABLE.includes(n) || !env(n)) { unfilled.push(n); return m; } return env(n).replace(/["\\]/g, ''); });
    return { text: out, unfilled };
}

let token: { value: string; exp: number } | null = null;
let goodMode: string | null = null;
// MTN's token endpoint takes the key and secret in one of a few forms. The one that works is remembered.
async function tokenWith(mode: string): Promise<Response> {
    const url = `${ROOT()}/v1/oauth/access_token`;
    const id = env('MTN_CONSUMER_KEY'), secret = env('MTN_CONSUMER_SECRET');
    if (mode === 'basic') return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', Authorization: `Basic ${btoa(`${id}:${secret}`)}` }, body: 'grant_type=client_credentials' });
    if (mode === 'query') return fetch(`${url}?grant_type=client_credentials`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ client_id: id, client_secret: secret }).toString() });
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }).toString() });
}
async function accessToken(): Promise<string> {
    if (token && token.exp > Date.now() + 60_000) return token.value;
    let last = 0;
    for (const mode of goodMode ? [goodMode] : ['query', 'form', 'basic']) {
        const res = await tokenWith(mode);
        const j: any = await res.json().catch(() => ({}));
        last = res.status;
        if (res.ok && j.access_token) {
            goodMode = mode;
            token = { value: String(j.access_token), exp: Date.now() + Math.max(60, Number(j.expires_in) || 3600) * 1000 };
            return token.value;
        }
    }
    throw new Error(`MTN refused the sign-in (${last})`);
}
/** What MTN says when sign-in fails, for each form (status and message only, never the keys). */
async function diagnoseSignIn() {
    const out: Record<string, unknown> = {};
    for (const mode of ['form', 'basic', 'query']) {
        const res = await tokenWith(mode);
        const text = await res.text();
        let j: any = {}; try { j = JSON.parse(text); } catch { /* not JSON */ }
        out[mode] = { status: res.status, message: j?.error_description ?? j?.statusMessage ?? j?.error ?? j?.fault?.faultstring ?? text.slice(0, 200), ok: !!j?.access_token };
    }
    return out;
}

Deno.serve(async (req) => {
    // Only the API (holding the service-role key) may use this.
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const service = env('SUPABASE_SERVICE_ROLE_KEY');
    let allowed = !!service && !!bearer && safeEqual(bearer, service);
    if (!allowed && bearer) {
        // The key the API holds may be a different (older or newer) form of the service-role key. Only a service-role key can read this table
        // (anon and signed-in users have no access to it), so being able to read it proves the caller holds one.
        const probe = await fetch(`${env('SUPABASE_URL')}/rest/v1/mtn_payouts?select=id&limit=1`, { headers: { apikey: bearer, Authorization: `Bearer ${bearer}` } }).catch(() => null);
        allowed = !!probe && probe.status === 200;
    }
    if (!allowed) return json({ error: 'Unauthorized' }, 401);

    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname.endsWith('/status')) {
        const names = ['MTN_CONSUMER_KEY', 'MTN_CONSUMER_SECRET', 'MTN_CALLBACK_SECRET', ...FILLABLE, 'MTN_WITHDRAW_API_KEY', 'MTN_USSD_API_KEY', 'MTN_WITHDRAW_BASE', 'MTN_API_ROOT'];
        const present = Object.fromEntries(names.map((n) => [n, !!env(n)]));
        let signIn: string = 'not tried';
        if (url.searchParams.get('signin') === '1') { try { await accessToken(); signIn = 'ok'; } catch (e) { signIn = String((e as Error).message); } }
        return json({ present, signIn, ...(signIn !== 'ok' && url.searchParams.get('signin') === '1' ? { diagnosis: await diagnoseSignIn() } : {}) });
    }
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

    let call: any;
    try { call = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
    const path = String(call?.path ?? '');
    const method = String(call?.method ?? 'GET').toUpperCase();
    if (!path.startsWith('/') || path.includes('..') || !ALLOWED.some((r) => r.test(path.split('?')[0]))) return json({ error: 'That MTN path isn’t allowed.' }, 403);
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return json({ error: 'Bad method' }, 400);
    if (!env('MTN_CONSUMER_KEY') || !env('MTN_CONSUMER_SECRET')) return json({ error: 'MTN keys are not set in the function secrets.' }, 503);

    const isWithdraw = path.split('?')[0] === '/withdraw';
    const target = isWithdraw ? `${WITHDRAW_BASE()}${path}` : path.startsWith('/v2/') ? `${ROOT()}${path}` : `${ROOT()}/v1${path}`;
    const headers: Record<string, string> = {
        Accept: 'application/json', 'Content-Type': 'application/json', transactionId: String(call?.transactionId ?? crypto.randomUUID()), 'x-country-code': 'ZM',
        ...(call?.headers && typeof call.headers === 'object' ? call.headers : {}),
    };
    const filledBody = call?.body === undefined || method === 'GET' ? undefined : fill(JSON.stringify(call.body));
    const unfilled = [...(filledBody?.unfilled ?? [])];
    for (const k of Object.keys(headers)) { const f = fill(String(headers[k])); headers[k] = f.text; unfilled.push(...f.unfilled); }
    if (unfilled.length) return json({ error: `These settings are missing in the Supabase function secrets: ${[...new Set(unfilled)].join(', ')}.`, missing: [...new Set(unfilled)] }, 503);
    try {
        headers.Authorization = `Bearer ${await accessToken()}`;
        if (isWithdraw && env('MTN_WITHDRAW_API_KEY')) headers['X-API-Key'] = env('MTN_WITHDRAW_API_KEY');
        if (path.startsWith('/messages/ussd/') && env('MTN_USSD_API_KEY')) headers['x-api-key'] = env('MTN_USSD_API_KEY');
        const res = await fetch(target, { method, headers, body: filledBody?.text });
        const text = await res.text();
        let body: unknown; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 2000) }; }
        return json({ status: res.status, body, transactionId: headers.transactionId });
    } catch (e) {
        return json({ error: String((e as Error).message ?? e) }, 502);
    }
});
