const LENCO_TRANSACTION_FEE = 8.5;
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { emailService } from '../services/email.service';
import { ocrService } from '../services/ai/ocr.service';
import { LencoService } from '../services/lenco.service';

export const disburseRequisition = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const { denominations, total_prepared, payment_method, transfer_proof_url, recipient_account, recipient_bank_code, recipient_account_name } = req.body;
        const cashier_id = (req as any).user.id;
        const organizationId = (req as any).user.organization_id;


        if (!organizationId) throw new Error("Missing organization context");

        // 0. Idempotency Check: Does a disbursement record already exist?
        const { data: existingDisb } = await supabase
            .from('disbursements')
            .select('id, payment_method, external_reference')
            .eq('requisition_id', id)
            .maybeSingle();

        if (existingDisb) {
            return res.status(200).json({ 
                message: 'Requisition has already been disbursed.',
                disbursement_id: existingDisb.id,
                isDuplicate: true 
            });
        }

        // 1. Atomic status check and lock

        // We try to update the status to 'DISBURSED' only if it is currently 'AUTHORISED'.
        // This prevents double-disbursement race conditions.
        // We also fetch organization_id here to ensure we use the correct one for Lenco.
        const { data: lockResult, error: lockError } = await supabase
            .from('requisitions')
            .update({ status: 'DISBURSED', updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('status', 'AUTHORISED')
            .select('estimated_total, organization_id');


        if (lockError || !lockResult || lockResult.length === 0) {
            return res.status(400).json({ 
                error: 'Requisition cannot be disbursed. It may have already been processed or is not in AUTHORISED status.' 
            });
        }

        const requisition = lockResult[0];

        // 2. Validate Disbursement Amount
        const estimatedTotal = Number(requisition.estimated_total);
        const totalPreparedNum = Number(total_prepared);
        const isWallet = payment_method === 'MONEYWISE_WALLET';
        const totalDeduction = totalPreparedNum + (isWallet ? LENCO_TRANSACTION_FEE : 0);

        if (totalPreparedNum < estimatedTotal) {
            return res.status(400).json({
                error: `Disbursement amount (K${total_prepared}) cannot be less than the authorized amount (K${estimatedTotal})`
            });
        }

        // 3. Process Lenco Payout if using Wallet
        let lencoReference = null;
        const targetOrgId = requisition.organization_id;
        const stableRef = `REQ-${id.slice(0, 8)}-${estimatedTotal.toFixed(0)}`; // Unique enough but stable

        if (payment_method === 'MONEYWISE_WALLET') {
            const { data: org } = await supabase
                .from('organizations')
                .select('lenco_subaccount_id, lenco_secret_key')
                .eq('id', targetOrgId)
                .single();

            if (!org?.lenco_subaccount_id || !org?.lenco_secret_key) {
                throw new Error("Organization is not properly configured for MoneyWise Wallet");
            }

            if (!recipient_account || !recipient_bank_code) {
                return res.status(400).json({ error: 'Recipient account and bank code are required for Wallet transfers' });
            }

            try {
                // IDEMPOTENCY CHECK: Check if this reference already exists on Lenco
                console.log(`[Lenco] Checking for existing transfer with reference: ${stableRef}`);
                let statusCheck = await LencoService.getTransferStatus(stableRef, org.lenco_secret_key);
                
                let payout;
                if (statusCheck) {
                    console.log(`[Lenco] Found existing transfer: ${statusCheck.status}. Using existing reference.`);
                    payout = statusCheck;
                } else {
                    // No existing transfer, create a new one
                    const mobileOps = ['mtn', 'airtel', 'zamtel'];
                    const isMobile = mobileOps.includes(recipient_bank_code?.toLowerCase() || '');

                    if (isMobile) {
                        payout = await LencoService.createMobileMoneyPayout({
                            amount: total_prepared,
                            reference: stableRef,
                            phone: recipient_account,
                            operator: recipient_bank_code,
                            narration: `Disbursement for Requisition #${id.slice(0, 8)}`
                        }, org.lenco_subaccount_id, org.lenco_secret_key);
                    } else {
                        payout = await LencoService.createBankPayout({
                            amount: total_prepared,
                            reference: stableRef,
                            accountNumber: recipient_account,
                            bankId: recipient_bank_code,
                            narration: `Disbursement for Requisition #${id.slice(0, 8)}`
                        }, org.lenco_subaccount_id, org.lenco_secret_key);
                    }
                }
                
                lencoReference = payout.reference;
                
                // Poll for status if we just created it or if it was pending
                let attempts = 0;
                let currentStatus = payout.status;
                while (currentStatus === 'pending' && attempts < 3) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    statusCheck = await LencoService.getTransferStatus(stableRef, org.lenco_secret_key);
                    currentStatus = statusCheck?.status || 'pending';
                    attempts++;
                }

                if (currentStatus === 'failed') {
                    throw new Error(statusCheck?.message || 'Lenco reported transfer failure');
                }

                (req as any).lencoStatus = currentStatus;

            } catch (payoutError: any) {
                console.error('[Lenco Payout Failed] Error during wallet disbursal:', payoutError);
                
                // CRITICAL: We DO NOT revert status here if we suspect the money might have moved.
                // Revert ONLY if we are sure it's a "Failed to initiate" error and NOT a "Database timeout after initiation"
                // For safety, we keep it as DISBURSED or a new status.
                // Given the current status is already set to DISBURSED in the lock result at top, 
                // we just let it stay there and return the error.
                
                return res.status(500).json({ 
                    error: 'Uncertain disbursal state. The requisition has been marked as DISBURSED to prevent double-spending, but the wallet transfer encountered an error.',
                    details: payoutError.message,
                    isLencoError: true,
                    reference: stableRef,
                    hint: 'Please check Lenco dashboard. If the transfer failed there, you can manually revert the status to AUTHORISED.'
                });
            }
        }


        // 4. Create Disbursement Record
        const { data: disbursementData, error: disbError } = await supabase
            .from('disbursements')
            .insert({
                requisition_id: id,
                cashier_id: cashier_id,
                total_prepared: totalDeduction, // Now includes Lenco fee if wallet
                payment_method: payment_method || 'CASH',
                transfer_proof_url: transfer_proof_url,
                denominations: denominations,
                organization_id: targetOrgId,

                recipient_account,
                recipient_bank_code,
                recipient_account_name,
                external_reference: lencoReference
            })
            .select('id')
            .single();

        if (disbError) {
            // Revert status to AUTHORISED if record creation fails
            console.error('[Disbursement Record Failed] Reverting requisition status:', disbError);
            await supabase
                .from('requisitions')
                .update({ status: 'AUTHORISED', updated_at: new Date().toISOString() })
                .eq('id', id);
            throw disbError;
        }

        // 3. Status is already DISBURSED from step 1

        // 4. Log Cash Disbursement in Cashbook
        const mainDescription = `${payment_method && payment_method !== 'CASH' ? payment_method : 'Cash'} disbursed for Requisition #${id.slice(0, 8)}`;

        if (!isWallet) {
            // ONLY log immediate cashbook entry if it's NOT a wallet transfer.
            // Wallet transfers are logged in verifyDisbursementStatus once confirmed by Lenco.
            await cashbookService.logDisbursement(
                targetOrgId,
                id,
                totalDeduction,
                cashier_id,
                mainDescription,
                payment_method || 'CASH'
            );

        }

        // 5. Fee application is DEFERRED for Wallet transfers to avoid fake charges if it fails.
        // It will be handled in verifyDisbursementStatus.

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
            message: (req as any).lencoStatus === 'pending' 
                ? 'Disbursement initiated and is currently being processed by Lenco' 
                : 'Requisition disbursed successfully',
            disbursement_id: disbursementData.id,
            lencoStatus: (req as any).lencoStatus || 'successful'
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
            const organizationId = (req as any).user.organization_id;
            if (!organizationId) throw new Error("Missing organization context");

            await cashbookService.finalizeDisbursement(
                organizationId,
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

export const getDisbursementHistory = async (req: any, res: any): Promise<any> => {
    try {
        const organization_id = req.user.organization_id;
        
        const { data, error } = await supabase
            .from('disbursements')
            .select(`
                *,
                requisitions!requisition_id (
                    id,
                    description,
                    estimated_total,
                    status,
                    type,
                    requestor_id,
                    department,
                    requestor:users!requestor_id (name),
                    line_items (*)
                ),
                cashier:users!cashier_id (name)
            `)
            .eq('organization_id', organization_id)
            .order('issued_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        // Flatten requestor name for convenience
        const formatted = data.map(d => ({
            ...d,
            requestor_name: d.requisitions?.requestor?.name || d.requisitions?.staff_name,
            cashier_name: d.cashier?.name
        }));

        res.json(formatted);
    } catch (error: any) {
        console.error('Error fetching disbursement history:', error);
        res.status(500).json({ error: 'Failed to fetch disbursement history' });
    }
};

export const updateDisbursement = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params; // Disbursement ID? No, requisition ID might be more consistent with existing API
        const { total_prepared, denominations } = req.body;
        const organization_id = req.user.organization_id;

        // Check if disbursement exists and is not confirmed
        const { data: disbursement, error: findError } = await supabase
            .from('disbursements')
            .select('confirmed_at, requisition_id, organization_id')
            .eq('id', id)
            .single();

        if (findError || !disbursement) {
            return res.status(404).json({ error: 'Disbursement not found' });
        }

        const targetOrgId = disbursement.organization_id;

        if (disbursement.confirmed_at) {
            return res.status(400).json({ error: 'Cannot edit a disbursement that has already been confirmed' });
        }

        // Update cashbook and disbursement record
        await cashbookService.updateDisbursementAmount(
            targetOrgId,
            disbursement.requisition_id,
            total_prepared,
            denominations
        );


        // Log the change
        await supabase
            .from('audit_logs')
            .insert({
                entity_type: 'DISBURSEMENT',
                entity_id: id,
                action: 'UPDATED',
                user_id: req.user.id,
                changes: {
                    total_prepared,
                    denominations
                }
            });

        res.json({ message: 'Disbursement updated successfully' });
    } catch (error: any) {
        console.error('Error updating disbursement:', error);
        res.status(500).json({ error: 'Failed to update disbursement', details: error.message });
    }
};

export const analyzeDisbursementProof = async (req: any, res: Response) => {
    try {
        const { id } = req.params;
        const { data: disbursement, error: fetchError } = await supabase
            .from('disbursements')
            .select('transfer_proof_url, total_prepared')
            .eq('id', id)
            .single();

        if (fetchError || !disbursement) {
            return res.status(404).json({ error: 'Disbursement not found' });
        }

        if (!disbursement.transfer_proof_url) {
            return res.status(400).json({ error: 'No proof of transfer uploaded for this disbursement' });
        }

        const { data: publicUrlData } = supabase.storage
            .from('receipts')
            .getPublicUrl(disbursement.transfer_proof_url);

        const ocrResult = await ocrService.analyzeReceipt(publicUrlData.publicUrl);
        
        return res.json({
            ocrData: ocrResult,
            recordedAmount: disbursement.total_prepared
        });
    } catch (error: any) {
        console.error('[DisbursementController] AI analysis failed:', error);
        return res.status(500).json({ error: error.message || 'AI analysis failed' });
    }
};

/**
 * Verify the status of a Lenco payout and finalize the disbursement if successful
 */
export const verifyDisbursementStatus = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params; // Requisition ID
        const organizationId = req.user.organization_id;

        // Scope the query to the requisition, but we'll fetch the org later for safety
        const { data: disbursement, error: disbError } = await supabase
            .from('disbursements')
            .select('*, requisitions(status, estimated_total, organization_id)')
            .eq('requisition_id', id)
            .single();


        if (disbError || !disbursement) {
            return res.status(404).json({ error: 'Disbursement record not found' });
        }

        if (!disbursement.external_reference) {
            return res.status(400).json({ error: 'Not a Lenco-managed disbursement' });
        }

        const targetOrgId = disbursement.requisitions?.organization_id || disbursement.organization_id;
        if (!targetOrgId) throw new Error("Could not determine organization for this disbursement");

        // 2. Poll Lenco for status
        // Fetch org secret key first
        const { data: orgKeys } = await supabase.from('organizations').select('lenco_secret_key').eq('id', targetOrgId).single();
        const statusCheck = await LencoService.getTransferStatus(disbursement.external_reference, orgKeys?.lenco_secret_key);

        console.log(`[Lenco Verify] Reference: ${disbursement.external_reference}, Status: ${statusCheck.status}`);

        if (statusCheck.status === 'successful') {
            // CRITICAL: Finalize Ledger and Fees NOW that we are sure it succeeded.
            // Only skip if the DISBURSED entry specifically exists — NOT voucher/reconciliation entries
            const { data: existingLedger } = await supabase
                .from('cashbook_entries')
                .select('id')
                .eq('requisition_id', id)
                .eq('status', 'DISBURSED')
                .maybeSingle();

            if (!existingLedger) {
                await cashbookService.finalizeWalletDisbursementLedger(id);
            }

            return res.json({ 
                status: 'successful', 
                message: 'Transaction verified as successful',
                details: statusCheck
            });
        }

        if (statusCheck.status === 'failed') {
            // CRITICAL: Revert everything if Lenco now reports failure
            console.warn(`[Lenco Verify] Transaction FAILED for ${id}. Reverting records.`);

            // A. Revert Requisition to AUTHORISED so it can be corrected/retried
            await supabase
                .from('requisitions')
                .update({ 
                    status: 'AUTHORISED', 
                    updated_at: new Date().toISOString() 
                })
                .eq('id', id);

            // B. Delete the disbursement record since it didn't happen
            await supabase.from('disbursements').delete().eq('id', disbursement.id);

            // C. Delete the cashbook entry if it was already created
            // We fetch the entry first so we know where to start recalculation from
            const { data: ledgerEntry } = await supabase
                .from('cashbook_entries')
                .select('date, created_at')
                .eq('requisition_id', id)
                .maybeSingle();

            if (ledgerEntry) {
                await supabase.from('cashbook_entries').delete().eq('requisition_id', id);

                // Recalculate balances starting from the point of deletion
                await cashbookService.recalculateBalancesFrom(
                    organizationId, 
                    ledgerEntry.date, 
                    ledgerEntry.created_at,
                    disbursement.payment_method
                );
            }

            // D. Delete any audit logs for this disbursement (optional but cleaner)

            return res.status(400).json({ 
                status: 'failed', 
                error: 'Transfer failed on Lenco: ' + (statusCheck.message || 'Unknown error'),
                details: statusCheck
            });
        }

        return res.json({ 
            status: 'pending', 
            message: 'Transaction is still processing',
            details: statusCheck
        });

    } catch (error: any) {
        console.error('Error verifying disbursement status:', error);
        res.status(500).json({ error: 'Failed to verify status', details: error.message });
    }
};
