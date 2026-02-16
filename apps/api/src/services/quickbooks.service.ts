import { supabase } from '../lib/supabase';
import { encrypt, decrypt } from '../utils/security.utils';

const QB_CLIENT_ID = process.env.QB_CLIENT_ID;
const QB_CLIENT_SECRET = process.env.QB_CLIENT_SECRET;
const QB_REDIRECT_URI = process.env.QB_REDIRECT_URI;
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QB_API_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company'; // Use sandbox for now

export class QuickBooksService {
    static getAuthUrl(): string {
        const scopes = [
            'com.intuit.quickbooks.accounting',
            'openid',
            'profile',
            'email'
        ];
        return `${QB_AUTH_URL}?client_id=${QB_CLIENT_ID}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}&redirect_uri=${encodeURIComponent(QB_REDIRECT_URI || '')}&state=setup`;
    }

    static async exchangeCodeForToken(code: string, realmId: string) {
        const b64Auth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64');

        const response = await fetch(QB_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${b64Auth}`,
                'Accept': 'application/json'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: QB_REDIRECT_URI || ''
            })
        });

        const data = await response.json();
        if (!response.ok) {
            // Log error message only, not the full object which might contain sensitive info derived from context
            console.error(`QB Token Exchange Failed: ${data.error_description || data.error}`);
            throw new Error(`QB Token Exchange Failed: ${data.error_description || data.error}`);
        }

        // Save to database with ENCRYPTION
        const { error } = await supabase
            .from('integrations')
            .upsert({
                provider: 'QUICKBOOKS',
                access_token: encrypt(data.access_token),
                refresh_token: encrypt(data.refresh_token),
                token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
                refresh_token_expires_at: new Date(Date.now() + data.x_refresh_token_expires_in * 1000).toISOString(),
                realm_id: realmId,
                updated_at: new Date().toISOString()
            }, { onConflict: 'provider' });

        if (error) throw error;
        return { success: true };
    }

    static async getValidToken() {
        const { data: qb, error } = await supabase
            .from('integrations')
            .select('*')
            .eq('provider', 'QUICKBOOKS')
            .single();

        if (error || !qb) throw new Error('QuickBooks not integrated');

        const now = new Date();
        const expiresAt = new Date(qb.token_expires_at);

        if (now < expiresAt) {
            return {
                accessToken: decrypt(qb.access_token),
                realmId: qb.realm_id
            };
        }

        // Refresh token
        console.log('[QB] Refreshing token...');
        const b64Auth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64');

        // Decrypt the refresh token to use it
        const decryptedRefreshToken = decrypt(qb.refresh_token);

        const response = await fetch(QB_TOKEN_URL, {
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
            console.error(`QB Token Refresh Failed: ${data.error_description || data.error}`);
            throw new Error(`QB Token Refresh Failed`);
        }

        await supabase
            .from('integrations')
            .update({
                access_token: encrypt(data.access_token),
                refresh_token: encrypt(data.refresh_token),
                token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
                refresh_token_expires_at: new Date(Date.now() + data.x_refresh_token_expires_in * 1000).toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('provider', 'QUICKBOOKS');

        return { accessToken: data.access_token, realmId: qb.realm_id };
    }

    static async fetchAccounts() {
        const { accessToken, realmId } = await this.getValidToken();
        const query = encodeURIComponent("select * from Account MAXRESULTS 1000");
        const url = `${QB_API_BASE}/${realmId}/query?query=${query}&minorversion=70`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        const data = await response.json();
        if (!response.ok) throw new Error(`QB Fetch Accounts Failed`);

        return data.QueryResponse.Account || [];
    }

    static async createExpense(requisitionId: string, userId?: string) {
        try {
            const { data: requisition, error: reqError } = await supabase
                .from('requisitions')
                .select('*, line_items(*, accounts(*)), disbursements(*)')
                .eq('id', requisitionId)
                .single();

            if (reqError || !requisition) throw new Error('Requisition not found');

            const { accessToken, realmId } = await this.getValidToken();

            // Prepare QuickBooks Expense object
            // For simplicity, we'll create a single expense with multiple lines
            const expense = {
                AccountRef: {
                    value: "35", // Placeholder: Main Petty Cash account in QB
                    name: "Petty Cash"
                },
                PaymentType: "Cash",
                TxnDate: new Date().toISOString().split('T')[0],
                Line: requisition.line_items.map((item: any) => ({
                    Description: item.description,
                    Amount: item.actual_amount || item.estimated_amount,
                    DetailType: "AccountBasedExpenseLineDetail",
                    AccountBasedExpenseLineDetail: {
                        AccountRef: {
                            value: item.accounts?.qb_account_id || "1", // Use mapped ID or default
                            name: item.accounts?.name
                        }
                    }
                })),
                PrivateNote: `AutoCash Requisition: ${requisition.reference_number || requisition.id}`
            };

            const response = await fetch(`${QB_API_BASE}/${realmId}/expense?minorversion=70`, {
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
                // Log failure to sync_logs
                await supabase.from('sync_logs').insert({
                    requisition_id: requisitionId,
                    synced_by: userId,
                    status: 'FAILED',
                    details: JSON.stringify({ error: result }) // Careful with what's logged here
                });

                await supabase.from('requisitions').update({
                    qb_sync_status: 'FAILED',
                    qb_sync_error: JSON.stringify(result),
                    qb_sync_at: new Date().toISOString()
                }).eq('id', requisitionId);
                return { success: false, error: result };
            }

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
            console.error('[QB Sync Error]', error.message);

            // Log exception to sync_logs
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
            return { success: false, error: error.message };
        }
    }
}
