import { supabase } from '../lib/supabase';
import { emailService } from '../services/email.service';
import { healMissingPlatformFeesWithinBudget, runDailyBalanceCheck, RECON_TOLERANCE } from '../services/reconciliation.service';
import { autoCompleteRequisition, sendAutoCategorizationReminder } from './requisition.controller';

/**
 * Handlers for the internal scheduler (public.internal_cron_call -> these routes). All secret-gated with
 * LENCO_SYNC_SECRET like the other cron entry points. Heartbeats are recorded by middleware/cronHeartbeat.
 */

const isCronCall = (req: any): boolean => {
    const secret = process.env.LENCO_SYNC_SECRET;
    return !!secret && req.headers['authorization'] === `Bearer ${secret}`;
};

/** Run an Express-style handler in-process and capture what it would have replied. */
async function invokeHandler(handler: (req: any, res: any) => any, req: any): Promise<{ status: number; body: any }> {
    const out = { status: 200, body: undefined as any };
    const res: any = {
        status(code: number) { out.status = code; return res; },
        json(body: any) { out.body = body; return res; },
    };
    await handler(req, res);
    return out;
}

// Hourly reminder (12h) + auto-categorise (24h) sweep. Port of the retired auto-complete-requisitions edge
// function. After an outage the 24h set can be large and each completion runs an AI review, so we cap how
// many are completed per run and stop at a time budget; the rest roll into the next hourly run.
const AUTO_COMPLETE_PER_RUN = 5;
const SWEEP_BUDGET_MS = 38_000;

export const autoCompleteSweep = async (req: any, res: any) => {
    if (!isCronCall(req)) return res.status(401).json({ error: 'Unauthorized' });

    const deadline = Date.now() + SWEEP_BUDGET_MS;
    const secretHeader = { authorization: req.headers['authorization'] };
    const now = new Date();
    const h12ago = new Date(now.getTime() - 12 * 3600_000).toISOString();
    const h24ago = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const results = { reminders_sent: 0, auto_completed: 0, deferred: 0, errors: [] as string[] };

    try {
        // 1. 12h+: one reminder email per org, then mark so it isn't re-sent next hour.
        const { data: reminderCandidates, error: remErr } = await supabase
            .from('requisitions')
            .select('id, organization_id')
            .in('status', ['DISBURSED', 'RECEIVED'])
            .eq('is_auto_categorized', false)
            .is('auto_reminder_sent_at', null)
            .lt('updated_at', h12ago);
        if (remErr) throw new Error(`reminder query: ${remErr.message}`);

        const byOrg = new Map<string, string[]>();
        for (const r of reminderCandidates || []) {
            byOrg.set(r.organization_id, [...(byOrg.get(r.organization_id) || []), r.id]);
        }
        for (const [orgId, ids] of byOrg) {
            if (Date.now() > deadline) break;
            try {
                const r = await invokeHandler(sendAutoCategorizationReminder, {
                    headers: secretHeader, body: { organization_id: orgId, requisition_ids: ids },
                });
                if (r.status >= 400) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.body)}`);
                await supabase.from('requisitions').update({ auto_reminder_sent_at: now.toISOString() }).in('id', ids);
                results.reminders_sent += ids.length;
            } catch (e: any) {
                results.errors.push(`reminder org ${orgId}: ${e.message}`);
            }
        }

        // 2. 24h+: auto-complete, oldest first, capped.
        const { data: completeCandidates, error: compErr } = await supabase
            .from('requisitions')
            .select('id')
            .in('status', ['DISBURSED', 'RECEIVED'])
            .eq('is_auto_categorized', false)
            .lt('updated_at', h24ago)
            .order('updated_at', { ascending: true });
        if (compErr) throw new Error(`complete query: ${compErr.message}`);

        for (const c of completeCandidates || []) {
            if (results.auto_completed >= AUTO_COMPLETE_PER_RUN || Date.now() > deadline) { results.deferred++; continue; }
            try {
                const r = await invokeHandler(autoCompleteRequisition, { headers: secretHeader, params: { id: c.id }, body: {} });
                if (r.status >= 400) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.body)}`);
                results.auto_completed++;
            } catch (e: any) {
                results.errors.push(`auto-complete ${c.id}: ${e.message}`);
            }
        }

        return res.json({ success: true, ...results });
    } catch (e: any) {
        console.error('[Cron] auto-sweep failed:', e.message);
        return res.status(500).json({ error: e.message, ...results });
    }
};

