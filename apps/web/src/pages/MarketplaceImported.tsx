import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { Globe, Link2, Package, Plane, Search } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { TonalButton } from '../components/ui/Dialog';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import { daysText } from '../components/marketplace/importTypes';
import type { ImportBrowse, ImportCard } from '../components/marketplace/importTypes';
import { resized } from '../lib/images';

const chip = (on: boolean) => `inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-sm transition ${on ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`;

const Card: React.FC<{ p: ImportCard; onOpen: () => void }> = ({ p, onOpen }) => (
    <button type="button" onClick={onOpen} className="group block w-full text-left">
        <div className="aspect-square overflow-hidden rounded-2xl bg-[#F1F3F4]">
            {p.images[0] && <img src={resized(p.images[0], 400, { square: true })} alt={p.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />}
        </div>
        <div className="flex flex-col px-0.5 pt-2.5">
            <p className="h-10 overflow-hidden text-sm leading-5 text-[#1F1F1F] line-clamp-2">{p.title}</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-[#1F1F1F]">{p.perItemZmw != null ? `${p.estimated ? '≈ ' : ''}${formatKwacha(p.perItemZmw)}` : ''}</p>
            <p className="text-[11px] text-[#5F6368]">{p.estimated ? 'Estimate, confirmed when opened' : 'Shipping and duty included'}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-[#5F6368]"><Plane size={12} /> {p.origin ? `From ${p.origin} · ` : ''}{daysText(p.deliveryDaysMin, p.deliveryDaysMax)}</p>
        </div>
    </button>
);

/** Things from overseas stores, priced in kwacha with shipping and duty included. MoneyWise buys them and tracks them to Lusaka. */
export const MarketplaceImported: React.FC = () => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('');
    const [link, setLink] = useState('');
    const [linkBusy, setLinkBusy] = useState(false);
    const [linkError, setLinkError] = useState<string | null>(null);

    // The search goes to the server, which looks in the catalogue and, when there's little there, asks the store itself: so what people
    // search for is what gets added.
    const [term, setTerm] = useState('');
    useEffect(() => { const t = setTimeout(() => setTerm(query.trim()), 450); return () => clearTimeout(t); }, [query]);
    const { data, isPending, isError, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = useInfiniteQuery({
        queryKey: ['marketplace', 'imports', term, category],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => apiJson<ImportBrowse>(`/marketplace/imports?page=${pageParam}${term ? `&q=${encodeURIComponent(term)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}`),
        getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
        placeholderData: keepPreviousData, staleTime: 60_000,
    });
    const first = data?.pages[0];
    const shown = useMemo(() => data?.pages.flatMap((pg) => pg.products) ?? [], [data]);
    const categories = first?.categories ?? [];
    const [knownCategories, setKnownCategories] = useState<{ name: string; count: number }[]>([]);
    useEffect(() => { if (categories.length) setKnownCategories(categories); }, [first]); // eslint-disable-line react-hooks/exhaustive-deps
    const searching = isFetching && !isFetchingNextPage && !!term;

    const findLink = async () => {
        if (!link.trim()) return;
        setLinkBusy(true); setLinkError(null);
        try { const r = await apiJson<{ id: string }>('/marketplace/imports/from-link', { method: 'POST', body: JSON.stringify({ url: link.trim() }) }); navigate(`/marketplace/imported/${r.id}`); }
        catch (e: any) { setLinkError(e?.message || 'We couldn’t read that link.'); }
        finally { setLinkBusy(false); }
    };

    return (
        <PagePanel
            title="Marketplace"
            subtitle="Imported: order from overseas stores, paid in kwacha"
            tabs={<MarketplaceTabs active="imported" />}
            actions={<TonalButton onClick={() => navigate('/marketplace/imported/orders')}><Package size={14} /> Import orders</TonalButton>}
        >
            <section className="mb-6 rounded-[24px] bg-[#0B57D0] p-5 text-white md:p-7">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-80"><Globe size={14} /> Order from overseas</p>
                <h2 className="mt-1 text-2xl font-bold leading-tight md:text-3xl">Shop the world. Pay in kwacha.</h2>
                <p className="mt-1.5 max-w-xl text-sm opacity-90">We buy it for you from stores in the US, China and South Africa, bring it to Lusaka and track it all the way. Shipping and import duty are in the price.</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                        <Link2 size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5F6368]" />
                        <input value={link} onChange={(e) => { setLink(e.target.value); setLinkError(null); }} onKeyDown={(e) => e.key === 'Enter' && findLink()} placeholder="Paste a link to an eBay or CJ item" aria-label="Paste a product link" className="h-12 w-full rounded-full bg-white pl-11 pr-4 text-sm text-[#1F1F1F] placeholder:text-[#80868B] focus:outline-none focus:ring-2 focus:ring-white/60" />
                    </div>
                    <button type="button" onClick={findLink} disabled={linkBusy || !link.trim()} className="h-12 rounded-full bg-white px-6 text-sm font-bold text-[#0B57D0] disabled:opacity-60">{linkBusy ? 'Looking…' : 'Price it'}</button>
                </div>
                {linkError && <p className="mt-2 rounded-xl bg-white/15 px-3 py-2 text-sm">{linkError}</p>}
            </section>

            <div className="relative mb-4">
                <Search size={18} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#5F6368]" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search imported products" aria-label="Search imported products" className="h-12 w-full rounded-full bg-[#F1F3F4] pl-12 pr-5 text-sm text-[#1F1F1F] placeholder:text-[#80868B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B57D0]" />
            </div>
            {knownCategories.length > 1 && !term && (
                <div className="no-scrollbar -mx-1 mb-5 flex gap-2 overflow-x-auto px-1">
                    <button type="button" className={chip(!category)} onClick={() => setCategory('')}>All</button>
                    {knownCategories.map((c) => <button key={c.name} type="button" className={chip(category === c.name)} onClick={() => setCategory(c.name)}>{c.name} <span className="text-xs text-[#80868B]">{c.count}</span></button>)}
                </div>
            )}

            {isError ? (
                <div className="py-14 text-center"><p className="text-sm text-[#5F6368]">Couldn’t load imported products.</p><TonalButton onClick={() => refetch()} className="mt-3">Try again</TonalButton></div>
            ) : isPending ? (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <li key={i} className="aspect-square animate-pulse rounded-2xl bg-[#F1F3F4]" />)}</ul>
            ) : shown.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                    <Globe size={30} className="text-[#9AA0A6]" />
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">{first?.needsMigration ? 'Imported products are opening soon' : searching ? 'Looking for more…' : term ? 'Nothing found for that' : 'Nothing here yet'}</p>
                    <p className="mt-1 max-w-sm text-sm text-[#5F6368]">{term ? 'Try another word, or paste a link to the item above.' : 'We’re stocking this section. In the meantime, paste a link above to price an item.'}</p>
                </div>
            ) : (
                <>
                    {searching && <p className="mb-3 text-sm text-[#5F6368]">Looking for more matches…</p>}
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3 xl:grid-cols-5">{shown.map((p) => <li key={p.id}><Card p={p} onOpen={() => navigate(`/marketplace/imported/${p.id}`)} /></li>)}</ul>
                    {hasNextPage && <div className="mt-8 flex justify-center"><TonalButton onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="h-11 px-8">{isFetchingNextPage ? 'Loading…' : `Show more${first?.total ? ` (${first.total.toLocaleString()} items)` : ''}`}</TonalButton></div>}
                </>
            )}
        </PagePanel>
    );
};
