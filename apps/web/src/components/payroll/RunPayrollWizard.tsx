import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { payrollService, StaffMember } from '../../services/payroll.service';
import { useAuth } from '../../context/AuthContext';
import { X, Plus, Trash2, ChevronRight, Search } from 'lucide-react';

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

type Stage = 1 | 2 | 3 | 4;

const STAGE_LABELS: Record<Stage, string> = {
    1: 'Select Period & Overtime',
    2: 'Bonuses & Adjustments',
    3: 'Deductions',
    4: 'Review & Payment Method',
};

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white placeholder:text-gray-400';
const LABEL = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1';
const SELECT = `${INPUT} appearance-none`;

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface PayrollItem {
    staff_id: string;
    staff_name: string;
    basic_pay: number;
    overtime: number;
    taxable_allowances: number;
    non_taxable_allowances: number;
    loans: number;
    other_deductions: number;
    payment_method: 'BANK' | 'MOBILE_MONEY';
    bank_name?: string;
    bank_account_number?: string;
    mobile_money_number?: string;
}

const fmt = (n: number) => n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const calcGross = (item: PayrollItem) => item.basic_pay + item.overtime + item.taxable_allowances + item.non_taxable_allowances;
const NAPSA_RATE = 0.05;
const NAPSA_CEILING = 1073.15;
const NHIMA_RATE = 0.01;
function calcPAYE(g: number) {
    if (g <= 4800) return 0;
    if (g <= 9600) return (g - 4800) * 0.20;
    if (g <= 16000) return (9600 - 4800) * 0.20 + (g - 9600) * 0.30;
    return (9600 - 4800) * 0.20 + (16000 - 9600) * 0.30 + (g - 16000) * 0.375;
}
const calcStatutory = (g: number) => Math.min(g, NAPSA_CEILING) * NAPSA_RATE + g * NHIMA_RATE + calcPAYE(g);
const calcNet = (item: PayrollItem) => {
    const g = calcGross(item);
    return g - calcStatutory(g) - item.loans - item.other_deductions;
};

