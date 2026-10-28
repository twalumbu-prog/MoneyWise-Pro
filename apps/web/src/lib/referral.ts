import { rewardsService } from 'core';

const KEY = 'mw_referral_code';

/** A friend's invite link (/login?ref=CODE): remember the code until the new person is signed in. */
export function captureReferralFromUrl(): void {
    try {
        if (!window.location.pathname.startsWith('/login')) return;
        const code = new URLSearchParams(window.location.search).get('ref');
        if (code && /^[A-Za-z0-9]{4,12}$/.test(code)) localStorage.setItem(KEY, code.toUpperCase());
    } catch { /* storage unavailable: the code can still be entered by hand in the app */ }
}

/** Tells MoneyWise who invited the signed-in person. One try: an invalid or already-used code is simply dropped. */
export async function claimPendingReferral(): Promise<void> {
    let code: string | null = null;
    try { code = localStorage.getItem(KEY); } catch { return; }
    if (!code) return;
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    await rewardsService.claimReferral(code).catch(() => undefined);
}
