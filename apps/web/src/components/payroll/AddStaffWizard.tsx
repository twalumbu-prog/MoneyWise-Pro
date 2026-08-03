import React, { useState, useEffect } from 'react';
import { payrollService, StaffAllowance, StaffDeduction } from '../../services/payroll.service';
import { lencoService } from '../../services/lenco.service';
import { useAuth } from '../../context/AuthContext';
import { X, Plus, Trash2, ChevronRight, Loader2, CheckCircle2, AlertCircle, CreditCard, Smartphone } from 'lucide-react';

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

type Stage = 1 | 2 | 3 | 4;

const STAGE_LABELS: Record<Stage, string> = {
    1: 'Personal Information',
    2: 'Identification & Statutory',
    3: 'Banking & Payment',
    4: 'Pay Structure',
};

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white placeholder:text-gray-400';
const LABEL = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1';
const SELECT = `${INPUT} appearance-none bg-white`;

function detectNetwork(phone: string): string {
    const n = phone.replace(/[^0-9]/g, '');
    if (n.startsWith('097') || n.startsWith('077')) return 'AIRTEL';
    if (n.startsWith('096') || n.startsWith('076')) return 'MTN';
    if (n.startsWith('095') || n.startsWith('075')) return 'ZAMTEL';
    return '';
}

const networkColors: Record<string, string> = {
    AIRTEL: 'text-red-600 border-red-200 bg-red-50',
    MTN: 'text-amber-600 border-amber-200 bg-amber-50',
    ZAMTEL: 'text-emerald-600 border-emerald-200 bg-emerald-50',
};

