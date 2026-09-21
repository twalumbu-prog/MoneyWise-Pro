import { apiFetch, apiJson } from '../api/apiFetch';
import { isApiError } from '../api/ApiError';

export interface Account {
    id: string;
    code: string;
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
    subtype?: string;
    description: string;
    is_active: boolean;
    organization_id?: string;
    qb_account_id?: string;
}

/**
 * The accounts endpoints answer failures with `{ error }` OR `{ details }` —
 * `details` carries the Postgres/QuickBooks text that actually says what went
 * wrong. apiFetch only surfaces `error`, so preserve the original preference
 * order rather than losing the useful half of the message.
 */
function withDetails(err: unknown, fallback: string): Error {
    if (isApiError(err)) {
        const body = err.data;
        return new Error(body?.error || body?.details || err.message || fallback);
    }
    return err instanceof Error ? err : new Error(fallback);
}

export const accountService = {
    getAll(): Promise<Account[]> {
        return apiJson<Account[]>('/accounts');
    },

    async create(data: Partial<Account>): Promise<Account> {
        try {
            return await apiJson<Account>('/accounts', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        } catch (err) {
            throw withDetails(err, 'Failed to create account');
        }
    },

    async update(id: string, data: Partial<Account> & { qb_account_id?: string }): Promise<void> {
        try {
            await apiFetch(`/accounts/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
        } catch (err) {
            throw withDetails(err, 'Failed to update account');
        }
    },

    importFromQuickBooks(): Promise<{ imported?: number;[k: string]: any }> {
        return apiJson('/accounts/import', { method: 'POST' });
    },

    suggestAccount(description: string, amount?: number): Promise<any> {
        return apiJson('/accounts/suggest', {
            method: 'POST',
            body: JSON.stringify({ description, amount: amount || 0 }),
        });
    },

    suggestBatch(lineItems: any[], requisitionId?: string, accounts?: any[]): Promise<any> {
        return apiJson('/accounts/suggest', {
            method: 'POST',
            headers: { Accept: 'application/json' },
            body: JSON.stringify({
                line_items: lineItems,
                requisition_id: requisitionId,
                accounts,
            }),
        });
    },
};
