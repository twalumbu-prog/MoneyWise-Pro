import { Request, Response } from 'express';
import { LencoService } from '../services/lenco.service';
import { supabase } from '../lib/supabase';
import pool from '../db';
import { handleCollectionSuccessful } from './lenco.webhook.controller';

export const listLencoAccounts = async (req: Request, res: Response) => {
    try {
        const accounts = await LencoService.listAccounts();
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
            .select('name, lenco_subaccount_id')
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
            lencoAccount = await LencoService.createAccount(org.name);
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
        // 1. Get all Lenco accounts
        const allAccounts = await LencoService.listAccounts();

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
        // 1. Check if the entry already exists and is finalized in our database
        const { data: existingEntry, error: dbError } = await supabase
            .from('cashbook_entries')
            .select('id, status, reference_number')
            .like('description', `%${reference}`)
            .maybeSingle();

        if (dbError) throw dbError;

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
                            .like('description', `%${reference}`)
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
                        .like('description', `%${reference}`)
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
        }

        return res.json({ 
            verified: false, 
            status: (lencoStatus && lencoStatus.status) || 'pending',
            stage: (lencoStatus && lencoStatus.status === 'successful') ? 'RECORDING_FAILED' : 'NOT_FOUND_ON_LENCO',
            message: 'Transaction is still pending or was not successfully recorded in the ledger.'
        });

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
 * Log public wallet deposit intent (before external customer checkout redirects/initiates Lenco)
 */
export const logPublicWalletDepositIntent = async (req: Request, res: Response) => {
    try {
        const { reference, purpose, amount, walletId, customerName, customerPhone, items } = req.body;

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
            external_reference: reference
        });

        if (error) throw error;

        // Log pending product sales if present
        if (items && Array.isArray(items) && items.length > 0) {
            const salesData = items.map((item: any) => ({
                organization_id: wallet.organization_id,
                product_id: item.id,
                customer_name: customerName || 'Anonymous',
                customer_phone: customerPhone || 'N/A',
                quantity: item.quantity,
                amount_paid: Number(item.price) * Number(item.quantity),
                reference: reference,
                status: 'PENDING'
            }));

            const { error: salesError } = await supabase
                .from('product_sales')
                .insert(salesData);

            if (salesError) {
                console.error('[Lenco Public Intent] Error logging product sales:', salesError);
            }
        }

        res.json({ message: 'Intent logged successfully' });
    } catch (error: any) {
        console.error('[Lenco Public Intent] Error:', error);
        res.status(500).json({ error: 'Failed to log wallet deposit intent', details: error.message });
    }
};
