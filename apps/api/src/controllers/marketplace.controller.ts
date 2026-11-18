import { Response } from 'express';
import { supabase } from '../lib/supabase';
import { isValidZambiaMobile, normalizeZambiaPhone, INVALID_PHONE_MESSAGE } from '../utils/zambiaPhone';
import { notifyUser } from '../services/marketplaceNotify';
import { isSuspended } from '../services/marketplaceOrders.service';
import { runningAds } from '../services/ads.service';
import { STOCK_COLUMNS, stockView } from '../services/stock';
import {
    AuctionRow, buyNow, isVerifiedStore, locationText, maskName, num, repairSoldAuction, settleDueAuctions, shortName,
} from '../services/marketplace.service';

interface AuctionView {
    id: string;
    status: 'OPEN' | 'SOLD' | 'NO_SALE' | 'CANCELLED';
    startPrice: number;
    currentBid: number | null;
    bidCount: number;
    endsAt: string;
    bidIncrement: number;
    minNextBid: number;
    buyNowPrice: number | null;
    hasReserve: boolean;
    reserveMet: boolean;
    iAmHighBidder: boolean;
    iHaveBid: boolean;
    iWon: boolean;
    winningAmount: number | null;
    /** Only for the winner and the seller: where the winner pays. */
    paymentLinkToken: string | null;
    serverNow: string;
}

/** What the Marketplace shows: a product a seller has chosen to list, with who is selling it and where to buy it. */
interface Listing {
    id: string;
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
    images: string[];
    category: string | null;
    productType: string;
    requiresDelivery: boolean;
    createdAt: string;
    seller: {
        id: string; name: string; logoUrl: string | null; isPersonal: boolean;
        verified: boolean; location: string | null; rating: { average: number; count: number };
    };
    /** The seller's existing public store for this product, with the product ready: the buyer completes payment there. */
    storePath: string;
    isMine: boolean;
    auction: AuctionView | null;
    /** Can be bought and paid for inside the app (MoneyWise Pay). Donations, quotes and digital items finish in the seller's store. */
    inAppCheckout: boolean;
    /** How many are left and which options exist. `tracked` false means the seller doesn't count them. */
    stock: { tracked: boolean; available: number | null; low: boolean; soldOut: boolean; variants: { id: string; name: string; color: string; size: string; stock: number }[] };
}

const MAX_LISTINGS = 500;

/**
 * Pictures uploaded while the app used an earlier Supabase project still carry that project's address, and that project now refuses
 * to serve files (402), so those photos showed up broken. The same files exist in the current project's storage under the same path,
 * so a storage link pointing at any other Supabase host is rewritten to the current one.
 */
const currentHost = (() => { try { return new URL(process.env.SUPABASE_URL || '').host; } catch { return ''; } })();
const currentStorageUrl = (url: string | null | undefined): string | null => {
    if (!url || typeof url !== 'string') return null;
    const u = url.trim();
    if (!u) return null;
    try {
        const parsed = new URL(u);
        if (currentHost && /\.supabase\.co$/i.test(parsed.host) && parsed.host !== currentHost && parsed.pathname.startsWith('/storage/')) {
            parsed.host = currentHost;
            return parsed.toString();
        }
    } catch { /* not an absolute URL: leave it */ }
    return u;
};

const missingTable = (message: string | undefined) => /marketplace_(auctions|bids|reviews)|place_marketplace_bid|does not exist|schema cache/i.test(message || '');

/** Who is asking: id, their organisation, and their display name. */
async function whoAmI(req: any): Promise<{ userId: string; orgId: string | null; name: string }> {
    const userId: string = req.user?.id;
    const { data } = await supabase.from('users').select('name').eq('id', userId).maybeSingle();
    return { userId, orgId: req.user?.organization_id ?? null, name: data?.name || req.user?.email || 'MoneyWise user' };
}

/**
 * GET /marketplace/listings
 * Active products whose seller opted in, newest first, each with the seller (name, logo, location, star rating, Verified badge) and the
 * store that sells it. Items on auction carry the live auction state. Due auctions are closed first.
 */
