import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import posthog from '../lib/posthog';
import { trackEvent, trackVerificationTimeout } from '../lib/analytics';
import { Loader2, ArrowLeft, Delete, Check, AlertCircle, ChevronDown, BadgeCheck, ShieldCheck, Smartphone, CreditCard } from 'lucide-react';
import { calculatePlatformFee } from 'shared';
import { PaymentWaitingScreen, PaymentPhase } from '../components/PaymentWaitingScreen';
import { savePendingPayment, loadPendingPayment, clearPendingPayment } from '../lib/paymentRecovery';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

// Inject the blinking-cursor keyframes once. A hard on/off blink (rather than
// Tailwind's animate-pulse fade) reads as an actual text-input caret.
const CURSOR_STYLE_ID = 'mw-quicklink-cursor-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(CURSOR_STYLE_ID)) {
    const el = document.createElement('style');
    el.id = CURSOR_STYLE_ID;
    el.textContent = `
@keyframes mw-cursor-blink {
  0%, 45%   { opacity: 1; }
  50%, 95%  { opacity: 0; }
  100%      { opacity: 1; }
}
.mw-blink-cursor { animation: mw-cursor-blink 1s steps(1) infinite; }`;
    document.head.appendChild(el);
}

interface QuickLinkOrg {
    id: string;
    name: string;
    logo_url: string | null;
}

interface QuickLinkWallet {
    id: string;
    lenco_subaccount_id: string | null;
    lenco_public_key: string | null;
    payment_test_mode: boolean;
}

interface QuickLinkPurpose {
    id: string;
    label: string;
}

// Detect the Zambian mobile money operator from a phone prefix. Mirrors
// LencoService.resolveMobileOperator on the API and PublicPay.tsx's own copy.
function detectOperator(phone: string): 'airtel' | 'mtn' | 'zamtel' | null {
    const clean = (phone || '').replace(/[^0-9]/g, '');
    let normalized = clean.startsWith('260') ? '0' + clean.slice(3) : clean;
    if (normalized.length === 9 && /^[975]/.test(normalized)) {
        normalized = '0' + normalized;
    }
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

const QUICK_AMOUNTS = [500, 1000, 2500];
const SLOW_LATENCY_MS = 1200;

// AMOUNT -> PURPOSE -> PHONE is the 3-step flow shown by the progress bar.
// PROCESSING has its own full-screen header (PaymentWaitingScreen) instead.
const STEP_INDEX: Record<string, number> = { AMOUNT: 1, PURPOSE: 2, PHONE: 3 };
const TOTAL_STEPS = 3;

const StepProgress: React.FC<{ step: number }> = ({ step }) => (
    <div>
        <div className="px-8 py-2.5 bg-white border-b border-neutral-200 flex items-center gap-2.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div key={i} className={`flex-1 h-1.5 rounded-xl ${i < step ? 'bg-black' : 'bg-neutral-200'}`} />
            ))}
        </div>
        <div className="flex justify-center items-center py-1.5">
            <span className="text-xs text-slate-500">Step {step} of {TOTAL_STEPS}</span>
        </div>
    </div>
);

// Full-viewport frame: edge-to-edge on mobile, a centered card with rounded
// corners, a subtle border and its own background (distinct from the page
// behind it) on wider screens, with room to breathe either side.
const PageFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    // h-dvh (not h-screen/100vh) so mobile browser chrome that shows/hides on
    // scroll (Safari/Chrome address bar) never clips the footer — the dynamic
    // viewport unit already accounts for it. min-h-0 on the flex column lets
    // its scrollable middle section actually shrink instead of overflowing the
    // fixed-height frame and pushing the footer off-screen.
    <div className="h-dvh bg-slate-200 flex items-center justify-center sm:py-10 sm:px-4">
        <div className="w-full h-dvh min-h-0 sm:h-[min(720px,85vh)] sm:max-w-md bg-neutral-50 flex flex-col sm:rounded-3xl sm:border sm:border-slate-300 sm:shadow-xl overflow-hidden">
            {children}
        </div>
    </div>
);

