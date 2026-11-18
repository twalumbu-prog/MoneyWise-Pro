/**
 * Read-only: compares a business's Main Wallet balance in MoneyWise's books with what Lenco says is really in the account.
 * Run: npx tsx src/scripts/check_main_wallet_balance.ts [organization-id]
 */
import { supabase } from '../lib/supabase';
import { LencoService } from '../services/lenco.service';
import { cashbookService } from '../services/cashbook.service';

const ORG = process.argv[2] || 'fa99669d-6160-44fd-94ac-8ff1f065003f';

(async () => {
    const { data: org } = await supabase.from('organizations').select('name, lenco_subaccount_id, lenco_secret_key, payment_test_mode').eq('id', ORG).single();
    if (!org) { console.log('no such business'); process.exit(1); }
    console.log('Business:', org.name, '| test mode:', org.payment_test_mode, '| lenco account:', org.lenco_subaccount_id);

    const { data: wallets } = await supabase.from('organization_wallets').select('id, name, is_main').eq('organization_id', ORG).order('is_main', { ascending: false });
    let ledgerTotal = 0;
    for (const w of wallets ?? []) {
        const b = await cashbookService.getCurrentBalance(ORG, 'MONEYWISE_WALLET', w.id);
        ledgerTotal += b;
        console.log(`  books: ${w.name}${w.is_main ? ' (main)' : ''}: K${b}`);
    }
    console.log('  books: all MoneyWise wallets together: K' + Math.round(ledgerTotal * 100) / 100);

    if (!org.lenco_subaccount_id) { console.log('No Lenco account or key saved, cannot ask Lenco.'); process.exit(0); }
    try {
        const live: any = await LencoService.getAccountBalance(org.lenco_subaccount_id, org.lenco_secret_key || undefined);
        console.log('Lenco live:', JSON.stringify(live));
    } catch (e: any) { console.log('Lenco balance failed:', e?.message); }

    const { data: last } = await supabase.from('cashbook_entries').select('date, description, debit, credit, entry_type, status, created_at').eq('organization_id', ORG).eq('account_type', 'MONEYWISE_WALLET').order('created_at', { ascending: false }).limit(12);
    console.log('Latest entries on the wallet:'); for (const e of last ?? []) console.log(' ', e.date, e.entry_type, `+${e.debit}/-${e.credit}`, e.status, String(e.description).slice(0, 70));
    process.exit(0);
})();
