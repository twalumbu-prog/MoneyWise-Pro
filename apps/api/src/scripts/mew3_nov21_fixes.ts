/**
 * One-off (MEW3 Apartments, 23 Nov 2026), after the 21-22 Nov transactions:
 *  1. receipt #159 (REC-2026-0089): the guest is "Miss Sarah", and the sale belongs on 20 Nov (the invoice date);
 *  2. requisition #55925022 line "Main house" K150 (no account, sat in Suspense) -> Owner's Drawings (MEW3-CORR-11);
 *  3. CR-2026-0091 K54 "Change from shopping" -> reduces Guest Supplies (MEW3-CORR-12);
 *  4. reverse MEW3-CORR-7: the K10 "airtel withdraw charge" on #beaf312d is a real Airtel cash-out charge the requester
 *     entered, not a Lenco over-statement, so it belongs in Transaction Charges (the Lenco withdrawal fees all match).
 *   npx ts-node --transpile-only src/scripts/mew3_nov21_fixes.ts --apply
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { createManualJournal, reverseManualJournal } from '../services/journalEntry.service';

const ORG = '73937936-5b95-4351-b5a8-174563362173';
const code = async (c: string) => (await supabase.from('accounts').select('id').eq('organization_id', ORG).eq('code', c).single()).data!.id as string;
const posted = async (needle: string) => !!(await supabase.from('journal_entries').select('id').eq('organization_id', ORG).eq('source_type', 'MANUAL').ilike('description', `%${needle}%`).limit(1)).data?.length;

async function main() {
    if (!process.argv.includes('--apply')) { console.log('Add --apply to write.'); return; }
    // 1. Miss Sarah, 20 Nov
    const { data: e } = await supabase.from('cashbook_entries').select('id, description').eq('organization_id', ORG).eq('reference_number', 'REC-2026-0089').single();
    const desc = e!.description.replace(/Musa Sarah/g, 'Miss Sarah');
    await supabase.from('cashbook_entries').update({ date: '2026-11-20', description: desc, sender_name: 'Miss Sarah' }).eq('id', e!.id);
    await supabase.from('journal_entries').update({ entry_date: '2026-11-20', description: desc }).eq('source_id', e!.id);
    await supabase.from('api_sales').update({ sale_date: '2026-11-20' }).eq('organization_id', ORG).eq('external_reference', 'kaizen:mew3:2026-11-21:r159');
    const rc = await supabase.rpc('recalculate_cashbook_balances', { p_organization_id: ORG, p_target_date: '2000-01-01', p_target_created_at: '2000-01-01T00:00:00Z', p_account_type: 'AIRTEL_MONEY', p_wallet_id: null });
    console.log('REC-2026-0089 -> Miss Sarah, 20 Nov; Airtel recalculated', rc.error?.message ?? 'ok');

    // 2-3. journals
    const susp = await code('QB-SUSPENSE'), drawings = await code('3200'), gs = await code('5000');
    if (!(await posted('Main house'))) { const r: any = await createManualJournal(ORG, null, { date: '2026-11-21', reference: 'MEW3-CORR-11', description: 'Requisition #55925022 "Expenses and drawings", line "Main house" K150 had no account: owner drawing', lines: [{ account_id: drawings, debit: 150 }, { account_id: susp, credit: 150 }] }); console.log('CORR-11', r?.reference_number ?? ''); } else console.log('CORR-11 exists');
    if (!(await posted('Change from shopping'))) { const r: any = await createManualJournal(ORG, null, { date: '2026-11-21', reference: 'MEW3-CORR-12', description: 'Change from shopping returned to the wallet (CR-2026-0091, K54): reduces Guest Supplies (requisition #55925022)', lines: [{ account_id: susp, debit: 54 }, { account_id: gs, credit: 54 }] }); console.log('CORR-12', r?.reference_number ?? ''); } else console.log('CORR-12 exists');

    // 4. reverse CORR-7
    const { data: j7 } = await supabase.from('journal_entries').select('id, reference_number').eq('organization_id', ORG).eq('source_type', 'MANUAL').ilike('description', '%Requisition #beaf312d booked K21%').maybeSingle();
    if (!j7) throw new Error('CORR-7 journal not found');
    if (!(await posted('Reversal of') )) { const r: any = await reverseManualJournal(ORG, null, j7.id, '2026-11-20'); console.log('reversed', j7.reference_number, '->', r?.reference_number ?? ''); } else console.log('reversal exists');
}
main().then(() => process.exit()).catch(e => { console.error('FAILED', e.message ?? e); process.exit(1); });
