import { apiFetch, apiJson } from '../api/apiFetch';

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
    /** Proof-of-Payment auto-send settings */
    pop_enabled?: boolean;
    pop_method?: string | null;
    pop_email?: string | null;
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
    pop_enabled?: boolean;
    pop_method?: string | null;
    pop_email?: string | null;
}

export const scheduleService = {
    getAll(category?: string, status = 'ACTIVE'): Promise<ScheduledItem[]> {
        const params = new URLSearchParams({ status });
        if (category && category !== 'ALL') params.set('category', category);
        return apiJson<ScheduledItem[]>(`/schedules?${params}`);
    },

    getCounts(): Promise<CategoryCounts> {
        return apiJson<CategoryCounts>('/schedules/counts');
    },

    create(payload: CreateScheduledItemPayload): Promise<ScheduledItem> {
        return apiJson<ScheduledItem>('/schedules', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    update(
        id: string,
        payload: Partial<CreateScheduledItemPayload> & { status?: 'ACTIVE' | 'ARCHIVED' },
    ): Promise<ScheduledItem> {
        return apiJson<ScheduledItem>(`/schedules/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });
    },

    async delete(id: string): Promise<void> {
        await apiFetch(`/schedules/${id}`, { method: 'DELETE' });
    },

    getRuns(id: string): Promise<ScheduledItemRun[]> {
        return apiJson<ScheduledItemRun[]>(`/schedules/${id}/runs`);
    },

    runNow(id: string): Promise<{ requisition: any; next_due_date: string }> {
        return apiJson(`/schedules/${id}/run-now`, { method: 'POST' });
    },
};
