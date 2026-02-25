import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout';
import { Banknote, Check, File, Building, Upload, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { requisitionService, Requisition } from '../services/requisition.service';

// Helper to calculate total value of denominations
const calculateTotal = (denominations: Record<string, number>) => {
    return Object.entries(denominations).reduce((total, [value, count]) => {
        return total + Number(value) * count;
    }, 0);
};

export const CashierDashboard: React.FC = () => {
    const { } = useAuth();
    const [requisitions, setRequisitions] = useState<Requisition[]>([]);
    const [selectedReq, setSelectedReq] = useState<Requisition | null>(null);
    const [denominations, setDenominations] = useState<Record<string, number>>({
        '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0, '0.50': 0
    });

    // New state for disbursement method
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'AIRTEL_MONEY' | 'BANK'>('CASH');
    const [transferAmount, setTransferAmount] = useState<string>('');
    const [transferProofFile, setTransferProofFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isDataLoading, setIsDataLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        loadRequisitions();
    }, []);

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

    const handleDenominationChange = (value: string, count: number) => {
        setDenominations(prev => ({
            ...prev,
            [value]: Math.max(0, count)
        }));
    };

    const handleDisburse = async () => {
        if (!selectedReq) return;

        const estimatedTotal = Number(selectedReq.estimated_total);
        const isNonCash = paymentMethod !== 'CASH';

        let totalPrepared = 0;

        if (isNonCash) {
            totalPrepared = Number(transferAmount);
            if (!totalPrepared || totalPrepared <= 0) {
                alert('Please enter a valid transfer amount.');
                return;
            }
            if (!transferProofFile) {
                alert('Please upload a proof of transfer document.');
                return;
            }
        } else {
            totalPrepared = calculateTotal(denominations);
        }

        if (totalPrepared < estimatedTotal) {
            alert(`Total prepared/transferred (K${totalPrepared.toFixed(2)}) cannot be less than the requisition amount (K${estimatedTotal.toFixed(2)})`);
            return;
        }

        if (totalPrepared > estimatedTotal) {
            const confirmed = window.confirm(
                `You are about to disburse K${totalPrepared.toFixed(2)}, which is MORE than the requested amount of K${estimatedTotal.toFixed(2)}. \n\nThis is usually because exact denominations are unavailable. The extra amount will be recorded and expected to be returned alongside actual change. \n\nDo you want to proceed?`
            );
            if (!confirmed) return;
        }

        try {
            setProcessing(true);
            const token = (await import('../lib/supabase')).supabase.auth.getSession().then(({ data }) => data.session?.access_token);
            const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

            let uploadedUrl = null;
            if (isNonCash && transferProofFile) {
                const fileExt = transferProofFile.name.split('.').pop();
                const fileName = `disbursements/${selectedReq.id}-${Date.now()}.${fileExt}`;
                const { data: uploadData, error: uploadError } = await (await import('../lib/supabase')).supabase.storage
                    .from('receipts')
                    .upload(fileName, transferProofFile);

                if (uploadError) throw uploadError;
                uploadedUrl = uploadData.path;
            }

            const response = await fetch(`${API_URL}/requisitions/${selectedReq.id}/disburse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${await token}`,
                },
                body: JSON.stringify({
                    denominations: isNonCash ? {} : denominations,
                    total_prepared: totalPrepared,
                    payment_method: paymentMethod,
                    transfer_proof_url: uploadedUrl
                }),
            });

            if (!response.ok) throw new Error('Disbursement failed');

            alert('Disbursement recorded successfully!');
            setSelectedReq(null);
            setPaymentMethod('CASH');
            setTransferAmount('');
            setTransferProofFile(null);
            setDenominations({ '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0, '0.50': 0 });
            loadRequisitions();
        } catch (err) {
            console.error(err);
            alert('Failed to record disbursement');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-brand-navy">Cashier Dashboard</h1>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* List of Approved Requisitions */}
                    <div className="lg:col-span-1 bg-white shadow rounded-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-medium text-gray-900">Ready for Disbursement</h2>
                        </div>
                        <ul className="divide-y divide-gray-200 h-96 overflow-y-auto">
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
                    </div>

                    {/* Disbursement Workspace */}
                    <div className="lg:col-span-2 bg-white shadow rounded-lg p-6">
                        {!selectedReq ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500">
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
                                                    )}
                                                </div>
                                            </div>
                                        </div>
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
                                        disabled={processing || (paymentMethod === 'CASH' ? calculateTotal(denominations) : Number(transferAmount || 0)) < Number(selectedReq.estimated_total) || (paymentMethod !== 'CASH' && !transferProofFile)}
                                        className="flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-xl shadow-lg shadow-green-200 text-white bg-brand-green hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Check className="h-5 w-5 mr-2" />
                                        {processing ? 'Processing...' : 'Confirm Disbursement'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
};