// Platform-fee healing across all orgs (the old edge function sent the service-role key to a session-only
// admin route, so this never actually ran).
export const healFeesCron = async (req: any, res: any) => {
    if (!isCronCall(req)) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const { results, orgsChecked, orgsTotal } = await healMissingPlatformFeesWithinBudget(35_000);
        const totalPosted = results.reduce((s, r) => s + r.totalPosted, 0);
        return res.json({ orgsChecked, orgsTotal, orgsWithHealing: results.length, totalPosted: Math.round(totalPosted * 100) / 100 });
    } catch (e: any) {
        console.error('[Cron] heal-fees failed:', e.message);
        return res.status(500).json({ error: e.message });
    }
};

export const fetchCronHealth = async () => {
    const { data, error } = await supabase.rpc('cron_health');
    if (error) throw new Error(error.message);
    return data || [];
};

// Emails super-admins when a job newly goes stale. The alerted set is kept in app_settings so a job that
// stays down alerts once, and alerts again if it recovers and fails later.
export const cronWatchdog = async (req: any, res: any) => {
    if (!isCronCall(req)) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const health: any[] = await fetchCronHealth();
        const stale = health.filter(h => h.stale).map(h => h.job as string);

        const { data: prev } = await supabase.from('app_settings').select('value').eq('key', 'cron_watchdog_alerted').maybeSingle();
        const alerted: string[] = Array.isArray(prev?.value?.jobs) ? prev!.value.jobs : [];
        const fresh = stale.filter(j => !alerted.includes(j));

        if (fresh.length > 0) {
            const to = String(process.env.SUPER_ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
            if (to.length > 0) {
                const rows = health.filter(h => fresh.includes(h.job)).map(h =>
                    `<tr><td>${h.job}</td><td>${h.last_success_at || 'never'}</td><td>${h.last_status ?? '-'}</td></tr>`).join('');
                await emailService.sendEmail({
                    to,
                    subject: `MoneyWise scheduler: ${fresh.length} job(s) not running`,
                    html: `<p>These scheduled jobs have not succeeded within their expected interval:</p>
                           <table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Job</th><th>Last success</th><th>Last HTTP</th></tr>${rows}</table>
                           <p>See the cron health view in the admin dashboard (GET /admin/cron-health).</p>`,
                }).catch((e: any) => console.error('[Cron] watchdog email failed:', e?.message));
            }
        }

        if (stale.slice().sort().join() !== alerted.slice().sort().join()) {
            await supabase.from('app_settings').upsert(
                { key: 'cron_watchdog_alerted', value: { jobs: stale, at: new Date().toISOString() }, description: 'Scheduler jobs the watchdog has already alerted on', updated_at: new Date().toISOString() },
                { onConflict: 'key' }
            );
        }
        return res.json({ stale, newlyAlerted: fresh });
    } catch (e: any) {
        console.error('[Cron] watchdog failed:', e.message);
        return res.status(500).json({ error: e.message });
    }
};

// GET /admin/cron-health (super-admin session)
export const getCronHealth = async (_req: any, res: any) => {
    try {
        return res.json({ jobs: await fetchCronHealth() });
    } catch (e: any) {
        return res.status(500).json({ error: 'Failed to load scheduler health', details: e.message });
    }
};