export const RunPayrollWizard: React.FC<Props> = ({ onClose, onSuccess }) => {
    const { organizationId } = useAuth();
    const now = new Date();
    const [stage, setStage] = useState<Stage>(1);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [notes, setNotes] = useState('');

    const [items, setItems] = useState<PayrollItem[]>([]);
    const [staffSearch, setStaffSearch] = useState('');
    const [bonusSearch] = useState('');

    const { data: allStaff = [] } = useQuery<StaffMember[]>({
        queryKey: ['payroll-staff-all', organizationId],
        queryFn: () => payrollService.listStaff(),
        enabled: !!organizationId,
    });

    // Auto-populate items from active staff on first load
    useEffect(() => {
        if (allStaff.length > 0 && items.length === 0) {
            setItems(allStaff.filter(s => s.status === 'ACTIVE').map(s => ({
                staff_id: s.id,
                staff_name: `${s.first_name} ${s.last_name}`,
                basic_pay: s.basic_pay,
                overtime: 0,
                taxable_allowances: s.allowances?.reduce((sum, a) => sum + a.amount, 0) ?? 0,
                non_taxable_allowances: 0,
                loans: s.deductions?.filter(d => d.type === 'LOAN' || d.type === 'ADVANCE').reduce((sum, d) => sum + d.amount, 0) ?? 0,
                other_deductions: s.deductions?.filter(d => d.type === 'FIXED').reduce((sum, d) => sum + d.amount, 0) ?? 0,
                payment_method: s.payment_method === 'MOBILE_MONEY' ? 'MOBILE_MONEY' : 'BANK',
                bank_name: s.bank_name,
                bank_account_number: s.bank_account_number,
                mobile_money_number: s.mobile_money_number,
            })));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allStaff]);

    const updateItem = (idx: number, field: keyof PayrollItem, val: any) => {
        setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
    };

    const addStaffToRun = (s: StaffMember) => {
        if (items.some(i => i.staff_id === s.id)) return;
        setItems(prev => [...prev, {
            staff_id: s.id,
            staff_name: `${s.first_name} ${s.last_name}`,
            basic_pay: s.basic_pay,
            overtime: 0,
            taxable_allowances: s.allowances?.reduce((sum, a) => sum + a.amount, 0) ?? 0,
            non_taxable_allowances: 0,
            loans: 0,
            other_deductions: 0,
            payment_method: 'BANK',
        }]);
    };

    const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

    const totals = items.reduce((acc, item) => {
        const g = calcGross(item);
        const n = calcNet(item);
        return { gross: acc.gross + g, net: acc.net + n };
    }, { gross: 0, net: 0 });

    const handleSubmit = async () => {
        if (items.length === 0) { setError('Add at least one staff member'); return; }
        setSaving(true);
        setError('');
        try {
            await payrollService.createRun({
                period_month: month,
                period_year: year,
                notes: notes.trim() || undefined,
                items: items.map(item => ({
                    staff_id: item.staff_id,
                    staff_name: item.staff_name,
                    basic_pay: item.basic_pay,
                    overtime: item.overtime,
                    taxable_allowances: item.taxable_allowances,
                    non_taxable_allowances: item.non_taxable_allowances,
                    loans: item.loans,
                    other_deductions: item.other_deductions,
                    payment_method: item.payment_method,
                    bank_name: item.bank_name,
                    bank_account_number: item.bank_account_number,
                    mobile_money_number: item.mobile_money_number,
                })),
            });
            onSuccess();
        } catch (err: any) {
            setError(err?.response?.data?.error ?? err.message ?? 'Failed to run payroll');
            setSaving(false);
        }
    };

    const availableToAdd = allStaff.filter(s =>
        s.status === 'ACTIVE' &&
        !items.some(i => i.staff_id === s.id) &&
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(bonusSearch.toLowerCase())
    );

    const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[92vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-bold text-gray-900">Run Payroll</h2>
                        <p className="text-xs text-gray-500 mt-0.5">{STAGE_LABELS[stage]}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
                        <X size={16} />
                    </button>
                </div>

                {/* Step indicators */}
                <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100">
                    {([1, 2, 3, 4] as Stage[]).map(s => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                                s < stage ? 'bg-blue-600 text-white' :
                                s === stage ? 'bg-blue-600 text-white' :
                                'bg-gray-100 text-gray-400'
                            }`}>
                                {s < stage ? '✓' : s}
                            </div>
                            {s < 4 && <div className={`h-px w-10 ${s < stage ? 'bg-blue-600' : 'bg-gray-200'}`} />}
                        </div>
                    ))}
                    <span className="ml-2 text-[10px] text-gray-400">Step {stage} of 4</span>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5">

                    {/* Stage 1: Period + Overtime */}
                    {stage === 1 && (
                        <div className="flex flex-col gap-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={LABEL}>Payroll Month</label>
                                    <select className={SELECT} value={month} onChange={e => setMonth(Number(e.target.value))}>
                                        {MONTH_NAMES.map((m, i) => (
                                            <option key={m} value={i + 1}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={LABEL}>Year</label>
                                    <select className={SELECT} value={year} onChange={e => setYear(Number(e.target.value))}>
                                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className={LABEL}>Notes (optional)</label>
                                <textarea
                                    className={`${INPUT} resize-none`}
                                    rows={2}
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Any notes for this payroll run…"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-800">Staff & Overtime</h3>
                                        <p className="text-xs text-gray-400 mt-0.5">Enter overtime hours/amounts for each employee</p>
                                    </div>
                                    <span className="text-[10px] text-gray-400">{items.length} staff</span>
                                </div>

                                {/* Search to add more staff */}
                                <div className="relative mb-3">
                                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        className={`${INPUT} pl-8 text-xs`}
                                        placeholder="Add staff member…"
                                        value={staffSearch}
                                        onChange={e => setStaffSearch(e.target.value)}
                                    />
                                    {staffSearch && availableToAdd.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(staffSearch.toLowerCase())).length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-32 overflow-y-auto">
                                            {availableToAdd.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(staffSearch.toLowerCase())).map(s => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => { addStaffToRun(s); setStaffSearch(''); }}
                                                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                >
                                                    <Plus size={11} className="text-blue-500" />
                                                    {s.first_name} {s.last_name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {items.length === 0 && (
                                        <p className="text-xs text-gray-400 text-center py-4">No active staff members found. Add staff first.</p>
                                    )}
                                    {items.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                            <span className="flex-1 text-xs font-medium text-gray-800 truncate">{item.staff_name}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-gray-400 whitespace-nowrap">Basic: K{fmt(item.basic_pay)}</span>
                                                <div className="flex flex-col">
                                                    <label className="text-[9px] text-gray-400 mb-0.5">Overtime (K)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                        value={item.overtime || ''}
                                                        onChange={e => updateItem(idx, 'overtime', parseFloat(e.target.value) || 0)}
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                            </div>
                                            <button type="button" onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-400 transition-colors">
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Stage 2: Bonuses */}
                    {stage === 2 && (
                        <div className="flex flex-col gap-4">
                            <p className="text-xs text-gray-500">Add bonuses or adjust allowances for individual employees this period.</p>
                            <div className="space-y-2">
                                {items.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                        <span className="flex-1 text-xs font-medium text-gray-800 truncate">{item.staff_name}</span>
                                        <div className="flex flex-col">
                                            <label className="text-[9px] text-gray-400 mb-0.5">Taxable Allowances (K)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-24 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                value={item.taxable_allowances || ''}
                                                onChange={e => updateItem(idx, 'taxable_allowances', parseFloat(e.target.value) || 0)}
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-[9px] text-gray-400 mb-0.5">Non-Taxable Allowances (K)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-24 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                value={item.non_taxable_allowances || ''}
                                                onChange={e => updateItem(idx, 'non_taxable_allowances', parseFloat(e.target.value) || 0)}
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Stage 3: Deductions */}
                    {stage === 3 && (
                        <div className="flex flex-col gap-4">
                            <p className="text-xs text-gray-500">Review and adjust salary advance / loan deductions. Auto-populated from staff records.</p>
                            <div className="space-y-2">
                                {items.map((item, idx) => (
                                    <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                                        <span className="text-xs font-medium text-gray-800 block mb-2">{item.staff_name}</span>
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col">
                                                <label className="text-[9px] text-gray-400 mb-0.5">Loans / Advances (K)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="w-28 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    value={item.loans || ''}
                                                    onChange={e => updateItem(idx, 'loans', parseFloat(e.target.value) || 0)}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            <div className="flex flex-col">
                                                <label className="text-[9px] text-gray-400 mb-0.5">Other Deductions (K)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="w-28 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    value={item.other_deductions || ''}
                                                    onChange={e => updateItem(idx, 'other_deductions', parseFloat(e.target.value) || 0)}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Stage 4: Review + Payment Method */}
                    {stage === 4 && (
                        <div className="flex flex-col gap-4">
                            {/* Summary banner */}
                            <div className="grid grid-cols-3 gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                                <div className="text-center">
                                    <p className="text-[10px] text-blue-400 font-semibold">Employees</p>
                                    <p className="text-sm font-bold text-blue-900">{items.length}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[10px] text-blue-400 font-semibold">Gross Total</p>
                                    <p className="text-sm font-bold text-blue-900">K{fmt(totals.gross)}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[10px] text-blue-400 font-semibold">Net Total</p>
                                    <p className="text-sm font-bold text-blue-900">K{fmt(totals.net)}</p>
                                </div>
                            </div>

                            <h3 className="text-sm font-bold text-gray-800">Payment Method per Employee</h3>
                            <div className="space-y-3">
                                {items.map((item, idx) => (
                                    <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-medium text-gray-800">{item.staff_name}</span>
                                            <span className="text-xs text-gray-500">Net: K{fmt(calcNet(item))}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <select
                                                className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                                value={item.payment_method}
                                                onChange={e => updateItem(idx, 'payment_method', e.target.value)}
                                            >
                                                <option value="BANK">Bank Account</option>
                                                <option value="MOBILE_MONEY">Mobile Money</option>
                                            </select>
                                            {item.payment_method === 'BANK' && (
                                                <span className="text-[10px] text-gray-500 truncate">
                                                    {item.bank_name ? `${item.bank_name} ${item.bank_account_number ? `• ${item.bank_account_number}` : ''}` : 'No bank on file'}
                                                </span>
                                            )}
                                            {item.payment_method === 'MOBILE_MONEY' && (
                                                <span className="text-[10px] text-gray-500">{item.mobile_money_number || 'No number on file'}</span>
                                            )}
                                        </div>
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
                        disabled={saving || (stage === 4 && items.length === 0)}
                        className="h-9 px-5 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {stage < 4 ? (
                            <>Next <ChevronRight size={13} /></>
                        ) : (
                            saving ? 'Submitting…' : `Submit Payroll — K${fmt(totals.gross)}`
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
