import { Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { LencoService } from '../services/lenco.service';
import { cashbookService } from '../services/cashbook.service';
import { supabase } from '../lib/supabase';

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
        const bodyString = JSON.stringify(req.body);
        const expectedSignature = crypto.createHmac('sha512', webhookHashKey).update(bodyString).digest('hex');

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

    const { reference, amount, currency } = data;
    const accountId = data.accountId || data.account_id;
    
    let organizationId = forcedOrganizationId;
    let identificationStage = forcedOrganizationId ? 'Stage 0: Forced ID' : 'None';

    console.log(`[Lenco Webhook] Processing collection: ref=${reference || 'N/A'}, accountId=${accountId || 'N/A'}, amount=${amount || 'N/A'}`);

    // Validation: amount is required for ledger entry
    if (!amount) {
        console.error('[Lenco Webhook] Aborting: No amount provided in collection data');
        return false;
    }

    // FIX (Issue 10): Deduplicate collections based on Lenco reference.
    // Strategy 1: Try external_reference column (available after migration)
    // Strategy 2: Fallback to description-based LIKE check (always works)
    if (reference) {
        try {
            const { data: existingByRef, error: refError } = await supabase
                .from('cashbook_entries')
                .select('id')
                .eq('external_reference', reference)
                .maybeSingle();
            
            if (!refError && existingByRef) {
                console.log(`[Lenco Webhook] DUPLICATE IGNORED (by ref): Collection ${reference} already logged.`);
                return true;
            }
        } catch (_) {
            // Column may not exist yet — fall through to description-based check
        }

        // Fallback: description-based dedup (works before migration)
        const { data: existingByDesc } = await supabase
            .from('cashbook_entries')
            .select('id')
            .like('description', `%${reference}%`)
            .maybeSingle();

        if (existingByDesc) {
            console.log(`[Lenco Webhook] DUPLICATE IGNORED (by desc): Collection ${reference} already logged.`);
            return true;
        }
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
                    const orgResult = await pool.query('SELECT id FROM organizations WHERE id = $1', [id]);
                    if (orgResult.rows.length > 0) {
                        organizationId = orgResult.rows[0].id;
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
            const orgResult = await pool.query(
                'SELECT id FROM organizations WHERE lenco_subaccount_id = $1',
                [accountId]
            );
            if (orgResult.rows.length > 0) {
                organizationId = orgResult.rows[0].id;
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
            const narration = `A deposit of K${formattedAmount} has been successfully deposited to the MoneyWise Wallet. Reference: ${reference || 'N/A'}`;
            
            await cashbookService.createEntry(organizationId, {
                date: new Date().toISOString().split('T')[0],
                description: narration,
                debit: parseFloat(amount),
                credit: 0,
                entry_type: 'INFLOW',
                account_type: 'MONEYWISE_WALLET',
                status: 'COMPLETED'
            });
            console.log(`[Lenco Webhook] Standard collection logged as INFLOW.`);
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
