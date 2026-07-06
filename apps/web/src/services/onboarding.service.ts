import { apiFetch } from '../lib/api';

export interface OnboardingProgress {
    currentStep: number;
    completedSteps: number[];
    status: 'IN_PROGRESS' | 'COMPLETED';
    coaSaved: boolean;
    walletActivated: boolean;
    walletActivationReference: string | null;
}

export interface BusinessProfile {
    industries: string[];
    store_categories: string[];
    phone: string | null;
    alt_phone: string | null;
    business_email: string | null;
    website: string | null;
    social_links: Record<string, string>;
    country: string | null;
    province: string | null;
    city: string | null;
    plot_number: string | null;
    street: string | null;
    postal_code: string | null;
    latitude: number | null;
    longitude: number | null;
}

export interface OnboardingState {
    progress: OnboardingProgress;
    organization: { id: string; name: string; logoUrl: string | null };
    profile: BusinessProfile | null;
    productCount: number;
    wallet: { linked: boolean; linkedAt: string | null; paymentsConfigured: boolean };
    activation: { amount: number; currency: string };
    totalSteps: number;
}

export type PlSection = 'Revenue' | 'Cost of Sales' | 'Operating Expenses' | 'Other Income' | 'Other Expenses';
export const PL_SECTIONS: PlSection[] = ['Revenue', 'Cost of Sales', 'Operating Expenses', 'Other Income', 'Other Expenses'];

export interface CoaAccount {
    code: string;
    name: string;
    type: 'INCOME' | 'EXPENSE';
    subtype: PlSection;
    description: string;
    is_active?: boolean;
}

export interface WalletStatus {
    linked: boolean;
    providerAccountId: string | null;
    publicKey: string | null;
    paymentTestMode: boolean;
    mainWalletId: string | null;
    poolAvailable: boolean;
    activation: { amount: number; currency: string };
    activated: boolean;
    activationReference: string | null;
}

export const onboardingService = {
    async getState(): Promise<OnboardingState> {
        const res = await apiFetch('/onboarding/state');
        return res.json();
    },

    async saveProgress(currentStep: number, completedStep?: number): Promise<void> {
        await apiFetch('/onboarding/progress', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentStep, completedStep }),
        });
    },

    async updateOrganizationName(name: string): Promise<void> {
        await apiFetch('/onboarding/organization', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
    },

    async saveProfile(patch: Partial<BusinessProfile>): Promise<BusinessProfile> {
        const res = await apiFetch('/onboarding/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        });
        const data = await res.json();
        return data.profile;
    },

    async generateChartOfAccounts(): Promise<{ accounts: CoaAccount[]; method: 'AI' | 'TEMPLATE' }> {
        const res = await apiFetch('/onboarding/chart-of-accounts/generate', { method: 'POST' });
        return res.json();
    },

    async saveChartOfAccounts(accounts: CoaAccount[]): Promise<void> {
        await apiFetch('/onboarding/chart-of-accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accounts }),
        });
    },

    async getWalletStatus(): Promise<WalletStatus> {
        const res = await apiFetch('/onboarding/wallet');
        return res.json();
    },

    async claimWallet(): Promise<{ linked: boolean; providerAccountId: string; publicKey: string; alreadyLinked: boolean }> {
        const res = await apiFetch('/onboarding/wallet/claim', { method: 'POST' });
        return res.json();
    },

    async confirmActivation(reference: string): Promise<void> {
        await apiFetch('/onboarding/wallet/activation-confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference }),
        });
    },

    async complete(): Promise<void> {
        await apiFetch('/onboarding/complete', { method: 'POST' });
    },
};
