import { apiJson } from '../api/apiFetch';

export interface Customer {
    id: string;
    organization_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    owing_status: 'OWING' | 'CLEAR';
    owing_amount: number;
    open_invoices_count: number;
    total_spend: number;
    created_at: string;
    updated_at: string;
}

export interface CustomerTransaction {
    id: string;
    type: 'INVOICE' | 'RECEIPT';
    date: string;
    description: string;
    amount: number;
    status: 'OWING' | 'PAID' | 'ACTIVE' | 'PENDING' | 'CANCELLED' | string;
    reference?: string;
    items?: any[];
}

export interface CreateCustomerInput {
    name: string;
    email?: string;
    phone?: string;
    notes?: string;
}

export interface UpdateCustomerInput {
    name?: string;
    email?: string;
    phone?: string;
    notes?: string;
    status?: string;
}

export const crmService = {
    async listCustomers(): Promise<Customer[]> {
        return apiJson<Customer[]>('/crm/customers');
    },

    async getCustomer(id: string): Promise<Customer> {
        return apiJson<Customer>(`/crm/customers/${id}`);
    },

    async createCustomer(data: CreateCustomerInput): Promise<Customer> {
        return apiJson<Customer>('/crm/customers', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async updateCustomer(id: string, data: UpdateCustomerInput): Promise<Customer> {
        return apiJson<Customer>(`/crm/customers/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },

    async deleteCustomer(id: string): Promise<{ success: boolean }> {
        return apiJson<{ success: boolean }>(`/crm/customers/${id}`, {
            method: 'DELETE',
        });
    },

    async getCustomerTransactions(id: string): Promise<CustomerTransaction[]> {
        return apiJson<CustomerTransaction[]>(`/crm/customers/${id}/transactions`);
    },
};
