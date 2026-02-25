import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { emailService } from '../services/email.service';

export const disburseRequisition = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const { denominations, total_prepared, payment_method, transfer_proof_url } = req.body;
        const cashier_id = (req as any).user.id;

        // 1. Verify Requisition is APPROVED
        // Using single() to get one record
        const { data: requisition, error: reqError } = await supabase
            .from('requisitions')
            .select('status, estimated_total')
            .eq('id', id)
            .single();

        if (reqError || !requisition) {
            return res.status(404).json({ error: 'Requisition not found' });
        }

        if (requisition.status !== 'AUTHORISED') {
            return res.status(400).json({ error: 'Requisition must be AUTHORISED to disburse' });
        }

        // 2. Validate Disbursement Amount
        const estimatedTotal = Number(requisition.estimated_total);
        if (total_prepared < estimatedTotal) {
            return res.status(400).json({
                error: `Disbursement amount (K${total_prepared}) cannot be less than the authorized amount (K${estimatedTotal})`
            });
        }

        // 3. Create Disbursement Record
        const { data: disbursementData, error: disbError } = await supabase
            .from('disbursements')
            .insert({
                requisition_id: id,
                cashier_id: cashier_id,
                total_prepared: total_prepared,
                payment_method: payment_method || 'CASH',
                transfer_proof_url: transfer_proof_url,
                denominations: denominations // Supabase handles JSON automatically
            })
            .select('id')
            .single();

        if (disbError) throw disbError;

        // 3. Update Requisition Status to DISBURSED
        const { error: updateError } = await supabase
            .from('requisitions')
            .update({ status: 'DISBURSED', updated_at: new Date().toISOString() })
            .eq('id', id);

        if (updateError) throw updateError;

        // 4. Log Cash Disbursement in Cashbook
        await cashbookService.logDisbursement(
            id,
            total_prepared,
            cashier_id,
            `${payment_method && payment_method !== 'CASH' ? payment_method : 'Cash'} disbursed for Requisition #${id.slice(0, 8)}`,
            payment_method || 'CASH'
        );

        // 5. Log Action
        await supabase
            .from('audit_logs')
            .insert({
                entity_type: 'REQUISITION',
                entity_id: id,
                action: 'DISBURSED',
                user_id: cashier_id,
                changes: {
                    from: 'AUTHORISED',
                    to: 'DISBURSED',
                    disbursement_id: disbursementData.id
                }
            });

        res.json({
            message: 'Requisition disbursed successfully',
            disbursement_id: disbursementData.id
        });

        // 6. Trigger notification
        emailService.notifyRequisitionEvent(id, 'CASH_DISBURSED').catch(err =>
            console.error('[Notification Error] Failed to send CASH_DISBURSED email:', err)
        );

    } catch (error: any) {
        console.error('Error disbursing requisition:', error);
        res.status(500).json({ error: 'Failed to disburse requisition', details: error.message });
    }
};

export const acknowledgeReceipt = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const requestor_id = (req as any).user.id;
        const { signature } = req.body;

        // 1. Verify Requisition is DISBURSED and user is the requestor
        const { data: requisition, error: reqError } = await supabase
            .from('requisitions')
            .select('status, requestor_id, type, estimated_total, reference_number')
            .eq('id', id)
            .single();

        if (reqError || !requisition) {
            return res.status(404).json({ error: 'Requisition not found' });
        }

        if (requisition.status !== 'DISBURSED') {
            return res.status(400).json({ error: 'Requisition must be DISBURSED to acknowledge receipt' });
        }

        if (requisition.requestor_id !== requestor_id) {
            return res.status(403).json({ error: 'Only the original requestor can acknowledge receipt' });
        }

        // 2. Update Disbursement with Requestor Signature
        const { error: disbError } = await supabase
            .from('disbursements')
            .update({
                requestor_signature: signature || 'DIGITALLY_ACKNOWLEDGED',
                issued_at: new Date().toISOString()
            })
            .eq('requisition_id', id);

        if (disbError) throw disbError;

        const isLoanOrAdvance = requisition.type === 'LOAN' || requisition.type === 'ADVANCE';

        const { data: disbInfo } = await supabase
            .from('disbursements')
            .select('id, cashier_id, total_prepared')
            .eq('requisition_id', id)
            .single();

        const totalPrepared = Number(disbInfo?.total_prepared || 0);
        const estimatedTotal = Number(requisition.estimated_total || 0);

        if (isLoanOrAdvance && totalPrepared <= estimatedTotal) {
            // Auto complete flow for Loans and Advances where NO CHANGE is expected
            // If totalPrepared > estimatedTotal, they essentially received excess cash and need to return change,
            // so we let them fall through to RECEIVED status.

            const cashier_id = disbInfo?.cashier_id || requestor_id;
            const voucherRef = `PV-${requisition.reference_number || id.slice(0, 6)}`;

            // 3. Create Voucher Record
            const { data: voucher, error: voucherError } = await supabase
                .from('vouchers')
                .insert({
                    requisition_id: id,
                    created_by: cashier_id,
                    reference_number: voucherRef,
                    total_credit: estimatedTotal,
                    total_debit: estimatedTotal,
                    status: 'DRAFT'
                })
                .select()
                .single();

            if (voucherError) throw voucherError;

            // 4. Finalize Disbursement details
            await supabase
                .from('disbursements')
                .update({
                    confirmed_change_amount: 0,
                    confirmed_by: cashier_id,
                    confirmed_at: new Date().toISOString(),
                    discrepancy_amount: 0
                })
                .eq('requisition_id', id);

            // 5. Finalize Ledger
            await cashbookService.finalizeDisbursement(
                id,
                estimatedTotal,
                voucher.id,
                0,
                voucherRef
            );

            // 6. Update Requisition Status to COMPLETED and set actual_total
            const { error: completeError } = await supabase
                .from('requisitions')
                .update({
                    status: 'COMPLETED',
                    actual_total: estimatedTotal,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (completeError) throw completeError;

            // 7. Log Action
            await supabase
                .from('audit_logs')
                .insert({
                    entity_type: 'REQUISITION',
                    entity_id: id,
                    action: 'COMPLETED',
                    user_id: requestor_id,
                    changes: { from: 'DISBURSED', to: 'COMPLETED', auto_completed: true }
                });

            res.json({
                message: 'Cash receipt acknowledged and transaction completed (Loan/Advance)',
                status: 'COMPLETED'
            });

            // 8. Trigger Notification
            emailService.notifyRequisitionEvent(id, 'REQUISITION_COMPLETED').catch(err =>
                console.error('[Notification Error] Failed to send REQUISITION_COMPLETED email:', err)
            );

            return;
        }

        // 3. Update Requisition Status to RECEIVED
        const { error: updateError } = await supabase
            .from('requisitions')
            .update({ status: 'RECEIVED', updated_at: new Date().toISOString() })
            .eq('id', id);

        if (updateError) throw updateError;

        // 4. Log Action
        await supabase
            .from('audit_logs')
            .insert({
                entity_type: 'REQUISITION',
                entity_id: id,
                action: 'RECEIVED',
                user_id: requestor_id,
                changes: { from: 'DISBURSED', to: 'RECEIVED' }
            });

        res.json({
            message: 'Cash receipt acknowledged successfully',
            status: 'RECEIVED'
        });

    } catch (error: any) {
        console.error('Error acknowledging receipt:', error);
        res.status(500).json({ error: 'Failed to acknowledge receipt', details: error.message });
    }
};
