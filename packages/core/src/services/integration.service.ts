import { apiFetch, apiJson } from '../api/apiFetch';
import { isApiError } from '../api/ApiError';

export interface IntegrationStatus {
    connected: boolean;
    companyName?: string;
    lastSync?: string;
    details?: any;
    config?: any;
}

export const integrationService = {
    async getStatus(): Promise<IntegrationStatus> {
        try {
            return await apiJson<IntegrationStatus>('/integrations/status');
        } catch (err) {
            // 404 is the documented "never connected" answer here, not a failure —
            // the Settings screen renders the connect prompt from it.
            if (isApiError(err) && err.status === 404) {
                return { connected: false, details: null };
            }
            throw err;
        }
    },

    async getConnectUrl(): Promise<string> {
        const data = await apiJson<{ url: string }>('/integrations/quickbooks/connect');
        return data.url;
    },

    async disconnect(): Promise<void> {
        await apiFetch('/integrations/quickbooks', { method: 'DELETE' });
    },

    getAccounts(): Promise<any[]> {
        return apiJson<any[]>('/integrations/quickbooks/accounts');
    },

    getAccountTransactions(
        qbAccountId: string,
        fromDate: string,
        toDate: string,
    ): Promise<{
        accountName: string;
        fromDate: string;
        toDate: string;
        openingBalance: number;
        closingBalance: number;
        transactions: Array<{
            date: string;
            type: string;
            docNum: string;
            name: string;
            memo: string;
            splitAccount: string;
            amount: number;
            balance: number;
        }>;
    }> {
        const params = new URLSearchParams({ from: fromDate, to: toDate });
        return apiJson(
            `/integrations/quickbooks/accounts/${encodeURIComponent(qbAccountId)}/transactions?${params}`,
        );
    },

    async retrySync(requisitionId: string): Promise<void> {
        await apiFetch(`/integrations/quickbooks/sync/${requisitionId}`, { method: 'POST' });
    },
};

// ── Master Fees ──────────────────────────────────────────────────────────────
export interface MasterFeesStatus {
    connected: boolean;
    schoolId?: string;
    schoolName?: string;
    lencoMode?: 'shared' | 'separate';
    lencoModeOverridden?: boolean;
    categoryMap?: Record<string, { accountId: string; name: string }>;
    lastSyncedAt?: string;
    lastSyncError?: string | null;
    lastSyncTruncated?: boolean;
}

export interface MasterFeesCategory {
    id: string;
    name: string;
    amount: number | null;
    accountId: string | null;
}

export interface MasterFeesReconciliation {
    moneywiseReceivable: number;
    masterfeesOutstanding: number;
    difference: number;
    studentsWithBalance: number;
}

export const masterFeesService = {
    /** Returns the Master Fees OAuth consent URL. Send the user's browser there to start 1-click setup. */
    async getOAuthUrl(): Promise<string> {
        const data = await apiJson<{ url: string }>('/integrations/masterfees/oauth/url');
        return data.url;
    },

    getStatus(): Promise<MasterFeesStatus> {
        return apiJson<MasterFeesStatus>('/integrations/masterfees/status');
    },

    connect(payload: { schoolId: string; publicKey: string; baseUrl?: string }): Promise<any> {
        return apiJson('/integrations/masterfees/connect', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    async disconnect(): Promise<void> {
        await apiFetch('/integrations/masterfees', { method: 'DELETE' });
    },

    getFeeCategories(): Promise<MasterFeesCategory[]> {
        return apiJson<MasterFeesCategory[]>('/integrations/masterfees/fee-categories');
    },

    async mapCategory(categoryId: string, accountId: string, name?: string): Promise<void> {
        await apiFetch('/integrations/masterfees/fee-categories', {
            method: 'PUT',
            body: JSON.stringify({ categoryId, accountId, name }),
        });
    },

    async setLencoMode(lencoMode: 'shared' | 'separate'): Promise<void> {
        await apiFetch('/integrations/masterfees/lenco-mode', {
            method: 'PUT',
            body: JSON.stringify({ lencoMode }),
        });
    },

    sync(): Promise<any> {
        return apiJson('/integrations/masterfees/sync', { method: 'POST' });
    },

    reconcile(): Promise<MasterFeesReconciliation> {
        return apiJson<MasterFeesReconciliation>('/integrations/masterfees/reconcile');
    },
};
