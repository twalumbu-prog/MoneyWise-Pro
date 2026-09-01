import { apiJson } from '../api/apiFetch';

export type ExpenditureMode = 'EXPENSE' | 'CASH_OUTFLOW';

export interface ExpenditureAggregation {
    account_id: string;
    account_name: string;
    total_amount: number;
    transaction_count: number;
    type: string;
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
    getExpenditures(
        startDate: string,
        endDate: string,
        mode: ExpenditureMode,
    ): Promise<ExpenditureAggregation[]> {
        const params = new URLSearchParams({ startDate, endDate, mode });
        return apiJson<ExpenditureAggregation[]>(`/reports/expenditure?${params}`);
    },

    getExpenditureItems(
        accountId: string,
        startDate: string,
        endDate: string,
        mode: ExpenditureMode,
    ): Promise<ExpenditureItem[]> {
        const params = new URLSearchParams({ startDate, endDate, mode });
        return apiJson<ExpenditureItem[]>(`/reports/expenditure/${accountId}/items?${params}`);
    },
};
