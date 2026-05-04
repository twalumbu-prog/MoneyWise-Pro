import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from apps/api/.env
dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function repairStuckRequisitions() {
    console.log('--- Starting Requisition Repair ---');

    // 1. Fetch all CHANGE_SUBMITTED or COMPLETED requisitions missing vouchers
    const { data: requisitions, error } = await supabase
        .from('requisitions')
        .select('*, disbursements(*), line_items(*)')
        .in('status', ['CHANGE_SUBMITTED', 'COMPLETED']);

    if (error) {
        console.error('Error fetching requisitions:', error);
        return;
    }

    console.log(`Found ${requisitions?.length || 0} requisitions in CHANGE_SUBMITTED state.`);

    if (!requisitions || requisitions.length === 0) {
        console.log('No work to do.');
        return;
    }

    for (const req of requisitions) {
        console.log(`\nProcessing Requisition: ${req.id} (${req.description})`);
        
        try {
            const disbursement = req.disbursements?.[0];
            const organizationId = req.organization_id;

            // Step A: Ensure Disbursement Record exists
            if (!disbursement) {
                console.log('  [!] Missing disbursement record. Creating recovery record...');
                const { data: newDisb, error: disbError } = await supabase
                    .from('disbursements')
                    .insert({
                        requisition_id: req.id,
                        organization_id: organizationId,
                        total_prepared: req.estimated_total,
                        payment_method: 'CASH',
                        cashier_id: req.requestor_id, // Fallback
                        // status: 'DISBURSED' // REMOVED: status column doesn't exist in disbursements
                    })
                    .select()
                    .single();
                
                if (disbError) throw new Error(`Failed to create recovery disbursement: ${disbError.message}`);
                console.log(`  [+] Recovery disbursement created: ${newDisb.id}`);
            }

            // Step B: Ensure Voucher exists
            const { data: existingVoucher } = await supabase
                .from('vouchers')
                .select('id')
                .eq('requisition_id', req.id)
                .maybeSingle();

            if (!existingVoucher) {
                console.log('  [!] Missing voucher. Creating voucher...');
                const actualExpenditure = req.line_items?.reduce((acc: number, item: any) => acc + (item.actual_amount ?? item.estimated_amount ?? 0), 0) || req.estimated_total;
                const voucherRef = `REPAIR-PV-${req.reference_number || req.id.slice(0, 6)}`;
                
                const { data: voucher, error: vError } = await supabase
                    .from('vouchers')
                    .insert({
                        requisition_id: req.id,
                        organization_id: organizationId,
                        reference_number: voucherRef,
                        total_credit: actualExpenditure,
                        total_debit: actualExpenditure,
                        status: 'DRAFT',
                        created_by: req.requestor_id // FIX: Set created_by
                    })
                    .select()
                    .single();
                
                if (vError) console.error(`  [!] Warning: Failed to create voucher: ${vError.message}`);
                else console.log(`  [+] Voucher created: ${voucher.id}`);
            }

            // Step C: Force move to COMPLETED
            console.log('  [>] Moving status to COMPLETED...');
            const { error: updateError } = await supabase
                .from('requisitions')
                .update({ 
                    status: 'COMPLETED',
                    updated_at: new Date().toISOString()
                })
                .eq('id', req.id);

            if (updateError) throw updateError;
            console.log('  [OK] Repair complete.');

        } catch (err: any) {
            console.error(`  [ERR] Failed to repair ${req.id}:`, err.message);
        }
    }

    console.log('\n--- Repair Process Finished ---');
}

repairStuckRequisitions();
