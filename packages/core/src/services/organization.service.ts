import { apiFetch, apiJson } from '../api/apiFetch';

export interface Organization {
    id: string;
    name: string;
    slug: string;
    email?: string;
    phone?: string;
    address?: string;
    tax_id?: string;
    website?: string;
    lenco_subaccount_id?: string;
    lenco_public_key?: string;
    lenco_secret_key?: string;
    payment_test_mode?: boolean;
    logo_url?: string;
    use_departments?: boolean;
}

export const organizationService = {
    getOrganization(): Promise<Organization> {
        return apiJson<Organization>('/organizations');
    },

    updateOrganization(data: Partial<Organization>): Promise<Organization> {
        return apiJson<Organization>('/organizations', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    async deleteOrganization(): Promise<void> {
        await apiFetch('/organizations', { method: 'DELETE' });
    },

    /** Fetches (generating on first call) the org's clean Quick Link username. */
    async getOrCreateQuickLinkUsername(): Promise<string> {
        const data = await apiJson<{ username: string }>('/organizations/quick-link-username');
        return data.username;
    },
};
