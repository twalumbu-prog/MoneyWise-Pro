import { recordSale } from './purchasing.service';
import { supabase } from '../lib/supabase';
import { payLinkService, PayLinkError } from './payLink.service';
import { areaByName, areaFromText, deliveryOptions, isLusakaLocation, LUSAKA_AREAS, roadRoute } from './marketplaceDelivery';
import type { Size, Speed } from './marketplaceDelivery';
import { PAYMENT_WINDOW_HOURS, locationText, num } from './marketplace.service';
import type { AuctionRow } from './marketplace.service';
import { notifySeller, notifyUser } from './marketplaceNotify';
import * as payLater from './payLater.service';
import { estimateParcel } from './parcelEstimate.service';
import { stockView } from './stock';

/**
 * Buying inside the app. The buyer pays from a MoneyWise wallet by MoneyWise Pro, a wallet-to-wallet transfer that costs nothing (the
 * same on-us transfer the Send screen makes), and the order is recorded for both sides. Other ways of paying (card, mobile money) will
 * be added alongside later.
 */

export { PAYMENT_WINDOW_HOURS };
export const MAX_STRIKES = 3;
/** Rooms and rentals: a stay between two dates, priced per night (or per day). */
const BOOKING_TYPES = ['SERVICE_BOOKING', 'SERVICE_BOOKING_DAILY'];
const IN_APP_TYPES = ['PRODUCT', 'SERVICE_FIXED', ...BOOKING_TYPES];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const prettyDay = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const stayLabel = (checkIn: string, checkOut: string, nights: number, daily: boolean) => `${prettyDay(checkIn)} to ${prettyDay(checkOut)}, ${nights} ${daily ? (nights === 1 ? 'day' : 'days') : (nights === 1 ? 'night' : 'nights')}`;

/** The chosen dates checked against the stays already paid for, and the booked ranges the calendar greys out. */
async function stayView(productId: string, checkIn?: string, checkOut?: string) {
    const today = new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10); // Lusaka's date
    const { data } = await supabase.from('product_bookings').select('check_in, check_out').eq('product_id', productId).eq('status', 'CONFIRMED').gte('check_out', today).order('check_in', { ascending: true });
    const booked = (data ?? []) as { check_in: string; check_out: string }[];
    let nights = 0;
    let problem: string | null = null;
    if (!checkIn || !checkOut) problem = 'Choose your dates.';
    else if (!DAY_RE.test(checkIn) || !DAY_RE.test(checkOut)) problem = 'Choose your dates.';
    else {
        nights = daysBetween(checkIn, checkOut);
        if (nights < 1) problem = 'The last day must be after the first.';
        else if (nights > 90) problem = 'A stay can be at most 90 nights.';
        else if (checkIn < today) problem = 'The first day can’t be in the past.';
        else if (booked.some((b) => checkIn < b.check_out && checkOut > b.check_in)) problem = 'Those dates are taken. Choose others.';
    }
    return { checkIn: checkIn ?? null, checkOut: checkOut ?? null, nights: problem ? 0 : nights, booked, problem };
}

/** Frees the dates of a stay whose payment failed or was refunded. */
async function cancelStay(orderId: string): Promise<void> {
    await supabase.from('product_bookings').update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).eq('reference', `MKT-${orderId}`).eq('status', 'CONFIRMED')
        .then(() => undefined, (e: any) => console.error('[Booking] could not free the dates', e));
}
const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

export class OrderError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'INVALID') { super(message); }
}

export interface Ctx { userId: string; orgId: string; role: string; name: string }

/** The product, who sells it, and whether it can be bought here. */
async function loadItem(productId: string) {
    const { data: product } = await supabase.from('products')
        .select('*')
        .eq('id', productId).maybeSingle();
    if (!product || !product.is_active) throw new OrderError('This item isn’t available any more.', 404, 'NOT_FOUND');

    const [{ data: org }, { data: profile }] = await Promise.all([
        supabase.from('organizations').select('id, name, logo_url, public_username, lenco_subaccount_id, address').eq('id', product.organization_id).maybeSingle(),
        supabase.from('business_profiles').select('city, province, country, phone').eq('organization_id', product.organization_id).maybeSingle(),
    ]);
    if (!org) throw new OrderError('The seller can’t be found.', 404, 'NOT_FOUND');

    const reason = !IN_APP_TYPES.includes(product.product_type)
        ? 'Donations, quotes and digital items are completed in the seller’s store.'
        : !org.public_username || !org.lenco_subaccount_id
            ? `${org.name} can’t take MoneyWise payments in the app yet.`
            : null;
    return { product, org, profile, supported: !reason, unsupportedReason: reason };
}

/** The winning auction for this buyer and product, when the buyer is paying for a win. */
async function loadWin(auctionId: string, userId: string, productId: string): Promise<AuctionRow> {
    const { data: a } = await supabase.from('marketplace_auctions').select('*').eq('id', auctionId).maybeSingle();
    if (!a || a.product_id !== productId || a.status !== 'SOLD' || a.winner_user_id !== userId) throw new OrderError('This auction win isn’t yours to pay.', 403, 'NOT_WINNER');
    if (a.unpaid_at) throw new OrderError('The payment window for this auction has closed.', 409, 'WINDOW_CLOSED');
    return a as AuctionRow;
}

