import { supabase } from '../lib/supabase';
import { payLinkService, PayLinkError } from './payLink.service';
import { notifyUser } from './marketplaceNotify';

/**
 * MoneyWise Ads, phase 1: flat-price Marketplace placements.
 *
 *   FEATURED_ITEM   an item in the "Featured" shelf at the top of the Marketplace home
 *   BOOSTED_ITEM    an item shown first, marked "Sponsored", in Just listed and search results
 *   FEATURED_STORE  the store in the same shelf
 *
 * The seller pays from their MoneyWise wallet to the MoneyWise ads account (MoneyWise Pay, no card). The ad then waits for an admin to
 * approve it; a rejected (or cancelled before review) ad is paid back. Ads only run once ADS_ORG_USERNAME, ADS_ORG_ID and
 * ADS_ADMIN_USER_ID are set: until then the seller sees "opening soon".
 */

export type AdKind = 'FEATURED_ITEM' | 'BOOSTED_ITEM' | 'FEATURED_STORE';
export const KINDS: Record<AdKind, { label: string; perDay: number; blurb: string; needsItem: boolean }> = {
    FEATURED_ITEM: { label: 'Featured item', perDay: 40, needsItem: true, blurb: 'Your item in the Featured shelf at the top of the Marketplace.' },
    BOOSTED_ITEM: { label: 'Boosted item', perDay: 20, needsItem: true, blurb: 'Your item shown first, marked Sponsored, in Just listed and search results.' },
    FEATURED_STORE: { label: 'Featured store', perDay: 100, needsItem: false, blurb: 'Your whole store in the Featured shelf at the top of the Marketplace.' },
};
/** Longer runs cost less a day. */
export const DURATIONS: { days: number; discount: number }[] = [{ days: 3, discount: 0 }, { days: 7, discount: 0.1 }, { days: 14, discount: 0.2 }];
const MAX_START_AHEAD_DAYS = 60;

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t + 2 * 3_600_000).toISOString().split('T')[0]; // Lusaka date

export class AdError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'INVALID') { super(message); }
}

export const priceFor = (kind: AdKind, days: number): number => {
    const d = DURATIONS.find((x) => x.days === days);
    if (!d) throw new AdError('Choose 3, 7 or 14 days.', 400, 'DAYS');
    return round2(KINDS[kind].perDay * days * (1 - d.discount));
};

export interface AdsOrg { orgId: string; username: string; userId: string }
export async function adsOrg(): Promise<AdsOrg | null> {
    const username = String(process.env.ADS_ORG_USERNAME ?? '').trim().replace(/^@/, '');
    const orgId = String(process.env.ADS_ORG_ID ?? '').trim();
    const userId = String(process.env.ADS_ADMIN_USER_ID ?? '').trim();
    if (!username || !orgId || !userId) return null;
    const { data } = await supabase.from('organizations').select('id, lenco_subaccount_id').eq('id', orgId).maybeSingle();
    return data?.lenco_subaccount_id ? { orgId, username, userId } : null;
}

export async function catalog() {
    return {
        enabled: !!(await adsOrg()),
        kinds: (Object.keys(KINDS) as AdKind[]).map((k) => ({
            kind: k, label: KINDS[k].label, blurb: KINDS[k].blurb, needsItem: KINDS[k].needsItem,
            prices: DURATIONS.map((d) => ({ days: d.days, price: priceFor(k, d.days), perDay: round2(priceFor(k, d.days) / d.days) })),
        })),
    };
}

export interface Ctx { userId: string; orgId: string; role: string }

/** Where the campaign is now, from its status and dates. */
export function phaseOf(c: any, today = isoDay(Date.now())): 'PENDING_REVIEW' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'REJECTED' | 'CANCELLED' | 'FAILED' | 'PENDING_PAYMENT' {
    if (c.status === 'APPROVED') return today < c.start_date ? 'SCHEDULED' : today > c.end_date ? 'ENDED' : 'LIVE';
    return c.status;
}

