/**
 * Gives every external wallet its own ASSET account in the chart, and re-posts the entries that were booked to a wallet
 * while it had none (they fell into "Uncategorised Asset"). Dry run by default.
 *   npx ts-node --transpile-only src/scripts/fix_wallet_accounts.ts [--org <id>] [--apply]
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { ledgerService } from '../services/ledger.service';
import { ensureWalletAssetAccount, findWalletAssetAccountId } from '../services/walletAccount.service';

const apply = process.argv.includes('--apply');
const orgArg = process.argv.includes('--org') ? process.argv[process.argv.indexOf('--org') + 1] : null;

(async () => {
    let q = supabase.from('external_wallets').select('id, organization_id, name, provider_type, qb_account_id');
    if (orgArg) q = q.eq('organization_id', orgArg);
    const { data: wallets, error } = await q;
    if (error) throw error;
    const orgNames = new Map<string, string>();
    for (const o of (await supabase.from('organizations').select('id, name')).data ?? []) orgNames.set(o.id, o.name);
    console.log(`${apply ? 'APPLY' : 'DRY RUN'} · ${wallets!.length} external wallets${orgArg ? ' in one workspace' : ''}\n`);
    let missing = 0, misposted = 0;
    for (const w of wallets!) {
        const target = await findWalletAssetAccountId(w.organization_id, w as any);
        const { data: entries } = await supabase.from('cashbook_entries').select('id, date, description, debit, credit').eq('account_type', w.id);
        const bad: any[] = [];
        for (const e of entries ?? []) {
            const { data: j } = await supabase.from('journal_entries').select('id').eq('source_type', 'CASHBOOK').eq('source_id', e.id);
            const ids = (j ?? []).map((x: any) => x.id);
            const { data: lines } = ids.length ? await supabase.from('journal_lines').select('account_id').in('journal_entry_id', ids) : { data: [] as any[] };
            const hasWalletLine = !!target && (lines ?? []).some((l: any) => l.account_id === target);
            if (!hasWalletLine && Math.abs(Number(e.debit) - Number(e.credit)) > 0.004) bad.push(e);
        }
        if (target && bad.length === 0) continue;
        if (!target) missing++;
        misposted += bad.length;
        console.log(`${orgNames.get(w.organization_id) ?? w.organization_id} · "${w.name}" (${w.provider_type}) — ${target ? 'has its account' : 'NO chart account'}; ${bad.length} entr${bad.length === 1 ? 'y' : 'ies'} not posted to it`);
        for (const e of bad) console.log(`     ${e.date} ${e.description?.slice(0, 70)} Dr${e.debit} Cr${e.credit}`);
        if (apply) {
            const id = await ensureWalletAssetAccount(w.organization_id, w as any);
            for (const e of bad) await ledgerService.repostForCashbookEntry(e.id);
            console.log(`     → account ${id} ensured; ${bad.length} re-posted`);
        }
    }
    console.log(`\n${missing} wallets without a chart account, ${misposted} entries to re-post.${apply ? '' : ' (dry run: nothing changed)'}`);
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
