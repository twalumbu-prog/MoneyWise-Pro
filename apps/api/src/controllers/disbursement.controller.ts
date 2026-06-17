import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { emailService } from '../services/email.service';
import { ocrService } from '../services/ai/ocr.service';
import { LencoService } from '../services/lenco.service';
import { RequisitionMessageService } from '../services/requisition_message.service';
import { triggerAIReview } from './requisition.controller';

export const disburseRequisition = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const { denominations, total_prepared, payment_method, transfer_proof_url, recipient_account, recipient_bank_code, recipient_account_name } = req.body;
        const cashier_id = (req as any).user.id;
        const organizationId = (req as any).user.organization_id;
        const isDigital = payment_method !== 'CASH' && payment_method !== 'CASH_PICKUP' && payment_method !== 'OTHER';

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
        // We try to update the status to 'DISBURSED' or 'RECEIVED' (for digital)
        let finalWalletId = req.body.wallet_id || req.body.walletId;

        if (isDigital && !finalWalletId) {
            const { data: mainWallet } = await supabase
                .from('organization_wallets')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('is_main', true)
                .maybeSingle();
            
            if (mainWallet) {
                finalWalletId = mainWallet.id;
            }
        }

        const updateParams: any = { 
            status: isDigital ? 'RECEIVED' : 'DISBURSED', 
            updated_at: new Date().toISOString() 
        };
        if (finalWalletId) {
            updateParams.wallet_id = finalWalletId;
        }

        const { data: lockResult, error: lockError } = await supabase
            .from('requisitions')
            .update(updateParams)
            .eq('id', id)
            .eq('status', 'AUTHORISED')
            .eq('organization_id', organizationId)   // ← Org boundary hard-enforced at DB level
            .select('estimated_total, organization_id, wallet_id');

        if (lockError || !lockResult || lockResult.length === 0) {
            return res.status(400).json({ 
                error: 'Requisition cannot be disbursed. It may have already been processed, is not in AUTHORISED status, or does not belong to your organization.' 
            });
        }

        const requisition = lockResult[0];

        // 2. Validate Disbursement Amount
        const estimatedTotal = Number(requisition.estimated_total);
        const totalPreparedNum = Number(total_prepared);
        const fee = isDigital ? LencoService.calculatePayoutFee(totalPreparedNum, payment_method) : 0;
        const totalDeduction = totalPreparedNum + fee;

        if (totalPreparedNum < estimatedTotal) {
            return res.status(400).json({
                error: `Disbursement amount (K${total_prepared}) cannot be less than the authorized amount (K${estimatedTotal})`
            });
        }

        // 3. Process Lenco Payout if using Wallet
        let lencoReference = null;
        const targetOrgId = requisition.organization_id;
        const stableRef = `REQ-${id.slice(0, 8)}-${estimatedTotal.toFixed(0)}`; // Unique enough but stable
        let resolvedOrgKey: string | undefined; // Will be set inside isDigital block for deferred use

        if (isDigital) {
            try {
                const { data: org } = await supabase
                    .from('organizations')
                    .select('lenco_subaccount_id, lenco_secret_key, payment_test_mode')
                    .eq('id', targetOrgId)
                    .single();

                const secretKey = org?.lenco_secret_key || process.env.LENCO_SECRET_KEY;
                if (!org?.lenco_subaccount_id || !secretKey) {
                    // If test mode is on, we can skip the strict credential check if desired, 
                    // but let's keep it robust.
                    if (!org?.payment_test_mode) {
                        throw new Error("Organization is not properly configured for MoneyWise Wallet");
                    }
                }

                if (!recipient_account || !recipient_bank_code) {
                    throw new Error('Recipient account and bank code are required for Wallet transfers');
                }

                // Carry the org key forward for deferred finalization
                resolvedOrgKey = org?.lenco_secret_key;
                (req as any).orgLencoKey = resolvedOrgKey;

                if (org?.payment_test_mode) {
                    console.log(`[Payment Test Mode] Bypassing Lenco for Requisition ${id}`);
                    lencoReference = `SIM-PAY-${id.slice(0, 8)}`;
                    (req as any).lencoStatus = 'successful';
                    (req as any).lencoFee = 0;
                } else {
                    // IDEMPOTENCY CHECK: Find a stable reference that hasn't failed yet
                    console.log(`[Lenco] Resolving stable reference for: ${stableRef}`);
                    let statusCheck;
                    let payout;
                    let resolvedRef = stableRef;
                    
                    for (let i = 0; i < 10; i++) {
                        resolvedRef = i === 0 ? stableRef : `${stableRef}-R${i}`;
                        statusCheck = await LencoService.getTransferStatus(resolvedRef, org.lenco_secret_key);
                        
                        if (!statusCheck) {
                            // Not found on Lenco, we can safely use this reference for a new transfer
                            break;
                        }
                        if (statusCheck.status !== 'failed') {
                            // Found an existing transfer that is pending or successful. We must reuse it.
                            break;
                        }
                        // If status is failed, we continue the loop to try the next retry suffix
                    }

                    if (statusCheck && statusCheck.status !== 'failed') {
                        console.log(`[Lenco] Found existing transfer: ${statusCheck.status}. Using existing reference: ${resolvedRef}`);
                        payout = statusCheck;
                    } else {
                        // No existing transfer found (or all previous attempts failed), create a new one
                        console.log(`[Lenco] Creating new transfer with reference: ${resolvedRef}`);
                        const mobileOps = ['mtn', 'airtel', 'zamtel'];
                        const isMobile = mobileOps.includes(recipient_bank_code?.toLowerCase() || '');
                        if (isMobile) {
                            payout = await LencoService.createMobileMoneyPayout({
                                amount: total_prepared,
                                reference: resolvedRef,
                                phone: recipient_account,
                                operator: recipient_bank_code,
                                narration: `Disbursement for Requisition #${id.slice(0, 8)}`
                            }, org.lenco_subaccount_id, org.lenco_secret_key);
                        } else {
                            const bankId = await LencoService.findBankId(recipient_bank_code || '', org.lenco_secret_key);
                            payout = await LencoService.createBankPayout({
                                amount: total_prepared,
                                reference: resolvedRef,
                                accountNumber: recipient_account,
                                bankId,
                                narration: `Disbursement for Requisition #${id.slice(0, 8)}`
                            }, org.lenco_subaccount_id, org.lenco_secret_key);
                        }
                    }
                    
                    lencoReference = payout.reference;

                    // Handle immediate failure from Lenco (e.g. amount below minimum)
                    if (payout.status === 'failed') {
                        const reason = payout.reasonForFailure || payout.message || 'Transfer rejected by Lenco';
                        throw new Error(reason);
                    }
                    
                    // We no longer poll synchronously to avoid serverless function timeouts.
                    // Instead, we carry forward the initial payout status and schedule background polling
                    // or let Lenco's webhook handle finalization.
                    (req as any).lencoStatus = payout.status || 'pending';
                    (req as any).lencoFee = payout.fee ? parseFloat(payout.fee) : undefined;
                    (req as any).resolvedRef = resolvedRef; // Carry forward for deferred finalization
                }

            } catch (payoutError: any) {
                console.error('[Lenco Payout Failed] Error during wallet disbursal:', payoutError);
                console.error(`[Disbursement] CRITICAL ERROR for req ${id}:`, payoutError.message);
                
                // REVERT TO AUTHORISED so user can retry.
                // Our idempotency check at the top of this function will prevent double-spending
                // if the previous attempt actually succeeded on Lenco but failed to respond.
                await supabase
                    .from('requisitions')
                    .update({ status: 'AUTHORISED' })
                    .eq('id', id);

                return res.status(400).json({ 
                    error: `Disbursal error: ${payoutError.message}. The requisition has been reset to AUTHORISED. Please try again or check the ledger for manual verification.`,
                    details: payoutError.message,
                    stableRef: stableRef
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

        if (!isDigital) {
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

        } else if ((req as any).lencoStatus === 'successful') {
            // CRITICAL: If the Wallet payout succeeded IMMEDIATELY during the initial call, 
            // finalize the ledger now that the disbursement record has been securely created.
            console.log(`[Lenco] Payout succeeded immediately for ${id}. Finalizing ledger post-record creation...`);
            
            // Extract actual fee if returned by Lenco
            const actualFee = (req as any).lencoFee;
            await cashbookService.finalizeWalletDisbursementLedger(id, actualFee);
        } else {
            // Transfer is not successful yet (could be pending, processing, etc.)
            // Schedule background polling for any non-terminal status
            const orgKey = (req as any).orgLencoKey;
            const ref = (req as any).resolvedRef || lencoReference;
            const terminalStatuses = ['successful', 'failed', 'reversed'];
            
            if (ref && orgKey && !terminalStatuses.includes((req as any).lencoStatus)) {
                console.log(`[Lenco] Transfer status is ${(req as any).lencoStatus} for ${id}. Scheduling background polling...`);
                scheduleDeferredLedgerFinalization(id, ref, orgKey);
            }
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

        // Create DISBURSAL_SUCCESS message BEFORE EXPENSE_TRACKING to guarantee correct chat ordering.
        await RequisitionMessageService.createMessage({
            requisitionId: id,
            userId: cashier_id,
            content: `Funds Disbursed: K${totalDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nMethod: ${payment_method || 'CASH'}\nRef: ${lencoReference || 'N/A'}\nStatus: SUCCESS`,
            type: 'SYSTEM',
            metadata: {
                isSummary: true,
                stage: 'DISBURSAL_SUCCESS',
                disbursement_id: disbursementData.id,
                payment_method,
                amount: totalDeduction
            }
        });

        // Brief gap so DB timestamps are strictly ordered before EXPENSE_TRACKING is written.
        await new Promise(resolve => setTimeout(resolve, 500));

        // Trigger the EXPENSE_TRACKING prompt IMMEDIATELY after any disbursement.
        // We no longer wait for manual "acknowledgement" since the transaction is confirmed.
        
        // Idempotency Check: Ensure we don't generate duplicate EXPENSE_TRACKING messages
        const { data: existingMsg } = await supabase
            .from('requisition_messages')
            .select('id')
            .eq('requisition_id', id)
            .contains('metadata', { stage: 'EXPENSE_TRACKING' })
            .limit(1)
            .maybeSingle();

        if (!existingMsg) {
            await RequisitionMessageService.createMessage({
                requisitionId: id,
                userId: cashier_id,
                content: `Funds received. Please record your expenditure and upload receipts.`,
                type: 'SYSTEM',
                metadata: { stage: 'EXPENSE_TRACKING' }
            });
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));

        const lencoStatus = (req as any).lencoStatus;
        const isAwaitingConfirmation = isDigital && lencoStatus && lencoStatus !== 'successful';
        res.json({
            message: isAwaitingConfirmation
                ? 'Disbursement initiated. The transfer is being processed by Lenco — you will be notified if it fails.'
                : 'Requisition disbursed successfully',
            disbursement_id: disbursementData.id,
            lencoStatus: lencoStatus ?? (isDigital ? 'pending' : 'n/a')
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

            // Trigger system message
            await RequisitionMessageService.createMessage({
                requisitionId: id,
                userId: requestor_id,
                content: 'Requisition completed (Auto-finalized)',
                type: 'SYSTEM'
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

        // Idempotency Check for System message
        const { data: existingMsg } = await supabase
            .from('requisition_messages')
            .select('id')
            .eq('requisition_id', id)
            .contains('metadata', { stage: 'EXPENSE_TRACKING' })
            .limit(1)
            .maybeSingle();

        if (!existingMsg) {
            // Trigger system message
            await RequisitionMessageService.createMessage({
                requisitionId: id,
                userId: requestor_id,
                content: 'Funds received and acknowledged',
                type: 'SYSTEM',
                metadata: { stage: 'EXPENSE_TRACKING' }
            });
        }

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
 * Shared helper to revert a disbursement and cleanup related database records
 */
async function revertDisbursementAndCleanup(
    requisitionId: string,
    organizationId: string,
    paymentMethod: string = 'MONEYWISE_WALLET'
): Promise<void> {
    console.warn(`[Revert Disbursement] Starting revert and cleanup for requisition: ${requisitionId}`);

    // A. Revert Requisition to AUTHORISED
    await supabase
        .from('requisitions')
        .update({ 
            status: 'AUTHORISED', 
            actual_total: null,
            updated_at: new Date().toISOString() 
        })
        .eq('id', requisitionId);

    // B. Delete any disbursement record
    await supabase
        .from('disbursements')
        .delete()
        .eq('requisition_id', requisitionId);

    // C. Delete cashbook entries and recalculate
    const { data: ledgerEntry } = await supabase
        .from('cashbook_entries')
        .select('date, created_at, account_type')
        .eq('requisition_id', requisitionId)
        .maybeSingle();

    if (ledgerEntry) {
        await supabase.from('cashbook_entries').delete().eq('requisition_id', requisitionId);

        // Recalculate balances starting from the point of deletion
        await cashbookService.recalculateBalancesFrom(
            organizationId, 
            ledgerEntry.date, 
            ledgerEntry.created_at,
            ledgerEntry.account_type || paymentMethod
        );
    }

    // D. Delete messages related to disbursement and expense tracking
    const { data: messages } = await supabase
        .from('requisition_messages')
        .select('id, metadata')
        .eq('requisition_id', requisitionId);

    if (messages) {
        const messageIdsToDelete = messages
            .filter(m => m.metadata && ['DISBURSAL_SUCCESS', 'EXPENSE_TRACKING', 'EXPENSE_SUMMARY'].includes((m.metadata as any).stage))
            .map(m => m.id);

        if (messageIdsToDelete.length > 0) {
            await supabase
                .from('requisition_messages')
                .delete()
                .in('id', messageIdsToDelete);
        }
    }

    // E. Notify the user in the requisition chat so the failure is visible
    await supabase
        .from('requisition_messages')
        .insert({
            requisition_id: requisitionId,
            content: 'Transfer failed. The Lenco payout could not be confirmed and the disbursement has been automatically reversed. The requisition is back to AUTHORISED — please retry the disbursement.',
            type: 'SYSTEM',
            metadata: { stage: 'TRANSFER_FAILED' }
        });

    // F. Log audit log
    await supabase
        .from('audit_logs')
        .insert({
            entity_type: 'REQUISITION',
            entity_id: requisitionId,
            action: 'TRANSFER_FAILED',
            changes: { reverted_to: 'AUTHORISED' }
        });
}

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

        const { data: orgKeys } = await supabase.from('organizations').select('lenco_secret_key').eq('id', targetOrgId).single();
        const secretKey = orgKeys?.lenco_secret_key || process.env.LENCO_SECRET_KEY;
        const statusCheck = await LencoService.getTransferStatus(disbursement.external_reference, secretKey);

        console.log(`[Lenco Verify] Reference: ${disbursement.external_reference}, Status: ${statusCheck?.status || 'NOT FOUND'}`);

        if (!statusCheck) {
            console.warn(`[Lenco Verify] Transaction not found on Lenco for reference: ${disbursement.external_reference}. Reverting records.`);
            await revertDisbursementAndCleanup(id, targetOrgId, disbursement.payment_method);
            return res.status(400).json({ 
                status: 'failed', 
                error: 'Transfer was not found on Lenco. The requisition has been reset to AUTHORISED.'
            });
        }

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
                const actualFee = statusCheck?.fee ? parseFloat(statusCheck.fee) : undefined;
                await cashbookService.finalizeWalletDisbursementLedger(id, actualFee);
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
            await revertDisbursementAndCleanup(id, targetOrgId, disbursement.payment_method);

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

/**
 * Schedules a fire-and-forget background job that polls Lenco at increasing intervals
 * and finalizes the cashbook entry once the transfer is confirmed successful.
 *
 * This is the safety net for transfers that are still 'pending' after the initial
 * 5-poll synchronous window. It runs entirely in the background — the HTTP response
 * has already been sent to the client before this job does any work.
 *
 * The job is idempotent: finalizeWalletDisbursementLedger guards against double-entry.
 * It abandons automatically after 4 attempts (covering ~43 minutes total wait time).
 */
function scheduleDeferredLedgerFinalization(
    requisitionId: string,
    reference: string,
    lencoSecretKey: string
): void {
    // Retry intervals in milliseconds: 30s, 2min, 10min, 30min
    const RETRY_INTERVALS_MS = [30_000, 120_000, 600_000, 1_800_000];

    const attemptFinalization = async (attemptIndex: number): Promise<void> => {
        if (attemptIndex >= RETRY_INTERVALS_MS.length) {
            console.warn(`[Deferred Finalization] Giving up for ${requisitionId} after ${RETRY_INTERVALS_MS.length} attempts. Reverting records...`);
            const { data: disb } = await supabase
                .from('disbursements')
                .select('organization_id, payment_method')
                .eq('requisition_id', requisitionId)
                .maybeSingle();
            
            const orgId = disb?.organization_id;
            if (orgId) {
                await revertDisbursementAndCleanup(requisitionId, orgId, disb.payment_method);
            } else {
                console.error(`[Deferred Finalization] Could not find disbursement record for ${requisitionId} to revert.`);
            }
            return;
        }

        const delayMs = RETRY_INTERVALS_MS[attemptIndex];
        console.log(`[Deferred Finalization] Scheduled attempt ${attemptIndex + 1}/${RETRY_INTERVALS_MS.length} for ${requisitionId} in ${delayMs / 1000}s...`);

        await new Promise(resolve => setTimeout(resolve, delayMs));

        try {
            console.log(`[Deferred Finalization] Polling Lenco for ref ${reference} (attempt ${attemptIndex + 1})...`);
            const statusCheck = await LencoService.getTransferStatus(reference, lencoSecretKey);

            if (statusCheck?.status === 'successful') {
                console.log(`[Deferred Finalization] Transfer ${reference} confirmed successful. Finalizing ledger for ${requisitionId}...`);
                const actualFee = statusCheck?.fee ? parseFloat(statusCheck.fee) : undefined;
                await cashbookService.finalizeWalletDisbursementLedger(requisitionId, actualFee);
                console.log(`[Deferred Finalization] ✅ Ledger finalized for ${requisitionId}.`);
                return; // Done — no further retries needed
            }

            if (statusCheck?.status === 'failed') {
                console.error(`[Deferred Finalization] Transfer ${reference} reported FAILED by Lenco. Reverting records for ${requisitionId}.`);
                const { data: disb } = await supabase
                    .from('disbursements')
                    .select('organization_id, payment_method')
                    .eq('requisition_id', requisitionId)
                    .maybeSingle();
                
                const orgId = disb?.organization_id;
                if (orgId) {
                    await revertDisbursementAndCleanup(requisitionId, orgId, disb.payment_method);
                } else {
                    console.error(`[Deferred Finalization] Could not find disbursement record for ${requisitionId} to revert.`);
                }
                return; // Don't retry a definitively failed transfer
            }

            // Still pending — schedule the next attempt
            console.log(`[Deferred Finalization] Transfer ${reference} still pending. Will retry...`);
            await attemptFinalization(attemptIndex + 1);

        } catch (error: any) {
            console.error(`[Deferred Finalization] Error on attempt ${attemptIndex + 1} for ${requisitionId}:`, error?.message);
            // Retry on transient errors (network issues, etc.)
            await attemptFinalization(attemptIndex + 1);
        }
    };

    // Kick off the chain without awaiting — this is intentionally fire-and-forget
    attemptFinalization(0).catch(err =>
        console.error(`[Deferred Finalization] Unhandled error in finalization chain for ${requisitionId}:`, err)
    );
}

export const disburseExcessRequisition = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const { payment_method, total_prepared, recipient_account, recipient_bank_code, recipient_account_name } = req.body;
        const cashier_id = req.user.id;
        const organizationId = req.user.organization_id;
        const isDigital = payment_method !== 'CASH' && payment_method !== 'CASH_PICKUP' && payment_method !== 'OTHER';

        if (!organizationId) throw new Error("Missing organization context");

        const { data: requisition, error: reqError } = await supabase
            .from('requisitions')
            .select('*, disbursements(*)')
            .eq('id', id)
            .single();

        if (reqError || !requisition) return res.status(404).json({ error: 'Requisition not found' });
        
        if (requisition.status !== 'EXPENSED') {
            return res.status(400).json({ error: 'Requisition is not in EXPENSED status.' });
        }

        const disbursement = requisition.disbursements?.[0];
        if (!disbursement) {
            return res.status(400).json({ error: 'Original disbursement record not found.' });
        }

        const bodyWalletId = req.body.wallet_id || req.body.walletId;
        if (bodyWalletId && requisition.wallet_id !== bodyWalletId) {
            await supabase
                .from('requisitions')
                .update({ wallet_id: bodyWalletId })
                .eq('id', id);
            requisition.wallet_id = bodyWalletId;
        }

        const totalActual = Number(requisition.actual_total || 0);
        const originalDisbursed = Number(disbursement.total_prepared || 0);
        const excess = totalActual - originalDisbursed;

        if (excess <= 0) {
            return res.status(400).json({ error: 'No excess expenditure to disburse.' });
        }

        const payoutAmount = Number(total_prepared);
        if (Math.abs(payoutAmount - excess) > 0.01) {
            return res.status(400).json({ error: `Disbursement amount must equal the excess amount (K${excess}).` });
        }

        let lencoReference = null;
        const stableRef = `EXC-${id.slice(0, 8)}-${excess.toFixed(0)}`;

        if (isDigital) {
            const { data: org } = await supabase
                .from('organizations')
                .select('lenco_subaccount_id, lenco_secret_key, payment_test_mode')
                .eq('id', organizationId)
                .single();

            const secretKey = org?.lenco_secret_key || process.env.LENCO_SECRET_KEY;
            if (!org?.lenco_subaccount_id || !secretKey) {
                if (!org?.payment_test_mode) {
                    throw new Error("Organization is not properly configured for MoneyWise Wallet");
                }
            }

            if (!recipient_account || !recipient_bank_code) {
                return res.status(400).json({ error: 'Recipient account and bank code are required for Wallet transfers' });
            }

            try {
                if (org?.payment_test_mode) {
                    console.log(`[Payment Test Mode] Bypassing Lenco for Excess ${id}`);
                    lencoReference = `SIM-EXC-${id.slice(0, 8)}`;
                    (req as any).lencoStatus = 'successful';
                    (req as any).lencoFee = 0;
                } else {
                    let statusCheck;
                    let payout;
                    let resolvedRef = stableRef;
                    
                    for (let i = 0; i < 10; i++) {
                        resolvedRef = i === 0 ? stableRef : `${stableRef}-R${i}`;
                        statusCheck = await LencoService.getTransferStatus(resolvedRef, org.lenco_secret_key);
                        
                        if (!statusCheck) break;
                        if (statusCheck.status !== 'failed') break;
                    }

                    if (statusCheck && statusCheck.status !== 'failed') {
                        payout = statusCheck;
                    } else {
                        const mobileOps = ['mtn', 'airtel', 'zamtel'];
                        const isMobile = mobileOps.includes(recipient_bank_code?.toLowerCase() || '');

                        if (isMobile) {
                            payout = await LencoService.createMobileMoneyPayout({
                                amount: payoutAmount,
                                reference: resolvedRef,
                                phone: recipient_account,
                                operator: recipient_bank_code,
                                narration: `Excess Disbursement for Req #${id.slice(0, 8)}`
                            }, org.lenco_subaccount_id, org.lenco_secret_key);
                        } else {
                            const bankId = await LencoService.findBankId(recipient_bank_code || '', org.lenco_secret_key);
                            payout = await LencoService.createBankPayout({
                                amount: payoutAmount,
                                reference: resolvedRef,
                                accountNumber: recipient_account,
                                bankId,
                                narration: `Excess Disbursement for Req #${id.slice(0, 8)}`
                            }, org.lenco_subaccount_id, org.lenco_secret_key);
                        }
                    }
                    
                    lencoReference = payout.reference;

                    if (payout.status === 'failed') {
                        throw new Error(payout.reasonForFailure || payout.message || 'Transfer rejected by Lenco');
                    }
                    
                    let attempts = 0;
                    let currentStatus = payout.status;
                    const terminalStatuses = ['successful', 'failed', 'reversed'];

                    while (!terminalStatuses.includes(currentStatus) && attempts < 5) {
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        statusCheck = await LencoService.getTransferStatus(resolvedRef, org.lenco_secret_key);
                        currentStatus = statusCheck?.status || currentStatus;
                        attempts++;
                    }

                    if (currentStatus === 'failed') {
                        throw new Error(statusCheck?.reasonForFailure || statusCheck?.message || payout.reasonForFailure || 'Lenco reported transfer failure');
                    }

                    (req as any).lencoStatus = currentStatus;
                    (req as any).lencoFee = statusCheck?.fee ? parseFloat(statusCheck.fee) : undefined;
                }
            } catch (payoutError: any) {
                console.error('[Lenco Excess Payout Failed]', payoutError);
                return res.status(400).json({ 
                    error: `Excess disbursal error: ${payoutError.message}. Please try again.`,
                });
            }
        }

        const feeToUse = isDigital ? ((req as any).lencoFee || LencoService.calculatePayoutFee(payoutAmount, payment_method)) : 0;
        const totalExcessDeduction = payoutAmount + feeToUse;

        const newExternalRef = disbursement.external_reference 
            ? `${disbursement.external_reference} | EXC: ${lencoReference || payment_method}`
            : (lencoReference || payment_method);

        await supabase
            .from('disbursements')
            .update({
                total_prepared: originalDisbursed + totalExcessDeduction,
                external_reference: newExternalRef
            })
            .eq('id', disbursement.id);

        if (isDigital && feeToUse > 0) {
            const { data: existingFee } = await supabase
                .from('line_items')
                .select('id, estimated_amount, actual_amount, unit_price')
                .eq('requisition_id', id)
                .ilike('description', '%Withdrawal Fee%')
                .maybeSingle();

            if (existingFee) {
                await supabase.from('line_items').update({
                    unit_price: Number(existingFee.unit_price) + feeToUse,
                    estimated_amount: Number(existingFee.estimated_amount) + feeToUse,
                    actual_amount: Number(existingFee.actual_amount) + feeToUse
                }).eq('id', existingFee.id);
            } else {
                const chargesAccountId = await cashbookService.getOrCreateTransactionChargesAccount(organizationId);
                await supabase.from('line_items').insert({
                    requisition_id: id,
                    description: `Withdrawal Fee (Excess via ${payment_method})`,
                    quantity: 1,
                    unit_price: feeToUse,
                    estimated_amount: feeToUse,
                    actual_amount: feeToUse,
                    account_id: chargesAccountId
                });
            }

        } // Close if (isDigital && feeToUse > 0)

        // Always update estimated_total to reflect the new approved amount
        await supabase.from('requisitions').update({
            estimated_total: Number(requisition.estimated_total) + excess + feeToUse,
            actual_total: Number(requisition.actual_total) + feeToUse
        }).eq('id', id);

        const { data: reqUpdated } = await supabase.from('requisitions').select('actual_total').eq('id', id).single();
        const finalActualTotal = Number(reqUpdated?.actual_total || totalActual);

        // Find or Generate Voucher
        const baseVoucherRef = `PV-${requisition.reference_number || id.slice(0, 6)}`;
        let voucher: any = null;

        const { data: existingVoucher } = await supabase
            .from('vouchers')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('requisition_id', id)
            .maybeSingle();

        if (existingVoucher) {
            const { data: updatedVoucher, error: updateErr } = await supabase
                .from('vouchers')
                .update({
                    total_credit: finalActualTotal,
                    total_debit: finalActualTotal,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingVoucher.id)
                .select()
                .single();
            if (updateErr) throw updateErr;
            voucher = updatedVoucher;
        } else {
            let voucherRef = baseVoucherRef;
            const { data: refCheck } = await supabase
                .from('vouchers')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('reference_number', voucherRef)
                .maybeSingle();

            if (refCheck) {
                voucherRef = `${voucherRef}-${Date.now().toString().slice(-4)}`;
            }

            const { data: newVoucher, error: voucherError } = await supabase
                .from('vouchers')
                .insert({
                    requisition_id: id,
                    organization_id: organizationId,
                    created_by: cashier_id,
                    reference_number: voucherRef,
                    total_credit: finalActualTotal,
                    total_debit: finalActualTotal,
                    status: 'DRAFT'
                })
                .select()
                .single();

            if (voucherError) throw voucherError;
            voucher = newVoucher;
        }

        await cashbookService.finalizeDisbursement(
            organizationId,
            id,
            finalActualTotal,
            voucher.id,
            0,
            voucher.reference_number,
            payment_method
        );

        await supabase.from('requisitions').update({ status: 'CHANGE_SUBMITTED' }).eq('id', id);

        await RequisitionMessageService.createMessage({
            requisitionId: id,
            userId: cashier_id,
            content: `Excess expenditure of K${payoutAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} has been disbursed via ${payment_method}. The ledger has been updated.`,
            type: 'SYSTEM',
            metadata: { stage: 'CHANGE_SUBMITTED' }
        });

        await triggerAIReview(id, organizationId, cashier_id).catch(err => 
            console.error('[AI Review] Auto-trigger failed after excess:', err)
        );

        res.json({ message: 'Excess disbursed and ledger updated successfully' });

    } catch (error: any) {
        console.error('Error in disburseExcessRequisition:', error);
        res.status(500).json({ error: 'Failed to disburse excess', details: error.message });
    }
};

/**
 * Disburse batch payroll requisition via MoneyWise wallet (Lenco)
 */
export const disbursePayrollRequisition = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const cashier_id = (req as any).user.id;
        const organizationId = (req as any).user.organization_id;

        if (!organizationId) throw new Error("Missing organization context");

        // 1. Atomically check and lock status to prevent concurrent double disbursal
        let finalWalletId = req.body.wallet_id || req.body.walletId;

        if (!finalWalletId) {
            const { data: mainWallet } = await supabase
                .from('organization_wallets')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('is_main', true)
                .maybeSingle();
            
            if (mainWallet) {
                finalWalletId = mainWallet.id;
            }
        }

        const updateParams: any = { 
            status: 'RECEIVED', 
            updated_at: new Date().toISOString() 
        };
        if (finalWalletId) {
            updateParams.wallet_id = finalWalletId;
        }

        const { data: lockResult, error: lockError } = await supabase
            .from('requisitions')
            .update(updateParams)
            .eq('id', id)
            .eq('status', 'AUTHORISED')
            .eq('type', 'PAYROLL')
            .eq('organization_id', organizationId)
            .select('*');

        if (lockError || !lockResult || lockResult.length === 0) {
            return res.status(400).json({ 
                error: 'Requisition cannot be disbursed. It may have already been processed, is not in AUTHORISED status, is not of type PAYROLL, or does not belong to your organization.' 
            });
        }

        const requisition = lockResult[0];

        // 2. Fetch Lenco keys
        const { data: org } = await supabase
            .from('organizations')
            .select('lenco_subaccount_id, lenco_secret_key, payment_test_mode')
            .eq('id', organizationId)
            .single();

        const testMode = org?.payment_test_mode || false;
        const secretKey = org?.lenco_secret_key || process.env.LENCO_SECRET_KEY || undefined;
        const subaccountId = org?.lenco_subaccount_id || '';

        if (!testMode && (!subaccountId || !secretKey)) {
            // Revert status to AUTHORISED on failure
            await supabase.from('requisitions').update({ status: 'AUTHORISED' }).eq('id', id);
            return res.status(400).json({ error: 'Organization is not properly configured for MoneyWise Wallet payouts.' });
        }

        // 3. Fetch all valid line items
        const { data: lineItems, error: itemsError } = await supabase
            .from('line_items')
            .select('*')
            .eq('requisition_id', id)
            .eq('is_valid', true);

        if (itemsError || !lineItems || lineItems.length === 0) {
            await supabase.from('requisitions').update({ status: 'AUTHORISED' }).eq('id', id);
            return res.status(400).json({ error: 'No valid line items found to disburse' });
        }

        const successfulDisbursements: Array<{ item: any; amount: number; fee: number; reference: string }> = [];
        const failedDisbursements: Array<{ item: any; error: string }> = [];

        // 4. Process each employee payout
        for (const item of lineItems) {
            // Skip withdrawal fee items if they already exist
            if (item.description.toLowerCase().includes('withdrawal fee') || item.description.toLowerCase().includes('transaction charges')) {
                continue;
            }

            const amount = Number(item.estimated_amount);
            const fee = LencoService.calculatePayoutFee(amount, item.payment_method || 'BANK');
            const stableRef = `P-${id.slice(0, 8)}-${item.id.slice(0, 8)}`;

            // Check if disbursement already exists for this line item (idempotency check)
            const { data: existingDisb } = await supabase
                .from('disbursements')
                .select('*')
                .eq('line_item_id', item.id)
                .maybeSingle();

            if (existingDisb) {
                console.log(`[Payroll Disbursal] Disbursement already exists for line item ${item.id}. skipping.`);
                successfulDisbursements.push({
                    item,
                    amount,
                    fee,
                    reference: existingDisb.external_reference || ''
                });
                continue;
            }

            try {
                let lencoReference = '';
                if (testMode) {
                    lencoReference = `SIM-${stableRef}`;
                    console.log(`[Payroll Test Mode] Simulating payout for employee ${item.employee_name} of K${amount}`);
                } else {
                    let statusCheck;
                    let payout;
                    let resolvedRef = stableRef;

                    for (let i = 0; i < 10; i++) {
                        resolvedRef = i === 0 ? stableRef : `${stableRef}-R${i}`;
                        statusCheck = await LencoService.getTransferStatus(resolvedRef, secretKey);

                        if (!statusCheck) break;
                        if (statusCheck.status !== 'failed') break;
                    }

                    if (statusCheck && statusCheck.status !== 'failed') {
                        lencoReference = resolvedRef;
                        console.log(`[Payroll Disbursal] Found existing transfer on Lenco for ${resolvedRef}, reusing.`);
                    } else {
                        // Initiate new payout using resolvedRef
                        if (item.payment_method === 'MOBILE_MONEY') {
                            const operator = LencoService.resolveMobileOperator(item.recipient_account || '');
                            if (!operator) throw new Error(`Invalid mobile operator for account ${item.recipient_account}`);

                            payout = await LencoService.createMobileMoneyPayout({
                                amount,
                                reference: resolvedRef,
                                phone: item.recipient_account || '',
                                operator,
                                narration: `Payroll for ${item.employee_name}`
                            }, subaccountId, secretKey);
                            lencoReference = payout.reference || resolvedRef;
                        } else if (item.payment_method === 'BANK') {
                            const bankId = await LencoService.findBankId(item.recipient_bank_code || '', secretKey);
                            payout = await LencoService.createBankPayout({
                                amount,
                                reference: resolvedRef,
                                accountNumber: item.recipient_account || '',
                                bankId,
                                narration: `Payroll for ${item.employee_name}`
                            }, subaccountId, secretKey);
                            lencoReference = payout.reference || resolvedRef;
                        } else {
                            throw new Error(`Unsupported payment method: ${item.payment_method}`);
                        }

                        if (payout.status === 'failed') {
                            throw new Error(payout.reasonForFailure || payout.message || 'Transfer rejected by Lenco');
                        }
                    }
                }

                // Record individual disbursement for sub-item details
                await supabase.from('disbursements').insert({
                    requisition_id: id,
                    line_item_id: item.id,
                    cashier_id,
                    organization_id: organizationId,
                    payment_method: item.payment_method,
                    total_prepared: amount,
                    recipient_account: item.recipient_account,
                    recipient_bank_code: item.recipient_bank_code,
                    recipient_account_name: item.verified_name || item.employee_name,
                    external_reference: lencoReference,
                    issued_at: new Date().toISOString()
                });

                // Update line item actual amount
                await supabase
                    .from('line_items')
                    .update({ actual_amount: amount, updated_at: new Date().toISOString() })
                    .eq('id', item.id);

                successfulDisbursements.push({ item, amount, fee, reference: lencoReference });
            } catch (err: any) {
                console.error(`[Payroll Disbursal Failed] Employee: ${item.employee_name}, Error:`, err);
                failedDisbursements.push({ item, error: err.message || 'Payout failed' });
            }
        }

        // If all payouts failed and none succeeded, revert status and return error
        if (successfulDisbursements.length === 0 && failedDisbursements.length > 0) {
            await supabase.from('requisitions').update({ status: 'AUTHORISED' }).eq('id', id);
            return res.status(400).json({ 
                error: 'All payouts failed to process.', 
                details: failedDisbursements.map(f => `${f.item.employee_name}: ${f.error}`).join(', ') 
            });
        }

        // 5. Finalize Ledger & Transaction Fees based on ALL successful disbursements so far
        const { data: allDisbursements, error: allDisbError } = await supabase
            .from('disbursements')
            .select('total_prepared, payment_method')
            .eq('requisition_id', id);

        if (allDisbError) {
            throw new Error(`Failed to fetch all disbursements: ${allDisbError.message}`);
        }

        const totalAmountPaid = allDisbursements.reduce((sum, d) => sum + Number(d.total_prepared), 0);
        const totalFees = allDisbursements.reduce((sum, d) => sum + LencoService.calculatePayoutFee(Number(d.total_prepared), d.payment_method || 'BANK'), 0);
        const totalDeduction = totalAmountPaid + totalFees;

        // Check if cashbook entry already exists
        const { data: existingEntry } = await supabase
            .from('cashbook_entries')
            .select('id, date, created_at')
            .eq('requisition_id', id)
            .eq('entry_type', 'DISBURSEMENT')
            .maybeSingle();

        const ledgerDescription = `Batch Payroll payout for Requisition #${id.slice(0, 8)} (${allDisbursements.length} employees)`;

        if (existingEntry) {
            // Update existing entry
            await supabase
                .from('cashbook_entries')
                .update({
                    credit: totalDeduction,
                    description: ledgerDescription,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingEntry.id);

            // Recalculate balances starting from this entry's date
            await cashbookService.recalculateBalancesFrom(
                organizationId,
                existingEntry.date,
                existingEntry.created_at,
                'MONEYWISE_WALLET'
            );
        } else {
            // Log new entry
            await cashbookService.logDisbursement(
                organizationId,
                id,
                totalDeduction,
                cashier_id,
                ledgerDescription,
                'MONEYWISE_WALLET'
            );
        }

        // Record or update single withdrawal fee line item if fees > 0
        const chargesAccountId = await cashbookService.getOrCreateTransactionChargesAccount(organizationId);
        const { data: existingFee } = await supabase
            .from('line_items')
            .select('id')
            .eq('requisition_id', id)
            .ilike('description', '%Withdrawal Fee%')
            .maybeSingle();

        if (existingFee) {
            await supabase
                .from('line_items')
                .update({
                    unit_price: totalFees,
                    estimated_amount: totalFees,
                    actual_amount: totalFees,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingFee.id);
        } else if (totalFees > 0) {
            await supabase.from('line_items').insert({
                requisition_id: id,
                description: `Withdrawal Fee (Payroll Batch)`,
                quantity: 1,
                unit_price: totalFees,
                estimated_amount: totalFees,
                actual_amount: totalFees,
                account_id: chargesAccountId
            });
        }

        // Update requisition totals
        const { data: employeeLineItems } = await supabase
            .from('line_items')
            .select('estimated_amount, actual_amount')
            .eq('requisition_id', id)
            .not('description', 'ilike', '%Withdrawal Fee%');

        const baseEstimatedTotal = employeeLineItems?.reduce((sum, li) => sum + Number(li.estimated_amount), 0) || 0;
        const baseActualTotal = employeeLineItems?.reduce((sum, li) => sum + Number(li.actual_amount || li.estimated_amount), 0) || 0;

        await supabase.from('requisitions').update({
            estimated_total: baseEstimatedTotal + totalFees,
            actual_total: baseActualTotal + totalFees,
            updated_at: new Date().toISOString()
        }).eq('id', id);

        if (failedDisbursements.length > 0) {
            // Some payouts failed, revert requisition status back to AUTHORISED so they can retry
            await supabase
                .from('requisitions')
                .update({ 
                    status: 'AUTHORISED', 
                    updated_at: new Date().toISOString() 
                })
                .eq('id', id);

            // Send notification message for partial success
            await RequisitionMessageService.createMessage({
                requisitionId: id,
                userId: cashier_id,
                content: `Payroll payout partially completed. Succeeded: ${successfulDisbursements.length} employees. Failed: ${failedDisbursements.length} employees. Requisition remains AUTHORISED for retry.`,
                type: 'SYSTEM',
                metadata: {
                    stage: 'DISBURSAL_PARTIAL',
                    successfulCount: successfulDisbursements.length,
                    failedCount: failedDisbursements.length,
                    failedItems: failedDisbursements.map(f => ({ name: f.item.employee_name, error: f.error }))
                }
            });

            return res.json({ 
                message: 'Payroll partially disbursed. Some payouts failed. Requisition remains in AUTHORISED status.', 
                successfulCount: successfulDisbursements.length, 
                failedCount: failedDisbursements.length 
            });
        } else {
            // All payouts succeeded! Send full success message
            await RequisitionMessageService.createMessage({
                requisitionId: id,
                userId: cashier_id,
                content: `Consolidated Payroll Disbursed successfully for ${successfulDisbursements.length} employees. Total amount: K${totalAmountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}. Total transaction fees: K${totalFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
                type: 'SYSTEM',
                metadata: { 
                    stage: 'DISBURSAL_SUCCESS', 
                    successfulCount: successfulDisbursements.length,
                    failedCount: failedDisbursements.length
                }
            });

            // Trigger AI Review which will automatically bypass and post deterministically
            await triggerAIReview(id, organizationId, cashier_id).catch(err => 
                console.error('[AI Review] Auto-trigger failed after payroll disbursal:', err)
            );

            return res.json({ 
                message: 'Payroll disbursed successfully', 
                successfulCount: successfulDisbursements.length, 
                failedCount: failedDisbursements.length 
            });
        }

    } catch (error: any) {
        console.error('Error in disbursePayrollRequisition:', error);
        res.status(500).json({ error: 'Failed to process payroll batch disbursal', details: error.message });
    }
};
