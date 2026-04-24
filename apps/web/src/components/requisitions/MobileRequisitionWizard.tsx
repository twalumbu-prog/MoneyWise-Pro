import React, { useState, useEffect } from 'react';
import { ArrowRight, ArrowLeft, X, Plus, Trash2, User, List, AlertCircle, RotateCcw, CheckCircle, Smartphone, Building2, Mail } from 'lucide-react';
import { requisitionService } from '../../services/requisition.service';
import { lencoService } from '../../services/lenco.service';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

interface LineItem {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    estimated_amount: number;
}

interface MobileRequisitionWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface PaymentInfo {
    bank_name?: string;
    bank_account_number?: string;
    bank_account_name?: string;
    mobile_money_provider?: string;
    mobile_money_number?: string;
    mobile_money_name?: string;
}

const DEPARTMENTS = ['Finance', 'Admin', 'HR', 'IT', 'Education', 'Transportation', 'Stocks', 'Maintenance', 'Catering'];

type WizardTab = 'basic' | 'buy' | 'order';
type Stage = 1 | 2 | 3 | 4;

const ComingSoonTab: React.FC<{ name: string }> = ({ name }) => (
    <div className="flex flex-col items-center justify-center h-64 text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <AlertCircle size={28} className="text-gray-300" />
        </div>
        <h3 className="text-base font-bold text-gray-400 mb-1">{name} Feature Loading</h3>
        <p className="text-xs text-gray-300 font-medium">This feature is coming soon. Stay tuned!</p>
    </div>
);

