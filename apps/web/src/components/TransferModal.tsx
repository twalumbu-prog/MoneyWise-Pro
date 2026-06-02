import React, { useState, useEffect } from 'react';
import { X, ArrowDownUp, Loader2, AlertCircle } from 'lucide-react';
import { cashbookService } from '../services/cashbook.service';

interface TransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    wallets: any[];
    initialSourceWalletId?: string;
}

const TransferModal: React.FC<TransferModalProps> = ({ 
    isOpen, 
    onClose, 
    onSuccess, 
    wallets,
    initialSourceWalletId 
}) => {
    const [sourceWalletId, setSourceWalletId] = useState('');
    const [destinationWalletId, setDestinationWalletId] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setSourceWalletId(initialSourceWalletId || (wallets.find(w => w.is_main)?.id || wallets[0]?.id || ''));
            setDestinationWalletId('');
            setAmount('');
            setDescription('');
            setError(null);
        }
    }, [isOpen, initialSourceWalletId, wallets]);

    // Filter destination wallets so you cannot transfer to the same wallet
    const filteredDestinationWallets = wallets.filter(w => w.id !== sourceWalletId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!sourceWalletId) {
            setError('Please select a source wallet.');
            return;
        }

        if (!destinationWalletId) {
            setError('Please select a destination wallet.');
            return;
        }

        if (!amount || Number(amount) <= 0) {
            setError('Please enter a valid transfer amount.');
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);

            await cashbookService.transfer(
                sourceWalletId,
                destinationWalletId,
                Number(amount),
                description.trim() || undefined
            );

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to complete subwallet transfer. Please check balances and try again.');
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
                            <ArrowDownUp className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold leading-tight">Transfer Funds</h2>
                            <p className="text-slate-400 text-[10px]">Move money between subwallets inside MoneyWise</p>
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

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">
                                    Source Wallet
                                </label>
                                <select
                                    value={sourceWalletId}
                                    onChange={(e) => {
                                        setSourceWalletId(e.target.value);
                                        if (e.target.value === destinationWalletId) {
                                            setDestinationWalletId('');
                                        }
                                    }}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:border-slate-900 focus:bg-white outline-none transition-all text-xs font-semibold text-gray-800 cursor-pointer"
                                >
                                    <option value="" disabled>Select Source</option>
                                    {wallets.map((w) => (
                                        <option key={w.id} value={w.id}>
                                            {w.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">
                                    Destination Wallet
                                </label>
                                <select
                                    value={destinationWalletId}
                                    onChange={(e) => setDestinationWalletId(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:border-slate-900 focus:bg-white outline-none transition-all text-xs font-semibold text-gray-800 cursor-pointer"
                                >
                                    <option value="" disabled>Select Destination</option>
                                    {filteredDestinationWallets.map((w) => (
                                        <option key={w.id} value={w.id}>
                                            {w.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">
                                Amount to Transfer (K)
                            </label>
                            <input
                                type="number"
                                required
                                min="0.01"
                                step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:border-slate-900 focus:bg-white outline-none transition-all text-xs font-semibold text-gray-800 placeholder:text-gray-400"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">
                                Description / Purpose (Optional)
                            </label>
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="e.g. Funding marketing campaign..."
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:border-slate-900 focus:bg-white outline-none transition-all text-xs font-semibold text-gray-800 placeholder:text-gray-400"
                            />
                        </div>
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
                            disabled={isSubmitting || !sourceWalletId || !destinationWalletId || !amount}
                            className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center text-xs disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                                    Transferring...
                                </>
                            ) : (
                                'Transfer Funds'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TransferModal;
