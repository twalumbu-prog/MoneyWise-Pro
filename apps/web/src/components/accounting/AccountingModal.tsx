import React, { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { integrationService } from '../../services/integration.service';
import { voucherService } from '../../services/voucher.service';
import { accountService } from '../../services/account.service';
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
    const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [selectedPaymentAccount, setSelectedPaymentAccount] = useState<{ id: string, name: string }>({ id: '', name: '' });
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
            const qbAccounts = await integrationService.getAccounts();

            const expenses = qbAccounts.filter((a: any) =>
                ['Expense', 'Other Expense', 'Cost of Goods Sold'].includes(a.AccountType) ||
                a.Classification === 'Expense'
            );

            const banks = qbAccounts.filter((a: any) =>
                a.AccountType === 'Bank' || a.AccountType === 'Credit Card'
            );

            setExpenseAccounts(expenses);
            setBankAccounts(banks);

            // Default to first bank account if available
            if (banks.length > 0) {
                // Try to find "Petty Cash" or "Bank" as preferred defaults
                const defaultAcc = banks.find((b: any) =>
                    b.Name.toLowerCase().includes('petty') ||
                    b.Name.toLowerCase().includes('cash')
                ) || banks[0];
                setSelectedPaymentAccount({ id: defaultAcc.Id, name: defaultAcc.Name });
            }

            // Initialize items
            const requisitionItems = requisition.items || [];
            setItems(requisitionItems.map((item: any) => ({
                id: item.id,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: Number(item.quantity || 0) * Number(item.unit_price || 0),
                qb_account_id: item.qb_account_id || '',
                qb_account_name: item.qb_account_name || ''
            })));

        } catch (err: any) {
            console.error('Failed to load accounting data', err);
            setError('Failed to load accounts');
        } finally {
            setLoading(false);
        }
    };

    const [classifyStatus, setClassifyStatus] = useState<string | null>(null);

    const handleAutoClassify = async () => {
        setClassifying(true);
        setError(null);
        setClassifyStatus('Starting AI classification...');
        try {
            console.log('[AccountingModal] handleAutoClassify: Starting classification for', items.length, 'items.');

            // Step 1: Prepare items
            setClassifyStatus('Preparing items for AI...');
            const preparedItems = items.map(i => ({ id: i.id, description: i.description, amount: i.total }));
            console.log('[AccountingModal] Prepared items:', preparedItems);

            // Step 2: Call the real AI suggestion service
            setClassifyStatus(`Sending request to AI service with ${expenseAccounts.length} categories...`);
            console.log('[AccountingModal] Calling accountService.suggestBatch...');
            const start = Date.now();
            const response = await accountService.suggestBatch(
                preparedItems,
                requisition.id,
                expenseAccounts
            );
            console.log(`[AccountingModal] AI Response received in ${Date.now() - start}ms:`, response);

            // Step 3: Process results
            if (response && response.results) {
                setClassifyStatus(`Applying ${response.results.length} suggestions...`);
                console.log('[AccountingModal] Processing AI results:', response.results);
                console.log('[AccountingModal] Available Expense Accounts:', expenseAccounts.map(a => ({ id: a.Id || a.id, name: a.Name || a.name, code: a.AcctNum || a.code })));

                const updatedItems = items.map(item => {
                    const result = response.results.find((r: any) => String(r.item_id) === String(item.id));
                    console.log(`[AccountingModal] Mapping item "${item.description}" (ID: ${item.id}):`, result);

                    if (result && result.suggestion) {
                        // result.suggestion is the ID/Code returned by backend mapping
                        // Try matching by ID (preferred) or by Name/Code as fallback
                        const suggestionVal = String(result.suggestion).toLowerCase();

                        const match = expenseAccounts.find((a: any) =>
                            String(a.Id || a.id).toLowerCase() === suggestionVal ||
                            String(a.Name || a.name).toLowerCase() === suggestionVal ||
                            String(a.AcctNum || a.code).toLowerCase() === suggestionVal
                        );

                        if (match) {
                            const finalId = String(match.Id || match.id);
                            const finalName = match.Name || match.name;
                            console.log(`[AccountingModal] ✅ Match found for "${item.description}":`, finalName, `(ID: ${finalId})`);
                            return {
                                ...item,
                                qb_account_id: finalId,
                                qb_account_name: finalName
                            };
                        } else {
                            console.warn(`[AccountingModal] ⚠️ Suggestion "${result.suggestion}" for "${item.description}" not matched in expenseAccounts list.`);
                        }
                    } else if (result) {
                        // If backend returned account_code but no suggestion (ID)
                        if (result.account_code) {
                            const codeVal = String(result.account_code).toLowerCase();
                            const matchByCode = expenseAccounts.find((a: any) =>
                                String(a.AcctNum || a.code).toLowerCase() === codeVal ||
                                String(a.Name || a.name).toLowerCase() === codeVal
                            );

                            if (matchByCode) {
                                const finalId = String(matchByCode.Id || matchByCode.id);
                                console.log(`[AccountingModal] ✅ Match found via code "${result.account_code}" for "${item.description}":`, matchByCode.Name);
                                return {
                                    ...item,
                                    qb_account_id: finalId,
                                    qb_account_name: matchByCode.Name
                                };
                            }
                        }
                        console.log(`[AccountingModal] ℹ️ No match found for "${item.description}":`, result.reasoning || 'No suggestion/code');
                    } else {
                        console.warn(`[AccountingModal] ❓ No result found for item ID ${item.id}`);
                    }
                    return item;
                });

                console.log('[AccountingModal] Final updated items:', updatedItems);
                setItems(updatedItems);
                setClassifyStatus('Classification complete!');
                setTimeout(() => setClassifyStatus(null), 3000);
            } else {
                console.warn('[AccountingModal] AI Response returned no results.');
                setError('AI service returned no results. Check if API keys are configured.');
            }
        } catch (err: any) {
            console.error('[AccountingModal] ❌ AI Classify Error:', err);
            setError('AI Classification failed: ' + (err.message || 'Unknown error'));
            setClassifyStatus(null);
        } finally {
            setClassifying(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        if (!selectedPaymentAccount.id) {
            setError('Please select a payment account (Bank/Cash).');
            setSubmitting(false);
            return;
        }

        if (items.some(i => !i.qb_account_id)) {
            setError('All items must have an assigned QuickBooks expense account.');
            setSubmitting(false);
            return;
        }

        try {
            await voucherService.postVoucherWithClassification(
                requisition.id,
                items,
                selectedPaymentAccount
            );
            onSuccess();
            onClose();
        } catch (err: any) {
            const errorMsg = err.message || 'Unknown error';
            setError(errorMsg);
            console.error('[PostVoucher] Error details:', err);
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Post Voucher: ${requisition?.reference_number || 'New'}`}>
            <div className="space-y-6">
                <div className="bg-brand-green/10 p-4 rounded-xl text-brand-green text-sm flex items-start gap-3">
                    <div className="bg-brand-green text-white p-1 rounded-full mt-0.5">
                        <Loader2 className="h-3 w-3" />
                    </div>
                    <div>
                        <p className="font-bold">Sync to QuickBooks</p>
                        <p>Review classifications and select the funding account before completing the sync.</p>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm border border-red-100 animate-in fade-in slide-in-from-top-2">
                        <p className="font-bold mb-1">Error Syncing</p>
                        <p className="opacity-90">{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <Loader2 className="animate-spin h-10 w-10 text-brand-green" />
                        <p className="text-gray-500 text-sm animate-pulse">Fetching QuickBooks accounts...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Payment Source Selection */}
                        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 shadow-sm transition-all hover:bg-gray-100/50">
                            <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center justify-between">
                                Payment Source (Bank/Cash)
                                <span className="text-[10px] bg-brand-green/20 text-brand-green px-2 py-0.5 rounded-full uppercase">Required</span>
                            </label>
                            <select
                                value={selectedPaymentAccount.id}
                                onChange={(e) => {
                                    const acc = bankAccounts.find(a => a.Id === e.target.value);
                                    setSelectedPaymentAccount({ id: e.target.value, name: acc?.Name || '' });
                                }}
                                className="block w-full border-gray-200 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-3.5 bg-white transition-all outline-none"
                                required
                            >
                                <option value="">-- Select Bank/Cash Account --</option>
                                {bankAccounts.map(acc => (
                                    <option key={acc.Id} value={acc.Id}>
                                        {acc.Name} ({acc.AccountSubType || acc.AccountType})
                                    </option>
                                ))}
                            </select>
                            <p className="mt-2.5 text-[11px] text-gray-500 leading-relaxed italic">
                                This account in QuickBooks will be credited (reduced) to fund this expense.
                            </p>
                        </div>

                        {/* Line Items Classification */}
                        <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                            <label className="block text-sm font-bold text-gray-700 px-1">Item Classification</label>
                            {items.map((item, idx) => (
                                <div key={item.id || idx} className="p-4 border border-gray-100 rounded-2xl bg-white shadow-sm transition-all hover:shadow-md border-l-4 border-l-brand-green">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="max-w-[70%]">
                                            <span className="block font-semibold text-gray-900 leading-snug">{item.description}</span>
                                            <span className="text-xs text-brand-green font-medium">Qty: {item.quantity} × K{Number(item.unit_price).toLocaleString()}</span>
                                        </div>
                                        <span className="font-bold text-gray-900 bg-gray-50 px-3 py-1.5 rounded-lg text-sm">
                                            K{Number(item.total).toLocaleString()}
                                        </span>
                                    </div>

                                    <div className="relative group">
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Expense Account</label>
                                        <select
                                            value={item.qb_account_id}
                                            onChange={(e) => {
                                                const newItems = [...items];
                                                const selectedAcc = expenseAccounts.find((a: any) => a.Id === e.target.value);
                                                newItems[idx].qb_account_id = e.target.value;
                                                newItems[idx].qb_account_name = selectedAcc?.Name || '';
                                                setItems(newItems);
                                            }}
                                            className="block w-full border-gray-200 rounded-xl shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm p-3 bg-gray-50/50 group-hover:bg-white transition-all outline-none"
                                            required
                                        >
                                            <option value="">-- Select Category --</option>
                                            {expenseAccounts.map(acc => (
                                                <option key={acc.Id} value={acc.Id}>
                                                    {acc.Name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <div className="flex-1 flex flex-col gap-2">
                                {classifyStatus && (
                                    <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider animate-pulse ml-1">
                                        {classifyStatus}
                                    </p>
                                )}
                                <button
                                    type="button"
                                    onClick={handleAutoClassify}
                                    disabled={submitting || classifying}
                                    className="w-full inline-flex justify-center items-center px-4 py-3.5 border border-gray-100 shadow-sm text-sm font-bold rounded-2xl text-purple-600 bg-purple-50 hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all active:scale-95"
                                >
                                    {classifying ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <Wand2 className="h-4 w-4 mr-2" />
                                    )}
                                    AI Suggest
                                </button>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting || classifying}
                                className="flex-[2] inline-flex justify-center items-center px-4 py-3.5 border border-transparent shadow-xl text-sm font-bold rounded-2xl text-white bg-brand-green hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Syncing to QuickBooks...
                                    </>
                                ) : (
                                    <>
                                        Post & Complete
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

