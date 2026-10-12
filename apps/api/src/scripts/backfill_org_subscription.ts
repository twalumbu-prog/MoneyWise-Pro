/**
 * Backfill an org's Premium subscription + missed monthly invoices.
 *
 *   ts-node src/scripts/backfill_org_subscription.ts <orgId> <firstPeriodStart YYYY-MM-DD> <invoiceCount> <grossZmw> [--apply]
 *
 * Dry-run unless --apply. Idempotent: periods that already have an invoice are skipped.
 * Creates PENDING invoices only — it never moves money (payment happens via the app's
 * "Pay from wallet" flow, which sweeps to the Blue Opus settlement merchant).
 */
import { supabase } from '../lib/supabase';

const addOneMonth = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const n = new Date(Date.UTC(y, m, 1));
    n.setUTCDate(Math.min(d, last));
    return n.toISOString().slice(0, 10);
};

async function main() {
    const [orgId, firstStart, countArg, grossArg] = process.argv.slice(2);
    const apply = process.argv.includes('--apply');
    const count = Number(countArg), gross = Number(grossArg);
    if (!orgId || !firstStart || !count || !gross) throw new Error('usage: <orgId> <firstPeriodStart> <invoiceCount> <grossZmw> [--apply]');

    const { data: sub } = await supabase.from('organization_subscriptions').select('*').eq('organization_id', orgId).single();
    if (!sub) throw new Error('No subscription row for org');

    const periods: { start: string; end: string }[] = [];
    let start = firstStart;
    for (let i = 0; i < count; i++) { const end = addOneMonth(start); periods.push({ start, end }); start = end; }
    const current = periods[periods.length - 1];
    const short = orgId.replace(/-/g, '').slice(0, 6).toUpperCase();
    const today = new Date().toISOString().slice(0, 10);

    console.log(`${apply ? 'APPLY' : 'DRY-RUN'} org ${orgId}: plan ${sub.plan_id} -> premium, current period ${current.start}..${current.end}`);
    for (const p of periods) console.log(`  invoice INV-${p.start.slice(0, 4)}${p.start.slice(5, 7)}-${short}  ${p.start}..${p.end}  K${gross}  due ${p.end}`);
    if (!apply) return;

    const { error: subErr } = await supabase.from('organization_subscriptions').update({
        plan_id: 'premium',
        current_period_start: current.start,
        current_period_end: current.end,
        fee_credits_zmw: 0,
        status: periods.some(p => p.end < today) ? 'past_due' : 'active',
        updated_at: new Date().toISOString(),
    }).eq('id', sub.id);
    if (subErr) throw new Error(subErr.message);

    for (const p of periods) {
        const { data: existing } = await supabase.from('subscription_invoices').select('id').eq('subscription_id', sub.id).eq('period_start', p.start).maybeSingle();
        if (existing) { console.log(`  skip ${p.start} (exists)`); continue; }
        const { error } = await supabase.from('subscription_invoices').insert({
            organization_id: orgId, subscription_id: sub.id,
            invoice_number: `INV-${p.start.slice(0, 4)}${p.start.slice(5, 7)}-${short}`,
            period_start: p.start, period_end: p.end,
            gross_zmw: gross, credits_zmw: 0, net_zmw: gross,
            status: 'pending', due_date: p.end,
        });
        if (error) throw new Error(`${p.start}: ${error.message}`);
        console.log(`  created ${p.start}`);
    }
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
