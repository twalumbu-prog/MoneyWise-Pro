import { supabase } from '../lib/supabase';
import { loadCustomerData, CustomerWithStats } from '../controllers/crm.controller';
import { loadSubscriptionPayments, subscriptionProductItem } from './blueOpusCrm.service';

/**
 * Customer loyalty, derived entirely from existing data (no new tables): every paid purchase a
 * customer made — store checkouts, paid payment links, credit-sale invoices and any other cashbook
 * inflow — is folded into one "order" per reference, then rolled up into purchase frequency,
 * favourite products and a loyalty segment.
 */

export type LoyaltySegment = 'CHAMPION' | 'LOYAL' | 'NEW' | 'OCCASIONAL' | 'AT_RISK' | 'LAPSED' | 'PROSPECT';

export const LOYALTY_SEGMENTS: { value: LoyaltySegment; label: string; hint: string }[] = [
    { value: 'CHAMPION', label: 'Champions', hint: '5+ purchases, bought in the last 30 days' },
    { value: 'LOYAL', label: 'Loyal', hint: '3+ purchases, bought in the last 90 days' },
    { value: 'NEW', label: 'New', hint: 'First purchase in the last 30 days' },
    { value: 'OCCASIONAL', label: 'Occasional', hint: 'Bought in the last 90 days, but not often' },
    { value: 'AT_RISK', label: 'At risk', hint: 'Repeat buyers silent for 3–6 months' },
    { value: 'LAPSED', label: 'Lapsed', hint: 'No purchase in over 6 months' },
    { value: 'PROSPECT', label: 'No purchases yet', hint: 'In the CRM but never bought' },
];

const DAY_MS = 86_400_000;
// Zambia is UTC+2 year-round; bucket purchases by the local calendar day so a 23:30 sale lands on the right square.
const LOCAL_OFFSET_MS = 2 * 3_600_000;
const HEATMAP_DAYS = 371; // 53 weeks, like GitHub's contribution graph
const NON_PAID_SALE_STATUSES = new Set(['PENDING', 'FAILED', 'CANCELLED', 'CANCELED', 'EXPIRED']);

const localDay = (t: number) => new Date(t + LOCAL_OFFSET_MS).toISOString().slice(0, 10);
const normalizePhone = (p?: string | null) => (p ? p.replace(/\D/g, '').slice(-9) : '');

interface OrderItem { key: string; name: string; quantity: number; amount: number }
interface Order {
    ref: string;
    source: 'LINK' | 'INVOICE' | 'SALE' | 'CASHBOOK' | 'SUBSCRIPTION';
    customerId: string;
    at: number;
    amount: number;
    items: OrderItem[];
}

export interface FavouriteProduct {
    key: string;
    name: string;
    times_bought: number; // distinct orders containing the product
    quantity: number;
    total_spent: number;
    image_url?: string | null;
}

export interface CustomerLoyalty {
    customer_id: string;
    segment: LoyaltySegment;
    order_count: number;
    total_spent: number;
    first_purchase_at: string | null;
    last_purchase_at: string | null;
    days_since_last_purchase: number | null;
    avg_days_between_orders: number | null;
    active_days_last_year: number;
    daily: Record<string, { orders: number; amount: number }>;
    top_products: FavouriteProduct[];
    product_keys: string[];
}

export function classifySegment(orderCount: number, firstAt: number | null, lastAt: number | null, now = Date.now()): LoyaltySegment {
    if (!orderCount || firstAt === null || lastAt === null) return 'PROSPECT';
    const sinceLast = (now - lastAt) / DAY_MS;
    const sinceFirst = (now - firstAt) / DAY_MS;
    if (sinceLast > 180) return 'LAPSED';
    if (orderCount >= 5 && sinceLast <= 30) return 'CHAMPION';
    if (orderCount >= 3 && sinceLast <= 90) return 'LOYAL';
    if (orderCount >= 2 && sinceLast > 90) return 'AT_RISK';
    if (sinceFirst <= 30) return 'NEW';
    return 'OCCASIONAL';
}

const productKey = (id: unknown, name: string) => (id ? String(id) : name.trim().toLowerCase());

