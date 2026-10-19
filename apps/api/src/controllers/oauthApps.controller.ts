/**
 * Self-service OAuth app registration for organisation admins
 * (mounted under /developer, which is already ADMIN-only).
 *
 * Trust model: an app belongs to the organisation that registered it, is shown as
 * "Unverified" until a super-admin sets verified_at, and while unverified it can
 * only ever request the read scope.
 */
import { randomBytes } from 'crypto';
import { supabase } from '../lib/supabase';
import {
    MAX_APPS_PER_ORG,
    UNVERIFIED_SCOPES,
    VALID_SCOPES,
    isReservedAppName,
    isValidRedirectUri,
    revokeGrant,
    sha256,
} from '../services/oauth.service';

const COLUMNS = 'id, client_id, name, description, redirect_uris, allowed_scopes, client_secret_hash, verified_at, created_at';

const shape = (c: any, connectedOrgs = 0) => ({
    id: c.id,
    client_id: c.client_id,
    name: c.name,
    description: c.description,
    redirect_uris: c.redirect_uris,
    scopes: c.allowed_scopes,
    confidential: !!c.client_secret_hash,
    verified: !!c.verified_at,
    created_at: c.created_at,
    connected_orgs: connectedOrgs,
});

type Checked =
    | { ok: true; value: { name?: string; description?: string | null; redirect_uris?: string[]; scopes?: string[] } }
    | { ok: false; error: string };

// Validates whichever of the fields are present (create passes all of them, PATCH only some).
const validateFields = async (body: any, verified: boolean, ownId?: string): Promise<Checked> => {
    const value: any = {};

    if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (name.length < 2 || name.length > 60) return { ok: false, error: 'App name must be 2–60 characters.' };
        if (!verified && isReservedAppName(name)) {
            return { ok: false, error: 'That name is reserved. Choose a name that doesn’t imitate MoneyWise, Lenco or QuickBooks.' };
        }
        let dup = supabase.from('oauth_clients').select('id').ilike('name', name.replace(/[%_]/g, (m: string) => `\\${m}`)).limit(1);
        if (ownId) dup = dup.neq('id', ownId);
        const { data: clash } = await dup;
        if (clash && clash.length > 0) return { ok: false, error: 'An app with this name already exists. Choose another name.' };
        value.name = name;
    }

    if (body.description !== undefined) {
        const d = typeof body.description === 'string' ? body.description.trim() : '';
        if (d.length > 200) return { ok: false, error: 'Description must be 200 characters or fewer.' };
        value.description = d || null;
    }

    if (body.redirect_uris !== undefined) {
        const uris = Array.isArray(body.redirect_uris) ? [...new Set(body.redirect_uris.map((u: any) => String(u).trim()).filter(Boolean))] as string[] : [];
        if (uris.length < 1 || uris.length > 5) return { ok: false, error: 'Provide between 1 and 5 callback URLs.' };
        const bad = uris.find(u => !isValidRedirectUri(u));
        if (bad) return { ok: false, error: `Invalid callback URL: ${bad}. Use https:// (or http://localhost for testing); no wildcards or #fragments.` };
        value.redirect_uris = uris;
    }

    if (body.scopes !== undefined) {
        const scopes = Array.isArray(body.scopes) ? [...new Set(body.scopes as string[])] : [];
        if (scopes.length === 0 || scopes.some(s => !VALID_SCOPES.includes(s))) return { ok: false, error: 'Choose at least one valid scope (read, write).' };
        if (!verified && scopes.some(s => !UNVERIFIED_SCOPES.includes(s))) {
            return { ok: false, error: 'Write access requires a verified app. Register it with read access first, then contact MoneyWise to get it verified.' };
        }
        value.scopes = scopes;
    }

    return { ok: true, value };
};

export const listOAuthApps = async (req: any, res: any) => {
    const { data, error } = await supabase
        .from('oauth_clients')
        .select(COLUMNS)
        .eq('owner_organization_id', req.user.organization_id)
        .order('created_at', { ascending: false });
    if (error) {
        console.error('[OAuthApps] list:', error.message);
        return res.status(500).json({ error: 'Failed to fetch apps' });
    }

    const ids = (data ?? []).map(c => c.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
        const { data: grants } = await supabase.from('oauth_grants').select('client_id').in('client_id', ids).is('revoked_at', null);
        for (const g of grants ?? []) counts[g.client_id] = (counts[g.client_id] ?? 0) + 1;
    }
    res.json((data ?? []).map(c => shape(c, counts[c.id] ?? 0)));
};

