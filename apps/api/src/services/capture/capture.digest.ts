import { supabase } from '../../lib/supabase';
import { pushService } from '../push.service';
import { getCaptureSettings } from './capture.settings';

const REVIEWERS = ['OWNER', 'ADMIN', 'ACCOUNTANT'];

/** One push per org per day, only when something was captured. Capture never pushes per message. */
export async function sendCaptureDigests(budgetMs: number) {
    const deadline = Date.now() + budgetMs;
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const result = { orgs: 0, sent: 0, errors: [] as string[] };

    const { data: orgs, error } = await supabase.from('capture_settings').select('organization_id').eq('enabled', true);
    if (error) throw new Error(`Could not load capture orgs: ${error.message}`);

    for (const { organization_id: orgId } of orgs || []) {
        if (Date.now() > deadline) break;
        result.orgs++;
        try {
            if (!(await getCaptureSettings(orgId)).enabled) continue;   // plan lapsed
            const [captured, toReview] = await Promise.all([
                supabase.from('transaction_captures').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).gte('created_at', since),
                supabase.from('transaction_captures').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'NEEDS_REVIEW'),
            ]);
            const n = captured.count ?? 0;
            if (n === 0) continue;
            const m = toReview.count ?? 0;
            await pushService.sendToRoles(orgId, REVIEWERS, {
                title: 'Captured transactions',
                body: `${n} transaction${n === 1 ? '' : 's'} captured, ${m} need${m === 1 ? 's' : ''} review`,
                orgId, data: { type: 'capture_digest' },
            });
            result.sent++;
        } catch (e: any) {
            result.errors.push(`org ${orgId}: ${e?.message}`);
        }
    }
    return result;
}
