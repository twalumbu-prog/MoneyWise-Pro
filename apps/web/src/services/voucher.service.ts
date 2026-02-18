import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface Voucher {
    id: string;
    requisition_id: string;
    created_by: string;
    reference_number: string;
    total_debit: number;
    total_credit: number;
    status: 'DRAFT' | 'POSTED';
    posted_at?: string;
    created_at: string;
    requisitions?: {
        description: string;
    };
    voucher_lines?: VoucherLine[];
}

export interface VoucherLine {
    id: string;
    voucher_id: string;
    account_id: string;
    description: string;
    debit: number;
    credit: number;
    accounts?: {
        code: string;
        name: string;
    };
}

export const voucherService = {
    async getAll() {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/vouchers`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) throw new Error('Failed to fetch vouchers');
        return response.json();
    },

    async getById(id: string) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/vouchers/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) throw new Error('Failed to fetch voucher details');
        return response.json();
    },

    async createFromRequisition(requisitionId: string) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/vouchers`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ requisition_id: requisitionId }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to create voucher');
        }
        return response.json();
    },

    async post(id: string) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/vouchers/${id}/post`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to post voucher');
        }
        return response.json();
    },
    async postVoucherWithClassification(requisitionId: string, items: any[]) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/requisitions/${requisitionId}/post-voucher`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ items }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to post voucher');
        }
        return response.json();
    }
};
