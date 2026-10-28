/**
 * payLink.service.ts — paying a MoneyWise pay link from the payer's own MoneyWise wallet ("slide to pay" in the app).
 *
 * A pay link is either
 *   • a payment link  (/pl/<token>): a fixed amount to one business, usually for a product or an invoice; or
 *   • a quick link    (/pay/<username>): a business's open page where the payer chooses the amount.
 *
 * Paying from a wallet is an on-us MoneyWise Pay transfer, and it is done by the same pipeline as sending money in the app
 * (a requisition, auto-authorised and disbursed): that moves the real money at Lenco, books the payer's side, credits the
 * recipient only once Lenco confirms, and files the payer's expense. What this adds is the link's own settlement: the link is
 * flipped to PAID (single use), product sales are completed and their revenue routed, and the receipt notifications go out —
 * by handing the already-credited inflow to the same finalisation the Lenco webhook uses.
 *
 * Fees are the same as when the link is paid any other way: a payment link adds MoneyWise's tiered platform fee on top (the payer
 * pays amount + fee, the business is credited the amount, the fee is forwarded to the MoneyWise settlement account); a quick link
 * has no MoneyWise fee. The wallet-to-wallet transfer itself costs nothing, so there is no Lenco network fee either. The
 * settlement account's own links carry no fee (it would only be paying itself).
 */
import { supabase } from '../lib/supabase';
import { cashbookService } from './cashbook.service';
import { moneyWisePayService } from './moneyWisePay.service';
import { callHandler, errorOf } from './agent/internalCall';
import { createRequisition } from '../controllers/requisition.controller';
import { autoAuthorizeAndDisburse } from '../controllers/disbursement.controller';
import { handleCollectionSuccessful } from '../controllers/lenco.webhook.controller';
import { AgentContext } from './agent/types';
import { calculatePlatformFee } from '../lib/platformFee';
import { sweepPlatformCommission, SETTLEMENT_ORG_ID } from './commissionSweep.service';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
const LOCK_MS = 10 * 60_000;
const MAX_QUICK_AMOUNT = 1_000_000;

export class PayLinkError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'INVALID') { super(message); }
}

export type PayStatus = 'READY' | 'PAID' | 'UNAVAILABLE';

export interface PayTarget {
    kind: 'LINK' | 'QUICK';
    token?: string;
    username?: string;
    status: PayStatus;
    /** Why it can't be paid here (shown to the person). */
    reason?: string;
    recipient: { orgId: string; name: string; logoUrl: string | null };
    /** Fixed for a payment link; null for a quick link (the payer chooses). */
    amount: number | null;
    /** MoneyWise's fee on top (payment links only), and what the payer is charged in all (amount + fee). */
    fee: number;
    total: number | null;
    amountEditable: boolean;
    purpose: string | null;
    /** The link belongs to the payer's own organization. */
    own: boolean;
}

export interface PayerWallet { id: string; name: string; is_main: boolean; balance: number }

interface Resolved extends PayTarget { _link?: any; _org?: any }

// ── Resolving a link ───────────────────────────────────────────────────────────

async function resolveLink(token: string, payerOrgId: string): Promise<Resolved> {
    const { data: link } = await supabase.from('payment_links').select('*, products(id, name, product_type)').eq('token', token).maybeSingle();
    if (!link) throw new PayLinkError('This payment link doesn’t exist any more.', 404, 'NOT_FOUND');
    const { data: org } = await supabase.from('organizations').select('id, name, logo_url, lenco_subaccount_id, is_personal').eq('id', link.organization_id).maybeSingle();
    if (!org) throw new PayLinkError('This business can’t be found.', 404, 'NOT_FOUND');

    const items: any[] = Array.isArray(link.items) ? link.items : [];
    const net = round2(Number(link.amount) || 0);
    const fee = org.id === SETTLEMENT_ORG_ID ? 0 : calculatePlatformFee(net);
    const isBooking = items.some((i) => i?.check_in && i?.check_out);
    let status: PayStatus = 'READY';
    let reason: string | undefined;
    if (link.status === 'PAID') { status = 'PAID'; reason = 'This link has already been paid.'; }
    else if (link.status !== 'ACTIVE') { status = 'UNAVAILABLE'; reason = 'This link is no longer active.'; }
    else if (isBooking) { status = 'UNAVAILABLE'; reason = 'Bookings are paid in your browser, where you choose your dates.'; }
    else if (!org.lenco_subaccount_id) { status = 'UNAVAILABLE'; reason = `${org.name} can’t receive MoneyWise payments yet.`; }
    else if (!(Number(link.amount) > 0)) { status = 'UNAVAILABLE'; reason = 'This link has no amount to pay.'; }

    return {
        kind: 'LINK', token, status, reason,
        recipient: { orgId: org.id, name: org.name, logoUrl: org.logo_url ?? null },
        amount: net, fee, total: round2(net + fee), amountEditable: false,
        purpose: link.products?.name ?? (items[0]?.name ?? null),
        own: org.id === payerOrgId,
        _link: link, _org: org,
    };
}

