/** Shapes and wording shared by the Marketplace screens (price compare, requests for quote, imports). Mirrors the web's compareTypes / importTypes. */

export interface CatalogItem { id: string; slug: string; name: string; category: string; vertical: string; unit: string; unit_detail: string | null; brand: string | null; keywords: string | null; is_active: boolean }
export interface CatalogBrowse { items: CatalogItem[]; categories: { name: string; count: number }[]; needsMigration?: boolean }

export interface Offer {
    id: string; kind: 'LISTING' | 'PRICE_POINT';
    place: string; town: string | null; province: string | null; phone: string | null; address: string | null;
    price: number; minQty: number | null; delivers: boolean; deliveryNote: string | null;
    observedOn: string | null; ageDays: number | null; freshness: 'LIVE' | 'FRESH' | 'AGING' | 'STALE';
    trust: 'LISTED' | 'VERIFIED' | 'ENTERED'; sourceType: string;
    confirmations?: number; productId?: string; orgId?: string; outOfStock?: boolean; cheapest?: boolean; vsTypical?: number;
}
export interface CompareResult {
    item: CatalogItem;
    stats: { offers: number; counted: number; lowest: number | null; typical: number | null; highest: number | null; spread: number | null };
    towns: string[]; offers: Offer[]; note: string | null;
}

export const unitText = (i: Pick<CatalogItem, 'unit' | 'unit_detail'>) => (i.unit_detail ? `${i.unit} (${i.unit_detail})` : i.unit);
export const ageText = (o: Pick<Offer, 'freshness' | 'ageDays'>) => {
    if (o.freshness === 'LIVE') return 'Listed now';
    const d = o.ageDays ?? 0;
    const when = d === 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : d < 60 ? 'about a month ago' : `${Math.round(d / 30)} months ago`;
    return `Price from ${when}`;
};

export interface RfqRow {
    id: string; reference: string; title: string; quantity: number; unit: string; delivery_town: string | null; delivery_province: string | null;
    needed_by: string | null; expires_at: string; status: string; quoteCount?: number; bestTotal?: number | null; myQuote?: { status: string; total: number } | null;
}
export interface QuoteView {
    id: string; supplierName: string; supplierPhone: string | null; onMoneyWise: boolean; unitPrice: number; quantity: number; deliveryFee: number; total: number;
    delivers: boolean; validUntil: string | null; note: string | null; status: string; payPath: string | null; cheapest?: boolean; extraVsBest?: number | null;
}
export interface RfqDetail {
    role: 'BUYER' | 'SUPPLIER';
    request: { id: string; reference: string; title: string; details: string | null; quantity: number; unit: string; deliveryTown: string | null; deliveryProvince: string | null; deliveryAddress: string | null; neededBy: string | null; status: string; expiresAt: string; catalogItem: CatalogItem | null };
    quotes: QuoteView[]; buyer: { name: string | null; phone: string | null; address: string | null } | null;
}
export const RFQ_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
    OPEN: { label: 'Open', bg: '#E8F0FE', fg: '#1967D2' }, AWARDED: { label: 'Quote accepted', bg: '#E6F4EA', fg: '#137333' },
    CANCELLED: { label: 'Cancelled', bg: '#F1F3F4', fg: '#5F6368' }, EXPIRED: { label: 'Ended', bg: '#FEF7E0', fg: '#B06000' }, CLOSED: { label: 'Closed', bg: '#F1F3F4', fg: '#5F6368' },
};
export const qtyText = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : String(n));
export const shortDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
export const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));

export interface ImportCard {
    id: string; title: string; description: string | null; images: string[]; category: string | null; origin: string | null; source: string;
    perItemZmw: number | null; deliveryDaysMin: number; deliveryDaysMax: number; options: { name: string; values: string[] }[]; lastRefreshedAt: string | null; createdAt: string;
    estimated?: boolean; store?: string | null;
    specs?: { year?: number; mileageKm?: number; engineCc?: number; fuel?: string; transmission?: string; color?: string } | null;
    vehicleEstimate?: boolean;
}
export interface ImportBrowse { products: ImportCard[]; total: number; hasMore: boolean; categories: { name: string; count: number }[]; stores?: { name: string; count: number }[]; enabled: boolean; needsMigration: boolean }
export interface ImportQuoteResponse {
    enabled: boolean;
    product: ImportCard & { sourceUrl: string | null };
    quote: { quantity: number; currency: string; rate: number; itemZmw: number; shippingZmw: number; taxesZmw: number; feeZmw: number; totalZmw: number; perItemZmw: number; estimate?: boolean };
    taxNote: string; taxLabel?: string;
    wallets: { id: string; name: string; is_main: boolean; balance: number }[];
}
export type ImportStatus = 'PENDING_PAYMENT' | 'PAYMENT_PROCESSING' | 'PAID' | 'ORDERED' | 'SHIPPED' | 'IN_TRANSIT' | 'CUSTOMS' | 'IN_LUSAKA' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED' | 'FAILED';
export interface ImportOrder {
    id: string; title: string; image_url: string | null; quantity: number; option_note: string | null; total_zmw: number;
    status: ImportStatus; tracking_number: string | null; carrier: string | null; supplier_order_ref: string | null;
    events: { at: string; status: string; note?: string }[]; created_at: string; delivery_address: string | null;
}
export const IMPORT_STEPS: { id: ImportStatus; label: string }[] = [
    { id: 'PAID', label: 'Paid' }, { id: 'ORDERED', label: 'Bought' }, { id: 'SHIPPED', label: 'Shipped' }, { id: 'IN_TRANSIT', label: 'On its way' },
    { id: 'CUSTOMS', label: 'Customs' }, { id: 'IN_LUSAKA', label: 'In Lusaka' }, { id: 'DELIVERED', label: 'Delivered' },
];
export const daysRange = (min: number, max: number) => (min === max ? `${min} days` : `${min} to ${max} days`);
