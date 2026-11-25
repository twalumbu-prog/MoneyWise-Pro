/**
 * One-off (MEW3 Apartments, 21 Nov 2026):
 *  1. reclassify the K58 of test deposits left in Other Revenue to Owner's Capital (manual journals MEW3-CORR-8..10);
 *  2. add Allan Ngondwe to the CRM and hold his K737.50 reservation advance (CR-2026-0075) as an UNAPPLIED customer
 *     payment: the inflow is classified to Accounts Receivable with no invoice allocation, which is the platform's own
 *     prepayment model (Dr Wallet / Cr AR). When his invoice is raised, "Apply payment" on that inflow settles it.
 *   npx ts-node --transpile-only src/scripts/mew3_prepayment_and_test_deposits.ts --apply
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { createManualJournal } from '../services/journalEntry.service';
import { allocatePayment, ensureCustomer } from '../services/customerInvoice.service';

const ORG = '73937936-5b95-4351-b5a8-174563362173';
const ENTRY = '91b2aed9-84d7-45fd-af49-11494643ed7e'; // CR-2026-0075
const apply = process.argv.includes('--apply');
const code = async (c: string) => (await supabase.from('accounts').select('id').eq('organization_id', ORG).eq('code', c).single()).data!.id as string;

async function main() {
    if (!apply) { console.log('Add --apply to write.'); return; }
    const rev = await code('4100'), cap = await code('3000');
    const J = [
        { n: 8, date: '2026-06-23', amt: 56, d: 'Test deposits 23 Jun (CR-2026-0002 K1 "booking for room 1", CR-2026-0003 K55 "refund for test"): owner funds, not revenue' },
        { n: 9, date: '2026-06-26', amt: 1, d: 'Test deposit 26 Jun (CR-2026-0006 K1): owner funds, not revenue' },
        { n: 10, date: '2026-08-07', amt: 1, d: 'Test deposit 7 Aug (CR-2026-0013 K1 "Buying Products/Services"): owner funds, not revenue' },
    ];
    for (const j of J) {
        const ref = `MEW3-CORR-${j.n}`;
        const { data: have } = await supabase.from('journal_entries').select('reference_number').eq('organization_id', ORG).eq('external_reference', ref).maybeSingle();
        if (have) { console.log(ref, 'already posted'); continue; }
        const r: any = await createManualJournal(ORG, null, { date: j.date, reference: ref, description: j.d, lines: [{ account_id: rev, debit: j.amt }, { account_id: cap, credit: j.amt }] });
        console.log(ref, 'posted', r?.reference_number ?? '');
    }

    // Customer + prepayment
    const c = await ensureCustomer(ORG, { name: 'Allan Ngondwe' });
    console.log('customer', c.id, c.created ? 'ADDED to CRM' : 'already in CRM');
    const prepay = { amount: 737.5, received: '2026-11-19', cashbook_entry_id: ENTRY, receipt: 'CR-2026-0075', reference: 'DEP-1795108187990-258705c1-PUB', purpose: 'Advance payment for reservation', status: 'UNAPPLIED' };
    const { data: cur } = await supabase.from('customers').select('notes, metadata').eq('id', c.id).single();
    const note = 'PREPAYMENT K737.50 received 19 Nov 2026 (CR-2026-0075, advance payment for reservation). Held as unapplied customer credit; when his invoice is raised, open the inflow CR-2026-0075 and use Apply payment to settle it.';
    await supabase.from('customers').update({ notes: cur?.notes?.includes('PREPAYMENT') ? cur.notes : [cur?.notes, note].filter(Boolean).join('\n'), metadata: { ...(cur?.metadata ?? {}), prepayment: prepay }, updated_at: new Date().toISOString() }).eq('id', c.id);

    const r = await allocatePayment(ORG, null, ENTRY, []);
    console.log(`prepayment held: applied K${r.applied}, unapplied K${r.unapplied}`);
}
main().then(() => process.exit()).catch(e => { console.error('FAILED', e.message ?? e); process.exit(1); });
