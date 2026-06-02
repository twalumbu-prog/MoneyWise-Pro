import React, { useState, useEffect } from 'react';
import { X, Wallet, Loader2, AlertCircle } from 'lucide-react';
import { cashbookService } from '../services/cashbook.service';
import { integrationService } from '../services/integration.service';

interface CreateWalletModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const CreateWalletModal: React.FC<CreateWalletModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [name, setName] = useState('');
    const [qbAccounts, setQbAccounts] = useState<any[]>([]);
    const [selectedQbAccountId, setSelectedQbAccountId] = useState('');
    const [loadingQb, setLoadingQb] = useState(false);
    const [qbConnected, setQbConnected] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setName('');
            setSelectedQbAccountId('');
            setError(null);
            checkQbStatusAndLoadAccounts();
        }
    }, [isOpen]);

    const checkQbStatusAndLoadAccounts = async () => {
        try {
            setLoadingQb(true);
            const status = await integrationService.getStatus();
            setQbConnected(status.connected);
            if (status.connected) {
                const accounts = await integrationService.getAccounts();
                // Filter to show bank/asset accounts or all appropriate accounts
                const bankAssetAccounts = accounts.filter(
                    (a: any) => a.AccountType === 'Bank' || a.AccountType === 'Other Current Asset'
                );
                setQbAccounts(bankAssetAccounts.length > 0 ? bankAssetAccounts : accounts);
            }
        } catch (err) {
            console.error('Failed to load QuickBooks status/accounts:', err);
        } finally {
            setLoadingQb(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Please enter a wallet name.');
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);

            const selectedAcc = qbAccounts.find(a => a.Id === selectedQbAccountId);
            await cashbookService.createWallet(
                name.trim(),
                selectedQbAccountId || undefined,
                selectedAcc ? selectedAcc.Name : undefined
            );

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to create subwallet. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
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
            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
                {/* Header */}
                <div className="bg-slate-900 px-6 py-5 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-white/10 rounded-xl">
                            <Wallet className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold leading-tight">Create Subwallet</h2>
                            <p className="text-slate-400 text-[10px]">Add a custom subwallet to track specific funds</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col">
                    <div className="p-6 space-y-5">
                        {error && (
                            <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-center text-red-700 text-xs animate-in shake-1">
                                <AlertCircle className="h-4.5 w-4.5 mr-2.5 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">
                                Wallet Name
                            </label>
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Marketing Wallet, Operations..."
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:border-slate-900 focus:bg-white outline-none transition-all text-xs font-semibold text-gray-800 placeholder:text-gray-400"
                            />
                        </div>

                        {qbConnected ? (
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">
                                    QuickBooks Mapping (Optional)
                                </label>
                                {loadingQb ? (
                                    <div className="flex items-center space-x-2 py-3 px-4 bg-gray-50 border border-gray-100 rounded-2xl">
                                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                        <span className="text-gray-400 text-xs font-medium">Loading QBO accounts...</span>
                                    </div>
                                ) : (
                                    <select
                                        value={selectedQbAccountId}
                                        onChange={(e) => setSelectedQbAccountId(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:border-slate-900 focus:bg-white outline-none transition-all text-xs font-semibold text-gray-800 cursor-pointer"
                                    >
                                        <option value="">No QuickBooks Mapping (Default)</option>
                                        {qbAccounts.map((acc) => (
                                            <option key={acc.Id} value={acc.Id}>
                                                {acc.Name} ({acc.AccountType})
                                            </option>
                                        ))}
                                    </select>
                                )}
                                <p className="text-[9px] text-gray-400 italic px-1">
                                    Map this subwallet to prioritize a specific QuickBooks Bank/Asset account when synchronizing deposits or disbursals.
                                </p>
                            </div>
                        ) : (
                            !loadingQb && (
                                <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 text-[10px] text-gray-400 leading-relaxed">
                                    QuickBooks is not currently connected. If you link QBO later, you can map subwallets directly under integration settings.
                                </div>
                            )
                        )}
                    </div>

                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-xs text-gray-500 font-bold hover:bg-gray-200/50 rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center text-xs disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                                    Creating...
                                </>
                            ) : (
                                'Create Wallet'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateWalletModal;
