import { formatKwacha } from 'core';
import type { Slide } from './HeroCarousel';
import type { Listing } from './parts';
import { categorize } from './taxonomy';
import { kindOf } from './kinds';

/**
 * Banner slides made from what is on the Marketplace right now, so the words and the pictures follow the shop instead of staying fixed:
 * new arrivals, auctions about to end, things nearly sold out, bargains, the busiest categories and the best-rated sellers.
 * Only items with a picture are ever used (a banner without pictures looks empty), and a slide with too few pictures is dropped.
 * Which items appear is shuffled every few hours, so the banner changes over time without flickering between renders.
 */

const ROTATE_MS = 3 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export interface MainCategory { id: string; name: string; count: number }
export interface SlideContext {
    /** Everything shown in the browse view (food has its own tab). */
    all: Listing[];
    /** Categories that have items, busiest first. */
    mains: MainCategory[];
    now?: number;
    open: (l: Listing) => void;
    go: (path: string) => void;
    categoryPath: (mainId: string) => string;
}

/** Small seeded random numbers: the same seed gives the same shuffle, a new seed a new one. */
const seeded = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffled = <T,>(xs: T[], rnd: () => number): T[] => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
};

const hasPicture = (l: Listing) => !!l.imageUrl;
const newestFirst = (a: Listing, b: Listing) => +new Date(b.createdAt) - +new Date(a.createdAt);
const list = (names: string[]) => names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
const short = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const timeLeft = (ms: number) => {
    const m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return `${m} min`;
    const h = Math.round(m / 60);
    return h < 36 ? `${h} ${h === 1 ? 'hour' : 'hours'}` : `${Math.round(h / 24)} days`;
};

/** A friendly price ceiling: the smallest round figure that at least three items fall under. */
const priceCeiling = (prices: number[]): number | null => {
    const sorted = [...prices].sort((a, b) => a - b);
    if (sorted.length < 3) return null;
    const third = sorted[2];
    const steps = [20, 50, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000];
    return steps.find((s) => s > third) ?? null;
};