export function paymentDeadline(a: AuctionRow): string {
    return new Date(new Date(a.settled_at ?? a.ends_at).getTime() + PAYMENT_WINDOW_HOURS * 3_600_000).toISOString();
}

/** The Opus Delivery account that receives delivery fees and dispatch requests (set OPUS_ORG_USERNAME to its public username). */
async function opusOrg(): Promise<{ id: string; public_username: string } | null> {
    const handle = String(process.env.OPUS_ORG_USERNAME ?? '').trim().replace(/^@/, '');
    if (!handle) return null;
    const { data } = await supabase.from('organizations').select('id, public_username, lenco_subaccount_id').ilike('public_username', handle).maybeSingle();
    return data?.lenco_subaccount_id ? { id: data.id, public_username: data.public_username } : null;
}

export interface QuoteInput { productId: string; checkIn?: string; checkOut?: string; variantId?: string; quantity?: number; area?: string; size?: Size; weightKg?: number; speed?: Speed; auctionId?: string }

/** What the order would cost, the delivery choices and their prices, and the buyer's wallets. Nothing is charged. */
export async function quoteOrder(ctx: Ctx, q: QuoteInput) {
    const item = await loadItem(q.productId);
    const win = q.auctionId ? await loadWin(q.auctionId, ctx.userId, q.productId) : null;
    if (item.org.id === ctx.orgId) throw new OrderError('You can’t buy your own item.', 403, 'OWN');
    if (BOOKING_TYPES.includes(item.product.product_type)) return bookingQuote(ctx, item, q);

    const stock = stockView(item.product);
    const variant = stock.variants.find((v) => v.id === q.variantId) ?? null;
    // The most that can be bought now: what's left of the chosen option, or of the whole item when it has no options.
    const maxQuantity = !stock.tracked ? 20 : variant ? variant.stock : stock.variants.length ? 0 : stock.available ?? 0;
    const wanted = win || item.product.product_type !== 'PRODUCT' ? 1 : Math.min(20, Math.max(1, Math.floor(Number(q.quantity) || 1)));
    const quantity = stock.tracked && (variant || stock.variants.length === 0) ? Math.max(1, Math.min(wanted, maxQuantity)) : wanted;
    const unit = win ? num(win.winning_amount) : num(item.product.price);
    if (!(unit > 0)) throw new OrderError('This item has no price to pay.', 400, 'NO_PRICE');
    const itemTotal = round2(unit * quantity);

    const sellerPlace = locationText(item.profile, item.org);
    const sellerInLusaka = isLusakaLocation(item.profile?.city, item.profile?.province, item.org.address, sellerPlace);
    const sellerArea = areaFromText(item.org.address) ?? areaFromText(item.profile?.city);
    const buyerArea = areaByName(q.area);
    // A seller can offer delivery on everything from their store settings; a product's own delivery setting still takes priority.
    const { data: sellerOrg } = await supabase.from('organizations').select('store_theme').eq('id', item.org.id).maybeSingle();
    const storeDelivery = sellerOrg?.store_theme?.delivery;
    const storeDelivers = storeDelivery?.enabled === true;
    const flatCharge = num(item.product.own_delivery_charge) > 0 ? num(item.product.own_delivery_charge) : storeDelivers ? num(storeDelivery?.charge) : 0;
    const sellerDelivers = storeDelivers || (!!item.product.requires_delivery && !item.product.allow_external_delivery
        ? true
        : !!item.product.requires_delivery || num(item.product.own_delivery_charge) > 0);

    // One unit's size and weight come from the seller. When they haven't said, they're estimated from what the item is.
    const sizeSet = !!item.product.parcel_size || Number(item.product.weight_kg) > 0;
    const est = sizeSet ? null : await estimateParcel(item.product);
    const loadSize = (item.product.parcel_size ?? est?.size ?? 'MEDIUM') as Size;
    const loadKg = Number(item.product.weight_kg) > 0 ? Number(item.product.weight_kg) : est?.weightKg ?? null;
    const route = sellerInLusaka && buyerArea ? await roadRoute(sellerArea ?? areaByName('Lusaka CBD')!, buyerArea) : null;
    const delivery = deliveryOptions({
        route,
        sellerInLusaka, sellerArea, buyerArea, sellerFlatCharge: flatCharge, sellerDelivers, size: loadSize, weightKg: loadKg, quantity, speed: q.speed, sellerPlace,
        opusEnabled: !!(await opusOrg()),
    });

    const wallets = await payLinkService.payerWallets(ctx.orgId);
    return {
        item: { id: item.product.id, name: item.product.name, imageUrl: item.product.image_url, type: item.product.product_type, unitPrice: unit, quantity, itemTotal },
        stock: { tracked: stock.tracked, available: stock.available, low: stock.low, soldOut: stock.soldOut, variants: stock.variants, variantId: variant?.id ?? null, maxQuantity: Math.min(20, maxQuantity) },
        seller: { id: item.org.id, name: item.org.name, logoUrl: item.org.logo_url, location: sellerPlace, inLusaka: sellerInLusaka },
        supported: item.supported, unsupportedReason: item.unsupportedReason, storePath: item.org.public_username ? `/${item.org.public_username}/store` : '',
        auction: win ? { id: win.id, amount: num(win.winning_amount), payBy: paymentDeadline(win) } : null,
        parcel: { size: loadSize, weightKg: loadKg, setBySeller: sizeSet, estimatedFrom: est?.source ?? null },
        delivery: { ...delivery, areas: LUSAKA_AREAS.map((a) => a.name) },
        wallets, fees: { moneyWisePay: 0 },
        payLater: await payLater.offerFor(ctx.userId, ctx.orgId),
        stay: null as Awaited<ReturnType<typeof stayView>> | null,
    };
}

