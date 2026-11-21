import { apiFetch } from '../api/apiFetch';
import type { PersonalStepKey, PersonalStepState, PersonalStepsMap, BillCadence, BillCategory } from '../onboarding/personalSteps';
import { scheduleService, type ScheduledItem } from './schedule.service';
import { investmentService, type KycProfile } from './investment.service';

export interface PersonalOnboardingState {
    flow: 'LEGACY' | 'PERSONAL_V2';
    status: 'IN_PROGRESS' | 'COMPLETED';
    completedAt: string | null;
    steps: PersonalStepsMap;
    profile: {
        firstName: string; lastName: string; dateOfBirth: string | null; avatarUrl: string | null; email: string | null;
        /** Verified number (E.164) or null. */
        phone?: string | null; phoneNetwork?: 'MTN' | 'AIRTEL' | 'ZAMTEL' | null;
        intents?: string[];
        /** Google/Apple photo from sign-in, offered on the avatar step. */
        providerPhotoUrl?: string | null;
    };
}

/** A 400 from a step save: `field` names the input that was rejected, so the screen can show it there. */
export class PersonalStepError extends Error {
    constructor(message: string, public field?: string, public status?: number) { super(message); }
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new PersonalStepError(body?.error || `Request failed (${res.status})`, body?.field, res.status);
    return body as T;
}

export type MoneyProviderType = 'MOBILE_MONEY' | 'BANK' | 'CUSTOM';
export interface PersonalAccount { walletId: string; name: string; providerType: MoneyProviderType; providerCode: string | null; openingBalance: number; balance: number }
export type HoldingKind = 'savings' | 'investments' | 'pension' | 'property' | 'vehicle' | 'business' | 'owed_to_me' | 'loan' | 'credit_card' | 'owed_by_me';
export interface PersonalHolding { accountId: string; kind: HoldingKind; name: string; type: 'ASSET' | 'LIABILITY'; value: number; monthlyRepayment: number | null; repaymentDay: number | null }
export interface PersonalMoney {
    accounts: PersonalAccount[];
    holdings: PersonalHolding[];
    breakdown: { mobileMoney: number; bank: number; cash: number; savingsAndInvestments: number; otherAssets: number; debts: number };
    total: number;
    providers: { code: string; name: string; type: MoneyProviderType }[];
}
export interface GmailFindings {
    connected: boolean; mailbox?: string; syncedAt?: string | null;
    providers: { code: string; name: string; type: MoneyProviderType }[];
    bills: { key: string; label: string; amount: number | null; lastSeen: string }[];
    statement: { emailId: string | null; provider: string | null; receivedAt: string; filename: string | null } | null;
}