async function resolveQuick(username: string, payerOrgId: string): Promise<Resolved> {
    const handle = String(username ?? '').trim().replace(/^@/, '').toLowerCase();
    if (!handle) throw new PayLinkError('This pay page doesn’t exist.', 404, 'NOT_FOUND');
    const { data: org } = await supabase.from('organizations').select('id, name, logo_url, lenco_subaccount_id, is_personal').ilike('public_username', handle).maybeSingle();
    if (!org) throw new PayLinkError('This pay page doesn’t exist any more.', 404, 'NOT_FOUND');
    const ready = !!org.lenco_subaccount_id;
    return {
        kind: 'QUICK', username: handle, status: ready ? 'READY' : 'UNAVAILABLE',
        reason: ready ? undefined : `${org.name} can’t receive MoneyWise payments yet.`,
        recipient: { orgId: org.id, name: org.name, logoUrl: org.logo_url ?? null },
        amount: null, fee: 0, total: null, amountEditable: true, purpose: null, own: org.id === payerOrgId, _org: org,
    };
}

const strip = ({ _link, _org, ...t }: Resolved): PayTarget => t;

export async function resolvePayTarget(payerOrgId: string, q: { token?: string; username?: string }): Promise<PayTarget & { wallets: PayerWallet[] }> {
    const t = q.token ? await resolveLink(String(q.token), payerOrgId) : await resolveQuick(String(q.username ?? ''), payerOrgId);
    return { ...strip(t), wallets: await payerWallets(payerOrgId) };
}

export async function payerWallets(orgId: string): Promise<PayerWallet[]> {
    const { data } = await supabase.from('organization_wallets').select('id, name, is_main').eq('organization_id', orgId);
    const rows = await Promise.all((data ?? []).map(async (w: any) => ({
        id: w.id as string, name: w.name as string, is_main: !!w.is_main,
        balance: round2(await cashbookService.getCurrentBalance(orgId, 'MONEYWISE_WALLET', w.id)),
    })));
    return rows.sort((a, b) => Number(b.is_main) - Number(a.is_main));
}

// ── Paying ─────────────────────────────────────────────────────────────────────

/** One payer at a time per payment link: a second wallet payment for the same link is refused while the first is in flight. */
async function claimLink(token: string): Promise<boolean> {
    const key = `paylink-lock:${token}`;
    const { data: existing } = await supabase.from('app_settings').select('updated_at').eq('key', key).maybeSingle();
    if (existing && Date.now() - Date.parse((existing as any).updated_at) < LOCK_MS) return false;
    await supabase.from('app_settings').upsert({ key, value: { at: new Date().toISOString() }, description: 'A wallet payment for this link is in progress (safe to delete).', updated_at: new Date().toISOString() }, { onConflict: 'key' });
    return true;
}
const releaseLink = (token: string) => supabase.from('app_settings').delete().eq('key', `paylink-lock:${token}`);

export interface PayResult {
    status: 'paid' | 'processing';
    requisitionId: string;
    reference: string | null;
    /** What the business receives. */
    amount: number;
    /** MoneyWise's fee on top, and the total taken from the wallet. */
    fee: number;
    total: number;
    recipient: string;
}

