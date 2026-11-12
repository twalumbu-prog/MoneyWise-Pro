import { apiJson } from '../api/apiFetch';
import type { MoneyWiseRecipient } from './user.service';

export type TapMode = 'OFF' | 'CONTACTS' | 'EVERYONE';

export interface TapRequest { id: string; code: string; url: string; amount: number | null; note: string | null; kind: 'TAP' | 'LINK'; expiresAt: string }
export interface TapRequestView { code: string; amount: number | null; note: string | null; expiresAt: string; recipient: MoneyWiseRecipient; claimExpiresAt?: string }
export interface TapRequestStatus { id: string; status: 'OPEN' | 'CLAIMED' | 'PAID' | 'EXPIRED' | 'CANCELLED'; amount: number | null; expiresAt: string; payer: string | null; paidAmount: number | null; claimed: boolean }

/** Tap to pay between MoneyWise users: the receiver's setting, their "pay me" requests, and what a payer does with one. */
export const tapService = {
    async getMode(): Promise<TapMode> { return (await apiJson<{ mode: TapMode }>('/tap/settings')).mode; },
    async setMode(mode: TapMode): Promise<TapMode> { return (await apiJson<{ mode: TapMode }>('/tap/settings', { method: 'PUT', body: JSON.stringify({ mode }) })).mode; },

    createRequest(input: { amount?: number; note?: string; kind?: 'TAP' | 'LINK' }): Promise<TapRequest> {
        return apiJson('/tap/requests', { method: 'POST', body: JSON.stringify(input) });
    },
    status(id: string): Promise<TapRequestStatus> { return apiJson(`/tap/requests/${encodeURIComponent(id)}/status`); },
    cancel(id: string): Promise<{ cancelled: boolean }> { return apiJson(`/tap/requests/${encodeURIComponent(id)}/cancel`, { method: 'POST' }); },

    resolve(code: string): Promise<TapRequestView> { return apiJson(`/tap/r/${encodeURIComponent(code)}`); },
    claim(code: string): Promise<TapRequestView> { return apiJson(`/tap/r/${encodeURIComponent(code)}/claim`, { method: 'POST' }); },
    attach(code: string, requisitionId: string): Promise<{ ok: boolean }> {
        return apiJson(`/tap/r/${encodeURIComponent(code)}/attach`, { method: 'POST', body: JSON.stringify({ requisition_id: requisitionId }) });
    },
};

/** Pulls a request code out of whatever was scanned or pasted: a link ending /r/<code>, or the bare code. */
export function parseTapCode(input: string): string | null {
    const s = String(input ?? '').trim();
    const m = s.match(/\/r\/([A-Za-z0-9]{10})(?:[/?#]|$)/) || s.match(/^([A-Za-z0-9]{10})$/);
    return m ? m[1].toUpperCase() : null;
}
