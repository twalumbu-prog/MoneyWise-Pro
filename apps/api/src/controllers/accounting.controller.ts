import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { QuickBooksService } from '../services/quickbooks.service';

export const postVoucher = async (req: AuthRequest, res: any): Promise<any> => {
    const stages: string[] = [];
    try {
        const { id } = req.params; // Requisition ID
        const { items, payment_account_id, payment_account_name } = req.body;
        const organization_id = (req as any).user.organization_id;
        const user_id = (req as any).user.id;

        // ── Stage 1: Validate Context ──
        stages.push('Stage 1: Validating context');
        console.log(`[PostVoucher] Stage 1: Validating context for requisition ${id}`);

        if (!organization_id) {
            return res.status(400).json({
                error: 'Organization context missing',
                stage: 'validation',
                details: 'User does not have an organization_id. Ensure user profile is complete.'
            });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                error: 'No items provided for classification',
                stage: 'validation',
                details: 'The request body must include an "items" array with at least one item.'
            });
        }

        if (!payment_account_id) {
            return res.status(400).json({
                error: 'Payment account missing',
                stage: 'validation',
                details: 'You must select a bank or cash account as the source of payment.'
            });
        }

        // ── Stage 2: Validate User Role ──
        stages.push('Stage 2: Validating user role');
        console.log(`[PostVoucher] Stage 2: Checking role for user ${user_id}`);

        const { data: userRecord, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', user_id)
            .single();

        if (userError || !userRecord) {
            return res.status(403).json({
                error: 'User profile not found',
                stage: 'role_check',
                details: userError?.message || 'Could not fetch user record'
            });
        }

        if (userRecord.role !== 'ACCOUNTANT' && userRecord.role !== 'ADMIN') {
            return res.status(403).json({
                error: 'Unauthorized: Accountant or Admin access required',
                stage: 'role_check',
                details: `Your role is "${userRecord.role}". Only ACCOUNTANT or ADMIN can post vouchers.`
            });
        }

        // ── Stage 3: Validate Requisition State ──
        stages.push('Stage 3: Validating requisition state');
        console.log(`[PostVoucher] Stage 3: Fetching requisition ${id}`);

        const { data: requisition, error: reqError } = await supabase
            .from('requisitions')
            .select('*, vouchers(*)')
            .eq('id', id)
            .single();

        if (reqError || !requisition) {
            return res.status(404).json({
                error: 'Requisition not found',
                stage: 'requisition_check',
                details: reqError?.message || `No requisition with ID: ${id}`
            });
        }

        if (requisition.status !== 'COMPLETED') {
            return res.status(400).json({
                error: `Requisition must be COMPLETED to post voucher. Current status: "${requisition.status}"`,
                stage: 'requisition_check',
                details: 'The requisition must go through: APPROVED → DISBURSED → COMPLETED before posting.'
            });
        }

        // ── Stage 4: Save QB Classification to Line Items ──
        stages.push('Stage 4: Saving QB classification to line items');
        console.log(`[PostVoucher] Stage 4: Updating ${items.length} line items with QB account mapping`);

        for (const item of items) {
            if (!item.id) {
                console.warn(`[PostVoucher] Skipping item without ID`);
                continue;
            }

            if (!item.qb_account_id) {
                return res.status(400).json({
                    error: `Item "${item.description || item.id}" is missing a QuickBooks account assignment`,
                    stage: 'classification',
                    details: 'All items must have a qb_account_id from the QuickBooks chart of accounts.'
                });
            }

            const { error: itemError } = await supabase
                .from('line_items')
                .update({
                    qb_account_id: item.qb_account_id,
                    qb_account_name: item.qb_account_name || null
                })
                .eq('id', item.id)
                .eq('requisition_id', id);

            if (itemError) {
                console.error(`[PostVoucher] Failed to update line item ${item.id}:`, itemError);
                return res.status(500).json({
                    error: `Failed to save classification for item "${item.description || item.id}"`,
                    stage: 'classification',
                    details: itemError.message
                });
            }
        }

        // ── Stage 5: Update Voucher Status & Payment Info ──
        stages.push('Stage 5: Updating voucher status');
        console.log(`[PostVoucher] Stage 5: Updating voucher status to POSTED_TO_QB and setting payment account`);

        const voucher = requisition.vouchers?.[0];
        if (voucher) {
            const { error: voucherError } = await supabase
                .from('vouchers')
                .update({
                    status: 'POSTED_TO_QB',
                    payment_account_id,
                    payment_account_name,
                    posted_at: new Date().toISOString(),
                    posted_by: user_id
                })
                .eq('id', voucher.id);

            if (voucherError) {
                console.error(`[PostVoucher] Failed to update voucher status:`, voucherError);
                return res.status(500).json({
                    error: 'Failed to update voucher status',
                    stage: 'voucher_update',
                    details: voucherError.message
                });
            }
        } else {
            console.warn(`[PostVoucher] No voucher found for requisition ${id}. Continuing to QB sync anyway.`);
        }

        // ── Stage 6: Post to QuickBooks ──
        stages.push('Stage 6: Posting to QuickBooks');
        console.log(`[PostVoucher] Stage 6: Calling QuickBooks createExpense with source account ${payment_account_name}`);

        try {
            const qbResult = await QuickBooksService.createExpense(
                id,
                user_id,
                organization_id,
                payment_account_id,
                payment_account_name
            );

            if (!qbResult.success) {
                console.error('[PostVoucher] QuickBooks returned failure:', qbResult.error);
                return res.status(500).json({
                    error: 'QuickBooks rejected the expense',
                    stage: 'quickbooks_sync',
                    details: typeof qbResult.error === 'object' ? JSON.stringify(qbResult.error) : qbResult.error
                });
            }

            // ── Stage 7: Update Requisition Status ──
            stages.push('Stage 7: Updating requisition to ACCOUNTED');
            console.log(`[PostVoucher] Stage 7: Marking requisition as ACCOUNTED`);

            await supabase
                .from('requisitions')
                .update({ status: 'ACCOUNTED' })
                .eq('id', id);

            console.log(`[PostVoucher] ✅ Success! Requisition ${id} posted to QuickBooks`);
            res.json({
                message: 'Voucher posted and synced to QuickBooks successfully',
                qb_expense_id: qbResult.qbId,
                stages_completed: stages
            });

        } catch (qbError: any) {
            console.error('[PostVoucher] QuickBooks sync threw error:', qbError.message);
            return res.status(500).json({
                error: 'QuickBooks sync failed',
                stage: 'quickbooks_sync',
                details: qbError.message,
                stages_completed: stages
            });
        }

    } catch (error: any) {
        console.error('[PostVoucher] Unexpected error:', error);
        res.status(500).json({
            error: 'Failed to post voucher',
            stage: 'unexpected',
            details: error.message,
            stages_completed: stages
        });
    }
};
