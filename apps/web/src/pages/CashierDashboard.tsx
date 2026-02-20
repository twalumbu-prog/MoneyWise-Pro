import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Banknote, Check } from 'lucide-react';
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

        const totalPrepared = calculateTotal(denominations);
        const estimatedTotal = Number(selectedReq.estimated_total);

        if (totalPrepared < estimatedTotal) {
            alert(`Total prepared (K${totalPrepared.toFixed(2)}) cannot be less than the requisition amount (K${estimatedTotal.toFixed(2)})`);
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

            const response = await fetch(`${API_URL}/requisitions/${selectedReq.id}/disburse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${await token}`,
                },
                body: JSON.stringify({
                    denominations,
                    total_prepared: totalPrepared
                }),
            });

            if (!response.ok) throw new Error('Disbursement failed');

            alert('Disbursement recorded successfully!');
            setSelectedReq(null);
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

                                <div className="border-t pt-4 flex justify-between items-center">
                                    <div>
                                        <span className="text-sm text-gray-500 block">Total Prepared</span>
                                        <span className={`text-2xl font-bold ${calculateTotal(denominations) === Number(selectedReq.estimated_total) ? 'text-green-600' : calculateTotal(denominations) > Number(selectedReq.estimated_total) ? 'text-amber-500' : 'text-red-500'}`}>
                                            K{calculateTotal(denominations).toLocaleString()}
                                        </span>
                                    </div>
                                    <button
                                        onClick={handleDisburse}
                                        disabled={processing || calculateTotal(denominations) < Number(selectedReq.estimated_total)}
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