export const MobileRequisitionWizard: React.FC<MobileRequisitionWizardProps> = ({ isOpen, onClose, onSuccess }) => {
    const { user, userName } = useAuth();
    const [activeTab, setActiveTab] = useState<WizardTab>('basic');
    const [stage, setStage] = useState<Stage>(1);

    // Stage 1: Basic
    const [description, setDescription] = useState('');
    const [department, setDepartment] = useState('');
    const [useMyAccount, setUseMyAccount] = useState(true);
    const [makeExpenseList, setMakeExpenseList] = useState(true);

    // Stage 2: Expense List
    const [lineItems, setLineItems] = useState<LineItem[]>([
        { id: '1', description: '', quantity: 1, unit_price: 0, estimated_amount: 0 }
    ]);

    // Stage 3: Payment Method
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

    // Common
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Reset wizard state to fresh defaults
            setStage(1);
            setDescription('');
            setDepartment('');
            setUseMyAccount(true);
            setMakeExpenseList(true);
            setLineItems([{ id: '1', description: '', quantity: 1, unit_price: 0, estimated_amount: 0 }]);
            setPaymentMethod('mobile');
            setBankId('');
            setAccountNumber('');
            setPhoneNumber('');
            setResolvedName('');
            setError(null);
            setActiveRequisitionId(null);
            
            fetchBanks();
            fetchPaymentInfo();
        }
    }, [isOpen]);

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
            // Backend returns the bank array directly
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
                // Pass organization_id if available to ensure correct Lenco keys are used
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

    // Reset verification state when switching payment methods
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

    const getTotal = () => lineItems.reduce((s, i) => s + Number(i.estimated_amount), 0);

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

    const handleProceed = () => {
        setError(null);
        if (stage === 1) {
            if (!description.trim()) { setError('Please describe the purpose.'); return; }
            if (!department) { setError('Please select a department.'); return; }
            if (makeExpenseList) setStage(2);
            else if (!useMyAccount) setStage(3);
            else setStage(4);
        } else if (stage === 2) {
            if (!useMyAccount) setStage(3);
            else setStage(4);
        } else if (stage === 3) {
            if (!resolvedName || resolvedName === 'Name not confirmed') { setError('Please verify the recipient details.'); return; }
            setStage(4);
        }
    };

    const handleBack = () => {
        setError(null);
        if (stage === 4) {
            if (!useMyAccount) setStage(3);
            else if (makeExpenseList) setStage(2);
            else setStage(1);
        } else if (stage === 3) {
            if (makeExpenseList) setStage(2);
            else setStage(1);
        } else if (stage === 2) {
            setStage(1);
        }
    };

    const handleSubmit = async () => {
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
            await requisitionService.create(data);
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Submission error:', err);
            setError(err.message || 'Submission failed. Please try again.');
            if (err.activeRequisitionId) {
                setActiveRequisitionId(err.activeRequisitionId);
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] bg-white flex flex-col md:hidden">
            <div className="h-16 bg-white border-b border-gray-100 px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center">
                    <span className="text-xl font-medium text-brand-navy tracking-tight">MoneyWise</span>
                    <span className="text-xl font-bold text-[#006AFF] ml-1 tracking-tight">Pro</span>
                </div>
            </div>

            <div className="px-6 py-4 flex items-center justify-between shrink-0">
                <h1 className="text-[18px] font-bold text-brand-navy">New Requisition</h1>
                <button onClick={onClose} className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-brand-navy shadow-[0_4px_12px_rgba(0,106,255,0.4)] active:scale-95 transition-all">
                    <X size={16} strokeWidth={3} />
                </button>
            </div>

            <div className="bg-white border-b border-gray-100 px-6 py-2 shrink-0">
                <div className="flex items-center justify-between w-full bg-gray-50/50 p-1 rounded-2xl">
                    {(['basic', 'buy', 'order'] as WizardTab[]).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-2 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-[#EEF4FF] text-[#006AFF] shadow-sm' : 'text-gray-400'}`}>
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
                {activeTab !== 'basic' ? (
                    <ComingSoonTab name={activeTab} />
                ) : (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {error && (
                            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 space-y-3 animate-in fade-in zoom-in duration-300">
                                <div className="flex items-start gap-3">
                                    <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                                    <p className="text-sm text-red-700 font-medium leading-relaxed">{error}</p>
                                </div>
                                {activeRequisitionId && (
                                    <button
                                        onClick={() => {
                                            navigate(`/requisitions?id=${activeRequisitionId}`);
                                            onClose();
                                        }}
                                        className="w-full h-12 bg-red-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                                    >
                                        <span>Finish Transaction</span>
                                        <ArrowRight size={16} />
                                    </button>
                                )}
                            </div>
                        )}

                        {stage === 1 && (
                            <div className="space-y-6">
                                <h2 className="text-[20px] font-bold text-brand-navy">Request Details</h2>
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Purpose of funds</label>
                                        <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this request for?" className="w-full h-14 bg-gray-50 border border-gray-100 rounded-2xl px-5 text-brand-navy placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#006AFF]/10 focus:bg-white transition-all" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Department</label>
                                        <select value={department} onChange={e => setDepartment(e.target.value)} className="w-full h-14 bg-gray-50 border border-gray-100 rounded-2xl px-5 text-brand-navy focus:outline-none focus:ring-2 focus:ring-[#006AFF]/10 focus:bg-white transition-all appearance-none">
                                            <option value="">Select Department</option>
                                            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                    <div className="pt-4 space-y-4">
                                        <div className="space-y-3">
                                            <button onClick={() => setUseMyAccount(!useMyAccount)} className="w-full flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100 active:scale-[0.98] transition-all">
                                                <div className="flex items-center gap-3 text-left">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${useMyAccount ? 'bg-[#006AFF]/10 text-[#006AFF]' : 'bg-gray-200 text-gray-400'}`}><User size={20} /></div>
                                                    <div><p className="text-sm font-bold text-brand-navy">Send to my account</p><p className="text-[11px] text-gray-400">Use details from your profile</p></div>
                                                </div>
                                                <div className={`w-12 h-6 rounded-full transition-all relative ${useMyAccount ? 'bg-[#006AFF]' : 'bg-gray-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${useMyAccount ? 'right-1' : 'left-1'}`} /></div>
                                            </button>

                                            {useMyAccount && (
                                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                                    {loadingProfile ? (
                                                        <div className="flex items-center gap-2 px-4 py-2 text-xs text-gray-400">
                                                            <RotateCcw size={12} className="animate-spin" />
                                                            <span>Checking your account details...</span>
                                                        </div>
                                                    ) : paymentInfo && (paymentInfo.bank_account_number || paymentInfo.mobile_money_number) ? (
                                                        <div className="bg-[#EEF4FF] border border-[#006AFF]/10 rounded-2xl p-4 space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <CheckCircle size={14} className="text-emerald-500" />
                                                                <span className="text-[11px] font-black uppercase tracking-widest text-[#006AFF]">Profile Details Found</span>
                                                            </div>
                                                            {paymentInfo.bank_account_number && (
                                                                <div className="flex items-center gap-2 text-xs text-brand-navy font-bold">
                                                                    <Building2 size={14} className="text-gray-400" />
                                                                    <span>{paymentInfo.bank_name} · {paymentInfo.bank_account_number}</span>
                                                                </div>
                                                            )}
                                                            {paymentInfo.mobile_money_number && (
                                                                <div className="flex items-center gap-2 text-xs text-brand-navy font-bold">
                                                                    <Smartphone size={14} className="text-gray-400" />
                                                                    <span>{paymentInfo.mobile_money_provider} · {paymentInfo.mobile_money_number}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
                                                            <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                                                            <div>
                                                                <p className="text-xs font-bold text-amber-800">No account details found</p>
                                                                <p className="text-[11px] text-amber-700/70 mt-1 leading-relaxed">Please add your bank or mobile money details in <span className="font-bold">Settings → My Profile</span> to use this option.</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <button onClick={() => setMakeExpenseList(!makeExpenseList)} className="w-full flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100 active:scale-[0.98] transition-all">
                                            <div className="flex items-center gap-3 text-left">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${makeExpenseList ? 'bg-[#006AFF]/10 text-[#006AFF]' : 'bg-gray-200 text-gray-400'}`}><List size={20} /></div>
                                                <div><p className="text-sm font-bold text-brand-navy">Create item list</p><p className="text-[11px] text-gray-400">Add specific items and prices</p></div>
                                            </div>
                                            <div className={`w-12 h-6 rounded-full transition-all relative ${makeExpenseList ? 'bg-[#006AFF]' : 'bg-gray-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${makeExpenseList ? 'right-1' : 'left-1'}`} /></div>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {stage === 2 && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center"><h2 className="text-[20px] font-bold text-brand-navy">Expense List</h2><p className="text-[18px] font-black text-brand-navy">K{getTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></div>
                                <div className="space-y-6">
                                    {lineItems.map((item, idx) => (
                                        <div key={item.id} className="relative pb-6 border-b border-gray-100 last:border-0">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-8 shrink-0 flex items-center justify-center"><div className="w-8 h-8 rounded-full bg-[#EEF4FF] text-[#006AFF] flex items-center justify-center font-bold text-sm">{idx + 1}</div></div>
                                                <input type="text" value={item.description} onChange={e => updateLineItem(item.id, 'description', e.target.value)} placeholder="Item Description" className="flex-1 text-base font-bold text-brand-navy border-none p-0 focus:ring-0 bg-transparent min-w-0" />
                                                <span className="text-sm font-black text-brand-navy min-w-[32px] text-right">{item.estimated_amount > 0 ? `K${item.estimated_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}</span>
                                                <div className="w-8 shrink-0 flex items-center justify-end"><button onClick={() => removeLineItem(item.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={20} /></button></div>
                                            </div>
                                            <div className="flex items-center gap-3"><div className="w-8 shrink-0" />
                                                <div className="flex-[1.5] relative"><input type="number" value={item.unit_price || ''} onChange={e => updateLineItem(item.id, 'unit_price', e.target.value)} placeholder="0.00" className="w-full h-12 border border-gray-200 rounded-full px-5 text-right font-bold text-gray-800 focus:ring-2 focus:ring-[#006AFF]/10 focus:border-[#006AFF] pr-10" /><span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-gray-300">K</span></div>
                                                <div className="flex items-center bg-gray-50 rounded-full p-1 border border-gray-100 min-w-[110px]">
                                                    <button 
                                                        onClick={() => updateLineItem(item.id, 'quantity', Math.max(1, (Number(item.quantity) || 1) - 1))} 
                                                        className="w-8 h-10 flex items-center justify-center text-gray-400 active:scale-90 transition-all"
                                                    >
                                                        <span className="text-xl font-bold">−</span>
                                                    </button>
                                                    <input 
                                                        type="number" 
                                                        value={item.quantity} 
                                                        onChange={e => updateLineItem(item.id, 'quantity', e.target.value)}
                                                        onFocus={(e) => e.target.select()}
                                                        className="w-12 text-center font-bold text-brand-navy text-sm bg-transparent border-none focus:ring-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    />
                                                    <button 
                                                        onClick={() => updateLineItem(item.id, 'quantity', (Number(item.quantity) || 0) + 1)} 
                                                        className="w-8 h-10 flex items-center justify-center text-gray-400 active:scale-90 transition-all"
                                                    >
                                                        <span className="text-xl font-bold">+</span>
                                                    </button>
                                                </div>
                                                <div className="w-8 shrink-0" />
                                            </div>
                                        </div>
                                    ))}
                                    <button onClick={addLineItem} className="w-full h-14 border-2 border-dashed border-gray-200 rounded-3xl flex items-center justify-center gap-2 text-gray-400"><Plus size={20} /><span className="text-sm font-bold">Add Another Item</span></button>
                                </div>
                            </div>
                        )}

                        {stage === 3 && (
                            <div className="space-y-6">
                                <h2 className="text-[20px] font-bold text-brand-navy">Payment Method</h2>
                                <div className="flex p-1 bg-gray-50 rounded-2xl">
                                    <button 
                                        onClick={() => setPaymentMethod('mobile')}
                                        className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${paymentMethod === 'mobile' ? 'bg-white text-[#006AFF] shadow-sm' : 'text-gray-400'}`}
                                    >
                                        Mobile Money
                                    </button>
                                    <button 
                                        onClick={() => setPaymentMethod('bank')}
                                        className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${paymentMethod === 'bank' ? 'bg-white text-[#006AFF] shadow-sm' : 'text-gray-400'}`}
                                    >
                                        Bank Account
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {paymentMethod === 'mobile' ? (
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Phone Number</label>
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
                                                        className="w-full h-14 bg-gray-50 border border-gray-100 rounded-2xl px-5 text-brand-navy focus:outline-none focus:ring-2 focus:ring-[#006AFF]/10 focus:bg-white transition-all pr-24"
                                                    />
                                                    {momoOperator && (
                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                            <span className={`text-[10px] font-black px-2 py-1 rounded bg-white border border-gray-100 uppercase tracking-tighter ${momoOperator === 'AIRTEL' ? 'text-red-500' : momoOperator === 'MTN' ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                                {momoOperator}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Bank</label>
                                                <select
                                                    value={bankId}
                                                    onChange={e => setBankId(e.target.value)}
                                                    className="w-full h-14 bg-gray-50 border border-gray-100 rounded-2xl px-5 text-brand-navy focus:outline-none focus:ring-2 focus:ring-[#006AFF]/10 focus:bg-white transition-all appearance-none"
                                                >
                                                    <option value="">Select Bank</option>
                                                    {banks.map(bank => (
                                                        <option key={bank.id} value={bank.id}>{bank.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Account Number</label>
                                                <input
                                                    type="text"
                                                    value={accountNumber}
                                                    onChange={e => setAccountNumber(e.target.value)}
                                                    placeholder="Enter account number"
                                                    className="w-full h-14 bg-gray-50 border border-gray-100 rounded-2xl px-5 text-brand-navy focus:outline-none focus:ring-2 focus:ring-[#006AFF]/10 focus:bg-white transition-all"
                                                />
                                            </div>
                                        </>
                                    )}

                                    {(phoneNumber.length >= 10 || accountNumber.length >= 5) && (
                                        <div className="p-4 rounded-2xl bg-[#EEF4FF] border border-[#006AFF]/10 flex items-center gap-3">
                                            {confirmingName ? (
                                                <div className="animate-spin text-[#006AFF]">
                                                    <RotateCcw size={16} />
                                                </div>
                                            ) : resolvedName ? (
                                                <CheckCircle size={16} className="text-emerald-500" />
                                            ) : (
                                                <AlertCircle size={16} className="text-amber-500" />
                                            )}
                                            <div className="flex-1">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-[#006AFF]">Account Holder</p>
                                                <p className="text-sm font-bold text-brand-navy">
                                                    {confirmingName ? 'Verifying account...' : (resolvedName || 'Waiting for valid details...')}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {stage === 4 && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* Centered Summary Header */}
                                <div className="text-center space-y-1 mt-4">
                                    <h3 className="text-sm font-medium text-gray-500">Requisition Summary</h3>
                                </div>

                                {/* Requisition Total Hero */}
                                <div className="flex flex-col items-center justify-center space-y-2 py-4">
                                    <div className="flex items-center gap-2 text-gray-500">
                                        <Mail size={16} />
                                        <span className="text-[11px] font-bold uppercase tracking-widest">Requisition Total</span>
                                    </div>
                                    <h2 className="text-[64px] font-black text-black leading-none tracking-tight">
                                        K{getTotal().toLocaleString()}
                                    </h2>
                                </div>

                                {/* Payment Details Card */}
                                <div className="bg-white border border-gray-100 rounded-[24px] p-6 space-y-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Payment Method</span>
                                        <span className="font-bold text-black">{paymentMethod === 'mobile' ? 'Mobile Money' : 'Bank Transfer'}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Account Number</span>
                                        <span className="font-bold text-black">{paymentMethod === 'mobile' ? phoneNumber : accountNumber}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Account Name</span>
                                        <span className="font-bold text-black">{useMyAccount ? (paymentInfo?.mobile_money_name || paymentInfo?.bank_account_name || 'My Account') : (resolvedName || 'Stephen Kapambwe')}</span>
                                    </div>
                                </div>

                                {/* Expense Items Card */}
                                <div className="bg-white border border-gray-100 rounded-[24px] p-6 space-y-4">
                                    <div className="space-y-3">
                                        {lineItems.filter(i => i.description).map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600 font-medium">{item.description}</span>
                                                <span className="text-black font-bold">K{Number(item.estimated_amount).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                                        <span className="text-sm font-bold text-black">Requisition Total</span>
                                        <span className="text-sm font-bold text-black">K{getTotal().toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Bottom Navigation Area */}
            {activeTab === 'basic' && (
                <div className="shrink-0 p-6 pb-8 border-t border-gray-50 bg-white">
                    {stage < 4 ? (
                        <div className="flex justify-end">
                            <button
                                onClick={handleProceed}
                                className="w-14 h-14 bg-[#006AFF] rounded-full flex items-center justify-center text-white active:scale-90 transition-all shadow-lg shadow-blue-100"
                            >
                                <ArrowRight size={24} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleBack}
                                className="w-16 h-16 rounded-full border border-blue-500 flex items-center justify-center text-blue-500 active:scale-95 transition-all"
                            >
                                <ArrowLeft size={24} />
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="flex-1 h-16 bg-[#006AFF] rounded-full text-white font-bold text-base active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                            >
                                {submitting ? (
                                    <>
                                        <RotateCcw size={18} className="animate-spin" />
                                        <span>Processing...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Submit Request</span>
                                        <ArrowRight size={20} />
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