export async function createCampaign(ctx: Ctx, input: { kind: AdKind; productId?: string; days: number; startDate?: string; walletId?: string; idempotencyKey?: string }) {
    if (ctx.role !== 'ADMIN') throw new AdError('Only the account holder can buy ads.', 403, 'FORBIDDEN');
    const ads = await adsOrg();
    if (!ads) throw new AdError('Ads are opening soon.', 409, 'NOT_ENABLED');
    if (!KINDS[input.kind]) throw new AdError('Choose what to promote.', 400, 'KIND');
    if (ads.orgId === ctx.orgId) throw new AdError('This is the ads account itself.', 400, 'OWN');

    const key = String(input.idempotencyKey ?? '').trim() || null;
    if (key) {
        const { data: prior } = await supabase.from('ad_campaigns').select('*').eq('idempotency_key', key).maybeSingle();
        if (prior) { if (prior.created_by !== ctx.userId) throw new AdError('That request isn’t yours.', 403, 'FORBIDDEN'); return prior; }
    }

    const price = priceFor(input.kind, input.days);
    const today = isoDay(Date.now());
    const start = input.startDate && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ? input.startDate : today;
    if (start < today) throw new AdError('The start date can’t be in the past.', 400, 'DATE');
    if (start > isoDay(Date.now() + MAX_START_AHEAD_DAYS * DAY)) throw new AdError(`Ads can be booked up to ${MAX_START_AHEAD_DAYS} days ahead.`, 400, 'DATE');
    const end = isoDay(Date.parse(start) + (input.days - 1) * DAY);

    let product: any = null;
    if (KINDS[input.kind].needsItem) {
        const { data } = await supabase.from('products').select('id, name, organization_id, is_active, marketplace_listed').eq('id', input.productId ?? '').maybeSingle();
        if (!data || data.organization_id !== ctx.orgId) throw new AdError('Choose one of your own items.', 400, 'ITEM');
        if (!data.is_active || !data.marketplace_listed) throw new AdError('That item has to be active and listed on the Marketplace first.', 409, 'ITEM_NOT_LISTED');
        product = data;
    } else {
        const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.orgId).eq('is_active', true).eq('marketplace_listed', true);
        if (!count) throw new AdError('List at least one item on the Marketplace before promoting your store.', 409, 'NO_LISTINGS');
    }

    const wallets = await payLinkService.payerWallets(ctx.orgId);
    const wallet = input.walletId ? wallets.find((w) => w.id === input.walletId) : wallets.find((w) => w.is_main) ?? wallets[0];
    if (!wallet) throw new AdError('Choose one of your wallets to pay from.', 400, 'WALLET');
    if (wallet.balance + 0.005 < price) throw new AdError(`${wallet.name} has K${wallet.balance.toFixed(2)} but this ad is K${price.toFixed(2)}. Add money or choose another wallet.`, 402, 'INSUFFICIENT');

    const { data: row, error } = await supabase.from('ad_campaigns').insert({
        organization_id: ctx.orgId, created_by: ctx.userId, kind: input.kind, product_id: product?.id ?? null, days: input.days, start_date: start, end_date: end, price,
        status: 'PENDING_PAYMENT', idempotency_key: key,
    }).select('*').single();
    if (error) throw error;

    try {
        const paid = await payLinkService.payWithWallet(
            { organizationId: ctx.orgId, userId: ctx.userId, role: ctx.role, today },
            { username: ads.username, amount: price, purpose: `MoneyWise Ads · ${KINDS[input.kind].label}${product ? ` · ${product.name}` : ''}`.slice(0, 120), walletId: wallet.id },
        );
        const { data: updated } = await supabase.from('ad_campaigns').update({ status: 'PENDING_REVIEW', requisition_id: paid.requisitionId, payment_reference: paid.reference, updated_at: new Date().toISOString() }).eq('id', row.id).select('*').single();
        return updated;
    } catch (e: any) {
        await supabase.from('ad_campaigns').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', row.id);
        if (e instanceof PayLinkError) throw new AdError(e.message, e.httpStatus, e.code);
        throw e;
    }
}

