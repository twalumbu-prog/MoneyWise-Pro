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

        // Include all statuses where money has actually left the wallet
        const allowedStatuses = ['DISBURSED', 'RECEIVED', 'EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'];

        // Get all line items for requisitions in the allowed statuses
        const query = supabase
            .from('line_items')
            .select(`
                *,
                requisition:requisitions!inner(
                    id, 
                    status, 
                    created_at, 
                    updated_at, 
                    organization_id,
                    cashbook_entries(id, date, entry_type)
                ),
                accounts ( id, name, code )
            `)
            .eq('requisition.organization_id', organization_id)
            .in('requisition.status', allowedStatuses);

        const { data: lineItems, error } = await query;

        if (error) throw error;

        // Aggregate by qb_account_id
        const expenditures = new Map<string, any>();

        for (const item of (lineItems || [])) {
            const req = item.requisition;
            if (!req) continue;

            // Resolve the transaction date from the cashbook entries
            // Priority: entry_type === 'DISBURSEMENT' -> first cashbook entry -> updated_at -> created_at
            const cashbookEntries = req.cashbook_entries || [];
            const disbursement = cashbookEntries.find((c: any) => c.entry_type === 'DISBURSEMENT');
            
            let itemDateStr = '';
            if (disbursement) {
                itemDateStr = disbursement.date;
            } else if (cashbookEntries.length > 0) {
                itemDateStr = cashbookEntries[0].date;
            } else {
                itemDateStr = req.updated_at || req.created_at;
            }

            const formattedDate = itemDateStr.split('T')[0];
            
            // Filter by date range
            if (formattedDate < startDate || formattedDate > endDate) {
                continue;
            }

            // Priority: QB ID -> Local ID -> 'UNCATEGORIZED'
            const accountId = item.qb_account_id || item.account_id || 'UNCATEGORIZED';
            
            // Priority: QB Name -> Local Account Name -> Fallback
            const accountName = item.qb_account_name || (item as any).accounts?.name || 'Uncategorized Expense';
            
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

        // Include all statuses where money has actually left the wallet
        const allowedStatuses = ['DISBURSED', 'RECEIVED', 'EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'];

        // Identify if accountId is a UUID to avoid database casting errors
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId);

        let query = supabase
            .from('line_items')
            .select(`
                *,
                requisition:requisitions!inner(
                    id, 
                    reference_number, 
                    status, 
                    description, 
                    created_at, 
                    updated_at, 
                    requestor_id, 
                    requestor:users!requestor_id(name),
                    cashbook_entries(id, date, entry_type)
                ),
                accounts(id, name, code)
            `)
            .eq('requisition.organization_id', organization_id)
            .in('requisition.status', allowedStatuses);

        if (accountId === 'UNCATEGORIZED') {
            query = query.is('qb_account_id', null).is('account_id', null);
        } else if (isUuid) {
            // Check both fields if it's a UUID
            query = query.or(`qb_account_id.eq.${accountId},account_id.eq.${accountId}`);
        } else {
            // Not a UUID, so it must be a QuickBooks account ID or similar string
            query = query.eq('qb_account_id', accountId);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Filter in memory by date range and map data to make it caller friendly
        const items = [];

        for (const item of (data || [])) {
            const req = item.requisition;
            if (!req) continue;

            const cashbookEntries = req.cashbook_entries || [];
            const disbursement = cashbookEntries.find((c: any) => c.entry_type === 'DISBURSEMENT');
            
            let itemDateStr = '';
            if (disbursement) {
                itemDateStr = disbursement.date;
            } else if (cashbookEntries.length > 0) {
                itemDateStr = cashbookEntries[0].date;
            } else {
                itemDateStr = req.updated_at || req.created_at;
            }

            const formattedDate = itemDateStr.split('T')[0];

            if (startDate && formattedDate < startDate) continue;
            if (endDate && formattedDate > endDate) continue;

            items.push({
                id: item.id,
                description: item.description,
                amount: Number(item.actual_amount || item.estimated_amount || 0),
                date: itemDateStr,
                requisition_id: req.id,
                requisition_ref: req.reference_number,
                requisition_desc: req.description,
                requestor_name: req.requestor?.name || 'Unknown'
            });
        }

        res.json(items);
    } catch (error: any) {
        console.error('Error fetching expenditure items:', error);
        res.status(500).json({ error: 'Failed to fetch expenditure items', details: error.message });
    }
};
