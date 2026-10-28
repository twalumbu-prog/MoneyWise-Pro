import { apiJson } from '../api/apiFetch';

/** Who a pay link pays, how much, and whether it can be paid with a MoneyWise wallet. */
export interface PayTarget {
    kind: 'LINK' | 'QUICK';
    token?: string;
    username?: string;
    status: 'READY' | 'PAID' | 'UNAVAILABLE';
    /** Why it can't be paid here. */
    reason?: string;
    recipient: { orgId: string; name: string; logoUrl: string | null };
    /** Fixed for a payment link; null for a quick link (the payer chooses). */
    amount: number | null;
    amountEditable: boolean;
    purpose: string | null;
    /** The link belongs to the payer's own organization. */
    own: boolean;
    wallets: { id: string; name: string; is_main: boolean; balance: number }[];
}

export interface PayResult {
    status: 'paid' | 'processing';
    requisitionId: string;
    reference: string | null;
    amount: number;
    recipient: string;
}

export const payLinkService = {
    resolve(q: { token?: string; username?: string }): Promise<PayTarget> {
        const params = new URLSearchParams();
        if (q.token) params.set('token', q.token);
        if (q.username) params.set('username', q.username);
        return apiJson(`/pay-links/resolve?${params}`);
    },
    pay(body: { token?: string; username?: string; amount?: number; purpose?: string; walletId?: string }): Promise<PayResult> {
        return apiJson('/pay-links/pay', { method: 'POST', body: JSON.stringify(body) });
    },
};
