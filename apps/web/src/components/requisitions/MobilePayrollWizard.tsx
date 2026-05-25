import React, { useState } from 'react';
import { ArrowRight, X, AlertCircle, Loader2, ChevronDown, Upload, FileText, CheckCircle, Download, Edit3 } from 'lucide-react';
import { requisitionService } from '../../services/requisition.service';
import { lencoService } from '../../services/lenco.service';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx';

interface MobilePayrollWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const DEPARTMENTS = ['Finance', 'Admin', 'HR', 'IT', 'Education', 'Transportation', 'Stocks', 'Maintenance', 'Catering'];

type Stage = 1 | 2 | 3;

export const MobilePayrollWizard: React.FC<MobilePayrollWizardProps> = ({ isOpen, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [stage, setStage] = useState<Stage>(1);
    const [department, setDepartment] = useState('');
    const [description, setDescription] = useState('');
    const [lineItems, setLineItems] = useState<any[]>([]);
    const [fileName, setFileName] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [banks, setBanks] = useState<any[]>([]);
    const [verificationResults, setVerificationResults] = useState<Record<string, { status: 'idle' | 'pending' | 'verified' | 'failed', resolvedName?: string, error?: string, provider?: string }>>({});
    const [isVerifying, setIsVerifying] = useState(false);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);

    // Inline edit states
    const [editName, setEditName] = useState('');
    const [editMethod, setEditMethod] = useState('');
    const [editAccount, setEditAccount] = useState('');
    const [editBankCode, setEditBankCode] = useState('');
    const [editAmount, setEditAmount] = useState('');

    const reset = () => {
        setStage(1);
        setDepartment('');
        setDescription('');
        setLineItems([]);
        setFileName(null);
        setError(null);
        setVerificationResults({});
        setEditingItemId(null);
    };

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
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20 max-w-[125px] truncate" title={provider}>
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
                    const bankId = findBankId(bankOrOp, currentBanks);
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
                const bankId = findBankId(bankOrOp, currentBanks);
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

    React.useEffect(() => {
        if (isOpen) {
            reset();
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
    }, [isOpen]);

    const handleClose = () => { reset(); onClose(); };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
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

    const getEstimatedTotal = () => {
        return lineItems.reduce((sum: number, item: any) => sum + Number(item.estimated_amount), 0);
    };

    const handleProceedToPreview = () => {
        if (!department) { setError('Please select a department.'); return; }
        if (lineItems.length === 0) { setError('Please upload a payroll file first.'); return; }
        setError(null);
        setStage(2);
    };

    const handleProceedToSummary = () => {
        if (!description.trim()) { setError('Please enter a description or memo.'); return; }
        
        // Ensure all items are verified successfully
        const allVerified = lineItems.every(item => verificationResults[item.id]?.status === 'verified');
        if (!allVerified) {
            setError('Please verify all employee accounts successfully before proceeding.');
            return;
        }

        setError(null);
        setStage(3);
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await requisitionService.create({
                description,
                department,
                type: 'PAYROLL',
                estimated_total: getEstimatedTotal(),
                items: lineItems.map(({ id, ...item }) => item)
            } as any);
            reset();
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] bg-white flex flex-col md:hidden">
            {/* App Top Bar */}
            <div className="h-16 bg-white border-b border-gray-100 px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center">
                    <span className="text-xl font-medium text-brand-navy tracking-tight">MoneyWise</span>
                    <span className="text-xl font-bold text-[#006AFF] ml-1 tracking-tight">Pro</span>
                </div>
            </div>

            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between shrink-0">
                <h1 className="text-[18px] font-bold text-brand-navy">New Payroll Requisition</h1>
                <button
                    onClick={handleClose}
                    className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-brand-navy shadow-[0_4px_12px_rgba(0,106,255,0.4)] active:scale-95 transition-all"
                >
                    <X size={16} strokeWidth={3} />
                </button>
            </div>

            {/* Progress */}
            <div className="px-6 pt-4 shrink-0">
                <div className="flex gap-2">
                    {([1, 2, 3] as Stage[]).map(s => (
                        <div key={s} className={`h-1 flex-1 rounded-full transition-all ${stage >= s ? 'bg-emerald-500' : 'bg-gray-100'}`} />
                    ))}
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                    Step {stage} of 3 — {stage === 1 ? 'Upload File' : stage === 2 ? 'Verify Employees' : 'Confirm & Submit'}
                </p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
                {error && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
                        <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-red-700 font-medium">{error}</p>
                    </div>
                )}

                {stage === 1 && (
                    <>
                        <div>
                            <h2 className="text-[20px] font-bold text-brand-navy">Upload Payroll</h2>
                            <p className="text-[13px] text-gray-400 mt-1">Select your department and upload your employee payroll sheet</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Department</label>
                                <div className="relative">
                                    <select
                                        value={department}
                                        onChange={e => setDepartment(e.target.value)}
                                        className="w-full appearance-none border border-gray-200 rounded-2xl px-4 py-3.5 text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                    >
                                        <option value="">Select Department</option>
                                        {DEPARTMENTS.map(d => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Payroll Spreadsheet</label>
                                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center bg-gray-50 flex flex-col items-center justify-center space-y-2 relative active:bg-gray-100/50 transition-all">
                                    <input
                                        type="file"
                                        accept=".csv, .xlsx, .xls"
                                        onChange={handleFileUpload}
                                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                    />
                                    <Upload size={24} className="text-emerald-500" />
                                    <div>
                                        <p className="text-xs font-bold text-brand-navy">{fileName || 'Choose CSV or Excel sheet'}</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">Max size 5MB</p>
                                    </div>
                                </div>
                            </div>

                            {/* Download Template */}
                            <button
                                type="button"
                                onClick={downloadPayrollTemplate}
                                className="flex items-center gap-2.5 text-[12px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors group"
                            >
                                <div className="w-7 h-7 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                                    <Download size={13} className="text-emerald-600" />
                                </div>
                                Download CSV template
                            </button>
                        </div>

                        {lineItems.length > 0 && (
                            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <FileText size={20} className="text-emerald-500" />
                                    <div>
                                        <p className="text-xs font-bold text-emerald-900">Parsed Payroll Successfully</p>
                                        <p className="text-[10px] text-emerald-600 font-medium">{lineItems.length} employees detected</p>
                                    </div>
                                </div>
                                <CheckCircle size={20} className="text-emerald-500" />
                            </div>
                        )}
                    </>
                )}

                {stage === 2 && (
                    <>
                        <div>
                            <h2 className="text-[20px] font-bold text-brand-navy">Verify Employees</h2>
                            <p className="text-[13px] text-gray-400 mt-1">Review employee payout details and verify accounts before proceeding.</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">General Memo / Description</label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    rows={2}
                                    placeholder="Enter details about this payroll run..."
                                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                            </div>


                            <div className="space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Employee List ({lineItems.length} items)</p>
                                <div className="space-y-3">
                                    {lineItems.map((item, idx) => {
                                        const res = verificationResults[item.id];
                                        const status = res?.status || 'idle';

                                        return (
                                            <div 
                                                key={item.id || idx} 
                                                className={`border rounded-2xl p-4 flex flex-col space-y-3 transition-all duration-300 bg-white ${
                                                    status === 'verified' 
                                                        ? 'border-emerald-200 bg-emerald-50/5' 
                                                        : status === 'failed' 
                                                        ? 'border-red-200 bg-red-50/5' 
                                                        : 'border-gray-100 bg-gray-50/50'
                                                }`}
                                            >
                                                {editingItemId === item.id ? (
                                                    <div className="space-y-3 w-full animate-in fade-in duration-300">
                                                        <div>
                                                            <label className="text-[9px] font-black uppercase text-gray-400 block mb-1">Employee Name</label>
                                                            <input 
                                                                type="text" 
                                                                value={editName}
                                                                onChange={e => setEditName(e.target.value)}
                                                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:border-emerald-500 focus:outline-none"
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div>
                                                                <label className="text-[9px] font-black uppercase text-gray-400 block mb-1">Method</label>
                                                                <select 
                                                                    value={editMethod}
                                                                    onChange={e => {
                                                                        setEditMethod(e.target.value);
                                                                        setEditBankCode('');
                                                                    }}
                                                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:border-emerald-500 focus:outline-none"
                                                                >
                                                                    <option value="BANK">Bank</option>
                                                                    <option value="MOBILE_MONEY">Mobile Money</option>
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="text-[9px] font-black uppercase text-gray-400 block mb-1">Bank / Operator</label>
                                                                {editMethod === 'MOBILE_MONEY' ? (
                                                                    <select
                                                                        value={editBankCode}
                                                                        onChange={e => setEditBankCode(e.target.value)}
                                                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:border-emerald-500 focus:outline-none"
                                                                    >
                                                                        <option value="">Select Operator</option>
                                                                        <option value="MTN">MTN</option>
                                                                        <option value="AIRTEL">Airtel</option>
                                                                        <option value="ZAMTEL">Zamtel</option>
                                                                    </select>
                                                                ) : (
                                                                    <select
                                                                        value={editBankCode}
                                                                        onChange={e => setEditBankCode(e.target.value)}
                                                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:border-emerald-500 focus:outline-none"
                                                                    >
                                                                        <option value="">Select Bank</option>
                                                                        {banks.map(b => (
                                                                            <option key={b.id || b.code} value={b.id || b.code}>{b.name}</option>
                                                                        ))}
                                                                    </select>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div>
                                                                <label className="text-[9px] font-black uppercase text-gray-400 block mb-1">Account / Phone</label>
                                                                <input 
                                                                    type="text" 
                                                                    value={editAccount}
                                                                    onChange={e => setEditAccount(e.target.value)}
                                                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:border-emerald-500 focus:outline-none"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[9px] font-black uppercase text-gray-400 block mb-1">Amount (K)</label>
                                                                <input 
                                                                    type="number" 
                                                                    value={editAmount}
                                                                    onChange={e => setEditAmount(e.target.value)}
                                                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:border-emerald-500 focus:outline-none"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-end gap-2 pt-1">
                                                            <button 
                                                                type="button"
                                                                onClick={() => setEditingItemId(null)}
                                                                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-500"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button 
                                                                type="button"
                                                                onClick={async () => {
                                                                    const updated = {
                                                                        ...item,
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
                                                                className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                                                            >
                                                                Save & Verify
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-between items-start">
                                                        <div className="space-y-1.5 flex-1 min-w-0 pr-2">
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-xs font-bold text-brand-navy truncate">{item.employee_name}</p>
                                                                {status === 'verified' && (
                                                                    <span className="text-[12px] font-bold text-emerald-600">✓</span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-gray-400 font-medium">#{item.employee_id} • {item.payment_method === 'MOBILE_MONEY' ? 'Mobile' : 'Bank'}</p>
                                                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500">
                                                                <span>{item.recipient_account}</span>
                                                                {item.recipient_bank_code && (
                                                                    <>
                                                                        <span className="text-gray-300">|</span>
                                                                        <span>{item.recipient_bank_code}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            
                                                            {status === 'pending' && (
                                                                <div className="flex items-center gap-1.5 text-[10px] text-gray-405 mt-1">
                                                                    <Loader2 size={10} className="animate-spin text-[#006AFF]" />
                                                                    <span>Verifying details...</span>
                                                                </div>
                                                            )}
                                                            {status === 'verified' && (
                                                                <div className="flex flex-col space-y-1 mt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                                                    <p className="text-xs font-bold text-emerald-600 leading-none">
                                                                        {res.resolvedName}
                                                                    </p>
                                                                    <div className="pt-0.5">
                                                                        {renderProviderSymbol(res.provider || item.recipient_bank_code || '', item.payment_method)}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {status === 'failed' && (
                                                                <p className="text-[10px] font-semibold text-rose-600 mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                                                    ⚠️ {res.error || 'Verification failed'}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center space-x-3 shrink-0">
                                                            <div className="text-right">
                                                                <p className="text-sm font-black text-brand-navy">K{Number(item.estimated_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setEditingItemId(item.id);
                                                                    setEditName(item.employee_name || '');
                                                                    setEditMethod(item.payment_method || 'BANK');
                                                                    setEditAccount(item.recipient_account || '');
                                                                    setEditBankCode(item.recipient_bank_code || '');
                                                                    setEditAmount(String(item.estimated_amount || ''));
                                                                }}
                                                                className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                                                                title="Edit details"
                                                            >
                                                                <Edit3 size={13} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {stage === 3 && (
                    <>
                        <div>
                            <h2 className="text-[20px] font-bold text-brand-navy">Confirm Requisition</h2>
                            <p className="text-[13px] text-gray-400 mt-1">Review the final payroll details and submit for approval</p>
                        </div>

                        <div className="bg-brand-navy/5 border border-brand-navy/10 rounded-2xl p-5 space-y-4">
                            {[
                                { label: 'Department', value: department },
                                { label: 'Description', value: description },
                                { label: 'Total Employees', value: lineItems.length },
                                { label: 'Total Payroll Amount', value: `K${getEstimatedTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
                            ].map(row => (
                                <div key={row.label} className="flex justify-between items-start gap-4">
                                    <span className="text-xs text-gray-500 font-medium whitespace-nowrap">{row.label}</span>
                                    <span className="text-sm font-bold text-brand-navy text-right break-words">{row.value}</span>
                                </div>
                            ))}
                        </div>

                        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-100">
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-2">Total Requisition Total</p>
                            <p className="text-3xl font-black">K{getEstimatedTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="w-full h-14 bg-emerald-500 rounded-2xl text-white font-black text-base shadow-lg shadow-emerald-100 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 mt-4"
                        >
                            {submitting ? <><Loader2 size={18} className="animate-spin" />Submitting...</> : 'Submit Payroll Requisition'}
                        </button>
                    </>
                )}
            </div>

            {stage < 3 && (
                <div className="shrink-0 p-6 pb-8 flex items-center justify-between">
                    {stage === 2 ? (
                        <div className="flex w-full items-center justify-between gap-4">
                            <button
                                type="button"
                                onClick={handleVerifyAll}
                                disabled={isVerifying || lineItems.length === 0}
                                className="flex-1 py-4 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 transition-all active:scale-[0.98]"
                            >
                                {isVerifying ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin text-white mr-2" />
                                        <span>Verifying...</span>
                                    </>
                                ) : (
                                    <span>Verify Accounts</span>
                                )}
                            </button>
                            <button 
                                onClick={handleProceedToSummary} 
                                disabled={!lineItems.every(item => verificationResults[item.id]?.status === 'verified') || isVerifying}
                                className="w-14 h-14 bg-emerald-500 disabled:bg-gray-200 disabled:text-gray-400 rounded-full flex-shrink-0 flex items-center justify-center text-white shadow-xl shadow-emerald-200 disabled:shadow-none active:scale-90 transition-all"
                            >
                                <ArrowRight size={24} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex w-full justify-end">
                            <button 
                                onClick={handleProceedToPreview} 
                                className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-emerald-200 active:scale-90 transition-all"
                            >
                                <ArrowRight size={24} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
