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
    available: boolean; encryptionReady: boolean; unreadable?: boolean; configured: boolean; enabled: boolean; env: 'sandbox' | 'production';
    cardCurrency?: 'ZMW' | 'USD'; dollarRate?: number | null;
    keyHint: string | null; hasWebhookSecret: boolean; usesDefaultWebhookSecret?: boolean; updatedAt: string | null; webhookUrl: string | null; feeNote: string;
}
export interface LipilaBankOption { name: string; swiftCode: string }
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

    /** The banks Lipila can pay out to, with the exact SWIFT code each one uses. */
    banks(): Promise<{ banks: LipilaBankOption[]; live: boolean }> {
        return apiJson('/lipila/banks');
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

const bankWords = (s: string) => s.toLowerCase().replace(/\b(bank|zambia|limited|ltd|plc|of|the)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The bank on Lipila's list that is the bank the app already has (Lenco's list names them differently: "Standard Chartered Bank Zambia Plc" is
 * "STANDARD CHARTERED" at Lipila). Returns null when it can't tell, and then the person picks it.
 */
export function matchLipilaBank(name: string, banks: LipilaBankOption[]): LipilaBankOption | null {
    const n = bankWords(String(name ?? ''));
    if (!n) return null;
    let best: LipilaBankOption | null = null, bestLen = 0;
    for (const b of banks) {
        const m = bankWords(b.name);
        if (!m) continue;
        if ((n === m || n.includes(m) || m.includes(n)) && m.length > bestLen) { best = b; bestLen = m.length; }
    }
    return best;
}
