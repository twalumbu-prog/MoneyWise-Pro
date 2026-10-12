import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { captureEvent } from '../utils/analytics';
import { LencoService } from '../services/lenco.service';
import { cashbookService } from '../services/cashbook.service';
import { countOrgMembers } from '../services/entitlements.service';

const SUBSCRIPTION_PRICE = 500; // K500/month base (Premium)
const MASTERFEES_ADDON_PRICE = 500; // +K500 each billing cycle while Master Fees is integrated
// MoneyWise's own settlement merchant (Blue Opus Software) — subscription revenue lands here.
const SETTLEMENT_TILL_NUMBER = process.env.MONEYWISE_SETTLEMENT_TILL_NUMBER || '9838830';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Invoice numbers are keyed to the billing period (not "now") so back-dated and rolled-over invoices never collide. */
function invoiceNumber(orgId: string, periodStart: string): string {
    const ym = `${periodStart.slice(0, 4)}${periodStart.slice(5, 7)}`;
    const short = orgId.replace(/-/g, '').slice(0, 6).toUpperCase();
    return `INV-${ym}-${short}`;
}

/** YYYY-MM-DD + one calendar month (clamped to the target month's last day). */
function addOneMonth(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const next = new Date(Date.UTC(y, m, 1));
    next.setUTCDate(Math.min(d, lastDay));
    return next.toISOString().slice(0, 10);
}

const todayStr = () => new Date().toISOString().split('T')[0];

/**
 * Billable price for an org's billing cycle: the base plan plus the Master Fees
 * add-on while the integration is connected. Disconnecting deletes the
 * `integrations` row, so row existence == integrated.
 */
async function getBillingPrice(organizationId: string): Promise<{ base: number; masterfees: number; total: number }> {
    const { data } = await supabase
        .from('integrations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('provider', 'MASTERFEES')
        .maybeSingle();
    const masterfees = data ? MASTERFEES_ADDON_PRICE : 0;
    return { base: SUBSCRIPTION_PRICE, masterfees, total: SUBSCRIPTION_PRICE + masterfees };
}

/**
 * Ensure the org has a subscription row — free plan if none exists yet.
 */
async function ensureSubscription(organizationId: string) {
    const { data: existing } = await supabase
        .from('organization_subscriptions')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();

    if (existing) return existing;

    const { data, error } = await supabase
        .from('organization_subscriptions')
        .insert({ organization_id: organizationId, plan_id: 'free' })
        .select()
        .single();

    if (error) throw new Error(`Failed to provision subscription: ${error.message}`);
    return data;
}

/**
 * For premium orgs: ensure there is always a live pending invoice for the
 * current billing period so the fee-credit reduction is visible immediately.
 * Payment is collected in arrears — the due_date is the period end.
 * Idempotent: does nothing if an invoice for this period already exists.
 */
async function ensureCurrentInvoice(sub: any): Promise<void> {
    if (sub.plan_id !== 'premium') return;

    const price = await getBillingPrice(sub.organization_id);
    const credits = Math.min(sub.fee_credits_zmw || 0, price.total);
    const netAmount = Math.max(0, price.total - credits);

    const { data: existing } = await supabase
        .from('subscription_invoices')
        .select('id, status, gross_zmw')
        .eq('subscription_id', sub.id)
        .eq('period_start', sub.current_period_start)
        .maybeSingle();

    if (existing) {
        // Integration connected/disconnected mid-cycle: reprice the still-open invoice.
        if (existing.status === 'pending' && Number(existing.gross_zmw) !== price.total) {
            await supabase
                .from('subscription_invoices')
                .update({
                    gross_zmw: price.total,
                    credits_zmw: credits,
                    net_zmw: netAmount,
                    ...(netAmount === 0 ? { status: 'free', paid_at: new Date().toISOString(), paid_via: 'fee_credits' } : {}),
                })
                .eq('id', existing.id);
        }
        return;
    }

    const invNum = invoiceNumber(sub.organization_id, sub.current_period_start);

    await supabase
        .from('subscription_invoices')
        .insert({
            organization_id: sub.organization_id,
            subscription_id: sub.id,
            invoice_number: invNum,
            period_start: sub.current_period_start,
            period_end: sub.current_period_end,
            gross_zmw: price.total,
            credits_zmw: credits,
            net_zmw: netAmount,
            // Payment is in arrears — due at end of the billing period
            status: netAmount === 0 ? 'free' : 'pending',
            due_date: sub.current_period_end,
            paid_at: netAmount === 0 ? new Date().toISOString() : null,
            paid_via: netAmount === 0 ? 'fee_credits' : null,
        });
}

// ──────────────────────────────────────────────
// GET /billing/subscription
// ──────────────────────────────────────────────
export async function getSubscription(req: Request, res: Response) {
    try {
        const organizationId = (req as any).user?.organization_id;
        if (!organizationId) return res.status(400).json({ error: 'No organization found for this user' });
        const sub = await ensureSubscription(organizationId);

        // Confirm any wallet payment Lenco accepted but we haven't booked yet
        await settleProcessingInvoices(organizationId).catch(e => console.error('[Billing] settle error:', e.message));

        // Ensure a live invoice exists for this billing period (premium only)
        await ensureCurrentInvoice(sub);
        const price = await getBillingPrice(organizationId);

        const [planResult, creditsResult, invoicesResult] = await Promise.all([
            supabase.from('subscription_plans').select('*').eq('id', sub.plan_id).single(),
            supabase.from('subscription_fee_credits')
                .select('amount_zmw, created_at, source_type, reference')
                .eq('organization_id', organizationId)
                .eq('subscription_id', sub.id)
                .order('created_at', { ascending: false })
                .limit(50),
            supabase.from('subscription_invoices')
                .select('*')
                .eq('organization_id', organizationId)
                .order('created_at', { ascending: false })
                .limit(12),
        ]);

        const plan = planResult.data;
        const credits = creditsResult.data || [];
        const invoices = invoicesResult.data || [];

        const amountDue = Math.max(0, price.total - sub.fee_credits_zmw);
        const periodStart = new Date(sub.current_period_start);
        const periodEnd = new Date(sub.current_period_end);
        const today = new Date();
        const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000);
        const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - today.getTime()) / 86400000));
        const periodPercent = Math.round(((totalDays - daysLeft) / totalDays) * 100);

        res.json({
            subscription: {
                ...sub,
                plan,
                amountDue,
                pricing: price,
                daysLeft,
                totalDays,
                periodPercent,
            },
            credits,
            invoices,
        });
    } catch (err: any) {
        console.error('[Billing] getSubscription error:', err.message);
        res.status(500).json({ error: err.message });
    }
}

