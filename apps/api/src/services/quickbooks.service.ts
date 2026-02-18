import { supabase } from '../lib/supabase';
import { encrypt, decrypt } from '../utils/security.utils';


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
        if (!organizationId) throw new Error('Organization ID required for QB token');

        console.log(`[QB Token] Fetching integration for org: ${organizationId}`);

        const { data: qb, error } = await supabase
            .from('integrations')
            .select('*')
            .eq('provider', 'QUICKBOOKS')
            .eq('organization_id', organizationId)
            .single();

        if (error || !qb) {
            console.error('[QB Token] Integration not found:', error?.message);
            throw new Error('QuickBooks not integrated for this organization. Go to Settings → Integrations to connect.');
        }

        // Check if access token exists
        if (!qb.access_token) {
            throw new Error('QuickBooks access token is missing. Please reconnect QuickBooks in Settings → Integrations.');
        }

        const now = new Date();
        const expiresAt = new Date(qb.token_expires_at);

        console.log(`[QB Token] Token expires at: ${expiresAt.toISOString()}, now: ${now.toISOString()}`);

        if (now < expiresAt) {
            console.log('[QB Token] Access token is still valid, decrypting...');
            try {
                const decryptedToken = decrypt(qb.access_token);
                return { accessToken: decryptedToken, realmId: qb.realm_id };
            } catch (decryptError: any) {
                console.error('[QB Token] Failed to decrypt access token:', decryptError.message);
                throw new Error(`Failed to decrypt QB access token: ${decryptError.message}. The encryption key may have changed. Reconnect QuickBooks.`);
            }
        }

        // Token expired — try refresh
        console.log('[QB Token] Access token expired, refreshing...');

        if (!qb.refresh_token) {
            throw new Error('QuickBooks refresh token is missing. Please reconnect QuickBooks in Settings → Integrations.');
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

        // Store refreshed tokens (encrypted)
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
    }

    static async fetchAccounts(organizationId: string) {
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
            console.error('[QB Fetch Accounts Error]', JSON.stringify(data));
            throw new Error(`QB Fetch Accounts Failed: ${JSON.stringify(data)}`);
        }

        return data.QueryResponse.Account || [];
    }

    static async createExpense(
        requisitionId: string,
        userId: string | undefined,
        organizationId: string,
        paymentAccountId?: string,
        paymentAccountName?: string
    ) {
        try {
            console.log(`[QB Expense] Step 1: Fetching requisition ${requisitionId} with line items`);

            const { data: requisition, error: reqError } = await supabase
                .from('requisitions')
                .select('*, line_items(*), disbursements(*)')
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

            console.log(`[QB Expense] Step 2: Getting valid QB token for org ${organizationId}`);
            const { accessToken, realmId } = await this.getValidToken(organizationId);

            // Build expense lines from line_items using the qb_account_id field
            console.log(`[QB Expense] Step 3: Building expense object with ${requisition.line_items.length} lines`);

            const expenseLines = requisition.line_items.map((item: any) => {
                const amount = item.actual_amount || item.estimated_amount;
                const qbAccountId = item.qb_account_id;

                if (!qbAccountId) {
                    console.warn(`[QB Expense] Line item ${item.id} has no qb_account_id, using default "1"`);
                }

                return {
                    Description: item.description || 'No description',
                    Amount: Number(amount) || 0,
                    DetailType: "AccountBasedExpenseLineDetail",
                    AccountBasedExpenseLineDetail: {
                        AccountRef: {
                            value: qbAccountId || "1",
                            name: item.qb_account_name || item.description
                        }
                    }
                };
            });

            // Validate total amount is > 0
            const totalAmount = expenseLines.reduce((sum: number, line: any) => sum + line.Amount, 0);
            if (totalAmount <= 0) {
                throw new Error(`Total expense amount is ${totalAmount}. QuickBooks requires a positive amount.`);
            }

            // Use provided payment account or default to "35" if absolutely not provided (as fallback)
            const sourceAccountId = paymentAccountId || "35";
            const sourceAccountName = paymentAccountName || "Petty Cash";

            const expense = {
                AccountRef: {
                    value: sourceAccountId,
                    name: sourceAccountName
                },
                PaymentType: "Cash",
                TxnDate: new Date().toISOString().split('T')[0],
                Line: expenseLines,
                PrivateNote: `MoneyWise Requisition: ${requisition.reference_number || requisition.id}`
            };

            console.log(`[QB Expense] Step 4: Sending expense to QuickBooks API`);
            console.log(`[QB Expense] Realm: ${realmId}, Lines: ${expenseLines.length}, Total: ${totalAmount}, Source: ${sourceAccountName} (${sourceAccountId})`);

            const { apiBase } = this.getEnv();
            const response = await fetch(`${apiBase}/${realmId}/expense?minorversion=70`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(expense)
            });

            const result = await response.json();

            if (!response.ok) {
                console.error(`[QB Expense] QuickBooks API rejected expense (HTTP ${response.status}):`, JSON.stringify(result));

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

            console.log(`[QB Expense] ✅ Expense created in QuickBooks! ID: ${result.Expense?.Id}`);

            // Log success
            await supabase.from('sync_logs').insert({
                requisition_id: requisitionId,
                qb_expense_id: result.Expense.Id,
                synced_by: userId,
                status: 'SUCCESS',
                details: JSON.stringify({ qb_ref: result.Expense.Id })
            });

            await supabase.from('requisitions').update({
                qb_expense_id: result.Expense.Id,
                qb_sync_status: 'SUCCESS',
                qb_sync_error: null,
                qb_sync_at: new Date().toISOString()
            }).eq('id', requisitionId);

            return { success: true, qbId: result.Expense.Id };

        } catch (error: any) {
            console.error('[QB Expense] Exception:', error.message);

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
}
