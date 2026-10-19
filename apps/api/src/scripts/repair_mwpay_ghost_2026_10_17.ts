/** One-off: neutralise the ghost MoneyWise Pay K100 (Stephen -> Charley, 2026-10-17) that never moved at Lenco. */
import { supabase } from '../lib/supabase';
import { ledgerService } from '../services/ledger.service';

const REQ = '1cf3703c-1b8d-4abb-a017-a95ec0e93fb2';
const SENDER = 'c57c7c11-d5d0-4855-95e1-eef3745563b9';
const RECIPIENT = '8b9476c0-a79a-4678-a9cd-63aeeb04d70f';
const NOTE = ' [neutralised — transfer never reached Lenco]';

async function recalc(org: string, walletId: string | null) {
    const { error } = await supabase.rpc('recalculate_cashbook_balances', {
        p_organization_id: org, p_target_date: '2000-01-01', p_target_created_at: '2000-01-01T00:00:00Z',
        p_account_type: 'MONEYWISE_WALLET', p_wallet_id: walletId,
    });
    if (error) throw new Error(error.message);
}

async function main() {
    const { data: mine } = await supabase.from('cashbook_entries').select('id, debit, credit, wallet_id, description, entry_type')
        .eq('organization_id', SENDER).eq('requisition_id', REQ);
    const { data: theirs } = await supabase.from('cashbook_entries').select('id, debit, credit, wallet_id, description')
        .eq('organization_id', RECIPIENT).eq('reference_number', 'MWPAY-1cf3703c-MVC3KUD4');
    console.log('sender rows', mine, '\nrecipient rows', theirs);

    for (const [org, rows] of [[SENDER, mine || []], [RECIPIENT, theirs || []]] as const) {
        for (const r of rows as any[]) {
            if (Number(r.debit) === 0 && Number(r.credit) === 0) continue;
            const { error } = await supabase.from('cashbook_entries').update({ debit: 0, credit: 0, description: `${r.description || ''}${NOTE}` }).eq('id', r.id);
            if (error) throw new Error(error.message);
            await ledgerService.repostForCashbookEntry(r.id).catch((e: any) => console.warn('GL repost:', e.message));
            console.log(`neutralised ${org.slice(0, 8)} ${r.id}`);
        }
        for (const w of new Set((rows as any[]).map(r => r.wallet_id))) await recalc(org, w as string | null);
    }
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
