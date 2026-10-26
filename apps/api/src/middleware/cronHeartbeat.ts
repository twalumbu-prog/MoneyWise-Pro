import { supabase } from '../lib/supabase';

/**
 * Records a heartbeat for requests dispatched by the internal scheduler (public.internal_cron_call).
 *
 * The scheduler tags each call with `X-Cron-Job: <job>` and the shared secret. We only record when BOTH are
 * present and the secret matches, so an outsider can't forge or pollute heartbeats. Nothing here can fail a
 * request: every DB write is best-effort.
 *
 * The finishing write is awaited BEFORE the response is flushed (not on 'finish'), because a serverless
 * function can be frozen the moment the response ends and the write would be lost.
 */
export const cronHeartbeat = async (req: any, res: any, next: any) => {
    const job = req.headers['x-cron-job'];
    const secret = process.env.LENCO_SYNC_SECRET;
    if (typeof job !== 'string' || !job || !secret || req.headers['authorization'] !== `Bearer ${secret}`) {
        return next();
    }

    const startedAt = Date.now();
    try {
        await supabase.from('job_heartbeats').upsert(
            { job, last_started_at: new Date(startedAt).toISOString() },
            { onConflict: 'job' }
        );
    } catch { /* best effort */ }

    const originalEnd = res.end.bind(res);
    let recorded = false;
    res.end = (...args: any[]) => {
        if (recorded) return originalEnd(...args);
        recorded = true;
        const status: number = res.statusCode;
        const finishedAt = new Date();
        const row: Record<string, any> = {
            job,
            last_finished_at: finishedAt.toISOString(),
            last_status: status,
            last_duration_ms: finishedAt.getTime() - startedAt,
            last_error: status >= 400 ? `HTTP ${status}` : null,
        };
        if (status < 400) row.last_success_at = finishedAt.toISOString();
        Promise.resolve(supabase.from('job_heartbeats').upsert(row, { onConflict: 'job' }))
            .catch(() => { /* best effort */ })
            .finally(() => originalEnd(...args));
        return res;
    };

    next();
};
