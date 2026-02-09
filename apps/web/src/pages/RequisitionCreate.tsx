import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
    const [searchParams] = useSearchParams();
    const reqType = (searchParams.get('type') || 'EXPENSE').toUpperCase();

    const [description, setDescription] = useState('');
    const [department, setDepartment] = useState('');

    // Loan & Advance specific fields
    const [staffName, setStaffName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [amount, setAmount] = useState<number>(0);
    const [repaymentPeriod, setRepaymentPeriod] = useState<number>(1);

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
            const payload: any = {
                description: reqType === 'EXPENSE' ? description : `${reqType}: ${staffName} - ${description || (reqType === 'LOAN' ? 'Staff Loan' : 'Salary Advance')}`,
                department,
                type: reqType,
                estimated_total: reqType === 'EXPENSE' ? getEstimatedTotal() : Number(amount),
            };

            if (reqType === 'EXPENSE') {
                payload.items = lineItems.map(({ id, ...item }) => item);
            } else {
                payload.staff_name = staffName;
                payload.employee_id = employeeId;

                if (reqType === 'LOAN') {
                    payload.loan_amount = Number(amount);
                    payload.repayment_period = Number(repaymentPeriod);
                    payload.interest_rate = 15;
                    payload.monthly_deduction = (Number(amount) * 1.15) / Number(repaymentPeriod);
                } else if (reqType === 'ADVANCE') {
                    payload.loan_amount = Number(amount);
                }
            }

            await requisitionService.create(payload);
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
                <h1 className="text-2xl font-bold text-gray-900">
                    {reqType === 'LOAN' ? 'New Staff Loan' : reqType === 'ADVANCE' ? 'New Salary Advance' : 'New Requisition'}
                </h1>

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

                    {/* Common Fields: Department */}
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

                    {reqType === 'EXPENSE' ? (
                        <>
                            {/* Description */}
                            <div>
                                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                                    General Description
                                </label>
                                <textarea
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={3}
                                    placeholder="Briefly describe the purpose of this requisition..."
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                                />
                            </div>

                            {/* Line Items Table */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-medium text-gray-900">Line Items</h3>
                                    <button
                                        type="button"
                                        onClick={handleBatchAiSuggest}
                                        disabled={batchSuggesting || lineItems.length === 0}
                                        className="inline-flex items-center px-3 py-1.5 border border-amber-300 shadow-sm text-sm font-medium rounded-md text-amber-700 bg-amber-50 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-colors disabled:opacity-50"
                                    >
                                        {batchSuggesting ? (
                                            <>
                                                <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                                                Analyzing...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="-ml-1 mr-2 h-4 w-4" />
                                                Auto-Classify All
                                            </>
                                        )}
                                    </button>
                                </div>

                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Qty</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Price</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Amount</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-48">Account</th>
                                                <th className="px-4 py-3 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {lineItems.map((item) => (
                                                <tr key={item.id}>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center space-x-1">
                                                            <input
                                                                type="text"
                                                                value={item.description}
                                                                onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                                                                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border p-1"
                                                                placeholder="Item name"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleAiSuggest(item.id, item.description, item.estimated_amount)}
                                                                disabled={suggesting === item.id || !item.description}
                                                                className="p-1.5 text-amber-500 hover:text-amber-600 transition-colors disabled:opacity-30"
                                                                title="AI Categorize"
                                                            >
                                                                {suggesting === item.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <Sparkles className="h-4 w-4" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={(e) => updateLineItem(item.id, 'quantity', e.target.value)}
                                                            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border p-1"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.unit_price}
                                                            onChange={(e) => updateLineItem(item.id, 'unit_price', e.target.value)}
                                                            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border p-1"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                                                        K{item.estimated_amount.toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <select
                                                            value={item.account_id}
                                                            onChange={(e) => updateLineItem(item.id, 'account_id', e.target.value)}
                                                            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border p-1"
                                                        >
                                                            <option value="">Select Account</option>
                                                            {accounts.map((acc) => (
                                                                <option key={acc.id} value={acc.id}>
                                                                    {acc.code} - {acc.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => removeLineItem(item.id)}
                                                            className="text-red-400 hover:text-red-600"
                                                        >
                                                            <Trash2 className="h-5 w-5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-gray-50">
                                            <tr>
                                                <td colSpan={3} className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                                                    Total Estimated:
                                                </td>
                                                <td className="px-4 py-3 text-sm font-bold text-indigo-600">
                                                    K{getEstimatedTotal().toLocaleString()}
                                                </td>
                                                <td colSpan={2}></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                <button
                                    type="button"
                                    onClick={addLineItem}
                                    className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                >
                                    <Plus className="-ml-1 mr-2 h-5 w-5" />
                                    Add Item
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="col-span-1 md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">Staff Member Name</label>
                                <input
                                    type="text"
                                    required
                                    value={staffName}
                                    onChange={(e) => setStaffName(e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                                    placeholder="Enter full name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Employee ID</label>
                                <input
                                    type="text"
                                    required
                                    value={employeeId}
                                    onChange={(e) => setEmployeeId(e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                                    placeholder="EMP-001"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    {reqType === 'LOAN' ? 'Loan Amount' : 'Advance Amount'}
                                </label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <span className="text-gray-500 sm:text-sm">K</span>
                                    </div>
                                    <input
                                        type="number"
                                        required
                                        value={amount || ''}
                                        onChange={(e) => setAmount(Number(e.target.value))}
                                        className="block w-full pl-7 rounded-md border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            {reqType === 'LOAN' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Repayment Period (Months)</label>
                                        <select
                                            value={repaymentPeriod}
                                            onChange={(e) => setRepaymentPeriod(Number(e.target.value))}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                                        >
                                            {[1, 2, 3, 4, 5, 6, 12, 18, 24].map(m => (
                                                <option key={m} value={m}>{m} {m === 1 ? 'Month' : 'Months'}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-span-1 md:col-span-2 bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider">Estimated Deduction</p>
                                                <p className="text-2xl font-black text-indigo-900">
                                                    K{((amount * 1.15) / repaymentPeriod).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    <span className="text-sm font-normal text-indigo-500 ml-1">/ month</span>
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider">Total Repayment</p>
                                                <p className="text-lg font-bold text-indigo-800">
                                                    K{(amount * 1.15).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </p>
                                                <p className="text-[10px] text-indigo-400">Includes 15% Interest</p>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                            <div className="col-span-1 md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">Additional Remarks</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={2}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                                    placeholder="Optional details..."
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end space-x-3 pt-6 border-t font-semibold">
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
                            className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                        >
                            {loading ? 'Submitting...' : 'Submit Requisition'}
                        </button>
                    </div>
                </form>
            </div>
        </Layout>
    );
};
