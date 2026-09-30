import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { automationService, Automation } from '../services/automation.service';

/**
 * Cron entry point — protected by LENCO_SYNC_SECRET like the other internal
 * sweeps (poll-processing, weekly highlights), not by a user session.
 */
export async function automationTick(req: Request, res: Response) {
    const authHeader = req.headers['authorization'] || '';
    const secret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!secret || secret !== process.env.LENCO_SYNC_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await automationService.tick();
        res.json({ success: true, ...result });
    } catch (err: any) {
        console.error('[Automations] tick failed:', err);
        res.status(500).json({ error: err.message });
    }
}

async function loadOwned(req: Request): Promise<Automation | null> {
    const { organization_id } = (req as any).user;
    const { data } = await supabase
        .from('automations')
        .select('*')
        .eq('id', req.params.id)
        .eq('organization_id', organization_id)
        .neq('status', 'ARCHIVED')
        .maybeSingle();
    return (data as Automation) ?? null;
}

export async function listAutomations(req: Request, res: Response) {
    try {
        const { organization_id } = (req as any).user;

        const { data: automations, error } = await supabase
            .from('automations')
            .select('*')
            .eq('organization_id', organization_id)
            .neq('status', 'ARCHIVED')
            .order('created_at', { ascending: false });
        if (error) throw error;

        // Latest run per automation, so the list can show "last ran …" without N requests.
        const ids = (automations ?? []).map(a => a.id);
        const lastRun: Record<string, any> = {};
        if (ids.length) {
            const { data: runs } = await supabase
                .from('automation_runs')
                .select('id, automation_id, status, amount, trigger_summary, started_at, finished_at')
                .in('automation_id', ids)
                .order('started_at', { ascending: false })
                .limit(500);
            for (const r of runs ?? []) if (!lastRun[r.automation_id]) lastRun[r.automation_id] = r;
        }

        const walletIds = [...new Set((automations ?? []).map(a => a.trigger_config?.wallet_id).filter(Boolean))];
        const walletNames: Record<string, string> = {};
        if (walletIds.length) {
            const { data: wallets } = await supabase.from('organization_wallets').select('id, name').in('id', walletIds);
            for (const w of wallets ?? []) walletNames[w.id] = w.name;
        }

        res.json((automations ?? []).map(a => ({
            ...a,
            wallet_name: walletNames[a.trigger_config?.wallet_id] ?? null,
            last_run: lastRun[a.id] ?? null,
        })));
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function getAutomationRuns(req: Request, res: Response) {
    try {
        const automation = await loadOwned(req);
        if (!automation) return res.status(404).json({ error: 'Automation not found' });

        const { data, error } = await supabase
            .from('automation_runs')
            .select('*')
            .eq('automation_id', automation.id)
            .order('started_at', { ascending: false })
            .limit(100);
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function runAutomationNow(req: Request, res: Response) {
    try {
        const automation = await loadOwned(req);
        if (!automation) return res.status(404).json({ error: 'Automation not found' });

        const summary = await automationService.runNow(automation);
        res.json(summary);
    } catch (err: any) {
        console.error('[Automations] run-now failed:', err);
        res.status(500).json({ error: err.message });
    }
}

export async function retryAutomationRun(req: Request, res: Response) {
    try {
        const automation = await loadOwned(req);
        if (!automation) return res.status(404).json({ error: 'Automation not found' });

        const run = await automationService.retryRun(automation, req.params.runId);
        res.json(run);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
}

/** Pause / resume / rename. Everything structural is changed through the assistant. */
export async function updateAutomation(req: Request, res: Response) {
    try {
        const automation = await loadOwned(req);
        if (!automation) return res.status(404).json({ error: 'Automation not found' });

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (req.body.status !== undefined) {
            if (!['ACTIVE', 'PAUSED'].includes(req.body.status)) {
                return res.status(400).json({ error: 'status must be ACTIVE or PAUSED' });
            }
            updates.status = req.body.status;
            // Resuming must not sweep up deposits that arrived while it was off:
            // the user paused it, so anything received since is theirs to handle.
            if (req.body.status === 'ACTIVE' && automation.status === 'PAUSED') {
                updates.watch_from = new Date().toISOString();
            }
        }
        if (typeof req.body.name === 'string' && req.body.name.trim()) updates.name = req.body.name.trim();

        const { data, error } = await supabase
            .from('automations')
            .update(updates)
            .eq('id', automation.id)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

/** Archive rather than delete, so run history (and its payout trail) is kept. */
export async function deleteAutomation(req: Request, res: Response) {
    try {
        const automation = await loadOwned(req);
        if (!automation) return res.status(404).json({ error: 'Automation not found' });

        const { error } = await supabase
            .from('automations')
            .update({ status: 'ARCHIVED', updated_at: new Date().toISOString() })
            .eq('id', automation.id);
        if (error) throw error;
        res.status(204).send();
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}
