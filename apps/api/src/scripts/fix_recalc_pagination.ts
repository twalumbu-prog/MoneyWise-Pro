/**
 * fix_recalc_pagination.ts
 *
 * The balance-recalc step in backfill_masterfees_date_bug.ts used an
 * unpaginated select (default 1000-row cap), so two chains with more than
 * 1000 entries (MASTERFEES_MANUAL: 1753, b3184aed-...-6d78bbc966: 1014) only
 * had their first 1000 rows' balance_after recomputed. Redo those two chains
 * in full, paginated, from scratch - idempotent, safe to rerun.
 */
import { supabase } from '../lib/supabase';

const ORG_ID = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
const CHAINS = ['MASTERFEES_MANUAL', 'b3184aed-8806-46ec-9723-0625256f9866'];

async function fetchAll(accountType: string) {
    const rows: any[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from('cashbook_entries')
            .select('id, date, created_at, debit, credit')
            .eq('organization_id', ORG_ID)
            .eq('account_type', accountType)
            .is('wallet_id', null)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE) break;
    }
    return rows;
}

async function main() {
    for (const accountType of CHAINS) {
        const rows = await fetchAll(accountType);
        console.log(`${accountType}: ${rows.length} entries fetched, recalculating...`);
        let running = 0;
        let errors = 0;
        for (const r of rows) {
            running += Number(r.debit || 0) - Number(r.credit || 0);
            const { error } = await supabase
                .from('cashbook_entries')
                .update({ balance_after: Math.round(running * 100) / 100 })
                .eq('id', r.id);
            if (error) errors++;
        }
        console.log(`  Done. ${rows.length} recalculated${errors ? `, ${errors} errors` : ''}. Final balance K${running.toFixed(2)}`);
    }
}

main().then(() => process.exit(0)).catch(err => { console.error('Fatal:', err); process.exit(1); });
