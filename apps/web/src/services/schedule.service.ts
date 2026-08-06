import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
    };
}

export type ScheduleCategory =
    | 'BILLS'
    | 'SUBSCRIPTIONS'
    | 'INVESTMENTS'
    | 'LOAN_REPAYMENTS'
    | 'GENERAL_EXPENSES';

export type ScheduleCadence = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';

export interface ScheduledItem {
    id: string;
    organization_id: string;
    created_by: string;
    title: string;
    amount: number;
    category: ScheduleCategory;
    cadence: ScheduleCadence;
    due_day?: number | null;
    next_due_date: string;
    description?: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
    created_at: string;
    updated_at: string;
}

export interface ScheduledItemRun {
    id: string;
    scheduled_item_id: string;
    organization_id: string;
    due_date: string;
    status: 'UPCOMING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    requisition_id?: string | null;
    triggered_at?: string | null;
    created_at: string;
}

export type CategoryCounts = Record<string, number>;

export interface CreateScheduledItemPayload {
    title: string;
    amount: number;
    category: ScheduleCategory;
    cadence: ScheduleCadence;
    due_day?: number | null;
    next_due_date: string;
    description?: string;
}

export const scheduleService = {
    async getAll(category?: string, status = 'ACTIVE'): Promise<ScheduledItem[]> {
        const headers = await authHeaders();
        const params = new URLSearchParams({ status });
        if (category && category !== 'ALL') params.set('category', category);
        const res = await fetch(`${API_URL}/schedules?${params}`, { headers });
        if (!res.ok) throw new Error('Failed to fetch schedules');
        return res.json();
    },

    async getCounts(): Promise<CategoryCounts> {
        const headers = await authHeaders();
        const res = await fetch(`${API_URL}/schedules/counts`, { headers });
        if (!res.ok) throw new Error('Failed to fetch schedule counts');
        return res.json();
    },

    async create(payload: CreateScheduledItemPayload): Promise<ScheduledItem> {
        const headers = await authHeaders();
        const res = await fetch(`${API_URL}/schedules`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to create scheduled item');
        return res.json();
    },

    async update(id: string, payload: Partial<CreateScheduledItemPayload> & { status?: 'ACTIVE' | 'ARCHIVED' }): Promise<ScheduledItem> {
        const headers = await authHeaders();
        const res = await fetch(`${API_URL}/schedules/${id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to update scheduled item');
        return res.json();
    },

    async delete(id: string): Promise<void> {
        const headers = await authHeaders();
        const res = await fetch(`${API_URL}/schedules/${id}`, { method: 'DELETE', headers });
        if (!res.ok) throw new Error('Failed to delete scheduled item');
    },

    async getRuns(id: string): Promise<ScheduledItemRun[]> {
        const headers = await authHeaders();
        const res = await fetch(`${API_URL}/schedules/${id}/runs`, { headers });
        if (!res.ok) throw new Error('Failed to fetch runs');
        return res.json();
    },

    async runNow(id: string): Promise<{ requisition: any; next_due_date: string }> {
        const headers = await authHeaders();
        const res = await fetch(`${API_URL}/schedules/${id}/run-now`, { method: 'POST', headers });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || 'Failed to trigger run');
        }
        return res.json();
    },
};
