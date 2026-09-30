import { apiFetch } from '../api/apiFetch';

export interface InvestmentTarget {
    id: string;
    organizationId: string;
    walletId: string;
    displayName: string;
    category: string | null;
    description: string | null;
    logoUrl: string | null;
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

    async walletTransfer(sourceWalletId: string, targetId: string, amount: number, description?: string) {
        const response = await apiFetch('/investments/wallet-transfer', {
            method: 'POST',
            body: JSON.stringify({ sourceWalletId, targetId, amount, description }),
        });
        return response.json();
    },

    /** Registers a mobile-money investment before payment so the books can follow it automatically. */
    async recordIntent(reference: string, investmentTargetId: string, amount: number) {
        const response = await apiFetch('/investments/intents', {
            method: 'POST',
            body: JSON.stringify({ reference, investmentTargetId, amount }),
        });
        return response.json();
    },

    /** Asks the server to book a paid investment now instead of waiting for its next sweep. */
    async confirm(reference: string) {
        const response = await apiFetch(`/investments/confirm/${encodeURIComponent(reference)}`, { method: 'POST' });
        return response.json();
    },
};
