/**
 * collectionRecovery.service.ts — make sure a paid mobile-money collection ends up in the books.
 *
 * The happy path is the app's long-poll seeing Lenco report "successful" and calling
 * /public-collection-finalize. But a payer can close the app, lose signal or take longer than the
 * poll window, and then the money has arrived at Lenco while the PENDING intent is never finalised.
 * The webhook and the 5-minute sync are the backstops; this is a third one any server path can call
 * directly (savings contributions, investments, the automations tick): ask Lenco about the reference
 * and, if it was paid, run the exact same finaliser the webhook uses. Idempotent.
 */
import { supabase } from '../lib/supabase';
import { LencoService } from './lenco.service';
import { getCachedOrgSecretKey } from '../lib/orgSecretKeyCache';
import { handleCollectionSuccessful } from '../controllers/lenco.webhook.controller';

export type CollectionOutcome = 'finalized' | 'pending' | 'failed' | 'unknown';

async function finalizedEntry(reference: string, organizationId: string) {
    const { data } = await supabase
        .from('cashbook_entries')
        .select('id, status, debit')
        .eq('organization_id', organizationId)
        .eq('external_reference', reference)
        .neq('status', 'PENDING')
        .gt('debit', 0)
        .limit(1);
    return data?.[0] ?? null;
}

export async function finalizeIfPaid(reference: string, organizationId: string): Promise<CollectionOutcome> {
    if (await finalizedEntry(reference, organizationId)) return 'finalized';

    let secretKey: string | undefined;
    try { secretKey = await getCachedOrgSecretKey(organizationId); } catch { /* fall back to the default key */ }

    let status: any;
    try {
        status = await LencoService.getCollectionStatus(reference, secretKey);
    } catch (e: any) {
        console.warn(`[CollectionRecovery] Lenco lookup failed for ${reference}: ${e.message}`);
        return 'unknown';
    }
    if (!status) return 'pending';
    if (status.status === 'failed') return 'failed';
    if (status.status !== 'successful') return 'pending';

    try {
        await handleCollectionSuccessful(status, organizationId);
    } catch (e: any) {
        console.error(`[CollectionRecovery] finalising ${reference} failed:`, e.message);
    }
    return (await finalizedEntry(reference, organizationId)) ? 'finalized' : 'unknown';
}

/**
 * Sweep for in-app mobile-money deposits whose app never finalised them (closed mid-wait, lost
 * signal, a request suspended while the payer approved the PIN prompt). Picks recent PENDING
 * intents with app-generated references and books the ones Lenco reports as paid. Runs on the
 * automations tick; bounded by count and time so it never crowds the tick.
 */
export async function sweepPendingDeposits(budgetMs = 8000): Promise<{ checked: number; finalized: number }> {
    const startedAt = Date.now();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const settledBefore = new Date(Date.now() - 45 * 1000).toISOString(); // let the live app finish first
    const { data } = await supabase
        .from('cashbook_entries')
        .select('external_reference, organization_id, created_at')
        .eq('status', 'PENDING')
        .like('description', 'PENDING_INTENT%')
        .gt('debit', 0)
        .gte('created_at', since)
        .lte('created_at', settledBefore)
        .or('external_reference.like.DEP-%,external_reference.like.CHG-%')
        .order('created_at', { ascending: false })
        .limit(12);

    let checked = 0;
    let finalized = 0;
    for (const row of data || []) {
        if (Date.now() - startedAt > budgetMs) break;
        if (!row.external_reference || !row.organization_id) continue;
        checked++;
        const outcome = await finalizeIfPaid(row.external_reference, row.organization_id).catch(() => 'unknown' as const);
        if (outcome === 'finalized') {
            finalized++;
            console.log(`[CollectionRecovery] Swept and booked ${row.external_reference}`);
        }
    }
    return { checked, finalized };
}
