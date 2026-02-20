import React, { useState } from 'react';
import { X, User, Phone, FileText, Wallet, CheckCircle, AlertCircle } from 'lucide-react';
import { cashbookService } from '../services/cashbook.service';
import { DenominationInput } from './DenominationInput';

interface CashInflowModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const CashInflowModal: React.FC<CashInflowModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [personName, setPersonName] = useState('');
    const [purpose, setPurpose] = useState('');
    const [contactDetails, setContactDetails] = useState('');
    const [denominations, setDenominations] = useState<any[]>([
        { value: 500, count: 0 }, { value: 200, count: 0 }, { value: 100, count: 0 }, { value: 50, count: 0 }, { value: 20, count: 0 }, { value: 10, count: 0 }, { value: 5, count: 0 }, { value: 2, count: 0 }, { value: 1, count: 0 }, { value: 0.50, count: 0 }
    ]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const totalAmount = denominations.reduce(
        (sum, d) => sum + d.value * d.count,
        0
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (totalAmount <= 0) {
            setError('Please enter denominations to specify the amount.');
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);
            await cashbookService.logInflow({
                personName,
                purpose,
                contactDetails,
                amount: totalAmount,
                denominations
            });
            onSuccess();
            onClose();
            // Reset form
            setPersonName('');
            setPurpose('');
            setContactDetails('');
            setDenominations([
                { value: 500, count: 0 }, { value: 200, count: 0 }, { value: 100, count: 0 }, { value: 50, count: 0 }, { value: 20, count: 0 }, { value: 10, count: 0 }, { value: 5, count: 0 }, { value: 2, count: 0 }, { value: 1, count: 0 }, { value: 0.50, count: 0 }
            ]);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to log cash inflow');
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
            <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 flex flex-col max-h-[90vh]">
                {/* Header - Fixed */}
                <div className="bg-emerald-600 px-8 py-6 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-white/20 rounded-xl">
                            <Wallet className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold leading-tight">Log Cash Inflow</h2>
                            <p className="text-emerald-100 text-xs">Record funds coming into the ledger</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
                    {/* Scrollable Content */}
                    <div className="p-8 overflow-y-auto custom-scrollbar">
                        {error && (
                            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center text-red-700 text-sm animate-in shake-1">
                                <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        <div className="space-y-6 mb-2">
                            {/* Source Details & Purpose */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
                                        Source Details
                                    </label>
                                    <div className="space-y-3">
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-emerald-500 transition-colors">
                                                <User size={18} />
                                            </div>
                                            <input
                                                type="text"
                                                required
                                                value={personName}
                                                onChange={(e) => setPersonName(e.target.value)}
                                                placeholder="Depositor Name"
                                                className="w-full pl-11 pr-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-emerald-500 focus:bg-white outline-none transition-all placeholder:text-gray-400"
                                            />
                                        </div>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-emerald-500 transition-colors">
                                                <Phone size={18} />
                                            </div>
                                            <input
                                                type="text"
                                                value={contactDetails}
                                                onChange={(e) => setContactDetails(e.target.value)}
                                                placeholder="Contact Details (Optional)"
                                                className="w-full pl-11 pr-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-emerald-500 focus:bg-white outline-none transition-all placeholder:text-gray-400"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
                                        Purpose
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute top-4 left-0 pl-4 flex items-start pointer-events-none text-gray-400 group-focus-within:text-emerald-500 transition-colors">
                                            <FileText size={18} />
                                        </div>
                                        <textarea
                                            required
                                            value={purpose}
                                            onChange={(e) => setPurpose(e.target.value)}
                                            placeholder="Reason for inflow..."
                                            rows={3}
                                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-emerald-500 focus:bg-white outline-none transition-all placeholder:text-gray-400 resize-none h-[92px]"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Denominations (Full Width Below) */}
                            <div className="bg-gray-50/50 rounded-3xl p-6 border-2 border-gray-100">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                                    Cash Denominations
                                </label>
                                <DenominationInput
                                    denominations={denominations}
                                    onChange={setDenominations}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions - Fixed */}
                    <div className="px-8 py-6 border-t border-gray-100 flex items-center justify-between shrink-0 bg-white">
                        <div className="flex flex-col">
                            <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Total Inflow Amount</span>
                            <span className="text-2xl font-black text-emerald-600">
                                K {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="flex space-x-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-2xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || totalAmount <= 0}
                                className="flex items-center px-8 py-3 bg-emerald-600 text-white rounded-2xl font-black shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
                            >
                                {isSubmitting ? (
                                    <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                                ) : (
                                    <CheckCircle className="h-5 w-5 mr-2" />
                                )}
                                Submit Inflow
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CashInflowModal;
