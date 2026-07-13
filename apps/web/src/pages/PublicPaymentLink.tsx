import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { trackEvent, trackVerificationTimeout } from '../lib/analytics';
import {
    Loader2,
    AlertCircle,
    RefreshCw,
    ShieldCheck,
    Building2,
    Phone,
    Smartphone,
    CreditCard,
    ArrowLeft,
    CheckCircle,
    XCircle,
    BadgeCheck,
    Check,
    Wallet,
    ClipboardList
} from 'lucide-react';
import { calculatePlatformFee } from 'shared';
import { CheckoutErrorInfo, diagnoseCheckoutError } from '../utils/checkoutError';
import { PaymentWaitingScreen, PaymentPhase } from '../components/PaymentWaitingScreen';
import { savePendingPayment, loadPendingPayment, clearPendingPayment } from '../lib/paymentRecovery';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

// Detect the Zambian mobile money operator from a phone prefix.
// Mirrors LencoService.resolveMobileOperator on the API.
function detectOperator(phone: string): 'airtel' | 'mtn' | 'zamtel' | null {
    const clean = (phone || '').replace(/[^0-9]/g, '');
    const normalized = clean.startsWith('260') ? '0' + clean.slice(3) : clean;
    if (normalized.startsWith('097') || normalized.startsWith('077')) return 'airtel';
    if (normalized.startsWith('096') || normalized.startsWith('076')) return 'mtn';
    if (normalized.startsWith('095') || normalized.startsWith('075')) return 'zamtel';
    return null;
}

const OPERATOR_COLORS: Record<string, string> = {
    airtel: 'text-red-500',
    mtn: 'text-amber-500',
    zamtel: 'text-emerald-500',
};

// Latency threshold (measured from the account-name lookup, which shares the
// customer's current network path) above which the waiting screen warns that
// confirmation may take longer than usual.
const SLOW_LATENCY_MS = 1200;

interface LinkProduct {
    id: string;
    name: string;
    description?: string;
    image_url?: string | null;
    product_type?: string;
}

interface LinkItem {
    product_id: string;
    name: string;
    image_url?: string | null;
    quantity: number;
    unit_price: number;
    check_in?: string;
    check_out?: string;
}

interface LinkContext {
    status: 'ACTIVE' | 'PAID' | 'CANCELLED';
    organization: { id: string; name: string; logo_url: string | null };
    wallet: {
        id: string;
        lenco_subaccount_id: string | null;
        lenco_public_key: string | null;
        payment_test_mode: boolean;
    };
    product: LinkProduct;
    /** Multi-item invoice links carry the basket here; single-product links use `product`. */
    items?: LinkItem[] | null;
    customer_name: string;
    customer_phone: string;
    amount: number;
    collections_api_enabled?: boolean;
}

