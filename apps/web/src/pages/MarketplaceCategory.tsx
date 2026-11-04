import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ChevronRight, Heart, LayoutGrid, List, Search, Store, Truck } from 'lucide-react';
import { apiJson } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { PrimaryButton } from '../components/ui/Dialog';
import { LISTINGS_KEY, ListingCard, LocationText, SellerAvatar, SponsoredTag, Stars, Thumb, VerifiedBadge, priceText } from '../components/marketplace/parts';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import { ShopByCategory } from '../components/marketplace/CategoryNav';
import { TREE, categorize, categoryPath, countCategories, mainById, subById } from '../components/marketplace/taxonomy';
import type { Listing, MarketplaceData } from '../components/marketplace/parts';
import { useSavedListings } from '../hooks/useSavedListings';

type Sort = 'BEST' | 'NEWEST' | 'PRICE_LOW' | 'PRICE_HIGH';
const pill = (on: boolean) => `inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition ${on ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`;

/**
 * One category, like eBay's category page: where you are, the sub-categories down the side, a row of filters, and only what belongs in
 * this category, as a grid or as a list.
 */
export const MarketplaceCategory: React.FC = () => {
    const { main: mainId, sub: subId } = useParams();
    const navigate = useNavigate();
    const { isSaved, toggle } = useSavedListings();
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<Sort>('BEST');
    const [min, setMin] = useState('');
    const [max, setMax] = useState('');
    const [verified, setVerified] = useState(false);
    const [delivery, setDelivery] = useState(false);
    const [view, setView] = useState<'grid' | 'list'>(() => { try { return localStorage.getItem('mw:market-view') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } });
    const setViewSaved = (v: 'grid' | 'list') => { setView(v); try { localStorage.setItem('mw:market-view', v); } catch { /* storage unavailable */ } };

    const { data, isPending } = useQuery({ queryKey: LISTINGS_KEY, queryFn: () => apiJson<MarketplaceData>('/marketplace/listings'), staleTime: 60_000 });
    const all = data?.listings ?? [];
    const counts = useMemo(() => countCategories(all), [all]);
    const main = mainById(mainId);
    const sub = subById(main, subId);
    const boosted = useMemo(() => new Map((data?.ads?.boostedItems ?? []).map((a) => [a.productId, a.campaignId])), [data]);
    const track = (id: string | undefined) => { if (id) apiJson('/marketplace/ads/events', { method: 'POST', body: JSON.stringify({ ids: [id], kind: 'click' }) }).catch(() => undefined); };

    const inCategory = useMemo(() => all.filter((l) => { const c = categorize(l); return c.main === main?.id && (!sub || c.sub === sub.id); }), [all, main, sub]);
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const lo = min ? Number(min) : 0, hi = max ? Number(max) : Infinity;
        const out = inCategory.filter((l) => (!verified || l.seller.verified) && (!delivery || l.requiresDelivery) && l.price >= lo && l.price <= hi
            && (!q || `${l.name} ${l.description ?? ''} ${l.seller.name}`.toLowerCase().includes(q)));
        const rank = (l: Listing) => (boosted.has(l.id) ? 0 : 1);
        out.sort((a, b) => sort === 'PRICE_LOW' ? a.price - b.price : sort === 'PRICE_HIGH' ? b.price - a.price : sort === 'NEWEST' ? +new Date(b.createdAt) - +new Date(a.createdAt) : rank(a) - rank(b) || +new Date(b.createdAt) - +new Date(a.createdAt));
        return out;
    }, [inCategory, query, min, max, verified, delivery, sort, boosted]);

    if (!isPending && !main) {
        return (
            <PagePanel title="Marketplace" tabs={<MarketplaceTabs active="browse" />}>
                <div className="flex flex-col items-center py-20 text-center"><Store size={30} className="text-[#9AA0A6]" /><p className="mt-3 text-base font-bold text-[#1F1F1F]">We don’t have that category</p><PrimaryButton onClick={() => navigate('/marketplace')} className="mt-5 h-11 px-6">Back to the Marketplace</PrimaryButton></div>
            </PagePanel>
        );
    }

    const open = (l: Listing) => { track(boosted.get(l.id)); navigate(`/marketplace/${l.id}`); };

    const row = (l: Listing, i: number) => (
        <li key={l.id} className="relative flex gap-4 border-b border-[rgba(116,119,117,0.16)] py-5 last:border-b-0">
            <button type="button" onClick={() => open(l)} className="h-[150px] w-[150px] flex-shrink-0 overflow-hidden rounded-[20px] bg-[#F1F3F4] sm:h-[190px] sm:w-[190px]"><Thumb listing={l} eager={i < 4} width={400} sizes="190px" /></button>
            <div className="min-w-0 flex-1">
                <button type="button" onClick={() => open(l)} className="block text-left"><span className="line-clamp-2 text-lg font-medium text-[#1F1F1F] hover:underline">{l.name}</span></button>
                {l.description && <p className="mt-0.5 line-clamp-2 text-sm text-[#5F6368]">{l.description}</p>}
                <p className="mt-2 text-2xl font-bold tabular-nums text-[#1F1F1F]">{priceText(l)}</p>
                {l.auction?.status === 'OPEN' && <p className="text-sm text-[#B31412]">Auction · {l.auction.bidCount} {l.auction.bidCount === 1 ? 'bid' : 'bids'}</p>}
                {l.requiresDelivery && <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-[#5F6368]"><Truck size={14} /> Delivery available</p>}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5F6368]">
                    <span className="inline-flex items-center gap-1.5"><SellerAvatar seller={l.seller} size={18} /> <span className="font-medium">{l.seller.name}</span>{l.seller.verified && <VerifiedBadge size={13} />}</span>
                    {l.seller.rating.count > 0 && <span className="inline-flex items-center gap-1"><Stars value={l.seller.rating.average} size={11} /> ({l.seller.rating.count})</span>}
                    <LocationText location={l.seller.location} />
                </p>
                {boosted.has(l.id) && <p className="mt-2"><SponsoredTag /></p>}
            </div>
            <button type="button" onClick={() => toggle(l.id)} aria-pressed={isSaved(l.id)} aria-label={isSaved(l.id) ? 'Remove from watchlist' : 'Add to watchlist'} className="absolute right-0 top-4 flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#F1F3F4]">
                <Heart size={19} className={isSaved(l.id) ? 'fill-[#EA4335] text-[#EA4335]' : 'text-[#5F6368]'} />
            </button>
        </li>
    );

    return (
        <PagePanel title="Marketplace" tabs={<MarketplaceTabs active="browse" />}>
            {/* Search, with the category menu */}
            <div className="mb-5 flex items-center gap-2">
                <ShopByCategory counts={counts} />
                <div className="relative flex-1">
                    <Search size={18} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#5F6368]" />
                    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search in ${sub?.name ?? main?.name ?? 'this category'}`} aria-label="Search this category" className="h-12 w-full rounded-full bg-[#F1F3F4] pl-12 pr-5 text-sm text-[#1F1F1F] placeholder:text-[#80868B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B57D0]" />
                </div>
            </div>

            {/* Where you are */}
            <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-[#5F6368]" aria-label="Breadcrumb">
                <Link to="/marketplace" className="hover:text-[#0B57D0] hover:underline">Marketplace</Link><ChevronRight size={12} />
                {sub ? <Link to={categoryPath(main!.id)} className="hover:text-[#0B57D0] hover:underline">{main!.name}</Link> : <span className="text-[#1F1F1F]">{main?.name}</span>}
                {sub && <><ChevronRight size={12} /><span className="text-[#1F1F1F]">{sub.name}</span></>}
            </nav>
            <h1 className="mb-5 font-advercase text-3xl font-bold text-[#1F1F1F] md:text-4xl">{sub?.name ?? main?.name}</h1>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[230px_minmax(0,1fr)]">
                {/* Sub-categories */}
                <aside className="hidden lg:block">
                    <p className="mb-3 text-sm font-bold text-[#1F1F1F]">Shop by category</p>
                    <ul className="space-y-1 text-sm">
                        <li><Link to={categoryPath(main!.id)} className={sub ? 'text-[#3C4043] hover:underline' : 'font-bold text-[#1F1F1F]'}>All {main?.name} <span className="text-xs text-[#9AA0A6]">{counts.main.get(main!.id) ?? 0}</span></Link></li>
                        {main?.subs.map((s) => (
                            <li key={s.id} className="pl-3"><Link to={categoryPath(main.id, s.id)} className={sub?.id === s.id ? 'font-bold text-[#1F1F1F]' : 'text-[#3C4043] hover:underline'}>{s.name} <span className="text-xs text-[#9AA0A6]">{counts.sub.get(`${main.id}/${s.id}`) ?? 0}</span></Link></li>
                        ))}
                    </ul>
                    <p className="mb-2 mt-7 text-sm font-bold text-[#1F1F1F]">Other categories</p>
                    <ul className="space-y-1 text-sm">{TREE.filter((m) => m.id !== main?.id && m.id !== 'food' && (counts.main.get(m.id) ?? 0) > 0).map((m) => <li key={m.id}><Link to={categoryPath(m.id)} className="text-[#3C4043] hover:underline">{m.name}</Link></li>)}</ul>
                </aside>

                <div className="min-w-0">
                    {/* Sub-category chips on small screens */}
                    {main && main.subs.length > 0 && (
                        <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 lg:hidden">
                            <Link to={categoryPath(main.id)} className={`flex-shrink-0 ${pill(!sub)}`}>All</Link>
                            {main.subs.map((s) => <Link key={s.id} to={categoryPath(main.id, s.id)} className={`flex-shrink-0 ${pill(sub?.id === s.id)}`}>{s.name}</Link>)}
                        </div>
                    )}

                    {/* Filters and view */}
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-1 text-sm text-[#5F6368]">Price</span>
                        <input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Min" aria-label="Minimum price" className="h-10 w-20 rounded-full border border-[#C4C7C5] px-3 text-sm focus:border-[#0B57D0] focus:outline-none" />
                        <span className="text-[#80868B]">–</span>
                        <input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Max" aria-label="Maximum price" className="h-10 w-20 rounded-full border border-[#C4C7C5] px-3 text-sm focus:border-[#0B57D0] focus:outline-none" />
                        <button type="button" onClick={() => setVerified((v) => !v)} aria-pressed={verified} className={pill(verified)}><BadgeCheck size={15} /> Verified stores</button>
                        <button type="button" onClick={() => setDelivery((v) => !v)} aria-pressed={delivery} className={pill(delivery)}><Truck size={15} /> Delivery</button>
                        <div className="ml-auto flex items-center gap-2">
                            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="h-10 rounded-full border border-[#C4C7C5] bg-white px-3 text-sm focus:border-[#0B57D0] focus:outline-none">
                                <option value="BEST">Best match</option><option value="NEWEST">Newest first</option><option value="PRICE_LOW">Price: low to high</option><option value="PRICE_HIGH">Price: high to low</option>
                            </select>
                            <div className="inline-flex overflow-hidden rounded-full border border-[#C4C7C5]" role="group" aria-label="View">
                                <button type="button" onClick={() => setViewSaved('grid')} aria-pressed={view === 'grid'} aria-label="Grid view" className={`flex h-10 w-11 items-center justify-center ${view === 'grid' ? 'bg-[#D3E3FD] text-[#041E49]' : 'text-[#5F6368] hover:bg-[#F1F3F4]'}`}><LayoutGrid size={17} /></button>
                                <button type="button" onClick={() => setViewSaved('list')} aria-pressed={view === 'list'} aria-label="List view" className={`flex h-10 w-11 items-center justify-center ${view === 'list' ? 'bg-[#D3E3FD] text-[#041E49]' : 'text-[#5F6368] hover:bg-[#F1F3F4]'}`}><List size={17} /></button>
                            </div>
                        </div>
                    </div>
                    <p className="mb-3 border-t border-[rgba(116,119,117,0.16)] pt-3 text-sm text-[#5F6368]">{isPending ? 'Loading…' : `${shown.length.toLocaleString()} ${shown.length === 1 ? 'result' : 'results'}`}</p>

                    {isPending ? (
                        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <li key={i}><div className="aspect-square animate-pulse rounded-2xl bg-[#F1F3F4]" /></li>)}</ul>
                    ) : shown.length === 0 ? (
                        <div className="flex flex-col items-center py-16 text-center">
                            <Store size={28} className="text-[#9AA0A6]" />
                            <p className="mt-3 text-sm font-semibold text-[#1F1F1F]">Nothing here yet</p>
                            <p className="mt-1 text-sm text-[#5F6368]">Try a wider price range or another category.</p>
                            <PrimaryButton onClick={() => navigate('/marketplace')} className="mt-4 h-11 px-6">Browse everything</PrimaryButton>
                        </div>
                    ) : view === 'list' ? (
                        <ul>{shown.map((l, i) => row(l, i))}</ul>
                    ) : (
                        <ul className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3 xl:grid-cols-4">
                            {shown.map((l, i) => <li key={l.id}><ListingCard listing={l} eager={i < 4} sponsored={boosted.has(l.id)} saved={isSaved(l.id)} onToggleSave={() => toggle(l.id)} onOpen={() => open(l)} /></li>)}
                        </ul>
                    )}
                </div>
            </div>
        </PagePanel>
    );
};
