import { supabase } from '../lib/supabase';
import { encrypt, decrypt } from '../utils/security.utils';

/**
 * In-process token refresh lock.
 * Maps organizationId → the in-flight refresh Promise.
 * Any concurrent call for the same org awaits the existing Promise instead of
 * racing to call Intuit's token endpoint, which would invalidate the first
 * refresh token before the second caller can use it.
 */
const refreshLocks = new Map<string, Promise<{ accessToken: string; realmId: string }>>();

export class QuickBooksService {
    private static getEnv() {
        const isProduction = process.env.QB_ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production';
        return {
            clientId: process.env.QB_CLIENT_ID,
            clientSecret: process.env.QB_CLIENT_SECRET,
            redirectUri: process.env.QB_REDIRECT_URI,
            tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
            authUrl: 'https://appcenter.intuit.com/connect/oauth2',
            apiBase: isProduction
                ? 'https://quickbooks.api.intuit.com/v3/company'
                : 'https://sandbox-quickbooks.api.intuit.com/v3/company'
        };
    }

    static getAuthUrl(organizationId: string): string {
        const { clientId, redirectUri, authUrl } = this.getEnv();
        console.log('[QB] Generating Auth URL...');
        console.log('[QB] Client ID from env:', clientId ? `${clientId.substring(0, 5)}...` : 'undefined');

        const scopes = [
            'com.intuit.quickbooks.accounting',
            'openid',
            'profile',
            'email'
        ];
        const state = `org:${organizationId}`; // Encode org ID in state
        return `${authUrl}?client_id=${clientId}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}&redirect_uri=${encodeURIComponent(redirectUri || '')}&state=${state}`;
    }

