import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';

export const disburseRequisition = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { denominations, total_prepared } = req.body;
        const cashier_id = req.user.id;

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

        // 2. Create Disbursement Record
        const { data: disbursementData, error: disbError } = await supabase
            .from('disbursements')
            .insert({
                requisition_id: id,
                cashier_id: cashier_id,
                total_prepared: total_prepared,
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
        try {
            await cashbookService.logDisbursement(
                id,
                total_prepared,
                cashier_id,
                `Cash disbursed for Requisition #${id.slice(0, 8)}`
            );
        } catch (cashbookError: any) {
            console.error('Warning: Failed to log cashbook entry:', cashbookError.message);
            // Don't fail the entire disbursement if cashbook logging fails
        }

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

    } catch (error: any) {
        console.error('Error disbursing requisition:', error);
        res.status(500).json({ error: 'Failed to disburse requisition', details: error.message });
    }
};

export const acknowledgeReceipt = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const requestor_id = req.user.id;
        const { signature } = req.body;

        // 1. Verify Requisition is DISBURSED and user is the requestor
        const { data: requisition, error: reqError } = await supabase
            .from('requisitions')
            .select('status, requestor_id')
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
