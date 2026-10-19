/**
 * OAuth 2.0 authorization-code flow with mandatory PKCE (S256).
 *
 *   GET  /oauth/authorize/info  (user JWT)  validate the request, describe it for the consent screen
 *   POST /oauth/authorize       (user JWT)  approve/deny -> { redirect_to } back to the app
 *   POST /oauth/token           (public)    code -> tokens, refresh_token -> rotated tokens
 *   POST /oauth/revoke          (public)    disconnect (revokes the whole grant)
 *
 * The consent screen itself lives in the web app (/oauth/authorize); the browser never
 * talks to the app's redirect_uri until the API has issued a code for it.
 */
import { supabase } from '../lib/supabase';
import { isPremiumOrg } from '../middleware/apiKey';
import {
    CODE_TTL_MS,
    OAuthClient,
    SCOPE_DESCRIPTIONS,
    UNVERIFIED_SCOPES,
    VALID_SCOPES,
    findClient,
    issueTokens,
    newSecret,
    parseScopes,
    pkceChallengeFor,
    revokeGrant,
    safeEqual,
    sha256,
} from '../services/oauth.service';

const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

const authError = (res: any, status: number, error: string, description: string) =>
    res.status(status).json({ error, error_description: description });

// ── Authorization request validation (shared by info + decision) ────────────

interface ValidAuthorize {
    client: OAuthClient;
    redirectUri: string;
    scopes: string[];
    codeChallenge: string;
    state?: string;
}

const validateAuthorizeRequest = async (
    p: Record<string, any>
): Promise<{ ok: true; value: ValidAuthorize } | { ok: false; error: string; description: string }> => {
    const client = await findClient(p.client_id);
    if (!client) return { ok: false, error: 'invalid_client', description: 'Unknown or disabled application.' };

    const redirectUri = typeof p.redirect_uri === 'string' ? p.redirect_uri : '';
    if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
        return { ok: false, error: 'invalid_redirect_uri', description: 'This redirect URI is not registered for the application.' };
    }

    if (p.response_type !== 'code') {
        return { ok: false, error: 'unsupported_response_type', description: 'Only response_type=code is supported.' };
    }

    const scopes = parseScopes(p.scope);
    if (scopes.length === 0) return { ok: false, error: 'invalid_scope', description: 'At least one scope is required.' };
    // An unverified app can never get more than read, whatever its record says.
    const allowed = client.verified_at ? client.allowed_scopes : client.allowed_scopes.filter(s => UNVERIFIED_SCOPES.includes(s));
    const bad = scopes.find(s => !VALID_SCOPES.includes(s) || !allowed.includes(s));
    if (bad) return { ok: false, error: 'invalid_scope', description: `Scope '${bad}' is not available to this application.` };

    if (p.code_challenge_method !== 'S256' || typeof p.code_challenge !== 'string' || !CHALLENGE_RE.test(p.code_challenge)) {
        return { ok: false, error: 'invalid_request', description: 'PKCE is required: send code_challenge (S256, base64url) and code_challenge_method=S256.' };
    }

    const state = typeof p.state === 'string' ? p.state.slice(0, 512) : undefined;
    return { ok: true, value: { client, redirectUri, scopes, codeChallenge: p.code_challenge, state } };
};

// Only an ADMIN of a Premium organisation can connect an app to it.
const checkApprover = async (req: any): Promise<{ ok: true; orgId: string } | { ok: false; status: number; error: string; description: string }> => {
    const orgId = req.user.organization_id;
    if (!orgId) return { ok: false, status: 400, error: 'no_organization', description: 'Your account is not part of an organisation yet.' };
    if (req.user.role !== 'ADMIN') {
        return { ok: false, status: 403, error: 'not_admin', description: 'Only an organisation admin can connect apps to MoneyWise.' };
    }
    if (!(await isPremiumOrg(orgId))) {
        return { ok: false, status: 403, error: 'not_premium', description: 'Connecting apps requires the Premium plan.' };
    }
    return { ok: true, orgId };
};

// ── GET /oauth/authorize/info ────────────────────────────────────────────────

