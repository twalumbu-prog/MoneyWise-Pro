import { apiFetch, apiJson } from '../api/apiFetch';

export type ProductType = 'PRODUCT' | 'SERVICE_FIXED' | 'SERVICE_VARIABLE' | 'DONATION' | 'SERVICE_BOOKING' | 'SERVICE_BOOKING_DAILY' | 'DIGITAL';

/** A file sold as a digital product, stored in the private `product-assets`
 *  bucket and delivered to the buyer by email once they pay. */
export interface DigitalAsset {
    name: string;
    path: string;
    size?: number;
    content_type?: string;
}

/** Single source of truth for the product-type choices shown wherever a
 *  listing is created or edited (Settings' product manager, onboarding). */
export const PRODUCT_TYPE_OPTIONS: { value: ProductType; label: string; hint: string }[] = [
    { value: 'PRODUCT', label: 'Product (tangible)', hint: 'A physical item sold at a fixed price, by quantity.' },
    { value: 'SERVICE_FIXED', label: 'Service — fixed price', hint: 'A service offered at one established price.' },
    { value: 'SERVICE_VARIABLE', label: 'Service — variable price', hint: 'Price is set by you when sharing a one-time link.' },
    { value: 'SERVICE_BOOKING', label: 'Service (Booking – Apartments)', hint: 'Guests pick check-in / check-out on a calendar. Total = nights × nightly rate. Booked dates are blocked so you never double-book.' },
    { value: 'SERVICE_BOOKING_DAILY', label: 'Service (Booking – Daily Rental)', hint: 'Customers pick a pickup and drop-off date on a calendar. Total = days × daily rate. Booked dates are blocked so you never double-book.' },
    { value: 'DONATION', label: 'Donation', hint: 'The payer decides the amount to give.' },
    { value: 'DIGITAL', label: 'Digital product', hint: 'Upload a file (e-book, template, audio, software). The buyer is emailed the file automatically the moment they pay.' },
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
    digital_assets?: DigitalAsset[] | null;
    /** Whether this product requires physical delivery / pick-up at checkout. */
    requires_delivery?: boolean;
    /** When true, the checkout shows the rider-service selector;
     *  when false, the merchant handles delivery at a flat charge. */
    allow_external_delivery?: boolean;
    /** Flat delivery fee (ZMW) when the merchant manages their own delivery. */
    own_delivery_charge?: number;
    /** Additional product images for the store detail carousel (ordered array of URLs). */
    additional_images?: string[];
    /** Bullet-point list of features / inclusions shown on the store detail page. */
    whats_included?: string[];
    created_at?: string;
    updated_at?: string;
}

/** Delivery details captured at checkout and stored with each sale. */
export interface OrderDeliveryDetails {
    mode: 'deliver' | 'pickup';
    country?: string;
    state?: string;
    street?: string;
    apartment?: string;
    rider_service?: string;
    rider_service_name?: string;
    delivery_charge?: number;
}

/** Snapshot of a single line item stored inside payment_links.items */
export interface InvoiceLinkSnapshotItem {
    product_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    check_in?: string;
    check_out?: string;
}

export interface PaymentLink {
    id: string;
    organization_id: string;
    /** null for multi-item invoice links */
    product_id?: string | null;
    token: string;
    customer_name: string;
    customer_phone: string;
    customer_email?: string | null;
    amount: number;
    wallet_id?: string | null;
    status: 'ACTIVE' | 'PAID' | 'CANCELLED';
    reference?: string | null;
    created_at?: string;
    paid_at?: string | null;
    path?: string;
    email_sent?: boolean;
    is_archived?: boolean;
    /** Present on invoice-type links (product_id is null); null on single-product links */
    items?: InvoiceLinkSnapshotItem[] | null;
}

export interface UpdateInvoiceLinkPayload {
    customer_name: string;
    customer_phone: string;
    customer_email?: string | null;
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
    getProducts(): Promise<Product[]> {
        return apiJson<Product[]>('/organizations/products');
    },

    createProduct(product: Partial<Product>): Promise<Product> {
        return apiJson<Product>('/organizations/products', {
            method: 'POST',
            body: JSON.stringify(product),
        });
    },

    updateProduct(id: string, product: Partial<Product>): Promise<Product> {
        return apiJson<Product>(`/organizations/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify(product),
        });
    },

    async deleteProduct(id: string): Promise<void> {
        await apiFetch(`/organizations/products/${id}`, { method: 'DELETE' });
    },

    getProductSales(id: string): Promise<any[]> {
        return apiJson<any[]>(`/organizations/products/${id}/sales`);
    },

    /**
     * Public (no auth): confirmed booked date ranges for a bookable product,
     * used by the portal calendar to grey out unavailable nights. Reached by
     * signed-out customers, so apiFetch simply sends no Authorization header.
     */
    async getAvailability(productId: string): Promise<BookingRange[]> {
        const data = await apiJson<{ bookings?: BookingRange[] }>(
            `/lenco/public-product-availability/${productId}`,
        );
        return data?.bookings || [];
    },
};

export const paymentLinkService = {
    createPaymentLink(payload: {
        product_id: string;
        customer_name: string;
        customer_phone: string;
        amount: number;
    }): Promise<PaymentLink> {
        return apiJson<PaymentLink>('/organizations/payment-links', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    /** Multi-item invoice link built from a New Sale cart; optionally emailed. */
    createInvoiceLink(payload: InvoiceLinkPayload): Promise<PaymentLink> {
        return apiJson<PaymentLink>('/organizations/payment-links/invoice', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    listPaymentLinks(productId?: string): Promise<PaymentLink[]> {
        const qs = productId ? `?${new URLSearchParams({ product_id: productId })}` : '';
        return apiJson<PaymentLink[]>(`/organizations/payment-links${qs}`);
    },

    /**
     * Invoice-type payment links only — those with a multi-item items[] snapshot.
     * Passes ?invoice=true so the API filters server-side; avoids pulling every
     * single-product link just to discard them on the client.
     */
    listInvoiceLinks(): Promise<PaymentLink[]> {
        return apiJson<PaymentLink[]>('/organizations/payment-links?invoice=true');
    },

    deactivatePaymentLink(id: string): Promise<PaymentLink> {
        return apiJson<PaymentLink>(`/organizations/payment-links/${id}/deactivate`, {
            method: 'POST',
            body: JSON.stringify({}),
        });
    },

    archiveInvoiceLink(id: string, archived = true): Promise<PaymentLink> {
        return apiJson<PaymentLink>(`/organizations/payment-links/${id}/archive`, {
            method: 'PATCH',
            body: JSON.stringify({ archived }),
        });
    },

    updateInvoiceLink(id: string, payload: UpdateInvoiceLinkPayload): Promise<PaymentLink> {
        return apiJson<PaymentLink>(`/organizations/payment-links/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });
    },
};
