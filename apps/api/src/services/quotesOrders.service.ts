import { supabase } from '../lib/supabase';
import * as inv from './customerInvoice.service';
import * as purchasing from './purchasing.service';

/**
 * Quotes and purchase orders. Enterprise plan; the routes enforce that.
 * Neither posts to the books. A quote becomes an invoice (which does) when you convert it; a purchase order becomes a bill (which does, and
 * takes stock in) when you receive goods against it, in one go or in parts.
 */

export class QuoteOrderError extends Error { constructor(message: string, readonly httpStatus = 400) { super(message); } }

const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
const text = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n) || null;

async function nextNumber(orgId: string, table: 'quotes' | 'purchase_orders', col: string, prefix: string) {
    const { data } = await supabase.from(table).select(col).eq('organization_id', orgId).range(0, 9999);
    const max = ((data ?? []) as any[]).reduce((m, r) => Math.max(m, Number(String(r[col]).replace(/\D/g, '')) || 0), 0);
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

// ---------- quotes ----------

interface QuoteItem { product_id?: string; custom?: boolean; name?: string; quantity: number; price?: number; income_account_id?: string | null; tax_code?: string }

export async function createQuote(orgId: string, userId: string, body: any) {
    const name = text(body?.customerName, 120);
    if (!name) throw new QuoteOrderError('Add the customer’s name.');
    const raw: QuoteItem[] = Array.isArray(body?.items) ? body.items.slice(0, 100) : [];
    if (!raw.length) throw new QuoteOrderError('Add at least one line to the quote.');
    const productIds = [...new Set(raw.filter((i) => i.product_id).map((i) => i.product_id as string))];
    const { data: prods } = productIds.length ? await supabase.from('products').select('id, name, price, income_account_id').eq('organization_id', orgId).in('id', productIds) : { data: [] as any[] };
    const byId = new Map((prods ?? []).map((p: any) => [p.id, p]));
    const items = raw.map((it, i) => {
        const quantity = Number(it.quantity);
        if (!(quantity > 0)) throw new QuoteOrderError(`Line ${i + 1}: enter a quantity.`);
        if (it.product_id) {
            const p: any = byId.get(it.product_id);
            if (!p) throw new QuoteOrderError(`Line ${i + 1}: that product wasn't found.`);
            const price = Number(it.price) > 0 ? Number(it.price) : Number(p.price) || 0;
            if (!(price > 0)) throw new QuoteOrderError(`Line ${i + 1}: set a price for ${p.name}.`);
            return { product_id: p.id, name: p.name, quantity, price: r2(price), income_account_id: p.income_account_id ?? null, tax_code: it.tax_code };
        }
        const price = Number(it.price), nm = String(it.name ?? '').trim();
        if (!nm) throw new QuoteOrderError(`Line ${i + 1}: describe what is being quoted.`);
        if (!(price > 0)) throw new QuoteOrderError(`Line ${i + 1}: enter a price.`);
        return { custom: true, name: nm.slice(0, 200), quantity, price: r2(price), income_account_id: it.income_account_id ?? null, tax_code: it.tax_code };
    });
    const total = r2(items.reduce((s, l) => s + l.price * l.quantity, 0));
    const issue = isDate(body?.issueDate) ? body.issueDate : today();
    const valid = isDate(body?.validUntil) ? body.validUntil : addDays(issue, 30);
    if (valid < issue) throw new QuoteOrderError('The quote can’t expire before it is issued.');
    const number = await nextNumber(orgId, 'quotes', 'quote_number', 'Q');
    const { data, error } = await supabase.from('quotes').insert({ organization_id: orgId, quote_number: number, customer_id: body?.customerId ?? null, customer_name: name, customer_phone: text(body?.customerPhone, 40), customer_email: text(body?.customerEmail, 160), issue_date: issue, valid_until: valid, items, total, notes: text(body?.notes, 1000), created_by: userId }).select('*').single();
    if (error || !data) throw new QuoteOrderError(error?.message ?? 'Could not save the quote.', 500);
    return data;
}

export async function listQuotes(orgId: string) {
    const { data, error } = await supabase.from('quotes').select('*').eq('organization_id', orgId).order('issue_date', { ascending: false }).order('created_at', { ascending: false }).limit(500);
    if (error) throw new QuoteOrderError(error.message, 500);
    const now = today();
    return (data ?? []).map((q: any) => ({ ...q, expired: q.status === 'OPEN' && q.valid_until < now }));
}

export async function setQuoteStatus(orgId: string, id: string, status: string) {
    if (!['ACCEPTED', 'DECLINED', 'CANCELLED', 'OPEN'].includes(status)) throw new QuoteOrderError('Unknown status.');
    const { data: q } = await supabase.from('quotes').select('status').eq('organization_id', orgId).eq('id', id).maybeSingle();
    if (!q) throw new QuoteOrderError('Quote not found.', 404);
    if (q.status === 'INVOICED') throw new QuoteOrderError('This quote has already become an invoice.');
    const { data } = await supabase.from('quotes').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    return data;
}

/** Turns an accepted (or open) quote into an invoice, using the same lines, and links the two. */
export async function convertQuote(orgId: string, userId: string, id: string, body: any) {
    const { data: q } = await supabase.from('quotes').select('*').eq('organization_id', orgId).eq('id', id).maybeSingle();
    if (!q) throw new QuoteOrderError('Quote not found.', 404);
    if (q.status === 'INVOICED') throw new QuoteOrderError('This quote has already become an invoice.', 409);
    if (q.status === 'DECLINED' || q.status === 'CANCELLED') throw new QuoteOrderError('This quote was turned down or cancelled.');
    const issue = isDate(body?.issueDate) ? body.issueDate : today();
    const followUp = isDate(body?.followUpDate) ? body.followUpDate : addDays(issue, 14);
    const made = await inv.createInvoice(orgId, userId, {
        items: (q.items as any[]).map((i) => ({ ...i })), customer: { id: q.customer_id, name: q.customer_name, phone: q.customer_phone, email: q.customer_email },
        follow_up_date: followUp, issue_date: issue, notes: q.notes ? `${q.notes} (from quote ${q.quote_number})` : `From quote ${q.quote_number}`,
    } as any);
    await supabase.from('quotes').update({ status: 'INVOICED', invoice_id: made.invoice.id, updated_at: new Date().toISOString() }).eq('id', id);
    return { invoice: made.invoice };
}

// ---------- purchase orders ----------

interface PoLine { productId?: string; variantId?: string; accountId?: string; description?: string; quantity?: number; unitCost?: number; taxCode?: string }

export async function createOrder(orgId: string, userId: string, body: any) {
    const { data: supplier } = await supabase.from('suppliers').select('id').eq('organization_id', orgId).eq('id', String(body?.supplierId ?? '')).maybeSingle();
    if (!supplier) throw new QuoteOrderError('Choose a supplier.');
    const raw: PoLine[] = Array.isArray(body?.lines) ? body.lines.slice(0, 200) : [];
    if (!raw.length) throw new QuoteOrderError('Add at least one line to the order.');
    const pids = [...new Set(raw.map((l) => l.productId).filter(Boolean) as string[])];
    const { data: prods } = pids.length ? await supabase.from('products').select('id, name, track_stock, variants').eq('organization_id', orgId).in('id', pids) : { data: [] as any[] };
    const pById = new Map<string, any>((prods ?? []).map((p: any) => [p.id, p]));
    const aids = [...new Set(raw.map((l) => l.accountId).filter(Boolean) as string[])];
    const { data: accts } = aids.length ? await supabase.from('accounts').select('id, type').eq('organization_id', orgId).in('id', aids) : { data: [] as any[] };
    const aById = new Map<string, any>((accts ?? []).map((a: any) => [a.id, a]));
    const lines = raw.map((l, i) => {
        const quantity = Math.floor(Number(l.quantity)), unitCost = r2(Number(l.unitCost));
        if (!(quantity > 0)) throw new QuoteOrderError(`Line ${i + 1}: enter a quantity of at least 1.`);
        if (!(unitCost >= 0)) throw new QuoteOrderError(`Line ${i + 1}: enter the unit cost.`);
        if (l.productId) {
            const p = pById.get(l.productId);
            if (!p) throw new QuoteOrderError(`Line ${i + 1}: that product wasn't found.`);
            if (!p.track_stock) throw new QuoteOrderError(`Line ${i + 1}: turn on stock tracking for “${p.name}” first.`);
            const vs: any[] = Array.isArray(p.variants) ? p.variants : [];
            if (vs.length && !vs.some((v) => v.id === l.variantId)) throw new QuoteOrderError(`Line ${i + 1}: choose which option (colour or size) to order.`);
            const v = vs.find((x) => x.id === l.variantId);
            return { product_id: p.id, variant_id: v?.id ?? null, account_id: null, description: String(l.description || (v ? `${p.name} (${v.name})` : p.name)).slice(0, 200), quantity, unit_cost: unitCost, tax_code: l.taxCode ?? null };
        }
        const a = l.accountId ? aById.get(l.accountId) : null;
        if (!a || a.type !== 'EXPENSE') throw new QuoteOrderError(`Line ${i + 1}: choose a product, or an expense account.`);
        if (!String(l.description ?? '').trim()) throw new QuoteOrderError(`Line ${i + 1}: describe what is being ordered.`);
        return { product_id: null, variant_id: null, account_id: l.accountId!, description: String(l.description).slice(0, 200), quantity, unit_cost: unitCost, tax_code: l.taxCode ?? null };
    });
    const number = await nextNumber(orgId, 'purchase_orders', 'po_number', 'PO');
    const { data: po, error } = await supabase.from('purchase_orders').insert({ organization_id: orgId, supplier_id: supplier.id, po_number: number, order_date: isDate(body?.orderDate) ? body.orderDate : today(), expected_date: isDate(body?.expectedDate) ? body.expectedDate : null, notes: text(body?.notes, 1000), created_by: userId }).select('*').single();
    if (error || !po) throw new QuoteOrderError(error?.message ?? 'Could not save the order.', 500);
    const { error: le } = await supabase.from('purchase_order_lines').insert(lines.map((l) => ({ ...l, po_id: po.id })));
    if (le) { await supabase.from('purchase_orders').delete().eq('id', po.id); throw new QuoteOrderError(le.message, 500); }
    return po;
}

export async function listOrders(orgId: string) {
    const { data, error } = await supabase.from('purchase_orders').select('*, suppliers(name), purchase_order_lines(*)').eq('organization_id', orgId).order('order_date', { ascending: false }).order('created_at', { ascending: false }).limit(500);
    if (error) throw new QuoteOrderError(error.message, 500);
    return (data ?? []).map((o: any) => {
        const q = (o.purchase_order_lines ?? []).reduce((s: number, l: any) => s + l.quantity, 0), got = (o.purchase_order_lines ?? []).reduce((s: number, l: any) => s + l.received_qty, 0);
        return { ...o, orderedQty: q, receivedQty: got, value: r2((o.purchase_order_lines ?? []).reduce((s: number, l: any) => s + l.quantity * Number(l.unit_cost), 0)) };
    });
}

export async function cancelOrder(orgId: string, id: string) {
    const { data: po } = await supabase.from('purchase_orders').select('id, status, purchase_order_lines(received_qty)').eq('organization_id', orgId).eq('id', id).maybeSingle();
    if (!po) throw new QuoteOrderError('Order not found.', 404);
    if ((po.purchase_order_lines ?? []).some((l: any) => l.received_qty > 0)) throw new QuoteOrderError('Some of this order has arrived. Close it by receiving the rest, or leave it open.');
    await supabase.from('purchase_orders').update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).eq('id', id);
    return { id, status: 'CANCELLED' };
}

