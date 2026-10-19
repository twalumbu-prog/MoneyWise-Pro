import { createHash } from 'crypto';
import { supabase } from '../lib/supabase';

interface CachedKey {
    kind: 'key' | 'oauth';
    id: string; // api_keys.id, or oauth_grants.id for OAuth tokens
    accessExpiresAt: number | null;
    organization_id: string;
    scopes: string[];
    revoked: boolean;
    premium: boolean;
    cachedAt: number;
    touchedAt: number;
}

// Per-instance cache: cuts the two DB round-trips per request to ~one per key per TTL.
// Revocation/downgrade therefore takes effect within CACHE_TTL_MS on other instances.
const CACHE_TTL_MS = 30_000;
const TOUCH_INTERVAL_MS = 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, CachedKey>();

export const invalidateApiKeyCache = (keyId: string) => {
    for (const [hash, entry] of cache) {
        if (entry.id === keyId) cache.delete(hash);
    }
};

export const isPremiumOrg = async (organizationId: string): Promise<boolean> => {
    const { data } = await supabase
        .from('organization_subscriptions')
        .select('plan_id')
        .eq('organization_id', organizationId)
        .maybeSingle();
    return data?.plan_id === 'premium';
};

/**
 * Validates a MoneyWise API key (mwp_live_...).
 * On success attaches req.user = { id: 'api-key:<keyId>', organization_id, role, apiKeyScopes }.
 */
export const requireApiKey = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

    const raw =
        apiKeyHeader ||
        (authHeader?.startsWith('Bearer mwp_') || authHeader?.startsWith('Bearer mwo_') ? authHeader.slice(7) : undefined);

    if (!raw) {
        return res.status(401).json({
            error: 'Missing API key',
            hint: 'Pass your MoneyWise API key or OAuth access token via the Authorization: Bearer <token> header (or X-Api-Key).',
        });
    }

    const isOAuth = raw.startsWith('mwo_');
    if (!isOAuth && !raw.startsWith('mwp_')) {
        return res.status(401).json({ error: 'Invalid API key format' });
    }

    try {
        const hash = createHash('sha256').update(raw).digest('hex');
        const now = Date.now();
        let entry = cache.get(hash);

        if (!entry || now - entry.cachedAt > CACHE_TTL_MS) {
            let found: { id: string; organization_id: string; scopes: string[]; revoked: boolean; accessExpiresAt: number | null } | null = null;

            if (isOAuth) {
                const { data: tok, error } = await supabase
                    .from('oauth_tokens')
                    .select('grant_id, scopes, access_expires_at, oauth_grants(organization_id, revoked_at)')
                    .eq('access_hash', hash)
                    .maybeSingle();
                if (error) {
                    console.error('[ApiKey] Token lookup failed:', error.message);
                    return res.status(503).json({ error: 'Service temporarily unavailable' });
                }
                const grant = (tok as any)?.oauth_grants;
                if (tok && grant) {
                    found = {
                        id: tok.grant_id,
                        organization_id: grant.organization_id,
                        scopes: (tok.scopes as string[]) ?? [],
                        revoked: !!grant.revoked_at,
                        accessExpiresAt: new Date(tok.access_expires_at).getTime(),
                    };
                }
            } else {
                const { data: key, error } = await supabase
                    .from('api_keys')
                    .select('id, organization_id, scopes, revoked_at')
                    .eq('key_hash', hash)
                    .maybeSingle();
                if (error) {
                    console.error('[ApiKey] Lookup failed:', error.message);
                    return res.status(503).json({ error: 'Service temporarily unavailable' });
                }
                if (key) {
                    found = {
                        id: key.id,
                        organization_id: key.organization_id,
                        scopes: (key.scopes as string[]) ?? [],
                        revoked: !!key.revoked_at,
                        accessExpiresAt: null,
                    };
                }
            }

            if (!found) {
                cache.delete(hash);
                return res.status(401).json({ error: isOAuth ? 'Invalid access token' : 'Invalid API key' });
            }

            const premium = found.revoked ? false : await isPremiumOrg(found.organization_id);
            if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
            entry = {
                kind: isOAuth ? 'oauth' : 'key',
                id: found.id,
                accessExpiresAt: found.accessExpiresAt,
                organization_id: found.organization_id,
                scopes: found.scopes,
                revoked: found.revoked,
                premium,
                cachedAt: now,
                touchedAt: entry?.touchedAt ?? 0,
            };
            cache.set(hash, entry);
        }

        if (entry.revoked) {
            return res.status(401).json({ error: entry.kind === 'oauth' ? 'Access for this app has been revoked' : 'This API key has been revoked' });
        }
        if (entry.accessExpiresAt !== null && now > entry.accessExpiresAt) {
            res.set('WWW-Authenticate', 'Bearer error="invalid_token", error_description="The access token expired"');
            return res.status(401).json({ error: 'Access token expired', hint: 'Use your refresh token at POST /oauth/token to get a new one.' });
        }
        if (!entry.premium) {
            return res.status(403).json({
                error: 'The MoneyWise API requires a Premium plan',
                hint: 'Upgrade under Settings → Subscription & Billing.',
            });
        }

        req.user = {
            id: entry.kind === 'oauth' ? `oauth:${entry.id}` : `api-key:${entry.id}`,
            organization_id: entry.organization_id,
            role: 'ADMIN',
            apiKeyScopes: entry.scopes,
        };

        // At most one last_used_at write per key per minute, never blocking the request.
        if (now - entry.touchedAt > TOUCH_INTERVAL_MS) {
            entry.touchedAt = now;
            void supabase
                .from(entry.kind === 'oauth' ? 'oauth_grants' : 'api_keys')
                .update({ last_used_at: new Date(now).toISOString() })
                .eq('id', entry.id)
                .then(() => undefined, () => undefined);
        }

        next();
    } catch (err: any) {
        console.error('[ApiKey] Unexpected error:', err?.message);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Enforces that the authenticated API key has the required scope.
 * Must be used after requireApiKey.
 */
export const requireScope = (scope: 'read' | 'write') => {
    return (req: any, res: any, next: any) => {
        const scopes: string[] = req.user?.apiKeyScopes ?? [];
        if (!scopes.includes(scope)) {
            return res.status(403).json({
                error: `This action requires the '${scope}' scope`,
                hint: `Create an API key with the '${scope}' scope enabled.`,
            });
        }
        next();
    };
};
