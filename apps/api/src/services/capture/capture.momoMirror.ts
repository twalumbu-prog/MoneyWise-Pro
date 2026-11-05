/**
 * Mirrors MoMo Capture rows into the shared review queue. MoMo Capture keeps parsing, matching and booking exactly as
 * before; this only reflects each row as a transaction_captures row. Never throws: a mirror failure must not affect
 * what MoMo Capture books.
 */
import { supabase } from '../../lib/supabase';
import { describe, type ParsedMomoMessage } from '../momoCapture/parser';
import { getCaptureSettings } from './capture.settings';
import { captureDedupeKey, mirrorStatus, lusakaDate } from './capture.logic';

/**
 * The ledger entry a queue capture already booked for this MoMo confirmation, if any. Any failure (including the
 * capture tables not existing yet) returns null, so MoMo Capture carries on booking exactly as it always has.
 */
export async function findBookedCaptureEntry(orgId: string, momoDedupeKey: string): Promise<string | null> {
    try {
        const { data } = await supabase.from('transaction_captures').select('cashbook_entry_id')
            .eq('organization_id', orgId).eq('dedupe_key', captureDedupeKey({ momoRowKey: momoDedupeKey }))
            .is('momo_capture_id', null).not('cashbook_entry_id', 'is', null).maybeSingle();
        return data?.cashbook_entry_id ?? null;
    } catch {
        return null;
    }
}

export async function mirrorMomoCapture(row: any, opts: { autoPosted?: boolean } = {}): Promise<void> {
    try {
        if (!row?.id || !row.organization_id) return;
        if (!(await getCaptureSettings(row.organization_id)).enabled) return;

        const orgId = row.organization_id as string;
        const dedupe = captureDedupeKey({ momoRowKey: row.dedupe_key });
        const status = mirrorStatus(row.status, !!opts.autoPosted);
        const now = new Date().toISOString();

        const { data: byMomo } = await supabase.from('transaction_captures').select('*')
            .eq('organization_id', orgId).eq('momo_capture_id', row.id).maybeSingle();
        const { data: byKey } = byMomo ? { data: null } : await supabase.from('transaction_captures').select('*')
            .eq('organization_id', orgId).eq('dedupe_key', dedupe).maybeSingle();
        const prior: any = byMomo ?? byKey ?? null;

        // A screenshot of this same confirmation was already booked through the queue: keep that booking.
        // The provider's SMS now backs it up, and ingest has already stored the row as MATCHED to that entry.
        if (prior && !prior.momo_capture_id && prior.cashbook_entry_id) {
            await supabase.from('transaction_captures').update({
                claim_state: 'CORROBORATED',
                source_ids: Array.from(new Set([...(prior.source_ids || []), row.id])), updated_at: now,
            }).eq('id', prior.id).eq('organization_id', orgId);
            return;
        }

        const fields: Record<string, any> = {
            momo_capture_id: row.id,
            claim_state: 'CORROBORATED',
            status: prior?.status === 'AUTO_POSTED' && status === 'APPROVED' ? 'AUTO_POSTED' : status,
            cashbook_entry_id: row.cashbook_entry_id ?? null,
            match_type: row.status === 'MATCHED' ? 'LENCO_ENTRY' : (prior?.match_type ?? 'NONE'),
            matched_cashbook_entry_id: row.status === 'MATCHED' ? row.matched_entry_id ?? null : (prior?.matched_cashbook_entry_id ?? null),
            posted_at: row.status === 'POSTED' ? (prior?.posted_at ?? now) : prior?.posted_at ?? null,
            updated_at: now,
        };

        const write = async (f: Record<string, any>) => prior
            ? supabase.from('transaction_captures').update({
                ...f, source_ids: Array.from(new Set([...(prior.source_ids || []), row.id])),
            }).eq('id', prior.id).eq('organization_id', orgId)
            : supabase.from('transaction_captures').insert({
                ...f,
                organization_id: orgId, source: 'MOMO_SMS', source_ids: [row.id], dedupe_key: dedupe, created_by: row.user_id ?? null,
                direction: row.direction, amount: row.amount, currency: 'ZMW', zmw_amount: row.amount,
                occurred_at: row.occurred_at, occurred_on: row.occurred_at ? lusakaDate(row.occurred_at) : null,
                counterparty_name: row.counterparty ?? null, payment_method: 'MOMO_PERSONAL',
                intent: row.direction === 'IN' ? 'PAYMENT_PROOF' : 'PURCHASE', confidence: 1, model: 'momo-parser', deterministic: true,
                evidence_summary: describe({ ...row, direction: row.direction, counterparty: row.counterparty } as ParsedMomoMessage),
            });

        let { error } = await write(fields);
        // The one-to-one index refused the Lenco match MoMo made: keep the row, drop the match, send it to review.
        if (error?.code === '23505' && fields.matched_cashbook_entry_id) {
            ({ error } = await write({ ...fields, match_type: 'NONE', matched_cashbook_entry_id: null, status: 'NEEDS_REVIEW', flags: ['MATCH_CONFLICT'] }));
        }
        if (error) {
            console.error('[Capture] MoMo mirror failed:', error.message);
        }
    } catch (e: any) {
        console.error('[Capture] MoMo mirror failed:', e?.message);
    }
}