/**
 * Receives goods against an order: makes a bill for just what arrived (stock goes up, VAT and the ledger follow as for any bill), and notes
 * how much of each line is still to come. `lines` is [{ lineId, quantity }]; leaving it out receives everything still outstanding.
 */
export async function receiveOrder(orgId: string, userId: string, id: string, body: any) {
    const { data: po } = await supabase.from('purchase_orders').select('*, purchase_order_lines(*)').eq('organization_id', orgId).eq('id', id).maybeSingle();
    if (!po) throw new QuoteOrderError('Order not found.', 404);
    if (po.status === 'CANCELLED' || po.status === 'RECEIVED') throw new QuoteOrderError(po.status === 'RECEIVED' ? 'This order has been received in full.' : 'This order was cancelled.');
    const lines: any[] = po.purchase_order_lines ?? [];
    const asked: { lineId: string; quantity: number }[] = Array.isArray(body?.lines) && body.lines.length ? body.lines : lines.map((l) => ({ lineId: l.id, quantity: l.quantity - l.received_qty }));
    const take = new Map<string, number>();
    for (const a of asked) {
        const l = lines.find((x) => x.id === a.lineId);
        if (!l) throw new QuoteOrderError('One of those lines isn’t on this order.');
        const qty = Math.floor(Number(a.quantity));
        if (!(qty >= 0)) throw new QuoteOrderError('Enter how many arrived.');
        if (qty > l.quantity - l.received_qty) throw new QuoteOrderError(`Only ${l.quantity - l.received_qty} of “${l.description}” are still to come.`);
        if (qty > 0) take.set(l.id, qty);
    }
    if (!take.size) throw new QuoteOrderError('Nothing to receive: enter how many of at least one line arrived.');

    const bill = await purchasing.createBill(orgId, userId, {
        supplierId: po.supplier_id, billNumber: text(body?.billNumber, 60) ?? undefined, billDate: isDate(body?.billDate) ? body.billDate : today(), pricesIncludeVat: !!body?.pricesIncludeVat,
        notes: `Received against ${po.po_number}`,
        lines: [...take].map(([lineId, quantity]) => { const l = lines.find((x) => x.id === lineId); return { productId: l.product_id ?? undefined, variantId: l.variant_id ?? undefined, accountId: l.account_id ?? undefined, description: l.description, quantity, unitCost: Number(l.unit_cost), taxCode: l.tax_code ?? undefined }; }),
    });
    await supabase.from('purchase_bills').update({ purchase_order_id: id }).eq('id', bill.id);
    for (const [lineId, qty] of take) { const l = lines.find((x) => x.id === lineId); await supabase.from('purchase_order_lines').update({ received_qty: l.received_qty + qty }).eq('id', lineId); l.received_qty += qty; }
    const done = lines.every((l) => l.received_qty >= l.quantity);
    await supabase.from('purchase_orders').update({ status: done ? 'RECEIVED' : 'PART_RECEIVED', updated_at: new Date().toISOString() }).eq('id', id);
    return { bill, status: done ? 'RECEIVED' : 'PART_RECEIVED' };
}
