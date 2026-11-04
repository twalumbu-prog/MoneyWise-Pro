/**
 * Pure decisions for correcting an external wallet's ledger against its bank statement (no database, no network).
 * Used by ledgerCorrections.service (the corrections themselves) and by the Master Fees sync (so a re-sync never undoes one).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** cashbook_entries.account_type holds the external wallet's id for entries that live on a per-bank wallet. */
export const isWalletAccountType = (accountType: string | null | undefined): boolean => UUID_RE.test(String(accountType ?? ''));

export const isUnverified = (e: { verification_status?: string | null }): boolean => String(e.verification_status ?? '').toUpperCase() === 'UNVERIFIED';

export const isValidDay = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

export type FixDatePlan =
    | { kind: 'NOOP'; reason: string }
    | { kind: 'APPLY'; newDate: string; recordedDate: string; qbResync: boolean };

/**
 * Re-date an entry to the bank's deposit date. Idempotent: an entry already on that date is left alone. The original date is kept in
 * recorded_date the FIRST time only, so applying twice (or re-dating again) never loses the true original.
 */
export function planFixDate(
    entry: { date: string; recorded_date?: string | null; status?: string | null; verification_status?: string | null },
    correctDate: string,
): FixDatePlan {
    if (!isValidDay(correctDate)) return { kind: 'NOOP', reason: 'invalid correct date' };
    if (isUnverified(entry)) return { kind: 'NOOP', reason: 'entry is Unverified; resolve it first' };
    if (String(entry.date).slice(0, 10) === correctDate) return { kind: 'NOOP', reason: 'already on the deposit date' };
    return {
        kind: 'APPLY',
        newDate: correctDate,
        recordedDate: (entry.recorded_date && String(entry.recorded_date).slice(0, 10)) || String(entry.date).slice(0, 10),
        qbResync: String(entry.status ?? '').toUpperCase() === 'ACCOUNTED',
    };
}

export type UnverifiedPlan =
    | { kind: 'NOOP'; reason: string }
    | { kind: 'APPLY'; heldAmount: number; qbResync: boolean };

/** Park an entry that has no deposit behind it: zero it (the repo's neutralise convention) and remember the amount. Idempotent. */
export function planUnverified(entry: { debit: number | string | null; credit?: number | string | null; status?: string | null; verification_status?: string | null }): UnverifiedPlan {
    if (isUnverified(entry)) return { kind: 'NOOP', reason: 'already Unverified' };
    const debit = Number(entry.debit ?? 0), credit = Number(entry.credit ?? 0);
    if (credit !== 0) return { kind: 'NOOP', reason: 'not an inflow' };
    if (!(debit > 0)) return { kind: 'NOOP', reason: 'amount is already zero' };
    return { kind: 'APPLY', heldAmount: Math.round(debit * 100) / 100, qbResync: String(entry.status ?? '').toUpperCase() === 'ACCOUNTED' };
}

export type WalletMoveDecision = { move: true } | { move: false; reason: string };

/**
 * Master Fees changed a manual payment's channel (e.g. Natsave → Zanaco bank): should the sync move its entry to the new wallet?
 * Never when a person already decided where it lives, when it was matched to a bank statement, or when it is parked as Unverified.
 */
export function decideWalletMove(i: {
    lencoProcessed: boolean;
    currentAccountType: string | null | undefined;
    resolvedAccountType: string;
    hasBankStatementReference: boolean;
    unverified: boolean;
    hasManualMove: boolean;
}): WalletMoveDecision {
    if (i.lencoProcessed) return { move: false, reason: 'Lenco-processed payment: the gateway is authoritative' };
    if (!isWalletAccountType(i.currentAccountType)) return { move: false, reason: 'entry is not on a per-bank wallet (handled by the bucket-routing rules)' };
    if (!isWalletAccountType(i.resolvedAccountType)) return { move: false, reason: 'no dedicated wallet for the new channel; never move an entry off a wallet into a generic bucket' };
    if (i.resolvedAccountType === i.currentAccountType) return { move: false, reason: 'already on the right wallet' };
    if (i.hasBankStatementReference) return { move: false, reason: 'matched to a bank statement; reconciliation is authoritative' };
    if (i.unverified) return { move: false, reason: 'entry is Unverified' };
    if (i.hasManualMove) return { move: false, reason: 'a person moved this entry; the sync respects that' };
    return { move: true };
}

/** Did the Master Fees channel of an already-synced payment change? (account_name / payment_method differ from what we stored.) */
export function channelChanged(
    prior: { prior_account_name?: string | null; prior_payment_method?: string | null } | undefined,
    live: { account_name?: string | null; payment_method?: string | null },
): boolean {
    if (!prior) return false;
    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
    // A record stored before we kept these fields has neither: treat as unchanged rather than re-examining every old payment.
    if (prior.prior_account_name == null && prior.prior_payment_method == null) return false;
    return norm(prior.prior_account_name) !== norm(live.account_name) || norm(prior.prior_payment_method) !== norm(live.payment_method);
}
