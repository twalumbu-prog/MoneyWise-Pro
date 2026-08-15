import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Plus, Trash2, User, List, AlertCircle, RotateCcw, CheckCircle, Smartphone, Building2, Zap } from 'lucide-react';
import { requisitionService } from '../../services/requisition.service';
import { lencoService } from '../../services/lenco.service';
import { cashbookService } from '../../services/cashbook.service';
import { departmentService } from '../../services/department.service';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import WalletSelect from '../WalletSelect';
import BankSelect from '../BankSelect';

type WorkspaceTab = 'pay' | 'buy' | 'order';
type Stage = 1 | 2 | 3 | 4 | 5;

const TABS: { value: WorkspaceTab; label: string }[] = [
    { value: 'pay', label: 'Pay' },
    { value: 'buy', label: 'Buy' },
    { value: 'order', label: 'Order' },
];

interface LineItem {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    estimated_amount: number;
}

interface DesktopRequisitionWorkspaceProps {
    onClose: () => void;
    onSuccess?: () => void;
}

interface PaymentInfo {
    bank_name?: string;
    bank_account_number?: string;
    bank_account_name?: string;
    mobile_money_provider?: string;
    mobile_money_number?: string;
    mobile_money_name?: string;
}

const TOGGLE_PREFS_KEY = 'mw_requisition_toggle_prefs';

interface TogglePrefs {
    useMyAccount: boolean;
    makeExpenseList: boolean;
    autoAuthorize: boolean;
}

const DEFAULT_TOGGLE_PREFS: TogglePrefs = {
    useMyAccount: true,
    makeExpenseList: true,
    autoAuthorize: false,
};

const loadTogglePrefs = (): TogglePrefs => {
    try {
        const raw = localStorage.getItem(TOGGLE_PREFS_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            return {
                useMyAccount: typeof p.useMyAccount === 'boolean' ? p.useMyAccount : DEFAULT_TOGGLE_PREFS.useMyAccount,
                makeExpenseList: typeof p.makeExpenseList === 'boolean' ? p.makeExpenseList : DEFAULT_TOGGLE_PREFS.makeExpenseList,
                autoAuthorize: typeof p.autoAuthorize === 'boolean' ? p.autoAuthorize : DEFAULT_TOGGLE_PREFS.autoAuthorize,
            };
        }
    } catch {}
    return { ...DEFAULT_TOGGLE_PREFS };
};

const saveTogglePrefs = (prefs: TogglePrefs) => {
    try {
        localStorage.setItem(TOGGLE_PREFS_KEY, JSON.stringify(prefs));
    } catch {}
};

