/**
 * Requests for quote. A buyer asks for a price for a quantity of something ("500 hollow blocks delivered to Kabwe by Friday"). Suppliers
 * reply with a quote. The buyer accepts one. A quote from a MoneyWise supplier then becomes a private one-off listing at the quoted price,
 * so it is paid through the normal checkout with buyer protection; a quote the team took by phone just shares the supplier's contact.
 * Every quote on a catalogue product also adds a price record, so quotes feed the price comparison.
 */
import { supabase } from '../lib/supabase';
import { notifySeller, notifyUser } from './marketplaceNotify';
import { getItem, savePricePoint } from './priceCompare.service';

export class RfqError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'RFQ') { super(message); }
}
export interface Ctx { userId: string; orgId: string; role: string; name: string }

const DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clean = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n) || null;
const money = (n: number) => `K${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qtyText = (n: number) => (Number.isInteger(Number(n)) ? String(Number(n)) : String(round2(Number(n))));
const missingTable = (e: any) => /rfq_requests|rfq_quotes|schema cache|does not exist/i.test(String(e?.message ?? ''));
const today = () => new Date().toISOString().slice(0, 10);

const newReference = () => `RFQ-${Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')}`;

/** Requests past their deadline stop taking quotes. */
async function closeExpired(): Promise<void> {
    await supabase.from('rfq_requests').update({ status: 'EXPIRED', updated_at: new Date().toISOString() }).eq('status', 'OPEN').lt('expires_at', new Date().toISOString()).then(() => undefined, () => undefined);
}

/* ───────────── Asking ───────────── */

export interface RfqInput { catalogItemId?: string; title?: string; quantity?: number; unit?: string; deliveryTown?: string; deliveryProvince?: string; deliveryAddress?: string; neededBy?: string; details?: string; phone?: string; days?: number }

export async function createRfq(ctx: Ctx, input: RfqInput) {
    if (!ctx.orgId) throw new RfqError('Sign in to a business or personal account first.', 400, 'NO_ORG');
    const quantity = num(input.quantity);
    if (!(quantity > 0) || quantity > 1_000_000) throw new RfqError('How many do you need?', 400, 'QUANTITY');
    let title = clean(input.title, 120);
    let unit = clean(input.unit, 30);
    let itemId: string | null = null;
    let category: string | null = null;
    if (input.catalogItemId) {
        const item = await getItem(input.catalogItemId);
        itemId = item.id; title = title ?? item.name; unit = unit ?? item.unit; category = item.category;
    }
    if (!title) throw new RfqError('Say what you need.', 400, 'TITLE');
    if (!unit) throw new RfqError('Say how it is counted (bags, pieces, tonnes…).', 400, 'UNIT');
    const town = clean(input.deliveryTown, 60);
    if (!town) throw new RfqError('Where should it be delivered?', 400, 'TOWN');
    const needed = clean(input.neededBy, 10);
    if (needed && (!/^\d{4}-\d{2}-\d{2}$/.test(needed) || needed < today())) throw new RfqError('The date needed can’t be in the past.', 400, 'DATE');
    const days = Math.min(30, Math.max(1, Math.floor(num(input.days) || 7)));

    const { data: row, error } = await supabase.from('rfq_requests').insert({
        reference: newReference(), buyer_org_id: ctx.orgId, buyer_user_id: ctx.userId, buyer_name: ctx.name, buyer_phone: clean(input.phone, 30),
        catalog_item_id: itemId, title, details: clean(input.details, 600), quantity, unit, delivery_town: town, delivery_province: clean(input.deliveryProvince, 60),
        delivery_address: clean(input.deliveryAddress, 200), needed_by: needed, expires_at: new Date(Date.now() + days * DAY).toISOString(),
    }).select('*').single();
    if (error) { if (missingTable(error)) throw new RfqError('Requests for quote are opening soon.', 409, 'NOT_READY'); throw error; }

    void notifyMatchingSuppliers(row, category);
    return row;
}

/** Tells sellers who list this product (or something in its category) that someone wants a quote. */
async function notifyMatchingSuppliers(rfq: any, category: string | null): Promise<void> {
    try {
        const orgs = new Set<string>();
        if (rfq.catalog_item_id) {
            const { data } = await supabase.from('products').select('organization_id').eq('catalog_item_id', rfq.catalog_item_id).eq('is_active', true).limit(100);
            (data ?? []).forEach((p: any) => orgs.add(p.organization_id));
            if (category) {
                const { data: same } = await supabase.from('catalog_items').select('id').eq('category', category).limit(100);
                const ids = (same ?? []).map((i: any) => i.id);
                if (ids.length) { const { data: p2 } = await supabase.from('products').select('organization_id').in('catalog_item_id', ids).eq('is_active', true).limit(200); (p2 ?? []).forEach((p: any) => orgs.add(p.organization_id)); }
            }
        }
        orgs.delete(rfq.buyer_org_id);
        for (const orgId of [...orgs].slice(0, 40)) {
            void notifySeller(orgId, { title: 'New request for a quote', body: `Someone needs ${qtyText(rfq.quantity)} ${rfq.unit} of ${rfq.title}, delivered to ${rfq.delivery_town}. Send your price.`, path: `/marketplace/requests/${rfq.id}` });
        }
    } catch (e: any) { console.warn('[RFQ] could not notify suppliers:', e?.message); }
}

/* ───────────── Reading ───────────── */

export async function myRequests(ctx: Ctx) {
    await closeExpired();
    const { data, error } = await supabase.from('rfq_requests').select('*').eq('buyer_org_id', ctx.orgId).order('created_at', { ascending: false }).limit(100);
    if (error) { if (missingTable(error)) return { requests: [], needsMigration: true }; throw error; }
    const ids = (data ?? []).map((r: any) => r.id);
    const { data: quotes } = ids.length ? await supabase.from('rfq_quotes').select('rfq_id, total, status').in('rfq_id', ids) : { data: [] as any[] };
    return {
        needsMigration: false,
        requests: (data ?? []).map((r: any) => {
            const qs = (quotes ?? []).filter((q: any) => q.rfq_id === r.id && ['SUBMITTED', 'ACCEPTED'].includes(q.status));
            return { ...r, quoteCount: qs.length, bestTotal: qs.length ? Math.min(...qs.map((q: any) => num(q.total))) : null };
        }),
    };
}

/** Open requests from other people: what a supplier can answer. */
export async function board(ctx: Ctx) {
    await closeExpired();
    const { data, error } = await supabase.from('rfq_requests').select('id, reference, title, quantity, unit, delivery_town, delivery_province, needed_by, expires_at, created_at, catalog_item_id, buyer_org_id').eq('status', 'OPEN').neq('buyer_org_id', ctx.orgId).order('created_at', { ascending: false }).limit(100);
    if (error) { if (missingTable(error)) return { requests: [], needsMigration: true }; throw error; }
    const ids = (data ?? []).map((r: any) => r.id);
    const { data: mine } = ids.length ? await supabase.from('rfq_quotes').select('rfq_id, status, total').eq('supplier_org_id', ctx.orgId).in('rfq_id', ids) : { data: [] as any[] };
    const mineBy = new Map<string, any>((mine ?? []).map((q: any) => [q.rfq_id, q]));
    return { needsMigration: false, requests: (data ?? []).map((r: any) => ({ ...r, buyer_org_id: undefined, myQuote: mineBy.get(r.id) ? { status: mineBy.get(r.id).status, total: num(mineBy.get(r.id).total) } : null })) };
}

export async function getRfq(ctx: Ctx, id: string) {
    await closeExpired();
    const { data: rfq } = await supabase.from('rfq_requests').select('*').eq('id', id).maybeSingle();
    if (!rfq) throw new RfqError('That request can’t be found.', 404, 'NOT_FOUND');
    const isBuyer = rfq.buyer_org_id === ctx.orgId;
    const { data: all } = await supabase.from('rfq_quotes').select('*').eq('rfq_id', id).order('total', { ascending: true });
    const quotes = (all ?? []).filter((q: any) => q.status !== 'WITHDRAWN');

    const item = rfq.catalog_item_id ? await getItem(rfq.catalog_item_id).catch(() => null) : null;
    const view = (q: any, reveal: boolean) => ({
        id: q.id, supplierName: q.supplier_name, supplierPhone: reveal ? q.supplier_phone : null, onMoneyWise: !!q.supplier_org_id, unitPrice: num(q.unit_price), quantity: num(q.quantity), deliveryFee: num(q.delivery_fee),
        total: num(q.total), delivers: !!q.delivers, validUntil: q.valid_until, note: q.note, status: q.status, payPath: q.status === 'ACCEPTED' && q.product_id ? `/marketplace/checkout/${q.product_id}` : null, createdAt: q.created_at,
    });
    const base = {
        id: rfq.id, reference: rfq.reference, title: rfq.title, details: rfq.details, quantity: num(rfq.quantity), unit: rfq.unit, deliveryTown: rfq.delivery_town, deliveryProvince: rfq.delivery_province,
        deliveryAddress: isBuyer ? rfq.delivery_address : null, neededBy: rfq.needed_by, status: rfq.status, expiresAt: rfq.expires_at, createdAt: rfq.created_at, catalogItem: item,
    };
    if (isBuyer) {
        const live = quotes.filter((q: any) => q.status === 'SUBMITTED' || q.status === 'ACCEPTED');
        const best = live.length ? Math.min(...live.map((q: any) => num(q.total))) : null;
        // The accepted supplier's contact is shown to the buyer once they have chosen; before that the supplier is only a name.
        return { role: 'BUYER' as const, request: base, quotes: quotes.map((q: any) => ({ ...view(q, q.status === 'ACCEPTED'), cheapest: best !== null && num(q.total) === best && q.status !== 'DECLINED', extraVsBest: best !== null ? round2(num(q.total) - best) : null })), buyer: null };
    }
    const mine = quotes.find((q: any) => q.supplier_org_id === ctx.orgId) ?? null;
    const awardedToMe = mine?.status === 'ACCEPTED';
    return {
        role: 'SUPPLIER' as const, request: base, quotes: mine ? [view(mine, true)] : [],
        buyer: awardedToMe ? { name: rfq.buyer_name, phone: rfq.buyer_phone, address: rfq.delivery_address } : null,
    };
}

/* ───────────── Quoting ───────────── */

export interface QuoteInput { unitPrice?: number; deliveryFee?: number; delivers?: boolean; validUntil?: string; note?: string }

function checkQuote(rfq: any, input: QuoteInput) {
    const unit = num(input.unitPrice);
    if (!(unit > 0)) throw new RfqError('Enter your price for one ' + rfq.unit + '.', 400, 'PRICE');
    const fee = Math.max(0, num(input.deliveryFee));
    const valid = clean(input.validUntil, 10);
    if (valid && (!/^\d{4}-\d{2}-\d{2}$/.test(valid) || valid < today())) throw new RfqError('The “valid until” date can’t be in the past.', 400, 'DATE');
    const qty = num(rfq.quantity);
    return { unit: round2(unit), fee: round2(fee), valid, qty, total: round2(unit * qty + fee), delivers: input.delivers === true || fee > 0, note: clean(input.note, 300) };
}

/** Records the quote as a price on the product, so it shows in the comparison. Never fails the quote. */
async function syncPricePoint(rfq: any, q: { supplierName: string; supplierPhone: string | null; orgId: string | null; unit: number; qty: number; delivers: boolean; town: string | null; province: string | null }, existingId: string | null, by: string): Promise<string | null> {
    if (!rfq.catalog_item_id) return null;
    try {
        const body = { catalogItemId: rfq.catalog_item_id, placeName: q.supplierName, town: q.town ?? rfq.delivery_town, province: q.province ?? rfq.delivery_province, phone: q.supplierPhone, price: q.unit, minQty: q.qty > 1 ? Math.floor(q.qty) : undefined, delivers: q.delivers, sourceType: 'RFQ_QUOTE', observedOn: today(), status: 'ACTIVE' };
        const p = existingId ? await savePricePoint(body, by, existingId) : await savePricePoint(body, by);
        if (!existingId && q.orgId) await supabase.from('price_points').update({ org_id: q.orgId }).eq('id', p.id);
        return p.id;
    } catch (e: any) { console.warn('[RFQ] could not record the price:', e?.message); return existingId; }
}

export async function submitQuote(ctx: Ctx, rfqId: string, input: QuoteInput) {
    if (ctx.role !== 'ADMIN') throw new RfqError('Only the account holder can send a quote.', 403, 'FORBIDDEN');
    await closeExpired();
    const { data: rfq } = await supabase.from('rfq_requests').select('*').eq('id', rfqId).maybeSingle();
    if (!rfq) throw new RfqError('That request can’t be found.', 404, 'NOT_FOUND');
    if (rfq.buyer_org_id === ctx.orgId) throw new RfqError('You can’t quote on your own request.', 403, 'OWN');
    if (rfq.status !== 'OPEN') throw new RfqError('This request is no longer taking quotes.', 409, 'CLOSED');
    const c = checkQuote(rfq, input);

    const [{ data: org }, { data: prof }, { data: existing }] = await Promise.all([
        supabase.from('organizations').select('id, name, phone').eq('id', ctx.orgId).maybeSingle(),
        supabase.from('business_profiles').select('city, province, phone').eq('organization_id', ctx.orgId).maybeSingle(),
        supabase.from('rfq_quotes').select('*').eq('rfq_id', rfqId).eq('supplier_org_id', ctx.orgId).maybeSingle(),
    ]);
    if (existing && existing.status !== 'SUBMITTED' && existing.status !== 'WITHDRAWN') throw new RfqError('That quote has already been decided.', 409, 'DECIDED');
    const name = org?.name ?? ctx.name; const phone = prof?.phone ?? org?.phone ?? null;
    const row = { supplier_name: name, supplier_phone: phone, unit_price: c.unit, quantity: c.qty, delivery_fee: c.fee, total: c.total, delivers: c.delivers, valid_until: c.valid, note: c.note, status: 'SUBMITTED', updated_at: new Date().toISOString() };
    const pricePointId = await syncPricePoint(rfq, { supplierName: name, supplierPhone: phone, orgId: ctx.orgId, unit: c.unit, qty: c.qty, delivers: c.delivers, town: prof?.city ?? null, province: prof?.province ?? null }, existing?.price_point_id ?? null, ctx.userId);
    const { data: quote, error } = existing
        ? await supabase.from('rfq_quotes').update({ ...row, price_point_id: pricePointId }).eq('id', existing.id).select('*').single()
        : await supabase.from('rfq_quotes').insert({ ...row, rfq_id: rfqId, supplier_org_id: ctx.orgId, created_by: ctx.userId, price_point_id: pricePointId }).select('*').single();
    if (error) throw error;

    void notifyUser(rfq.buyer_user_id, { title: `New quote for ${rfq.title}`, body: `${name} quoted ${money(c.total)} for ${qtyText(rfq.quantity)} ${rfq.unit}${c.delivers ? ' with delivery' : ''}.`, path: `/marketplace/requests/${rfq.id}`, orgId: rfq.buyer_org_id });
    return quote;
}

export async function withdrawQuote(ctx: Ctx, quoteId: string) {
    const { data: q } = await supabase.from('rfq_quotes').select('*').eq('id', quoteId).maybeSingle();
    if (!q || q.supplier_org_id !== ctx.orgId) throw new RfqError('That quote can’t be found.', 404, 'NOT_FOUND');
    if (q.status !== 'SUBMITTED') throw new RfqError('That quote can no longer be withdrawn.', 409, 'DECIDED');
    await supabase.from('rfq_quotes').update({ status: 'WITHDRAWN', updated_at: new Date().toISOString() }).eq('id', quoteId);
    if (q.price_point_id) await supabase.from('price_points').update({ status: 'EXPIRED', updated_at: new Date().toISOString() }).eq('id', q.price_point_id);
    return { ok: true };
}

/** The team's view: every open request, whoever asked, so quotes can be collected by phone. */
export async function adminOpen() {
    await closeExpired();
    const { data, error } = await supabase.from('rfq_requests').select('id, reference, title, quantity, unit, delivery_town, delivery_province, needed_by, expires_at, buyer_name, buyer_phone, created_at').eq('status', 'OPEN').order('created_at', { ascending: false }).limit(100);
    if (error) { if (missingTable(error)) return { requests: [], needsMigration: true }; throw error; }
    const ids = (data ?? []).map((r: any) => r.id);
    const { data: qs } = ids.length ? await supabase.from('rfq_quotes').select('rfq_id, status').in('rfq_id', ids) : { data: [] as any[] };
    return { needsMigration: false, requests: (data ?? []).map((r: any) => ({ ...r, quoteCount: (qs ?? []).filter((q: any) => q.rfq_id === r.id && q.status === 'SUBMITTED').length })) };
}

/** The team enters a quote taken by phone from a supplier that isn't on MoneyWise. */
export async function teamAddQuote(rfqId: string, input: QuoteInput & { supplierName?: string; supplierPhone?: string }, by: string) {
    const { data: rfq } = await supabase.from('rfq_requests').select('*').eq('id', rfqId).maybeSingle();
    if (!rfq) throw new RfqError('That request can’t be found.', 404, 'NOT_FOUND');
    if (rfq.status !== 'OPEN') throw new RfqError('This request is no longer taking quotes.', 409, 'CLOSED');
    const name = clean(input.supplierName, 120);
    if (!name) throw new RfqError('Who is the supplier?', 400, 'SUPPLIER');
    const c = checkQuote(rfq, input);
    const phone = clean(input.supplierPhone, 30);
    const pricePointId = await syncPricePoint(rfq, { supplierName: name, supplierPhone: phone, orgId: null, unit: c.unit, qty: c.qty, delivers: c.delivers, town: null, province: null }, null, by);
    const { data, error } = await supabase.from('rfq_quotes').insert({
        rfq_id: rfqId, supplier_org_id: null, supplier_name: name, supplier_phone: phone, unit_price: c.unit, quantity: c.qty, delivery_fee: c.fee, total: c.total, delivers: c.delivers,
        valid_until: c.valid, note: c.note, created_by: /^[0-9a-f-]{36}$/i.test(by) ? by : null, price_point_id: pricePointId,
    }).select('*').single();
    if (error) throw error;
    void notifyUser(rfq.buyer_user_id, { title: `New quote for ${rfq.title}`, body: `${name} quoted ${money(c.total)} for ${qtyText(rfq.quantity)} ${rfq.unit}.`, path: `/marketplace/requests/${rfq.id}`, orgId: rfq.buyer_org_id });
    return data;
}

/* ───────────── Deciding ───────────── */

export async function acceptQuote(ctx: Ctx, quoteId: string) {
    if (ctx.role !== 'ADMIN') throw new RfqError('Only the account holder can accept a quote.', 403, 'FORBIDDEN');
    await closeExpired();
    const { data: q } = await supabase.from('rfq_quotes').select('*').eq('id', quoteId).maybeSingle();
    if (!q) throw new RfqError('That quote can’t be found.', 404, 'NOT_FOUND');
    const { data: rfq } = await supabase.from('rfq_requests').select('*').eq('id', q.rfq_id).maybeSingle();
    if (!rfq || rfq.buyer_org_id !== ctx.orgId) throw new RfqError('That quote can’t be found.', 404, 'NOT_FOUND');
    if (rfq.status !== 'OPEN') throw new RfqError('This request has already been decided or has ended.', 409, 'CLOSED');
    if (q.status !== 'SUBMITTED') throw new RfqError('That quote is no longer open.', 409, 'DECIDED');
    if (q.valid_until && q.valid_until < today()) throw new RfqError('That quote has expired. Ask the supplier for a new one.', 409, 'EXPIRED');

    // A MoneyWise supplier's quote becomes a private one-off listing at the quoted price, paid through the normal checkout.
    let productId: string | null = null;
    if (q.supplier_org_id) {
        const { data: product, error: pe } = await supabase.from('products').insert({
            organization_id: q.supplier_org_id, name: `${qtyText(q.quantity)} × ${rfq.title} (${rfq.reference})`, description: `Quoted for ${rfq.buyer_name ?? 'a buyer'}. ${rfq.details ?? ''}`.trim(),
            price: round2(num(q.unit_price) * num(q.quantity)), product_type: 'PRODUCT', is_active: true, marketplace_listed: false,
            requires_delivery: !!q.delivers, own_delivery_charge: num(q.delivery_fee), category: null,
        }).select('id').single();
        if (pe) throw pe;
        productId = product.id;
    }
    // Only one quote can win: the update names the status it expects, so two clicks can't both succeed.
    const { data: won } = await supabase.from('rfq_quotes').update({ status: 'ACCEPTED', product_id: productId, updated_at: new Date().toISOString() }).eq('id', quoteId).eq('status', 'SUBMITTED').select('id');
    if (!won?.length) { if (productId) await supabase.from('products').delete().eq('id', productId); throw new RfqError('That quote is no longer open.', 409, 'DECIDED'); }
    const now = new Date().toISOString();
    await supabase.from('rfq_requests').update({ status: 'AWARDED', awarded_quote_id: quoteId, updated_at: now }).eq('id', rfq.id);
    const { data: others } = await supabase.from('rfq_quotes').update({ status: 'DECLINED', updated_at: now }).eq('rfq_id', rfq.id).eq('status', 'SUBMITTED').neq('id', quoteId).select('supplier_org_id');

    if (q.supplier_org_id) void notifySeller(q.supplier_org_id, { title: 'Your quote was accepted', body: `${rfq.buyer_name ?? 'The buyer'} accepted your quote of ${money(q.total)} for ${rfq.title}. They can now pay through MoneyWise.`, path: `/marketplace/requests/${rfq.id}` });
    for (const o of others ?? []) if (o.supplier_org_id) void notifySeller(o.supplier_org_id, { title: 'Request closed', body: `${rfq.title}: the buyer chose another quote.`, path: '/marketplace/requests' });

    return { accepted: q.id, payPath: productId ? `/marketplace/checkout/${productId}` : null, supplier: { name: q.supplier_name, phone: q.supplier_phone, onMoneyWise: !!q.supplier_org_id }, total: num(q.total) };
}

export async function cancelRfq(ctx: Ctx, id: string) {
    const { data: rfq } = await supabase.from('rfq_requests').select('buyer_org_id, status').eq('id', id).maybeSingle();
    if (!rfq || rfq.buyer_org_id !== ctx.orgId) throw new RfqError('That request can’t be found.', 404, 'NOT_FOUND');
    if (rfq.status !== 'OPEN') throw new RfqError('That request has already ended.', 409, 'CLOSED');
    const now = new Date().toISOString();
    await supabase.from('rfq_requests').update({ status: 'CANCELLED', updated_at: now }).eq('id', id);
    await supabase.from('rfq_quotes').update({ status: 'DECLINED', updated_at: now }).eq('rfq_id', id).eq('status', 'SUBMITTED');
    return { ok: true };
}