/** Sends the seller's payment back from the ads account. */
async function refund(c: any): Promise<string | null> {
    const ads = await adsOrg();
    if (!ads) throw new AdError('Refunds are paused: the ads account isn’t set up.', 409, 'NOT_ENABLED');
    const { data: org } = await supabase.from('organizations').select('public_username, lenco_subaccount_id').eq('id', c.organization_id).maybeSingle();
    if (!org?.public_username || !org.lenco_subaccount_id) throw new AdError('The seller’s wallet can’t receive a refund automatically.', 409, 'SELLER_UNREACHABLE');
    const paid = await payLinkService.payWithWallet(
        { organizationId: ads.orgId, userId: ads.userId, role: 'ADMIN', today: isoDay(Date.now()) },
        { username: org.public_username, amount: Number(c.price), purpose: 'MoneyWise Ads refund' },
    );
    return paid.reference;
}

const hydrate = async (rows: any[]) => {
    const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))];
    const orgIds = [...new Set(rows.map((r) => r.organization_id))];
    const [{ data: prods }, { data: orgs }] = await Promise.all([
        productIds.length ? supabase.from('products').select('id, name, image_url').in('id', productIds) : Promise.resolve({ data: [] as any[] }),
        orgIds.length ? supabase.from('organizations').select('id, name').in('id', orgIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const pm = new Map((prods ?? []).map((p: any) => [p.id, p])), om = new Map((orgs ?? []).map((o: any) => [o.id, o]));
    return rows.map((r) => ({
        ...r, phase: phaseOf(r), label: KINDS[r.kind as AdKind]?.label ?? r.kind,
        product_name: pm.get(r.product_id)?.name ?? null, product_image: pm.get(r.product_id)?.image_url ?? null, store_name: om.get(r.organization_id)?.name ?? 'Store',
        ctr: r.impressions > 0 ? Math.round((r.clicks / r.impressions) * 1000) / 10 : 0,
    }));
};

export async function myCampaigns(orgId: string) {
    const { data, error } = await supabase.from('ad_campaigns').select('*').eq('organization_id', orgId).neq('status', 'PENDING_PAYMENT').order('created_at', { ascending: false }).limit(100);
    if (error) { if (/ad_campaigns/i.test(error.message)) return []; throw error; }
    return hydrate(data ?? []);
}

/** A seller can withdraw an ad that hasn't been reviewed yet, and gets the money back. */
export async function cancelCampaign(ctx: Ctx, id: string) {
    const { data: c } = await supabase.from('ad_campaigns').select('*').eq('id', id).maybeSingle();
    if (!c || c.organization_id !== ctx.orgId || ctx.role !== 'ADMIN') throw new AdError('Campaign not found.', 404, 'NOT_FOUND');
    if (c.status !== 'PENDING_REVIEW') throw new AdError('Only an ad waiting for review can be cancelled.', 409, 'NOT_CANCELLABLE');
    const { data: claimed } = await supabase.from('ad_campaigns').update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'PENDING_REVIEW').select('id').maybeSingle();
    if (!claimed) throw new AdError('This ad was just reviewed.', 409, 'CHANGED');
    try {
        const reference = await refund(c);
        await supabase.from('ad_campaigns').update({ refunded_at: new Date().toISOString(), refund_reference: reference }).eq('id', id);
    } catch (e) {
        await supabase.from('ad_campaigns').update({ status: 'PENDING_REVIEW' }).eq('id', id);
        throw e;
    }
    return { ok: true };
}

/* ── Admin review ── */

export async function pendingCampaigns() {
    const { data, error } = await supabase.from('ad_campaigns').select('*').eq('status', 'PENDING_REVIEW').order('created_at', { ascending: true }).limit(200);
    if (error) { if (/ad_campaigns/i.test(error.message)) return []; throw error; }
    return hydrate(data ?? []);
}

export async function recentReviewed() {
    const { data } = await supabase.from('ad_campaigns').select('*').in('status', ['APPROVED', 'REJECTED']).order('reviewed_at', { ascending: false }).limit(30);
    return hydrate(data ?? []);
}

export async function reviewCampaign(id: string, decision: 'APPROVE' | 'REJECT', by: string, reason?: string) {
    const { data: c } = await supabase.from('ad_campaigns').select('*').eq('id', id).maybeSingle();
    if (!c) throw new AdError('Campaign not found.', 404, 'NOT_FOUND');
    if (c.status !== 'PENDING_REVIEW') throw new AdError('This ad has already been reviewed.', 409, 'CHANGED');
    const now = new Date().toISOString();

    if (decision === 'APPROVE') {
        // An ad whose start date has passed while waiting starts today and still runs its full length.
        const today = isoDay(Date.now());
        const start = c.start_date < today ? today : c.start_date;
        const end = isoDay(Date.parse(start) + (c.days - 1) * DAY);
        await supabase.from('ad_campaigns').update({ status: 'APPROVED', start_date: start, end_date: end, reviewed_by: by, reviewed_at: now, updated_at: now }).eq('id', id).eq('status', 'PENDING_REVIEW');
        const label = KINDS[c.kind as AdKind]?.label ?? 'Ad';
        const { data: org } = await supabase.from('organizations').select('id').eq('id', c.organization_id).maybeSingle();
        const { data: admins } = org ? await supabase.from('users').select('id').eq('organization_id', org.id).eq('role', 'ADMIN') : { data: [] as any[] };
        for (const a of admins ?? []) void notifyUser(a.id, { title: 'Your ad was approved', path: '/marketplace/ads', body: `${label} runs ${start} to ${end}.` });
        return { ok: true };
    }

    const why = String(reason ?? '').trim().slice(0, 300);
    if (!why) throw new AdError('Say why it was rejected.', 400, 'REASON');
    const { data: claimed } = await supabase.from('ad_campaigns').update({ status: 'REJECTED', reviewed_by: by, reviewed_at: now, reject_reason: why, updated_at: now }).eq('id', id).eq('status', 'PENDING_REVIEW').select('id').maybeSingle();
    if (!claimed) throw new AdError('This ad was just reviewed.', 409, 'CHANGED');
    try {
        const reference = await refund(c);
        await supabase.from('ad_campaigns').update({ refunded_at: now, refund_reference: reference }).eq('id', id);
    } catch (e) {
        await supabase.from('ad_campaigns').update({ status: 'PENDING_REVIEW', reviewed_by: null, reviewed_at: null, reject_reason: null }).eq('id', id);
        throw e;
    }
    const { data: admins } = await supabase.from('users').select('id').eq('organization_id', c.organization_id).eq('role', 'ADMIN');
    for (const a of admins ?? []) void notifyUser(a.id, { title: 'Your ad wasn’t approved', path: '/marketplace/ads', body: `${why} Your payment was returned to your wallet.` });
    return { ok: true };
}

/* ── What runs on the Marketplace ── */

export interface RunningAds { featuredItems: { campaignId: string; productId: string }[]; boostedItems: { campaignId: string; productId: string }[]; featuredStores: { campaignId: string; orgId: string }[] }

/** Approved ads whose dates include today. */
export async function runningAds(): Promise<RunningAds> {
    const today = isoDay(Date.now());
    const { data, error } = await supabase.from('ad_campaigns').select('id, kind, product_id, organization_id').eq('status', 'APPROVED').lte('start_date', today).gte('end_date', today).limit(200);
    const out: RunningAds = { featuredItems: [], boostedItems: [], featuredStores: [] };
    if (error) return out; // no table yet: nothing runs
    for (const c of data ?? []) {
        if (c.kind === 'FEATURED_ITEM' && c.product_id) out.featuredItems.push({ campaignId: c.id, productId: c.product_id });
        else if (c.kind === 'BOOSTED_ITEM' && c.product_id) out.boostedItems.push({ campaignId: c.id, productId: c.product_id });
        else if (c.kind === 'FEATURED_STORE') out.featuredStores.push({ campaignId: c.id, orgId: c.organization_id });
    }
    return out;
}

/** Counts a view or a click on an ad. Failures are ignored: tracking never gets in the way of browsing. */
export async function recordAdEvents(ids: string[], kind: 'impression' | 'click') {
    await Promise.all([...new Set(ids)].slice(0, 30).map((id) => supabase.rpc('bump_ad', { p_id: id, p_kind: kind }).then(() => undefined, () => undefined)));
}
