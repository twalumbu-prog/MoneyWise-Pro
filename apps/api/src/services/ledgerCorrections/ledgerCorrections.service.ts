/**
 * Corrections to an external wallet's ledger against its bank statement (first use: Twalumbu's Zanaco wallet).
 *
 * Every change is: soft (nothing is deleted), audited (ledger_corrections), idempotent (re-running changes nothing),
 * reversible, and leaves QuickBooks alone — an entry already in QuickBooks is only flagged qb_resync_required.
 * Needs migration 20261104120000_ledger_deposit_corrections.sql.
 *
 * Functions take `apply: false` for a dry run and return what they WOULD do. Running balances are NOT recomputed per
 * entry: a caller changing many entries calls rebuildBalances() once at the end for each touched account.
 */
import { supabase } from '../../lib/supabase';
import { ledgerService } from '../ledger.service';
import { cashbookService } from '../cashbook.service';
import { isUnverified, isWalletAccountType, planFixDate, planUnverified } from './core';

export interface CorrectionCtx { actor: string; apply: boolean }
export interface CorrectionResult { entryId: string; outcome: 'APPLIED' | 'WOULD_APPLY' | 'NOOP' | 'NOT_FOUND'; detail: string; accountType?: string }

const UNVERIFIED_TAG = '[Unverified: no matching bank deposit found] ';

async function loadEntry(orgId: string, entryId: string) {
    const { data } = await supabase.from('cashbook_entries').select('*').eq('id', entryId).eq('organization_id', orgId).maybeSingle();
    return data as any | null;
}

/** One audit row per field change. The unique key makes a repeat a no-op; returns true when this call wrote it. */
export async function logCorrection(c: {
    orgId: string; entryId: string; field: string; oldValue: unknown; newValue: unknown; actionCode: string; reason?: string; sourceRef: string; actor: string;
}): Promise<boolean> {
    const { data, error } = await supabase.from('ledger_corrections').upsert({
        organization_id: c.orgId, entry_id: c.entryId, field: c.field,
        old_value: c.oldValue == null ? null : String(c.oldValue), new_value: c.newValue == null ? null : String(c.newValue),
        action_code: c.actionCode, reason: c.reason ?? null, source_ref: c.sourceRef, actor: c.actor,
    }, { onConflict: 'entry_id,field,action_code,source_ref', ignoreDuplicates: true }).select('id');
    if (error) throw new Error(`could not write the correction record: ${error.message}`);
    return (data ?? []).length > 0;
}

/** Rebuild the running balances of one account (a wallet id or a bucket name) from the very start. Call once after a batch. */
export async function rebuildBalances(orgId: string, accountType: string): Promise<void> {
    await cashbookService.recalculateBalancesFrom(orgId, '1900-01-01', '1900-01-01T00:00:00Z', accountType);
}

/** Set the entry's date to the bank's deposit date; the original is kept in recorded_date. */
export async function redateEntry(orgId: string, entryId: string, correctDate: string, sourceRef: string, reason: string, ctx: CorrectionCtx): Promise<CorrectionResult> {
    const e = await loadEntry(orgId, entryId);
    if (!e) return { entryId, outcome: 'NOT_FOUND', detail: 'entry not found in this organisation' };
    const plan = planFixDate(e, correctDate);
    if (plan.kind === 'NOOP') return { entryId, outcome: 'NOOP', detail: plan.reason };
    const detail = `${String(e.date).slice(0, 10)} -> ${plan.newDate}${plan.qbResync ? ' (already in QuickBooks: flagged for resync)' : ''}`;
    if (!ctx.apply) return { entryId, outcome: 'WOULD_APPLY', detail, accountType: e.account_type };

    const patch: Record<string, any> = { date: plan.newDate, recorded_date: plan.recordedDate };
    if (plan.qbResync) patch.qb_resync_required = true;
    // Guarded on the old date so two racing runs cannot both write.
    const { data: upd, error } = await supabase.from('cashbook_entries').update(patch).eq('id', entryId).eq('organization_id', orgId).eq('date', e.date).select('id');
    if (error) throw new Error(`re-date failed: ${error.message}`);
    if (!(upd ?? []).length) return { entryId, outcome: 'NOOP', detail: 'changed by someone else while running; left alone' };
    await logCorrection({ orgId, entryId, field: 'date', oldValue: String(e.date).slice(0, 10), newValue: plan.newDate, actionCode: 'FIX_DATE', reason, sourceRef, actor: ctx.actor });
    await ledgerService.repostForCashbookEntry(entryId);      // the journal date follows the entry's date
    return { entryId, outcome: 'APPLIED', detail, accountType: e.account_type };
}