export const QuickPay: React.FC = () => {
    // The route param is shared with /pay/:wallet_id (see PayEntry.tsx) — here
    // it's the org's Quick Link username, not a wallet id.
    const { wallet_id: username } = useParams<{ wallet_id: string }>();

    const [step, setStep] = useState<'LOADING' | 'ERROR' | 'AMOUNT' | 'PURPOSE' | 'PHONE' | 'PROCESSING'>('LOADING');
    const [org, setOrg] = useState<QuickLinkOrg | null>(null);
    const [wallet, setWallet] = useState<QuickLinkWallet | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // AMOUNT step — a plain typed digit string, e.g. "1250.5", not a number
    // input, so the on-screen keypad fully controls formatting (matches the
    // Figma calculator-style entry; no native numeric keyboard involved).
    const [amountStr, setAmountStr] = useState('');
    const amount = parseFloat(amountStr) || 0;

    // PURPOSE step
    const [purposes, setPurposes] = useState<QuickLinkPurpose[]>([]);
    const [selectedPurposeId, setSelectedPurposeId] = useState<string | null>(null);
    const [customPurpose, setCustomPurpose] = useState('');
    const [purposeError, setPurposeError] = useState<string | null>(null);

    // PHONE step
    const [checkoutMethod, setCheckoutMethod] = useState<'mobile-money' | 'card'>('mobile-money');
    const [checkoutPhone, setCheckoutPhone] = useState('');
    const [resolvedAccountName, setResolvedAccountName] = useState('');
    const [resolvingAccountName, setResolvingAccountName] = useState(false);
    const [resolveFailed, setResolveFailed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // PROCESSING step (mirrors PublicPay's own-UX collection lifecycle)
    const [paymentPhase, setPaymentPhase] = useState<PaymentPhase | null>(null);
    const [awaitingApproval, setAwaitingApproval] = useState(false);
    const [failureIsDeclined, setFailureIsDeclined] = useState(false);
    const [verificationReason, setVerificationReason] = useState('');
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [networkLatencyMs, setNetworkLatencyMs] = useState<number | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const [rechecking, setRechecking] = useState(false);
    const [recheckNote, setRecheckNote] = useState<string | null>(null);
    const [currentReference, setCurrentReference] = useState('');
    const [resumedPayment, setResumedPayment] = useState<{ amount: number; phone: string } | null>(null);
    const pollCancelledRef = useRef(false);
    const resumedRef = useRef(false);

    const processingFee = calculatePlatformFee(amount);
    const totalPayable = amount > 0 ? amount + processingFee : 0;
    const isSlowNetwork = networkLatencyMs !== null && networkLatencyMs > SLOW_LATENCY_MS;
    const displayPaymentPhase: PaymentPhase | null =
        paymentPhase === 'confirm' && elapsedSeconds >= 6 ? 'polling' : paymentPhase;

    // ---- Load org + wallet context, resuming an in-flight payment if any ----
    useEffect(() => {
        if (!username) {
            setErrorMessage('This payment link looks incomplete.');
            setStep('ERROR');
            return;
        }

        (async () => {
            try {
                posthog.capture('quick_link_opened', { username });
                const res = await axios.get(`${API_URL}/lenco/public-quicklink-context/${username}`, { timeout: 30000 });
                setOrg(res.data.organization);
                setWallet(res.data.wallet);

                if (!resumedRef.current) {
                    const saved = loadPendingPayment(username);
                    if (saved) {
                        resumedRef.current = true;
                        const elapsedAtResume = Math.max(0, Math.floor((Date.now() - saved.startedAt) / 1000));
                        setCurrentReference(saved.reference);
                        setCheckoutPhone(saved.phone);
                        setResumedPayment({ amount: saved.amount, phone: saved.phone });
                        setAwaitingApproval(true);
                        setPaymentPhase('polling');
                        setElapsedSeconds(elapsedAtResume);
                        setStep('PROCESSING');
                        startCompletionPoll(saved.reference, saved.orgId, saved.startedAt);
                        return;
                    }
                }

                setStep('AMOUNT');
            } catch (err: any) {
                console.error('[Quick Link] Failed to load context:', err);
                setErrorMessage(
                    err?.response?.status === 404
                        ? 'This payment link could not be found.'
                        : 'Could not load this payment page. Please try again.'
                );
                setStep('ERROR');
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [username]);

    // ---- Fetch ranked purposes once we reach PURPOSE ----
    useEffect(() => {
        if (step !== 'PURPOSE' || !username) return;
        axios.get(`${API_URL}/lenco/public-quicklink-purposes/${username}`)
            .then(res => setPurposes(res.data?.purposes || []))
            .catch(err => console.error('[Quick Link] Failed to load purposes:', err));
    }, [step, username]);

    // ---- Resolve the mobile money account holder's name as the customer types ----
    useEffect(() => {
        if (step !== 'PHONE' || checkoutMethod !== 'mobile-money' || !wallet) return;
        const operator = detectOperator(checkoutPhone);
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
                    phone: checkoutPhone, operator, walletId: wallet.id,
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
    }, [checkoutPhone, checkoutMethod, step, wallet]);

    useEffect(() => {
        if (!awaitingApproval) return;
        const interval = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
        return () => clearInterval(interval);
    }, [awaitingApproval]);

    // ---- Keypad ----
    const pressDigit = (d: string) => {
        setAmountStr(prev => {
            if (d === '.') return prev.includes('.') ? prev : (prev || '0') + '.';
            const decimalIndex = prev.indexOf('.');
            if (decimalIndex !== -1 && prev.length - decimalIndex > 2) return prev; // max 2 decimals
            if (prev === '0') return d;
            if (prev.length >= 10) return prev;
            return prev + d;
        });
    };
    const pressBackspace = () => setAmountStr(prev => prev.slice(0, -1));

    // ---- Physical keyboard support for the amount step (digits, '.', Backspace) ----
    useEffect(() => {
        if (step !== 'AMOUNT') return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key >= '0' && e.key <= '9') {
                pressDigit(e.key);
            } else if (e.key === '.') {
                pressDigit('.');
            } else if (e.key === 'Backspace') {
                pressBackspace();
            } else {
                return;
            }
            e.preventDefault();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    const handleProceedFromAmount = () => {
        if (amount <= 0) return;
        setStep('PURPOSE');
    };

    const canProceedFromPurpose = !!customPurpose.trim() || !!selectedPurposeId;
    const handleProceedFromPurpose = () => {
        if (!canProceedFromPurpose) return;
        setPurposeError(null);
        setStep('PHONE');
    };

    // ---- Submission (mirrors PublicPay's handlePayMobileMoney) ----
    const startCompletionPoll = (ref: string, orgId: string, startedAt: number) => {
        pollCancelledRef.current = false;
        let attempts = 0;
        const maxAttempts = 90; // ~3 min at 2s
        const pollStatus = async () => {
            if (pollCancelledRef.current) return;
            attempts++;
            try {
                const verifyRes = await axios.get(`${API_URL}/lenco/public-verify-status/${ref}?organizationId=${orgId}`);
                if (pollCancelledRef.current) return;
                if (verifyRes.data.verified) {
                    setAwaitingApproval(false);
                    setPaymentPhase('success');
                    clearPendingPayment();
                    trackEvent('quick_link_checkout', 'payment', 'succeeded', {
                        workflow_id: ref, organization_id: orgId, amount, total_payable: totalPayable,
                        duration_ms: Date.now() - startedAt,
                    });
                    return;
                }
                if (verifyRes.data.status === 'failed') {
                    setVerificationReason(verifyRes.data.message || 'The payment was declined or not approved on your phone. You can go back and try again.');
                    setAwaitingApproval(false);
                    setFailureIsDeclined(true);
                    setPaymentPhase('failed');
                    clearPendingPayment();
                    trackEvent('quick_link_checkout', 'payment', 'failed', {
                        workflow_id: ref, organization_id: orgId, error_code: verifyRes.data.reasonCode || 'declined',
                        duration_ms: Date.now() - startedAt,
                    });
                    return;
                }
            } catch (err) {
                console.error('[Quick Link] Verification attempt failed:', err);
            }
            if (pollCancelledRef.current) return;
            if (attempts < maxAttempts) {
                setTimeout(pollStatus, 2000);
            } else {
                setVerificationReason('This is taking longer than usual. If you approved the prompt, your payment may still be processing — check its status below.');
                setAwaitingApproval(false);
                setFailureIsDeclined(false);
                setPaymentPhase('failed');
                trackVerificationTimeout('quick_link_checkout', { workflow_id: ref, organization_id: orgId, attempts, duration_ms: Date.now() - startedAt });
            }
        };
        pollStatus();
    };

    const handleSend = async () => {
        const operator = detectOperator(checkoutPhone);
        if (!operator) {
            setError('Please enter a valid Zambian mobile money number (Airtel, MTN, or Zamtel).');
            return;
        }
        const purposeLabel = customPurpose.trim() || purposes.find(p => p.id === selectedPurposeId)?.label;
        if (!purposeLabel) {
            setStep('PURPOSE');
            setPurposeError('Please select or type a reason for this payment.');
            return;
        }
        if (!wallet || !org || !username) return;

        const payerPhone = checkoutPhone;
        const ref = `DEP-${Date.now()}-${(wallet.lenco_subaccount_id || 'quicklink').substring(0, 8)}-PUB`;
        setCurrentReference(ref);
        setError(null);
        setSubmitting(true);
        pollCancelledRef.current = false;
        setElapsedSeconds(0);
        setAwaitingApproval(false);
        setPaymentPhase('initiating');
        setStep('PROCESSING');

        const checkoutStartedAt = Date.now();
        trackEvent('quick_link_checkout', 'payment', 'started', {
            workflow_id: ref, organization_id: org.id, wallet_id: wallet.id, amount, total_payable: totalPayable,
        });

        try {
            await axios.post(`${API_URL}/lenco/public-quicklink-intent`, {
                reference: ref,
                amount,
                walletId: wallet.id,
                purpose: purposeLabel,
                isCustomPurpose: !!customPurpose.trim(),
            });

            const initRes = await axios.post(`${API_URL}/lenco/public-collection/mobile-money`, {
                reference: ref,
                amount: totalPayable,
                phone: checkoutPhone,
                operator,
                walletId: wallet.id,
            });

            const status = initRes.data?.data?.status;
            if (status !== 'pay-offline' && status !== 'pending' && status !== 'successful') {
                throw new Error(`Payment could not be started (status: ${status || 'unknown'}). Please try again.`);
            }

            savePendingPayment({
                reference: ref, contextId: username, orgId: org.id, phone: payerPhone,
                amount: totalPayable, businessName: org.name, startedAt: checkoutStartedAt,
            });
            setResumedPayment(null);
            setRecheckNote(null);
            setPaymentPhase('confirm');
            setAwaitingApproval(true);
            setElapsedSeconds(0);
            setSubmitting(false);

            startCompletionPoll(ref, org.id, checkoutStartedAt);
        } catch (err: any) {
            console.error('[Quick Link] Failed to initiate payment:', err);
            clearPendingPayment();
            setSubmitting(false);
            setAwaitingApproval(false);
            setPaymentPhase(null);
            setStep('PHONE');
            setError(err.response?.data?.error || err.message || 'Failed to start the payment. Please try again.');
            trackEvent('quick_link_checkout', 'payment', 'failed', {
                workflow_id: ref, organization_id: org.id, error_code: err?.response?.status || 'NETWORK_ERROR',
                error_message: err?.response?.data?.error || err.message, duration_ms: Date.now() - checkoutStartedAt,
            });
        }
    };

    const handleCancelPayment = async () => {
        setCancelling(true);
        pollCancelledRef.current = true;
        try {
            await axios.post(`${API_URL}/lenco/public-collection/cancel`, { reference: currentReference });
        } catch (err) {
            console.error('[Quick Link] Failed to cancel payment intent:', err);
        } finally {
            setCancelling(false);
            setAwaitingApproval(false);
            setElapsedSeconds(0);
            setRecheckNote(null);
            setPaymentPhase('cancelled');
        }
    };

    const handleRecheckPayment = async () => {
        if (!org || !currentReference) return;
        setRechecking(true);
        setRecheckNote(null);
        try {
            const verifyRes = await axios.get(`${API_URL}/lenco/public-verify-status/${currentReference}?organizationId=${org.id}`);
            if (verifyRes.data.verified) {
                setAwaitingApproval(false);
                setPaymentPhase('success');
                clearPendingPayment();
            } else if (verifyRes.data.status === 'failed') {
                setRecheckNote(verifyRes.data.message || 'This payment was declined — nothing has been charged. You can try again.');
                clearPendingPayment();
            } else {
                setRecheckNote('Not confirmed yet. If you just approved it, wait a few seconds and check again.');
            }
        } catch (err) {
            console.error('[Quick Link] Recheck failed:', err);
            setRecheckNote('Couldn’t check right now — please try again in a moment.');
        } finally {
            setRechecking(false);
        }
    };

    const handleRetryPayment = () => {
        pollCancelledRef.current = true;
        clearPendingPayment();
        setPaymentPhase(null);
        setResumedPayment(null);
        setRecheckNote(null);
        setError(null);
        setStep('PHONE');
    };

    const handleDismissAfterFailure = () => {
        pollCancelledRef.current = true;
        clearPendingPayment();
        setPaymentPhase(null);
        setResumedPayment(null);
        setRecheckNote(null);
        setError(null);
        setPurposeError(null);
        setAmountStr('');
        setCheckoutPhone('');
        setSelectedPurposeId(null);
        setCustomPurpose('');
        setStep('AMOUNT');
    };

    const handleDone = () => {
        setPaymentPhase(null);
        setResumedPayment(null);
        setAmountStr('');
        setCheckoutPhone('');
        setSelectedPurposeId(null);
        setCustomPurpose('');
        setStep('AMOUNT');
    };

    // ---- Render ----
    if (step === 'LOADING') {
        return (
            <PageFrame>
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
            </PageFrame>
        );
    }

    if (step === 'ERROR') {
        return (
            <PageFrame>
                <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
                    <AlertCircle size={32} className="text-rose-400" />
                    <p className="text-sm font-semibold text-slate-700">{errorMessage}</p>
                </div>
            </PageFrame>
        );
    }

    if (step === 'PROCESSING' && displayPaymentPhase && org) {
        return (
            <PageFrame>
                <PaymentWaitingScreen
                    phase={displayPaymentPhase}
                    amount={resumedPayment ? resumedPayment.amount : totalPayable}
                    businessName={org.name}
                    payerPhone={resumedPayment ? resumedPayment.phone : checkoutPhone}
                    operator={detectOperator(resumedPayment ? resumedPayment.phone : checkoutPhone)}
                    isSlowNetwork={isSlowNetwork}
                    elapsedSeconds={elapsedSeconds}
                    reference={currentReference}
                    failureIsDeclined={failureIsDeclined}
                    failureReason={verificationReason}
                    cancelling={cancelling}
                    rechecking={rechecking}
                    recheckNote={recheckNote}
                    dismissLabel="Start over"
                    onCancel={handleCancelPayment}
                    onRetry={handleRetryPayment}
                    onDismiss={handleDismissAfterFailure}
                    onDone={handleDone}
                    onRecheck={handleRecheckPayment}
                />
            </PageFrame>
        );
    }

    if (step === 'AMOUNT' && org) {
        return (
            <PageFrame>
                <div className="px-7 py-3 flex items-center justify-center bg-white">
                    <span className="text-base font-bold text-black">Moneywise</span>
                </div>
                <StepProgress step={STEP_INDEX.AMOUNT} />

                <div className="flex-1 min-h-0 flex flex-col px-6 py-2 sm:py-4 overflow-y-auto">
                    <div className="flex flex-col items-center">
                        <span className="text-xs text-black">You are sending money to</span>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-base font-bold text-black uppercase">{org.name}</span>
                            <BadgeCheck size={18} className="text-blue-600 fill-blue-600" style={{ color: 'white' }} />
                        </div>
                    </div>

                    <div className="w-full max-w-xs mx-auto mt-3 sm:mt-4">
                        <div className="flex items-center justify-between gap-1.5">
                            <span className="text-4xl sm:text-5xl font-bold text-black">K</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-4xl sm:text-5xl font-bold text-black">{amountStr}</span>
                                <span className="mw-blink-cursor inline-block w-1 h-9 sm:h-11 bg-black" />
                            </div>
                        </div>
                        <div className="border-b-2 border-neutral-300 mt-2 w-full" />
                    </div>

                    <p className="text-xs font-medium text-neutral-500 text-center mt-2 sm:mt-3">
                        You can send money using any mobile money network
                    </p>

                    <div className="w-full flex gap-3 sm:gap-4 mt-4 sm:mt-8">
                        {QUICK_AMOUNTS.map(a => (
                            <button
                                key={a}
                                onClick={() => setAmountStr(String(a))}
                                className="flex-1 h-10 sm:h-12 bg-zinc-100 hover:bg-zinc-200 rounded-xl flex items-center justify-center transition-colors"
                            >
                                <span className="text-xs font-bold text-black">K{a.toLocaleString()}</span>
                            </button>
                        ))}
                    </div>

                    <div className="w-full flex flex-col gap-2 sm:gap-5 mt-4 sm:mt-8">
                        {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']].map((row, i) => (
                            <div key={i} className="flex items-center gap-10">
                                {row.map(d => (
                                    <button key={d} onClick={() => pressDigit(d)} className="flex-1 py-1 sm:py-2 text-center text-2xl sm:text-3xl font-bold text-black">
                                        {d}
                                    </button>
                                ))}
                            </div>
                        ))}
                        <div className="flex items-center gap-10">
                            <button onClick={() => pressDigit('.')} className="flex-1 py-1 sm:py-2 text-center text-2xl sm:text-3xl font-bold text-black">.</button>
                            <button onClick={() => pressDigit('0')} className="flex-1 py-1 sm:py-2 text-center text-2xl sm:text-3xl font-bold text-black">0</button>
                            <button onClick={pressBackspace} className="flex-1 py-1 sm:py-2 flex items-center justify-center">
                                <Delete size={24} className="text-black" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="px-7 py-4 sm:py-8 bg-white border-t border-gray-100 flex flex-col items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <ShieldCheck size={14} style={{ color: '#585858' }} />
                        <span style={{ color: '#585858', fontSize: '12px' }}>Secure payments powered by Lenco</span>
                    </div>
                    <button
                        onClick={handleProceedFromAmount}
                        disabled={amount <= 0}
                        className={`w-full h-14 rounded-xl font-bold text-base transition-all ${
                            amount > 0 ? 'bg-black hover:bg-slate-800 text-white' : 'bg-neutral-100 text-zinc-400 cursor-not-allowed'
                        }`}
                    >
                        Send to {org.name}
                    </button>
                </div>
            </PageFrame>
        );
    }

    if (step === 'PURPOSE' && org) {
        return (
            <PageFrame>
                <div className="px-7 py-3 flex items-center gap-6 bg-white">
                    <button onClick={() => setStep('AMOUNT')} className="p-1 -ml-1 rounded-lg hover:bg-slate-100 transition-colors">
                        <ArrowLeft size={20} className="text-black" />
                    </button>
                    <h3 className="text-base font-semibold text-black">Purpose</h3>
                </div>
                <StepProgress step={STEP_INDEX.PURPOSE} />

                <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-6 pb-2">
                    <p className="text-sm font-medium text-gray-800 mb-3">Please tap to indicate the purpose of this deposit</p>
                    <div className="grid grid-cols-2 gap-3">
                        {purposes.filter(p => p.label.trim().toLowerCase() !== 'other').map(p => {
                            const selected = selectedPurposeId === p.id && !customPurpose.trim();
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => {
                                        setSelectedPurposeId(prev => prev === p.id ? null : p.id);
                                        setCustomPurpose('');
                                        setPurposeError(null);
                                    }}
                                    className={`px-3 py-4 bg-white rounded-xl border flex items-center gap-3 text-left transition-colors ${
                                        selected ? 'border-black' : 'border-zinc-300'
                                    }`}
                                    style={{ boxShadow: '0px 1px 4px 0px rgba(0,0,0,0.10)' }}
                                >
                                    <span className={`w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center ${
                                        selected ? 'bg-black border-black' : 'bg-white border-zinc-300'
                                    }`}>
                                        {selected && <Check size={13} className="text-white" strokeWidth={3} />}
                                    </span>
                                    <span className="text-sm font-medium text-black">{p.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <input
                        type="text"
                        value={customPurpose}
                        onChange={(e) => { setCustomPurpose(e.target.value); setSelectedPurposeId(null); setPurposeError(null); }}
                        placeholder="Not listed? Type your own reason"
                        className="w-full mt-3 px-4 py-5 bg-white border border-zinc-300 rounded-xl text-sm text-black placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-slate-200"
                    />

                    {purposeError && (
                        <div className="mt-4 p-3.5 bg-rose-50 text-rose-600 rounded-xl flex items-start space-x-2">
                            <AlertCircle className="flex-shrink-0 mt-0.5" size={14} />
                            <span className="text-[11px] font-semibold leading-normal">{purposeError}</span>
                        </div>
                    )}
                </div>

                <div className="bg-white border-t border-gray-100 px-7 py-6">
                    <button
                        onClick={handleProceedFromPurpose}
                        disabled={!canProceedFromPurpose}
                        className={`w-full h-14 rounded-xl font-bold text-base transition-all ${
                            canProceedFromPurpose ? 'bg-black hover:bg-slate-800 text-white' : 'bg-neutral-100 text-zinc-400 cursor-not-allowed'
                        }`}
                    >
                        Continue
                    </button>
                </div>
            </PageFrame>
        );
    }

    if (step === 'PHONE' && org) {
        const canSend = !submitting && checkoutMethod === 'mobile-money' && !!detectOperator(checkoutPhone) && !resolvingAccountName;

        return (
            <PageFrame>
                <div className="px-7 py-3 flex items-center gap-6 bg-white">
                    <button onClick={() => setStep('PURPOSE')} className="p-1 -ml-1 rounded-lg hover:bg-slate-100 transition-colors">
                        <ArrowLeft size={20} className="text-black" />
                    </button>
                    <h3 className="text-base font-semibold text-black">Payment</h3>
                </div>
                <StepProgress step={STEP_INDEX.PHONE} />

                <div className="px-4 pt-4">
                    <div className="p-0.5 bg-neutral-100 rounded-full flex items-center">
                        <button
                            onClick={() => setCheckoutMethod('mobile-money')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-xs leading-4 transition-all ${
                                checkoutMethod === 'mobile-money' ? 'bg-white text-gray-800 font-normal shadow-sm' : 'text-gray-800 font-normal'
                            }`}
                        >
                            <Smartphone size={16} /> Mobile Money
                        </button>
                        <button
                            onClick={() => setCheckoutMethod('card')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-xs leading-4 transition-all ${
                                checkoutMethod === 'card' ? 'bg-white text-gray-800 font-normal shadow-sm' : 'text-gray-800 font-normal'
                            }`}
                        >
                            <CreditCard size={16} /> Debit Card
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-6 pb-2">
                    {checkoutMethod === 'mobile-money' ? (
                        <>
                            <label className="block text-sm font-semibold text-gray-800 mb-2">Enter your mobile money number</label>
                            <div className="min-h-12 bg-white rounded-full border border-slate-300 flex items-center overflow-hidden">
                                <div className="self-stretch p-3 bg-neutral-100 border-r border-slate-300 flex items-center gap-1.5">
                                    <span className="text-base leading-none" role="img" aria-label="Zambia">🇿🇲</span>
                                    <ChevronDown size={14} className="text-slate-400" />
                                </div>
                                <div className="flex-1 px-5 py-3 flex items-center gap-1.5 min-w-0">
                                    <span className="text-base font-semibold text-gray-600 flex-shrink-0">+260</span>
                                    <input
                                        type="tel"
                                        value={checkoutPhone}
                                        onChange={(e) => setCheckoutPhone(e.target.value)}
                                        placeholder="(971) 234 - 567"
                                        className="flex-1 min-w-0 text-base text-gray-600 outline-none bg-transparent placeholder:text-gray-400"
                                    />
                                    {detectOperator(checkoutPhone) && (
                                        <span className={`text-xs font-semibold uppercase tracking-tighter flex-shrink-0 ${OPERATOR_COLORS[detectOperator(checkoutPhone)!]}`}>
                                            {detectOperator(checkoutPhone)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {checkoutPhone.length >= 9 && (
                                <div className="mt-3 px-4 py-3 rounded-2xl bg-white border border-slate-200 flex items-center gap-3">
                                    {resolvingAccountName ? (
                                        <Loader2 size={16} className="text-blue-600 animate-spin flex-shrink-0" />
                                    ) : resolvedAccountName ? (
                                        <Check size={16} className="text-emerald-500 flex-shrink-0" />
                                    ) : (
                                        <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Account Holder</p>
                                        <p className="text-sm font-semibold text-gray-800 truncate">
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
                        <div className="text-center py-10 px-4 bg-white border border-slate-100 rounded-2xl">
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

                <div className="bg-white border-t border-gray-100 px-7 py-6 flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-zinc-600">Transfer Amount</span>
                            <span className="text-xs font-bold text-zinc-600">K{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] text-zinc-600">Platform Fee</span>
                            <span className="text-[10px] text-zinc-600">K{processingFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                    {checkoutMethod === 'mobile-money' ? (
                        <button
                            onClick={handleSend}
                            disabled={!canSend}
                            className={`w-full h-14 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
                                canSend ? 'bg-black hover:bg-slate-800 text-white' : 'bg-neutral-100 text-zinc-400 cursor-not-allowed'
                            }`}
                        >
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                            <span>{submitting ? 'Starting…' : `Send K${totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</span>
                        </button>
                    ) : (
                        <button disabled className="w-full h-14 rounded-xl font-bold text-base bg-neutral-100 text-zinc-400 cursor-not-allowed">
                            Coming Soon
                        </button>
                    )}
                </div>
            </PageFrame>
        );
    }

    return null;
};
