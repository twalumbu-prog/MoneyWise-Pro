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

/**
 * finalized — paid and booked | pending — still waiting on the payer | failed — Lenco says it failed /
 * expired / was cancelled | notfound — Lenco has no such collection (the charge was never sent) |
 * unknown — couldn't tell (network / Lenco error): never act on this.
 */
export type CollectionOutcome = 'finalized' | 'pending' | 'failed' | 'notfound' | 'unknown';

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
        // Lenco answers "not found" for a reference it never received (our intent was logged, the
        // charge was never fired). That is a definite answer, unlike a network or 5xx error.
        if (/not found/i.test(String(e?.message || ''))) return 'notfound';
        console.warn(`[CollectionRecovery] Lenco lookup failed for ${reference}: ${e.message}`);
        return 'unknown';
    }
    if (!status) return 'notfound';
    const st = String(status.status || '').toLowerCase();
    if (st === 'failed' || st === 'expired' || st === 'cancelled' || st === 'canceled') return 'failed';
    if (st !== 'successful') return 'pending';

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
export async function sweepPendingDeposits(
    budgetMs = 8000,
    organizationId?: string,
    minAgeMs = 45_000,
    opts: { discardAfterMs?: number; lookbackMs?: number } = {}
): Promise<{ checked: number; finalized: number; discarded: number }> {
    const startedAt = Date.now();
    const since = new Date(Date.now() - (opts.lookbackMs ?? 24 * 60 * 60 * 1000)).toISOString();
    const settledBefore = new Date(Date.now() - minAgeMs).toISOString(); // let the live app finish first
    let query = supabase
        .from('cashbook_entries')
        .select('id, external_reference, organization_id, created_at')
        .eq('status', 'PENDING')
        .like('description', 'PENDING_INTENT%')
        .gt('debit', 0)
        .gte('created_at', since)
        .lte('created_at', settledBefore)
        .or('external_reference.like.DEP-%,external_reference.like.CHG-%')
        .order('created_at', { ascending: false })
        .limit(12);
    if (organizationId) query = query.eq('organization_id', organizationId);
    const { data } = await query;

    let checked = 0;
    let finalized = 0;
    let discarded = 0;
    for (const row of data || []) {
        if (Date.now() - startedAt > budgetMs) break;
        if (!row.external_reference || !row.organization_id) continue;
        checked++;
        const outcome = await finalizeIfPaid(row.external_reference, row.organization_id).catch(() => 'unknown' as const);
        if (outcome === 'finalized') {
            finalized++;
            console.log(`[CollectionRecovery] Swept and booked ${row.external_reference}`);
        } else if ((outcome === 'failed' || outcome === 'notfound') && opts.discardAfterMs !== undefined) {
            // Only a definite "didn't go through" from Lenco, and only once the payer has had time to
            // approve — a live prompt reads as pending, never as failed/not-found.
            if (Date.now() - Date.parse(row.created_at) < opts.discardAfterMs) continue;
            const { data: removed } = await supabase
                .from('cashbook_entries')
                .delete()
                .eq('id', row.id)
                .eq('status', 'PENDING')
                .select('id');
            if (removed && removed.length > 0) {
                discarded++;
                await supabase
                    .from('product_sales')
                    .update({ status: 'FAILED', updated_at: new Date().toISOString() })
                    .eq('organization_id', row.organization_id)
                    .eq('reference', row.external_reference)
                    .eq('status', 'PENDING');
                console.log(`[CollectionRecovery] Removed dead intent ${row.external_reference} (Lenco: ${outcome}).`);
            }
        }
    }
    return { checked, finalized, discarded };
}
