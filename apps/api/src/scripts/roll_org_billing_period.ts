/** Roll an org's elapsed billing periods + issue the invoices. Usage: ts-node roll_org_billing_period.ts <orgId> [--apply]. Never moves money. */
import { supabase } from '../lib/supabase';
import { rollElapsedPeriods, refreshSubscriptionStatus } from '../controllers/billing.controller';

(async () => {
    const orgId = process.argv[2];
    const apply = process.argv.includes('--apply');
    const { data: sub } = await supabase.from('organization_subscriptions').select('*').eq('organization_id', orgId).single();
    console.log(`${apply ? 'APPLY' : 'DRY'}: period ${sub.current_period_start}..${sub.current_period_end}, status ${sub.status}`);
    if (!apply) return;
    const r = await rollElapsedPeriods(sub);
    await refreshSubscriptionStatus(r.sub.id);
    console.log(`closed ${r.closed}; now ${r.sub.current_period_start}..${r.sub.current_period_end}`);
    const { data: inv } = await supabase.from('subscription_invoices').select('invoice_number,period_start,period_end,gross_zmw,net_zmw,status,due_date').eq('subscription_id', sub.id).order('period_start');
    console.table(inv);
    process.exit(0);
})();
