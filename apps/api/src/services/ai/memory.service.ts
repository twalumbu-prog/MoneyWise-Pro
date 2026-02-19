
import crypto from 'crypto';
import { supabase } from '../../lib/supabase';

export const memoryService = {
    generateSignature(description: string): string {
        const normalized = description.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
        return crypto.createHash('sha256').update(normalized).digest('hex');
    },

    async learnFromRequisition(requisitionId: string) {
        try {
            console.log(`[AI Memory] Learning from requisition: ${requisitionId}`);

            // 1. Fetch line items
            const { data: items, error } = await supabase
                .from('line_items')
                .select('description, account_id')
                .eq('requisition_id', requisitionId);

            if (error) throw error;
            if (!items) return;

            // 2. Process each item
            for (const item of items) {
                if (!item.account_id || !item.description) continue;

                const signature = this.generateSignature(item.description);

                // Upsert into memory
                const { error: upsertError } = await supabase
                    .from('ai_transaction_memory')
                    .upsert({
                        description_signature: signature,
                        system_account_id: item.account_id,
                        intent: { source: 'feedback', validated: true },
                        confidence: 1.0,
                        usage_count: 1, // Simplified, in SQL we could use increments
                        last_used_at: new Date().toISOString()
                    }, {
                        onConflict: 'description_signature'
                    });

                if (upsertError) {
                    console.error(`[AI Memory] Failed to upsert signature ${signature}:`, upsertError);
                }
            }

            console.log(`[AI Memory] Successfully processed ${items.length} items.`);
        } catch (err) {
            console.error('[AI Memory] Error in learning phase:', err);
        }
    },

    async lookup(description: string): Promise<{ account_id: string, confidence: number } | null> {
        try {
            const signature = this.generateSignature(description);
            const { data, error } = await supabase
                .from('ai_transaction_memory')
                .select('system_account_id, confidence')
                .eq('description_signature', signature)
                .single();

            if (error || !data) return null;

            return {
                account_id: data.system_account_id,
                confidence: data.confidence
            };
        } catch (err) {
            console.error('[AI Memory] Lookup error:', err);
            return null;
        }
    }
};
