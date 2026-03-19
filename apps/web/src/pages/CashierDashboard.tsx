import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout';
import { Banknote, Check, File, Building, Upload, X, History, Clock, User, Edit2, CreditCard, Loader2, Wallet, AlertTriangle, Sparkles, CheckCircle, Smartphone } from 'lucide-react';
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
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'AIRTEL_MONEY' | 'BANK' | 'MONEYWISE_WALLET'>('MONEYWISE_WALLET');
    const [transferAmount, setTransferAmount] = useState<string>('');
    const [recipientAccount, setRecipientAccount] = useState<string>('');
    const [recipientBankCode, setRecipientBankCode] = useState<string>('');
    const [recipientAccountName, setRecipientAccountName] = useState<string>('');
    const [transferProofFile, setTransferProofFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isDataLoading, setIsDataLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [verificationStep, setVerificationStep] = useState<string>('');
    const [verifiedDetails, setVerifiedDetails] = useState<any | null>(null);
    
    // Additional Lenco states
    const [subMethod, setSubMethod] = useState<'MOBILE_MONEY' | 'BANK_TRANSFER'>('MOBILE_MONEY');
    const [banks, setBanks] = useState<any[]>([]);
    const [resolvingAccount, setResolvingAccount] = useState(false);
    const [accountResolved, setAccountResolved] = useState(false);
    const [resolutionError, setResolutionError] = useState<string | null>(null);
    
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
        loadBanks();
    }, []);

    const loadBanks = async () => {
        try {
            const bankList = await lencoService.getBanks();
            setBanks(bankList);
        } catch (err) {
            console.error('Failed to load banks:', err);
        }
    };

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

    const resolveRecipient = async () => {
        if (!recipientAccount || (subMethod === 'BANK_TRANSFER' && !recipientBankCode)) return;

        try {
            setResolvingAccount(true);
            setAccountResolved(false);
            setResolutionError(null);
            setError(null);

            let result;
            if (subMethod === 'MOBILE_MONEY') {
                // Auto-detect operator if it's missing or if it was manually selected
                let operator = recipientBankCode;
                const phone = recipientAccount.startsWith('0') ? '260' + recipientAccount.slice(1) : recipientAccount;
                
                if (!operator) {
                    if (phone.startsWith('26097') || phone.startsWith('26077')) operator = 'airtel';
                    else if (phone.startsWith('26096') || phone.startsWith('26076')) operator = 'mtn';
                    else if (phone.startsWith('26095')) operator = 'zamtel';
                }

                if (!operator) throw new Error('Could not detect mobile operator. Please select one.');
                
                setRecipientBankCode(operator);
                result = await lencoService.resolveMobileMoney(recipientAccount, operator);
            } else {
                result = await lencoService.resolveBankAccount(recipientAccount, recipientBankCode);
            }

            if (result && result.accountName) {
                setRecipientAccountName(result.accountName);
                setAccountResolved(true);
            } else {
                setResolutionError('Account name not found. Please verify details.');
            }
        } catch (err: any) {
            setResolutionError(err.message || 'Failed to resolve account');
        } finally {
            setResolvingAccount(false);
        }
    };

    const pollDisbursementStatus = async (reqId: string) => {
        setVerifying(true);
        setVerificationStep('Waiting for Lenco confirmation...');
        
        let attempts = 0;
        const maxAttempts = 12; // 1 minute (5s intervals)
        
        const interval = setInterval(async () => {
            try {
                attempts++;
                const result = await lencoService.verifyDisbursementStatus(reqId);
                
                if (result.status === 'successful' || result.status === 'SUCCESSFUL') {
                    clearInterval(interval);
                    setVerificationStep('Verification Successful!');
                    setVerifiedDetails(result.details);
                    // Do NOT setVerifying(false) or show alert yet, we want them to see the success UI
                    loadRequisitions();
                } else if (result.status === 'failed' || result.status === 'FAILED') {
                    clearInterval(interval);
                    setVerifying(false);
                    alert(`Disbursement Failed: ${result.error || 'Unknown error'}`);
                    loadRequisitions();
                }
                
                if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    setVerifying(false);
                    alert('Disbursement is taking longer than expected. Please check history in a few minutes.');
                    loadRequisitions();
                    setSelectedReq(null);
                    resetForm();
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 5000);
    };

    const resetForm = () => {
        setPaymentMethod('CASH');
        setTransferAmount('');
        setRecipientAccount('');
        setRecipientBankCode('');
        setRecipientAccountName('');
        setAccountResolved(false);
        setTransferProofFile(null);
        setVerifiedDetails(null);
        setVerifying(false);
        setDenominations({ '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0, '0.50': 0 });
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

            const result = await response.json();

            if (result.status === 'initiated') {
                pollDisbursementStatus(selectedReq.id);
            } else {
                alert('Disbursement recorded successfully!');
                setSelectedReq(null);
                resetForm();
                loadRequisitions();
            }
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
                                    <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-3">Select Method</h3>
                                    
                                    <div className="relative flex bg-gray-100 p-1.5 rounded-2xl mb-8 overflow-hidden h-[54px]">
                                        {/* Gliding background pill */}
                                        <div 
                                            className="absolute top-1.5 bottom-1.5 bg-white rounded-xl shadow-sm transition-all duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-0"
                                            style={{
                                                left: paymentMethod === 'MONEYWISE_WALLET' ? '6px' :
                                                      paymentMethod === 'AIRTEL_MONEY' ? 'calc(25% + 3px)' :
                                                      paymentMethod === 'BANK' ? 'calc(50% + 3px)' : 
                                                      'calc(75% + 3px)',
                                                width: 'calc(25% - 9px)'
                                            }}
                                        />

                                        <button
                                            onClick={() => setPaymentMethod('MONEYWISE_WALLET')}
                                            className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 transition-all duration-300 ${paymentMethod === 'MONEYWISE_WALLET' ? 'text-brand-pink' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            <CreditCard className={`h-4 w-4 ${paymentMethod === 'MONEYWISE_WALLET' ? 'animate-pulse' : ''}`} />
                                            <span className="text-[11px] font-black whitespace-nowrap">MoneyWise</span>
                                        </button>

                                        <button
                                            onClick={() => setPaymentMethod('AIRTEL_MONEY')}
                                            className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 transition-all duration-300 ${paymentMethod === 'AIRTEL_MONEY' ? 'text-red-600' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            <Smartphone className="h-4 w-4" />
                                            <span className="text-[11px] font-black whitespace-nowrap">Airtel</span>
                                        </button>

                                        <button
                                            onClick={() => setPaymentMethod('BANK')}
                                            className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 transition-all duration-300 ${paymentMethod === 'BANK' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            <Building className="h-4 w-4" />
                                            <span className="text-[11px] font-black whitespace-nowrap">Bank</span>
                                        </button>

                                        <button
                                            onClick={() => setPaymentMethod('CASH')}
                                            className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 transition-all duration-300 ${paymentMethod === 'CASH' ? 'text-brand-navy' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            <Banknote className="h-4 w-4" />
                                            <span className="text-[11px] font-black whitespace-nowrap">Cash</span>
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
                                                    {/* Sub-method Toggle */}
                                                    <div className="flex bg-gray-100 p-1 rounded-xl mb-4">
                                                        <button
                                                            onClick={() => {
                                                                setSubMethod('MOBILE_MONEY');
                                                                setRecipientBankCode('');
                                                                setRecipientAccountName('');
                                                                setAccountResolved(false);
                                                            }}
                                                            className={`flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg transition-all ${subMethod === 'MOBILE_MONEY' ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500'}`}
                                                        >
                                                            Mobile Money
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setSubMethod('BANK_TRANSFER');
                                                                setRecipientBankCode('');
                                                                setRecipientAccountName('');
                                                                setAccountResolved(false);
                                                            }}
                                                            className={`flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg transition-all ${subMethod === 'BANK_TRANSFER' ? 'bg-white text-brand-navy shadow-sm' : 'text-gray-500'}`}
                                                        >
                                                            Bank Transfer
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                {subMethod === 'MOBILE_MONEY' ? 'Phone Number' : 'Account Number'}
                                                            </label>
                                                        <div className="relative">
                                                            <input
                                                                type="text"
                                                                value={recipientAccount}
                                                                onChange={(e) => {
                                                                    setRecipientAccount(e.target.value);
                                                                    setAccountResolved(false);
                                                                }}
                                                                placeholder={subMethod === 'MOBILE_MONEY' ? '097XXXXXXX' : 'Account Number'}
                                                                className={`block w-full border-gray-200 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-3 border ${subMethod === 'MOBILE_MONEY' && recipientBankCode ? 'pr-12' : ''}`}
                                                            />
                                                            {subMethod === 'MOBILE_MONEY' && recipientBankCode && (
                                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                                                                    <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                                                        recipientBankCode === 'airtel' ? 'bg-red-100 text-red-600' :
                                                                        recipientBankCode === 'mtn' ? 'bg-yellow-100 text-yellow-700' :
                                                                        'bg-green-100 text-green-700'
                                                                    }`}>
                                                                        {recipientBankCode}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            {subMethod === 'MOBILE_MONEY' ? 'Recipient Name' : 'Select Bank'}
                                                        </label>
                                                        {subMethod === 'MOBILE_MONEY' ? (
                                                            <div className="relative">
                                                                <input
                                                                    type="text"
                                                                    readOnly
                                                                    value={recipientAccountName}
                                                                    placeholder="Name will show once confirmed"
                                                                    className={`block w-full border-gray-200 rounded-xl shadow-sm bg-gray-50 sm:text-sm p-3 border font-bold ${accountResolved ? 'text-green-700 border-green-100' : 'text-gray-400 italic'}`}
                                                                />
                                                                {accountResolved && (
                                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <select
                                                                value={recipientBankCode}
                                                                onChange={(e) => {
                                                                    setRecipientBankCode(e.target.value);
                                                                    setAccountResolved(false);
                                                                }}
                                                                className="block w-full border-gray-200 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-3 border"
                                                            >
                                                                <option value="">Select Bank</option>
                                                                {banks.map(bank => (
                                                                    <option key={bank.id} value={bank.id}>{bank.name}</option>
                                                                ))}
                                                            </select>
                                                        )}
                                                    </div>
                                                </div>

                                                {subMethod === 'BANK_TRANSFER' && recipientAccountName && (
                                                    <div className="mt-2 flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1">
                                                        <CheckCircle className={`h-3 w-3 ${accountResolved ? 'text-green-500' : 'text-gray-400'}`} />
                                                        <p className={`text-[11px] font-bold ${accountResolved ? 'text-green-700' : 'text-gray-500 italic'}`}>
                                                            {recipientAccountName}
                                                        </p>
                                                    </div>
                                                )}

                                                    <div className="mt-2">
                                                        <button
                                                            onClick={resolveRecipient}
                                                            disabled={resolvingAccount || !recipientAccount || (subMethod === 'BANK_TRANSFER' && !recipientBankCode)}
                                                            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-gray-100 text-brand-navy rounded-xl text-xs font-bold hover:bg-gray-200 transition-colors disabled:opacity-50"
                                                        >
                                                            {resolvingAccount ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-brand-pink" />}
                                                            {accountResolved ? 'Change Details' : 'Confirm'}
                                                        </button>
                                                    </div>

                                                    {resolutionError && (
                                                        <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                                                            <AlertTriangle className="h-4 w-4 text-red-500" />
                                                            <p className="text-xs font-bold text-red-700">{resolutionError}</p>
                                                        </div>
                                                    )}

                                                    {/* Wallet Safeguard UI */}
                                                    {lencoSubaccountId && (
                                                        <div className={`mt-4 p-4 rounded-xl border ${walletBalance !== null && (Number(selectedReq.estimated_total) + LENCO_FEE) > walletBalance ? 'bg-red-50 border-red-100' : 'bg-brand-gray/30 border-gray-100'}`}>
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

                                                    {/* Verification Overlay */}
                                                    {verifying && (
                                                        <div className="fixed inset-0 bg-brand-navy/80 backdrop-blur-md z-[100] flex items-center justify-center p-6 text-center">
                                                            <div className="max-w-md w-full animate-in zoom-in-95 duration-300">
                                                                <div className="bg-white p-8 rounded-3xl shadow-2xl space-y-6 relative overflow-hidden">
                                                                    {!verifiedDetails ? (
                                                                        <>
                                                                            {/* Progress gradient bar */}
                                                                            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gray-100 overflow-hidden">
                                                                                <div className="h-full bg-brand-green animate-progress w-full"></div>
                                                                            </div>
                                                                            
                                                                            <div className="h-20 w-20 bg-brand-green/10 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-brand-green/20">
                                                                                <Loader2 className="h-10 w-10 text-brand-green animate-spin" />
                                                                            </div>
                                                                            
                                                                            <h3 className="text-2xl font-black text-brand-navy">Processing Payout</h3>
                                                                            <p className="text-gray-500 font-medium">
                                                                                {verificationStep}
                                                                            </p>
                                                                            
                                                                            <div className="grid grid-cols-2 gap-4 text-left bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                                                                <div>
                                                                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Recipient</p>
                                                                                    <p className="text-sm font-black text-brand-navy truncate">{recipientAccountName}</p>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Amount</p>
                                                                                    <p className="text-sm font-black text-brand-pink">K{Number(selectedReq.estimated_total).toLocaleString()}</p>
                                                                                </div>
                                                                            </div>

                                                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                                                                Please don't close this window
                                                                            </p>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            {/* Success View */}
                                                                            <div className="absolute top-0 left-0 right-0 h-1.5 bg-brand-green"></div>
                                                                            
                                                                            <div className="h-20 w-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-green-100 animate-in zoom-in">
                                                                                <CheckCircle className="h-10 w-10 text-green-500" />
                                                                            </div>
                                                                            
                                                                            <h3 className="text-2xl font-black text-brand-navy">Transfer Successful!</h3>
                                                                            <p className="text-green-600 font-bold text-sm bg-green-50 py-2 px-4 rounded-full inline-block border border-green-100">
                                                                                Successfully logged to MoneyWise Ledger
                                                                            </p>
                                                                            
                                                                            <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 space-y-4 text-left">
                                                                                <div className="grid grid-cols-2 gap-4">
                                                                                    <div>
                                                                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Lenco Ref</p>
                                                                                        <p className="text-xs font-mono font-black text-brand-navy">{verifiedDetails.reference || 'N/A'}</p>
                                                                                    </div>
                                                                                    <div>
                                                                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Amount Sent</p>
                                                                                        <p className="text-sm font-black text-brand-green">K{Number(verifiedDetails.amount || selectedReq.estimated_total).toLocaleString()}</p>
                                                                                    </div>
                                                                                </div>
                                                                                
                                                                                <div className="pt-3 border-t border-gray-200">
                                                                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Sent To</p>
                                                                                    <p className="text-sm font-black text-gray-700 truncate">{recipientAccountName}</p>
                                                                                </div>
                                                                            </div>

                                                                            <button
                                                                                onClick={() => {
                                                                                    setSelectedReq(null);
                                                                                    resetForm();
                                                                                }}
                                                                                className="w-full py-4 bg-brand-navy text-white rounded-xl font-bold hover:bg-brand-navy/90 transition-colors shadow-sm"
                                                                            >
                                                                                Done
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
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
