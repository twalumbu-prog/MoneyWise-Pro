import { apiJson } from '../api/apiFetch';

/** Mobile money capture — MoMo/Airtel/Zamtel messages picked up on the phone and booked to external accounts. */
export type MomoCaptureSource = 'ANDROID_SMS' | 'ANDROID_NOTIFICATION' | 'IOS_SHORTCUT' | 'PASTE';
export type MomoCaptureStatus = 'PENDING' | 'POSTED' | 'MATCHED' | 'DISMISSED';

export interface MomoCaptureDevice { id: string; deviceId: string; label: string | null; platform: string; createdAt: string; lastSeenAt: string | null }
/** One row of the combined "every message" list. */
export interface MomoEverythingItem {
    id: string; kind: 'TRANSACTION' | 'BALANCE' | 'NOT_BOOKED'; source: string; at: string; receivedAt: string;
    text: string; status: string; direction: string | null; amount: number | null; provider: string | null; note: string | null;
    device: string | null; workspace: string | null; elsewhere: boolean;
    /** A captured transaction's own note. */
    comment: string | null;
    /** NOT_BOOKED only: can this be moved into Captured by hand, and the parser's best guess at its fields. */
    movable: boolean;
    guess: { provider: string; direction: 'IN' | 'OUT' | null; amount: number | null; fee: number | null; balanceAfter: number | null; counterparty: string | null; reference: string | null } | null;
}

export interface MomoAccountingOptions {
    wallets: { id: string; name: string; providerType: string; provider: 'MTN' | 'AIRTEL' | 'ZAMTEL' | 'OTHER' }[];
    income: { id: string; code: string | null; name: string; emoji: string | null }[];
    expense: { id: string; code: string | null; name: string; emoji: string | null }[];
    /** The whole chart of accounts, for the debit / credit pickers. */
    accounts: { id: string; code: string | null; name: string; type: string }[];
}
export interface MomoPostingLine { role: string; accountId: string | null; code: string | null; name: string; type: string; debit: number; credit: number; note: string | null }
export interface MomoPostingPreview {
    direction: 'IN' | 'OUT'; amount: number; fee: number; description: string; note: string | null; date: string;
    wallet: { id: string | null; name: string; willBeCreated: boolean };
    category: { accountId: string | null; source: 'USER' | 'AI' | null; reasoning: string | null; confidence: number | null };
    fee_category: { accountId: string | null; source: 'USER' | 'AI' | null; reasoning: string | null; confidence: number | null } | null;
    lines: MomoPostingLine[];
    totals: { debit: number; credit: number; balanced: boolean };
}
export interface MomoPostingInput { direction?: 'IN' | 'OUT'; amount?: number | string; fee?: number | string | null; accountId?: string | null; feeAccountId?: string | null; walletId?: string | null; description?: string; date?: string }

/** The fields of a capture a person can correct before booking. */
export interface MomoCaptureFields {
    /** The external account (MTN MoMo, a bank such as FNB …) it is booked into. */
    accountId?: string | null;
    provider?: 'MTN' | 'AIRTEL' | 'ZAMTEL' | 'OTHER'; direction?: 'IN' | 'OUT'; amount?: number | string;
    fee?: number | string | null; balanceAfter?: number | string | null; counterparty?: string | null;
    reference?: string | null; sender?: string | null; note?: string | null;
}

export interface MomoCaptureSettings {
    /** Every phone that has a capture key for this person. */
    devices: MomoCaptureDevice[];
    /** The workspace this person's capture key delivers into (the one it was last set up in). */
    captureWorkspace: { id: string; name: string | null };
    /** True when that is the workspace being viewed. */
    capturingHere: boolean;
    /** Messages that went to the person's other workspaces. */
    elsewhere: { captures: number; ignored: number };
    autoPost: boolean;
    destination: 'PROVIDER' | 'CASH';
    hasToken: boolean;
    tokenCreatedAt: string | null;
    lastCaptureAt: string | null;
    lastCaptureSource: MomoCaptureSource | null;
    pendingCount: number;
    /** The provider this phone number is on; used when a message doesn't name one. */
    defaultProvider: 'MTN' | 'AIRTEL' | 'ZAMTEL' | null;
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
    /** The person's own note; sent to the AI with the description when the capture is booked. */
    note?: string | null;
    /** The external account it is booked into (null = its provider's usual account). */
    external_wallet_id?: string | null;
    /** Waiting captures only: the category last used with this contact, if any. */
    suggested_account_id?: string | null;
    /** Waiting captures only: the person's most-used categories for this direction, most used first. */
    ranked_account_ids?: string[];
}

