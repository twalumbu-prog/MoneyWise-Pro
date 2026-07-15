import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';

/**
 * Vercel Log Drain ingest. Mounted with express.raw() (see index.ts) so the
 * exact bytes Vercel signs are available for HMAC verification — parsing
 * through express.json() first would both break signature verification and
 * choke on NDJSON payloads, which aren't valid single-document JSON.
 */
export const ingestVercelLogDrain = async (req: Request, res: Response) => {
    const secret = process.env.VERCEL_LOG_DRAIN_SECRET;
    const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');

    if (!secret) {
        console.error('[VercelLogDrain] VERCEL_LOG_DRAIN_SECRET not set — rejecting all deliveries');
        return res.status(403).json({ error: 'Not configured' });
    }

    const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
    const provided = req.headers['x-vercel-signature'];
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(typeof provided === 'string' ? provided : '', 'hex');

    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
        console.error('[VercelLogDrain] Signature mismatch — rejecting delivery');
        return res.status(403).json({ code: 'invalid_signature', error: "signature didn't match" });
    }

    // Vercel batches entries either as a JSON array or as newline-delimited
    // JSON depending on delivery format — handle both defensively.
    const text = rawBody.toString('utf-8').trim();
    let entries: any[] = [];
    try {
        const parsed = JSON.parse(text);
        entries = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        entries = text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
    }

    // Always ack 200 quickly once verified — Vercel disables a drain that
    // fails >80% of deliveries or 50+ times in an hour, so a downstream
    // Supabase hiccup must never surface as a delivery failure to Vercel.
    res.json({ received: entries.length });

    // Break the self-referential loop: the drain POSTs to this very endpoint,
    // which itself produces logs that get drained right back. Dropping them at
    // ingest keeps the table (and Vercel's per-volume drain billing) sane. The
    // Vercel-side path filter is a belt-and-suspenders on top of this.
    const meaningful = entries.filter((e) => e?.proxy?.path !== '/webhooks/vercel-log-drain');

    if (meaningful.length === 0) return;

    try {
        const rows = meaningful.map((e) => ({
            vercel_log_id: e.id ?? null,
            deployment_id: e.deploymentId ?? null,
            project_id: e.projectId ?? null,
            source: e.source ?? null,
            level: e.level ?? null,
            message: typeof e.message === 'string' ? e.message.slice(0, 8000) : null,
            path: e.path ?? null,
            entrypoint: e.entrypoint ?? null,
            status_code: typeof e.statusCode === 'number' ? e.statusCode : null,
            request_id: e.requestId ?? null,
            environment: e.environment ?? null,
            execution_region: e.executionRegion ?? null,
            vercel_timestamp: typeof e.timestamp === 'number' ? new Date(e.timestamp).toISOString() : null,
            raw: e,
        }));

        const { error } = await supabase.from('vercel_function_logs').upsert(rows, { onConflict: 'vercel_log_id', ignoreDuplicates: true });
        if (error) console.error('[VercelLogDrain] Failed to insert log batch:', error.message);
    } catch (err: any) {
        console.error('[VercelLogDrain] Unexpected error processing batch:', err?.message || err);
    }
};
