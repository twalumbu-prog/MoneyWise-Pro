import { BedDouble, Briefcase, Gift, Home, Laptop, PartyPopper, Shirt, UtensilsCrossed, Package } from 'lucide-react';
import type { ComponentType } from 'react';
import type { Listing } from './parts';

/**
 * The Marketplace's own categories, like a shop directory: a few main categories, each with sub-categories. Sellers write their own
 * category names ("Chicken Meals", "Accomodation", "Crocs"), so every listing is filed into this tree from its category, name and
 * description. That keeps browsing tidy: opening a category shows only what belongs in it.
 */
export interface SubCategory { id: string; name: string; test: RegExp }
export interface MainCategory { id: string; name: string; blurb: string; icon: ComponentType<any>; tone: string; subs: SubCategory[] }

export const TREE: MainCategory[] = [
    {
        id: 'gifts', name: 'Gifts & Flowers', blurb: 'For someone special', icon: Gift, tone: '#E11D48',
        subs: [
            { id: 'flowers', name: 'Flowers', test: /flower|rose|bouquet/i },
            { id: 'gifts', name: 'Gifts', test: /gift|hamper|card\b|balloon/i },
        ],
    },
    {
        id: 'food', name: 'Food & Drink', blurb: 'Meals, drinks and treats', icon: UtensilsCrossed, tone: '#F59E0B',
        subs: [
            { id: 'catering', name: 'Catering', test: /cater|buffet|platter|party pack|event food|banquet/i },
            { id: 'meals', name: 'Meals & takeaway', test: /chicken|meal|food|restaurant|pizza|burger|wings?\b|shawarma|sandwich|salad|fries|kitchen|takeaway|take-away|lunch|dinner/i },
            { id: 'drinks', name: 'Drinks', test: /drink|juice|coffee|\btea\b|\bsoda\b|\bcola\b|coca|fanta|sprite|beverage|smoothie|\bbeer\b|\bwine\b/i },
            { id: 'bakery', name: 'Bakery & sweets', test: /cake|bake|bread|chocolate|ice ?cream|snack|biscuit|dessert|sweet/i },
        ],
    },
    {
        id: 'stays', name: 'Stays & Travel', blurb: 'Rooms, camps and rides', icon: BedDouble, tone: '#0F766E',
        subs: [
            { id: 'accommodation', name: 'Accommodation', test: /accomm|\broom\b|\bsuite\b|apartment|\bflat\b|hotel|lodge|chalet|cottage|bnb|guest ?house|bed ?space|dorm/i },
            { id: 'car-hire', name: 'Car hire & transport', test: /rental|car hire|\bhire\b|\bsuv\b|taxi|transport|ride|delivery service|benz|pajero|toyota|vehicle|\bvan\b|\bbus\b/i },
            { id: 'camps-tours', name: 'Camps & tours', test: /camp|tent|safari|tour|travel|trip|adventure/i },
        ],
    },
    {
        id: 'events', name: 'Events & Tickets', blurb: 'Tickets, parties and sponsorships', icon: PartyPopper, tone: '#7C3AED',
        subs: [
            { id: 'tickets', name: 'Tickets', test: /ticket|\bvip\b|admission|entry pass|gate pass|\bpass\b|early bird|\bseat/i },
            { id: 'event-services', name: 'Event services', test: /event|party|wedding|concert|festival|sponsor|social mixer|partnership|conference|expo|workshop/i },
        ],
    },
    {
        id: 'fashion', name: 'Fashion & Beauty', blurb: 'Clothes, shoes and style', icon: Shirt, tone: '#DB2777',
        subs: [
            { id: 'clothing', name: 'Clothing', test: /cloth|shirt|t-?shirt|dress|trouser|jeans|jacket|hoodie|skirt|suit|vest|chitenge|kitenge|embroider|tailor|uniform|wear\b/i },
            { id: 'shoes', name: 'Shoes', test: /shoe|crocs|sneaker|sandal|boot|heels|slipper|footwear/i },
            { id: 'beauty', name: 'Beauty & perfume', test: /perfume|fragrance|beauty|hair|wig|weave|makeup|cosmetic|lotion|cream|salon|barber|nail|spa|skincare/i },
            { id: 'accessories', name: 'Bags & jewellery', test: /\bbag\b|handbag|backpack|watch|jewel|ring|necklace|bracelet|sunglasses|wallet/i },
        ],
    },
    {
        id: 'tech', name: 'Electronics & Tech', blurb: 'Phones, computers and gadgets', icon: Laptop, tone: '#0B57D0',
        subs: [
            { id: 'phones', name: 'Phones & tablets', test: /phone|iphone|samsung|tablet|ipad|airtime|sim card|earbuds|air ?pods/i },
            { id: 'computers', name: 'Computers', test: /laptop|computer|desktop|monitor|printer|keyboard|router|\bups\b|macbook/i },
            { id: 'audio-tv', name: 'Audio & TV', test: /\btv\b|television|speaker|headphone|sound ?bar|home theatre|camera|drone|console|playstation|xbox/i },
            { id: 'software', name: 'Software & digital', test: /software|web ?site|\bapp\b|e-?book|template|course|download|digital|logo design|graphic/i },
        ],
    },
    {
        id: 'home', name: 'Home & Garden', blurb: 'Furniture, appliances and tools', icon: Home, tone: '#65A30D',
        subs: [
            { id: 'furniture', name: 'Furniture', test: /sofa|couch|bed\b|mattress|table|chair|wardrobe|cupboard|shelf|desk|furniture|curtain|carpet/i },
            { id: 'appliances', name: 'Appliances', test: /fridge|freezer|fan\b|microwave|stove|cooker|blender|kettle|washing|heater|appliance|generator|solar/i },
            { id: 'garden-diy', name: 'Garden & DIY', test: /garden|plant|tool|cement|paint|timber|roofing|hardware|plumb|building|brick/i },
        ],
    },
    {
        id: 'services', name: 'Business & Services', blurb: 'Consulting, care and trades', icon: Briefcase, tone: '#334155',
        subs: [
            { id: 'consulting', name: 'Consulting & professional', test: /consult|business|strategy|account|legal|advis|design|market|brand|audit|tax|finance|lending|loan/i },
            { id: 'health', name: 'Health & care', test: /health|clinic|homecare|care\b|pharm|medical|nurse|therapy|fitness|gym/i },
            { id: 'education', name: 'Education & training', test: /educat|school|tutor|course|class|training|lesson|mentor/i },
            { id: 'trades', name: 'Repairs & trades', test: /repair|plumb|electric|clean|maint|construct|install|laundry|mechanic/i },
        ],
    },
    { id: 'other', name: 'Other', blurb: 'Everything else', icon: Package, tone: '#5F6368', subs: [] },
];

