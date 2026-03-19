import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export const lencoService = {
    async getAccounts() {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/lenco/accounts`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch Lenco accounts');
        }

        return response.json();
    },

    async provisionOrganizationSubaccount(organizationId: string) {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/lenco/organizations/${organizationId}/provision`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to provision organization subaccount');
        }

        return response.json();
    },

    async getAvailableAccounts() {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/lenco/available-accounts`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch available Lenco accounts');
        }

        return response.json();
    },

    async linkOrganizationSubaccount(organizationId: string, lencoSubaccountId: string) {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/lenco/organizations/${organizationId}/link`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ lenco_subaccount_id: lencoSubaccountId })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to link organization subaccount');
        }

        return response.json();
    },

    async verifyStatus(reference: string, transactionId?: string, organizationId?: string) {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
 
        let url = `${API_URL}/lenco/verify-status/${reference}`;
        const params = new URLSearchParams();
        if (transactionId) params.append('transactionId', transactionId);
        if (organizationId) params.append('organizationId', organizationId);
        
        const queryString = params.toString();
        if (queryString) {
            url += `?${queryString}`;
        }
 
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
 
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to verify transaction status');
        }
 
        return response.json();
    },

    async getReconciliationSummary(organizationId: string) {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/lenco/reconcile/${organizationId}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch reconciliation summary');
        }

        return response.json();
    },

    async getBanks() {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/lenco/banks`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch banks');
        }

        return response.json();
    },

    async resolveBankAccount(accountNumber: string, bankId: string, organizationId?: string) {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const headers: any = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        if (organizationId) headers['x-organization-id'] = organizationId;

        const response = await fetch(`${API_URL}/lenco/resolve-bank`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ accountNumber, bankId })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to resolve bank account');
        }

        return response.json();
    },

    async resolveMobileMoney(phone: string, operator: string, organizationId?: string) {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const headers: any = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        if (organizationId) headers['x-organization-id'] = organizationId;

        const response = await fetch(`${API_URL}/lenco/resolve-momo`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ phone, operator })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to resolve mobile money account');
        }

        return response.json();
    },

    async verifyDisbursementStatus(requisitionId: string) {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const response = await fetch(`${API_URL}/requisitions/${requisitionId}/verify-disbursement`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to verify disbursement status');
        }

        return response.json();
    }
};
