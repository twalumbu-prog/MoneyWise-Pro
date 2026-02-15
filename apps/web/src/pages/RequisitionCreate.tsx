import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { requisitionService } from '../services/requisition.service';


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

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
                <h1 className="text-2xl font-bold text-brand-navy">
                    {reqType === 'LOAN' ? 'New Staff Loan' : reqType === 'ADVANCE' ? 'New Salary Advance' : 'New Requisition'}
                </h1>

                <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-red-800">{error}</p>
                        </div>
                    )}

                    {/* Common Fields: Department */}

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
                            className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:border-brand-green focus:ring-brand-green sm:text-sm px-4 py-2.5 border"
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
                                    className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:border-brand-green focus:ring-brand-green sm:text-sm px-4 py-2.5 border"
                                />
                            </div>

                            {/* Line Items Table */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-medium text-gray-900">Line Items</h3>
                                </div>

                                <div className="hidden md:block border border-gray-200 rounded-lg overflow-hidden">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Qty</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Price</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Amount</th>
                                                <th className="px-4 py-3 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {lineItems.map((item) => (
                                                <tr key={item.id}>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="text"
                                                            value={item.description}
                                                            onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                                                            className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm border p-2"
                                                            placeholder="Item name"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={(e) => updateLineItem(item.id, 'quantity', e.target.value)}
                                                            className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm border p-2"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.unit_price}
                                                            onChange={(e) => updateLineItem(item.id, 'unit_price', e.target.value)}
                                                            className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-brand-green focus:border-brand-green sm:text-sm border p-2"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                                                        K{item.estimated_amount.toLocaleString()}
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
                                                <td className="px-4 py-3 text-sm font-bold text-brand-green">
                                                    K{getEstimatedTotal().toLocaleString()}
                                                </td>
                                                <td colSpan={1}></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                {/* Mobile View (Card Layout) */}
                                <div className="md:hidden space-y-4">
                                    {lineItems.map((item) => (
                                        <div key={item.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200 relative">
                                            <button
                                                type="button"
                                                onClick={() => removeLineItem(item.id)}
                                                className="absolute top-2 right-2 text-red-400 hover:text-red-600 p-2"
                                            >
                                                <Trash2 className="h-5 w-5" />
                                            </button>

                                            <div className="space-y-3 pr-8">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Description</label>
                                                    <input
                                                        type="text"
                                                        value={item.description}
                                                        onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                                                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm p-2 border"
                                                        placeholder="Item name"
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Qty</label>
                                                        <input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={(e) => updateLineItem(item.id, 'quantity', e.target.value)}
                                                            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm p-2 border"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Price</label>
                                                        <input
                                                            type="number"
                                                            value={item.unit_price}
                                                            onChange={(e) => updateLineItem(item.id, 'unit_price', e.target.value)}
                                                            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm p-2 border"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex justify-between items-center pt-2 border-t border-gray-200 mt-2">
                                                    <span className="text-sm font-medium text-gray-500">Amount</span>
                                                    <span className="text-lg font-bold text-indigo-600">
                                                        K{item.estimated_amount.toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    <div className="bg-brand-gray rounded-lg p-4 flex justify-between items-center border border-gray-100">
                                        <span className="text-sm font-bold text-brand-navy">Total Estimated</span>
                                        <span className="text-xl font-black text-brand-green">
                                            K{getEstimatedTotal().toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={addLineItem}
                                    className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green"
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
                            className="px-6 py-2.5 bg-brand-green text-white font-bold rounded-xl hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-200 transition-all transform hover:-translate-y-0.5"
                        >
                            {loading ? 'Submitting...' : 'Submit Requisition'}
                        </button>
                    </div>
                </form>
            </div>
        </Layout>
    );
};
