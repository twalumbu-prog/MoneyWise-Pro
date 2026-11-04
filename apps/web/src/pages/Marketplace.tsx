import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Camera, Gavel, Heart, Lightbulb, MapPin, Plus, Search, ShoppingBag, SlidersHorizontal, Store } from 'lucide-react';
import { apiJson } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { PrimaryButton, TonalButton } from '../components/ui/Dialog';
import { LISTINGS_KEY, ListingCard, Shelf, ShelfItem, StoreCard, typeGroup } from '../components/marketplace/parts';
import { buildFeed } from '../components/marketplace/feed';
import type { FeedEntry } from '../components/marketplace/feed';
import type { Listing, MarketplaceData } from '../components/marketplace/parts';
import { StoreLocationDialog } from '../components/marketplace/StoreLocationDialog';
import { LocationNudge } from '../components/marketplace/LocationNudge';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import { HeroCarousel } from '../components/marketplace/HeroCarousel';
import { formatKwacha } from 'core';
import { smartSlides } from '../components/marketplace/heroSlides';
import { ImageSearchDialog, matchScore } from '../components/marketplace/ImageSearchDialog';
import type { ImageMatch } from '../components/marketplace/ImageSearchDialog';
import type { Slide } from '../components/marketplace/HeroCarousel';
import { kindOf } from '../components/marketplace/kinds';
import { CategoryBar, ShopByCategory } from '../components/marketplace/CategoryNav';
import { CategoryTile, MainCategoryTiles, PromoBand, pictureFor } from '../components/marketplace/CategoryTiles';
import { TREE, categorize, categoryPath, countCategories } from '../components/marketplace/taxonomy';
import { useRecentlyViewed, useSavedListings } from '../hooks/useSavedListings';

type TypeFilter = 'ALL' | 'AUCTION' | 'PRODUCT' | 'SERVICE' | 'DIGITAL';
type Sort = 'NEWEST' | 'ENDING' | 'PRICE_LOW' | 'PRICE_HIGH';

const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
    { id: 'ALL', label: 'Everything' }, { id: 'AUCTION', label: 'Auctions' }, { id: 'PRODUCT', label: 'Products' }, { id: 'SERVICE', label: 'Services' }, { id: 'DIGITAL', label: 'Digital' },
];

const chip = (on: boolean) => `rounded-full px-3.5 py-1.5 text-sm transition ${on ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`;

/**
 * Marketplace: what other MoneyWise sellers have listed. The home page works like eBay's: a search bar with category chips, shelves
 * that pick up where you left off (your watchlist, what you looked at, picks from the same categories), then everything that's listed.
 * Filtering is done on the device from one request, so searching and filtering are instant on any connection.
 */
