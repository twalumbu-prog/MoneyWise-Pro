/**
 * lencoAccountLink.service.ts — keep an organization's stored Lenco account id a REAL Lenco account id.
 *
 * Lenco addresses accounts by UUID. Some organizations were linked with their till number (e.g. 2612745)
 * in its place — it came in through a wallet-pool row that skipped the admin tool's verification, and the
 * activation function copies the pool value into the organization without looking. Lenco then answers
 * "Invalid accountId" for every balance check, payout, transfer and sync, and the app showed a generic
 * "server problem". This heals such a link by looking the account up with the organization's own key
 * (a till number identifies exactly one account), verifying it, and only then saving it.
 */
import { supabase } from '../lib/supabase';
import { LencoService } from './lenco.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isLencoAccountId = (v: unknown): boolean => UUID.test(String(v ?? '').trim());

export type HealResult =
    | { ok: true; accountId: string; healed: boolean }
    | { ok: false; reason: string };

export async function ensureValidLencoAccountId(orgId: string): Promise<HealResult> {
    const { data: org } = await supabase
        .from('organizations')
        .select('id, name, lenco_subaccount_id, lenco_secret_key')
        .eq('id', orgId)
        .maybeSingle();
    if (!org?.lenco_subaccount_id) return { ok: false, reason: 'no Lenco account linked' };

    const stored = String(org.lenco_subaccount_id).trim();
    if (isLencoAccountId(stored)) return { ok: true, accountId: stored, healed: false };

    const key = (org as any).lenco_secret_key as string | undefined;
    if (!key) return { ok: false, reason: `account id "${stored}" is not a Lenco account id and the organization has no API key to look it up` };

    try {
        const accounts: any[] = (await LencoService.listAccounts(key)) || [];
        const matches = accounts.filter((a) =>
            String(a?.details?.tillNumber ?? '') === stored ||
            String(a?.details?.accountNumber ?? '') === stored ||
            String(a?.details?.merchantId ?? '') === stored ||
            String(a?.reference ?? '') === stored
        );
        // A till number identifies exactly one account. Anything else is ambiguous: don't guess with money.
        if (matches.length !== 1 || !isLencoAccountId(matches[0].id)) {
            return { ok: false, reason: `"${stored}" matches ${matches.length} Lenco account(s) — needs manual attention` };
        }
        const accountId = String(matches[0].id);

        // The new id must actually work with this organization's key before it replaces anything.
        await LencoService.getAccountBalance(accountId, key);

        const { data: updated } = await supabase
            .from('organizations')
            .update({ lenco_subaccount_id: accountId })
            .eq('id', orgId)
            .eq('lenco_subaccount_id', org.lenco_subaccount_id) // only if nobody changed it meanwhile
            .select('id');
        if (!updated || updated.length === 0) return { ok: false, reason: 'the link changed while repairing it' };

        // Keep the pool row in step so a later look at it tells the truth.
        await supabase.from('wallet_pool').update({ provider_account_id: accountId })
            .eq('linked_organization_id', orgId).eq('provider_account_id', stored);

        console.warn(`[LencoAccountLink] Repaired ${org.name} (${orgId.slice(0, 8)}): "${stored}" → ${accountId}`);
        return { ok: true, accountId, healed: true };
    } catch (e: any) {
        return { ok: false, reason: e?.message || 'could not verify the account with Lenco' };
    }
}
