import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Gavel, Heart, Share2, ShoppingBag, ShieldCheck, Star, Store, Truck, UserPlus, UserCheck } from 'lucide-react';
import { apiJson } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { Dialog, PrimaryButton, TonalButton } from '../components/ui/Dialog';
import { LISTINGS_KEY, ListingCard, LocationText, SellerAvatar, Shelf, ShelfItem, Stars, TYPE_LABEL, Thumb, VerifiedBadge, priceText, typeGroup } from '../components/marketplace/parts';
import { actionOf } from '../components/marketplace/kinds';
import { StockLine, VariantPicker } from '../components/marketplace/stockUi';
import { AuctionPanel } from '../components/marketplace/AuctionPanel';
import { SellerReviews } from '../components/marketplace/SellerReviews';
import { StartAuctionDialog } from '../components/marketplace/StartAuctionDialog';
import type { Listing, MarketplaceData } from '../components/marketplace/parts';
import { useRecentlyViewed, useSavedListings, useSavedSellers } from '../hooks/useSavedListings';

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-2 text-sm">
        <dt className="text-[#5F6368]">{label}</dt>
        <dd className="text-[#1F1F1F]">{children}</dd>
    </div>
);

/** How the item is delivered, from what the seller set up, so a buyer knows what happens after paying. */
function deliveryText(l: Listing): string {
    if (l.productType === 'DIGITAL') return 'Delivered to your email as soon as you pay.';
    if (l.productType === 'SERVICE_BOOKING' || l.productType === 'SERVICE_BOOKING_DAILY') return 'Pick your dates at checkout.';
    if (l.requiresDelivery) return 'Delivery or pick-up is arranged at checkout.';
    return l.productType === 'PRODUCT' ? 'Arranged with the seller after payment.' : 'No delivery needed.';
}

/**
 * One listing, laid out like an eBay item page: pictures with a thumbnail strip on the left; title, seller, price, Buy and Add to
 * watchlist on the right; delivery and payment details; the seller; then similar items. Only facts the app has are shown (there are no
 * ratings or bid counts here until there is something real behind them).
 */
