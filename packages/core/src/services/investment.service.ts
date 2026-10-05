import { apiFetch, apiJson } from '../api/apiFetch';
import type { IdExtraction } from '../reference/investorOnboarding';

export interface InvestmentTarget {
    id: string;
    organizationId: string;
    walletId: string;
    displayName: string;
    category: string | null;
    description: string | null;
    logoUrl: string | null;
    /** Links this company to a catalog provider in the app (e.g. 'longhorn'). */
    providerKey: string | null;
    requiresAccount: boolean;
    /** Names offered in the application's "Sales Person" picker. */
    salesPeople: string[];
    factSheetUrl: string | null;
}

export type InvestorAccountStatus = 'PENDING_REVIEW' | 'INFO_REQUESTED' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';

/** The caller's account / application with one company. */
export interface MyInvestorAccount {
    id: string;
    targetId: string;
    source: 'REGISTERED' | 'CONNECTED';
    status: InvestorAccountStatus;
    accountNumber: string | null;
    reviewNote: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface InvestorApplicationSummary {
    id: string;
    source: 'REGISTERED' | 'CONNECTED';
    status: InvestorAccountStatus;
    accountNumber: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    hasPdf: boolean;
    emailSent: boolean;
    emailError: string | null;
    reviewNote: string | null;
    reviewedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface InvestorApplicationDetail extends Omit<InvestorApplicationSummary, 'name' | 'email' | 'phone' | 'hasPdf' | 'emailSent'> {
    applicant: Record<string, string> | null;
    documents: Record<string, { label: string; url: string | null }>;
    pdfUrl: string | null;
    declarationAcceptedAt: string | null;
    emailSentAt: string | null;
    investments: { id: string; reference: string; method: string; amount_paid: number; amount_received: number | null; status: string; product_name: string | null; created_at: string }[];
}

export interface PayoutSettings {
    isInvestmentCompany: boolean;
    bankName: string | null;
    branch: string | null;
    accountNumber: string | null;
    accountName: string | null;
    forwardDeposits: boolean;
    proofOfPaymentEmail: string | null;
}

/**
 * Real (non-demo) investment targets — organizations that can receive actual
 * money through the Invest feature, via mobile money (existing wallet-scoped
 * Lenco collection, see lencoService) or an internal MoneyWise wallet
 * transfer (walletTransfer below).
 */
export const investmentService = {
    async getTargets(): Promise<InvestmentTarget[]> {
        const response = await apiFetch('/investments/targets');
        return response.json();
    },

    async walletTransfer(sourceWalletId: string, targetId: string, amount: number, description?: string, productName?: string) {
        const response = await apiFetch('/investments/wallet-transfer', {
            method: 'POST',
            body: JSON.stringify({ sourceWalletId, targetId, amount, description, productName }),
        });
        return response.json();
    },

    /** Registers a mobile-money investment before payment so the books can follow it automatically. */
    async recordIntent(reference: string, investmentTargetId: string, amount: number, productName?: string) {
        const response = await apiFetch('/investments/intents', {
            method: 'POST',
            body: JSON.stringify({ reference, investmentTargetId, amount, productName }),
        });
        return response.json();
    },

    /** Asks the server to book a paid investment now instead of waiting for its next sweep. */
    async confirm(reference: string) {
        const response = await apiFetch(`/investments/confirm/${encodeURIComponent(reference)}`, { method: 'POST' });
        return response.json();
    },

    // ── Investor accounts ────────────────────────────────────────────────────

    /** The caller's account or application with each company they have approached. */
    getMyAccounts(): Promise<MyInvestorAccount[]> {
        return apiJson<MyInvestorAccount[]>('/investments/my-accounts');
    },

    /** Links an account number the investor already holds with the company. */
    connectAccount(targetId: string, accountNumber: string): Promise<MyInvestorAccount> {
        return apiJson('/investments/accounts/connect', { method: 'POST', body: JSON.stringify({ targetId, accountNumber }) });
    },

    /** Submits the onboarding application (the API builds the PDF and emails the company). */
    applyForAccount(payload: { targetId: string; applicant: Record<string, string>; documents: Record<string, string>; declaration: boolean }): Promise<MyInvestorAccount> {
        return apiJson('/investments/accounts/apply', { method: 'POST', body: JSON.stringify(payload) });
    },

    /** Has the server's AI read an uploaded ID (already in storage) and return what it could extract. */
    extractIdDetails(path: string, idType: string): Promise<IdExtraction> {
        return apiJson('/investments/accounts/extract-id', { method: 'POST', body: JSON.stringify({ path, idType }) });
    },

    // Company side (CRM → Investors)
    listApplications(status?: string): Promise<InvestorApplicationSummary[]> {
        return apiJson(`/investments/applications${status ? `?status=${encodeURIComponent(status)}` : ''}`);
    },
    getApplication(id: string): Promise<InvestorApplicationDetail> {
        return apiJson(`/investments/applications/${id}`);
    },
    reviewApplication(id: string, body: { status: InvestorAccountStatus; accountNumber?: string; note?: string }) {
        return apiJson(`/investments/applications/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    },
    getPayoutSettings(): Promise<PayoutSettings> {
        return apiJson('/investments/payout-settings');
    },
    savePayoutSettings(body: { bankName: string; branch?: string; accountNumber: string; accountName?: string; forwardDeposits: boolean }): Promise<PayoutSettings> {
        return apiJson('/investments/payout-settings', { method: 'PUT', body: JSON.stringify(body) });
    },
};
