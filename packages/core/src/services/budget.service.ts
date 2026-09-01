import { apiJson } from '../api/apiFetch';

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

export interface SetBudgetPayload {
    qb_account_id: string;
    qb_account_name: string;
    amount: number;
    period_type: string;
    start_date: string;
    end_date: string;
}

export const budgetService = {
    getBudgets(startDate?: string, endDate?: string, periodType?: string): Promise<Budget[]> {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (periodType) params.append('periodType', periodType);
        return apiJson<Budget[]>(`/budgets?${params}`);
    },

    setBudget(budget: SetBudgetPayload): Promise<Budget> {
        return apiJson<Budget>('/budgets', {
            method: 'POST',
            body: JSON.stringify(budget),
        });
    },
};