// POST /cron/daily-recon — every morning: MoneyWise wallet totals vs live Lenco balance for every linked org.
// Stores the snapshot (app_settings.daily_recon_last, with the previous run kept for trend) and emails super-admins
// a single digest: all-clear, or exactly which organisations differ and by how much.
const kw = (v: number | null) => v === null ? '—' : `K${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const dailyReconCron = async (req: any, res: any) => {
    if (!isCronCall(req)) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const { rows, checked, skipped } = await runDailyBalanceCheck();
        const diffs = rows.filter(r => r.flag === 'DIFFERENCE');
        const errors = rows.filter(r => r.flag === 'ERROR');
        const ranAt = new Date().toISOString();

        const { data: prev } = await supabase.from('app_settings').select('value').eq('key', 'daily_recon_last').maybeSingle();
        const prevDiff: Record<string, number> = {};
        for (const r of (prev?.value?.rows || [])) if (r.flag === 'DIFFERENCE' && r.difference !== null) prevDiff[r.orgId] = r.difference;

        await supabase.from('app_settings').upsert({
            key: 'daily_recon_last',
            value: { ranAt, checked, skipped, differences: diffs.length, errors: errors.length, rows: rows.filter(r => r.flag !== 'BALANCED') , balanced: rows.filter(r => r.flag === 'BALANCED').length, previous: prev?.value ? { ranAt: prev.value.ranAt, differences: prev.value.differences } : null },
            description: 'Latest daily MoneyWise-vs-Lenco balance reconciliation',
            updated_at: ranAt,
        }, { onConflict: 'key' });

        const to = String(process.env.SUPER_ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
        const clean = diffs.length === 0 && errors.length === 0;
        if (to.length > 0) {
            const trend = (r: any) => {
                const p = prevDiff[r.orgId];
                if (p === undefined) return '<b>NEW</b>';
                const d = Math.abs(r.difference) - Math.abs(p);
                return Math.abs(d) < 0.01 ? 'unchanged' : d > 0 ? `worse (+${kw(d)})` : `better (${kw(d)})`;
            };
            const diffRows = diffs.map(r => `<tr><td>${r.name}</td><td align="right">${kw(r.moneywise)}</td><td align="right">${kw(r.lenco)}</td><td align="right"><b>${kw(r.difference)}</b></td><td align="right">${kw(r.lencoHold)}</td><td align="right">${kw(r.unexplained)}</td><td>${trend(r)}</td><td>${r.note || ''}</td></tr>`).join('');
            const errRows = errors.map(r => `<li>${r.name}: ${r.note}</li>`).join('');
            await emailService.sendEmail({
                to,
                subject: clean
                    ? `✅ MoneyWise vs Lenco: all ${checked} wallets balanced`
                    : `⚠️ MoneyWise vs Lenco: ${diffs.length} difference(s)${errors.length ? `, ${errors.length} check error(s)` : ''}`,
                html: `<p>Daily reconciliation of MoneyWise wallet totals against live Lenco balances (${checked} organisations checked${skipped ? `, ${skipped} not reached in time` : ''}). Tolerance K${RECON_TOLERANCE.toFixed(2)}.</p>`
                    + (clean ? '<p><b>No differences.</b></p>' : '')
                    + (diffs.length ? `<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Organisation</th><th>MoneyWise</th><th>Lenco</th><th>Difference</th><th>Lenco hold</th><th>After hold</th><th>vs yesterday</th><th>Note</th></tr>${diffRows}</table>` : '')
                    + (errors.length ? `<p>Could not check:</p><ul>${errRows}</ul>` : '')
                    + '<p>Investigate in the admin dashboard → Reconciliation.</p>',
            }).catch((e: any) => console.error('[Cron] daily-recon email failed:', e?.message));
        }
        return res.json({ checked, skipped, differences: diffs.map(d => ({ name: d.name, difference: d.difference, unexplained: d.unexplained })), errors: errors.length, emailed: to.length > 0 });
    } catch (e: any) {
        console.error('[Cron] daily-recon failed:', e.message);
        return res.status(500).json({ error: e.message });
    }
};
