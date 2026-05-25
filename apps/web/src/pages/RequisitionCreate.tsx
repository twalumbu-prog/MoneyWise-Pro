import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Plus, Trash2, AlertTriangle, Clock, Download, Edit3, Check, X, Loader2 } from 'lucide-react';
import { requisitionService } from '../services/requisition.service';
import { lencoService } from '../services/lenco.service';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

interface LineItem {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    estimated_amount: number;
    account_id: string;
    employee_id?: string;
    employee_name?: string;
    payment_method?: string;
    recipient_account?: string;
    recipient_bank_code?: string;
}

export const RequisitionCreate: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
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
    const [lineItems, setLineItems] = useState<LineItem[]>(
        reqType === 'PAYROLL' ? [] : [{ id: '1', description: '', quantity: 1, unit_price: 0, estimated_amount: 0, account_id: '' }]
    );

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeRequisitions, setActiveRequisitions] = useState<any[]>([]);

    const [banks, setBanks] = useState<any[]>([]);
    const [verificationResults, setVerificationResults] = useState<Record<string, { status: 'idle' | 'pending' | 'verified' | 'failed', resolvedName?: string, error?: string, provider?: string }>>({});
    const [isVerifying, setIsVerifying] = useState(false);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);

    // Inline edit states
    const [editEmpId, setEditEmpId] = useState('');
    const [editName, setEditName] = useState('');
    const [editMethod, setEditMethod] = useState('');
    const [editAccount, setEditAccount] = useState('');
    const [editBankCode, setEditBankCode] = useState('');
    const [editAmount, setEditAmount] = useState('');

    React.useEffect(() => {
        if (reqType === 'PAYROLL') {
            const fetchBanks = async () => {
                try {
                    const data = await lencoService.getBanks();
                    setBanks(Array.isArray(data) ? data : (data.data || []));
                } catch (err) {
                    console.error('Failed to load banks:', err);
                }
            };
            fetchBanks();
        }
    }, [reqType]);

    const findBankId = (bankString: string, bankList: any[]) => {
        const clean = String(bankString || '').trim().toLowerCase();
        if (!clean) return '';
        let match = bankList.find(b => String(b.code || '').toLowerCase() === clean || String(b.id || '').toLowerCase() === clean);
        if (match) return match.id || match.code;
        match = bankList.find(b => String(b.name || '').toLowerCase().includes(clean) || clean.includes(String(b.name || '').toLowerCase()));
        if (match) return match.id || match.code;
        return bankString;
    };

    const renderProviderSymbol = (provider: string, method: string) => {
        if (method === 'MOBILE_MONEY') {
            const lower = provider.toLowerCase();
            if (lower.includes('mtn')) {
                return (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        🟡 MTN
                    </span>
                );
            }
            if (lower.includes('airtel')) {
                return (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-600 border border-red-500/20">
                        🔴 Airtel
                    </span>
                );
            }
            return (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    🟢 {provider}
                </span>
            );
        } else {
            return (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20 max-w-[120px] truncate" title={provider}>
                    🏦 {provider || 'Bank'}
                </span>
            );
        }
    };

    const handleVerifyAll = async () => {
        if (lineItems.length === 0) return;
        setIsVerifying(true);
        setError(null);

        let currentBanks = banks;
        if (currentBanks.length === 0) {
            try {
                const data = await lencoService.getBanks();
                const fetchedBanks = Array.isArray(data) ? data : (data.data || []);
                setBanks(fetchedBanks);
                currentBanks = fetchedBanks;
            } catch (err) {
                console.error('Failed to fetch banks:', err);
            }
        }

        const orgId = (user as any)?.organization_id;

        const initialResults = { ...verificationResults };
        lineItems.forEach(item => {
            initialResults[item.id] = { status: 'pending' };
        });
        setVerificationResults(initialResults);

        const promises = lineItems.map(async (item) => {
            const method = item.payment_method;
            const account = item.recipient_account;
            const bankOrOp = item.recipient_bank_code;

            try {
                if (method === 'MOBILE_MONEY') {
                    const operator = String(bankOrOp || '').trim().toUpperCase();
                    let normOperator = '';
                    if (operator.includes('MTN')) normOperator = 'MTN';
                    else if (operator.includes('AIRTEL')) normOperator = 'AIRTEL';
                    else if (operator.includes('ZAMTEL')) normOperator = 'ZAMTEL';
                    else normOperator = operator;

                    if (!account || !normOperator) {
                        throw new Error('Phone number or operator is missing');
                    }

                    const res = await lencoService.resolveMobileMoney(account, normOperator, orgId);
                    const name = res.accountName || res.account_name || res.name || '';
                    return {
                        id: item.id,
                        status: 'verified' as const,
                        resolvedName: name,
                        provider: normOperator
                    };
                } else {
                    const bankId = findBankId(bankOrOp || '', currentBanks);
                    if (!account || !bankId) {
                        throw new Error('Account number or bank is missing');
                    }

                    const res = await lencoService.resolveBankAccount(account, bankId, orgId);
                    const name = res.accountName || res.account_name || res.name || '';
                    const matchedBank = currentBanks.find(b => b.id === bankId || b.code === bankId);
                    const providerLabel = matchedBank ? matchedBank.name : bankOrOp;

                    return {
                        id: item.id,
                        status: 'verified' as const,
                        resolvedName: name,
                        provider: providerLabel
                    };
                }
            } catch (err: any) {
                return {
                    id: item.id,
                    status: 'failed' as const,
                    error: err.message || 'Verification failed'
                };
            }
        });

        const resultsList = await Promise.all(promises);
        const nextResults = { ...verificationResults };
        resultsList.forEach(r => {
            nextResults[r.id] = {
                status: r.status,
                resolvedName: r.resolvedName,
                error: r.error,
                provider: r.provider
            };
        });
        setVerificationResults(nextResults);
        setIsVerifying(false);
    };

    const handleVerifySingle = async (itemId: string, updatedItem: any) => {
        let currentBanks = banks;
        if (currentBanks.length === 0) {
            try {
                const data = await lencoService.getBanks();
                const fetchedBanks = Array.isArray(data) ? data : (data.data || []);
                setBanks(fetchedBanks);
                currentBanks = fetchedBanks;
            } catch (err) {
                console.error('Failed to fetch banks:', err);
            }
        }

        const orgId = (user as any)?.organization_id;

        setVerificationResults(prev => ({
            ...prev,
            [itemId]: { status: 'pending' }
        }));

        const method = updatedItem.payment_method;
        const account = updatedItem.recipient_account;
        const bankOrOp = updatedItem.recipient_bank_code;

        try {
            if (method === 'MOBILE_MONEY') {
                const operator = String(bankOrOp || '').trim().toUpperCase();
                let normOperator = '';
                if (operator.includes('MTN')) normOperator = 'MTN';
                else if (operator.includes('AIRTEL')) normOperator = 'AIRTEL';
                else if (operator.includes('ZAMTEL')) normOperator = 'ZAMTEL';
                else normOperator = operator;

                if (!account || !normOperator) {
                    throw new Error('Phone number or operator is missing');
                }

                const res = await lencoService.resolveMobileMoney(account, normOperator, orgId);
                const name = res.accountName || res.account_name || res.name || '';
                setVerificationResults(prev => ({
                    ...prev,
                    [itemId]: {
                        status: 'verified',
                        resolvedName: name,
                        provider: normOperator
                    }
                }));
            } else {
                const bankId = findBankId(bankOrOp || '', currentBanks);
                if (!account || !bankId) {
                    throw new Error('Account number or bank is missing');
                }

                const res = await lencoService.resolveBankAccount(account, bankId, orgId);
                const name = res.accountName || res.account_name || res.name || '';
                const matchedBank = currentBanks.find(b => b.id === bankId || b.code === bankId);
                const providerLabel = matchedBank ? matchedBank.name : bankOrOp;

                setVerificationResults(prev => ({
                    ...prev,
                    [itemId]: {
                        status: 'verified',
                        resolvedName: name,
                        provider: providerLabel
                    }
                }));
            }
        } catch (err: any) {
            setVerificationResults(prev => ({
                ...prev,
                [itemId]: {
                    status: 'failed',
                    error: err.message || 'Verification failed'
                }
            }));
        }
    };

    React.useEffect(() => {
        // Redirect mobile users to the new wizard-based flow on the Inbox page
        if (window.innerWidth < 768) {
            navigate('/requisitions?new=true', { replace: true });
            return;
        }
        
        if (user?.id) {
            checkActiveRequisition();
        }
    }, [user?.id, navigate]);

    const checkActiveRequisition = async () => {
        try {
            const requisitions = await requisitionService.getAll();
            const blockingStatuses = ['DISBURSED', 'EXPENSED'];
            const blockingReqs = requisitions.filter((r: any) => {
                return blockingStatuses.includes(r.status) && String(r.requestor_id) === String(user?.id);
            });
            if (blockingReqs.length > 0) {
                setActiveRequisitions(blockingReqs);
            } else {
                setActiveRequisitions([]);
            }
        } catch (err) {
            console.error('Failed to check active requisitions:', err);
        }
    };

    const getActionText = (status: string) => {
        if (status === 'DISBURSED') return 'Acknowledge Receipt';
        if (status === 'RECEIVED') return 'Enter Expenses';
        return 'Reconcile Now';
    };

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
        setVerificationResults(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
        setLineItems(
            lineItems.map((item: LineItem) => {
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
        return lineItems.reduce((sum: number, item: LineItem) => sum + Number(item.estimated_amount), 0);
    };

    const isBlocked = activeRequisitions.length > 0;

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json<any>(worksheet);

                if (rows.length === 0) {
                    setError('The uploaded file is empty.');
                    return;
                }

                // Map headers flexibly
                const findValue = (row: any, keys: string[]) => {
                    const foundKey = Object.keys(row).find(k => 
                        keys.some(key => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(key.toLowerCase().replace(/[^a-z0-9]/g, '')))
                    );
                    return foundKey ? row[foundKey] : undefined;
                };

                const parsedItems = rows.map((row, index) => {
                    const employeeId = findValue(row, ['employeeid', 'empid', 'staffid', 'employee']) || '';
                    const employeeName = findValue(row, ['employeename', 'name', 'staffname', 'recipient']) || '';
                    let paymentMethod = String(findValue(row, ['paymentmethod', 'method', 'type']) || '').toUpperCase();
                    if (paymentMethod.includes('MOBILE') || paymentMethod.includes('MOMO') || paymentMethod.includes('PHONE')) {
                        paymentMethod = 'MOBILE_MONEY';
                    } else if (paymentMethod.includes('BANK') || paymentMethod.includes('TRANSFER')) {
                        paymentMethod = 'BANK';
                    } else {
                        paymentMethod = 'BANK';
                    }
                    const recipientAccount = String(findValue(row, ['accountnumber', 'account', 'phone', 'recipientaccount', 'number']) || '');
                    const recipientBankCode = String(findValue(row, ['bankcode', 'bank', 'operator', 'bankname']) || '');
                    const estimatedAmount = Number(findValue(row, ['amount', 'value', 'salary', 'payout']) || 0);

                    return {
                        id: String(index + 1),
                        description: `Payroll payout for ${employeeName || 'Employee'}`,
                        quantity: 1,
                        unit_price: estimatedAmount,
                        estimated_amount: estimatedAmount,
                        account_id: '',
                        employee_id: String(employeeId),
                        employee_name: String(employeeName),
                        payment_method: paymentMethod,
                        recipient_account: recipientAccount,
                        recipient_bank_code: recipientBankCode
                    };
                });

                const validItems = parsedItems.filter(item => item.employee_name || item.estimated_amount > 0);
                if (validItems.length === 0) {
                    setError('Could not find any valid employee payroll rows. Please check your columns (Employee ID, Employee Name, Payment Method, Account, Bank Code, Amount).');
                    return;
                }

                setLineItems(validItems);
                setVerificationResults({});
                if (!description) {
                    setDescription(`Payroll Processing - ${validItems.length} employees`);
                }
            } catch (err: any) {
                console.error(err);
                setError('Failed to parse the file. Please make sure it is a valid Excel or CSV file.');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        setLoading(true);
        setError(null);

        if (reqType === 'PAYROLL' && lineItems.length === 0) {
            setError('Please upload a payroll spreadsheet first.');
            setLoading(false);
            return;
        }

        try {
            const payload: any = {
                description: reqType === 'EXPENSE' || reqType === 'PAYROLL' ? description : `${reqType}: ${staffName} - ${description || (reqType === 'LOAN' ? 'Staff Loan' : 'Salary Advance')}`,
                department,
                type: reqType,
                estimated_total: reqType === 'EXPENSE' || reqType === 'PAYROLL' ? getEstimatedTotal() : Number(amount),
            };

            if (reqType === 'EXPENSE' || reqType === 'PAYROLL') {
                payload.items = lineItems.map(({ id, ...item }: LineItem) => item);
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
        } catch (err: any) {
            setError(err.message || 'Failed to create requisition. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const downloadPayrollTemplate = () => {
        const header = 'Employee ID,Employee Name,Payment Method,Account Number,Bank Code / Operator,Amount';
        const rows = [
            'EMP001,John Banda,BANK,0012345678901,ZAMBIA NATIONAL COMMERCIAL BANK,5500.00',
            'EMP002,Mary Phiri,MOBILE_MONEY,0977123456,MTN,4250.00',
            'EMP003,James Mwale,BANK,0098765432100,FIRST NATIONAL BANK ZAMBIA,5765.00',
        ];
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'payroll_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const allPayrollVerified = reqType !== 'PAYROLL' || (lineItems.length > 0 && lineItems.every(item => verificationResults[item.id]?.status === 'verified'));

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold text-brand-navy">
                    {reqType === 'LOAN' ? 'New Staff Loan' : reqType === 'ADVANCE' ? 'New Salary Advance' : reqType === 'PAYROLL' ? 'New Payroll Requisition' : 'New Requisition'}
                </h1>

                <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
                    {activeRequisitions.length > 0 && (
                        <div className="space-y-4">
                            {activeRequisitions.map((req: any) => (
                                <div key={req.id} className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-10">
                                        <Clock className="h-24 w-24 text-amber-600" />
                                    </div>
                                    <div className="relative z-10 flex items-start space-x-4">
                                        <div className="bg-amber-100 p-3 rounded-xl">
                                            <AlertTriangle className="h-6 w-6 text-amber-600" />
                                        </div>
                                        <div className="space-y-3 w-full">
                                            <div>
                                                <h3 className="text-lg font-black text-amber-900 uppercase tracking-tight">Accountability Safeguard Active</h3>
                                                <p className="text-amber-800 text-sm font-medium leading-relaxed">
                                                    You currently have an outstanding requisition that requires reconciliation. To maintain financial accountability, new requests are paused until your active cycle is completed.
                                                </p>
                                            </div>
                                            
                                            <div className="bg-white/60 rounded-xl p-4 border border-amber-100 flex flex-col sm:flex-row justify-between sm:items-center group gap-3">
                                                <div>
                                                    <p className="text-[10px] text-amber-600 font-black uppercase tracking-widest">Active Request</p>
                                                    <p className="text-sm font-bold text-brand-navy">#{req.id.slice(0, 8)} - {req.description}</p>
                                                    <div className="flex items-center mt-1">
                                                        <span className={`w-2 h-2 rounded-full mr-2 ${req.status === 'RECEIVED' ? 'bg-blue-500' : 'bg-amber-500 animate-pulse'}`} />
                                                        <span className={`text-xs font-bold uppercase tracking-wider ${req.status === 'RECEIVED' ? 'text-blue-700' : 'text-amber-700'}`}>{req.status}</span>
                                                    </div>
                                                </div>
                                                <Link 
                                                    to={`/requisitions?id=${req.id}`}
                                                    className="px-4 py-2 bg-amber-600 text-white text-xs font-black rounded-lg hover:bg-amber-700 transition-all flex justify-center items-center shadow-lg shadow-amber-100 whitespace-nowrap"
                                                >
                                                    {getActionText(req.status)}
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
                            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                            <p className="text-red-800 text-sm">{error}</p>
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

                    {reqType === 'EXPENSE' && (
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
                                            {lineItems.map((item: LineItem) => (
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
                                    {lineItems.map((item: LineItem) => (
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
                    )}

                    {reqType === 'PAYROLL' && (
                        <div className="space-y-6">
                            {/* File Upload Area */}
                            <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-brand-green transition-all bg-gray-50 flex flex-col items-center justify-center space-y-3 cursor-pointer relative">
                                <input
                                    type="file"
                                    accept=".csv, .xlsx, .xls"
                                    onChange={handleFileUpload}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                />
                                <div className="p-3 bg-brand-green/10 rounded-full text-brand-green">
                                    <Plus className="h-8 w-8" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-brand-navy">Upload employee payroll sheet</p>
                                    <p className="text-xs text-gray-500 mt-1">Supports Excel (.xlsx, .xls) and CSV files</p>
                                </div>
                            </div>

                            {/* Download Template Button */}
                            <button
                                type="button"
                                onClick={downloadPayrollTemplate}
                                className="flex items-center gap-2 text-xs font-semibold text-brand-green hover:text-emerald-700 transition-colors group"
                            >
                                <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                                    <Download size={13} className="text-emerald-600" />
                                </div>
                                Download CSV template
                            </button>

                            {/* Excel Template Guide */}
                            <div className="bg-brand-navy/5 rounded-xl p-4 border border-brand-navy/10 text-xs text-brand-navy space-y-2">
                                <p className="font-black uppercase tracking-wider text-[10px] tracking-widest text-brand-navy/80">Required Column Schema</p>
                                <p className="leading-relaxed">
                                    Your spreadsheet should contain columns matching: 
                                    <span className="font-bold"> Employee ID</span>, 
                                    <span className="font-bold"> Employee Name</span>, 
                                    <span className="font-bold"> Payment Method</span> (MOBILE_MONEY or BANK), 
                                    <span className="font-bold"> Account Details</span> (Phone/Account number), 
                                    <span className="font-bold"> Bank Code / Operator</span> (e.g. MTN, Airtel, or bank code), and 
                                    <span className="font-bold"> Amount</span>.
                                </p>
                            </div>

                            {/* Description */}
                            <div>
                                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                                    General Description / Memo
                                </label>
                                <textarea
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={2}
                                    placeholder="Briefly describe the purpose of this payroll..."
                                    className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:border-brand-green focus:ring-brand-green sm:text-sm px-4 py-2.5 border"
                                />
                            </div>

                            {/* Preview Table */}
                            {lineItems.length > 0 && lineItems[0].employee_name && (
                                <div className="space-y-4 animate-in fade-in duration-300">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-lg font-bold text-brand-navy">Payroll Sheet Preview ({lineItems.length} employees)</h3>
                                        <button
                                            type="button"
                                            onClick={handleVerifyAll}
                                            disabled={isVerifying}
                                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-100 transition-all"
                                        >
                                            {isVerifying ? (
                                                <>
                                                    <Loader2 size={12} className="animate-spin" />
                                                    <span>Verifying...</span>
                                                </>
                                            ) : (
                                                <span>Verify Accounts</span>
                                            )}
                                        </button>
                                    </div>
                                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                                        <table className="min-w-[850px] w-full divide-y divide-gray-200 text-sm table-fixed">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-[10%]">Emp ID</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-[15%]">Name</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-[12%]">Method</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-[15%]">Account</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-[13%]">Bank/Operator</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-[20%]">Lenco Verification</th>
                                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase w-[10%]">Amount</th>
                                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-[5%]">Edit</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {lineItems.map((item: any, idx: number) => {
                                                    const res = verificationResults[item.id];
                                                    const status = res?.status || 'idle';
                                                    const isEditing = editingItemId === item.id;

                                                    if (isEditing) {
                                                        return (
                                                            <tr key={item.id || idx} className="bg-emerald-50/5">
                                                                <td className="px-4 py-3"><input type="text" value={editEmpId} onChange={e => setEditEmpId(e.target.value)} className="w-full px-2 py-1 text-xs border rounded focus:border-emerald-500 focus:outline-none" /></td>
                                                                <td className="px-4 py-3"><input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-2 py-1 text-xs border rounded focus:border-emerald-500 focus:outline-none" /></td>
                                                                <td className="px-4 py-3">
                                                                    <select value={editMethod} onChange={e => { setEditMethod(e.target.value); setEditBankCode(''); }} className="w-full px-1 py-1 text-xs border rounded bg-white focus:border-emerald-500 focus:outline-none">
                                                                        <option value="BANK">Bank</option>
                                                                        <option value="MOBILE_MONEY">Mobile Money</option>
                                                                    </select>
                                                                </td>
                                                                <td className="px-4 py-3"><input type="text" value={editAccount} onChange={e => setEditAccount(e.target.value)} className="w-full px-2 py-1 text-xs border rounded focus:border-emerald-500 focus:outline-none" /></td>
                                                                <td className="px-4 py-3">
                                                                    {editMethod === 'MOBILE_MONEY' ? (
                                                                        <select value={editBankCode} onChange={e => setEditBankCode(e.target.value)} className="w-full px-1 py-1 text-xs border rounded bg-white focus:border-emerald-500 focus:outline-none">
                                                                            <option value="">Select Operator</option>
                                                                            <option value="MTN">MTN</option>
                                                                            <option value="AIRTEL">Airtel</option>
                                                                            <option value="ZAMTEL">Zamtel</option>
                                                                        </select>
                                                                    ) : (
                                                                        <select value={editBankCode} onChange={e => setEditBankCode(e.target.value)} className="w-full px-1 py-1 text-xs border rounded bg-white focus:border-emerald-500 focus:outline-none">
                                                                            <option value="">Select Bank</option>
                                                                            {banks.map(b => (
                                                                                <option key={b.id || b.code} value={b.id || b.code}>{b.name}</option>
                                                                            ))}
                                                                        </select>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 text-xs text-gray-400">Saving...</td>
                                                                <td className="px-4 py-3"><input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} className="w-full px-2 py-1 text-xs border rounded focus:border-emerald-500 focus:outline-none" /></td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <div className="flex justify-center gap-1">
                                                                        <button 
                                                                            type="button"
                                                                            onClick={async () => {
                                                                                const updated = {
                                                                                    ...item,
                                                                                    employee_id: editEmpId,
                                                                                    employee_name: editName,
                                                                                    payment_method: editMethod,
                                                                                    recipient_account: editAccount,
                                                                                    recipient_bank_code: editBankCode,
                                                                                    estimated_amount: Number(editAmount),
                                                                                    unit_price: Number(editAmount)
                                                                                };
                                                                                setLineItems(prev => prev.map(li => li.id === item.id ? updated : li));
                                                                                setEditingItemId(null);
                                                                                await handleVerifySingle(item.id, updated);
                                                                            }}
                                                                            disabled={!editName || !editAccount || !editBankCode || !editAmount}
                                                                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                                                        >
                                                                            <Check size={14} strokeWidth={2.5} />
                                                                        </button>
                                                                        <button 
                                                                            type="button" 
                                                                            onClick={() => setEditingItemId(null)}
                                                                            className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                                                        >
                                                                            <X size={14} strokeWidth={2.5} />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    }

                                                    return (
                                                        <tr key={item.id || idx} className={`hover:bg-gray-50/50 transition-colors ${
                                                            status === 'verified' 
                                                                ? 'bg-emerald-50/5' 
                                                                : status === 'failed' 
                                                                ? 'bg-red-50/5' 
                                                                : ''
                                                        }`}>
                                                            <td className="px-4 py-3 font-medium text-gray-900">{item.employee_id}</td>
                                                            <td className="px-4 py-3 text-gray-700">{item.employee_name}</td>
                                                            <td className="px-4 py-3">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.payment_method === 'MOBILE_MONEY' ? 'bg-amber-100 text-amber-850' : 'bg-blue-100 text-blue-850'}`}>
                                                                    {item.payment_method === 'MOBILE_MONEY' ? 'Mobile Money' : 'Bank'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-gray-600 font-mono">{item.recipient_account}</td>
                                                            <td className="px-4 py-3 text-gray-600">{item.recipient_bank_code || '-'}</td>
                                                            <td className="px-4 py-3">
                                                                {status === 'idle' && (
                                                                    <span className="text-xs text-gray-400 font-medium">Unverified</span>
                                                                )}
                                                                {status === 'pending' && (
                                                                    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                                                                        <Loader2 size={12} className="animate-spin text-[#006AFF]" />
                                                                        <span>Verifying...</span>
                                                                    </span>
                                                                )}
                                                                {status === 'verified' && (
                                                                    <div className="flex flex-col space-y-0.5">
                                                                        <span className="text-xs font-bold text-emerald-600 flex items-center gap-0.5">
                                                                            <span>{res.resolvedName}</span>
                                                                            <span className="font-bold">✓</span>
                                                                        </span>
                                                                        <span className="mt-0.5">
                                                                            {renderProviderSymbol(res.provider || item.recipient_bank_code || '', item.payment_method)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {status === 'failed' && (
                                                                    <span className="text-xs font-semibold text-rose-600" title={res.error}>
                                                                        ⚠️ {res.error || 'Failed'}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-bold text-brand-navy">K{Number(item.estimated_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                            <td className="px-4 py-3 text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditingItemId(item.id);
                                                                        setEditEmpId(item.employee_id || '');
                                                                        setEditName(item.employee_name || '');
                                                                        setEditMethod(item.payment_method || 'BANK');
                                                                        setEditAccount(item.recipient_account || '');
                                                                        setEditBankCode(item.recipient_bank_code || '');
                                                                        setEditAmount(String(item.estimated_amount || ''));
                                                                    }}
                                                                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                                                    title="Edit item details"
                                                                >
                                                                    <Edit3 size={13} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot className="bg-gray-50">
                                                <tr>
                                                    <td colSpan={6} className="px-4 py-3 text-sm font-bold text-brand-navy text-right">Total Payroll Sum:</td>
                                                    <td className="px-4 py-3 text-right font-black text-brand-green text-base">K{getEstimatedTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                    <td></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {(reqType === 'LOAN' || reqType === 'ADVANCE') && (
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
                            disabled={loading || isBlocked || !allPayrollVerified || isVerifying}
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
