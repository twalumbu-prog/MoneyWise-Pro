import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface IntegrationStatus {
    connected: boolean;
    details: {
        provider: string;
        token_expires_at: string;
        updated_at: string;
        realm_id: string;
    } | null;
}

export const integrationService = {
    async getStatus(): Promise<IntegrationStatus> {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`${API_URL}/integrations/status`, {
            headers: {
                'Authorization': `Bearer ${session?.access_token}`
            }
        });
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