/** Put the original date back (reverses redateEntry). */
export async function revertRedate(orgId: string, entryId: string, ctx: CorrectionCtx): Promise<CorrectionResult> {
    const e = await loadEntry(orgId, entryId);
    if (!e) return { entryId, outcome: 'NOT_FOUND', detail: 'entry not found' };
    if (!e.recorded_date) return { entryId, outcome: 'NOOP', detail: 'was never re-dated' };
    const detail = `${String(e.date).slice(0, 10)} -> ${String(e.recorded_date).slice(0, 10)} (original)`;
    if (!ctx.apply) return { entryId, outcome: 'WOULD_APPLY', detail, accountType: e.account_type };
    await supabase.from('cashbook_entries').update({ date: e.recorded_date, recorded_date: null }).eq('id', entryId).eq('organization_id', orgId);
    await supabase.from('ledger_corrections').update({ reverted_at: new Date().toISOString(), reverted_by: ctx.actor }).eq('entry_id', entryId).eq('field', 'date').is('reverted_at', null);
    await ledgerService.repostForCashbookEntry(entryId);
    return { entryId, outcome: 'APPLIED', detail, accountType: e.account_type };
}

/** Park an entry that has no bank deposit behind it. Zeroed (so balance, journal and reports ignore it); the amount is held, not lost. */
export async function markUnverified(orgId: string, entryId: string, note: string, sourceRef: string, ctx: CorrectionCtx): Promise<CorrectionResult> {
    const e = await loadEntry(orgId, entryId);
    if (!e) return { entryId, outcome: 'NOT_FOUND', detail: 'entry not found in this organisation' };
    const plan = planUnverified(e);
    if (plan.kind === 'NOOP') return { entryId, outcome: 'NOOP', detail: plan.reason };
    const detail = `K${plan.heldAmount.toFixed(2)} held out of the balance${plan.qbResync ? ' (already in QuickBooks: flagged for resync)' : ''}`;
    if (!ctx.apply) return { entryId, outcome: 'WOULD_APPLY', detail, accountType: e.account_type };

    const patch: Record<string, any> = {
        debit: 0, held_amount: plan.heldAmount, verification_status: 'UNVERIFIED', verification_note: note || null,
        description: `${UNVERIFIED_TAG}${e.description ?? ''}`.slice(0, 500),
    };
    if (plan.qbResync) patch.qb_resync_required = true;
    const { data: upd, error } = await supabase.from('cashbook_entries').update(patch).eq('id', entryId).eq('organization_id', orgId).is('verification_status', null).select('id');
    if (error) throw new Error(`mark Unverified failed: ${error.message}`);
    if (!(upd ?? []).length) return { entryId, outcome: 'NOOP', detail: 'changed by someone else while running; left alone' };
    await logCorrection({ orgId, entryId, field: 'debit', oldValue: plan.heldAmount, newValue: 0, actionCode: 'UNVERIFIED', reason: note, sourceRef, actor: ctx.actor });
    await ledgerService.repostForCashbookEntry(entryId);      // a zero-amount row has no journal
    return { entryId, outcome: 'APPLIED', detail, accountType: e.account_type };
}

/** Bring an Unverified entry back at its held amount (a deposit was found). Reverses markUnverified. */
export async function restoreUnverified(orgId: string, entryId: string, ctx: CorrectionCtx): Promise<CorrectionResult> {
    const e = await loadEntry(orgId, entryId);
    if (!e) return { entryId, outcome: 'NOT_FOUND', detail: 'entry not found' };
    if (!isUnverified(e) || !(Number(e.held_amount) > 0)) return { entryId, outcome: 'NOOP', detail: 'not Unverified' };
    const detail = `K${Number(e.held_amount).toFixed(2)} restored to the balance`;
    if (!ctx.apply) return { entryId, outcome: 'WOULD_APPLY', detail, accountType: e.account_type };
    const desc = String(e.description ?? '');
    await supabase.from('cashbook_entries').update({
        debit: e.held_amount, held_amount: null, verification_status: null, verification_note: null,
        description: desc.startsWith(UNVERIFIED_TAG) ? desc.slice(UNVERIFIED_TAG.length) : desc,
    }).eq('id', entryId).eq('organization_id', orgId);
    await supabase.from('ledger_corrections').update({ reverted_at: new Date().toISOString(), reverted_by: ctx.actor }).eq('entry_id', entryId).eq('action_code', 'UNVERIFIED').is('reverted_at', null);
    await ledgerService.repostForCashbookEntry(entryId);
    return { entryId, outcome: 'APPLIED', detail, accountType: e.account_type };
}

