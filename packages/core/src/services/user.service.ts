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

export const userService = {
    getAll(): Promise<UserProfile[]> {
        return apiJson<UserProfile[]>('/users');
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