export async function payWithWallet(ctx: AgentContext, body: { token?: string; username?: string; amount?: number; purpose?: string; walletId?: string }): Promise<PayResult> {
    if (ctx.role !== 'ADMIN') throw new PayLinkError('Only the account holder can pay from this wallet.', 403, 'FORBIDDEN');
    const t = body.token ? await resolveLink(String(body.token), ctx.organizationId) : await resolveQuick(String(body.username ?? ''), ctx.organizationId);
    if (t.status === 'PAID') throw new PayLinkError(t.reason!, 409, 'PAID');
    if (t.status !== 'READY') throw new PayLinkError(t.reason ?? 'This link can’t be paid.', 409, 'UNAVAILABLE');
    if (t.own) throw new PayLinkError('This is your own link — you can’t pay yourself.', 400, 'OWN');

    const amount = t.kind === 'LINK' ? t.amount! : round2(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new PayLinkError('Enter an amount to pay.', 400, 'AMOUNT');
    if (amount > MAX_QUICK_AMOUNT) throw new PayLinkError('That amount is too large to pay this way.', 400, 'AMOUNT');
    const fee = t.kind === 'LINK' ? t.fee : 0;
    const total = round2(amount + fee);

    const wallets = await payerWallets(ctx.organizationId);
    const wallet = body.walletId ? wallets.find((w) => w.id === body.walletId) : wallets.find((w) => w.is_main) ?? wallets[0];
    if (!wallet) throw new PayLinkError('Choose one of your wallets to pay from.', 400, 'WALLET');
    if (wallet.balance + 0.005 < total) {
        throw new PayLinkError(`${wallet.name} has K${wallet.balance.toFixed(2)} but this needs K${total.toFixed(2)}${fee ? ` (including K${fee.toFixed(2)} MoneyWise fee)` : ''}.`, 402, 'INSUFFICIENT');
    }

    const purpose = String(body.purpose ?? '').trim().slice(0, 120) || (t.purpose ? `${t.purpose} — ${t.recipient.name}` : `Payment to ${t.recipient.name}`);
    if (t.kind === 'LINK' && !(await claimLink(t.token!))) throw new PayLinkError('Someone is paying this link right now. Please try again in a moment.', 409, 'LOCKED');

    try {
        // The fee is its own line on the payer's requisition, so the item is classified for what it is and the fee falls under
        // Transaction Charges (the same split the Send screen makes for its own fees).
        const items = [{ description: purpose, quantity: 1, unit_price: amount, estimated_amount: amount },
            ...(fee > 0 ? [{ description: 'MoneyWise processing fee', quantity: 1, unit_price: fee, estimated_amount: fee }] : [])];
        // The settlement memo is written BEFORE the money moves, so the moment the transfer confirms and the recipient is credited
        // it is booked net of the fee (see moneyWisePayService.creditByReference). The reference is deterministic per requisition.
        const created = await callHandler(createRequisition, ctx, { body: {
            description: purpose, estimated_total: total, items, payment_method: 'MONEYWISE_PAY',
            recipient_account: t.recipient.orgId, recipient_bank_code: 'MONEYWISE', recipient_name: t.recipient.name, recipient_organization_id: t.recipient.orgId,
        } });
        if (created.status >= 400 || !created.body?.id) throw new PayLinkError(errorOf(created, 'Could not prepare the payment.'), 500, 'FAILED');
        const requisitionId = created.body.id as string;

        const expectedRef = `MWPAY-${requisitionId.slice(0, 8)}`;
        await supabase.from('app_settings').upsert({ key: `paylink:${expectedRef}`, value: { token: t.token ?? null, username: t.username ?? null, kind: t.kind, orgId: t.recipient.orgId, amount, fee, purpose, payerName: await payerName(ctx) }, description: 'Pay-link settlement waiting for the MoneyWise Pay transfer to be confirmed (safe to delete once settled).', updated_at: new Date().toISOString() }, { onConflict: 'key' });

        const sent = await callHandler(autoAuthorizeAndDisburse, ctx, { params: { id: requisitionId }, body: {
            payment_method: 'MONEYWISE_PAY', total_prepared: total, recipient_account: t.recipient.orgId, recipient_bank_code: 'moneywise',
            recipient_account_name: t.recipient.name, recipient_organization_id: t.recipient.orgId, wallet_id: wallet.id,
        } });
        if (sent.status >= 400) {
            await supabase.from('app_settings').delete().eq('key', `paylink:${expectedRef}`);
            throw new PayLinkError(`${errorOf(sent, 'The payment failed.')} Nothing was sent.`, 502, 'FAILED');
        }

        const { data: d } = await supabase.from('disbursements').select('external_reference').eq('requisition_id', requisitionId).maybeSingle();
        const reference: string | null = (d as any)?.external_reference ?? null;
        const confirmed = String(sent.body?.lencoStatus ?? '').toLowerCase() === 'successful';

        if (reference) {
            if (confirmed) await finalizeByReference(reference);
        }
        if (t.kind === 'LINK' && !confirmed && !reference) await releaseLink(t.token!);
        return { status: confirmed ? 'paid' : 'processing', requisitionId, reference, amount, fee, total, recipient: t.recipient.name };
    } catch (e) {
        if (t.kind === 'LINK') await releaseLink(t.token!);
        throw e;
    }
}

async function payerName(ctx: AgentContext): Promise<string> {
    const { data: u } = await supabase.from('users').select('name').eq('id', ctx.userId).maybeSingle();
    if ((u as any)?.name) return (u as any).name;
    const { data: o } = await supabase.from('organizations').select('name').eq('id', ctx.organizationId).maybeSingle();
    return (o as any)?.name ?? 'A MoneyWise user';
}

// ── Settling the link once the transfer is confirmed ───────────────────────────

/**
 * Called once Lenco has confirmed a MoneyWise Pay transfer that paid a link (straight after the payment, or later from the
 * confirmation poller via moneyWisePayService.creditByReference). Idempotent.
 */
const settling = new Set<string>();
export async function finalizeByReference(reference: string): Promise<void> {
    // One settlement at a time per payment: crediting the recipient re-triggers this (via the confirmation hook), and two
    // overlapping runs must not both try to book the same inflow.
    if (settling.has(reference)) return;
    settling.add(reference);
    try { await settle(reference); } finally { settling.delete(reference); }
}

async function settle(reference: string): Promise<void> {
    const memoKey = `paylink:${reference.replace(/-R\d+$/, '')}`;
    const { data: row } = await supabase.from('app_settings').select('value').eq('key', memoKey).maybeSingle();
    const m: any = row?.value;
    if (!m?.orgId) return;

    // The recipient's inflow, booked only once Lenco confirms (idempotent), under the transfer's reference.
    await moneyWisePayService.creditByReference(reference);
    const { data: inflow } = await supabase.from('cashbook_entries').select('id').eq('organization_id', m.orgId).eq('external_reference', reference).neq('status', 'PENDING').limit(1);
    if (!inflow || inflow.length === 0) return; // not confirmed yet: the confirmation poller will call this again

    if (m.kind === 'LINK' && m.token) {
        const { data: link } = await supabase.from('payment_links').select('id, organization_id, product_id, items, amount, status, customer_name, customer_phone, customer_email, credit_invoice_id').eq('token', m.token).maybeSingle();
        if (link && link.status === 'ACTIVE') {
            // Tie the link to this payment, and record the sale(s) so revenue routing and receipts work like any paid link.
            await supabase.from('payment_links').update({ reference }).eq('token', m.token).eq('status', 'ACTIVE');
            const { data: existing } = await supabase.from('product_sales').select('id').eq('reference', reference).limit(1);
            if (!link.credit_invoice_id && (!existing || existing.length === 0)) {
                const items: any[] = Array.isArray(link.items) && link.items.length > 0 ? link.items : (link.product_id ? [{ product_id: link.product_id, quantity: 1, unit_price: Number(link.amount) }] : []);
                const rows = items.filter((i) => i.product_id).map((i) => ({
                    organization_id: link.organization_id, product_id: i.product_id,
                    customer_name: link.customer_name || m.payerName || 'MoneyWise user', customer_phone: link.customer_phone || 'N/A', customer_email: link.customer_email || null,
                    quantity: Number(i.quantity) || 1, amount_paid: round2((Number(i.unit_price) || 0) * (Number(i.quantity) || 1)), reference, status: 'PENDING',
                }));
                if (rows.length) await supabase.from('product_sales').insert(rows);
            }
        }
    }

    // Hand the already-credited inflow to the webhook's finalisation: completes the sales, routes revenue, flips the link to PAID
    // and sends the receipts (it recognises the inflow as already booked, so nothing is booked twice).
    await handleCollectionSuccessful({ reference, amount: m.amount, currency: 'ZMW', narration: m.purpose, meta: { payer_name: m.payerName } }, m.orgId);

    // MoneyWise's fee: forward it from the business's sub-account to the settlement account, as for any payment link (idempotent —
    // the transfer reference is SPLIT-<reference>, so a repeat never sweeps twice).
    if (Number(m.fee) > 0 && m.orgId !== SETTLEMENT_ORG_ID) {
        const { data: org } = await supabase.from('organizations').select('lenco_subaccount_id, lenco_secret_key').eq('id', m.orgId).maybeSingle();
        const key = (org as any)?.lenco_secret_key || process.env.LENCO_SECRET_KEY;
        if ((org as any)?.lenco_subaccount_id && key) {
            await sweepPlatformCommission((org as any).lenco_subaccount_id, key, Number(m.fee), reference, m.orgId);
            import('../controllers/billing.controller').then((b) => b.recordFeeCredit(m.orgId, Number(m.fee), reference, 'PAYMENT_LINK')).catch(() => undefined);
        } else {
            console.warn(`[PayLink] Fee sweep skipped for ${reference}: recipient has no Lenco account/key.`);
        }
    }

    await supabase.from('app_settings').delete().eq('key', memoKey);
    if (m.kind === 'LINK' && m.token) await releaseLink(m.token);
}

export const payLinkService = { resolvePayTarget, payWithWallet, finalizeByReference, payerWallets };
