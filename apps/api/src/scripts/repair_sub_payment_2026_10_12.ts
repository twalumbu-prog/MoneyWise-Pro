/** One-off: fix the first wallet subscription payment (INV-202607-E359C8): duplicate Twalumbu debit + uncategorised Blue Opus inflow. */
import { supabase } from '../lib/supabase';
import { ledgerService } from '../services/ledger.service';

const TW = 'e359c84e-b42b-4b0a-b422-a2074d87d83a', TW_MAIN = '627ed942-fc1f-432e-a3bd-223326ba4311';
const BO = 'fa99669d-6160-44fd-94ac-8ff1f065003f';
const REF = 'PG-SUB-1791790745013-519475';

async function main() {
    // 1. Neutralise (don't delete) our own debit — the sync already booked the real Lenco debit (945395fd…).
    const { data: mine } = await supabase.from('cashbook_entries').select('id, credit').eq('organization_id', TW).eq('external_reference', REF).maybeSingle();
    if (mine && Number(mine.credit) > 0) {
        const { error } = await supabase.from('cashbook_entries').update({
            credit: 0, debit: 0,
            description: `MoneyWise Subscription (INV-202607-E359C8) | Ref: ${REF} [neutralised — duplicate of Lenco-synced debit]`,
        }).eq('id', mine.id);
        if (error) throw new Error(error.message);
        const { error: rpcErr } = await supabase.rpc('recalculate_cashbook_balances', {
            p_organization_id: TW, p_target_date: '2000-01-01', p_target_created_at: '2000-01-01T00:00:00Z',
            p_account_type: 'MONEYWISE_WALLET', p_wallet_id: TW_MAIN,
        });
        if (rpcErr) throw new Error(rpcErr.message);
        console.log('Twalumbu duplicate neutralised + Main wallet balances recalculated');
    } else console.log('Twalumbu: nothing to neutralise');

    // 2. Categorise Blue Opus inflow as Subscription Revenue.
    const { data: acct } = await supabase.from('accounts').select('id').eq('organization_id', BO).ilike('name', 'Subscription Revenue').single();
    const { data: inflow } = await supabase.from('cashbook_entries').select('id, status').eq('organization_id', BO).eq('external_reference', '46e56379-6bd2-4bab-a8b4-c74ffd911518').single();
    if (acct && inflow && inflow.status !== 'ACCOUNTED') {
        await supabase.from('cashbook_entries').update({ account_id: acct.id, status: 'ACCOUNTED', description: `Subscription Payment | Ref: ${REF}` }).eq('id', inflow.id);
        await ledgerService.repostForCashbookEntry(inflow.id).catch(e => console.warn('GL repost:', e.message));
        console.log('Blue Opus inflow categorised as Subscription Revenue');
    }
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
