import { supabase } from '../lib/supabase';
import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export type ProductType = 'PRODUCT' | 'SERVICE_FIXED' | 'SERVICE_VARIABLE' | 'DONATION' | 'SERVICE_BOOKING' | 'SERVICE_BOOKING_DAILY';

/** Single source of truth for the product-type choices shown wherever a
 *  listing is created or edited (Settings' product manager, onboarding). */
export const PRODUCT_TYPE_OPTIONS: { value: ProductType; label: string; hint: string }[] = [
    { value: 'PRODUCT', label: 'Product (tangible)', hint: 'A physical item sold at a fixed price, by quantity.' },
    { value: 'SERVICE_FIXED', label: 'Service — fixed price', hint: 'A service offered at one established price.' },
    { value: 'SERVICE_VARIABLE', label: 'Service — variable price', hint: 'Price is set by you when sharing a one-time link.' },
    { value: 'SERVICE_BOOKING', label: 'Service (Booking – Apartments)', hint: 'Guests pick check-in / check-out on a calendar. Total = nights × nightly rate. Booked dates are blocked so you never double-book.' },
    { value: 'SERVICE_BOOKING_DAILY', label: 'Service (Booking – Daily Rental)', hint: 'Customers pick a pickup and drop-off date on a calendar. Total = days × daily rate. Booked dates are blocked so you never double-book.' },
    { value: 'DONATION', label: 'Donation', hint: 'The payer decides the amount to give.' },
];

export interface BookingRange {
    check_in: string;  // YYYY-MM-DD
    check_out: string; // YYYY-MM-DD (exclusive — turnover day stays bookable)
}

/** Both booking flavors (apartments / daily rental) share identical date-range,
 *  availability, and pricing mechanics — only the customer-facing wording differs. */
export const isBookingProductType = (t?: string | null): boolean =>
    t === 'SERVICE_BOOKING' || t === 'SERVICE_BOOKING_DAILY';

export interface BookingTerminology {
    unit: 'night' | 'day';
    /** e.g. "Check-in" / "Pickup" */
    startLabel: string;
    /** e.g. "Check-out" / "Drop-off" */
    endLabel: string;
}

/** Single source of truth for the wording swap between the two booking flavors. */
export const getBookingTerminology = (t?: string | null): BookingTerminology =>
    t === 'SERVICE_BOOKING_DAILY'
        ? { unit: 'day', startLabel: 'Pickup', endLabel: 'Drop-off' }
        : { unit: 'night', startLabel: 'Check-in', endLabel: 'Check-out' };

/** "3 nights" / "1 day" — the pluralized unit count used across cart lines,
 *  order summaries, and the calendar footer. */
export const formatBookingDuration = (count: number, t?: string | null): string => {
    const { unit } = getBookingTerminology(t);
    return `${count} ${unit}${count === 1 ? '' : 's'}`;
};

export interface Product {
    id: string;
    organization_id: string;
    name: string;
    description?: string;
    price: number;
    is_active: boolean;
    image_url?: string | null;
    product_type?: ProductType;
    wallet_id?: string | null;
    income_account_id?: string | null;
    category?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface PaymentLink {
    id: string;
    organization_id: string;
    product_id: string;
    token: string;
    customer_name: string;
    customer_phone: string;
    amount: number;
    wallet_id?: string | null;
    status: 'ACTIVE' | 'PAID' | 'CANCELLED';
    reference?: string | null;
    created_at?: string;
    paid_at?: string | null;
    path?: string;
    email_sent?: boolean;
}

export interface InvoiceLinkItem {
    product_id: string;
    quantity: number;
    /** Client-set amount for DONATION products only (server prices everything else). */
    price?: number;
    check_in?: string;
    check_out?: string;
}

export interface InvoiceLinkPayload {
    items: InvoiceLinkItem[];
    customer_name: string;
    customer_phone: string;
    customer_email?: string;
    wallet_id?: string | null;
    send_email: boolean;
}

export const productService = {
    async getProducts(): Promise<Product[]> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const response = await axios.get(`${API_URL}/organizations/products`, {
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });

        return response.data;
    },

    async createProduct(product: Partial<Product>): Promise<Product> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const response = await axios.post(`${API_URL}/organizations/products`, product, {
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });

        return response.data;
    },

    async updateProduct(id: string, product: Partial<Product>): Promise<Product> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const response = await axios.put(`${API_URL}/organizations/products/${id}`, product, {
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });

        return response.data;
    },

    async deleteProduct(id: string): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        await axios.delete(`${API_URL}/organizations/products/${id}`, {
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });
    },

    async getProductSales(id: string): Promise<any[]> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        const response = await axios.get(`${API_URL}/organizations/products/${id}/sales`, {
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });

        return response.data;
    },

    // Public (no auth): confirmed booked date ranges for a bookable product, used
    // by the portal calendar to grey out unavailable nights.
    async getAvailability(productId: string): Promise<BookingRange[]> {
        const response = await axios.get(`${API_URL}/lenco/public-product-availability/${productId}`);
        return response.data?.bookings || [];
    }
};

export const paymentLinkService = {
    async createPaymentLink(payload: {
        product_id: string;
        customer_name: string;
        customer_phone: string;
        amount: number;
    }): Promise<PaymentLink> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const response = await axios.post(`${API_URL}/organizations/payment-links`, payload, {
            headers: { Authorization: `Bearer ${session.access_token}` }
        });
        return response.data;
    },

    /** Multi-item invoice link built from a New Sale cart; optionally emailed. */
    async createInvoiceLink(payload: InvoiceLinkPayload): Promise<PaymentLink> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const response = await axios.post(`${API_URL}/organizations/payment-links/invoice`, payload, {
            headers: { Authorization: `Bearer ${session.access_token}` }
        });
        return response.data;
    },

    async listPaymentLinks(productId?: string): Promise<PaymentLink[]> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const response = await axios.get(`${API_URL}/organizations/payment-links`, {
            params: productId ? { product_id: productId } : undefined,
            headers: { Authorization: `Bearer ${session.access_token}` }
        });
        return response.data;
    },

    async deactivatePaymentLink(id: string): Promise<PaymentLink> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const response = await axios.post(`${API_URL}/organizations/payment-links/${id}/deactivate`, {}, {
            headers: { Authorization: `Bearer ${session.access_token}` }
        });
        return response.data;
    }
};
