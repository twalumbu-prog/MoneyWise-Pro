export interface ImportCard {
    id: string; title: string; description: string | null; images: string[]; category: string | null; origin: string | null; source: string;
    /** What one item costs in Zambia once it has arrived: item, shipping, duty, VAT and fee. */
    perItemZmw: number | null;
    deliveryDaysMin: number; deliveryDaysMax: number; options: { name: string; values: string[] }[]; lastRefreshedAt: string | null; createdAt: string;
    /** Found by a search and not yet checked in full: the price is a close estimate until the item is opened. */
    estimated?: boolean;
}

export interface ImportBrowse { products: ImportCard[]; total: number; hasMore: boolean; categories: { name: string; count: number }[]; enabled: boolean; needsMigration: boolean }

export interface ImportQuoteResponse {
    enabled: boolean;
    product: ImportCard & { sourceUrl: string | null };
    quote: { quantity: number; currency: string; rate: number; itemZmw: number; shippingZmw: number; taxesZmw: number; feeZmw: number; totalZmw: number; perItemZmw: number };
    taxNote: string;
    wallets: { id: string; name: string; is_main: boolean; balance: number }[];
}

export type ImportStatus = 'PENDING_PAYMENT' | 'PAYMENT_PROCESSING' | 'PAID' | 'ORDERED' | 'SHIPPED' | 'IN_TRANSIT' | 'CUSTOMS' | 'IN_LUSAKA' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED' | 'FAILED';

export interface ImportOrder {
    id: string; title: string; image_url: string | null; quantity: number; option_note: string | null; total_zmw: number;
    status: ImportStatus; tracking_number: string | null; carrier: string | null; supplier_order_ref: string | null;
    events: { at: string; status: string; note?: string }[]; created_at: string; delivery_address: string | null;
}

/** The steps an order goes through, in order (a cancelled one stops wherever it was). */
export const IMPORT_STEPS: { id: ImportStatus; label: string }[] = [
    { id: 'PAID', label: 'Paid' }, { id: 'ORDERED', label: 'Bought' }, { id: 'SHIPPED', label: 'Shipped' }, { id: 'IN_TRANSIT', label: 'On its way' },
    { id: 'CUSTOMS', label: 'Customs' }, { id: 'IN_LUSAKA', label: 'In Lusaka' }, { id: 'DELIVERED', label: 'Delivered' },
];

export const daysText = (min: number, max: number) => (min === max ? `${min} days` : `${min} to ${max} days`);