export const mainById = (id: string | undefined) => TREE.find((m) => m.id === id) ?? null;
export const subById = (main: MainCategory | null, id: string | undefined) => main?.subs.find((s) => s.id === id) ?? null;

const cache = new WeakMap<Listing, { main: string; sub: string | null }>();

/** Files a listing into the tree: the first main category (in order) with a matching sub-category, else by its type. */
export function categorize(l: Listing): { main: string; sub: string | null } {
    const hit = cache.get(l);
    if (hit) return hit;
    const text = `${l.category ?? ''} ${l.name} ${l.description ?? ''}`.slice(0, 400);
    const own = `${l.category ?? ''} ${l.name}`;
    let out: { main: string; sub: string | null } | null = null;
    // The seller's own category and the name count first; the description only breaks a tie.
    for (const pass of [own, text]) {
        for (const m of TREE) {
            const s = m.subs.find((x) => x.test.test(pass));
            if (s) { out = { main: m.id, sub: s.id }; break; }
        }
        if (out) break;
    }
    if (!out) out = String(l.productType).startsWith('SERVICE') ? { main: 'services', sub: null } : l.productType === 'DIGITAL' ? { main: 'tech', sub: 'software' } : { main: 'other', sub: null };
    cache.set(l, out);
    return out;
}

export interface CategoryCounts { main: Map<string, number>; sub: Map<string, number> }
export function countCategories(listings: Listing[]): CategoryCounts {
    const main = new Map<string, number>(), sub = new Map<string, number>();
    for (const l of listings) {
        const c = categorize(l);
        main.set(c.main, (main.get(c.main) ?? 0) + 1);
        if (c.sub) sub.set(`${c.main}/${c.sub}`, (sub.get(`${c.main}/${c.sub}`) ?? 0) + 1);
    }
    return { main, sub };
}

export const categoryPath = (main: string, sub?: string | null) => `/marketplace/c/${main}${sub ? `/${sub}` : ''}`;
