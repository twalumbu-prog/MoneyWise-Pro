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

    async disconnect(removeData: boolean = false): Promise<{ success: boolean; dataRemoved: boolean; purged?: { cashbookEntries: number; journals: number; records: number } }> {
        return apiJson('/integrations/masterfees' + (removeData ? '?removeData=true' : ''), { method: 'DELETE' });
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

// ── Sage Accounting (Africa cloud) ───────────────────────────────────────────
export interface SageStatus {
    configured: boolean;
    connected: boolean;
    companyId?: string;
    companyName?: string;
    username?: string;
    connectedAt?: string;
    mappedAccounts?: number;
    lastSyncedAt?: string | null;
    syncCounts?: Record<string, number>;
}

export interface SageAccount { id: string; name: string; category: string | null; active: boolean; balance: number }

export interface SageMapping {
    id: string;
    code: string | null;
    name: string;
    type: string;
    is_active: boolean;
    sage_account_id: string | null;
    sage_account_name: string | null;
}

export interface SageSyncResult {
    fromDate: string;
    toDate: string;
    scanned: number;
    posted: number;
    unchanged: number;
    skipped: number;
    failed: number;
    truncated: boolean;
    errors: Array<{ reference: string | null; error: string }>;
}

export const sageService = {
    getStatus(): Promise<SageStatus> {
        return apiJson<SageStatus>('/integrations/sage/status');
    },

    /** Returns `needsCompany` + `companies` when the login has several companies and none was chosen. */
    connect(payload: { username: string; password: string; companyId?: string }): Promise<{
        connected: boolean;
        needsCompany?: boolean;
        companies?: Array<{ id: string; name: string }>;
        companyName?: string;
    }> {
        return apiJson('/integrations/sage/connect', { method: 'POST', body: JSON.stringify(payload) });
    },

    async disconnect(): Promise<void> {
        await apiFetch('/integrations/sage', { method: 'DELETE' });
    },

    getAccounts(): Promise<SageAccount[]> {
        return apiJson<SageAccount[]>('/integrations/sage/accounts');
    },

    getMappings(): Promise<SageMapping[]> {
        return apiJson<SageMapping[]>('/integrations/sage/mappings');
    },

    async setMapping(accountId: string, sageAccountId: string | null, sageAccountName?: string | null): Promise<void> {
        await apiFetch('/integrations/sage/mappings', {
            method: 'PUT',
            body: JSON.stringify({ accountId, sageAccountId, sageAccountName }),
        });
    },

    sync(payload: { from?: string; to?: string } = {}): Promise<SageSyncResult> {
        return apiJson<SageSyncResult>('/integrations/sage/sync', { method: 'POST', body: JSON.stringify(payload) });
    },
};
