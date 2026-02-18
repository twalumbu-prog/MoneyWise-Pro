import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

interface LineItem {
    description: string;
    quantity: number;
    unit_price: number;
    estimated_amount: number;
}

interface CreateRequisitionData {
    description: string;
    estimated_total: number;
    items?: LineItem[];
    department: string;
    type?: string;
    staff_name?: string;
    employee_id?: string;
    loan_amount?: number;
    repayment_period?: number;
    interest_rate?: number;
    monthly_deduction?: number;
}

export interface Requisition {
    id: string;
    requestor_id: string;
    description: string;
    estimated_total: number;
    status: string;
    created_at: string;
    items?: LineItem[];
    requestor_name?: string;
    department?: string;
    type?: 'EXPENSE' | 'ADVANCE' | 'LOAN';
    staff_name?: string;
    employee_id?: string;
    loan_amount?: number;
    repayment_period?: number;
    interest_rate?: number;
    monthly_deduction?: number;
    disbursements?: any[];
}

export const requisitionService = {
    async acknowledge(id: string, signature: string) {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/requisitions/${id}/acknowledge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ signature }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || err.error || 'Failed to acknowledge receipt');
        }

        return response.json();
    },

    async getAll() {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        const response = await fetch(`${API_URL}/requisitions`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error('Failed to fetch requisitions');
        }

        return response.json();
    },

    async getById(id: string) {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        const response = await fetch(`${API_URL}/requisitions/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error('Failed to fetch requisition');
        }

        return response.json();
    },

    async create(data: CreateRequisitionData) {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        const response = await fetch(`${API_URL}/requisitions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error('Failed to create requisition');
        }

        return response.json();
    },

    async update(id: string, data: Partial<CreateRequisitionData>) {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/requisitions/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error('Failed to update requisition');
        }

        return response.json();
    },

    getAllAdmin: async () => {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/requisitions/admin/all`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(JSON.stringify(err));
        }

        return response.json();
    },

    updateStatus: async (id: string, status: string) => {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/requisitions/${id}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status }),
        });

        if (!response.ok) {
            throw new Error('Failed to update status');
        }

        return response.json();
    },

    updateExpenses: async (id: string, items: { id: string, actual_amount: number, receipt_url?: string }[]) => {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/requisitions/${id}/expenses`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ items }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to update expenses');
        }

        return response.json();
    },

    submitChange: async (id: string, denominations: any, change_amount: number) => {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/requisitions/${id}/submit-change`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ denominations, change_amount }),
        });

        if (!response.ok) {
            const err = await response.json();
            const message = err.message || err.error || 'Failed to submit change';
            throw new Error(message);
        }

        return response.json();
    },

    confirmChange: async (id: string, confirmed_denominations: any, confirmed_change_amount: number) => {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/requisitions/${id}/confirm-change`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ confirmed_denominations, confirmed_change_amount }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to confirm change');
        }

        return response.json();
    }
};
