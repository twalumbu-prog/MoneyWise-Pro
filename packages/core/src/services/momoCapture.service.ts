import { apiJson } from '../api/apiFetch';

/** Mobile money capture — MoMo/Airtel/Zamtel messages picked up on the phone and booked to external accounts. */
export type MomoCaptureSource = 'ANDROID_SMS' | 'ANDROID_NOTIFICATION' | 'IOS_SHORTCUT' | 'PASTE';
export type MomoCaptureStatus = 'PENDING' | 'POSTED' | 'MATCHED' | 'DISMISSED';

export interface MomoCaptureSettings {
    autoPost: boolean;
    destination: 'PROVIDER' | 'CASH';
    hasToken: boolean;
    tokenCreatedAt: string | null;
    lastCaptureAt: string | null;
    lastCaptureSource: MomoCaptureSource | null;
    pendingCount: number;
}

export interface MomoCapture {
    id: string;
    source: MomoCaptureSource;
    provider: 'MTN' | 'AIRTEL' | 'ZAMTEL' | 'OTHER';
    sender: string | null;
    raw_text: string;
    direction: 'IN' | 'OUT';
    amount: number;
    fee: number | null;
    balance_after: number | null;
    counterparty: string | null;
    provider_reference: string | null;
    occurred_at: string;
    status: MomoCaptureStatus;
    cashbook_entry_id: string | null;
    matched_entry_id: string | null;
}

/** A balance enquiry reply that differs from the provider account in MoneyWise. */
export interface MomoBalanceCheck {
    id: string;
    provider: 'MTN' | 'AIRTEL' | 'ZAMTEL' | 'OTHER';
    balance: number;
    observed_at: string;
    ledger_balance: number | null;
    pending_net: number | null;
    /** phone balance − (MoneyWise balance + captured-but-unbooked). Positive = MoneyWise is short. */
    difference: number | null;
    status: 'OPEN' | 'IN_SYNC' | 'ADJUSTED' | 'DISMISSED' | 'SUPERSEDED' | 'NO_ACCOUNT';
}

/** A capture plus where it landed in the ledger (booked ones only). */
export interface MomoCaptureActivity extends MomoCapture {
    entry: { reference_number: string | null; status: string | null; date: string | null; account: string | null; category: { id: string; code: string; name: string } | null } | null;
}
export interface MomoIgnoredMessage { id: string; source: MomoCaptureSource; raw_text: string; reason: string; created_at: string }
export type MomoDiagnosis =
    | { kind: 'TRANSACTION'; parsed: { provider: string; direction: 'IN' | 'OUT'; amount: number; fee: number | null; balanceAfter: number | null; counterparty: string | null; reference: string | null } }
    | { kind: 'BALANCE'; balance: { provider: string; balance: number } }
    | { kind: 'IGNORED'; reason: string; sensitive: boolean };

export const momoCaptureService = {
    getSettings(): Promise<MomoCaptureSettings> {
        return apiJson('/momo-capture/settings');
    },
    updateSettings(patch: Partial<Pick<MomoCaptureSettings, 'autoPost' | 'destination'>>): Promise<MomoCaptureSettings> {
        return apiJson('/momo-capture/settings', { method: 'PUT', body: JSON.stringify(patch) });
    },
    /** A new capture key; the previous one stops working. Shown/handed over once — the server keeps only its hash. */
    rotateToken(): Promise<{ token: string }> {
        return apiJson('/momo-capture/token', { method: 'POST' });
    },
    revokeToken(): Promise<{ ok: true }> {
        return apiJson('/momo-capture/token', { method: 'DELETE' });
    },
    list(status?: MomoCaptureStatus): Promise<MomoCapture[]> {
        return apiJson(`/momo-capture${status ? `?status=${status}` : ''}`);
    },
    paste(text: string): Promise<{ accepted: boolean; duplicate?: boolean; reason?: string; capture?: MomoCapture }> {
        return apiJson('/momo-capture/paste', { method: 'POST', body: JSON.stringify({ text }) });
    },
    post(id: string, overrides: { direction?: 'IN' | 'OUT'; amount?: number; accountId?: string; description?: string } = {}): Promise<MomoCapture> {
        return apiJson(`/momo-capture/${id}/post`, { method: 'POST', body: JSON.stringify(overrides) });
    },
    dismiss(id: string): Promise<MomoCapture> {
        return apiJson(`/momo-capture/${id}/dismiss`, { method: 'POST' });
    },
    activity(status?: MomoCaptureStatus): Promise<MomoCaptureActivity[]> {
        return apiJson(`/momo-capture/activity${status ? `?status=${status}` : ''}`);
    },
    allBalanceChecks(): Promise<MomoBalanceCheck[]> {
        return apiJson('/momo-capture/balance-checks/all');
    },
    ignored(): Promise<MomoIgnoredMessage[]> {
        return apiJson('/momo-capture/ignored');
    },
    testParse(text: string): Promise<MomoDiagnosis> {
        return apiJson('/momo-capture/test-parse', { method: 'POST', body: JSON.stringify({ text }) });
    },
    balanceChecks(): Promise<MomoBalanceCheck[]> {
        return apiJson('/momo-capture/balance-checks');
    },
    adjustBalance(id: string): Promise<MomoBalanceCheck> {
        return apiJson(`/momo-capture/balance-checks/${id}/adjust`, { method: 'POST' });
    },
    dismissBalanceCheck(id: string): Promise<MomoBalanceCheck> {
        return apiJson(`/momo-capture/balance-checks/${id}/dismiss`, { method: 'POST' });
    },
};
