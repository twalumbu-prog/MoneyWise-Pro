import { apiFetch } from '../lib/api';

export interface CashbookEntry {
    id: string;
    date: string;
    description: string;
    debit: number;
    credit: number;
    balance_after: number;
    entry_type: 'DISBURSEMENT' | 'RETURN' | 'ADJUSTMENT' | 'OPENING_BALANCE' | 'CLOSING_BALANCE' | 'INFLOW';
    account_type: 'CASH' | 'AIRTEL_MONEY' | 'BANK' | 'MONEYWISE_WALLET';
    requisition_id?: string;
    created_by?: string;
    status?: 'PENDING' | 'COMPLETED' | 'ACCOUNTED' | 'UNACCOUNTED';
    reference_number?: string;
    account_id?: string;
    external_reference?: string;
    organization_id?: string;
    accounts?: { id: string; name: string; code: string };
    qb_sync_status?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
    qb_sync_error?: string;
    qb_sync_at?: string;
    qb_purchase_id?: string;
    qb_deposit_id?: string;
    requisitions?: {
        id: string;
        reference_number: string;
        status: string;
        description: string;
        actual_total: number;
        requestor: { name: string };
        disbursements: any[];
        type?: string;
        department?: string;
        audit_score?: number;
        qb_sync_status?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
        qb_sync_error?: string;
        qb_sync_at?: string;
        line_items?: Array<{
            id: string;
            description: string;
            quantity: number;
            unit_price: number;
            estimated_amount: number;
            actual_amount?: number;
            account_id?: string;
            accounts?: {
                id: string;
                code: string;
                name: string;
            };
        }>;
    };
    users?: { name: string };
}

export interface CashbookSummary {
    openingBalance: number;
    totalReceipts: number;
    totalPayments: number;
    closingBalance: number;
    netMovement: number;
}

export const cashbookService = {
    async getEntries(filters?: {
        startDate?: string;
        endDate?: string;
        entryType?: string;
        accountType?: string;
        walletId?: string;
        limit?: number;
    }) {
        const params = new URLSearchParams();

        if (filters?.startDate) params.append('startDate', filters.startDate);
        if (filters?.endDate) params.append('endDate', filters.endDate);
        if (filters?.entryType) params.append('entryType', filters.entryType);
        if (filters?.accountType) params.append('accountType', filters.accountType);
        if (filters?.walletId) params.append('walletId', filters.walletId);
        if (filters?.limit) params.append('limit', filters.limit.toString());

        const response = await apiFetch(`/cashbook?${params.toString()}`);
        return response.json();
    },

    async getBalance(accountType: string = 'CASH', organizationId?: string, walletId?: string) {
        const params = new URLSearchParams({ accountType });
        if (organizationId) params.append('organizationId', organizationId);
        if (walletId) params.append('walletId', walletId);

        const response = await apiFetch(`/cashbook/balance?${params.toString()}`);
        const data = await response.json();
        return data.balance;
    },


    async getSummary(startDate: string, endDate: string, accountType: string = 'CASH', walletId?: string) {
        const params = new URLSearchParams({ startDate, endDate, accountType });
        if (walletId) params.append('walletId', walletId);
        const response = await apiFetch(`/cashbook/summary?${params.toString()}`);
        return response.json();
    },

    async reconcile(physicalCount: number, denominations?: any, notes?: string, accountType: string = 'CASH') {
        const response = await apiFetch('/cashbook/reconcile', {
            method: 'POST',
            body: JSON.stringify({ physicalCount, denominations, notes, accountType }),
        });
        return response.json();
    },

    async returnCash(requisitionId: string, amount: number, description?: string) {
        const response = await apiFetch('/cashbook/return', {
            method: 'POST',
            body: JSON.stringify({ requisitionId, amount, description }),
        });
        return response.json();
    },

    async closeBook(physicalCount: number, date: string, notes?: string, accountType: string = 'CASH', walletId?: string) {
        const response = await apiFetch('/cashbook/close', {
            method: 'POST',
            body: JSON.stringify({ physicalCount, date, notes, accountType, walletId }),
        });
        return response.json();
    },

    async logInflow(data: {
        personName: string;
        purpose: string;
        contactDetails: string;
        date: string;
        amount: number;
        denominations: any;
        accountType?: string;
    }) {
        const response = await apiFetch('/cashbook/inflow', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return response.json();
    },

    async logWalletDepositIntent(reference: string, purpose: string, amount: number, walletId?: string) {
        const response = await apiFetch('/cashbook/wallet-deposit-intent', {
            method: 'POST',
            body: JSON.stringify({ reference, purpose, amount, walletId }),
        });
        return response.json();
    },

    async classifyBulk(requisitionIds?: string[]) {
        const response = await apiFetch('/cashbook/classify-bulk', {
            method: 'POST',
            body: JSON.stringify({ requisitionIds }),
        });
        return response.json();
    },

    async postToQuickBooks(entryId: string, accountId: string) {
        const response = await apiFetch('/cashbook/post-to-qb', {
            method: 'POST',
            body: JSON.stringify({ entryId, accountId }),
        });
        return response.json();
    },

    async updateAccount(entryId: string, accountId: string) {
        const response = await apiFetch(`/cashbook/${entryId}/account`, {
            method: 'PATCH',
            body: JSON.stringify({ accountId }),
        });
        return response.json();
    },

    async narrateEntry(entryId: string, description: string, accountId?: string) {
        const response = await apiFetch(`/cashbook/${entryId}/narrate`, {
            method: 'PATCH',
            body: JSON.stringify({ description, accountId }),
        });
        return response.json();
    },

    async getWallets() {
        const response = await apiFetch('/cashbook/wallets');
        return response.json();
    },

    async createWallet(name: string, qbAccountId?: string, qbAccountName?: string) {
        const response = await apiFetch('/cashbook/wallets', {
            method: 'POST',
            body: JSON.stringify({ name, qbAccountId, qbAccountName }),
        });
        return response.json();
    },

    async transfer(sourceWalletId: string, destinationWalletId: string, amount: number, description?: string) {
        const response = await apiFetch('/cashbook/wallets/transfer', {
            method: 'POST',
            body: JSON.stringify({ sourceWalletId, destinationWalletId, amount, description }),
        });
        return response.json();
    }
};
