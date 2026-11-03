/**
 * One-off: MoneyWise Pay purchases made from a personal workspace by someone who is also a member of the business they paid were
 * skipped by the old "own business earns nothing" rule. A personal workspace is a separate entity, so they count. Re-runs the
 * (idempotent) award for those payments. Usage: npx tsx src/scripts/backfill_mwpay_rewards_2026_11_03.ts [--apply] [--only=MWPAY-xxxxxxxx]
 */
import { supabase } from '../lib/supabase';
import { rewardsService } from '../services/rewards.service';

const apply = process.argv.includes('--apply');
// --only=MWPAY-xxxxxxxx limits the run to one payment.
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

(async () => {
    const { data: personal } = await supabase.from('organizations').select('id').eq('is_personal', true);
    const personalIds = new Set((personal ?? []).map((o: any) => o.id));
    const { data: reqs } = await supabase.from('requisitions').select('id, organization_id, requestor_id, recipient_account, status')
        .eq('payment_method', 'MONEYWISE_PAY').eq('status', 'COMPLETED').not('recipient_account', 'is', null);
    let missing = 0, awarded = 0;
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const r of (reqs ?? []) as any[]) {
        if (!UUID.test(String(r.recipient_account))) continue;
        r.recipient_organization_id = r.recipient_account;
        if (!personalIds.has(r.organization_id) || personalIds.has(r.recipient_organization_id)) continue;
        const ref = `MWPAY-${String(r.id).slice(0, 8)}`;
        if (only && ref !== only) continue;
        // Only purchases (a pay link / store cart / e-invoice settled by this payment) — not loans or plain transfers to a business.
        const { data: link } = await supabase.from('payment_links').select('id').eq('reference', ref).limit(1);
        if (!link || link.length === 0) continue;
        const { data: have } = await supabase.from('reward_ledger').select('id').eq('ref', `MWP:${ref}`).limit(1);
        if (have && have.length) continue;
        const { data: inflow } = await supabase.from('cashbook_entries').select('debit, status').eq('organization_id', r.recipient_organization_id).eq('external_reference', ref).eq('entry_type', 'INFLOW').maybeSingle();
        if (!inflow || String((inflow as any).status).toUpperCase() === 'PENDING') continue;
        missing++;
        console.log(`${apply ? 'AWARD' : 'would award'} ${ref} user=${r.requestor_id} -> org=${r.recipient_organization_id} K${(inflow as any).debit}`);
        if (apply) {
            await rewardsService.awardMoneyWisePay({ requisitionId: r.id, recipientOrgId: r.recipient_organization_id, amount: Number((inflow as any).debit), ref });
            awarded++;
        }
    }
    console.log(`${missing} payment(s) missing points; ${awarded} awarded.`);
    process.exit(0);
})();
