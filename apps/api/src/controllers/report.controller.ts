import { Response } from 'express';
import { supabase } from '../lib/supabase';

export const getExpenditure = async (req: any, res: any): Promise<any> => {
    try {
        const organization_id = (req as any).user.organization_id;
        const { startDate, endDate, mode = 'EXPENSE' } = req.query; 

        if (!organization_id) {
            return res.status(400).json({ error: 'Organization context missing' });
        }

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'start_date and end_date are required' });
        }

        // Determine which requisitions to include
        // The user requested that ONLY COMPLETED transactions should be included in the reports
        const allowedStatuses = ['COMPLETED'];

        // Get all line items for requisitions in the allowed statuses and date range
        // Since we don't have a transaction date on line items, we'll use the requisition updated_at or created_at
        // In a real accounting system, we'd use the voucher posted_date or disbursement date
        let query = supabase
            .from('line_items')
            .select(`
                *,
                requisition:requisitions!inner(id, status, created_at, updated_at)
            `)
            .eq('requisition.organization_id', organization_id)
            .in('requisition.status', allowedStatuses)
            .gte('requisition.updated_at', startDate)
            .lte('requisition.updated_at', endDate);

        const { data: lineItems, error } = await query;

        if (error) throw error;

        // Aggregate by qb_account_id
        const expenditures = new Map<string, any>();

        for (const item of (lineItems || [])) {
            // Fallback for missing QB account - we still want to track them as "Uncategorized"
            const accountId = item.qb_account_id || item.account_id || 'UNCATEGORIZED';
            const accountName = item.qb_account_name || 'Uncategorized Expense';
            
            const amount = Number(item.actual_amount || item.estimated_amount || 0);

            if (!expenditures.has(accountId)) {
                expenditures.set(accountId, {
                    account_id: accountId,
                    account_name: accountName,
                    total_amount: 0,
                    transaction_count: 0
                });
            }

            const agg = expenditures.get(accountId);
            agg.total_amount += amount;
            agg.transaction_count += 1;
        }

        res.json(Array.from(expenditures.values()));
    } catch (error: any) {
        console.error('Error fetching expenditure:', error);
        res.status(500).json({ error: 'Failed to fetch expenditure', details: error.message });
    }
};

export const getExpenditureItems = async (req: any, res: any): Promise<any> => {
    try {
        const organization_id = (req as any).user.organization_id;
        const { accountId } = req.params;
        const { startDate, endDate, mode = 'EXPENSE' } = req.query;

        if (!organization_id) {
            return res.status(400).json({ error: 'Organization context missing' });
        }

        // Include only completed transactions as per user request
        const allowedStatuses = ['COMPLETED'];

        let query = supabase
            .from('line_items')
            .select(`
                *,
                requisition:requisitions!inner(id, reference_number, status, description, created_at, updated_at, requestor_id, users(name))
            `)
            .eq('requisition.organization_id', organization_id)
            .in('requisition.status', allowedStatuses);

        if (accountId === 'UNCATEGORIZED') {
            query = query.is('qb_account_id', null).is('account_id', null);
        } else {
            // line_items has qb_account_id
            query = query.or(`qb_account_id.eq.${accountId},account_id.eq.${accountId}`);
        }

        if (startDate) query = query.gte('requisition.updated_at', startDate);
        if (endDate) query = query.lte('requisition.updated_at', endDate);

        const { data, error } = await query;

        if (error) throw error;

        // Map data to make it caller friendly
        const items = data.map((item: any) => ({
            id: item.id,
            description: item.description,
            amount: Number(item.actual_amount || item.estimated_amount || 0),
            date: item.requisition.updated_at,
            requisition_id: item.requisition.id,
            requisition_ref: item.requisition.reference_number,
            requisition_desc: item.requisition.description,
            requestor_name: item.requisition.users?.name || 'Unknown'
        }));

        res.json(items);
    } catch (error: any) {
        console.error('Error fetching expenditure items:', error);
        res.status(500).json({ error: 'Failed to fetch expenditure items', details: error.message });
    }
};
