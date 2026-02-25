import React, { useState, useEffect } from 'react';
import { cashbookService } from '../services/cashbook.service';
import { X, AlertCircle, CheckCircle, Calculator } from 'lucide-react';

interface CloseBalanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    currentSystemBalance: number;
    accountType: string;
}

const CloseBalanceModal: React.FC<CloseBalanceModalProps> = ({ isOpen, onClose, onSuccess, currentSystemBalance, accountType }) => {
    const [step, setStep] = useState<1 | 2>(1); // 1: Input, 2: Confirmation
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [physicalCount, setPhysicalCount] = useState<string>('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);

    // Denominations logic
    const [denominations, setDenominations] = useState<Record<string, number>>({
        '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0, '0.50': 0
    });
    const denominationValues = [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.50];

    useEffect(() => {
        if (isOpen) {
            // Reset state
            setStep(1);
            setDate(new Date().toISOString().split('T')[0]);
            setPhysicalCount('');
            setNotes('');
            setDenominations({ '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0, '0.50': 0 });
        }
    }, [isOpen]);

    const handleDenominationChange = (value: number, count: string) => {
        const numCount = parseInt(count) || 0;
        const newDenoms = { ...denominations, [value.toString()]: numCount };
        setDenominations(newDenoms);

        const newTotal = Object.entries(newDenoms).reduce((sum, [val, cnt]) => {
            return sum + (parseFloat(val) * cnt);
        }, 0);
        setPhysicalCount(newTotal.toFixed(2));
    };

    const variance = physicalCount ? parseFloat(physicalCount) - currentSystemBalance : 0;
    const isBalanced = Math.abs(variance) <= 0.01;

    const handleNext = () => {
        if (!physicalCount || parseFloat(physicalCount) < 0) {
            alert('Please enter a valid physical count');
            return;
        }
        setStep(2);
    };

    const handleSubmit = async () => {
        try {
            setLoading(true);
            await cashbookService.closeBook(
                parseFloat(physicalCount),
                date,
                notes,
                accountType
            );
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Failed to close book:', error);
            alert('Failed to close book. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h2 className="text-xl font-bold text-gray-900 flex items-center">
                        <Calculator className="mr-2 h-5 w-5 text-brand-navy" />
                        Closing Cash Ledger
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="overflow-y-auto p-6 flex-1">
                    {step === 1 ? (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Closing Date</label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-green outline-none"
                                    />
                                    <p className="mt-1 text-xs text-gray-500">The date for which you are closing the books.</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">System Balance</label>
                                    <div className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-mono">
                                        K{currentSystemBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-brand-gray rounded-xl p-4 border border-gray-200">
                                <h3 className="font-semibold text-gray-900 mb-3 text-sm">Physical Cash Count</h3>
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                    {denominationValues.map((val) => (
                                        <div key={val} className="flex items-center space-x-2 bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                                            <div className="min-w-[3rem] text-xs font-bold text-gray-500">K{val >= 1 ? val : val.toFixed(2)}</div>
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-full text-right text-sm font-semibold outline-none"
                                                value={denominations[val.toString()] || ''}
                                                placeholder="0"
                                                onChange={(e) => handleDenominationChange(val, e.target.value)}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                    <span className="font-medium text-brand-navy">Total Counted</span>
                                    <span className="text-xl font-black text-brand-green">
                                        K{parseFloat(physicalCount || '0').toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Any notes about this closing or discrepancies..."
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-green outline-none h-20 resize-none text-sm"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 text-center py-6">
                            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${isBalanced ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                {isBalanced ? <CheckCircle size={32} /> : <AlertCircle size={32} />}
                            </div>

                            <div>
                                <h3 className="text-xl font-bold text-gray-900 mb-1">
                                    {isBalanced ? 'Accounts Balanced' : 'Discrepancy Detected'}
                                </h3>
                                <p className="text-gray-500">
                                    {isBalanced
                                        ? 'The physical cash matches the system balance.'
                                        : `There is a variance of K${Math.abs(variance).toFixed(2)} (${variance > 0 ? 'Surplus' : 'Shortage'}).`}
                                </p>
                            </div>

                            {!isBalanced && (
                                <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg text-left mx-auto max-w-sm">
                                    An adjustment entry will be automatically created to reconcile the system balance with your physical count.
                                </div>
                            )}

                            <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 max-w-sm mx-auto text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">New Opening Balance:</span>
                                    <span className="font-bold text-gray-900">K{parseFloat(physicalCount).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Opening Date:</span>
                                    <span className="font-bold text-gray-900">
                                        {new Date(new Date(date).setDate(new Date(date).getDate() + 1)).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50">
                    {step === 1 ? (
                        <>
                            <button
                                onClick={onClose}
                                className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-200/50 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleNext}
                                disabled={!physicalCount}
                                className="px-5 py-2.5 text-sm font-bold text-white bg-brand-green hover:bg-green-600 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Summary Review
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => setStep(1)}
                                className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-200/50 rounded-xl transition-colors"
                                disabled={loading}
                            >
                                Back
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="px-5 py-2.5 text-sm font-bold text-white bg-brand-green hover:bg-green-600 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                            >
                                {loading ? 'Processing...' : 'Confirm & Close Books'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CloseBalanceModal;
