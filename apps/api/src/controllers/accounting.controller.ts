import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { QuickBooksService } from '../services/quickbooks.service';
import { memoryService } from '../services/ai/memory.service';
import { metricsService } from '../services/ai/metrics.service';

export const postVoucher = async (req: AuthRequest, res: any): Promise<any> => {
    const stages: string[] = [];
    try {
        const { id } = req.params; // Requisition ID
        const { items, payment_account_id, payment_account_name } = req.body;
        const organization_id = (req as any).user.organization_id;
        const user_id = (req as any).user.id;

        // ── Stage 1: Validate Context ──
        stages.push('Stage 1: Validating context');
        if (!organization_id) {
            return res.status(400).json({ error: 'Organization context missing' });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'No items provided' });
        }

        // ── Stage 4: Save & Log Classification ──
        stages.push('Stage 4: Saving QB classification and logging results');

        for (const item of items) {
            if (!item.id || !item.qb_account_id) continue;

            // 1. Fetch existing item to check for overrides
            const { data: existingItem } = await supabase
                .from('line_items')
                .select('account_id, ai_decision_path, ai_similarity_score, description')
                .eq('id', item.id)
                .single();

            const wasOverridden = existingItem && existingItem.account_id && existingItem.account_id !== item.system_account_id;

            // 2. Update Line Item
            await supabase
                .from('line_items')
                .update({
                    qb_account_id: item.qb_account_id,
                    qb_account_name: item.qb_account_name || null
                })
                .eq('id', item.id);

            // 3. Log AI classification performance
            if (existingItem) {
                await supabase.from('ai_classification_logs').insert({
                    transaction_id: id,
                    line_item_index: 0, // Simplified or pass from frontend
                    suggested_account_id: existingItem.account_id,
                    final_account_id: item.system_account_id || existingItem.account_id,
                    was_overridden: wasOverridden,
                    prediction_confidence: existingItem.ai_similarity_score,
                    prediction_method: existingItem.ai_decision_path
                });

                if (wasOverridden) {
                    await metricsService.trackMetric('override');
                } else {
                    await metricsService.trackMetric('prediction');
                }
            }
        }

        // ── Stage 6: Post to QuickBooks ──
        stages.push('Stage 6: Posting to QuickBooks');
        const qbResult = await QuickBooksService.createExpense(
            id, user_id, organization_id, payment_account_id, payment_account_name
        );

        if (!qbResult.success) {
            const errorMsg = typeof qbResult.error === 'object'
                ? (qbResult.error?.Fault?.Error?.[0]?.Detail || qbResult.error?.Fault?.Error?.[0]?.Message || JSON.stringify(qbResult.error))
                : String(qbResult.error);
            throw new Error(errorMsg);
        }

        // ── Stage 7: ORGANIZATIONAL LEARNING ──
        stages.push('Stage 7: Triggering organizational learning');

        // The voucher has been posted to QuickBooks — these mappings are now verified
        // ground truth. Learn them authoritatively (per-organization) so identical
        // descriptions auto-fill next time.
        memoryService.learnFromRequisition(id, { authoritative: true }).catch(err =>
            console.error('[AI Learning] postVoucher learn failed:', err)
        );

        await supabase.from('requisitions').update({ status: 'ACCOUNTED' }).eq('id', id);

        res.json({ message: 'Success', qb_expense_id: qbResult.qbId });

    } catch (error: any) {
        console.error('[PostVoucher] Error:', error);
        res.status(500).json({ error: error.message });
    }
};