export const createOAuthApp = async (req: any, res: any) => {
    const orgId = req.user.organization_id;
    const body = req.body ?? {};

    const { count } = await supabase.from('oauth_clients').select('id', { count: 'exact', head: true }).eq('owner_organization_id', orgId);
    if ((count ?? 0) >= MAX_APPS_PER_ORG) return res.status(400).json({ error: `You can register up to ${MAX_APPS_PER_ORG} apps. Delete one first.` });

    const checked = await validateFields({ scopes: ['read'], ...body }, false);
    if (!checked.ok) return res.status(400).json({ error: checked.error });
    const v = checked.value;
    if (!v.name || !v.redirect_uris) return res.status(400).json({ error: 'name and redirect_uris are required' });

    const confidential = body.confidential === true;
    const clientId = `mwc_${randomBytes(12).toString('hex')}`;
    const secret = confidential ? `mws_${randomBytes(32).toString('base64url')}` : null;

    const { data, error } = await supabase
        .from('oauth_clients')
        .insert({
            client_id: clientId,
            name: v.name,
            description: v.description ?? null,
            redirect_uris: v.redirect_uris,
            allowed_scopes: v.scopes ?? ['read'],
            client_secret_hash: secret ? sha256(secret) : null,
            owner_organization_id: orgId,
            created_by: req.user.id,
        })
        .select(COLUMNS)
        .single();
    if (error || !data) {
        console.error('[OAuthApps] create:', error?.message);
        return res.status(500).json({ error: 'Failed to register app' });
    }

    // The secret is returned exactly once; only its hash is stored.
    res.status(201).json({ ...shape(data), client_secret: secret });
};

const loadOwned = async (req: any) => {
    const { data } = await supabase
        .from('oauth_clients')
        .select(COLUMNS)
        .eq('id', req.params.id)
        .eq('owner_organization_id', req.user.organization_id)
        .maybeSingle();
    return data;
};

export const updateOAuthApp = async (req: any, res: any) => {
    const app = await loadOwned(req);
    if (!app) return res.status(404).json({ error: 'App not found' });

    const body = req.body ?? {};
    // Only validate the name when it actually changes (an unchanged reserved legacy name shouldn't block other edits).
    if (typeof body.name === 'string' && body.name.trim() === app.name) delete body.name;

    const checked = await validateFields(body, !!app.verified_at, app.id);
    if (!checked.ok) return res.status(400).json({ error: checked.error });
    const v = checked.value;

    const patch: any = {};
    if (v.name !== undefined) patch.name = v.name;
    if (v.description !== undefined) patch.description = v.description;
    if (v.redirect_uris !== undefined) patch.redirect_uris = v.redirect_uris;
    if (v.scopes !== undefined) patch.allowed_scopes = v.scopes;
    if (Object.keys(patch).length === 0) return res.json(shape(app));

    const { data, error } = await supabase.from('oauth_clients').update(patch).eq('id', app.id).select(COLUMNS).single();
    if (error || !data) {
        console.error('[OAuthApps] update:', error?.message);
        return res.status(500).json({ error: 'Failed to update app' });
    }
    res.json(shape(data));
};

export const regenerateOAuthSecret = async (req: any, res: any) => {
    const app = await loadOwned(req);
    if (!app) return res.status(404).json({ error: 'App not found' });
    if (!app.client_secret_hash) return res.status(400).json({ error: 'This app has no client secret (it is a public app).' });

    const secret = `mws_${randomBytes(32).toString('base64url')}`;
    const { error } = await supabase.from('oauth_clients').update({ client_secret_hash: sha256(secret) }).eq('id', app.id);
    if (error) {
        console.error('[OAuthApps] regenerate:', error.message);
        return res.status(500).json({ error: 'Failed to regenerate secret' });
    }
    // Old secret stops working immediately; already-issued tokens keep working until they expire or are revoked.
    res.json({ client_id: app.client_id, client_secret: secret });
};

export const deleteOAuthApp = async (req: any, res: any) => {
    const app = await loadOwned(req);
    if (!app) return res.status(404).json({ error: 'App not found' });

    // Revoke every connection first so cached access tokens die immediately, then delete (cascades).
    const { data: grants } = await supabase.from('oauth_grants').select('id').eq('client_id', app.id);
    for (const g of grants ?? []) await revokeGrant(g.id);

    const { error } = await supabase.from('oauth_clients').delete().eq('id', app.id);
    if (error) {
        console.error('[OAuthApps] delete:', error.message);
        return res.status(500).json({ error: 'Failed to delete app' });
    }
    res.json({ message: 'App deleted and all its connections revoked' });
};
