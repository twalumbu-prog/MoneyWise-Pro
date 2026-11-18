export interface CatalogItem { id: string; slug: string; name: string; category: string; vertical: string; unit: string; unit_detail: string | null; brand: string | null; keywords: string | null; is_active: boolean }

export interface CatalogBrowse { items: CatalogItem[]; categories: { name: string; count: number }[]; needsMigration?: boolean }

export interface Offer {
    id: string; kind: 'LISTING' | 'PRICE_POINT';
    place: string; town: string | null; province: string | null; phone: string | null; address: string | null;
    price: number; minQty: number | null; delivers: boolean; deliveryNote: string | null;
    observedOn: string | null; ageDays: number | null; freshness: 'LIVE' | 'FRESH' | 'AGING' | 'STALE';
    trust: 'LISTED' | 'VERIFIED' | 'ENTERED'; sourceType: string;
    confirmations?: number;
    seller?: { orders: number; completedPct: number | null; disputePct: number | null };
    productId?: string; orgId?: string; rating?: number | null; ratingCount?: number; outOfStock?: boolean; cheapest?: boolean; vsTypical?: number;
}

export interface CompareResult {
    item: CatalogItem;
    stats: { offers: number; counted: number; lowest: number | null; typical: number | null; highest: number | null; spread: number | null };
    towns: string[]; offers: Offer[]; note: string | null;
}

/** "bag (50 kg)" for an item's unit. */
export const unitText = (i: Pick<CatalogItem, 'unit' | 'unit_detail'>) => (i.unit_detail ? `${i.unit} (${i.unit_detail})` : i.unit);

export const ageText = (o: Pick<Offer, 'freshness' | 'ageDays'>) => {
    if (o.freshness === 'LIVE') return 'Listed now';
    const d = o.ageDays ?? 0;
    const when = d === 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : d < 60 ? 'about a month ago' : `${Math.round(d / 30)} months ago`;
    return `Price from ${when}`;
};
