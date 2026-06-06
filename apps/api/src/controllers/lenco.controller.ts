import { Request, Response } from 'express';
import { LencoService } from '../services/lenco.service';
import { supabase } from '../lib/supabase';
import pool from '../db';
import { handleCollectionSuccessful } from './lenco.webhook.controller';
import { cashbookService } from '../services/cashbook.service';

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
        // 1. Check if the entry already exists and is finalized in our database
        const { data: existingEntry, error: dbError } = await supabase
            .from('cashbook_entries')
            .select('id, status, reference_number')
            .like('description', `%${reference}%`)
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
                console.log(`[Lenco Verify] Transaction not found on Lenco for reference ${reference}. Cleaning up pending entries.`);
                await supabase.from('cashbook_entries').delete().like('description', `%${reference}%`);
                await supabase.from('product_sales').delete().eq('reference', reference);
                return res.json({
                    verified: false,
                    status: 'DELETED',
                    message: 'Payment intent was not generated on Lenco. Cleaned up pending entries.'
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
            wallet_id: walletId
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
        // Processing fee (2.5%) paid by client
        const processingFee = subtotal * 0.025;
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

        // Convert to array, add 2.5% processing fee, and sort by date descending
        const receiptsList = Object.values(groupedMap).map((receipt: any) => {
            const subtotal = receipt.totalPaid;
            const fee = subtotal * 0.025;
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
        const processingFee = subtotal * 0.025;
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
 * Syncs Lenco transactions for all organizations that have a linked Lenco subaccount.
 */
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
            .select('id, name, lenco_subaccount_id, lenco_secret_key')
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

            // Build a lookup map of all disbursements for this org to pair matching transactions
            const { data: disbursements, error: disbError } = await supabase
                .from('disbursements')
                .select('requisition_id, external_reference, cashier_id, payment_method, requisitions(status, estimated_total, actual_total)')
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

            let newEntriesCount = 0;
            let finalizedCount = 0;

            for (const txn of txns) {
                const txnId = txn.id || txn.transactionId;
                const txnRef = (txn.reference || txn.clientReference || '').trim();
                const txnType = (txn.type || '').toLowerCase(); // 'credit' or 'debit'
                const txnDesc = txn.remarks || txn.narration || txn.description || '';
                const txnStatus = (txn.status || '').toLowerCase();
                const txnAmount = parseFloat(txn.amount || '0');

                if (!txnId || txnStatus === 'failed' || txnStatus === 'reversed') {
                    continue;
                }

                // Skip split-inflow debit transactions to avoid double-logging fees
                const descLower = txnDesc.toLowerCase();
                if (txnType === 'debit' && (
                    descLower.includes('split-inflow') || 
                    descLower.includes('split-inflow payment') || 
                    descLower.includes('to blue opus software')
                )) {
                    continue;
                }

                // Check if cashbook entry already exists for this transaction
                const refQuery = supabase
                    .from('cashbook_entries')
                    .select('id, status, description, wallet_id, debit, credit')
                    .eq('organization_id', orgId)
                    .eq('account_type', 'MONEYWISE_WALLET');

                // Try to find by external_reference = txnId, external_reference = txnRef, or description LIKE txnRef
                let existingQuery = refQuery.eq('external_reference', txnId);
                let { data: existingEntry } = await existingQuery.maybeSingle();

                if (!existingEntry && txnRef) {
                    existingEntry = (await supabase
                        .from('cashbook_entries')
                        .select('id, status, description, wallet_id, debit, credit')
                        .eq('organization_id', orgId)
                        .eq('account_type', 'MONEYWISE_WALLET')
                        .eq('external_reference', txnRef)
                        .maybeSingle()).data;
                }

                if (!existingEntry && txnRef) {
                    existingEntry = (await supabase
                        .from('cashbook_entries')
                        .select('id, status, description, wallet_id, debit, credit')
                        .eq('organization_id', orgId)
                        .eq('account_type', 'MONEYWISE_WALLET')
                        .like('description', `%${txnRef}%`)
                        .maybeSingle()).data;
                }

                if (existingEntry) {
                    // Entry already exists. If it's PENDING, let's finalize it.
                    if (existingEntry.status === 'PENDING') {
                        if (txnType === 'credit') {
                            // Finalize PENDING inflow (remove intent and create entry)
                            console.log(`[Lenco Sync] Finalizing pending inflow intent ${existingEntry.id} for ref ${txnRef}`);
                            await supabase.from('cashbook_entries').delete().eq('id', existingEntry.id);
                            
                            const isPublicSale = txnRef.endsWith('-PUB') || descLower.startsWith('sale:') || descLower.startsWith('revenue:');
                            const inflowAmount = isPublicSale ? txnAmount * 0.975 : txnAmount;
                            
                            await cashbookService.createEntry(orgId, {
                                date: (txn.datetime || new Date().toISOString()).split('T')[0],
                                description: txnDesc || `Wallet Deposit | Ref: ${txnRef}`,
                                debit: inflowAmount,
                                credit: 0,
                                entry_type: 'INFLOW',
                                account_type: 'MONEYWISE_WALLET',
                                status: 'COMPLETED',
                                wallet_id: walletId,
                                external_reference: txnId
                            } as any);

                            if (!isPublicSale) {
                                await cashbookService.createEntry(orgId, {
                                    date: (txn.datetime || new Date().toISOString()).split('T')[0],
                                    description: `MoneyWise Charge`,
                                    debit: 0,
                                    credit: txnAmount * 0.01,
                                    entry_type: 'ADJUSTMENT',
                                    account_type: 'MONEYWISE_WALLET',
                                    status: 'COMPLETED',
                                    wallet_id: walletId,
                                    external_reference: `${txnId}-fee`
                                } as any);
                            }
                            finalizedCount++;
                        }
                    }
                    continue; // Skip already completed/disbursed entries
                }

                // If not found, log it as a new transaction!
                if (txnType === 'credit') {
                    // New Inflow
                    console.log(`[Lenco Sync] Logging new inflow transaction: ID=${txnId}, Amt=K${txnAmount}`);
                    const isPublicSale = txnRef.endsWith('-PUB') || descLower.startsWith('sale:') || descLower.startsWith('revenue:');
                    const inflowAmount = isPublicSale ? txnAmount * 0.975 : txnAmount;

                    await cashbookService.createEntry(orgId, {
                        date: (txn.datetime || new Date().toISOString()).split('T')[0],
                        description: txnDesc || `Wallet Deposit | Ref: ${txnRef}`,
                        debit: inflowAmount,
                        credit: 0,
                        entry_type: 'INFLOW',
                        account_type: 'MONEYWISE_WALLET',
                        status: 'UNACCOUNTED',
                        wallet_id: walletId,
                        external_reference: txnId
                    } as any);

                    // Create 1% charge for standard deposits
                    if (!isPublicSale) {
                        await cashbookService.createEntry(orgId, {
                            date: (txn.datetime || new Date().toISOString()).split('T')[0],
                            description: `MoneyWise Charge`,
                            debit: 0,
                            credit: txnAmount * 0.01,
                            entry_type: 'ADJUSTMENT',
                            account_type: 'MONEYWISE_WALLET',
                            status: 'COMPLETED',
                            wallet_id: walletId,
                            external_reference: `${txnId}-fee`
                        } as any);
                    }
                    newEntriesCount++;

                } else if (txnType === 'debit') {
                    // New Outflow (Debit)
                    console.log(`[Lenco Sync] Logging new debit transaction: ID=${txnId}, Amt=K${txnAmount}`);
                    
                    // Match to an existing requisition / disbursement
                    let matchedDisb: any = null;
                    const refLower = txnRef.toLowerCase();
                    
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
                        // Check if ledger entry already exists for this requisition
                        const { data: existingLedger } = await supabase
                            .from('cashbook_entries')
                            .select('id')
                            .eq('requisition_id', requisitionId)
                            .eq('status', 'DISBURSED')
                            .maybeSingle();

                        if (!existingLedger) {
                            console.log(`[Lenco Sync] Finalizing ledger for matched requisition ${requisitionId}`);
                            await cashbookService.finalizeWalletDisbursementLedger(requisitionId);
                            finalizedCount++;
                        }
                    } else {
                        // Unmatched Outflow -> Create unaccounted expense entry
                        await cashbookService.createEntry(orgId, {
                            date: (txn.datetime || new Date().toISOString()).split('T')[0],
                            description: txnDesc || `Wallet Outflow | Ref: ${txnRef}`,
                            debit: 0,
                            credit: txnAmount,
                            entry_type: 'EXPENSE',
                            account_type: 'MONEYWISE_WALLET',
                            status: 'UNACCOUNTED',
                            wallet_id: walletId,
                            external_reference: txnId
                        } as any);
                        newEntriesCount++;
                    }
                }
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
