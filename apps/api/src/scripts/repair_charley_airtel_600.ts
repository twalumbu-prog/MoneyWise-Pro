/** One-off: neutralise Charley's mistaken manual K600 Airtel Money inflow (CR-2026-0001); the real deposit is DEP-1791388167567. */
import { supabase } from '../lib/supabase';
import { ledgerService } from '../services/ledger.service';

const ORG = '8b9476c0-a79a-4678-a9cd-63aeeb04d70f';
async function main() {
    const { data: r } = await supabase.from('cashbook_entries').select('id, debit, credit, description, account_type')
        .eq('organization_id', ORG).eq('reference_number', 'CR-2026-0001').eq('account_type', 'AIRTEL_MONEY').maybeSingle();
    if (!r) { console.log('row not found'); return; }
    if (Number(r.debit) === 0 && Number(r.credit) === 0) { console.log('already neutralised'); return; }
    const { error } = await supabase.from('cashbook_entries').update({ debit: 0, credit: 0, description: `${r.description} [neutralised — mistaken manual entry; real deposit is DEP-1791388167567]` }).eq('id', r.id);
    if (error) throw new Error(error.message);
    await ledgerService.repostForCashbookEntry(r.id).catch((e: any) => console.warn('GL repost:', e.message));
    const { error: e2 } = await supabase.rpc('recalculate_cashbook_balances', { p_organization_id: ORG, p_target_date: '2000-01-01', p_target_created_at: '2000-01-01T00:00:00Z', p_account_type: 'AIRTEL_MONEY', p_wallet_id: null });
    if (e2) console.warn('recalc:', e2.message);
    console.log('neutralised', r.id);
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
