import { supabase } from '../../lib/supabase';

export class MetricsService {
    /**
     * Increments daily metrics for AI performance tracking.
     */
    async trackMetric(type: 'prediction' | 'override' | 'rule' | 'ai' | 'memory' | 'low_confidence'): Promise<void> {
        try {
            const columnMap = {
                prediction: 'prediction_count',
                override: 'override_count',
                rule: 'rule_hits',
                ai: 'ai_hits',
                memory: 'memory_hits',
                low_confidence: 'low_confidence_count'
            };

            const column = columnMap[type];
            if (!column) return;

            const date = new Date().toISOString().split('T')[0];

            await supabase.rpc('increment_daily_metric', {
                metric_column: column,
                target_date: date
            });
        } catch (err) {
            console.error('[MetricsService] Failed to track metric:', err);
        }
    }

    /**
     * Tracks granular accuracy per account, vendor, and method.
     */
    async trackGranularMetric(id: string, name: string, type: 'account' | 'vendor' | 'method', wasOverridden: boolean): Promise<void> {
        try {
            const date = new Date().toISOString().split('T')[0];
            const column = type === 'account' ? 'accuracy_by_account' : type === 'vendor' ? 'accuracy_by_vendor' : 'method_precision';

            // Use a specialized RPC or manual JSONB update for daily record
            const { data } = await supabase.from('ai_metrics').select('id, ' + column).eq('date', date).single();

            if (data && (data as any).id) {
                const record = data as any;
                const recordId = record.id;
                const current = record[column] || {};
                const stats = current[id] || { total: 0, hits: 0, name };
                stats.total++;
                if (!wasOverridden) stats.hits++;

                await supabase.from('ai_metrics').update({
                    [column]: { ...current, [id]: stats }
                }).eq('id', recordId);
            } else {
                await supabase.from('ai_metrics').insert({
                    date,
                    [column]: { [id]: { total: 1, hits: wasOverridden ? 0 : 1, name } }
                });
            }
        } catch (err) {
            console.error('[MetricsService] Failed to track granular metric:', err);
        }
    }
}

export const metricsService = new MetricsService();