/**
 * Move an entry to another external wallet (e.g. "belongs to another account"). Recorded as a MANUAL move, which the Master Fees sync
 * then respects (it will not pull the entry back).
 */
export async function moveEntryToWallet(orgId: string, entryId: string, targetAccountType: string, sourceRef: string, reason: string, ctx: CorrectionCtx): Promise<CorrectionResult> {
    const e = await loadEntry(orgId, entryId);
    if (!e) return { entryId, outcome: 'NOT_FOUND', detail: 'entry not found in this organisation' };
    if (!isWalletAccountType(targetAccountType) && !['MASTERFEES_MANUAL', 'MASTERFEES', 'CASH', 'MONEYWISE_WALLET'].includes(targetAccountType)) return { entryId, outcome: 'NOOP', detail: 'unknown target account' };
    if (e.account_type === targetAccountType) return { entryId, outcome: 'NOOP', detail: 'already there' };
    const detail = `${e.account_type} -> ${targetAccountType}${e.status === 'ACCOUNTED' ? ' (already in QuickBooks: flagged for resync)' : ''}`;
    if (!ctx.apply) return { entryId, outcome: 'WOULD_APPLY', detail, accountType: e.account_type };
    const patch: Record<string, any> = { account_type: targetAccountType };
    if (e.status === 'ACCOUNTED') patch.qb_resync_required = true;
    const { error } = await supabase.from('cashbook_entries').update(patch).eq('id', entryId).eq('organization_id', orgId).eq('account_type', e.account_type);
    if (error) throw new Error(`move failed: ${error.message}`);
    await logCorrection({ orgId, entryId, field: 'account_type', oldValue: e.account_type, newValue: targetAccountType, actionCode: 'MOVE_WALLET', reason, sourceRef, actor: ctx.actor });
    await ledgerService.repostForCashbookEntry(entryId);      // the asset account the journal debits follows the wallet
    await rebuildBalances(orgId, e.account_type);
    await rebuildBalances(orgId, targetAccountType);
    return { entryId, outcome: 'APPLIED', detail, accountType: targetAccountType };
}

/** Link an entry to the bank statement line(s) of the deposit behind it. Idempotent. */
export async function linkEntryToStatementLines(
    orgId: string, walletId: string, entryId: string, statementExternalIds: string[], confidence: 'HIGH' | 'MEDIUM' | 'MANUAL', matchedBy: string, apply: boolean,
): Promise<{ linked: number; missingLines: string[] }> {
    if (!statementExternalIds.length) return { linked: 0, missingLines: [] };
    const { data: lines, error } = await supabase.from('bank_statement_lines').select('id, external_id').eq('external_wallet_id', walletId).in('external_id', statementExternalIds);
    if (error) throw new Error(`could not look up statement lines: ${error.message}`);
    const found = new Map((lines ?? []).map((l: any) => [l.external_id, l.id]));
    const missingLines = statementExternalIds.filter(x => !found.has(x));
    if (!apply) return { linked: found.size, missingLines };
    const rows = [...found.values()].map(lineId => ({ organization_id: orgId, ledger_entry_id: entryId, statement_line_id: lineId, match_confidence: confidence, matched_by: matchedBy }));
    if (rows.length) {
        const { error: insErr } = await supabase.from('ledger_entry_statement_lines').upsert(rows, { onConflict: 'ledger_entry_id,statement_line_id', ignoreDuplicates: true });
        if (insErr) throw new Error(`could not link statement lines: ${insErr.message}`);
    }
    return { linked: rows.length, missingLines };
}

/** Add an entry to the review queue (idempotent on entry + action). */
export async function queueForReview(orgId: string, entryId: string, actionCode: string, proposed: Record<string, unknown>, notes: string, apply: boolean): Promise<boolean> {
    if (!apply) return true;
    const { data, error } = await supabase.from('ledger_correction_queue').upsert(
        { organization_id: orgId, entry_id: entryId, action_code: actionCode, proposed, notes: notes || null },
        { onConflict: 'entry_id,action_code', ignoreDuplicates: true },
    ).select('id');
    if (error) throw new Error(`could not queue for review: ${error.message}`);
    return (data ?? []).length > 0;
}

/** True when a person (not the sync) moved this entry, so the Master Fees sync must not move it back. */
export async function hasManualMove(entryId: string): Promise<boolean> {
    const { data } = await supabase.from('ledger_corrections').select('id').eq('entry_id', entryId).eq('action_code', 'MOVE_WALLET').is('reverted_at', null).limit(1);
    return (data ?? []).length > 0;
}
