import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Gavel, Globe, Heart, Mail, MessageCircle, Palette, Phone, Search, Star, Store } from 'lucide-react';
import { apiJson } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { PrimaryButton } from '../components/ui/Dialog';
import { LISTINGS_KEY, LocationText, SellerAvatar, Stars, Thumb, VerifiedBadge, priceText } from '../components/marketplace/parts';
import { SellerReviews } from '../components/marketplace/SellerReviews';
import { StoreThemeDialog } from '../components/marketplace/StoreThemeDialog';
import { DEFAULT_THEME, cleanTheme, headingClass, themeVars } from '../components/marketplace/storeTheme';
import { buildFeed } from '../components/marketplace/feed';
import { actionOf, storeKindOf } from '../components/marketplace/kinds';
import type { Listing, MarketplaceData } from '../components/marketplace/parts';
import type { StoreTheme } from '../components/marketplace/storeTheme';
import { useSavedListings, useSavedSellers } from '../hooks/useSavedListings';

type Sort = 'NEWEST' | 'PRICE_LOW' | 'PRICE_HIGH';
interface StoreContact { phone: string | null; altPhone: string | null; email: string | null; website: string | null; whatsapp: string | null; hours: string | null }

/**
 * A seller's store. Every store has the same parts in the same order (banner, search and categories, items, reviews) so people always know
 * where things are; the seller's colour, mode, type style, corners, banner and item layout make each one look like theirs.
 */
