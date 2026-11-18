import axios from 'axios';
import { supabase } from '../lib/supabase';
import { isLencoAccountId } from './lencoAccountLink.service';

/**
 * Connecting a business to its own Lenco wallet the way Master Fees does: the admin pastes the PUBLIC key (opens Lenco's payment window)
 * and the SECRET key (reads the balance, makes transfers), and optionally the Account ID. The server asks Lenco which accounts that secret
 * key can see (GET /accounts) and takes the one account, or asks which one when there are several; it never takes a guess when the
 * choice matters, because a wrong Account ID would show and spend another account's money. Check reads the live balance of the saved link.
 * Nothing is created at Lenco: this only links an account that already exists, so it needs no permission to create sub-accounts.
 */
const BASE = 'https://api.lenco.co/access/v2';

export class ConnectError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'CONNECT', public extra: Record<string, unknown> = {}) { super(message); }
}

const headers = (key: string) => ({ Authorization: `Bearer ${key}`, Accept: 'application/json' });

/** One read from Lenco with the business's own key; a refused key, a missing account and an outage each say so. */
async function lencoGet(path: string, key: string): Promise<any> {
    try {
        const r = await axios.get(`${BASE}${path}`, { headers: headers(key), timeout: 15000 });
        return r.data?.data ?? r.data;
    } catch (e: any) {
        const s = e?.response?.status;
        if (s === 401 || s === 403) throw new ConnectError('Lenco did not accept this secret key. Check that it is the live secret key from your Lenco dashboard (not the public key, and not a test key).', 400, 'BAD_KEY');
        if (s === 404) throw new ConnectError('Lenco has no account with that ID for this key. Check the Account ID.', 400, 'NO_ACCOUNT');
        if (e?.response) throw new ConnectError(e.response.data?.message || `Lenco answered ${s}.`, 502, 'UPSTREAM');
        throw new ConnectError(`Couldn’t reach Lenco (${e?.code || e?.message}). Try again in a moment.`, 502, 'UPSTREAM');
    }
}

const num = (v: unknown) => { const n = typeof v === 'string' ? Number(v) : (v as number); return typeof n === 'number' && Number.isFinite(n) ? n : null; };
const brief = (a: any) => ({ id: String(a.id), name: String(a.accountName || a.name || a.details?.accountName || 'Lenco account'), currency: a.currency ?? null, balance: num(a.availableBalance ?? a.balance), number: a.accountNumber || a.details?.accountNumber || null });

export interface Connected { connected: true; accountId: string; accountName: string | null; balance: number | null; currency: string | null; message: string }

async function readBalance(accountId: string, key: string): Promise<{ balance: number | null; currency: string | null }> {
    const b = await lencoGet(`/accounts/${accountId}/balance`, key);
    return { balance: num(b?.availableBalance ?? b?.balance), currency: b?.currency ?? 'ZMW' };
}

