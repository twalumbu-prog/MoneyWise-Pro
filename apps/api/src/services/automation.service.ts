/**
 * automation.service.ts — Runs the automations users set up in Intelligence.
 *
 * An automation is `trigger → actions`, stored as data (see the automations
 * migration). The engine here is what makes it "always run the same":
 *
 *   • Exactly once per deposit. A run claims its trigger by inserting a row with
 *     trigger_ref = the deposit's Lenco reference (or cashbook entry id); a partial
 *     unique index makes a second claim on the same deposit fail, so overlapping ticks / a Run-now click
 *     racing the cron can never pay a deposit out twice.
 *   • Payouts go through the SAME disbursement path as a person pressing
 *     "Disburse" (requisition → AUTHORISED → disburseRequisition), so ledger
 *     entries, Lenco fees, status polling and audit trail are identical. The
 *     automation only automates the clicking.
 *   • Failures are recorded, retried a bounded number of times, and shown in the
 *     run history. A payout is never re-sent blindly: the disburse handler is
 *     idempotent per requisition, and retries reuse the run's requisition.
 *   • The Proof of Payment email goes out only after the transfer is confirmed,
 *     and at most once (pop_sent_at claimed atomically before sending).
 *
 * To add a trigger or action: extend the union types below and add a case in
 * `findTriggerEvents` / `executeActions`. No schema change needed.
 */

import { supabase } from '../lib/supabase';
import { cashbookService } from './cashbook.service';
import { emailService } from './email.service';
import { LencoService } from './lenco.service';
import { disburseRequisition } from '../controllers/disbursement.controller';
import { processDueScheduledItems, syncScheduledRunStatuses } from './schedule.service';

// ── Types ────────────────────────────────────────────────────────────────────

export type FeeMode = 'AUTO' | 'DEDUCT' | 'WALLET';

export interface ForwardPaymentAction {
    type: 'FORWARD_PAYMENT';
    recipient_account: string;
    recipient_bank_code: string;
    /** Display only — recipient_bank_code is what Lenco is called with. */
    recipient_bank_name?: string;
    recipient_name: string;
    payment_method: 'BANK_TRANSFER';
    /**
     * Who pays Lenco's payout fee.
     *  WALLET — wallet pays on top, recipient gets the full deposit.
     *  DEDUCT — fee comes out of the transfer, wallet nets to exactly zero.
     *  AUTO   — WALLET when the wallet can cover it, otherwise DEDUCT.
     */
    fee_mode?: FeeMode;
}

export interface SendPopEmailAction {
    type: 'SEND_POP_EMAIL';
    to: string;
}

export type AutomationAction = ForwardPaymentAction | SendPopEmailAction;

export interface TriggerConfig {
    wallet_id: string;
    min_amount?: number;
    entry_types?: string[];
}

export interface Automation {
    id: string;
    organization_id: string;
    created_by: string;
    name: string;
    description: string | null;
    status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
    trigger_type: 'WALLET_DEPOSIT';
    trigger_config: TriggerConfig;
    actions: AutomationAction[];
    watch_from: string;
    last_run_at: string | null;
    created_at: string;
    updated_at: string;
}

interface RunRow {
    id: string;
    automation_id: string;
    organization_id: string;
    source: 'AUTO' | 'MANUAL';
    trigger_ref: string | null;
    trigger_summary: string | null;
    amount: number | string | null;
    forwarded_amount: number | string | null;
    status: 'RUNNING' | 'AWAITING_CONFIRMATION' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
    attempts: number;
    steps: RunStep[];
    error: string | null;
    requisition_id: string | null;
    pop_sent_at: string | null;
    started_at: string;
    finished_at: string | null;
}

interface RunStep {
    step: string;
    status: 'ok' | 'failed' | 'pending' | 'info';
    detail: string;
    at: string;
}

export interface RunSummary {
    checked: number;
    newDeposits: number;
    started: number;
    retried: number;
    settled: number;
    failed: number;
    errors: string[];
}