export const authorizeInfo = async (req: any, res: any) => {
    const v = await validateAuthorizeRequest(req.query);
    if (!v.ok) return authError(res, 400, v.error, v.description);

    const approver = await checkApprover(req);
    if (!approver.ok) return authError(res, approver.status, approver.error, approver.description);

    const { client, scopes } = v.value;

    const [{ data: org }, { data: owner }, { data: grant }] = await Promise.all([
        supabase.from('organizations').select('id, name').eq('id', approver.orgId).maybeSingle(),
        client.owner_organization_id
            ? supabase.from('organizations').select('name').eq('id', client.owner_organization_id).maybeSingle()
            : Promise.resolve({ data: null }),
        supabase.from('oauth_grants').select('scopes').eq('client_id', client.id).eq('organization_id', approver.orgId).is('revoked_at', null).maybeSingle(),
    ]);

    let redirectHost = '';
    try { const u = new URL(v.value.redirectUri); redirectHost = u.host ? `${u.protocol}//${u.host}` : u.protocol; } catch { /* validated earlier */ }

    res.json({
        client: {
            name: client.name,
            description: client.description,
            logo_url: client.logo_url,
            owner_name: (owner as any)?.name ?? null,
            verified: !!client.verified_at,
            redirect_host: redirectHost,
        },
        organization: { id: approver.orgId, name: org?.name ?? 'Your organisation' },
        scopes: scopes.map(s => ({ scope: s, description: SCOPE_DESCRIPTIONS[s] })),
        // Already approved at least these scopes -> the screen can skip the click.
        auto_approve: !!grant && scopes.every(s => (grant.scopes as string[]).includes(s)),
    });
};

// ── POST /oauth/authorize ────────────────────────────────────────────────────

const redirectBack = (redirectUri: string, params: Record<string, string | undefined>) => {
    const url = new URL(redirectUri);
    for (const [k, val] of Object.entries(params)) if (val !== undefined) url.searchParams.set(k, val);
    return url.toString();
};

export const authorizeDecision = async (req: any, res: any) => {
    const body = req.body ?? {};
    const v = await validateAuthorizeRequest(body);
    if (!v.ok) return authError(res, 400, v.error, v.description);
    const { client, redirectUri, scopes, codeChallenge, state } = v.value;

    if (body.approve !== true) {
        return res.json({ redirect_to: redirectBack(redirectUri, { error: 'access_denied', state }) });
    }

    const approver = await checkApprover(req);
    if (!approver.ok) return authError(res, approver.status, approver.error, approver.description);

    try {
        const { data: existing } = await supabase
            .from('oauth_grants')
            .select('scopes, revoked_at')
            .eq('client_id', client.id)
            .eq('organization_id', approver.orgId)
            .maybeSingle();

        const approved = existing && !existing.revoked_at
            ? [...new Set([...(existing.scopes as string[]), ...scopes])]
            : scopes;

        const { data: grant, error: grantErr } = await supabase
            .from('oauth_grants')
            .upsert(
                {
                    client_id: client.id,
                    organization_id: approver.orgId,
                    user_id: req.user.id,
                    scopes: approved,
                    revoked_at: null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'client_id,organization_id' }
            )
            .select('id')
            .single();
        if (grantErr || !grant) throw new Error(grantErr?.message ?? 'grant failed');

        const code = newSecret('mwa_');
        const { error: codeErr } = await supabase.from('oauth_codes').insert({
            code_hash: sha256(code),
            grant_id: grant.id,
            redirect_uri: redirectUri,
            code_challenge: codeChallenge,
            scopes,
            expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        });
        if (codeErr) throw new Error(codeErr.message);

        // Housekeeping: drop codes that expired over a day ago.
        void supabase.from('oauth_codes').delete().lt('expires_at', new Date(Date.now() - 86_400_000).toISOString()).then(() => undefined, () => undefined);

        res.json({ redirect_to: redirectBack(redirectUri, { code, state }) });
    } catch (err: any) {
        console.error('[OAuth] authorize failed:', err?.message);
        authError(res, 500, 'server_error', 'Could not complete the authorization. Please try again.');
    }
};

// ── Client authentication for /token and /revoke ─────────────────────────────

const authenticateClient = async (req: any, res: any): Promise<OAuthClient | null> => {
    let clientId: unknown = req.body?.client_id;
    let secret: unknown = req.body?.client_secret;

    const basic = req.headers.authorization;
    if (typeof basic === 'string' && basic.startsWith('Basic ')) {
        try {
            const [id, ...rest] = Buffer.from(basic.slice(6), 'base64').toString().split(':');
            clientId = decodeURIComponent(id);
            secret = decodeURIComponent(rest.join(':'));
        } catch {
            authError(res, 401, 'invalid_client', 'Malformed Basic credentials.');
            return null;
        }
    }

    const client = await findClient(clientId);
    if (!client) {
        authError(res, 401, 'invalid_client', 'Unknown or disabled client.');
        return null;
    }
    if (client.client_secret_hash) {
        if (typeof secret !== 'string' || !safeEqual(sha256(secret), client.client_secret_hash)) {
            authError(res, 401, 'invalid_client', 'Invalid client credentials.');
            return null;
        }
    }
    return client;
};

// ── POST /oauth/token ────────────────────────────────────────────────────────

