/**
 * Team-member management.
 *
 * First service across the adapter boundary. It also picks up a fix on the way:
 * the web version hand-rolled `getSession()` + raw `fetch` on every call, so it
 * was the one service that missed the token-refresh/retry path in apiFetch — a
 * backgrounded tab with an expired token would fail outright instead of
 * recovering. Routing it through apiFetch brings it in line with the other 16.
 */

import { apiJson } from '../api/apiFetch';

import type { UserRole } from '../reference/roles';
export type { UserRole };
export type UserStatus = 'ACTIVE' | 'INVITED' | 'DISABLED' | 'PENDING_APPROVAL';

export interface UserProfile {
    id: string;
    email?: string;
    name: string;
    role: UserRole;
    employee_id: string;
    status: UserStatus;
    organization_id: string;
    created_at: string;
}

export interface CreateUserInput {
    email: string;
    name: string;
    role: string;
    employeeId?: string;
    username?: string;
    password?: string;
}

/**
 * `POST /users` takes two paths and reports which one it took: an existing
 * MoneyWise account is linked directly (ACTIVE), a new one is emailed a
 * password-setup invite (INVITED). The message is written for the admin to
 * read verbatim, so callers should surface it rather than a generic string.
 */
export interface CreateUserResult {
    message: string;
    userId: string;
    status: 'ACTIVE' | 'INVITED';
}

/** The mutating endpoints acknowledge with a message, not the updated row. */
export interface MutationAck {
    message: string;
}

export interface PaymentInfo {
    bank_name?: string;
    bank_account_number?: string;
    bank_account_name?: string;
    mobile_money_provider?: string;
    mobile_money_number?: string;
    mobile_money_name?: string;
}

export interface MyProfile extends UserProfile {
    payment_info?: PaymentInfo | null;
}

export interface MoneyWiseRecipient {
    id: string;
    user_id?: string | null;
    name: string;
    username?: string | null;
    email?: string | null;
    phone?: string | null;
    organization_id?: string | null;
    organization_name: string;
    logo_url?: string | null;
    account_type: 'PERSONAL' | 'BUSINESS';
    moneywise_id: string;
    lenco_subaccount_id?: string | null;
    verified: boolean;
}

export type NotifyChannel = 'BOTH' | 'APP' | 'EMAIL';
export type SalaryDestination = 'PERSONAL_WALLET' | 'BANK';

/** A person's own settings (Settings → Preferences in the personal app). */
export interface UserPreferences {
    notifications: { channel: NotifyChannel };
    ai: { assistant_model: string | null; categorization_model: string | null };
    payroll: { destination: SalaryDestination };
}

export interface PreferencesResponse {
    preferences: UserPreferences;
    options: {
        assistantModels: { id: string; label: string; vendor: string; blurb: string; tier: 'fast' | 'balanced' | 'deep' }[];
        categorizationModels: { id: string; label: string }[];
    };
    salary: {
        /** The person is on an employer's payroll (a staff record is linked to their account). */
        available: boolean;
        employers: string[];
        personalAccount: { id: string; name: string } | null;
        bankSummary: string | null;
    };
}

export const userService = {
    getMyPreferences(): Promise<PreferencesResponse> {
        return apiJson<PreferencesResponse>('/users/me/preferences');
    },

    /** Partial update: send only what changed. */
    updateMyPreferences(patch: {
        notifications?: { channel?: NotifyChannel };
        ai?: { assistant_model?: string | null; categorization_model?: string | null };
        payroll?: { destination?: SalaryDestination };
    }): Promise<{ preferences: UserPreferences }> {
        return apiJson('/users/me/preferences', { method: 'PUT', body: JSON.stringify(patch) });
    },

    /** Emails a 6-digit code to the account address so a forgotten app PIN can be reset. */
    requestPinRecovery(): Promise<{ sentTo: string; expiresInSeconds: number }> {
        return apiJson('/users/me/pin-recovery/request', { method: 'POST' });
    },

    verifyPinRecovery(code: string): Promise<{ ok: true }> {
        return apiJson('/users/me/pin-recovery/verify', { method: 'POST', body: JSON.stringify({ code }) });
    },

    /** Everything needing attention, per area — the numbers behind the in-app and app-icon badges. */
    getNotificationCounts(): Promise<{ requisitions: number; approvals: number; vouchers: number; disbursements: number; settings: number; wallets: number }> {
        return apiJson('/users/notifications');
    },

    getAll(): Promise<UserProfile[]> {
        return apiJson<UserProfile[]>('/users');
    },

    searchRecipients(query: string): Promise<MoneyWiseRecipient[]> {
        return apiJson<MoneyWiseRecipient[]>(`/users/search-recipients?q=${encodeURIComponent(query)}`);
    },

    verifyRecipient(identifier: string): Promise<{ found: boolean; recipient?: MoneyWiseRecipient; error?: string }> {
        return apiJson<{ found: boolean; recipient?: MoneyWiseRecipient; error?: string }>('/users/verify-recipient', {
            method: 'POST',
            body: JSON.stringify({ identifier }),
        });
    },

    /** Permanently closes the signed-in user's account (App Store 5.1.1(v)). */
    deleteMyAccount(): Promise<{ message?: string }> {
        return apiJson('/auth/account', {
            method: 'DELETE',
            body: JSON.stringify({ confirm: 'DELETE' }),
        });
    },

    getMyProfile(): Promise<MyProfile> {
        return apiJson<MyProfile>('/users/me');
    },

    updatePaymentInfo(paymentInfo: PaymentInfo): Promise<{ message?: string }> {
        return apiJson('/users/me/payment-info', {
            method: 'PUT',
            body: JSON.stringify({ payment_info: paymentInfo }),
        });
    },

    registerPushToken(token: string, platform: 'ios' | 'android'): Promise<{ message?: string }> {
        return apiJson('/users/me/push-token', {
            method: 'POST',
            body: JSON.stringify({ token, platform }),
        });
    },

    unregisterPushToken(token: string): Promise<{ message?: string }> {
        return apiJson('/users/me/push-token', {
            method: 'DELETE',
            body: JSON.stringify({ token }),
        });
    },

    create(data: CreateUserInput): Promise<CreateUserResult> {
        return apiJson<CreateUserResult>('/users', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    update(id: string, data: Partial<UserProfile>): Promise<MutationAck> {
        return apiJson<MutationAck>(`/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    delete(id: string): Promise<MutationAck> {
        return apiJson<MutationAck>(`/users/${id}`, { method: 'DELETE' });
    },

    resendInvite(id: string): Promise<MutationAck> {
        return apiJson<MutationAck>(`/users/${id}/resend-invite`, { method: 'POST' });
    },
};
