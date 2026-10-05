import { apiJson } from '../api/apiFetch';

export type SavingsKind = 'WISHLIST' | 'GOAL' | 'GROUP';

export interface SavingsMember { name: string; userId: string }

export interface SavingsItem {
    id: string;
    kind: SavingsKind;
    name: string;
    targetAmount: number | null;
    imageUrl: string | null;
    balance: number;
    /** 0..1, or null when there's no target. */
    progress: number | null;
    walletId: string;
    organizationId: string;
    /** OWNER = your organization holds the wallet; MEMBER = you joined someone's group. */
    role: 'OWNER' | 'MEMBER';
    inviteCode: string | null;
    members: SavingsMember[];
    createdAt: string;
}

export interface SavingsOverview {
    wishlist: SavingsItem[];
    goals: SavingsItem[];
    groups: SavingsItem[];
    totals: { wishlist: number; goals: number; groups: number };
}

export interface SavingsDetail extends SavingsItem {
    activity: { id: string; date: string; description: string; amount: number; direction: 'IN' | 'OUT' }[];
    contributions: { name: string; amount: number; status: string; date: string; method: string }[];
}

/**
 * Savings: each item is a real MoneyWise sub-wallet with its own savings account in the
 * books, so money moved in shows up in Reporting. Group savings are joined by invite code.
 */
export const savingsService = {
    list(): Promise<SavingsOverview> {
        return apiJson('/savings');
    },
    get(id: string): Promise<SavingsDetail> {
        return apiJson(`/savings/${id}`);
    },
    create(body: { kind: SavingsKind; name: string; targetAmount?: number; imageUrl?: string }): Promise<SavingsItem> {
        return apiJson('/savings', { method: 'POST', body: JSON.stringify(body) });
    },
    deposit(id: string, amount: number, sourceWalletId: string): Promise<{ balance: number }> {
        return apiJson(`/savings/${id}/deposit`, { method: 'POST', body: JSON.stringify({ amount, sourceWalletId }) });
    },
    withdraw(id: string, amount: number, destinationWalletId: string): Promise<{ balance: number }> {
        return apiJson(`/savings/${id}/withdraw`, { method: 'POST', body: JSON.stringify({ amount, destinationWalletId }) });
    },
    join(code: string): Promise<{ id: string; name: string; alreadyMember: boolean }> {
        return apiJson('/savings/join', { method: 'POST', body: JSON.stringify({ code }) });
    },
    /** Registers a mobile-money contribution to a group before paying; returns where to collect it. */
    startContribution(id: string, amount: number, reference: string): Promise<{ walletId: string; organizationId: string; name: string }> {
        return apiJson(`/savings/${id}/contributions`, { method: 'POST', body: JSON.stringify({ amount, reference }) });
    },
    confirmContribution(id: string, reference: string): Promise<{ status: string }> {
        return apiJson(`/savings/${id}/contributions/${encodeURIComponent(reference)}/confirm`, { method: 'POST' });
    },
    archive(id: string): Promise<{ archived: boolean }> {
        return apiJson(`/savings/${id}/archive`, { method: 'POST' });
    },
};
