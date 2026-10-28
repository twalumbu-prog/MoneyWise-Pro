import { apiJson } from '../api/apiFetch';

/** One rewards programme: a business the person buys from, or MoneyWise itself (id "moneywise"). */
export interface RewardCard {
    id: string;
    name: string;
    logoUrl: string | null;
    isPlatform: boolean;
    balance: number;
    lifetime: number;
    tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
    /** e.g. "Silver member" */
    status: string;
    /** Points needed for the next reward (null for MoneyWise, which has none yet). */
    threshold: number | null;
    /** 0..1 */
    progress: number;
    pointsToNext: number | null;
    rewardReady: boolean;
    rewardTitle: string | null;
    redeemable: boolean;
    lastActivity: string | null;
}

export interface RewardsOverview {
    platform: RewardCard;
    businesses: RewardCard[];
    code: string;
}

export interface RewardPointEntry {
    id: string;
    points: number;
    kind: 'PURCHASE' | 'REFERRAL' | 'BONUS' | 'REDEMPTION';
    description: string | null;
    amount: number | null;
    at: string;
}

export interface RewardAchievement {
    id: string;
    kind: 'reward' | 'tier' | 'milestone';
    title: string;
    description: string;
    at: string;
    /** Only for an unused reward: the code to show the business. */
    code?: string | null;
    status?: 'ISSUED' | 'USED' | 'CANCELLED';
    points?: number;
}

export type RewardType = 'AMOUNT_OFF' | 'PERCENT_OFF' | 'FREE_ITEM';

/** One reward as a customer sees it: what it gives, what it applies to, and whether their points reach it. */
export interface RewardOption {
    id: string;
    title: string;
    type: RewardType;
    value: number;
    points: number;
    products: string[];
    /** "Anything" or the product names. */
    appliesTo: string;
    affordable: boolean;
    pointsToGo: number;
}

/** A reward a business has defined (business side). */
export interface RewardItem {
    id: string;
    organization_id: string;
    title: string;
    reward_type: RewardType;
    value: number;
    points_cost: number;
    product_ids: string[];
    active: boolean;
    products: { id: string; name: string }[];
    summary: string;
}

export interface RewardItemInput {
    title?: string;
    reward_type: RewardType;
    value?: number;
    points_cost: number;
    product_ids?: string[];
    active?: boolean;
}

export interface RewardDetail {
    card: RewardCard;
    rewards: RewardOption[];
    program: { threshold: number; rewardTitle: string; rewardValue: number; pointsPerKwacha: number; referralPoints: number; enabled: boolean } | null;
    points: RewardPointEntry[];
    achievements: RewardAchievement[];
}

export interface RewardInvite {
    code: string;
    scope: string;
    title: string;
    link: string;
    reward: string;
    businessPage?: boolean;
}

export interface RewardVoucher { id: string; organizationId: string; business: string; logoUrl: string | null; title: string; value: number; code: string; at: string }

export interface RewardProgramSettings {
    organization_id: string;
    enabled: boolean;
    points_per_kwacha: number;
    reward_threshold: number;
    reward_title: string;
    reward_value: number;
    referral_points: number;
}

export const rewardsService = {
    overview(): Promise<RewardsOverview> {
        return apiJson('/rewards');
    },
    detail(scope: string): Promise<RewardDetail> {
        return apiJson(`/rewards/programs/${encodeURIComponent(scope)}`);
    },
    invite(scope: string): Promise<RewardInvite> {
        return apiJson(`/rewards/invite/${encodeURIComponent(scope)}`);
    },
    claimReferral(code: string): Promise<{ referrerName: string }> {
        return apiJson('/rewards/referral/claim', { method: 'POST', body: JSON.stringify({ code }) });
    },
    redeemables(): Promise<{ programmes: { card: RewardCard; rewards: RewardOption[] }[]; ready: RewardCard[]; vouchers: RewardVoucher[] }> {
        return apiJson('/rewards/redeemables');
    },
    redeem(scope: string, rewardId?: string): Promise<{ id: string; code: string; title: string; value: number; business: string; balance: number; appliesTo: string | null }> {
        return apiJson(`/rewards/programs/${encodeURIComponent(scope)}/redeem`, { method: 'POST', body: JSON.stringify({ rewardId }) });
    },
    /** The signed-in business's own programme settings. */
    getProgram(): Promise<RewardProgramSettings> {
        return apiJson('/rewards/program');
    },
    updateProgram(patch: Partial<Omit<RewardProgramSettings, 'organization_id'>>): Promise<RewardProgramSettings> {
        return apiJson('/rewards/program', { method: 'PUT', body: JSON.stringify(patch) });
    },
    /** The signed-in business's rewards (what customers can redeem points for). */
    listItems(): Promise<RewardItem[]> {
        return apiJson('/rewards/items');
    },
    createItem(input: RewardItemInput): Promise<RewardItem> {
        return apiJson('/rewards/items', { method: 'POST', body: JSON.stringify(input) });
    },
    updateItem(id: string, patch: Partial<RewardItemInput>): Promise<RewardItem> {
        return apiJson(`/rewards/items/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) });
    },
    deleteItem(id: string): Promise<{ ok: true }> {
        return apiJson(`/rewards/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    /** A business marks a customer's voucher code as used. */
    useVoucher(code: string): Promise<{ title: string; value: number; customer: string }> {
        return apiJson('/rewards/vouchers/use', { method: 'POST', body: JSON.stringify({ code }) });
    },
};
