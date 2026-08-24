import { Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { LencoService } from '../services/lenco.service';
import { cashbookService } from '../services/cashbook.service';
import { supabase } from '../lib/supabase';
import { ruleEngine } from '../services/ai/rule.engine';
import { decisionRouter } from '../services/ai/decision.router';
import { applyProductRevenueRouting, markPaymentLinkPaid, confirmBookingsForReference } from '../services/product_routing.service';
import { recordFeeCredit } from './billing.controller';
import { whatsappService } from '../services/whatsapp.service';
import { emailService } from '../services/email.service';
import { QuickBooksService } from '../services/quickbooks.service';
import { captureEvent, withTiming } from '../utils/analytics';

// MoneyWise settlement merchant (Blue Opus Software Technology). The platform
// commission collected on external payment links is auto-forwarded here.
const SETTLEMENT_TILL_NUMBER = process.env.MONEYWISE_SETTLEMENT_TILL_NUMBER || '9838830';

/**
 * Auto-sweep the MoneyWise platform commission out of a collecting sub-account
 * into the MoneyWise settlement merchant, as a separate "Split payment" transfer.
 *
 * The commission is simply the surplus the customer paid on top of the net
 * subtotal (gross collected − net settled), so it does not depend on re-deriving
 * the fee tier here. After the sweep the sub-account balance equals the net
 * subtotal, mirroring what the merchant sees in their ledger.
 *
 * Idempotent: the transfer reference is deterministic (`SPLIT-<originalRef>`) and
 * we skip if a transfer with that reference already exists. Non-fatal: any failure
 * is logged but never blocks the collection ledger entry.
 */
async function sweepPlatformCommission(
    sourceAccountId: string,
    secretKey: string,
    commission: number,
    originalReference: string,
    organizationId: string
): Promise<void> {
    const splitRef = `SPLIT-${originalReference}`;
    let status: 'succeeded' | 'failed' | 'skipped' = 'succeeded';
    try {
        // Idempotency guard — don't double-sweep if the webhook / verify poller re-fires.
        const existing = await LencoService.getTransferStatus(splitRef, secretKey);
        if (existing) {
            console.log(`[Lenco Sweep] Commission already forwarded for ${originalReference} (ref: ${splitRef}). Skipping.`);
            status = 'skipped';
            return;
        }

        await LencoService.transferToLencoMerchant({
            amount: commission,
            reference: splitRef,
            tillNumber: SETTLEMENT_TILL_NUMBER,
            narration: 'Split payment'
        }, sourceAccountId, secretKey);

        console.log(`[Lenco Sweep] Forwarded commission K${commission.toFixed(2)} → merchant ${SETTLEMENT_TILL_NUMBER} (ref: ${splitRef}).`);
    } catch (sweepErr: any) {
        // Never block the collection on a sweep failure — the surplus stays in the
        // sub-account and can be reconciled/retried.
        console.error(`[Lenco Sweep] FAILED to forward commission for ${originalReference}:`, sweepErr?.message || sweepErr);
        status = 'failed';
    } finally {
        captureEvent('commission_sweep_attempted', {
            feature: 'commission_sweep',
            workflow_id: originalReference,
            organization_id: organizationId,
            user_id: 'system',
            status,
            amount: commission,
        });
    }
}

// Quick Link purpose bucket -> the org account `type` it should map to when
// looking for a best-fit account (accounts.type is 'ASSET'|'LIABILITY'|
// 'EXPENSE'|'INCOME'|'EQUITY' — see apps/api/src/db/schema.sql).
const QUICK_LINK_BUCKET_ACCOUNT_TYPE: Record<string, string> = {
    REVENUE: 'INCOME',
    ASSET: 'ASSET',
    LIABILITY: 'LIABILITY',
};

/**
 * Best-effort: find an existing org account of the given type whose name
 * hints at the bucket (e.g. "revenue"/"sales" for INCOME, "receivable"/"loan"
 * for ASSET, "deposit"/"unearned" for LIABILITY), falling back to any active
 * account of that type. Returns null if the org has none — callers leave the
 * entry UNACCOUNTED in that case, same as any other unmatched inflow.
 */
async function findBestFitAccount(organizationId: string, accountType: string, bucket: string): Promise<string | null> {
    const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('organization_id', organizationId)
        .eq('type', accountType)
        .eq('is_active', true);

    if (!accounts || accounts.length === 0) return null;

    const nameHints: Record<string, string[]> = {
        REVENUE: ['revenue', 'sales', 'income'],
        ASSET: ['receivable', 'loan'],
        LIABILITY: ['deposit', 'unearned', 'advance'],
    };
    const hints = nameHints[bucket] || [];
    const hinted = accounts.find(a => hints.some(h => (a.name || '').toLowerCase().includes(h)));
    return (hinted || accounts[0]).id;
}

/**
 * Quick Link post-payment learning + classification. Runs strictly AFTER the
 * payment has already been confirmed and the payer's poll/webhook response
 * has gone out — this function is invoked fire-and-forget (no `await` at the
 * call site) so it never adds latency to the checkout itself.
 *
 * Preset purposes classify deterministically via their stored bucket; a
 * custom typed purpose is routed through the same decisionRouter used for
 * expense categorization, just handed the org's non-expense accounts instead.
 */
async function postProcessQuickLinkPayment(reference: string): Promise<void> {
    try {
        const { data: ql } = await supabase
            .from('quick_link_payments')
            .select('*')
            .eq('reference', reference)
            .eq('processed', false)
            .maybeSingle();
        if (!ql) return;

        const { data: entry } = await supabase
            .from('cashbook_entries')
            .select('id, status')
            .eq('external_reference', reference)
            .maybeSingle();

        // Only attempt classification if the generic rule-engine pass (which
        // already ran against this same purpose text as the narration) didn't
        // already account for it.
        if (entry && entry.status === 'UNACCOUNTED') {
            let accountId: string | null = null;

            if (!ql.is_custom) {
                const { data: purposeRow } = await supabase
                    .from('quick_link_purposes')
                    .select('bucket')
                    .eq('organization_id', ql.organization_id)
                    .eq('label', ql.purpose_label)
                    .maybeSingle();
                const bucket = purposeRow?.bucket || 'OTHER';
                const accountType = QUICK_LINK_BUCKET_ACCOUNT_TYPE[bucket];
                if (accountType) {
                    accountId = await findBestFitAccount(ql.organization_id, accountType, bucket);
                }
            } else {
                const { data: accounts } = await supabase
                    .from('accounts')
                    .select('*')
                    .eq('organization_id', ql.organization_id)
                    .eq('is_active', true)
                    .in('type', ['ASSET', 'LIABILITY', 'INCOME', 'EQUITY']);

                if (accounts && accounts.length > 0) {
                    const { data: entryAmount } = await supabase
                        .from('cashbook_entries')
                        .select('debit')
                        .eq('id', entry.id)
                        .single();

                    const decision = await decisionRouter.classify(
                        accounts,
                        { description: ql.purpose_label, amount: Number(entryAmount?.debit) || 0 },
                        ql.organization_id
                    );
                    if (decision.account_code && decision.confidence >= 0.70) {
                        const matched = accounts.find((a: any) => String(a.code) === String(decision.account_code));
                        accountId = matched?.id || null;
                    }
                }
            }

            if (accountId) {
                await supabase
                    .from('cashbook_entries')
                    .update({ account_id: accountId, status: 'ACCOUNTED' })
                    .eq('id', entry.id);
                console.log(`[Quick Link] Auto-classified "${ql.purpose_label}" (ref ${reference}) -> account ${accountId}`);
            }
        }

        await supabase.rpc('increment_quick_link_purpose_usage', {
            p_org_id: ql.organization_id,
            p_label: ql.purpose_label,
            p_bucket: null,
        });
        await supabase.from('quick_link_payments').update({ processed: true }).eq('reference', reference);
    } catch (err: any) {
        // Never fatal — the payment itself already succeeded and was already
        // reported to the payer well before this runs.
        console.error(`[Quick Link] Post-payment processing failed for ${reference}:`, err?.message || err);
    }
}

/**
 * Handles Lenco webhooks for collections and transfers
 */
export const handleLencoWebhook = async (req: Request, res: Response) => {
    const signature = req.headers['x-lenco-signature'] as string;

    // FIX (Issue 3): Strictly enforce webhook signature. Reject any request
    // that is missing or has an invalid signature to prevent forged events.
    if (!signature) {
        console.warn('[Lenco Webhook] REJECTED: Missing x-lenco-signature header');
        captureEvent('lenco_webhook_rejected', {
            feature: 'lenco_webhook', workflow_id: 'unknown', organization_id: 'unknown',
            user_id: 'system', status: 'failed', error_code: 'missing_signature',
        });
        return res.status(401).json({ error: 'Unauthorized: Missing signature' });
    }

    const event = req.body;

    // Lenco signs each webhook with the secret key of the account that owns the
    // event. Orgs with their own lenco_secret_key (multi-tenant subaccounts) sign
    // with THAT key, not the platform's global LENCO_SECRET_KEY — verifying only
    // against the global key silently rejected (401) every webhook for those
    // orgs, which is how failed/successful transfers went undetected. Resolve the
    // org from the event's accountId (unverified at this point, but a forged
    // accountId simply fails signature verification below since an attacker
    // doesn't have that org's real key) and accept a match against either key.
    const accountId = event?.data?.accountId || event?.data?.account_id;
    const candidateKeys = new Set<string>();
    if (process.env.LENCO_SECRET_KEY) candidateKeys.add(process.env.LENCO_SECRET_KEY);
    if (accountId) {
        const { data: keyOrg } = await supabase
            .from('organizations')
            .select('lenco_secret_key')
            .eq('lenco_subaccount_id', accountId)
            .maybeSingle();
        if (keyOrg?.lenco_secret_key) candidateKeys.add(keyOrg.lenco_secret_key);
    }

    if (candidateKeys.size > 0) {
        const rawBody = (req as any).rawBody;
        const bodyToSign = rawBody || JSON.stringify(req.body);
        const isValidSignature = [...candidateKeys].some((key) => {
            const webhookHashKey = crypto.createHash("sha256").update(key).digest("hex");
            const expectedSignature = crypto.createHmac('sha512', webhookHashKey)
                .update(bodyToSign)
                .digest('hex');
            return signature === expectedSignature;
        });

        if (!isValidSignature) {
            console.warn('[Lenco Webhook] REJECTED: Invalid signature');
            captureEvent('lenco_webhook_rejected', {
                feature: 'lenco_webhook', workflow_id: 'unknown', organization_id: 'unknown',
                user_id: 'system', status: 'failed', error_code: 'invalid_signature',
            });
            return res.status(401).json({ error: 'Unauthorized: Invalid signature' });
        }
    }

    console.log('[Lenco Webhook] Received event:', event.event);

    try {
        switch (event.event) {
            case 'collection.successful':
                await handleCollectionSuccessful(event.data);
                break;
            case 'transfer.successful':
                await handleTransferSuccessful(event.data);
                break;
            case 'transfer.failed':
                await handleTransferFailed(event.data);
                break;
            default:
                console.log(`[Lenco Webhook] Unhandled event type: ${event.event}`);
        }

        return res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('[Lenco Webhook] Error processing event:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Handles 'collection.successful' event
 * Logs an inflow into the MoneyWise Wallet
 */
export async function handleCollectionSuccessful(data: any, forcedOrganizationId: string | null = null) {
    if (!data) {
        console.warn('[Lenco Webhook] handleCollectionSuccessful called with null data');
        return false;
    }

    const { reference, amount, currency, narration, description, meta, metadata } = data;
    // Attempt to extract sender identity from the Lenco webhook payload.
    // Lenco may surface this under different keys depending on the channel.
    const lencoSenderName: string | null =
        data.sender_name || data.senderName ||
        meta?.sender_name || meta?.senderName || meta?.payer_name || meta?.payerName ||
        metadata?.sender_name || metadata?.senderName || metadata?.payer_name || metadata?.payerName ||
        null;
    const lencoSenderPhone: string | null =
        data.sender_phone || data.senderPhone ||
        meta?.sender_phone || meta?.senderPhone || meta?.payer_phone || meta?.payerPhone ||
        metadata?.sender_phone || metadata?.senderPhone || metadata?.payer_phone || metadata?.payerPhone ||
        null;
    const accountId = data.accountId || data.account_id;
    
    let organizationId = forcedOrganizationId;
    let identificationStage = forcedOrganizationId ? 'Stage 0: Forced ID' : 'None';

    console.log(`[Lenco Webhook] Processing collection: ref=${reference || 'N/A'}, accountId=${accountId || 'N/A'}, amount=${amount || 'N/A'}`);

    // Validation: amount is required for ledger entry
    if (!amount) {
        console.error('[Lenco Webhook] Aborting: No amount provided in collection data');
        return false;
    }

    // 1. Try to extract organization ID from reference using regex (Primary Source of Truth)
    if (!organizationId && reference) {
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
        const matches = reference.match(uuidRegex);
        
        if (matches && matches.length > 0) {
            const potentialOrgIds = [...matches];
            // We search from the end of the reference as our standard is DEP-timestamp-subaccount-ORGID
            for (const id of potentialOrgIds.reverse()) {
                try {
                    const { data: org, error } = await supabase
                        .from('organizations')
                        .select('id')
                        .eq('id', id)
                        .maybeSingle();
                        
                    if (!error && org) {
                        organizationId = org.id;
                        identificationStage = 'Stage 1: Reference Regex';
                        console.log(`[Lenco Webhook] Identified organization ${organizationId} via regex matching in reference`);
                        break;
                    }
                } catch (err) {
                    console.error('[Lenco Webhook] Error verifying potential organization ID from reference:', err);
                }
            }
        }
    }

    // 2. Fallback: Lookup by lenco_subaccount_id if present in payload
    if (!organizationId && accountId) {
        try {
            const { data: org, error } = await supabase
                .from('organizations')
                .select('id')
                .eq('lenco_subaccount_id', accountId)
                .maybeSingle();

            if (!error && org) {
                organizationId = org.id;
                identificationStage = 'Stage 2: Subaccount ID Fallback';
                console.log(`[Lenco Webhook] Identified organization ${organizationId} via subaccount ${accountId}`);
            }
        } catch (err) {
            console.error('[Lenco Webhook] Error looking up organization by subaccount:', err);
        }
    }

    if (!organizationId) {
        console.warn('[Lenco Webhook] FAILURE: No organization identified for collection. Ref:', reference);
        captureEvent('payment_collection_org_unidentified', {
            feature: 'payment_collection', workflow_id: reference || 'unknown', organization_id: 'unknown',
            user_id: 'system', status: 'failed', amount,
        });
        return false;
    }

    // Deduplicate against the org's ledger by Lenco reference. Multi-row-safe:
    // .maybeSingle() errors out (data=null) when >1 row matches — e.g. a finalized
    // entry plus a stale PENDING twin — which previously read as "no match" and
    // produced duplicate raw inflows. Fetch candidates and pick explicitly instead.
    let pendingEntry: any = null;
    let finalizedDuplicate: any = null;
    if (reference) {
        const { data: byRef } = await supabase
            .from('cashbook_entries')
            .select('id, status, description, wallet_id, debit, date, account_type')
            .eq('organization_id', organizationId)
            .eq('external_reference', reference)
            .limit(5);
        let candidates: any[] = byRef || [];
        if (candidates.length === 0) {
            // Legacy intents carry the reference only inside the description.
            const { data: byDesc } = await supabase
                .from('cashbook_entries')
                .select('id, status, description, wallet_id, debit, date, account_type')
                .eq('organization_id', organizationId)
                .like('description', `%${reference}%`)
                .limit(5);
            candidates = byDesc || [];
        }
        finalizedDuplicate = candidates.find((c: any) => c.status !== 'PENDING') || null;
        pendingEntry = candidates.find((c: any) => c.status === 'PENDING') || null;
    }

    if (finalizedDuplicate) {
        console.log(`[Lenco Webhook] DUPLICATE IGNORED: Collection ${reference} already logged as ${finalizedDuplicate.id}.`);
        captureEvent('payment_collection_deduplicated', {
            feature: 'payment_collection', workflow_id: reference, organization_id: organizationId,
            user_id: 'system', duplicate_of: finalizedDuplicate.id,
        });
        // Heal partial prior runs: a leftover PENDING twin is redundant once a
        // finalized entry exists, and the sale may still be stuck PENDING if the
        // earlier run died between the ledger write and the sale update.
        if (pendingEntry) {
            await supabase.from('cashbook_entries').delete().eq('id', pendingEntry.id).eq('status', 'PENDING');
        }
        if (reference) {
            await supabase
                .from('product_sales')
                .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
                .eq('reference', reference)
                .eq('status', 'PENDING');
            // Heal routing + booking + link state too, in case the earlier run died before these ran.
            await applyProductRevenueRouting(organizationId, reference);
            await confirmBookingsForReference(organizationId, reference);
            const linkPaidOnHeal = await markPaymentLinkPaid(organizationId, reference);
            // Only fires if THIS heal run owned the ACTIVE→PAID flip (notifications exactly once).
            if (linkPaidOnHeal) {
                await whatsappService.notifyPaymentLinkPaid(organizationId, reference);
                await emailService.notifyPaymentLinkPaid(organizationId, reference);
                captureEvent('payment_receipt_notification_attempted', {
                    feature: 'payment_receipt_notification', workflow_id: reference, organization_id: organizationId,
                    user_id: 'system', channel: 'whatsapp', notify_fn: 'notifyPaymentLinkPaid', status: 'attempted',
                });
            }
        }
        return true;
    }

    try {
        return await withTiming(
            'payment_collection',
            { feature: 'payment_collection', workflow_id: reference, organization_id: organizationId, user_id: 'system', amount, identification_stage: identificationStage },
            async () => {
        console.log(`[Lenco Webhook] Identification successful: ${identificationStage} -> ${organizationId}`);

        const formattedAmount = Number(amount).toLocaleString();

        if (reference && reference.startsWith('CHG-')) {
            console.log(`[Lenco Webhook] Identified change submission: ${reference}`);
            
            const parts = reference.split('-');
            let reqIdToUse = '';
            
            // Reference formats: 
            // - CHG-timestamp-uuid (7 parts)
            // - CHG-timestamp-uuid-shortId (8 parts)
            if (parts.length >= 8) {
                reqIdToUse = parts[parts.length - 1];
            } else {
                reqIdToUse = parts.slice(2).join('-');
            }
            
            await cashbookService.updateDisbursementForChange(
                organizationId,
                reqIdToUse,
                parseFloat(amount),
                reference
            );
            
            console.log(`[Lenco Webhook] Meta-data updated for change return. Skipping ledger entry for pure netting.`);
        } else {
            // Extract the actual purpose from the webhook payload if available
            let actualNarration = narration || description || meta?.purpose || metadata?.purpose;
            
            if (pendingEntry && pendingEntry.description && pendingEntry.description.includes('PENDING_INTENT:')) {
                actualNarration = pendingEntry.description.replace('PENDING_INTENT: ', '').replace('PENDING_INTENT:', '').split(' | Ref:')[0].trim();
            }

            if (!actualNarration) {
                actualNarration = `Wallet Deposit - Ref: ${reference || 'N/A'}`;
            }
            
            // Append reference for deduplication logic to work later
            if (reference && !actualNarration.includes(reference)) {
                actualNarration = `${actualNarration} | Ref: ${reference}`;
            }
            
            let walletId = pendingEntry?.wallet_id || null;

            if (!walletId) {
                const { data: mainWallet } = await supabase
                    .from('organization_wallets')
                    .select('id')
                    .eq('organization_id', organizationId)
                    .eq('is_main', true)
                    .maybeSingle();
                
                if (mainWallet) {
                    walletId = mainWallet.id;
                }
            }

            const isPublicSale = (reference && reference.endsWith('-PUB')) ||
                                (actualNarration && (actualNarration.startsWith('Sale:') || actualNarration.startsWith('Revenue:')));

            // Public sales/payment links: use the pending intent's net subtotal when
            // available (their fee IS actually swept below, verified working), else the
            // 0.975 estimate. Everything else (CashInflowModal wallet deposits and any
            // other direct collection) books the amount Lenco just confirmed, in full —
            // NOT a pre-set intent amount. That pre-set amount used to assume a 1% fee
            // would always be deducted; that assumption silently broke for direct
            // deposits at some point (confirmed via reconciliation 2026-08-15 — a clean
            // cutover after which zero deposits had any fee swept), and trusting it kept
            // booking less than what actually arrived with nothing to reconcile against.
            // Booking the confirmed amount here can never lose money; if Lenco genuinely
            // does deduct a fee on some future collection, that debit still shows up on
            // its own and gets caught + posted by the reconciliation engine's self-healing
            // pass (healMissingPlatformFees) rather than being guessed at intent time.
            const inflowAmount = isPublicSale
                ? (pendingEntry?.debit ? Number(pendingEntry.debit) : parseFloat(amount) * 0.975)
                : parseFloat(amount);

            // 1. Log the Inflow — finalize the intent IN PLACE when one exists.
            // (Delete-then-recreate destroyed the intent when the recreate failed.)
            // Public sales/payment links get their own dedicated "Payment Received"
            // email further down (notifyPaymentLinkPaid/notifyPublicSalePaid) — skip the
            // generic inflow notification here so it isn't a duplicate.
            let newEntry: any;
            if (pendingEntry) {
                newEntry = await cashbookService.finalizePendingIntent(organizationId, pendingEntry.id, {
                    description: actualNarration,
                    debit: inflowAmount,
                    externalReference: reference,
                    date: new Date().toISOString().split('T')[0],
                    skipInflowNotification: isPublicSale,
                    sender_name: lencoSenderName,
                    sender_phone: lencoSenderPhone,
                });
            } else {
                newEntry = await cashbookService.createEntry(organizationId, {
                    date: new Date().toISOString().split('T')[0],
                    description: actualNarration,
                    debit: inflowAmount,
                    credit: 0,
                    entry_type: 'INFLOW',
                    account_type: 'MONEYWISE_WALLET',
                    status: 'UNACCOUNTED',
                    wallet_id: walletId,
                    external_reference: reference || null,
                    skip_inflow_notification: isPublicSale,
                    sender_name: lencoSenderName,
                    sender_phone: lencoSenderPhone,
                } as any);
            }

            // 1b. For payment links / public sales: enrich sender info from payment_links if
            //     Lenco didn't surface it in the webhook payload.
            if (isPublicSale && newEntry?.id && (!lencoSenderName || !lencoSenderPhone) && reference) {
                try {
                    const { data: pl } = await supabase
                        .from('payment_links')
                        .select('customer_name, customer_phone')
                        .eq('reference', reference)
                        .maybeSingle();
                    if (pl && (pl.customer_name || pl.customer_phone)) {
                        const patch: Record<string, string> = {};
                        if (!lencoSenderName  && pl.customer_name)  patch.sender_name  = pl.customer_name;
                        if (!lencoSenderPhone && pl.customer_phone) patch.sender_phone = pl.customer_phone;
                        if (Object.keys(patch).length > 0) {
                            await supabase.from('cashbook_entries').update(patch).eq('id', newEntry.id);
                        }
                    }
                } catch (enrichErr) {
                    console.error('[Lenco Webhook] Non-fatal: failed to enrich sender info from payment_links:', enrichErr);
                }
            }

            // 2. Auto-classify via rule engine (org-scoped rules take priority)
            try {
                await ruleEngine.loadRules();
                const ruleMatch = ruleEngine.match(actualNarration, inflowAmount, undefined, organizationId);
                if (ruleMatch.matched && ruleMatch.accountId && newEntry?.id) {
                    await supabase
                        .from('cashbook_entries')
                        .update({ account_id: ruleMatch.accountId, status: 'ACCOUNTED' })
                        .eq('id', newEntry.id);
                    console.log(`[Lenco Webhook] Auto-classified inflow "${actualNarration}" → account ${ruleMatch.accountId} (rule: ${ruleMatch.ruleId})`);

                    // Being "accounted" locally isn't the same as being posted to QuickBooks —
                    // actually push it now instead of leaving qb_sync_status stuck PENDING.
                    QuickBooksService.autoPostInflowIfLinked(organizationId, newEntry.id, ruleMatch.accountId, 'system-lenco-webhook')
                        .catch(err => console.error(`[Lenco Webhook] Auto-post to QB failed for ${newEntry.id}:`, err?.message));
                }
            } catch (classifyErr) {
                console.error('[Lenco Webhook] Auto-classify error (non-fatal):', classifyErr);
            }

            // NOTE: The MoneyWise platform charge is intentionally NOT posted to the wallet
            // ledger. The wallet must mirror the actual Lenco balance, and the merchant only
            // ever sees the net subtotal. The surplus the customer paid on top is forwarded
            // out of the sub-account below, so the real balance also settles to the net.
            console.log(`[Lenco Webhook] ${isPublicSale ? 'Public product sale' : 'Standard collection'} logged as INFLOW (amount: ${inflowAmount}).`);

            // Auto-forward the MoneyWise platform commission for external payment links.
            // Commission = gross collected − net settled (the fee the customer paid on top).
            if (isPublicSale && reference) {
                const grossCollected = parseFloat(amount);
                const commission = Math.round((grossCollected - inflowAmount) * 100) / 100;

                if (commission > 0) {
                    const { data: orgCreds } = await supabase
                        .from('organizations')
                        .select('lenco_subaccount_id, lenco_secret_key')
                        .eq('id', organizationId)
                        .maybeSingle();

                    const sourceAccountId = accountId || orgCreds?.lenco_subaccount_id;
                    const secretKey = orgCreds?.lenco_secret_key || process.env.LENCO_SECRET_KEY;

                    if (sourceAccountId && secretKey) {
                        await sweepPlatformCommission(sourceAccountId, secretKey, commission, reference, organizationId);
                        // Credit this platform fee toward the org's monthly subscription
                        void recordFeeCredit(organizationId, commission, reference, 'PAYMENT_LINK');
                    } else {
                        console.warn(`[Lenco Sweep] Skipped: missing source account or secret key for org ${organizationId}.`);
                    }
                }
            }
        }

        // Update product sales status if a reference is provided
        if (reference) {
            const { error: salesError } = await supabase
                .from('product_sales')
                .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
                .eq('reference', reference);

            if (salesError) {
                console.error('[Lenco Webhook] Error updating product sales status:', salesError);
            } else {
                console.log(`[Lenco Webhook] Successfully updated product sales for reference ${reference} to COMPLETED`);
            }

            // Split revenue to each product's mapped wallet + income account, confirm any
            // booking reservations, and flip any one-time payment link tied to this
            // reference to PAID (all idempotent). Independent of each other — only
            // linkPaid's result is needed below — so run them concurrently instead of
            // paying for 3 sequential round trips on the payer's confirmation path.
            const [, , linkPaid] = await Promise.all([
                applyProductRevenueRouting(organizationId, reference),
                confirmBookingsForReference(organizationId, reference),
                markPaymentLinkPaid(organizationId, reference),
            ]);

            // Confirm the payment over WhatsApp to both the admin (money in) and the
            // customer (receipt). Deliberately NOT awaited — the payer's confirmation
            // has already happened by the time this runs, and these are best-effort
            // side channels (same pattern as postProcessQuickLinkPayment below).
            // Non-fatal. Exactly once: a one-time link fires on its real ACTIVE→PAID
            // transition; a public catalogue checkout fires from this owning
            // finalization (the dedup guard means this tail runs once per ref).
            if (linkPaid) {
                Promise.all([
                    whatsappService.notifyPaymentLinkPaid(organizationId, reference),
                    emailService.notifyPaymentLinkPaid(organizationId, reference),
                ]).catch(err => console.error(`[Lenco Webhook] notifyPaymentLinkPaid failed for ${reference}:`, err?.message));
                captureEvent('payment_receipt_notification_attempted', {
                    feature: 'payment_receipt_notification', workflow_id: reference, organization_id: organizationId,
                    user_id: 'system', channel: 'whatsapp', notify_fn: 'notifyPaymentLinkPaid', status: 'attempted',
                });
            } else {
                // Self-guards: skips link refs and no-ops when there are no product sales.
                Promise.all([
                    whatsappService.notifyPublicSalePaid(organizationId, reference),
                    emailService.notifyPublicSalePaid(organizationId, reference),
                ]).catch(err => console.error(`[Lenco Webhook] notifyPublicSalePaid failed for ${reference}:`, err?.message));
                captureEvent('payment_receipt_notification_attempted', {
                    feature: 'payment_receipt_notification', workflow_id: reference, organization_id: organizationId,
                    user_id: 'system', channel: 'whatsapp', notify_fn: 'notifyPublicSalePaid', status: 'attempted',
                });
            }
        }

        // Quick Link: learn the chosen purpose + classify the inflow. Deliberately
        // NOT awaited — this must never add latency to the payer's confirmation,
        // which has already happened by the time this runs.
        if (reference) {
            postProcessQuickLinkPayment(reference).catch(err =>
                console.error(`[Quick Link] Unhandled post-processing error for ${reference}:`, err)
            );
        }

        console.log(`[Lenco Webhook] SUCCESS: Processed collection for org ${organizationId}`);
        return true;
            }
        );
    } catch (error) {
        console.error(`[Lenco Webhook] FAILURE: Error processing collection:`, error);
        throw error;
    }
}

/**
 * Handles 'transfer.successful' event
 * Confirms the disbursement and potentially triggers ledger entry
 */
async function handleTransferSuccessful(data: any) {
    const { reference, amount, status } = data;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Store Lenco's assigned transaction ID in its own column so we preserve
        // both the stable reference (for re-querying Lenco) and the Lenco-assigned
        // numeric ID that appears on the recipient's bank/mobile money statement.
        const result = await client.query(`
            UPDATE disbursements
            SET lenco_transaction_id = $1
            WHERE external_reference = $2 OR id::text = $2
            RETURNING requisition_id
        `, [data.id, reference]);

        if (result.rows.length > 0) {
            const requisitionId = result.rows[0].requisition_id;
            // Advance requisition from PROCESSING → RECEIVED now that Lenco has confirmed.
            // We guard on PROCESSING so we don't clobber a further state (e.g. EXPENSED)
            // if the webhook fires late.
            await client.query(
                `UPDATE requisitions SET status = 'RECEIVED', updated_at = NOW()
                 WHERE id = $1 AND status = 'PROCESSING'`,
                [requisitionId]
            );
            await client.query('COMMIT');

            console.log(`[Lenco Webhook] Confirmed transfer for reference ${reference}. Requisition ${requisitionId} → RECEIVED.`);

            // Trigger ledger finalization and withdrawal fee addition
            // The DB UNIQUE constraint prevents duplicates if polling already ran
            await cashbookService.finalizeWalletDisbursementLedger(requisitionId);

            // If this requisition came from a scheduled item with PoP enabled,
            // send the Proof of Payment email now that Lenco has confirmed the transfer.
            emailService.maybeFireScheduledPoP(requisitionId, String(data.id || '')).catch(err =>
                console.error('[Lenco Webhook] Failed to send scheduled PoP email:', err)
            );
        } else {
            await client.query('COMMIT');
            console.log(`[Lenco Webhook] Confirmed transfer for reference ${reference} but no matching disbursement found.`);
        }
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Handles 'transfer.failed' event
 * FIX (Issue 6): Revert the requisition to AUTHORISED and clean up the failed disbursement record.
 * Previously this only logged the failure without reverting state.
 */
async function handleTransferFailed(data: any) {
    const { reference, failure_reason } = data;
    console.error(`[Lenco Webhook] Transfer FAILED for ${reference}: ${failure_reason}`);
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Find the disbursement linked to this reference
        const result = await client.query(`
            SELECT id, requisition_id
            FROM disbursements 
            WHERE external_reference = $1 OR external_reference = $2
        `, [reference, data.id]);

        if (result.rows.length > 0) {
            const { id: disbursementId, requisition_id: requisitionId } = result.rows[0];

            // 2. Revert the requisition back to AUTHORISED so it can be retried
            await client.query(
                `UPDATE requisitions SET status = 'AUTHORISED', updated_at = NOW() WHERE id = $1`,
                [requisitionId]
            );

            // 3. Delete the failed disbursement record so it doesn't pollute history
            await client.query(`DELETE FROM disbursements WHERE id = $1`, [disbursementId]);

            // 4. Log an audit trail entry
            await client.query(`
                INSERT INTO audit_logs (entity_type, entity_id, action, changes)
                VALUES ('REQUISITION', $1, 'TRANSFER_FAILED', $2)
            `, [requisitionId, JSON.stringify({ reference, failure_reason, reverted_to: 'AUTHORISED' })]);

            console.log(`[Lenco Webhook] REVERTED: Requisition ${requisitionId} reset to AUTHORISED after transfer failure.`);

            // Notify the user in the requisition chat — this is the only signal they get
            await supabase
                .from('requisition_messages')
                .insert({
                    requisition_id: requisitionId,
                    content: `Transfer failed: ${failure_reason || 'Lenco rejected the payout'}. The disbursement has been reversed and the requisition is back to AUTHORISED — please retry.`,
                    type: 'SYSTEM',
                    metadata: { stage: 'TRANSFER_FAILED', reference, failure_reason }
                });
        } else {
            console.warn(`[Lenco Webhook] transfer.failed: No disbursement found for reference ${reference}`);
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[Lenco Webhook] Error handling transfer failure:', error);
        throw error;
    } finally {
        client.release();
    }
}
