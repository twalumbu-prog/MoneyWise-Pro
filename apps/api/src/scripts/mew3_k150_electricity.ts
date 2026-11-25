/**
 * One-off (MEW3, 23 Nov 2026): the K150 line "Main house" on requisition #55925022 was for electricity, not a drawing.
 * Corrects MEW3-CORR-11 (which booked it to Owner's Drawings): Dr Utilities / Cr Owner's Drawings.
 *   npx ts-node --transpile-only src/scripts/mew3_k150_electricity.ts --apply
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { createManualJournal } from '../services/journalEntry.service';
const ORG = '73937936-5b95-4351-b5a8-174563362173';
const code = async (c: string) => (await supabase.from('accounts').select('id').eq('organization_id', ORG).eq('code', c).single()).data!.id as string;
(async () => {
    if (!process.argv.includes('--apply')) { console.log('Add --apply'); return; }
    const dup = await supabase.from('journal_entries').select('id').eq('organization_id', ORG).eq('source_type', 'MANUAL').ilike('description', '%Main house%was electricity%').limit(1);
    if (dup.data?.length) { console.log('already posted'); return; }
    const r: any = await createManualJournal(ORG, null, { date: '2026-11-21', reference: 'MEW3-CORR-13', description: 'Correction of MEW3-CORR-11: requisition #55925022 line "Main house" K150 was electricity (confirmed by the owner), not a drawing: move from Owner\'s Drawings to Utilities', lines: [{ account_id: await code('6400'), debit: 150 }, { account_id: await code('3200'), credit: 150 }] });
    console.log('posted', r?.reference_number ?? '');
})().then(() => process.exit()).catch(e => { console.error('FAILED', e.message ?? e); process.exit(1); });
