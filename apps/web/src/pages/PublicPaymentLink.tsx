import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
    Loader2,
    AlertCircle,
    CheckCircle2,
    ShieldCheck,
    Building2,
    User,
    Smartphone,
    XCircle
} from 'lucide-react';
import { calculatePlatformFee } from 'shared';

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
    const [verificationStep, setVerificationStep] = useState<'POLLING' | 'FAILED'>('POLLING');
    const [verificationReason, setVerificationReason] = useState('');
    const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
    const [currentReference, setCurrentReference] = useState('');

    useEffect(() => {
        const fetchContext = async () => {
            if (!token) {
                setError('Invalid payment link.');
                setStep('ERROR');
                return;
            }
            try {
                const res = await axios.get<LinkContext>(`${API_URL}/lenco/public-payment-link/${token}`);
                setCtx(res.data);

                if (res.data.status !== 'ACTIVE') {
                    setStep('INACTIVE');
                    return;
                }
                if (!res.data.wallet.lenco_subaccount_id) {
                    setError('This organization hasn\'t completed their payment provider integration. Checkout is currently unavailable.');
                    setStep('ERROR');
                    return;
                }
                setStep('READY');
            } catch (err: any) {
                if (err.response?.status === 404) {
                    setError('This payment link could not be found.');
                } else {
                    setError(err.response?.data?.error || 'Failed to load payment link. Please check the link and try again.');
                }
                setStep('ERROR');
            }
        };
        fetchContext();
    }, [token]);

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
                        <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">Unable to Load Link</h3>
                        <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed font-semibold mt-3">
                            {error}
                        </p>
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
