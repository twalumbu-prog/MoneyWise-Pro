import { Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { LencoService } from '../services/lenco.service';
import { cashbookService } from '../services/cashbook.service';
import { supabase } from '../lib/supabase';
import { ruleEngine } from '../services/ai/rule.engine';

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
    originalReference: string
): Promise<void> {
    const splitRef = `SPLIT-${originalReference}`;
    try {
        // Idempotency guard — don't double-sweep if the webhook / verify poller re-fires.
        const existing = await LencoService.getTransferStatus(splitRef, secretKey);
        if (existing) {
            console.log(`[Lenco Sweep] Commission already forwarded for ${originalReference} (ref: ${splitRef}). Skipping.`);
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
        return res.status(401).json({ error: 'Unauthorized: Missing signature' });
    }

    // We attempt to verify against the global key. In a multi-tenant setup,
    // once Lenco supports per-account webhook keys, this should be fetched
    // per organization (see audit report Issue 4).
    const apiToken = process.env.LENCO_SECRET_KEY;
    if (apiToken) {
        const webhookHashKey = crypto.createHash("sha256").update(apiToken).digest("hex");
        const rawBody = (req as any).rawBody;
        const expectedSignature = crypto.createHmac('sha512', webhookHashKey)
            .update(rawBody || JSON.stringify(req.body))
            .digest('hex');

        if (signature !== expectedSignature) {
            console.warn('[Lenco Webhook] REJECTED: Invalid signature');
            return res.status(401).json({ error: 'Unauthorized: Invalid signature' });
        }
    }

    const event = req.body;
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
        }
        return true;
    }

    try {
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

            const inflowAmount = isPublicSale
                ? (pendingEntry?.debit ? Number(pendingEntry.debit) : parseFloat(amount) * 0.975)
                : parseFloat(amount);

            // 1. Log the Inflow — finalize the intent IN PLACE when one exists.
            // (Delete-then-recreate destroyed the intent when the recreate failed.)
            let newEntry: any;
            if (pendingEntry) {
                newEntry = await cashbookService.finalizePendingIntent(organizationId, pendingEntry.id, {
                    description: actualNarration,
                    debit: inflowAmount,
                    externalReference: reference,
                    date: new Date().toISOString().split('T')[0]
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
                    external_reference: reference || null
                } as any);
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
                        await sweepPlatformCommission(sourceAccountId, secretKey, commission, reference);
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
        }

        console.log(`[Lenco Webhook] SUCCESS: Processed collection for org ${organizationId}`);
        return true;
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

        // Update disbursement status
        const result = await client.query(`
            UPDATE disbursements 
            SET external_reference = $1
            WHERE external_reference = $2 OR id::text = $2
            RETURNING requisition_id
        `, [data.id, reference]);

        if (result.rows.length > 0) {
            const requisitionId = result.rows[0].requisition_id;
            // We NO LONGER set status to 'COMPLETED' here.
            // It must remain 'DISBURSED' so the user can acknowledge receipt and reconcile.
            await client.query('COMMIT');
            
            console.log(`[Lenco Webhook] Confirmed transfer for reference ${reference}`);
            
            // Trigger ledger finalization and withdrawal fee addition
            // The DB UNIQUE constraint prevents duplicates if polling already ran
            await cashbookService.finalizeWalletDisbursementLedger(requisitionId);
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
