import { Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { LencoService } from '../services/lenco.service';
import { cashbookService } from '../services/cashbook.service';

/**
 * Handles Lenco webhooks for collections and transfers
 */
export const handleLencoWebhook = async (req: Request, res: Response) => {
    const signature = req.headers['x-lenco-signature'] as string;
    const apiToken = process.env.LENCO_SECRET_KEY;

    // Verify webhook signature
    if (apiToken && signature) {
        const webhookHashKey = crypto.createHash("sha256").update(apiToken).digest("hex");
        const bodyString = JSON.stringify(req.body);
        const expectedSignature = crypto.createHmac('sha512', webhookHashKey).update(bodyString).digest('hex');

        if (signature !== expectedSignature) {
            console.warn('[Lenco Webhook] Invalid signature detected');
            return res.status(401).json({ error: 'Invalid signature' });
        }
    } else if (!signature) {
        console.warn('[Lenco Webhook] Missing signature');
        // In production, you might want to return 401 here
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
        
        // Net Accounting: If this is a change submission (prefix CHG-), we update the disbursement
        // record but DO NOT create a separate ledger entry. The ledger balance will be updated 
        // by netting off the original disbursement credit during finalization.
        const formattedAmount = parseFloat(amount).toFixed(2);

        if (reference && reference.startsWith('CHG-')) {
            console.log(`[Lenco Webhook] Identified change submission: ${reference}`);
            
            // Extract short ID (last part of reference)
            const parts = reference.split('-');
            const shortReqId = parts[parts.length - 1];
            
            // Update disbursements table
            const { error: updateError } = await cashbookService.updateDisbursementForChange(
                organizationId,
                shortReqId,
                parseFloat(amount),
                reference
            );
            
            if (updateError) {
                console.error(`[Lenco Webhook] Error updating disbursement for change:`, updateError);
            } else {
                console.log(`[Lenco Webhook] SUCCESS: Updated disbursement for requisition matching shortId=${shortReqId}`);
            }
            
            // ALWAYS return true for CHG- references to prevent duplicate ledger entries.
            // If the metadata update failed above, it's manually fixable, but we don't want a rogue INFLOW entry.
            return true;
        }

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

        console.log(`[Lenco Webhook] SUCCESS: Logged wallet deposit of K${formattedAmount} for org ${organizationId}`);
        return true;
    } catch (error) {
        console.error(`[Lenco Webhook] FAILURE: Error logging inflow:`, error);
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
            // Update requisition status as well
            await client.query(`
                UPDATE requisitions 
                SET status = 'COMPLETED',
                    updated_at = NOW()
                WHERE id = $1
            `, [requisitionId]);
        }

        // If requisition exists, maybe update it?
        // Note: The disbursement controller might have already handled the ledger entry as 'PENDING'
        // or we do it here upon confirmation.

        await client.query('COMMIT');
        console.log(`[Lenco Webhook] Confirmed transfer for reference ${reference}`);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Handles 'transfer.failed' event
 */
async function handleTransferFailed(data: any) {
    const { reference, failure_reason } = data;
    console.error(`[Lenco Webhook] Transfer failed for ${reference}: ${failure_reason}`);
    
    await pool.query(`
        UPDATE disbursements 
        SET external_reference = $2
        WHERE external_reference = $1 OR id::text = $1
    `, [reference, data.id]);
}
