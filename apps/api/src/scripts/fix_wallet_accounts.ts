/**
 * Audit / repair for external wallets and the chart of accounts.
 *  1. Every external wallet must have its own ASSET account (a database trigger now guarantees this for new wallets).
 *  2. Entries booked to a wallet must be posted to THAT account. Entries whose wallet side landed in "Uncategorised Asset"
 *     (what happened while a wallet had no account) are re-posted. Entries posted elsewhere on purpose (MasterFees manual
 *     payments go to their own "Master Fees Manual" accounts) are left alone.
 * Dry run by default.   npx ts-node --transpile-only src/scripts/fix_wallet_accounts.ts [--org <id>] [--apply]
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { ledgerService } from '../services/ledger.service';
import { ensureWalletAssetAccount, findWalletAssetAccountId } from '../services/walletAccount.service';

const apply = process.argv.includes('--apply');
const orgArg = process.argv.includes('--org') ? process.argv[process.argv.indexOf('--org') + 1] : null;
const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

(async () => {
    let wq = supabase.from('external_wallets').select('id, organization_id, name, provider_type, qb_account_id');
    if (orgArg) wq = wq.eq('organization_id', orgArg);
    const wallets = (await wq).data ?? [];
    console.log(`${apply ? 'APPLY' : 'DRY RUN'} · ${wallets.length} external wallets\n`);

    let noAccount = 0;
    const target = new Map<string, string>();
    for (const w of wallets) {
        let id = await findWalletAssetAccountId(w.organization_id, w as any);
        if (!id) { noAccount++; console.log(`no chart account: ${w.name} (${w.organization_id})`); if (apply) id = await ensureWalletAssetAccount(w.organization_id, w as any); }
        if (id) target.set(w.id, id);
    }

    // Uncategorised Asset account per organisation
    const orgs = [...new Set(wallets.map((w) => w.organization_id))];
    const uncat = new Map<string, string>();
    for (const o of orgs) {
        const { data } = await supabase.from('accounts').select('id').eq('organization_id', o).eq('type', 'ASSET').eq('code', 'QB-1').maybeSingle();
        if (data) uncat.set(o, data.id);
    }

    const misposted: { id: string; wallet: string }[] = [];
    for (const w of wallets) {
        const { data: entries } = await supabase.from('cashbook_entries').select('id, debit, credit, status').eq('account_type', w.id);
        const live = (entries ?? []).filter((e: any) => e.status !== 'PENDING' && Math.abs(Number(e.debit) - Number(e.credit)) > 0.004);
        for (const part of chunk(live, 150)) {
            const ids = part.map((e: any) => e.id);
            const { data: js } = await supabase.from('journal_entries').select('id, source_id').eq('source_type', 'CASHBOOK').in('source_id', ids);
            const jIds = (js ?? []).map((j: any) => j.id);
            const lines: any[] = [];
            for (const jp of chunk(jIds, 150)) lines.push(...((await supabase.from('journal_lines').select('journal_entry_id, account_id').in('journal_entry_id', jp)).data ?? []));
            const entryOf = new Map((js ?? []).map((j: any) => [j.id, j.source_id]));
            const accountsOf = new Map<string, Set<string>>();
            for (const l of lines) { const e = entryOf.get(l.journal_entry_id)!; (accountsOf.get(e) ?? accountsOf.set(e, new Set()).get(e)!).add(l.account_id); }
            for (const e of part) {
                const set = accountsOf.get(e.id);
                const t = target.get(w.id);
                if (t && set && !set.has(t) && uncat.get(w.organization_id) && set.has(uncat.get(w.organization_id)!)) misposted.push({ id: e.id, wallet: w.name });
            }
        }
    }
    console.log(`\n${noAccount} wallets without a chart account · ${misposted.length} entries posted to Uncategorised Asset instead of their wallet`);
    if (apply) { for (const m of misposted) await ledgerService.repostForCashbookEntry(m.id); console.log(`re-posted ${misposted.length}`); }
    else console.log('(dry run: nothing changed)');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
