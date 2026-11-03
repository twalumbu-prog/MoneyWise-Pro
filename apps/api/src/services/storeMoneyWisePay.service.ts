/**
 * storeMoneyWisePay.service.ts — paying a store cart with MoneyWise Pay.
 *
 * The public store (/<business>/store) turns the cart into a one-time payment link (priced from the database, never from the
 * browser). The link is then paid exactly like any pay link a MoneyWise user opens: in the app ("slide to pay") or, when the
 * browser is signed in, from the page itself (payLinkService.payWithWallet). Settlement (sales, revenue routing, receipts, the
 * MoneyWise fee) is payLinkService's own, so the store adds no money logic of its own.
 */
import { randomBytes } from 'crypto';
import { supabase } from '../lib/supabase';
import { calculatePlatformFee } from '../lib/platformFee';
import { PayLinkError } from './payLink.service';
import { sanitizeCheckoutFields } from '../controllers/product.controller';
import { SETTLEMENT_ORG_ID } from './commissionSweep.service';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
const MAX_LINES = 30;
const MAX_RIDER_CHARGE = 2000;

export interface StoreLinkInput {
    walletId?: string;
    items?: { id: string; quantity?: number; price?: number; responses?: Record<string, string> }[];
    /** 'deliver' | 'pickup', plus the address snapshot kept on the sale. */
    orderDetails?: any;
    /** Only used when the business lets customers pick an outside rider (the rider's estimate). */
    riderCharge?: number;
}

export async function createStoreLink(input: StoreLinkInput) {
    const items = Array.isArray(input.items) ? input.items : [];
    if (items.length === 0 || items.length > MAX_LINES) throw new PayLinkError('Add at least one item to pay for.', 400, 'ITEMS');

    const { data: wallet } = await supabase.from('organization_wallets').select('id, organization_id').eq('id', String(input.walletId ?? '')).maybeSingle();
    if (!wallet) throw new PayLinkError('This store can’t be found.', 404, 'NOT_FOUND');
    const orgId = (wallet as any).organization_id as string;
    const { data: org } = await supabase.from('organizations').select('id, name, lenco_subaccount_id').eq('id', orgId).maybeSingle();
    if (!org?.lenco_subaccount_id) throw new PayLinkError(`${org?.name ?? 'This business'} can’t receive MoneyWise payments yet.`, 409, 'UNAVAILABLE');

    const ids = [...new Set(items.map((i) => String(i?.id ?? '')))].filter(Boolean);
    const { data: products } = await supabase.from('products')
        .select('id, name, price, product_type, is_active, requires_delivery, allow_external_delivery, own_delivery_charge, checkout_fields')
        .eq('organization_id', orgId).in('id', ids);
    const byId = new Map((products ?? []).map((p: any) => [p.id, p]));

    const snapshot: any[] = [];
    let amount = 0;
    const needsDelivery: any[] = [];
    for (const it of items) {
        const p: any = byId.get(String(it?.id));
        if (!p || p.is_active === false) throw new PayLinkError('One of the items isn’t available any more.', 409, 'ITEMS');
        if (/BOOKING/i.test(String(p.product_type))) throw new PayLinkError('Bookings are paid with Mobile Money, where you choose your dates.', 400, 'BOOKING');
        const donation = p.product_type === 'DONATION';
        const unit = round2(donation ? Number(it.price) : Number(p.price));
        const qty = Math.max(1, Math.min(1000, Math.round(Number(it.quantity) || 1)));
        if (!(unit > 0)) throw new PayLinkError(`Enter an amount for ${p.name}.`, 400, 'AMOUNT');

        // The buyer's answers to the product's own questions, checked against what the business defined.
        const answers: { id: string; label: string; value: string }[] = [];
        const given = it.responses && typeof it.responses === 'object' ? it.responses : {};
        for (const f of sanitizeCheckoutFields(p.checkout_fields)) {
            const value = String(given[f.id] ?? '').trim().slice(0, 200);
            if (!value) { if (f.required) throw new PayLinkError(`Please fill in "${f.label}" for ${p.name}.`, 400, 'INFO'); continue; }
            if (f.type === 'select' && !(f.options || []).includes(value)) throw new PayLinkError(`Invalid choice for "${f.label}" on ${p.name}.`, 400, 'INFO');
            answers.push({ id: f.id, label: f.label, value });
        }
        amount += round2(unit * qty);
        if (p.requires_delivery) needsDelivery.push(p);
        snapshot.push({
            product_id: p.id, name: p.name, quantity: qty, unit_price: unit,
            ...(answers.length ? { customer_responses: answers } : {}),
        });
    }

    // Delivery: the business's own charge is read from the products; an outside rider's estimate comes from the page (capped).
    const od = input.orderDetails && typeof input.orderDetails === 'object' ? input.orderDetails : null;
    let delivery = 0;
    if (needsDelivery.length && od?.mode !== 'pickup') {
        const external = needsDelivery.some((p) => p.allow_external_delivery);
        delivery = external
            ? Math.max(0, Math.min(MAX_RIDER_CHARGE, round2(Number(input.riderCharge) || 0)))
            : round2(Number(needsDelivery.find((p) => !p.allow_external_delivery)?.own_delivery_charge) || 0);
    }
    if (needsDelivery.length) {
        const details = od ? { ...od, delivery_charge: delivery } : null;
        if (details) for (const s of snapshot) if (needsDelivery.some((p) => p.id === s.product_id)) s.order_details = details;
    }
    if (delivery > 0) { snapshot.push({ name: 'Delivery', quantity: 1, unit_price: delivery }); amount += delivery; }
    amount = round2(amount);

    const token = randomBytes(24).toString('base64url');
    const { error } = await supabase.from('payment_links').insert({
        organization_id: orgId, token, customer_name: '', customer_phone: '', amount, items: snapshot,
        wallet_id: (wallet as any).id, status: 'ACTIVE', created_by: null,
        // Hidden from the business's links list until it is paid (payLinkService.settle shows it then).
        is_archived: true,
    });
    if (error) throw new Error(error.message);

    const fee = orgId === SETTLEMENT_ORG_ID ? 0 : calculatePlatformFee(amount);
    return { token, amount, fee, total: round2(amount + fee) };
}

/** Public: has this store link been paid yet? Anyone holding the (unguessable) token may ask. */
export async function storeLinkStatus(token: string) {
    const { data: link } = await supabase.from('payment_links').select('status, reference, organization_id').eq('token', String(token ?? '')).maybeSingle();
    if (!link) throw new PayLinkError('This payment can’t be found.', 404, 'NOT_FOUND');
    let referenceNumber: string | null = null;
    if (link.status === 'PAID' && link.reference) {
        const { data: e } = await supabase.from('cashbook_entries').select('reference_number')
            .eq('organization_id', link.organization_id).eq('external_reference', link.reference).eq('entry_type', 'INFLOW').maybeSingle();
        referenceNumber = (e as any)?.reference_number ?? null;
    }
    return { paid: link.status === 'PAID', status: link.status as string, reference: (link.reference as string | null) ?? null, referenceNumber };
}
