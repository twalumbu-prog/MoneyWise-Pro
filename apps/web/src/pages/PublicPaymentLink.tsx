import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { trackEvent, trackVerificationTimeout } from '../lib/analytics';
import {
    Loader2,
    AlertCircle,
    RefreshCw,
    CheckCircle2,
    ShieldCheck,
    Building2,
    User,
    Smartphone,
    XCircle
} from 'lucide-react';
import { calculatePlatformFee } from 'shared';
import { CheckoutErrorInfo, diagnoseCheckoutError } from '../utils/checkoutError';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

interface LinkProduct {
    id: string;
    name: string;
    description?: string;
    image_url?: string | null;
    product_type?: string;
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
    customer_name: string;
    customer_phone: string;
    amount: number;
}

export const PublicPaymentLink: React.FC = () => {
    const { token } = useParams<{ token: string }>();

    const [step, setStep] = useState<'LOADING' | 'READY' | 'INACTIVE' | 'VERIFYING' | 'SUCCESS' | 'ERROR'>('LOADING');
    const [ctx, setCtx] = useState<LinkContext | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Structured, actionable diagnosis for the full-screen ERROR step (load failures).
    const [errorInfo, setErrorInfo] = useState<CheckoutErrorInfo | null>(null);
    const [verificationStep, setVerificationStep] = useState<'POLLING' | 'FAILED'>('POLLING');
    const [verificationReason, setVerificationReason] = useState('');
    const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
    const [currentReference, setCurrentReference] = useState('');

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
        try {
            const res = await axios.get<LinkContext>(`${API_URL}/lenco/public-payment-link/${token}`, { timeout: 15000 });
            setCtx(res.data);

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
            setStep('READY');
        } catch (err: any) {
            console.error('Error fetching payment-link context:', err);
            setErrorInfo(diagnoseCheckoutError(err));
            setStep('ERROR');
        }
    }, [token]);

    useEffect(() => {
        loadContext();
    }, [loadContext]);

    const subtotal = ctx?.amount || 0;
    const processingFee = subtotal > 0 ? calculatePlatformFee(subtotal) : 0;
    const totalPayable = subtotal > 0 ? subtotal + processingFee : 0;

    const handlePay = async () => {
        if (!ctx || !token) return;

        const LencoPay: any = (window as any).LencoPay;
        if (!LencoPay) {
            setError('Payment gateway SDK failed to load. Please reload the page or check your connection.');
            return;
        }

        const purpose = `Sale: ${ctx.product.name} | Cust: ${ctx.customer_phone}`;
        const ref = `DEP-${Date.now()}-${ctx.wallet.lenco_subaccount_id!.substring(0, 8)}-PL`;
        setCurrentReference(ref);
        setError(null);

        const checkoutStartedAt = Date.now();
        trackEvent('payment_link_checkout', 'payment', 'started', {
            workflow_id: ref,
            organization_id: ctx.organization.id,
            product_name: ctx.product.name,
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
                items: [{ id: ctx.product.id, quantity: 1, price: subtotal }]
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
                                    product_name: ctx.product.name,
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50/30 flex flex-col justify-between py-10 px-4">
            <div className="max-w-md w-full mx-auto my-auto bg-white/70 backdrop-blur-xl rounded-[32px] border border-slate-100 shadow-2xl overflow-hidden flex flex-col justify-between transition-all duration-300">

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
                        <div className="flex flex-col items-center text-center mb-6">
                            {renderLogo()}
                            <h2 className="text-lg font-black text-slate-900 mt-4 uppercase tracking-wider">{ctx.organization.name}</h2>
                            <p className="text-xs font-semibold text-slate-400 mt-1">Secure Payment Request</p>
                        </div>

                        {ctx.product.image_url && (
                            <img
                                src={ctx.product.image_url}
                                alt={ctx.product.name}
                                className="w-full h-40 object-cover rounded-2xl border border-slate-100 mb-5"
                            />
                        )}

                        <div className="bg-slate-50/70 border border-slate-100/50 rounded-2xl p-5 text-left text-xs space-y-3 mb-5">
                            <div>
                                <h4 className="text-sm font-black text-slate-900">{ctx.product.name}</h4>
                                {ctx.product.description && (
                                    <p className="text-[11px] font-medium text-slate-400 mt-1">{ctx.product.description}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-slate-500 font-semibold pt-2 border-t border-slate-100">
                                <User size={13} /> <span className="text-slate-700 font-bold">{ctx.customer_name}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-500 font-semibold">
                                <Smartphone size={13} /> <span className="text-slate-700 font-bold">{ctx.customer_phone}</span>
                            </div>
                        </div>

                        <div className="space-y-1.5 text-xs mb-5">
                            <div className="flex justify-between font-semibold text-slate-500">
                                <span>Subtotal</span>
                                <span>K{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
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
                            onClick={handlePay}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-lg shadow-blue-100 flex items-center justify-center space-x-2"
                        >
                            <ShieldCheck size={14} />
                            <span>Pay with Lenco</span>
                        </button>
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

                {step === 'VERIFYING' && (
                    <div className="p-10 flex flex-col items-center justify-center min-h-[450px]">
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
                            </>
                        )}
                    </div>
                )}

                {step === 'SUCCESS' && ctx && (
                    <div className="p-8 text-center min-h-[450px] flex flex-col justify-center">
                        <div className="mx-auto w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-5 animate-in zoom-in-75 duration-300">
                            <CheckCircle2 size={32} strokeWidth={2.5} />
                        </div>
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider">Payment Confirmed!</h3>
                        <p className="text-xs text-slate-400 font-semibold mt-1">
                            Receipt Number: {receiptNumber ? `#${receiptNumber}` : currentReference.replace('-PL', '')}
                        </p>
                        <div className="bg-slate-50/70 border border-slate-100/50 rounded-2xl p-5 text-left text-xs space-y-2.5 max-w-xs mx-auto mt-6">
                            <div className="flex justify-between font-semibold text-slate-400">
                                <span>Item:</span>
                                <span className="font-bold text-slate-700 text-right">{ctx.product.name}</span>
                            </div>
                            <div className="flex justify-between font-semibold text-slate-400">
                                <span>Client:</span>
                                <span className="font-bold text-slate-700">{ctx.customer_name}</span>
                            </div>
                            <div className="flex justify-between font-semibold text-slate-400 pt-2 border-t border-slate-100">
                                <span>Total Paid:</span>
                                <span className="font-black text-emerald-600">K{totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
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

            <div className="mt-8 text-center space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center space-x-1.5">
                    <Building2 size={12} />
                    <span>Secured by MoneyWise Ledger Gateway</span>
                </p>
                <p className="text-[9px] font-medium text-slate-400">
                    Terms & Privacy Apply. Payments are processed securely via Lenco.
                </p>
            </div>
        </div>
    );
};
