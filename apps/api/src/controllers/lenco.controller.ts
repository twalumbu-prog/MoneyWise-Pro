import { Request, Response } from 'express';
import { LencoService } from '../services/lenco.service';
import { supabase } from '../lib/supabase';
import pool from '../db';
import { handleCollectionSuccessful } from './lenco.webhook.controller';
import { cashbookService } from '../services/cashbook.service';
import { ledgerService } from '../services/ledger.service';
import { applyProductRevenueRouting, markPaymentLinkPaid, confirmBookingsForReference } from '../services/product_routing.service';
import { calculatePlatformFee } from '../utils/platformFee';

export const listLencoAccounts = async (req: Request, res: Response) => {
    try {
        const organizationId = (req as any).user?.organization_id;
        let secretKey: string | undefined = undefined;
        if (organizationId) {
            const { data: orgData } = await supabase
                .from('organizations')
                .select('lenco_secret_key')
                .eq('id', organizationId)
                .single();
            if (orgData?.lenco_secret_key) {
                secretKey = orgData.lenco_secret_key;
            }
        }

        const accounts = await LencoService.listAccounts(secretKey);
        res.json(accounts);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const provisionOrganizationLencoAccount = async (req: Request, res: Response) => {
    const { id } = req.params;
    console.log(`[Lenco] Provisioning request for organization ${id}`);

    try {
        // 1. Get organization
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('name, lenco_subaccount_id, lenco_secret_key')
            .eq('id', id)
            .single();

        if (orgError || !org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        if (org.lenco_subaccount_id) {
            console.log(`[Lenco] Organization ${id} already has a linked account: ${org.lenco_subaccount_id}`);
            return res.status(400).json({ error: 'Organization already has a linked Lenco account. Please refresh your page.' });
        }

        // 2. Create Lenco account
        console.log(`[Lenco] Attempting to create Lenco account for: ${org.name}`);
        let lencoAccount;
        try {
            lencoAccount = await LencoService.createAccount(org.name, 'ZMW', org.lenco_secret_key || undefined);
        } catch (lencoError: any) {
            console.error('[Lenco] Account creation failed:', lencoError.message);
            return res.status(502).json({ 
                error: `Lenco API Error: ${lencoError.message}. The subaccount may need to be created manually in the Lenco dashboard until programmatic creation is supported for ZMW accounts.`,
                details: lencoError.message
            });
        }

        // 3. Update organization
        const { error: updateError } = await supabase
            .from('organizations')
            .update({ lenco_subaccount_id: lencoAccount.id })
            .eq('id', id);

        if (updateError) throw updateError;

        console.log(`[Lenco] Successfully provisioned account ${lencoAccount.id} for organization ${id}`);
        res.json({ success: true, lenco_subaccount_id: lencoAccount.id });
    } catch (error: any) {
        console.error('Provisioning error in controller:', error);
        res.status(500).json({ error: 'Internal server error during provisioning' });
    }
};

export const listAvailableAccounts = async (req: Request, res: Response) => {
    try {
        const organizationId = (req as any).user?.organization_id;
        let secretKey: string | undefined = undefined;
        if (organizationId) {
            const { data: orgData } = await supabase
                .from('organizations')
                .select('lenco_secret_key')
                .eq('id', organizationId)
                .single();
            if (orgData?.lenco_secret_key) {
                secretKey = orgData.lenco_secret_key;
            }
        }

        // 1. Get all Lenco accounts
        const allAccounts = await LencoService.listAccounts(secretKey);

        // 2. Get all currently linked account IDs from our DB
        const { data: linkedOrgs, error: dbError } = await supabase
            .from('organizations')
            .select('lenco_subaccount_id')
            .not('lenco_subaccount_id', 'is', null);

        if (dbError) throw dbError;

        const linkedIds = new Set(linkedOrgs.map(org => org.lenco_subaccount_id));

        // 3. Filter out linked accounts
        const availableAccounts = allAccounts.filter((acc: any) => !linkedIds.has(acc.id));

        res.json(availableAccounts);
    } catch (error: any) {
        console.error('[Lenco] Error listing available accounts:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const linkOrganizationLencoAccount = async (req: Request, res: Response) => {
    const { id } = req.params; // organization id
    const { lenco_subaccount_id } = req.body;

    if (!lenco_subaccount_id) {
        return res.status(400).json({ error: 'lenco_subaccount_id is required' });
    }

    try {
        // Match organization in database
        const { data: organization, error: orgError } = await supabase
            .from('organizations')
            .select('id, lenco_subaccount_id')
            .eq('id', id)
            .single();

        if (orgError || !organization) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        if (organization.lenco_subaccount_id) {
            return res.status(400).json({ error: 'Organization already has a linked Lenco account' });
        }

        // Check if this Lenco account is already in use by another organization
        const { data: usedAccount, error: checkError } = await supabase
            .from('organizations')
            .select('id')
            .eq('lenco_subaccount_id', lenco_subaccount_id)
            .maybeSingle();

        if (checkError) throw checkError;
        if (usedAccount) {
            return res.status(400).json({ error: 'This Lenco account is already linked to another organization' });
        }

        // Link the account
        const { error: updateError } = await supabase
            .from('organizations')
            .update({ lenco_subaccount_id })
            .eq('id', id);

        if (updateError) throw updateError;
        
        res.json({ success: true, lenco_subaccount_id });
    } catch (error: any) {
        console.error('[Lenco] Error linking account:', error);
        res.status(500).json({ error: 'Internal server error during account linking' });
    }
};

export const verifyCollectionStatus = async (req: Request, res: Response) => {
    const { reference } = req.params;
    const { transactionId, organizationId: queryOrgId } = req.query;
    const organizationId = typeof queryOrgId === 'string' ? queryOrgId : null;

    console.log(`[Lenco Verify] Request: ref=${reference}, txId=${transactionId}, orgId=${organizationId}`);
    
    // Fetch organization specific secret key if available
    let secretKey: string | undefined = undefined;
    if (organizationId) {
        try {
            const { data: orgData, error: orgError } = await supabase
                .from('organizations')
                .select('lenco_secret_key')
                .eq('id', organizationId)
                .single();
                
            if (!orgError && orgData?.lenco_secret_key) {
                secretKey = orgData.lenco_secret_key;
                console.log(`[Lenco Verify] Using organization-specific secret key for ${organizationId}`);
            }
        } catch (err) {
            console.error('[Lenco Verify] Error fetching org secret key:', err);
        }
    }

    try {
        // 1. Check if the entry already exists and is finalized in our database.
        // Multi-row-safe: a finalized entry can coexist with a stale PENDING twin,
        // and .maybeSingle() errors out on >1 match. Prefer the finalized row.
        const { data: existingRows, error: dbError } = await supabase
            .from('cashbook_entries')
            .select('id, status, reference_number')
            .or(`external_reference.eq.${reference},description.like.%${reference}%`)
            .limit(5);

        if (dbError) throw dbError;

        const existingEntry = (existingRows || []).find(r => r.status !== 'PENDING')
            || (existingRows || [])[0]
            || null;

        if (existingEntry && existingEntry.status !== 'PENDING') {
            console.log(`[Lenco Verify] Found in local DB and finalized: ${existingEntry.id}`);
            return res.json({ 
                verified: true, 
                source: 'database',
                status: existingEntry.status,
                stage: 'CONFIRMED_IN_DB',
                referenceNumber: existingEntry.reference_number
            });
        }

        // 2. Check by Transaction ID if provided
        if (transactionId && typeof transactionId === 'string') {
            console.log(`[Lenco Verify] Checking by transactionId: ${transactionId}`);
            try {
                const transaction = await LencoService.getTransactionById(transactionId, secretKey);
                
                // CRITICAL: Robust null-check for Lenco API response
                if (!transaction) throw new Error('Empty transaction response from Lenco');
                
                console.log(`[Lenco Verify] Transaction status: ${transaction.status || 'N/A'}`);
                
                if (transaction.status === 'successful' || transaction.type === 'credit') {
                    // Trigger processing with forced organizationId
                    console.log(`[Lenco Verify] Triggering ledger entry via txId. Forced Org: ${organizationId || 'None'}`);
                    const success = await handleCollectionSuccessful(
                        { ...transaction, reference: reference },
                        organizationId
                    );
                    
                    if (success) {
                        // Fetch the created reference number
                        const { data: createdEntry } = await supabase
                            .from('cashbook_entries')
                            .select('reference_number')
                            .like('description', `%${reference}%`)
                            .maybeSingle();

                        return res.json({ 
                            verified: true, 
                            source: 'lenco_transaction_api',
                            status: 'COMPLETED',
                            stage: 'PROCESSED_VIA_TX_ID',
                            referenceNumber: createdEntry?.reference_number || null
                        });
                    }
                }
            } catch (txError: any) {
                console.warn(`[Lenco Verify] Transaction check failed (stage 2):`, txError.message);
            }
        }

        // 3. Fallback to Collection Status
        console.log(`[Lenco Verify] Falling back to collection status check for ref: ${reference}`);
        try {
            const lencoStatus = await LencoService.getCollectionStatus(reference, secretKey);
            
            // Robust null-check
            if (!lencoStatus) throw new Error('Empty collection status response from Lenco');
            
            console.log(`[Lenco Verify] Collection status: ${lencoStatus.status || 'N/A'}`);

            if (lencoStatus.status === 'successful') {
                try {
                    console.log(`[Lenco Verify] Triggering ledger entry via ref. Forced Org: ${organizationId || 'None'}`);
                    const success = await handleCollectionSuccessful(lencoStatus, organizationId);
                    
                    if (success) {
                        // Fetch the created reference number
                        const { data: createdEntry } = await supabase
                            .from('cashbook_entries')
                            .select('reference_number')
                            .like('description', `%${reference}%`)
                            .maybeSingle();

                        return res.json({ 
                            verified: true, 
                            source: 'lenco_collection_api',
                            status: 'COMPLETED',
                            stage: 'PROCESSED_VIA_COLLECTION_REF',
                            referenceNumber: createdEntry?.reference_number || null
                        });
                    }
                } catch (procError: any) {
                    console.error('[Lenco Verify] Error triggering processing:', procError);
                    return res.status(500).json({ error: 'Transaction found but failed to record in ledger' });
                }
            } else {
                return res.json({
                    verified: false,
                    status: lencoStatus.status || 'pending',
                    message: 'Transaction is not successful yet on Lenco.'
                });
            }
        } catch (lencoError: any) {
            console.warn(`[Lenco Verify] Collection check failed:`, lencoError.message);
            // If the error indicates that the transaction was not found/generated on Lenco:
            const errMsg = lencoError.message || '';
            if (errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('invalid') || errMsg.toLowerCase().includes('404')) {
                // "Not found" can be transient: right after initiation the collection
                // record may not have propagated on Lenco's side yet, while the customer
                // is still authorizing on their phone. Deleting here used to destroy
                // intents for payments that succeeded seconds later — the money then
                // resurfaced as an unmatched raw inflow via the periodic sync. Only
                // clean up PENDING rows, and only after a grace window.
                const GRACE_MINUTES = 15;
                const { data: intents } = await supabase
                    .from('cashbook_entries')
                    .select('id, created_at')
                    .eq('status', 'PENDING')
                    .or(`external_reference.eq.${reference},description.like.%${reference}%`)
                    .limit(5);

                const cutoffMs = Date.now() - GRACE_MINUTES * 60 * 1000;
                const stale = (intents || []).filter(i => new Date(i.created_at).getTime() < cutoffMs);

                if (!intents || intents.length === 0 || stale.length === intents.length) {
                    console.log(`[Lenco Verify] Reference ${reference} not found on Lenco and intents are stale. Cleaning up pending entries.`);
                    for (const i of stale) {
                        await supabase.from('cashbook_entries').delete().eq('id', i.id).eq('status', 'PENDING');
                    }
                    await supabase.from('product_sales').delete().eq('reference', reference).eq('status', 'PENDING');
                    // Release any held booking reservation (PENDING never blocked dates).
                    await supabase.from('product_bookings').delete().eq('reference', reference).eq('status', 'PENDING');
                    return res.json({
                        verified: false,
                        status: 'DELETED',
                        message: 'Payment intent was not generated on Lenco. Cleaned up pending entries.'
                    });
                }

                console.log(`[Lenco Verify] Reference ${reference} not found on Lenco yet, but intent is < ${GRACE_MINUTES}min old. Keeping it (payment may still be authorizing).`);
                return res.json({
                    verified: false,
                    status: 'pending',
                    message: 'Payment not visible on Lenco yet. Intent kept pending.'
                });
            }
            throw lencoError;
        }

    } catch (error: any) {
        console.error('[Lenco Verify] Critical error during verification:', error);
        res.status(500).json({ error: error.message || 'Verification system error' });
    }
};

/**
 * Compares Lenco API balance with MoneyWise Ledger balance for reconciliation
 */
export const getReconciliationSummary = async (req: Request, res: Response) => {
    const { organizationId } = req.params;

    try {
        console.log(`[Lenco Reconcile] Fetching summary for org: ${organizationId}`);
        
        console.log(`[Recon Debug] Stage 1: Fetching org ${organizationId}`);
        const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .select('lenco_subaccount_id, lenco_secret_key')
            .eq('id', organizationId)
            .single();

        if (orgError || !orgData) {
            console.warn(`[Lenco Reconcile] Organization not found: ${organizationId}`);
            return res.status(404).json({ error: 'Organization not found' });
        }

        const { lenco_subaccount_id: subaccountId, lenco_secret_key: secretKey } = orgData;
        console.log(`[Recon Debug] Subaccount: ${subaccountId}, Key present: ${!!secretKey}`);
        if (!subaccountId) {
            console.warn(`[Lenco Reconcile] No subaccount linked for org: ${organizationId}`);
            return res.status(400).json({ error: 'No Lenco account linked to this organization' });
        }

        // 2. Fetch balance from Lenco API
        let externalBalance = 0;
        let lencoBalanceData: any = {};
        try {
            console.log(`[Recon Debug] Stage 2: Lenco API call for ${subaccountId}`);
            lencoBalanceData = await LencoService.getAccountBalance(subaccountId, secretKey);
            console.log(`[Recon Debug] Lenco response:`, JSON.stringify(lencoBalanceData));
            const rawBalance = lencoBalanceData?.availableBalance || lencoBalanceData?.balance || '0';
            externalBalance = parseFloat(rawBalance);
            
            if (isNaN(externalBalance)) {
                console.warn(`[Lenco Reconcile] Received non-numeric balance for ${subaccountId}:`, rawBalance);
                externalBalance = 0;
            }
        } catch (lencoErr: any) {
            console.error(`[Lenco Reconcile] Lenco API error for ${subaccountId}:`, lencoErr.message);
            // We don't 500 here, we just return what we have or a specific error
            return res.status(502).json({ error: `Lenco API Error: ${lencoErr.message}` });
        }

        // 3. Fetch balance from MoneyWise Ledger
        let internalBalance = 0;
        try {
            console.log(`[Recon Debug] Stage 3: DB ledger fetch for org ${organizationId} via Supabase`);
            const { data: ledgerData, error: ledgerError } = await supabase
                .from('cashbook_entries')
                .select('balance_after')
                .eq('organization_id', organizationId)
                .eq('account_type', 'MONEYWISE_WALLET')
                .order('date', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (!ledgerError && ledgerData) {
                internalBalance = Number(ledgerData.balance_after) || 0;
            }
            
            if (isNaN(internalBalance)) internalBalance = 0;
        } catch (dbErr: any) {
            console.error(`[Lenco Reconcile] Database error fetching ledger for ${organizationId}:`, dbErr.message);
            // Don't 500, just return with 0 internal balance and a warning
            return res.json({
                organizationId,
                subaccountId,
                externalBalance,
                internalBalance: 0,
                discrepancy: externalBalance,
                isReconciled: false,
                error: `Ledger error: ${dbErr.message}`,
                lastCheckedAt: new Date().toISOString()
            });
        }


        // 4. Return summary
        const discrepancy = externalBalance - internalBalance;
        
        console.log(`[Lenco Reconcile] Summary for ${organizationId}: Lenco=${externalBalance}, Ledger=${internalBalance}, Diff=${discrepancy}`);

        res.json({
            organizationId,
            subaccountId,
            externalBalance,
            internalBalance,
            discrepancy,
            isReconciled: Math.abs(discrepancy) < 0.01,
            currency: lencoBalanceData?.currency || 'ZMW',
            lastCheckedAt: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('[Lenco Reconcile] UNEXPECTED CRITICAL ERROR:', error);
        res.status(500).json({ 
            error: error.message || 'Internal reconciliation system error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            details: error.toString()
        });
    }
};

/**
 * Fetch list of banks for a specific country (Zambia default)
 */
export const getBanks = async (req: Request, res: Response) => {
    try {
        const banks = await LencoService.getBanks();
        res.json(banks);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Resolve a bank account name
 */
export const resolveBankAccount = async (req: Request, res: Response) => {
    const { accountNumber, bankId } = req.body;
    const organizationId = req.headers['x-organization-id'] as string;

    if (!accountNumber || !bankId) {
        return res.status(400).json({ error: 'accountNumber and bankId are required' });
    }

    let secretKey: string | undefined = undefined;
    if (organizationId) {
        const { data: orgData } = await supabase
            .from('organizations')
            .select('lenco_secret_key')
            .eq('id', organizationId)
            .single();
        if (orgData?.lenco_secret_key) secretKey = orgData.lenco_secret_key;
    }

    try {
        const resolution = await LencoService.resolveBankAccount(accountNumber, bankId, secretKey);
        res.json(resolution);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

/**
 * Resolve a mobile money account name
 */
export const resolveMobileMoney = async (req: Request, res: Response) => {
    const { phone, operator } = req.body;
    const organizationId = req.headers['x-organization-id'] as string;

    if (!phone || !operator) {
        return res.status(400).json({ error: 'phone and operator are required' });
    }

    let secretKey: string | undefined = undefined;
    if (organizationId) {
        const { data: orgData } = await supabase
            .from('organizations')
            .select('lenco_secret_key')
            .eq('id', organizationId)
            .single();
        if (orgData?.lenco_secret_key) secretKey = orgData.lenco_secret_key;
    }

    try {
        const resolution = await LencoService.resolveMobileMoney(phone, operator, secretKey);
        res.json(resolution);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

/**
 * Fetch public context for a wallet (organization name, logo, products, and wallet settings)
 */
export const getPublicWalletContext = async (req: Request, res: Response) => {
    const { wallet_id } = req.params;

    if (!wallet_id) {
        return res.status(400).json({ error: 'wallet_id is required' });
    }

    try {
        console.log('[Lenco Public Context] Fetching wallet ID:', wallet_id);
        // 1. Fetch wallet details
        const { data: wallet, error: walletError } = await supabase
            .from('organization_wallets')
            .select('id, name, organization_id')
            .eq('id', wallet_id)
            .single();

        console.log('[Lenco Public Context] Wallet query result:', { wallet, walletError });

        if (walletError || !wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        // 2. Fetch organization details
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('name, logo_url, lenco_subaccount_id, lenco_public_key, payment_test_mode')
            .eq('id', wallet.organization_id)
            .single();

        console.log('[Lenco Public Context] Org query result:', { org, orgError });

        if (orgError || !org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        // 3. Fetch active products for the organization
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('*')
            .eq('organization_id', wallet.organization_id)
            .eq('is_active', true)
            .order('name', { ascending: true });

        if (productsError) throw productsError;

        res.json({
            organization: {
                id: wallet.organization_id,
                name: org.name,
                logo_url: org.logo_url || null
            },
            wallet: {
                id: wallet.id,
                name: wallet.name,
                lenco_subaccount_id: org.lenco_subaccount_id || null,
                lenco_public_key: org.lenco_public_key || null,
                payment_test_mode: org.payment_test_mode || false
            },
            products: products || []
        });
    } catch (error: any) {
        console.error('[Lenco Public Context] Error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};

/**
 * Public context for a one-time payment link (Share button flow). Returns the org
 * branding, the linked product, the pre-filled customer + amount, the destination
 * wallet's Lenco config, and the link status so the page can refuse non-ACTIVE links.
 */
export const getPaymentLinkContext = async (req: Request, res: Response) => {
    const { token } = req.params;

    if (!token) {
        return res.status(400).json({ error: 'token is required' });
    }

    try {
        const { data: link, error: linkError } = await supabase
            .from('payment_links')
            .select('*, products(id, name, description, image_url, product_type)')
            .eq('token', token)
            .single();

        if (linkError || !link) {
            return res.status(404).json({ error: 'Payment link not found' });
        }

        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('name, logo_url, lenco_subaccount_id, lenco_public_key, payment_test_mode')
            .eq('id', link.organization_id)
            .single();

        if (orgError || !org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        res.json({
            status: link.status,
            organization: {
                id: link.organization_id,
                name: org.name,
                logo_url: org.logo_url || null
            },
            wallet: {
                id: link.wallet_id,
                lenco_subaccount_id: org.lenco_subaccount_id || null,
                lenco_public_key: org.lenco_public_key || null,
                payment_test_mode: org.payment_test_mode || false
            },
            product: link.products,
            customer_name: link.customer_name,
            customer_phone: link.customer_phone,
            amount: Number(link.amount)
        });
    } catch (error: any) {
        console.error('[Lenco Payment Link Context] Error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};

/**
 * Log public wallet deposit intent (before external customer checkout redirects/initiates Lenco)
 */
/**
 * Public: confirmed (paid) booked date ranges for a bookable product, so the
 * portal calendar can grey out unavailable nights. Returns only current/future
 * stays (check_out >= today). Half-open ranges → the check_out day stays bookable.
 */
export const getProductAvailability = async (req: Request, res: Response) => {
    try {
        const { productId } = req.params;
        if (!productId) {
            return res.status(400).json({ error: 'productId is required' });
        }
        const todayStr = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('product_bookings')
            .select('check_in, check_out')
            .eq('product_id', productId)
            .eq('status', 'CONFIRMED')
            .gte('check_out', todayStr)
            .order('check_in', { ascending: true });
        if (error) throw error;
        res.json({ bookings: data || [] });
    } catch (error: any) {
        console.error('[Lenco Public Availability] Error:', error);
        res.status(500).json({ error: 'Failed to fetch availability', details: error.message });
    }
};

/**
 * Shared core for logging a wallet-deposit intent (PENDING cashbook entry +
 * PENDING product_sales/product_bookings) ahead of a Lenco checkout.
 *
 * `allowPastBooking` lets the internal, authenticated dashboard flow (New Sale →
 * MoneyWise POS) log a booking with a check-in date in the past — e.g. a guest
 * who already checked in is now paying via mobile money. The public, anonymous
 * customer portal (PublicPay / PublicPaymentLink) always books forward, so it
 * keeps the restriction. Either way, double-booking is still blocked: the
 * overlap check against existing CONFIRMED stays always runs.
 */
const logWalletDepositIntentCore = async (req: Request, res: Response, allowPastBooking: boolean) => {
    try {
        const { reference, purpose, amount, walletId, customerName, customerPhone, items, paymentLinkToken } = req.body;

        if (!reference || !purpose || !walletId) {
            return res.status(400).json({ error: 'reference, purpose, and walletId are required' });
        }

        // Fetch organization_id from wallet
        const { data: wallet, error: walletError } = await supabase
            .from('organization_wallets')
            .select('organization_id')
            .eq('id', walletId)
            .single();

        if (walletError || !wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        // --- Booking pre-validation (before logging anything) --------------------
        // Booking items carry check_in/check_out. Validate the dates, recompute the
        // price server-side (anti-tamper), and reject early if the range overlaps an
        // already-CONFIRMED stay — so a rejection never leaves an orphan intent.
        const bookingItems: any[] = Array.isArray(items) ? items.filter((it: any) => it?.check_in && it?.check_out) : [];
        const bookingPrices: Record<string, number> = {};
        const nightsOf = (ci: string, co: string) =>
            Math.round((Date.parse(`${co}T00:00:00Z`) - Date.parse(`${ci}T00:00:00Z`)) / 86400000);
        if (bookingItems.length > 0) {
            const ids = [...new Set(bookingItems.map((b: any) => b.id))];
            const { data: prods } = await supabase.from('products').select('id, price').in('id', ids);
            for (const p of (prods || []) as any[]) bookingPrices[p.id] = Number(p.price) || 0;

            const todayStr = new Date().toISOString().split('T')[0];
            for (const b of bookingItems) {
                const ci = String(b.check_in), co = String(b.check_out);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(ci) || !/^\d{4}-\d{2}-\d{2}$/.test(co) || co <= ci) {
                    return res.status(400).json({ error: 'Invalid booking dates.' });
                }
                if (ci < todayStr && !allowPastBooking) {
                    return res.status(400).json({ error: 'Check-in date cannot be in the past.' });
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
                    return res.status(409).json({ error: 'Sorry, those dates have just been booked. Please choose different dates.' });
                }
            }
        }

        const { error } = await supabase.from('cashbook_entries').insert({
            organization_id: wallet.organization_id,
            entry_type: 'INFLOW',
            account_type: 'MONEYWISE_WALLET',
            description: `PENDING_INTENT: ${purpose} | Ref: ${reference}`,
            debit: amount || 0,
            credit: 0,
            balance_after: 0,
            date: new Date().toISOString().split('T')[0],
            status: 'PENDING',
            wallet_id: walletId,
            // Store the merchant reference on the indexed column so the webhook and
            // periodic sync match this intent directly instead of via description LIKE.
            external_reference: reference
        });

        if (error) {
            // Unique index uniq_cashbook_inflow_per_reference: a retried initiation
            // with the same reference means the intent is already logged — idempotent.
            if (error.message?.includes('uniq_cashbook_inflow_per_reference')) {
                return res.json({ message: 'Intent already logged' });
            }
            throw error;
        }

        // Log pending product sales + booking reservations if present
        if (items && Array.isArray(items) && items.length > 0) {
            // Booking lines store nights as quantity and a server-recomputed amount.
            const salesData = items.map((item: any) => {
                const isBooking = !!(item.check_in && item.check_out);
                const qty = isBooking ? nightsOf(String(item.check_in), String(item.check_out)) : Number(item.quantity);
                const unit = isBooking ? (bookingPrices[item.id] ?? (Number(item.price) || 0)) : Number(item.price);
                return {
                    organization_id: wallet.organization_id,
                    product_id: item.id,
                    customer_name: customerName || 'Anonymous',
                    customer_phone: customerPhone || 'N/A',
                    quantity: qty,
                    amount_paid: Math.round(unit * qty * 100) / 100,
                    reference: reference,
                    status: 'PENDING'
                };
            });

            const { error: salesError } = await supabase
                .from('product_sales')
                .insert(salesData);

            if (salesError) {
                console.error('[Lenco Public Intent] Error logging product sales:', salesError);
            }

            // Hold the booking reservations as PENDING. These do NOT block dates yet —
            // confirmBookingsForReference flips them to CONFIRMED only once paid.
            if (bookingItems.length > 0) {
                const bookingsData = bookingItems.map((b: any) => {
                    const nights = nightsOf(String(b.check_in), String(b.check_out));
                    const unit = bookingPrices[b.id] ?? (Number(b.price) || 0);
                    return {
                        organization_id: wallet.organization_id,
                        product_id: b.id,
                        reference: reference,
                        customer_name: customerName || 'Anonymous',
                        customer_phone: customerPhone || 'N/A',
                        check_in: b.check_in,
                        check_out: b.check_out,
                        nights,
                        amount: Math.round(unit * nights * 100) / 100,
                        status: 'PENDING'
                    };
                });
                const { error: bookingErr } = await supabase
                    .from('product_bookings')
                    .insert(bookingsData);
                if (bookingErr) {
                    console.error('[Lenco Public Intent] Error logging product bookings:', bookingErr);
                }
            }
        }

        // One-time payment link: tie this checkout's reference to the link so the
        // finalization can flip it to PAID (single-use auto-deactivation).
        if (paymentLinkToken) {
            const { error: linkError } = await supabase
                .from('payment_links')
                .update({ reference })
                .eq('token', paymentLinkToken)
                .eq('status', 'ACTIVE');
            if (linkError) {
                console.error('[Lenco Public Intent] Error stamping payment link reference:', linkError);
            }
        }

        res.json({ message: 'Intent logged successfully' });
    } catch (error: any) {
        console.error('[Lenco Public Intent] Error:', error);
        res.status(500).json({ error: 'Failed to log wallet deposit intent', details: error.message });
    }
};

/** Public, anonymous customer checkout (PublicPay / PublicPaymentLink) — forward-booking only. */
export const logPublicWalletDepositIntent = (req: Request, res: Response) =>
    logWalletDepositIntentCore(req, res, false);

/**
 * Authenticated dashboard checkout (New Sale → MoneyWise POS) — allows a past
 * check-in date for retrospective bookings. Verifies the target wallet belongs
 * to the caller's own organization before logging anything, since the public
 * core trusts `walletId` from the request body.
 */
export const logInternalWalletDepositIntent = async (req: Request, res: Response) => {
    const organizationId = (req as any).user?.organization_id;
    const { walletId } = req.body;
    if (!organizationId) {
        return res.status(400).json({ error: 'User organization context missing' });
    }
    if (!walletId) {
        return res.status(400).json({ error: 'walletId is required' });
    }
    const { data: wallet, error } = await supabase
        .from('organization_wallets')
        .select('organization_id')
        .eq('id', walletId)
        .single();
    if (error || !wallet || wallet.organization_id !== organizationId) {
        return res.status(404).json({ error: 'Wallet not found' });
    }
    return logWalletDepositIntentCore(req, res, true);
};

/**
 * Fetch details of a completed product sale to regenerate a receipt
 */
export const getSaleReceiptDetails = async (req: Request, res: Response) => {
    try {
        const { entryId } = req.params;
        const organizationId = (req as any).user.organization_id;

        if (!organizationId) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        // 1. Fetch cashbook entry
        const { data: entry, error: entryError } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('id', entryId)
            .eq('organization_id', organizationId)
            .single();

        if (entryError || !entry) {
            return res.status(404).json({ error: 'Cashbook entry not found' });
        }

        // 2. Parse reference from unsanitized description
        // Standard format is: "... | Ref: TKT-MPZZEJOS"
        const refMatch = entry.description.match(/\|\s*Ref:\s*([^\s|]+)/i) || entry.description.match(/Ref:\s*([^\s|]+)/i);
        const reference = refMatch ? refMatch[1].trim() : null;

        if (!reference) {
            return res.status(400).json({ error: 'No transaction reference found in this entry description' });
        }

        // 3. Fetch product sales with this reference
        const { data: sales, error: salesError } = await supabase
            .from('product_sales')
            .select(`
                *,
                products (
                    name,
                    price
                )
            `)
            .eq('reference', reference)
            .eq('organization_id', organizationId);

        if (salesError) {
            return res.status(500).json({ error: 'Failed to fetch product sales details', details: salesError.message });
        }

        if (!sales || sales.length === 0) {
            return res.status(404).json({ error: 'No matching product sales found for this reference' });
        }

        // 4. Fetch organization details
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('name, logo_url')
            .eq('id', organizationId)
            .single();

        if (orgError || !org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        // Extract customer info (from the first sale item)
        const customerName = sales[0].customer_name || 'Anonymous';
        const customerPhone = sales[0].customer_phone || 'N/A';

        // Format items list
        const items = sales.map((sale: any) => ({
            id: sale.product_id,
            name: sale.products?.name || 'Unknown Product',
            price: Number(sale.products?.price) || Number(sale.amount_paid) / Number(sale.quantity),
            quantity: sale.quantity,
            total: Number(sale.amount_paid)
        }));

        // Calculate subtotal from products
        const subtotal = items.reduce((sum, item) => sum + item.total, 0);
        // Processing fee (tiered platform fee) paid by client
        const processingFee = calculatePlatformFee(subtotal);
        const totalPaid = subtotal + processingFee;

        res.json({
            org: {
                name: org.name,
                logo_url: org.logo_url
            },
            receiptNumber: entry.reference_number || reference.replace('-PUB', ''),
            date: entry.created_at || entry.date,
            reference: reference,
            customerName,
            customerPhone,
            subtotal,
            processingFee,
            totalPaid,
            items
        });
    } catch (error: any) {
        console.error('Error in getSaleReceiptDetails:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};

/**
 * Public endpoint to fetch completed receipts for a phone number under a specific wallet
 */
export const getPublicSalesByPhone = async (req: Request, res: Response) => {
    try {
        const { phone } = req.params;
        const { walletId } = req.query;

        if (!walletId) {
            return res.status(400).json({ error: 'walletId parameter is required' });
        }

        // Find organization linked to the wallet
        const { data: wallet, error: walletError } = await supabase
            .from('organization_wallets')
            .select('organization_id')
            .eq('id', walletId)
            .single();

        if (walletError || !wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        const organizationId = wallet.organization_id;

        // Clean/normalize the input phone number
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        if (!cleanPhone) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }

        // Search by raw match or suffix (last 9 digits) to handle international/national formatting
        const phoneSuffix = cleanPhone.length >= 9 ? cleanPhone.substring(cleanPhone.length - 9) : cleanPhone;

        const { data: sales, error: salesError } = await supabase
            .from('product_sales')
            .select(`
                id,
                customer_name,
                customer_phone,
                amount_paid,
                quantity,
                reference,
                created_at,
                products (
                    name
                )
            `)
            .eq('organization_id', organizationId)
            .eq('status', 'COMPLETED')
            .or(`customer_phone.like.%${phoneSuffix}%,customer_phone.eq.${cleanPhone}`);

        if (salesError) {
            return res.status(500).json({ error: 'Failed to fetch receipts', details: salesError.message });
        }

        if (!sales || sales.length === 0) {
            return res.json([]);
        }

        // Group sales by reference (since a single purchase reference can have multiple items)
        const groupedMap: Record<string, any> = {};
        sales.forEach((sale: any) => {
            const ref = sale.reference;
            if (!groupedMap[ref]) {
                groupedMap[ref] = {
                    reference: ref,
                    date: sale.created_at,
                    customerName: sale.customer_name,
                    customerPhone: sale.customer_phone,
                    items: [],
                    totalPaid: 0
                };
            }
            groupedMap[ref].items.push(`${sale.products?.name || 'Product'} (x${sale.quantity})`);
            groupedMap[ref].totalPaid += Number(sale.amount_paid);
        });

        // Convert to array, add the tiered platform fee, and sort by date descending
        const receiptsList = Object.values(groupedMap).map((receipt: any) => {
            const subtotal = receipt.totalPaid;
            const fee = calculatePlatformFee(subtotal);
            receipt.totalPaid = subtotal + fee;
            receipt.itemsText = receipt.items.join(', ');
            return receipt;
        }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

        res.json(receiptsList);
    } catch (error: any) {
        console.error('Error in getPublicSalesByPhone:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};

/**
 * Public endpoint to fetch receipt details by payment reference
 */
export const getPublicSaleReceiptDetails = async (req: Request, res: Response) => {
    try {
        const { reference } = req.params;

        if (!reference) {
            return res.status(400).json({ error: 'Reference parameter is required' });
        }

        // 1. Fetch completed product sales with this reference
        const { data: sales, error: salesError } = await supabase
            .from('product_sales')
            .select(`
                *,
                products (
                    name,
                    price
                )
            `)
            .eq('reference', reference)
            .eq('status', 'COMPLETED');

        if (salesError) {
            return res.status(500).json({ error: 'Failed to fetch product sales details', details: salesError.message });
        }

        if (!sales || sales.length === 0) {
            return res.status(404).json({ error: 'Receipt not found or payment not completed' });
        }

        const organizationId = sales[0].organization_id;

        // 2. Fetch cashbook entry to retrieve sequence reference number and date
        const { data: entry } = await supabase
            .from('cashbook_entries')
            .select('reference_number, created_at, date')
            .like('description', `%${reference}%`)
            .maybeSingle();

        // 3. Fetch organization details
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('name, logo_url')
            .eq('id', organizationId)
            .single();

        if (orgError || !org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        const customerName = sales[0].customer_name || 'Anonymous';
        const customerPhone = sales[0].customer_phone || 'N/A';

        const items = sales.map((sale: any) => ({
            id: sale.product_id,
            name: sale.products?.name || 'Unknown Product',
            price: Number(sale.products?.price) || Number(sale.amount_paid) / Number(sale.quantity),
            quantity: sale.quantity,
            total: Number(sale.amount_paid)
        }));

        const subtotal = items.reduce((sum, item) => sum + item.total, 0);
        const processingFee = calculatePlatformFee(subtotal);
        const totalPaid = subtotal + processingFee;

        res.json({
            org: {
                name: org.name,
                logo_url: org.logo_url
            },
            receiptNumber: (entry && entry.reference_number) || reference.replace('-PUB', ''),
            date: (entry && (entry.created_at || entry.date)) || sales[0].created_at,
            reference: reference,
            customerName,
            customerPhone,
            subtotal,
            processingFee,
            totalPaid,
            items
        });
    } catch (error: any) {
        console.error('Error in getPublicSaleReceiptDetails:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};

/**
 * For "Split payment" commission-sweep credits (the MoneyWise platform fee
 * forwarded out of a merchant's collecting sub-account into the settlement
 * merchant's wallet), auto-categorize the resulting inflow as
 * "Transaction Service Revenue" if that account exists in the receiving
 * organization's chart of accounts. This only ever applies to the MoneyWise
 * settlement merchant (Blue Opus Software), since it's the only org that both
 * receives "Split payment" credits and has this account.
 */
async function categorizeSplitPaymentRevenue(orgId: string, entryId: string) {
    const { data: account } = await supabase
        .from('accounts')
        .select('id')
        .eq('organization_id', orgId)
        .ilike('name', 'Transaction Service Revenue')
        .maybeSingle();

    if (account) {
        await supabase
            .from('cashbook_entries')
            .update({ account_id: account.id, status: 'ACCOUNTED' })
            .eq('id', entryId);
    }
}

/**
 * Syncs Lenco transactions for all organizations that have a linked Lenco subaccount.
 */
/**
 * Reconstruct the sale ledger description + face amount for a merchant reference
 * from product_sales. Lets the sync recover the full "Sale: Products: ..." entry
 * (product, customer, receipt-compatible format) even when the pending intent was
 * lost, instead of logging the raw bank narration.
 */
async function buildSaleFinalization(orgId: string, reference: string): Promise<{ description: string; amount: number } | null> {
    const { data: sales } = await supabase
        .from('product_sales')
        .select('quantity, amount_paid, customer_name, customer_phone, products(name)')
        .eq('organization_id', orgId)
        .eq('reference', reference);

    if (!sales || sales.length === 0) return null;

    const itemsText = sales.map((s: any) => `${s.products?.name || 'Product'} (x${s.quantity})`).join(', ');
    const customer = (sales[0].customer_name || '').trim() || sales[0].customer_phone || 'Anonymous';
    const total = sales.reduce((sum: number, s: any) => sum + Number(s.amount_paid || 0), 0);

    return {
        description: `Sale: Products: ${itemsText} | Cust: ${customer} | Ref: ${reference}`,
        amount: Math.round(total * 100) / 100
    };
}

async function completeSalesForReference(orgId: string, reference: string): Promise<void> {
    const { error } = await supabase
        .from('product_sales')
        .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
        .eq('organization_id', orgId)
        .eq('reference', reference)
        .eq('status', 'PENDING');
    if (error) {
        console.error(`[Lenco Sync] Failed to complete product_sales for ref ${reference}:`, error.message);
    }

    // Route revenue to each product's mapped wallet + income account, confirm any
    // booking reservations, and flip any one-time payment link tied to this
    // reference to PAID. All idempotent.
    await applyProductRevenueRouting(orgId, reference);
    await confirmBookingsForReference(orgId, reference);
    await markPaymentLinkPaid(orgId, reference);
}

export const syncAllLencoTransactions = async (req: Request, res: Response) => {
    console.log('[Lenco Sync] Background synchronization triggered');

    const authHeader = req.headers['authorization'];
    const syncSecret = process.env.LENCO_SYNC_SECRET;

    if (syncSecret && authHeader !== `Bearer ${syncSecret}`) {
        console.warn('[Lenco Sync] Unauthorized attempt to trigger sync');
        return res.status(401).json({ error: 'Unauthorized: Invalid sync secret' });
    }

    try {
        // 1. Fetch all organizations with a linked Lenco subaccount
        const { data: orgs, error: orgsError } = await supabase
            .from('organizations')
            .select('id, name, lenco_subaccount_id, lenco_secret_key, lenco_sync_cutoff_date')
            .not('lenco_subaccount_id', 'is', null);

        if (orgsError) {
            console.error('[Lenco Sync] Error fetching organizations:', orgsError);
            return res.status(500).json({ error: 'Failed to fetch organizations' });
        }

        if (!orgs || orgs.length === 0) {
            console.log('[Lenco Sync] No organizations with linked Lenco subaccounts found.');
            return res.json({ success: true, processed: 0, message: 'No organizations to sync' });
        }

        console.log(`[Lenco Sync] Found ${orgs.length} organizations to process.`);
        const syncResults: any[] = [];

        for (const org of orgs) {
            const orgId = org.id;
            const subaccountId = org.lenco_subaccount_id;
            const secretKey = org.lenco_secret_key || process.env.LENCO_SECRET_KEY;

            if (!subaccountId) continue;
            if (!secretKey) {
                console.warn(`[Lenco Sync] Missing API key for organization ${org.name} (${orgId}). Skipping.`);
                continue;
            }

            console.log(`[Lenco Sync] Processing organization: ${org.name} (${orgId}) | Subaccount: ${subaccountId}`);

            // Fetch main wallet for this organization
            const { data: mainWallet, error: walletError } = await supabase
                .from('organization_wallets')
                .select('id')
                .eq('organization_id', orgId)
                .eq('is_main', true)
                .maybeSingle();

            if (walletError || !mainWallet) {
                console.error(`[Lenco Sync] Main wallet not found for org ${org.name}. Skipping.`);
                continue;
            }

            const walletId = mainWallet.id;

            // ─────────────────────────────────────────────────────────────────
            // Reconciliation cutoff: if this wallet has an OPENING_BALANCE entry,
            // its date marks the start of the reconciled ledger. Lenco transactions
            // dated before that opening balance must NOT be re-logged (they are
            // already represented by the opening balance figure). Without this, a
            // periodic sync would keep re-creating historical pre-opening entries
            // and break a wallet that was reconciled to a fixed opening balance.
            let syncCutoffDate: string | null = null;
            const { data: openingEntry } = await supabase
                .from('cashbook_entries')
                .select('date')
                .eq('organization_id', orgId)
                .eq('wallet_id', walletId)
                .eq('account_type', 'MONEYWISE_WALLET')
                .eq('entry_type', 'OPENING_BALANCE')
                .order('date', { ascending: true })
                .limit(1)
                .maybeSingle();
            if (openingEntry?.date) {
                syncCutoffDate = openingEntry.date;
                console.log(`[Lenco Sync] Reconciliation cutoff for ${org.name}: ${syncCutoffDate} — transactions before this date are ignored.`);
            }

            // Forward-only override: if this org has an explicit lenco_sync_cutoff_date,
            // the sync must ignore everything dated before it, even if it post-dates the
            // opening balance. This freezes a manually-reconciled ledger so the periodic
            // sync only ingests NEW transactions from that date onward (it never reaches
            // back and re-creates historical entries we have already balanced by hand).
            // Date strings are ISO ('YYYY-MM-DD') so lexical comparison is chronological.
            const cutoffOverride: string | null = (org as any).lenco_sync_cutoff_date || null;
            if (cutoffOverride && (!syncCutoffDate || cutoffOverride > syncCutoffDate)) {
                syncCutoffDate = cutoffOverride;
                console.log(`[Lenco Sync] Forward-only cutoff for ${org.name}: ${syncCutoffDate} — only transactions on/after this date are synced.`);
            }

            // Fetch latest transactions from Lenco API (Page 1 is enough for periodic sync)
            let txns: any[] = [];
            try {
                const resp = await LencoService.getAccountTransactions(subaccountId, { page: 1 }, secretKey);
                txns = resp?.data || resp?.transactions || resp || [];
            } catch (err: any) {
                console.error(`[Lenco Sync] Failed to fetch Lenco transactions for org ${org.name}:`, err.message);
                syncResults.push({ orgId, orgName: org.name, success: false, error: err.message });
                continue;
            }

            if (!Array.isArray(txns) || txns.length === 0) {
                console.log(`[Lenco Sync] No transactions found on Lenco for org ${org.name}.`);
                syncResults.push({ orgId, orgName: org.name, success: true, syncedCount: 0 });
                continue;
            }

            // Sort chronologically (oldest first) so that running balance is calculated correctly
            txns.sort((a, b) => new Date(a.datetime || 0).getTime() - new Date(b.datetime || 0).getTime());

            // Pre-compute the "gross" amount that actually moved the Lenco balance for each
            // transaction. For debits this is amount + bank fee (the balance drops by more than
            // the stated amount); for credits it equals the credited amount. The wallet ledger
            // mirrors the bank, so outflows are logged at this gross figure.
            for (let i = 0; i < txns.length; i++) {
                const prevBal = i > 0 && txns[i - 1].balance != null ? parseFloat(txns[i - 1].balance) : null;
                const curBal = txns[i].balance != null ? parseFloat(txns[i].balance) : null;
                const amt = parseFloat(txns[i].amount || '0');
                const isDebit = (txns[i].type || '').toLowerCase() === 'debit';
                txns[i]._gross = (isDebit && prevBal != null && curBal != null)
                    ? Math.round((prevBal - curBal) * 100) / 100
                    : amt;
            }

            // Build a lookup map of all disbursements for this org to pair matching transactions
            const { data: disbursements, error: disbError } = await supabase
                .from('disbursements')
                .select('requisition_id, external_reference, cashier_id, payment_method, requisitions!inner(status, estimated_total, actual_total)')
                .eq('requisitions.organization_id', orgId);

            const refToDisb = new Map<string, any>();
            const reqIdToDisb = new Map<string, any>();

            if (!disbError && disbursements) {
                for (const d of disbursements) {
                    if (d.external_reference) {
                        refToDisb.set(d.external_reference.trim().toLowerCase(), d);
                    }
                    if (d.requisition_id) {
                        reqIdToDisb.set(d.requisition_id.slice(0, 8).toLowerCase(), d);
                    }
                }
            }

            // ─────────────────────────────────────────────────────────────────
            // KEY FIX: Build a settlement-ID → merchant-reference map
            // ─────────────────────────────────────────────────────────────────
            // The /transactions API returns only the raw bank transaction UUID and
            // the narration (payer name). It does NOT include the DEP-... merchant
            // reference that our webhook saves to external_reference.
            //
            // The /collections API returns objects with BOTH:
            //   - reference     (e.g. "DEP-...") — what the webhook stores
            //   - settlement.id (e.g. "db47b07b-...") — the bank transaction UUID
            //
            // By mapping settlement.id → reference, we can resolve the correct
            // merchant reference for each bank credit transaction before doing
            // the dedup check against our cashbook_entries table.
            const settlementToRef = new Map<string, string>();
            // reference → collection object; lets the stale-intent janitor below check
            // collection status without an extra API call per intent.
            const refToCollection = new Map<string, any>();
            try {
                // Lenco's collections page size is NOT 100 (observed ~50). The old
                // `length < 100` break stopped after page 1, so the map only covered
                // the newest page — older same-day payments became unresolvable and
                // the sync re-logged them as duplicate raw inflows (CR-2026-0085/0086
                // on 2026-06-12). Page until no new references appear, hard-capped.
                let colPage = 1;
                while (colPage <= 40) {
                    const collectionsResp = await LencoService.getCollections({ page: colPage }, secretKey);
                    const collections: any[] = collectionsResp?.data || [];
                    if (collections.length === 0) break;
                    let newRefs = 0;
                    for (const col of collections) {
                        if (col.reference && !refToCollection.has(col.reference)) newRefs++;
                        if (col.settlement?.id && col.reference) {
                            settlementToRef.set(col.settlement.id, col.reference);
                        }
                        if (col.reference) {
                            refToCollection.set(col.reference, col);
                        }
                    }
                    if (newRefs === 0) break; // page param ignored or repeating data
                    colPage++;
                }
                console.log(`[Lenco Sync] Built settlement→ref map with ${settlementToRef.size} entries (${colPage} page(s)) for org ${org.name}`);
            } catch (err: any) {
                // Non-fatal: we can still sync, just with less deduplication accuracy
                console.warn(`[Lenco Sync] Could not fetch collections for org ${org.name}: ${err.message}. Proceeding without settlement map.`);
            }

            let newEntriesCount = 0;
            let finalizedCount = 0;

            for (const txn of txns) {
                const txnId = txn.id || txn.transactionId;
                const txnType = (txn.type || '').toLowerCase(); // 'credit' or 'debit'
                const txnDesc = txn.remarks || txn.narration || txn.description || '';
                const txnStatus = (txn.status || '').toLowerCase();
                const txnAmount = parseFloat(txn.amount || '0');
                const txnGross = typeof txn._gross === 'number' ? txn._gross : txnAmount;

                if (!txnId || txnStatus === 'failed' || txnStatus === 'reversed') {
                    continue;
                }

                // Transactions before the reconciliation cutoff must never CREATE new
                // ledger entries (that history is frozen). But a pre-cutoff CREDIT may
                // still need to FINALIZE an existing PENDING intent — skipping outright
                // left intents stuck forever whenever the webhook missed the payment.
                // Defer the decision for credits; debits remain fully skipped.
                const txnDate = (txn.datetime || '').split('T')[0];
                const isPreCutoff = !!(syncCutoffDate && txnDate && txnDate < syncCutoffDate);
                if (isPreCutoff && txnType !== 'credit') {
                    continue;
                }

                const descLower = txnDesc.toLowerCase();
                const txnRefRaw = (txn.reference || txn.clientReference || '').trim();

                // Skip ONLY the OUTFLOW leg of the MoneyWise platform-fee sweep (the debit
                // leaving the merchant's collecting sub-account). The merchant wallet already
                // reflects the NET amount (the fee was never posted there), so logging this
                // outflow would understate the merchant.
                //
                // We intentionally do NOT filter the matching CREDIT into the Blue Opus
                // settlement account — that inflow is MoneyWise fee revenue and must remain
                // recorded. Hence this guard is debit-only.
                //
                // Covers the per-transaction sweep (narration "Split payment" / reference
                // "SPLIT-...") and the legacy native split-inflow markers.
                if (txnType === 'debit' && (
                    descLower.includes('split payment') ||
                    txnRefRaw.toUpperCase().startsWith('SPLIT-') ||
                    descLower.includes('split-inflow') ||
                    descLower.includes('split-inflow payment') ||
                    descLower.includes('to blue opus software')
                )) {
                    continue;
                }

                // Resolve merchant reference:
                // For credit transactions, look up the DEP-... reference via the
                // settlement map. Fall back to any reference the API gives us.
                let resolvedRef = (txn.reference || txn.clientReference || '').trim();
                if (txnType === 'credit' && !resolvedRef && settlementToRef.has(txnId)) {
                    resolvedRef = settlementToRef.get(txnId)!;
                    console.log(`[Lenco Sync] Resolved merchant ref for txn ${txnId}: ${resolvedRef}`);
                }

                // ─── Change-return deposits (CHG-...) must NOT be logged as standalone inflows ───
                // When a requestor submits change via the wallet, the deposit comes back as a real
                // Lenco credit whose reference is the requisition's change_external_reference
                // (CHG-<ts>-<reqId>). It is pure netting against the requisition's disbursement, NOT
                // new income. Mirror the webhook's CHG- branch (handleCollectionSuccessful): record
                // the change on the disbursement so it nets into the original outflow, and skip the
                // ledger entry entirely. Without this, the periodic sync re-creates the change as an
                // "Unaccounted" inflow and the wallet balance is overstated/double-counted.
                if (txnType === 'credit') {
                    const chgRef = (txnRefRaw || resolvedRef || '').trim();
                    if (chgRef.toUpperCase().startsWith('CHG-')) {
                        const parts = chgRef.split('-');
                        // Formats: CHG-<ts>-<uuid> (7 parts) or CHG-<ts>-<uuid>-<shortId> (8 parts)
                        const reqIdToUse = parts.length >= 8 ? parts[parts.length - 1] : parts.slice(2).join('-');
                        try {
                            await cashbookService.updateDisbursementForChange(orgId, reqIdToUse, txnAmount, chgRef);
                            console.log(`[Lenco Sync] Change return ${chgRef} netted into requisition ${reqIdToUse}; no standalone inflow logged.`);
                        } catch (chgErr) {
                            console.error(`[Lenco Sync] Failed to net change return ${chgRef}:`, chgErr);
                        }
                        continue;
                    }
                }

                // A "Split payment" commission-sweep credit landing in the settlement
                // merchant's (Blue Opus) sub-account — see categorizeSplitPaymentRevenue.
                const isSplitPaymentSweep = txnType === 'credit' && (
                    descLower.includes('split payment') ||
                    resolvedRef.toUpperCase().startsWith('SPLIT-')
                );

                // ─── Check if cashbook entry already exists for this transaction ───
                // Multi-row-safe: .maybeSingle() errors out (data=null) when more than
                // one row matches — e.g. a finalized entry plus a stale PENDING twin —
                // which previously read as "no match" and created duplicate raw inflows.
                // Collect candidates and pick explicitly instead.
                let candidates: any[] = [];

                // 1. Check by the bank transaction UUID (txnId)
                const { data: byTxnId } = await supabase
                    .from('cashbook_entries')
                    .select('id, status, description, wallet_id, debit, credit, date')
                    .eq('organization_id', orgId)
                    .eq('account_type', 'MONEYWISE_WALLET')
                    .eq('external_reference', txnId)
                    .limit(5);
                candidates = byTxnId || [];

                // 2. Check by the resolved merchant reference (e.g. DEP-...)
                if (resolvedRef) {
                    const { data: byRef } = await supabase
                        .from('cashbook_entries')
                        .select('id, status, description, wallet_id, debit, credit, date')
                        .eq('organization_id', orgId)
                        .eq('account_type', 'MONEYWISE_WALLET')
                        .eq('external_reference', resolvedRef)
                        .limit(5);
                    for (const row of byRef || []) {
                        if (!candidates.some((c) => c.id === row.id)) candidates.push(row);
                    }

                    // 3. Fallback: merchant reference substring in description (legacy
                    // intents created before external_reference was set at intent time)
                    if (candidates.length === 0) {
                        const { data: byDesc } = await supabase
                            .from('cashbook_entries')
                            .select('id, status, description, wallet_id, debit, credit, date')
                            .eq('organization_id', orgId)
                            .eq('account_type', 'MONEYWISE_WALLET')
                            .like('description', `%${resolvedRef}%`)
                            .limit(5);
                        candidates = byDesc || [];
                    }
                }

                const finalizedExisting = candidates.find((c) => c.status !== 'PENDING') || null;
                const pendingIntent = candidates.find((c) => c.status === 'PENDING') || null;

                if (finalizedExisting) {
                    // Already in the ledger. Heal partial prior runs: drop a redundant
                    // PENDING twin and make sure the sale isn't stuck PENDING.
                    if (pendingIntent) {
                        await supabase.from('cashbook_entries').delete().eq('id', pendingIntent.id).eq('status', 'PENDING');
                        console.log(`[Lenco Sync] Removed stale duplicate intent ${pendingIntent.id} (ref ${resolvedRef || txnId}).`);
                    }
                    if (txnType === 'credit' && resolvedRef) {
                        await completeSalesForReference(orgId, resolvedRef);
                    }
                    continue;
                }

                if (pendingIntent) {
                    if (txnType === 'credit') {
                        // Finalize the intent IN PLACE, preserving its sale description.
                        // (The old flow deleted the intent and recreated the entry from the
                        // raw bank narration — losing the product/customer detail, breaking
                        // receipt generation, and orphaning the payment entirely whenever
                        // the recreate failed.)
                        //
                        // NOTE: The MoneyWise platform charge is intentionally NOT posted to
                        // the wallet ledger. The wallet must mirror the actual Lenco balance.
                        try {
                            const sale = resolvedRef ? await buildSaleFinalization(orgId, resolvedRef) : null;
                            const intentDesc = (pendingIntent.description || '')
                                .replace('PENDING_INTENT: ', '')
                                .replace('PENDING_INTENT:', '')
                                .trim();
                            const finalDescription = sale?.description
                                || intentDesc
                                || txnDesc
                                || `Wallet Deposit | Ref: ${resolvedRef || txnId}`;

                            const isPublicSale = !!sale || resolvedRef.endsWith('-PUB') || descLower.startsWith('sale:') || descLower.startsWith('revenue:');
                            const inflowAmount = sale ? sale.amount
                                : (Number(pendingIntent.debit) > 0 ? Number(pendingIntent.debit)
                                : (isPublicSale ? Math.round(txnAmount * 0.975 * 100) / 100 : txnAmount));

                            const finalizedEntry = await cashbookService.finalizePendingIntent(orgId, pendingIntent.id, {
                                description: finalDescription,
                                debit: inflowAmount,
                                externalReference: resolvedRef || txnId,
                                fallbackExternalReference: txnId,
                                date: txnDate || undefined
                            });

                            if (resolvedRef) {
                                await completeSalesForReference(orgId, resolvedRef);
                            }
                            if (isSplitPaymentSweep && finalizedEntry?.id) {
                                await categorizeSplitPaymentRevenue(orgId, finalizedEntry.id);
                            }

                            finalizedCount++;
                            console.log(`[Lenco Sync] Finalized pending inflow intent ${pendingIntent.id} for ref ${resolvedRef || txnId}`);
                        } catch (entryErr: any) {
                            console.error(`[Lenco Sync] Failed to finalize pending inflow ${pendingIntent.id} for org ${org.name}:`, entryErr.message);
                        }
                    }
                    continue;
                }

                // No trace of this transaction in the ledger. Past the cutoff, history
                // is frozen: finalizing an existing intent (above) is allowed, creating
                // brand-new entries is not.
                if (isPreCutoff) {
                    continue;
                }

                // If not found, log it as a new transaction!
                if (txnType === 'credit') {
                    // New Inflow
                    console.log(`[Lenco Sync] Logging new inflow transaction: ID=${txnId}, Amt=K${txnAmount}`);

                    // Recover the sale from product_sales when the merchant reference
                    // resolves to one. The intent may have been lost (cleanup race,
                    // failed prior finalize), but the sale row still tells us the
                    // product, customer, and face amount — log a proper receiptable
                    // "Sale:" entry instead of the raw bank narration.
                    const sale = resolvedRef ? await buildSaleFinalization(orgId, resolvedRef) : null;

                    const isPublicSale = resolvedRef.endsWith('-PUB') || descLower.startsWith('sale:') || descLower.startsWith('revenue:');
                    const inflowAmount = sale ? sale.amount : (isPublicSale ? txnAmount * 0.975 : txnAmount);
                    const entryDescription = sale?.description || txnDesc || `Wallet Deposit | Ref: ${resolvedRef || txnId}`;
                    const entryStatus = sale ? 'COMPLETED' : 'UNACCOUNTED';
                    // Use the merchant reference as external_reference if available so that
                    // the unique index (uniq_cashbook_inflow_per_reference) matches what the
                    // webhook would have stored, preventing future duplicates.
                    const entryExternalRef = resolvedRef || txnId;

                    // NOTE: The MoneyWise platform charge is intentionally NOT posted to the
                    // wallet ledger. The wallet must mirror the actual Lenco balance, which does
                    // not deduct this fee. Any real fee settlement appears as its own Lenco debit.
                    try {
                        let newEntry;
                        try {
                            newEntry = await cashbookService.createEntry(orgId, {
                                date: (txn.datetime || new Date().toISOString()).split('T')[0],
                                description: entryDescription,
                                debit: inflowAmount,
                                credit: 0,
                                entry_type: 'INFLOW',
                                account_type: 'MONEYWISE_WALLET',
                                status: entryStatus,
                                wallet_id: walletId,
                                external_reference: entryExternalRef
                            } as any);
                        } catch (createErr: any) {
                            // The resolved merchant reference can collide with another
                            // organization's INFLOW row under the GLOBAL
                            // uniq_cashbook_inflow_per_reference index (e.g. a "Split payment"
                            // sweep credit resolving to the originating org's own DEP-... ref).
                            // Fall back to the bank transaction ID, which is unique by construction.
                            if (createErr?.message?.includes('uniq_cashbook_inflow_per_reference') && entryExternalRef !== txnId) {
                                console.warn(`[Lenco Sync] external_reference '${entryExternalRef}' collided globally; retrying with txnId '${txnId}' for org ${org.name}`);
                                newEntry = await cashbookService.createEntry(orgId, {
                                    date: (txn.datetime || new Date().toISOString()).split('T')[0],
                                    description: entryDescription,
                                    debit: inflowAmount,
                                    credit: 0,
                                    entry_type: 'INFLOW',
                                    account_type: 'MONEYWISE_WALLET',
                                    status: entryStatus,
                                    wallet_id: walletId,
                                    external_reference: txnId
                                } as any);
                            } else {
                                throw createErr;
                            }
                        }

                        if (sale && resolvedRef) {
                            await completeSalesForReference(orgId, resolvedRef);
                        }
                        if (isSplitPaymentSweep && newEntry?.id) {
                            await categorizeSplitPaymentRevenue(orgId, newEntry.id);
                        }

                        newEntriesCount++;
                    } catch (entryErr: any) {
                        console.error(`[Lenco Sync] Failed to log new inflow ${txnId} for org ${org.name}:`, entryErr.message);
                    }

                } else if (txnType === 'debit') {
                  try {
                    // New Outflow (Debit)
                    console.log(`[Lenco Sync] Logging new debit transaction: ID=${txnId}, Amt=K${txnAmount}`);

                    // Match to an existing requisition / disbursement
                    let matchedDisb: any = null;
                    const refLower = resolvedRef.toLowerCase();
                    
                    if (refLower && refToDisb.has(refLower)) {
                        matchedDisb = refToDisb.get(refLower);
                    }
                    
                    if (!matchedDisb && refLower) {
                        for (const [key, disb] of refToDisb.entries()) {
                            if (key && (refLower.includes(key) || key.includes(refLower))) {
                                matchedDisb = disb;
                                break;
                            }
                        }
                    }
                    
                    if (!matchedDisb) {
                        const reqMatch = txnDesc.match(/#([a-f0-9]{8})/i);
                        if (reqMatch) {
                            const shortId = reqMatch[1].toLowerCase();
                            matchedDisb = reqIdToDisb.get(shortId);
                        }
                    }

                    const requisitionId = matchedDisb?.requisition_id || null;

                    if (requisitionId) {
                        // Check if a wallet-disbursement ledger entry already exists for this
                        // requisition in ANY non-pending state. Matching DISBURSED-only missed rows
                        // already advanced to COMPLETED, so the sync re-finalized confirmed
                        // disbursements into duplicate outflows. (finalizeWalletDisbursementLedger
                        // self-guards too; this avoids the redundant call.) voucher_id IS NULL
                        // excludes "Actual for Req" voucher entries.
                        const { data: existingLedger } = await supabase
                            .from('cashbook_entries')
                            .select('id')
                            .eq('requisition_id', requisitionId)
                            .eq('entry_type', 'DISBURSEMENT')
                            .is('voucher_id', null)
                            .neq('status', 'PENDING')
                            .limit(1);

                        if (!existingLedger || existingLedger.length === 0) {
                            console.log(`[Lenco Sync] Finalizing ledger for matched requisition ${requisitionId}`);
                            await cashbookService.finalizeWalletDisbursementLedger(requisitionId);
                            finalizedCount++;
                        }

                        // Tag the requisition's disbursement entry with the Lenco transaction id so
                        // future syncs dedup against it (preventing a duplicate raw expense entry).
                        await supabase
                            .from('cashbook_entries')
                            .update({ external_reference: txnId })
                            .eq('requisition_id', requisitionId)
                            .eq('status', 'DISBURSED')
                            .is('external_reference', null);
                    } else {
                        // The debit may already be represented by a requisition disbursement whose
                        // line items reference this Lenco transaction. This covers requisitions paid
                        // via MULTIPLE Lenco transactions, where a single bundled disbursement entry
                        // already accounts for this txn's amount (so external_reference on that entry
                        // can only point at one of the txns). Without this check the other txn(s)
                        // would be re-logged as duplicate expenses.
                        const refDigits = (txnDesc.match(/\b(\d{6,})\b/) || [])[1];
                        if (refDigits) {
                            const { data: liHit } = await supabase
                                .from('line_items')
                                .select('requisition_id, requisitions!inner(organization_id)')
                                .eq('requisitions.organization_id', orgId)
                                .ilike('description', `%${refDigits}%`)
                                .limit(1)
                                .maybeSingle();
                            if (liHit) {
                                console.log(`[Lenco Sync] Debit ${txnId} (ref ${refDigits}) already covered by requisition ${String(liHit.requisition_id).slice(0, 8)} disbursement. Skipping.`);
                                continue;
                            }
                        }

                        // Otherwise, try to ADOPT an existing unlinked outflow (e.g. a requisition
                        // disbursement created by the payout flow) for the same money-out, to avoid
                        // duplicate entries. Match on the gross amount (payment + bank fee) and date.
                        const { data: adoptable } = await supabase
                            .from('cashbook_entries')
                            .select('id')
                            .eq('organization_id', orgId)
                            .eq('wallet_id', walletId)
                            .eq('account_type', 'MONEYWISE_WALLET')
                            .is('external_reference', null)
                            .in('entry_type', ['DISBURSEMENT', 'EXPENSE'])
                            .eq('date', txnDate)
                            .gte('credit', txnGross - 0.01)
                            .lte('credit', txnGross + 0.01)
                            .limit(1)
                            .maybeSingle();

                        if (adoptable) {
                            await supabase
                                .from('cashbook_entries')
                                .update({ external_reference: txnId })
                                .eq('id', adoptable.id);
                        } else {
                            // Genuinely new direct outflow -> log at gross so the wallet mirrors Lenco.
                            await cashbookService.createEntry(orgId, {
                                date: (txn.datetime || new Date().toISOString()).split('T')[0],
                                description: txnDesc || `Wallet Outflow | Ref: ${resolvedRef || txnId}`,
                                debit: 0,
                                credit: txnGross,
                                entry_type: 'EXPENSE',
                                account_type: 'MONEYWISE_WALLET',
                                status: 'COMPLETED',
                                wallet_id: walletId,
                                external_reference: txnId
                            } as any);
                            newEntriesCount++;
                        }
                    }
                  } catch (debitErr: any) {
                      console.error(`[Lenco Sync] Failed to process debit transaction ${txnId} for org ${org.name}:`, debitErr.message);
                  }
                }
            }

            // ─── Stale-intent janitor (redundancy layer) ─────────────────────
            // The webhook can miss a payment AND the transaction-matching above can
            // miss it too (settlement not yet listed, page-1 window passed, txn dated
            // before the cutoff). A paid intent must still never stay PENDING forever:
            // re-check old intents directly against Lenco collections by reference.
            //   successful            → finalize (description/amount from the sale)
            //   failed / never-found  → after 24h, remove the dead intent and mark
            //                           its sale FAILED (no money ever moved)
            //   anything ambiguous    → leave for the next cycle
            try {
                const JANITOR_MIN_AGE_MS = 30 * 60 * 1000;        // ignore in-flight payments
                const JANITOR_DELETE_AGE_MS = 24 * 60 * 60 * 1000; // only declare dead after a day

                const { data: staleIntents } = await supabase
                    .from('cashbook_entries')
                    .select('id, description, debit, date, created_at, external_reference')
                    .eq('organization_id', orgId)
                    .eq('account_type', 'MONEYWISE_WALLET')
                    .eq('entry_type', 'INFLOW')
                    .eq('status', 'PENDING')
                    .lt('created_at', new Date(Date.now() - JANITOR_MIN_AGE_MS).toISOString())
                    .order('created_at', { ascending: true })
                    .limit(20);

                for (const intent of staleIntents || []) {
                    const refMatch = (intent.description || '').match(/\|\s*Ref:\s*([^\s|]+)/i);
                    const intentRef = (intent.external_reference || (refMatch ? refMatch[1] : '') || '').trim();
                    if (!intentRef || intentRef.toUpperCase().startsWith('CHG-')) continue;

                    let collection: any = refToCollection.get(intentRef) || null;
                    let definitiveNotFound = false;
                    if (!collection) {
                        try {
                            collection = await LencoService.getCollectionStatus(intentRef, secretKey);
                        } catch (statusErr: any) {
                            const msg = (statusErr?.message || '').toLowerCase();
                            if (msg.includes('not found') || msg.includes('invalid') || msg.includes('404')) {
                                definitiveNotFound = true;
                            } else {
                                continue; // transient error — retry next cycle
                            }
                        }
                    }

                    const colStatus = (collection?.status || '').toLowerCase();

                    if (collection && (colStatus === 'successful' || colStatus === 'settled')) {
                        try {
                            const sale = await buildSaleFinalization(orgId, intentRef);
                            const intentDesc = (intent.description || '')
                                .replace('PENDING_INTENT: ', '')
                                .replace('PENDING_INTENT:', '')
                                .trim();
                            const description = sale?.description || intentDesc || `Wallet Deposit | Ref: ${intentRef}`;

                            const grossAmount = parseFloat(collection.amount || '0');
                            const isPub = intentRef.endsWith('-PUB') || description.startsWith('Sale:') || description.startsWith('Revenue:');
                            const amount = sale ? sale.amount
                                : (Number(intent.debit) > 0 ? Number(intent.debit)
                                : (isPub ? Math.round(grossAmount * 0.975 * 100) / 100 : grossAmount));

                            await cashbookService.finalizePendingIntent(orgId, intent.id, {
                                description,
                                debit: amount,
                                externalReference: intentRef
                            });
                            await completeSalesForReference(orgId, intentRef);
                            finalizedCount++;
                            console.log(`[Lenco Sync][Janitor] Finalized stale PAID intent ${intent.id} (ref ${intentRef}).`);
                        } catch (finalizeErr: any) {
                            console.error(`[Lenco Sync][Janitor] Failed to finalize stale intent ${intent.id}:`, finalizeErr.message);
                        }
                    } else if (
                        (definitiveNotFound || colStatus === 'failed' || colStatus === 'expired' || colStatus === 'cancelled') &&
                        (Date.now() - new Date(intent.created_at).getTime()) > JANITOR_DELETE_AGE_MS
                    ) {
                        await supabase.from('cashbook_entries').delete().eq('id', intent.id).eq('status', 'PENDING');
                        await supabase
                            .from('product_sales')
                            .update({ status: 'FAILED', updated_at: new Date().toISOString() })
                            .eq('organization_id', orgId)
                            .eq('reference', intentRef)
                            .eq('status', 'PENDING');
                        console.log(`[Lenco Sync][Janitor] Removed dead intent ${intent.id} (ref ${intentRef}, lenco status: ${definitiveNotFound ? 'not-found' : colStatus}).`);
                    }
                }
            } catch (janitorErr: any) {
                console.error(`[Lenco Sync][Janitor] Error for org ${org.name}:`, janitorErr.message);
            }

            // GL reconciliation safety net: re-post any cashbook entries whose journal is
            // missing or stale (e.g. line items recategorized, or a path that skipped the
            // live hooks). Idempotent and a no-op when everything is already posted.
            try {
                await ledgerService.runSweep(orgId);
            } catch (sweepErr: any) {
                console.error(`[Lenco Sync][Ledger Sweep] Error for org ${org.name}:`, sweepErr.message);
            }

            syncResults.push({
                orgId,
                orgName: org.name,
                success: true,
                syncedCount: newEntriesCount,
                finalizedCount: finalizedCount
            });
        }

        return res.json({
            success: true,
            results: syncResults
        });

    } catch (error: any) {
        console.error('[Lenco Sync] Critical sync error:', error);
        return res.status(500).json({ error: 'Internal server error during synchronization', details: error.message });
    }
};
