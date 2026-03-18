import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout';
import { Banknote, Check, File, Building, Upload, X, History, Clock, User, Edit2, CreditCard, Loader2, Wallet, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { requisitionService, Requisition } from '../services/requisition.service';
import { DisbursementDetailOverlay } from '../components/DisbursementDetailOverlay';
import { lencoService } from '../services/lenco.service';
import { organizationService } from '../services/organization.service';
import { cashbookService } from '../services/cashbook.service';

const LENCO_FEE = 8.5;

// Helper to calculate total value of denominations
const calculateTotal = (denominations: Record<string, number>) => {
    return Object.entries(denominations).reduce((total, [value, count]) => {
        return total + Number(value) * count;
    }, 0);
};

export const CashierDashboard: React.FC = () => {
    const { session } = useAuth();
    const [requisitions, setRequisitions] = useState<Requisition[]>([]);
    const [selectedReq, setSelectedReq] = useState<Requisition | null>(null);
    const [denominations, setDenominations] = useState<Record<string, number>>({
        '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0, '0.50': 0
    });

    // New state for disbursement method
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'AIRTEL_MONEY' | 'BANK' | 'MONEYWISE_WALLET'>('CASH');
    const [transferAmount, setTransferAmount] = useState<string>('');
    const [recipientAccount, setRecipientAccount] = useState<string>('');
    const [recipientBankCode, setRecipientBankCode] = useState<string>('');
    const [recipientAccountName, setRecipientAccountName] = useState<string>('');
    const [transferProofFile, setTransferProofFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isDataLoading, setIsDataLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    
    // New state for tabs and history
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
    const [history, setHistory] = useState<any[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [editingDisb, setEditingDisb] = useState<any | null>(null);

    // Wallet status state
    const [walletBalance, setWalletBalance] = useState<number | null>(null);
    const [fetchingBalance, setFetchingBalance] = useState(false);
    const [lencoSubaccountId, setLencoSubaccountId] = useState<string | null>(null);

    useEffect(() => {
        loadRequisitions();
        fetchWalletStatus();
    }, []);

    const fetchWalletStatus = async () => {
        try {
            setFetchingBalance(true);
            const org = await organizationService.getOrganization();
            if (org.lenco_subaccount_id) {
                setLencoSubaccountId(org.lenco_subaccount_id);
                
                // Fetch balance from internal ledger (as requested: "actual amount on the cash ledger")
                const ledgerBalance = await cashbookService.getBalance('MONEYWISE_WALLET');
                setWalletBalance(ledgerBalance);
                
                // Optional: Verify with Lenco API but handle safely
                try {
                    const accounts = await lencoService.getAccounts();
                    if (Array.isArray(accounts)) {
                        const wallet = accounts.find((a: any) => a.id === org.lenco_subaccount_id);
                        if (wallet && wallet.balance && typeof wallet.balance.amount !== 'undefined') {
                            console.log(`[Lenco] Live API Balance: K${wallet.balance.amount}`);
                            // We stick to ledgerBalance for the UI as per user request, 
                            // but we've verified the API connection.
                        }
                    }
                } catch (apiErr) {
                    console.warn('[Lenco] Could not fetch live balance from API, using ledger only.');
                }
            }
        } catch (err) {
            console.error('Failed to fetch wallet status:', err);
        } finally {
            setFetchingBalance(false);
        }
    };

    const loadRequisitions = async () => {
        try {
            setIsDataLoading(true);
            // In a real app, we'd have a specific endpoint for ready-to-disburse items
            // For MVP, reusing admin getAll and filtering client-side
            const all = await requisitionService.getAllAdmin();
            const approved = all.filter((r: any) => r.status === 'AUTHORISED');
            setRequisitions(approved);
        } catch (err) {
            console.error('Failed to load requisitions', err);
            setError('Failed to load requisitions');
        } finally {
            setIsDataLoading(false);
        }
    };

    const loadHistory = async () => {
        try {
            setIsHistoryLoading(true);
            const data = await requisitionService.getDisbursementHistory();
            setHistory(data);
        } catch (err) {
            console.error('Failed to load history', err);
        } finally {
            setIsHistoryLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'history') {
            loadHistory();
        }
    }, [activeTab]);

    const handleDenominationChange = (value: string, count: number) => {
        setDenominations(prev => ({
            ...prev,
            [value]: Math.max(0, count)
        }));
    };

    const handleDisburse = async () => {
        if (!selectedReq || processing) return;

        try {
            setProcessing(true);
            setError(null);
            
            const estimatedTotal = Number(selectedReq.estimated_total);
            const isNonCash = paymentMethod !== 'CASH';

            let totalPrepared = 0;

            if (isNonCash) {
                totalPrepared = Number(transferAmount);
                if (!totalPrepared || totalPrepared <= 0) {
                    alert('Please enter a valid transfer amount.');
                    setProcessing(false);
                    return;
                }
                if (paymentMethod !== 'MONEYWISE_WALLET' && !transferProofFile) {
                    alert('Please upload a proof of transfer document.');
                    setProcessing(false);
                    return;
                }
            } else {
                totalPrepared = calculateTotal(denominations);
            }

            if (totalPrepared < estimatedTotal) {
                alert(`Total prepared/transferred (K${totalPrepared.toFixed(2)}) cannot be less than the requisition amount (K${estimatedTotal.toFixed(2)})`);
                setProcessing(false);
                return;
            }

            if (totalPrepared > estimatedTotal) {
                const confirmed = window.confirm(
                    `You are about to disburse K${totalPrepared.toFixed(2)}, which is MORE than the requested amount of K${estimatedTotal.toFixed(2)}. \n\nThis is usually because exact denominations are unavailable. The extra amount will be recorded and expected to be returned alongside actual change. \n\nDo you want to proceed?`
                );
                if (!confirmed) {
                    setProcessing(false);
                    return;
                }
            }

            const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

            let uploadedUrl = null;
            if (isNonCash && transferProofFile) {
                const { compressImage } = await import('../utils/file_utils');
                const compressedFile = await compressImage(transferProofFile);
                
                const fileExt = compressedFile.name.split('.').pop();
                const fileName = `disbursements/${selectedReq.id}-${Date.now()}.${fileExt}`;
                const { data: uploadData, error: uploadError } = await (await import('../lib/supabase')).supabase.storage
                    .from('receipts')
                    .upload(fileName, compressedFile);

                if (uploadError) throw uploadError;
                uploadedUrl = uploadData.path;
            }

            const response = await fetch(`${API_URL}/requisitions/${selectedReq.id}/disburse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                    denominations: isNonCash ? {} : denominations,
                    total_prepared: totalPrepared,
                    payment_method: paymentMethod,
                    transfer_proof_url: uploadedUrl,
                    recipient_account: recipientAccount,
                    recipient_bank_code: recipientBankCode,
                    recipient_account_name: recipientAccountName
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Disbursement failed');
            }

            alert('Disbursement recorded successfully!');
            setSelectedReq(null);
            setPaymentMethod('CASH');
            setTransferAmount('');
            setRecipientAccount('');
            setRecipientBankCode('');
            setRecipientAccountName('');
            setTransferProofFile(null);
            setDenominations({ '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0, '0.50': 0 });
            loadRequisitions();
        } catch (err: any) {
            console.error(err);
            alert(err.message || 'Failed to record disbursement');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-brand-navy">Cashier Dashboard</h1>
                    
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'pending' ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Clock className="h-4 w-4 mr-2" />
                            Pending
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'history' ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <History className="h-4 w-4 mr-2" />
                            History
                        </button>
                    </div>
                </div>

                <div className={`grid gap-6 ${activeTab === 'pending' ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
                    {/* List of Approved Requisitions / History */}
                    <div className={`${activeTab === 'pending' ? 'lg:col-span-1' : 'w-full'} bg-white shadow rounded-lg overflow-hidden`}>
                        {activeTab === 'pending' ? (
                            <>
                                <div className="px-6 py-4 border-b border-gray-200">
                                    <h2 className="text-lg font-medium text-gray-900">Ready for Disbursement</h2>
                                </div>
                                <ul className="divide-y divide-gray-200 h-[32rem] overflow-y-auto">
                                    {isDataLoading && (
                                        <li className="px-6 py-4 text-gray-500 text-sm italic">Loading requisitions...</li>
                                    )}
                                    {error && (
                                        <li className="px-6 py-4 text-red-600 text-sm font-medium bg-red-50">
                                            Error: {error}
                                        </li>
                                    )}
                                    {requisitions.length === 0 && !error && (
                                        <li className="px-6 py-4 text-gray-500 text-sm">No approved requisitions found.</li>
                                    )}
                                    {requisitions.map((req) => (
                                        <li
                                            key={req.id}
                                            onClick={() => setSelectedReq(req)}
                                            className={`px-6 py-4 cursor-pointer hover:bg-gray-50 ${selectedReq?.id === req.id ? 'bg-brand-navy/5' : ''}`}
                                        >
                                            <div className="flex justify-between">
                                                <span className="font-medium text-gray-900">#{req.id.slice(0, 6)}</span>
                                                <span className="text-green-600 font-bold">K{Number(req.estimated_total).toLocaleString()}</span>
                                            </div>
                                            <p className="text-sm text-gray-500 mt-1">{req.description}</p>
                                            <p className="text-xs text-gray-400 mt-1">Requestor: {req.requestor_name || 'Unknown'}</p>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <>
                                <div className="px-6 py-4 border-b border-gray-200">
                                    <h2 className="text-lg font-medium text-gray-900">Recent Disbursements</h2>
                                </div>
                                <ul className="divide-y divide-gray-200 h-[32rem] overflow-y-auto">
                                    {isHistoryLoading && (
                                        <li className="px-6 py-4 text-gray-500 text-sm italic">Loading history...</li>
                                    )}
                                    {history.length === 0 && !isHistoryLoading && (
                                        <li className="px-6 py-4 text-gray-500 text-sm">No history found.</li>
                                    )}
                                    {history.map((disb) => (
                                        <li
                                            key={disb.id}
                                            onClick={() => setEditingDisb(disb)}
                                            className="px-6 py-4 hover:bg-brand-navy/5 cursor-pointer transition-colors"
                                        >
                                            <div className="flex justify-between items-center">
                                                <div className="flex-1">
                                                    <div className="flex items-center space-x-3">
                                                        <span className="font-bold text-lg text-brand-navy">#{disb.requisition_id.slice(0, 8)}</span>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider uppercase ${disb.confirmed_at ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {disb.confirmed_at ? 'Received' : 'Pending Acknowledgment'}
                                                        </span>
                                                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-400 rounded-lg uppercase">
                                                            <CreditCard className="h-3 w-3" /> {disb.payment_method || 'CASH'}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3">
                                                        <p className="text-sm text-gray-500 flex items-center">
                                                            <User className="h-4 w-4 mr-2 text-brand-green" /> 
                                                            <span className="font-medium">{disb.requestor_name || 'Generic Staff'}</span>
                                                        </p>
                                                        <p className="text-sm text-gray-500 flex items-center">
                                                            <Clock className="h-4 w-4 mr-2 text-brand-green" />
                                                            {new Date(disb.issued_at).toLocaleString()}
                                                        </p>
                                                        <p className="text-sm text-gray-400 italic md:col-span-1 truncate">
                                                            {disb.requisitions?.description}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right flex flex-col items-end min-w-[150px]">
                                                    <span className="text-2xl font-black text-brand-navy">K{Number(disb.total_prepared).toLocaleString()}</span>
                                                    {!disb.confirmed_at && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingDisb(disb);
                                                            }}
                                                            className="mt-2 flex items-center text-xs text-brand-pink hover:underline font-bold"
                                                        >
                                                            <Edit2 className="h-3 w-3 mr-1" /> Edit Disbursement
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>

                    {/* Disbursement Workspace - Only show in pending mode */}
                    {activeTab === 'pending' && (
                        <div className="lg:col-span-2 bg-white shadow rounded-lg p-6">
                            {!selectedReq ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500 py-12">
                                    <Banknote className="h-16 w-16 mb-4 text-gray-300" />
                                    <p>Select a requisition to prepare cash.</p>
                                </div>
                            ) : (
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 mb-4">
                                        Prepare Cash for #{selectedReq.id.slice(0, 6)}
                                    </h2>
                                    <div className="bg-gray-50 p-4 rounded-md mb-6">
                                        <div className="flex justify-between text-sm mb-2">
                                            <span className="text-gray-500">Amount Required:</span>
                                            <span className="font-bold text-gray-900 text-lg">K{Number(selectedReq.estimated_total).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Payee:</span>
                                            <span className="font-medium text-gray-900">{selectedReq.requestor_name}</span>
                                        </div>
                                    </div>

                                    {/* Payment Method Selection */}
                                    <h3 className="text-sm font-medium text-gray-700 mb-3">Disbursement Method</h3>
                                    <div className="grid grid-cols-3 gap-3 mb-6">
                                        <button
                                            onClick={() => setPaymentMethod('CASH')}
                                            className={`flex flex-col items-center justify-center p-3 border rounded-lg transition-colors ${paymentMethod === 'CASH' ? 'bg-brand-navy/10 border-brand-navy text-brand-navy' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                        >
                                            <Banknote className="h-6 w-6 mb-2" />
                                            <span className="text-xs font-medium">Cash</span>
                                        </button>
                                        <button
                                            onClick={() => setPaymentMethod('AIRTEL_MONEY')}
                                            className={`flex flex-col items-center justify-center p-3 border rounded-lg transition-colors ${paymentMethod === 'AIRTEL_MONEY' ? 'bg-red-50 border-red-500 text-red-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                        >
                                            <File className="h-6 w-6 mb-2" />
                                            <span className="text-xs font-medium text-center">Airtel Money</span>
                                        </button>
                                        <button
                                            onClick={() => setPaymentMethod('BANK')}
                                            className={`flex flex-col items-center justify-center p-3 border rounded-lg transition-colors ${paymentMethod === 'BANK' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                        >
                                            <Building className="h-6 w-6 mb-2" />
                                            <span className="text-xs font-medium text-center">Bank Transfer</span>
                                        </button>
                                        <button
                                            onClick={() => setPaymentMethod('MONEYWISE_WALLET')}
                                            className={`flex flex-col items-center justify-center p-3 border rounded-lg transition-colors ${paymentMethod === 'MONEYWISE_WALLET' ? 'bg-brand-pink/10 border-brand-pink text-brand-pink' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                        >
                                            <CreditCard className="h-6 w-6 mb-2" />
                                            <span className="text-xs font-medium text-center">MoneyWise Wallet</span>
                                        </button>
                                    </div>

                                    {paymentMethod === 'CASH' ? (
                                        <>
                                            <h3 className="text-sm font-medium text-gray-700 mb-3">Denominations Calculator</h3>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                                                {Object.entries(denominations).sort((a, b) => Number(b[0]) - Number(a[0])).map(([value, count]) => (
                                                    <div key={value} className="bg-white border rounded-md p-3 shadow-sm">
                                                        <label className="block text-xs font-medium text-gray-500 mb-1">K{value} Notes/Coins</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={count}
                                                            onChange={(e) => handleDenominationChange(value, parseInt(e.target.value) || 0)}
                                                            className="block w-full text-center border-gray-300 rounded-md shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="space-y-4 mb-6">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Total Amount Transferred (K)
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min={Number(selectedReq.estimated_total)}
                                                    value={transferAmount}
                                                    onChange={(e) => setTransferAmount(e.target.value)}
                                                    placeholder={`e.g. ${Number(selectedReq.estimated_total)}`}
                                                    className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                />
                                            </div>

                                            {paymentMethod === 'MONEYWISE_WALLET' && (
                                                <>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Recipient Account
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={recipientAccount}
                                                                onChange={(e) => setRecipientAccount(e.target.value)}
                                                                placeholder="e.g. 0123456789"
                                                                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                Bank Code (ZMN)
                                                            </label>
                                                            <select
                                                                value={recipientBankCode}
                                                                onChange={(e) => setRecipientBankCode(e.target.value)}
                                                                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                            >
                                                                 <option value="">Select Bank / Operator</option>
                                                                 <option value="airtel">Airtel Money</option>
                                                                 <option value="mtn">MTN Money</option>
                                                                 <option value="zamtel">Zamtel Money</option>
                                                                 <option value="zanaco">ZANACO</option>
                                                                 <option value="sc">Standard Chartered</option>
                                                                 <option value="absa">Absa</option>
                                                                 <option value="fnb">FNB</option>
                                                                 <option value="ecobank">Ecobank</option>
                                                                 <option value="atlas_mara">Atlas Mara</option>
                                                                 <option value="indo_zambia">Indo Zambia</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            Recipient Name
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={recipientAccountName}
                                                            onChange={(e) => setRecipientAccountName(e.target.value)}
                                                            placeholder="e.g. John Doe"
                                                            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2 border"
                                                        />
                                                    </div>

                                                    {/* Wallet Safeguard UI */}
                                                    {lencoSubaccountId && (
                                                        <div className={`p-4 rounded-xl border ${walletBalance !== null && (Number(selectedReq.estimated_total) + LENCO_FEE) > walletBalance ? 'bg-red-50 border-red-100' : 'bg-brand-gray/30 border-gray-100'}`}>
                                                            <div className="flex justify-between items-start">
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center space-x-2">
                                                                        <Wallet className={`h-4 w-4 ${walletBalance !== null && (Number(selectedReq.estimated_total) + LENCO_FEE) > walletBalance ? 'text-red-500' : 'text-brand-green'}`} />
                                                                        <span className="text-sm font-bold text-brand-navy">MoneyWise Wallet Safeguard</span>
                                                                    </div>
                                                                    <p className="text-xs text-gray-500">
                                                                        All wallet withdrawals incur a fixed Lenco transaction charge of <span className="font-bold text-brand-navy">K{LENCO_FEE}</span>
                                                                    </p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Available Balance</p>
                                                                    {fetchingBalance ? (
                                                                        <Loader2 className="h-4 w-4 animate-spin text-brand-green ml-auto" />
                                                                    ) : (
                                                                        <p className={`text-lg font-black ${walletBalance !== null && (Number(selectedReq.estimated_total) + LENCO_FEE) > walletBalance ? 'text-red-600' : 'text-brand-green'}`}>
                                                                            K{walletBalance?.toLocaleString() || '0.00'}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="mt-4 pt-4 border-t border-dashed border-gray-200 grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Requisition Total</p>
                                                                    <p className="text-sm font-bold text-brand-navy">
                                                                        K{Number(selectedReq.estimated_total).toLocaleString()}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Lenco Fee</p>
                                                                    <p className="text-sm font-bold text-gray-600">K{LENCO_FEE}</p>
                                                                </div>
                                                                <div className="col-span-2 pt-2 flex justify-between items-center border-t border-gray-100 mt-2">
                                                                    <p className="text-xs font-black text-brand-navy uppercase">Total Wallet Deduction</p>
                                                                    <p className={`text-xl font-black ${walletBalance !== null && (Number(selectedReq.estimated_total) + LENCO_FEE) > walletBalance ? 'text-red-600' : 'text-brand-navy'}`}>
                                                                        K{(Number(selectedReq.estimated_total) + LENCO_FEE).toLocaleString()}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            
                                                            {walletBalance !== null && (Number(selectedReq.estimated_total) + LENCO_FEE) > walletBalance && (
                                                                <div className="mt-4 p-3 bg-red-100 rounded-lg flex items-center space-x-2 border border-red-200 animate-pulse">
                                                                    <AlertTriangle className="h-4 w-4 text-red-600" />
                                                                    <p className="text-xs font-bold text-red-700">Insufficient funds in MoneyWise Wallet for this disbursement.</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {paymentMethod !== 'MONEYWISE_WALLET' && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Proof of Transfer Document
                                                    </label>
                                                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md group hover:bg-gray-50 transition-colors">
                                                        <div className="space-y-1 text-center">
                                                            {transferProofFile ? (
                                                                <div className="flex flex-col items-center">
                                                                    <div className="flex items-center space-x-2 text-brand-green mb-2">
                                                                        <File className="h-8 w-8" />
                                                                        <span className="text-sm font-medium">{transferProofFile.name}</span>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setTransferProofFile(null)}
                                                                        className="text-xs text-red-500 hover:text-red-700 flex items-center"
                                                                    >
                                                                        <X className="h-3 w-3 mr-1" /> Remove
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <Upload className="mx-auto h-12 w-12 text-gray-400 group-hover:text-brand-green transition-colors" />
                                                                    <div className="flex text-sm text-gray-600 justify-center">
                                                                        <label className="relative cursor-pointer bg-transparent rounded-md font-medium text-brand-green hover:text-green-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-brand-green">
                                                                            <span>Upload a file</span>
                                                                            <input
                                                                                ref={fileInputRef}
                                                                                type="file"
                                                                                className="sr-only"
                                                                                accept="image/*,.pdf"
                                                                                onChange={(e) => {
                                                                                    if (e.target.files && e.target.files[0]) {
                                                                                        setTransferProofFile(e.target.files[0]);
                                                                                    }
                                                                                }}
                                                                            />
                                                                        </label>
                                                                        <p className="pl-1">or drag and drop</p>
                                                                    </div>
                                                                    <p className="text-xs text-gray-500">PNG, JPG, PDF up to 10MB</p>
                                                                </>
                                                            )
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="border-t pt-4 flex justify-between items-center">
                                        <div>
                                            <span className="text-sm text-gray-500 block">Total {paymentMethod === 'CASH' ? 'Prepared' : 'Transferred'}</span>
                                            <span className={`text-2xl font-bold ${(paymentMethod === 'CASH' ? calculateTotal(denominations) : Number(transferAmount)) === Number(selectedReq.estimated_total)
                                                ? 'text-green-600'
                                                : (paymentMethod === 'CASH' ? calculateTotal(denominations) : Number(transferAmount)) > Number(selectedReq.estimated_total)
                                                    ? 'text-amber-500'
                                                    : 'text-red-500'
                                                }`}>
                                                K{(paymentMethod === 'CASH' ? calculateTotal(denominations) : Number(transferAmount) || 0).toLocaleString()}
                                            </span>
                                        </div>
                                        <button
                                            onClick={handleDisburse}
                                            disabled={processing || (paymentMethod === 'CASH' ? calculateTotal(denominations) : Number(transferAmount || 0)) < Number(selectedReq.estimated_total) || (paymentMethod !== 'CASH' && paymentMethod !== 'MONEYWISE_WALLET' && !transferProofFile) || (paymentMethod === 'MONEYWISE_WALLET' && (!recipientAccount || !recipientBankCode || (walletBalance !== null && (Number(selectedReq.estimated_total) + LENCO_FEE) > walletBalance)))}
                                            className="w-full flex items-center justify-center px-6 py-4 border border-transparent text-lg font-bold rounded-xl text-white bg-brand-navy hover:bg-brand-navy/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-navy disabled:bg-gray-400 disabled:cursor-not-allowed shadow-[0_4px_0_0_rgba(0,0,0,0.1)] active:translate-y-0.5 active:shadow-none transition-all"
                                        >
                                            {processing ? (
                                                <>
                                                    <Loader2 className="animate-spin h-5 w-5 mr-3" />
                                                    Processing...
                                                </>
                                            ) : (
                                                <>
                                                    <Check className="h-6 w-6 mr-3" />
                                                    Confirm & Disburse Funds
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {editingDisb && (
                <DisbursementDetailOverlay
                    disbursement={editingDisb}
                    onClose={() => setEditingDisb(null)}
                    onUpdated={() => {
                        loadHistory();
                        loadRequisitions();
                    }}
                />
            )}
        </Layout>
    );
};
