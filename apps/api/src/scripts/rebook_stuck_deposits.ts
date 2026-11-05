/**
 * Books in-app deposits that Lenco reports as paid but whose PENDING intent was never finalised —
 * whatever their age. The automations-tick sweep only looks back 24 h; this is for incidents that
 * outlast that window (e.g. Twalumbu, 31 Oct – 2 Nov 2026: CR numbers past 9999 truncated to 4
 * digits, so every finalisation collided with an August receipt — see migration
 * 20261102150000_reference_numbers_past_9999.sql, which must be applied first).
 *
 *   npx ts-node --transpile-only src/scripts/rebook_stuck_deposits.ts --org <organization uuid> [--since 2026-10-31] [--dry-run]
 *
 * Read-only on Lenco; only ever finalises (never deletes) intents, through the same finaliser the
 * webhook uses, so re-running it is safe.
 */
import { supabase } from '../lib/supabase';
import { finalizeIfPaid } from '../services/collectionRecovery.service';

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
    const orgId = arg('org');
    const since = arg('since') || '2026-10-31';
    const dryRun = process.argv.includes('--dry-run');
    if (!orgId) throw new Error('--org <organization uuid> is required');

    // Refuse to run against the unfixed generator: it would just collide again and burn more numbers.
    const { data: counter } = await supabase.from('reference_counters').select('last_value')
        .eq('organization_id', orgId).eq('entity_type', 'INFLOW').eq('year', new Date().getUTCFullYear()).maybeSingle();
    if (!dryRun && counter && Number((counter as any).last_value) >= 10000) {
        const { data: probe, error } = await supabase.rpc('generate_sequential_reference', { p_org_id: orgId, p_entity_type: 'INFLOW', p_prefix: 'CR' });
        if (error) throw new Error(`generate_sequential_reference failed: ${error.message}`);
        const n = Number(/-(\d+)$/.exec(String(probe))?.[1] ?? 0);
        if (n < 10000) throw new Error(`generator still truncates (got ${probe}) — apply 20261102150000_reference_numbers_past_9999.sql first`);
        console.log(`Generator OK (probe ${probe}; that number is now an unused gap).`);
    }

    const { data: intents, error } = await supabase
        .from('cashbook_entries')
        .select('id, external_reference, debit, description, created_at')
        .eq('organization_id', orgId)
        .eq('status', 'PENDING')
        .like('description', 'PENDING_INTENT%')
        .gt('debit', 0)
        .gte('created_at', since)
        .or('external_reference.like.DEP-%,external_reference.like.CHG-%')
        .order('created_at');
    if (error) throw new Error(error.message);

    console.log(`${intents?.length ?? 0} pending deposit intent(s) since ${since}${dryRun ? ' (dry run)' : ''}`);
    for (const row of intents || []) {
        const label = `${row.created_at.slice(0, 16)}  K${row.debit}  ${String(row.description).slice(16, 80)}`;
        if (dryRun) { console.log(`  would check  ${label}`); continue; }
        const outcome = await finalizeIfPaid(row.external_reference!, orgId).catch(() => 'unknown');
        const { data: booked } = await supabase.from('cashbook_entries').select('reference_number')
            .eq('id', row.id).neq('status', 'PENDING').maybeSingle();
        console.log(`  ${outcome.padEnd(9)} ${booked?.reference_number ?? '-'}  ${label}`);
    }
}

main().then(() => process.exit(0), (e) => { console.error(e.message || e); process.exit(1); });
