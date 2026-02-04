
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { cashbookService } from '../services/cashbook.service';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function repair() {
    try {
        console.log('Starting ledger repair for missing entries...');

        // 1. Find requisitions that are RECEIVED/COMPLETED but have no DISBURSEMENT ledger entry
        const { data: reqs, error: reqError } = await supabase
            .from('requisitions')
            .select('id, status, description, actual_total, disbursements(*)')
            .in('status', ['RECEIVED', 'CHANGE_SUBMITTED', 'COMPLETED']);

        if (reqError) throw reqError;

        for (const r of reqs) {
            const { data: entries } = await supabase
                .from('cashbook_entries')
                .select('id')
                .eq('requisition_id', r.id)
                .eq('entry_type', 'DISBURSEMENT');

            if (!entries || entries.length === 0) {
                console.log(`Repairing missing entry for Req: ${r.id.slice(0, 8)} (${r.status})`);

                const disbursement = (r.disbursements as any)?.[0];
                const voucherResult = await supabase.from('vouchers').select('reference_number').eq('requisition_id', r.id).single();
                const voucherNumber = voucherResult.data?.reference_number;

                const actualExpenditure = parseFloat(r.actual_total || 0);
                // If it's just RECEIVED, we don't have discrepancy yet, but let's just log the disbursement
                // If it's COMPLETED, we use the confirmed discrepancy
                const discrepancy = parseFloat(disbursement?.discrepancy_amount || 0);

                await cashbookService.finalizeDisbursement(
                    r.id,
                    actualExpenditure,
                    discrepancy,
                    voucherNumber
                );

                console.log(`✅ Repaired ${r.id.slice(0, 8)}`);
            }
        }

        console.log('Repair process complete!');
    } catch (err) {
        console.error(err);
    }
}

repair();
