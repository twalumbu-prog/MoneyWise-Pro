import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { captureEvent } from '../utils/analytics';

const SUBSCRIPTION_PRICE = 250; // K250/month

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function invoiceNumber(orgId: string): string {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const short = orgId.replace(/-/g, '').slice(0, 6).toUpperCase();
    return `INV-${ym}-${short}`;
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

// ──────────────────────────────────────────────
// GET /billing/subscription
// ──────────────────────────────────────────────
export async function getSubscription(req: Request, res: Response) {
    try {
        const organizationId = (req as any).organizationId;
        const sub = await ensureSubscription(organizationId);

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

        const amountDue = Math.max(0, SUBSCRIPTION_PRICE - sub.fee_credits_zmw);
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
        const organizationId = (req as any).organizationId;
        const sub = await ensureSubscription(organizationId);

        if (sub.plan_id === 'premium') {
            return res.status(400).json({ error: 'Already on Premium plan' });
        }

        const today = new Date().toISOString().split('T')[0];
        const periodEnd = new Date(new Date().setMonth(new Date().getMonth() + 1))
            .toISOString().split('T')[0];

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
        const organizationId = (req as any).organizationId;
        const sub = await ensureSubscription(organizationId);

        if (sub.plan_id === 'free') {
            return res.status(400).json({ error: 'Already on Free plan' });
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

        // Only credit premium-eligible orgs (or all orgs to track potential value)
        // Skip if already fully credited this period
        if (sub.fee_credits_zmw >= SUBSCRIPTION_PRICE) return;

        const newCredits = Math.min(sub.fee_credits_zmw + amount, SUBSCRIPTION_PRICE);
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
            ` (total this period: K${newCredits.toFixed(2)} / K${SUBSCRIPTION_PRICE})`
        );

        // If fully paid → void pending invoice for this period if any
        if (newCredits >= SUBSCRIPTION_PRICE) {
            await supabase
                .from('subscription_invoices')
                .update({ status: 'free', paid_at: new Date().toISOString(), paid_via: 'fee_credits' })
                .eq('subscription_id', sub.id)
                .eq('status', 'pending');
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
        const organizationId = (req as any).organizationId;
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

        const grossAmount = SUBSCRIPTION_PRICE;
        const credits = sub.fee_credits_zmw;
        const netAmount = Math.max(0, grossAmount - credits);
        const dueDate = sub.current_period_end;

        const invNumber = invoiceNumber(organizationId);

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

        // Auto-deduct from org wallet if enabled and amount > 0
        if (netAmount > 0 && sub.auto_pay_enabled) {
            const walletDeducted = await attemptWalletAutoDeduction(organizationId, sub.id, invoice.id, netAmount);
            if (walletDeducted) {
                return res.json({ invoice: { ...invoice, status: 'paid', paid_via: 'wallet_auto' } });
            }
        }

        res.json({ invoice });
    } catch (err: any) {
        console.error('[Billing] generateInvoice error:', err.message);
        res.status(500).json({ error: err.message });
    }
}

/**
 * Try to deduct the subscription amount from the org's MoneyWise wallet balance.
 * Returns true if successful, false if insufficient funds.
 */
async function attemptWalletAutoDeduction(
    organizationId: string,
    subscriptionId: string,
    invoiceId: string,
    amount: number
): Promise<boolean> {
    try {
        // Get the org's primary MONEYWISE_WALLET balance via cashbook_entries
        const { data: balanceRows } = await supabase
            .from('cashbook_entries')
            .select('debit, credit')
            .eq('organization_id', organizationId)
            .eq('account_type', 'MONEYWISE_WALLET')
            .eq('is_deleted', false);

        const walletBalance = (balanceRows || []).reduce(
            (acc: number, r: any) => acc + (r.debit || 0) - (r.credit || 0), 0
        );

        if (walletBalance < amount) {
            console.log(`[Billing] Insufficient wallet balance (K${walletBalance.toFixed(2)}) for K${amount.toFixed(2)} subscription. Invoice remains pending.`);
            return false;
        }

        // Post a debit entry to the wallet
        const now = new Date().toISOString();
        const { error: entryErr } = await supabase
            .from('cashbook_entries')
            .insert({
                organization_id: organizationId,
                description: `MoneyWise Subscription - Premium Plan`,
                credit: amount,
                debit: 0,
                account_type: 'MONEYWISE_WALLET',
                entry_type: 'EXPENSE',
                status: 'COMPLETED',
                date: now.split('T')[0],
                created_at: now,
                reference_number: `SUB-${invoiceId.slice(0, 8).toUpperCase()}`,
            });

        if (entryErr) throw new Error(entryErr.message);

        // Mark invoice as paid
        await supabase
            .from('subscription_invoices')
            .update({ status: 'paid', paid_at: now, paid_via: 'wallet_auto' })
            .eq('id', invoiceId);

        // Roll subscription period forward
        const nextStart = new Date().toISOString().split('T')[0];
        const nextEnd = new Date(new Date().setMonth(new Date().getMonth() + 1))
            .toISOString().split('T')[0];

        await supabase
            .from('organization_subscriptions')
            .update({
                fee_credits_zmw: 0,
                current_period_start: nextStart,
                current_period_end: nextEnd,
                status: 'active',
                updated_at: now,
            })
            .eq('id', subscriptionId);

        console.log(`[Billing] Auto-deducted K${amount.toFixed(2)} from wallet for org ${organizationId}`);
        return true;
    } catch (err: any) {
        console.error('[Billing] attemptWalletAutoDeduction error:', err.message);
        return false;
    }
}

// ──────────────────────────────────────────────
// POST /billing/pay/:invoiceId  — pay from MoneyWise wallet (manual trigger)
// ──────────────────────────────────────────────
export async function initiateInvoicePayment(req: Request, res: Response) {
    try {
        const organizationId = (req as any).organizationId;
        const { invoiceId } = req.params;

        const { data: invoice, error: invErr } = await supabase
            .from('subscription_invoices')
            .select('*')
            .eq('id', invoiceId)
            .eq('organization_id', organizationId)
            .single();

        if (invErr || !invoice) return res.status(404).json({ error: 'Invoice not found' });
        if (invoice.status !== 'pending') return res.status(400).json({ error: 'Invoice is already paid or voided' });
        if (invoice.net_zmw <= 0) return res.status(400).json({ error: 'Nothing to pay on this invoice' });

        // Get the org's active subscription
        const { data: sub } = await supabase
            .from('organization_subscriptions')
            .select('id')
            .eq('organization_id', organizationId)
            .single();

        if (!sub) return res.status(404).json({ error: 'Subscription not found' });

        const paid = await attemptWalletAutoDeduction(organizationId, sub.id, invoiceId, invoice.net_zmw);

        if (!paid) {
            // Get wallet balance for the error message
            const { data: balanceRows } = await supabase
                .from('cashbook_entries')
                .select('debit, credit')
                .eq('organization_id', organizationId)
                .eq('account_type', 'MONEYWISE_WALLET')
                .eq('is_deleted', false);

            const walletBalance = (balanceRows || []).reduce(
                (acc: number, r: any) => acc + (r.debit || 0) - (r.credit || 0), 0
            );

            return res.status(402).json({
                error: 'Insufficient wallet balance',
                walletBalance: Math.round(walletBalance * 100) / 100,
                required: invoice.net_zmw,
            });
        }

        res.json({ success: true, message: 'Payment processed from MoneyWise wallet' });
    } catch (err: any) {
        console.error('[Billing] initiateInvoicePayment error:', err.message);
        res.status(500).json({ error: err.message });
    }
}

// ──────────────────────────────────────────────
// GET /billing/invoice/:invoiceId/receipt
// Returns structured receipt data (PDF generation done client-side)
// ──────────────────────────────────────────────
export async function getInvoiceReceipt(req: Request, res: Response) {
    try {
        const organizationId = (req as any).organizationId;
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

        res.json({
            receipt: {
                ...invoice,
                organization_name: org?.name || 'Organization',
            },
        });
    } catch (err: any) {
        console.error('[Billing] getInvoiceReceipt error:', err.message);
        res.status(500).json({ error: err.message });
    }
}
