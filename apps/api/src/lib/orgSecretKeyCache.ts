import { supabase } from './supabase';

/**
 * In-process cache for organizations.lenco_secret_key. Payment status polling
 * (verifyCollectionStatus) hits this lookup on every poll tick — up to ~90
 * times over a single payment's ~3min wait — so removing the DB round trip
 * on cache hits shortens the whole waiting period, not just one request.
 * TTL is short because a rotated key must propagate quickly, not because the
 * value is expected to change often.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { key: string | null; expiresAt: number }>();

export async function getCachedOrgSecretKey(organizationId: string): Promise<string | undefined> {
    const hit = cache.get(organizationId);
    if (hit && hit.expiresAt > Date.now()) {
        return hit.key || undefined;
    }

    const { data, error } = await supabase
        .from('organizations')
        .select('lenco_secret_key')
        .eq('id', organizationId)
        .single();

    const key = !error && data?.lenco_secret_key ? data.lenco_secret_key : null;
    cache.set(organizationId, { key, expiresAt: Date.now() + TTL_MS });
    return key || undefined;
}
