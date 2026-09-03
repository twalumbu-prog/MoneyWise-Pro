import { apiJson } from '../api/apiFetch';

export const lencoService = {
    getAccounts(): Promise<any> {
        return apiJson('/lenco/accounts');
    },

    provisionOrganizationSubaccount(organizationId: string): Promise<any> {
        return apiJson(`/lenco/organizations/${organizationId}/provision`, { method: 'POST' });
    },

    getAvailableAccounts(): Promise<any> {
        return apiJson('/lenco/available-accounts');
    },

    linkOrganizationSubaccount(organizationId: string, lencoSubaccountId: string): Promise<any> {
        return apiJson(`/lenco/organizations/${organizationId}/link`, {
            method: 'POST',
            body: JSON.stringify({ lenco_subaccount_id: lencoSubaccountId }),
        });
    },

    verifyStatus(reference: string, transactionId?: string, organizationId?: string): Promise<any> {
        const params = new URLSearchParams();
        if (transactionId) params.append('transactionId', transactionId);
        if (organizationId) params.append('organizationId', organizationId);
        const qs = params.toString();
        return apiJson(`/lenco/verify-status/${reference}${qs ? `?${qs}` : ''}`);
    },

    getReconciliationSummary(organizationId: string): Promise<any> {
        return apiJson(`/lenco/reconcile/${organizationId}`);
    },

    getBanks(): Promise<any> {
        return apiJson('/lenco/banks');
    },

    resolveBankAccount(accountNumber: string, bankId: string, organizationId?: string): Promise<any> {
        // x-organization-id lets the public pay portal resolve against a specific
        // merchant's Lenco credentials while unauthenticated.
        return apiJson('/lenco/resolve-bank', {
            method: 'POST',
            headers: organizationId ? { 'x-organization-id': organizationId } : {},
            body: JSON.stringify({ accountNumber, bankId }),
        });
    },

    resolveMobileMoney(phone: string, operator: string, organizationId?: string): Promise<any> {
        return apiJson('/lenco/resolve-momo', {
            method: 'POST',
            headers: organizationId ? { 'x-organization-id': organizationId } : {},
            body: JSON.stringify({ phone, operator }),
        });
    },

    verifyDisbursementStatus(requisitionId: string): Promise<any> {
        return apiJson(`/requisitions/${requisitionId}/verify-disbursement`);
    },

    /**
     * The own-UX mobile-money checkout used by QuickPay/PublicPaymentLink —
     * server-initiates the Lenco collection directly rather than opening
     * Lenco's JS checkout widget (browser-only, no native equivalent).
     * Wallet-scoped, not auth-scoped (`initiatePublicMobileMoneyCollection`
     * resolves the organization from `walletId` itself), so it's exactly as
     * safe to call authenticated with the caller's own wallet as it is
     * unauthenticated from the public payment portal.
     */
    initiateMobileMoneyCollection(params: {
        reference: string; amount: number; phone: string; operator: string; walletId: string;
    }): Promise<{ success: boolean; data: { status: string } }> {
        return apiJson('/lenco/public-collection/mobile-money', {
            method: 'POST',
            body: JSON.stringify(params),
        });
    },

    /** Server-held long-poll (holds up to ~22s) — call in a loop until `verified`. */
    longPollCollectionStatus(reference: string, organizationId: string): Promise<{
        verified: boolean; status?: string; completedAt?: string; initiatedAt?: string; referenceNumber?: string;
    }> {
        return apiJson(`/lenco/public-collection-longpoll/${reference}?organizationId=${organizationId}`);
    },

    /** Idempotent — writes the ledger entry once Lenco has confirmed the collection. */
    finalizeCollection(reference: string, organizationId: string): Promise<any> {
        return apiJson(`/lenco/public-collection-finalize/${reference}?organizationId=${organizationId}`, { method: 'POST' });
    },

    cancelCollection(reference: string): Promise<any> {
        return apiJson('/lenco/public-collection/cancel', {
            method: 'POST',
            body: JSON.stringify({ reference }),
        });
    },

    getSaleReceiptDetails(entryId: string): Promise<any> {
        return apiJson(`/lenco/sale-receipt/${entryId}`);
    },

    /**
     * Estimated payout fee, from the Lenco V2 actuals for Zambia. Pure
     * arithmetic — no network — so it works offline and in the native app
     * unchanged.
     */
    calculatePayoutFee(amount: number, _type: 'MOBILE_MONEY' | 'BANK' | string): number {
        if (amount <= 150) return 8.50;
        if (amount <= 300) return 10.00;
        if (amount <= 501) return 11.00;
        if (amount <= 1000) return 12.00;
        if (amount <= 3000) return 15.00;
        if (amount <= 5000) return 18.00;
        return 20.00;
    },
};
