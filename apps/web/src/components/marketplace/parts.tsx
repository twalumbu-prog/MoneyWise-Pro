import React, { useEffect, useRef, useState } from 'react';
import { BadgeCheck, ChevronLeft, ChevronRight, Gavel, Heart, MapPin, Star, Truck } from 'lucide-react';
import { formatKwacha } from 'core';
import { resized, resizedSet } from '../../lib/images';
import { CategoryArt } from './CategoryArt';
import { folderLabel } from './feed';
import { actionOf, kindOf, storeKindOf } from './kinds';
import { StockChip } from './stockUi';
import type { StockInfo } from './stockUi';

export interface AuctionView {
    id: string;
    status: 'OPEN' | 'SOLD' | 'NO_SALE' | 'CANCELLED';
    startPrice: number;
    currentBid: number | null;
    bidCount: number;
    endsAt: string;
    bidIncrement: number;
    minNextBid: number;
    buyNowPrice: number | null;
    hasReserve: boolean;
    reserveMet: boolean;
    iAmHighBidder: boolean;
    iHaveBid: boolean;
    iWon: boolean;
    winningAmount: number | null;
    paymentLinkToken: string | null;
    serverNow: string;
}

export interface Listing {
    id: string;
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
    images: string[];
    category: string | null;
    productType: string;
    requiresDelivery: boolean;
    createdAt: string;
    seller: {
        id: string; name: string; logoUrl: string | null; isPersonal: boolean;
        verified: boolean; location: string | null; rating: { average: number; count: number };
    };
    storePath: string;
    isMine: boolean;
    auction: AuctionView | null;
    /** Can be bought and paid for inside the app. Bookings, donations and digital items finish in the seller's store. */
    inAppCheckout: boolean;
    /** How many are left and which options exist (older cached data may not have it). */
    stock?: StockInfo;
}
/** Paid placements running today (MoneyWise Ads). */
export interface RunningAds { featuredItems: { campaignId: string; productId: string }[]; boostedItems: { campaignId: string; productId: string }[]; featuredStores: { campaignId: string; orgId: string }[] }
export interface MarketplaceData { listings: Listing[]; categories: { name: string; count: number }[]; needsMigration?: boolean; ads?: RunningAds }

/** The small label every paid placement carries. */
export const SponsoredTag: React.FC<{ className?: string }> = ({ className = '' }) => (
    <span className={`rounded-full bg-[#FEF7E0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B06000] ${className}`}>Sponsored</span>
);

export const LISTINGS_KEY = ['marketplace', 'listings'] as const;

export type TypeGroup = 'PRODUCT' | 'SERVICE' | 'DIGITAL';
export const typeGroup = (t: string): TypeGroup => (t === 'PRODUCT' ? 'PRODUCT' : t === 'DIGITAL' ? 'DIGITAL' : 'SERVICE');
export const TYPE_LABEL: Record<TypeGroup, string> = { PRODUCT: 'Product', SERVICE: 'Service', DIGITAL: 'Digital' };

export const initials = (name: string) => name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
export const priceText = (l: Listing) => {
    const a = l.auction;
    if (a?.status === 'OPEN') return formatKwacha(a.currentBid ?? a.startPrice);
    if (a?.status === 'SOLD' && a.winningAmount) return formatKwacha(a.winningAmount);
    return l.price > 0 ? formatKwacha(l.price) : l.productType === 'DONATION' ? 'Any amount' : 'Ask for price';
};

