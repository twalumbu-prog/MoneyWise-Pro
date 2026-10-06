import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { lencoService, getCore } from 'core';
import type { PaymentPhase } from '../components/payments/PaymentWaitingScreen';

/**
 * One hardened mobile-money collection flow for every place the app takes money in through Lenco
 * (wallet deposits, savings, investments, cash → wallet, requisition change). Mirrors the web
 * checkout (apps/web/src/pages/PublicPaymentLink.tsx) that was hardened in production:
 *
 *  - references carry the receiving organisation's id ("DEP-<ts>-<orgId>-<tag>"), so the Lenco
 *    webhook and the server sweeps can always attribute the payment, even if the app is gone;
 *  - the PENDING intent is logged before the charge is fired;
 *  - a server-held long-poll (≈22 s each) is reconnected for up to 3 minutes. Every request has
 *    its own client timeout (30 s, like web), so one response lost while the phone was busy with
 *    the PIN prompt can never stall the watch — that exact hang left a paid deposit unconfirmed;
 *  - coming back to the app (after approving the prompt) re-checks immediately and restarts the
 *    watch, because iOS/Android suspend in-flight requests while the app is in the background;
 *  - a "failed" answer from Lenco ends the wait straight away (declined);
 *  - on success the ledger finalise is awaited with retries, then the caller's own confirmation runs;
 *  - the in-flight payment is persisted, so reopening the screen resumes watching the same reference;
 *  - "Check payment status" asks the server again and always says what it found.
 */

const TTL_MS = 15 * 60 * 1000;
const WATCH_MS = 3 * 60 * 1000;
const LONGPOLL_TIMEOUT_MS = 30_000;
const FINALIZE_TIMEOUT_MS = 20_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class TimeoutError extends Error {
    constructor() { super('timeout'); this.name = 'TimeoutError'; }
}

/** Runs a request with an abort signal and a hard deadline (the race covers fetches that ignore abort). */
function timed<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { ctrl.abort(); reject(new TimeoutError()); }, ms);
    });
    return Promise.race([run(ctrl.signal), deadline]).finally(() => clearTimeout(timer));
}

export interface CollectionRequest {
    /** Short tag that ends the reference, e.g. 'WDEP', 'SAV', 'INV'. */
    tag: string;
    /** Use this exact reference instead of the default "DEP-<ts>-<orgId>-<tag>" (e.g. requisition change "CHG-<ts>-<id>"). */
    reference?: string;
    /** Organisation that receives the money (whose wallet it is). */
    organizationId: string;
    walletId: string;
    /** What the payer is charged. */
    amount: number;
    phone: string;
    operator: string;
    /** Logs the PENDING intent (and anything else that must exist before charging). */
    prepare: (reference: string) => Promise<unknown>;
}

interface Saved { reference: string; organizationId: string; amount: number; phone: string; operator: string; startedAt: number }

export function newCollectionReference(tag: string, organizationId: string): string {
    return `DEP-${Date.now()}-${organizationId}-${tag}`.slice(0, 80);
}

const NOT_YET = 'Lenco still shows this payment as waiting for approval. If you just entered your PIN, give it a few seconds and check again.';
const OFFLINE = 'We couldn’t reach MoneyWise to check. Check your connection and try again.';