export const Marketplace: React.FC = () => {
    const navigate = useNavigate();
    const { saved, isSaved, toggle } = useSavedListings();
    const { recent } = useRecentlyViewed();

    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<string>('ALL');
    const [type, setType] = useState<TypeFilter>('ALL');
    const [sort, setSort] = useState<Sort>('NEWEST');
    const [min, setMin] = useState('');
    const [max, setMax] = useState('');
    const [onlySaved, setOnlySaved] = useState(false);
    const [verifiedOnly, setVerifiedOnly] = useState(false);
    const [place, setPlace] = useState('ALL');
    const [locationOpen, setLocationOpen] = useState(false);
    // On a phone "Store location" lives behind the three dots in the top bar, which comes here with ?location=1.
    const [searchParams, setSearchParams] = useSearchParams();
    React.useEffect(() => {
        if (searchParams.get('location')) { setLocationOpen(true); setSearchParams((p) => { p.delete('location'); return p; }, { replace: true }); }
    }, [searchParams, setSearchParams]);
    const [filtersOpen, setFiltersOpen] = useState(false);
    // Searching with a photo: what it shows, and the dialog to pick one.
    const [imageMatch, setImageMatch] = useState<ImageMatch | null>(null);
    const [imageOpen, setImageOpen] = useState(false);

    const { data, isPending, isError, refetch } = useQuery({
        queryKey: LISTINGS_KEY,
        queryFn: () => apiJson<MarketplaceData>('/marketplace/listings'),
        staleTime: 60_000,
    });

    // Food and drink have their own tab, so browsing the rest of the Marketplace leaves them out. A search still finds them.
    const everything = useMemo(() => data?.listings ?? [], [data]);
    const all = useMemo(() => everything.filter((l) => kindOf(l) !== 'FOOD'), [everything]);
    const counts = useMemo(() => countCategories(all), [all]);
    const mainsWithItems = useMemo(() => TREE.filter((m) => (counts.main.get(m.id) ?? 0) > 0), [counts]);
    const byId = useMemo(() => new Map(everything.map((l) => [l.id, l])), [everything]);
    const places = useMemo(() => [...new Set(all.map((l) => l.seller.location).filter((x): x is string => !!x))].sort(), [all]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const lo = min ? Number(min) : 0;
        const hi = max ? Number(max) : Infinity;
        const out = (q || imageMatch ? everything : all).filter((l) => {
            if (imageMatch && matchScore(l, imageMatch) === 0) return false;
            if (onlySaved && !saved.includes(l.id)) return false;
            if (category !== 'ALL' && categorize(l).main !== category) return false;
            if (type === 'AUCTION' ? l.auction?.status !== 'OPEN' : type !== 'ALL' && typeGroup(l.productType) !== type) return false;
            if (verifiedOnly && !l.seller.verified) return false;
            if (place !== 'ALL' && l.seller.location !== place) return false;
            if (l.price < lo || l.price > hi) return false;
            if (q && !`${l.name} ${l.description ?? ''} ${l.category ?? ''} ${l.seller.name}`.toLowerCase().includes(q)) return false;
            return true;
        });
        const endsAt = (l: Listing) => (l.auction?.status === 'OPEN' ? new Date(l.auction.endsAt).getTime() : Infinity);
        out.sort((a, b) => imageMatch && sort === 'NEWEST' ? matchScore(b, imageMatch) - matchScore(a, imageMatch) : sort === 'ENDING' ? endsAt(a) - endsAt(b) : sort === 'PRICE_LOW' ? a.price - b.price : sort === 'PRICE_HIGH' ? b.price - a.price : +new Date(b.createdAt) - +new Date(a.createdAt));
        return out;
    }, [all, everything, query, category, type, sort, min, max, onlySaved, saved, verifiedOnly, place, imageMatch]);

    const browsing = !imageMatch && !query.trim() && category === 'ALL' && type === 'ALL' && !min && !max && sort === 'NEWEST' && !onlySaved && !verifiedOnly && place === 'ALL';
    const filtersActive = type !== 'ALL' || !!min || !!max || sort !== 'NEWEST' || verifiedOnly || place !== 'ALL';
    const reset = () => { setQuery(''); setCategory('ALL'); setType('ALL'); setSort('NEWEST'); setMin(''); setMax(''); setOnlySaved(false); setVerifiedOnly(false); setPlace('ALL'); };

    // Shelves for the home view.
    const watchlist = useMemo(() => saved.map((id) => byId.get(id)).filter((l): l is Listing => !!l).slice(0, 12), [saved, byId]);
    const recently = useMemo(() => recent.map((id) => byId.get(id)).filter((l): l is Listing => !!l).slice(0, 12), [recent, byId]);
    const endingSoon = useMemo(() => all.filter((l) => l.auction?.status === 'OPEN').sort((a, b) => +new Date(a.auction!.endsAt) - +new Date(b.auction!.endsAt)).slice(0, 12), [all]);
    const picks = useMemo(() => {
        const seen = new Set([...watchlist, ...recently].map((l) => l.id));
        const liked = new Set([...watchlist, ...recently].map((l) => l.category).filter(Boolean));
        const pool = all.filter((l) => !seen.has(l.id) && !l.isMine);
        const inLiked = pool.filter((l) => l.category && liked.has(l.category));
        return (inLiked.length >= 4 ? inLiked : pool).slice(0, 12);
    }, [all, watchlist, recently]);

    // MoneyWise Ads: paid placements. Featured items and stores fill a shelf on the home page; boosted items lead the results.
    const ads = data?.ads;
    const campaignOfItem = useMemo(() => new Map([...(ads?.featuredItems ?? []), ...(ads?.boostedItems ?? [])].map((a) => [a.productId, a.campaignId])), [ads]);
    const campaignOfStore = useMemo(() => new Map((ads?.featuredStores ?? []).map((a) => [a.orgId, a.campaignId])), [ads]);
    const boosted = useMemo(() => new Set((ads?.boostedItems ?? []).map((a) => a.productId)), [ads]);
    const featured = useMemo(() => {
        const items = (ads?.featuredItems ?? []).map((a) => byId.get(a.productId)).filter((l): l is Listing => !!l);
        const stores = (ads?.featuredStores ?? []).map((a) => ({ seller: all.find((l) => l.seller.id === a.orgId)?.seller, items: all.filter((l) => l.seller.id === a.orgId) })).filter((s): s is { seller: Listing['seller']; items: Listing[] } => !!s.seller);
        return { items, stores, total: items.length + stores.length };
    }, [ads, byId, all]);

    // Menu-style sellers (restaurants, drinks) show as one store card instead of one card per dish. Personal lists keep every item.
    const feed = useMemo(() => {
        // Up to three boosted items lead the list (they carry the Sponsored tag); everything else keeps its order.
        const lead = shown.filter((l) => boosted.has(l.id)).slice(0, 3);
        const leadIds = new Set(lead.map((l) => l.id));
        return buildFeed(onlySaved ? shown : [...lead, ...shown.filter((l) => !leadIds.has(l.id))], !onlySaved);
    }, [shown, onlySaved, boosted]);
    const pickFeed = useMemo(() => buildFeed(picks), [picks]);
    const leadBoosted = useMemo(() => new Set(feed.filter((e): e is Extract<FeedEntry, { kind: 'item' }> => e.kind === 'item' && boosted.has(e.listing.id)).slice(0, 3).map((e) => e.listing.id)), [feed, boosted]);

    // Count what was seen once per visit, and what was opened. Tracking never blocks browsing.
    const track = (ids: string[], kind: 'impression' | 'click') => { if (ids.length) apiJson('/marketplace/ads/events', { method: 'POST', body: JSON.stringify({ ids, kind }) }).catch(() => undefined); };
    const shownAdIds = useMemo(() => [
        ...(browsing ? featured.items.map((l) => campaignOfItem.get(l.id)!) : []),
        ...(browsing ? featured.stores.map((s) => campaignOfStore.get(s.seller.id)!) : []),
        ...[...leadBoosted].map((id) => campaignOfItem.get(id)!),
    ].filter(Boolean), [browsing, featured, leadBoosted, campaignOfItem, campaignOfStore]);
    const trackOnce = (ids: string[]) => {
        let seen: string[] = [];
        try { seen = JSON.parse(sessionStorage.getItem('mw:ad-seen') ?? '[]'); } catch { /* storage unavailable */ }
        const fresh = [...new Set(ids)].filter((id) => !seen.includes(id));
        if (!fresh.length) return;
        track(fresh, 'impression');
        try { sessionStorage.setItem('mw:ad-seen', JSON.stringify([...seen, ...fresh].slice(-200))); } catch { /* storage unavailable */ }
    };
    React.useEffect(() => { trackOnce(shownAdIds); }, [shownAdIds]); // eslint-disable-line react-hooks/exhaustive-deps

    const open = (l: Listing) => {
        const c = campaignOfItem.get(l.id);
        if (c) track([c], 'click');
        navigate(`/marketplace/${l.id}`);
    };
    const card = (l: Listing, i: number, compact = false, sponsored = false) => (
        <ListingCard key={l.id} listing={l} eager={i < 4} compact={compact} sponsored={sponsored || leadBoosted.has(l.id)} saved={isSaved(l.id)} onToggleSave={() => toggle(l.id)} onOpen={() => open(l)} />
    );
    const openStore = (orgId: string) => {
        const c = campaignOfStore.get(orgId);
        if (c) track([c], 'click');
        navigate(`/marketplace/store/${orgId}`);
    };
    // The banner at the top: what is paid to be there first, then what MoneyWise itself wants people to know.
    const popular = [...mainsWithItems].sort((a, b) => (counts.main.get(b.id) ?? 0) - (counts.main.get(a.id) ?? 0));
    const topMain = popular[0];
    // Only items with a picture go on a banner. Paid placements lead, then slides made from what is on the Marketplace right now.
    const pics = (ls: Listing[]) => ls.filter((l) => l.imageUrl).slice(0, 3).map((l) => ({ id: l.id, image: l.imageUrl, label: l.name, sub: formatKwacha(l.price), onOpen: () => open(l) }));
    const newest = (ls: Listing[]) => [...ls].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    const sponsored: Slide[] = [];
    featured.stores.slice(0, 2).forEach((s, k) => {
        const items = pics(newest(s.items));
        if (!items.length) return;
        sponsored.push({
            id: `store-${s.seller.id}`, bg: ['#0B57D0', '#7C3AED'][k % 2], ink: '#FFFFFF', button: { bg: '#FFFFFF', ink: '#111111' }, tag: 'Sponsored',
            title: s.seller.name, text: `${items[0].label}${s.items.length > 1 ? ` and ${s.items.length - 1} more` : ''}${s.seller.location ? `, in ${s.seller.location}` : ''}.`, cta: 'Visit store', onCta: () => openStore(s.seller.id),
            items, onShow: () => trackOnce([campaignOfStore.get(s.seller.id)!].filter(Boolean)),
        });
    });
    const featuredPics = pics(newest(featured.items));
    if (featuredPics.length > 0) sponsored.push({
        id: 'featured-items', bg: '#F59E0B', ink: '#1F1F1F', button: { bg: '#1F1F1F', ink: '#FFFFFF' }, tag: 'Sponsored',
        title: 'Featured picks', text: `${featuredPics[0].label}${featured.items.length > 1 ? ` and ${featured.items.length - 1} more` : ''}, picked by their sellers.`, cta: 'See the first', onCta: () => open(featured.items.find((l) => l.imageUrl) ?? featured.items[0]),
        items: featuredPics, onShow: () => trackOnce(featured.items.slice(0, 3).map((l) => campaignOfItem.get(l.id)!).filter(Boolean)),
    });
    const slides: Slide[] = [...sponsored, ...smartSlides({ all, mains: popular.map((m) => ({ id: m.id, name: m.name, count: counts.main.get(m.id) ?? 0 })), open, go: navigate, categoryPath })];

    // Sellers to recommend: the best reviewed first, then the ones with most to look at.
    const topSellers = useMemo(() => {
        const bySeller = new Map<string, { seller: Listing['seller']; items: Listing[] }>();
        all.filter((l) => !l.isMine).forEach((l) => { const e = bySeller.get(l.seller.id); if (e) e.items.push(l); else bySeller.set(l.seller.id, { seller: l.seller, items: [l] }); });
        return [...bySeller.values()].sort((a, b) => b.seller.rating.average * Math.min(b.seller.rating.count, 5) - a.seller.rating.average * Math.min(a.seller.rating.count, 5) || b.items.length - a.items.length).slice(0, 10);
    }, [all]);

    // Sub-category shelves for the biggest categories, and the bands between sections.
    const shelfMains = popular.filter((m) => m.subs.some((s) => (counts.sub.get(`${m.id}/${s.id}`) ?? 0) > 0)).slice(0, 2);
    const bandImages = (mainId: string) => all.filter((l) => categorize(l).main === mainId && l.imageUrl).slice(0, 3).map((l) => l.imageUrl);

    const entry = (e: FeedEntry, i: number, compact = false) => e.kind === 'store'
        ? <StoreCard key={`store-${e.seller.id}`} seller={e.seller} items={e.items} compact={compact} onOpen={() => navigate(`/marketplace/store/${e.seller.id}`)} />
        : card(e.listing, i, compact);
    const entryKey = (e: FeedEntry) => e.kind === 'store' ? `store-${e.seller.id}` : e.listing.id;

    return (
        <PagePanel
            title="Marketplace"
            subtitle="Find what you need from MoneyWise sellers"
            tabs={<MarketplaceTabs active="browse" />}
            actions={<><span className="hidden md:inline-flex"><TonalButton onClick={() => setLocationOpen(true)}><MapPin size={14} /> Store location</TonalButton></span><PrimaryButton onClick={() => navigate('/products')} className="h-10 px-5"><Plus size={16} /> Sell something</PrimaryButton></>}
        >
            {all.some((l) => l.isMine) && <LocationNudge className="mb-5" />}
            {/* Search */}
            <div className="sticky top-0 z-10 -mx-5 mb-5 bg-white/95 px-5 pb-3 pt-1 backdrop-blur md:-mx-8 md:px-8">
                <div className="flex items-center gap-2">
                    <div className="hidden md:block"><ShopByCategory counts={counts} /></div>
                    <div className="relative flex-1">
                        <Search size={18} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#5F6368]" />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search for anything"
                            aria-label="Search the Marketplace"
                            className="h-12 w-full rounded-full bg-[#F1F3F4] pl-12 pr-14 text-sm text-[#1F1F1F] placeholder:text-[#80868B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B57D0]"
                        />
                        <button type="button" onClick={() => setImageOpen(true)} aria-label="Search with an image" title="Search with an image" className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#3C4043] hover:bg-[#E3E5E8]"><Camera size={18} /></button>
                    </div>
                    <select
                        value={category}
                        onChange={(e) => { const v = e.target.value; if (v !== 'ALL' && !query.trim()) navigate(categoryPath(v)); else setCategory(v); }}
                        aria-label="Category"
                        className="hidden h-12 max-w-[200px] rounded-full bg-[#F1F3F4] px-4 text-sm text-[#3C4043] focus:outline-none focus:ring-2 focus:ring-[#0B57D0] md:block"
                    >
                        <option value="ALL">All categories</option>
                        {mainsWithItems.map((m) => <option key={m.id} value={m.id}>{m.name} ({counts.main.get(m.id)})</option>)}
                    </select>
                    <button
                        type="button"
                        onClick={() => setFiltersOpen((v) => !v)}
                        aria-expanded={filtersOpen}
                        className={`hidden h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold transition md:inline-flex ${filtersOpen || filtersActive ? 'bg-[#D3E3FD] text-[#041E49]' : 'text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}
                    >
                        <SlidersHorizontal size={16} /> Filters{filtersActive ? ' •' : ''}
                    </button>
                    <button
                        type="button"
                        onClick={() => setOnlySaved((v) => !v)}
                        aria-pressed={onlySaved}
                        className={`hidden h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold transition md:inline-flex ${onlySaved ? 'bg-[#D3E3FD] text-[#041E49]' : 'text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}
                    >
                        <Heart size={16} className={onlySaved ? 'fill-[#EA4335] text-[#EA4335]' : ''} /> Watchlist{saved.length ? ` (${saved.length})` : ''}
                    </button>
                    <button type="button" onClick={() => navigate('/marketplace/orders')} aria-label="Your orders" className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#F1F3F4] text-[#1F1F1F] md:hidden"><ShoppingBag size={20} /></button>
                </div>

                {/* On a phone: one swipeable row of chips instead of the buttons and the category bar. */}
                <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 md:hidden" aria-label="Quick filters">
                    {(() => {
                        const chipCls = (on: boolean) => `inline-flex h-11 flex-shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ${on ? 'bg-[#D3E3FD] text-[#041E49]' : 'bg-[#F1F3F4] text-[#1F1F1F]'}`;
                        return (
                            <>
                                <button type="button" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} className={chipCls(filtersOpen || filtersActive)}><SlidersHorizontal size={16} /> Filters{filtersActive ? ' •' : ''}</button>
                                <button type="button" onClick={() => setOnlySaved((v) => !v)} aria-pressed={onlySaved} className={chipCls(onlySaved)}><Heart size={16} className={onlySaved ? 'fill-[#EA4335] text-[#EA4335]' : ''} /> Saved{saved.length ? ` (${saved.length})` : ''}</button>
                                <button type="button" onClick={() => { setType('AUCTION'); setSort('ENDING'); }} className={chipCls(type === 'AUCTION')}><Gavel size={16} /> Auctions</button>
                                {mainsWithItems.map((m) => <Link key={m.id} to={categoryPath(m.id)} className={chipCls(category === m.id)}>{m.name}</Link>)}
                            </>
                        );
                    })()}
                </div>

                <div className="mt-2 hidden md:block"><CategoryBar counts={counts} active={category === 'ALL' ? undefined : category} saved={saved.length} onSaved={() => setOnlySaved(true)} onDeals={() => { setType('AUCTION'); setSort('ENDING'); }} /></div>

                {filtersOpen && (
                    <div className="mt-3 grid grid-cols-1 gap-4 rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4 md:grid-cols-3 xl:grid-cols-5">
                        <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#5F6368]">Type</p>
                            <div className="flex flex-wrap gap-2">{TYPE_FILTERS.map((t) => <button key={t.id} type="button" onClick={() => setType(t.id)} className={chip(type === t.id)}>{t.label}</button>)}</div>
                        </div>
                        <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#5F6368]">Price (K)</p>
                            <div className="flex items-center gap-2">
                                <input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Min" aria-label="Minimum price" className="h-10 w-full rounded-lg border border-[#C4C7C5] px-3 text-sm focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]" />
                                <span className="text-[#80868B]">–</span>
                                <input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Max" aria-label="Maximum price" className="h-10 w-full rounded-lg border border-[#C4C7C5] px-3 text-sm focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]" />
                            </div>
                        </div>
                        <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#5F6368]">Sort by</p>
                            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by" className="h-10 w-full rounded-lg border border-[#C4C7C5] bg-white px-3 text-sm focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]">
                                <option value="NEWEST">Newest first</option>
                                <option value="ENDING">Ending soonest</option>
                                <option value="PRICE_LOW">Price: low to high</option>
                                <option value="PRICE_HIGH">Price: high to low</option>
                            </select>
                        </div>
                        <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#5F6368]">Seller location</p>
                            <select value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Seller location" className="h-10 w-full rounded-lg border border-[#C4C7C5] bg-white px-3 text-sm focus:border-[#0B57D0] focus:outline-none focus:ring-1 focus:ring-[#0B57D0]">
                                <option value="ALL">Anywhere</option>
                                {places.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#5F6368]">Sellers</p>
                            <button type="button" onClick={() => setVerifiedOnly((v) => !v)} aria-pressed={verifiedOnly} className={chip(verifiedOnly) + ' inline-flex items-center gap-1.5'}><BadgeCheck size={15} /> Verified stores only</button>
                        </div>
                    </div>
                )}
            </div>

            {imageMatch && (
                <div className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl bg-[#F8FAFD] p-4">
                    <img src={imageMatch.thumb} alt="Your photo" className="h-16 w-16 flex-shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[#1F1F1F]">{imageMatch.ids ? 'Items that look like your photo' : 'Items like your photo'}</p>
                        <p className="text-sm text-[#5F6368]">{imageMatch.summary}</p>
                        <p className="mt-1.5 flex flex-wrap gap-1.5">{imageMatch.keywords.slice(0, 6).map((k) => <span key={k} className="rounded-full bg-white px-2.5 py-0.5 text-xs text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5]">{k}</span>)}</p>
                    </div>
                    <TonalButton onClick={() => setImageMatch(null)}>Clear photo search</TonalButton>
                </div>
            )}

            {isError ? (
                <div className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-10 text-center">
                    <p className="text-sm text-[#5F6368]">Couldn’t load the Marketplace.</p>
                    <TonalButton onClick={() => refetch()} className="mt-4">Try again</TonalButton>
                </div>
            ) : isPending ? (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" aria-label="Loading">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <li key={i}>
                            <div className="aspect-square animate-pulse rounded-2xl bg-[#F1F3F4]" />
                            <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-[#F1F3F4]" />
                            <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-[#F1F3F4]" />
                        </li>
                    ))}
                </ul>
            ) : all.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#C4C7C5] px-6 py-16 text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E8F0FE] text-[#0B57D0]"><Store size={28} /></span>
                    <h2 className="mt-4 text-lg font-bold text-[#1F1F1F]">Nothing listed yet</h2>
                    <p className="mt-1 max-w-md text-sm text-[#5F6368]">Sellers choose what to list. Open a product in Products &amp; Services and turn on “List on Marketplace”.</p>
                    <PrimaryButton onClick={() => navigate('/products')} className="mt-5 h-11 px-6">List something</PrimaryButton>
                </div>
            ) : (
                <>
                    {browsing && <HeroCarousel slides={slides.slice(0, 6)} />}
                    {browsing && mainsWithItems.length > 0 && (
                        <section className="mb-10">
                            <h2 className="mb-3 text-xl font-bold text-[#1F1F1F]">Shop by category</h2>
                            <MainCategoryTiles listings={all} counts={counts} mains={mainsWithItems} />
                        </section>
                    )}
                    {browsing && featured.total > 0 && (
                        <Shelf title="Featured" hint="Sponsored by MoneyWise sellers">
                            {featured.items.map((l, i) => <ShelfItem key={`f-${l.id}`}>{card(l, i, true, true)}</ShelfItem>)}
                            {featured.stores.map((s) => <ShelfItem key={`fs-${s.seller.id}`}><StoreCard seller={s.seller} items={s.items} compact sponsored onOpen={() => openStore(s.seller.id)} /></ShelfItem>)}
                        </Shelf>
                    )}
                    {browsing && endingSoon.length > 0 && (
                        <Shelf title="Auctions ending soon" hint="Bid before the clock runs out" action={<button type="button" onClick={() => { setType('AUCTION'); setSort('ENDING'); }} className="inline-flex items-center gap-1 text-sm font-semibold text-[#1F1F1F] underline underline-offset-2 md:text-[#0B57D0] md:no-underline md:hover:underline"><Gavel size={13} /> See all auctions</button>}>
                            {endingSoon.map((l, i) => <ShelfItem key={l.id}>{card(l, i, true)}</ShelfItem>)}
                        </Shelf>
                    )}
                    {browsing && watchlist.length > 0 && (
                        <Shelf title="Your watchlist" hint="Items you’ve hearted" action={<button type="button" onClick={() => setOnlySaved(true)} className="text-sm font-semibold text-[#1F1F1F] underline underline-offset-2 md:text-[#0B57D0] md:no-underline md:hover:underline">See all</button>}>
                            {watchlist.map((l, i) => <ShelfItem key={l.id}>{card(l, i, true)}</ShelfItem>)}
                        </Shelf>
                    )}
                    {browsing && recently.length > 0 && (
                        <Shelf title="Recently viewed" hint="Pick up where you left off">
                            {recently.map((l, i) => <ShelfItem key={l.id}>{card(l, i, true)}</ShelfItem>)}
                        </Shelf>
                    )}
                    {browsing && (watchlist.length > 0 || recently.length > 0) && picks.length > 0 && (
                        <Shelf title="Picks for you" hint="Based on what you’ve looked at and saved">
                            {pickFeed.map((e, i) => <ShelfItem key={entryKey(e)}>{entry(e, i, true)}</ShelfItem>)}
                        </Shelf>
                    )}

                    {/* A row of items for each of the busiest categories, then the sellers people favour (like eBay's "Recommended for you"). */}
                    {browsing && popular.slice(0, 3).map((m) => {
                        const items = [...all.filter((l) => categorize(l).main === m.id && !l.isMine)].sort((a, b) => Number(!!b.imageUrl) - Number(!!a.imageUrl) || +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 12);
                        if (items.length < 3) return null;
                        return (
                            <Shelf key={`shelf-${m.id}`} title={m.name} hint="Recommended for you" action={<Link to={categoryPath(m.id)} className="text-sm font-semibold text-[#1F1F1F] underline underline-offset-2 md:text-[#0B57D0] md:no-underline md:hover:underline">See all</Link>}>
                                {buildFeed(items).map((e, i) => <ShelfItem key={entryKey(e)}>{entry(e, i, true)}</ShelfItem>)}
                            </Shelf>
                        );
                    })}
                    {browsing && topSellers.length > 0 && (
                        <Shelf title="Recommended sellers" hint="Well-reviewed stores to look at">
                            {topSellers.map((s) => <ShelfItem key={`rs-${s.seller.id}`}><StoreCard seller={s.seller} items={s.items} compact onOpen={() => openStore(s.seller.id)} /></ShelfItem>)}
                        </Shelf>
                    )}
                    {browsing && (
                        <div className="mb-9 flex items-start gap-3 rounded-2xl bg-[#F1F3F4] p-4 md:hidden">
                            <Lightbulb size={20} className="mt-0.5 flex-shrink-0 text-[#1F1F1F]" />
                            <div><p className="text-base text-[#1F1F1F]">Sell something in just a few steps.</p><button type="button" onClick={() => navigate('/products')} className="mt-0.5 text-base font-semibold text-[#1F1F1F] underline underline-offset-2">Create a listing</button></div>
                        </div>
                    )}

                    {browsing && shelfMains.map((m, k) => (
                        <React.Fragment key={m.id}>
                            <section className="mb-10">
                                <div className="mb-3 flex items-end justify-between gap-3">
                                    <h2 className="text-xl font-bold text-[#1F1F1F]">{m.name}</h2>
                                    <Link to={categoryPath(m.id)} className="text-sm font-semibold text-[#1F1F1F] underline underline-offset-2 md:text-[#0B57D0] md:no-underline md:hover:underline">See all</Link>
                                </div>
                                <ul className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-6 xl:grid-cols-7">
                                    {m.subs.filter((s) => (counts.sub.get(`${m.id}/${s.id}`) ?? 0) > 0).map((s) => (
                                        <li key={s.id} className="w-[34vw] max-w-[160px] flex-shrink-0 snap-start md:w-auto md:max-w-none"><CategoryTile to={categoryPath(m.id, s.id)} name={s.name} count={counts.sub.get(`${m.id}/${s.id}`)} image={pictureFor(all, (l) => { const c = categorize(l); return c.main === m.id && c.sub === s.id; })} icon={m.icon} tone={m.tone} /></li>
                                    ))}
                                </ul>
                            </section>
                            {k === 0 && topMain && (
                                <PromoBand bg="#161616" ink="#FFFFFF" title={`Endless ${topMain.name.toLowerCase()}. Epic prices.`} text={`Browse ${counts.main.get(topMain.id)} listings from MoneyWise sellers.`} cta="Shop now" onCta={() => navigate(categoryPath(topMain.id))} images={bandImages(topMain.id)} />
                            )}
                        </React.Fragment>
                    ))}
                    {browsing && (
                        <PromoBand bg="#0B57D0" ink="#FFFFFF" title="Get more with MoneyWise" text="Buyers split orders into four with Pay in 4. Sellers get a store of their own and can advertise to be seen first." cta="Advertise your store" onCta={() => navigate('/marketplace/ads')} images={all.filter((l) => l.imageUrl).slice(0, 3).map((l) => l.imageUrl)} ctaBg="#FFFFFF" ctaInk="#0B57D0" />
                    )}

                    {shown.length === 0 ? (
                        <div className="flex flex-col items-center py-16 text-center">
                            <MapPin size={28} className="text-[#9AA0A6]" />
                            <p className="mt-3 text-sm font-semibold text-[#1F1F1F]">{onlySaved && saved.length === 0 ? 'Your watchlist is empty' : 'No matches'}</p>
                            <p className="mt-1 text-sm text-[#5F6368]">{onlySaved && saved.length === 0 ? 'Tap the heart on a listing to add it here.' : 'Try a different search or clear your filters.'}</p>
                            <TonalButton onClick={reset} className="mt-4">Clear filters</TonalButton>
                        </div>
                    ) : (
                        <section>
                            <div className="mb-3 flex items-baseline justify-between">
                                <h2 className="text-lg font-bold text-[#1F1F1F]">{browsing ? 'Just listed' : onlySaved ? 'Your watchlist' : 'Results'}</h2>
                                <p className="text-xs text-[#5F6368]">{feed.length} {feed.length === 1 ? 'result' : 'results'}</p>
                            </div>
                            <ul className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                                {feed.map((e, i) => <li key={entryKey(e)}>{entry(e, i)}</li>)}
                            </ul>
                        </section>
                    )}
                </>
            )}

            <ImageSearchDialog listings={all} open={imageOpen} onClose={() => setImageOpen(false)} onResult={(m) => { setImageMatch(m); setQuery(''); setCategory('ALL'); }} />
            <StoreLocationDialog open={locationOpen} onClose={() => setLocationOpen(false)} />
        </PagePanel>
    );
};
