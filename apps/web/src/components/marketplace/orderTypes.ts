export type DeliveryMethod = 'PICKUP' | 'SELLER' | 'OPUS';
export type Size = 'SMALL' | 'MEDIUM' | 'LARGE' | 'BULKY';
export type Speed = 'STANDARD' | 'EXPRESS';

export interface DeliveryOption { method: DeliveryMethod; label: string; available: boolean; comingSoon?: boolean; fee: number; note: string }

export interface OpusQuote {
    available: boolean; comingSoon: boolean; distanceKm: number; size: Size; speed: Speed;
    weightKg: number; quantity: number; truckShare: number; tooBig: string | null;
    driveMinutes: number; routeSource: 'ROAD' | 'ESTIMATE'; waiting: { freeMinutes: number; perMinute: number; cap: number };
    breakdown: { base: number; distance: number; time: number; loadAdjustment: number; handling: number; surge: number; speedAdjustment: number };
    fee: number; etaMinutes: number;
}

export interface Wallet { id: string; name: string; is_main: boolean; balance: number }

export interface PayLaterOffer {
    enabled: boolean; eligible: boolean; score: number; limit: number; available: number; reasons: string[];
    instalments: number; gapDays: number; minOrder: number; lateFee: string;
    stats: { accountAgeDays: number; inflow90d: number; depositMonths: number; averageMonthlyInflow: number; completedPlans: number; latePayments: number };
}

export interface PayLaterInstalment { id: string; seq: number; amount: number; due_date: string; status: 'PENDING' | 'PAID' | 'LATE'; late_fee: number; paid_at: string | null }
export interface PayLaterPlan { id: string; description: string; principal: number; status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED'; created_at: string; instalments: PayLaterInstalment[] }

/** Four near-equal instalments, the first due now and the rest every two weeks (mirrors the server). */
export function payLaterSchedule(total: number): { seq: number; amount: number; dueDate: Date }[] {
    const cents = Math.round(total * 100);
    const each = Math.floor(cents / 4);
    return [0, 1, 2, 3].map((i) => ({ seq: i + 1, amount: (each + (i === 0 ? cents - each * 4 : 0)) / 100, dueDate: new Date(Date.now() + i * 14 * 86_400_000) }));
}

export interface QuoteResponse {
    payLater: PayLaterOffer;
    stock: { tracked: boolean; available: number | null; low: boolean; soldOut: boolean; variants: { id: string; name: string; color: string; size: string; stock: number }[]; variantId: string | null; maxQuantity: number };
    parcel: { size: Size; weightKg: number | null; setBySeller: boolean; estimatedFrom: 'LISTING' | 'ITEM' | 'AI' | 'DEFAULT' | null };
    /** For a room or rental: the dates asked for, the nights already paid for, and what is wrong with the dates (if anything). */
    stay: { checkIn: string | null; checkOut: string | null; nights: number; booked: { check_in: string; check_out: string }[]; problem: string | null } | null;
    item: { id: string; name: string; imageUrl: string | null; type: string; unitPrice: number; quantity: number; itemTotal: number };
    seller: { id: string; name: string; logoUrl: string | null; location: string | null; inLusaka: boolean };
    supported: boolean;
    unsupportedReason: string | null;
    storePath: string;
    auction: { id: string; amount: number; payBy: string } | null;
    delivery: { options: DeliveryOption[]; opus: OpusQuote | null; lusakaOnly: boolean; areas: string[] };
    wallets: Wallet[];
    fees: { moneyWisePay: number };
}

export type OrderStatus = 'PENDING_PAYMENT' | 'PAYMENT_PROCESSING' | 'PAID' | 'PROCESSING' | 'READY' | 'OUT_FOR_DELIVERY' | 'COMPLETED' | 'DISPUTED' | 'FAILED' | 'REFUNDED';

export interface Order {
    id: string;
    product_id: string | null;
    product_name: string;
    seller_org_id: string;
    seller_name?: string;
    seller_logo?: string | null;
    buyer_user_id: string;
    buyer_name: string;
    buyer_phone: string | null;
    auction_id: string | null;
    quantity: number;
    unit_price: number;
    item_total: number;
    delivery_method: DeliveryMethod;
    delivery_fee: number;
    delivery_area: string | null;
    delivery_address: string | null;
    delivery_notes: string | null;
    total: number;
    status: OrderStatus;
    payment_reference: string | null;
    dispute_reason: string | null;
    dispute_opened_at: string | null;
    dispute_response: string | null;
    dispute_resolved_at: string | null;
    paid_at: string | null;
    completed_at: string | null;
    payment_method: string;
    refund_amount: number | null;
    refunded_at: string | null;
    created_at: string;
}