/** MoneyWise Personal onboarding (flow PERSONAL_V2). */
export const personalOnboardingService = {
    async getState(): Promise<PersonalOnboardingState> {
        return jsonOrThrow(await apiFetch('/onboarding/personal/state'));
    },
    /** Idempotent: saving the same step again overwrites it. A done step stays done if later skipped. */
    async saveStep(key: PersonalStepKey, state: PersonalStepState, data?: Record<string, unknown>): Promise<{ steps: PersonalStepsMap; data: Record<string, unknown> | null }> {
        return jsonOrThrow(await apiFetch(`/onboarding/personal/steps/${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state, data }),
        }));
    },
    /** Sends a 6-digit code on WhatsApp. 429 carries `retryInSeconds`. */
    async sendPhoneCode(phone: string): Promise<{ sent: boolean; channel: 'whatsapp'; phone: string; network: string | null; resendInSeconds: number }> {
        return jsonOrThrow(await apiFetch('/onboarding/personal/phone/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
        }));
    },
    /** Confirms the code; marks step "phone" done. */
    async verifyPhoneCode(code: string): Promise<{ steps: PersonalStepsMap; data: { phone: string; network: string | null } }> {
        return jsonOrThrow(await apiFetch('/onboarding/personal/phone/verify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
        }));
    },
    /** One of: a compressed picture, a built-in preset ("preset:1"…"preset:8"), the sign-in photo, or back to initials. Marks step "avatar" done. */
    async saveAvatar(body: { imageBase64: string; mime: string } | { preset: string } | { providerPhoto: true } | { clear: true }): Promise<{ steps: PersonalStepsMap; data: { avatarUrl: string | null } }> {
        return jsonOrThrow(await apiFetch('/onboarding/personal/avatar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }));
    },
    async getMoney(): Promise<PersonalMoney> {
        return jsonOrThrow(await apiFetch('/onboarding/personal/money'));
    },
    /** Create (no walletId) or update an account and set its opening balance. 409 = name already used (`field` nickname). */
    async saveAccount(body: { walletId?: string; providerType: MoneyProviderType; providerCode?: string | null; nickname?: string; customName?: string; balance: number | string }): Promise<PersonalAccount> {
        return jsonOrThrow(await apiFetch('/onboarding/personal/accounts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    },
    async deleteAccount(walletId: string): Promise<{ removed: boolean; kept?: string }> {
        return jsonOrThrow(await apiFetch(`/onboarding/personal/accounts/${walletId}`, { method: 'DELETE' }));
    },
    async saveHolding(body: { accountId?: string; kind: HoldingKind; name: string; value: number | string; monthlyRepayment?: number | string | null; repaymentDay?: number | null }): Promise<PersonalHolding> {
        return jsonOrThrow(await apiFetch('/onboarding/personal/holdings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    },
    async deleteHolding(accountId: string): Promise<{ removed: boolean }> {
        return jsonOrThrow(await apiFetch(`/onboarding/personal/holdings/${accountId}`, { method: 'DELETE' }));
    },
    /** Connected mailboxes and which ways of connecting the server offers (direct Google OAuth, Composio quick connect). */
    async gmailStatus(): Promise<{ configured: boolean; composio: boolean; connections: { id: string; email_address: string; status: string; last_synced_at: string | null }[] }> {
        return jsonOrThrow(await apiFetch('/integrations/gmail/status'));
    },
    /** URL to open in an auth session; the browser comes back to moneywise://integrations-return?gmail=… */
    async gmailConnectUrl(via: 'direct' | 'composio'): Promise<string> {
        if (via === 'composio') {
            const r = await jsonOrThrow<{ redirectUrl: string }>(await apiFetch('/integrations/composio/gmail/connect', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnTo: 'app' }),
            }));
            return r.redirectUrl;
        }
        return (await jsonOrThrow<{ url: string }>(await apiFetch('/integrations/gmail/connect?app=1'))).url;
    },
    /** After a Composio sign-in: registers the mailbox. */
    async gmailComposioComplete(): Promise<{ ok: boolean; message?: string }> {
        return jsonOrThrow(await apiFetch('/integrations/composio/gmail/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    },
    async gmailFindings(): Promise<GmailFindings> {
        return jsonOrThrow(await apiFetch('/onboarding/personal/gmail-findings'));
    },
    /** Regular bills are scheduled items (Schedules). Created ACTIVE; due dates become payment requests to approve. */
    async listBills(): Promise<ScheduledItem[]> {
        return scheduleService.getAll(undefined, 'ACTIVE');
    },
    async saveBill(b: { id?: string; title: string; amount: number; category: BillCategory; cadence: BillCadence; nextDueDate: string }): Promise<ScheduledItem> {
        const payload = { title: b.title, amount: b.amount, category: b.category, cadence: b.cadence, next_due_date: b.nextDueDate, description: 'Added during setup' };
        return b.id ? scheduleService.update(b.id, payload) : scheduleService.create(payload);
    },
    async removeBill(id: string): Promise<void> {
        await scheduleService.update(id, { status: 'ARCHIVED' });
    },
    /** The person's KYC profile (shared with investments and loans): what's complete and what's missing. */
    async getKyc(): Promise<KycProfile> {
        return investmentService.getKycProfile();
    },
    async walletStatus(): Promise<WalletStatus> {
        return onboardingService.getWalletStatus();
    },
    /** Links a wallet from the pool to this account (409/503 when the pool is empty). */
    async claimWallet(): Promise<unknown> {
        return onboardingService.claimWallet();
    },
    /** Uses the statement found in Gmail as proof of residence (direct Google connections only; 409 = upload instead). */
    async attachGmailStatement(emailId: string): Promise<{ path: string; filename: string }> {
        return jsonOrThrow(await apiFetch('/onboarding/personal/kyc/statement-from-gmail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailId }) }));
    },
    /** After the activation deposit: marks the wallet activated once a completed deposit of the amount is found. 403 `minor` = under 18. */
    async checkWallet(): Promise<{ linked: boolean; activated: boolean; amount?: number }> {
        return jsonOrThrow(await apiFetch('/onboarding/personal/wallet/check', { method: 'POST' }));
    },
    async complete(): Promise<{ status: 'COMPLETED'; completedAt: string }> {
        return jsonOrThrow(await apiFetch('/onboarding/personal/complete', { method: 'POST' }));
    },
};

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
    /** LEGACY = the numbered wizard (app/onboarding.tsx); PERSONAL_V2 = the personal flow (app/personal-onboarding.tsx). */
    flow?: 'LEGACY' | 'PERSONAL_V2';
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
