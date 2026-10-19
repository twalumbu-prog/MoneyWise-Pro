/**
 * Registers an OAuth client (one of your own apps) that can connect to MoneyWise.
 *
 *   npm run oauth:create-client -- --name "My App" \
 *     --redirect https://myapp.com/callback --redirect myapp://oauth \
 *     --scopes read,write [--confidential] [--description "..."] [--logo https://...]
 *     [--owner-org <organization uuid>] [--verified]
 *
 * Day to day, Premium admins register apps themselves under Settings -> MoneyWise API.
 * This script is for super-admins: it can mark an app --verified (unlocks the write scope).
 *
 * Public clients (default: SPAs, mobile apps) rely on PKCE alone.
 * --confidential also issues a client secret (server-side apps), shown once.
 */
import { randomBytes } from 'crypto';
import { supabase } from '../lib/supabase';
import { sha256, VALID_SCOPES, isValidRedirectUri } from '../services/oauth.service';

function parseArgs(argv: string[]) {
    const out: Record<string, string[]> = {};
    for (let i = 0; i < argv.length; i++) {
        if (!argv[i].startsWith('--')) continue;
        const key = argv[i].slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) out[key] = ['true'];
        else { (out[key] ||= []).push(next); i++; }
    }
    return out;
}

(async () => {
    const a = parseArgs(process.argv.slice(2));
    const name = a.name?.[0];
    const redirects = a.redirect ?? [];
    const scopes = (a.scopes?.[0] ?? 'read').split(',').map(s => s.trim()).filter(Boolean);

    if (!name || redirects.length === 0) {
        console.error('Usage: --name "App" --redirect <uri> [--redirect <uri>] [--scopes read,write] [--confidential]');
        process.exit(1);
    }
    const badRedirect = redirects.find(r => !isValidRedirectUri(r));
    if (badRedirect) { console.error(`Invalid redirect URI: ${badRedirect} (use https://, http://localhost, or a custom app scheme; no wildcards)`); process.exit(1); }
    const badScope = scopes.find(s => !VALID_SCOPES.includes(s));
    if (badScope) { console.error(`Unknown scope '${badScope}'. Valid: ${VALID_SCOPES.join(', ')}`); process.exit(1); }

    const clientId = `mwc_${randomBytes(12).toString('hex')}`;
    const secret = a.confidential ? `mws_${randomBytes(32).toString('base64url')}` : null;

    const { error } = await supabase.from('oauth_clients').insert({
        client_id: clientId,
        name,
        description: a.description?.[0] ?? null,
        logo_url: a.logo?.[0] ?? null,
        redirect_uris: redirects,
        allowed_scopes: scopes,
        client_secret_hash: secret ? sha256(secret) : null,
        owner_organization_id: a['owner-org']?.[0] ?? null,
        verified_at: a.verified ? new Date().toISOString() : null,
    });
    if (error) { console.error('Failed to create client:', error.message); process.exit(1); }

    console.log('\nOAuth client created');
    console.log('  name:          ', name);
    console.log('  client_id:     ', clientId);
    if (secret) console.log('  client_secret: ', secret, ' (shown once - store it server-side only)');
    else console.log('  type:           public (PKCE only, no secret)');
    console.log('  redirect URIs: ', redirects.join(', '));
    console.log('  scopes:        ', scopes.join(', '));
    console.log('  verified:      ', a.verified ? 'yes' : 'no');
    process.exit(0);
})();