/** "2d 3h", "4h 12m", "9m 30s", or "Ended". */
export function timeLeft(endsAt: string, now = Date.now()): string {
    const ms = new Date(endsAt).getTime() - now;
    if (ms <= 0) return 'Ended';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

/**
 * A clock that ticks every second while there is an auction to count down. It is corrected by the difference between the server's
 * clock and this device's, so a wrong device clock can't make an auction look open or closed when it isn't.
 */
export function useNow(serverNow?: string, active = true): number {
    const offset = React.useMemo(() => (serverNow ? new Date(serverNow).getTime() - Date.now() : 0), [serverNow]);
    const [tick, setTick] = useState(() => Date.now() + offset);
    useEffect(() => {
        if (!active) return;
        const id = window.setInterval(() => setTick(Date.now() + offset), 1000);
        setTick(Date.now() + offset);
        return () => window.clearInterval(id);
    }, [active, offset]);
    return tick;
}

/** Filled stars for a rating out of 5 (rounded to the nearest star). */
export const Stars: React.FC<{ value: number; size?: number; className?: string }> = ({ value, size = 14, className = '' }) => (
    <span className={`inline-flex items-center gap-0.5 ${className}`} role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} className={n <= Math.round(value) ? 'fill-[#FBBC04] text-[#FBBC04]' : 'text-[#DADCE0]'} />)}
    </span>
);

/** The badge a store earns when its basics (public store, contact, location, payout account) are in place. */
export const VerifiedBadge: React.FC<{ size?: number; withLabel?: boolean }> = ({ size = 14, withLabel = false }) => (
    <span className="inline-flex flex-shrink-0 items-center gap-1 text-[#0B57D0]" title="Verified store: a public store, contact number and location are in place">
        <BadgeCheck size={size} className="fill-[#E8F0FE]" />
        {withLabel && <span className="text-[11px] font-bold">Verified store</span>}
    </span>
);

export const LocationText: React.FC<{ location: string | null; className?: string }> = ({ location, className = '' }) =>
    location ? <span className={`inline-flex items-center gap-1 ${className}`}><MapPin size={12} className="flex-shrink-0" /><span className="truncate">{location}</span></span> : null;

/** The time left on an auction, ticking each second. */
export const TimeLeftText: React.FC<{ endsAt: string; serverNow?: string }> = ({ endsAt, serverNow }) => {
    const now = useNow(serverNow);
    return <>{timeLeft(endsAt, now)}</>;
};

/**
 * A product's picture, or a soft coloured tile with its initial when it has none.
 * Pictures are asked for at the size they are shown (a `srcset` of small versions, not the full upload), decoded off the main thread,
 * and loaded lazily, except the first screenful (`eager`), which is fetched at high priority. If a resized copy can't be served, the
 * original is used instead.
 */
