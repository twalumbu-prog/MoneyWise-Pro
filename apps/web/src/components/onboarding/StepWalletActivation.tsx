import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
    Wallet, WalletCards, ShieldCheck, Loader2, Check, Receipt, ArrowRight, Clock, Info, PiggyBank,
} from 'lucide-react';
import { calculatePlatformFee } from 'shared';
import { onboardingService, WalletStatus } from '../../services/onboarding.service';
import { StepFooter, ErrorBanner, PrimaryButton } from './ui';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
// Same public fallback key the customer checkout uses.
const FALLBACK_PUBLIC_KEY = 'pub-f3a595efda03948ae5dcd2effe073ef0aa2b333457a6c80d';

type Phase = 'LOADING' | 'INTRO' | 'NO_WALLETS' | 'CHECKOUT' | 'VERIFYING' | 'RECEIPT';

interface Props {
    organizationId: string;
    organizationName: string;
    logoUrl: string | null;
    userName: string | null;
    onBack: () => void;
    onProceed: () => Promise<void>;
    saving: boolean;
}

/**
 * Step 10 — wallet activation. Links a pre-provisioned wallet from the pool,
 * then takes the activation deposit through the same Lenco checkout customers
 * use — a one-product payment page ("Activate Wallet"). The deposit lands in
 * the organization's own wallet; it is not a fee.
 */