export async function computeLoyalty(organizationId: string) {
    const { customers, links, sales, cashbook } = await loadCustomerData(organizationId);

    const { data: invoiceRows } = await supabase
        .from('customer_invoices')
        .select('id, customer_id, customer_name, customer_phone, customer_email, invoice_number, total, items, created_at, status')
        .eq('organization_id', organizationId)
        .neq('status', 'VOID');
    const invoices = invoiceRows || [];

    // Identity index — same keys the CRM list matches on, but each record is credited to ONE customer.
    const byPhone = new Map<string, string>();
    const byEmail = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const c of customers) {
        if (c.product) continue; // Blue Opus product customers are credited by id (below), never by name/email/phone
        const p = normalizePhone(c.phone);
        const e = (c.email || '').trim().toLowerCase();
        const n = c.name.trim().toLowerCase();
        if (p && !byPhone.has(p)) byPhone.set(p, c.id);
        if (e && !byEmail.has(e)) byEmail.set(e, c.id);
        if (n && !byName.has(n)) byName.set(n, c.id);
    }
    const resolve = (name?: string | null, phone?: string | null, email?: string | null): string | undefined => {
        const p = normalizePhone(phone);
        if (p && byPhone.has(p)) return byPhone.get(p);
        const e = (email || '').trim().toLowerCase();
        if (e && byEmail.has(e)) return byEmail.get(e);
        const n = (name || '').trim().toLowerCase();
        if (n && byName.has(n)) return byName.get(n);
        return undefined;
    };

    const orders = new Map<string, Order>();
    const itemsFromJson = (raw: any): OrderItem[] =>
        (Array.isArray(raw) ? raw : []).map((it: any) => {
            const name = String(it.name || 'Item');
            const quantity = Number(it.quantity) || 1;
            return { key: productKey(it.product_id, name), name, quantity, amount: (Number(it.unit_price) || 0) * quantity };
        });

    for (const l of links as any[]) {
        if (l.status !== 'PAID') continue;
        const customerId = resolve(l.customer_name, l.customer_phone, l.customer_email);
        if (!customerId) continue;
        let items = itemsFromJson(l.items);
        if (items.length === 0 && l.products?.name) {
            items = [{ key: productKey(l.product_id, l.products.name), name: l.products.name, quantity: 1, amount: Number(l.amount) || 0 }];
        }
        orders.set(`ref:${l.reference || `link:${l.id}`}`, {
            ref: l.reference || l.id, source: 'LINK', customerId, at: Date.parse(l.paid_at || l.updated_at || l.created_at),
            amount: Number(l.amount) || 0, items,
        });
    }

    for (const i of invoices as any[]) {
        const customerId = (i.customer_id && customers.some(c => c.id === i.customer_id) ? i.customer_id : undefined)
            || resolve(i.customer_name, i.customer_phone, i.customer_email);
        if (!customerId) continue;
        orders.set(`inv:${i.id}`, {
            ref: i.invoice_number || i.id, source: 'INVOICE', customerId, at: Date.parse(i.created_at),
            amount: Number(i.total) || 0, items: itemsFromJson(i.items),
        });
    }

    for (const s of sales as any[]) {
        if (NON_PAID_SALE_STATUSES.has(String(s.status || '').toUpperCase())) continue;
        const customerId = resolve(s.customer_name, s.customer_phone, s.customer_email);
        if (!customerId) continue;
        const key = `ref:${s.reference || `sale:${s.id}`}`;
        const existing = orders.get(key);
        if (existing && existing.source !== 'SALE') continue; // the payment link / invoice already owns this reference
        const name = s.products?.name || 'Item';
        const item: OrderItem = { key: productKey(s.product_id, name), name, quantity: Number(s.quantity) || 1, amount: Number(s.amount_paid) || 0 };
        if (existing) {
            existing.items.push(item);
            existing.amount += item.amount;
        } else {
            orders.set(key, { ref: s.reference || s.id, source: 'SALE', customerId, at: Date.parse(s.created_at), amount: item.amount, items: [item] });
        }
    }

    // Other money in (wallet top-ups, manual receipts) still counts as a visit, minus anything already counted above.
    const seenRefs = new Set<string>();
    for (const o of orders.values()) seenRefs.add(o.ref);
    for (const c of cashbook as any[]) {
        if (c.entry_type && c.entry_type !== 'INFLOW') continue;
        if (!c.sender_name) continue;
        const refs = [c.external_reference, c.reference_number].filter(Boolean) as string[];
        if (refs.some(r => seenRefs.has(r))) continue;
        const customerId = resolve(c.sender_name, c.sender_phone, c.sender_email);
        if (!customerId) continue;
        orders.set(`cb:${c.id}`, {
            ref: refs[0] || c.id, source: 'CASHBOOK', customerId, at: Date.parse(c.created_at || c.date),
            amount: Number(c.amount) || 0, items: [],
        });
    }

    // Blue Opus: subscription payments of MoneyWise accounts / Project Genius users, one order per paid invoice or receipt.
    const productCustomers = customers.filter(c => c.product);
    if (productCustomers.length) {
        const bySource = new Map(productCustomers.map(c => [c.id, c.product]));
        for (const p of await loadSubscriptionPayments(organizationId, productCustomers)) {
            if (!p.paid) continue;
            const item = subscriptionProductItem(bySource.get(p.customerId));
            orders.set(`sub:${p.id}`, {
                ref: p.reference || p.id, source: 'SUBSCRIPTION', customerId: p.customerId, at: Date.parse(p.date),
                amount: p.amount, items: [{ key: item.key, name: item.name, quantity: 1, amount: p.amount }],
            });
        }
    }

    const now = Date.now();
    const windowStart = localDay(now - (HEATMAP_DAYS - 1) * DAY_MS);
    const grouped = new Map<string, Order[]>();
    for (const o of orders.values()) {
        if (!Number.isFinite(o.at)) continue;
        (grouped.get(o.customerId) || grouped.set(o.customerId, []).get(o.customerId)!).push(o);
    }

    const byCustomer = new Map<string, CustomerLoyalty>();
    const productImages = new Map<string, string>();
    {
        const { data: prodRows } = await supabase
            .from('products')
            .select('id, image_url')
            .eq('organization_id', organizationId)
            .not('image_url', 'is', null);
        for (const r of (prodRows || []) as any[]) if (r.image_url) productImages.set(String(r.id), r.image_url);
    }
    // Product options for campaign targeting: how many customers bought each.
    const productBuyers = new Map<string, { key: string; name: string; buyers: number }>();
    for (const c of customers) {
        const list = (grouped.get(c.id) || []).sort((a, b) => a.at - b.at);
        const daily: CustomerLoyalty['daily'] = {};
        const products = new Map<string, FavouriteProduct>();
        let total = 0;
        for (const o of list) {
            total += o.amount;
            const day = localDay(o.at);
            if (day >= windowStart) {
                const d = daily[day] || (daily[day] = { orders: 0, amount: 0 });
                d.orders += 1;
                d.amount += o.amount;
            }
            const inThisOrder = new Set<string>();
            for (const it of o.items) {
                const p = products.get(it.key) || { key: it.key, name: it.name, times_bought: 0, quantity: 0, total_spent: 0 };
                if (!inThisOrder.has(it.key)) { p.times_bought += 1; inThisOrder.add(it.key); }
                p.quantity += it.quantity;
                p.total_spent += it.amount;
                products.set(it.key, p);
                const opt = productBuyers.get(it.key) || { key: it.key, name: it.name, buyers: 0 };
                productBuyers.set(it.key, opt);
            }
        }
        for (const k of products.keys()) productBuyers.get(k)!.buyers += 1;
        const first = list.length ? list[0].at : null;
        const last = list.length ? list[list.length - 1].at : null;
        const topProducts = [...products.values()]
            .sort((a, b) => b.times_bought - a.times_bought || b.quantity - a.quantity || b.total_spent - a.total_spent)
            .slice(0, 5)
            .map(p => ({ ...p, image_url: productImages.get(p.key) ?? null }));
        byCustomer.set(c.id, {
            customer_id: c.id,
            segment: classifySegment(list.length, first, last, now),
            order_count: list.length,
            total_spent: total,
            first_purchase_at: first === null ? null : new Date(first).toISOString(),
            last_purchase_at: last === null ? null : new Date(last).toISOString(),
            days_since_last_purchase: last === null ? null : Math.floor((now - last) / DAY_MS),
            avg_days_between_orders: list.length > 1 && first !== null && last !== null ? Math.round((last - first) / DAY_MS / (list.length - 1)) : null,
            active_days_last_year: Object.keys(daily).length,
            daily,
            top_products: topProducts,
            product_keys: [...products.keys()],
        });
    }

    return {
        customers,
        byCustomer,
        products: [...productBuyers.values()].sort((a, b) => b.buyers - a.buyers).slice(0, 50),
    };
}

