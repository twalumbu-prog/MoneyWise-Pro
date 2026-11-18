import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Search, Star, Store } from 'lucide-react';
import { apiJson } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { PrimaryButton } from '../components/ui/Dialog';
import { LISTINGS_KEY, LocationText, SellerAvatar, SponsoredTag, Thumb, VerifiedBadge } from '../components/marketplace/parts';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import { storeKindOf } from '../components/marketplace/kinds';
import type { ListingKind } from '../components/marketplace/kinds';
import type { Listing, MarketplaceData } from '../components/marketplace/parts';

type Sort = 'ITEMS' | 'RATING' | 'NEWEST';
interface StoreRow { seller: Listing['seller']; items: Listing[]; kind: ListingKind; newest: number; sponsored: boolean }

const KIND_TEXT: Record<ListingKind, string> = { FOOD: 'Restaurant', SERVICE: 'Services', GOODS: 'Shop' };
const chip = (on: boolean) => `inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-sm transition ${on ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`;

/** The stores on the Marketplace themselves, not their items: who they are, what kind of business, how they're rated and where they are. */
export const MarketplaceStores: React.FC = () => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState<'ALL' | ListingKind>('ALL');
    const [place, setPlace] = useState('ALL');
    const [verified, setVerified] = useState(false);
    const [sort, setSort] = useState<Sort>('ITEMS');
    const { data, isPending } = useQuery({ queryKey: LISTINGS_KEY, queryFn: () => apiJson<MarketplaceData>('/marketplace/listings'), staleTime: 60_000 });

    const stores = useMemo<StoreRow[]>(() => {
        const featured = new Set((data?.ads?.featuredStores ?? []).map((a) => a.orgId));
        const by = new Map<string, Listing[]>();
        for (const l of data?.listings ?? []) by.set(l.seller.id, [...(by.get(l.seller.id) ?? []), l]);
        return [...by.values()].map((items) => ({ seller: items[0].seller, items, kind: storeKindOf(items), newest: Math.max(...items.map((i) => +new Date(i.createdAt))), sponsored: featured.has(items[0].seller.id) }));
    }, [data]);
    const places = useMemo(() => [...new Set(stores.map((s) => s.seller.location).filter((x): x is string => !!x))].sort(), [stores]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const out = stores.filter((s) => (kind === 'ALL' || s.kind === kind) && (place === 'ALL' || s.seller.location === place) && (!verified || s.seller.verified)
            && (!q || `${s.seller.name} ${s.items.map((i) => `${i.name} ${i.category ?? ''}`).join(' ')}`.toLowerCase().includes(q)));
        out.sort((a, b) => Number(b.sponsored) - Number(a.sponsored) || (sort === 'RATING' ? b.seller.rating.average - a.seller.rating.average || b.seller.rating.count - a.seller.rating.count : sort === 'NEWEST' ? b.newest - a.newest : b.items.length - a.items.length));
        return out;
    }, [stores, query, kind, place, verified, sort]);
    const count = (k: 'ALL' | ListingKind) => (k === 'ALL' ? stores.length : stores.filter((s) => s.kind === k).length);

    return (
        <PagePanel title="Marketplace" subtitle="Stores: browse the businesses selling here" tabs={<MarketplaceTabs active="stores" />}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 basis-full md:min-w-[240px] md:flex-1 md:basis-auto">
                    <Search size={18} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#5F6368]" />
                    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stores or what they sell" aria-label="Search stores" className="h-12 w-full rounded-full bg-[#F1F3F4] pl-12 pr-5 text-sm text-[#1F1F1F] placeholder:text-[#80868B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B57D0]" />
                </div>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort stores" className="h-12 min-w-0 flex-1 rounded-full md:flex-none bg-[#F1F3F4] px-4 text-sm text-[#3C4043] focus:outline-none focus:ring-2 focus:ring-[#0B57D0]">
                    <option value="ITEMS">Most items</option><option value="RATING">Top rated</option><option value="NEWEST">Newly listed</option>
                </select>
            </div>
            <div className="no-scrollbar -mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 mb-5">
                {(['ALL', 'FOOD', 'SERVICE', 'GOODS'] as const).map((k) => count(k) > 0 || k === 'ALL' ? (
                    <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={chip(kind === k)}>{k === 'ALL' ? 'All stores' : KIND_TEXT[k]} <span className="text-xs text-[#80868B]">{count(k)}</span></button>
                ) : null)}
                <button type="button" onClick={() => setVerified((v) => !v)} aria-pressed={verified} className={chip(verified)}><BadgeCheck size={15} /> Verified</button>
                {places.length > 1 && (
                    <select value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Location" className="h-10 flex-shrink-0 rounded-full border border-[#C4C7C5] bg-white px-3 text-sm focus:border-[#0B57D0] focus:outline-none">
                        <option value="ALL">Anywhere</option>{places.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                )}
            </div>

            {isPending ? (
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <li key={i} className="h-56 animate-pulse rounded-[22px] bg-[#F1F3F4]" />)}</ul>
            ) : shown.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                    <Store size={30} className="text-[#9AA0A6]" />
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">No stores match</p>
                    <p className="mt-1 text-sm text-[#5F6368]">Try another word or clear the filters.</p>
                    <PrimaryButton onClick={() => { setQuery(''); setKind('ALL'); setPlace('ALL'); setVerified(false); }} className="mt-4 h-11 px-6">Clear filters</PrimaryButton>
                </div>
            ) : (
                <>
                    <p className="mb-3 text-sm text-[#5F6368]">{shown.length} {shown.length === 1 ? 'store' : 'stores'}</p>
                    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {shown.map((s) => {
                            const pics = [...s.items.filter((i) => i.imageUrl), ...s.items.filter((i) => !i.imageUrl)].slice(0, 3);
                            return (
                                <li key={s.seller.id}>
                                    <button type="button" onClick={() => navigate(`/marketplace/store/${s.seller.id}`)} className="group block h-full w-full overflow-hidden rounded-[22px] border border-[rgba(116,119,117,0.28)] bg-white text-left transition hover:border-[#0B57D0]/50 hover:shadow-md">
                                        <span className="grid h-28 grid-cols-3 gap-0.5 bg-[#F1F3F4]">
                                            {pics.map((p) => <span key={p.id} className="overflow-hidden"><Thumb listing={p} width={200} sizes="140px" className="transition group-hover:scale-105" /></span>)}
                                        </span>
                                        <span className="block p-4">
                                            <span className="flex items-center gap-3">
                                                <SellerAvatar seller={s.seller} size={44} />
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex items-center gap-1.5 text-base font-bold text-[#1F1F1F]"><span className="truncate">{s.seller.name}</span>{s.seller.verified && <VerifiedBadge size={15} />}</span>
                                                    <span className="block text-xs text-[#5F6368]">{KIND_TEXT[s.kind]} · {s.items.length} {s.items.length === 1 ? 'item' : 'items'}</span>
                                                </span>
                                                {s.sponsored && <SponsoredTag />}
                                            </span>
                                            <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5F6368]">
                                                {s.seller.rating.count > 0 ? <span className="inline-flex items-center gap-1 font-semibold text-[#1F1F1F]"><Star size={12} className="fill-[#FBBC04] text-[#FBBC04]" />{s.seller.rating.average.toFixed(1)} <span className="font-normal text-[#80868B]">({s.seller.rating.count})</span></span> : <span className="text-[#80868B]">No reviews yet</span>}
                                                <LocationText location={s.seller.location} className="min-w-0" />
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </PagePanel>
    );
};