export const getMarketplaceListings = async (req: any, res: Response): Promise<any> => {
    try {
        const myOrg: string | null = req.user?.organization_id ?? null;
        const me: string | null = req.user?.id ?? null;

        await settleDueAuctions().catch((e) => { if (!missingTable(e?.message)) console.error('[Marketplace] settle failed:', e?.message); });

        const BASE_COLS = 'id, organization_id, wallet_id, name, description, price, image_url, additional_images, category, product_type, requires_delivery, created_at';
        const load = (cols: string) => supabase.from('products').select(cols).eq('marketplace_listed', true).eq('is_active', true).order('created_at', { ascending: false }).limit(MAX_LISTINGS);
        let { data: products, error } = (await load(`${BASE_COLS}, ${STOCK_COLUMNS}`)) as { data: any[] | null; error: any };
        // Stock arrives with a later migration: until then every item reads as not tracked.
        if (error && /track_stock|stock_quantity|low_stock|variants/i.test(error.message || '')) ({ data: products, error } = (await load(BASE_COLS)) as { data: any[] | null; error: any });

        if (error) {
            // The column arrives with the 20261102120000_marketplace_listing migration; until then there is simply nothing listed.
            if (/marketplace_listed/i.test(error.message || '')) return res.json({ listings: [], categories: [], needsMigration: true });
            throw error;
        }

        const rows = products ?? [];
        if (rows.length === 0) return res.json({ listings: [], categories: [] });

        const orgIds = [...new Set(rows.map((p) => p.organization_id))];
        const productIds = rows.map((p) => p.id);
        const walletIds = [...new Set(rows.map((p) => p.wallet_id).filter(Boolean))] as string[];

        const [orgsRes, walletsRes, mainWalletsRes, profilesRes, reviewsRes, auctionsRes] = await Promise.all([
            supabase.from('organizations').select('id, name, logo_url, public_username, is_personal, phone, address, lenco_subaccount_id, store_theme').in('id', orgIds),
            walletIds.length ? supabase.from('organization_wallets').select('id, store_slug, is_main, organization_id').in('id', walletIds) : Promise.resolve({ data: [] as any[] }),
            supabase.from('organization_wallets').select('id, organization_id').eq('is_main', true).in('organization_id', orgIds),
            supabase.from('business_profiles').select('organization_id, phone, city, province, country').in('organization_id', orgIds),
            supabase.from('marketplace_reviews').select('seller_org_id, rating').in('seller_org_id', orgIds),
            supabase.from('marketplace_auctions').select('*').in('product_id', productIds).order('created_at', { ascending: false }),
        ]);

        const orgs = new Map<string, any>((orgsRes.data ?? []).map((o: any) => [o.id, o]));
        const wallets = new Map<string, any>((walletsRes.data ?? []).map((w: any) => [w.id, w]));
        const mainWalletByOrg = new Map<string, string>((mainWalletsRes.data ?? []).map((w: any) => [w.organization_id, w.id]));
        const profiles = new Map<string, any>((profilesRes.data ?? []).map((p: any) => [p.organization_id, p]));

        const ratingByOrg = new Map<string, { sum: number; count: number }>();
        for (const r of reviewsRes.data ?? []) {
            const cur = ratingByOrg.get(r.seller_org_id) ?? { sum: 0, count: 0 };
            cur.sum += r.rating; cur.count += 1;
            ratingByOrg.set(r.seller_org_id, cur);
        }

        // Latest auction per product, and the bids on the ones that are open.
        const latestAuction = new Map<string, AuctionRow>();
        for (const a of (auctionsRes.data ?? []) as AuctionRow[]) if (!latestAuction.has(a.product_id)) latestAuction.set(a.product_id, a);
        const openIds = [...latestAuction.values()].filter((a) => a.status === 'OPEN').map((a) => a.id);
        const bidsRes = openIds.length ? await supabase.from('marketplace_bids').select('auction_id, amount, bidder_user_id').in('auction_id', openIds) : { data: [] as any[] };
        const bidsBy = new Map<string, { amount: number; user: string }[]>();
        for (const b of bidsRes.data ?? []) {
            const list = bidsBy.get(b.auction_id) ?? [];
            list.push({ amount: num(b.amount), user: b.bidder_user_id });
            bidsBy.set(b.auction_id, list);
        }

        const serverNow = new Date().toISOString();
        const auctionView = (a: AuctionRow | undefined, isSeller: boolean): AuctionView | null => {
            if (!a) return null;
            if (a.status === 'OPEN') {
                const bids = bidsBy.get(a.id) ?? [];
                const top = bids.reduce((m, b) => (b.amount > m ? b.amount : m), 0);
                const current = bids.length ? top : null;
                const mine = bids.filter((b) => b.user === me);
                const increment = num(a.bid_increment) || 1;
                return {
                    id: a.id, status: 'OPEN', startPrice: num(a.start_price), currentBid: current, bidCount: bids.length, endsAt: a.ends_at, bidIncrement: increment,
                    minNextBid: current === null ? num(a.start_price) : current + increment,
                    buyNowPrice: a.buy_now_price ? num(a.buy_now_price) : null,
                    hasReserve: !!a.reserve_price, reserveMet: !a.reserve_price || (current !== null && current >= num(a.reserve_price)),
                    iAmHighBidder: mine.length > 0 && Math.max(...mine.map((b) => b.amount)) === top && top > 0,
                    iHaveBid: mine.length > 0, iWon: false, winningAmount: null, paymentLinkToken: null, serverNow,
                };
            }
            if (a.status === 'SOLD') {
                const won = !!me && a.winner_user_id === me;
                return {
                    id: a.id, status: 'SOLD', startPrice: num(a.start_price), currentBid: num(a.winning_amount), bidCount: 0, endsAt: a.ends_at, bidIncrement: num(a.bid_increment) || 1,
                    minNextBid: 0, buyNowPrice: null, hasReserve: !!a.reserve_price, reserveMet: true, iAmHighBidder: false, iHaveBid: won, iWon: won,
                    winningAmount: num(a.winning_amount), paymentLinkToken: won || isSeller ? a.payment_link_token : null, serverNow,
                };
            }
            return null; // no sale / cancelled: the product is a plain listing again
        };

        const listings: Listing[] = [];
        for (const p of rows) {
            const isSeller = !!myOrg && p.organization_id === myOrg;
            const auction = latestAuction.get(p.id);
            // A sold auction disappears for everyone except the seller and the winner, who still need to pay or collect.
            if (auction?.status === 'SOLD' && !isSeller && auction.winner_user_id !== me) continue;

            const org = orgs.get(p.organization_id);
            const profile = profiles.get(p.organization_id);
            const wallet = p.wallet_id ? wallets.get(p.wallet_id) : null;
            const username: string | null = org?.public_username ?? null;
            const walletForPay = p.wallet_id ?? mainWalletByOrg.get(p.organization_id) ?? null;
            const storePath = username
                ? `/${username}/store${wallet && !wallet.is_main && wallet.store_slug ? `/${wallet.store_slug}` : ''}`
                : walletForPay ? `/pay/${walletForPay}` : '';
            const images = [p.image_url, ...(Array.isArray(p.additional_images) ? p.additional_images : [])]
                .map((u: any) => currentStorageUrl(u))
                .filter((u: string | null): u is string => !!u);
            // An auction item with no picture of its own uses the seller's auction cover photo.
            const auctionCover = currentStorageUrl(org?.store_theme?.auctionCoverUrl);
            if (images.length === 0 && auctionCover && auction?.status === 'OPEN') images.push(auctionCover);
            const rating = ratingByOrg.get(p.organization_id);

            listings.push({
                id: p.id,
                name: p.name,
                description: p.description ?? null,
                price: Number(p.price) || 0,
                imageUrl: currentStorageUrl(p.image_url) ?? images[0] ?? null,
                images,
                category: p.category ? String(p.category).trim() : null,
                productType: p.product_type,
                requiresDelivery: !!p.requires_delivery || !!org?.store_theme?.delivery?.enabled,
                createdAt: p.created_at,
                seller: {
                    id: p.organization_id, name: org?.name ?? 'Seller', logoUrl: currentStorageUrl(org?.logo_url), isPersonal: !!org?.is_personal,
                    verified: isVerifiedStore(org, profile), location: locationText(profile, org),
                    rating: { average: rating ? Math.round((rating.sum / rating.count) * 10) / 10 : 0, count: rating?.count ?? 0 },
                },
                storePath,
                isMine: isSeller,
                auction: auctionView(auction, isSeller),
                inAppCheckout: ['PRODUCT', 'SERVICE_FIXED', 'SERVICE_BOOKING', 'SERVICE_BOOKING_DAILY'].includes(p.product_type) && !!org?.public_username && !!org?.lenco_subaccount_id,
                stock: (({ tracked, available, low, soldOut, variants }) => ({ tracked, available, low, soldOut, variants }))(stockView(p)),
            });
        }
        const visible = listings.filter((l) => !!l.storePath);

        const counts = new Map<string, number>();
        for (const l of visible) if (l.category) counts.set(l.category, (counts.get(l.category) ?? 0) + 1);
        const categories = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

        // Paid placements that are running today. Only items and stores that are actually visible are returned, so an ad never shows
        // something the page can't open.
        const running = await runningAds();
        const shownIds = new Set(visible.map((l) => l.id));
        const shownSellers = new Set(visible.map((l) => l.seller.id));
        const ads = {
            featuredItems: running.featuredItems.filter((a) => shownIds.has(a.productId)),
            boostedItems: running.boostedItems.filter((a) => shownIds.has(a.productId)),
            featuredStores: running.featuredStores.filter((a) => shownSellers.has(a.orgId)),
        };

        res.json({ listings: visible, categories, ads });
    } catch (error: any) {
        console.error('[Marketplace] listings error:', error);
        res.status(500).json({ error: 'Failed to load the Marketplace', details: error.message });
    }
};