/** A room or rental: priced by the night, nothing to deliver, and the dates must be free. */
async function bookingQuote(ctx: Ctx, item: Awaited<ReturnType<typeof loadItem>>, q: QuoteInput) {
    const stay = await stayView(item.product.id, q.checkIn, q.checkOut);
    const unit = num(item.product.price);
    if (!(unit > 0)) throw new OrderError('This has no price to pay.', 400, 'NO_PRICE');
    const quantity = Math.max(1, stay.nights);
    const sellerPlace = locationText(item.profile, item.org);
    return {
        item: { id: item.product.id, name: item.product.name, imageUrl: item.product.image_url, type: item.product.product_type, unitPrice: unit, quantity, itemTotal: round2(unit * quantity) },
        stock: { tracked: false, available: null as number | null, low: false, soldOut: false, variants: [] as { id: string; name: string; color: string; size: string; stock: number }[], variantId: null as string | null, maxQuantity: 1 },
        seller: { id: item.org.id, name: item.org.name, logoUrl: item.org.logo_url, location: sellerPlace, inLusaka: isLusakaLocation(item.profile?.city, item.profile?.province, item.org.address, sellerPlace) },
        supported: item.supported, unsupportedReason: item.unsupportedReason, storePath: item.org.public_username ? `/${item.org.public_username}/store` : '',
        auction: null as { id: string; amount: number; payBy: string } | null,
        parcel: { size: 'SMALL' as Size, weightKg: null as number | null, setBySeller: false, estimatedFrom: null as 'LISTING' | 'ITEM' | 'AI' | 'DEFAULT' | null },
        delivery: {
            options: [{ method: 'PICKUP' as const, label: 'Nothing to deliver', available: true, fee: 0, note: 'Your dates are confirmed as soon as you pay.' }],
            opus: null as null, lusakaOnly: false, areas: [] as string[],
        },
        wallets: await payLinkService.payerWallets(ctx.orgId), fees: { moneyWisePay: 0 },
        payLater: await payLater.offerFor(ctx.userId, ctx.orgId),
        stay: stay as Awaited<ReturnType<typeof stayView>> | null,
    };
}

export interface OrderInput extends QuoteInput {
    deliveryMethod?: 'PICKUP' | 'SELLER' | 'OPUS';
    address?: string; notes?: string; phone?: string; walletId?: string; idempotencyKey?: string;
    /** Split into four instalments with Pay in 4 instead of paying all of it now. */
    payLater?: boolean;
}

async function strikeCount(userId: string): Promise<number> {
    const { count } = await supabase.from('marketplace_strikes').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    return count ?? 0;
}
export const isSuspended = async (userId: string) => (await strikeCount(userId)) >= MAX_STRIKES;

