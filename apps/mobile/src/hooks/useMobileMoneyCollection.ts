import { useCallback, useEffect, useRef, useState } from 'react';
import { lencoService, getCore } from 'core';
import type { PaymentPhase } from '../components/payments/PaymentWaitingScreen';

/**
 * One hardened mobile-money collection flow for every place the app takes money in through Lenco
 * (wallet deposits, savings, investments, cash → wallet). Mirrors the web checkout
 * (apps/web/src/pages/PublicPaymentLink.tsx) that was hardened in production:
 *
 *  - references carry the receiving organisation's id ("DEP-<ts>-<orgId>-<tag>"), so the Lenco
 *    webhook and the background sync can always attribute the payment, even if the app is gone;
 *  - the PENDING intent is logged before the charge is fired;
 *  - a server-held long-poll (≈22 s each) is reconnected up to 8 times (~3 min), backing off 2 s on
 *    network errors, and a "failed" answer from Lenco ends the wait straight away (declined);
 *  - on success the ledger finalise is awaited with retries (not fire-and-forget), then the
 *    caller's own confirmation runs (e.g. crediting a savings contribution);
 *  - the in-flight payment is persisted, so reopening the screen resumes watching the same reference;
 *  - after a timeout or "stop waiting", "Check payment status" asks the server again.
 */

const TTL_MS = 15 * 60 * 1000;
const MAX_RECONNECTS = 8;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CollectionRequest {
    /** Short tag that ends the reference, e.g. 'WDEP', 'SAV', 'INV'. */
    tag: string;
    /** Organisation that receives the money (whose wallet it is). */
    organizationId: string;
    walletId: string;
    /** What the payer is charged. */
    amount: number;
    phone: string;
    operator: string;
    /** Use this exact reference instead of the default "DEP-<ts>-<orgId>-<tag>" (e.g. requisition change "CHG-<ts>-<id>"). */
    reference?: string;
    /** Logs the PENDING intent (and anything else that must exist before charging). */
    prepare: (reference: string) => Promise<unknown>;
}

interface Saved { reference: string; organizationId: string; amount: number; phone: string; operator: string; startedAt: number }

export function newCollectionReference(tag: string, organizationId: string): string {
    return `DEP-${Date.now()}-${organizationId}-${tag}`.slice(0, 80);
}

