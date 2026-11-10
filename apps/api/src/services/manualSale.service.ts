/**
 * manualSale.service.ts — a product / free-text sale whose money is already collected (cash, mobile money, bank),
 * posted straight to the ledger. Shared by the staff "New Sale → Manual" screen (POST /cashbook/manual-sale) and the
 * public API (POST /api/v1/sales), so both book a sale exactly the same way.
 *
 * Unlike the Lenco POS path (which logs a PENDING intent and finalizes on webhook):
 *  1. Insert the sale lines into product_sales (COMPLETED).
 *  2. Group the (possibly edited / partial) amount by each line's income account.
 *  3. Create one `Sale:`-prefixed INFLOW per income group against the chosen external account_type
 *     (CASH / AIRTEL_MONEY / BANK). createEntry auto-generates a REC- receipt number, recalculates the
 *     external-ledger balance, and posts the balanced GL journal (Dr asset / Cr income) — so the sale lands in
 *     Reports (revenue + net worth) and in the Inflows inbox automatically.
 *  4. Reserve any booking dates immediately (CONFIRMED).
 */
import { supabase } from '../lib/supabase';
import { cashbookService } from './cashbook.service';

/** A failure the caller should see as-is, with its HTTP status (400 validation, 409 booking clash). */
export class ManualSaleError extends Error {
    constructor(message: string, public httpStatus = 400) { super(message); }
}

/**
 * One cart line, in the staff screen's shape: a catalogue product `{ id, quantity, price, check_in?, check_out? }`
 * or a free-text line `{ custom: true, name, income_account_id, quantity, price }`.
 */
export interface ManualSaleItem {
    id?: string;
    custom?: boolean;
    name?: string;
    income_account_id?: string | null;
    quantity: number;
    price: number;
    check_in?: string | null;
    check_out?: string | null;
}

export interface ManualSaleInput {
    organizationId: string;
    /** users.id of the cashier; null when the sale comes from an API key / OAuth client. */
    userId: string | null;
    items: ManualSaleItem[];
    amount: number;
    paymentDate?: string | null;
    accountType?: string | null;
    methodLabel?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    /** Sale reference (product_sales / bookings / cashbook external_reference). Generated (MSALE-…) when omitted. */
    reference?: string;
}

export interface ManualSaleResult {
    reference: string;
    referenceNumber: string | null;
    amount: number;
    date: string;
    accountType: 'CASH' | 'AIRTEL_MONEY' | 'BANK';
    entryId: string | null;
    entryIds: string[];
}

export const MANUAL_SALE_ACCOUNT_TYPES = ['CASH', 'AIRTEL_MONEY', 'BANK'] as const;

