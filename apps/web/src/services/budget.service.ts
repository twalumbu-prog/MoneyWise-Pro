import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface Budget {
    id: string;
    organization_id: string;
    qb_account_id: string;
    qb_account_name: string;
    amount: number;
    period_type: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
    start_date: string;
    end_date: string;
    created_at?: string;
    updated_at?: string;
}

export const budgetService = {
    async getBudgets(startDate?: string, endDate?: string, periodType?: string): Promise<Budget[]> {
        const { data: { session } } = await supabase.auth.getSession();
        
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (periodType) params.append('periodType', periodType);

        const response = await fetch(`${API_URL}/budgets?${params}`, {
            headers: {
                'Authorization': `Bearer ${session?.access_token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) throw new Error('Failed to fetch budgets');
        return response.json();
    },

    async setBudget(budget: { qb_account_id: string, qb_account_name: string, amount: number, period_type: string, start_date: string, end_date: string }): Promise<Budget> {
        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch(`${API_URL}/budgets`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session?.access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(budget)
        });

        if (!response.ok) throw new Error('Failed to set budget');
        return response.json();
    }
};