// ──────────────────────────────────────────────
// POST /billing/upgrade
// ──────────────────────────────────────────────
export async function upgradeToPremium(req: Request, res: Response) {
    try {
        const organizationId = (req as any).user?.organization_id;
        const sub = await ensureSubscription(organizationId);

        if (sub.plan_id === 'premium') {
            return res.status(400).json({ error: 'Already on Premium plan' });
        }

        const today = todayStr();
        const periodEnd = addOneMonth(today);

        const { data, error } = await supabase
            .from('organization_subscriptions')
            .update({
                plan_id: 'premium',
                current_period_start: today,
                current_period_end: periodEnd,
                fee_credits_zmw: 0,
                updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        // Immediately provision the invoice for this period (payment in arrears)
        await ensureCurrentInvoice(data);

        captureEvent('subscription_upgraded', {
            feature: 'billing',
            workflow_id: sub.id,
            organization_id: organizationId,
            user_id: (req as any).userId || 'unknown',
            status: 'succeeded',
        });

        res.json({ subscription: data });
    } catch (err: any) {
        console.error('[Billing] upgradeToPremium error:', err.message);
        res.status(500).json({ error: err.message });
    }
}

// ──────────────────────────────────────────────
// POST /billing/downgrade
// ──────────────────────────────────────────────
export async function downgradeToFree(req: Request, res: Response) {
    try {
        const organizationId = (req as any).user?.organization_id;
        const sub = await ensureSubscription(organizationId);

        if (sub.plan_id === 'free') {
            return res.status(400).json({ error: 'Already on Free plan' });
        }

        // Enforcement: you can't shed Premium while still using Premium features or owing money.
        const { count: unpaid } = await supabase
            .from('subscription_invoices')
            .select('id', { count: 'exact', head: true })
            .eq('subscription_id', sub.id)
            .eq('status', 'pending')
            .gt('net_zmw', 0);
        if ((unpaid || 0) > 0) {
            return res.status(409).json({ error: 'Please settle your outstanding invoices before downgrading.' });
        }
        const { data: mf } = await supabase.from('integrations').select('id').eq('organization_id', organizationId).eq('provider', 'MASTERFEES').maybeSingle();
        if (mf) {
            return res.status(409).json({ error: 'Disconnect Master Fees before downgrading — it is a Premium feature.' });
        }
        if ((await countOrgMembers(organizationId)) > 1) {
            return res.status(409).json({ error: 'The Free plan allows 1 team member. Remove other team members before downgrading.' });
        }

        const { data, error } = await supabase
            .from('organization_subscriptions')
            .update({ plan_id: 'free', updated_at: new Date().toISOString() })
            .eq('id', sub.id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        captureEvent('subscription_downgraded', {
            feature: 'billing',
            workflow_id: sub.id,
            organization_id: organizationId,
            user_id: (req as any).userId || 'unknown',
            status: 'succeeded',
        });

        res.json({ subscription: data });
    } catch (err: any) {
        console.error('[Billing] downgradeToFree error:', err.message);
        res.status(500).json({ error: err.message });
    }
}

// ──────────────────────────────────────────────
// POST /billing/record-fee-credit  (internal — called by webhook controller)
// ──────────────────────────────────────────────
export async function recordFeeCredit(
    organizationId: string,
    amount: number,
    reference: string,
    sourceType: 'PAYMENT_LINK' | 'QUICK_LINK' | 'DIRECT_DEPOSIT' | 'OTHER' = 'PAYMENT_LINK'
): Promise<void> {
    try {
        if (!organizationId || amount <= 0) return;

        const sub = await ensureSubscription(organizationId);
        const { total: cap } = await getBillingPrice(organizationId);

        // Only credit premium-eligible orgs (or all orgs to track potential value)
        // Skip if already fully credited this period
        if (sub.fee_credits_zmw >= cap) return;

        const newCredits = Math.min(sub.fee_credits_zmw + amount, cap);
        const actualCredit = newCredits - sub.fee_credits_zmw;

        // Insert credit record (unique on reference — idempotent)
        const { error: insertErr } = await supabase
            .from('subscription_fee_credits')
            .insert({
                organization_id: organizationId,
                subscription_id: sub.id,
                amount_zmw: actualCredit,
                reference,
                source_type: sourceType,
            })
            .select()
            .maybeSingle();

        if (insertErr) {
            if (insertErr.code === '23505') {
                console.log(`[Billing] Fee credit already recorded for ref ${reference}. Skipping.`);
                return;
            }
            throw new Error(insertErr.message);
        }

        // Update accumulated credits on the subscription
        const { error: updateErr } = await supabase
            .from('organization_subscriptions')
            .update({
                fee_credits_zmw: newCredits,
                updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id);

        if (updateErr) throw new Error(updateErr.message);

        console.log(
            `[Billing] Credited K${actualCredit.toFixed(2)} toward subscription for org ${organizationId}` +
            ` (total this period: K${newCredits.toFixed(2)} / K${cap})`
        );

        // Keep the live invoice in sync: update credits_zmw, net_zmw, and status
        const newNet = Math.max(0, cap - newCredits);
        const fullyPaid = newCredits >= cap;
        await supabase
            .from('subscription_invoices')
            .update({
                credits_zmw: newCredits,
                net_zmw: newNet,
                ...(fullyPaid ? {
                    status: 'free',
                    paid_at: new Date().toISOString(),
                    paid_via: 'fee_credits',
                } : {}),
            })
            .eq('subscription_id', sub.id)
            .eq('status', 'pending');

        if (fullyPaid) {
            console.log(`[Billing] Subscription fully paid via fee credits for org ${organizationId}`);
        }
    } catch (err: any) {
        // Never block payment processing on billing credit failure
        console.error(`[Billing] recordFeeCredit failed for org ${organizationId}:`, err.message);
    }
}

// ──────────────────────────────────────────────
// POST /billing/generate-invoice  (called by cron or manually)
// Creates the monthly invoice and attempts auto-deduction from wallet
// ──────────────────────────────────────────────
export async function generateInvoice(req: Request, res: Response) {
    try {
        const organizationId = (req as any).user?.organization_id;
        const sub = await ensureSubscription(organizationId);

        if (sub.plan_id !== 'premium') {
            return res.status(400).json({ error: 'Invoices are only generated for Premium plan' });
        }

        // Idempotency: don't create two invoices for the same period
        const { data: existingInv } = await supabase
            .from('subscription_invoices')
            .select('id')
            .eq('subscription_id', sub.id)
            .eq('period_start', sub.current_period_start)
            .maybeSingle();

        if (existingInv) {
            return res.status(409).json({ error: 'Invoice for this period already exists' });
        }

        const grossAmount = (await getBillingPrice(organizationId)).total;
        const credits = Math.min(sub.fee_credits_zmw, grossAmount);
        const netAmount = Math.max(0, grossAmount - credits);
        const dueDate = sub.current_period_end;

        const invNumber = invoiceNumber(organizationId, sub.current_period_start);

        const { data: invoice, error: invErr } = await supabase
            .from('subscription_invoices')
            .insert({
                organization_id: organizationId,
                subscription_id: sub.id,
                invoice_number: invNumber,
                period_start: sub.current_period_start,
                period_end: sub.current_period_end,
                gross_zmw: grossAmount,
                credits_zmw: credits,
                net_zmw: netAmount,
                status: netAmount === 0 ? 'free' : 'pending',
                due_date: dueDate,
                paid_at: netAmount === 0 ? new Date().toISOString() : null,
                paid_via: netAmount === 0 ? 'fee_credits' : null,
            })
            .select()
            .single();

        if (invErr) throw new Error(invErr.message);

        // Auto-pay from the org wallet if enabled and amount > 0
        if (netAmount > 0 && sub.auto_pay_enabled) {
            const result = await payInvoiceFromWallet(organizationId, invoice);
            if (result.status === 'paid') {
                return res.json({ invoice: { ...invoice, status: 'paid', paid_via: 'wallet_auto' } });
            }
        }

        res.json({ invoice });
    } catch (err: any) {
        console.error('[Billing] generateInvoice error:', err.message);
        res.status(500).json({ error: err.message });
    }
}

// ──────────────────────────────────────────────
// Wallet payment — real Lenco transfer to the Blue Opus settlement merchant
// ──────────────────────────────────────────────

const subPayWalletKey = (ref: string) => `subscription_pay:${ref}`;

/** Same balance the wallet list shows in the UI (cashbook_entries has no is_deleted column). */
async function getWalletBalance(organizationId: string, walletId?: string | null): Promise<number> {
    return Number(await cashbookService.getCurrentBalance(organizationId, 'MONEYWISE_WALLET', walletId || undefined)) || 0;
}

async function mainWalletId(organizationId: string): Promise<string | null> {
    const { data } = await supabase
        .from('organization_wallets')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('is_main', true)
        .maybeSingle();
    return data?.id ?? null;
}

export type WalletPayResult =
    | { status: 'paid' }
    | { status: 'processing'; reference: string }
    | { status: 'insufficient'; walletBalance: number }
    | { status: 'error'; message: string };

/**
 * Books a confirmed subscription payment: marks the invoice paid and posts the
 * wallet debit. Safe to call repeatedly — the invoice is claimed with a
 * status guard and the ledger row is keyed by the transfer reference.
 * Paying an invoice never moves the billing period; the cycle engine owns that.
 */
async function finalizeWalletPayment(invoice: any, reference: string): Promise<void> {
    const orgId = invoice.organization_id;
    const now = new Date().toISOString();

    const { data: claimed } = await supabase
        .from('subscription_invoices')
        .update({ status: 'paid', paid_at: now, paid_via: 'wallet_auto', lenco_reference: reference })
        .eq('id', invoice.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
    if (!claimed) return; // someone else already finalized it

    const { data: saved } = await supabase.from('app_settings').select('value').eq('key', subPayWalletKey(reference)).maybeSingle();
    const walletId = (saved?.value as any)?.walletId || (await mainWalletId(orgId));

    const { data: existing } = await supabase
        .from('cashbook_entries')
        .select('id')
        .eq('organization_id', orgId)
        .eq('external_reference', reference)
        .maybeSingle();
    if (!existing) {
        await cashbookService.createEntry(orgId, {
            description: `MoneyWise Subscription - Premium Plan (${invoice.invoice_number}) | Ref: ${reference}`,
            credit: Number(invoice.net_zmw),
            debit: 0,
            account_type: 'MONEYWISE_WALLET',
            entry_type: 'EXPENSE',
            status: 'COMPLETED',
            date: now.split('T')[0],
            reference_number: `SUB-${invoice.id.slice(0, 8).toUpperCase()}`,
            external_reference: reference,
            ...(walletId ? { wallet_id: walletId } : {}),
        } as any);
    }

    // Subscription is in good standing again if nothing else is overdue.
    await refreshSubscriptionStatus(invoice.subscription_id);
    console.log(`[Billing] Invoice ${invoice.invoice_number} paid from wallet (${reference}) for org ${orgId}`);
}

/**
 * Pays one pending invoice from the org's MoneyWise wallet by sweeping the
 * money to the Blue Opus settlement merchant over Lenco (an on-us transfer),
 * then booking the wallet debit once Lenco confirms. The transfer reference is
 * stored on the invoice BEFORE sending and reused on retries, so a retry can
 * never move the money twice (Lenco rejects a duplicate reference).
 */
async function payInvoiceFromWallet(organizationId: string, invoice: any, walletId?: string | null): Promise<WalletPayResult> {
    try {
        const { data: org } = await supabase
            .from('organizations')
            .select('lenco_subaccount_id, lenco_secret_key')
            .eq('id', organizationId)
            .single();
        if (!org?.lenco_subaccount_id) return { status: 'error', message: 'This organization has no MoneyWise wallet account yet.' };
        const secretKey = org.lenco_secret_key || undefined;

        // Resume a previous attempt before sending anything new.
        let reference: string | null = String(invoice.lenco_reference || '').startsWith('PG-SUB-') ? invoice.lenco_reference : null;
        if (reference) {
            const prev = await LencoService.getTransferStatus(reference, secretKey).catch(() => null);
            const st = String(prev?.status || '').toLowerCase();
            if (st === 'successful') { await finalizeWalletPayment(invoice, reference); return { status: 'paid' }; }
            if (prev && st !== 'failed' && st !== 'declined' && st !== 'rejected') return { status: 'processing', reference };
            if (st === 'failed' || st === 'declined' || st === 'rejected') reference = null; // genuinely failed → fresh reference
            // prev === null => Lenco never saw it; safe to re-send with the SAME reference.
        }

        const amount = Math.round(Number(invoice.net_zmw) * 100) / 100;
        const sourceWalletId = walletId || (await mainWalletId(organizationId));
        const balance = await getWalletBalance(organizationId, sourceWalletId);
        if (balance < amount) {
            console.log(`[Billing] Insufficient wallet balance (K${balance.toFixed(2)}) for K${amount.toFixed(2)} subscription. Invoice remains pending.`);
            return { status: 'insufficient', walletBalance: Math.round(balance * 100) / 100 };
        }

        if (!reference) {
            reference = `PG-SUB-${Date.now()}-${invoice.id.replace(/-/g, '').slice(0, 6)}`;
        }
        await supabase.from('subscription_invoices').update({ lenco_reference: reference }).eq('id', invoice.id);
        await supabase.from('app_settings').upsert({
            key: subPayWalletKey(reference),
            value: { walletId: sourceWalletId, invoiceId: invoice.id },
            description: 'Pending subscription wallet payment (safe to delete once settled).',
            updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });

        await LencoService.transferToLencoMerchant(
            { amount, reference, tillNumber: SETTLEMENT_TILL_NUMBER, narration: `Subscription ${invoice.invoice_number} ${reference}`.slice(0, 60) },
            org.lenco_subaccount_id,
            secretKey,
        );

        // On-us transfers normally settle within seconds; otherwise a later view/tick settles it.
        for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 1500));
            const st = await LencoService.getTransferStatus(reference, secretKey).catch(() => null);
            const s = String(st?.status || '').toLowerCase();
            if (s === 'successful') { await finalizeWalletPayment(invoice, reference); return { status: 'paid' }; }
            if (s === 'failed' || s === 'declined' || s === 'rejected') {
                return { status: 'error', message: st?.reasonForFailure || 'The wallet transfer was not completed.' };
            }
        }
        return { status: 'processing', reference };
    } catch (err: any) {
        console.error('[Billing] payInvoiceFromWallet error:', err.message);
        return { status: 'error', message: err.message };
    }
}

/** Settles invoices whose wallet transfer was accepted by Lenco but not yet confirmed locally. Idempotent. */
async function settleProcessingInvoices(organizationId: string): Promise<void> {
    const { data: pending } = await supabase
        .from('subscription_invoices')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .like('lenco_reference', 'PG-SUB-%');
    if (!pending?.length) return;
    const { data: org } = await supabase.from('organizations').select('lenco_secret_key').eq('id', organizationId).maybeSingle();
    for (const inv of pending) {
        const st = await LencoService.getTransferStatus(inv.lenco_reference, org?.lenco_secret_key || undefined).catch(() => null);
        if (String(st?.status || '').toLowerCase() === 'successful') {
            await finalizeWalletPayment(inv, inv.lenco_reference).catch(e => console.error('[Billing] settle failed:', e.message));
        }
    }
}

/** active ⇄ past_due: an org is past due while any invoice is unpaid after its due date. */
async function refreshSubscriptionStatus(subscriptionId: string): Promise<void> {
    const { count } = await supabase
        .from('subscription_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_id', subscriptionId)
        .eq('status', 'pending')
        .gt('net_zmw', 0)
        .lt('due_date', todayStr());
    await supabase
        .from('organization_subscriptions')
        .update({ status: (count || 0) > 0 ? 'past_due' : 'active', updated_at: new Date().toISOString() })
        .eq('id', subscriptionId)
        .neq('status', 'cancelled');
}

// ──────────────────────────────────────────────
// POST /billing/pay/:invoiceId  — pay from a specific MoneyWise wallet
// Body: { walletId?: string }  (defaults to the org's main wallet)
// ──────────────────────────────────────────────
export async function initiateInvoicePayment(req: Request, res: Response) {
    try {
        const organizationId = (req as any).user?.organization_id;
        const { invoiceId } = req.params;
        const { walletId } = req.body || {};

        const { data: invoice, error: invErr } = await supabase
            .from('subscription_invoices')
            .select('*')
            .eq('id', invoiceId)
            .eq('organization_id', organizationId)
            .single();

        if (invErr || !invoice) return res.status(404).json({ error: 'Invoice not found' });
        if (invoice.status !== 'pending') return res.status(400).json({ error: 'Invoice is already paid or voided' });
        if (invoice.net_zmw <= 0) return res.status(400).json({ error: 'Nothing to pay on this invoice' });

        const result = await payInvoiceFromWallet(organizationId, invoice, walletId);

        if (result.status === 'insufficient') {
            return res.status(402).json({
                error: 'Insufficient wallet balance',
                walletBalance: result.walletBalance,
                required: invoice.net_zmw,
            });
        }
        if (result.status === 'processing') {
            return res.status(202).json({ success: true, processing: true, message: 'Payment sent — waiting for confirmation from the wallet provider.' });
        }
        if (result.status === 'error') {
            return res.status(502).json({ error: result.message });
        }

        res.json({ success: true, message: 'Payment processed from MoneyWise wallet' });
    } catch (err: any) {
        console.error('[Billing] initiateInvoicePayment error:', err.message);
        res.status(500).json({ error: err.message });
    }
}

// ──────────────────────────────────────────────
// POST /billing/pay/:invoiceId/mobile-money
// Body: { phone, operator }
// Initiates a Lenco MoMo collection for the invoice amount.
// ──────────────────────────────────────────────
export async function initiateInvoiceMobileMoneyPayment(req: Request, res: Response) {
    try {
        const organizationId = (req as any).user?.organization_id;
        if (!organizationId) return res.status(400).json({ error: 'No organization found for this user' });

        const { invoiceId } = req.params;
        const { phone, operator } = req.body || {};

        if (!phone || !operator) {
            return res.status(400).json({ error: 'phone and operator are required' });
        }
        if (!['airtel', 'mtn', 'zamtel', 'tnm'].includes(operator)) {
            return res.status(400).json({ error: 'operator must be one of: airtel, mtn, zamtel, tnm' });
        }

        const { data: invoice, error: invErr } = await supabase
            .from('subscription_invoices')
            .select('*')
            .eq('id', invoiceId)
            .eq('organization_id', organizationId)
            .single();

        if (invErr || !invoice) return res.status(404).json({ error: 'Invoice not found' });
        if (invoice.status !== 'pending') return res.status(400).json({ error: 'Invoice is already paid or voided' });
        if (invoice.net_zmw <= 0) return res.status(400).json({ error: 'Nothing to pay on this invoice' });

        // Get the org's Lenco secret key
        const { data: org } = await supabase
            .from('organizations')
            .select('lenco_secret_key')
            .eq('id', organizationId)
            .single();

        const secretKey = org?.lenco_secret_key || process.env.LENCO_SECRET_KEY;
        const reference = `SUBPAY-MM-${invoiceId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;

        const collection = await LencoService.initiateMobileMoneyCollection({
            amount: invoice.net_zmw,
            reference,
            phone,
            operator: operator as 'airtel' | 'mtn' | 'zamtel' | 'tnm',
        }, secretKey);

        // Store the reference on the invoice so we can match it on confirmation
        await supabase
            .from('subscription_invoices')
            .update({ lenco_reference: reference })
            .eq('id', invoiceId);

        captureEvent('subscription_momo_payment_initiated', {
            feature: 'billing',
            workflow_id: reference,
            organization_id: organizationId,
            user_id: (req as any).user?.id || 'unknown',
            status: 'started',
            amount: invoice.net_zmw,
        });

        res.json({ success: true, reference, collection });
    } catch (err: any) {
        console.error('[Billing] initiateInvoiceMobileMoneyPayment error:', err.message);
        res.status(500).json({ error: err.message });
    }
}

// ──────────────────────────────────────────────
// GET /billing/pay/:invoiceId/mobile-money/status
// Polls Lenco for the collection status and marks the invoice paid on success.
// ──────────────────────────────────────────────
export async function checkInvoiceMobileMoneyStatus(req: Request, res: Response) {
    try {
        const organizationId = (req as any).user?.organization_id;
        if (!organizationId) return res.status(400).json({ error: 'No organization found for this user' });

        const { invoiceId } = req.params;

        const { data: invoice, error: invErr } = await supabase
            .from('subscription_invoices')
            .select('*, organization_subscriptions(id)')
            .eq('id', invoiceId)
            .eq('organization_id', organizationId)
            .single();

        if (invErr || !invoice) return res.status(404).json({ error: 'Invoice not found' });
        if (!invoice.lenco_reference) return res.status(400).json({ error: 'No mobile money collection initiated for this invoice' });

        // Already marked paid — return immediately
        if (invoice.status === 'paid' || invoice.status === 'free') {
            return res.json({ status: 'paid' });
        }

        const { data: org } = await supabase
            .from('organizations')
            .select('lenco_secret_key')
            .eq('id', organizationId)
            .single();

        const secretKey = org?.lenco_secret_key || process.env.LENCO_SECRET_KEY;
        const lencoStatus = await LencoService.getCollectionStatus(invoice.lenco_reference, secretKey);

        const collectionStatus: string = lencoStatus?.status || 'pending';

        if (collectionStatus === 'successful') {
            const now = new Date().toISOString();
            const subId = invoice.organization_subscriptions?.id;

            // Mark invoice paid
            await supabase
                .from('subscription_invoices')
                .update({ status: 'paid', paid_at: now, paid_via: 'mobile_money' })
                .eq('id', invoiceId);

            // Paying an invoice never moves the billing period — the cycle engine owns that.
            if (subId) await refreshSubscriptionStatus(subId);

            return res.json({ status: 'paid' });
        }

        if (collectionStatus === 'failed' || collectionStatus === 'cancelled') {
            return res.json({ status: 'failed' });
        }

        res.json({ status: 'pending' });
    } catch (err: any) {
        console.error('[Billing] checkInvoiceMobileMoneyStatus error:', err.message);
        res.status(500).json({ error: err.message });
    }
}

// ──────────────────────────────────────────────
// GET /billing/invoice/:invoiceId/receipt
// Returns structured receipt data (PDF generation done client-side)
// ──────────────────────────────────────────────
export async function getInvoiceReceipt(req: Request, res: Response) {
    try {
        const organizationId = (req as any).user?.organization_id;
        const { invoiceId } = req.params;

        const { data: invoice, error } = await supabase
            .from('subscription_invoices')
            .select(`
                *,
                organization_subscriptions (plan_id)
            `)
            .eq('id', invoiceId)
            .eq('organization_id', organizationId)
            .single();

        if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });

        const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', organizationId)
            .single();

        // Invoices store only the gross total: base plan + (while integrated) the Master Fees add-on.
        const gross = Number(invoice.gross_zmw) || 0;
        const masterfees = gross >= SUBSCRIPTION_PRICE + MASTERFEES_ADDON_PRICE ? gross - SUBSCRIPTION_PRICE : 0;

        res.json({
            receipt: {
                ...invoice,
                breakdown: { base: gross - masterfees, masterfees },
                organization_name: org?.name || 'Organization',
            },
        });
    } catch (err: any) {
        console.error('[Billing] getInvoiceReceipt error:', err.message);
        res.status(500).json({ error: err.message });
    }
}

// ──────────────────────────────────────────────
// Billing cycle engine (cron)
// POST /billing/tick  — protected by LENCO_SYNC_SECRET like the other internal sweeps.
//
// Until now nothing rolled billing periods or generated invoices on a schedule:
// periods only moved when an invoice was paid, and invoices only appeared when
// someone opened the billing page. This closes every elapsed period, issues its
// invoice, starts the next period, flags overdue orgs as past_due, and — only
// when called with ?autoPay=true — charges pending invoices to the org wallet.
// ──────────────────────────────────────────────
export async function billingTick(req: Request, res: Response) {
    const authHeader = req.headers['authorization'] || '';
    const secret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!secret || secret !== process.env.LENCO_SYNC_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const autoPay = String(req.query.autoPay || req.body?.autoPay || '') === 'true';
    const summary = { checked: 0, periodsClosed: 0, paid: 0, processing: 0, insufficient: 0, pastDue: 0, errors: [] as string[] };

    try {
        const { data: subs, error } = await supabase
            .from('organization_subscriptions')
            .select('*')
            .eq('plan_id', 'premium')
            .neq('status', 'cancelled');
        if (error) throw new Error(error.message);

        for (const original of subs || []) {
            summary.checked++;
            try {
                let sub: any = original;

                // Close every elapsed period (cap guards against runaway loops on bad data).
                for (let i = 0; i < 24 && sub.current_period_end <= todayStr(); i++) {
                    await ensureCurrentInvoice(sub);
                    const nextStart = sub.current_period_end;
                    const { data: advanced, error: advErr } = await supabase
                        .from('organization_subscriptions')
                        .update({
                            current_period_start: nextStart,
                            current_period_end: addOneMonth(nextStart),
                            fee_credits_zmw: 0,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', sub.id)
                        .select()
                        .single();
                    if (advErr) throw new Error(advErr.message);
                    sub = advanced;
                    summary.periodsClosed++;
                }
                await ensureCurrentInvoice(sub);
                await settleProcessingInvoices(sub.organization_id);

                if (autoPay && sub.auto_pay_enabled) {
                    const { data: due } = await supabase
                        .from('subscription_invoices')
                        .select('*')
                        .eq('subscription_id', sub.id)
                        .eq('status', 'pending')
                        .gt('net_zmw', 0)
                        .lte('due_date', todayStr())
                        .order('period_start', { ascending: true });
                    for (const inv of due || []) {
                        const r = await payInvoiceFromWallet(sub.organization_id, inv);
                        if (r.status === 'paid') summary.paid++;
                        else if (r.status === 'processing') summary.processing++;
                        else if (r.status === 'insufficient') summary.insufficient++;
                        else summary.errors.push(`${sub.organization_id}/${inv.invoice_number}: ${r.message}`);
                    }
                }

                await refreshSubscriptionStatus(sub.id);
            } catch (orgErr: any) {
                summary.errors.push(`${original.organization_id}: ${orgErr.message}`);
            }
        }

        const { count } = await supabase
            .from('organization_subscriptions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'past_due');
        summary.pastDue = count || 0;

        res.json({ success: true, autoPay, ...summary });
    } catch (err: any) {
        console.error('[Billing] tick failed:', err.message);
        res.status(500).json({ error: err.message });
    }
}
