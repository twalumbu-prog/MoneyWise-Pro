import React, { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { integrationService } from '../../services/integration.service';
import { voucherService } from '../../services/voucher.service';
import { Loader2, Wand2, ArrowRight } from 'lucide-react';

interface AccountingModalProps {
    isOpen: boolean;
    onClose: () => void;
    requisition: any;
    onSuccess: () => void;
}

export const AccountingModal: React.FC<AccountingModalProps> = ({
    isOpen,
    onClose,
    requisition,
    onSuccess
}) => {
    const [items, setItems] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [classifying, setClassifying] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && requisition) {
            loadData();
        }
    }, [isOpen, requisition]);

    const loadData = async () => {
        try {
            setLoading(true);
            // Load QB Accounts and Requisition Items
            const [qbAccounts] = await Promise.all([
                integrationService.getAccounts(),
                // If requisition items aren't passed fully, fetch them. 
                // Assuming requisition prop has basic info, but we need line items.
                // For now, let's assume we derive items from the requisition line items
                // or fetch them if needed. Let's use what we have or fetch details.
                // Actually, let's fetch the full requisition details to be safe.
                // But wait, the parent might have passed it. Let's assume passed for now,
                // or we use the line_items from the prop if available.
                Promise.resolve(requisition.items || [])
            ]);

            setAccounts(qbAccounts.filter((a: any) =>
                ['Expense', 'Other Expense', 'Cost of Goods Sold'].includes(a.AccountType) ||
                a.Classification === 'Expense'
            ));

            // Initialize items with current data or empty defaults
            setItems(requisition.items.map((item: any) => ({
                id: item.id,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: item.quantity * item.unit_price,
                qb_account_id: item.qb_account_id || '', // QB Account ID (string)
                qb_account_name: item.qb_account_name || '' // QB Account Name
            })));

        } catch (err: any) {
            console.error('Failed to load accounting data', err);
            setError('Failed to load accounts');
        } finally {
            setLoading(false);
        }
    };

    const handleAutoClassify = async () => {
        setClassifying(true);
        try {
            // MOCK AI SERVICE CALL
            // In a real scenario, we'd send descriptions to an LLM to guess the account.
            // Here we'll just simulate a delay and random assignment for demo.
            await new Promise(resolve => setTimeout(resolve, 1500));

            const updatedItems = items.map(item => {
                // Simple keyword matching for "AI"
                const desc = item.description.toLowerCase();
                let match = accounts.find((a: any) => a.Name === 'Uncategorized Expense');

                if (desc.includes('meal') || desc.includes('food')) {
                    match = accounts.find((a: any) => a.Name.includes('Meals'));
                } else if (desc.includes('taxi') || desc.includes('travel') || desc.includes('fuel')) {
                    match = accounts.find((a: any) => a.Name.includes('Travel') || a.Name.includes('Fuel'));
                } else if (desc.includes('office') || desc.includes('paper')) {
                    match = accounts.find((a: any) => a.Name.includes('Office'));
                }

                return {
                    ...item,
                    qb_account_id: match ? match.Id : item.qb_account_id,
                    qb_account_name: match ? match.Name : item.qb_account_name
                };
            });

            setItems(updatedItems);

        } catch (err) {
            setError('AI Classification failed');
        } finally {
            setClassifying(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        // Validate
        if (items.some(i => !i.qb_account_id)) {
            setError('All items must have an assigned QuickBooks account.');
            setSubmitting(false);
            return;
        }

        try {
            await voucherService.postVoucherWithClassification(requisition.id, items);
            onSuccess();
            onClose();
        } catch (err: any) {
            // Show detailed error from backend if available
            const errorMsg = err.message || 'Unknown error';
            setError(errorMsg);
            console.error('[PostVoucher] Error details:', err);
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Post Voucher: ${requisition?.reference_number || 'New'}`}>
            <div className="space-y-6">
                <div className="bg-blue-50 p-4 rounded-xl text-blue-800 text-sm">
                    <p className="font-bold">Accounting & Classification</p>
                    <p>Review and categorize line items before posting to QuickBooks.</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="animate-spin h-8 w-8 text-brand-green" />
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                            {items.map((item, idx) => (
                                <div key={item.id || idx} className="p-4 border border-gray-200 rounded-xl bg-gray-50/50">
                                    <div className="flex justify-between mb-2">
                                        <span className="font-medium text-gray-900">{item.description}</span>
                                        <span className="font-bold text-gray-900">K{Number(item.total).toLocaleString()}</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Expense Account</label>
                                        <select
                                            value={item.qb_account_id}
                                            onChange={(e) => {
                                                const newItems = [...items];
                                                const selectedAcc = accounts.find((a: any) => a.Id === e.target.value);
                                                newItems[idx].qb_account_id = e.target.value;
                                                newItems[idx].qb_account_name = selectedAcc?.Name || '';
                                                setItems(newItems);
                                            }}
                                            className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-2.5"
                                            required
                                        >
                                            <option value="">-- Select Account --</option>
                                            {accounts.map(acc => (
                                                <option key={acc.Id} value={acc.Id}>
                                                    {acc.Name} ({acc.AccountType})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={handleAutoClassify}
                                disabled={submitting || classifying}
                                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-purple-200 shadow-sm text-sm font-medium rounded-xl text-purple-700 bg-purple-50 hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                            >
                                {classifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
                                AI Auto-Classify
                            </button>

                            <button
                                type="submit"
                                disabled={submitting || classifying}
                                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-bold rounded-xl text-white bg-brand-green hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Posting...
                                    </>
                                ) : (
                                    <>
                                        Post to QuickBooks
                                        <ArrowRight className="h-4 w-4 ml-2" />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </Modal>
    );
};