const ComingSoonTab: React.FC<{ name: string }> = ({ name }) => (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-[#F3F5FC] flex items-center justify-center mb-4">
            <AlertCircle size={28} className="text-gray-400" />
        </div>
        <h3 className="text-base font-bold text-gray-500 mb-1">{name} Feature Loading</h3>
        <p className="text-xs text-gray-400 font-medium">This feature is coming soon. Stay tuned!</p>
    </div>
);

export const DesktopRequisitionWorkspace: React.FC<DesktopRequisitionWorkspaceProps> = ({ onClose, onSuccess }) => {
    const { user, userName, userRole } = useAuth();
    const [activeTab, setActiveTab] = useState<WorkspaceTab>('pay');
    const [stage, setStage] = useState<Stage>(1);

    // Stage 1
    const [description, setDescription] = useState('');
    const [department, setDepartment] = useState('');
    const [useMyAccount, setUseMyAccount] = useState(true);
    const [makeExpenseList, setMakeExpenseList] = useState(true);

    // Stage 2
    const [lineItems, setLineItems] = useState<LineItem[]>([
        { id: '1', description: '', quantity: 1, unit_price: 0, estimated_amount: 0 }
    ]);

    // Stage 5
    const [manualAmount, setManualAmount] = useState('');

    // Stage 3
    const [paymentMethod, setPaymentMethod] = useState<'mobile' | 'bank'>('mobile');
    const [banks, setBanks] = useState<any[]>([]);
    const [bankId, setBankId] = useState('');
    const [activeRequisitionId, setActiveRequisitionId] = useState<string | null>(null);
    const navigate = useNavigate();
    const [accountNumber, setAccountNumber] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [momoOperator, setMomoOperator] = useState('AIRTEL');
    const [resolvedName, setResolvedName] = useState('');
    const [confirmingName, setConfirmingName] = useState(false);
    
    const [autoAuthorize, setAutoAuthorize] = useState(false);
    const [wallets, setWallets] = useState<any[]>([]);
    const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
    const [selectedWalletBalance, setSelectedWalletBalance] = useState<number | null>(null);

    const [useDepartments, setUseDepartments] = useState(false);
    const [orgDepartments, setOrgDepartments] = useState<string[]>([]);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(false);

    useEffect(() => {
        const prefs = loadTogglePrefs();
        setStage(1);
        setDescription('');
        setDepartment('');
        setUseMyAccount(prefs.useMyAccount);
        setMakeExpenseList(prefs.makeExpenseList);
        setAutoAuthorize(prefs.autoAuthorize);
        setLineItems([{ id: '1', description: '', quantity: 1, unit_price: 0, estimated_amount: 0 }]);
        setManualAmount('');
        setPaymentMethod('mobile');
        setBankId('');
        setAccountNumber('');
        setPhoneNumber('');
        setResolvedName('');
        setWallets([]);
        setSelectedWalletId(null);
        setError(null);
        setActiveRequisitionId(null);
        
        fetchBanks();
        fetchPaymentInfo();
        fetchWallets();
        departmentService.list()
            .then(({ use_departments, departments }) => {
                setUseDepartments(use_departments);
                setOrgDepartments(departments.map(d => d.name));
            })
            .catch(() => {});
    }, []);

    const fetchWallets = async () => {
        try {
            const data = await cashbookService.getWallets();
            const list = Array.isArray(data) ? data : (data?.data || []);
            setWallets(list);
            if (list.length > 0) {
                const main = list.find((w: any) => w.is_main) || list[0];
                setSelectedWalletId(main.id);
            }
        } catch (err) {
            console.error('Failed to load wallets:', err);
        }
    };

    useEffect(() => {
        if (!autoAuthorize || useMyAccount || !selectedWalletId) {
            setSelectedWalletBalance(null);
            return;
        }
        let cancelled = false;
        cashbookService.getBalance('MONEYWISE_WALLET', undefined, selectedWalletId)
            .then(balance => { if (!cancelled) setSelectedWalletBalance(Number(balance) || 0); })
            .catch(err => {
                console.error('Failed to load wallet balance:', err);
                if (!cancelled) setSelectedWalletBalance(null);
            });
        return () => { cancelled = true; };
    }, [autoAuthorize, useMyAccount, selectedWalletId]);

    const fetchPaymentInfo = async () => {
        try {
            setLoadingProfile(true);
            const res = await apiFetch('/users/me');
            if (res.ok) {
                const data = await res.json();
                if (data.payment_info) {
                    setPaymentInfo(data.payment_info);
                }
            }
        } catch (err) {
            console.error('Failed to load payment info:', err);
        } finally {
            setLoadingProfile(false);
        }
    };

    const fetchBanks = async () => {
        try {
            const data = await lencoService.getBanks();
            setBanks(Array.isArray(data) ? data : (data.data || []));
        } catch (err) {
            console.error('Failed to fetch banks:', err);
        }
    };

    const handleResolveName = async () => {
        if (paymentMethod === 'mobile') {
            if (phoneNumber.length < 10 || !momoOperator) return;
            setConfirmingName(true);
            try {
                const res = await lencoService.resolveMobileMoney(phoneNumber, momoOperator, (user as any)?.organization_id);
                setResolvedName(res.accountName || res.account_name || res.name || '');
            } catch (err) {
                setResolvedName('Name not confirmed');
            } finally {
                setConfirmingName(false);
            }
        } else {
            if (accountNumber.length < 5 || !bankId) return;
            setConfirmingName(true);
            try {
                const res = await lencoService.resolveBankAccount(accountNumber, bankId, (user as any)?.organization_id);
                setResolvedName(res.accountName || res.account_name || res.name || '');
            } catch (err) {
                setResolvedName('Name not confirmed');
            } finally {
                setConfirmingName(false);
            }
        }
    };

    useEffect(() => {
        if (paymentMethod === 'mobile' && phoneNumber.length >= 10) handleResolveName();
    }, [phoneNumber, momoOperator]);

    useEffect(() => {
        if (paymentMethod === 'bank' && accountNumber.length >= 5 && bankId) handleResolveName();
    }, [accountNumber, bankId]);

    useEffect(() => {
        setResolvedName('');
        setConfirmingName(false);
        if (paymentMethod === 'bank') {
            setPhoneNumber('');
        } else {
            setAccountNumber('');
            setBankId('');
        }
    }, [paymentMethod]);

    const getTotal = () => makeExpenseList
        ? lineItems.reduce((s, i) => s + Number(i.estimated_amount), 0)
        : (Number(manualAmount) || 0);

    const isWalletBalanceInsufficient = autoAuthorize && !useMyAccount &&
        !!selectedWalletId &&
        selectedWalletBalance !== null &&
        getTotal() > selectedWalletBalance;

    const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
        setLineItems(prev => prev.map(item => {
            if (item.id !== id) return item;
            const updated = { ...item, [field]: value };
            if (field === 'quantity' || field === 'unit_price') {
                const qty = field === 'quantity' ? Number(value) : Number(updated.quantity);
                const price = field === 'unit_price' ? Number(value) : Number(updated.unit_price);
                updated.estimated_amount = qty * price;
            }
            return updated;
        }));
    };

    const addLineItem = () => setLineItems(prev => [...prev, { id: Date.now().toString(), description: '', quantity: 1, unit_price: 0, estimated_amount: 0 }]);
    
    const removeLineItem = (id: string) => {
        if (lineItems.length === 1) {
            setLineItems([{ id: Date.now().toString(), description: '', quantity: 1, unit_price: 0, estimated_amount: 0 }]);
            return;
        }
        setLineItems(prev => prev.filter(i => i.id !== id));
    };

    const getStageSequence = (): Stage[] => {
        const seq: Stage[] = [1];
        seq.push(makeExpenseList ? 2 : 5);
        if (!useMyAccount) seq.push(3);
        seq.push(4);
        return seq;
    };

    const handleProceed = () => {
        setError(null);
        if (stage === 1) {
            if (!description.trim()) { setError('Please describe the purpose.'); return; }
            if (useDepartments && !department) { setError('Please select a department.'); return; }
        } else if (stage === 5) {
            if (!manualAmount || Number(manualAmount) <= 0) { setError('Please enter an amount greater than zero.'); return; }
        } else if (stage === 3) {
            if (!resolvedName || resolvedName === 'Name not confirmed') { setError('Please verify the recipient details.'); return; }
        }

        const seq = getStageSequence();
        const idx = seq.indexOf(stage);
        if (idx !== -1 && idx < seq.length - 1) setStage(seq[idx + 1]);
    };

    const handleBack = () => {
        setError(null);
        const seq = getStageSequence();
        const idx = seq.indexOf(stage);
        if (idx > 0) setStage(seq[idx - 1]);
    };

    const handleSubmit = async () => {
        if (isWalletBalanceInsufficient) {
            setError(`This wallet only has K${selectedWalletBalance?.toLocaleString(undefined, { minimumFractionDigits: 2 })} available. Choose another wallet or top it up first.`);
            return;
        }
        setSubmitting(true);
        setError(null);
        setActiveRequisitionId(null);
        try {
            const data: any = {
                description,
                department,
                estimated_total: getTotal(),
                items: makeExpenseList ? lineItems.map(({ description, quantity, unit_price, estimated_amount }) => ({
                    description,
                    quantity: Number(quantity),
                    unit_price: Number(unit_price),
                    estimated_amount: Number(estimated_amount)
                })) : undefined,
                payment_method: useMyAccount 
                    ? (paymentInfo?.mobile_money_number ? paymentInfo.mobile_money_provider : (paymentInfo?.bank_account_number ? 'BANK' : undefined))
                    : (paymentMethod === 'mobile' ? momoOperator : 'BANK'),
                recipient_account: useMyAccount 
                    ? (paymentInfo?.mobile_money_number || paymentInfo?.bank_account_number)
                    : (paymentMethod === 'mobile' ? phoneNumber : accountNumber),
                recipient_bank_code: useMyAccount 
                    ? (paymentInfo?.mobile_money_number ? paymentInfo.mobile_money_provider : (paymentInfo?.bank_name || undefined))
                    : (paymentMethod === 'bank' ? bankId : (paymentMethod === 'mobile' ? momoOperator : undefined)),
                recipient_name: useMyAccount 
                    ? (paymentInfo?.mobile_money_name || paymentInfo?.bank_account_name || userName)
                    : resolvedName
            };
            const created = await requisitionService.create(data);

            saveTogglePrefs({ useMyAccount, makeExpenseList, autoAuthorize });

            if (autoAuthorize && userRole === 'ADMIN' && !useMyAccount) {
                try {
                    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
                    const normalizedPhone = cleanPhone.startsWith('260') ? '0' + cleanPhone.substring(3) : cleanPhone;
                    const recipientAccount = paymentMethod === 'mobile' ? normalizedPhone : accountNumber;
                    const recipientBankCode = (paymentMethod === 'mobile' ? momoOperator : bankId).toLowerCase();

                    await requisitionService.updateStatus(created.id, 'AUTHORISED');
                    const result = await requisitionService.disburse(created.id, {
                        payment_method: 'MONEYWISE_WALLET',
                        total_prepared: getTotal(),
                        recipient_account: recipientAccount,
                        recipient_bank_code: recipientBankCode,
                        recipient_account_name: resolvedName || undefined,
                        wallet_id: selectedWalletId || undefined,
                    });

                    if (result.lencoStatus === 'pending') {
                        for (let attempt = 0; attempt < 8; attempt++) {
                            await new Promise(r => setTimeout(r, 4000));
                            const poll = await requisitionService.verifyDisbursement(created.id);
                            if (poll.status === 'successful') break;
                            if (poll.status === 'failed') {
                                throw new Error(poll.error || poll.details?.reasonForFailure || 'The transfer was rejected by Lenco.');
                            }
                        }
                    }
                } catch (disbErr: any) {
                    console.error('Auto-authorize disbursal failed:', disbErr);
                    setActiveRequisitionId(created.id);
                    setError(`${disbErr.message || 'Disbursement failed.'} The requisition was created — open it to disburse manually.`);
                    setSubmitting(false);
                    return;
                }
            }

            if (onSuccess) onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Submission error:', err);
            setError(err.message || 'Submission failed. Please try again.');
            if (err.activeRequisitionId) setActiveRequisitionId(err.activeRequisitionId);
        } finally {
            setSubmitting(false);
        }
    };

    const seq = getStageSequence();
    const canGoBack = seq.indexOf(stage) > 0;
    const isLastStage = stage === 4;

    return (
        <div className="bg-white rounded-[20px] p-3.5 flex flex-col gap-4 h-[calc(100vh-140px)] shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center justify-between shrink-0">
                <button
                    onClick={onClose}
                    className="h-8 pl-2.5 pr-3.5 bg-white rounded-lg outline outline-[0.5px] outline-offset-[-0.5px] outline-[#E8EEF8] flex items-center gap-1.5 hover:bg-[#F3F5FC] transition-colors"
                >
                    <ArrowLeft size={15} className="text-[#111827]" />
                    <span className="text-sm font-bold text-[#111827]">New Requisition</span>
                </button>
            </div>

            <div className="w-full max-w-md mx-auto shrink-0">
                <div className="flex items-center gap-1 p-1 bg-[#F3F5FC] rounded-[10px]">
                    {TABS.map(tab => (
                        <button
                            key={tab.value}
                            onClick={() => setActiveTab(tab.value)}
                            className={`flex-1 py-2 rounded-lg text-xs transition-all ${
                                activeTab === tab.value
                                    ? 'font-bold bg-white text-[#111827] shadow-[0px_2px_4px_0px_rgba(0,0,0,0.10)] outline outline-[0.5px] outline-offset-[-0.5px] outline-[#E8EEF8]'
                                    : 'font-normal text-gray-400 hover:text-gray-500'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 min-h-0 rounded-2xl outline outline-[0.5px] outline-offset-[-0.5px] outline-[#E8EEF8] bg-white overflow-y-auto">
                {activeTab !== 'pay' ? (
                    <ComingSoonTab name={activeTab === 'buy' ? 'Buy' : 'Order'} />
                ) : (
                    <div className="max-w-2xl mx-auto p-8 animate-in fade-in zoom-in-95 duration-200 pb-20">
                        {error && (
                            <div className="mb-6 bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
                                <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                                <div className="flex-1">
                                    <p className="text-sm text-red-700 font-medium">{error}</p>
                                    {activeRequisitionId && (
                                        <button
                                            onClick={() => {
                                                navigate(`/requisitions?id=${activeRequisitionId}`);
                                                onClose();
                                            }}
                                            className="mt-3 w-full h-10 bg-red-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:bg-red-700 transition-colors"
                                        >
                                            <span>Go to Requisition</span>
                                            <ArrowRight size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {stage === 1 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">Request Details</h2>
                                    <p className="text-xs text-gray-400 mt-1">What is the purpose of this requisition?</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Purpose of funds</label>
                                        <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Office Supplies" className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] transition-all" />
                                    </div>
                                    {useDepartments && (
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Department</label>
                                        <select value={department} onChange={e => setDepartment(e.target.value)} className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] transition-all">
                                            <option value="">Select Department</option>
                                            {orgDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                    )}
                                    <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <button onClick={() => { const v = !useMyAccount; setUseMyAccount(v); saveTogglePrefs({ useMyAccount: v, makeExpenseList, autoAuthorize }); }} className={`w-full flex flex-col p-4 rounded-xl border text-left transition-all ${useMyAccount ? 'bg-[#F3F5FC] border-[#006AFF]/30 shadow-sm' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                                            <div className="flex items-center justify-between mb-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${useMyAccount ? 'bg-[#006AFF] text-white' : 'bg-gray-100 text-gray-400'}`}><User size={16} /></div>
                                                <div className={`w-10 h-5 rounded-full transition-all relative ${useMyAccount ? 'bg-[#006AFF]' : 'bg-gray-200'}`}><div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${useMyAccount ? 'right-0.5' : 'left-0.5'}`} /></div>
                                            </div>
                                            <p className="text-sm font-bold text-gray-900">Send to my account</p>
                                            <p className="text-[11px] text-gray-500 mt-0.5">Use details from your profile</p>
                                        </button>

                                        <button onClick={() => { const v = !makeExpenseList; setMakeExpenseList(v); saveTogglePrefs({ useMyAccount, makeExpenseList: v, autoAuthorize }); }} className={`w-full flex flex-col p-4 rounded-xl border text-left transition-all ${makeExpenseList ? 'bg-[#F3F5FC] border-[#006AFF]/30 shadow-sm' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                                            <div className="flex items-center justify-between mb-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${makeExpenseList ? 'bg-[#006AFF] text-white' : 'bg-gray-100 text-gray-400'}`}><List size={16} /></div>
                                                <div className={`w-10 h-5 rounded-full transition-all relative ${makeExpenseList ? 'bg-[#006AFF]' : 'bg-gray-200'}`}><div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${makeExpenseList ? 'right-0.5' : 'left-0.5'}`} /></div>
                                            </div>
                                            <p className="text-sm font-bold text-gray-900">Create item list</p>
                                            <p className="text-[11px] text-gray-500 mt-0.5">Add specific items and prices</p>
                                        </button>
                                    </div>
                                    
                                    {useMyAccount && (
                                        <div className="mt-4 p-4 bg-gray-50 border border-gray-100 rounded-xl animate-in fade-in duration-300">
                                            {loadingProfile ? (
                                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                                    <RotateCcw size={12} className="animate-spin" />
                                                    <span>Checking your account details...</span>
                                                </div>
                                            ) : paymentInfo && (paymentInfo.bank_account_number || paymentInfo.mobile_money_number) ? (
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <CheckCircle size={14} className="text-emerald-500" />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">Profile Details Found</span>
                                                    </div>
                                                    {paymentInfo.bank_account_number && (
                                                        <div className="flex items-center gap-2 text-sm text-gray-900 font-medium">
                                                            <Building2 size={16} className="text-gray-400" />
                                                            <span>{paymentInfo.bank_name} · {paymentInfo.bank_account_number}</span>
                                                        </div>
                                                    )}
                                                    {paymentInfo.mobile_money_number && (
                                                        <div className="flex items-center gap-2 text-sm text-gray-900 font-medium">
                                                            <Smartphone size={16} className="text-gray-400" />
                                                            <span>{paymentInfo.mobile_money_provider} · {paymentInfo.mobile_money_number}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex items-start gap-3">
                                                    <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="text-xs font-bold text-amber-800">No account details found</p>
                                                        <p className="text-[11px] text-amber-700 mt-1">Please add your details in Settings → My Profile.</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {stage === 2 && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-end border-b border-gray-100 pb-4">
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900">Expense List</h2>
                                        <p className="text-xs text-gray-400 mt-1">Break down your request</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-0.5">Total</p>
                                        <p className="text-xl font-black text-[#006AFF]">K{getTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    </div>
                                </div>
                                
                                <div className="space-y-4">
                                    {lineItems.map((item) => (
                                        <div key={item.id} className="flex gap-4 items-start p-4 bg-gray-50 rounded-xl border border-gray-100">
                                            <div className="flex-1 space-y-3">
                                                <input type="text" value={item.description} onChange={e => updateLineItem(item.id, 'description', e.target.value)} placeholder="Item Description" className="w-full text-sm font-semibold text-gray-900 bg-transparent border-b border-gray-200 focus:border-[#006AFF] pb-1 placeholder:font-normal focus:outline-none transition-colors" />
                                                <div className="flex gap-4">
                                                    <div className="flex-1 relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">K</span>
                                                        <input type="number" value={item.unit_price || ''} onChange={e => updateLineItem(item.id, 'unit_price', e.target.value)} placeholder="0.00" className="w-full h-9 pl-7 pr-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF]" />
                                                    </div>
                                                    <div className="w-24 relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">Qty:</span>
                                                        <input type="number" value={item.quantity} onChange={e => updateLineItem(item.id, 'quantity', e.target.value)} className="w-full h-9 pl-9 pr-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF]" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="shrink-0 flex flex-col justify-between items-end h-full pt-1">
                                                <button onClick={() => removeLineItem(item.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                                <div className="mt-8 text-sm font-bold text-gray-900">
                                                    {item.estimated_amount > 0 ? `K${item.estimated_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    <button onClick={addLineItem} className="w-full h-12 border border-dashed border-gray-300 rounded-xl flex items-center justify-center gap-2 text-gray-500 hover:text-[#006AFF] hover:bg-[#F3F5FC] hover:border-[#006AFF]/30 transition-all">
                                        <Plus size={16} />
                                        <span className="text-xs font-bold">Add Another Item</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {stage === 5 && (
                            <div className="space-y-6 max-w-sm mx-auto mt-8">
                                <div className="text-center space-y-1 mb-8">
                                    <h2 className="text-xl font-bold text-gray-900">Amount Requested</h2>
                                    <p className="text-xs text-gray-500">Enter the exact amount you need.</p>
                                </div>
                                <div className="relative">
                                    <span className="absolute left-6 top-1/2 -translate-y-1/2 font-bold text-gray-400 text-2xl">K</span>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={manualAmount}
                                        onChange={e => setManualAmount(e.target.value)}
                                        placeholder="0.00"
                                        autoFocus
                                        className="w-full h-20 bg-gray-50 border border-gray-200 rounded-2xl pl-14 pr-6 text-3xl font-black text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:bg-white transition-all text-center"
                                    />
                                </div>
                            </div>
                        )}

                        {stage === 3 && (
                            <div className="space-y-6 max-w-sm mx-auto">
                                <div className="text-center mb-6">
                                    <h2 className="text-lg font-bold text-gray-900">Payment Destination</h2>
                                    <p className="text-xs text-gray-500 mt-1">Where should the funds go?</p>
                                </div>
                                
                                <div className="flex p-1 bg-[#F3F5FC] rounded-xl mb-6">
                                    <button onClick={() => setPaymentMethod('mobile')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${paymentMethod === 'mobile' ? 'bg-white text-[#0058DB] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Mobile Money</button>
                                    <button onClick={() => setPaymentMethod('bank')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${paymentMethod === 'bank' ? 'bg-white text-[#0058DB] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Bank Account</button>
                                </div>

                                {paymentMethod === 'mobile' ? (
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Phone Number</label>
                                        <div className="relative">
                                            <input
                                                type="tel"
                                                value={phoneNumber}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setPhoneNumber(val);
                                                    const clean = val.replace(/[^0-9]/g, '');
                                                    const normalized = clean.startsWith('260') ? '0' + clean.substring(3) : clean;
                                                    let operator = '';
                                                    if (normalized.startsWith('097') || normalized.startsWith('077')) operator = 'AIRTEL';
                                                    else if (normalized.startsWith('096') || normalized.startsWith('076')) operator = 'MTN';
                                                    else if (normalized.startsWith('095') || normalized.startsWith('075')) operator = 'ZAMTEL';
                                                    setMomoOperator(operator);
                                                }}
                                                placeholder="Enter phone number"
                                                className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] transition-all pr-20"
                                            />
                                            {momoOperator && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                    <span className={`text-[9px] font-bold px-2 py-1 rounded bg-gray-50 border border-gray-100 uppercase tracking-wide ${momoOperator === 'AIRTEL' ? 'text-red-500' : momoOperator === 'MTN' ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                        {momoOperator}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Bank</label>
                                            <BankSelect
                                                banks={banks}
                                                value={bankId}
                                                onChange={setBankId}
                                                className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-sm text-gray-900 focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF]"
                                                placeholder="Select Bank"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 ml-1">Account Number</label>
                                            <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Enter account number" className="w-full h-12 bg-white border border-gray-200 rounded-xl px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/20 focus:border-[#006AFF] transition-all" />
                                        </div>
                                    </div>
                                )}

                                {(phoneNumber.length >= 10 || accountNumber.length >= 5) && (
                                    <div className="mt-6 p-4 rounded-xl bg-[#F3F5FC] border border-[#E8EEF8] flex items-center gap-3">
                                        {confirmingName ? (
                                            <RotateCcw size={16} className="text-[#0058DB] animate-spin shrink-0" />
                                        ) : resolvedName ? (
                                            <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                                        ) : (
                                            <AlertCircle size={16} className="text-amber-500 shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Account Holder</p>
                                            <p className="text-sm font-semibold text-gray-900 truncate">
                                                {confirmingName ? 'Verifying...' : (resolvedName || 'Waiting for details...')}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                
                                {userRole === 'ADMIN' && (
                                    <div className="pt-4 border-t border-gray-100">
                                        <button onClick={() => { const v = !autoAuthorize; setAutoAuthorize(v); saveTogglePrefs({ useMyAccount, makeExpenseList, autoAuthorize: v }); }} className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${autoAuthorize ? 'bg-[#FFFBEB] border-amber-200 shadow-sm' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                                            <div className="flex items-center gap-3 text-left">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${autoAuthorize ? 'bg-amber-100 text-amber-600' : 'bg-white text-gray-400'}`}><Zap size={16} /></div>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900">Auto-authorize &amp; send</p>
                                                    <p className="text-[10px] text-gray-500 mt-0.5">Instantly disburse upon submit</p>
                                                </div>
                                            </div>
                                            <div className={`w-10 h-5 rounded-full transition-all relative ${autoAuthorize ? 'bg-amber-500' : 'bg-gray-300'}`}><div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${autoAuthorize ? 'right-0.5' : 'left-0.5'}`} /></div>
                                        </button>
                                        {autoAuthorize && (
                                            <p className="text-[10px] text-amber-700 font-medium mt-2 mx-2 text-center">
                                                Warning: Funds will be sent immediately via Lenco.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {stage === 4 && (
                            <div className="max-w-md mx-auto space-y-6">
                                <div className="text-center py-6">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Requisition Total</h3>
                                    <h2 className="text-5xl font-black text-gray-900">
                                        K{getTotal().toLocaleString()}
                                    </h2>
                                </div>

                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-5 space-y-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Payment Method</span>
                                        <span className="font-semibold text-gray-900">{paymentMethod === 'mobile' ? 'Mobile Money' : 'Bank Transfer'}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Account Number</span>
                                        <span className="font-semibold text-gray-900">{paymentMethod === 'mobile' ? phoneNumber : accountNumber}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Account Name</span>
                                        <span className="font-semibold text-gray-900">{useMyAccount ? (paymentInfo?.mobile_money_name || paymentInfo?.bank_account_name || 'My Account') : (resolvedName || 'Name not provided')}</span>
                                    </div>
                                </div>

                                {autoAuthorize && !useMyAccount && wallets.length > 1 && (
                                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-5 space-y-3">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Send From Wallet</label>
                                        <WalletSelect
                                            wallets={wallets}
                                            value={selectedWalletId}
                                            onChange={setSelectedWalletId}
                                            placeholder="Select Wallet"
                                            triggerClassName="w-full h-12 bg-white border border-gray-200 rounded-lg px-4 text-sm font-semibold"
                                        />
                                        {isWalletBalanceInsufficient && (
                                            <p className="text-[11px] font-medium text-red-600 bg-red-50 p-2 rounded-lg mt-2">
                                                Insufficient funds. Wallet has K{selectedWalletBalance?.toLocaleString(undefined, { minimumFractionDigits: 2 })}.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {makeExpenseList && (
                                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-5 space-y-3">
                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Line Items</h4>
                                        {lineItems.filter(i => i.description).map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600 truncate mr-4">{item.quantity}x {item.description}</span>
                                                <span className="font-semibold text-gray-900 shrink-0">K{Number(item.estimated_amount).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {activeTab === 'pay' && (
                <div className="flex items-center justify-between gap-4 pt-2 shrink-0">
                    <button
                        onClick={handleBack}
                        disabled={!canGoBack || submitting}
                        className={`h-10 px-5 rounded-xl flex items-center gap-1.5 transition-all text-xs font-bold ${
                            canGoBack 
                                ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50' 
                                : 'bg-white border border-gray-100 text-gray-300 cursor-not-allowed'
                        }`}
                    >
                        <ArrowLeft size={16} />
                        Previous
                    </button>
                    
                    {!isLastStage ? (
                        <button
                            onClick={handleProceed}
                            className="h-10 px-6 rounded-xl bg-[#0058DB] text-xs font-bold text-white flex items-center gap-1.5 hover:bg-blue-700 transition-colors"
                        >
                            Next
                            <ArrowRight size={16} />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={submitting || isWalletBalanceInsufficient}
                            className="h-10 px-8 rounded-xl bg-[#0058DB] text-xs font-bold text-white flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            {submitting ? (
                                <>
                                    <RotateCcw size={16} className="animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <CheckCircle size={16} />
                                    Submit
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
