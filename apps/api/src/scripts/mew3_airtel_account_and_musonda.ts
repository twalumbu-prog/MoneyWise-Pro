/**
 * One-off (MEW3 Apartments, 21 Nov 2026):
 *  1. create the org's "Airtel Money" ASSET account (code AIRTEL-MONEY) and move every Airtel Money journal line off
 *     the Uncategorised Asset (QB-1) fallback onto it;
 *  2. book Musonda Machiko's two extension payments (wallet deposits CR-2026-0074 / CR-2026-0076) as Airtel Money sales
 *     and link each to its deposit as a transfer with the collection fee (gross − deposit).
 * The gross amounts are ESTIMATES (Lenco's collection record for these references is not retrievable): deposit + ~1% fee, rounded.
 *   npx ts-node --transpile-only src/scripts/mew3_airtel_account_and_musonda.ts --apply
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { recordManualSale } from '../services/manualSale.service';
import { linkDepositTransfer } from '../services/depositTransfer.service';

const ORG = '73937936-5b95-4351-b5a8-174563362173';
const EXTENSIONS = [
    { ref: 'manual:mew3:2026-11-19:musonda-ext-1', date: '2026-11-19', gross: 445, deposit: 'CR-2026-0074', label: 'extension paid 19 Nov' },
    { ref: 'manual:mew3:2026-11-20:musonda-ext-2', date: '2026-11-20', gross: 965, deposit: 'CR-2026-0076', label: 'extension paid 20 Nov' },
];

async function main() {
    if (!process.argv.includes('--apply')) { console.log('Add --apply to write to production.'); return; }

    // 1. Airtel Money account
    let { data: airtel } = await supabase.from('accounts').select('id').eq('organization_id', ORG).eq('code', 'AIRTEL-MONEY').maybeSingle();
    if (!airtel) {
        const ins = await supabase.from('accounts').insert({ organization_id: ORG, code: 'AIRTEL-MONEY', name: 'Airtel Money', type: 'ASSET', subtype: 'Bank', description: 'Airtel Money (mobile money) collected before it is transferred into the MoneyWise wallet.' }).select('id').single();
        if (ins.error) throw ins.error;
        airtel = ins.data; console.log('created Airtel Money account', airtel!.id);
    } else console.log('Airtel Money account exists', airtel.id);
    const airtelId = airtel!.id;
    const { data: qb1 } = await supabase.from('accounts').select('id').eq('organization_id', ORG).eq('code', 'QB-1').eq('type', 'ASSET').single();

    // 2. Musonda extensions (posts straight to the new account)
    const { data: income } = await supabase.from('accounts').select('id').eq('organization_id', ORG).eq('code', '4000').single();
    for (const e of EXTENSIONS) {
        const { data: have } = await supabase.from('api_sales').select('id, status').eq('organization_id', ORG).eq('external_reference', e.ref).maybeSingle();
        if (!have) {
            const claim = await supabase.from('api_sales').insert({ organization_id: ORG, external_reference: e.ref, status: 'PENDING' }).select('id').single();
            if (claim.error) throw claim.error;
            const r = await recordManualSale({
                organizationId: ORG, userId: null,
                items: [{ custom: true, name: `Accommodation – Musonda Machiko (Room 7, ${e.label})`, income_account_id: income!.id, quantity: 1, price: e.gross }],
                amount: e.gross, paymentDate: e.date, accountType: 'AIRTEL_MONEY', methodLabel: 'Airtel Money',
                customerName: 'Mr Musonda Machiko', customerPhone: '0974721820', reference: e.ref,
            });
            await supabase.from('api_sales').update({ status: 'COMPLETED', receipt_number: r.referenceNumber, amount: r.amount, sale_date: r.date, account_type: r.accountType, entry_ids: r.entryIds, completed_at: new Date().toISOString() }).eq('id', claim.data.id);
            console.log(`sale ${e.ref}: ${r.referenceNumber} K${r.amount} on ${r.date}`);
        } else console.log('sale exists', e.ref, have.status);
        const l = await linkDepositTransfer({ organizationId: ORG, saleExternalReference: e.ref, depositReference: e.deposit, dryRun: false });
        console.log(`  linked ${e.deposit}: gross K${l.transfer.gross_amount} net K${l.transfer.net_amount} fee K${l.transfer.fee_amount} [${l.created ? 'CREATED' : 'already linked'}]`);
    }

    // 3. Move every Airtel Money journal line off Uncategorised Asset
    const { data: cb } = await supabase.from('cashbook_entries').select('id').eq('organization_id', ORG).eq('account_type', 'AIRTEL_MONEY');
    const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', ORG).in('source_id', (cb ?? []).map(c => c.id));
    const moved = await supabase.from('journal_lines').update({ account_id: airtelId }).eq('account_id', qb1!.id).in('journal_entry_id', (je ?? []).map(j => j.id)).select('id');
    if (moved.error) throw moved.error;
    console.log(`moved ${moved.data?.length} journal lines from Uncategorised Asset to Airtel Money`);
}
main().then(() => process.exit()).catch(e => { console.error('FAILED', e); process.exit(1); });
