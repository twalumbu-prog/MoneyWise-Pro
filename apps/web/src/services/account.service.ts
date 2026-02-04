import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface Account {
    id: string;
    code: string;
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
    description: string;
    is_active: boolean;
}

export const accountService = {
    async getAll() {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/accounts`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error('Failed to fetch accounts');
        }

        return response.json();
    },

    async create(data: Partial<Account>) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/accounts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error('Failed to create account');
        return response.json();
    },

    async suggestAccount(description: string, amount?: number) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/accounts/suggest`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ description, amount: amount || 0 }),
        });

        if (!response.ok) throw new Error('Failed to get AI suggestion');
        return response.json();
    },

    async suggestBatch(lineItems: any[], requisitionId?: string) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/accounts/suggest`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ line_items: lineItems, requisition_id: requisitionId }),
        });

        if (!response.ok) throw new Error('Failed to get batch AI suggestions');
        return response.json();
    }
};