export const MarketplaceStore: React.FC = () => {
    const { orgId = '' } = useParams();
    const navigate = useNavigate();
    const { isSaved, toggle } = useSavedListings();
    const { isFollowing, toggle: toggleFollow } = useSavedSellers();
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('ALL');
    const [sort, setSort] = useState<Sort>('NEWEST');
    const [editing, setEditing] = useState(false);

    const { data, isPending } = useQuery({ queryKey: LISTINGS_KEY, queryFn: () => apiJson<MarketplaceData>('/marketplace/listings'), staleTime: 60_000 });
    const { data: styled } = useQuery({
        queryKey: ['marketplace', 'store', orgId],
        queryFn: () => apiJson<{ theme: StoreTheme; isSet: boolean; contact: StoreContact | null }>(`/marketplace/stores/${orgId}`),
        staleTime: 60_000,
    });

    const items = useMemo(() => (data?.listings ?? []).filter((l) => l.seller.id === orgId), [data, orgId]);
    const seller = items[0]?.seller;
    const mine = !!items[0]?.isMine;
    // Until a seller picks a layout, menu-like stores (food, drinks, rooms) open as a menu and everything else as a grid.
    const theme: StoreTheme = useMemo(() => {
        const t = cleanTheme(styled?.theme ?? DEFAULT_THEME);
        if (styled?.isSet || items.length === 0) return t;
        // Until the seller picks a layout: a restaurant opens as a menu, a consultancy as service cards, a shop as a grid.
        const kind = storeKindOf(items);
        const layout = kind === 'FOOD' ? 'menu' : kind === 'SERVICE' ? 'services' : items.length > 1 && buildFeed(items).every((e) => e.kind === 'store') ? 'menu' : t.layout;
        return { ...t, layout };
    }, [styled, items]);

    const categories = useMemo(() => [...new Set(items.map((l) => l.category).filter((c): c is string => !!c))], [items]);
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        // Open auctions have their own section above, so they aren't listed twice.
        const out = items.filter((l) => !(l.auction?.status === 'OPEN' && !q && category === 'ALL') && (category === 'ALL' || l.category === category) && (!q || `${l.name} ${l.description ?? ''} ${l.category ?? ''}`.toLowerCase().includes(q)));
        return out.sort((a, b) => sort === 'PRICE_LOW' ? a.price - b.price : sort === 'PRICE_HIGH' ? b.price - a.price : +new Date(b.createdAt) - +new Date(a.createdAt));
    }, [items, query, category, sort]);

    // Cover photos: the first is the main one; with several they change every few seconds.
    const covers = theme.covers.length ? theme.covers : theme.bannerUrl ? [theme.bannerUrl] : [];
    const [cover, setCover] = useState(0);
    useEffect(() => {
        if (covers.length < 2) return;
        const t = setInterval(() => setCover((c) => (c + 1) % covers.length), 5000);
        return () => clearInterval(t);
    }, [covers.length]);

    const contact = styled?.contact ?? null;
    const hasContact = !!contact && !!(contact.phone || contact.altPhone || contact.email || contact.website || contact.whatsapp || contact.hours);
    const auctions = useMemo(() => items.filter((l) => l.auction?.status === 'OPEN'), [items]);

    const head = headingClass(theme.font);
    const open = (l: Listing) => navigate(`/marketplace/${l.id}`);
    const order = (l: Listing) => navigate(l.inAppCheckout ? `/marketplace/checkout/${l.id}` : `/marketplace/${l.id}`);
    const accentBtn = { background: 'var(--s-accent)', color: 'var(--s-accent-ink)' } as const;

    const heart = (l: Listing) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); toggle(l.id); }} aria-pressed={isSaved(l.id)} aria-label={isSaved(l.id) ? 'Remove from watchlist' : 'Add to watchlist'}
            className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm transition hover:scale-110">
            <Heart size={17} className={isSaved(l.id) ? 'fill-[#EA4335] text-[#EA4335]' : 'text-[#5F6368]'} />
        </button>
    );

    const card = (l: Listing, i: number, big = false) => (
        <div key={l.id} className={`group relative ${big ? 'sm:col-span-2 sm:row-span-2' : ''}`}>
            <button type="button" onClick={() => open(l)} className="block w-full text-left">
                <div className={`relative overflow-hidden bg-[var(--s-surface)] rounded-[var(--s-card)] ${big ? 'aspect-square sm:aspect-auto sm:h-[calc(100%-4.5rem)] sm:min-h-[320px]' : 'aspect-square'}`}>
                    <Thumb listing={l} eager={i < 4} width={big ? 640 : 400} className="group-hover:scale-105 transition" />
                </div>
                <div className="px-0.5 pt-2.5">
                    <p className={`${big ? 'text-xl' : 'text-base'} font-bold tabular-nums`} style={{ color: 'var(--s-accent-text)' }}>{priceText(l)}</p>
                    <p className="line-clamp-2 text-sm leading-snug">{l.name}</p>
                </div>
            </button>
            {heart(l)}
        </div>
    );

    // A service: what it is, what it involves and what it costs, with a clear way in. No picture needed.
    const serviceCard = (l: Listing) => (
        <div key={l.id} className="relative flex flex-col border border-[var(--s-line)] bg-[var(--s-surface)] p-5 rounded-[var(--s-card)]">
            <button type="button" onClick={() => open(l)} className="flex flex-1 flex-col text-left">
                {l.category && <span className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--s-accent-text)' }}>{l.category}</span>}
                <span className="text-lg font-bold leading-snug">{l.name}</span>
                <span className="mt-1.5 line-clamp-4 flex-1 text-sm leading-relaxed" style={{ color: 'var(--s-muted)' }}>{l.description || 'Get in touch to find out how this works.'}</span>
            </button>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--s-line)] pt-3">
                <span><span className="block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--s-muted)' }}>From</span><span className="text-lg font-bold tabular-nums">{priceText(l)}</span></span>
                <button type="button" onClick={() => order(l)} className="h-10 px-6 text-sm font-bold rounded-[var(--s-control)]" style={accentBtn}>{actionOf(l).short}</button>
            </div>
        </div>
    );

    const row = (l: Listing, i: number) => (
        <li key={l.id} className="flex items-center gap-3 border-b border-[var(--s-line)] py-3 last:border-b-0">
            <button type="button" onClick={() => open(l)} className="h-[72px] w-[72px] flex-shrink-0 overflow-hidden bg-[var(--s-surface)] rounded-[var(--s-control)]"><Thumb listing={l} eager={i < 8} width={160} sizes="72px" /></button>
            <button type="button" onClick={() => open(l)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-base font-bold">{l.name}</p>
                {l.description && <p className="line-clamp-1 text-xs" style={{ color: 'var(--s-muted)' }}>{l.description}</p>}
                <p className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: 'var(--s-accent-text)' }}>{priceText(l)}</p>
            </button>
            <button type="button" onClick={() => toggle(l.id)} aria-pressed={isSaved(l.id)} aria-label={isSaved(l.id) ? 'Remove from watchlist' : 'Add to watchlist'} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--s-surface)]">
                <Heart size={17} className={isSaved(l.id) ? 'fill-[#EA4335] text-[#EA4335]' : ''} style={isSaved(l.id) ? undefined : { color: 'var(--s-muted)' }} />
            </button>
            <button type="button" onClick={() => order(l)} className="h-9 flex-shrink-0 px-5 text-sm font-bold rounded-[var(--s-control)]" style={accentBtn}>{actionOf(l).short}</button>
        </li>
    );

    return (
        <PagePanel title={seller?.name ?? 'Store'} back="/marketplace">
            {isPending ? (
                <div className="h-40 animate-pulse rounded-2xl bg-[#F1F3F4]" />
            ) : !seller ? (
                <div className="flex flex-col items-center py-20 text-center">
                    <Store size={30} className="text-[#9AA0A6]" />
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">This store has nothing listed</p>
                    <PrimaryButton onClick={() => navigate('/marketplace')} className="mt-5 h-11 px-6">Back to the Marketplace</PrimaryButton>
                </div>
            ) : (
                <>
                    <div style={themeVars(theme)} className="overflow-hidden border border-[var(--s-line)] rounded-[var(--s-card)]">
                        {/* 1. Banner */}
                        <section className="relative" style={{ background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent}88)` }}>
                            {covers.map((src, i) => (
                                <img key={src} src={src} alt="" loading={i === 0 ? 'eager' : 'lazy'} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${i === cover % covers.length ? 'opacity-100' : 'opacity-0'}`} />
                            ))}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
                            {covers.length > 1 && (
                                <div className="absolute right-4 top-4 flex gap-1.5">{covers.map((_, i) => <button key={i} type="button" aria-label={`Cover ${i + 1}`} onClick={() => setCover(i)} className={`h-1.5 rounded-full transition-all ${i === cover % covers.length ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`} />)}</div>
                            )}
                            <div className="relative flex min-h-[220px] flex-col justify-end gap-4 p-5 md:min-h-[260px] md:flex-row md:items-end md:justify-between md:p-8">
                                <div className="flex min-w-0 items-end gap-4">
                                    <span className="rounded-full bg-white p-1 shadow-lg"><SellerAvatar seller={seller} size={72} /></span>
                                    <div className="min-w-0 text-white">
                                        <h2 className={`flex items-center gap-2 text-2xl md:text-3xl ${head}`}><span className="truncate">{seller.name}</span>{seller.verified && <VerifiedBadge size={20} />}</h2>
                                        {theme.tagline && <p className="mt-0.5 text-sm text-white/85 md:text-base">{theme.tagline}</p>}
                                        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-white/80">
                                            {seller.rating.count > 0 && <span className="inline-flex items-center gap-1 font-semibold text-white"><Stars value={seller.rating.average} size={12} /> {seller.rating.average.toFixed(1)} ({seller.rating.count})</span>}
                                            <LocationText location={seller.location} />
                                            <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-shrink-0 gap-2">
                                    {mine && <button type="button" onClick={() => setEditing(true)} className="inline-flex h-11 items-center gap-2 bg-white/95 px-5 text-sm font-bold text-[#1F1F1F] hover:bg-white rounded-[var(--s-control)]"><Palette size={15} /> Customise store</button>}
                                    <button type="button" onClick={() => toggleFollow(seller.id)} aria-pressed={isFollowing(seller.id)} className="inline-flex h-11 items-center gap-2 px-5 text-sm font-bold rounded-[var(--s-control)]" style={accentBtn}>
                                        <Star size={15} className={isFollowing(seller.id) ? 'fill-current' : ''} /> {isFollowing(seller.id) ? 'Saved' : 'Save store'}
                                    </button>
                                </div>
                            </div>
                        </section>

                        {hasContact && contact && (
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--s-line)] px-4 py-3 text-sm md:px-8" aria-label="Contact">
                                {contact.phone && <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 font-semibold hover:underline" style={{ color: 'var(--s-accent-text)' }}><Phone size={14} /> {contact.phone}</a>}
                                {contact.altPhone && <a href={`tel:${contact.altPhone}`} className="inline-flex items-center gap-1.5 font-semibold hover:underline" style={{ color: 'var(--s-accent-text)' }}><Phone size={14} /> {contact.altPhone}</a>}
                                {contact.whatsapp && <a href={`https://wa.me/${contact.whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold hover:underline" style={{ color: 'var(--s-accent-text)' }}><MessageCircle size={14} /> WhatsApp</a>}
                                {contact.email && <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 font-semibold hover:underline" style={{ color: 'var(--s-accent-text)' }}><Mail size={14} /> {contact.email}</a>}
                                {contact.website && <a href={contact.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold hover:underline" style={{ color: 'var(--s-accent-text)' }}><Globe size={14} /> Website</a>}
                                {contact.hours && <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--s-muted)' }}><Clock size={14} /> {contact.hours}</span>}
                            </div>
                        )}

                        <div className="p-4 md:p-8">
                            {/* Live auctions: with the seller's auction cover as the header */}
                            {auctions.length > 0 && !query.trim() && category === 'ALL' && (
                                <section className="mb-8 overflow-hidden border border-[var(--s-line)] rounded-[var(--s-card)]">
                                    <div className="relative flex h-28 items-end p-4 md:h-36" style={{ background: theme.auctionCoverUrl ? `url(${theme.auctionCoverUrl}) center/cover` : `linear-gradient(135deg, ${theme.accent}, ${theme.accent}88)` }}>
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
                                        <h3 className={`relative flex items-center gap-2 text-xl text-white ${head}`}><Gavel size={18} /> Live auctions <span className="text-sm font-normal text-white/80">{auctions.length} {auctions.length === 1 ? 'item' : 'items'}</span></h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-4 sm:grid-cols-3 lg:grid-cols-4">{auctions.map((l, i) => card(l, i))}</div>
                                </section>
                            )}

                            {/* 2. Search and categories */}
                            <div className="mb-6 flex flex-col gap-3">
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--s-muted)' }} />
                                        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${seller.name}`} aria-label="Search this store"
                                            className="h-11 w-full border bg-[var(--s-surface)] pl-10 pr-4 text-sm outline-none rounded-[var(--s-control)] border-[var(--s-line)] placeholder:text-[var(--s-muted)] focus:border-[var(--s-accent)]" />
                                    </div>
                                    <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="h-11 border bg-[var(--s-surface)] px-3 text-sm outline-none rounded-[var(--s-control)] border-[var(--s-line)]">
                                        <option value="NEWEST">Newest</option><option value="PRICE_LOW">Price: low to high</option><option value="PRICE_HIGH">Price: high to low</option>
                                    </select>
                                </div>
                                {categories.length > 1 && (
                                    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
                                        {['ALL', ...categories].map((c) => (
                                            <button key={c} role="tab" aria-selected={category === c} onClick={() => setCategory(c)} className="h-9 flex-shrink-0 px-4 text-sm font-semibold transition rounded-[var(--s-pill)]"
                                                style={category === c ? accentBtn : { background: 'var(--s-surface)', color: 'var(--s-text)' }}>{c === 'ALL' ? 'All' : c}</button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 3. Items, in the seller's chosen layout */}
                            {shown.length === 0 ? (
                                <p className="py-12 text-center text-sm" style={{ color: 'var(--s-muted)' }}>Nothing matches. Try another search or category.</p>
                            ) : theme.layout === 'services' ? (
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{shown.map((l) => serviceCard(l))}</div>
                            ) : theme.layout === 'menu' ? (
                                <ul>{shown.map((l, i) => row(l, i))}</ul>
                            ) : theme.layout === 'showcase' && shown.length > 2 ? (
                                <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
                                    {card(shown[0], 0, true)}
                                    {shown.slice(1).map((l, i) => card(l, i + 1))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{shown.map((l, i) => card(l, i))}</div>
                            )}
                        </div>
                    </div>

                    {/* 4. Reviews */}
                    <SellerReviews sellerId={seller.id} sellerName={seller.name} isMine={mine} />
                    {mine && <StoreThemeDialog open={editing} onClose={() => setEditing(false)} theme={theme} storeName={seller.name} orgId={orgId} />}
                </>
            )}
        </PagePanel>
    );
};
