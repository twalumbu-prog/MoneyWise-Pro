import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Clock, Phone, Scale, Search, ShoppingCart, Truck } from 'lucide-react';
import { apiJson, formatKwacha } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { TonalButton } from '../components/ui/Dialog';
import { MarketplaceTabs } from '../components/marketplace/MarketplaceTabs';
import type { CatalogBrowse, CompareResult, Offer } from '../components/marketplace/compareTypes';
import { ReportPriceDialog } from '../components/marketplace/ReportPriceDialog';
import { ageText, unitText } from '../components/marketplace/compareTypes';

const chip = (on: boolean) => `inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-sm transition ${on ? 'bg-[#D3E3FD] font-bold text-[#041E49]' : 'font-medium text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`;

/* ───────────── Pick a product ───────────── */

const Browser: React.FC = () => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [term, setTerm] = useState('');
    const [category, setCategory] = useState('');
    const [vertical, setVertical] = useState<'CONSTRUCTION' | 'GROCERY'>('CONSTRUCTION');
    useEffect(() => { const t = setTimeout(() => setTerm(query.trim()), 250); return () => clearTimeout(t); }, [query]);
    const { data, isPending, isError, refetch } = useQuery({
        queryKey: ['compare', 'catalog', term, category, vertical],
        queryFn: () => apiJson<CatalogBrowse>(`/marketplace/catalog?${new URLSearchParams({ vertical, ...(term ? { q: term } : {}), ...(category ? { category } : {}) }).toString()}`),
        staleTime: 60_000,
    });
    const [cats, setCats] = useState<{ name: string; count: number }[]>([]);
    useEffect(() => { if (data?.categories?.length) setCats(data.categories); }, [data]);
    const switchVertical = (v: 'CONSTRUCTION' | 'GROCERY') => { setVertical(v); setCategory(''); setCats([]); setQuery(''); };
    const items = data?.items ?? [];

    return (
        <>
            <section className="mb-5 rounded-[24px] bg-gradient-to-br from-[#0E7C66] to-[#064E3B] p-5 text-white md:p-7">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-80"><Scale size={14} /> Compare prices</p>
                <h2 className="mt-1 text-2xl font-bold leading-tight md:text-3xl">Find the cheapest place to buy</h2>
                <p className="mt-1.5 max-w-xl text-sm opacity-90">{vertical === 'GROCERY' ? 'Mealie meal, cooking oil, sugar, eggs and the rest of the shopping list.' : 'Cement, blocks, sand, steel, roofing and more.'} We show every seller and shop we know, cheapest first, with how recent each price is.</p>
            </section>
            <div className="mb-4 flex gap-2">
                {([['CONSTRUCTION', 'Building materials'], ['GROCERY', 'Groceries and household']] as const).map(([v, label]) => <button key={v} type="button" onClick={() => switchVertical(v)} className={`h-10 rounded-full px-5 text-sm ${vertical === v ? 'bg-[#0E7C66] font-bold text-white' : 'font-medium text-[#3C4043] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]'}`}>{label}</button>)}
            </div>
            <div className="relative mb-4">
                <Search size={18} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#5F6368]" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={vertical === 'GROCERY' ? 'Search a product, e.g. mealie meal, cooking oil, eggs' : 'Search a product, e.g. cement, river sand, Y12 steel'} aria-label="Search products" className="h-12 w-full rounded-full bg-[#F1F3F4] pl-12 pr-5 text-sm placeholder:text-[#80868B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B57D0]" />
            </div>
            {cats.length > 1 && (
                <div className="no-scrollbar -mx-1 mb-5 flex gap-2 overflow-x-auto px-1">
                    <button type="button" className={chip(!category)} onClick={() => setCategory('')}>All</button>
                    {cats.map((c) => <button key={c.name} type="button" className={chip(category === c.name)} onClick={() => setCategory(c.name)}>{c.name}</button>)}
                </div>
            )}
            {isError ? (
                <div className="py-14 text-center"><p className="text-sm text-[#5F6368]">Couldn’t load the catalogue.</p><TonalButton onClick={() => refetch()} className="mt-3">Try again</TonalButton></div>
            ) : isPending ? (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 9 }).map((_, i) => <li key={i} className="h-20 animate-pulse rounded-2xl bg-[#F1F3F4]" />)}</ul>
            ) : items.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                    <Scale size={30} className="text-[#9AA0A6]" />
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">{data?.needsMigration ? 'Price comparison is opening soon' : 'Nothing found'}</p>
                    <p className="mt-1 max-w-sm text-sm text-[#5F6368]">{data?.needsMigration ? 'We’re setting it up.' : 'Try another word, or pick a category.'}</p>
                </div>
            ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((i) => (
                        <li key={i.id}>
                            <button type="button" onClick={() => navigate(`/marketplace/compare/${i.slug}`)} className="flex h-full w-full items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left shadow-[inset_0_0_0_1px_#E0E0E0] transition hover:shadow-[inset_0_0_0_1px_#0B57D0]">
                                <span className="min-w-0"><span className="block truncate text-sm font-bold text-[#1F1F1F]">{i.name}</span><span className="block text-xs text-[#5F6368]">{i.category} · per {unitText(i)}</span></span>
                                <Scale size={18} className="flex-shrink-0 text-[#0B57D0]" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
};

/* ───────────── One product, every offer ───────────── */

const OfferCard: React.FC<{ o: Offer; unit: string; onBuy: (o: Offer) => void }> = ({ o, unit, onBuy }) => {
    const old = o.freshness === 'STALE';
    return (
        <li className={`rounded-2xl bg-white p-4 ${o.cheapest ? 'shadow-[inset_0_0_0_1px_#137333]' : 'shadow-[inset_0_0_0_1px_#E0E0E0]'} ${old || o.outOfStock ? 'opacity-70' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-base font-bold text-[#1F1F1F]">
                        {o.place}
                        {o.cheapest && <span className="rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-[11px] font-bold text-[#137333]">Cheapest</span>}
                        {o.trust === 'LISTED' && <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F0FE] px-2.5 py-0.5 text-[11px] font-bold text-[#1967D2]"><ShoppingCart size={11} /> Buy on MoneyWise</span>}
                        {o.trust === 'VERIFIED' && <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-[11px] font-bold text-[#137333]"><BadgeCheck size={11} /> {o.sourceType === 'SHOPPER_REPORT' ? `Confirmed by ${o.confirmations ?? 2} shoppers` : 'Checked by us'}</span>}
                        {o.trust === 'ENTERED' && o.sourceType === 'SHOPPER_REPORT' && <span className="rounded-full bg-[#F1F3F4] px-2.5 py-0.5 text-[11px] font-bold text-[#5F6368]">Reported by a shopper</span>}
                        {o.sourceType === 'RFQ_QUOTE' && <span className="rounded-full bg-[#F1F3F4] px-2.5 py-0.5 text-[11px] font-bold text-[#5F6368]">Quote</span>}
                    </p>
                    <p className="mt-0.5 text-sm text-[#5F6368]">{[o.town, o.province].filter(Boolean).join(', ') || 'Location not given'}{o.address ? ` · ${o.address}` : ''}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5F6368]">
                        <span className={`inline-flex items-center gap-1 ${old ? 'font-semibold text-[#B06000]' : ''}`}><Clock size={12} /> {ageText(o)}{old ? ' (too old to count)' : ''}</span>
                        {o.delivers && <span className="inline-flex items-center gap-1"><Truck size={12} /> Delivers{o.deliveryNote ? `: ${o.deliveryNote}` : ''}</span>}
                        {o.minQty && o.minQty > 1 && <span>Bulk price from {o.minQty} {unit}s</span>}
                        {o.ratingCount ? <span>★ {o.rating} ({o.ratingCount})</span> : null}
                        {o.seller && o.seller.orders > 0 && <span>{o.seller.orders} order{o.seller.orders === 1 ? '' : 's'}{o.seller.completedPct !== null ? ` · ${o.seller.completedPct}% completed` : ''}{o.seller.disputePct ? ` · ${o.seller.disputePct}% disputed` : ''}</span>}
                        {o.outOfStock && <span className="font-semibold text-[#B31412]">Out of stock</span>}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-xl font-bold tabular-nums text-[#1F1F1F]">{formatKwacha(o.price)}</p>
                    <p className="text-[11px] text-[#5F6368]">per {unit}</p>
                    {typeof o.vsTypical === 'number' && o.vsTypical !== 0 && <p className={`mt-0.5 text-xs font-semibold ${o.vsTypical > 0 ? 'text-[#137333]' : 'text-[#B31412]'}`}>{formatKwacha(Math.abs(o.vsTypical))} {o.vsTypical > 0 ? 'below' : 'above'} typical</p>}
                </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                {o.kind === 'LISTING' && o.productId && !o.outOfStock && <button type="button" onClick={() => onBuy(o)} className="h-10 rounded-full bg-[#0B57D0] px-5 text-sm font-bold text-white hover:bg-[#0842A0]">View and buy</button>}
                {o.phone && <a href={`tel:${o.phone.replace(/[^+\d]/g, '')}`} className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-[#F1F3F4]"><Phone size={14} /> Call {o.phone}</a>}
            </div>
        </li>
    );
};

const Compared: React.FC<{ slug: string }> = ({ slug }) => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [town, setTown] = useState('');
    const [reporting, setReporting] = useState(false);
    const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ['compare', 'offers', slug], queryFn: () => apiJson<CompareResult>(`/marketplace/compare/${encodeURIComponent(slug)}`), staleTime: 30_000, retry: false });
    const offers = useMemo(() => (data?.offers ?? []).filter((o) => !town || o.town === town), [data, town]);
    const business = useQuery({ queryKey: ['compare', 'business', slug], enabled: !!data?.item?.id, queryFn: () => apiJson<{ business: { businesses: number; median: number; low: number; high: number; days: number } | null }>(`/marketplace/compare/${data!.item.id}/business`), staleTime: 300_000, retry: false });

    if (isPending) return <div className="h-64 animate-pulse rounded-2xl bg-[#F1F3F4]" />;
    if (isError || !data) return <div className="py-14 text-center"><p className="text-sm text-[#5F6368]">{(error as any)?.message || 'Couldn’t load the prices.'}</p><TonalButton onClick={() => refetch()} className="mt-3">Try again</TonalButton></div>;
    const { item, stats } = data;
    const unit = item.unit;
    const stat = (label: string, v: number | null, tone = '') => <div className="rounded-2xl bg-[#F8FAFD] p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-[#5F6368]">{label}</p><p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{v != null ? formatKwacha(v) : '—'}</p></div>;

    return (
        <>
            <button type="button" onClick={() => navigate('/marketplace/compare')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B57D0]"><ArrowLeft size={16} /> All products</button>
            <h2 className="text-2xl font-bold text-[#1F1F1F]">{item.name}</h2>
            <p className="mt-0.5 text-sm text-[#5F6368]">{item.category} · every price is for one {unitText(item)}</p>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {stat('Lowest', stats.lowest, 'text-[#137333]')}
                {stat('Typical', stats.typical)}
                {stat('Highest', stats.highest)}
                <div className="rounded-2xl bg-[#F8FAFD] p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-[#5F6368]">Prices</p><p className="mt-1 text-xl font-bold tabular-nums">{stats.offers}</p></div>
            </div>
            {stats.spread != null && stats.spread > 0 && stats.lowest != null && <p className="mt-3 rounded-2xl bg-[#E6F4EA] px-4 py-3 text-sm text-[#137333]">Buying at the cheapest place instead of the dearest saves <b>{formatKwacha(stats.spread)}</b> per {unit}. On 100 {unit}s that is <b>{formatKwacha(stats.spread * 100)}</b>.</p>}
            {business.data?.business && (
                <p className="mt-3 rounded-2xl bg-[#E8F0FE] px-4 py-3 text-sm text-[#1967D2]">Businesses on MoneyWise paid about <b>{formatKwacha(business.data.business.median)}</b> per {unit} (most paid between {formatKwacha(business.data.business.low)} and {formatKwacha(business.data.business.high)}). From {business.data.business.businesses} businesses over the last {business.data.business.days} days, anonymous.</p>
            )}
            {data.note && <p className="mt-3 rounded-2xl bg-[#FEF7E0] px-4 py-3 text-sm text-[#7A4B00]">{data.note}</p>}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F8FAFD] p-4">
                <p className="text-sm text-[#3C4043]">Buying a lot, or want it delivered? Ask suppliers for a quote.</p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => navigate('/marketplace/plan')} className="h-10 rounded-full px-5 text-sm font-bold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-white">Plan a whole job</button>
                    <button type="button" onClick={() => setReporting(true)} className="h-10 rounded-full px-5 text-sm font-bold text-[#0B57D0] shadow-[inset_0_0_0_1px_#C4C7C5] hover:bg-white">Report a price you saw</button>
                    <button type="button" onClick={() => navigate(`/marketplace/requests?new=${item.slug}`)} className="h-10 rounded-full bg-[#0B57D0] px-5 text-sm font-bold text-white hover:bg-[#0842A0]">Ask for quotes</button>
                </div>
            </div>
            {reporting && <ReportPriceDialog item={item} onClose={() => setReporting(false)} onDone={() => qc.invalidateQueries({ queryKey: ['compare'] })} />}

            {data.towns.length > 1 && (
                <div className="mt-4 flex items-center gap-2 text-sm">
                    <label htmlFor="town" className="font-semibold text-[#3C4043]">Show</label>
                    <select id="town" value={town} onChange={(e) => setTown(e.target.value)} className="h-10 rounded-full border border-[#C4C7C5] bg-white px-4 text-sm">
                        <option value="">All towns</option>
                        {data.towns.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
            )}

            {offers.length === 0 ? (
                <div className="mt-8 text-center text-sm text-[#5F6368]">No prices {town ? `in ${town} ` : ''}yet. Check back soon, or ask suppliers for a quote.</div>
            ) : (
                <ul className="mt-4 space-y-3">{offers.map((o) => <OfferCard key={`${o.kind}-${o.id}`} o={o} unit={unit} onBuy={(x) => navigate(`/marketplace/${x.productId}`)} />)}</ul>
            )}
            <p className="mt-6 text-xs leading-5 text-[#80868B]">Prices marked “Buy on MoneyWise” are live and can be paid for with buyer protection. Other prices were collected from the place and can change: confirm with them before you travel or pay. Prices older than 90 days are shown but don’t count toward the cheapest or typical price.</p>
        </>
    );
};

/** Compare prices: the same product across every place we know, cheapest first. */
export const MarketplaceCompare: React.FC = () => {
    const { slug } = useParams();
    return (
        <PagePanel title="Marketplace" subtitle="Compare prices and find the best place to buy" tabs={<MarketplaceTabs active="compare" />}>
            {slug ? <Compared slug={slug} /> : <Browser />}
        </PagePanel>
    );
};
