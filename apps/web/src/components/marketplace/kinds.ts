import type { Listing } from './parts';

/**
 * What kind of business a listing comes from decides how it is shown: a restaurant's dish, a consultancy's service and an ordinary
 * product are looked at differently, so each gets its own card.
 */
export type ListingKind = 'FOOD' | 'SERVICE' | 'GOODS';

const FOOD = /chicken|meal|food|drink|beverage|restaurant|pizza|burger|bakery|bake|cake|catering|snack|juice|coffee|\btea\b|kitchen|takeaway|take-away|wings?\b|fries|soda|cola|shawarma|sandwich|salad|smoothie|ice ?cream/i;

export const kindOf = (l: Pick<Listing, 'name' | 'category' | 'productType' | 'auction'>): ListingKind => {
    if (l.auction) return 'GOODS'; // auctions have their own clock, bids and badges
    if (FOOD.test(`${l.category ?? ''} ${l.name}`)) return 'FOOD';
    if (String(l.productType).startsWith('SERVICE')) return 'SERVICE';
    return 'GOODS';
};

/** The kind most of a store's items are, for the store as a whole. */
export function storeKindOf(items: Pick<Listing, 'name' | 'category' | 'productType' | 'auction'>[]): ListingKind {
    const n: Record<ListingKind, number> = { FOOD: 0, SERVICE: 0, GOODS: 0 };
    for (const i of items) n[kindOf(i)]++;
    return (['FOOD', 'SERVICE', 'GOODS'] as ListingKind[]).sort((a, b) => n[b] - n[a])[0];
}

export const KIND_LABEL: Record<ListingKind, string> = { FOOD: 'Menu', SERVICE: 'Services', GOODS: 'Shop' };

export interface ListingAction { label: string; short: string }

const RENT = /rental|\brent\b|\bhire\b|car hire/i;
const STAY = /accomm|\broom\b|\bsuite\b|apartment|lodge|hotel|chalet|cottage|guest ?house|bnb/i;
const TICKET = /ticket|\bvip\b|admission|\bpass\b|early bird/i;

/**
 * What the main button on a listing should say, so it fits what is being sold: you order a meal, rent a car, book a room or a
 * consultation, get a ticket, request a quote for work priced on request, donate to a cause, and buy a thing.
 */
export function actionOf(l: Pick<Listing, 'name' | 'category' | 'productType' | 'auction'>): ListingAction {
    const text = `${l.category ?? ''} ${l.name}`;
    const type = String(l.productType);
    if (kindOf(l) === 'FOOD') return { label: 'Order now', short: 'Order' };
    if (type === 'DONATION') return { label: 'Donate', short: 'Donate' };
    if (type === 'DIGITAL') return { label: 'Get it now', short: 'Get it' };
    if (RENT.test(text)) return { label: 'Rent now', short: 'Rent' };
    if (type === 'SERVICE_BOOKING' || type === 'SERVICE_BOOKING_DAILY' || STAY.test(text)) return { label: 'Book now', short: 'Book' };
    if (TICKET.test(text)) return { label: 'Get tickets', short: 'Tickets' };
    if (type === 'SERVICE_VARIABLE') return { label: 'Request a quote', short: 'Quote' };
    if (type.startsWith('SERVICE')) return { label: 'Book now', short: 'Book' };
    return { label: 'Buy it now', short: 'Buy' };
}