const MAX_ATTEMPTS = 3;
/** A failed run is retried no sooner than this after it failed. */
const RETRY_AFTER_MS = 2 * 60_000;
/** A RUNNING row older than this belongs to an invocation that died. */
const STALE_RUNNING_MS = 5 * 60_000;
const DEFAULT_ENTRY_TYPES = ['INFLOW', 'ADJUSTMENT'];
/** Deposit statuses that mean the money is actually in the wallet. */
const SETTLED_DEPOSIT_STATUSES = ['COMPLETED', 'UNACCOUNTED', 'ACCOUNTED'];
/** Requisition states that mean the payout has not been confirmed (yet). */
const UNCONFIRMED_REQ_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'AUTHORISED', 'PROCESSING', 'REJECTED'];

const money = (n: number) =>
    `K${Number(n).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const now = () => new Date().toISOString();

const step = (name: string, status: RunStep['status'], detail: string): RunStep => ({
    step: name, status, detail, at: now(),
});

// ── Run bookkeeping ──────────────────────────────────────────────────────────

async function saveRun(run: RunRow, patch: Partial<RunRow>) {
    Object.assign(run, patch);
    const { error } = await supabase.from('automation_runs').update(patch as any).eq('id', run.id);
    if (error) console.error(`[Automations] Could not save run ${run.id}:`, error.message);
}

async function failRun(run: RunRow, message: string, extra?: RunStep) {
    await saveRun(run, {
        status: 'FAILED',
        error: message,
        finished_at: now(),
        steps: [...run.steps, ...(extra ? [extra] : []), step('run', 'failed', message)],
    });
}

// ── Trigger: wallet deposit ──────────────────────────────────────────────────

/**
 * Deposits that arrived after the automation was created and haven't been
 * claimed by a run yet. `PENDING` collections are excluded — they count once
 * the sync flips them to COMPLETED, and the unique claim keeps that safe.
 */
async function findNewDeposits(automation: Automation, limit = 25) {
    const cfg = automation.trigger_config;
    if (!cfg?.wallet_id) return [];

    let query = supabase
        .from('cashbook_entries')
        .select('id, debit, description, reference_number, sender_name, entry_type, date, created_at, external_reference')
        .eq('organization_id', automation.organization_id)
        .eq('wallet_id', cfg.wallet_id)
        .eq('account_type', 'MONEYWISE_WALLET')
        .in('entry_type', cfg.entry_types?.length ? cfg.entry_types : DEFAULT_ENTRY_TYPES)
        .in('status', SETTLED_DEPOSIT_STATUSES)
        .gt('debit', 0)
        .eq('credit', 0)
        .gt('created_at', automation.watch_from)
        .order('created_at', { ascending: true })
        .limit(200);

    if (cfg.min_amount && cfg.min_amount > 0) query = query.gte('debit', cfg.min_amount);

    const { data: entries, error } = await query;
    if (error) throw new Error(`Could not read deposits: ${error.message}`);
    if (!entries?.length) return [];

    // The claim key is the Lenco reference when there is one, not the row id: the
    // ledger has produced duplicate rows for a single Lenco transaction before, and
    // paying a deposit out twice is not recoverable while skipping a duplicate is.
    const keyed = new Map<string, (typeof entries)[number]>();
    for (const e of entries) {
        const key = depositKey(e);
        if (!keyed.has(key)) keyed.set(key, e);
    }

    const { data: claimed } = await supabase
        .from('automation_runs')
        .select('trigger_ref')
        .eq('automation_id', automation.id)
        .in('trigger_ref', [...keyed.keys()]);

    const done = new Set((claimed ?? []).map(r => r.trigger_ref));
    return [...keyed.entries()].filter(([key]) => !done.has(key)).map(([, e]) => e).slice(0, limit);
}

const depositKey = (e: { id: string; external_reference?: string | null }) =>
    e.external_reference ? `ref:${e.external_reference}` : `entry:${e.id}`;

function describeDeposit(e: { debit: any; description: string | null; sender_name: string | null }) {
    const who = e.sender_name || e.description || 'Deposit';
    return `${money(Number(e.debit))} — ${who}`.slice(0, 200);
}

// ── Action: forward payment ──────────────────────────────────────────────────

/**
 * Money already promised to earlier payouts that haven't hit the ledger yet.
 * An async Lenco transfer only reduces the wallet balance once it is confirmed,
 * so without this a burst of deposits would each see the same (too high) balance.
 */
async function inFlightOutflow(organizationId: string, walletId: string, excludeRunId: string): Promise<number> {
    const { data } = await supabase
        .from('automation_runs')
        .select('id, forwarded_amount, automations!inner(trigger_config)')
        .eq('organization_id', organizationId)
        .eq('status', 'AWAITING_CONFIRMATION')
        .neq('id', excludeRunId);

    let total = 0;
    for (const r of data ?? []) {
        if ((r as any).automations?.trigger_config?.wallet_id !== walletId) continue;
        const amt = Number(r.forwarded_amount) || 0;
        total += amt + LencoService.calculatePayoutFee(amt, 'BANK_TRANSFER');
    }
    return total;
}

interface Plan { transfer: number; fee: number; mode: 'WALLET' | 'DEDUCT' }

function planTransfer(amount: number, balance: number, mode: FeeMode): Plan | { error: string } {
    const feeOnFull = LencoService.calculatePayoutFee(amount, 'BANK_TRANSFER');

    const chosen: 'WALLET' | 'DEDUCT' =
        mode === 'AUTO' ? (balance >= amount + feeOnFull ? 'WALLET' : 'DEDUCT') : mode;

    if (chosen === 'WALLET') {
        if (balance < amount + feeOnFull) {
            return { error: `Wallet has ${money(balance)} available but ${money(amount + feeOnFull)} is needed (${money(amount)} + ${money(feeOnFull)} transfer fee).` };
        }
        return { transfer: amount, fee: feeOnFull, mode: 'WALLET' };
    }

    const transfer = round2(amount - feeOnFull);
    if (transfer <= 0) {
        return { error: `Deposit of ${money(amount)} is too small to cover the ${money(feeOnFull)} transfer fee.` };
    }
    const fee = LencoService.calculatePayoutFee(transfer, 'BANK_TRANSFER');
    if (balance < transfer + fee) {
        return { error: `Wallet has ${money(balance)} available but ${money(transfer + fee)} is needed.` };
    }
    return { transfer, fee, mode: 'DEDUCT' };
}

/** Runs disburseRequisition without an HTTP request and captures its response. */
async function invokeDisburse(
    user: { id: string; organization_id: string },
    requisitionId: string,
    body: Record<string, any>
): Promise<{ status: number; body: any }> {
    let status = 200;
    let payload: any;
    const res: any = {
        status(code: number) { status = code; return res; },
        json(b: any) { payload = b; return res; },
        send(b: any) { payload = b; return res; },
    };
    const req: any = {
        params: { id: requisitionId },
        body,
        headers: {},
        user: { id: user.id, organization_id: user.organization_id, role: 'ADMIN', name: 'Automation' },
    };
    await disburseRequisition(req, res);
    return { status, body: payload };
}

async function ensureRequisition(
    automation: Automation,
    action: ForwardPaymentAction,
    run: RunRow,
    transfer: number
): Promise<string> {
    if (run.requisition_id) return run.requisition_id;

    const { data: requisition, error } = await supabase
        .from('requisitions')
        .insert({
            organization_id: automation.organization_id,
            requestor_id: automation.created_by,
            estimated_total: transfer,
            status: 'AUTHORISED',
            description: `Automation "${automation.name}": forward ${run.trigger_summary ?? money(transfer)}`.slice(0, 500),
            payment_method: action.payment_method,
            recipient_account: action.recipient_account,
            recipient_bank_code: action.recipient_bank_code,
            recipient_name: action.recipient_name,
            wallet_id: automation.trigger_config.wallet_id,
        })
        .select('id')
        .single();

    if (error || !requisition) throw new Error(`Could not create the payout requisition: ${error?.message ?? 'no row returned'}`);

    // Saved straight away so a retry reuses this requisition instead of making a second.
    await saveRun(run, { requisition_id: requisition.id });

    const { data: ref } = await supabase.rpc('generate_sequential_reference', {
        p_org_id: automation.organization_id,
        p_entity_type: 'REQUISITION',
        p_prefix: 'REQ',
    });
    if (ref) await supabase.from('requisitions').update({ reference_number: ref }).eq('id', requisition.id);

    await supabase.from('requisition_messages').insert({
        requisition_id: requisition.id,
        user_id: automation.created_by,
        content: `Automatically authorised by the automation "${automation.name}".`,
        type: 'SYSTEM',
        metadata: { status: 'AUTHORISED', automation_id: automation.id, automation_run_id: run.id },
    });

    return requisition.id;
}

async function forwardPayment(automation: Automation, action: ForwardPaymentAction, run: RunRow): Promise<void> {
    const walletId = automation.trigger_config.wallet_id;
    const amount = Number(run.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Run has no valid amount to forward.');

    // A retry may already have a disbursement (the first attempt got as far as
    // Lenco). Never re-plan or re-send in that case — just move on to confirmation.
    if (run.requisition_id) {
        const { data: existing } = await supabase
            .from('disbursements')
            .select('id')
            .eq('requisition_id', run.requisition_id)
            .maybeSingle();
        if (existing) {
            await saveRun(run, {
                status: 'AWAITING_CONFIRMATION',
                steps: [...run.steps, step('forward_payment', 'info', 'Transfer had already been sent; waiting for confirmation.')],
            });
            return;
        }
    }

    const [balance, reserved] = await Promise.all([
        cashbookService.getCurrentBalance(automation.organization_id, 'MONEYWISE_WALLET', walletId),
        inFlightOutflow(automation.organization_id, walletId, run.id),
    ]);
    const plan = planTransfer(amount, balance - reserved, action.fee_mode ?? 'AUTO');
    if ('error' in plan) throw new Error(plan.error);

    const requisitionId = await ensureRequisition(automation, action, run, plan.transfer);

    // A retry may plan a different amount than the first attempt did.
    await supabase.from('requisitions').update({ estimated_total: plan.transfer }).eq('id', requisitionId).eq('status', 'AUTHORISED');

    const result = await invokeDisburse(
        { id: automation.created_by, organization_id: automation.organization_id },
        requisitionId,
        {
            payment_method: action.payment_method,
            total_prepared: plan.transfer,
            recipient_account: action.recipient_account,
            recipient_bank_code: action.recipient_bank_code,
            recipient_account_name: action.recipient_name,
            wallet_id: walletId,
        }
    );

    if (result.status >= 400) {
        throw new Error(result.body?.error || result.body?.details || `Disbursement failed (HTTP ${result.status})`);
    }

    const feeNote = plan.mode === 'DEDUCT'
        ? `${money(plan.fee)} transfer fee taken out of the amount`
        : `${money(plan.fee)} transfer fee paid from the wallet`;

    await saveRun(run, {
        status: 'AWAITING_CONFIRMATION',
        forwarded_amount: plan.transfer,
        steps: [
            ...run.steps,
            step(
                'forward_payment',
                'ok',
                `Sent ${money(plan.transfer)} to ${action.recipient_name} (${action.recipient_account}). ${feeNote}.`
            ),
        ],
    });
}

// ── Confirmation + Proof of Payment ──────────────────────────────────────────

/**
 * Moves an AWAITING_CONFIRMATION run forward: once the payout is confirmed,
 * sends the Proof of Payment and completes the run. Returns true if it finished.
 */
async function settleRun(automation: Automation, run: RunRow): Promise<boolean> {
    if (!run.requisition_id) {
        await failRun(run, 'Run is awaiting confirmation but has no payout linked to it.');
        return true;
    }

    const [{ data: requisition }, { data: disbursement, error: disbError }] = await Promise.all([
        supabase.from('requisitions').select('status').eq('id', run.requisition_id).maybeSingle(),
        supabase
            .from('disbursements')
            .select('id, total_prepared, payment_method, recipient_account, recipient_account_name, external_reference, issued_at')
            .eq('requisition_id', run.requisition_id)
            .maybeSingle(),
    ]);

    // A failed lookup says nothing about the transfer — never read it as "rolled back".
    if (disbError) return false;

    // Lenco rejected the transfer and the disbursement was rolled back.
    if (!disbursement) {
        await failRun(run, 'The transfer was not completed (it was rolled back). It will be retried.');
        return true;
    }

    if (!requisition || UNCONFIRMED_REQ_STATUSES.includes(requisition.status)) return false;

    const pop = automation.actions.find((a): a is SendPopEmailAction => a.type === 'SEND_POP_EMAIL');
    if (pop?.to && !run.pop_sent_at) {
        // Claim first, send second: two overlapping ticks can't both email.
        const { data: claimed } = await supabase
            .from('automation_runs')
            .update({ pop_sent_at: now() })
            .eq('id', run.id)
            .is('pop_sent_at', null)
            .select('id')
            .maybeSingle();

        if (claimed) {
            try {
                const { data: org } = await supabase.from('organizations').select('name').eq('id', automation.organization_id).maybeSingle();
                await emailService.sendScheduledProofOfPayment({
                    to: pop.to,
                    orgName: org?.name || 'Your Organization',
                    scheduleTitle: automation.name,
                    amount: Number(run.forwarded_amount) || Number(disbursement.total_prepared) || 0,
                    recipientName: disbursement.recipient_account_name || null,
                    recipientAccount: disbursement.recipient_account || null,
                    paymentMethod: disbursement.payment_method || null,
                    txRef: disbursement.external_reference || null,
                    transactedAt: disbursement.issued_at ? new Date(disbursement.issued_at) : new Date(),
                });
                run.pop_sent_at = now();
                run.steps = [...run.steps, step('send_pop_email', 'ok', `Proof of Payment emailed to ${pop.to}.`)];
            } catch (err: any) {
                // Release the claim so the next tick retries the email.
                await supabase.from('automation_runs').update({ pop_sent_at: null }).eq('id', run.id);
                run.pop_sent_at = null;
                await saveRun(run, {
                    steps: [...run.steps, step('send_pop_email', 'failed', `Email to ${pop.to} failed: ${err.message}. Will retry.`)],
                });
                return false;
            }
        }
    }

    await saveRun(run, {
        status: 'COMPLETED',
        finished_at: now(),
        error: null,
        steps: [...run.steps, step('run', 'ok', 'Transfer confirmed. Run complete.')],
    });
    return true;
}

// ── Running one claimed run ──────────────────────────────────────────────────

async function executeRun(automation: Automation, run: RunRow): Promise<void> {
    try {
        const forward = automation.actions.find((a): a is ForwardPaymentAction => a.type === 'FORWARD_PAYMENT');

        if (forward) {
            await forwardPayment(automation, forward, run);
            await settleRun(automation, run);
            return;
        }

        // Nothing to move — the automation only reacts to the deposit.
        await saveRun(run, {
            status: 'COMPLETED',
            finished_at: now(),
            steps: [...run.steps, step('run', 'ok', 'No actions configured beyond detecting the deposit.')],
        });
    } catch (err: any) {
        console.error(`[Automations] Run ${run.id} (${automation.name}) failed:`, err);
        await failRun(run, err.message || 'Unknown error');
    }
}

/** Claim a deposit by inserting its run row. Null means someone else got it first. */
async function claimDeposit(
    automation: Automation,
    entry: { id: string; debit: any; description: string | null; sender_name: string | null; external_reference?: string | null },
    source: 'AUTO' | 'MANUAL'
): Promise<RunRow | null> {
    const { data, error } = await supabase
        .from('automation_runs')
        .insert({
            automation_id: automation.id,
            organization_id: automation.organization_id,
            source,
            trigger_ref: depositKey(entry),
            trigger_summary: describeDeposit(entry),
            amount: Number(entry.debit),
            status: 'RUNNING',
            steps: [step('trigger', 'ok', `Deposit detected: ${describeDeposit(entry)}`)],
        })
        .select('*')
        .single();

    if (error) {
        if ((error as any).code === '23505') return null; // already claimed
        throw new Error(`Could not claim deposit ${depositKey(entry)}: ${error.message}`);
    }
    return data as RunRow;
}

// ── Recovery: retries, stale runs, confirmations ─────────────────────────────

async function recoverRuns(automation: Automation, summary: RunSummary, deadline: number, opts: { manual: boolean }) {
    const { data: open } = await supabase
        .from('automation_runs')
        .select('*')
        .eq('automation_id', automation.id)
        .in('status', ['RUNNING', 'AWAITING_CONFIRMATION', 'FAILED'])
        .order('started_at', { ascending: true })
        .limit(50);

    for (const run of (open ?? []) as RunRow[]) {
        if (Date.now() > deadline) break;

        try {
            if (run.status === 'AWAITING_CONFIRMATION') {
                if (await settleRun(automation, run)) summary.settled++;
                continue;
            }

            if (run.status === 'RUNNING') {
                // Only a run whose invocation died is stale; a live one is still working.
                if (Date.now() - new Date(run.started_at).getTime() < STALE_RUNNING_MS) continue;
                await failRun(run, 'The run was interrupted before it finished.');
                summary.failed++;
                continue;
            }

            // FAILED — retry a bounded number of times. Scheduled ticks wait a
            // little between tries; a manual Run-now retries straight away.
            // A paused automation must not send money, so it doesn't retry either.
            if (automation.status !== 'ACTIVE') continue;
            if (run.trigger_ref === null || run.attempts >= MAX_ATTEMPTS) continue;
            const failedAgo = Date.now() - new Date(run.finished_at ?? run.started_at).getTime();
            if (!opts.manual && failedAgo < RETRY_AFTER_MS) continue;

            const { data: reclaimed } = await supabase
                .from('automation_runs')
                .update({ status: 'RUNNING', attempts: run.attempts + 1, finished_at: null, error: null })
                .eq('id', run.id)
                .eq('status', 'FAILED')
                .eq('attempts', run.attempts)
                .select('*')
                .maybeSingle();
            if (!reclaimed) continue;

            summary.retried++;
            const retry = reclaimed as RunRow;
            retry.steps = [...retry.steps, step('retry', 'info', `Retrying (attempt ${retry.attempts} of ${MAX_ATTEMPTS}).`)];
            await executeRun(automation, retry);
            if (retry.status === 'FAILED') summary.failed++;
        } catch (err: any) {
            summary.errors.push(`run ${run.id}: ${err.message}`);
        }
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

async function processAutomation(automation: Automation, opts: { manual: boolean; deadline: number }): Promise<RunSummary> {
    const summary: RunSummary = { checked: 1, newDeposits: 0, started: 0, retried: 0, settled: 0, failed: 0, errors: [] };

    try {
        await recoverRuns(automation, summary, opts.deadline, { manual: opts.manual });

        if (automation.status === 'ACTIVE') {
            const deposits = await findNewDeposits(automation);
            summary.newDeposits = deposits.length;

            for (const entry of deposits) {
                if (Date.now() > opts.deadline) break;
                const run = await claimDeposit(automation, entry, opts.manual ? 'MANUAL' : 'AUTO');
                if (!run) continue;
                summary.started++;
                await executeRun(automation, run);
                if (run.status === 'FAILED') summary.failed++;
            }
        }

        if (summary.started || summary.retried || summary.settled) {
            await supabase.from('automations').update({ last_run_at: now() }).eq('id', automation.id);
        }
    } catch (err: any) {
        summary.errors.push(`${automation.name}: ${err.message}`);
        console.error(`[Automations] "${automation.name}" errored:`, err);
    }

    return summary;
}

export const automationService = {
    /**
     * Cron entry point. Sweeps every ACTIVE/PAUSED automation (paused ones still
     * settle in-flight payouts, they just don't start new ones), then fires any
     * scheduled items that have come due.
     */
    async tick(budgetMs = 35_000) {
        const deadline = Date.now() + budgetMs;
        const total: RunSummary = { checked: 0, newDeposits: 0, started: 0, retried: 0, settled: 0, failed: 0, errors: [] };

        const { data: automations, error } = await supabase
            .from('automations')
            .select('*')
            .in('status', ['ACTIVE', 'PAUSED']);
        if (error) throw new Error(`Could not load automations: ${error.message}`);

        for (const automation of (automations ?? []) as Automation[]) {
            if (Date.now() > deadline) break;
            const s = await processAutomation(automation, { manual: false, deadline });
            total.checked += s.checked;
            total.newDeposits += s.newDeposits;
            total.started += s.started;
            total.retried += s.retried;
            total.settled += s.settled;
            total.failed += s.failed;
            total.errors.push(...s.errors);
        }

        const schedules = await processDueScheduledItems(Math.max(3_000, deadline - Date.now()));
        const scheduleRunsSynced = await syncScheduledRunStatuses().catch(() => 0);

        return { automations: total, schedules, scheduleRunsSynced };
    },

    /**
     * The "Run now" button: check for deposits immediately, retry anything that
     * failed, and confirm anything in flight. When there was nothing to do the
     * check is still written to the history so it's visible that it ran.
     */
    async runNow(automation: Automation) {
        const deadline = Date.now() + 40_000;
        const summary = await processAutomation(automation, { manual: true, deadline });

        const didWork = summary.started || summary.retried || summary.settled || summary.failed;
        if (!didWork && !summary.errors.length) {
            await supabase.from('automation_runs').insert({
                automation_id: automation.id,
                organization_id: automation.organization_id,
                source: 'MANUAL',
                trigger_ref: null,
                trigger_summary: 'Manual check',
                status: 'SKIPPED',
                steps: [step('trigger', 'info', 'Checked the wallet — no new deposits to process.')],
                finished_at: now(),
            });
            await supabase.from('automations').update({ last_run_at: now() }).eq('id', automation.id);
        }

        return summary;
    },

    /** Retry one failed run on demand, even after it has used its automatic attempts. */
    async retryRun(automation: Automation, runId: string) {
        const { data: run } = await supabase
            .from('automation_runs')
            .select('*')
            .eq('id', runId)
            .eq('automation_id', automation.id)
            .maybeSingle();
        if (!run) throw new Error('Run not found.');
        if (run.status !== 'FAILED') throw new Error('Only failed runs can be retried.');

        const { data: reclaimed } = await supabase
            .from('automation_runs')
            .update({ status: 'RUNNING', attempts: run.attempts + 1, finished_at: null, error: null })
            .eq('id', runId)
            .eq('status', 'FAILED')
            .select('*')
            .maybeSingle();
        if (!reclaimed) throw new Error('This run is already being retried.');

        const retry = reclaimed as RunRow;
        retry.steps = [...retry.steps, step('retry', 'info', 'Retried manually.')];
        await executeRun(automation, retry);
        return retry;
    },
};
