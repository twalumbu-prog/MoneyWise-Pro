import { Response } from 'express';
import { supabase } from '../lib/supabase';

export const getBudgets = async (req: any, res: any): Promise<any> => {
    try {
        const organization_id = (req as any).user.organization_id;
        const { startDate, endDate, periodType } = req.query;

        if (!organization_id) {
            return res.status(400).json({ error: 'Organization context missing' });
        }

        let query = supabase
            .from('budgets')
            .select('*')
            .eq('organization_id', organization_id);

        if (startDate) query = query.gte('start_date', startDate);
        if (endDate) query = query.lte('end_date', endDate);
        if (periodType) query = query.eq('period_type', periodType);

        const { data, error } = await query;

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        console.error('Error fetching budgets:', error);
        res.status(500).json({ error: 'Failed to fetch budgets', details: error.message });
    }
};

export const setBudget = async (req: any, res: any): Promise<any> => {
    try {
        const organization_id = (req as any).user.organization_id;
        const user_id = (req as any).user.id;
        const { qb_account_id, qb_account_name, amount, period_type, start_date, end_date } = req.body;
        // Quarterly / yearly budgets paid all at once: month within the period it falls due. Only written when sent,
        // so older clients keep working (and the column is only needed once a client uses it).
        const hasDue = Object.prototype.hasOwnProperty.call(req.body, 'due_offset');
        const due = req.body.due_offset === null || req.body.due_offset === undefined ? null : Number(req.body.due_offset);
        if (hasDue && due !== null && (!Number.isInteger(due) || due < 0 || due > 11)) {
            return res.status(400).json({ error: 'due_offset must be a whole month 0-11' });
        }

        if (!organization_id) {
            return res.status(400).json({ error: 'Organization context missing' });
        }

        if (!qb_account_id || !qb_account_name || amount === undefined || !period_type || !start_date || !end_date) {
            return res.status(400).json({ error: 'Missing required budget fields' });
        }

        const { data, error } = await supabase
            .from('budgets')
            .upsert({
                organization_id,
                qb_account_id,
                qb_account_name,
                amount,
                period_type,
                start_date,
                end_date,
                created_by: user_id,
                updated_at: new Date().toISOString(),
                ...(hasDue ? { due_offset: due } : {}),
            }, {
                onConflict: 'organization_id, qb_account_id, period_type, start_date'
            })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error: any) {
        console.error('Error setting budget:', error);
        res.status(500).json({ error: 'Failed to set budget', details: error.message });
    }
};