/* ───────────────────────────── Auctions ───────────────────────────── */

/** POST /marketplace/auctions  { productId, startPrice, reservePrice?, buyNowPrice?, durationHours, bidIncrement? } */
export const createAuction = async (req: any, res: Response): Promise<any> => {
    try {
        const orgId = req.user.organization_id;
        if (!orgId) return res.status(400).json({ error: 'User organization context missing' });
        if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Only administrators can start an auction' });

        const { productId, startPrice, reservePrice, buyNowPrice, durationHours, bidIncrement } = req.body ?? {};
        const start = Number(startPrice);
        const hours = Number(durationHours);
        const reserve = reservePrice === '' || reservePrice == null ? null : Number(reservePrice);
        const buy = buyNowPrice === '' || buyNowPrice == null ? null : Number(buyNowPrice);
        const step = bidIncrement === '' || bidIncrement == null ? 1 : Number(bidIncrement);

        if (!productId) return res.status(400).json({ error: 'Choose the product to auction.' });
        if (!Number.isFinite(start) || start < 0) return res.status(400).json({ error: 'Enter a valid starting price.' });
        if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 30) return res.status(400).json({ error: 'An auction can run from 1 hour to 30 days.' });
        if (!Number.isFinite(step) || step <= 0) return res.status(400).json({ error: 'The bid increment must be more than zero.' });
        if (reserve !== null && (!Number.isFinite(reserve) || reserve < start)) return res.status(400).json({ error: 'The reserve price can’t be lower than the starting price.' });
        if (buy !== null && (!Number.isFinite(buy) || buy <= Math.max(start, reserve ?? 0))) return res.status(400).json({ error: 'Buy it now must be higher than the starting and reserve prices.' });

        const { data: product } = await supabase.from('products').select('id, organization_id, is_active').eq('id', productId).maybeSingle();
        if (!product) return res.status(404).json({ error: 'Product not found' });
        if (product.organization_id !== orgId) return res.status(403).json({ error: 'That product belongs to another organisation.' });
        if (!product.is_active) return res.status(400).json({ error: 'Activate the product before auctioning it.' });

        const endsAt = new Date(Date.now() + hours * 3_600_000).toISOString();
        const { data, error } = await supabase.from('marketplace_auctions').insert({
            product_id: productId, organization_id: orgId, start_price: start, reserve_price: reserve, buy_now_price: buy, bid_increment: step,
            ends_at: endsAt, created_by: req.user.id,
        }).select('*').single();
        if (error) {
            if (/uq_marketplace_auction_open_product|duplicate key/i.test(error.message)) return res.status(409).json({ error: 'This product is already on auction.' });
            if (missingTable(error.message)) return res.status(503).json({ error: 'Auctions are not switched on yet.' });
            throw error;
        }
        await supabase.from('products').update({ marketplace_listed: true }).eq('id', productId);
        res.status(201).json({ id: data.id, endsAt });
    } catch (error: any) {
        console.error('[Marketplace] create auction error:', error);
        res.status(500).json({ error: 'Failed to start the auction', details: error.message });
    }
};