export async function connectWithKeys(input: { orgId: string; publicKey: unknown; secretKey: unknown; accountId?: unknown }): Promise<Connected> {
    const publicKey = String(input.publicKey ?? '').trim();
    const secretKey = String(input.secretKey ?? '').trim();
    const wanted = String(input.accountId ?? '').trim();
    if (!publicKey) throw new ConnectError('Enter the public key (it starts with pub-).', 400, 'NO_PUBLIC');
    if (!/^pub-/i.test(publicKey)) throw new ConnectError('The public key should start with pub-. You may have pasted the secret key here.', 400, 'BAD_PUBLIC');
    if (secretKey.length < 16) throw new ConnectError('Enter the secret key from your Lenco dashboard.', 400, 'NO_SECRET');
    if (/^pub-/i.test(secretKey)) throw new ConnectError('That looks like the public key. Paste the secret key in the secret key box.', 400, 'BAD_SECRET');
    if (wanted && !isLencoAccountId(wanted)) throw new ConnectError('The Account ID is a long code with dashes (like 0b8f2c1e-...). Copy it from your Lenco dashboard.', 400, 'BAD_ACCOUNT_ID');

    const { data: org, error } = await supabase.from('organizations').select('id, lenco_subaccount_id').eq('id', input.orgId).maybeSingle();
    if (error || !org) throw new ConnectError('Business not found.', 404, 'NOT_FOUND');

    // Which account? Given by the admin, or found by asking Lenco what this key can see.
    let accountId = wanted;
    let accountName: string | null = null;
    if (!accountId) {
        const list = await lencoGet('/accounts', secretKey);
        const accounts = (Array.isArray(list) ? list : []).map(brief);
        if (accounts.length === 0) throw new ConnectError('This key can’t see any Lenco account. Enter the Account ID from your Lenco dashboard.', 409, 'NEEDS_ACCOUNT_ID', { needsAccountId: true, accounts: [] });
        if (accounts.length > 1) throw new ConnectError('This key can see more than one Lenco account. Choose the one for this business.', 409, 'NEEDS_ACCOUNT_ID', { needsAccountId: true, accounts });
        accountId = accounts[0].id; accountName = accounts[0].name;
    }

    // One business, one wallet: an account already linked to someone else is never shared, and a linked business doesn't switch accounts.
    if (org.lenco_subaccount_id && org.lenco_subaccount_id !== accountId) {
        throw new ConnectError('This business is already linked to a different Lenco account. Changing it has to be done by MoneyWise support, so money can’t be redirected.', 409, 'ALREADY_LINKED');
    }
    const { data: used } = await supabase.from('organizations').select('id').eq('lenco_subaccount_id', accountId).neq('id', input.orgId).maybeSingle();
    if (used) throw new ConnectError('This Lenco account is already linked to another business.', 409, 'IN_USE');

    // One key belongs to one business: a secret key already saved for another business is never shared.
    const { data: keyUsed } = await supabase.from('organizations').select('id').or(`lenco_secret_key.eq.${secretKey},lenco_public_key.eq.${publicKey}`).neq('id', input.orgId).limit(1);
    if (keyUsed && keyUsed.length > 0) throw new ConnectError('One of these keys is already used by another business. Each business needs its own Lenco keys.', 409, 'KEY_IN_USE');

    // Proves the key and the account go together, and gives the balance to show.
    const { balance, currency } = await readBalance(accountId, secretKey);
    if (!accountName) { const one = await lencoGet(`/accounts/${accountId}`, secretKey).catch(() => null); accountName = one ? brief(one).name : null; }

    const { error: upErr } = await supabase.from('organizations').update({ lenco_public_key: publicKey, lenco_secret_key: secretKey, lenco_subaccount_id: accountId }).eq('id', input.orgId);
    if (upErr) throw new ConnectError('Couldn’t save the connection. Nothing was changed.', 500, 'DB');
    return { connected: true, accountId, accountName, balance, currency, message: `Lenco wallet connected.${balance !== null ? ` Available balance ${currency ?? 'ZMW'} ${balance.toFixed(2)}.` : ''}` };
}

/** Reads the live balance of the saved link, with the business's own key. "Connected" means the public key, secret key and account are all saved. */
export async function checkConnection(orgId: string): Promise<Connected & { missing?: string[] }> {
    const { data: org } = await supabase.from('organizations').select('lenco_public_key, lenco_secret_key, lenco_subaccount_id').eq('id', orgId).maybeSingle();
    const missing = [!org?.lenco_public_key && 'public key', !org?.lenco_secret_key && 'secret key', !org?.lenco_subaccount_id && 'account'].filter(Boolean) as string[];
    if (!org || missing.length) throw new ConnectError(`Not connected yet. Missing: ${missing.join(', ')}.`, 400, 'NOT_CONNECTED', { missing });
    const { balance, currency } = await readBalance(org.lenco_subaccount_id!, org.lenco_secret_key!);
    return { connected: true, accountId: org.lenco_subaccount_id!, accountName: null, balance, currency, message: `Lenco wallet is connected.${balance !== null ? ` Available balance ${currency ?? 'ZMW'} ${balance.toFixed(2)}.` : ''}` };
}
