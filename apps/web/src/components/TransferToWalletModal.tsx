import React, { useState, useEffect } from 'react';
import { X, ArrowDownUp, Loader2, AlertCircle, Coins, Wallet, CheckCircle } from 'lucide-react';
import { calculatePlatformFee } from 'shared';
import { cashbookService } from '../services/cashbook.service';
import { organizationService } from '../services/organization.service';
import { lencoService } from '../services/lenco.service';

interface TransferToWalletModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    /** MoneyWise wallets the cash can be moved into. */
    wallets: any[];
    /** Current balance of the source external account (prefills the amount). */
    sourceBalance: number;
    /** Which external ledger the funds leave. */
    sourceAccountType?: 'CASH' | 'AIRTEL_MONEY' | 'BANK';
}

const SOURCE_LABELS: Record<string, string> = {
    CASH: 'Cash Account',
    AIRTEL_MONEY: 'Mobile Money',
    BANK: 'Bank Account',
};

type Step = 'FORM' | 'POLLING' | 'SUCCESS' | 'FAILED';

const TransferToWalletModal: React.FC<TransferToWalletModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    wallets,
    sourceBalance,
    sourceAccountType = 'CASH',
}) => {
    const [destinationWalletId, setDestinationWalletId] = useState('');
    const [amount, setAmount] = useState('');
    const [step, setStep] = useState<Step>('FORM');
    const [error, setError] = useState<string | null>(null);
    const [failureReason, setFailureReason] = useState('');

    // Lenco org context
    const [orgId, setOrgId] = useState<string | null>(null);
    const [lencoSubaccountId, setLencoSubaccountId] = useState<string | null>(null);
    const [lencoPublicKey, setLencoPublicKey] = useState<string | null>(null);
    const [loadingOrg, setLoadingOrg] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const main = wallets.find(w => w.is_main) || wallets[0];
        setDestinationWalletId(main?.id || '');
        setAmount(sourceBalance > 0 ? sourceBalance.toFixed(2) : '');
        setStep('FORM');
        setError(null);
        setFailureReason('');

        setLoadingOrg(true);
        organizationService.getOrganization()
            .then(org => {
                setOrgId(org.id || null);
                setLencoSubaccountId(org.lenco_subaccount_id || null);
                setLencoPublicKey(org.lenco_public_key || null);
            })
            .catch(err => console.error('Failed to load organization for transfer:', err))
            .finally(() => setLoadingOrg(false));
    }, [isOpen, wallets, sourceBalance]);

    const sourceLabel = SOURCE_LABELS[sourceAccountType] || 'External Account';
    // The entered amount is the GROSS — the total charged / deducted. Fees are worked
    // backwards so that net + fees === the amount entered (must mirror the backend's
    // computeTransferFees, which uses the same calculatePlatformFee).
    const gross = Number(amount) || 0;
    const platformFee = calculatePlatformFee(gross);
    const lencoFee = Math.round(gross * 0.01 * 100) / 100;
    const depositCharge = Math.round((platformFee + lencoFee) * 100) / 100;
    const netToWallet = gross > 0 ? Math.round((gross - depositCharge) * 100) / 100 : 0;
    const destWallet = wallets.find(w => w.id === destinationWalletId);

    const handleTransfer = async () => {
        if (!gross || gross <= 0) { setError('Please enter a valid amount.'); return; }
        if (gross > sourceBalance) { setError(`Amount exceeds the available ${sourceLabel} balance (K${sourceBalance.toFixed(2)}).`); return; }
        if (netToWallet <= 0) { setError('Amount is too small to cover the fees.'); return; }
        if (!destinationWalletId) { setError('Please select a destination wallet.'); return; }
        if (!lencoSubaccountId) { setError('This organization has no linked Lenco wallet. Configure it in Settings > General.'); return; }

        const LencoPay: any = (window as any).LencoPay;
        if (!LencoPay) { setError('Lenco payment SDK is not loaded. Please reload the page.'); return; }

        const ref = `DEP-${Date.now()}-${lencoSubaccountId.substring(0, 8)}-CASHXFER`;
        const purpose = `Transfer to MoneyWise (from ${sourceLabel})`;
        setError(null);

        // 1. Log the wallet-deposit intent for the NET — that's what actually reaches the
        //    wallet (the deposit finalization credits the wallet with the intent amount).
        try {
            await cashbookService.logWalletDepositIntent(ref, purpose, netToWallet, destinationWalletId);
        } catch (err) {
            console.error('Failed to log deposit intent:', err);
        }

        // 2. Open Lenco checkout charging the full GROSS amount the user entered.
        LencoPay.getPaid({
            key: lencoPublicKey || 'pub-f3a595efda03948ae5dcd2effe073ef0aa2b333457a6c80d',
            amount: gross.toFixed(2),
            currency: 'ZMW',
            reference: ref,
            accountId: lencoSubaccountId,
            email: 'merchant@moneywise.co',
            name: 'MoneyWise Transfer',
            description: purpose,
            narration: purpose,
            meta: { purpose, isCashTransfer: true },
            channels: ['card', 'mobile-money'],
            onSuccess: async (response: any) => {
                const transactionId = response.id || response.transactionId;
                setStep('POLLING');
                setError(null);

                let attempts = 0;
                const maxAttempts = 15;
                const poll = async () => {
                    attempts++;
                    try {
                        const result = await lencoService.verifyStatus(ref, transactionId, orgId || undefined);
                        if (result.verified) {
                            // 3. Only now book the cash-side outflow (idempotent on ref).
                            try {
                                await cashbookService.transferToWallet(gross, ref, sourceAccountType, destWallet?.name);
                            } catch (err) {
                                console.error('Failed to record cash outflow leg:', err);
                            }
                            setStep('SUCCESS');
                            onSuccess();
                            return;
                        }
                    } catch (err) {
                        console.error('Transfer verification attempt failed:', err);
                    }
                    if (attempts < maxAttempts) {
                        setTimeout(poll, 3000);
                    } else {
                        setStep('FAILED');
                        setFailureReason('We confirmed the payment with Lenco, but it hasn\'t appeared in your ledger yet. It will reconcile automatically — check back shortly.');
                    }
                };
                poll();
            },
            onClose: () => { /* keep the modal open so the cashier can retry */ },
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />

            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
                {/* Header */}
                <div className="bg-slate-900 px-6 py-5 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-white/10 rounded-xl">
                            <ArrowDownUp className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold leading-tight">Transfer to MoneyWise</h2>
                            <p className="text-slate-400 text-[10px]">Deposit {sourceLabel.toLowerCase()} funds into a MoneyWise wallet via Lenco</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Verifying */}
                {step === 'POLLING' && (
                    <div className="py-16 flex flex-col items-center justify-center space-y-4 text-center px-8">
                        <div className="h-16 w-16 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                        <h3 className="text-lg font-bold text-gray-900">Verifying deposit…</h3>
                        <p className="text-gray-500 text-sm max-w-xs">Once Lenco confirms the deposit, the cash will be deducted and the wallet credited.</p>
                    </div>
                )}

                {/* Success */}
                {step === 'SUCCESS' && (
                    <div className="py-16 flex flex-col items-center justify-center space-y-5 text-center px-8">
                        <div className="h-20 w-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
                            <CheckCircle className="h-12 w-12" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-emerald-600">Transfer Complete!</h3>
                            <p className="text-gray-500 mt-1 text-sm">K{netToWallet.toLocaleString(undefined, { minimumFractionDigits: 2 })} reached {destWallet?.name || 'your wallet'} (K{gross.toLocaleString(undefined, { minimumFractionDigits: 2 })} charged, less fees).</p>
                        </div>
                        <button onClick={onClose} className="px-10 py-3.5 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-black transition-all">
                            Finish
                        </button>
                    </div>
                )}

                {/* Failed / delayed */}
                {step === 'FAILED' && (
                    <div className="py-14 flex flex-col items-center justify-center space-y-5 text-center px-8">
                        <div className="h-16 w-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
                            <AlertCircle className="h-9 w-9" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-amber-600">Verification delayed</h3>
                            <p className="text-gray-500 mt-2 text-sm max-w-xs leading-relaxed">{failureReason}</p>
                        </div>
                        <button onClick={onClose} className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm">Close</button>
                    </div>
                )}

                {/* Form */}
                {step === 'FORM' && (
                    <div className="flex flex-col">
                        <div className="p-6 space-y-5">
                            {error && (
                                <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-center text-red-700 text-xs">
                                    <AlertCircle className="h-4 w-4 mr-2.5 flex-shrink-0" />
                                    {error}
                                </div>
                            )}

                            {/* From → To summary */}
                            <div className="flex items-center gap-3">
                                <div className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl p-3">
                                    <div className="flex items-center gap-2 text-gray-400 mb-1">
                                        <Coins size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">From</span>
                                    </div>
                                    <p className="text-xs font-bold text-gray-800">{sourceLabel}</p>
                                    <p className="text-[10px] font-semibold text-gray-400 mt-0.5">Bal: K{sourceBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </div>
                                <ArrowDownUp size={16} className="text-gray-300 rotate-90 flex-shrink-0" />
                                <div className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl p-3">
                                    <div className="flex items-center gap-2 text-gray-400 mb-1">
                                        <Wallet size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">To</span>
                                    </div>
                                    <select
                                        value={destinationWalletId}
                                        onChange={(e) => setDestinationWalletId(e.target.value)}
                                        className="w-full bg-transparent outline-none text-xs font-bold text-gray-800 cursor-pointer -ml-0.5"
                                    >
                                        {wallets.map((w) => (
                                            <option key={w.id} value={w.id}>{w.name}{w.is_main ? ' (Main)' : ''}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">Amount to Transfer (K)</label>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:border-slate-900 focus:bg-white outline-none transition-all text-sm font-bold text-gray-800 placeholder:text-gray-400"
                                />
                            </div>

                            {/* Lenco fee breakdown */}
                            <div className="bg-slate-50 rounded-2xl p-4 space-y-1.5 text-xs">
                                <div className="flex justify-between font-semibold text-gray-500"><span>Total charged</span><span>K{gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                <div className="flex justify-between font-medium text-gray-400"><span>Platform fee</span><span>− K{platformFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                <div className="flex justify-between font-medium text-gray-400"><span>Lenco fee (1%)</span><span>− K{lencoFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                <div className="flex justify-between font-black text-emerald-600 pt-1.5 border-t border-gray-200"><span>Credited to wallet</span><span>K{netToWallet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                            </div>
                            <p className="text-[11px] text-gray-400 leading-relaxed px-1">
                                You'll be taken to the secure Lenco checkout to fund the wallet. The {sourceLabel.toLowerCase()} balance is only deducted once the deposit is confirmed.
                            </p>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end space-x-3">
                            <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs text-gray-500 font-bold hover:bg-gray-200/50 rounded-xl transition-all">
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleTransfer}
                                disabled={loadingOrg || !amount || !destinationWalletId}
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center text-xs disabled:opacity-50"
                            >
                                {loadingOrg ? (<><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Loading…</>) : 'Continue to Lenco'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TransferToWalletModal;
