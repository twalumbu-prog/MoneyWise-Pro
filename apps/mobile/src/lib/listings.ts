import { formatKwacha } from 'core';

/** A local seller's listing, as `GET /marketplace/listings` returns it (the same shape the web Marketplace uses). */
export interface LocalListing {
    id: string; name: string; description: string | null; price: number; imageUrl: string | null; images: string[]; category: string | null; productType: string;
    requiresDelivery: boolean; createdAt: string;
    seller: { id: string; name: string; logoUrl: string | null; isPersonal: boolean; verified: boolean; location: string | null; rating: { average: number; count: number } };
    isMine: boolean; inAppCheckout: boolean;
    auction: AuctionView | null;
}
export interface AuctionView {
    id: string; status: 'OPEN' | 'SOLD' | 'NO_SALE' | 'CANCELLED'; startPrice: number; currentBid: number | null; bidCount: number; endsAt: string; bidIncrement: number; minNextBid: number;
    buyNowPrice: number | null; hasReserve: boolean; reserveMet: boolean; iAmHighBidder: boolean; iHaveBid: boolean; iWon: boolean; winningAmount: number | null; serverNow: string;
}

export type DeliveryMethod = 'PICKUP' | 'SELLER' | 'OPUS';
export interface QuoteResponse {
    stock: { tracked: boolean; available: number | null; low: boolean; soldOut: boolean; variants: { id: string; name: string; color: string; size: string; stock: number }[]; variantId: string | null; maxQuantity: number };
    stay: { problem: string | null } | null;
    item: { id: string; name: string; imageUrl: string | null; type: string; unitPrice: number; quantity: number; itemTotal: number };
    seller: { id: string; name: string; logoUrl: string | null; location: string | null; inLusaka: boolean };
    supported: boolean; unsupportedReason: string | null;
    auction: { id: string; amount: number; payBy: string } | null;
    delivery: { options: { method: DeliveryMethod; label: string; available: boolean; comingSoon?: boolean; fee: number; note: string }[]; lusakaOnly: boolean; areas: string[] };
    wallets: { id: string; name: string; is_main: boolean; balance: number }[];
}
export interface PlacedOrder { id: string; product_name: string; quantity: number; total: number; status: string; delivery_method: DeliveryMethod; delivery_area: string | null; delivery_address: string | null }
export interface ListingsResponse { listings: LocalListing[]; categories: { name: string; count: number }[]; needsMigration?: boolean }

export const listingPrice = (l: LocalListing): string => {
    const a = l.auction;
    if (a?.status === 'OPEN') return formatKwacha(a.currentBid ?? a.startPrice);
    if (a?.status === 'SOLD' && a.winningAmount) return formatKwacha(a.winningAmount);
    return l.price > 0 ? formatKwacha(l.price) : l.productType === 'DONATION' ? 'Any amount' : 'Ask for price';
};
