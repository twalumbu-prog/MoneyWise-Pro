import { apiJson } from '../api/apiFetch';

export type SavingsKind = 'WISHLIST' | 'GOAL' | 'GROUP';

export interface SavingsMember { name: string; userId: string; avatarUrl?: string | null; role?: string }

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

export interface SavingsContribution {
    userId: string;
    name: string;
    avatarUrl: string | null;
    amount: number;
    status: string;
    date: string;
    method: string;
}

/** One member's footprint in a group: how many confirmed contributions and the total they've put in. */
export interface SavingsMemberSummary {
    userId: string;
    name: string;
    avatarUrl: string | null;
    role: string;
    count: number;
    total: number;
}

export interface SavingsDetail extends SavingsItem {
    activity: { id: string; date: string; description: string; amount: number; direction: 'IN' | 'OUT' }[];
    contributions: SavingsContribution[];
    memberSummary: SavingsMemberSummary[];
}

/** What an invite link shows before anyone has joined. */
export interface SavingsInvitePreview {
    name: string;
    organiser: string;
    memberCount: number;
    targetAmount: number | null;
    progress: number | null;
}

export interface SavingsPerson {
    userId: string;
    name: string;
    username: string | null;
    /** Masked, e.g. j•••@gmail.com */
    email: string | null;
    avatarUrl: string | null;
    isMember: boolean;
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
    /** Public invite-link preview (works without being signed in). */
    previewInvite(code: string): Promise<SavingsInvitePreview> {
        return apiJson(`/savings/preview/${encodeURIComponent(code)}`);
    },
    /** Organiser: look up MoneyWise users by email, username or name. */
    searchPeople(id: string, query: string): Promise<SavingsPerson[]> {
        return apiJson(`/savings/${id}/people?q=${encodeURIComponent(query)}`);
    },
    addMember(id: string, userId: string): Promise<{ added: boolean }> {
        return apiJson(`/savings/${id}/members`, { method: 'POST', body: JSON.stringify({ userId }) });
    },
    leave(id: string): Promise<{ left: boolean }> {
        return apiJson(`/savings/${id}/leave`, { method: 'POST' });
    },
    archive(id: string): Promise<{ archived: boolean }> {
        return apiJson(`/savings/${id}/archive`, { method: 'POST' });
    },
};