/** POST /marketplace/auctions/:id/cancel  (the seller, before anyone has bid) */
export const cancelAuction = async (req: any, res: Response): Promise<any> => {
    try {
        const { data: a } = await supabase.from('marketplace_auctions').select('*').eq('id', req.params.id).maybeSingle();
        if (!a) return res.status(404).json({ error: 'Auction not found' });
        if (a.organization_id !== req.user.organization_id || req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Only the seller can cancel this auction.' });
        if (a.status !== 'OPEN') return res.status(400).json({ error: 'This auction has already ended.' });
        const { count } = await supabase.from('marketplace_bids').select('id', { count: 'exact', head: true }).eq('auction_id', a.id);
        if ((count ?? 0) > 0) return res.status(400).json({ error: 'You can’t cancel an auction that already has bids.' });
        await supabase.from('marketplace_auctions').update({ status: 'CANCELLED', settled_at: new Date().toISOString() }).eq('id', a.id).eq('status', 'OPEN');
        res.json({ cancelled: true });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to cancel the auction', details: error.message });
    }
};

/** POST /marketplace/auctions/:id/bids  { amount, phone } */
export const placeBid = async (req: any, res: Response): Promise<any> => {
    try {
        const amount = Number(req.body?.amount);
        const phone = normalizeZambiaPhone(req.body?.phone);
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Enter your bid.' });
        if (!isValidZambiaMobile(phone)) return res.status(400).json({ error: INVALID_PHONE_MESSAGE.replace('the customer\'s', 'your') });

        const who = await whoAmI(req);
        if (await isSuspended(who.userId).catch(() => false)) return res.status(403).json({ error: 'Bidding is paused on your account because auctions you won weren’t paid. Contact support.' });

        // Whoever is currently winning is told if this bid overtakes them.
        const { data: before } = await supabase.from('marketplace_bids').select('bidder_user_id, amount').eq('auction_id', req.params.id).order('amount', { ascending: false }).limit(1);
        const { data, error } = await supabase.rpc('place_marketplace_bid', {
            p_auction: req.params.id, p_user: who.userId, p_org: who.orgId, p_name: who.name, p_phone: phone, p_amount: amount,
        });
        if (error) {
            const m = error.message || '';
            if (/BID_CLOSED/.test(m)) return res.status(409).json({ error: 'This auction has ended.' });
            if (/OWN_AUCTION/.test(m)) return res.status(403).json({ error: 'You can’t bid on your own item.' });
            const low = /BID_TOO_LOW:([0-9.]+)/.exec(m);
            if (low) return res.status(409).json({ error: `Your bid must be at least K${Number(low[1]).toLocaleString()}.`, minimum: Number(low[1]) });
            throw error;
        }
        const previous = before?.[0];
        if (previous && previous.bidder_user_id !== who.userId) {
            const { data: a } = await supabase.from('marketplace_auctions').select('product_id').eq('id', req.params.id).maybeSingle();
            const { data: p } = a ? await supabase.from('products').select('name').eq('id', a.product_id).maybeSingle() : { data: null as any };
            void notifyUser(previous.bidder_user_id, { title: 'You’ve been outbid', path: a ? `/marketplace/${a.product_id}` : '/marketplace', body: `someone bid K${amount.toLocaleString()} on ${p?.name ?? 'an item'}. Bid again to stay in the lead.` });
        }
        res.status(201).json(data);
    } catch (error: any) {
        console.error('[Marketplace] bid error:', error);
        res.status(500).json({ error: 'Failed to place your bid', details: error.message });
    }
};

/** POST /marketplace/auctions/:id/buy-now  { phone } */
export const buyNowAuction = async (req: any, res: Response): Promise<any> => {
    try {
        const phone = normalizeZambiaPhone(req.body?.phone);
        if (!isValidZambiaMobile(phone)) return res.status(400).json({ error: INVALID_PHONE_MESSAGE.replace('the customer\'s', 'your') });
        const { data: a } = await supabase.from('marketplace_auctions').select('*').eq('id', req.params.id).maybeSingle();
        if (!a || a.status !== 'OPEN' || new Date(a.ends_at) <= new Date()) return res.status(409).json({ error: 'This auction has ended.' });
        if (!a.buy_now_price) return res.status(400).json({ error: 'This item has no Buy it now price.' });
        const who = await whoAmI(req);
        if (who.orgId && who.orgId === a.organization_id) return res.status(403).json({ error: 'You can’t buy your own item.' });
        const sold = await buyNow(a as AuctionRow, { userId: who.userId, orgId: who.orgId, name: who.name, phone });
        if (!sold) return res.status(409).json({ error: 'Someone just bought or won this item.' });
        res.json({ paymentLinkToken: sold.payment_link_token, amount: num(sold.winning_amount) });
    } catch (error: any) {
        console.error('[Marketplace] buy now error:', error);
        res.status(500).json({ error: 'Failed to complete Buy it now', details: error.message });
    }
};

/** GET /marketplace/auctions/:id/bids  The bid history with names masked, highest first. */
export const getAuctionBids = async (req: any, res: Response): Promise<any> => {
    try {
        const { data: a } = await supabase.from('marketplace_auctions').select('*').eq('id', req.params.id).maybeSingle();
        if (!a) return res.status(404).json({ error: 'Auction not found' });
        const { data: bids } = await supabase.from('marketplace_bids').select('amount, bidder_name, bidder_user_id, created_at')
            .eq('auction_id', a.id).order('amount', { ascending: false }).order('created_at', { ascending: true }).limit(30);
        const token = a.status === 'SOLD' ? await repairSoldAuction(a as AuctionRow) : null;
        const isWinner = a.winner_user_id && a.winner_user_id === req.user?.id;
        const isSeller = a.organization_id === req.user?.organization_id;
        res.json({
            bids: (bids ?? []).map((b: any) => ({ bidder: b.bidder_user_id === req.user?.id ? 'You' : maskName(b.bidder_name), amount: num(b.amount), at: b.created_at })),
            paymentLinkToken: isWinner || isSeller ? token : null,
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to load the bids', details: error.message });
    }
};

/* ───────────────────────────── Reviews ───────────────────────────── */

/** GET /marketplace/sellers/:orgId/reviews */
export const getSellerReviews = async (req: any, res: Response): Promise<any> => {
    try {
        const base = 'id, reviewer_user_id, reviewer_name, rating, comment, verified_purchase, created_at';
        const load = (cols: string) => supabase.from('marketplace_reviews').select(cols).eq('seller_org_id', req.params.orgId).order('created_at', { ascending: false }).limit(100);
        let { data, error } = (await load(`${base}, seller_reply, replied_at`)) as { data: any[] | null; error: any };
        // Replies arrive with a later migration: until then reviews load without them.
        if (error && /seller_reply|replied_at/i.test(error.message)) ({ data, error } = (await load(base)) as { data: any[] | null; error: any });
        if (error) {
            if (missingTable(error.message)) return res.json({ summary: { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] }, reviews: [], mine: null });
            throw error;
        }
        const rows = data ?? [];
        const distribution = [0, 0, 0, 0, 0];
        for (const r of rows) distribution[r.rating - 1] += 1;
        const count = rows.length;
        const average = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
        const mine = rows.find((r) => r.reviewer_user_id === req.user?.id) ?? null;
        res.json({
            summary: { average, count, distribution },
            reviews: rows.map((r) => ({ id: r.id, name: shortName(r.reviewer_name), rating: r.rating, comment: r.comment, verifiedPurchase: r.verified_purchase, at: r.created_at, mine: r.reviewer_user_id === req.user?.id, reply: r.seller_reply ?? null, repliedAt: r.replied_at ?? null })),
            mine: mine ? { rating: mine.rating, comment: mine.comment } : null,
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to load reviews', details: error.message });
    }
};

/** POST /marketplace/sellers/:orgId/reviews  { rating, comment }  One review per person per seller; sending again updates it. */
export const saveSellerReview = async (req: any, res: Response): Promise<any> => {
    try {
        const sellerOrg: string = req.params.orgId;
        const rating = Math.round(Number(req.body?.rating));
        const comment = String(req.body?.comment ?? '').trim().slice(0, 1000);
        if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Choose 1 to 5 stars.' });

        const who = await whoAmI(req);
        if (who.orgId && who.orgId === sellerOrg) return res.status(403).json({ error: 'You can’t review your own store.' });
        const { data: seller } = await supabase.from('organizations').select('id').eq('id', sellerOrg).maybeSingle();
        if (!seller) return res.status(404).json({ error: 'Seller not found' });

        // "Verified purchase": a completed order from this seller under the reviewer's email, or under a phone they've bid with.
        const { data: user } = await supabase.from('users').select('email').eq('id', who.userId).maybeSingle();
        const email = String(user?.email ?? req.user?.email ?? '').toLowerCase();
        const { data: myBids } = await supabase.from('marketplace_bids').select('bidder_phone').eq('bidder_user_id', who.userId).not('bidder_phone', 'is', null).limit(10);
        const phones = [...new Set((myBids ?? []).map((b: any) => b.bidder_phone).filter(Boolean))];
        let verified = false;
        if (email) {
            const { count } = await supabase.from('product_sales').select('id', { count: 'exact', head: true }).eq('organization_id', sellerOrg).eq('status', 'COMPLETED').ilike('customer_email', email);
            verified = (count ?? 0) > 0;
        }
        if (!verified && phones.length) {
            const { count } = await supabase.from('product_sales').select('id', { count: 'exact', head: true }).eq('organization_id', sellerOrg).eq('status', 'COMPLETED').in('customer_phone', phones);
            verified = (count ?? 0) > 0;
        }

        const { error } = await supabase.from('marketplace_reviews').upsert({
            seller_org_id: sellerOrg, reviewer_user_id: who.userId, reviewer_org_id: who.orgId, reviewer_name: who.name,
            rating, comment: comment || null, verified_purchase: verified, updated_at: new Date().toISOString(),
        }, { onConflict: 'seller_org_id,reviewer_user_id' });
        if (error) {
            if (missingTable(error.message)) return res.status(503).json({ error: 'Reviews are not switched on yet.' });
            throw error;
        }
        res.status(201).json({ saved: true, verifiedPurchase: verified });
    } catch (error: any) {
        console.error('[Marketplace] review error:', error);
        res.status(500).json({ error: 'Failed to save your review', details: error.message });
    }
};

/** POST /marketplace/reviews/:id/reply  { reply }  The seller answers a review of their store. An empty reply removes it. */
export const replyToReview = async (req: any, res: Response): Promise<any> => {
    try {
        const orgId = req.user.organization_id;
        if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Only administrators can reply to reviews' });
        const { data: review } = await supabase.from('marketplace_reviews').select('id, seller_org_id, reviewer_user_id, seller_reply').eq('id', req.params.id).maybeSingle();
        if (!review || review.seller_org_id !== orgId) return res.status(404).json({ error: 'Review not found' });
        const reply = String(req.body?.reply ?? '').trim().slice(0, 1000);
        const { error } = await supabase.from('marketplace_reviews').update(
            reply ? { seller_reply: reply, replied_at: new Date().toISOString() } : { seller_reply: null, replied_at: null },
        ).eq('id', review.id);
        if (error) {
            if (/seller_reply|replied_at/i.test(error.message)) return res.status(503).json({ error: 'Replies aren’t switched on yet. Try again soon.' });
            throw error;
        }
        if (reply && !review.seller_reply) {
            const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
            void notifyUser(review.reviewer_user_id, { title: `${org?.name ?? 'A store'} replied to your review`, path: `/marketplace/store/${orgId}`, body: reply.slice(0, 160) });
        }
        res.json({ saved: true, reply: reply || null });
    } catch (error: any) {
        console.error('[Marketplace] review reply error:', error);
        res.status(500).json({ error: 'Failed to save the reply', details: error.message });
    }
};

/** DELETE /marketplace/sellers/:orgId/reviews  Removes the caller's own review. */
export const deleteMyReview = async (req: any, res: Response): Promise<any> => {
    try {
        await supabase.from('marketplace_reviews').delete().eq('seller_org_id', req.params.orgId).eq('reviewer_user_id', req.user.id);
        res.json({ deleted: true });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to remove your review', details: error.message });
    }
};

/* ───────────────────────────── Store location ───────────────────────────── */

/* ── Store look ── */

const DEFAULT_THEME = {
    accent: '#0B57D0', mode: 'light', font: 'modern', corners: 'soft', layout: 'grid', tagline: '', bannerUrl: null as string | null,
    covers: [] as string[], auctionCoverUrl: null as string | null, delivery: { enabled: false, charge: 0, note: '' }, contact: { show: false, whatsapp: '', hours: '' },
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/** Only the few open choices are kept, and each is checked, so a store can look different but never unreadable or unsafe. */
function cleanStoreTheme(raw: any) {
    return {
        accent: typeof raw?.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent.toUpperCase() : DEFAULT_THEME.accent,
        mode: oneOf(raw?.mode, ['light', 'dark'] as const, 'light'),
        font: oneOf(raw?.font, ['modern', 'classic', 'bold'] as const, 'modern'),
        corners: oneOf(raw?.corners, ['soft', 'round', 'sharp'] as const, 'soft'),
        layout: oneOf(raw?.layout, ['grid', 'menu', 'showcase', 'services'] as const, 'grid'),
        tagline: String(raw?.tagline ?? '').trim().slice(0, 80),
        bannerUrl: httpsUrl(raw?.bannerUrl),
        // The store's cover photos (the first is the main one) and the cover used for the seller's auctions.
        covers: (Array.isArray(raw?.covers) ? raw.covers : []).map(httpsUrl).filter((u: string | null): u is string => !!u).slice(0, 5),
        auctionCoverUrl: httpsUrl(raw?.auctionCoverUrl),
        // Delivery the seller offers on everything they sell (Lusaka only for now), unless a product sets its own.
        delivery: { enabled: raw?.delivery?.enabled === true, charge: Math.min(5000, Math.max(0, Math.round((Number(raw?.delivery?.charge) || 0) * 100) / 100)), note: String(raw?.delivery?.note ?? '').trim().slice(0, 120) },
        // Whether to show contact details on the store, and the bits that don't live on the business profile.
        contact: { show: raw?.contact?.show === true, whatsapp: String(raw?.contact?.whatsapp ?? '').replace(/[^\d+ ]/g, '').trim().slice(0, 20), hours: String(raw?.contact?.hours ?? '').trim().slice(0, 80) },
    };
}
const httpsUrl = (v: unknown): string | null => (typeof v === 'string' && /^https:\/\/[^\s]{1,500}$/.test(v) ? v : null);

/** GET /marketplace/stores/:orgId  A store's look. Missing or not yet set up: the default. */
export const getStoreTheme = async (req: any, res: Response): Promise<any> => {
    const { data } = await supabase.from('organizations').select('store_theme').eq('id', req.params.orgId).maybeSingle();
    const theme = { ...DEFAULT_THEME, ...(data?.store_theme ? cleanStoreTheme(data.store_theme) : {}) };
    // Contact details are shown to buyers only when the seller turned that on.
    let contact: { phone: string | null; altPhone: string | null; email: string | null; website: string | null; whatsapp: string | null; hours: string | null } | null = null;
    if (theme.contact.show) {
        const { data: p } = await supabase.from('business_profiles').select('phone, alt_phone, business_email, website').eq('organization_id', req.params.orgId).maybeSingle();
        contact = { phone: p?.phone ?? null, altPhone: p?.alt_phone ?? null, email: p?.business_email ?? null, website: p?.website ?? null, whatsapp: theme.contact.whatsapp || null, hours: theme.contact.hours || null };
    }
    res.json({ theme, isSet: !!data?.store_theme, contact });
};

/** PUT /marketplace/my-store-theme  { accent, mode, font, corners, layout, tagline, bannerUrl } */
export const saveStoreTheme = async (req: any, res: Response): Promise<any> => {
    try {
        const orgId = req.user.organization_id;
        if (!orgId) return res.status(400).json({ error: 'User organization context missing' });
        if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Only administrators can change the store’s look' });
        // Only the settings sent are changed: the look dialog and the advanced settings each save their own part.
        const { data: current } = await supabase.from('organizations').select('store_theme').eq('id', orgId).maybeSingle();
        const sent = Object.fromEntries(Object.entries(req.body ?? {}).filter(([k]) => k in DEFAULT_THEME));
        const theme = cleanStoreTheme({ ...(current?.store_theme ?? {}), ...sent });
        theme.bannerUrl = theme.covers[0] ?? theme.bannerUrl;
        const { error } = await supabase.from('organizations').update({ store_theme: theme }).eq('id', orgId);
        if (error) {
            if (/store_theme/i.test(error.message)) return res.status(503).json({ error: 'Store looks aren’t switched on yet. Try again soon.' });
            throw error;
        }
        res.json({ theme });
    } catch (error: any) {
        console.error('[Marketplace] store theme error:', error);
        res.status(500).json({ error: 'Failed to save the store’s look', details: error.message });
    }
};

/** GET /marketplace/my-location */
export const getMyLocation = async (req: any, res: Response): Promise<any> => {
    const orgId = req.user.organization_id;
    if (!orgId) return res.json({ city: '', province: '', country: '', street: '', plotNumber: '' });
    const { data } = await supabase.from('business_profiles').select('city, province, country, street, plot_number').eq('organization_id', orgId).maybeSingle();
    res.json({ city: data?.city ?? '', province: data?.province ?? '', country: data?.country ?? '', street: data?.street ?? '', plotNumber: data?.plot_number ?? '' });
};

/** GET /marketplace/my-contact  The store's contact details from the business profile. */
export const getMyContact = async (req: any, res: Response): Promise<any> => {
    const orgId = req.user.organization_id;
    if (!orgId) return res.json({ phone: '', altPhone: '', email: '', website: '' });
    const { data } = await supabase.from('business_profiles').select('phone, alt_phone, business_email, website').eq('organization_id', orgId).maybeSingle();
    res.json({ phone: data?.phone ?? '', altPhone: data?.alt_phone ?? '', email: data?.business_email ?? '', website: data?.website ?? '' });
};

/** PUT /marketplace/my-contact  { phone, altPhone, email, website } */
export const saveMyContact = async (req: any, res: Response): Promise<any> => {
    try {
        const orgId = req.user.organization_id;
        if (!orgId) return res.status(400).json({ error: 'User organization context missing' });
        if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Only administrators can change the contact details' });
        const clean = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n) || null;
        const email = clean(req.body?.email, 120);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'That email address doesn’t look right.' });
        const website = clean(req.body?.website, 200);
        if (website && !/^https?:\/\//i.test(website)) return res.status(400).json({ error: 'The website should start with http:// or https://' });
        const patch = { phone: clean(req.body?.phone, 20), alt_phone: clean(req.body?.altPhone, 20), business_email: email, website };
        const { data: existing } = await supabase.from('business_profiles').select('id').eq('organization_id', orgId).maybeSingle();
        const { error } = existing
            ? await supabase.from('business_profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('organization_id', orgId)
            : await supabase.from('business_profiles').insert({ organization_id: orgId, ...patch });
        if (error) throw error;
        res.json({ saved: true });
    } catch (error: any) {
        console.error('[Marketplace] contact error:', error);
        res.status(500).json({ error: 'Failed to save the contact details', details: error.message });
    }
};

/** PUT /marketplace/my-location  { city, province, country } */
export const saveMyLocation = async (req: any, res: Response): Promise<any> => {
    try {
        const orgId = req.user.organization_id;
        if (!orgId) return res.status(400).json({ error: 'User organization context missing' });
        if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Only administrators can change the store location' });
        const clean = (v: unknown) => String(v ?? '').trim().slice(0, 80) || null;
        const patch: Record<string, string | null> = { city: clean(req.body?.city), province: clean(req.body?.province), country: clean(req.body?.country) };
        // The street and plot only change when they are sent (the quick location dialog doesn't send them).
        if (req.body?.street !== undefined) patch.street = clean(req.body.street);
        if (req.body?.plotNumber !== undefined) patch.plot_number = clean(req.body.plotNumber);

        const { data: existing } = await supabase.from('business_profiles').select('id').eq('organization_id', orgId).maybeSingle();
        const { error } = existing
            ? await supabase.from('business_profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('organization_id', orgId)
            : await supabase.from('business_profiles').insert({ organization_id: orgId, ...patch });
        if (error) throw error;
        res.json({ saved: true });
    } catch (error: any) {
        console.error('[Marketplace] location error:', error);
        res.status(500).json({ error: 'Failed to save the location', details: error.message });
    }
};