/** A wallet's balance as the operator last stated it in a message. */
export interface MomoBalance {
    provider: MomoCapture['provider'];
    name: string;
    balance: number;
    asOf: string;
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
export interface MomoIgnoredMessage { id: string; source: MomoCaptureSource; raw_text: string; reason: string; created_at: string; workspace?: string | null; elsewhere?: boolean }
export type MomoDiagnosis =
    | { kind: 'TRANSACTION'; parsed: { provider: string; direction: 'IN' | 'OUT'; amount: number; fee: number | null; balanceAfter: number | null; counterparty: string | null; reference: string | null } }
    | { kind: 'BALANCE'; balance: { provider: string; balance: number } }
    | { kind: 'IGNORED'; reason: string; sensitive: boolean };

export const momoCaptureService = {
    balances(): Promise<MomoBalance[]> {
        return apiJson('/momo-capture/balances');
    },
    getSettings(): Promise<MomoCaptureSettings> {
        return apiJson('/momo-capture/settings');
    },
    updateSettings(patch: Partial<Pick<MomoCaptureSettings, 'autoPost' | 'destination' | 'defaultProvider'>>): Promise<MomoCaptureSettings> {
        return apiJson('/momo-capture/settings', { method: 'PUT', body: JSON.stringify(patch) });
    },
    /** Delivers captured messages into the workspace being viewed. The key itself is unchanged. */
    captureHere(): Promise<MomoCaptureSettings> {
        return apiJson('/momo-capture/settings/capture-here', { method: 'POST' });
    },
    /** A new capture key; the previous one stops working. Shown/handed over once — the server keeps only its hash. */
    rotateToken(device?: { deviceId: string; label: string; platform: 'ios' | 'android' }): Promise<{ token: string }> {
        return apiJson('/momo-capture/token', { method: 'POST', body: JSON.stringify(device ?? {}) });
    },
    /** Turns off this device's key (or, with no id, the shared key older app versions use). */
    revokeToken(deviceId?: string): Promise<{ ok: true }> {
        return apiJson(`/momo-capture/token${deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ''}`, { method: 'DELETE' });
    },
    /** Corrects a capture that is waiting for review (any of the fields). */
    editCapture(id: string, fields: MomoCaptureFields): Promise<MomoCapture> {
        return apiJson(`/momo-capture/${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
    },
    /** Moves a not-booked message into Captured with the details the person confirmed. */
    moveToCaptured(ignoredId: string, fields: MomoCaptureFields): Promise<MomoCapture> {
        return apiJson(`/momo-capture/ignored/${ignoredId}/capture`, { method: 'POST', body: JSON.stringify(fields) });
    },
    /** Accounts a capture can be booked into, and the categories on the other side of the entry. */
    accountingOptions(): Promise<MomoAccountingOptions> {
        return apiJson('/momo-capture/accounting-options');
    },
    /** Adds an external account (a bank like FNB, a mobile money line …). */
    createAccount(name: string, type?: 'BANK' | 'MOBILE_MONEY' | 'CUSTOM'): Promise<{ id: string; name: string; providerType: string; provider: string; existed: boolean }> {
        return apiJson('/momo-capture/accounts', { method: 'POST', body: JSON.stringify({ name, type }) });
    },
    /** The double entry booking would post, without posting it. */
    previewPosting(id: string, input: MomoPostingInput = {}): Promise<MomoPostingPreview> {
        return apiJson(`/momo-capture/${id}/preview`, { method: 'POST', body: JSON.stringify(input) });
    },
    removeDevice(id: string): Promise<{ ok: true }> {
        return apiJson(`/momo-capture/devices/${id}`, { method: 'DELETE' });
    },
    /** Every message every phone has sent, newest first: captures, balance readings and the ones not booked. */
    everything(limit = 200): Promise<MomoEverythingItem[]> {
        return apiJson(`/momo-capture/everything?limit=${limit}`);
    },
    list(status?: MomoCaptureStatus): Promise<MomoCapture[]> {
        return apiJson(`/momo-capture${status ? `?status=${status}` : ''}`);
    },
    paste(text: string): Promise<{ accepted: boolean; duplicate?: boolean; reason?: string; capture?: MomoCapture; balanceCheck?: MomoBalanceCheck | { duplicate: true } }> {
        return apiJson('/momo-capture/paste', { method: 'POST', body: JSON.stringify({ text }) });
    },
    post(id: string, overrides: { direction?: 'IN' | 'OUT'; amount?: number | string; accountId?: string; description?: string; walletId?: string; date?: string; fee?: number | string | null; feeAccountId?: string } = {}): Promise<MomoCapture> {
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
    /** On-iPhone filter rules (which messages the capture action keeps). */
    deviceRules(): Promise<{ version: number; amount: string; money: string; allow?: string; captureAll?: boolean }> {
        return apiJson('/momo-capture/device-rules');
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
