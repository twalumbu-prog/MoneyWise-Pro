/**
 * Add one pre-created Lenco sub-wallet to wallet_pool (same logic as POST /admin/wallet-pool:
 * resolve label -> Lenco account UUID, verify with Lenco, insert AVAILABLE).
 *   POOL_NAME=… POOL_SECRET=… POOL_PUBKEY=… npx ts-node --transpile-only src/scripts/add_pool_wallet.ts [--apply]
 * Credentials come from env vars so they are never written to a file.
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { LencoService } from '../services/lenco.service';

async function main() {
    const name = process.env.POOL_NAME!, secret = process.env.POOL_SECRET!, pub = process.env.POOL_PUBKEY!;
    if (!name || !secret || !pub) throw new Error('POOL_NAME, POOL_SECRET, POOL_PUBKEY required');

    const accounts = await LencoService.listAccounts(secret);
    console.log(`Lenco returned ${accounts.length} account(s) for this key:`);
    for (const a of accounts) console.log(' -', a.id, '|', JSON.stringify(a.details), '| avail', a.availableBalance ?? a.balance);
    const matches = accounts.filter((a: any) => [a.name, a.reference, a.details?.accountName, a.details?.name, a.details?.merchantName, a.details?.tillNumber, a.details?.merchantId].some((v: any) => String(v ?? '').toLowerCase() === name.toLowerCase()));
    // Several Lenco accounts can share a display name; POOL_ID pins the exact one.
    const acct = process.env.POOL_ID ? accounts.find((a: any) => a.id === process.env.POOL_ID) : matches[0];
    if (!process.env.POOL_ID && matches.length !== 1) throw new Error(`Expected exactly 1 account matching "${name}", got ${matches.length}`);
    if (!acct) throw new Error('No account with POOL_ID');

    const bal = await LencoService.getAccountBalance(acct.id, secret);
    console.log('Resolved', acct.id, 'balance', JSON.stringify(bal));

    const { data: existing } = await supabase.from('wallet_pool').select('id, status').eq('provider_account_id', acct.id);
    console.log('Already in pool:', existing);
    if (!process.argv.includes('--apply')) { console.log('Dry run. Add --apply to insert.'); return; }
    if (existing?.length) { console.log('Skipping insert.'); return; }

    const { data, error } = await supabase.from('wallet_pool')
        .insert({ provider_account_id: acct.id, api_secret: secret, public_key: pub, status: 'AVAILABLE' })
        .select('id, provider_account_id, status, created_at').single();
    if (error) throw error;
    console.log('Inserted:', data);
    const { count } = await supabase.from('wallet_pool').select('id', { count: 'exact', head: true }).eq('status', 'AVAILABLE');
    console.log('AVAILABLE wallets in pool:', count);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
