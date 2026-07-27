import React, { useState, useEffect } from 'react';
import { organizationService } from '../../../services/organization.service';
import { lencoService } from '../../../services/lenco.service';
import { useAuth } from '../../../context/AuthContext';
import {
    CheckCircle,
    Wallet,
    X,
    Loader2,
    ArrowLeft,
    AlertCircle
} from 'lucide-react';

interface LencoIntegrationProps {
    onBack: () => void;
}

export const LencoIntegration: React.FC<LencoIntegrationProps> = ({ onBack }) => {
    const { userRole } = useAuth();
    const isAdmin = userRole === 'ADMIN';

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        lenco_public_key: '',
        lenco_secret_key: ''
    });

    // Lenco specific state
    const [lencoSubaccountId, setLencoSubaccountId] = useState<string | null>(null);
    const [lencoAccounts, setLencoAccounts] = useState<any[]>([]);
    const [fetchingLenco, setFetchingLenco] = useState(false);
    const [provisioning, setProvisioning] = useState(false);
    const [availableAccounts, setAvailableAccounts] = useState<any[]>([]);
    const [showLinkSelector, setShowLinkSelector] = useState(false);
    const [linking, setLinking] = useState(false);
    const [selectedLencoId, setSelectedLencoId] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await organizationService.getOrganization();
            setFormData({
                lenco_public_key: data.lenco_public_key || '',
                lenco_secret_key: data.lenco_secret_key || ''
            });
            setLencoSubaccountId(data.lenco_subaccount_id || null);

            if (data.lenco_subaccount_id) {
                fetchLencoAccounts();
            }
        } catch (err: any) {
            console.error('Failed to load organization data:', err);
            setError(err.message || 'Failed to load organization settings.');
        } finally {
            setLoading(false);
        }
    };

    const fetchLencoAccounts = async () => {
        try {
            setFetchingLenco(true);
            const accounts = await lencoService.getAccounts();
            setLencoAccounts(accounts);
        } catch (err) {
            console.error('Failed to fetch Lenco accounts:', err);
        } finally {
            setFetchingLenco(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSaveCredentials = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAdmin) {
            setError('Only administrators can update settings.');
            return;
        }

        try {
            setSaving(true);
            setError(null);
            setSuccessMessage(null);

            // We only update the lenco keys here
            await organizationService.updateOrganization({
                lenco_public_key: formData.lenco_public_key,
                lenco_secret_key: formData.lenco_secret_key
            } as any);

            setSuccessMessage('Lenco API credentials successfully updated.');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            console.error('Update failed:', err);
            setError(err.response?.data?.error || err.message || 'Failed to update credentials.');
        } finally {
            setSaving(false);
        }
    };

    const handleProvisionWallet = async () => {
        if (!isAdmin) return;
        try {
            setProvisioning(true);
            setError(null);
            
            const orgData = await organizationService.getOrganization();
            const result = await lencoService.provisionOrganizationSubaccount(orgData.id);
            
            if (result.lenco_subaccount_id) {
                setLencoSubaccountId(result.lenco_subaccount_id);
                setSuccessMessage('Lenco wallet successfully provisioned and locked to your organization.');
                setTimeout(() => setSuccessMessage(null), 5000);
                fetchLencoAccounts();
            }
        } catch (err: any) {
            console.error('Provisioning failed:', err);
            setError(err.message || 'Failed to provision Lenco wallet');
        } finally {
            setProvisioning(false);
        }
    };

    const handleLinkWallet = async () => {
        try {
            setLinking(true);
            setError(null);
            const accounts = await lencoService.getAvailableAccounts();
            setAvailableAccounts(accounts);
            setShowLinkSelector(true);
        } catch (err: any) {
            console.error('Failed to fetch available accounts:', err);
            setError('Failed to fetch available Lenco accounts.');
        } finally {
            setLinking(false);
        }
    };

    const confirmLinkWallet = async () => {
        if (!selectedLencoId || !isAdmin) return;
        try {
            setLinking(true);
            setError(null);
            const orgData = await organizationService.getOrganization();
            await lencoService.linkOrganizationSubaccount(orgData.id, selectedLencoId);
            
            setLencoSubaccountId(selectedLencoId);
            setShowLinkSelector(false);
            setSuccessMessage('Lenco wallet successfully linked and locked to your organization.');
            setTimeout(() => setSuccessMessage(null), 5000);
            fetchLencoAccounts();
        } catch (err: any) {
            console.error('Link failed:', err);
            setError(err.message || 'Failed to link Lenco wallet');
        } finally {
            setLinking(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-brand-green" />
                <span className="ml-3 text-gray-500 font-medium">Loading settings...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center space-x-3 mb-6">
                <button 
                    onClick={onBack}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-gray-500" />
                </button>
                <div>
                    <h3 className="text-lg font-bold text-brand-navy">Lenco Integration</h3>
                    <p className="text-sm text-gray-500">Manage your Lenco banking integration.</p>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center">
                    <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                    {error}
                </div>
            )}

            {successMessage && (
                <div className="bg-green-50 border border-brand-green text-green-700 px-4 py-3 rounded-xl text-sm flex items-center">
                    <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                    {successMessage}
                </div>
            )}

            {!isAdmin && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-sm flex items-start">
                    <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
                    <p>You are viewing this information in read-only mode because you are not an Administrator.</p>
                </div>
            )}

            <div className="bg-brand-pink/5 rounded-2xl p-6 border-2 border-brand-pink/10">
                <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-brand-pink flex items-center">
                        <div className="w-5 h-5 bg-brand-pink text-white rounded flex items-center justify-center text-[10px] mr-2">L</div>
                        Integrated Lenco Wallet
                    </label>
                    {lencoSubaccountId && (
                        <div className="flex items-center px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-black uppercase tracking-wider">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Active & Locked
                        </div>
                    )}
                </div>
                
                <p className="text-xs text-brand-navy/60 mb-6 font-brand-family">
                    For security, each organization's wallet is automatically provisioned and locked. This prevents unauthorized fund transfers between organization wallets.
                </p>

                <form onSubmit={handleSaveCredentials}>
                    <div className="flex flex-col gap-4 mb-6 pt-4 border-t border-brand-pink/10 md:w-1/2">
                        <div>
                            <label className="block text-[10px] font-black text-brand-pink uppercase tracking-widest mb-1.5">
                                Lenco Public Key
                            </label>
                            <input
                                type="text"
                                name="lenco_public_key"
                                value={formData.lenco_public_key}
                                onChange={handleChange}
                                disabled={!isAdmin || saving}
                                className="block w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-pink/20 focus:border-brand-pink outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500"
                                placeholder="e.g. pub-..."
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-brand-pink uppercase tracking-widest mb-1.5">
                                Lenco Secret Key
                            </label>
                            <input
                                type="password"
                                name="lenco_secret_key"
                                value={formData.lenco_secret_key}
                                onChange={handleChange}
                                disabled={!isAdmin || saving}
                                className="block w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-pink/20 focus:border-brand-pink outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500"
                                placeholder="e.g. 64636..."
                            />
                        </div>
                        {isAdmin && (
                            <button
                                type="submit"
                                disabled={saving}
                                className="w-fit bg-brand-pink hover:bg-brand-pink/90 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save Credentials'}
                            </button>
                        )}
                    </div>
                </form>

                {lencoSubaccountId ? (
                    <div className="bg-white/80 rounded-xl p-4 border border-brand-pink/20 flex items-center justify-between">
                        <div className="flex items-center">
                            <div className="p-2 bg-brand-pink/10 rounded-lg mr-4">
                                <Wallet className="h-5 w-5 text-brand-pink" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Linked Subaccount ID</p>
                                <p className="text-sm font-black text-brand-navy mt-0.5">{lencoSubaccountId}</p>
                                {fetchingLenco ? (
                                    <div className="flex items-center mt-1 text-[10px] text-gray-400">
                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                        Fetching account details...
                                    </div>
                                ) : (() => {
                                    const acc = lencoAccounts.find(a => a.id === lencoSubaccountId);
                                    if (acc) {
                                        const name = acc.accountName || acc.name || acc.details?.accountName || 'Unknown Name';
                                        const number = acc.accountNumber || acc.details?.accountNumber || (acc.details?.tillNumber ? `Till: ${acc.details.tillNumber}` : '');
                                        return (
                                            <p className="text-xs font-bold text-brand-pink mt-1">
                                                {name} {number ? `(${number})` : ''}
                                            </p>
                                        );
                                    }
                                    return (
                                        <button 
                                            onClick={fetchLencoAccounts}
                                            className="text-[10px] font-bold text-brand-pink/60 hover:text-brand-pink mt-1 underline"
                                        >
                                            Refresh account details
                                        </button>
                                    );
                                })()}
                            </div>
                        </div>
                        <div className="p-2 bg-gray-50 rounded-lg" title="Wallet is locked to this organization">
                            <X className="h-4 w-4 text-gray-300" />
                        </div>
                    </div>
                ) : (
                    <div className="bg-white/80 rounded-xl p-6 border border-brand-pink/20 text-center">
                        {showLinkSelector ? (
                            <div className="text-left space-y-4 max-w-sm mx-auto">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-2">Select Existing Lenco Account</label>
                                    <select
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-pink/20 focus:border-brand-pink"
                                        value={selectedLencoId}
                                        onChange={(e) => setSelectedLencoId(e.target.value)}
                                        disabled={linking}
                                    >
                                        <option value="">-- Select Account --</option>
                                        {availableAccounts.map(acc => {
                                            const name = acc.accountName || acc.name || acc.details?.accountName || 'Unknown Name';
                                            const number = acc.accountNumber || acc.details?.accountNumber || (acc.details?.tillNumber ? `Till: ${acc.details.tillNumber}` : '');
                                            return (
                                                <option key={acc.id} value={acc.id}>
                                                    {name} {number ? `(${number})` : ''} - {acc.id}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => setShowLinkSelector(false)}
                                        className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                                        disabled={linking}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmLinkWallet}
                                        disabled={!selectedLencoId || linking}
                                        className="px-3 py-1.5 text-xs font-bold text-white bg-brand-pink hover:bg-brand-pink/90 rounded-lg transition-colors disabled:opacity-50 flex items-center"
                                    >
                                        {linking ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                        Link Account
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="mb-4">
                                    <Wallet className="h-8 w-8 text-brand-pink/40 mx-auto" />
                                </div>
                                <p className="text-sm text-gray-500 font-brand-family">No Lenco wallet is currently provisioned for this organization.</p>
                                {isAdmin && (
                                    <div className="mt-4 flex flex-wrap gap-3 justify-center">
                                        <button
                                            onClick={handleProvisionWallet}
                                            disabled={provisioning}
                                            className="bg-brand-pink hover:bg-brand-pink/90 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-sm active:scale-95 disabled:opacity-70 flex items-center"
                                        >
                                            {provisioning ? (
                                                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Provisioning...</>
                                            ) : 'Provision New Wallet'}
                                        </button>
                                        <button
                                            onClick={handleLinkWallet}
                                            disabled={linking}
                                            className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-sm active:scale-95 disabled:opacity-70 flex items-center"
                                        >
                                            {linking ? (
                                                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...</>
                                            ) : 'Link Existing'}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
