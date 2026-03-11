import React, { useState } from 'react';
import { Modal } from './Modal';
import { budgetService } from '../services/budget.service';
import { Loader2, DollarSign, Save } from 'lucide-react';

interface BudgetModalProps {
    isOpen: boolean;
    onClose: () => void;
    accountId: string;
    accountName: string;
    currentPeriod: {
        start: string;
        end: string;
        type: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
        label: string;
    };
    existingAmount?: number;
    onSuccess: () => void;
}

export const BudgetModal: React.FC<BudgetModalProps> = ({
    isOpen,
    onClose,
    accountId,
    accountName,
    currentPeriod,
    existingAmount,
    onSuccess
}) => {
    const [amount, setAmount] = useState<string>(existingAmount ? existingAmount.toString() : '');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount < 0) {
            setError('Please enter a valid positive amount.');
            setSubmitting(false);
            return;
        }

        try {
            await budgetService.setBudget({
                qb_account_id: accountId,
                qb_account_name: accountName,
                amount: numAmount,
                period_type: currentPeriod.type,
                start_date: currentPeriod.start,
                end_date: currentPeriod.end
            });
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save budget target');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Set Budget Target">
            <div className="space-y-6">
                <div className="bg-brand-navy/5 p-4 rounded-xl">
                    <h3 className="text-sm font-bold text-brand-navy mb-1">{accountName}</h3>
                    <p className="text-xs text-gray-500">
                        Setting target for <span className="font-semibold text-brand-green">{currentPeriod.label}</span>
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm border border-red-100">
                        <p className="font-bold mb-1">Error</p>
                        <p className="opacity-90">{error}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Target Amount (K)</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <DollarSign className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-brand-green focus:border-brand-green bg-gray-50/50 hover:bg-white transition-colors"
                                placeholder="0.00"
                                required
                            />
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-bold text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex-1 inline-flex justify-center items-center px-4 py-3 border border-transparent text-sm font-bold rounded-xl text-white bg-brand-green hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition-all disabled:opacity-50"
                        >
                            {submitting ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <>
                                    <Save className="h-4 w-4 mr-2" />
                                    Save Target
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );
};
