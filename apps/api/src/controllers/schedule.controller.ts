import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { triggerScheduledItem } from '../services/schedule.service';

// ── Controllers ────────────────────────────────────────────────────────────────

export async function getScheduledItems(req: Request, res: Response) {
    try {
        const { organization_id } = (req as any).user;
        const { category, status = 'ACTIVE' } = req.query as Record<string, string>;

        let query = supabase
            .from('scheduled_items')
            .select('*')
            .eq('organization_id', organization_id)
            .order('next_due_date', { ascending: true });

        if (status) query = query.eq('status', status);
        if (category && category !== 'ALL') query = query.eq('category', category);

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function getScheduledItemCounts(req: Request, res: Response) {
    try {
        const { organization_id } = (req as any).user;
        const { data, error } = await supabase
            .from('scheduled_items')
            .select('category')
            .eq('organization_id', organization_id)
            .eq('status', 'ACTIVE');
        if (error) throw error;

        const counts: Record<string, number> = {
            ALL: 0,
            BILLS: 0,
            SUBSCRIPTIONS: 0,
            INVESTMENTS: 0,
            LOAN_REPAYMENTS: 0,
            GENERAL_EXPENSES: 0,
        };
        for (const row of data ?? []) {
            counts.ALL++;
            if (counts[row.category] !== undefined) counts[row.category]++;
        }
        res.json(counts);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function createScheduledItem(req: Request, res: Response) {
    try {
        const { organization_id, id: created_by } = (req as any).user;
        const {
            title, amount, category, cadence,
            next_due_date, description,
            payment_method, recipient_account, recipient_bank_code, recipient_name,
            pop_enabled, pop_method, pop_email,
        } = req.body;

        if (!title || !amount || !next_due_date) {
            return res.status(400).json({ error: 'title, amount, and next_due_date are required' });
        }

        const { data: item, error: insertErr } = await supabase
            .from('scheduled_items')
            .insert({
                organization_id, created_by, title, amount,
                category: category ?? 'GENERAL_EXPENSES',
                cadence: cadence ?? 'MONTHLY',
                next_due_date, description: description ?? null,
                payment_method: payment_method ?? null,
                recipient_account: recipient_account ?? null,
                recipient_bank_code: recipient_bank_code ?? null,
                recipient_name: recipient_name ?? null,
                pop_enabled: pop_enabled === true,
                pop_method: pop_enabled ? (pop_method ?? 'EMAIL') : null,
                pop_email: pop_enabled ? (pop_email ?? null) : null,
            })
            .select()
            .single();
        if (insertErr) throw insertErr;

        // Pre-create the first UPCOMING run
        await supabase.from('scheduled_item_runs').insert({
            scheduled_item_id: item.id,
            organization_id,
            due_date: next_due_date,
            status: 'UPCOMING',
        });

        res.status(201).json(item);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function updateScheduledItem(req: Request, res: Response) {
    try {
        const { organization_id } = (req as any).user;
        const { id } = req.params;
        const allowed = [
            'title', 'amount', 'category', 'cadence', 'next_due_date',
            'description', 'status',
            'payment_method', 'recipient_account', 'recipient_bank_code', 'recipient_name',
            'pop_enabled', 'pop_method', 'pop_email',
        ];
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        const { data, error } = await supabase
            .from('scheduled_items')
            .update(updates)
            .eq('id', id)
            .eq('organization_id', organization_id)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function deleteScheduledItem(req: Request, res: Response) {
    try {
        const { organization_id } = (req as any).user;
        const { id } = req.params;
        const { error } = await supabase
            .from('scheduled_items')
            .delete()
            .eq('id', id)
            .eq('organization_id', organization_id);
        if (error) throw error;
        res.status(204).send();
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function getScheduledItemRuns(req: Request, res: Response) {
    try {
        const { organization_id } = (req as any).user;
        const { id } = req.params;
        const { data, error } = await supabase
            .from('scheduled_item_runs')
            .select('*')
            .eq('scheduled_item_id', id)
            .eq('organization_id', organization_id)
            .order('due_date', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function runScheduledItemNow(req: Request, res: Response) {
    try {
        const { organization_id, id: triggered_by } = (req as any).user;
        const { id } = req.params;

        const { data: item, error: fetchErr } = await supabase
            .from('scheduled_items')
            .select('*')
            .eq('id', id)
            .eq('organization_id', organization_id)
            .single();
        if (fetchErr || !item) return res.status(404).json({ error: 'Scheduled item not found' });

        const result = await triggerScheduledItem(item, triggered_by);
        if (!result) {
            return res.status(409).json({ error: 'This occurrence has already been triggered.' });
        }

        res.json({ requisition: result.requisition, next_due_date: result.nextDueDate });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}