export const MarketplaceListing: React.FC = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const { isSaved, toggle } = useSavedListings();
    const { isFollowing, toggle: toggleFollow } = useSavedSellers();
    const { remember } = useRecentlyViewed();

    const { data, isPending, isError } = useQuery({
        queryKey: LISTINGS_KEY,
        queryFn: () => apiJson<MarketplaceData>('/marketplace/listings'),
        staleTime: 60_000,
    });
    const all = data?.listings ?? [];
    const listing = all.find((l) => l.id === id) ?? null;

    const [index, setIndex] = useState(0);
    const [copied, setCopied] = useState(false);
    const [auctionOpen, setAuctionOpen] = useState(false);
    const [protectionOpen, setProtectionOpen] = useState(false);
    const [variantId, setVariantId] = useState<string | null>(null);
    useEffect(() => { setVariantId(null); }, [id]);
    useEffect(() => { setIndex(0); setCopied(false); window.scrollTo?.({ top: 0 }); }, [id]);
    useEffect(() => { if (listing) remember(listing.id); }, [listing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const images = listing && listing.images.length ? listing.images : [null];
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key === 'ArrowRight') setIndex((i) => Math.min(images.length - 1, i + 1));
            if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [images.length]);

    const sellerItems = useMemo(() => listing ? all.filter((l) => l.seller.id === listing.seller.id) : [], [all, listing]);
    const similar = useMemo(() => listing ? all.filter((l) => l.id !== listing.id && listing.category && l.category === listing.category).slice(0, 12) : [], [all, listing]);
    const others = useMemo(() => {
        if (!listing) return [];
        const skip = new Set([listing.id, ...similar.map((l) => l.id)]);
        return all.filter((l) => !skip.has(l.id)).slice(0, 12);
    }, [all, listing, similar]);

    const share = async () => {
        if (!listing) return;
        try { await navigator.clipboard.writeText(`${window.location.origin}/marketplace/${listing.id}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
    };
    const open = (l: Listing) => navigate(`/marketplace/${l.id}`);
    const card = (l: Listing, i: number) => (
        <ListingCard key={l.id} listing={l} eager={i < 4} compact saved={isSaved(l.id)} onToggleSave={() => toggle(l.id)} onOpen={() => open(l)} />
    );

    return (
        <PagePanel title="Marketplace" back="/marketplace">
            {isPending ? (
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                    <div className="aspect-[4/3] animate-pulse rounded-2xl bg-[#F1F3F4]" />
                    <div className="space-y-4"><div className="h-8 w-3/4 animate-pulse rounded bg-[#F1F3F4]" /><div className="h-6 w-1/3 animate-pulse rounded bg-[#F1F3F4]" /><div className="h-12 w-full animate-pulse rounded-full bg-[#F1F3F4]" /></div>
                </div>
            ) : isError || !listing ? (
                <div className="flex flex-col items-center py-20 text-center">
                    <Store size={30} className="text-[#9AA0A6]" />
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">This listing isn’t available</p>
                    <p className="mt-1 text-sm text-[#5F6368]">It may have been sold or taken down by the seller.</p>
                    <PrimaryButton onClick={() => navigate('/marketplace')} className="mt-5 h-11 px-6">Back to the Marketplace</PrimaryButton>
                </div>
            ) : (
                <>
                    <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-[#5F6368]" aria-label="Breadcrumb">
                        <Link to="/marketplace" className="hover:text-[#0B57D0] hover:underline">Marketplace</Link>
                        {listing.category && <><ChevronRight size={12} /><span>{listing.category}</span></>}
                        <ChevronRight size={12} /><span className="truncate text-[#1F1F1F]">{listing.name}</span>
                    </nav>

                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                        {/* Pictures: thumbnail strip + large picture */}
                        <div className="flex flex-col-reverse gap-3 md:flex-row">
                            {images.length > 1 && (
                                <div className="flex gap-2 overflow-x-auto md:max-h-[560px] md:w-[76px] md:flex-shrink-0 md:flex-col md:overflow-y-auto md:overflow-x-visible">
                                    {images.map((src, i) => (
                                        <button key={`${src}-${i}`} type="button" onClick={() => setIndex(i)} aria-label={`Picture ${i + 1} of ${images.length}`} aria-current={i === index} className={`h-[68px] w-[68px] flex-shrink-0 overflow-hidden rounded-xl bg-[#F1F3F4] ring-2 ${i === index ? 'ring-[#0B57D0]' : 'ring-transparent hover:ring-[#C4C7C5]'}`}>
                                            <Thumb listing={listing} src={src} width={136} sizes="68px" />
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="relative aspect-square flex-1 overflow-hidden rounded-2xl bg-[#F1F3F4] md:aspect-auto md:min-h-[460px]">
                                <Thumb listing={listing} src={images[index]} width={960} sizes="(min-width: 1024px) 55vw, 100vw" eager contain />
                                {images.length > 1 && (
                                    <>
                                        <button type="button" aria-label="Previous picture" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow disabled:opacity-30"><ChevronLeft size={20} /></button>
                                        <button type="button" aria-label="Next picture" disabled={index === images.length - 1} onClick={() => setIndex((i) => i + 1)} className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow disabled:opacity-30"><ChevronRight size={20} /></button>
                                    </>
                                )}
                                <button type="button" onClick={() => toggle(listing.id)} aria-pressed={isSaved(listing.id)} aria-label={isSaved(listing.id) ? 'Remove from watchlist' : 'Add to watchlist'} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow hover:scale-105">
                                    <Heart size={20} className={isSaved(listing.id) ? 'fill-[#EA4335] text-[#EA4335]' : 'text-[#1F1F1F]'} />
                                </button>
                                {images.length > 1 && <span className="absolute bottom-3 right-3 rounded-full bg-[rgba(32,33,36,0.7)] px-2.5 py-1 text-xs font-medium text-white tabular-nums">{index + 1} / {images.length}</span>}
                            </div>
                        </div>

                        {/* Title, seller, price, actions */}
                        <div>
                            <h1 className="text-2xl font-bold leading-snug text-[#1F1F1F]">{listing.name}</h1>

                            <div className="mt-4 flex items-center gap-3 border-y border-[rgba(116,119,117,0.22)] py-3">
                                <SellerAvatar seller={listing.seller} size={44} />
                                <div className="min-w-0 flex-1">
                                    <p className="flex items-center gap-1.5 truncate text-sm font-bold text-[#1F1F1F]">{listing.seller.name}{listing.seller.verified && <VerifiedBadge size={15} withLabel />}</p>
                                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-[#5F6368]">
                                        {listing.seller.rating.count > 0 && <a href="#reviews" className="inline-flex items-center gap-1 font-semibold text-[#1F1F1F] hover:underline"><Stars value={listing.seller.rating.average} size={12} /> {listing.seller.rating.average.toFixed(1)} ({listing.seller.rating.count})</a>}
                                        <LocationText location={listing.seller.location} />
                                        <span>{listing.seller.isPersonal ? 'Individual seller' : 'Business'} · <a href="#seller-items" className="font-semibold text-[#0B57D0] hover:underline">{sellerItems.length} {sellerItems.length === 1 ? 'item' : 'items'} listed</a></span>
                                    </p>
                                </div>
                            </div>

                            {listing.auction ? <AuctionPanel listing={listing} /> : (
                                <>
                                    <p className="mt-5 text-3xl font-bold tabular-nums text-[#1F1F1F]">{priceText(listing)}</p>
                                    <p className="mt-0.5 text-xs text-[#80868B]">Listed {new Date(listing.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                    {listing.stock?.tracked && (
                                        <div className="mt-4 space-y-3">
                                            <VariantPicker variants={listing.stock.variants} value={variantId} onChange={setVariantId} />
                                            <StockLine stock={listing.stock} variantId={variantId} />
                                        </div>
                                    )}
                                </>
                            )}

                            <dl className="mt-3 divide-y divide-[rgba(116,119,117,0.12)]">
                                <Row label="Type">{TYPE_LABEL[typeGroup(listing.productType)]}</Row>
                                {listing.category && <Row label="Category">{listing.category}</Row>}
                                <Row label="Delivery">{deliveryText(listing)}</Row>
                            </dl>

                            <div className="mt-5 flex flex-col gap-2.5">
                                {listing.isMine ? (
                                    <>
                                        <TonalButton onClick={() => navigate('/products')} className="h-12">Manage this listing</TonalButton>
                                        {!listing.auction && <button type="button" onClick={() => setAuctionOpen(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#0B57D0] hover:bg-[#E8F0FE]"><Gavel size={16} /> Sell as an auction</button>}
                                    </>
                                ) : !listing.auction && (
                                    <PrimaryButton
                                        disabled={!!listing.stock?.soldOut || (!!listing.stock?.tracked && listing.stock.variants.length > 0 && !variantId)}
                                        onClick={() => navigate(listing.inAppCheckout ? `/marketplace/checkout/${listing.id}${variantId ? `?variant=${variantId}` : ''}` : listing.storePath)}
                                        className="h-12 text-base"
                                    >
                                        <ShoppingBag size={18} /> {listing.stock?.soldOut ? 'Sold out' : listing.stock?.tracked && listing.stock.variants.length > 0 && !variantId ? 'Choose an option' : actionOf(listing).label}
                                    </PrimaryButton>
                                )}
                                <button type="button" onClick={() => toggle(listing.id)} aria-pressed={isSaved(listing.id)} className="inline-flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#0B57D0] hover:bg-[#E8F0FE]">
                                    <Heart size={16} className={isSaved(listing.id) ? 'fill-[#EA4335] text-[#EA4335]' : ''} /> {isSaved(listing.id) ? 'On your watchlist' : 'Add to watchlist'}
                                </button>
                            </div>

                            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#F8FAFD] p-4 text-sm text-[#3C4043]">
                                <ShieldCheck size={20} className="mt-0.5 flex-shrink-0 text-[#0B57D0]" />
                                <p><span className="font-bold text-[#1F1F1F]">Pay inside MoneyWise.</span> {listing.inAppCheckout ? 'Pay from your MoneyWise wallet with no fees. Delivery is available in Lusaka.' : 'This item finishes in the seller’s store.'}</p>
                            </div>

                            <section className="mt-6">
                                <h2 className="mb-1 text-base font-bold text-[#1F1F1F]">Delivery and payment</h2>
                                <dl className="divide-y divide-[rgba(116,119,117,0.12)]">
                                    <Row label="Delivery"><span className="inline-flex items-start gap-1.5">{listing.requiresDelivery && <Truck size={15} className="mt-0.5 flex-shrink-0 text-[#5F6368]" />}{deliveryText(listing)}</span></Row>
                                    <Row label="Payments">{listing.inAppCheckout ? 'MoneyWise Pay, no fees. Mobile money and card coming soon.' : 'Mobile money (MTN, Airtel, Zamtel), card or MoneyWise wallet, in the seller’s store.'}</Row>
                                    <Row label="Sold by">{listing.seller.name}</Row>
                                </dl>
                            </section>

                            {/* What protects a buyer: said plainly, and only what the app really does */}
                            <section className="mt-6 border-t border-[rgba(116,119,117,0.16)] pt-5" aria-labelledby="confidence">
                                <h2 id="confidence" className="mb-3 text-base font-bold text-[#1F1F1F]">Shop with confidence</h2>
                                <div className="flex items-start gap-3">
                                    <ShieldCheck size={26} className="mt-0.5 flex-shrink-0 text-[#1F1F1F]" strokeWidth={1.6} />
                                    <div className="text-sm">
                                        <p className="font-medium text-[#1F1F1F]">{listing.inAppCheckout ? 'MoneyWise buyer protection' : 'Pay inside MoneyWise where you can'}</p>
                                        <p className="text-[#5F6368]">
                                            {listing.inAppCheckout
                                                ? 'Pay from your wallet and, if something isn’t right, report it from your orders within 14 days. '
                                                : 'This item is finished in the seller’s store, so buyer protection doesn’t apply to it. '}
                                            <button type="button" onClick={() => setProtectionOpen(true)} className="font-semibold text-[#1F1F1F] underline">Learn more</button>
                                        </p>
                                    </div>
                                </div>
                            </section>

                            <div className="mt-5 flex items-center gap-4 text-sm">
                                <button type="button" onClick={share} className="inline-flex items-center gap-1.5 font-semibold text-[#0B57D0] hover:underline">{copied ? <><Check size={14} /> Link copied</> : <><Share2 size={14} /> Share</>}</button>
                            </div>
                        </div>
                    </div>

                    {listing.description && (
                        <section className="mt-10 rounded-2xl border border-[rgba(116,119,117,0.22)] p-6">
                            <h2 className="mb-2 text-lg font-bold text-[#1F1F1F]">About this item</h2>
                            <p className="whitespace-pre-line text-sm leading-relaxed text-[#3C4043]">{listing.description}</p>
                        </section>
                    )}

                    {/* About the seller */}
                    <section id="seller-items" className="mt-6 grid grid-cols-1 gap-6 rounded-2xl bg-[#F8FAFD] p-6 md:grid-cols-[320px_1fr]">
                        <div>
                            <h2 className="mb-3 text-lg font-bold text-[#1F1F1F]">About this seller</h2>
                            <div className="flex items-center gap-3">
                                <SellerAvatar seller={listing.seller} size={64} />
                                <div className="min-w-0">
                                    <p className="flex items-center gap-1.5 truncate text-base font-bold text-[#1F1F1F]">{listing.seller.name}{listing.seller.verified && <VerifiedBadge size={16} />}</p>
                                    <p className="text-xs text-[#5F6368]">{listing.seller.isPersonal ? 'Individual seller' : 'Business'} on MoneyWise{listing.seller.verified ? ' · Verified store' : ''}</p>
                                    {listing.seller.rating.count > 0 && <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#5F6368]"><Star size={12} className="fill-[#FBBC04] text-[#FBBC04]" /> {listing.seller.rating.average.toFixed(1)} · {listing.seller.rating.count} {listing.seller.rating.count === 1 ? 'review' : 'reviews'}</p>}
                                    <LocationText location={listing.seller.location} className="mt-0.5 text-xs text-[#5F6368]" />
                                    <p className="text-xs text-[#5F6368]">{sellerItems.length} {sellerItems.length === 1 ? 'item' : 'items'} on the Marketplace</p>
                                </div>
                            </div>
                            <div className="mt-4 flex flex-col gap-2">
                                <PrimaryButton onClick={() => navigate(`/marketplace/store/${listing.seller.id}`)} className="h-11"><Store size={16} /> Visit store</PrimaryButton>
                                <button type="button" onClick={() => toggleFollow(listing.seller.id)} aria-pressed={isFollowing(listing.seller.id)} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-[#0B57D0] shadow-[inset_0_0_0_1px_#0B57D0] hover:bg-[#E8F0FE]">
                                    {isFollowing(listing.seller.id) ? <><UserCheck size={16} /> Saved seller</> : <><UserPlus size={16} /> Save seller</>}
                                </button>
                            </div>
                        </div>
                        <div>
                            <h3 className="mb-3 text-sm font-bold text-[#1F1F1F]">More from {listing.seller.name}</h3>
                            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                                {sellerItems.filter((l) => l.id !== listing.id).slice(0, 8).map((l, i) => <li key={l.id}>{card(l, i + 4)}</li>)}
                            </ul>
                            {sellerItems.length <= 1 && <p className="text-sm text-[#80868B]">This is the seller’s only listing right now.</p>}
                        </div>
                    </section>

                    <div id="reviews"><SellerReviews sellerId={listing.seller.id} sellerName={listing.seller.name} isMine={listing.isMine} /></div>
                    <StartAuctionDialog listing={listing} open={auctionOpen} onClose={() => setAuctionOpen(false)} />
                    <Dialog open={protectionOpen} onClose={() => setProtectionOpen(false)} title="MoneyWise buyer protection" size="md">
                        <p className="mb-4 text-sm text-[#5F6368]">When you buy an item that checks out in the app and pay with MoneyWise Pay, here is what you can count on.</p>
                        <ol className="space-y-4 text-sm text-[#3C4043]">
                            {[
                                ['Your payment is recorded.', 'It goes from your wallet straight to the seller’s, and both of you see it in your orders.'],
                                ['Report a problem for 14 days.', 'If the item isn’t what you ordered or never arrives, open the order and choose “Report a problem” within 14 days of paying or of the order being completed.'],
                                ['The seller is asked to put it right.', 'They are told straight away and can reply, send the item, or refund you to your wallet.'],
                                ['MoneyWise can step in.', 'If the seller doesn’t sort it out, contact MoneyWise support with your order and we will look at it with you.'],
                            ].map(([t, d], i) => (
                                <li key={t} className="flex gap-3"><span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#D3E3FD] text-xs font-bold text-[#041E49]">{i + 1}</span><span><span className="font-bold text-[#1F1F1F]">{t}</span> {d}</span></li>
                            ))}
                        </ol>
                        <p className="mt-5 rounded-xl bg-[#F8FAFD] px-3 py-2.5 text-xs text-[#5F6368]">Refunds come from the seller, and pay-in-4 orders are settled with MoneyWise support. Items finished in a seller’s own store, bookings and donations aren’t covered by this.</p>
                    </Dialog>


                    <div className="mt-10">
                        {similar.length > 0 && (
                            <Shelf title={`More in ${listing.category}`}>
                                {similar.map((l, i) => <ShelfItem key={l.id}>{card(l, i + 4)}</ShelfItem>)}
                            </Shelf>
                        )}
                        {others.length > 0 && (
                            <Shelf title="You may also like">
                                {others.map((l, i) => <ShelfItem key={l.id}>{card(l, i + 4)}</ShelfItem>)}
                            </Shelf>
                        )}
                    </div>
                </>
            )}
        </PagePanel>
    );
};
