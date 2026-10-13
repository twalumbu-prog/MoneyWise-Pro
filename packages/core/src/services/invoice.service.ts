import { apiFetch, apiJson } from '../api/apiFetch';

export type InvoiceStatus = 'OPEN' | 'PARTIAL' | 'PAID' | 'VOID';

export interface InvoiceLine {
    product_id?: string;
    name: string;
    quantity: number;
    unit_price: number;
    income_account_id?: string | null;
    check_in?: string;
    check_out?: string;
    custom?: boolean;
}

export interface CustomerInvoice {
    id: string;
    organization_id: string;
    invoice_number: string;
    customer_id: string | null;
    customer_name: string;
    customer_phone: string | null;
    customer_email: string | null;
    issue_date: string;
    follow_up_date: string;
    items: InvoiceLine[];
    total: number;
    amount_paid: number;
    balance: number;
    is_overdue: boolean;
    status: InvoiceStatus;
    notes: string | null;
    last_sent_at: string | null;
    sent_count: number;
    created_at: string;
}

export interface InvoicePaymentRow {
    id: string;
    amount: number;
    created_at: string;
    cashbook_entry_id: string;
    cashbook_entries?: { reference_number: string | null; date: string; description: string | null; account_type: string | null } | null;
}

export interface CreateCreditSaleInput {
    items: Array<{
        product_id?: string;
        custom?: boolean;
        name?: string;
        quantity: number;
        price?: number;
        income_account_id?: string | null;
        check_in?: string;
        check_out?: string;
    }>;
    customer: { id?: string | null; name: string; phone?: string | null; email?: string | null };
    follow_up_date: string;
    issue_date?: string;
    notes?: string | null;
    send_email?: boolean;
    /** Also create a one-time pay-by-link link (default true). */
    create_pay_link?: boolean;
}

export interface InvoicePayLink {
    id: string;
    token: string;
    amount: number;
    status: string;
    path: string;
    /** Absolute URL to share with the customer. */
    url: string;
}

export interface EntryAllocation {
    id: string;
    invoice_id: string;
    amount: number;
    customer_invoices?: { invoice_number: string; customer_id: string | null; customer_name: string; total: number; amount_paid: number; status: InvoiceStatus } | null;
}

export const invoiceService = {
    create(input: CreateCreditSaleInput): Promise<CustomerInvoice & { customer_created: boolean; email_sent: boolean; email_error: string | null; pay_link: InvoicePayLink | null; pay_link_error: string | null }> {
        return apiJson('/invoices', { method: 'POST', body: JSON.stringify(input) });
    },

    list(status?: 'ACTIVE' | InvoiceStatus, customerId?: string): Promise<CustomerInvoice[]> {
        const qs = new URLSearchParams();
        if (status) qs.set('status', status);
        if (customerId) qs.set('customer_id', customerId);
        const q = qs.toString();
        return apiJson(`/invoices${q ? `?${q}` : ''}`);
    },

    /** Invoices still owing money — what a received payment can be applied to. */
    listOpen(customerId?: string): Promise<CustomerInvoice[]> {
        return apiJson(`/invoices/open${customerId ? `?customer_id=${encodeURIComponent(customerId)}` : ''}`);
    },

    get(id: string): Promise<CustomerInvoice & { payments: InvoicePaymentRow[]; pay_link: InvoicePayLink | null }> {
        return apiJson(`/invoices/${id}`);
    },

    async downloadPdf(id: string): Promise<Blob> {
        const res = await apiFetch(`/invoices/${id}/pdf`);
        return res.blob();
    },

    send(id: string, email?: string): Promise<{ success: boolean; sent_to: string }> {
        return apiJson(`/invoices/${id}/send`, { method: 'POST', body: JSON.stringify({ email }) });
    },

    /** The invoice's one-time "Pay now" link for its current balance (created if needed). */
    payLink(id: string): Promise<InvoicePayLink> {
        return apiJson(`/invoices/${id}/pay-link`, { method: 'POST' });
    },

    void(id: string): Promise<CustomerInvoice> {
        return apiJson(`/invoices/${id}/void`, { method: 'POST' });
    },

    getEntryAllocations(entryId: string): Promise<EntryAllocation[]> {
        return apiJson(`/invoices/allocations/${entryId}`);
    },

    /** Apply a received wallet inflow across customer invoices (replaces any earlier split of the same inflow). */
    allocate(entryId: string, allocations: { invoice_id: string; amount: number }[]): Promise<{ applied: number; unapplied: number }> {
        return apiJson('/invoices/allocate', { method: 'POST', body: JSON.stringify({ entry_id: entryId, allocations }) });
    },
};
