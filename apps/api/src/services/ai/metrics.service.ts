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

            // Upsert for today
            const { error } = await supabase.rpc('increment_daily_metric', {
                metric_column: column,
                target_date: date
            });

            if (error) {
                // Fallback to manual upsert if RPC doesn't exist (though we should add it to migration)
                console.warn('[MetricsService] RPC increment_daily_metric failed, falling back to manual update.');
                await this.manualUpdate(column, date);
            }
        } catch (err) {
            console.error('[MetricsService] Failed to track metric:', err);
        }
    }

    private async manualUpdate(column: string, date: string) {
        const { data, error } = await supabase
            .from('ai_metrics')
            .select(`id, ${column}`)
            .eq('date', date)
            .single();

        if (error || !data) {
            await supabase.from('ai_metrics').insert({ date, [column]: 1 });
        } else {
            const record = data as any;
            await supabase
                .from('ai_metrics')
                .update({ [column]: record[column] + 1 })
                .eq('id', record.id);
        }
    }
}

export const metricsService = new MetricsService();
