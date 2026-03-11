import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface ExpenditureAggregation {
    account_id: string;
    account_name: string;
    total_amount: number;
    transaction_count: number;
}

export interface ExpenditureItem {
    id: string;
    description: string;
    amount: number;
    date: string;
    requisition_id: string;
    requisition_ref: string;
    requisition_desc: string;
    requestor_name: string;
}

export const reportService = {
    async getExpenditures(startDate: string, endDate: string, mode: 'EXPENSE' | 'CASH_OUTFLOW'): Promise<ExpenditureAggregation[]> {
        const { data: { session } } = await supabase.auth.getSession();
        
        const params = new URLSearchParams({
            startDate,
            endDate,
            mode
        });

        const response = await fetch(`${API_URL}/reports/expenditure?${params}`, {
            headers: {
                'Authorization': `Bearer ${session?.access_token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) throw new Error('Failed to fetch expenditures');
        return response.json();
    },

    async getExpenditureItems(accountId: string, startDate: string, endDate: string, mode: 'EXPENSE' | 'CASH_OUTFLOW'): Promise<ExpenditureItem[]> {
        const { data: { session } } = await supabase.auth.getSession();
        
        const params = new URLSearchParams({
            startDate,
            endDate,
            mode
        });

        const response = await fetch(`${API_URL}/reports/expenditure/${accountId}/items?${params}`, {
            headers: {
                'Authorization': `Bearer ${session?.access_token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) throw new Error('Failed to fetch expenditure items');
        return response.json();
    }
};
