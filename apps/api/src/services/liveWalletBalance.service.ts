/**
 * The Main Wallet is a real Lenco account, so the figure people act on has to be what Lenco says is in it. The books (the ledger)
 * can drift from Lenco, for example when money moves outside MoneyWise or a fee is not recorded, and a wrong balance misleads
 * anyone about to make a payment. This asks Lenco for the live balance and shows that, keeping the books figure alongside.
 *
 * Other MoneyWise wallets (savings, tithe, etc.) are slices of the same Lenco account, so the Main Wallet is what is left after
 * their books balances are taken out of the live total.
 */
import { supabase } from '../lib/supabase';
import { LencoService } from './lenco.service';

export interface LiveBalance { available: number; currency: string; at: number }

const TTL_MS = 15_000;
export interface LiveStatus { live: LiveBalance | null; reason: string | null }
const cache = new Map<string, { value: LiveStatus; at: number }>();
const round2 = (n: number) => Math.round(n * 100) / 100;

export function clearLiveBalanceCache() { cache.clear(); }

/** Lenco's live available balance, or why it could not be had (test mode, no account, Lenco refused or is down). */
export async function liveLencoStatus(orgId: string): Promise<LiveStatus> {
    const hit = cache.get(orgId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

    let value: LiveStatus = { live: null, reason: null };
    try {
        const { data: org } = await supabase.from('organizations')
            .select('lenco_subaccount_id, lenco_secret_key, payment_test_mode').eq('id', orgId).maybeSingle();
        if (!org?.lenco_subaccount_id) value = { live: null, reason: 'No Lenco account is linked' };
        else if (org.payment_test_mode) value = { live: null, reason: 'This business is in test mode' };
        else {
            const real: any = await Promise.race([
                LencoService.getAccountBalance(org.lenco_subaccount_id, org.lenco_secret_key || undefined),
                new Promise((_, rej) => setTimeout(() => rej(new Error('Lenco balance timed out')), 8000)),
            ]);
            const n = Number(real?.availableBalance ?? real?.balance ?? NaN);
            value = Number.isFinite(n)
                ? { live: { available: round2(n), currency: String(real?.currency ?? 'ZMW'), at: Date.now() }, reason: null }
                : { live: null, reason: 'Lenco did not return a balance' };
        }
    } catch (e: any) { value = { live: null, reason: `Lenco could not be reached (${String(e?.message ?? 'error').slice(0, 80)})` }; }

    cache.set(orgId, { value, at: Date.now() });
    return value;
}

export async function liveLencoBalance(orgId: string): Promise<LiveBalance | null> {
    return (await liveLencoStatus(orgId)).live;
}

/**
 * Puts the live Lenco figure on the Main Wallet. Every wallet gets `balance_source`; the main one also gets `ledger_balance`
 * (what the books say) and `balance_difference` (live minus books) so a gap is visible rather than silently hidden.
 */
export function applyLiveBalance<T extends { is_main?: boolean; balance: number }>(wallets: T[], live: LiveBalance | null, reason: string | null = null): Array<T & { balance_source: 'LENCO_LIVE' | 'BOOKS'; ledger_balance?: number; balance_difference?: number; live_unavailable?: string }> {
    const othersTotal = round2(wallets.filter((w) => !w.is_main).reduce((s, w) => s + Number(w.balance || 0), 0));
    return wallets.map((w) => {
        if (!live || !w.is_main) return { ...w, balance_source: 'BOOKS' as const, ...(w.is_main && reason ? { live_unavailable: reason } : {}) };
        const shown = round2(live.available - othersTotal);
        return { ...w, ledger_balance: w.balance, balance: shown, balance_source: 'LENCO_LIVE' as const, balance_difference: round2(shown - Number(w.balance || 0)) };
    });
}
