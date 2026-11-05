import { supabase } from '../../lib/supabase';
import { classifyMessage } from '../messageIntent.service';
import { getCaptureSettings } from './capture.settings';
import { processAttachmentJob, rematchPending } from './capture.service';

export interface DrainResult {
    claimed: number;
    completed: number;
    deferred: number;
    retried: number;
    failed: number;
    rematched: number;
    errors: string[];
}
/**
 * Drains capture_jobs one at a time until the budget runs out (claim/complete/fail RPCs give SKIP LOCKED, retries with
 * backoff and FAILED after 3 attempts), then spends what is left re-matching open captures. Used by the 1-minute cron
 * and, best-effort, right after an upload.
 */
export async function drainCaptureJobs(budgetMs: number): Promise<DrainResult> {
    const deadline = Date.now() + budgetMs;
    const r: DrainResult = {
        claimed: 0,
        completed: 0,
        deferred: 0,
        retried: 0,
        failed: 0,
        rematched: 0,
        errors: []
    };
    while (Date.now() < deadline) {
        const { data: jobs, error: claimError } = await supabase.rpc('claim_capture_jobs', { p_limit: 1 });
        if (claimError) throw new Error(`Could not claim capture job: ${claimError.message}`);
        if (!jobs || jobs.length === 0) break;
        const job = jobs[0];
        r.claimed++;
        try {
            // Do not process jobs for organisations that have disabled capture.
            // Defer them without consuming a retry attempt.
            const settings = await getCaptureSettings(job.organization_id);

            if (!settings.enabled) {
                const { data: deferred, error } = await supabase.rpc(
                    'defer_capture_job',
                    { p_job_id: job.job_id }
                );

                if (error) {
                    throw new Error(`Could not defer job: ${error.message}`);
                }

                if (deferred !== true) {
                    throw new Error('Job was not in PROCESSING state when deferral was attempted');
                }

                r.deferred++;
                continue;
            }

            if (job.kind === 'ATTACHMENT') {
                await processAttachmentJob(job);
            } else {
                await classifyMessage(job.message_id, job.organization_id);
            }

            const { data: ok, error } = await supabase.rpc(
                'complete_capture_job',
                { p_job_id: job.job_id }
            );

            if (error) throw new Error(`Could not complete job: ${error.message}`);
            if (ok !== true) throw new Error('Job was not in PROCESSING state when completion was attempted');

            r.completed++;
        } catch (e: any) {
            const message = e?.message || 'Unknown processing error';
            console.error(`[CaptureWorker] Job ${job.job_id} (${job.kind}), attempt ${job.attempts}:`, message);

            const { data: status, error } = await supabase.rpc(
                'fail_capture_job',
                { p_job_id: job.job_id, p_error: message }
            );

            if (error) throw new Error(`Could not record job failure for ${job.job_id}: ${error.message}`);
            if (status === 'RETRY') r.retried++;
            else if (status === 'FAILED') r.failed++;
            else r.errors.push(`Job ${job.job_id}: unexpected failure status ${status}`);
        }
    }

    if (Date.now() < deadline - 2000) {
        try { r.rematched = await rematchPending(deadline); }
        catch (e: any) { r.errors.push(`rematch: ${e?.message}`); }
    }
    return r;
}
