/**
 * READ-ONLY audit: for every ledger chain (org + account_type + wallet) verify that
 *   1. no two rows share (date, created_at)  — ties make the running balance ambiguous, and
 *   2. every stored balance_after equals the running sum of debit - credit (PENDING excluded).
 *
 * Usage: npx ts-node apps/api/src/scripts/audit_cashbook_chains.ts
 *
 * Note: a chain can legitimately differ if it was opened from a non-zero balance or
 * neutralised by a reconciliation; treat mismatches as leads, then confirm against Lenco.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('cashbook_entries')
            .select('id,organization_id,account_type,wallet_id,date,created_at,debit,credit,balance_after,status')
            .order('id').range(from, from + 999);
        if (error) throw error;
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < 1000) break;
    }

    const chains = new Map<string, any[]>();
    for (const r of rows) {
        const k = `${r.organization_id}|${r.account_type}|${r.wallet_id || 'null'}`;
        (chains.get(k) || chains.set(k, []).get(k)!).push(r);
    }

    let bad = 0;
    for (const [k, list] of chains) {
        list.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1);
        const seen = new Set<string>();
        let tied = 0, mismatched = 0, run = 0, first = '';
        for (const r of list) {
            const t = r.date + r.created_at;
            if (seen.has(t)) tied++;
            seen.add(t);
            if (r.status === 'PENDING') continue;
            run += Number(r.debit || 0) - Number(r.credit || 0);
            if (Math.abs(run - Number(r.balance_after)) > 0.005) { mismatched++; first ||= `${r.date} ${r.created_at.slice(11, 19)}`; }
        }
        if (tied || mismatched) {
            bad++;
            const last = [...list].reverse().find(r => r.status !== 'PENDING');
            console.log(`${k}\n   rows ${list.length} | tied ${tied} | mismatched ${mismatched}${first ? ` (first ${first})` : ''} | true end ${run.toFixed(2)} vs stored ${last?.balance_after}`);
        }
    }
    console.log(`\n${chains.size} chains audited, ${bad} need attention.`);
})();
