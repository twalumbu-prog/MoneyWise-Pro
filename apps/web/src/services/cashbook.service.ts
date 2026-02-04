import axios from 'axios';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface CashbookEntry {
    id: string;
    date: string;
    description: string;
    debit: number;
    credit: number;
    balance_after: number;
    entry_type: 'DISBURSEMENT' | 'RETURN' | 'ADJUSTMENT' | 'OPENING_BALANCE';
    requisition_id?: string;
    created_by?: string;
    status?: 'PENDING' | 'COMPLETED';
    requisitions?: {
        reference_number: string;
        status: string;
        description: string;
        actual_total: number;
        requestor: { name: string };
        line_items: any[];
        disbursements: any[];
    };
    users?: { name: string };
}

export interface CashbookSummary {
    openingBalance: number;
    totalReceipts: number;
    totalPayments: number;
    closingBalance: number;
    netMovement: number;
}

export const cashbookService = {
    async getEntries(filters?: {
        startDate?: string;
        endDate?: string;
        entryType?: string;
        limit?: number;
    }) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const params = new URLSearchParams();

        if (filters?.startDate) params.append('startDate', filters.startDate);
        if (filters?.endDate) params.append('endDate', filters.endDate);
        if (filters?.entryType) params.append('entryType', filters.entryType);
        if (filters?.limit) params.append('limit', filters.limit.toString());

        const response = await axios.get<CashbookEntry[]>(
            `${API_URL}/cashbook?${params.toString()}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data;
    },

    async getBalance() {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const response = await axios.get<{ balance: number }>(
            `${API_URL}/cashbook/balance`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data.balance;
    },

    async getSummary(startDate: string, endDate: string) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const response = await axios.get<CashbookSummary>(
            `${API_URL}/cashbook/summary?startDate=${startDate}&endDate=${endDate}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data;
    },

    async reconcile(physicalCount: number, denominations?: any, notes?: string) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const response = await axios.post(
            `${API_URL}/cashbook/reconcile`,
            { physicalCount, denominations, notes },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data;
    },

    async returnCash(requisitionId: string, amount: number, description?: string) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const response = await axios.post(
            `${API_URL}/cashbook/return`,
            { requisitionId, amount, description },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data;
    }
};
