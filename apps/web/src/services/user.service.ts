import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface UserProfile {
    id: string;
    email?: string;
    name: string;
    role: 'REQUESTOR' | 'AUTHORISER' | 'ACCOUNTANT' | 'CASHIER' | 'ADMIN';
    employee_id: string;
    status: 'ACTIVE' | 'INVITED' | 'DISABLED';
    organization_id: string;
    created_at: string;
}

export const userService = {
    async getAll() {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/users`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }

        return response.json();
    },

    async create(data: { email: string; name: string; role: string; employeeId?: string; password?: string }) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to create user');
        }

        return response.json();
    },

    async update(id: string, data: Partial<UserProfile>) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/users/${id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to update user');
        }

        return response.json();
    },

    async delete(id: string) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/users/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to delete user');
        }

        return response.json();
    },

    async resendInvite(id: string) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${API_URL}/users/${id}/resend-invite`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to resend invitation');
        }

        return response.json();
    }
};
