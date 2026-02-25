import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';

export const getDailyMetrics = async (req: AuthRequest, res: Response) => {
    try {
        const { days = 30 } = req.query;

        const { data, error } = await supabase
            .from('ai_metrics')
            .select('*')
            .order('date', { ascending: false })
            .limit(Number(days));

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getClassificationStats = async (req: AuthRequest, res: Response) => {
    try {
        // Aggregate stats from logs
        const { data, error } = await supabase
            .from('ai_classification_logs')
            .select('was_overridden');

        if (error) throw error;

        // Simple aggregation logic
        const stats = {
            total: data?.length || 0,
            overridden: data?.filter(l => l.was_overridden).length || 0,
            accuracy: data?.length ? ((data.length - data.filter(l => l.was_overridden).length) / data.length) * 100 : 0,
            byMethod: {} as any
        };

        // Fallback for missing methods column
        data?.forEach(log => {
            const method = 'RULES'; // Defaulting to Rules since prediction_method isn't tracked yet
            if (!stats.byMethod[method]) stats.byMethod[method] = { total: 0, overrides: 0 };
            stats.byMethod[method].total++;
            if (log.was_overridden) stats.byMethod[method].overrides++;
        });

        res.json(stats);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
