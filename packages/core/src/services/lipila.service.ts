import { apiJson } from '../api/apiFetch';

export interface LipilaCardStart { success: boolean; reference: string; redirectUrl: string | null; charged: number; fee: number; alreadyPaid?: boolean }
export interface LipilaWalletSummary {
    connected: boolean; env: string | null; balance: number | null; booked: number | null; currency: string; recordedSales: number; fetchedAt: string; error: string | null;
}
export interface LipilaCardPayment {
    reference: string; status: string; net: number; charged: number; fee: number; customer: string | null; phone: string | null; source: string | null;
    reason: string | null; problem: string | null; startedAt: string; finishedAt: string | null;
}
export interface LipilaSettingsView {
    available: boolean; encryptionReady: boolean; configured: boolean; enabled: boolean; env: 'sandbox' | 'production';
    cardCurrency?: 'ZMW' | 'USD'; dollarRate?: number | null;
    keyHint: string | null; hasWebhookSecret: boolean; updatedAt: string | null; webhookUrl: string | null; feeNote: string;
}
export interface LipilaCardOutcome { verified: boolean; status: string; message?: string; referenceNumber?: string | null }

/** Card payments (Lipila): the money lands in the business's Card Wallet. */
export const lipilaService = {
    /** True when this business has card payments connected and switched on. */
    async cardsAvailable(): Promise<boolean> {
        try {
            const s: any = await apiJson('/lipila/settings');
            return !!(s && s.available && s.enabled);
        } catch {
            return false;
        }
    },

    /** The business's saved card settings (the key itself is never returned). */
    settings(): Promise<LipilaSettingsView> {
        return apiJson('/lipila/settings');
    },

    saveSettings(input: { apiKey?: string; webhookSecret?: string; env?: 'sandbox' | 'production'; enabled?: boolean; cardCurrency?: 'ZMW' | 'USD' }): Promise<LipilaSettingsView> {
        return apiJson('/lipila/settings', { method: 'PUT', body: JSON.stringify(input) });
    },

    testSettings(): Promise<{ ok: boolean; message: string }> {
        return apiJson('/lipila/settings/test', { method: 'POST' });
    },

    removeSettings(): Promise<unknown> {
        return apiJson('/lipila/settings', { method: 'DELETE' });
    },

    /** The Card Wallet: Lipila's own balance and what MoneyWise has recorded against it. Finance roles only. */
    wallet(): Promise<LipilaWalletSummary> {
        return apiJson('/lipila/wallet');
    },

    /** Every card payment started for this business, newest first (including declined and waiting ones). */
    cardPayments(limit = 50): Promise<{ payments: LipilaCardPayment[] }> {
        return apiJson(`/lipila/card-payments?limit=${limit}`);
    },

    /** Starts a card deposit into the Card Wallet. Open `redirectUrl` for the customer to enter their card. */
    deposit(amount: number, returnUrl?: string): Promise<LipilaCardStart> {
        return apiJson('/lipila/deposit', { method: 'POST', body: JSON.stringify({ amount, returnUrl }) });
    },

    /** Asks for the result of a card payment (records it the first time it is confirmed). */
    status(reference: string): Promise<LipilaCardOutcome> {
        return apiJson(`/lipila/public/status/${encodeURIComponent(reference)}`);
    },
};