export const StepWalletActivation: React.FC<Props> = ({
    organizationId, organizationName, logoUrl, userName, onBack, onProceed, saving,
}) => {
    const [phase, setPhase] = useState<Phase>('LOADING');
    const [status, setStatus] = useState<WalletStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [claiming, setClaiming] = useState(false);
    const [paying, setPaying] = useState(false);
    const [reference, setReference] = useState<string | null>(null);
    const [paidAt, setPaidAt] = useState<Date | null>(null);

    const amount = status?.activation.amount ?? 0;
    const currency = status?.activation.currency ?? 'ZMW';
    const fee = calculatePlatformFee(amount);
    const total = amount + fee;

    useEffect(() => {
        onboardingService.getWalletStatus()
            .then(s => {
                setStatus(s);
                if (s.activated) {
                    setReference(s.activationReference);
                    setPhase('RECEIPT');
                } else {
                    setPhase('INTRO');
                }
            })
            .catch(() => {
                setError('Failed to load your wallet status. Please refresh.');
                setPhase('INTRO');
            });
    }, []);

    const handleActivate = async () => {
        setClaiming(true);
        setError(null);
        try {
            if (!status?.linked) {
                const claimed = await onboardingService.claimWallet();
                setStatus(s => s ? {
                    ...s,
                    linked: true,
                    providerAccountId: claimed.providerAccountId,
                    publicKey: claimed.publicKey,
                } : s);
            }
            setPhase('CHECKOUT');
        } catch (err: any) {
            if (String(err.message).includes('NO_WALLETS_AVAILABLE') || String(err.message).includes('preparing new wallets')) {
                setPhase('NO_WALLETS');
            } else {
                setError(err.message || 'Failed to prepare your wallet. Please try again.');
            }
        } finally {
            setClaiming(false);
        }
    };

    const handlePay = async () => {
        if (!status?.providerAccountId || !status.mainWalletId) {
            setError('Your wallet is not ready yet. Please try again.');
            return;
        }
        const LencoPay: any = (window as any).LencoPay;
        if (!LencoPay) {
            setError('The payment gateway failed to load. Please check your connection and reload.');
            return;
        }

        const ref = `DEP-${Date.now()}-${status.providerAccountId.substring(0, 8)}-ACT`;
        setReference(ref);
        setPaying(true);
        setError(null);

        try {
            // Log the deposit intent (same ledger path as every wallet deposit).
            await axios.post(`${API_URL}/lenco/public-wallet-deposit-intent`, {
                reference: ref,
                purpose: 'Wallet Activation Deposit',
                amount,
                walletId: status.mainWalletId,
                customerName: userName || organizationName,
                customerPhone: 'N/A',
            });

            LencoPay.getPaid({
                key: status.publicKey || FALLBACK_PUBLIC_KEY,
                amount: total.toFixed(2),
                currency,
                reference: ref,
                accountId: status.providerAccountId,
                email: 'customer@moneywise.co',
                name: userName || organizationName,
                phone: '',
                description: 'Wallet Activation Deposit',
                narration: 'Wallet Activation Deposit',
                meta: { purpose: 'Wallet Activation Deposit', isOnboarding: true },
                channels: ['card', 'mobile-money'],
                onSuccess: async (response: any) => {
                    const transactionId = response.id || response.transactionId;
                    setPhase('VERIFYING');

                    let attempts = 0;
                    const maxAttempts = 15;
                    const poll = async () => {
                        attempts++;
                        try {
                            const verifyRes = await axios.get(
                                `${API_URL}/lenco/public-verify-status/${ref}?transactionId=${transactionId}&organizationId=${organizationId}`
                            );
                            if (verifyRes.data.verified) {
                                await onboardingService.confirmActivation(ref);
                                setPaidAt(new Date());
                                setPhase('RECEIPT');
                                return;
                            }
                        } catch (err) {
                            console.error('Activation verification attempt failed:', err);
                        }
                        if (attempts < maxAttempts) {
                            setTimeout(poll, 3000);
                        } else {
                            setError('Your payment was submitted but is taking longer than expected to confirm. Please wait a moment and press "Check again".');
                            setPhase('CHECKOUT');
                        }
                    };
                    poll();
                },
                onClose: () => setPaying(false),
            });
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to start the deposit. Please try again.');
        } finally {
            setPaying(false);
        }
    };

    /** Retry verification for an already-submitted payment. */
    const handleCheckAgain = async () => {
        if (!reference) return;
        setPaying(true);
        setError(null);
        try {
            const verifyRes = await axios.get(
                `${API_URL}/lenco/public-verify-status/${reference}?organizationId=${organizationId}`
            );
            if (verifyRes.data.verified) {
                await onboardingService.confirmActivation(reference);
                setPaidAt(new Date());
                setPhase('RECEIPT');
            } else {
                setError('The payment has not been confirmed yet. Give it a moment and try again.');
            }
        } catch {
            setError('Verification check failed. Please try again shortly.');
        } finally {
            setPaying(false);
        }
    };

    // ── Render phases ─────────────────────────────────────────────────────────

    if (phase === 'LOADING') {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            </div>
        );
    }

    if (phase === 'NO_WALLETS') {
        return (
            <div className="text-center py-8">
                <div className="mx-auto w-16 h-16 rounded-3xl bg-yellow-50 flex items-center justify-center mb-5">
                    <Clock className="h-8 w-8 text-yellow-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">We're preparing your wallet</h2>
                <p className="text-sm text-gray-500 max-w-sm mx-auto mb-8">
                    All wallets are currently being provisioned. Our team has been notified and new
                    wallets will be ready shortly. Everything you've set up so far is saved — just
                    come back and pick up where you left off.
                </p>
                <PrimaryButton onClick={handleActivate} loading={claiming}>Try again</PrimaryButton>
            </div>
        );
    }

    if (phase === 'VERIFYING') {
        return (
            <div className="text-center py-16" role="status">
                <Loader2 className="h-10 w-10 text-blue-600 animate-spin mx-auto mb-5" />
                <h2 className="text-lg font-bold text-gray-800 mb-1.5">Confirming your deposit…</h2>
                <p className="text-sm text-gray-500">This usually takes a few seconds. Please don't close this page.</p>
            </div>
        );
    }

    if (phase === 'RECEIPT') {
        return (
            <div className="max-w-md mx-auto">
                <div className="text-center mb-6">
                    <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4 mw-anim" style={{ animation: 'mw-scale-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both' }}>
                        <Check className="h-8 w-8 text-green-500" strokeWidth={3} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-800">Wallet activated!</h2>
                    <p className="text-sm text-gray-500 mt-1">Your deposit is in your wallet, ready to use.</p>
                </div>

                <div className="rounded-2xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3 bg-gray-50 border-b border-gray-100">
                        <Receipt className="h-4 w-4 text-gray-400" />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Deposit receipt</span>
                    </div>
                    <dl className="px-5 py-4 space-y-2.5 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Business</dt>
                            <dd className="font-bold text-gray-800">{organizationName}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Item</dt>
                            <dd className="font-bold text-gray-800">Activate Wallet</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Wallet deposit</dt>
                            <dd className="font-bold text-gray-800">{currency === 'ZMW' ? 'K' : currency} {amount.toFixed(2)}</dd>
                        </div>
                        {reference && (
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Reference</dt>
                                <dd className="font-mono text-xs text-gray-500 truncate max-w-[180px]">{reference}</dd>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Date</dt>
                            <dd className="text-gray-500">{(paidAt || new Date()).toLocaleString()}</dd>
                        </div>
                    </dl>
                    <div className="px-5 py-3 bg-green-50 border-t border-green-100">
                        <p className="text-xs text-green-700 font-medium flex items-start gap-1.5">
                            <PiggyBank className="h-4 w-4 flex-shrink-0 mt-px" />
                            This deposit is your money — it stays in your wallet and can be used for transactions.
                        </p>
                    </div>
                </div>

                <PrimaryButton onClick={onProceed} loading={saving} className="w-full mt-8">
                    Proceed
                    <ArrowRight className="h-4 w-4" />
                </PrimaryButton>
            </div>
        );
    }

    if (phase === 'CHECKOUT') {
        return (
            <div className="max-w-md mx-auto">
                <ErrorBanner message={error} />

                {/* One-product payment page, exactly like the customer-facing one */}
                <div className="rounded-3xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                    <div className="p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                {logoUrl ? (
                                    <img src={logoUrl} alt="" className="w-full h-full object-contain" />
                                ) : (
                                    <span className="font-bold text-gray-800">{organizationName.charAt(0).toUpperCase()}</span>
                                )}
                            </div>
                            <div>
                                <p className="font-bold text-gray-800 text-sm leading-tight">{organizationName}</p>
                                <p className="text-[11px] text-gray-400">Secure checkout · Powered by MoneyWise</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50">
                            <div className="w-14 h-14 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                                <Wallet className="h-7 w-7 text-white" />
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-gray-800 text-sm">Activate Wallet</p>
                                <p className="text-xs text-gray-400">One-time activation deposit</p>
                            </div>
                            <p className="font-bold text-gray-800">
                                {currency === 'ZMW' ? 'K' : currency} {amount.toFixed(2)}
                            </p>
                        </div>

                        <dl className="mt-5 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Deposit (stays in your wallet)</dt>
                                <dd className="font-bold text-gray-800">{currency === 'ZMW' ? 'K' : currency} {amount.toFixed(2)}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Processing fee</dt>
                                <dd className="font-bold text-gray-800">{currency === 'ZMW' ? 'K' : currency} {fee.toFixed(2)}</dd>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-gray-100 text-base">
                                <dt className="font-bold text-gray-800">Total</dt>
                                <dd className="font-bold text-gray-800">{currency === 'ZMW' ? 'K' : currency} {total.toFixed(2)}</dd>
                            </div>
                        </dl>

                        <PrimaryButton onClick={handlePay} loading={paying} className="w-full mt-6">
                            <ShieldCheck className="h-4 w-4" />
                            Pay {currency === 'ZMW' ? 'K' : currency} {total.toFixed(2)}
                        </PrimaryButton>

                        {reference && (
                            <button
                                type="button"
                                onClick={handleCheckAgain}
                                disabled={paying}
                                className="w-full mt-3 text-xs font-bold text-gray-400 hover:text-blue-700 transition-colors"
                            >
                                Already paid? Check again
                            </button>
                        )}
                    </div>
                </div>

                <p className="mt-4 text-xs text-gray-400 text-center flex items-center justify-center gap-1.5">
                    <Info className="h-3.5 w-3.5" />
                    The deposit remains yours and can be used for future transactions.
                </p>

                <StepFooter onBack={() => setPhase('INTRO')} disabled />
            </div>
        );
    }

    // INTRO
    return (
        <div className="max-w-md mx-auto">
            <ErrorBanner message={error} />

            {/* Hero: wallet icon + title + description (this step is self-headed) */}
            <div className="flex flex-col items-center text-center gap-1.5 mb-9">
                <WalletCards className="h-12 w-12 text-blue-700 mb-2.5" strokeWidth={2} />
                <h2 className="text-gray-800 text-2xl font-bold leading-8">Activate your wallet</h2>
                <p className="text-gray-600 text-lg font-normal leading-7">
                    All the money you make from your customers will be collected right here.
                </p>
            </div>

            {/* Wallet balance card with the inline Activate CTA */}
            <div className="w-full p-4 bg-white rounded-3xl shadow-[0px_2px_6px_2px_rgba(0,0,0,0.15)] flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <p className="text-gray-600 text-xs font-extrabold uppercase leading-4 tracking-wide">Main Wallet</p>
                    <p className="text-gray-800 text-xl font-bold leading-7">{currency} {amount.toFixed(2)}</p>
                    <p className="text-slate-400 text-xs leading-5">
                        Kindly deposit a <span className="font-bold">{currency === 'ZMW' ? 'K' : currency}{amount.toFixed(2)}</span> into your wallet to activate it
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleActivate}
                    disabled={claiming}
                    className="w-full min-h-12 px-5 py-3 bg-black rounded-full flex items-center justify-center gap-2.5 text-white text-base font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
                >
                    {claiming && <Loader2 className="h-4 w-4 animate-spin" />}
                    Activate
                </button>
            </div>

            {/* Feature bullets — reference design (blue checks), existing copy */}
            <ul className="mt-9 px-6 flex flex-col gap-4">
                {[
                    'A dedicated payment wallet is reserved just for your business',
                    'Your deposit lands in that wallet — spend it any time',
                    'Start receiving customer payments immediately after',
                    'The activation deposit is still your money — it\'s not a fee',
                ].map(line => (
                    <li key={line} className="flex items-start gap-4">
                        <span className="w-5 h-5 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
                        </span>
                        <span className="text-gray-800 text-base font-normal leading-5">{line}</span>
                    </li>
                ))}
            </ul>

            <StepFooter onBack={onBack} hideContinue />
        </div>
    );
};