export const Thumb: React.FC<{ listing: Listing; src?: string | null; className?: string; width?: number; sizes?: string; eager?: boolean; contain?: boolean }> = ({
    listing, src, className = '', width = 400, sizes = '(min-width: 1536px) 18vw, (min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw', eager = false, contain = false,
}) => {
    const original = src ?? listing.imageUrl;
    const [stage, setStage] = useState<'resized' | 'original' | 'broken'>('resized');
    const [loaded, setLoaded] = useState(false);
    const [tries, setTries] = useState(0);
    const img = useRef<HTMLImageElement>(null);
    // Start over only when the picture really changes. (Resetting on every mount used to wipe "loaded" after a cached picture had
    // already finished loading, which left it invisible until the page was reloaded.)
    const prev = useRef(original);
    useEffect(() => { if (prev.current !== original) { prev.current = original; setStage('resized'); setLoaded(false); setTries(0); } }, [original]);
    // A cached picture can finish before React is listening for it: show it as soon as it is seen to be complete.
    useEffect(() => { const el = img.current; if (el && el.complete && el.naturalWidth > 0) setLoaded(true); }, [stage, original, tries]);
    // Never leave a picture hidden for good.
    useEffect(() => { if (loaded) return; const t = setTimeout(() => setLoaded(true), 4000); return () => clearTimeout(t); }, [loaded, stage, tries]);
    // When the image service is busy or hiccups, try again a couple of times before settling for the default picture.
    const failed = () => {
        if (stage === 'resized') { setStage('original'); return; }
        if (tries < 2) { setTimeout(() => { setTries((n) => n + 1); setStage('resized'); setLoaded(false); }, 1200 * (tries + 1)); return; }
        setStage('broken');
    };

    // No picture (or it won't load): the default picture for the item's category.
    if (!original || stage === 'broken') {
        return <CategoryArt category={listing.category} productType={listing.productType} name={listing.name} compact={width < 200} className={className} logoUrl={listing.seller.logoUrl ? resized(listing.seller.logoUrl, 120, { square: true }) : null} />;
    }
    const useResized = stage === 'resized';
    return (
        <img
            ref={img}
            src={useResized ? bust(resized(original, width, { square: !contain }), tries) : original}
            srcSet={useResized && tries === 0 ? resizedSet(original, [240, 400, 640, 960], { square: !contain }) : undefined}
            sizes={useResized ? sizes : undefined}
            alt={listing.name}
            width={width}
            height={width}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            {...(eager ? ({ fetchpriority: 'high' } as any) : {})}
            onLoad={() => setLoaded(true)}
            onError={failed}
            className={`h-full w-full ${contain ? 'object-contain' : 'object-cover'} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
        />
    );
};

/** The same address with a marker on it, so a retry isn't answered from the browser's memory of the failure. */
const bust = (url: string, n: number): string => (n > 0 ? `${url}${url.includes('?') ? '&' : '?'}r=${n}` : url);

export const SellerAvatar: React.FC<{ seller: Listing['seller']; size?: number }> = ({ seller, size = 20 }) => {
    const [broken, setBroken] = useState(false);
    const [tries, setTries] = useState(0);
    const logo = seller.logoUrl;
    const prevLogo = useRef(logo);
    useEffect(() => { if (prevLogo.current !== logo) { prevLogo.current = logo; setBroken(false); setTries(0); } }, [logo]);
    if (logo && !broken) {
        return <img src={bust(resized(logo, size * 3, { square: true }), tries)} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => { if (tries < 2) setTimeout(() => setTries((n) => n + 1), 1200 * (tries + 1)); else setBroken(true); }} style={{ width: size, height: size }} className="flex-shrink-0 rounded-full object-cover" />;
    }
    return <span style={{ width: size, height: size, fontSize: size * 0.42 }} className="flex flex-shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] font-bold text-[#0B57D0]">{initials(seller.name)}</span>;
};

/** The text under every card, in four fixed rows (head, title, byline, foot), so cards of every kind are the same height and line up. */
const CardMeta: React.FC<{ head: React.ReactNode; title: React.ReactNode; byline: React.ReactNode; foot: React.ReactNode }> = ({ head, title, byline, foot }) => (
    // On a phone the name comes first and the price under it in larger type (like eBay), and the location row is left out.
    <div className="flex flex-col px-0.5 pt-2.5">
        <div className="order-2 mt-1 flex h-7 items-center gap-2 overflow-hidden text-lg font-bold tabular-nums text-[#1F1F1F] md:order-1 md:mt-0 md:h-6 md:text-base">{head}</div>
        <div className="order-1 h-10 overflow-hidden text-sm leading-5 text-[#1F1F1F] line-clamp-2 md:order-2 md:mt-0.5 md:text-[#3C4043]">{title}</div>
        <div className="order-3 mt-1 flex h-5 items-center gap-1.5 overflow-hidden text-xs text-[#5F6368]">{byline}</div>
        <div className="order-4 mt-0.5 hidden h-4 items-center gap-2 overflow-hidden text-[11px] text-[#80868B] md:flex">{foot}</div>
    </div>
);

type CardProps = { listing: Listing; saved: boolean; eager?: boolean; onToggleSave: () => void; onOpen: () => void; compact?: boolean; sponsored?: boolean };
const GoodsCard: React.FC<CardProps> = ({ listing, saved, eager, onToggleSave, onOpen, compact, sponsored }) => {
    const group = typeGroup(listing.productType);
    return (
        <div className="group relative">
            <button type="button" onClick={onOpen} className="block w-full text-left">
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#F1F3F4]">
                    <Thumb listing={listing} eager={eager} width={compact ? 320 : 400} sizes={compact ? '220px' : undefined} className="group-hover:scale-105" />
                    {group !== 'PRODUCT' && (
                        <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#1F1F1F] shadow-sm">{TYPE_LABEL[group]}</span>
                    )}
                    {listing.auction?.status === 'OPEN' && (
                        <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-[#B31412] px-2.5 py-1 text-[10px] font-bold text-white shadow-sm"><Gavel size={11} /> <TimeLeftText endsAt={listing.auction.endsAt} serverNow={listing.auction.serverNow} /></span>
                    )}
                    {!listing.auction && <StockChip stock={listing.stock} className="absolute bottom-2.5 left-2.5" />}
                    {listing.auction?.status === 'SOLD' && (
                        <span className="absolute bottom-2.5 left-2.5 rounded-full bg-[#137333] px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">{listing.auction.iWon ? 'You won' : 'Sold'}</span>
                    )}
                    {!listing.auction && listing.requiresDelivery && (
                        <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-[#3C4043] shadow-sm"><Truck size={11} /> Delivery</span>
                    )}
                </div>
                <CardMeta
                    head={<>{priceText(listing)}{sponsored && <SponsoredTag />}{listing.auction?.status === 'OPEN' && <span className="truncate text-xs font-normal text-[#5F6368]">{listing.auction.bidCount === 0 ? 'No bids yet' : `${listing.auction.bidCount} ${listing.auction.bidCount === 1 ? 'bid' : 'bids'}`}</span>}</>}
                    title={listing.name}
                    byline={<><SellerAvatar seller={listing.seller} /><span className="truncate">{listing.seller.name}</span>{listing.seller.verified && <VerifiedBadge size={13} />}</>}
                    foot={<>{listing.seller.rating.count > 0 && <span className="inline-flex flex-shrink-0 items-center gap-1"><Star size={11} className="fill-[#FBBC04] text-[#FBBC04]" />{listing.seller.rating.average.toFixed(1)} <span>({listing.seller.rating.count})</span></span>}<LocationText location={listing.seller.location} className="min-w-0" /></>}
                />
            </button>
            <button
                type="button"
                onClick={onToggleSave}
                aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}
                aria-pressed={saved}
                className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm transition hover:scale-110"
            >
                <Heart size={17} className={saved ? 'fill-[#EA4335] text-[#EA4335]' : 'text-[#5F6368]'} />
            </button>
        </div>
    );
};

/** A restaurant's dish: the same square picture as any card, with the price in warm amber and whether it comes to you. */
const FoodCard: React.FC<CardProps> = ({ listing, saved, eager, onToggleSave, onOpen, compact, sponsored }) => (
    <div className="group relative">
        <button type="button" onClick={onOpen} className="block w-full text-left">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#FFF4E5]">
                <Thumb listing={listing} eager={eager} width={compact ? 320 : 400} sizes={compact ? '220px' : undefined} className="group-hover:scale-105" />
                <StockChip stock={listing.stock} className="absolute bottom-2.5 left-2.5" />
            </div>
            <CardMeta
                head={<><span className="text-[#B06000]">{priceText(listing)}</span>{sponsored && <SponsoredTag />}</>}
                title={listing.name}
                byline={<><SellerAvatar seller={listing.seller} /><span className="truncate">{listing.seller.name}</span>{listing.seller.verified && <VerifiedBadge size={13} />}{listing.seller.rating.count > 0 && <span className="inline-flex flex-shrink-0 items-center gap-0.5 text-[#B06000]"><Star size={11} className="fill-[#FBBC04] text-[#FBBC04]" />{listing.seller.rating.average.toFixed(1)}</span>}</>}
                foot={<><LocationText location={listing.seller.location} className="min-w-0" />{listing.requiresDelivery && <span className="inline-flex flex-shrink-0 items-center gap-1 font-semibold text-[#3C4043]"><Truck size={11} /> Delivery</span>}</>}
            />
        </button>
        <button type="button" onClick={onToggleSave} aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'} aria-pressed={saved} className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm transition hover:scale-110">
            <Heart size={17} className={saved ? 'fill-[#EA4335] text-[#EA4335]' : 'text-[#5F6368]'} />
        </button>
    </div>
);

/** A consultancy's or other service: no big picture. Who offers it, what it is and what it costs, with a clear way in. */
const ServiceCard: React.FC<CardProps> = ({ listing, saved, onToggleSave, onOpen, sponsored }) => (
    <div className="group relative flex h-full flex-col rounded-[22px] border border-[rgba(116,119,117,0.28)] bg-white p-4 transition hover:border-[#0B57D0]/50 hover:shadow-md">
        <button type="button" onClick={onOpen} className="flex flex-1 flex-col text-left">
            <span className="flex items-center gap-2.5">
                <SellerAvatar seller={listing.seller} size={38} />
                <span className="min-w-0">
                    <span className="flex items-center gap-1 text-sm font-bold text-[#1F1F1F]"><span className="truncate">{listing.seller.name}</span>{listing.seller.verified && <VerifiedBadge size={14} />}</span>
                    <span className="block truncate text-[11px] text-[#80868B]">{listing.category ?? 'Service'}</span>
                </span>
            </span>
            <p className="mt-3 line-clamp-2 min-h-[2.75rem] text-base font-bold leading-snug text-[#1F1F1F]">{listing.name}{sponsored && <SponsoredTag className="ml-2 align-middle" />}</p>
            <p className="mt-1 line-clamp-3 min-h-[3.75rem] flex-1 text-sm leading-5 text-[#5F6368]">{listing.description || 'Get in touch to find out how this works.'}</p>
            <span className="mt-4 flex items-center justify-between gap-2 border-t border-[rgba(116,119,117,0.16)] pt-3">
                <span>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#80868B]">From</span>
                    <span className="text-base font-bold tabular-nums text-[#1F1F1F]">{priceText(listing)}</span>
                </span>
                <span className="inline-flex h-9 items-center rounded-full bg-[#0B57D0] px-4 text-sm font-semibold text-white group-hover:bg-[#0842A0]">{actionOf(listing).short}</span>
            </span>
            {(listing.seller.rating.count > 0 || listing.seller.location) && (
                <span className="mt-2 flex items-center gap-2 text-[11px] text-[#80868B]">
                    {listing.seller.rating.count > 0 && <span className="inline-flex items-center gap-1"><Star size={11} className="fill-[#FBBC04] text-[#FBBC04]" />{listing.seller.rating.average.toFixed(1)} ({listing.seller.rating.count})</span>}
                    <LocationText location={listing.seller.location} className="min-w-0" />
                </span>
            )}
        </button>
        <button type="button" onClick={onToggleSave} aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'} aria-pressed={saved} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#F1F3F4]">
            <Heart size={16} className={saved ? 'fill-[#EA4335] text-[#EA4335]' : 'text-[#5F6368]'} />
        </button>
    </div>
);

/** Shows a listing the way its kind of business is looked at: a dish, a service, or an ordinary product. */
export const ListingCard: React.FC<CardProps> = (props) => {
    const kind = kindOf(props.listing);
    return kind === 'FOOD' ? <FoodCard {...props} /> : kind === 'SERVICE' ? <ServiceCard {...props} /> : <GoodsCard {...props} />;
};

/** One card for a seller whose many small items (a menu) would otherwise flood the page: a picture mosaic, who they are, and what they sell. */
export const StoreCard: React.FC<{ seller: Listing['seller']; items: Listing[]; onOpen: () => void; compact?: boolean; sponsored?: boolean }> = ({ seller, items, onOpen, compact, sponsored }) => {
    const withPictures = items.filter((i) => i.imageUrl);
    // Only real pictures go in the mosaic. With none, the card gets one default picture instead of a grid of identical placeholders.
    const tiles = withPictures.slice(0, 4);
    const label = folderLabel(items);
    const storeKind = storeKindOf(items);
    const prices = items.map((i) => i.price).filter((p) => p > 0);
    const from = prices.length ? Math.min(...prices) : 0;
    const kinds = [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].slice(0, 2).join(' · ');
    return (
        <button type="button" onClick={onOpen} className="group block w-full text-left">
            <div className={`relative overflow-hidden rounded-2xl bg-[#F1F3F4] aspect-square`}>
                {tiles.length === 0 && storeKind === 'SERVICE' ? (
                    /* A consultancy or other service business: what they offer and what it costs, not a picture */
                    <div className="flex h-full w-full flex-col justify-between border border-[rgba(116,119,117,0.28)] bg-[#F8FAFD] p-4">
                        <SellerAvatar seller={seller} size={compact ? 32 : 44} />
                        <ul className="space-y-1.5">
                            {items.slice(0, compact ? 2 : 3).map((i) => (
                                <li key={i.id} className="flex items-baseline justify-between gap-2 text-xs"><span className="truncate font-semibold text-[#1F1F1F]">{i.name}</span><span className="flex-shrink-0 tabular-nums text-[#5F6368]">{priceText(i)}</span></li>
                            ))}
                        </ul>
                    </div>
                ) : tiles.length === 0 ? (
                    <CategoryArt category={items.find((i) => i.category)?.category ?? label} productType={items[0].productType} name={seller.name} compact={!!compact} logoUrl={seller.logoUrl ? resized(seller.logoUrl, 120, { square: true }) : null} />
                ) : (
                    <div className={`grid h-full w-full gap-0.5 ${tiles.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} ${tiles.length === 3 ? 'grid-rows-2' : ''}`}>
                        {tiles.map((t, i) => (
                            <div key={t.id} className={`overflow-hidden ${tiles.length === 3 && i === 0 ? 'row-span-2' : ''}`}>
                                <Thumb listing={t} width={compact ? 200 : 260} sizes={compact ? '110px' : '12vw'} className="transition group-hover:scale-105" />
                            </div>
                        ))}
                    </div>
                )}
                <span className="absolute bottom-2.5 left-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#1F1F1F] shadow-sm">{items.length} {storeKind === 'FOOD' ? 'dishes' : storeKind === 'SERVICE' ? 'services' : 'items'}</span>
            </div>
            <CardMeta
                head={<><SellerAvatar seller={seller} size={22} /><span className="truncate">{seller.name}</span>{seller.verified && <VerifiedBadge size={14} />}{sponsored && <SponsoredTag className="ml-auto" />}</>}
                title={`${kinds || label}${from > 0 ? ` · from ${formatKwacha(from)}` : ''}`}
                byline={seller.rating.count > 0 ? <span className="inline-flex items-center gap-1"><Star size={11} className="fill-[#FBBC04] text-[#FBBC04]" />{seller.rating.average.toFixed(1)} <span>({seller.rating.count})</span></span> : <span className="text-[#80868B]">No reviews yet</span>}
                foot={<LocationText location={seller.location} className="min-w-0" />}
            />
        </button>
    );
};

/** A titled row of cards that scrolls sideways, with arrows on wide screens (like eBay's "Recently viewed" and "Picks for you"). */
export const Shelf: React.FC<{ title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, action, children }) => {
    const track = useRef<HTMLUListElement>(null);
    const scroll = (dir: -1 | 1) => track.current?.scrollBy({ left: dir * Math.max(300, (track.current?.clientWidth ?? 600) * 0.85), behavior: 'smooth' });
    return (
        <section className="mb-9">
            <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-[#1F1F1F] md:text-lg">{title}</h2>
                    {hint && <p className="text-sm text-[#5F6368] md:text-xs">{hint}</p>}
                </div>
                <div className="flex items-center gap-2">
                    {action}
                    <div className="hidden gap-1.5 md:flex">
                        <button type="button" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`} className="flex h-9 w-9 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]"><ChevronLeft size={16} /></button>
                        <button type="button" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`} className="flex h-9 w-9 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]"><ChevronRight size={16} /></button>
                    </div>
                </div>
            </div>
            <ul ref={track} className="no-scrollbar -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-1">{children}</ul>
        </section>
    );
};

export const ShelfItem: React.FC<{ children: React.ReactNode }> = ({ children }) => <li className="flex w-[40vw] max-w-[200px] flex-shrink-0 snap-start flex-col md:w-[220px] md:max-w-none [&>*]:flex-1">{children}</li>;
