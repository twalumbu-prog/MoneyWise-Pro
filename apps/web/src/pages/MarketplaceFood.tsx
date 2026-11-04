import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Truck, UtensilsCrossed } from 'lucide-react';
import { apiJson } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { PrimaryButton } from '../components/ui/Dialog';
import { LISTINGS_KEY, ListingCard, StoreCard } from '../components/marketplace/parts';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import { kindOf } from '../components/marketplace/kinds';
import { categorize, mainById } from '../components/marketplace/taxonomy';
import type { Listing, MarketplaceData } from '../components/marketplace/parts';
import { useSavedListings } from '../hooks/useSavedListings';

type Sort = 'BEST' | 'NEWEST' | 'PRICE_LOW' | 'PRICE_HIGH';
const chip = (on: boolean) => `inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-sm transition ${on ? 'bg-[#FFE7B8] font-bold text-[#4A2C00]' : 'font-medium text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`;

/**
 * Restaurants and catering, on their own. Food and drink aren't shopped for the way laptops or clothes are, so they have a tab of their
 * own: the places that cook or cater, then their dishes and drinks, which you order rather than buy.
 */
export const MarketplaceFood: React.FC = () => {
    const navigate = useNavigate();
    const { isSaved, toggle } = useSavedListings();
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('ALL');
    const [delivery, setDelivery] = useState(false);
    const [sort, setSort] = useState<Sort>('BEST');
    const { data, isPending } = useQuery({ queryKey: LISTINGS_KEY, queryFn: () => apiJson<MarketplaceData>('/marketplace/listings'), staleTime: 60_000 });

    const food = useMemo(() => (data?.listings ?? []).filter((l) => kindOf(l) === 'FOOD'), [data]);
    const boosted = useMemo(() => new Set((data?.ads?.boostedItems ?? []).map((a) => a.productId)), [data]);
    const groups = useMemo(() => (mainById('food')?.subs ?? []).map((s) => ({ id: s.id, name: s.name, items: food.filter((l) => categorize(l).sub === s.id) })).filter((g) => g.items.length > 0), [food]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const pool = group === 'ALL' ? food : groups.find((g) => g.id === group)?.items ?? [];
        const out = pool.filter((l) => (!delivery || l.requiresDelivery) && (!q || `${l.name} ${l.description ?? ''} ${l.category ?? ''} ${l.seller.name}`.toLowerCase().includes(q)));
        out.sort((a, b) => sort === 'PRICE_LOW' ? a.price - b.price : sort === 'PRICE_HIGH' ? b.price - a.price : sort === 'NEWEST' ? +new Date(b.createdAt) - +new Date(a.createdAt)
            : Number(boosted.has(b.id)) - Number(boosted.has(a.id)) || b.seller.rating.average - a.seller.rating.average || +new Date(b.createdAt) - +new Date(a.createdAt));
        return out;
    }, [food, groups, group, query, delivery, sort, boosted]);

    // The places behind what is shown, one card each.
    const places = useMemo(() => {
        const by = new Map<string, Listing[]>();
        for (const l of shown) by.set(l.seller.id, [...(by.get(l.seller.id) ?? []), l]);
        return [...by.values()].sort((a, b) => b[0].seller.rating.average - a[0].seller.rating.average || b.length - a.length);
    }, [shown]);

    return (
        <PagePanel title="Marketplace" subtitle="Food: restaurants, takeaway and catering" tabs={<MarketplaceTabs active="food" />}>
            <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[24px] bg-[#2B1A05] p-7 text-white">
                <div className="max-w-lg"><h2 className="text-2xl font-bold leading-tight md:text-3xl">Hungry? Order from MoneyWise restaurants</h2><p className="mt-1.5 text-sm text-white/80">Meals, drinks, bakes and catering for your event, from places near you. Pay from your wallet, no fees.</p></div>
                <div className="relative w-full md:w-80">
                    <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5F6368]" />
                    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search dishes or restaurants" aria-label="Search food" className="h-12 w-full rounded-full bg-white pl-11 pr-4 text-sm text-[#1F1F1F] placeholder:text-[#80868B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]" />
                </div>
            </section>

            <div className="no-scrollbar -mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 mb-6">
                <button type="button" onClick={() => setGroup('ALL')} aria-pressed={group === 'ALL'} className={chip(group === 'ALL')}>Everything <span className="text-xs text-[#80868B]">{food.length}</span></button>
                {groups.map((g) => <button key={g.id} type="button" onClick={() => setGroup(g.id)} aria-pressed={group === g.id} className={chip(group === g.id)}>{g.name} <span className="text-xs text-[#80868B]">{g.items.length}</span></button>)}
                <button type="button" onClick={() => setDelivery((v) => !v)} aria-pressed={delivery} className={chip(delivery)}><Truck size={15} /> Delivers</button>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="ml-auto h-10 flex-shrink-0 rounded-full border border-[#C4C7C5] bg-white px-3 text-sm focus:border-[#0B57D0] focus:outline-none">
                    <option value="BEST">Best match</option><option value="NEWEST">Newest first</option><option value="PRICE_LOW">Price: low to high</option><option value="PRICE_HIGH">Price: high to low</option>
                </select>
            </div>

            {isPending ? (
                <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <li key={i} className="aspect-square animate-pulse rounded-2xl bg-[#F1F3F4]" />)}</ul>
            ) : shown.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                    <UtensilsCrossed size={30} className="text-[#9AA0A6]" />
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">{food.length === 0 ? 'No restaurants yet' : 'Nothing matches'}</p>
                    <p className="mt-1 max-w-sm text-sm text-[#5F6368]">{food.length === 0 ? 'Run a restaurant or catering business? Add your menu in Products & Services and list it on the Marketplace.' : 'Try another word or a different kind of food.'}</p>
                    <PrimaryButton onClick={() => (food.length === 0 ? navigate('/products') : (setQuery(''), setGroup('ALL'), setDelivery(false)))} className="mt-4 h-11 px-6">{food.length === 0 ? 'Add your menu' : 'Clear filters'}</PrimaryButton>
                </div>
            ) : (
                <>
                    <section className="mb-10">
                        <h2 className="mb-3 text-xl font-bold text-[#1F1F1F]">Restaurants &amp; caterers <span className="text-sm font-normal text-[#80868B]">{places.length}</span></h2>
                        <ul className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3 xl:grid-cols-5">
                            {places.map((items) => <li key={items[0].seller.id}><StoreCard seller={items[0].seller} items={items} onOpen={() => navigate(`/marketplace/store/${items[0].seller.id}`)} /></li>)}
                        </ul>
                    </section>
                    <section>
                        <h2 className="mb-3 text-xl font-bold text-[#1F1F1F]">Dishes &amp; drinks <span className="text-sm font-normal text-[#80868B]">{shown.length}</span></h2>
                        <ul className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3 xl:grid-cols-5">
                            {shown.map((l, i) => <li key={l.id}><ListingCard listing={l} eager={i < 5} sponsored={boosted.has(l.id)} saved={isSaved(l.id)} onToggleSave={() => toggle(l.id)} onOpen={() => navigate(`/marketplace/${l.id}`)} /></li>)}
                        </ul>
                    </section>
                </>
            )}
        </PagePanel>
    );
};
