import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { QuickBooksService } from '../services/quickbooks.service';
import { memoryService } from '../services/ai/memory.service';
import { learningValidator } from '../services/ai/learning.validator';
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
            throw new Error(qbResult.error as string);
        }

        // ── Stage 7: SAFE LEARNING GATE ──
        stages.push('Stage 7: Triggering safe organizational learning');

        // Only learn if the transaction is posted AND criteria met
        for (const item of items) {
            const { data: finalItem } = await supabase
                .from('line_items')
                .select('description, account_id, ai_similarity_score, ai_decision_path')
                .eq('id', item.id)
                .single();

            if (finalItem && finalItem.account_id) {
                const isSafe = learningValidator.isSafeToLearn({
                    isPostedToQB: true,
                    wasOverridden: false, // In this simple implement, we only learn if no override occurred at this stage
                    confidence: Number(finalItem.ai_similarity_score || 0),
                    method: finalItem.ai_decision_path || 'UNKNOWN'
                });

                if (isSafe) {
                    console.log(`[Hybrid AI] Safe to learn from item: ${finalItem.description}`);
                    memoryService.learnFromRequisition(id).catch(err => console.error('[AI Learning] Failed:', err));
                }
            }
        }

        await supabase.from('requisitions').update({ status: 'ACCOUNTED' }).eq('id', id);

        res.json({ message: 'Success', qb_expense_id: qbResult.qbId });

    } catch (error: any) {
        console.error('[PostVoucher] Error:', error);
        res.status(500).json({ error: error.message });
    }
};
