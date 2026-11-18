import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, Search } from 'lucide-react';
import { apiJson } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { PrimaryButton } from '../components/ui/Dialog';
import { LISTINGS_KEY, ListingCard, SellerAvatar, VerifiedBadge } from '../components/marketplace/parts';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import { kindOf } from '../components/marketplace/kinds';
import { categorize, mainById } from '../components/marketplace/taxonomy';
import type { Listing, MarketplaceData } from '../components/marketplace/parts';
import { useSavedListings } from '../hooks/useSavedListings';

type Sort = 'BEST' | 'NEWEST' | 'PRICE_LOW' | 'PRICE_HIGH';
const chip = (on: boolean) => `inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-sm transition ${on ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`;

/** A service listing: a service type, anything filed under Business & Services, or a consultancy-style offer. */
const isService = (l: Listing) => kindOf(l) === 'SERVICE' || categorize(l).main === 'services';

/**
 * The Marketplace's services section: consultancy, health and care, training, repairs and trades, event services and the like. Services
 * aren't things in a box, so they get their own place: pick the kind of service, see who offers it and what it costs, then book or enquire.
 */
export const MarketplaceServices: React.FC = () => {
    const navigate = useNavigate();
    const { isSaved, toggle } = useSavedListings();
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('ALL');
    const [sort, setSort] = useState<Sort>('BEST');
    const { data, isPending } = useQuery({ queryKey: LISTINGS_KEY, queryFn: () => apiJson<MarketplaceData>('/marketplace/listings'), staleTime: 60_000 });

    const services = useMemo(() => (data?.listings ?? []).filter(isService), [data]);
    const boosted = useMemo(() => new Set((data?.ads?.boostedItems ?? []).map((a) => a.productId)), [data]);

    // The groups on offer: the sub-categories of Business & Services that have something, then everything else that is a service.
    const groups = useMemo(() => {
        const main = mainById('services')!;
        const bySub = (id: string) => services.filter((l) => categorize(l).main === 'services' && categorize(l).sub === id);
        const out = main.subs.map((s) => ({ id: s.id, name: s.name, items: bySub(s.id) })).filter((g) => g.items.length > 0);
        const used = new Set(out.flatMap((g) => g.items.map((i) => i.id)));
        const rest = services.filter((l) => !used.has(l.id));
        return rest.length ? [...out, { id: 'more', name: 'Other services', items: rest }] : out;
    }, [services]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const pool = group === 'ALL' ? services : groups.find((g) => g.id === group)?.items ?? [];
        const out = pool.filter((l) => !q || `${l.name} ${l.description ?? ''} ${l.category ?? ''} ${l.seller.name}`.toLowerCase().includes(q));
        out.sort((a, b) => sort === 'PRICE_LOW' ? a.price - b.price : sort === 'PRICE_HIGH' ? b.price - a.price : sort === 'NEWEST' ? +new Date(b.createdAt) - +new Date(a.createdAt)
            : Number(boosted.has(b.id)) - Number(boosted.has(a.id)) || b.seller.rating.average - a.seller.rating.average || +new Date(b.createdAt) - +new Date(a.createdAt));
        return out;
    }, [services, groups, group, query, sort, boosted]);

    // Who offers services (a quick row of providers).
    const providers = useMemo(() => {
        const seen = new Map<string, { seller: Listing['seller']; n: number }>();
        for (const l of services) { const cur = seen.get(l.seller.id); seen.set(l.seller.id, { seller: l.seller, n: (cur?.n ?? 0) + 1 }); }
        return [...seen.values()].sort((a, b) => b.n - a.n).slice(0, 8);
    }, [services]);

    return (
        <PagePanel title="Marketplace" subtitle="Services: consultancy, care, training, repairs and more" tabs={<MarketplaceTabs active="services" />}>
            <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[24px] bg-[#16181D] p-7 text-white">
                <div className="max-w-lg"><h2 className="text-2xl font-bold leading-tight md:text-3xl">Hire the right person for the job</h2><p className="mt-1.5 text-sm text-white/80">Compare services from MoneyWise businesses, see the price up front, then book or send an enquiry.</p></div>
                <div className="relative w-full md:w-80">
                    <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5F6368]" />
                    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search services" aria-label="Search services" className="h-12 w-full rounded-full bg-white pl-11 pr-4 text-sm text-[#1F1F1F] placeholder:text-[#80868B] focus:outline-none focus:ring-2 focus:ring-[#0B57D0]" />
                </div>
            </section>

            {providers.length > 0 && (
                <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="Providers">
                    {providers.map((p) => (
                        <button key={p.seller.id} type="button" onClick={() => navigate(`/marketplace/store/${p.seller.id}`)} className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border border-[rgba(116,119,117,0.28)] bg-white py-1.5 pl-1.5 pr-4 text-sm hover:border-[#0B57D0]/50 hover:shadow-sm">
                            <SellerAvatar seller={p.seller} size={30} /><span className="font-semibold text-[#1F1F1F]">{p.seller.name}</span>{p.seller.verified && <VerifiedBadge size={13} />}<span className="text-xs text-[#80868B]">{p.n}</span>
                        </button>
                    ))}
                </div>
            )}

            <div className="no-scrollbar -mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 mb-5">
                <button type="button" onClick={() => setGroup('ALL')} aria-pressed={group === 'ALL'} className={chip(group === 'ALL')}>All services <span className="text-xs text-[#80868B]">{services.length}</span></button>
                {groups.map((g) => <button key={g.id} type="button" onClick={() => setGroup(g.id)} aria-pressed={group === g.id} className={chip(group === g.id)}>{g.name} <span className="text-xs text-[#80868B]">{g.items.length}</span></button>)}
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="ml-auto h-10 flex-shrink-0 rounded-full border border-[#C4C7C5] bg-white px-3 text-sm focus:border-[#0B57D0] focus:outline-none">
                    <option value="BEST">Best match</option><option value="NEWEST">Newest first</option><option value="PRICE_LOW">Price: low to high</option><option value="PRICE_HIGH">Price: high to low</option>
                </select>
            </div>

            {isPending ? (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <li key={i} className="h-60 animate-pulse rounded-[22px] bg-[#F1F3F4]" />)}</ul>
            ) : shown.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                    <Briefcase size={30} className="text-[#9AA0A6]" />
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">{services.length === 0 ? 'No services listed yet' : 'No services match'}</p>
                    <p className="mt-1 max-w-sm text-sm text-[#5F6368]">{services.length === 0 ? 'Offer yours: add a service in Products & Services and list it on the Marketplace.' : 'Try another word or a different kind of service.'}</p>
                    <PrimaryButton onClick={() => (services.length === 0 ? navigate('/products') : (setQuery(''), setGroup('ALL')))} className="mt-4 h-11 px-6">{services.length === 0 ? 'Offer a service' : 'Clear filters'}</PrimaryButton>
                </div>
            ) : (
                <>
                    <p className="mb-3 text-sm text-[#5F6368]">{shown.length} {shown.length === 1 ? 'service' : 'services'}</p>
                    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {shown.map((l) => <li key={l.id}><ListingCard listing={l} sponsored={boosted.has(l.id)} saved={isSaved(l.id)} onToggleSave={() => toggle(l.id)} onOpen={() => navigate(`/marketplace/${l.id}`)} /></li>)}
                    </ul>
                </>
            )}
        </PagePanel>
    );
};