export function useMobileMoneyCollection(opts: {
    /** Unique per screen/context so a resume picks up the right payment. */
    storageKey: string;
    /** Runs once the deposit is confirmed and finalised (e.g. confirm the savings contribution). */
    onConfirmed?: (reference: string) => Promise<unknown> | void;
}) {
    const [phase, setPhaseState] = useState<PaymentPhase | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const [reference, setReference] = useState<string | null>(null);
    const [amount, setAmount] = useState(0);
    const [phone, setPhone] = useState('');
    const [operator, setOperator] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [failureMessage, setFailureMessage] = useState<string | null>(null);
    const [declined, setDeclined] = useState(false);
    const [rechecking, setRechecking] = useState(false);
    const [recheckNote, setRecheckNote] = useState<string | null>(null);

    // The live payment, in refs so callbacks never act on a stale render.
    const live = useRef<Saved | null>(null);
    const phaseRef = useRef<PaymentPhase | null>(null);
    /** Each watch loop owns a run id; bumping it stops every older loop. */
    const run = useRef(0);
    const done = useRef(false);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);
    const onConfirmedRef = useRef(opts.onConfirmed);
    onConfirmedRef.current = opts.onConfirmed;
    const key = `mm-collection:${opts.storageKey}`;

    const setPhase = (p: PaymentPhase | null) => { phaseRef.current = p; setPhaseState(p); };

    const startClock = (from = 0) => {
        if (timer.current) clearInterval(timer.current);
        setElapsed(from);
        timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    };
    const stopClock = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
    useEffect(() => () => { run.current++; stopClock(); }, []);

    const save = useCallback((s: Saved | null) => {
        const store = getCore().storage;
        Promise.resolve()
            .then(() => (s ? store.set(key, JSON.stringify(s)) : store.remove(key)))
            .catch(() => undefined);
    }, [key]);

    const completeSuccess = useCallback(async (ref: string, orgId: string) => {
        if (done.current) return;
        done.current = true;
        run.current++;
        stopClock();
        setRecheckNote(null);
        setPhase('success');
        save(null);
        // Finalise with retries — Lenco says it succeeded, now make sure it's booked.
        for (let i = 0; i < 3; i++) {
            try { await timed(FINALIZE_TIMEOUT_MS, (signal) => lencoService.finalizeCollection(ref, orgId, { signal })); break; }
            catch { await sleep(1500); }
        }
        try { await onConfirmedRef.current?.(ref); } catch { /* the server sweeps settle it regardless */ }
    }, [save]);

    const markDeclined = useCallback((message?: string | null) => {
        run.current++;
        stopClock();
        setDeclined(true);
        setFailureMessage(message || 'The payment was declined or not approved on your phone. Nothing was charged.');
        setPhase('failed');
        save(null);
    }, [save]);

    const watch = useCallback(async (until: number) => {
        const s = live.current;
        if (!s || done.current) return;
        const myRun = ++run.current;
        while (run.current === myRun && Date.now() < until) {
            try {
                const res: any = await timed(LONGPOLL_TIMEOUT_MS, (signal) =>
                    lencoService.longPollCollectionStatus(s.reference, s.organizationId, { signal }));
                if (run.current !== myRun) return;
                if (res?.verified) { await completeSuccess(s.reference, s.organizationId); return; }
                if (res?.status === 'failed') { markDeclined(res.message); return; }
            } catch {
                if (run.current !== myRun) return;
                await sleep(2000);
            }
            if (run.current === myRun && phaseRef.current === 'confirm') setPhase('polling');
        }
        if (run.current !== myRun) return;
        stopClock();
        setDeclined(false);
        setFailureMessage(null);
        setPhase('failed');
        // Keep the saved record: a late approval can still be recovered by re-checking or reopening.
    }, [completeSuccess, markDeclined]);

    /** Fires the collection. Returns false if it couldn't be started (see `error`). */
    const start = useCallback(async (req: CollectionRequest): Promise<boolean> => {
        const ref = req.reference || newCollectionReference(req.tag, req.organizationId);
        run.current++;
        done.current = false;
        live.current = null;
        setReference(ref); setAmount(req.amount); setPhone(req.phone); setOperator(req.operator);
        setError(null); setFailureMessage(null); setDeclined(false); setRecheckNote(null);
        setPhase('initiating');
        try {
            await req.prepare(ref);
            const init = await lencoService.initiateMobileMoneyCollection({
                reference: ref, amount: req.amount, phone: req.phone, operator: req.operator.toLowerCase(), walletId: req.walletId,
            });
            const st = init?.data?.status;
            if (st !== 'pay-offline' && st !== 'pending' && st !== 'successful') {
                throw new Error(`The payment could not be started (${st || 'unknown status'}). Please try again.`);
            }
            const s: Saved = { reference: ref, organizationId: req.organizationId, amount: req.amount, phone: req.phone, operator: req.operator, startedAt: Date.now() };
            live.current = s;
            save(s);
            setPhase('confirm');
            startClock();
            void watch(s.startedAt + WATCH_MS);
            return true;
        } catch (e: any) {
            setPhase(null);
            setError(e?.message || 'Could not start the payment. Please try again.');
            return false;
        }
    }, [watch, save]);

    /** Stop waiting. Lenco can't recall a prompt already on the phone, so a late approval still lands. */
    const cancel = useCallback(async () => {
        run.current++;
        stopClock();
        const s = live.current;
        if (s) lencoService.cancelCollection(s.reference).catch(() => undefined);
        setRecheckNote(null);
        setPhase('cancelled');
    }, []);

    /**
     * Ask the server again; finalising is idempotent and books the payment if Lenco has it.
     * Always ends with a visible answer (success, declined, still waiting, or offline).
     */
    const recheck = useCallback(async (silent = false) => {
        const s = live.current;
        if (!s || done.current) return;
        if (!silent) { setRechecking(true); setRecheckNote(null); }
        try {
            const res: any = await timed(FINALIZE_TIMEOUT_MS, (signal) => lencoService.finalizeCollection(s.reference, s.organizationId, { signal }));
            if (res?.success) { await completeSuccess(s.reference, s.organizationId); return; }
            if (!silent) setRecheckNote(NOT_YET);
        } catch (e: any) {
            const status = String(e?.data?.status || '').toLowerCase();
            if (status === 'failed') { markDeclined('This payment was declined — nothing was charged. You can try again.'); return; }
            if (!silent) setRecheckNote(e instanceof TimeoutError || !e?.status ? OFFLINE : NOT_YET);
        } finally {
            if (!silent) setRechecking(false);
        }
    }, [completeSuccess, markDeclined]);

    /** Back to the form for a fresh attempt. */
    const reset = useCallback(() => {
        run.current++;
        done.current = false;
        live.current = null;
        stopClock();
        save(null);
        setPhase(null); setReference(null); setError(null); setFailureMessage(null); setDeclined(false); setRecheckNote(null);
    }, [save]);

    /** Resume a payment that was still in flight when this screen was last closed. */
    useEffect(() => {
        let alive = true;
        Promise.resolve().then(() => getCore().storage.get(key)).then((raw) => {
            if (!alive || !raw || live.current) return;
            try {
                const s = JSON.parse(raw) as Saved;
                if (!s?.reference || Date.now() - s.startedAt > TTL_MS) { save(null); return; }
                live.current = s;
                done.current = false;
                setReference(s.reference); setAmount(s.amount); setPhone(s.phone); setOperator(s.operator);
                setPhase('polling');
                startClock(Math.floor((Date.now() - s.startedAt) / 1000));
                void watch(Math.max(s.startedAt + WATCH_MS, Date.now() + 60_000));
            } catch { save(null); }
        }).catch(() => undefined);
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    /**
     * Approving the prompt usually takes the payer out of the app. When they come back, check at
     * once and restart the watch — a request that was in flight while suspended may never resolve.
     */
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state !== 'active' || !live.current || done.current) return;
            const p = phaseRef.current;
            if (p === 'confirm' || p === 'polling') {
                void recheck(true);
                void watch(Math.max(live.current.startedAt + WATCH_MS, Date.now() + 60_000));
            } else if ((p === 'failed' && !declined) || p === 'cancelled') {
                void recheck(true);
            }
        });
        return () => sub.remove();
    }, [watch, recheck, declined]);

    return {
        phase, elapsed, reference, amount, phone, operator, error, setError,
        failureMessage, declined, rechecking, recheckNote,
        start, cancel, recheck: () => recheck(false), reset,
        busy: phase === 'initiating',
    };
}