export interface CampaignAudience {
    payment?: 'ALL' | 'OWING' | 'CLEAR';
    segments?: LoyaltySegment[];
    product_keys?: string[];
    /** Blue Opus only: restrict to one of its products' customers. */
    product?: 'MONEYWISE' | 'PROJECT_GENIUS';
}

export interface AudienceMember { customer: CustomerWithStats; loyalty: CustomerLoyalty }

/** Everyone matching the audience who can actually be emailed (active, valid address, one send per address). */
export function selectAudience(
    data: Awaited<ReturnType<typeof computeLoyalty>>,
    audience: CampaignAudience,
): { members: AudienceMember[]; matched: number; withoutEmail: number } {
    const segments = new Set(audience.segments || []);
    const products = new Set(audience.product_keys || []);
    const payment = audience.payment || 'ALL';

    const matched: AudienceMember[] = [];
    for (const customer of data.customers) {
        if (customer.status === 'INACTIVE') continue;
        const loyalty = data.byCustomer.get(customer.id);
        if (!loyalty) continue;
        if (audience.product && customer.product !== audience.product) continue;
        if (payment !== 'ALL' && customer.owing_status !== payment) continue;
        if (segments.size && !segments.has(loyalty.segment)) continue;
        if (products.size && !loyalty.product_keys.some(k => products.has(k))) continue;
        matched.push({ customer, loyalty });
    }

    const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seen = new Set<string>();
    const members: AudienceMember[] = [];
    for (const m of matched) {
        const email = (m.customer.email || '').trim().toLowerCase();
        if (!EMAIL.test(email) || seen.has(email)) continue;
        seen.add(email);
        members.push(m);
    }
    return { members, matched: matched.length, withoutEmail: matched.length - members.length };
}
