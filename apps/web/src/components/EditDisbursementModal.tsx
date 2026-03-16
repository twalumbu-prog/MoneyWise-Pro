import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { requisitionService } from '../services/requisition.service';

interface EditDisbursementModalProps {
    disbursement: any;
    onClose: () => void;
    onUpdated: () => void;
}

const calculateTotal = (denominations: Record<string, number>) => {
    return Object.entries(denominations).reduce((total, [value, count]) => {
        return total + Number(value) * count;
    }, 0);
};

export const EditDisbursementModal: React.FC<EditDisbursementModalProps> = ({ disbursement, onClose, onUpdated }) => {
    const [totalPrepared, setTotalPrepared] = useState<string>(disbursement.total_prepared.toString());
    const [denominations, setDenominations] = useState<Record<string, number>>(disbursement.denominations || {
        '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0, '0.50': 0
    });
    const [processing, setProcessing] = useState(false);

    const handleDenominationChange = (value: string, count: number) => {
        const nextDenominations = {
            ...denominations,
            [value]: Math.max(0, count)
        };
        setDenominations(nextDenominations);
        if (disbursement.payment_method === 'CASH') {
            setTotalPrepared(calculateTotal(nextDenominations).toString());
        }
    };

    const handleUpdate = async () => {
        try {
            setProcessing(true);
            await requisitionService.updateDisbursement(disbursement.id, {
                total_prepared: Number(totalPrepared),
                denominations: disbursement.payment_method === 'CASH' ? denominations : {}
            });
            onUpdated();
            onClose();
        } catch (err: any) {
            alert(err.message || 'Failed to update disbursement');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-brand-navy">Edit Disbursement</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[70vh]">
                    <div className="mb-6 p-4 bg-blue-50 rounded-xl">
                        <p className="text-sm text-blue-700">
                            Editing amount for <strong>#{disbursement.requisition_id.slice(0, 8)}</strong>
                        </p>
                    </div>

                    {disbursement.payment_method === 'CASH' ? (
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            {Object.entries(denominations).sort((a, b) => Number(b[0]) - Number(a[0])).map(([value, count]) => (
                                <div key={value} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">K{value}</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={count}
                                        onChange={(e) => handleDenominationChange(value, parseInt(e.target.value) || 0)}
                                        className="block w-full text-center bg-white border-gray-200 rounded-lg shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm"
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Total Amount (K)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={totalPrepared}
                                onChange={(e) => setTotalPrepared(e.target.value)}
                                className="block w-full border-gray-200 rounded-lg shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-3 border"
                            />
                        </div>
                    )}

                    <div className="border-t pt-4 flex justify-between items-center">
                        <div>
                            <span className="text-sm text-gray-500 block">Total Updated</span>
                            <span className="text-2xl font-bold text-brand-navy">
                                K{Number(totalPrepared).toLocaleString()}
                            </span>
                        </div>
                        <button
                            onClick={handleUpdate}
                            disabled={processing || Number(totalPrepared) <= 0}
                            className="flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-xl shadow-lg shadow-green-200 text-white bg-brand-green hover:bg-green-600 focus:outline-none disabled:opacity-50"
                        >
                            <Check className="h-5 w-5 mr-2" />
                            {processing ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