export const token = async (req: any, res: any) => {
    res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
    const body = req.body ?? {};

    const client = await authenticateClient(req, res);
    if (!client) return;

    try {
        if (body.grant_type === 'authorization_code') return await exchangeCode(client, body, res);
        if (body.grant_type === 'refresh_token') return await refresh(client, body, res);
        return authError(res, 400, 'unsupported_grant_type', 'Use authorization_code or refresh_token.');
    } catch (err: any) {
        console.error('[OAuth] token failed:', err?.message);
        return authError(res, 500, 'server_error', 'Token request failed. Please retry.');
    }
};

const exchangeCode = async (client: OAuthClient, body: any, res: any) => {
    const { code, redirect_uri, code_verifier } = body;
    if (typeof code !== 'string' || typeof redirect_uri !== 'string' || typeof code_verifier !== 'string' || !VERIFIER_RE.test(code_verifier)) {
        return authError(res, 400, 'invalid_request', 'code, redirect_uri and a valid code_verifier are required.');
    }

    const codeHash = sha256(code);
    const nowIso = new Date().toISOString();

    // Atomic single use: only one request can flip used_at from null.
    const { data: row } = await supabase
        .from('oauth_codes')
        .update({ used_at: nowIso })
        .eq('code_hash', codeHash)
        .is('used_at', null)
        .gt('expires_at', nowIso)
        .select('grant_id, redirect_uri, code_challenge, scopes')
        .maybeSingle();

    if (!row) {
        // A code presented twice means it leaked: kill everything issued from it.
        const { data: used } = await supabase.from('oauth_codes').select('grant_id, used_at').eq('code_hash', codeHash).maybeSingle();
        if (used?.used_at) await revokeGrant(used.grant_id);
        return authError(res, 400, 'invalid_grant', 'Authorization code is invalid, expired or already used.');
    }

    const { data: grant } = await supabase
        .from('oauth_grants')
        .select('id, client_id, organization_id, revoked_at')
        .eq('id', row.grant_id)
        .maybeSingle();

    if (!grant || grant.revoked_at || grant.client_id !== client.id) {
        return authError(res, 400, 'invalid_grant', 'Authorization code is invalid, expired or already used.');
    }
    if (row.redirect_uri !== redirect_uri) {
        return authError(res, 400, 'invalid_grant', 'redirect_uri does not match the authorization request.');
    }
    if (!safeEqual(pkceChallengeFor(code_verifier), row.code_challenge)) {
        return authError(res, 400, 'invalid_grant', 'PKCE verification failed.');
    }

    res.json(await issueTokens(grant.id, row.scopes as string[], grant.organization_id));
};

const refresh = async (client: OAuthClient, body: any, res: any) => {
    const { refresh_token } = body;
    if (typeof refresh_token !== 'string' || !refresh_token) {
        return authError(res, 400, 'invalid_request', 'refresh_token is required.');
    }

    const hash = sha256(refresh_token);
    const nowIso = new Date().toISOString();

    // Rotation: a refresh token works exactly once.
    const { data: row } = await supabase
        .from('oauth_tokens')
        .update({ replaced_at: nowIso })
        .eq('refresh_hash', hash)
        .is('replaced_at', null)
        .gt('refresh_expires_at', nowIso)
        .select('grant_id, scopes')
        .maybeSingle();

    if (!row) {
        // Re-presenting a rotated token means two parties hold it: revoke the grant.
        const { data: old } = await supabase.from('oauth_tokens').select('grant_id, replaced_at').eq('refresh_hash', hash).maybeSingle();
        if (old?.replaced_at) await revokeGrant(old.grant_id);
        return authError(res, 400, 'invalid_grant', 'Refresh token is invalid, expired or already used.');
    }

    const { data: grant } = await supabase
        .from('oauth_grants')
        .select('id, client_id, organization_id, revoked_at')
        .eq('id', row.grant_id)
        .maybeSingle();

    if (!grant || grant.revoked_at || grant.client_id !== client.id) {
        return authError(res, 400, 'invalid_grant', 'Refresh token is invalid, expired or already used.');
    }

    res.json(await issueTokens(grant.id, row.scopes as string[], grant.organization_id));
};

// ── POST /oauth/revoke ───────────────────────────────────────────────────────

export const revoke = async (req: any, res: any) => {
    const client = await authenticateClient(req, res);
    if (!client) return;

    const raw = req.body?.token;
    if (typeof raw === 'string' && raw) {
        const hash = sha256(raw);
        const { data: row } = await supabase
            .from('oauth_tokens')
            .select('grant_id, oauth_grants(client_id)')
            .or(`access_hash.eq.${hash},refresh_hash.eq.${hash}`)
            .maybeSingle();
        const owner = (row as any)?.oauth_grants?.client_id;
        // Disconnecting from the app's side removes it from the org's "Connected apps" too.
        if (row && owner === client.id) await revokeGrant(row.grant_id);
    }
    res.status(200).json({});
};
