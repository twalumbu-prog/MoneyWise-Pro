import { createHash } from 'crypto';
import { supabase } from '../lib/supabase';

interface CachedKey {
    id: string;
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
        (authHeader?.startsWith('Bearer mwp_') ? authHeader.slice(7) : undefined);

    if (!raw) {
        return res.status(401).json({
            error: 'Missing API key',
            hint: 'Pass your MoneyWise API key via the Authorization: Bearer <key> header or X-Api-Key header.',
        });
    }

    if (!raw.startsWith('mwp_')) {
        return res.status(401).json({ error: 'Invalid API key format' });
    }

    try {
        const hash = createHash('sha256').update(raw).digest('hex');
        const now = Date.now();
        let entry = cache.get(hash);

        if (!entry || now - entry.cachedAt > CACHE_TTL_MS) {
            const { data: key, error } = await supabase
                .from('api_keys')
                .select('id, organization_id, scopes, revoked_at')
                .eq('key_hash', hash)
                .maybeSingle();

            if (error) {
                console.error('[ApiKey] Lookup failed:', error.message);
                return res.status(503).json({ error: 'Service temporarily unavailable' });
            }
            if (!key) {
                cache.delete(hash);
                return res.status(401).json({ error: 'Invalid API key' });
            }

            const premium = key.revoked_at ? false : await isPremiumOrg(key.organization_id);
            if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
            entry = {
                id: key.id,
                organization_id: key.organization_id,
                scopes: (key.scopes as string[]) ?? [],
                revoked: !!key.revoked_at,
                premium,
                cachedAt: now,
                touchedAt: entry?.touchedAt ?? 0,
            };
            cache.set(hash, entry);
        }

        if (entry.revoked) {
            return res.status(401).json({ error: 'This API key has been revoked' });
        }
        if (!entry.premium) {
            return res.status(403).json({
                error: 'The MoneyWise API requires a Premium plan',
                hint: 'Upgrade under Settings → Subscription & Billing.',
            });
        }

        req.user = {
            id: `api-key:${entry.id}`,
            organization_id: entry.organization_id,
            role: 'ADMIN',
            apiKeyScopes: entry.scopes,
        };

        // At most one last_used_at write per key per minute, never blocking the request.
        if (now - entry.touchedAt > TOUCH_INTERVAL_MS) {
            entry.touchedAt = now;
            void supabase
                .from('api_keys')
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