/** Pays for the item from the buyer's wallet and records the order. Safe to send twice: the idempotency key returns the first result. */
export async function createOrder(ctx: Ctx, input: OrderInput) {
    if (ctx.role !== 'ADMIN') throw new OrderError('Only the account holder can pay from this wallet.', 403, 'FORBIDDEN');
    if (await isSuspended(ctx.userId)) throw new OrderError('Buying is paused on your account because auctions you won weren’t paid. Contact support.', 403, 'SUSPENDED');

    const key = String(input.idempotencyKey ?? '').trim() || null;
    if (key) {
        const { data: prior } = await supabase.from('marketplace_orders').select('*').eq('idempotency_key', key).maybeSingle();
        if (prior) {
            if (prior.buyer_user_id !== ctx.userId) throw new OrderError('That request isn’t yours.', 403, 'FORBIDDEN');
            return { order: prior, repeated: true };
        }
    }

    const q = await quoteOrder(ctx, input);
    if (!q.supported) throw new OrderError(q.unsupportedReason ?? 'This item can’t be bought here.', 409, 'UNSUPPORTED');
    if (q.stay?.problem) throw new OrderError(q.stay.problem, 400, 'DATES');
    const daily = q.item.type === 'SERVICE_BOOKING_DAILY';
    const stayText = q.stay ? stayLabel(q.stay.checkIn!, q.stay.checkOut!, q.stay.nights, daily) : '';

    const method: 'PICKUP' | 'SELLER' | 'OPUS' = q.stay ? 'PICKUP' : input.deliveryMethod === 'SELLER' ? 'SELLER' : input.deliveryMethod === 'OPUS' ? 'OPUS' : 'PICKUP';
    const chosen = q.delivery.options.find((o) => o.method === method)!;
    if (!chosen.available) throw new OrderError(chosen.note, 409, 'DELIVERY_UNAVAILABLE');
    const area = areaByName(input.area);
    const address = String(input.address ?? '').trim().slice(0, 300);
    if (method !== 'PICKUP' && (!area || !address)) throw new OrderError('Add your area and delivery address.', 400, 'ADDRESS');

    const phone = String(input.phone ?? '').trim().slice(0, 20) || null;
    const total = round2(q.item.itemTotal + chosen.fee);

    const wallets = q.wallets;
    const wallet = input.walletId ? wallets.find((w) => w.id === input.walletId) : wallets.find((w) => w.is_main) ?? wallets[0];
    if (!wallet) throw new OrderError('Choose one of your wallets to pay from.', 400, 'WALLET');
    const financed = !!input.payLater;
    let plan: ReturnType<typeof payLater.schedule> = [];
    let funder: Awaited<ReturnType<typeof payLater.assertCanBorrow>> | null = null;
    if (financed) {
        if (method === 'OPUS') throw new OrderError('Pay in 4 can’t be used with Opus Delivery. Pay now, or choose pick-up.', 400, 'PAYLATER_OPUS');
        try { funder = await payLater.assertCanBorrow(ctx.userId, ctx.orgId, total); }
        catch (e: any) { if (e instanceof payLater.PayLaterError) throw new OrderError(e.message, e.httpStatus, e.code); throw e; }
        plan = payLater.schedule(total);
    }
    if (wallet.balance + 0.005 < (financed ? plan[0].amount : total)) {
        throw new OrderError(`${wallet.name} has K${wallet.balance.toFixed(2)} but this needs K${total.toFixed(2)}. Add money or choose another wallet.`, 402, 'INSUFFICIENT');
    }

    // Stock: take it now so the last one can't be sold twice, and put it back if this order doesn't go through.
    const variant = q.stock.variants.find((v) => v.id === q.stock.variantId) ?? null;
    let reserved = false;
    if (q.stock.tracked) {
        if (q.stock.variants.length && !variant) throw new OrderError('Choose an option (colour or size) first.', 400, 'VARIANT');
        if (q.stock.soldOut || q.stock.maxQuantity < 1) throw new OrderError('This is sold out.', 409, 'SOLD_OUT');
        const { data: ok, error: rpcError } = await supabase.rpc('reserve_stock', { p_product: q.item.id, p_variant: variant?.id ?? null, p_qty: q.item.quantity });
        if (rpcError) throw rpcError;
        if (!ok) throw new OrderError(q.stock.maxQuantity > 0 ? `Only ${q.stock.maxQuantity} left.` : 'This is sold out.', 409, 'SOLD_OUT');
        reserved = true;
    }
    const giveBack = async () => {
        if (!reserved) return;
        reserved = false;
        await supabase.rpc('release_stock', { p_product: q.item.id, p_variant: variant?.id ?? null, p_qty: q.item.quantity }).then(() => undefined, (e: any) => console.error('[Stock] could not put stock back', e));
    };

    const { data: row, error } = await supabase.from('marketplace_orders').insert({
        product_id: q.item.id, product_name: q.stay ? `${q.item.name} (${stayText})` : variant ? `${q.item.name} (${variant.name})` : q.item.name,
        ...(q.stay ? { variant_label: `Stay ${stayText}` } : {}),
        ...(reserved ? { stock_reserved: true, variant_id: variant?.id ?? null, variant_label: variant?.name ?? null } : {}), seller_org_id: q.seller.id, buyer_user_id: ctx.userId, buyer_org_id: ctx.orgId, buyer_name: ctx.name, buyer_phone: phone,
        auction_id: q.auction?.id ?? null, quantity: q.item.quantity, unit_price: q.item.unitPrice, item_total: q.item.itemTotal,
        delivery_method: method, delivery_fee: chosen.fee, delivery_area: area?.name ?? null, delivery_address: method !== 'PICKUP' ? address : null,
        delivery_notes: String(input.notes ?? '').trim().slice(0, 300) || null, total, status: 'PENDING_PAYMENT', idempotency_key: key,
    }).select('*').single();
    if (error) {
        await giveBack();
        if (/idempotency_key/i.test(error.message)) {
            const { data: prior } = await supabase.from('marketplace_orders').select('*').eq('idempotency_key', key).maybeSingle();
            if (prior) return { order: prior, repeated: true };
        }
        throw error;
    }

    // A stay holds its dates from now, so two guests can't pay for the same night. A payment that fails frees them again.
    if (q.stay) {
        const { error: stayError } = await supabase.from('product_bookings').insert({
            organization_id: q.seller.id, product_id: q.item.id, reference: `MKT-${row.id}`, customer_name: ctx.name, customer_phone: phone ?? 'N/A',
            check_in: q.stay.checkIn, check_out: q.stay.checkOut, nights: q.stay.nights, amount: q.item.itemTotal, status: 'CONFIRMED',
        });
        if (stayError) {
            await supabase.from('marketplace_orders').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', row.id);
            const clash = stayError.code === '23P01' || /exclusion|no_overlap|conflicting key/i.test(stayError.message ?? '');
            throw new OrderError(clash ? 'Those dates have just been taken. Choose others.' : 'We couldn’t reserve those dates. Try again.', clash ? 409 : 500, clash ? 'DATES_TAKEN' : 'DATES');
        }
    }

    // The seller's public username is the address of their MoneyWise Pay page: a quick link, which carries no MoneyWise fee.
    const { data: sellerOrg } = await supabase.from('organizations').select('public_username').eq('id', q.seller.id).maybeSingle();
    try {
        const payCtx = { organizationId: ctx.orgId, userId: ctx.userId, role: ctx.role, today: new Date().toISOString().split('T')[0] };
        const label = q.stay ? `${q.item.name} · ${stayText}` : `${q.item.name}${q.item.quantity > 1 ? ` ×${q.item.quantity}` : ''}`;
        // Opus Delivery: the seller is paid for the item, and the delivery fee goes to the Opus account as its own transfer.
        const paid = financed && funder
            ? await payLater.fundOrder({ f: funder, buyerUserId: ctx.userId, buyerOrgId: ctx.orgId, sellerUsername: sellerOrg?.public_username, total, first: plan[0].amount, walletId: wallet.id, label })
            : await payLinkService.payWithWallet(payCtx, {
                username: sellerOrg?.public_username, amount: method === 'OPUS' ? q.item.itemTotal : total, purpose: `${label} · Marketplace order`, walletId: wallet.id,
            });
        let opusNote: string | null = null;
        let opusPaid = false;
        if (method === 'OPUS') {
            const opus = await opusOrg();
            try {
                if (!opus) throw new Error('Opus Delivery isn’t set up');
                await payLinkService.payWithWallet(payCtx, { username: opus.public_username, amount: chosen.fee, purpose: `Opus Delivery · ${label}`, walletId: wallet.id });
                opusPaid = true;
            } catch (e: any) {
                // The item is already paid. The buyer isn't charged for a delivery that wasn't booked: the order falls back to pick-up.
                opusNote = `Opus Delivery couldn’t be booked (${String(e?.message ?? 'payment failed').slice(0, 80)}), so this order is pick-up and you were not charged the delivery fee.`;
            }
        }
        const confirmed = paid.status === 'paid';
        const { data: updated } = await supabase.from('marketplace_orders').update({
            status: confirmed ? 'PAID' : 'PAYMENT_PROCESSING', requisition_id: paid.requisitionId, payment_reference: paid.reference,
            paid_at: confirmed ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
            ...(method === 'OPUS' && !opusPaid ? { delivery_method: 'PICKUP', delivery_fee: 0, total: q.item.itemTotal, delivery_address: null, delivery_notes: [String(input.notes ?? '').trim().slice(0, 200), opusNote].filter(Boolean).join(' · ') } : {}),
        }).eq('id', row.id).select('*').single();
        if (financed) {
            await supabase.from('marketplace_orders').update({ payment_method: 'PAY_LATER' }).eq('id', row.id);
            updated.payment_method = 'PAY_LATER';
            // The money has moved by now, so a failure to record the plan must not fail the order: log it for a manual fix.
            try { await payLater.recordPlan({ orderId: row.id, buyerUserId: ctx.userId, buyerOrgId: ctx.orgId, sellerOrgId: q.seller.id, description: label, total, reference: paid.reference }); }
            catch (e) { console.error('[PayLater] PAID BUT PLAN NOT RECORDED for order', row.id, e); }
        }
        if (confirmed) void announcePaid(updated);
        if (opusPaid) void requestOpusDispatch(updated, q.seller.location, chosen.fee, q.delivery.opus);
        return { order: updated, repeated: false, notice: opusNote };
    } catch (e: any) {
        await supabase.from('marketplace_orders').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', row.id);
        await giveBack();
        if (q.stay) await cancelStay(row.id);
        if (e instanceof PayLinkError || e instanceof payLater.PayLaterError) throw new OrderError(e.message, e.httpStatus, e.code);
        throw e;
    }
}

