import type { Listing } from './parts';

/**
 * Some sellers list many near-identical things: a restaurant's menu, an event's ticket tiers, an apartment block's rooms. Showing each as
 * its own listing floods the page, so a seller's items of that kind are folded into one store card. Items are only ever folded together
 * with the same seller's own items; different sellers never share a card. Everything else stays an individual listing.
 */
export type FeedEntry =
    | { kind: 'item'; listing: Listing }
    | { kind: 'store'; seller: Listing['seller']; items: Listing[] };

const MENU = /chicken|meal|food|drink|beverage|restaurant|pizza|burger|bakery|bake|cake|catering|snack|juice|coffee|\btea\b|kitchen|takeaway|take-away|wings?\b|fries|soda|cola|shawarma|sandwich|salad|smoothie|ice ?cream/i;
/** Ticket tiers (VIP, Standard, Early bird…) of one event. */
const TICKETS = /ticket|\bvip\b|admission|entry pass|gate pass|\bpass\b|early bird|table for|\bseat/i;
/** Rooms and units of one property. */
const ROOMS = /accomm|\broom\b|\bsuite\b|apartment|\bflat\b|\bunit\b|hotel|lodge|chalet|cottage|dorm|bed ?space|guest ?house/i;

/** How many of one seller's listings in the same category it takes to treat them as a set, even when no keyword matches. */
const SET_SIZE = 3;

const family = (l: Listing) => {
    const text = `${l.category ?? ''} ${l.name}`;
    return TICKETS.test(text) ? 'TICKETS' : ROOMS.test(text) ? 'ROOMS' : MENU.test(text) ? 'MENU' : null;
};

/** What a folded store card calls its items when the sellers haven't given them a category. */
export const folderLabel = (items: Listing[]): string => {
    const fams = new Set(items.map(family));
    return fams.size === 1 && fams.has('TICKETS') ? 'Tickets' : fams.size === 1 && fams.has('ROOMS') ? 'Rooms' : fams.size === 1 && fams.has('MENU') ? 'Menu' : 'Items';
};

/** The items in order, with each seller's sets gathered into one store entry where the first of them appeared. */
export function buildFeed(listings: Listing[], collapse = true): FeedEntry[] {
    if (!collapse) return listings.map((listing) => ({ kind: 'item', listing }));

    // A listing can be folded when it belongs to a known kind of set, or the seller has several in the same category.
    const sameCategory = new Map<string, number>();
    for (const l of listings) if (l.category && !l.auction) { const k = `${l.seller.id}|${l.category}`; sameCategory.set(k, (sameCategory.get(k) ?? 0) + 1); }
    const foldable = (l: Listing) => !l.auction && (!!family(l) || (!!l.category && (sameCategory.get(`${l.seller.id}|${l.category}`) ?? 0) >= SET_SIZE));

    const bySeller = new Map<string, Listing[]>();
    for (const l of listings) if (foldable(l)) bySeller.set(l.seller.id, [...(bySeller.get(l.seller.id) ?? []), l]);
    const folded = new Set([...bySeller.entries()].filter(([, items]) => items.length >= 2).map(([id]) => id));

    const out: FeedEntry[] = [];
    const placed = new Set<string>();
    for (const l of listings) {
        if (foldable(l) && folded.has(l.seller.id)) {
            if (!placed.has(l.seller.id)) { placed.add(l.seller.id); out.push({ kind: 'store', seller: l.seller, items: bySeller.get(l.seller.id)! }); }
        } else {
            out.push({ kind: 'item', listing: l });
        }
    }
    return out;
}
