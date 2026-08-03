import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { payrollService, StaffMember, StaffPayrollHistoryItem, StaffAllowance, StaffDeduction } from '../../services/payroll.service';
import { ArrowLeft, ChevronRight, Pencil, X, Plus, Trash2, Loader2 } from 'lucide-react';

interface Props {
    staffId: string;
    onBack: () => void;
    onUpdated?: () => void;
}

const fmtDate = (s: string) => {
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

type DetailTab = 'history' | 'profile' | 'changelog';

const fmt = (n: number) => n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white placeholder:text-gray-400';
const LABEL = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1';
const SELECT = `${INPUT} appearance-none`;

export const StaffMemberDetail: React.FC<Props> = ({ staffId, onBack, onUpdated }) => {
    const [activeTab, setActiveTab] = useState<DetailTab>('history');
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const qc = useQueryClient();

    const { data: member } = useQuery<StaffMember>({
        queryKey: ['staff-member', staffId],
        queryFn: () => payrollService.getStaffMember(staffId),
    });

    const { data: history = [], isLoading: historyLoading } = useQuery<StaffPayrollHistoryItem[]>({
        queryKey: ['staff-history', staffId],
        queryFn: () => payrollService.getStaffPayrollHistory(staffId),
    });

    // Edit form state
    const [firstName, setFirstName] = useState('');
    const [middleName, setMiddleName] = useState('');
    const [lastName, setLastName] = useState('');
    const [gender, setGender] = useState('');
    const [dob, setDob] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [department, setDepartment] = useState('');
    const [position, setPosition] = useState('');
    const [idType, setIdType] = useState('');
    const [idNumber, setIdNumber] = useState('');
    const [napsaNumber, setNapsaNumber] = useState('');
    const [nhimaNumber, setNhimaNumber] = useState('');
    const [zraTpin, setZraTpin] = useState('');
    const [basicPay, setBasicPay] = useState('');
    const [allowances, setAllowances] = useState<StaffAllowance[]>([]);
    const [deductions, setDeductions] = useState<StaffDeduction[]>([]);

    const openEdit = () => {
        if (!member) return;
        setFirstName(member.first_name ?? '');
        setMiddleName(member.middle_name ?? '');
        setLastName(member.last_name ?? '');
        setGender(member.gender ?? '');
        setDob(member.date_of_birth ?? '');
        setPhone(member.phone ?? '');
        setEmail(member.email ?? '');
        setDepartment(member.department ?? '');
        setPosition(member.position ?? '');
        setIdType(member.id_type ?? 'NRC');
        setIdNumber(member.id_number ?? '');
        setNapsaNumber(member.napsa_number ?? '');
        setNhimaNumber(member.nhima_number ?? '');
        setZraTpin(member.zra_tpin ?? '');
        setBasicPay(String(member.basic_pay ?? ''));
        setAllowances(member.allowances ? [...member.allowances] : []);
        setDeductions(member.deductions ? [...member.deductions] : []);
        setSaveError('');
        setEditing(true);
    };

    const addAllowance = () => setAllowances(prev => [...prev, { name: '', amount: 0 }]);
    const removeAllowance = (i: number) => setAllowances(prev => prev.filter((_, idx) => idx !== i));
    const updateAllowance = (i: number, field: 'name' | 'amount', val: string) =>
        setAllowances(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: field === 'amount' ? parseFloat(val) || 0 : val } : a));

    const addDeduction = () => setDeductions(prev => [...prev, { name: '', amount: 0, type: 'FIXED' }]);
    const removeDeduction = (i: number) => setDeductions(prev => prev.filter((_, idx) => idx !== i));
    const updateDeduction = (i: number, field: string, val: string) =>
        setDeductions(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: field === 'amount' ? parseFloat(val) || 0 : val } : d));

    const handleSave = async () => {
        setSaving(true);
        setSaveError('');
        try {
            await payrollService.updateStaffMember(staffId, {
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
                basic_pay: parseFloat(basicPay) || undefined,
                allowances,
                deductions: deductions as any,
            });
            await qc.invalidateQueries({ queryKey: ['staff-member', staffId] });
            await qc.invalidateQueries({ queryKey: ['staff-members'] });
            setEditing(false);
            onUpdated?.();
        } catch (err: any) {
            setSaveError(err?.response?.data?.error ?? err.message ?? 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const fullName = member ? [member.first_name, member.last_name].filter(Boolean).join(' ') : '—';

    const tabs: { value: DetailTab; label: string }[] = [
        { value: 'history', label: 'Payroll History' },
        { value: 'profile', label: 'Profile' },
        { value: 'changelog', label: 'Work history' },
    ];

    return (
        <div className="flex-1 px-5 pb-5 flex flex-col gap-4 h-full overflow-hidden">
            <div className="flex-1 bg-white rounded-[20px] border border-gray-200 flex flex-col overflow-hidden px-5 py-3.5 gap-4">

                {/* Header */}
                <div className="flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={onBack}
                            className="p-2.5 rounded-[50px] hover:bg-gray-100 transition-colors"
                        >
                            <ArrowLeft size={14} />
                        </button>
                        <span className="text-base font-semibold text-black font-['IBM_Plex_Sans_Devanagari']">{fullName}</span>
                    </div>
                    <button
                        onClick={openEdit}
                        className="flex items-center gap-1.5 h-8 px-4 py-2 bg-white rounded-lg shadow-[0px_3px_3px_0px_rgba(0,0,0,0.05)] border border-zinc-100 text-xs font-semibold text-black font-['DM_Sans'] leading-5 hover:bg-gray-50 transition-colors"
                    >
                        <Pencil size={11} />
                        Edit Profile
                    </button>
                </div>

                {/* Bio strip */}
                <div className="h-20 px-6 rounded-xl border border-gray-200 flex items-center gap-20 flex-shrink-0">
                    <div className="flex-1 flex flex-col items-center gap-px">
                        <span className="text-[8px] font-semibold text-stone-300 font-['IBM_Plex_Sans_Devanagari'] leading-5">Employee Name</span>
                        <span className="text-xs font-bold text-black font-['IBM_Plex_Sans_Devanagari'] leading-5">{fullName}</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-px">
                        <span className="text-[8px] font-semibold text-stone-300 font-['IBM_Plex_Sans_Devanagari'] leading-5">Contact</span>
                        <span className="text-xs font-bold text-black font-['IBM_Plex_Sans_Devanagari'] leading-5">{member?.phone ?? '—'}</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-px">
                        <span className="text-[8px] font-semibold text-stone-300 font-['IBM_Plex_Sans_Devanagari'] leading-5">Email</span>
                        <span className="text-xs font-bold text-black font-['IBM_Plex_Sans_Devanagari'] leading-5">{member?.email ?? '—'}</span>
                    </div>
                </div>

                {/* Tab strip */}
                <div className="p-1 bg-slate-100 rounded-[60px] shadow-[inset_0px_4px_4px_0px_rgba(0,0,0,0.05)] flex items-center gap-2 flex-shrink-0">
                    {tabs.map(tab => (
                        <button
                            key={tab.value}
                            onClick={() => setActiveTab(tab.value)}
                            className={`flex-1 px-4 py-1 rounded-[50px] flex items-center justify-center gap-2.5 text-[10px] font-['IBM_Plex_Sans_Devanagari'] leading-6 transition-all ${
                                activeTab === tab.value
                                    ? 'bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.15)] font-medium text-black'
                                    : 'font-normal text-zinc-800 hover:bg-white/50'
                            }`}
                        >
                            {activeTab === tab.value && (
                                <span className="w-1.5 h-1.5 bg-blue-700 rounded-full" />
                            )}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 py-3.5 bg-white rounded-xl flex flex-col gap-4 overflow-hidden">

                    {activeTab === 'history' && (
                        <>
                            <span className="text-sm font-bold text-black font-['DM_Sans'] leading-5 flex-shrink-0">Payroll History</span>
                            <div className="flex-1 overflow-y-auto flex flex-col gap-2.5">
                                {historyLoading ? (
                                    <div className="flex items-center justify-center h-20 text-sm text-gray-400">Loading…</div>
                                ) : history.length === 0 ? (
                                    <div className="flex items-center justify-center h-20 text-sm text-gray-400">No payroll history yet</div>
                                ) : history.map(item => {
                                    const run = item.payroll_runs;
                                    return (
                                        <div key={item.id} className="p-5 bg-white rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.05)] border border-gray-200 flex items-center justify-between">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-xs font-medium text-black font-['DM_Sans'] leading-5">{run.period_label}</span>
                                                <span className="text-[10px] text-gray-400">Net: K{fmt(item.net_pay)} · Gross: K{fmt(item.gross_pay)}</span>
                                            </div>
                                            <button className="w-4 h-4 flex items-center justify-center">
                                                <ChevronRight size={14} className="text-gray-400" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {activeTab === 'profile' && member && (
                        <div className="flex-1 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { label: 'Employee #', value: member.employee_number },
                                    { label: 'Department', value: member.department },
                                    { label: 'Position', value: member.position },
                                    { label: 'Gender', value: member.gender },
                                    { label: 'Date of Birth', value: member.date_of_birth ? fmtDate(member.date_of_birth) : undefined },
                                    { label: 'ID Type', value: member.id_type },
                                    { label: 'ID Number', value: member.id_number },
                                    { label: 'NAPSA Number', value: member.napsa_number },
                                    { label: 'NHIMA Number', value: member.nhima_number },
                                    { label: 'ZRA TPIN', value: member.zra_tpin },
                                    { label: 'Basic Pay', value: member.basic_pay ? `K${fmt(member.basic_pay)}` : undefined },
                                    { label: 'Payment Method', value: member.payment_method },
                                    { label: 'Bank', value: member.bank_name },
                                    { label: 'Account Number', value: member.bank_account_number },
                                    { label: 'Mobile Money', value: member.mobile_money_number },
                                ].map(field => (
                                    <div key={field.label} className="flex flex-col gap-0.5">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{field.label}</span>
                                        <span className="text-xs text-gray-900 font-medium">{field.value ?? '—'}</span>
                                    </div>
                                ))}
                            </div>

                            {(member.allowances?.length > 0 || member.deductions?.length > 0) && (
                                <div className="mt-4 grid grid-cols-2 gap-4">
                                    {member.allowances?.length > 0 && (
                                        <div>
                                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Allowances</span>
                                            {member.allowances.map((a, i) => (
                                                <div key={i} className="flex justify-between text-xs py-0.5">
                                                    <span className="text-gray-600">{a.name}</span>
                                                    <span className="font-medium">K{fmt(a.amount)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {member.deductions?.length > 0 && (
                                        <div>
                                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Deductions</span>
                                            {member.deductions.map((d, i) => (
                                                <div key={i} className="flex justify-between text-xs py-0.5">
                                                    <span className="text-gray-600">{d.name}</span>
                                                    <span className="font-medium">K{fmt(d.amount)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'changelog' && (
                        <div className="flex items-center justify-center h-20 text-sm text-gray-400">Work history coming soon</div>
                    )}
                </div>
            </div>

            {/* Edit Profile modal */}
            {editing && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden max-h-[90vh]">

                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                            <div>
                                <h2 className="text-base font-bold text-gray-900">Edit Profile</h2>
                                <p className="text-xs text-gray-500 mt-0.5">{fullName}</p>
                            </div>
                            <button onClick={() => setEditing(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">

                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Personal Information</p>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={LABEL}>First Name</label>
                                    <input className={INPUT} value={firstName} onChange={e => setFirstName(e.target.value)} />
                                </div>
                                <div>
                                    <label className={LABEL}>Middle Name</label>
                                    <input className={INPUT} value={middleName} onChange={e => setMiddleName(e.target.value)} />
                                </div>
                            </div>
                            <div>
                                <label className={LABEL}>Last Name</label>
                                <input className={INPUT} value={lastName} onChange={e => setLastName(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={LABEL}>Gender</label>
                                    <select className={`${SELECT}`} value={gender} onChange={e => setGender(e.target.value)}>
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
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={LABEL}>Phone</label>
                                    <input className={INPUT} value={phone} onChange={e => setPhone(e.target.value)} />
                                </div>
                                <div>
                                    <label className={LABEL}>Email</label>
                                    <input type="email" className={INPUT} value={email} onChange={e => setEmail(e.target.value)} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={LABEL}>Department</label>
                                    <input className={INPUT} value={department} onChange={e => setDepartment(e.target.value)} />
                                </div>
                                <div>
                                    <label className={LABEL}>Position</label>
                                    <input className={INPUT} value={position} onChange={e => setPosition(e.target.value)} />
                                </div>
                            </div>

                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mt-2">Identification & Statutory</p>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={LABEL}>ID Type</label>
                                    <select className={`${SELECT}`} value={idType} onChange={e => setIdType(e.target.value)}>
                                        <option value="NRC">NRC</option>
                                        <option value="Passport">Passport</option>
                                        <option value="Driver's License">Driver's License</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={LABEL}>ID Number</label>
                                    <input className={INPUT} value={idNumber} onChange={e => setIdNumber(e.target.value)} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={LABEL}>NAPSA Number</label>
                                    <input className={INPUT} value={napsaNumber} onChange={e => setNapsaNumber(e.target.value)} />
                                </div>
                                <div>
                                    <label className={LABEL}>NHIMA Number</label>
                                    <input className={INPUT} value={nhimaNumber} onChange={e => setNhimaNumber(e.target.value)} />
                                </div>
                            </div>
                            <div>
                                <label className={LABEL}>ZRA TPIN</label>
                                <input className={INPUT} value={zraTpin} onChange={e => setZraTpin(e.target.value)} />
                            </div>

                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mt-2">Pay Structure</p>

                            <div>
                                <label className={LABEL}>Basic Pay (K)</label>
                                <input type="number" min="0" className={INPUT} value={basicPay} onChange={e => setBasicPay(e.target.value)} />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className={LABEL}>Allowances</label>
                                    <button type="button" onClick={addAllowance} className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold hover:text-blue-700">
                                        <Plus size={11} /> Add
                                    </button>
                                </div>
                                {allowances.length === 0 && <p className="text-xs text-gray-400 italic">None</p>}
                                {allowances.map((a, i) => (
                                    <div key={i} className="flex items-center gap-2 mb-2">
                                        <input className={`${INPUT} flex-1`} value={a.name} onChange={e => updateAllowance(i, 'name', e.target.value)} placeholder="Name" />
                                        <input type="number" min="0" className={`${INPUT} w-28`} value={a.amount || ''} onChange={e => updateAllowance(i, 'amount', e.target.value)} placeholder="Amount" />
                                        <button type="button" onClick={() => removeAllowance(i)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
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
                                {deductions.length === 0 && <p className="text-xs text-gray-400 italic">None</p>}
                                {deductions.map((d, i) => (
                                    <div key={i} className="flex items-center gap-2 mb-2">
                                        <input className={`${INPUT} flex-1`} value={d.name} onChange={e => updateDeduction(i, 'name', e.target.value)} placeholder="Name" />
                                        <input type="number" min="0" className={`${INPUT} w-28`} value={d.amount || ''} onChange={e => updateDeduction(i, 'amount', e.target.value)} placeholder="Amount" />
                                        <select className={`${SELECT} w-24`} value={d.type} onChange={e => updateDeduction(i, 'type', e.target.value)}>
                                            <option value="FIXED">Fixed</option>
                                            <option value="LOAN">Loan</option>
                                            <option value="ADVANCE">Advance</option>
                                        </select>
                                        <button type="button" onClick={() => removeDeduction(i)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                                    </div>
                                ))}
                            </div>

                            {saveError && <p className="text-xs text-red-600 font-medium">{saveError}</p>}
                        </div>

                        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0">
                            <button
                                onClick={() => setEditing(false)}
                                className="h-9 px-4 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="h-9 px-5 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {saving ? <><Loader2 size={12} className="animate-spin" />Saving…</> : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