    static async exchangeCodeForToken(code: string, realmId: string, organizationId: string) {
        const { clientId, clientSecret, tokenUrl, redirectUri } = this.getEnv();
        const b64Auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${b64Auth}`,
                'Accept': 'application/json'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri || ''
            })
        });

        const data = await response.json();
        if (!response.ok) {
            console.error(`QB Token Exchange Failed: ${data.error_description || data.error}`);
            throw new Error(`QB Token Exchange Failed: ${data.error_description || data.error}`);
        }

        // Manual Upsert to avoid "ON CONFLICT" errors with composite keys
        const { data: existing } = await supabase
            .from('integrations')
            .select('id')
            .eq('provider', 'QUICKBOOKS')
            .eq('organization_id', organizationId)
            .single();

        if (existing) {
            // Update
            const { error: updateError } = await supabase
                .from('integrations')
                .update({
                    access_token: encrypt(data.access_token),
                    refresh_token: encrypt(data.refresh_token),
                    token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
                    refresh_token_expires_at: new Date(Date.now() + data.x_refresh_token_expires_in * 1000).toISOString(),
                    realm_id: realmId,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);

            if (updateError) throw updateError;
        } else {
            // Insert
            const { error: insertError } = await supabase
                .from('integrations')
                .insert({
                    provider: 'QUICKBOOKS',
                    organization_id: organizationId,
                    access_token: encrypt(data.access_token),
                    refresh_token: encrypt(data.refresh_token),
                    token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
                    refresh_token_expires_at: new Date(Date.now() + data.x_refresh_token_expires_in * 1000).toISOString(),
                    realm_id: realmId,
                    updated_at: new Date().toISOString()
                });

            if (insertError) throw insertError;
        }

        return { success: true };
    }

    static async getValidToken(organizationId: string) {
        if (!organizationId) throw new Error('Organization ID required for QuickBooks token retrieval');

        console.log(`[QuickBooks Token] Attempting to fetch integration for organization: ${organizationId}`);

        const { data: qb, error } = await supabase
            .from('integrations')
            .select('*')
            .eq('provider', 'QUICKBOOKS')
            .eq('organization_id', organizationId)
            .single();

        if (error) {
            console.error('[QuickBooks Token] Database lookup failed:', error.message);
            if (error.code === 'PGRST116') {
                throw new Error('QuickBooks is not connected. Please go to Settings → Integrations to link your account.');
            }
            throw new Error(`Database error fetching QuickBooks integration: ${error.message}`);
        }

        if (!qb) {
            console.error('[QuickBooks Token] No integration record found');
            throw new Error('QuickBooks integration not found. Please connect in Settings.');
        }

        // Check if access token exists
        if (!qb.access_token) {
            console.error('[QuickBooks Token] Access token missing from database record');
            throw new Error('QuickBooks access token is missing. Please reconnect in Settings.');
        }

        const now = new Date();
        const expiresAt = new Date(qb.token_expires_at);

        console.log(`[QuickBooks Token] Checking validity. Expires: ${expiresAt.toISOString()}, Now: ${now.toISOString()}`);

        if (now < expiresAt) {
            console.log('[QuickBooks Token] Current access token is valid. Decrypting...');
            try {
                const decryptedToken = decrypt(qb.access_token);
                return { accessToken: decryptedToken, realmId: qb.realm_id };
            } catch (decryptError: any) {
                console.error('[QuickBooks Token] Decryption failed! The encryption key (QB_TOKEN_ENCRYPTION_KEY) may have changed or is missing:', decryptError.message);
                throw new Error(`Failed to decrypt QuickBooks token. This usually happens if the server configuration changed. Please reconnect QuickBooks.`);
            }
        }

        // Token expired — try refresh.
        // Use the in-process lock so that concurrent requests for the same org
        // all await a single refresh call rather than each trying to rotate the
        // token independently (which would invalidate the first rotated token
        // before the second caller could use it).
        console.log('[QuickBooks Token] Access token expired. Attempting refresh using refresh token...');

        if (refreshLocks.has(organizationId)) {
            console.log('[QB Token] Refresh already in-flight for this org — awaiting existing lock...');
            return refreshLocks.get(organizationId)!;
        }

        if (!qb.refresh_token) {
            console.error('[QuickBooks Token] Refresh token missing from database record');
            throw new Error('QuickBooks session expired and no refresh token was found. Please reconnect.');
        }

        // Check if refresh token has also expired
        const refreshExpiresAt = new Date(qb.refresh_token_expires_at);
        if (now > refreshExpiresAt) {
            throw new Error(`QuickBooks refresh token expired on ${refreshExpiresAt.toISOString()}. Please reconnect QuickBooks in Settings → Integrations.`);
        }

        const { clientId, clientSecret, tokenUrl } = this.getEnv();
        const b64Auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        // Decrypt the refresh token to use it
        let decryptedRefreshToken: string;
        try {
            decryptedRefreshToken = decrypt(qb.refresh_token);
        } catch (decryptError: any) {
            console.error('[QB Token] Failed to decrypt refresh token:', decryptError.message);
            throw new Error(`Failed to decrypt QB refresh token: ${decryptError.message}. Reconnect QuickBooks.`);
        }

        const refreshPromise = (async (): Promise<{ accessToken: string; realmId: string }> => {
            try {
                const response = await fetch(tokenUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${b64Auth}`,
                        'Accept': 'application/json'
                    },
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: decryptedRefreshToken
                    })
                });

                const data = await response.json();
                if (!response.ok) {
                    console.error(`[QB Token] Refresh failed:`, data);
                    throw new Error(`QB Token Refresh Failed: ${data.error_description || data.error || 'Unknown error'}. You may need to reconnect QuickBooks.`);
                }

                console.log('[QB Token] Token refreshed successfully');

                // Persist the new tokens immediately so that if this process restarts
                // between now and the next request the DB always holds the latest pair.
                await supabase
                    .from('integrations')
                    .update({
                        access_token: encrypt(data.access_token),
                        refresh_token: encrypt(data.refresh_token),
                        token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
                        refresh_token_expires_at: new Date(Date.now() + data.x_refresh_token_expires_in * 1000).toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('provider', 'QUICKBOOKS')
                    .eq('organization_id', organizationId);

                return { accessToken: data.access_token, realmId: qb.realm_id };
            } finally {
                // Always release the lock — whether the refresh succeeded or failed —
                // so that the next call can retry rather than being stuck forever.
                refreshLocks.delete(organizationId);
            }
        })();

        refreshLocks.set(organizationId, refreshPromise);
        return refreshPromise;
    }

    static async fetchAccounts(organizationId: string) {
        try {
            const { apiBase } = this.getEnv();
            const { accessToken, realmId } = await this.getValidToken(organizationId);
            const query = encodeURIComponent("select * from Account MAXRESULTS 1000");
            const url = `${apiBase}/${realmId}/query?query=${query}&minorversion=70`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            const data = await response.json();
            if (!response.ok) {
                console.error('[QB Fetch Accounts API Error]', JSON.stringify(data));
                throw new Error(`QB API Error: ${JSON.stringify(data)}`);
            }

            return data.QueryResponse.Account || [];
        } catch (error: any) {
            console.warn(`[QB Fetch Accounts] Live fetch failed, falling back to database: ${error.message}`);
            
            // Fallback: Fetch from local accounts table
            const { data: localAccounts, error: dbError } = await supabase
                .from('accounts')
                .select('qb_account_id, name, type, subtype')
                .eq('organization_id', organizationId)
                .not('qb_account_id', 'is', null);

            if (dbError) {
                console.error('[QB Fallback Error] Database query failed:', dbError);
                throw new Error('Failed to fetch accounts from both QuickBooks and local database.');
            }

            if (!localAccounts || localAccounts.length === 0) {
                console.warn('[QB Fallback] No mapped accounts found in database.');
                return [];
            }

            // Transform to QuickBooks format for the frontend
            return localAccounts.map(acc => ({
                Id: acc.qb_account_id,
                Name: acc.name,
                AccountType: acc.subtype || (acc.type === 'ASSET' ? 'Bank' : acc.type === 'LIABILITY' ? 'CreditCard' : 'Expense'),
                Active: true
            }));
        }
    }

    /**
     * Auto-post an INFLOW cashbook entry to QuickBooks the moment it's deterministically
     * categorized (rule engine / product routing), instead of leaving it marked ACCOUNTED
     * locally with no real QB sync. Intended to be called fire-and-forget — QB sync state
     * (qb_sync_status/qb_deposit_id) is the source of truth for whether it actually landed;
     * failures are logged on the entry itself and repairable later, same as any other post.
     * No-ops quietly if the account isn't linked to QuickBooks yet (qb_account_id is null) —
     * the entry just stays PENDING until it's linked, same as before this existed.
     */
    static async autoPostInflowIfLinked(organizationId: string, entryId: string, localAccountId: string, userId: string) {
        if (!localAccountId) return;
        const { data: account } = await supabase
            .from('accounts')
            .select('qb_account_id')
            .eq('id', localAccountId)
            .maybeSingle();

        if (!account?.qb_account_id) return; // Not linked to QB yet — leave PENDING.

        const result = await this.createDeposit(organizationId, entryId, account.qb_account_id, userId);
        if (!result.success) {
            console.warn(`[QB Auto-Post] Failed to auto-post entry ${entryId}:`, result.error);
        }
        return result;
    }

    /**
     * Create a new Account (chart-of-accounts entry) in QuickBooks Online, then
     * mirror the returned QB Id back onto the local `accounts` row so the rest
     * of the app (createDeposit/createLedgerPurchase) can reference it.
     */
    static async createAccount(organizationId: string, localAccountId: string) {
        try {
            const { data: account, error: accError } = await supabase
                .from('accounts')
                .select('id, name, type, subtype, qb_account_id')
                .eq('id', localAccountId)
                .eq('organization_id', organizationId)
                .single();

            if (accError || !account) throw new Error('Local account not found');
            if (account.qb_account_id) {
                console.log(`[QB Create Account] ${account.name} already linked to QB account ${account.qb_account_id}`);
                return { success: true, qbId: account.qb_account_id, alreadyLinked: true };
            }

            const { accessToken, realmId } = await this.getValidToken(organizationId);

            const payload = {
                Name: account.name,
                AccountType: account.type === 'ASSET' ? 'Other Current Asset'
                    : account.type === 'LIABILITY' ? 'Other Current Liability'
                    : account.type === 'EQUITY' ? 'Equity'
                    : account.type === 'INCOME' ? 'Income'
                    : 'Expense'
            };

            const { apiBase } = this.getEnv();
            const response = await fetch(`${apiBase}/${realmId}/account?minorversion=70`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (!response.ok) {
                console.error('[QB Create Account] API Error:', JSON.stringify(result));
                return { success: false, error: result };
            }

            const qbId = result.Account?.Id;
            console.log(`[QB Create Account] ✅ Created "${account.name}" -> QB Id ${qbId}`);

            const { error: updateError } = await supabase
                .from('accounts')
                .update({ qb_account_id: qbId })
                .eq('id', localAccountId);
            if (updateError) console.error('[QB Create Account] Failed to save qb_account_id locally:', updateError.message);

            return { success: true, qbId };
        } catch (error: any) {
            console.error('[QB Create Account] Exception:', error.message);
            return { success: false, error: error.message };
        }
    }

    static async createExpense(
        requisitionId: string,
        userId: string | undefined,
        organizationId: string,
        paymentAccountId?: string,
        paymentAccountName?: string
    ) {
        try {
            console.log(`[QB Purchase] Step 1: Fetching requisition ${requisitionId} with line items`);

            const { data: requisition, error: reqError } = await supabase
                .from('requisitions')
                .select('*, line_items(*, accounts(qb_account_id, name)), disbursements(*), cashbook_entries(*)')
                .eq('id', requisitionId)
                .single();

            if (reqError || !requisition) {
                const msg = `Requisition not found: ${reqError?.message || requisitionId}`;
                console.error(`[QB Expense] ${msg}`);
                throw new Error(msg);
            }

            if (!requisition.line_items || requisition.line_items.length === 0) {
                throw new Error('Requisition has no line items to post as an expense');
            }

            console.log(`[QB Purchase] Step 2: Getting valid QB token for org ${organizationId}`);
            const { accessToken, realmId } = await this.getValidToken(organizationId);

            // Build purchase lines from line_items using the qb_account_id field
            console.log(`[QB Purchase] Step 3: Building purchase object with ${requisition.line_items.length} lines`);

            const expenseLines = requisition.line_items.map((item: any) => {
                const amount = item.actual_amount ?? item.estimated_amount ?? 0;
                
                // Fallback to joined account data if qb_account_id is missing on the line item
                const qbAccountId = item.qb_account_id || item.accounts?.qb_account_id;

                if (!qbAccountId) {
                    throw new Error(`Line item "${item.description}" has no QuickBooks account mapped. Please categorise all items before posting.`);
                }

                return {
                    Description: item.description || 'No description',
                    Amount: Number(amount) || 0,
                    DetailType: "AccountBasedExpenseLineDetail",
                    AccountBasedExpenseLineDetail: {
                        AccountRef: {
                            value: qbAccountId,
                            name: item.accounts?.name || item.description
                        }
                    }
                };
            });

            // Validate total amount is > 0
            const totalAmount = expenseLines.reduce((sum: number, line: any) => sum + line.Amount, 0);
            if (totalAmount <= 0) {
                throw new Error(`Total expense amount is ${totalAmount}. QuickBooks requires a positive amount.`);
            }

            // Step 4: Resolve Source Account (Credit Side)
            let sourceAccountId = paymentAccountId;
            let sourceAccountName = paymentAccountName;

            const method = requisition.payment_method || (requisition.disbursements && requisition.disbursements[0]?.method) || 'UNKNOWN';
            const isWallet = method === 'WALLET' || method === 'MONEYWISE_WALLET';

            // 4a. If it's a wallet transaction, STRICTLY prioritize the mapped account
            if (isWallet) {
                let walletAccountId = '';
                let walletAccountName = '';

                if (requisition.wallet_id) {
                    const { data: wallet } = await supabase
                        .from('organization_wallets')
                        .select('qb_account_id, qb_account_name')
                        .eq('id', requisition.wallet_id)
                        .maybeSingle();
                    
                    if (wallet?.qb_account_id) {
                        walletAccountId = wallet.qb_account_id;
                        walletAccountName = wallet.qb_account_name || 'MoneyWise Subwallet';
                        console.log(`[QB Purchase] Found mapped account on subwallet: ${walletAccountName} (${walletAccountId})`);
                    }
                }

                if (walletAccountId) {
                    sourceAccountId = walletAccountId;
                    sourceAccountName = walletAccountName;
                } else {
                    const { data: qbIntegration } = await supabase
                        .from('integrations')
                        .select('config')
                        .eq('provider', 'QUICKBOOKS')
                        .eq('organization_id', organizationId)
                        .maybeSingle();

                    const mappings = qbIntegration?.config?.mappings || {};
                    let walletMapping = mappings['WALLET'] || mappings['MONEYWISE_WALLET'];

                    // Sanity check: If the mapping exists but doesn't look like a wallet account, ignore it and re-detect
                    if (walletMapping && 
                        !walletMapping.name.toLowerCase().includes('wallet') && 
                        !walletMapping.name.toLowerCase().includes('moneywise')) {
                        console.warn(`[QB Purchase] Existing wallet mapping "${walletMapping.name}" looks incorrect. Re-detecting...`);
                        walletMapping = null;
                    }

                    if (walletMapping) {
                        sourceAccountId = walletMapping.id;
                        sourceAccountName = walletMapping.name;
                        console.log(`[QB Purchase] Locked wallet transaction to mapped account: ${sourceAccountName}`);
                    } else {
                        // Fallback to auto-detection
                        console.log('[QB Purchase] Wallet transaction detected but no valid mapping found, searching QuickBooks accounts...');
                        try {
                            const qbAccounts = await this.fetchAccounts(organizationId);
                            const walletAcc = qbAccounts.find((a: any) => 
                                a.Name.toLowerCase().includes('wallet') || 
                                a.Name.toLowerCase().includes('moneywise')
                            );
                            if (walletAcc) {
                                sourceAccountId = walletAcc.Id;
                                sourceAccountName = walletAcc.Name;
                                console.log(`[QB Purchase] Auto-detected Wallet account: ${sourceAccountName} (${sourceAccountId})`);
                            }
                        } catch (fetchErr) {
                            console.error('[QB Purchase] Failed to fetch accounts for wallet auto-detection:', fetchErr);
                        }
                    }
                }
            }

            // 4b. If not a wallet transaction (or no wallet mapping found) and not provided, try to find in existing mappings
            if (!sourceAccountId) {
                const { data: qbIntegration } = await supabase
                    .from('integrations')
                    .select('config')
                    .eq('provider', 'QUICKBOOKS')
                    .eq('organization_id', organizationId)
                    .single();

                const mappings = qbIntegration?.config?.mappings || {};
                if (mappings[method]) {
                    sourceAccountId = mappings[method].id;
                    sourceAccountName = mappings[method].name;
                    console.log(`[QB Purchase] Found saved mapping for ${method}: ${sourceAccountName}`);
                }
            }

            // 4c. If we have a source account now (especially if it was manually provided), save it to mappings
            if (sourceAccountId && paymentAccountId) {
                console.log(`[QB Purchase] Saving/Updating mapping for ${method} -> ${sourceAccountId}`);
                const { data: currentQB } = await supabase
                    .from('integrations')
                    .select('config')
                    .eq('provider', 'QUICKBOOKS')
                    .eq('organization_id', organizationId)
                    .single();

                const newConfig = {
                    ...(currentQB?.config || {}),
                    mappings: {
                        ...(currentQB?.config?.mappings || {}),
                        [method]: {
                            id: sourceAccountId,
                            name: sourceAccountName
                        }
                    }
                };

                await supabase
                    .from('integrations')
                    .update({ config: newConfig })
                    .eq('provider', 'QUICKBOOKS')
                    .eq('organization_id', organizationId);
            }

            // Final fallback if still not found
            if (!sourceAccountId || sourceAccountId === 'BANK-123') {
                throw new Error(`Please select a payment account in QuickBooks for this ${method} transaction.`);
            }

            // Resolve transaction date: Use Cash Ledger date if available, otherwise first disbursement date, fallback to now
            const cashEntry = requisition.cashbook_entries?.find((e: any) => e.entry_type === 'DISBURSEMENT');
            const disbursementDate = cashEntry?.date 
                || (requisition.disbursements && requisition.disbursements[0]?.issued_at)
                || new Date().toISOString();
            
            const txnDate = new Date(disbursementDate).toISOString().split('T')[0];

            const purchase = {
                AccountRef: {
                    value: sourceAccountId,
                    name: sourceAccountName
                },
                PaymentType: "Cash",
                TxnDate: txnDate,
                Line: expenseLines,
                PrivateNote: `MoneyWise Requisition: ${requisition.reference_number || requisition.id}`
            };

            console.log(`[QB Purchase] Step 4: Sending purchase to QuickBooks API`);
            console.log(`[QB Purchase] Realm: ${realmId}, Lines: ${expenseLines.length}, Total: ${totalAmount}, Source: ${sourceAccountName} (${sourceAccountId})`);

            const { apiBase } = this.getEnv();
            const response = await fetch(`${apiBase}/${realmId}/purchase?minorversion=70`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(purchase)
            });

            const result = await response.json();

            if (!response.ok) {
                console.error(`[QB Purchase] QuickBooks API rejected purchase (HTTP ${response.status}):`, JSON.stringify(result));

                // Log failure to sync_logs
                await supabase.from('sync_logs').insert({
                    requisition_id: requisitionId,
                    synced_by: userId,
                    status: 'FAILED',
                    details: JSON.stringify({ http_status: response.status, error: result })
                });

                await supabase.from('requisitions').update({
                    qb_sync_status: 'FAILED',
                    qb_sync_error: JSON.stringify(result),
                    qb_sync_at: new Date().toISOString()
                }).eq('id', requisitionId);

                return { success: false, error: result };
            }

            console.log(`[QB Purchase] ✅ Purchase created in QuickBooks! ID: ${result.Purchase?.Id}`);

            // Log success
            await supabase.from('sync_logs').insert({
                requisition_id: requisitionId,
                qb_expense_id: result.Purchase.Id,
                synced_by: userId,
                status: 'SUCCESS',
                details: JSON.stringify({ qb_ref: result.Purchase.Id })
            });

            await supabase.from('requisitions').update({
                qb_expense_id: result.Purchase.Id,
                qb_sync_status: 'SUCCESS',
                qb_sync_error: null,
                qb_sync_at: new Date().toISOString()
            }).eq('id', requisitionId);

            return { success: true, qbId: result.Purchase.Id };

        } catch (error: any) {
            console.error('[QB Purchase] Exception:', error.message);

            // Log exception to sync_logs
            try {
                await supabase.from('sync_logs').insert({
                    requisition_id: requisitionId,
                    synced_by: userId,
                    status: 'FAILED',
                    details: JSON.stringify({ error: error.message })
                });

                await supabase.from('requisitions').update({
                    qb_sync_status: 'FAILED',
                    qb_sync_error: error.message,
                    qb_sync_at: new Date().toISOString()
                }).eq('id', requisitionId);
            } catch (logError) {
                console.error('[QB Expense] Failed to log error to database:', logError);
            }

            return { success: false, error: error.message };
        }
    }

    /**
     * Recursively search a QB report's Row tree for the section whose Header
     * names the given account id. The GeneralLedger report groups rows by
     * account TYPE first (e.g. "Banks"), then by individual ACCOUNT within
     * that type, so the target section is usually 1-2 levels deep — this
     * walks arbitrarily deep rather than assuming a fixed nesting depth.
     */
    private static findGLAccountSection(rows: any[], targetId: string): any | null {
        for (const row of rows ?? []) {
            if (row.Header?.ColData?.some((c: any) => c.id === targetId)) return row;
            if (row.Rows?.Row) {
                const found = this.findGLAccountSection(row.Rows.Row, targetId);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Fetch all transactions touching a specific QB account within a date range,
     * as a bank-statement-style list with a running balance.
     *
     * Uses QB's **GeneralLedger** report (not TransactionList — empirically,
     * TransactionList's `account` filter is silently ignored by QB and always
     * returns the whole company's transactions regardless of the account
     * passed). GeneralLedger correctly scopes to one account: it nests rows
     * under a type-group → account section, includes a "Beginning Balance"
     * row, and carries a running balance column per transaction — verified
     * against Twalumbu Education Centre's live QB company (opening + Σamounts
     * reconciles exactly to closing on both a Bank and a Bank-subtype wallet
     * account).
     *
     * @param organizationId  MW org
     * @param qbAccountId     QB account Id (e.g. "63")
     * @param fromDate        ISO date string "YYYY-MM-DD"
     * @param toDate          ISO date string "YYYY-MM-DD"
     */
    static async fetchAccountTransactions(
        organizationId: string,
        qbAccountId: string,
        fromDate: string,
        toDate: string
    ): Promise<{
        accountName: string;
        fromDate: string;
        toDate: string;
        openingBalance: number;
        closingBalance: number;
        transactions: Array<{
            date: string;
            type: string;
            docNum: string;
            name: string;
            memo: string;
            splitAccount: string;
            amount: number;
            balance: number;
        }>;
    }> {
        const { apiBase } = this.getEnv();
        const { accessToken, realmId } = await this.getValidToken(organizationId);

        const params = new URLSearchParams({
            account: qbAccountId,
            start_date: fromDate,
            end_date: toDate,
            minorversion: '70'
        });
        const url = `${apiBase}/${realmId}/reports/GeneralLedger?${params}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        const data = await response.json();
        if (!response.ok) {
            console.error('[QB GeneralLedger] API error', JSON.stringify(data));
            throw new Error(`QB Reports API error: ${JSON.stringify(data?.Fault?.Error?.[0]?.Message ?? data)}`);
        }

        // Resolve column indices dynamically from the report's own metadata —
        // don't hardcode positions, QB can reorder/omit columns between reports.
        const colKeyIdx: Record<string, number> = {};
        (data.Columns?.Column ?? []).forEach((c: any, i: number) => {
            const key = c.MetaData?.[0]?.Value;
            if (key) colKeyIdx[key] = i;
        });
        const idx = {
            date:    colKeyIdx['tx_date']          ?? 0,
            type:    colKeyIdx['txn_type']          ?? 1,
            docNum:  colKeyIdx['doc_num']           ?? 2,
            name:    colKeyIdx['name']              ?? 3,
            memo:    colKeyIdx['memo']               ?? 4,
            split:   colKeyIdx['split_acc']          ?? 5,
            amount:  colKeyIdx['subt_nat_amount']    ?? 6,
            balance: colKeyIdx['rbal_nat_amount']    ?? 7,
        };

        const section = this.findGLAccountSection(data.Rows?.Row ?? [], qbAccountId);
        if (!section) {
            console.warn(`[QB GeneralLedger] No section found for account ${qbAccountId} in ${fromDate}..${toDate} — likely zero activity in range.`);
            const accounts = await this.fetchAccounts(organizationId);
            const account = accounts.find((a: any) => a.Id === qbAccountId);
            return {
                accountName: account?.Name ?? `Account ${qbAccountId}`,
                fromDate, toDate, openingBalance: 0, closingBalance: 0, transactions: []
            };
        }

        const accountName = section.Header?.ColData?.[0]?.value ?? `Account ${qbAccountId}`;
        const dataRows = (section.Rows?.Row ?? []).filter((r: any) => r.type === 'Data');

        const get = (row: any, i: number): string => row.ColData?.[i]?.value?.trim() ?? '';
        const getNum = (row: any, i: number): number => parseFloat(get(row, i).replace(/,/g, '')) || 0;

        let openingBalance = 0;
        const transactions: Array<{ date: string; type: string; docNum: string; name: string; memo: string; splitAccount: string; amount: number; balance: number }> = [];

        for (const row of dataRows) {
            const firstVal = get(row, 0).toLowerCase();
            if (firstVal.includes('beginning balance')) {
                openingBalance = getNum(row, idx.balance);
                continue;
            }
            const txDate = get(row, idx.date);
            if (!/^\d{4}-\d{2}-\d{2}/.test(txDate)) continue; // skip any other summary row

            transactions.push({
                date:         txDate,
                type:         get(row, idx.type),
                docNum:       get(row, idx.docNum),
                name:         get(row, idx.name),
                memo:         get(row, idx.memo),
                splitAccount: get(row, idx.split),
                amount:       getNum(row, idx.amount),
                balance:      getNum(row, idx.balance),
            });
        }

        const closingBalance = transactions.length > 0
            ? transactions[transactions.length - 1].balance
            : openingBalance;

        console.log(`[QB GeneralLedger] ${accountName}: ${transactions.length} txns, bal ${openingBalance}→${closingBalance}`);

        return { accountName, fromDate, toDate, openingBalance, closingBalance, transactions };
    }

    static async createDeposit(organizationId: string, entryId: string, creditAccountId: string, userId: string) {
        console.log(`[QB Deposit] Starting deposit creation for entry ${entryId}`);
        try {
            // 1. Resolve Auth
            const { accessToken, realmId } = await this.getValidToken(organizationId);

            // 2. Fetch Cashbook Entry
            const { data: entry, error: entryError } = await supabase
                .from('cashbook_entries')
                .select('*')
                .eq('id', entryId)
                .single();

            if (entryError || !entry) throw new Error('Cashbook entry not found');

            // 3. Resolve Target Account (MoneyWise Wallet)
            let sourceAccountId = '';
            let sourceAccountName = '';

            if (entry.wallet_id) {
                const { data: wallet } = await supabase
                    .from('organization_wallets')
                    .select('qb_account_id, qb_account_name')
                    .eq('id', entry.wallet_id)
                    .maybeSingle();
                
                if (wallet?.qb_account_id) {
                    sourceAccountId = wallet.qb_account_id;
                    sourceAccountName = wallet.qb_account_name || 'MoneyWise Subwallet';
                    console.log(`[QB Deposit] Found mapped account on subwallet: ${sourceAccountName} (${sourceAccountId})`);
                }
            }

            if (!sourceAccountId) {
                const qbAccounts = await this.fetchAccounts(organizationId);
                const walletAcc = qbAccounts.find((a: any) => 
                    a.Name.toLowerCase().includes('wallet') || 
                    a.Name.toLowerCase().includes('moneywise')
                );

                if (walletAcc) {
                    sourceAccountId = walletAcc.Id;
                    sourceAccountName = walletAcc.Name;
                } else {
                    throw new Error('Could not find MoneyWise Wallet account in QuickBooks.');
                }
            }

            // 4. Construct Deposit
            const deposit = {
                DepositToAccountRef: {
                    value: sourceAccountId,
                    name: sourceAccountName
                },
                TxnDate: new Date(entry.date).toISOString().split('T')[0],
                Line: [
                    {
                        Description: entry.description,
                        Amount: Number(entry.debit),
                        DetailType: "DepositLineDetail",
                        DepositLineDetail: {
                            AccountRef: {
                                value: creditAccountId
                            }
                        }
                    }
                ],
                PrivateNote: `MoneyWise Inflow: ${entry.reference_number || entry.id}`
            };

            const { apiBase } = this.getEnv();
            const response = await fetch(`${apiBase}/${realmId}/deposit?minorversion=70`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(deposit)
            });

            const result = await response.json();

            if (!response.ok) {
                console.error(`[QB Deposit] API Error:`, JSON.stringify(result));
                await supabase.from('cashbook_entries').update({
                    qb_sync_status: 'FAILED',
                    qb_sync_error: JSON.stringify(result),
                    qb_sync_at: new Date().toISOString()
                }).eq('id', entryId);
                return { success: false, error: result };
            }

            console.log(`[QB Deposit] ✅ Created ID: ${result.Deposit?.Id}`);

            const { error: updateError } = await supabase.from('cashbook_entries').update({
                qb_deposit_id: result.Deposit.Id,
                qb_sync_status: 'SUCCESS',
                qb_sync_error: null,
                qb_sync_at: new Date().toISOString(),
                status: 'ACCOUNTED'
            }).eq('id', entryId);

            if (updateError) {
                console.error(`[QB Deposit] ❌ Database update failed:`, updateError);
            }

            return { success: true, qbId: result.Deposit.Id };

        } catch (error: any) {
            console.error('[QB Deposit] Exception:', error.message);
            await supabase.from('cashbook_entries').update({
                qb_sync_status: 'FAILED',
                qb_sync_error: error.message,
                qb_sync_at: new Date().toISOString()
            }).eq('id', entryId);
            return { success: false, error: error.message };
        }
    }

    static async createLedgerPurchase(organizationId: string, entryId: string, debitAccountId: string, userId: string) {
        console.log(`[QB Ledger Purchase] Starting purchase creation for entry ${entryId}`);
        try {
            const { accessToken, realmId } = await this.getValidToken(organizationId);

            const { data: entry, error: entryError } = await supabase
                .from('cashbook_entries')
                .select('*')
                .eq('id', entryId)
                .single();

            if (entryError || !entry) throw new Error('Cashbook entry not found');

            // Source Account is usually Wallet for Fees
            let sourceAccountId = '';
            let sourceAccountName = '';

            if (entry.wallet_id) {
                const { data: wallet } = await supabase
                    .from('organization_wallets')
                    .select('qb_account_id, qb_account_name')
                    .eq('id', entry.wallet_id)
                    .maybeSingle();
                
                if (wallet?.qb_account_id) {
                    sourceAccountId = wallet.qb_account_id;
                    sourceAccountName = wallet.qb_account_name || 'MoneyWise Subwallet';
                    console.log(`[QB Ledger Purchase] Found mapped account on subwallet: ${sourceAccountName} (${sourceAccountId})`);
                }
            }

            if (!sourceAccountId) {
                const qbAccounts = await this.fetchAccounts(organizationId);
                const walletAcc = qbAccounts.find((a: any) => 
                    a.Name.toLowerCase().includes('wallet') || 
                    a.Name.toLowerCase().includes('moneywise')
                );

                if (walletAcc) {
                    sourceAccountId = walletAcc.Id;
                    sourceAccountName = walletAcc.Name;
                } else {
                    throw new Error('Could not find MoneyWise Wallet account in QuickBooks.');
                }
            }

            const purchase = {
                AccountRef: {
                    value: sourceAccountId,
                    name: sourceAccountName
                },
                PaymentType: "Cash",
                TxnDate: new Date(entry.date).toISOString().split('T')[0],
                Line: [
                    {
                        Description: entry.description,
                        Amount: Number(entry.credit || entry.debit), // For adjustments, use whichever is non-zero
                        DetailType: "AccountBasedExpenseLineDetail",
                        AccountBasedExpenseLineDetail: {
                            AccountRef: {
                                value: debitAccountId
                            }
                        }
                    }
                ],
                PrivateNote: `MoneyWise Adjustment/Fee: ${entry.reference_number || entry.id}`
            };

            const { apiBase } = this.getEnv();
            const response = await fetch(`${apiBase}/${realmId}/purchase?minorversion=70`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(purchase)
            });

            const result = await response.json();

            if (!response.ok) {
                console.error(`[QB Ledger Purchase] API Error:`, JSON.stringify(result));
                await supabase.from('cashbook_entries').update({
                    qb_sync_status: 'FAILED',
                    qb_sync_error: JSON.stringify(result),
                    qb_sync_at: new Date().toISOString()
                }).eq('id', entryId);
                return { success: false, error: result };
            }

            console.log(`[QB Ledger Purchase] ✅ Created ID: ${result.Purchase?.Id}`);

            const { error: updateError } = await supabase.from('cashbook_entries').update({
                qb_purchase_id: result.Purchase.Id, // Matches migration 20260425110000
                qb_sync_status: 'SUCCESS',
                qb_sync_error: null,
                qb_sync_at: new Date().toISOString(),
                status: 'ACCOUNTED'
            }).eq('id', entryId);

            if (updateError) {
                console.error(`[QB Ledger Purchase] ❌ Database update failed:`, updateError);
            }

            return { success: true, qbId: result.Purchase.Id };

        } catch (error: any) {
            console.error('[QB Ledger Purchase] Exception:', error.message);
            await supabase.from('cashbook_entries').update({
                qb_sync_status: 'FAILED',
                qb_sync_error: error.message,
                qb_sync_at: new Date().toISOString()
            }).eq('id', entryId);
            return { success: false, error: error.message };
        }
    }

    /**
     * Fetch invoices from QuickBooks for a given date range.
     * Uses the QB Query API (SELECT FROM Invoice) and paginates automatically.
     *
     * @param organizationId  MW org ID (used to resolve the QB token)
     * @param fromDate        YYYY-MM-DD inclusive start date
     * @param toDate          YYYY-MM-DD inclusive end date
     * @param labelFilter     Optional substring to search for in CustomerMemo /
     *                        PrivateNote / line Descriptions (case-insensitive).
     *                        Only invoices that contain this string are returned.
     *                        Pass undefined / empty string to return all invoices.
     */
    static async fetchInvoices(
        organizationId: string,
        fromDate: string,
        toDate: string,
        labelFilter?: string,
    ): Promise<Array<{
        id: string;
        docNumber: string;
        date: string;
        customerName: string;
        customerEmail: string;
        memo: string;
        privateNote: string;
        totalAmt: number;
        balance: number;
        lines: Array<{
            lineNum: number;
            amount: number;
            itemName: string;
            itemId: string;
            description: string;
            qty: number;
            unitPrice: number;
        }>;
    }>> {
        const { accessToken, realmId } = await this.getValidToken(organizationId);
        const { apiBase } = this.getEnv();
        const pageSize = 1000;
        const allInvoices: any[] = [];
        let startPos = 1;

        while (true) {
            const query =
                `SELECT * FROM Invoice ` +
                `WHERE TxnDate >= '${fromDate}' AND TxnDate <= '${toDate}' ` +
                `MAXRESULTS ${pageSize} STARTPOSITION ${startPos}`;

            const url = `${apiBase}/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`[QB fetchInvoices] Query failed (${res.status}): ${txt}`);
            }

            const data = await res.json();
            const batch: any[] = data.QueryResponse?.Invoice ?? [];
            allInvoices.push(...batch);
            if (batch.length < pageSize) break;
            startPos += pageSize;
        }

        // Optionally filter by label appearing in memo/note/line-descriptions
        const label = (labelFilter ?? '').toLowerCase().trim();
        const filtered = label
            ? allInvoices.filter(inv => {
                const memo  = (inv.CustomerMemo?.value ?? '').toLowerCase();
                const priv  = (inv.PrivateNote ?? '').toLowerCase();
                const lines = (inv.Line ?? []).map((l: any) => (l.Description ?? '').toLowerCase()).join(' ');
                return memo.includes(label) || priv.includes(label) || lines.includes(label);
            })
            : allInvoices;

        // Normalise into a clean structure
        return filtered.map(inv => ({
            id         : inv.Id ?? '',
            docNumber  : inv.DocNumber ?? '',
            date       : inv.TxnDate ?? '',
            customerName : inv.CustomerRef?.name ?? '',
            customerEmail: inv.BillEmail?.Address ?? '',
            memo         : inv.CustomerMemo?.value ?? '',
            privateNote  : inv.PrivateNote ?? '',
            totalAmt     : inv.TotalAmt ?? 0,
            balance      : inv.Balance ?? 0,
            lines: (inv.Line ?? [])
                .filter((l: any) => l.DetailType === 'SalesItemLineDetail' && (l.Amount ?? 0) > 0)
                .map((l: any, i: number) => ({
                    lineNum    : l.LineNum ?? i + 1,
                    amount     : l.Amount ?? 0,
                    itemName   : l.SalesItemLineDetail?.ItemRef?.name ?? '',
                    itemId     : l.SalesItemLineDetail?.ItemRef?.value ?? '',
                    description: l.Description ?? '',
                    qty        : l.SalesItemLineDetail?.Qty ?? 1,
                    unitPrice  : l.SalesItemLineDetail?.UnitPrice ?? l.Amount ?? 0,
                })),
        }));
    }
}
