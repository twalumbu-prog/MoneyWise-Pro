import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { Car, ChevronLeft, ChevronRight, Globe, Link2, Package, Plane, Search, Smartphone, Store, X } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { TonalButton } from '../components/ui/Dialog';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import { daysText } from '../components/marketplace/importTypes';
import type { ImportBrowse, ImportCard } from '../components/marketplace/importTypes';
import { resized } from '../lib/images';

const chip = (on: boolean) => `inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-sm transition ${on ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`;

/** A product photo that falls back to a plain tile when the store's picture won't load, instead of a broken-image icon. */
const CardPhoto: React.FC<{ src?: string; alt: string }> = ({ src, alt }) => {
    const [failed, setFailed] = useState(false);
    if (!src || failed) return <div className="flex h-full w-full items-center justify-center text-[#9AA0A6]"><Package size={28} /></div>;
    return <img src={resized(src, 400, { square: true })} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover transition group-hover:scale-105" />;
};

const Card: React.FC<{ p: ImportCard; onOpen: () => void }> = ({ p, onOpen }) => (
    <button type="button" onClick={onOpen} className="group block w-full text-left">
        <div className="aspect-square overflow-hidden rounded-2xl bg-[#F1F3F4]">
            <CardPhoto src={p.images[0]} alt={p.title} />
        </div>
        <div className="flex flex-col px-0.5 pt-2.5">
            <p className="h-10 overflow-hidden text-sm leading-5 text-[#1F1F1F] line-clamp-2">{p.title}</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-[#1F1F1F]">{p.perItemZmw != null ? `${p.estimated ? '≈ ' : ''}${formatKwacha(p.perItemZmw)}` : ''}</p>
            <p className="text-[11px] text-[#5F6368]">{p.vehicleEstimate ? 'Preview price, confirmed before ordering' : p.estimated ? 'Estimate, confirmed when opened' : 'Shipping and duty included'}</p>
            {p.store && <p className="mt-1 text-[11px] font-medium text-[#0B57D0]">{p.store}</p>}
            <p className="mt-1 flex items-center gap-1.5 text-xs text-[#5F6368]"><Plane size={12} /> {p.origin ? `From ${p.origin} · ` : ''}{daysText(p.deliveryDaysMin, p.deliveryDaysMax)}</p>
        </div>
    </button>
);

type Slide = { eyebrow: string; title: string; text: string; cta: string; icon: React.ReactNode; bg: string; category?: string; store?: string };
const SLIDES: Slide[] = [
    { eyebrow: 'Cars from Japan', title: 'Right-hand-drive cars, landed in Lusaka', text: 'Used cars from BE FORWARD with the shipping, duty and clearing worked out for you.', cta: 'Browse cars', icon: <Car size={14} />, bg: 'from-[#0B57D0] to-[#041E49]', category: 'Cars' },
    { eyebrow: 'Brand stores', title: 'Apple, Samsung, Sony and more', text: 'Original products straight from the brand’s own store, paid in kwacha.', cta: 'Shop Apple', icon: <Store size={14} />, bg: 'from-[#1F1F1F] to-[#444746]', store: 'Apple' },
    { eyebrow: 'Phones and gadgets', title: 'The latest phones, tablets and watches', text: 'Galaxy, iPhone, Motorola, Garmin and the accessories to go with them.', cta: 'See phones', icon: <Smartphone size={14} />, bg: 'from-[#0E7C66] to-[#064E3B]', category: 'Phones' },
    { eyebrow: 'Order from overseas', title: 'Shop the world. Pay in kwacha.', text: 'We buy it from stores in the US, Japan and China, bring it to Lusaka and track it all the way. Shipping and import duty are in the price.', cta: 'Browse everything', icon: <Globe size={14} />, bg: 'from-[#6B3FA0] to-[#2E1A5C]' },
];

/** Things from overseas stores, priced in kwacha with shipping and duty included. MoneyWise buys them and tracks them to Lusaka. */
export const MarketplaceImported: React.FC = () => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('');
    const [store, setStore] = useState('');
    const [slide, setSlide] = useState(0);
    const [paused, setPaused] = useState(false);
    const [link, setLink] = useState('');
    const [linkBusy, setLinkBusy] = useState(false);
    const [linkError, setLinkError] = useState<string | null>(null);

    // The search goes to the server, which looks in the catalogue and, when there's little there, asks the store itself: so what people
    // search for is what gets added.
    const [term, setTerm] = useState('');
    useEffect(() => { const t = setTimeout(() => setTerm(query.trim()), 450); return () => clearTimeout(t); }, [query]);
    const { data, isPending, isError, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = useInfiniteQuery({
        queryKey: ['marketplace', 'imports', term, category, store],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => apiJson<ImportBrowse>(`/marketplace/imports?page=${pageParam}${term ? `&q=${encodeURIComponent(term)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}${store ? `&store=${encodeURIComponent(store)}` : ''}`),
        getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
        placeholderData: keepPreviousData, staleTime: 60_000,
    });
    const first = data?.pages[0];
    const shown = useMemo(() => data?.pages.flatMap((pg) => pg.products) ?? [], [data]);
    // The categories people come looking for lead the row, whatever their size; the rest follow by how much is in them.
    const PINNED = ['Cars', 'Phones', 'Laptops', 'Tablets', 'Computers', 'Watches', 'Audio'];
    const categories = useMemo(() => {
        const all = first?.categories ?? [];
        return [...all.filter((c) => PINNED.includes(c.name)).sort((a, b) => PINNED.indexOf(a.name) - PINNED.indexOf(b.name)), ...all.filter((c) => !PINNED.includes(c.name))];
    }, [first]); // eslint-disable-line react-hooks/exhaustive-deps
    const [knownCategories, setKnownCategories] = useState<{ name: string; count: number }[]>([]);
    useEffect(() => { if (categories.length) setKnownCategories(categories); }, [first]); // eslint-disable-line react-hooks/exhaustive-deps
    const searching = isFetching && !isFetchingNextPage && !!term;
    const [knownStores, setKnownStores] = useState<{ name: string; count: number }[]>([]);
    useEffect(() => { if (first?.stores?.length) setKnownStores(first.stores); }, [first]); // eslint-disable-line react-hooks/exhaustive-deps

    // Only the slides that have something behind them; the hero turns by itself unless the buyer is looking at it or prefers less motion.
    const slides = useMemo(() => SLIDES.filter((s) => (s.category ? knownCategories.some((c) => c.name === s.category) : s.store ? knownStores.some((c) => c.name === s.store) : true)), [knownCategories, knownStores]);
    const current = slides[slide % Math.max(1, slides.length)];
    useEffect(() => {
        if (paused || slides.length < 2 || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)) return;
        const t = setInterval(() => setSlide((n) => (n + 1) % slides.length), 6500);
        return () => clearInterval(t);
    }, [paused, slides.length]);
    const openSlide = (s: Slide) => { setQuery(''); setCategory(s.category ?? ''); setStore(s.store ?? ''); document.getElementById('imports-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

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
            {current && (
                <section className={`relative mb-4 overflow-hidden rounded-[24px] bg-gradient-to-br ${current.bg} p-5 text-white transition-colors md:p-7`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} aria-roledescription="carousel" aria-label="Featured">
                    <div key={current.title} className="min-h-[148px] md:min-h-[132px]">
                        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-80">{current.icon} {current.eyebrow}</p>
                        <h2 className="mt-1 max-w-2xl text-2xl font-bold leading-tight md:text-3xl">{current.title}</h2>
                        <p className="mt-1.5 max-w-xl text-sm opacity-90">{current.text}</p>
                        <button type="button" onClick={() => openSlide(current)} className="mt-4 h-11 rounded-full bg-white px-6 text-sm font-bold text-[#1F1F1F] hover:bg-white/90">{current.cta}</button>
                    </div>
                    {slides.length > 1 && (
                        <div className="mt-4 flex items-center gap-2">
                            <button type="button" aria-label="Previous" onClick={() => setSlide((n) => (n - 1 + slides.length) % slides.length)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"><ChevronLeft size={16} /></button>
                            {slides.map((s, i) => <button key={s.title} type="button" aria-label={`Show ${s.eyebrow}`} onClick={() => setSlide(i)} className={`h-2 rounded-full transition-all ${i === slide % slides.length ? 'w-6 bg-white' : 'w-2 bg-white/45'}`} />)}
                            <button type="button" aria-label="Next" onClick={() => setSlide((n) => (n + 1) % slides.length)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"><ChevronRight size={16} /></button>
                        </div>
                    )}
                </section>
            )}

            <div className="mb-6 flex flex-col gap-2 rounded-2xl bg-[#F8FAFD] p-3 sm:flex-row sm:items-center">
                <p className="flex flex-shrink-0 items-center gap-2 px-1 text-sm font-semibold text-[#1F1F1F]"><Link2 size={16} className="text-[#0B57D0]" /> Have a link?</p>
                <input value={link} onChange={(e) => { setLink(e.target.value); setLinkError(null); }} onKeyDown={(e) => e.key === 'Enter' && findLink()} placeholder="Paste a product link from Amazon, Apple, Samsung, BE FORWARD, eBay or CJ" aria-label="Paste a product link" className="h-11 w-full flex-1 rounded-full bg-white px-4 text-sm text-[#1F1F1F] shadow-[inset_0_0_0_1px_#C4C7C5] placeholder:text-[#80868B] focus:outline-none focus:ring-2 focus:ring-[#0B57D0]" />
                <button type="button" onClick={findLink} disabled={linkBusy || !link.trim()} className="h-11 rounded-full bg-[#0B57D0] px-6 text-sm font-bold text-white disabled:opacity-60">{linkBusy ? 'Looking…' : 'Price it'}</button>
            </div>
            {linkError && <p className="-mt-3 mb-5 rounded-xl bg-[#FCE8E6] px-3 py-2 text-sm text-[#B31412]">{linkError}</p>}

            {knownStores.length > 1 && !term && (
                <div className="mb-5">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#5F6368]"><Store size={13} /> Shop by store</p>
                    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                        {knownStores.map((s) => (
                            <button key={s.name} type="button" onClick={() => { setStore(store === s.name ? '' : s.name); setCategory(''); }} className={`flex h-14 flex-shrink-0 items-center gap-2.5 rounded-2xl px-4 text-left transition ${store === s.name ? 'bg-[#D3E3FD] shadow-[inset_0_0_0_2px_#0B57D0]' : 'bg-white shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}>
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#041E49] text-xs font-bold text-white">{s.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()}</span>
                                <span className="text-sm font-bold text-[#1F1F1F]">{s.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div id="imports-grid" />
            <div className="relative mb-4">
                <Search size={18} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#5F6368]" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search imported products" aria-label="Search imported products" className="h-12 w-full rounded-full bg-[#F1F3F4] pl-12 pr-5 text-sm text-[#1F1F1F] placeholder:text-[#80868B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B57D0]" />
            </div>
            {store && (
                <div className="mb-3 flex items-center gap-2 text-sm text-[#3C4043]">Showing <b>{store}</b> <button type="button" onClick={() => setStore('')} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]"><X size={12} /> All stores</button></div>
            )}
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