/** Tells the seller there's a new order and the buyer that it's paid. */
export async function announcePaid(order: any): Promise<void> {
    // The sale leaves stock history, and its cost moves into cost of goods sold (a no-op when stock isn't tracked).
    if (order.stock_reserved) void recordSale(order);
    const money = `K${Number(order.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    await Promise.all([
        notifySeller(order.seller_org_id, {
            title: 'New Marketplace order', path: '/marketplace/orders?tab=sold',
            body: `${order.buyer_name} paid ${money} for ${order.product_name}${order.quantity > 1 ? ` ×${order.quantity}` : ''}. ${/^Stay /.test(order.variant_label ?? '') ? `${order.variant_label}.` : order.delivery_method === 'SELLER' ? `Deliver to ${order.delivery_area}.` : 'They’ll collect it.'}`,
        }),
        notifyUser(order.buyer_user_id, { title: 'Payment received', path: '/marketplace/orders', body: `your payment of ${money} for ${order.product_name} went through. The seller has been told.` }),
    ]);
}

/** Tells the Opus team a rider is needed: where from, where to, the parcel and the fee already paid. */
async function requestOpusDispatch(order: any, pickupPlace: string | null, fee: number, load: { size: string; weightKg: number; truckShare: number; speed: string } | null): Promise<void> {
    const opus = await opusOrg();
    if (!opus) return;
    await notifySeller(opus.id, {
        title: 'New Opus Delivery request', path: '/marketplace/orders?tab=sold',
        body: `${order.product_name}${order.quantity > 1 ? ` ×${order.quantity}` : ''}: collect from the seller${pickupPlace ? ` (${pickupPlace})` : ''} and deliver to ${order.delivery_area}, ${order.delivery_address}.${load ? ` Load: ${load.size.toLowerCase()}, about ${load.weightKg} kg, ${Math.round(load.truckShare * 100)}% of the truck,${load.speed === 'EXPRESS' ? 'express' : 'standard'}.` : ''} Customer ${order.buyer_name} ${order.buyer_phone ?? ''}. Delivery fee K${fee} is paid. Order ${String(order.id).slice(0, 8)}.`,
    });
    await notifySeller(order.seller_org_id, {
        title: 'Hand the parcel to Opus Delivery', path: '/marketplace/orders?tab=sold',
        body: `An Opus rider will collect ${order.product_name} for ${order.buyer_name}. Mark it Ready when it is packed.`,
    });
}

/** An order stuck at PAYMENT_PROCESSING is settled from what happened to its payment. */
export async function refreshOrder(order: any): Promise<any> {
    if (order.status !== 'PAYMENT_PROCESSING' || !order.requisition_id) return order;
    const { data: req } = await supabase.from('requisitions').select('status, updated_at').eq('id', order.requisition_id).maybeSingle();
    const done = ['DISBURSED', 'RECEIVED', 'ACCOUNTED', 'COMPLETED'].includes(String(req?.status ?? ''));
    const failed = ['AUTHORISED', 'DRAFT', 'REJECTED', 'CANCELLED'].includes(String(req?.status ?? '')) && Date.now() - Date.parse(order.updated_at) > 5 * 60_000;
    if (!done && !failed) return order;
    const { data } = await supabase.from('marketplace_orders').update({
        status: done ? 'PAID' : 'FAILED', paid_at: done ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
    }).eq('id', order.id).eq('status', 'PAYMENT_PROCESSING').select('*').maybeSingle();
    if (data && done) void announcePaid(data);
    if (data && !done) await cancelStay(data.id);
    if (data && !done && data.stock_reserved) {
        await supabase.rpc('release_stock', { p_product: data.product_id, p_variant: data.variant_id ?? null, p_qty: data.quantity }).then(() => undefined, (e: any) => console.error('[Stock] could not put stock back', e));
        await supabase.from('marketplace_orders').update({ stock_reserved: false }).eq('id', data.id);
    }
    return data ?? order;
}

/* ───────────── Fulfilment, disputes ───────────── */

export const SELLER_STEPS = ['PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'] as const;

const STATUS_TEXT: Record<string, string> = {
    PROCESSING: 'is being prepared', READY: 'is ready for pick-up', OUT_FOR_DELIVERY: 'is on its way to you', COMPLETED: 'has been completed',
};

export async function setOrderStatus(ctx: Ctx, orderId: string, status: string) {
    const { data: o } = await supabase.from('marketplace_orders').select('*').eq('id', orderId).maybeSingle();
    if (!o) throw new OrderError('Order not found', 404, 'NOT_FOUND');
    const isSeller = o.seller_org_id === ctx.orgId && ctx.role === 'ADMIN';
    const isBuyer = o.buyer_user_id === ctx.userId;
    if (!isSeller && !isBuyer) throw new OrderError('This isn’t your order.', 403, 'FORBIDDEN');
    if (['PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'FAILED'].includes(o.status)) throw new OrderError('This order hasn’t been paid yet.', 409, 'NOT_PAID');
    if (o.status === 'DISPUTED') throw new OrderError('Resolve the dispute first.', 409, 'DISPUTED');
    if (o.status === 'COMPLETED' || o.status === 'REFUNDED') throw new OrderError(o.status === 'REFUNDED' ? 'This order was refunded.' : 'This order is already complete.', 409, 'DONE');

    const allowed = isSeller ? (SELLER_STEPS as readonly string[]) : ['COMPLETED'];
    if (!allowed.includes(status)) throw new OrderError('That isn’t a step you can set.', 400, 'STEP');
    if (status === 'READY' && o.delivery_method === 'SELLER') throw new OrderError('Use “Out for delivery” for orders you deliver yourself.', 400, 'STEP');
    if (status === 'OUT_FOR_DELIVERY' && o.delivery_method !== 'SELLER') throw new OrderError(o.delivery_method === 'OPUS' ? 'An Opus rider collects this one once it’s ready.' : 'This is a pick-up order.', 400, 'STEP');

    const { data } = await supabase.from('marketplace_orders').update({
        status, updated_at: new Date().toISOString(), completed_at: status === 'COMPLETED' ? new Date().toISOString() : null,
    }).eq('id', orderId).select('*').single();
    if (isSeller) void notifyUser(o.buyer_user_id, { title: 'Your order was updated', path: '/marketplace/orders', body: `your order for ${o.product_name} ${STATUS_TEXT[status] ?? 'was updated'}.` });
    else void notifySeller(o.seller_org_id, { title: 'Order confirmed received', path: '/marketplace/orders?tab=sold', body: `${o.buyer_name} confirmed they received ${o.product_name}.` });
    return data;
}

export async function openDispute(ctx: Ctx, orderId: string, reason: string) {
    const text = String(reason ?? '').trim().slice(0, 1000);
    if (text.length < 10) throw new OrderError('Tell us what went wrong (at least a sentence).', 400, 'REASON');
    const { data: o } = await supabase.from('marketplace_orders').select('*').eq('id', orderId).maybeSingle();
    if (!o || o.buyer_user_id !== ctx.userId) throw new OrderError('Only the buyer can report a problem.', 403, 'FORBIDDEN');
    if (['PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'FAILED'].includes(o.status)) throw new OrderError('This order hasn’t been paid yet.', 409, 'NOT_PAID');
    if (o.status === 'DISPUTED') throw new OrderError('A problem has already been reported for this order.', 409, 'DISPUTED');
    if (o.status === 'REFUNDED') throw new OrderError('This order was already refunded.', 409, 'REFUNDED');
    const base = new Date(o.completed_at ?? o.paid_at ?? o.created_at).getTime();
    if (Date.now() - base > 14 * 86_400_000) throw new OrderError('Problems can be reported for 14 days after payment or completion.', 409, 'EXPIRED');

    const { data } = await supabase.from('marketplace_orders').update({
        status: 'DISPUTED', status_before_dispute: o.status, dispute_reason: text, dispute_opened_at: new Date().toISOString(), dispute_response: null, dispute_resolved_at: null, updated_at: new Date().toISOString(),
    }).eq('id', orderId).select('*').single();
    void notifySeller(o.seller_org_id, { title: 'A buyer reported a problem', path: '/marketplace/orders?tab=sold', body: `${o.buyer_name} reported a problem with ${o.product_name}: “${text.slice(0, 120)}”. Please respond.` });
    return data;
}

export async function respondToDispute(ctx: Ctx, orderId: string, note: string) {
    const { data: o } = await supabase.from('marketplace_orders').select('*').eq('id', orderId).maybeSingle();
    if (!o || o.seller_org_id !== ctx.orgId || ctx.role !== 'ADMIN') throw new OrderError('Only the seller can respond.', 403, 'FORBIDDEN');
    if (o.status !== 'DISPUTED') throw new OrderError('There’s no open problem on this order.', 409, 'NO_DISPUTE');
    const text = String(note ?? '').trim().slice(0, 1000);
    if (!text) throw new OrderError('Write your response.', 400, 'NOTE');
    const { data } = await supabase.from('marketplace_orders').update({ dispute_response: text, updated_at: new Date().toISOString() }).eq('id', orderId).select('*').single();
    void notifyUser(o.buyer_user_id, { title: 'The seller responded', path: '/marketplace/orders', body: `${text.slice(0, 160)}` });
    return data;
}

/** Either side can close a dispute once it's sorted out (for example the seller has sent the item or refunded the buyer by sending money back). */
export async function resolveDispute(ctx: Ctx, orderId: string) {
    const { data: o } = await supabase.from('marketplace_orders').select('*').eq('id', orderId).maybeSingle();
    if (!o) throw new OrderError('Order not found', 404, 'NOT_FOUND');
    const party = o.buyer_user_id === ctx.userId || (o.seller_org_id === ctx.orgId && ctx.role === 'ADMIN');
    if (!party) throw new OrderError('This isn’t your order.', 403, 'FORBIDDEN');
    if (o.status !== 'DISPUTED') throw new OrderError('There’s no open problem on this order.', 409, 'NO_DISPUTE');
    const { data } = await supabase.from('marketplace_orders').update({
        status: o.status_before_dispute || 'PAID', dispute_resolved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', orderId).select('*').single();
    const byBuyer = o.buyer_user_id === ctx.userId;
    if (byBuyer) void notifySeller(o.seller_org_id, { title: 'Problem marked as resolved', path: '/marketplace/orders?tab=sold', body: `${o.buyer_name} marked the problem with ${o.product_name} as resolved.` });
    else void notifyUser(o.buyer_user_id, { title: 'Problem marked as resolved', path: '/marketplace/orders', body: `the seller marked the problem with ${o.product_name} as resolved.` });
    return data;
}

/**
 * The seller sends the buyer's money back, wallet to wallet (MoneyWise Pay, no fee). The Opus delivery fee went to Opus, so it isn't part
 * of the refund. The order is claimed first so a double click can't refund twice, and released again if the transfer fails.
 */
export async function refundOrder(ctx: Ctx, orderId: string, walletId?: string) {
    if (ctx.role !== 'ADMIN') throw new OrderError('Only the account holder can send a refund.', 403, 'FORBIDDEN');
    const { data: o } = await supabase.from('marketplace_orders').select('*').eq('id', orderId).maybeSingle();
    if (!o || o.seller_org_id !== ctx.orgId) throw new OrderError('Only the seller can refund this order.', 403, 'FORBIDDEN');
    if (o.payment_method === 'PAY_LATER') throw new OrderError('This order was paid with Pay in 4, so MoneyWise settles any refund with the buyer. Contact MoneyWise support.', 409, 'PAYLATER_REFUND');
    if (!['PAID', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'DISPUTED'].includes(o.status) || o.refunded_at) throw new OrderError('This order can’t be refunded.', 409, 'NOT_REFUNDABLE');

    const { data: buyer } = o.buyer_org_id
        ? await supabase.from('organizations').select('public_username, lenco_subaccount_id').eq('id', o.buyer_org_id).maybeSingle()
        : { data: null as any };
    if (!buyer?.public_username || !buyer?.lenco_subaccount_id) throw new OrderError('The buyer’s wallet can’t receive a refund automatically. Contact MoneyWise support to refund this order.', 409, 'BUYER_UNREACHABLE');

    const amount = round2(o.delivery_method === 'OPUS' ? o.item_total : o.total);
    const wallets = await payLinkService.payerWallets(ctx.orgId);
    const wallet = walletId ? wallets.find((w) => w.id === walletId) : wallets.find((w) => w.is_main) ?? wallets[0];
    if (!wallet) throw new OrderError('Choose a wallet to refund from.', 400, 'WALLET');
    if (wallet.balance + 0.005 < amount) throw new OrderError(`${wallet.name} has K${wallet.balance.toFixed(2)} but the refund is K${amount.toFixed(2)}. Add money or choose another wallet.`, 402, 'INSUFFICIENT');

    const { data: claimed } = await supabase.from('marketplace_orders').update({ refund_started_at: new Date().toISOString() })
        .eq('id', orderId).is('refund_started_at', null).select('id').maybeSingle();
    if (!claimed) throw new OrderError('A refund for this order is already in progress.', 409, 'IN_PROGRESS');

    try {
        const paid = await payLinkService.payWithWallet(
            { organizationId: ctx.orgId, userId: ctx.userId, role: ctx.role, today: new Date().toISOString().split('T')[0] },
            { username: buyer.public_username, amount, purpose: `Refund · ${o.product_name}`, walletId: wallet.id },
        );
        const { data } = await supabase.from('marketplace_orders').update({
            status: 'REFUNDED', refunded_at: new Date().toISOString(), refund_amount: amount, refund_reference: paid.reference,
            dispute_resolved_at: o.status === 'DISPUTED' ? new Date().toISOString() : o.dispute_resolved_at, updated_at: new Date().toISOString(),
        }).eq('id', orderId).select('*').single();
        void cancelStay(orderId);
        void notifyUser(o.buyer_user_id, { title: 'You’ve been refunded', path: '/marketplace/orders', body: `K${amount.toFixed(2)} for ${o.product_name} was sent back to your wallet.` });
        return data;
    } catch (e: any) {
        await supabase.from('marketplace_orders').update({ refund_started_at: null }).eq('id', orderId);
        if (e instanceof PayLinkError) throw new OrderError(e.message, e.httpStatus, e.code);
        throw e;
    }
}

export async function listOrders(ctx: Ctx, role: 'buyer' | 'seller') {
    const q = supabase.from('marketplace_orders').select('*').order('created_at', { ascending: false }).limit(200);
    const { data } = role === 'seller' ? await q.eq('seller_org_id', ctx.orgId) : await q.eq('buyer_user_id', ctx.userId);
    const rows = await Promise.all((data ?? []).map((o) => refreshOrder(o)));
    const orgIds = [...new Set(rows.map((o) => o.seller_org_id))];
    const { data: orgs } = orgIds.length ? await supabase.from('organizations').select('id, name, logo_url').in('id', orgIds) : { data: [] as any[] };
    const byId = new Map((orgs ?? []).map((o: any) => [o.id, o]));
    return rows
        .filter((o) => !['PENDING_PAYMENT', 'FAILED'].includes(o.status) || role === 'buyer')
        .map((o) => ({ ...o, seller_name: byId.get(o.seller_org_id)?.name ?? 'Seller', seller_logo: byId.get(o.seller_org_id)?.logo_url ?? null }));
}