export const PublicPaymentLink: React.FC = () => {
    const { token } = useParams<{ token: string }>();

    const [step, setStep] = useState<'LOADING' | 'READY' | 'CHECKOUT' | 'INACTIVE' | 'VERIFYING' | 'SUCCESS' | 'ERROR'>('LOADING');
    const [ctx, setCtx] = useState<LinkContext | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Structured, actionable diagnosis for the full-screen ERROR step (load failures).
    const [errorInfo, setErrorInfo] = useState<CheckoutErrorInfo | null>(null);
    const [verificationStep, setVerificationStep] = useState<'POLLING' | 'FAILED'>('POLLING');
    const [verificationReason, setVerificationReason] = useState('');
    const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
    const [currentReference, setCurrentReference] = useState('');

    // Own-UX checkout (Collections API). Gated by ctx.collections_api_enabled — when
    // off, the READY step keeps the LencoPay widget button unchanged.
    const [checkoutMethod, setCheckoutMethod] = useState<'mobile-money' | 'card'>('mobile-money');
    const [phone, setPhone] = useState('');
    const [resolvedAccountName, setResolvedAccountName] = useState('');
    const [resolvingAccountName, setResolvingAccountName] = useState(false);
    const [resolveFailed, setResolveFailed] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Distinguishes the "approve on your phone" wait from the post-approval ledger sync.
    const [awaitingApproval, setAwaitingApproval] = useState(false);
    // Own-UX payment lifecycle phase (null = not on the premium screen, e.g. widget path).
    const [paymentPhase, setPaymentPhase] = useState<PaymentPhase | null>(null);
    const [failureIsDeclined, setFailureIsDeclined] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [networkLatencyMs, setNetworkLatencyMs] = useState<number | null>(null);
    const [cancelling, setCancelling] = useState(false);
    // "Check payment status" re-query state (failed / cancelled screens).
    const [rechecking, setRechecking] = useState(false);
    const [recheckNote, setRecheckNote] = useState<string | null>(null);
    // On resume-after-reload the amount comes from the persisted payment.
    const [resumedPayment, setResumedPayment] = useState<{ amount: number; phone: string } | null>(null);
    // Flipped on Cancel so an in-flight poll loop stops recursing instead of racing
    // a fresh attempt (each retry uses a brand-new setTimeout chain).
    const pollCancelledRef = useRef(false);
    // Set once we've resumed an in-flight payment on load, so a second loadContext
    // run (StrictMode double-invoke, or an ERROR-screen retry) can't clobber it.
    const resumedRef = useRef(false);

    // Re-runnable from the ERROR screen's Try Again.
    const loadContext = useCallback(async () => {
        setErrorInfo(null);
        setStep('LOADING');

        if (!token) {
            setErrorInfo({
                title: 'Incomplete link',
                message: 'This payment link looks incomplete, so the checkout can’t open.',
                tips: ['Make sure the entire link was copied, then try again.', 'Ask the business to resend the link.'],
                retry: false,
            });
            setStep('ERROR');
            return;
        }
        const startFetchTime = performance.now();
        console.log(`[Diagnostic] Starting public payment link context fetch for token ${token} at ${new Date().toISOString()}`);

        try {
            const res = await axios.get<LinkContext>(`${API_URL}/lenco/public-payment-link/${token}`, { timeout: 30000 });
            console.log(`[Diagnostic] Successfully fetched payment link context in ${Math.round(performance.now() - startFetchTime)}ms`);
            setCtx(res.data);
            setPhone(res.data.customer_phone || '');

            if (res.data.status !== 'ACTIVE') {
                setStep('INACTIVE');
                return;
            }
            if (!res.data.wallet.lenco_subaccount_id) {
                setErrorInfo({
                    title: 'Payments not set up yet',
                    message: 'This business hasn’t finished connecting their payment provider, so checkout isn’t available yet.',
                    tips: ['Please let the business know so they can finish their payment setup.', 'You can try again once they’ve completed it.'],
                    retry: true,
                });
                setStep('ERROR');
                return;
            }

            // Resume an in-flight payment if the customer reloaded mid-wait.
            if (!resumedRef.current && res.data.collections_api_enabled && token) {
                const saved = loadPendingPayment(token);
                if (saved) {
                    resumedRef.current = true;
                    const elapsedAtResume = Math.max(0, Math.floor((Date.now() - saved.startedAt) / 1000));
                    setCurrentReference(saved.reference);
                    setPhone(saved.phone);
                    setResumedPayment({ amount: saved.amount, phone: saved.phone });
                    setVerificationStep('POLLING');
                    setAwaitingApproval(true);
                    setPaymentPhase('polling');
                    setElapsedSeconds(elapsedAtResume);
                    setStep('VERIFYING');
                    trackEvent('payment_link_checkout', 'resume', 'started', {
                        workflow_id: saved.reference,
                        organization_id: saved.orgId,
                        elapsed_seconds_at_resume: elapsedAtResume,
                    });
                    startCompletionPoll(saved.reference, saved.orgId, saved.startedAt);
                    return;
                }
            }

            // Don't drop a resumed payment back to the ready screen on a second run.
            if (!resumedRef.current) setStep('READY');
        } catch (err: any) {
            const duration = Math.round(performance.now() - startFetchTime);
            console.error(`[Diagnostic] Error fetching payment-link context after ${duration}ms:`, err);
            setErrorInfo(diagnoseCheckoutError(err));
            setStep('ERROR');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        loadContext();
    }, [loadContext]);

    const subtotal = ctx?.amount || 0;
    const processingFee = subtotal > 0 ? calculatePlatformFee(subtotal) : 0;
    const totalPayable = subtotal > 0 ? subtotal + processingFee : 0;

    // Once the customer presses Pay, the flow fills the whole screen on mobile —
    // same full-bleed treatment as the open catalogue portal (PublicPay.tsx) —
    // instead of staying inside the small floating card used for READY/LOADING/ERROR.
    const isAppStep = step === 'CHECKOUT' || step === 'VERIFYING' || step === 'SUCCESS';

    // Normalize both link shapes (multi-item invoice vs legacy single product) into
    // one list, so the display + intent payload + analytics never touch a null product.
    const linkItems: LinkItem[] = (ctx?.items && ctx.items.length > 0)
        ? ctx.items
        : (ctx?.product
            ? [{ product_id: ctx.product.id, name: ctx.product.name, image_url: ctx.product.image_url, quantity: 1, unit_price: ctx.amount || 0 }]
            : []);
    const linkLabel = linkItems.map(it => `${it.name}${it.quantity > 1 ? ` x${it.quantity}` : ''}`).join(', ') || 'Payment';
    const intentItems = linkItems.map(it => ({
        id: it.product_id,
        quantity: it.quantity,
        price: it.unit_price,
        ...(it.check_in && it.check_out ? { check_in: it.check_in, check_out: it.check_out } : {}),
    }));

    // Resolve the mobile money account holder's name as the customer types a valid
    // number — the same trust signal shown on the internal disbursement wizard. Also
    // doubles as our network-speed probe: its round-trip latency estimates how long
    // the upcoming status polling is likely to take.
    useEffect(() => {
        if (step !== 'CHECKOUT' || checkoutMethod !== 'mobile-money' || !ctx) return;
        const operator = detectOperator(phone);
        if (!operator) {
            setResolvedAccountName('');
            setResolveFailed(false);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            setResolvingAccountName(true);
            setResolveFailed(false);
            const startedAt = Date.now();
            try {
                const res = await axios.post(`${API_URL}/lenco/public-collection/resolve-momo`, {
                    phone, operator, walletId: ctx.wallet.id,
                });
                if (cancelled) return;
                setNetworkLatencyMs(Date.now() - startedAt);
                setResolvedAccountName(res.data?.accountName || '');
                if (!res.data?.accountName) setResolveFailed(true);
            } catch {
                if (cancelled) return;
                setNetworkLatencyMs(Date.now() - startedAt);
                setResolvedAccountName('');
                setResolveFailed(true);
            } finally {
                if (!cancelled) setResolvingAccountName(false);
            }
        }, 500);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [phone, checkoutMethod, step, ctx]);

    // Tick the elapsed-time counter while waiting for the customer to approve on their phone.
    useEffect(() => {
        if (!awaitingApproval) return;
        const interval = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
        return () => clearInterval(interval);
    }, [awaitingApproval]);

    const isSlowNetwork = networkLatencyMs !== null && networkLatencyMs > SLOW_LATENCY_MS;

    // The premium screen shows the USSD-approval prompt (confirm) briefly, then a
    // cosmetic "confirming" (polling) pass for the remainder of the wait — matching
    // the design handoff's own timing proportions.
    const displayPaymentPhase: PaymentPhase | null =
        paymentPhase === 'confirm' && elapsedSeconds >= 6 ? 'polling' : paymentPhase;

    const handlePay = async () => {
        if (!ctx || !token) return;

        const LencoPay: any = (window as any).LencoPay;
        if (!LencoPay) {
            setError('Payment gateway SDK failed to load. Please reload the page or check your connection.');
            return;
        }

        const purpose = `Sale: ${linkLabel} | Cust: ${ctx.customer_phone}`;
        const ref = `DEP-${Date.now()}-${ctx.wallet.lenco_subaccount_id!.substring(0, 8)}-PL`;
        setCurrentReference(ref);
        setError(null);

        const checkoutStartedAt = Date.now();
        trackEvent('payment_link_checkout', 'payment', 'started', {
            workflow_id: ref,
            organization_id: ctx.organization.id,
            product_name: linkLabel,
            subtotal,
            total_payable: totalPayable,
            payment_link_token: token,
        });

        try {
            await axios.post(`${API_URL}/lenco/public-wallet-deposit-intent`, {
                reference: ref,
                purpose,
                amount: subtotal,
                walletId: ctx.wallet.id,
                customerName: ctx.customer_name,
                customerPhone: ctx.customer_phone,
                paymentLinkToken: token,
                items: intentItems
            });

            LencoPay.getPaid({
                key: ctx.wallet.lenco_public_key || 'pub-f3a595efda03948ae5dcd2effe073ef0aa2b333457a6c80d',
                amount: totalPayable.toFixed(2),
                currency: 'ZMW',
                reference: ref,
                accountId: ctx.wallet.lenco_subaccount_id!,
                email: 'customer@moneywise.co',
                name: ctx.customer_name,
                description: purpose,
                narration: purpose,
                meta: {
                    purpose,
                    customerPhone: ctx.customer_phone,
                    isPublicPortal: true,
                    paymentLinkToken: token
                },
                channels: ['card', 'mobile-money'],
                onSuccess: async (response: any) => {
                    const transactionId = response.id || response.transactionId;
                    setStep('VERIFYING');
                    setVerificationStep('POLLING');
                    setAwaitingApproval(false);

                    let attempts = 0;
                    const maxAttempts = 15;
                    const pollStatus = async () => {
                        attempts++;
                        try {
                            const verifyRes = await axios.get(
                                `${API_URL}/lenco/public-verify-status/${ref}?transactionId=${transactionId}&organizationId=${ctx.organization.id}`
                            );
                            if (verifyRes.data.verified) {
                                setReceiptNumber(verifyRes.data.referenceNumber || null);
                                trackEvent('payment_link_checkout', 'payment', 'succeeded', {
                                    workflow_id: ref,
                                    organization_id: ctx.organization.id,
                                    product_name: linkLabel,
                                    subtotal,
                                    total_payable: totalPayable,
                                    receipt_number: verifyRes.data.referenceNumber,
                                    duration_ms: Date.now() - checkoutStartedAt,
                                });
                                setStep('SUCCESS');
                                return;
                            }
                        } catch (err) {
                            console.error('Payment-link verification attempt failed:', err);
                        }
                        if (attempts < maxAttempts) {
                            setTimeout(pollStatus, 3000);
                        } else {
                            setVerificationStep('FAILED');
                            setVerificationReason('Payment was submitted but the ledger sync is taking longer than expected. Please contact the business to confirm.');
                            trackVerificationTimeout('payment_link_checkout', {
                                workflow_id: ref,
                                organization_id: ctx.organization.id,
                                attempts,
                                duration_ms: Date.now() - checkoutStartedAt,
                            });
                        }
                    };
                    pollStatus();
                },
                onClose: () => {
                    console.log('Payment-link window closed');
                }
            });
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to initiate payment. Please try again.');
            trackEvent('payment_link_checkout', 'payment', 'failed', {
                workflow_id: ref,
                organization_id: ctx.organization.id,
                error_code: err?.response?.status || 'NETWORK_ERROR',
                error_message: err?.response?.data?.error || err.message,
                duration_ms: Date.now() - checkoutStartedAt,
            });
        }
    };

    // Poll verify-status for a reference until it resolves. Shared by a fresh
    // payment and resume-after-reload. Clears the saved recovery record on
    // success/decline; keeps it on a poll timeout so a reload or manual re-check
    // can still recover a slow-but-successful payment.
    const startCompletionPoll = (ref: string, orgId: string, startedAt: number, analytics?: Record<string, any>) => {
        pollCancelledRef.current = false;
        let attempts = 0;
        const maxAttempts = 90; // ~3 min at 2s
        const pollStatus = async () => {
            if (pollCancelledRef.current) return;
            attempts++;
            try {
                const verifyRes = await axios.get(
                    `${API_URL}/lenco/public-verify-status/${ref}?organizationId=${orgId}`
                );
                if (pollCancelledRef.current) return;
                if (verifyRes.data.verified) {
                    setReceiptNumber(verifyRes.data.referenceNumber || null);
                    setAwaitingApproval(false);
                    setPaymentPhase('success');
                    clearPendingPayment();
                    trackEvent('payment_link_checkout', 'payment', 'succeeded', {
                        workflow_id: ref,
                        organization_id: orgId,
                        ...(analytics || {}),
                        receipt_number: verifyRes.data.referenceNumber,
                        payment_method: 'mobile-money',
                        duration_ms: Date.now() - startedAt,
                    });
                    return;
                }
                if (verifyRes.data.status === 'failed') {
                    setVerificationStep('FAILED');
                    setVerificationReason('The payment was declined or not approved on your phone. You can go back and try again.');
                    setAwaitingApproval(false);
                    setFailureIsDeclined(true);
                    setPaymentPhase('failed');
                    clearPendingPayment();
                    // Distinct from a poll timeout — Lenco itself confirmed the decline.
                    trackEvent('payment_link_checkout', 'payment', 'failed', {
                        workflow_id: ref,
                        organization_id: orgId,
                        ...(analytics || {}),
                        payment_method: 'mobile-money',
                        error_code: 'declined',
                        error_message: 'Customer declined or did not approve the mobile money prompt',
                        duration_ms: Date.now() - startedAt,
                    });
                    return;
                }
            } catch (err) {
                console.error('Payment-link momo verification attempt failed:', err);
            }
            if (pollCancelledRef.current) return;
            if (attempts < maxAttempts) {
                setTimeout(pollStatus, 2000);
            } else {
                setVerificationStep('FAILED');
                setVerificationReason('This is taking longer than usual. If you approved the prompt, your payment may still be processing — check its status below.');
                setAwaitingApproval(false);
                setFailureIsDeclined(false);
                setPaymentPhase('failed');
                trackVerificationTimeout('payment_link_checkout', {
                    workflow_id: ref,
                    organization_id: orgId,
                    attempts,
                    duration_ms: Date.now() - startedAt,
                });
            }
        };
        pollStatus();
    };

    // Own-UX mobile money checkout: initiate the collection server-side, then poll
    // the same verify-status endpoint the widget path used. The customer approves on
    // their phone — no widget, no redirect — so closing/reloading this page can't lose
    // the payment (the reference is server-tracked from the moment it's initiated).
    const handlePayMobileMoney = async () => {
        if (!ctx || !token) return;
        setError(null);

        const operator = detectOperator(phone);
        if (!operator) {
            setError('Enter a valid Zambian mobile money number (Airtel, MTN, or Zamtel).');
            return;
        }

        const purpose = `Sale: ${linkLabel} | Cust: ${ctx.customer_phone}`;
        const ref = `DEP-${Date.now()}-${ctx.wallet.lenco_subaccount_id!.substring(0, 8)}-PL`;
        setCurrentReference(ref);
        setSubmitting(true);
        pollCancelledRef.current = false;
        // Enter the premium processing screen at the "initiating" phase while the
        // intent + collection calls run.
        setElapsedSeconds(0);
        setAwaitingApproval(false);
        setPaymentPhase('initiating');
        setStep('VERIFYING');

        const checkoutStartedAt = Date.now();
        trackEvent('payment_link_checkout', 'payment', 'started', {
            workflow_id: ref,
            organization_id: ctx.organization.id,
            product_name: linkLabel,
            subtotal,
            total_payable: totalPayable,
            payment_link_token: token,
            payment_method: 'mobile-money',
        });

        try {
            // 1. Log the PENDING intent (net subtotal) — same as the widget flow.
            await axios.post(`${API_URL}/lenco/public-wallet-deposit-intent`, {
                reference: ref,
                purpose,
                amount: subtotal,
                walletId: ctx.wallet.id,
                customerName: ctx.customer_name,
                customerPhone: ctx.customer_phone,
                paymentLinkToken: token,
                items: intentItems
            });

            // 2. Initiate the collection server-side (gross = subtotal + platform fee).
            const initRes = await axios.post(`${API_URL}/lenco/public-collection/mobile-money`, {
                reference: ref,
                amount: totalPayable,
                phone,
                operator,
                walletId: ctx.wallet.id,
            });

            const status = initRes.data?.data?.status;
            if (status !== 'pay-offline' && status !== 'pending' && status !== 'successful') {
                throw new Error(`Payment could not be started (status: ${status || 'unknown'}). Please try again.`);
            }

            // 3. Prompt dispatched — persist a recovery record (so a reload can resume),
            // move to the "confirm" phase and poll verify-status via the shared poller.
            savePendingPayment({
                reference: ref,
                contextId: token,
                orgId: ctx.organization.id,
                phone,
                amount: totalPayable,
                businessName: ctx.organization.name,
                startedAt: checkoutStartedAt,
            });
            setResumedPayment(null);
            setRecheckNote(null);
            setVerificationStep('POLLING');
            setPaymentPhase('confirm');
            setAwaitingApproval(true);
            setElapsedSeconds(0);
            setSubmitting(false);

            startCompletionPoll(ref, ctx.organization.id, checkoutStartedAt, {
                product_name: linkLabel,
                subtotal,
                total_payable: totalPayable,
                payment_link_token: token,
            });
        } catch (err: any) {
            clearPendingPayment();
            setSubmitting(false);
            setAwaitingApproval(false);
            setPaymentPhase(null);
            setStep('CHECKOUT');
            setError(err.response?.data?.error || err.message || 'Failed to start the payment. Please try again.');
            trackEvent('payment_link_checkout', 'payment', 'failed', {
                workflow_id: ref,
                organization_id: ctx.organization.id,
                error_code: err?.response?.status || 'NETWORK_ERROR',
                error_message: err?.response?.data?.error || err.message,
                payment_method: 'mobile-money',
                duration_ms: Date.now() - checkoutStartedAt,
            });
        }
    };

    // Customer-initiated "stop waiting" on a pending mobile money attempt. This only
    // stops OUR polling and returns them to the checkout form — Lenco has no API to
    // cancel a mobile money prompt already sent to the telco, so if they approve it
    // anyway after "cancelling" here, the webhook still finalizes it correctly (we
    // deliberately do NOT delete the PENDING intent server-side; see the /cancel
    // endpoint's comment for why that used to lose product-level bookkeeping).
    const handleCancelPayment = async () => {
        setCancelling(true);
        pollCancelledRef.current = true;
        trackEvent('payment_link_checkout', 'cancel', 'started', {
            workflow_id: currentReference,
            organization_id: ctx?.organization.id || 'unknown',
            payment_method: 'mobile-money',
        });
        try {
            await axios.post(`${API_URL}/lenco/public-collection/cancel`, { reference: currentReference });
        } catch (err) {
            console.error('Failed to cancel payment intent:', err);
        } finally {
            setCancelling(false);
            setAwaitingApproval(false);
            setElapsedSeconds(0);
            setRecheckNote(null);
            // Show a "Payment stopped" state that sets expectations about the lingering
            // prompt (Lenco can't recall it). Saved recovery record kept so "Check payment
            // status" / a reload can still catch a late approval.
            setPaymentPhase('cancelled');
            trackEvent('payment_link_checkout', 'cancel', 'succeeded', {
                workflow_id: currentReference,
                organization_id: ctx?.organization.id || 'unknown',
                payment_method: 'mobile-money',
            });
        }
    };

    // Re-query whether the collection actually went through (failed/cancelled screens).
    const handleRecheckPayment = async () => {
        if (!ctx || !currentReference) return;
        setRechecking(true);
        setRecheckNote(null);
        const startedAt = Date.now();
        trackEvent('payment_link_checkout', 'recheck', 'started', {
            workflow_id: currentReference,
            organization_id: ctx.organization.id,
            from_phase: paymentPhase || 'unknown',
        });
        try {
            const verifyRes = await axios.get(
                `${API_URL}/lenco/public-verify-status/${currentReference}?organizationId=${ctx.organization.id}`
            );
            let outcome: 'verified' | 'declined' | 'pending' = 'pending';
            if (verifyRes.data.verified) {
                outcome = 'verified';
                setReceiptNumber(verifyRes.data.referenceNumber || null);
                setAwaitingApproval(false);
                setPaymentPhase('success');
                clearPendingPayment();
            } else if (verifyRes.data.status === 'failed') {
                outcome = 'declined';
                setRecheckNote('This payment was declined — nothing has been charged. You can try again.');
                clearPendingPayment();
            } else {
                setRecheckNote('Not confirmed yet. If you just approved it, wait a few seconds and check again.');
            }
            trackEvent('payment_link_checkout', 'recheck', 'succeeded', {
                workflow_id: currentReference,
                organization_id: ctx.organization.id,
                from_phase: paymentPhase || 'unknown',
                recheck_outcome: outcome,
                duration_ms: Date.now() - startedAt,
            });
        } catch (err) {
            console.error('Recheck failed:', err);
            setRecheckNote('Couldn’t check right now — please try again in a moment.');
            trackEvent('payment_link_checkout', 'recheck', 'failed', {
                workflow_id: currentReference,
                organization_id: ctx.organization.id,
                from_phase: paymentPhase || 'unknown',
                duration_ms: Date.now() - startedAt,
            });
        } finally {
            setRechecking(false);
        }
    };

    // Success "View receipt" → the existing full receipt screen.
    const handleViewReceipt = () => {
        setPaymentPhase(null);
        setResumedPayment(null);
        setStep('SUCCESS');
    };

    // Failed "Try again" → back to the payment form with a fresh attempt.
    const handleRetryPayment = () => {
        pollCancelledRef.current = true;
        clearPendingPayment();
        setPaymentPhase(null);
        setResumedPayment(null);
        setRecheckNote(null);
        setVerificationStep('POLLING');
        setError(null);
        setStep('CHECKOUT');
    };

    // Failed "Cancel" / cancelled "Close" → leave the flow back to the link's ready screen.
    const handleDismissFailed = () => {
        pollCancelledRef.current = true;
        clearPendingPayment();
        setPaymentPhase(null);
        setResumedPayment(null);
        setRecheckNote(null);
        setVerificationStep('POLLING');
        setError(null);
        setStep('READY');
    };

    const renderLogo = (sizeClass = 'w-20 h-20', textClass = 'text-3xl') => {
        if (!ctx) return null;
        if (ctx.organization.logo_url) {
            return (
                <div className={`${sizeClass} rounded-3xl overflow-hidden shadow-md bg-white border border-slate-100/50 flex-shrink-0`}>
                    <img src={ctx.organization.logo_url} alt={`${ctx.organization.name} Logo`} className="w-full h-full object-cover" />
                </div>
            );
        }
        return (
            <div className={`${sizeClass} rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black ${textClass} shadow-md uppercase flex-shrink-0`}>
                {ctx.organization.name.charAt(0)}
            </div>
        );
    };

    const operator = detectOperator(phone);

    return (
        <div className={`flex flex-col ${isAppStep
            ? 'h-[100dvh] bg-white sm:h-auto sm:min-h-screen sm:bg-gradient-to-br sm:from-slate-50 sm:via-slate-100 sm:to-blue-50/30 sm:justify-between sm:py-10 sm:px-4'
            : 'min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50/30 justify-between py-10 px-4'}`}
        >
            <div className={`w-full bg-white overflow-hidden flex flex-col sm:max-w-md sm:mx-auto sm:my-auto sm:bg-white/70 sm:backdrop-blur-xl sm:rounded-[32px] sm:border sm:border-slate-100 sm:shadow-2xl sm:justify-between transition-all duration-300 ${isAppStep ? 'flex-1 min-h-0' : 'rounded-[32px] border border-slate-100 shadow-2xl'}`}>

                {step === 'LOADING' && (
                    <div className="p-10 flex flex-col items-center justify-center min-h-[450px]">
                        <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl animate-spin mb-4">
                            <Loader2 size={32} />
                        </div>
                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Loading Payment Link</h3>
                    </div>
                )}

                {step === 'READY' && ctx && (
                    <div className="p-8">
                        <div className="flex flex-col items-center text-center">
                            {renderLogo()}
                            <h2 className="text-lg font-black text-slate-900 mt-4 uppercase tracking-wider">{ctx.organization.name}</h2>
                            <p className="text-xs font-semibold text-slate-400 mt-1">Secure Payment Request</p>
                        </div>

                        {/* Customer details, left-aligned like Order Summary below */}
                        <div className="mt-6 mb-8">
                            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Customer Details</h4>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-normal text-black">{ctx.customer_name}</span>
                                <span className="text-xs font-normal text-black">{ctx.customer_phone}</span>
                            </div>
                        </div>

                        {/* Order Summary — itemized table, matching the invoice email */}
                        <div className="mb-5">
                            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Order Summary</h4>
                            <div className="border border-slate-100 rounded-2xl overflow-hidden">
                                <table className="w-full text-xs border-collapse">
                                    <tbody>
                                        {linkItems.map((it, i) => (
                                            <tr key={i} className={i > 0 ? 'border-t border-slate-100' : ''}>
                                                <td className="py-3 pl-4 pr-2 align-top">
                                                    <div className="text-[13px] font-bold text-slate-900">{it.name}</div>
                                                    <div className="text-[10px] font-semibold text-slate-400 mt-0.5">
                                                        {it.check_in && it.check_out ? `${it.check_in} → ${it.check_out}` : `x${it.quantity}`}
                                                    </div>
                                                </td>
                                                <td className="py-3 pl-2 pr-4 text-right align-top text-[13px] font-black text-slate-800 whitespace-nowrap">
                                                    K{(it.unit_price * it.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="border-t border-slate-200 bg-slate-50/70">
                                            <td className="py-3 pl-4 pr-2 text-[13px] font-black text-slate-900">Subtotal</td>
                                            <td className="py-3 pl-2 pr-4 text-right text-[13px] font-black text-slate-900 whitespace-nowrap">
                                                K{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="space-y-1.5 text-xs mb-5">
                            <div className="flex justify-between font-normal text-slate-400 text-[11px]">
                                <span>Processing fee</span>
                                <span>K{processingFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between font-black text-slate-900 text-sm pt-2 border-t border-slate-200/50">
                                <span>Total Amount</span>
                                <span>K{totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        {error && (
                            <div className="p-3.5 bg-rose-50 text-rose-600 rounded-xl flex items-start space-x-2 mb-4">
                                <AlertCircle className="flex-shrink-0 mt-0.5" size={14} />
                                <span className="text-[11px] font-semibold leading-normal">{error}</span>
                            </div>
                        )}

                        <button
                            onClick={() => {
                                if (ctx.collections_api_enabled) {
                                    setError(null);
                                    setResolvedAccountName('');
                                    setResolveFailed(false);
                                    setCheckoutMethod('mobile-money');
                                    setStep('CHECKOUT');
                                } else {
                                    handlePay();
                                }
                            }}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-lg shadow-blue-100 flex items-center justify-center space-x-2"
                        >
                            <ShieldCheck size={14} />
                            <span>Pay</span>
                        </button>
                    </div>
                )}

                {step === 'CHECKOUT' && ctx && (
                    <div className="flex flex-col flex-1 min-h-0 sm:min-h-[520px]">
                        {/* Top bar — back + title, toggle directly beneath */}
                        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                            <div className="flex items-center gap-3 mb-4">
                                <button
                                    onClick={() => { setStep('READY'); setError(null); }}
                                    className="p-2 -ml-2 rounded-xl hover:bg-slate-100 transition-colors"
                                >
                                    <ArrowLeft size={18} className="text-slate-500" />
                                </button>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Payment</h3>
                                    <p className="text-[10px] font-semibold text-slate-400">{ctx.organization.name} · K{totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                                <button
                                    onClick={() => { setCheckoutMethod('mobile-money'); setError(null); }}
                                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${
                                        checkoutMethod === 'mobile-money' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'
                                    }`}
                                >
                                    <Smartphone size={13} /> Mobile Money
                                </button>
                                <button
                                    onClick={() => { setCheckoutMethod('card'); setError(null); }}
                                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${
                                        checkoutMethod === 'card' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'
                                    }`}
                                >
                                    <CreditCard size={13} /> Card
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-6">
                            {checkoutMethod === 'mobile-money' ? (
                                <>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                                        Mobile Money Number
                                    </label>
                                    <div className="relative">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="e.g. 0971234567"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-20 py-3.5 text-sm font-bold text-slate-800 focus:border-blue-500 focus:outline-none"
                                        />
                                        {operator && (
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                <span className={`text-[10px] font-black px-2 py-1 rounded bg-white border border-slate-100 uppercase tracking-tighter ${OPERATOR_COLORS[operator]}`}>
                                                    {operator}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {phone.length >= 9 && (
                                        <div className="mt-3 p-4 rounded-2xl bg-blue-50/70 border border-blue-100 flex items-center gap-3">
                                            {resolvingAccountName ? (
                                                <Loader2 size={16} className="text-blue-600 animate-spin flex-shrink-0" />
                                            ) : resolvedAccountName ? (
                                                <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
                                            ) : (
                                                <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Account Holder</p>
                                                <p className="text-sm font-bold text-slate-800 truncate">
                                                    {resolvingAccountName
                                                        ? 'Verifying number…'
                                                        : resolvedAccountName || (resolveFailed ? 'Could not verify — check the number' : 'Waiting for a valid number…')}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {error && (
                                        <div className="mt-4 p-3.5 bg-rose-50 text-rose-600 rounded-xl flex items-start space-x-2">
                                            <AlertCircle className="flex-shrink-0 mt-0.5" size={14} />
                                            <span className="text-[11px] font-semibold leading-normal">{error}</span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-10 px-4 bg-slate-50/70 border border-slate-100 rounded-2xl">
                                    <div className="mx-auto w-12 h-12 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center mb-3">
                                        <CreditCard size={22} />
                                    </div>
                                    <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">Card — Coming Soon</h4>
                                    <p className="text-[11px] font-semibold text-slate-400 mt-2 max-w-[220px] mx-auto leading-relaxed">
                                        Card payments aren’t available here yet. Please use Mobile Money for now.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="sticky bottom-0 mt-auto bg-white border-t border-slate-100 px-6 pt-4 pb-6">
                            {checkoutMethod === 'mobile-money' ? (
                                <button
                                    onClick={handlePayMobileMoney}
                                    disabled={submitting || !operator || resolvingAccountName}
                                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-lg shadow-blue-100 flex items-center justify-center space-x-2"
                                >
                                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />}
                                    <span>{submitting ? 'Starting…' : `Pay K${totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</span>
                                </button>
                            ) : (
                                <button disabled className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.15em] bg-slate-100 text-slate-400 cursor-not-allowed">
                                    Coming Soon
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {step === 'INACTIVE' && ctx && (
                    <div className="p-8 text-center min-h-[450px] flex flex-col justify-center">
                        <div className="mx-auto w-16 h-16 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center mb-4">
                            <XCircle size={32} />
                        </div>
                        <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">
                            {ctx.status === 'PAID' ? 'Already Paid' : 'Link Inactive'}
                        </h3>
                        <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed font-semibold mt-3">
                            {ctx.status === 'PAID'
                                ? 'This payment link has already been used and is no longer active.'
                                : 'This payment link is no longer active. Please request a new one from the business.'}
                        </p>
                    </div>
                )}

                {/* Waiting for USSD approval — premium live-narration screen */}
                {step === 'VERIFYING' && displayPaymentPhase && ctx && (
                    <div className="flex flex-col flex-1 min-h-0 sm:min-h-[520px]">
                        <PaymentWaitingScreen
                            phase={displayPaymentPhase}
                            amount={resumedPayment ? resumedPayment.amount : totalPayable}
                            businessName={ctx.organization.name}
                            payerPhone={resumedPayment ? resumedPayment.phone : phone}
                            operator={detectOperator(resumedPayment ? resumedPayment.phone : phone)}
                            isSlowNetwork={isSlowNetwork}
                            elapsedSeconds={elapsedSeconds}
                            reference={receiptNumber || currentReference}
                            failureIsDeclined={failureIsDeclined}
                            failureReason={verificationReason}
                            cancelling={cancelling}
                            rechecking={rechecking}
                            recheckNote={recheckNote}
                            dismissLabel="Close"
                            onCancel={handleCancelPayment}
                            onRetry={handleRetryPayment}
                            onDismiss={handleDismissFailed}
                            onDone={handleViewReceipt}
                            onRecheck={handleRecheckPayment}
                        />
                    </div>
                )}

                {step === 'VERIFYING' && !displayPaymentPhase && (
                    <div className="flex-1 min-h-0 p-10 flex flex-col items-center justify-center sm:min-h-[450px]">
                        {verificationStep === 'POLLING' ? (
                            <>
                                <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl animate-spin mb-4">
                                    <Loader2 size={32} />
                                </div>
                                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest text-center">Verifying Payment</h3>
                                <p className="text-xs text-slate-400 mt-2 text-center max-w-xs leading-relaxed font-semibold">
                                    Please wait while we sync your payment with the business ledger...
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl mb-4">
                                    <AlertCircle size={32} />
                                </div>
                                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest text-center">Reconciliation Pending</h3>
                                <p className="text-xs text-slate-400 mt-3 text-center max-w-xs leading-relaxed font-medium">
                                    {verificationReason}
                                </p>
                                <button
                                    onClick={() => { setStep('CHECKOUT'); setVerificationStep('POLLING'); }}
                                    className="mt-5 px-5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider transition-all"
                                >
                                    Try Again
                                </button>
                            </>
                        )}
                    </div>
                )}

                {step === 'SUCCESS' && ctx && (
                    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto px-6 pb-6 sm:min-h-[450px]">
                        {/* Success seal + headline — matches the open catalogue portal's Congratulations screen */}
                        <div className="flex flex-col items-center text-center pt-8 pb-1">
                            <div className="relative w-24 h-24 animate-in zoom-in-75 duration-300">
                                <BadgeCheck
                                    className="w-24 h-24 text-[#002962]"
                                    fill="#006AFF"
                                    strokeWidth={1.5}
                                    style={{ filter: 'drop-shadow(-5px 5px 0 rgba(0,41,98,1))' }}
                                />
                                {/* White tick overlaid on top of the seal's own check — no shadow, sits flat above it */}
                                <Check className="absolute inset-0 m-auto w-9 h-9 text-white" strokeWidth={3} />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 mt-6">Congratulations</h2>
                            <p className="text-xs font-medium text-slate-500 mt-2 leading-relaxed">
                                Your payment was successful.<br />Thank you for your business.
                            </p>
                        </div>

                        {/* Payment Details */}
                        <div className="mt-7 bg-gray-50 border border-neutral-200 rounded-2xl px-6 pt-4 pb-5">
                            <div className="flex items-center gap-2 mb-3">
                                <Wallet size={15} className="text-slate-900" />
                                <span className="text-xs font-bold text-zinc-600">Payment Details</span>
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-zinc-600">Payment Method</span>
                                    <span className="text-xs font-semibold text-zinc-600">{checkoutMethod === 'card' ? 'Card' : 'Mobile Money'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-zinc-600">Account Number</span>
                                    <span className="text-xs font-semibold text-zinc-600">{phone || ctx.customer_phone}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-zinc-600">Account Name</span>
                                    <span className="text-xs font-bold text-zinc-600 text-right truncate max-w-[55%]">{ctx.customer_name}</span>
                                </div>
                            </div>
                        </div>

                        {/* Order Summary */}
                        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-2xl px-6 py-4">
                            <div className="flex items-center gap-2 mb-3">
                                <ClipboardList size={15} className="text-slate-900" />
                                <span className="text-xs font-bold text-zinc-600">Order Summary</span>
                            </div>
                            <div className="space-y-2">
                                {linkItems.map((it, i) => (
                                    <div key={i} className="flex justify-between items-center gap-3">
                                        <span className="text-xs text-zinc-600 truncate">
                                            {it.name}
                                            {it.check_in && it.check_out ? ` · ${it.check_in} → ${it.check_out}` : it.quantity > 1 ? ` (x${it.quantity})` : ''}
                                        </span>
                                        <span className="text-xs text-zinc-600 flex-shrink-0">
                                            K{(it.unit_price * it.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                ))}
                                <div className="flex justify-between items-center gap-3">
                                    <span className="text-xs text-zinc-600">Transaction Cost</span>
                                    <span className="text-xs text-zinc-600 flex-shrink-0">
                                        K{processingFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="border-t border-neutral-200 my-1" />
                                <div className="flex justify-between items-center gap-3">
                                    <span className="text-xs font-bold text-slate-900">Payment Total</span>
                                    <span className="text-xs font-bold text-slate-900 flex-shrink-0">
                                        K{totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <p className="text-center text-[10px] font-semibold text-slate-300 mt-4">
                            Receipt No: {receiptNumber ? `#${receiptNumber}` : currentReference.replace('-PL', '')}
                        </p>
                    </div>
                )}

                {step === 'ERROR' && (
                    <div className="p-8 text-center min-h-[450px] flex flex-col justify-center">
                        <div className="mx-auto w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
                            <AlertCircle size={32} />
                        </div>
                        <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">
                            {errorInfo?.title || 'Unable to load link'}
                        </h3>
                        <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed font-semibold mt-3">
                            {errorInfo?.message || 'We couldn’t load this payment link right now. Please try again in a moment.'}
                        </p>

                        {errorInfo?.tips && errorInfo.tips.length > 0 && (
                            <div className="text-left bg-slate-50 border border-slate-100/50 rounded-2xl p-4 max-w-xs mx-auto space-y-2 mt-5">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">What you can try</p>
                                <ul className="space-y-1.5">
                                    {errorInfo.tips.map((tip, i) => (
                                        <li key={i} className="flex items-start gap-2 text-[11px] font-medium text-slate-500 leading-relaxed">
                                            <span className="mt-1.5 h-1 w-1 rounded-full bg-slate-300 flex-shrink-0" />
                                            <span>{tip}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {(errorInfo?.retry ?? true) && (
                            <button
                                onClick={loadContext}
                                className="mt-6 w-full bg-slate-950 hover:bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={14} /> Try Again
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Hidden on the premium processing screen (own header) and on mobile during
                the full-bleed post-pay steps, where it would push past the viewport. */}
            {!(step === 'VERIFYING' && displayPaymentPhase) && (
                <div className={`mt-8 text-center space-y-2 ${isAppStep ? 'hidden sm:block' : ''}`}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center space-x-1.5">
                        <Building2 size={12} />
                        <span>Secured by MoneyWise Ledger Gateway</span>
                    </p>
                    <p className="text-[9px] font-medium text-slate-400">
                        Terms & Privacy Apply. Payments are processed securely via Lenco.
                    </p>
                </div>
            )}
        </div>
    );
};
