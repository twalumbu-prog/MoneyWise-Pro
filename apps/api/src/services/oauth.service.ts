import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { supabase } from '../lib/supabase';
import { invalidateApiKeyCache } from '../middleware/apiKey';

export const SCOPE_DESCRIPTIONS: Record<string, string> = {
    read: 'View balances, wallets, transactions, accounts, requisitions, products and payment links',
    write: 'Create payment links',
};
export const VALID_SCOPES = Object.keys(SCOPE_DESCRIPTIONS);

export const CODE_TTL_MS = 5 * 60 * 1000;
export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const newSecret = (prefix: string) => `${prefix}${randomBytes(32).toString('base64url')}`;

export const safeEqual = (a: string, b: string) => {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
};

export const parseScopes = (raw: unknown): string[] =>
    [...new Set(String(raw ?? '').split(/[\s,+]+/).filter(Boolean))];

export const pkceChallengeFor = (verifier: string) =>
    createHash('sha256').update(verifier).digest('base64url');

export interface OAuthClient {
    id: string;
    client_id: string;
    name: string;
    description: string | null;
    logo_url: string | null;
    redirect_uris: string[];
    allowed_scopes: string[];
    client_secret_hash: string | null;
}

export const findClient = async (clientId: unknown): Promise<OAuthClient | null> => {
    if (typeof clientId !== 'string' || !clientId) return null;
    const { data } = await supabase
        .from('oauth_clients')
        .select('id, client_id, name, description, logo_url, redirect_uris, allowed_scopes, client_secret_hash')
        .eq('client_id', clientId)
        .is('disabled_at', null)
        .maybeSingle();
    return (data as OAuthClient) ?? null;
};

/** Revokes an app's access for an organisation: marks the grant and kills every token immediately. */
export const revokeGrant = async (grantId: string) => {
    await supabase.from('oauth_grants').update({ revoked_at: new Date().toISOString() }).eq('id', grantId);
    await supabase.from('oauth_tokens').delete().eq('grant_id', grantId);
    invalidateApiKeyCache(grantId);
};

export const issueTokens = async (grantId: string, scopes: string[], organizationId: string) => {
    const access = newSecret('mwo_');
    const refresh = newSecret('mwr_');
    const now = Date.now();

    const { error } = await supabase.from('oauth_tokens').insert({
        grant_id: grantId,
        access_hash: sha256(access),
        refresh_hash: sha256(refresh),
        scopes,
        access_expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString(),
        refresh_expires_at: new Date(now + REFRESH_TTL_MS).toISOString(),
    });
    if (error) throw new Error(error.message);

    return {
        access_token: access,
        token_type: 'Bearer',
        expires_in: ACCESS_TTL_S,
        refresh_token: refresh,
        scope: scopes.join(' '),
        organization_id: organizationId,
    };
};
