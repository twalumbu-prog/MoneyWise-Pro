import { rewardsService, type PurchaseClaim } from 'core';
import { supabase } from './supabase';

/**
 * Store purchases waiting to be added to someone's rewards. The store's "Sign up with Google" button leaves the page for the
 * Google sign-in, so the purchase is remembered here and claimed on the Rewards page once the person is signed in.
 */
const KEY = 'mw_pending_reward_claims';
/** Set by the store's rewards button: a brand-new person is set up as a MoneyWise Personal account straight away. */
export const REWARDS_SIGNUP_KEY = 'mw_rewards_signup';

export interface PendingClaim { reference: string; organizationId: string; at: number }

const MAX_AGE_MS = 14 * 86_400_000;

function read(): PendingClaim[] {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(list) ? list.filter((c) => c?.reference && c?.organizationId && Date.now() - Number(c.at) < MAX_AGE_MS) : [];
    } catch { return []; }
}

function write(list: PendingClaim[]) {
    try { if (list.length) localStorage.setItem(KEY, JSON.stringify(list.slice(-10))); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

export function savePendingClaim(reference: string, organizationId: string) {
    write([...read().filter((c) => c.reference !== reference), { reference, organizationId, at: Date.now() }]);
}

export const hasPendingClaims = () => read().length > 0;

/**
 * Claims every remembered purchase for the signed-in person. A purchase still being confirmed stays for the next try; anything
 * else (claimed, invalid, too old) is dropped so it is never retried forever.
 */
export async function claimPendingPurchases(): Promise<PurchaseClaim[]> {
    const done: PurchaseClaim[] = [];
    let left = read();
    for (const c of read()) {
        try {
            done.push(await rewardsService.claimPurchase(c.reference, c.organizationId));
            left = left.filter((x) => x.reference !== c.reference);
        } catch (e: any) {
            if (e?.status !== 409 || !/being confirmed/i.test(String(e?.message))) left = left.filter((x) => x.reference !== c.reference);
        }
    }
    write(left);
    return done;
}

/**
 * Google sign-in (or sign-up) with this purchase waiting to be added. It returns to the app root (the redirect Supabase already
 * allows), which forwards to the Rewards page while REWARDS_SIGNUP_KEY is set.
 */
export async function signUpForRewards(reference: string, organizationId: string) {
    savePendingClaim(reference, organizationId);
    try { localStorage.setItem(REWARDS_SIGNUP_KEY, '1'); } catch { /* storage unavailable */ }
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/`, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
}
