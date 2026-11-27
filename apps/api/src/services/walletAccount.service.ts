/**
 * An external account (a bank like FNB, Airtel Money, Cash …) is two things: the wallet row people see on the Wallets
 * page, and an ASSET account in the chart of accounts that its money is posted to — the one Reports and Net worth read.
 * A wallet with no chart account used to have its entries fall into "Uncategorised Asset", and it never appeared in
 * Net worth. This is the one place that finds that account or makes it, so every way of creating a wallet agrees.
 */
import { supabase } from '../lib/supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export interface WalletRef { id: string; name: string; qb_account_id?: string | null; provider_type?: string | null }

/** The wallet's ASSET account: its explicit link, a QuickBooks-number match, or one with the same name (any capitalisation). */
export async function findWalletAssetAccountId(orgId: string, w: WalletRef): Promise<string | null> {
    let link = w.qb_account_id;
    if (link === undefined) {
        const { data } = await supabase.from('external_wallets').select('qb_account_id').eq('id', w.id).maybeSingle();
        link = data?.qb_account_id ?? null;
    }
    if (link && UUID.test(link)) {
        const { data } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('type', 'ASSET').eq('id', link).maybeSingle();
        if (data) return data.id as string;
    }
    if (link) {
        const { data } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('type', 'ASSET').eq('qb_account_id', link).limit(1).maybeSingle();
        if (data) return data.id as string;
    }
    const { data: byName } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('type', 'ASSET').ilike('name', escapeLike(w.name.trim())).limit(1).maybeSingle();
    return (byName?.id as string | undefined) ?? null;
}

/** Finds the wallet's chart account, creating and linking one when it has none. Safe to call every time. */
export async function ensureWalletAssetAccount(orgId: string, w: WalletRef): Promise<string> {
    const found = await findWalletAssetAccountId(orgId, w);
    let id = found;
    if (!id) {
        const row = {
            organization_id: orgId, code: `EXT-${w.id.slice(0, 8).toUpperCase()}`, name: w.name.trim(), type: 'ASSET',
            subtype: w.provider_type === 'BANK' ? 'Bank' : 'Other Asset', is_active: true, description: `Money in ${w.name.trim()}`,
        };
        const { data, error } = await supabase.from('accounts').insert(row).select('id').single();
        if (data) id = data.id as string;
        else {
            // A concurrent request made it first (the code is unique per wallet).
            const { data: again } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', row.code).maybeSingle();
            if (!again) throw new Error(`Could not create the ${w.name} account in the chart: ${error?.message}`);
            id = again.id as string;
        }
    }
    await supabase.from('external_wallets').update({ qb_account_id: id }).eq('id', w.id).is('qb_account_id', null);
    return id!;
}

const CODE_WALLET_TRANSFER = 'SYS-WALLET-TRANSFER';

/**
 * The account a transfer between two of the organisation's own wallets passes through. Each wallet gets its own entry
 * (so each wallet's balance moves) and each is posted against this account: money out of FNB is Dr this / Cr FNB, money
 * into Airtel is Dr Airtel / Cr this, so together they read Dr Airtel / Cr FNB and this account nets to zero.
 */
export async function ensureTransferClearingAccount(orgId: string): Promise<string> {
    const find = async () => (await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', CODE_WALLET_TRANSFER).maybeSingle()).data?.id as string | undefined;
    const existing = await find();
    if (existing) return existing;
    const { data } = await supabase.from('accounts').insert({
        organization_id: orgId, code: CODE_WALLET_TRANSFER, name: 'Transfers between accounts', type: 'ASSET', subtype: 'Other Asset', is_active: true,
        description: 'Money moving between your own accounts. Always nets to zero once both sides are recorded.',
    }).select('id').single();
    if (data) return data.id as string;
    const again = await find();
    if (!again) throw new Error('Could not create the transfers account');
    return again;
}
