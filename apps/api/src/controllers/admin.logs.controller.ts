import { supabase } from '../lib/supabase';

/**
 * GET /admin/logs
 * Paginated read of vercel_function_logs — real Vercel Function invocation
 * logs delivered via the log drain (see webhooks.routes.ts), independent of
 * client-side telemetry. Supports filtering by level, path substring, exact
 * status code, and a free-text message search.
 */
export const getVercelLogs = async (req: any, res: any) => {
    try {
        const limit = Math.min(Number(req.query?.limit) || 50, 200);
        const offset = Math.max(Number(req.query?.offset) || 0, 0);

        let query = supabase
            .from('vercel_function_logs')
            .select('*', { count: 'exact' })
            .order('received_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (req.query?.level) query = query.eq('level', String(req.query.level));
        if (req.query?.path) query = query.ilike('path', `%${req.query.path}%`);
        if (req.query?.statusCode) query = query.eq('status_code', Number(req.query.statusCode));
        if (req.query?.search) query = query.ilike('message', `%${req.query.search}%`);

        const { data, error, count } = await query;
        if (error) throw error;

        res.json({
            logs: (data || []).map((row: any) => ({
                id: row.id,
                vercelLogId: row.vercel_log_id,
                deploymentId: row.deployment_id,
                source: row.source,
                level: row.level,
                message: row.message,
                path: row.path,
                statusCode: row.status_code,
                requestId: row.request_id,
                environment: row.environment,
                executionRegion: row.execution_region,
                vercelTimestamp: row.vercel_timestamp,
                receivedAt: row.received_at,
            })),
            total: count ?? 0,
            limit,
            offset,
        });
    } catch (err: any) {
        console.error('[AdminLogs] Failed to fetch vercel logs:', err?.message || err);
        res.status(500).json({ error: 'Failed to load logs', details: err?.message });
    }
};
