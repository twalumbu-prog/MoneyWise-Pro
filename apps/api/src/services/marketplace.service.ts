import { randomBytes } from 'crypto';
import { supabase } from '../lib/supabase';
import { notifySeller, notifyUser } from './marketplaceNotify';

/** Everything the Marketplace does beyond listing products: closing auctions, paying their winners, trust signals. */

export interface AuctionRow {
    id: string;
    product_id: string;
    organization_id: string;
    start_price: number | string;
    reserve_price: number | string | null;
    buy_now_price: number | string | null;
    bid_increment: number | string;
    starts_at: string;
    ends_at: string;
    status: 'OPEN' | 'SOLD' | 'NO_SALE' | 'CANCELLED';
    winner_user_id: string | null;
    winner_org_id: string | null;
    winner_name: string | null;
    winner_phone: string | null;
    winning_amount: number | string | null;
    payment_link_token: string | null;
    settled_at: string | null;
    unpaid_at?: string | null;
    reminder_sent_at?: string | null;
    created_by: string | null;
    created_at: string;
}

export const num = (v: unknown): number => Number(v) || 0;

/** How long a winner has to pay: after this the win is marked unpaid and the winner gets a strike. */
export const PAYMENT_WINDOW_HOURS = 72;
const money = (n: unknown) => `K${num(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const checkoutPath = (a: { product_id: string; id: string }) => `/marketplace/checkout/${a.product_id}?auction=${a.id}`;

/** Tells the winner they won and the seller they sold. */
export async function announceWin(a: AuctionRow): Promise<void> {
    const { data: p } = await supabase.from('products').select('name').eq('id', a.product_id).maybeSingle();
    const name = p?.name ?? 'your item';
    await Promise.all([
        a.winner_user_id ? notifyUser(a.winner_user_id, { title: 'You won the auction', path: checkoutPath(a), body: `you won ${name} for ${money(a.winning_amount)}. Pay within ${PAYMENT_WINDOW_HOURS} hours to claim it.` }) : null,
        notifySeller(a.organization_id, { title: 'Your auction sold', path: '/marketplace/orders?tab=sold', body: `${name} sold for ${money(a.winning_amount)}. The winner has ${PAYMENT_WINDOW_HOURS} hours to pay.` }),
    ]);
}

/** "Mwila Banda" -> "M***a": bidders and reviewers are shown to strangers without revealing who they are. */
export const maskName = (name: string | null | undefined): string => {
    const n = String(name ?? '').trim();
    if (!n) return 'Anonymous';
    if (n.length <= 2) return `${n[0]}***`;
    return `${n[0]}***${n[n.length - 1]}`;
};

/** First name and last initial: "Mwila B." Used on reviews, where a name is expected. */
export const shortName = (name: string | null | undefined): string => {
    const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'MoneyWise user';
    return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
};

const newToken = (): string => randomBytes(24).toString('base64url');

/**
 * The winner pays through the same one-time payment link a seller would send by hand: it points at the seller's wallet for exactly
 * the winning amount and switches itself to PAID when the payment lands.
 */
async function ensurePaymentLink(a: AuctionRow): Promise<string | null> {
    if (a.payment_link_token) return a.payment_link_token;
    if (a.status !== 'SOLD' || !a.winner_name || !a.winner_phone || !a.winning_amount) return null;

    const { data: product } = await supabase.from('products').select('wallet_id').eq('id', a.product_id).maybeSingle();
    let walletId: string | null = product?.wallet_id ?? null;
    if (!walletId) {
        const { data: main } = await supabase.from('organization_wallets').select('id').eq('organization_id', a.organization_id).eq('is_main', true).maybeSingle();
        walletId = main?.id ?? null;
    }

    const token = newToken();
    const { error } = await supabase.from('payment_links').insert({
        organization_id: a.organization_id,
        product_id: a.product_id,
        token,
        customer_name: a.winner_name,
        customer_phone: a.winner_phone,
        amount: num(a.winning_amount),
        wallet_id: walletId,
        status: 'ACTIVE',
        created_by: a.created_by,
    });
    if (error) { console.error('[Marketplace] could not create the winner payment link:', error.message); return null; }

    // Another request may have created one at the same moment: keep the first.
    const { data: updated } = await supabase.from('marketplace_auctions').update({ payment_link_token: token }).eq('id', a.id).is('payment_link_token', null).select('payment_link_token').maybeSingle();
    return updated?.payment_link_token ?? token;
}

/**
 * Closes every auction whose time is up: no bids, or the top bid under the reserve, is "no sale" (the product goes back to its fixed
 * price); otherwise the top bidder wins and gets a payment link. Runs whenever the Marketplace is read, so there is no scheduler to keep
 * alive, and it is safe to run twice at once: the status change only succeeds for the first caller.
 */
export async function settleDueAuctions(): Promise<void> {
    const { data: due } = await supabase.from('marketplace_auctions').select('*').eq('status', 'OPEN').lte('ends_at', new Date().toISOString()).limit(50);
    for (const a of (due ?? []) as AuctionRow[]) {
        const { data: top } = await supabase.from('marketplace_bids').select('bidder_user_id, bidder_org_id, bidder_name, bidder_phone, amount')
            .eq('auction_id', a.id).order('amount', { ascending: false }).order('created_at', { ascending: true }).limit(1);
        const best = top?.[0];
        const reserveMet = !a.reserve_price || (best && num(best.amount) >= num(a.reserve_price));
        if (!best || !reserveMet) {
            const { data: closed } = await supabase.from('marketplace_auctions').update({ status: 'NO_SALE', settled_at: new Date().toISOString() }).eq('id', a.id).eq('status', 'OPEN').select('id').maybeSingle();
            if (closed) {
                const { data: p } = await supabase.from('products').select('name').eq('id', a.product_id).maybeSingle();
                void notifySeller(a.organization_id, { title: 'Your auction ended without a sale', path: `/marketplace/${a.product_id}`, body: `${p?.name ?? 'Your item'} didn’t sell${best ? ' because the top bid was under your reserve' : ' because nobody bid'}. You can list it again.` });
            }
            continue;
        }
        const { data: claimed } = await supabase.from('marketplace_auctions').update({
            status: 'SOLD', settled_at: new Date().toISOString(),
            winner_user_id: best.bidder_user_id, winner_org_id: best.bidder_org_id, winner_name: best.bidder_name, winner_phone: best.bidder_phone,
            winning_amount: best.amount,
        }).eq('id', a.id).eq('status', 'OPEN').select('*').maybeSingle();
        if (claimed) { await ensurePaymentLink(claimed as AuctionRow); await announceWin(claimed as AuctionRow); }
    }
}

/** A sold auction whose payment link failed to create is retried the next time it is looked at. */
export async function repairSoldAuction(a: AuctionRow): Promise<string | null> {
    return a.status === 'SOLD' && !a.payment_link_token ? ensurePaymentLink(a) : a.payment_link_token;
}

/** A buyer ends an auction at once by paying the Buy it now price. */
export async function buyNow(a: AuctionRow, buyer: { userId: string; orgId: string | null; name: string; phone: string }): Promise<AuctionRow | null> {
    const { data: claimed } = await supabase.from('marketplace_auctions').update({
        status: 'SOLD', settled_at: new Date().toISOString(),
        winner_user_id: buyer.userId, winner_org_id: buyer.orgId, winner_name: buyer.name, winner_phone: buyer.phone, winning_amount: a.buy_now_price,
    }).eq('id', a.id).eq('status', 'OPEN').gt('ends_at', new Date().toISOString()).select('*').maybeSingle();
    if (!claimed) return null;
    await ensurePaymentLink(claimed as AuctionRow);
    await announceWin(claimed as AuctionRow);
    const { data: fresh } = await supabase.from('marketplace_auctions').select('*').eq('id', a.id).maybeSingle();
    return (fresh as AuctionRow) ?? (claimed as AuctionRow);
}

/**
 * A store is "verified" automatically when it is a business (not a personal account) with a public store address, a contact number and
 * a location, so the badge means the basics a buyer would want to know are in place.
 */
export function isVerifiedStore(org: any, profile: any): boolean {
    if (!org || org.is_personal) return false;
    const contact = String(profile?.phone ?? org.phone ?? '').trim();
    const place = String(profile?.city ?? org.address ?? '').trim();
    return !!(String(org.public_username ?? '').trim() && contact && place);
}

export function locationText(profile: any, org?: any): string | null {
    const parts = [profile?.city, profile?.province, profile?.country].map((p: any) => String(p ?? '').trim()).filter(Boolean);
    const unique = parts.filter((p, i) => parts.indexOf(p) === i);
    if (unique.length) return unique.join(', ');
    const address = String(org?.address ?? '').trim();
    return address || null;
}

/**
 * The follow-up on won auctions: a reminder when the payment window is two-thirds gone, and once it has closed the win is marked unpaid,
 * the winner gets a strike (three strikes pause buying) and both sides are told. A win that has been paid for is left alone.
 */
export async function sweepUnpaidWins(): Promise<{ reminded: number; marked: number }> {
    const out = { reminded: 0, marked: 0 };
    const { data: wins } = await supabase.from('marketplace_auctions').select('*').eq('status', 'SOLD').is('unpaid_at', null).not('winner_user_id', 'is', null).limit(100);
    for (const a of (wins ?? []) as AuctionRow[]) {
        const { count } = await supabase.from('marketplace_orders').select('id', { count: 'exact', head: true })
            .eq('auction_id', a.id).in('status', ['PAYMENT_PROCESSING', 'PAID', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'DISPUTED']);
        if ((count ?? 0) > 0) continue;

        const settled = new Date(a.settled_at ?? a.ends_at).getTime();
        const deadline = settled + PAYMENT_WINDOW_HOURS * 3_600_000;
        const { data: p } = await supabase.from('products').select('name').eq('id', a.product_id).maybeSingle();
        const name = p?.name ?? 'the item';

        if (Date.now() >= deadline) {
            const { data: marked } = await supabase.from('marketplace_auctions').update({ unpaid_at: new Date().toISOString() }).eq('id', a.id).is('unpaid_at', null).select('id').maybeSingle();
            if (!marked) continue;
            await supabase.from('marketplace_strikes').upsert({ user_id: a.winner_user_id, auction_id: a.id }, { onConflict: 'user_id,auction_id', ignoreDuplicates: true });
            out.marked += 1;
            await Promise.all([
                notifyUser(a.winner_user_id!, { title: 'You didn’t pay for an auction you won', path: '/marketplace', body: `the payment window for ${name} has closed. This counts as a strike on your account.` }),
                notifySeller(a.organization_id, { title: 'The winner didn’t pay', path: `/marketplace/${a.product_id}`, body: `the winner of ${name} didn’t pay within ${PAYMENT_WINDOW_HOURS} hours. You can list it again.` }),
            ]);
        } else if (!a.reminder_sent_at && Date.now() >= settled + (PAYMENT_WINDOW_HOURS * 2 / 3) * 3_600_000) {
            const { data: flagged } = await supabase.from('marketplace_auctions').update({ reminder_sent_at: new Date().toISOString() }).eq('id', a.id).is('reminder_sent_at', null).select('id').maybeSingle();
            if (!flagged) continue;
            out.reminded += 1;
            await notifyUser(a.winner_user_id!, { title: 'Pay for your auction win', path: checkoutPath(a), body: `you have until ${new Date(deadline).toLocaleString()} to pay ${money(a.winning_amount)} for ${name}.` });
        }
    }
    return out;
}

/** Everything the scheduler does each minute. */
export async function settleAll(): Promise<{ reminded: number; marked: number }> {
    await settleDueAuctions();
    return sweepUnpaidWins();
}
