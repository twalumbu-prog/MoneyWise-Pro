import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';

/**
 * GET /usage/export — the cost ledger for the central system to pull. Not for signed-in users: it is opened with a shared key
 * (USAGE_EXPORT_KEY, sent as the x-export-key header), so nothing here is reachable without it, and with no key set it is switched off.
 *
 *   view=events       one row per billable event          (from, to, organizationId, kind, category, limit, after)
 *   view=monthly      direct cost per business, month, category, kind and currency   (from, to, organizationId)
 *   view=infra_share  each business's share of the shared monthly bills           (from, to, organizationId)
 *
 * from / to are dates (YYYY-MM-DD, to is exclusive). `events` is paged: pass the `next` value back as `after` to get the next page.
 */
const router = Router();

const sameKey = (given: string, wanted: string) => {
    const a = crypto.createHash('sha256').update(given).digest();
    const b = crypto.createHash('sha256').update(wanted).digest();
    return crypto.timingSafeEqual(a, b);
};

router.get('/export', async (req: Request, res: Response) => {
    const wanted = process.env.USAGE_EXPORT_KEY;
    if (!wanted) return res.status(503).json({ error: 'The usage export is not switched on (USAGE_EXPORT_KEY is not set).' });
    if (!sameKey(String(req.get('x-export-key') ?? ''), wanted)) return res.status(401).json({ error: 'Invalid export key.' });

    try {
        const q = req.query as Record<string, string | undefined>;
        const view = q.view || 'events';
        const day = /^\d{4}-\d{2}-\d{2}$/;
        const from = q.from && day.test(q.from) ? q.from : null;
        const to = q.to && day.test(q.to) ? q.to : null;
        const org = q.organizationId && /^[0-9a-f-]{36}$/i.test(q.organizationId) ? q.organizationId : null;

        if (view === 'events') {
            const limit = Math.min(Math.max(Number(q.limit) || 1000, 1), 5000);
            let qb = supabase.from('usage_events').select('*').order('occurred_at', { ascending: true }).order('id', { ascending: true }).limit(limit + 1);
            if (from) qb = qb.gte('occurred_at', from);
            if (to) qb = qb.lt('occurred_at', to);
            if (org) qb = qb.eq('organization_id', org);
            if (q.kind) qb = qb.eq('kind', q.kind);
            if (q.category) qb = qb.eq('category', q.category);
            if (q.after) {
                const [at, id] = String(q.after).split('|');
                if (at && id) qb = qb.or(`occurred_at.gt.${at},and(occurred_at.eq.${at},id.gt.${id})`);
            }
            const { data, error } = await qb;
            if (error) throw error;
            const rows = (data ?? []).slice(0, limit);
            const more = (data ?? []).length > limit;
            const last = rows[rows.length - 1] as any;
            return res.json({ view, count: rows.length, next: more && last ? `${last.occurred_at}|${last.id}` : null, rows });
        }

        const table = view === 'monthly' ? 'org_cost_monthly' : view === 'infra_share' ? 'org_infra_share_monthly' : null;
        if (!table) return res.status(400).json({ error: 'view must be events, monthly or infra_share.' });
        let qb = supabase.from(table).select('*').order('month', { ascending: true });
        if (from) qb = qb.gte('month', from);
        if (to) qb = qb.lt('month', to);
        if (org) qb = qb.eq('organization_id', org);
        const { data, error } = await qb;
        if (error) throw error;
        res.json({ view, count: data?.length ?? 0, rows: data ?? [] });
    } catch (e: any) {
        console.error('[Usage export]', e?.message ?? e);
        res.status(500).json({ error: 'Could not read the usage data.' });
    }
});

export default router;
