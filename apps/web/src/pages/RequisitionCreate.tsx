import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Sparkles, Loader2, ChevronDown, ChevronUp, CheckCircle, XCircle } from 'lucide-react';
import { requisitionService } from '../services/requisition.service';
import { accountService, Account } from '../services/account.service';
import { useEffect } from 'react';

interface LineItem {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    estimated_amount: number;
    account_id: string;
}

export const RequisitionCreate: React.FC = () => {
    const navigate = useNavigate();
    const [description, setDescription] = useState('');
    const [department, setDepartment] = useState('');
    const DEPARTMENTS = [
        'Finance', 'Admin', 'HR', 'IT',
        'Education', 'Transportation', 'Stocks',
        'Maintenance', 'Catering'
    ];
    const [lineItems, setLineItems] = useState<LineItem[]>([
        { id: '1', description: '', quantity: 1, unit_price: 0, estimated_amount: 0, account_id: '' },
    ]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(false);
    const [batchSuggesting, setBatchSuggesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    interface AiFeedbackResult {
        description: string;
        account?: string;
        reasoning: string;
        method?: string;
        confidence?: number;
        success: boolean;
    }
    const [aiFeedback, setAiFeedback] = useState<{ show: boolean; expanded: boolean; results: AiFeedbackResult[] }>({ show: false, expanded: false, results: [] });

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const data = await accountService.getAll();
                setAccounts(data);
            } catch (err) {
                console.error('Failed to fetch accounts', err);
            }
        };
        fetchAccounts();
    }, []);

    const addLineItem = () => {
        const newItem: LineItem = {
            id: Date.now().toString(),
            description: '',
            quantity: 1,
            unit_price: 0,
            estimated_amount: 0,
            account_id: '',
        };
        setLineItems([...lineItems, newItem]);
    };

    const removeLineItem = (id: string) => {
        setLineItems(lineItems.filter((item) => item.id !== id));
    };

    const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
        setLineItems(
            lineItems.map((item) => {
                if (item.id === id) {
                    const updated = { ...item, [field]: value };
                    if (field === 'quantity' || field === 'unit_price') {
                        const qty = field === 'quantity' ? Number(value) : Number(updated.quantity);
                        const price = field === 'unit_price' ? Number(value) : Number(updated.unit_price);
                        updated.estimated_amount = qty * price;
                    }
                    return updated;
                }
                return item;
            })
        );
    };

    const getEstimatedTotal = () => {
        return lineItems.reduce((sum, item) => sum + Number(item.estimated_amount), 0);
    };

    const [suggesting, setSuggesting] = useState<string | null>(null);

    const handleAiSuggest = async (itemId: string, description: string, amount: number) => {
        if (!description) return;
        setSuggesting(itemId);
        try {
            const suggestion = await accountService.suggestAccount(description, amount);
            if (suggestion && suggestion.account_code) {
                const targetCode = String(suggestion.account_code).trim().toLowerCase();
                const matchedAccount = accounts.find(a =>
                    String(a.code).trim().toLowerCase() === targetCode
                );

                let success = false;
                let reasoning = suggestion.reasoning;

                if (matchedAccount) {
                    updateLineItem(itemId, 'account_id', matchedAccount.id);
                    success = true;
                    reasoning = suggestion.reasoning || `Matched via ${suggestion.method}`;
                } else {
                    reasoning = `Suggested code "${suggestion.account_code}" not found in active accounts.`;
                }

                // Update feedback panel for individual suggestion
                setAiFeedback(prev => ({
                    show: true,
                    expanded: true,
                    results: [
                        {
                            description,
                            account: matchedAccount ? `${matchedAccount.code} - ${matchedAccount.name}` : suggestion.account_code,
                            reasoning: reasoning,
                            method: suggestion.method || 'AI',
                            confidence: suggestion.confidence,
                            success
                        },
                        ...prev.results.filter(r => r.description !== description).slice(0, 4) // Show last 5
                    ]
                }));
            }
        } catch (err) {
            console.error('AI Suggestion failed', err);
            setAiFeedback(prev => ({
                show: true,
                expanded: true,
                results: [
                    { description, reasoning: 'AI suggestion failed. Please try again.', success: false },
                    ...prev.results
                ]
            }));
        } finally {
            setSuggesting(null);
        }
    };

    const handleBatchAiSuggest = async () => {
        if (lineItems.every(it => !it.description)) {
            setAiFeedback({ show: true, expanded: true, results: [{ description: 'Error', reasoning: 'Please add descriptions to your line items first.', success: false }] });
            return;
        }

        setBatchSuggesting(true);
        setAiFeedback({ show: false, expanded: false, results: [] });

        try {
            const data = await accountService.suggestBatch(lineItems);
            const suggestions = data.results;

            let matches = 0;
            const newLineItems = [...lineItems];
            const feedbackResults: AiFeedbackResult[] = [];

            suggestions.forEach((itemRes: any, index: number) => {
                const itemDescription = lineItems[index]?.description || `Item ${index + 1}`;

                if (itemRes.account_code) {
                    const targetCode = String(itemRes.account_code).trim().toLowerCase();
                    const matchedAccount = accounts.find(a =>
                        String(a.code).trim().toLowerCase() === targetCode
                    );

                    if (matchedAccount) {
                        newLineItems[index] = {
                            ...newLineItems[index],
                            account_id: matchedAccount.id
                        };
                        matches++;
                        feedbackResults.push({
                            description: itemDescription,
                            account: `${matchedAccount.code} - ${matchedAccount.name}`,
                            reasoning: itemRes.reasoning || `Matched via ${itemRes.method}`,
                            method: itemRes.method,
                            confidence: itemRes.confidence,
                            success: true
                        });
                    } else {
                        feedbackResults.push({
                            description: itemDescription,
                            account: itemRes.account_code,
                            reasoning: `Suggested code ${itemRes.account_code} not found in active accounts`,
                            method: itemRes.method,
                            confidence: itemRes.confidence,
                            success: false
                        });
                    }
                } else {
                    feedbackResults.push({
                        description: itemDescription,
                        reasoning: itemRes.reasoning || 'No confident match found',
                        method: itemRes.method,
                        confidence: itemRes.confidence,
                        success: false
                    });
                }
            });

            setLineItems(newLineItems);
            setAiFeedback({
                show: true,
                expanded: true,
                results: feedbackResults
            });
        } catch (err) {
            console.error('Batch AI Suggestion failed', err);
            setAiFeedback({
                show: true,
                expanded: true,
                results: [{ description: 'Error', reasoning: 'Batch AI suggestion failed. Please try individually or select manually.', success: false }]
            });
        } finally {
            setBatchSuggesting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            await requisitionService.create({
                description,
                department,
                estimated_total: getEstimatedTotal(),
                items: lineItems.map(({ id, ...item }) => item), // Remove the temporary ID
            });
            navigate('/requisitions');
        } catch (err) {
            setError('Failed to create requisition. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold text-gray-900">New Requisition</h1>

                <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-red-800">{error}</p>
                        </div>
                    )}

                    {/* AI Feedback Panel */}
                    {aiFeedback.show && (
                        <div className="border border-amber-200 rounded-lg bg-amber-50 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setAiFeedback(prev => ({ ...prev, expanded: !prev.expanded }))}
                                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-100 transition-colors"
                            >
                                <div className="flex items-center space-x-2">
                                    <Sparkles className="h-5 w-5 text-amber-600" />
                                    <span className="font-medium text-amber-800">
                                        AI Classification Results
                                    </span>
                                    <span className="text-sm text-amber-600">
                                        ({aiFeedback.results.filter(r => r.success).length}/{aiFeedback.results.length} matched)
                                    </span>
                                </div>
                                {aiFeedback.expanded ? (
                                    <ChevronUp className="h-5 w-5 text-amber-600" />
                                ) : (
                                    <ChevronDown className="h-5 w-5 text-amber-600" />
                                )}
                            </button>

                            {aiFeedback.expanded && (
                                <div className="border-t border-amber-200 divide-y divide-amber-100">
                                    {aiFeedback.results.map((result, idx) => (
                                        <div key={idx} className="px-4 py-3 bg-white">
                                            <div className="flex items-start space-x-3">
                                                {result.success ? (
                                                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                                                ) : (
                                                    <XCircle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">
                                                        {result.description}
                                                    </p>
                                                    {result.account && (
                                                        <p className="text-sm text-indigo-600 font-medium">
                                                            → {result.account}
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        {result.reasoning}
                                                    </p>
                                                    <div className="flex items-center space-x-2 mt-1">
                                                        {result.method && (
                                                            <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${result.method === 'RULE'
                                                                ? 'bg-blue-100 text-blue-700'
                                                                : result.method === 'AI' || result.method === 'AI-GEMINI'
                                                                    ? 'bg-purple-100 text-purple-700'
                                                                    : 'bg-gray-100 text-gray-600'
                                                                }`}>
                                                                {result.method}
                                                            </span>
                                                        )}
                                                        {result.confidence !== undefined && result.confidence > 0 && (
                                                            <span className={`text-xs font-medium ${result.confidence > 0.8 ? 'text-green-600' : result.confidence > 0.5 ? 'text-amber-600' : 'text-gray-500'}`}>
                                                                {Math.round(result.confidence * 100)}% confidence
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Department */}
                    <div>
                        <label htmlFor="department" className="block text-sm font-medium text-gray-700">
                            Department
                        </label>
                        <select
                            id="department"
                            value={department}
                            onChange={(e) => setDepartment(e.target.value)}
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                        >
                            <option value="">Select a Department</option>
                            {DEPARTMENTS.map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>
                    </div>

                    {/* Description */}
                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                            Description
                        </label>
                        <input
                            type="text"
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                            placeholder="Enter requisition description"
                        />
                    </div>

                    {/* Line Items */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <label className="block text-sm font-medium text-gray-700">Line Items</label>
                            <div className="flex items-center space-x-2">
                                <button
                                    type="button"
                                    onClick={handleBatchAiSuggest}
                                    disabled={batchSuggesting}
                                    className="flex items-center px-3 py-1 text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-md hover:bg-amber-100 disabled:opacity-50"
                                >
                                    {batchSuggesting ? (
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-4 w-4 mr-1" />
                                    )}
                                    Auto-set Accounts
                                </button>
                                <button
                                    type="button"
                                    onClick={addLineItem}
                                    className="flex items-center px-3 py-1 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                                >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Add Item
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {lineItems.map((item) => (
                                <div key={item.id} className="grid grid-cols-12 gap-4 items-end">
                                    <div className="col-span-3">
                                        <label className="block text-xs text-gray-600">Description</label>
                                        <input
                                            type="text"
                                            value={item.description}
                                            onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                                            required
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                                        />
                                    </div>
                                    <div className="col-span-3">
                                        <label className="block text-xs text-gray-600">Account</label>
                                        <select
                                            value={item.account_id}
                                            onChange={(e) => updateLineItem(item.id, 'account_id', e.target.value)}
                                            required
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                                        >
                                            <option value="">Select Account</option>
                                            {accounts.map((acc) => (
                                                <option key={acc.id} value={acc.id}>
                                                    {acc.code} - {acc.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-span-1 flex items-end pb-2">
                                        <button
                                            type="button"
                                            onClick={() => handleAiSuggest(item.id, item.description, item.estimated_amount)}
                                            disabled={!item.description || suggesting === item.id}
                                            className="p-2 text-indigo-600 hover:text-indigo-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Auto-categorize with AI"
                                        >
                                            {suggesting === item.id ? (
                                                <Loader2 className="h-5 w-5 animate-spin" />
                                            ) : (
                                                <Sparkles className="h-5 w-5" />
                                            )}
                                        </button>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs text-gray-600">Quantity</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={item.quantity}
                                            onChange={(e) => updateLineItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                                            required
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs text-gray-600">Unit Price</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={item.unit_price}
                                            onChange={(e) =>
                                                updateLineItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)
                                            }
                                            required
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs text-gray-600">Total</label>
                                        <input
                                            type="text"
                                            value={`$${item.estimated_amount.toFixed(2)}`}
                                            disabled
                                            className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 sm:text-sm px-3 py-2 border"
                                        />
                                    </div>
                                    <div className="col-span-1">
                                        {lineItems.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeLineItem(item.id)}
                                                className="p-2 text-red-600 hover:text-red-900"
                                            >
                                                <Trash2 className="h-5 w-5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Estimated Total */}
                    <div className="border-t pt-4">
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-semibold text-gray-900">Estimated Total:</span>
                            <span className="text-2xl font-bold text-indigo-600">
                                ${getEstimatedTotal().toFixed(2)}
                            </span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={() => navigate('/requisitions')}
                            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Submitting...' : 'Submit Requisition'}
                        </button>
                    </div>
                </form>
            </div >
        </Layout >
    );
};