export function smartSlides(ctx: SlideContext): Slide[] {
    const now = ctx.now ?? Date.now();
    const rnd = seeded(Math.floor(now / ROTATE_MS));
    const pictured = ctx.all.filter(hasPicture);
    const used = new Set<string>();

    /** Up to `n` items from the pool: unused ones first, at most one per seller while there are enough sellers, newest preferred. */
    const choose = (pool: Listing[], n = 3): Listing[] => {
        const fresh = pool.filter((l) => !used.has(l.id));
        const source = fresh.length >= Math.min(n, 3) ? fresh : pool;
        const top = shuffled([...source].sort(newestFirst).slice(0, Math.max(n * 3, 9)), rnd);
        const picked: Listing[] = [];
        const sellers = new Set<string>();
        for (const l of top) if (picked.length < n && !sellers.has(l.seller.id)) { picked.push(l); sellers.add(l.seller.id); }
        for (const l of top) if (picked.length < n && !picked.includes(l)) picked.push(l);
        picked.forEach((l) => used.add(l.id));
        return picked;
    };
    const money = (n: number) => formatKwacha(n).replace(/\.00$/, '');
    const tiles = (ls: Listing[], sub: (l: Listing) => string = (l) => money(l.price)) =>
        ls.map((l) => ({ id: l.id, image: l.imageUrl, label: l.name, sub: sub(l), onOpen: () => ctx.open(l) }));

    const data: Slide[] = [];
    const MIN = 3;

    // New arrivals: this week's listings; "Fresh today" when most are from the last day.
    const recent = pictured.filter((l) => now - +new Date(l.createdAt) < 7 * DAY);
    if (recent.length >= MIN) {
        const picks = choose(recent);
        const today = recent.filter((l) => now - +new Date(l.createdAt) < DAY).length;
        const mains = new Set(recent.map((l) => categorize(l).main));
        const only = mains.size === 1 ? ctx.mains.find((m) => m.id === [...mains][0]) : undefined;
        data.push({
            id: 'new-arrivals', bg: '#0F766E', ink: '#FFFFFF', button: { bg: '#FFFFFF', ink: '#0F766E' },
            title: today >= 3 ? 'Fresh today' : only ? `New in ${only.name}` : 'Just listed',
            text: `${recent.length > picks.length ? `${picks.map((l) => short(l.name)).join(', ')} and ${recent.length - picks.length} more` : list(picks.map((l) => short(l.name)))} just landed.`,
            cta: `See ${short(picks[0].name, 18)}`, onCta: () => ctx.open(picks[0]), items: tiles(picks),
        });
    }

    // Auctions about to end.
    const ending = pictured.filter((l) => l.auction?.status === 'OPEN' && +new Date(l.auction.endsAt) - now > 0 && +new Date(l.auction.endsAt) - now < 2 * DAY)
        .sort((a, b) => +new Date(a.auction!.endsAt) - +new Date(b.auction!.endsAt));
    if (ending.length >= 1) {
        const picks = choose(ending);
        const first = ending[0];
        const left = timeLeft(+new Date(first.auction!.endsAt) - now);
        data.push({
            id: 'ending-auctions', bg: '#9A3412', ink: '#FFFFFF', button: { bg: '#FFFFFF', ink: '#9A3412' }, tag: 'Auction',
            title: ending.length > 1 ? 'Auctions ending soon' : 'Auction ending soon',
            text: `${short(first.name, 28)} ends in ${left}${first.auction!.currentBid != null ? `, top bid ${money(first.auction!.currentBid)}` : `, starting at ${money(first.auction!.startPrice)}`}.`,
            cta: 'Place a bid', onCta: () => ctx.open(first),
            items: tiles(picks, (l) => (l.auction?.currentBid != null ? `Bid ${money(l.auction.currentBid)}` : money(l.auction?.startPrice ?? l.price))),
        });
    }

    // Almost gone.
    const scarce = pictured.filter((l) => l.stock?.tracked && !l.stock.soldOut && l.stock.low && l.stock.available != null);
    if (scarce.length >= 1) {
        const picks = choose(scarce);
        const lowest = [...scarce].sort((a, b) => (a.stock!.available ?? 0) - (b.stock!.available ?? 0))[0];
        data.push({
            id: 'selling-fast', bg: '#B91C1C', ink: '#FFFFFF', button: { bg: '#FFFFFF', ink: '#B91C1C' },
            title: 'Selling fast',
            text: scarce.length === 1 ? `Only ${lowest.stock!.available} left of ${short(lowest.name, 28)}.` : `${short(lowest.name, 24)} has only ${lowest.stock!.available} left, and ${plural(scarce.length - 1, 'other item')} ${scarce.length === 2 ? 'is' : 'are'} running low.`,
            cta: 'Grab it', onCta: () => ctx.open(lowest),
            items: tiles(picks, (l) => `Only ${l.stock?.available} left`),
        });
    }

    // Bargains: goods under a round price.
    const goods = pictured.filter((l) => kindOf(l) === 'GOODS' && !l.auction && l.price > 0);
    const ceiling = priceCeiling(goods.map((l) => l.price));
    if (ceiling) {
        const under = goods.filter((l) => l.price < ceiling);
        if (under.length >= MIN) {
            const picks = choose(under);
            data.push({
                id: `under-${ceiling}`, bg: '#4338CA', ink: '#FFFFFF', button: { bg: '#FFFFFF', ink: '#4338CA' },
                title: `Under ${money(ceiling)}`,
                text: `${plural(under.length, 'find')} for less than ${money(ceiling)}, from ${plural(new Set(under.map((l) => l.seller.id)).size, 'seller')}.`,
                cta: 'Shop the deals', onCta: () => ctx.open(picks[0]), items: tiles(picks),
            });
        }
    }

    // Busiest categories, in rotation.
    ctx.mains.slice(0, 3).forEach((m, k) => {
        const pool = pictured.filter((l) => categorize(l).main === m.id);
        if (pool.length < MIN) return;
        const picks = choose(pool);
        const sellers = new Set(pool.map((l) => l.seller.id)).size;
        data.push({
            id: `popular-${m.id}`, bg: ['#16181D', '#1E3A8A', '#14532D'][k % 3], ink: '#FFFFFF', button: { bg: '#FFFFFF', ink: '#111111' },
            title: k === 0 ? `Popular in ${m.name}` : `Trending in ${m.name}`,
            text: `${plural(m.count, 'listing')} from ${plural(sellers, 'seller')}${picks[0] ? `, like ${short(picks[0].name, 26)}` : ''}.`,
            cta: `Shop ${m.name}`, onCta: () => ctx.go(ctx.categoryPath(m.id)), items: tiles(picks),
        });
    });

    // Sellers people rate highly.
    const rated = pictured.filter((l) => l.seller.rating.count >= 1 && l.seller.rating.average >= 4.5 && !l.isMine);
    if (rated.length >= MIN) {
        const picks = choose(rated);
        const best = [...picks].sort((a, b) => b.seller.rating.average - a.seller.rating.average)[0];
        data.push({
            id: 'top-rated', bg: '#92400E', ink: '#FFFFFF', button: { bg: '#FFFFFF', ink: '#92400E' },
            title: 'Top-rated sellers',
            text: `${short(best.seller.name, 26)} is rated ${best.seller.rating.average.toFixed(1)} out of 5 by ${plural(best.seller.rating.count, 'buyer')}.`,
            cta: 'Visit the store', onCta: () => ctx.go(best.storePath), items: tiles(picks, (l) => l.seller.name),
        });
    }

    // New arrivals lead; the rest take turns at the front as the hours go by.
    const lead = data[0]?.id === 'new-arrivals' ? data[0] : undefined;
    const rest = lead ? data.slice(1) : data;
    const turn = rest.length ? Math.floor(rnd() * rest.length) : 0;
    const ordered = [...rest.slice(turn), ...rest.slice(0, turn)].slice(0, 4);

    // One MoneyWise message at the end, alternating through the day. Both need pictures to look right.
    const promos: Slide[] = [];
    const promoPics = choose(pictured, 3);
    if (promoPics.length >= MIN) promos.push({
        id: 'pay-in-4', bg: '#0B57D0', ink: '#FFFFFF', button: { bg: '#FFFFFF', ink: '#0B57D0' },
        title: 'Pay in 4', text: 'Split an order into four interest-free payments, two weeks apart.', cta: 'See if you qualify', onCta: () => ctx.go('/marketplace/pay-later'),
        items: tiles(promoPics),
    });
    const sellPics = ctx.mains.slice(0, 3).map((m) => pictured.find((l) => categorize(l).main === m.id)).filter((l): l is Listing => !!l);
    if (sellPics.length >= MIN) promos.push({
        id: 'sell', bg: '#FFD166', ink: '#1F1F1F', button: { bg: '#1F1F1F', ink: '#FFFFFF' },
        title: 'Sell on MoneyWise', text: 'List for free, get paid straight to your wallet, and reach shoppers across Lusaka.', cta: 'Start selling', onCta: () => ctx.go('/products'),
        items: sellPics.map((l) => ({ id: l.id, image: l.imageUrl, label: ctx.mains.find((m) => m.id === categorize(l).main)?.name ?? l.name, onOpen: () => ctx.go(ctx.categoryPath(categorize(l).main)) })),
    });
    const promo = promos.length ? [promos[Math.floor(now / ROTATE_MS) % promos.length]] : [];

    return [...(lead ? [lead] : []), ...ordered, ...promo];
}
