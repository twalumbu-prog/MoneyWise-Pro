import React, { useState, useEffect } from 'react';
import { X, User, Phone, FileText, Wallet, CheckCircle, AlertCircle, Calendar, Loader2 } from 'lucide-react';
import { cashbookService } from '../services/cashbook.service';
import { organizationService } from '../services/organization.service';
import { lencoService } from '../services/lenco.service';
import { DenominationInput } from './DenominationInput';

interface CashInflowModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialInflowType?: 'CASH' | 'WALLET';
    isReadOnlyType?: boolean;
}

const CashInflowModal: React.FC<CashInflowModalProps> = ({ 
    isOpen, 
    onClose, 
    onSuccess,
    initialInflowType = 'CASH',
    isReadOnlyType = false
}) => {
    const [personName, setPersonName] = useState('');
    const [purpose, setPurpose] = useState('');
    const [contactDetails, setContactDetails] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [denominations, setDenominations] = useState<any[]>([
        { value: 500, count: 0 }, { value: 200, count: 0 }, { value: 100, count: 0 }, { value: 50, count: 0 }, { value: 20, count: 0 }, { value: 10, count: 0 }, { value: 5, count: 0 }, { value: 2, count: 0 }, { value: 1, count: 0 }, { value: 0.50, count: 0 }
    ]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inflowType, setInflowType] = useState<'CASH' | 'WALLET'>(initialInflowType);
    const [walletAmount, setWalletAmount] = useState<string>('');
    const [lencoSubaccountId, setLencoSubaccountId] = useState<string | null>(null);
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [loadingOrg, setLoadingOrg] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationStep, setVerificationStep] = useState<'IDLE' | 'STARTED' | 'POLLING' | 'SUCCESS' | 'FAILED'>('IDLE');
    const [verificationReason, setVerificationReason] = useState<string | null>(null);
    const [reconSummary, setReconSummary] = useState<any>(null);
    const [currentReference, setCurrentReference] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadOrganization();
            setInflowType(initialInflowType);
        }
    }, [isOpen, initialInflowType]);

    const loadOrganization = async () => {
        try {
            setLoadingOrg(true);
            const org = await organizationService.getOrganization();
            setLencoSubaccountId(org.lenco_subaccount_id || null);
            setOrganizationId(org.id || null);
        } catch (err) {
            console.error('Failed to load organization for wallet deposit:', err);
        } finally {
            setLoadingOrg(false);
        }
    };

    const totalAmount = denominations.reduce(
        (sum, d) => sum + d.value * d.count,
        0
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (inflowType === 'WALLET') {
            handleWalletDeposit();
            return;
        }

        if (totalAmount <= 0) {
            setError('Please enter denominations to specify the amount.');
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);
            await cashbookService.logInflow({
                personName,
                purpose,
                contactDetails,
                date,
                amount: totalAmount,
                denominations
            });
            onSuccess();
            onClose();
            // Reset form
            setPersonName('');
            setPurpose('');
            setContactDetails('');
            setDate(new Date().toISOString().split('T')[0]);
            setDenominations([
                { value: 500, count: 0 }, { value: 200, count: 0 }, { value: 100, count: 0 }, { value: 50, count: 0 }, { value: 20, count: 0 }, { value: 10, count: 0 }, { value: 5, count: 0 }, { value: 2, count: 0 }, { value: 1, count: 0 }, { value: 0.50, count: 0 }
            ]);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to log cash inflow');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleWalletDeposit = () => {
        if (!walletAmount || Number(walletAmount) <= 0) {
            setError('Please enter a valid deposit amount.');
            return;
        }

        if (!lencoSubaccountId) {
            setError('This organization does not have a linked Lenco Wallet. Please configure it in Settings > General.');
            return;
        }

        const LencoPay: any = (window as any).LencoPay;
        if (!LencoPay) {
            setError('Lenco Payment SDK is not currently loaded. Please ensure you have the correct SDK URL configured in index.html or contact support.');
            return;
        }

        const ref = `DEP-${Date.now()}-${lencoSubaccountId}-${organizationId}`;
        setCurrentReference(ref);

        console.log('Initiating Lenco deposit', {
            amount: Number(walletAmount).toFixed(2),
            reference: ref,
            accountId: lencoSubaccountId,
            email: 'customer@example.com'
        });
 
        LencoPay.getPaid({
            key: 'pub-f3a595efda03948ae5dcd2effe073ef0aa2b333457a6c80d',
            amount: Number(walletAmount).toFixed(2), 
            currency: 'ZMW',
            reference: ref,
            accountId: lencoSubaccountId,
            email: 'customer@example.com',
            name: personName || 'MoneyWise User',
            channels: ['card', 'mobile-money'],
            onSuccess: async (response: any) => {
                console.log('Payment window success reported', response);
                const transactionId = response.id || response.transactionId;
                setIsVerifying(true);
                setVerificationStep('POLLING');
                setError(null);
                
                // Poll for up to 15 times with 3-second intervals
                let attempts = 0;
                const maxAttempts = 15;
                
                const pollStatus = async () => {
                    attempts++;
                    try {
                        const result = await lencoService.verifyStatus(ref, transactionId, organizationId || undefined);
                        console.log(`[Lenco Verify] Frontend poll result (Attempt ${attempts}):`, result);

                        if (result.verified) {
                            setVerificationStep('SUCCESS');
                            console.log('Confirmed: Transaction has been logged in the cash ledger of the MoneyWise Wallet.');
                            
                            // Fetch reconciliation summary for added layer of confirmation
                            try {
                                if (organizationId) {
                                    const summary = await lencoService.getReconciliationSummary(organizationId);
                                    setReconSummary(summary);
                                }
                            } catch (err) {
                                console.warn('Failed to fetch recon summary:', err);
                            }

                            // We don't close immediately, we let the user see the success
                            return true;
                        } else {
                            // Still pending
                            setVerificationStep('POLLING');
                        }
                    } catch (err: any) {
                        console.error('Verification attempt failed:', err);
                        // We don't fail immediately, we keep polling unless it's a 4xx error that's terminal
                    }
                    
                    if (attempts < maxAttempts) {
                        setTimeout(pollStatus, 3000);
                    } else {
                        setVerificationStep('FAILED');
                        setVerificationReason('We confirmed the payment with Lenco, but it hasn\'t appeared in your ledger yet. This could be due to a delay in the banking network.');
                        setIsVerifying(false);
                    }
                    return false;
                };
                
                pollStatus();
            },
            onClose: () => {
                console.log('Payment window closed');
                // The modal stays open!
            }
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 flex flex-col max-h-[90vh]">
                {/* Header - Fixed */}
                <div className="bg-emerald-600 px-8 py-6 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-white/20 rounded-xl">
                            <Wallet className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold leading-tight">Log Cash Inflow</h2>
                            <p className="text-emerald-100 text-xs">Record funds coming into the ledger</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {!isReadOnlyType && (
                    <div className="flex bg-gray-50 p-2 m-4 rounded-2xl shrink-0">
                        <button
                            type="button"
                            onClick={() => setInflowType('CASH')}
                            className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${inflowType === 'CASH' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Cash Inflow
                        </button>
                        <button
                            type="button"
                            onClick={() => setInflowType('WALLET')}
                            className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${inflowType === 'WALLET' ? 'bg-white text-brand-pink shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Deposit to Wallet
                        </button>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
                    {/* Scrollable Content */}
                    <div className="p-8 overflow-y-auto custom-scrollbar">
                        {loadingOrg ? (
                            <div className="py-20 flex flex-col items-center justify-center space-y-4">
                                <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
                                <p className="text-gray-500 font-bold">Synchronizing with Lenco Wallet...</p>
                            </div>
                        ) : isVerifying ? (
                            <div className="py-20 flex flex-col items-center justify-center space-y-6 text-center">
                                {verificationStep === 'POLLING' ? (
                                    <>
                                        <div className="relative">
                                            <div className="h-20 w-20 border-4 border-brand-pink/20 border-t-brand-pink rounded-full animate-spin" />
                                            <Wallet className="h-8 w-8 text-brand-pink absolute inset-0 m-auto animate-pulse" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-gray-900">Verifying Transaction...</h3>
                                            <p className="text-gray-500 mt-2 max-w-xs mx-auto">We're confirming your deposit with Lenco. This usually takes just a few seconds.</p>
                                        </div>
                                    </>
                                ) : verificationStep === 'SUCCESS' ? (
                                    <>
                                        <div className="h-24 w-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
                                            <CheckCircle className="h-14 w-14" />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-emerald-600">Deposit Confirmed!</h3>
                                            <p className="text-gray-500 mt-2">Your wallet balance has been updated successfully.</p>
                                            
                                            {reconSummary && (
                                                <div className="mt-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex flex-col items-center">
                                                    <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Account Reconciled</span>
                                                    <div className="flex items-center space-x-3 mt-1">
                                                        <div className="text-center">
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Lenco Balance</p>
                                                            <p className="font-black text-emerald-700">K {reconSummary.externalBalance.toLocaleString()}</p>
                                                        </div>
                                                        <div className="h-8 w-[1px] bg-emerald-200" />
                                                        <div className="text-center">
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase">MoneyWise Ledger</p>
                                                            <p className="font-black text-emerald-700">K {reconSummary.internalBalance.toLocaleString()}</p>
                                                        </div>
                                                    </div>
                                                    {reconSummary.isReconciled && (
                                                        <div className="mt-2 flex items-center text-[10px] font-black text-emerald-600 bg-white px-3 py-1 rounded-full shadow-sm">
                                                            <CheckCircle className="h-3 w-3 mr-1" />
                                                            BALANCES MATCH
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onSuccess();
                                                onClose();
                                            }}
                                            className="px-10 py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all hover:scale-105 active:scale-95 mt-4"
                                        >
                                            Finish
                                        </button>
                                    </>
                                ) : verificationStep === 'FAILED' ? (
                                    <>
                                        <div className="h-24 w-24 bg-red-100 text-red-600 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
                                            <X className="h-14 w-14" />
                                        </div>
                                        <div className="px-10">
                                            <h3 className="text-2xl font-black text-red-600">Verification Delayed</h3>
                                            <p className="text-gray-500 mt-2 text-sm leading-relaxed">
                                                {verificationReason || "We're having trouble confirming the transaction automatically."}
                                            </p>
                                            <div className="mt-4 p-4 bg-gray-50 rounded-2xl text-[10px] font-mono text-gray-400 text-left">
                                                Ref: {currentReference}
                                            </div>
                                        </div>
                                        <div className="flex space-x-3 mt-4">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setVerificationStep('IDLE');
                                                    setIsVerifying(false);
                                                }}
                                                className="px-8 py-4 bg-white border-2 border-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-50 transition-all"
                                            >
                                                Try Again
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onSuccess();
                                                    onClose();
                                                }}
                                                className="px-8 py-4 bg-gray-900 text-white rounded-2xl font-black hover:bg-black transition-all"
                                            >
                                                Close & Check Later
                                            </button>
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        ) : (
                            <>
                                {error && (
                                    <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center text-red-700 text-sm animate-in shake-1">
                                        <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <div className="space-y-6 mb-2">
                                    {/* Source Details & Purpose */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
                                                Source Details
                                            </label>
                                            <div className="space-y-3">
                                                <div className="relative group">
                                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-emerald-500 transition-colors">
                                                        <User size={18} />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={personName}
                                                        onChange={(e) => setPersonName(e.target.value)}
                                                        placeholder="Depositor Name"
                                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-emerald-500 focus:bg-white outline-none transition-all placeholder:text-gray-400"
                                                    />
                                                </div>
                                                <div className="relative group">
                                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-emerald-500 transition-colors">
                                                        <Calendar size={18} />
                                                    </div>
                                                    <input
                                                        type="date"
                                                        required
                                                        value={date}
                                                        onChange={(e) => setDate(e.target.value)}
                                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-emerald-500 focus:bg-white outline-none transition-all"
                                                    />
                                                </div>
                                                <div className="relative group">
                                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-emerald-500 transition-colors">
                                                        <Phone size={18} />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={contactDetails}
                                                        onChange={(e) => setContactDetails(e.target.value)}
                                                        placeholder="Contact Details (Optional)"
                                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-emerald-500 focus:bg-white outline-none transition-all placeholder:text-gray-400"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
                                                Purpose
                                            </label>
                                            <div className="relative group overflow-hidden">
                                                <div className="absolute top-4 left-0 pl-4 flex items-start pointer-events-none text-gray-400 group-focus-within:text-emerald-500 transition-colors">
                                                    <FileText size={18} />
                                                </div>
                                                <textarea
                                                    required
                                                    value={purpose}
                                                    onChange={(e) => setPurpose(e.target.value)}
                                                    placeholder="Reason for inflow..."
                                                    rows={3}
                                                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-emerald-500 focus:bg-white outline-none transition-all placeholder:text-gray-400 resize-none h-[142px]"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {inflowType === 'CASH' ? (
                                        <div className="bg-gray-50/50 rounded-3xl p-6 border-2 border-gray-100">
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                                                Cash Denominations
                                            </label>
                                            <DenominationInput
                                                denominations={denominations}
                                                onChange={setDenominations}
                                            />
                                        </div>
                                    ) : (
                                        <div className="bg-brand-pink/5 rounded-3xl p-8 border-2 border-brand-pink/10">
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                                                Amount to Deposit (K)
                                            </label>
                                            <div className="relative group">
                                                <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none text-brand-pink font-black text-xl">
                                                    K
                                                </div>
                                                <input
                                                    type="number"
                                                    value={walletAmount}
                                                    onChange={(e) => setWalletAmount(e.target.value)}
                                                    placeholder="0.00"
                                                    className="w-full pl-12 pr-6 py-5 bg-white border-2 border-pink-100 rounded-2xl focus:border-brand-pink focus:ring-4 focus:ring-brand-pink/10 outline-none transition-all text-2xl font-black text-brand-navy placeholder:text-gray-300"
                                                />
                                            </div>
                                            <p className="mt-4 text-sm text-gray-500 bg-white/50 p-4 rounded-xl italic">
                                                You will be redirected to the secure Lenco payment gateway to complete your transaction via Card, Mobile Money, or Bank Transfer.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer Actions - Fixed (Hidden on Success) */}
                    {verificationStep !== 'SUCCESS' && (
                        <div className="px-8 py-6 border-t border-gray-100 flex items-center justify-between shrink-0 bg-white">
                            <div className="flex flex-col">
                                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Total {inflowType === 'CASH' ? 'Inflow' : 'Deposit'} Amount</span>
                                <span className={`text-2xl font-black ${inflowType === 'CASH' ? 'text-emerald-600' : 'text-brand-pink'}`}>
                                    K {(inflowType === 'CASH' ? totalAmount : Number(walletAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="flex space-x-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-2xl transition-colors"
                                >
                                    Cancel
                                </button>
                                {inflowType === 'CASH' ? (
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || totalAmount <= 0 || loadingOrg}
                                        className="flex items-center px-8 py-3 bg-emerald-600 text-white rounded-2xl font-black shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
                                    >
                                        {isSubmitting ? (
                                            <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                                        ) : (
                                            <CheckCircle className="h-5 w-5 mr-2" />
                                        )}
                                        Submit Inflow
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleWalletDeposit}
                                        disabled={Number(walletAmount) <= 0 || loadingOrg}
                                        className="flex items-center px-8 py-3 bg-brand-pink text-white rounded-2xl font-black shadow-lg shadow-pink-200 hover:bg-pink-600 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
                                    >
                                        <CheckCircle className="h-5 w-5 mr-2" />
                                        Pay with Lenco
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default CashInflowModal;
