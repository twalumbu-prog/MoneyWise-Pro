import { apiFetch, apiJson } from '../api/apiFetch';

export type AutomationStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export type AutomationRunStatus = 'RUNNING' | 'AWAITING_CONFIRMATION' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface AutomationAction {
    type: 'FORWARD_PAYMENT' | 'SEND_POP_EMAIL';
    recipient_account?: string;
    recipient_bank_code?: string;
    recipient_bank_name?: string;
    recipient_name?: string;
    to?: string;
}

export interface AutomationRun {
    id: string;
    automation_id: string;
    source: 'AUTO' | 'MANUAL';
    trigger_ref: string | null;
    trigger_summary: string | null;
    amount: number | null;
    forwarded_amount: number | null;
    status: AutomationRunStatus;
    attempts: number;
    steps: Array<{ step: string; status: 'ok' | 'failed' | 'pending' | 'info'; detail: string; at: string }>;
    error: string | null;
    requisition_id: string | null;
    pop_sent_at: string | null;
    started_at: string;
    finished_at: string | null;
}

export interface Automation {
    id: string;
    organization_id: string;
    name: string;
    description: string | null;
    status: AutomationStatus;
    trigger_type: 'WALLET_DEPOSIT';
    trigger_config: { wallet_id: string; min_amount?: number };
    actions: AutomationAction[];
    watch_from: string;
    last_run_at: string | null;
    created_at: string;
    wallet_name?: string | null;
    last_run?: Pick<AutomationRun, 'id' | 'status' | 'amount' | 'trigger_summary' | 'started_at' | 'finished_at'> | null;
}

export interface RunNowResult {
    checked: number;
    newDeposits: number;
    started: number;
    retried: number;
    settled: number;
    failed: number;
    errors: string[];
}

export const automationService = {
    getAll(): Promise<Automation[]> {
        return apiJson<Automation[]>('/automations');
    },

    getRuns(id: string): Promise<AutomationRun[]> {
        return apiJson<AutomationRun[]>(`/automations/${id}/runs`);
    },

    runNow(id: string): Promise<RunNowResult> {
        return apiJson<RunNowResult>(`/automations/${id}/run-now`, { method: 'POST' });
    },

    retryRun(id: string, runId: string): Promise<AutomationRun> {
        return apiJson<AutomationRun>(`/automations/${id}/runs/${runId}/retry`, { method: 'POST' });
    },

    setStatus(id: string, status: 'ACTIVE' | 'PAUSED'): Promise<Automation> {
        return apiJson<Automation>(`/automations/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
    },

    async remove(id: string): Promise<void> {
        await apiFetch(`/automations/${id}`, { method: 'DELETE' });
    },
};
