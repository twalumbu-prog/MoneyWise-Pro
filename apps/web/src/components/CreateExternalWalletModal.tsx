import React, { useState, useEffect } from 'react';
import { X, Wallet, Loader2, AlertCircle } from 'lucide-react';
import { cashbookService } from '../services/cashbook.service';
import { integrationService } from '../services/integration.service';
import { PROVIDER_BANKS, PROVIDER_MOMO } from 'core';

interface CreateExternalWalletModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}


const CreateExternalWalletModal: React.FC<CreateExternalWalletModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [providerType, setProviderType] = useState<'BANK' | 'MOBILE_MONEY' | 'CUSTOM'>('BANK');
    const [selectedProvider, setSelectedProvider] = useState('ZANACO');
    const [customName, setCustomName] = useState('');
    const [qbAccounts, setQbAccounts] = useState<any[]>([]);
    const [selectedQbAccountId, setSelectedQbAccountId] = useState('');
    const [loadingQb, setLoadingQb] = useState(false);
    const [qbConnected, setQbConnected] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setProviderType('BANK');
            setSelectedProvider('ZANACO');
            setCustomName('');
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
        setError(null);

        let finalName = '';
        let providerName = '';

        if (providerType === 'BANK') {
            if (selectedProvider === 'OTHER') {
                if (!customName.trim()) {
                    setError('Please enter a custom bank name.');
                    return;
                }
                finalName = customName.trim();
                providerName = 'Other Bank';
            } else {
                const p = PROVIDER_BANKS.find(b => b.code === selectedProvider);
                finalName = p?.name || 'Bank';
                providerName = p?.name || 'Bank';
            }
        } else if (providerType === 'MOBILE_MONEY') {
            if (selectedProvider === 'OTHER') {
                if (!customName.trim()) {
                    setError('Please enter a custom mobile money name.');
                    return;
                }
                finalName = customName.trim();
                providerName = 'Other Mobile Money';
            } else {
                const p = PROVIDER_MOMO.find(m => m.code === selectedProvider);
                finalName = p?.name || 'Mobile Money';
                providerName = p?.name || 'Mobile Money';
            }
        } else {
            if (!customName.trim()) {
                setError('Please enter a custom wallet name.');
                return;
            }
            finalName = customName.trim();
            providerName = 'Custom';
        }

        try {
            setIsSubmitting(true);
            await cashbookService.createExternalWallet({
                name: finalName,
                providerType,
                providerName: providerName || undefined,
                qbAccountId: selectedQbAccountId || undefined
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to create manual wallet. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
                <div className="bg-slate-900 px-6 py-5 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-white/10 rounded-xl">
                            <Wallet className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold leading-tight">Add Manual Wallet</h2>
                            <p className="text-slate-400 text-[10px]">Create an external wallet to track bank and cash flow</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(80vh-100px)]">
                    {error && (
                        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-xl flex items-start space-x-2.5">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Wallet Type</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['BANK', 'MOBILE_MONEY', 'CUSTOM'] as const).map((type) => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => {
                                        setProviderType(type);
                                        setSelectedProvider(type === 'BANK' ? 'ZANACO' : type === 'MOBILE_MONEY' ? 'MTN' : '');
                                        setCustomName('');
                                    }}
                                    className={`py-3 px-2 text-center text-xs font-bold rounded-xl border transition-all ${
                                        providerType === type
                                            ? 'border-[#006AFF] bg-[#006AFF]/5 text-[#006AFF]'
                                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {type === 'BANK' ? 'Bank' : type === 'MOBILE_MONEY' ? 'Mobile Money' : 'Custom'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {providerType === 'BANK' && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Select Bank</label>
                            <select
                                value={selectedProvider}
                                onChange={(e) => setSelectedProvider(e.target.value)}
                                className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 text-xs outline-none focus:border-[#006AFF]/20 focus:bg-white transition-all font-semibold text-gray-800"
                            >
                                {PROVIDER_BANKS.map((b) => (
                                    <option key={b.code} value={b.code}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {providerType === 'MOBILE_MONEY' && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Select Operator</label>
                            <select
                                value={selectedProvider}
                                onChange={(e) => setSelectedProvider(e.target.value)}
                                className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 text-xs outline-none focus:border-[#006AFF]/20 focus:bg-white transition-all font-semibold text-gray-800"
                            >
                                {PROVIDER_MOMO.map((m) => (
                                    <option key={m.code} value={m.code}>{m.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {(providerType === 'CUSTOM' || selectedProvider === 'OTHER') && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                {providerType === 'CUSTOM' ? 'Wallet Name' : 'Custom Provider Name'}
                            </label>
                            <input
                                type="text"
                                value={customName}
                                onChange={(e) => setCustomName(e.target.value)}
                                placeholder={providerType === 'CUSTOM' ? 'e.g. Petty Cash Vault' : 'e.g. My Custom Provider'}
                                className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 text-xs outline-none focus:border-[#006AFF]/20 focus:bg-white transition-all font-semibold text-gray-800 placeholder:text-gray-400"
                            />
                        </div>
                    )}

                    {qbConnected && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">QuickBooks Asset Account (Optional)</label>
                            {loadingQb ? (
                                <div className="h-12 flex items-center space-x-2 text-xs text-gray-500 px-1">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Loading QuickBooks accounts...</span>
                                </div>
                            ) : (
                                <select
                                    value={selectedQbAccountId}
                                    onChange={(e) => setSelectedQbAccountId(e.target.value)}
                                    className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 text-xs outline-none focus:border-[#006AFF]/20 focus:bg-white transition-all font-semibold text-gray-800"
                                >
                                    <option value="">Don't map to QuickBooks</option>
                                    {qbAccounts.map((a) => (
                                        <option key={a.Id} value={a.Id}>
                                            {a.Name} ({a.AccountType})
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}

                    <div className="pt-4 shrink-0 flex space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-4 bg-gray-50 text-gray-600 hover:bg-gray-100 font-bold rounded-2xl transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-4 bg-[#006AFF] hover:bg-[#0052cc] text-white font-bold rounded-2xl transition-all flex items-center justify-center space-x-2 shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Creating...</span>
                                </>
                            ) : (
                                <span>Create Wallet</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateExternalWalletModal;