export function useMobileMoneyCollection(opts: {
    /** Unique per screen/context so a resume picks up the right payment. */
    storageKey: string;
    /** Runs once the deposit is confirmed and finalised (e.g. confirm the savings contribution). */
    onConfirmed?: (reference: string) => Promise<unknown> | void;
}) {
    const [phase, setPhase] = useState<PaymentPhase | null>(null);
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

    const cancelled = useRef(false);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);
    const org = useRef<string | null>(null);
    const onConfirmedRef = useRef(opts.onConfirmed);
    onConfirmedRef.current = opts.onConfirmed;
    const key = `mm-collection:${opts.storageKey}`;

    const startClock = (from = 0) => {
        if (timer.current) clearInterval(timer.current);
        setElapsed(from);
        timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    };
    const stopClock = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
    useEffect(() => () => { cancelled.current = true; stopClock(); }, []);

    const save = (s: Saved | null) => {
        const store = getCore().storage;
        (s ? store.set(key, JSON.stringify(s)) : store.remove(key)).catch(() => undefined);
    };

    const completeSuccess = useCallback(async (ref: string, orgId: string) => {
        stopClock();
        setPhase('success');
        save(null);
        // Finalise with retries — the long-poll saw Lenco succeed, now make sure it's booked.
        for (let i = 0; i < 3; i++) {
            try { await lencoService.finalizeCollection(ref, orgId); break; } catch { await sleep(1500); }
        }
        try { await onConfirmedRef.current?.(ref); } catch { /* the server sweeps settle it regardless */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const watch = useCallback(async (ref: string, orgId: string) => {
        cancelled.current = false;
        for (let attempt = 1; attempt <= MAX_RECONNECTS; attempt++) {
            if (cancelled.current) return;
            try {
                const res: any = await lencoService.longPollCollectionStatus(ref, orgId);
                if (cancelled.current) return;
                if (res.verified) { await completeSuccess(ref, orgId); return; }
                if (res.status === 'failed') {
                    stopClock();
                    setDeclined(true);
                    setFailureMessage(res.message || 'The payment was declined or not approved on your phone. Nothing was charged.');
                    setPhase('failed');
                    save(null);
                    return;
                }
                setPhase((p) => (p === 'confirm' && attempt > 1 ? 'polling' : p));
            } catch {
                await sleep(2000);
            }
        }
        if (cancelled.current) return;
        stopClock();
        setDeclined(false);
        setFailureMessage(null);
        setPhase('failed');
        // Keep the saved record: a late approval can still be recovered by re-checking or reopening.
    }, [completeSuccess]);

    /** Fires the collection. Returns false if it couldn't be started (see `error`). */
    const start = useCallback(async (req: CollectionRequest): Promise<boolean> => {
        const ref = req.reference || newCollectionReference(req.tag, req.organizationId);
        org.current = req.organizationId;
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
            save({ reference: ref, organizationId: req.organizationId, amount: req.amount, phone: req.phone, operator: req.operator, startedAt: Date.now() });
            setPhase('confirm');
            startClock();
            void watch(ref, req.organizationId);
            return true;
        } catch (e: any) {
            setPhase(null);
            setError(e?.message || 'Could not start the payment. Please try again.');
            return false;
        }
    }, [watch]);

    /** Stop waiting. Lenco can't recall a prompt already on the phone, so a late approval still lands. */
    const cancel = useCallback(async () => {
        cancelled.current = true;
        stopClock();
        if (reference) lencoService.cancelCollection(reference).catch(() => undefined);
        setPhase('cancelled');
    }, [reference]);

    /** Ask the server again; finalising is idempotent and books the payment if Lenco has it. */
    const recheck = useCallback(async () => {
        if (!reference || !org.current) return;
        setRechecking(true);
        setRecheckNote(null);
        try {
            const res: any = await lencoService.finalizeCollection(reference, org.current);
            if (res?.success) { await completeSuccess(reference, org.current); return; }
            setRecheckNote('Not confirmed yet. If you just approved it, wait a few seconds and check again.');
        } catch (e: any) {
            const status = (e?.data?.status || e?.status || '').toString();
            if (status === 'failed') {
                setDeclined(true);
                setFailureMessage('This payment was declined — nothing was charged. You can try again.');
                setPhase('failed');
                save(null);
            } else {
                setRecheckNote('Not confirmed yet. If you just approved it, wait a few seconds and check again.');
            }
        } finally {
            setRechecking(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reference, completeSuccess]);

    /** Back to the form for a fresh attempt. */
    const reset = useCallback(() => {
        cancelled.current = true;
        stopClock();
        save(null);
        setPhase(null); setReference(null); setError(null); setFailureMessage(null); setDeclined(false); setRecheckNote(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    /** Resume a payment that was still in flight when this screen was last closed. */
    useEffect(() => {
        let alive = true;
        getCore().storage.get(key).then((raw) => {
            if (!alive || !raw) return;
            try {
                const s = JSON.parse(raw) as Saved;
                if (!s?.reference || Date.now() - s.startedAt > TTL_MS) { save(null); return; }
                org.current = s.organizationId;
                setReference(s.reference); setAmount(s.amount); setPhone(s.phone); setOperator(s.operator);
                setPhase('polling');
                startClock(Math.floor((Date.now() - s.startedAt) / 1000));
                void watch(s.reference, s.organizationId);
            } catch { save(null); }
        }).catch(() => undefined);
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return {
        phase, elapsed, reference, amount, phone, operator, error, setError,
        failureMessage, declined, rechecking, recheckNote,
        start, cancel, recheck, reset,
        busy: phase === 'initiating',
    };
}