export async function recordManualSale(input: ManualSaleInput): Promise<ManualSaleResult> {
    const { organizationId, userId, items, amount, paymentDate, accountType, methodLabel, customerName, customerPhone } = input;

    if (!Array.isArray(items) || items.length === 0) {
        throw new ManualSaleError('At least one sale item is required');
    }

    const totalAmount = Number(amount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
        throw new ManualSaleError('A valid payment amount is required');
    }

    const acctType = (MANUAL_SALE_ACCOUNT_TYPES as readonly string[]).includes(accountType as string)
        ? (accountType as ManualSaleResult['accountType'])
        : 'CASH';
    const saleDate = paymentDate || new Date().toISOString().split('T')[0];
    const reference = input.reference || `MSALE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Normalise + validate cart lines. Booking (accommodation) lines carry a stay; custom lines
    // (a free-text item the cashier typed in — no catalogue product) carry their own name + income account.
    const lines = items
        .map((it: any, idx: number) => ({
            id: it.custom ? `custom-${idx}` : it.id,
            custom: !!it.custom,
            customName: it.custom ? String(it.name || '').trim().slice(0, 200) : null,
            customIncome: it.custom && it.income_account_id ? String(it.income_account_id) : null,
            qty: Math.max(0, Number(it.quantity) || 0),
            unit: Math.max(0, Number(it.price) || 0),
            check_in: it.custom ? null : (it.check_in || null),
            check_out: it.custom ? null : (it.check_out || null)
        }))
        .filter((l: any) => l.id && l.qty > 0 && (!l.custom || (l.customName && l.unit > 0)))
        .map((l: any) => ({ ...l, lineTotal: l.qty * l.unit }));

    // A custom line may only post to one of this organization's own income accounts.
    const customIncomeIds = [...new Set(lines.filter((l: any) => l.customIncome).map((l: any) => l.customIncome))];
    if (customIncomeIds.length > 0) {
        const { data: okAccts } = await supabase.from('accounts').select('id').eq('organization_id', organizationId).eq('type', 'INCOME').in('id', customIncomeIds as string[]);
        const ok = new Set((okAccts || []).map((a: any) => a.id));
        if (customIncomeIds.some(id => !ok.has(id as string))) {
            throw new ManualSaleError('Choose one of your income accounts for the custom item.');
        }
    }

    if (lines.length === 0) {
        throw new ManualSaleError('No valid sale lines provided');
    }

    // Resolve each product's income account + display name.
    const productIds = [...new Set(lines.filter((l: any) => !l.custom).map((l: any) => l.id))];
    const { data: products } = productIds.length
        ? await supabase.from('products').select('id, name, income_account_id').eq('organization_id', organizationId).in('id', productIds)
        : { data: [] as any[] };
    const productMap = new Map((products || []).map((p: any) => [p.id, p]));

    // Booking pre-validation: a manual sale means the money is already collected, so
    // the stay is reserved immediately (CONFIRMED). Validate the dates and reject up
    // front if they overlap an existing confirmed stay — so a clash never records an
    // orphan sale or lets the same room be double-booked (e.g. via the public link).
    // Unlike the public portal, a past check-in is allowed here: a cashier may be
    // entering a walk-in/cash sale retrospectively (e.g. logging today's bookings
    // at close of day). The only hard rule is no double-booking an existing stay.
    const nightsOf = (ci: string, co: string) =>
        Math.round((Date.parse(`${co}T00:00:00Z`) - Date.parse(`${ci}T00:00:00Z`)) / 86400000);
    const bookingLines = (lines as any[]).filter(l => l.check_in && l.check_out);
    for (const b of bookingLines) {
        const ci = String(b.check_in), co = String(b.check_out);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ci) || !/^\d{4}-\d{2}-\d{2}$/.test(co) || co <= ci) {
            throw new ManualSaleError('Invalid booking dates.');
        }
        // Half-open overlap against confirmed stays for this product.
        const { data: clashes } = await supabase
            .from('product_bookings')
            .select('id')
            .eq('product_id', b.id)
            .eq('status', 'CONFIRMED')
            .lt('check_in', co)
            .gt('check_out', ci)
            .limit(1);
        if (clashes && clashes.length > 0) {
            const prod: any = productMap.get(b.id);
            throw new ManualSaleError(`${prod?.name || 'This room'} is already booked for those dates. Please choose different dates.`, 409);
        }
    }

    // Pro-rate the entered amount across lines by their cart share (the cashier can
    // edit the amount for partial / rounded cash payments, so it may differ from the
    // raw subtotal). The final line absorbs any rounding remainder.
    const cartSubtotal = lines.reduce((s: number, l: any) => s + l.lineTotal, 0);
    let allocatedSoFar = 0;
    lines.forEach((l: any, i: number) => {
        if (i === lines.length - 1) {
            l.allocated = Math.round((totalAmount - allocatedSoFar) * 100) / 100;
        } else {
            const share = cartSubtotal > 0 ? l.lineTotal / cartSubtotal : 1 / lines.length;
            l.allocated = Math.round(totalAmount * share * 100) / 100;
            allocatedSoFar += l.allocated;
        }
    });

    // 1. Record the sale lines (money already collected → COMPLETED).
    const salesData = lines.filter((l: any) => !l.custom).map((l: any) => ({
        organization_id: organizationId,
        product_id: l.id,
        customer_name: customerName || 'Walk-in Customer',
        customer_phone: customerPhone || 'N/A',
        quantity: l.qty,
        amount_paid: l.allocated,
        reference,
        status: 'COMPLETED'
    }));
    const { error: salesError } = salesData.length ? await supabase.from('product_sales').insert(salesData) : { error: null };
    if (salesError) {
        console.error('[Manual Sale] Failed to record product_sales:', salesError.message);
    }

    // 2. Group allocations by income account.
    const groups = new Map<string, { income: string | null; amount: number; names: string[] }>();
    for (const l of lines as any[]) {
        const prod: any = l.custom ? null : productMap.get(l.id);
        const income: string | null = l.custom ? l.customIncome : (prod?.income_account_id || null);
        const key = income || 'NULL';
        const g = groups.get(key) || { income, amount: 0, names: [] };
        g.amount += l.allocated;
        g.names.push(`${l.custom ? l.customName : (prod?.name || 'Item')} (x${l.qty})`);
        groups.set(key, g);
    }
    const groupList = [...groups.values()].sort((a, b) => b.amount - a.amount);

    // 3. One INFLOW per income group; the largest keeps the primary reference,
    //    the rest carry a `::gN` suffix (mirrors applyProductRevenueRouting).
    const created: any[] = [];
    for (let i = 0; i < groupList.length; i++) {
        const g = groupList[i];
        const desc = `Sale: ${g.names.join(', ')} | Cust: ${customerPhone || customerName || 'Walk-in'} | ${methodLabel || acctType}`;
        const entry = await cashbookService.createEntry(organizationId, {
            entry_type: 'INFLOW',
            description: desc,
            debit: g.amount,
            credit: 0,
            date: saleDate,
            created_by: userId || undefined,
            account_type: acctType,
            account_id: g.income || null,
            // Mapped income account is deterministic → ACCOUNTED so the AI sweep
            // leaves it alone; otherwise COMPLETED for later classification.
            status: g.income ? 'ACCOUNTED' : 'COMPLETED',
            external_reference: i === 0 ? reference : `${reference}::g${i + 1}`,
            sender_name: customerName || null,
            sender_phone: customerPhone || null,
        } as any);
        created.push(entry);
    }

    // 4. Reserve booking dates immediately (CONFIRMED — payment already received),
    //    so the room is blocked everywhere (public link, other sales) right away.
    for (const b of bookingLines as any[]) {
        const row = {
            organization_id: organizationId,
            product_id: b.id,
            reference,
            customer_name: customerName || 'Walk-in Customer',
            customer_phone: customerPhone || 'N/A',
            check_in: b.check_in,
            check_out: b.check_out,
            nights: nightsOf(String(b.check_in), String(b.check_out)),
            amount: b.allocated,
            status: 'CONFIRMED'
        };
        const { error: bookingErr } = await supabase.from('product_bookings').insert(row);
        if (!bookingErr) continue;
        // A concurrent booking slipped in between the pre-check and this insert
        // (partial GiST exclusion). Money is already taken, so don't fail the sale —
        // record the hold as CONFLICT for the merchant to resolve.
        const isOverlap = bookingErr.code === '23P01' || /exclusion|no_overlap|conflicting key/i.test(bookingErr.message || '');
        console.error(`[Manual Sale] Booking insert failed${isOverlap ? ' (overlap race)' : ''} for product ${b.id}:`, bookingErr.message);
        if (isOverlap) {
            await supabase.from('product_bookings').insert({ ...row, status: 'CONFLICT' });
        }
    }

    const primary = created[0];
    return {
        reference,
        referenceNumber: primary?.reference_number || null,
        amount: totalAmount,
        date: saleDate,
        accountType: acctType,
        entryId: primary?.id || null,
        entryIds: created.map(e => e.id).filter(Boolean),
    };
}