export const AddStaffWizard: React.FC<Props> = ({ onClose, onSuccess }) => {
    const { organizationId } = useAuth();
    const [stage, setStage] = useState<Stage>(1);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Stage 1 – Personal
    const [firstName, setFirstName] = useState('');
    const [middleName, setMiddleName] = useState('');
    const [lastName, setLastName] = useState('');
    const [gender, setGender] = useState('');
    const [dob, setDob] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [department, setDepartment] = useState('');
    const [position, setPosition] = useState('');

    // Stage 2 – Statutory IDs
    const [idType, setIdType] = useState('NRC');
    const [idNumber, setIdNumber] = useState('');
    const [napsaNumber, setNapsaNumber] = useState('');
    const [nhimaNumber, setNhimaNumber] = useState('');
    const [zraTpin, setZraTpin] = useState('');

    // Stage 3 – Bank Account (optional, expandable)
    const [bankEnabled, setBankEnabled] = useState(false);
    const [banks, setBanks] = useState<any[]>([]);
    const [bankId, setBankId] = useState('');
    const [bankAccountNumber, setBankAccountNumber] = useState('');
    const [bankResolving, setBankResolving] = useState(false);
    const [bankResolvedName, setBankResolvedName] = useState('');
    const [bankResolveError, setBankResolveError] = useState('');

    // Stage 3 – Mobile Money (optional, expandable)
    const [mobileEnabled, setMobileEnabled] = useState(false);
    const [mobileNumber, setMobileNumber] = useState('');
    const [mobileNetwork, setMobileNetwork] = useState('');
    const [mobileResolving, setMobileResolving] = useState(false);
    const [mobileResolvedName, setMobileResolvedName] = useState('');
    const [mobileResolveError, setMobileResolveError] = useState('');

    // Stage 3 – Preferred method (when both are added)
    const [preferredMethod, setPreferredMethod] = useState<'BANK' | 'MOBILE_MONEY'>('BANK');

    // Stage 4 – Pay structure
    const [basicPay, setBasicPay] = useState('');
    const [allowances, setAllowances] = useState<StaffAllowance[]>([]);
    const [deductions, setDeductions] = useState<StaffDeduction[]>([]);

    // Load banks list when bank section is opened
    useEffect(() => {
        if (stage === 3 && bankEnabled && banks.length === 0) {
            lencoService.getBanks().then(setBanks).catch(() => {});
        }
    }, [stage, bankEnabled]);

    // Auto-resolve bank account
    useEffect(() => {
        if (!bankEnabled || !bankAccountNumber || !bankId) {
            setBankResolvedName('');
            setBankResolveError('');
            return;
        }
        if (bankAccountNumber.length < 5) return;

        const t = setTimeout(async () => {
            setBankResolving(true);
            setBankResolvedName('');
            setBankResolveError('');
            try {
                const res = await lencoService.resolveBankAccount(bankAccountNumber, bankId, organizationId ?? undefined);
                setBankResolvedName(res.accountName || res.account_name || res.name || '');
            } catch {
                setBankResolveError('Could not verify account. Please check the details.');
            } finally {
                setBankResolving(false);
            }
        }, 600);

        return () => clearTimeout(t);
    }, [bankAccountNumber, bankId, bankEnabled]);

    // Auto-detect mobile network and resolve
    useEffect(() => {
        if (!mobileEnabled) return;
        const network = detectNetwork(mobileNumber);
        setMobileNetwork(network);
        setMobileResolvedName('');
        setMobileResolveError('');

        if (!network || mobileNumber.replace(/[^0-9]/g, '').length < 10) return;

        const t = setTimeout(async () => {
            setMobileResolving(true);
            try {
                const res = await lencoService.resolveMobileMoney(mobileNumber, network, organizationId ?? undefined);
                setMobileResolvedName(res.accountName || res.account_name || res.name || '');
            } catch {
                setMobileResolveError('Could not verify number. Please check.');
            } finally {
                setMobileResolving(false);
            }
        }, 600);

        return () => clearTimeout(t);
    }, [mobileNumber, mobileEnabled]);

    const addAllowance = () => setAllowances(prev => [...prev, { name: '', amount: 0 }]);
    const removeAllowance = (i: number) => setAllowances(prev => prev.filter((_, idx) => idx !== i));
    const updateAllowance = (i: number, field: 'name' | 'amount', val: string) =>
        setAllowances(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: field === 'amount' ? parseFloat(val) || 0 : val } : a));

    const addDeduction = () => setDeductions(prev => [...prev, { name: '', amount: 0, type: 'FIXED' }]);
    const removeDeduction = (i: number) => setDeductions(prev => prev.filter((_, idx) => idx !== i));
    const updateDeduction = (i: number, field: string, val: string) =>
        setDeductions(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: field === 'amount' ? parseFloat(val) || 0 : val } : d));

    const canAdvance = () => {
        if (stage === 1) return !!(firstName.trim() && lastName.trim());
        return true;
    };

    // Determine effective payment_method for the record
    const effectivePaymentMethod = (): 'BANK' | 'MOBILE_MONEY' => {
        const hasBankData = bankEnabled && bankAccountNumber.trim();
        const hasMobileData = mobileEnabled && mobileNumber.trim();
        if (hasBankData && hasMobileData) return preferredMethod;
        if (hasBankData) return 'BANK';
        if (hasMobileData) return 'MOBILE_MONEY';
        return 'BANK';
    };

    const handleSubmit = async () => {
        if (!parseFloat(basicPay)) { setError('Basic pay is required'); return; }
        setSaving(true);
        setError('');

        const bankNameLabel = banks.find(b => b.id === bankId)?.name || '';
        const pm = effectivePaymentMethod();

        try {
            await payrollService.createStaffMember({
                first_name: firstName.trim(),
                middle_name: middleName.trim() || undefined,
                last_name: lastName.trim(),
                gender: gender || undefined,
                date_of_birth: dob || undefined,
                phone: phone.trim() || undefined,
                email: email.trim() || undefined,
                department: department.trim() || undefined,
                position: position.trim() || undefined,
                id_type: idType || undefined,
                id_number: idNumber.trim() || undefined,
                napsa_number: napsaNumber.trim() || undefined,
                nhima_number: nhimaNumber.trim() || undefined,
                zra_tpin: zraTpin.trim() || undefined,
                payment_method: pm,
                bank_name: bankEnabled ? (bankNameLabel || undefined) : undefined,
                bank_account_number: bankEnabled ? (bankAccountNumber.trim() || undefined) : undefined,
                bank_account_name: bankEnabled ? (bankResolvedName || undefined) : undefined,
                mobile_money_provider: mobileEnabled ? (mobileNetwork || undefined) : undefined,
                mobile_money_number: mobileEnabled ? (mobileNumber.trim() || undefined) : undefined,
                basic_pay: parseFloat(basicPay) || 0,
                allowances,
                deductions: deductions as any,
            });
            onSuccess();
        } catch (err: any) {
            setError(err?.response?.data?.error ?? err.message ?? 'Failed to save');
            setSaving(false);
        }
    };

    const totalStages: Stage[] = [1, 2, 3, 4];
    const bothEnabled = bankEnabled && mobileEnabled;
    const bankHasData = bankEnabled && bankAccountNumber.trim();
    const mobileHasData = mobileEnabled && mobileNumber.trim();

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <div>
                        <h2 className="text-base font-bold text-gray-900">Add Staff Member</h2>
                        <p className="text-xs text-gray-500 mt-0.5">{STAGE_LABELS[stage]}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
                        <X size={16} />
                    </button>
                </div>

                {/* Stage indicator */}
                <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 flex-shrink-0">
                    {totalStages.map(s => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                                s < stage ? 'bg-blue-600 text-white' :
                                s === stage ? 'bg-blue-600 text-white' :
                                'bg-gray-100 text-gray-400'
                            }`}>
                                {s < stage ? '✓' : s}
                            </div>
                            {s < 4 && <div className={`h-px w-8 ${s < stage ? 'bg-blue-600' : 'bg-gray-200'}`} />}
                        </div>
                    ))}
                    <span className="ml-2 text-[10px] text-gray-400">Step {stage} of 4</span>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5">

                    {stage === 1 && (
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={LABEL}>First Name *</label>
                                    <input className={INPUT} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
                                </div>
                                <div>
                                    <label className={LABEL}>Middle Name</label>
                                    <input className={INPUT} value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="Middle name" />
                                </div>
                            </div>
                            <div>
                                <label className={LABEL}>Last Name *</label>
                                <input className={INPUT} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={LABEL}>Gender</label>
                                    <select className={SELECT} value={gender} onChange={e => setGender(e.target.value)}>
                                        <option value="">Select</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={LABEL}>Date of Birth</label>
                                    <input type="date" className={INPUT} value={dob} onChange={e => setDob(e.target.value)} />
                                </div>
                            </div>
                            <div>
                                <label className={LABEL}>Phone</label>
                                <input className={INPUT} value={phone} onChange={e => setPhone(e.target.value)} placeholder="0977 000 000" />
                            </div>
                            <div>
                                <label className={LABEL}>Email</label>
                                <input type="email" className={INPUT} value={email} onChange={e => setEmail(e.target.value)} placeholder="employee@email.com" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={LABEL}>Department</label>
                                    <input className={INPUT} value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Education" />
                                </div>
                                <div>
                                    <label className={LABEL}>Position</label>
                                    <input className={INPUT} value={position} onChange={e => setPosition(e.target.value)} placeholder="e.g. Teacher" />
                                </div>
                            </div>
                        </div>
                    )}

                    {stage === 2 && (
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={LABEL}>ID Type</label>
                                    <select className={SELECT} value={idType} onChange={e => setIdType(e.target.value)}>
                                        <option value="NRC">NRC</option>
                                        <option value="Passport">Passport</option>
                                        <option value="Driver's License">Driver's License</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={LABEL}>ID Number</label>
                                    <input className={INPUT} value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="e.g. 123456/78/1" />
                                </div>
                            </div>
                            <div>
                                <label className={LABEL}>NAPSA Number</label>
                                <input className={INPUT} value={napsaNumber} onChange={e => setNapsaNumber(e.target.value)} placeholder="NAPSA member number" />
                            </div>
                            <div>
                                <label className={LABEL}>NHIMA Number</label>
                                <input className={INPUT} value={nhimaNumber} onChange={e => setNhimaNumber(e.target.value)} placeholder="NHIMA member number" />
                            </div>
                            <div>
                                <label className={LABEL}>ZRA TPIN</label>
                                <input className={INPUT} value={zraTpin} onChange={e => setZraTpin(e.target.value)} placeholder="Tax Payer ID Number" />
                            </div>
                        </div>
                    )}

                    {stage === 3 && (
                        <div className="flex flex-col gap-4">
                            <p className="text-xs text-gray-500">Add one or both payment methods. If both are added, select which is preferred for salary disbursement.</p>

                            {/* Bank Account section */}
                            <div className={`rounded-xl border transition-all ${bankEnabled ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'}`}>
                                <button
                                    type="button"
                                    onClick={() => setBankEnabled(v => !v)}
                                    className="w-full flex items-center justify-between px-4 py-3"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                                            <CreditCard size={18} className={bankEnabled ? 'text-blue-600' : 'text-gray-400'} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs font-semibold text-gray-900">Bank Account</p>
                                            {bankEnabled && bankResolvedName && (
                                                <p className="text-[10px] text-green-600 font-medium">{bankResolvedName}</p>
                                            )}
                                            {!bankEnabled && <p className="text-[10px] text-gray-400">Click to add bank account details</p>}
                                        </div>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${bankEnabled ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                                        {bankEnabled && <div className="w-2 h-2 rounded-full bg-white" />}
                                    </div>
                                </button>

                                {bankEnabled && (
                                    <div className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-100 pt-3">
                                        <div>
                                            <label className={LABEL}>Bank</label>
                                            <select
                                                className={SELECT}
                                                value={bankId}
                                                onChange={e => { setBankId(e.target.value); setBankResolvedName(''); setBankResolveError(''); }}
                                            >
                                                <option value="">Select bank</option>
                                                {banks.length > 0
                                                    ? banks.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)
                                                    : ['Zanaco','Standard Chartered','FNB Zambia','Stanbic Bank','Atlas Mara','Absa Bank Zambia','First Capital Bank','Access Bank'].map(b => (
                                                        <option key={b} value={b}>{b}</option>
                                                    ))
                                                }
                                            </select>
                                        </div>
                                        <div>
                                            <label className={LABEL}>Account Number</label>
                                            <input
                                                className={INPUT}
                                                value={bankAccountNumber}
                                                onChange={e => { setBankAccountNumber(e.target.value); setBankResolvedName(''); setBankResolveError(''); }}
                                                placeholder="Bank account number"
                                            />
                                        </div>
                                        {(bankResolving || bankResolvedName || bankResolveError) && (
                                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                                                bankResolving ? 'bg-gray-50 text-gray-500' :
                                                bankResolvedName ? 'bg-green-50 text-green-800 border border-green-200' :
                                                'bg-red-50 text-red-700 border border-red-200'
                                            }`}>
                                                {bankResolving && <Loader2 size={12} className="animate-spin flex-shrink-0" />}
                                                {bankResolvedName && <CheckCircle2 size={12} className="text-green-600 flex-shrink-0" />}
                                                {bankResolveError && <AlertCircle size={12} className="text-red-500 flex-shrink-0" />}
                                                <span>{bankResolving ? 'Verifying account…' : bankResolvedName || bankResolveError}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Mobile Money section */}
                            <div className={`rounded-xl border transition-all ${mobileEnabled ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'}`}>
                                <button
                                    type="button"
                                    onClick={() => setMobileEnabled(v => !v)}
                                    className="w-full flex items-center justify-between px-4 py-3"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                                            <Smartphone size={18} className={mobileEnabled ? 'text-blue-600' : 'text-gray-400'} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs font-semibold text-gray-900">Mobile Money</p>
                                            {mobileEnabled && mobileResolvedName && (
                                                <p className="text-[10px] text-green-600 font-medium">{mobileResolvedName} · {mobileNetwork}</p>
                                            )}
                                            {!mobileEnabled && <p className="text-[10px] text-gray-400">Click to add mobile money number</p>}
                                        </div>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${mobileEnabled ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                                        {mobileEnabled && <div className="w-2 h-2 rounded-full bg-white" />}
                                    </div>
                                </button>

                                {mobileEnabled && (
                                    <div className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-100 pt-3">
                                        <div>
                                            <label className={LABEL}>Mobile Money Number</label>
                                            <div className="relative">
                                                <input
                                                    className={INPUT}
                                                    value={mobileNumber}
                                                    onChange={e => { setMobileNumber(e.target.value); setMobileResolvedName(''); setMobileResolveError(''); }}
                                                    placeholder="0977 000 000"
                                                />
                                                {mobileNetwork && (
                                                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold px-2 py-0.5 rounded border ${networkColors[mobileNetwork] || 'text-gray-600 border-gray-200 bg-gray-50'}`}>
                                                        {mobileNetwork}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1">Network is auto-detected from the number</p>
                                        </div>
                                        {(mobileResolving || mobileResolvedName || mobileResolveError) && (
                                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                                                mobileResolving ? 'bg-gray-50 text-gray-500' :
                                                mobileResolvedName ? 'bg-green-50 text-green-800 border border-green-200' :
                                                'bg-red-50 text-red-700 border border-red-200'
                                            }`}>
                                                {mobileResolving && <Loader2 size={12} className="animate-spin flex-shrink-0" />}
                                                {mobileResolvedName && <CheckCircle2 size={12} className="text-green-600 flex-shrink-0" />}
                                                {mobileResolveError && <AlertCircle size={12} className="text-red-500 flex-shrink-0" />}
                                                <span>{mobileResolving ? 'Verifying number…' : mobileResolvedName || mobileResolveError}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Preferred method — only shown when both are added with data */}
                            {bothEnabled && bankHasData && mobileHasData && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                                    <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-2">Preferred Payment Method</p>
                                    <p className="text-[10px] text-amber-600 mb-3">Both methods are added. Select which to use by default for salary disbursement.</p>
                                    <div className="flex gap-3">
                                        {(['BANK', 'MOBILE_MONEY'] as const).map(m => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => setPreferredMethod(m)}
                                                className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${
                                                    preferredMethod === m
                                                        ? 'border-amber-500 bg-amber-100 text-amber-800'
                                                        : 'border-amber-200 bg-white text-amber-600 hover:border-amber-300'
                                                }`}
                                            >
                                                {m === 'BANK' ? 'Bank Account' : 'Mobile Money'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {stage === 4 && (
                        <div className="flex flex-col gap-4">
                            <div>
                                <label className={LABEL}>Basic Pay (K) *</label>
                                <input
                                    type="number"
                                    min="0"
                                    className={INPUT}
                                    value={basicPay}
                                    onChange={e => setBasicPay(e.target.value)}
                                    placeholder="e.g. 5000.00"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className={LABEL}>Allowances</label>
                                    <button type="button" onClick={addAllowance} className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold hover:text-blue-700">
                                        <Plus size={11} /> Add
                                    </button>
                                </div>
                                {allowances.length === 0 && <p className="text-xs text-gray-400 italic">No allowances added</p>}
                                {allowances.map((a, i) => (
                                    <div key={i} className="flex items-center gap-2 mb-2">
                                        <input className={`${INPUT} flex-1`} value={a.name} onChange={e => updateAllowance(i, 'name', e.target.value)} placeholder="e.g. Housing" />
                                        <input type="number" min="0" className={`${INPUT} w-28`} value={a.amount || ''} onChange={e => updateAllowance(i, 'amount', e.target.value)} placeholder="Amount" />
                                        <button type="button" onClick={() => removeAllowance(i)} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className={LABEL}>Standing Deductions</label>
                                    <button type="button" onClick={addDeduction} className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold hover:text-blue-700">
                                        <Plus size={11} /> Add
                                    </button>
                                </div>
                                {deductions.length === 0 && <p className="text-xs text-gray-400 italic">No standing deductions</p>}
                                {deductions.map((d, i) => (
                                    <div key={i} className="flex items-center gap-2 mb-2">
                                        <input className={`${INPUT} flex-1`} value={d.name} onChange={e => updateDeduction(i, 'name', e.target.value)} placeholder="e.g. Staff loan" />
                                        <input type="number" min="0" className={`${INPUT} w-28`} value={d.amount || ''} onChange={e => updateDeduction(i, 'amount', e.target.value)} placeholder="Amount" />
                                        <select className={`${SELECT} w-24`} value={d.type} onChange={e => updateDeduction(i, 'type', e.target.value)}>
                                            <option value="FIXED">Fixed</option>
                                            <option value="LOAN">Loan</option>
                                            <option value="ADVANCE">Advance</option>
                                        </select>
                                        <button type="button" onClick={() => removeDeduction(i)} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0">
                    <button
                        onClick={() => stage > 1 ? setStage((stage - 1) as Stage) : onClose()}
                        className="h-9 px-4 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        {stage === 1 ? 'Cancel' : 'Back'}
                    </button>
                    <button
                        onClick={() => {
                            if (stage < 4) setStage((stage + 1) as Stage);
                            else handleSubmit();
                        }}
                        disabled={!canAdvance() || saving}
                        className="h-9 px-5 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {stage < 4 ? (
                            <>Next <ChevronRight size={13} /></>
                        ) : (
                            saving ? 'Saving…' : 'Save Staff Member'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
