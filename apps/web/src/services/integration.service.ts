import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface IntegrationStatus {
    connected: boolean;
    companyName?: string;
    lastSync?: string;
    details?: any;
    config?: any;
}

export const integrationService = {
    async getStatus(): Promise<IntegrationStatus> {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`${API_URL}/integrations/status`, {
            headers: {
                'Authorization': `Bearer ${session?.access_token}`
            }
        });

        if (response.status === 404) {
            return { connected: false, details: null };
        }

        if (!response.ok) throw new Error('Failed to fetch integration status');
        return response.json();
    },

    async getConnectUrl(): Promise<string> {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`${API_URL}/integrations/quickbooks/connect`, {
            headers: {
                'Authorization': `Bearer ${session?.access_token}`
            }
        });
        if (!response.ok) throw new Error('Failed to get connect URL');
        const data = await response.json();
        return data.url;
    },

    async disconnect(): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`${API_URL}/integrations/quickbooks`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${session?.access_token}`
            }
        });
        if (!response.ok) throw new Error('Failed to disconnect');
    },

    async getAccounts(): Promise<any[]> {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`${API_URL}/integrations/quickbooks/accounts`, {
            headers: {
                'Authorization': `Bearer ${session?.access_token}`
            }
        });
        if (!response.ok) throw new Error('Failed to fetch QuickBooks accounts');
        return response.json();
    },

    async retrySync(requisitionId: string): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`${API_URL}/integrations/quickbooks/sync/${requisitionId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session?.access_token}`
            }
        });
        if (!response.ok) throw new Error('Failed to initiate sync retry');
    }
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
}

export interface MasterFeesCategory {
    id: string;
    name: string;
    amount: number | null;
    accountId: string | null;
}

async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
}

async function parseError(response: Response, fallback: string): Promise<never> {
    let msg = fallback;
    try { msg = (await response.json())?.error || fallback; } catch { /* ignore */ }
    throw new Error(msg);
}

export const masterFeesService = {
    /** Returns the Master Fees OAuth consent URL. Redirect the user's browser there to start 1-click setup. */
    async getOAuthUrl(): Promise<string> {
        const response = await fetch(`${API_URL}/integrations/masterfees/oauth/url`, { headers: await authHeaders() });
        if (!response.ok) await parseError(response, 'Failed to get Master Fees OAuth URL');
        return (await response.json()).url;
    },

    async getStatus(): Promise<MasterFeesStatus> {
        const response = await fetch(`${API_URL}/integrations/masterfees/status`, { headers: await authHeaders() });
        if (!response.ok) await parseError(response, 'Failed to fetch Master Fees status');
        return response.json();
    },

    async connect(payload: { schoolId: string; publicKey: string; baseUrl?: string }): Promise<any> {
        const response = await fetch(`${API_URL}/integrations/masterfees/connect`, {
            method: 'POST', headers: await authHeaders(), body: JSON.stringify(payload),
        });
        if (!response.ok) await parseError(response, 'Failed to connect Master Fees');
        return response.json();
    },

    async disconnect(): Promise<void> {
        const response = await fetch(`${API_URL}/integrations/masterfees`, { method: 'DELETE', headers: await authHeaders() });
        if (!response.ok) await parseError(response, 'Failed to disconnect Master Fees');
    },

    async getFeeCategories(): Promise<MasterFeesCategory[]> {
        const response = await fetch(`${API_URL}/integrations/masterfees/fee-categories`, { headers: await authHeaders() });
        if (!response.ok) await parseError(response, 'Failed to fetch fee categories');
        return response.json();
    },

    async mapCategory(categoryId: string, accountId: string, name?: string): Promise<void> {
        const response = await fetch(`${API_URL}/integrations/masterfees/fee-categories`, {
            method: 'PUT', headers: await authHeaders(), body: JSON.stringify({ categoryId, accountId, name }),
        });
        if (!response.ok) await parseError(response, 'Failed to save category mapping');
    },

    async setLencoMode(lencoMode: 'shared' | 'separate'): Promise<void> {
        const response = await fetch(`${API_URL}/integrations/masterfees/lenco-mode`, {
            method: 'PUT', headers: await authHeaders(), body: JSON.stringify({ lencoMode }),
        });
        if (!response.ok) await parseError(response, 'Failed to update Lenco mode');
    },

    async sync(): Promise<any> {
        const response = await fetch(`${API_URL}/integrations/masterfees/sync`, { method: 'POST', headers: await authHeaders() });
        if (!response.ok) await parseError(response, 'Failed to sync Master Fees');
        return response.json();
    },

    async reconcile(): Promise<{ moneywiseReceivable: number; masterfeesOutstanding: number; difference: number; studentsWithBalance: number }> {
        const response = await fetch(`${API_URL}/integrations/masterfees/reconcile`, { headers: await authHeaders() });
        if (!response.ok) await parseError(response, 'Failed to reconcile Master Fees');
        return response.json();
    },
};
