import { apiJson } from '../api/apiFetch';

export interface LipilaCardStart { success: boolean; reference: string; redirectUrl: string | null; charged: number; fee: number; alreadyPaid?: boolean }
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

    /** Starts a card deposit into the Card Wallet. Open `redirectUrl` for the customer to enter their card. */
    deposit(amount: number, returnUrl?: string): Promise<LipilaCardStart> {
        return apiJson('/lipila/deposit', { method: 'POST', body: JSON.stringify({ amount, returnUrl }) });
    },

    /** Asks for the result of a card payment (records it the first time it is confirmed). */
    status(reference: string): Promise<LipilaCardOutcome> {
        return apiJson(`/lipila/public/status/${encodeURIComponent(reference)}`);
    },
};
