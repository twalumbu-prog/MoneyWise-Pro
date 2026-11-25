/**
 * One-off (MEW3 Apartments, 21 Nov 2026): reclassify the June–July test activity, director drawings, retained fees,
 * change returned, and a K10 fee over-statement, as dated MANUAL journals (the original postings are left untouched, so
 * the correction is visible and reversible). Idempotent on external_reference MEW3-CORR-n.
 *   npx ts-node --transpile-only src/scripts/mew3_ledger_corrections.ts --apply
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { createManualJournal } from '../services/journalEntry.service';

const ORG = '73937936-5b95-4351-b5a8-174563362173';
const apply = process.argv.includes('--apply');

async function account(code: string, name: string, type: 'EQUITY' | 'LIABILITY', subtype: string, description: string) {
    const { data } = await supabase.from('accounts').select('id').eq('organization_id', ORG).eq('code', code).maybeSingle();
    if (data) return data.id as string;
    if (!apply) return `__NEW__${code}`;
    const ins = await supabase.from('accounts').insert({ organization_id: ORG, code, name, type, subtype, description }).select('id').single();
    if (ins.error) throw ins.error;
    console.log(`created account ${code} ${name}`);
    return ins.data.id as string;
}
async function byCode(code: string) {
    const { data, error } = await supabase.from('accounts').select('id').eq('organization_id', ORG).eq('code', code).single();
    if (error) throw new Error(`account ${code}: ${error.message}`);
    return data.id as string;
}

async function main() {
    const drawings = await account('3200', "Owner's Drawings", 'EQUITY', 'Owner Drawings', 'Money taken out of the business by the owners/investors; reduces owners equity.');
    const feesPayable = await account('2800', 'Platform fees payable (MoneyWise)', 'LIABILITY', 'Other Current Liability', 'Customer-paid MoneyWise platform fees held in the wallet and not yet swept to MoneyWise.');
    const rev = await byCode('4000'), cap = await byCode('3000'), susp = await byCode('QB-SUSPENSE'), tc = await byCode('QB-28');
    const gs = await byCode('5000'), util = await byCode('6400'), other = await byCode('7100');

    const J = [
        { n: 1, date: '2026-06-18', description: "Reclassify Stephen Kapambwe's K650 test deposit (Room 4, REC-2026-0001): owner funds used for a demo, not revenue", lines: [{ account_id: rev, debit: 650 }, { account_id: cap, credit: 650 }] },
        { n: 2, date: '2026-06-26', description: 'Customer-paid MoneyWise platform fees (K11.70 + 0.01 + 0.56 + 0.01 + 4.11 = K16.39) retained in the wallet and never swept: hold as a liability to MoneyWise (CR-2026-0014 to 0018)', lines: [{ account_id: susp, debit: 16.39 }, { account_id: feesPayable, credit: 16.39 }] },
        { n: 3, date: '2026-07-02', description: "Refund of Stephen Kapambwe's test deposit (requisition #d83b4b6a, K635 principal; K12 fee stays in Transaction Charges): nets the K650 test deposit", lines: [{ account_id: cap, debit: 635 }, { account_id: susp, credit: 635 }] },
        { n: 4, date: '2026-07-21', description: 'Transfer of funds to director (requisition #7961f859, K385; K11 fee stays in Transaction Charges): investor drawings', lines: [{ account_id: drawings, debit: 385 }, { account_id: susp, credit: 385 }] },
        { n: 5, date: '2026-06-23', description: 'Requisition #56b31ea6 "for testing purposes" K63.50 (incl. K8.50 fee): owner drawing, not Guest Supplies / Utilities / fees', lines: [{ account_id: drawings, debit: 63.5 }, { account_id: gs, credit: 25 }, { account_id: util, credit: 30 }, { account_id: tc, credit: 8.5 }] },
        { n: 6, date: '2026-11-16', description: 'Change from operating expenses returned to the wallet (CR-2026-0070, K40): reduces Other Expenses (requisition #1474f599 "Operational Expenses")', lines: [{ account_id: susp, debit: 40 }, { account_id: other, credit: 40 }] },
        { n: 7, date: '2026-11-20', description: 'Requisition #beaf312d booked K21 of Transaction Charges; Lenco charged K11. Move the K10 excess to Other Expenses ("operating expenses")', lines: [{ account_id: other, debit: 10 }, { account_id: tc, credit: 10 }] },
    ];
    for (const j of J) {
        const ref = `MEW3-CORR-${j.n}`;
        const { data: have } = await supabase.from('journal_entries').select('id, reference_number').eq('organization_id', ORG).eq('external_reference', ref).maybeSingle();
        if (have) { console.log(ref, 'already posted as', have.reference_number); continue; }
        if (!apply) { console.log('PLAN', ref, j.date, j.description.slice(0, 80)); continue; }
        const r: any = await createManualJournal(ORG, null, { date: j.date, reference: ref, description: j.description, lines: j.lines });
        console.log(ref, 'posted', r?.reference_number ?? r?.id ?? '');
    }
}
main().then(() => process.exit()).catch(e => { console.error('FAILED', e.message ?? e); process.exit(1); });
