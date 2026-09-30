import { randomBytes, createHash } from 'crypto';
import { supabase } from '../lib/supabase';
import { invalidateApiKeyCache, isPremiumOrg } from '../middleware/apiKey';

const MAX_ACTIVE_KEYS = 10;

function generateApiKey(env: 'live' | 'test' = 'live'): { raw: string; hash: string; prefix: string } {
    const secret = randomBytes(24).toString('hex'); // 48 hex chars
    const raw = `mwp_${env}_${secret}`;
    const hash = createHash('sha256').update(raw).digest('hex');
    const prefix = raw.slice(0, 20); // e.g. "mwp_live_a1b2c3d4e5f6"
    return { raw, hash, prefix };
}

export const listApiKeys = async (req: any, res: any) => {
    const orgId = req.user.organization_id;

    const { data, error } = await supabase
        .from('api_keys')
        .select('id, name, key_prefix, scopes, last_used_at, created_at, revoked_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[Developer] list keys:', error.message);
        return res.status(500).json({ error: 'Failed to fetch API keys' });
    }

    res.json(data ?? []);
};

export const createApiKey = async (req: any, res: any) => {
    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const { name, scopes = ['read'] } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 60) {
        return res.status(400).json({ error: 'A name of 1–60 characters is required' });
    }

    if (!(await isPremiumOrg(orgId))) {
        return res.status(403).json({ error: 'The MoneyWise API is available on the Premium plan' });
    }

    const { count: activeCount } = await supabase
        .from('api_keys')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .is('revoked_at', null);
    if ((activeCount ?? 0) >= MAX_ACTIVE_KEYS) {
        return res.status(400).json({ error: `You can have at most ${MAX_ACTIVE_KEYS} active API keys. Revoke one first.` });
    }

    const validScopes = ['read', 'write'];
    const cleanScopes = Array.isArray(scopes)
        ? [...new Set((scopes as string[]).filter(s => validScopes.includes(s)))]
        : [];
    if (cleanScopes.length === 0) {
        return res.status(400).json({ error: 'At least one valid scope (read, write) is required' });
    }

    const { raw, hash, prefix } = generateApiKey('live');

    const { data, error } = await supabase
        .from('api_keys')
        .insert({
            organization_id: orgId,
            created_by: userId.startsWith('api-key:') ? null : userId,
            name: name.trim(),
            key_hash: hash,
            key_prefix: prefix,
            scopes: cleanScopes,
        })
        .select('id, name, key_prefix, scopes, created_at')
        .single();

    if (error) {
        console.error('[Developer] create key:', error.message);
        return res.status(500).json({ error: 'Failed to create API key' });
    }

    res.status(201).json({
        ...data,
        // Return the raw key only here — it can never be retrieved again
        key: raw,
    });
};

export const revokeApiKey = async (req: any, res: any) => {
    const orgId = req.user.organization_id;
    const { id } = req.params;

    const { data, error } = await supabase
        .from('api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', orgId)
        .select('id')
        .maybeSingle();

    if (error) {
        console.error('[Developer] revoke key:', error.message);
        return res.status(500).json({ error: 'Failed to revoke API key' });
    }
    if (!data) {
        return res.status(404).json({ error: 'API key not found' });
    }

    invalidateApiKeyCache(data.id);
    res.json({ message: 'API key revoked successfully' });
};
