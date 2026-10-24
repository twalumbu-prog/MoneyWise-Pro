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
    /** Blue Opus only: which of its products this customer belongs to. */
    product?: CrmProduct | null;
    product_label?: string | null;
}

export type CrmProduct = 'MONEYWISE' | 'PROJECT_GENIUS';

export interface CrmProductSummary {
    enabled: boolean;
    products: { product: CrmProduct; label: string; total: number; active: number }[];
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

export type LoyaltySegment = 'CHAMPION' | 'LOYAL' | 'NEW' | 'OCCASIONAL' | 'AT_RISK' | 'LAPSED' | 'PROSPECT';

export interface LoyaltySummary {
    customer_id: string;
    segment: LoyaltySegment;
    order_count: number;
    last_purchase_at: string | null;
    days_since_last_purchase: number | null;
}

export interface LoyaltyOverview {
    segments: { value: LoyaltySegment; label: string; hint: string; count: number }[];
    products: { key: string; name: string; buyers: number }[];
    customers: LoyaltySummary[];
}

export interface FavouriteProduct {
    key: string;
    name: string;
    times_bought: number;
    quantity: number;
    total_spent: number;
}

export interface CustomerLoyalty {
    customer_id: string;
    segment: LoyaltySegment;
    segment_label?: string;
    order_count: number;
    total_spent: number;
    first_purchase_at: string | null;
    last_purchase_at: string | null;
    days_since_last_purchase: number | null;
    avg_days_between_orders: number | null;
    active_days_last_year: number;
    /** Keyed by local calendar day (YYYY-MM-DD), last ~53 weeks. */
    daily: Record<string, { orders: number; amount: number }>;
    top_products: FavouriteProduct[];
    distinct_products: number;
}

export interface CampaignAudience {
    payment: 'ALL' | 'OWING' | 'CLEAR';
    segments: LoyaltySegment[];
    product_keys: string[];
    product?: CrmProduct;
}

export interface CampaignPreview {
    matched: number;
    recipients: number;
    without_email: number;
    over_limit: boolean;
    max_recipients: number;
    sample: { name: string; email: string | null }[];
    /** Everyone who would receive the email (capped at 2,000 rows). */
    list: {
        customer_id: string;
        name: string;
        email: string | null;
        segment: LoyaltySegment;
        owing_status: 'OWING' | 'CLEAR';
        order_count: number;
    }[];
}

export interface SendCampaignInput {
    audience: CampaignAudience;
    subject: string;
    body: string;
    cta_label?: string;
    cta_url?: string;
    test_only?: boolean;
}

export interface DraftCampaignInput {
    instructions: string;
    audience_description?: string;
    current_subject?: string;
    current_body?: string;
}

export interface SendCampaignResult {
    sent: number;
    failed?: number;
    matched?: number;
    without_email?: number;
    test?: boolean;
    to?: string;
}

export const crmService = {
    async listCustomers(): Promise<Customer[]> {
        return apiJson<Customer[]>('/crm/customers');
    },

    async getProductSummary(): Promise<CrmProductSummary> {
        return apiJson<CrmProductSummary>('/crm/products');
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

    async getLoyaltyOverview(): Promise<LoyaltyOverview> {
        return apiJson<LoyaltyOverview>('/crm/loyalty');
    },

    async getCustomerLoyalty(id: string): Promise<CustomerLoyalty> {
        return apiJson<CustomerLoyalty>(`/crm/customers/${id}/loyalty`);
    },

    async previewCampaign(audience: CampaignAudience): Promise<CampaignPreview> {
        return apiJson<CampaignPreview>('/crm/campaigns/preview', {
            method: 'POST',
            body: JSON.stringify({ audience }),
        });
    },

    async sendCampaign(input: SendCampaignInput): Promise<SendCampaignResult> {
        return apiJson<SendCampaignResult>('/crm/campaigns/send', {
            method: 'POST',
            body: JSON.stringify(input),
        });
    },

    async draftCampaignEmail(input: DraftCampaignInput): Promise<{ subject: string; body: string }> {
        return apiJson<{ subject: string; body: string }>('/crm/campaigns/draft', {
            method: 'POST',
            body: JSON.stringify(input),
        });
    },
};
