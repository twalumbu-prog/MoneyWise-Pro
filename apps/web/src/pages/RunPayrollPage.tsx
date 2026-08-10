import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { payrollService, StaffMember } from '../services/payroll.service';
import { cashbookService } from '../services/cashbook.service';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Plus, Trash2, Search, ChevronRight, Check } from 'lucide-react';

type Stage = 1 | 2 | 3 | 4 | 5;

const STAGE_LABELS: Record<Stage, string> = {
    1: 'Select Period',
    2: 'Staff & Overtime',
    3: 'Bonuses & Allowances',
    4: 'Deductions',
    5: 'Review & Payment',
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const EXTERNAL_PAY_METHODS = [
    { id: 'CASH', label: 'Cash' },
    { id: 'AIRTEL_MONEY', label: 'Airtel Money' },
    { id: 'MTN_MONEY', label: 'MTN Money' },
    { id: 'ZAMTEL_MONEY', label: 'Zamtel Kwacha' },
    { id: 'BANK_TRANSFER', label: 'Bank Transfer' },
];

interface PayrollItem {
    staff_id: string;
    staff_name: string;
    basic_pay: number;
    overtime: number;
    taxable_allowances: number;
    non_taxable_allowances: number;
    loans: number;
    other_deductions: number;
    // All known destination accounts
    bank_name?: string;
    bank_account_number?: string;
    mobile_money_provider?: string;
    mobile_money_number?: string;
    // Which destination to use this run
    destination_method: 'BANK' | 'MOBILE_MONEY';
    // Source account
    pay_source: string; // wallet:<id> | CASH | AIRTEL_MONEY | MTN_MONEY | ZAMTEL_MONEY | BANK_TRANSFER
    // Breakdown for separate allowance steps
    custom_allowances: Record<string, number>;
}

const NAPSA_RATE = 0.05;
const NAPSA_CEILING = 1073.15;
const NHIMA_RATE = 0.01;

function calcPAYE(g: number) {
    if (g <= 4800) return 0;
    if (g <= 9600) return (g - 4800) * 0.20;
    if (g <= 16000) return (9600 - 4800) * 0.20 + (g - 9600) * 0.30;
    return (9600 - 4800) * 0.20 + (16000 - 9600) * 0.30 + (g - 16000) * 0.375;
}
const calcGross = (item: PayrollItem) => item.basic_pay + item.overtime + item.taxable_allowances + item.non_taxable_allowances + Object.values(item.custom_allowances || {}).reduce((a, b) => a + b, 0);

const calcStatutory = (sg: number) => Math.min(sg, NAPSA_CEILING) * NAPSA_RATE + sg * NHIMA_RATE + calcPAYE(sg);
const calcNet = (item: PayrollItem, separateAllowances: any[]) => {
    const g = calcGross(item);
    const sg = item.basic_pay + item.overtime + item.taxable_allowances + Object.entries(item.custom_allowances || {}).reduce((sum, [name, val]) => {
        const isTaxable = separateAllowances.find(sa => sa.name === name)?.subject_to_statutory !== false;
        return isTaxable ? sum + val : sum;
    }, 0);
    return g - calcStatutory(sg) - item.loans - item.other_deductions;
};

const fmt = (n: number) => n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white placeholder:text-gray-400';
const LABEL = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1';

export const RunPayrollPage: React.FC = () => {
    const navigate = useNavigate();
    const { organizationId } = useAuth();
    const now = new Date();

    const [stage, setStage] = useState<Stage>(1);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Stage 1 – Period
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [notes, setNotes] = useState('');

    // Stage 2 – Staff & Overtime
    const [items, setItems] = useState<PayrollItem[]>([]);
    const [staffSearch, setStaffSearch] = useState('');
    const [staffFocused, setStaffFocused] = useState(false);
    const staffDropdownRef = useRef<HTMLDivElement>(null);

    // Stage 4 – Deductions: track which staff members are in deduction panel
    const [deductionIds, setDeductionIds] = useState<Set<string>>(new Set());
    const [deductSearch, setDeductSearch] = useState('');
    const [deductFocused, setDeductFocused] = useState(false);
    const deductDropdownRef = useRef<HTMLDivElement>(null);

    const { data: allStaff = [] } = useQuery<StaffMember[]>({
        queryKey: ['payroll-staff', organizationId],
        queryFn: () => payrollService.listStaff(),
        enabled: !!organizationId,
    });

    const { data: wallets = [] } = useQuery<any[]>({
        queryKey: ['wallets', organizationId],
        queryFn: () => cashbookService.getWallets(),
        enabled: !!organizationId,
    });

    const { data: config } = useQuery({
        queryKey: ['payroll-config', organizationId],
        queryFn: () => payrollService.getPayrollConfig(),
        enabled: !!organizationId,
    });

    const { data: suggestedDeductions } = useQuery({
        queryKey: ['suggested-deductions', month, year],
        queryFn: () => payrollService.getSuggestedDeductions(month, year),
        enabled: !!organizationId,
    });

    const separateAllowances = config?.allowance_types?.filter(a => a.separate_step) || [];

    // Default pay_source for new items (first wallet if available)
    const defaultPaySource = wallets.length > 0 ? `wallet:${wallets[0].id}` : 'CASH';

    const updateItem = (idx: number, field: keyof PayrollItem, val: any) => {
        setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
    };

    const addStaff = (s: StaffMember) => {
        if (items.some(i => i.staff_id === s.id)) return;
        const hasBank = !!(s.bank_account_number?.trim());
        // Default destination: use the staff member's recorded preference; fallback based on what they have
        const defaultDest: 'BANK' | 'MOBILE_MONEY' =
            s.payment_method === 'MOBILE_MONEY' ? 'MOBILE_MONEY' :
            s.payment_method === 'BANK' ? 'BANK' :
            hasBank ? 'BANK' : 'MOBILE_MONEY';
            
        // Calculate auto-synced loans & advances for this user
        let autoLoans = 0;
        if (s.user_id && suggestedDeductions && suggestedDeductions[s.user_id]) {
            const sd = suggestedDeductions[s.user_id];
            autoLoans = (sd.loans || 0) + (sd.advances || 0);
        }
        
        // Find existing standing deductions for loans/advances if any, and add auto-synced
        const standingLoans = s.deductions?.filter(d => d.type === 'LOAN' || d.type === 'ADVANCE').reduce((sum, d) => sum + d.amount, 0) ?? 0;
        
        // Base allowances (excluding separate ones, or we can just keep them together and let them override)
        // For simplicity, we keep standard allowances as they are, and initialize custom_allowances for separate ones to 0
        const initialCustomAllowances: Record<string, number> = {};
        separateAllowances.forEach(sa => {
            // If the staff has this allowance in their profile, use its amount, otherwise 0
            const existing = s.allowances?.find(a => a.name === sa.name);
            initialCustomAllowances[sa.name] = existing ? existing.amount : 0;
        });
        
        // The rest of the allowances go to the base 'allowances' pool
        let baseTaxable = 0;
        let baseNonTaxable = 0;
        
        s.allowances?.forEach(a => {
            const cfg = config?.allowance_types?.find(ca => ca.name === a.name);
            if (cfg?.separate_step) return; // handled by initialCustomAllowances
            
            if (cfg?.subject_to_statutory !== false) {
                baseTaxable += a.amount;
            } else {
                baseNonTaxable += a.amount;
            }
        });

        setItems(prev => [...prev, {
            staff_id: s.id,
            staff_name: `${s.first_name} ${s.last_name}`,
            basic_pay: s.basic_pay,
            overtime: 0,
            taxable_allowances: baseTaxable,
            non_taxable_allowances: baseNonTaxable,
            loans: standingLoans + autoLoans,
            other_deductions: s.deductions?.filter(d => d.type === 'FIXED').reduce((sum, d) => sum + d.amount, 0) ?? 0,
            bank_name: s.bank_name ?? undefined,
            bank_account_number: s.bank_account_number ?? undefined,
            mobile_money_provider: s.mobile_money_provider ?? undefined,
            mobile_money_number: s.mobile_money_number ?? undefined,
            destination_method: defaultDest,
            pay_source: defaultPaySource,
            custom_allowances: initialCustomAllowances,
        }]);
        setStaffSearch('');
        setStaffFocused(false);
    };

    const removeItem = (idx: number) => {
        const id = items[idx].staff_id;
        setItems(prev => prev.filter((_, i) => i !== idx));
        setDeductionIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    };

    // When entering stage 4, auto-populate employees who have deductions
    useEffect(() => {
        if (stage === 4) {
            setDeductionIds(prev => {
                const next = new Set(prev);
                items.forEach(item => {
                    if ((item.loans > 0 || item.other_deductions > 0) && !next.has(item.staff_id)) {
                        next.add(item.staff_id);
                    }
                });
                return next;
            });
        }
    }, [stage]);

    const totals = items.reduce((acc, item) => {
        const g = calcGross(item);
        const n = calcNet(item, separateAllowances);
        return { gross: acc.gross + g, net: acc.net + n };
    }, { gross: 0, net: 0 });

    // Staff available to add in step 2
    const availableStaff = allStaff.filter(s =>
        s.status === 'ACTIVE' &&
        !items.some(i => i.staff_id === s.id) &&
        (staffSearch ? `${s.first_name} ${s.last_name}`.toLowerCase().includes(staffSearch.toLowerCase()) : true)
    );

    // Staff available to add to deduction panel (already in items, not yet in deductionIds)
    const availableForDeduct = items.filter(item =>
        !deductionIds.has(item.staff_id) &&
        (deductSearch ? item.staff_name.toLowerCase().includes(deductSearch.toLowerCase()) : true)
    );

    const handleSubmit = async () => {
        if (items.length === 0) { setError('Add at least one staff member'); return; }
        setSaving(true);
        setError('');
        try {
            // Derive a global pay_from_wallet_id from the most common wallet selection
            const walletSource = items.find(i => i.pay_source.startsWith('wallet:'))?.pay_source;
            const pay_from_wallet_id = walletSource ? walletSource.replace('wallet:', '') : undefined;

            await payrollService.createRun({
                period_month: month,
                period_year: year,
                notes: notes.trim() || undefined,
                pay_from_wallet_id,
                items: items.map(item => ({
                    staff_id: item.staff_id,
                    staff_name: item.staff_name,
                    basic_pay: item.basic_pay,
                    overtime: item.overtime,
                    taxable_allowances: item.taxable_allowances + Object.entries(item.custom_allowances || {}).reduce((sum, [name, val]) => (separateAllowances.find(sa => sa.name === name)?.subject_to_statutory !== false ? sum + val : sum), 0),
                    non_taxable_allowances: item.non_taxable_allowances + Object.entries(item.custom_allowances || {}).reduce((sum, [name, val]) => (separateAllowances.find(sa => sa.name === name)?.subject_to_statutory === false ? sum + val : sum), 0),
                    loans: item.loans,
                    other_deductions: item.other_deductions,
                    payment_method: item.destination_method,
                    bank_name: item.destination_method === 'BANK' ? item.bank_name : undefined,
                    bank_account_number: item.destination_method === 'BANK' ? item.bank_account_number : undefined,
                    mobile_money_number: item.destination_method === 'MOBILE_MONEY' ? item.mobile_money_number : undefined,
                })),
            });
            navigate('/apps/payroll');
        } catch (err: any) {
            setError(err?.response?.data?.error ?? err.message ?? 'Failed to run payroll');
            setSaving(false);
        }
    };

    const stages: Stage[] = [1, 2, 3, 4, 5];

    const goNext = () => {
        if (stage === 2 && items.length === 0) { setError('Add at least one employee before continuing'); return; }
        setError('');
        if (stage < 5) setStage((stage + 1) as Stage);
        else handleSubmit();
    };

    return (
        <Layout noPadding={true}>
        <div className="flex flex-col h-full min-h-0 px-5 pb-5">
            <div className="flex-1 bg-white rounded-[20px] border border-gray-200 flex flex-col overflow-hidden">

                {/* Page header — title only */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <button
                        onClick={() => navigate('/apps/payroll')}
                        className="p-2 rounded-[50px] hover:bg-gray-100 transition-colors flex-shrink-0"
                    >
                        <ArrowLeft size={14} />
                    </button>
                    <h1 className="text-base font-bold text-gray-900 font-['IBM_Plex_Sans_Devanagari']">Run Payroll</h1>
                </div>

                {/* Step indicator */}
                <div className="flex items-center justify-center gap-2 px-6 py-3 border-b border-gray-100 flex-shrink-0">
                    {stages.map(s => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                                s < stage ? 'bg-blue-600 text-white' :
                                s === stage ? 'bg-blue-600 text-white' :
                                'bg-gray-100 text-gray-400'
                            }`}>
                                {s < stage ? <Check size={11} /> : s}
                            </div>
                            {s < 5 && <div className={`h-px w-8 ${s < stage ? 'bg-blue-600' : 'bg-gray-200'}`} />}
                        </div>
                    ))}
                    <span className="ml-2 text-[10px] text-gray-400">Step {stage} of 5</span>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    <div className="max-w-2xl mx-auto flex flex-col gap-5">

                        {/* Step subheading */}
                        <h2 className="text-sm font-bold text-gray-800">{STAGE_LABELS[stage]}</h2>

                        {/* ── Stage 1: Period ── */}
                        {stage === 1 && (
                            <>
                                <div className="grid grid-cols-2 gap-4 max-w-lg">
                                    <div>
                                        <label className={LABEL}>Payroll Month</label>
                                        <select className={INPUT} value={month} onChange={e => setMonth(Number(e.target.value))}>
                                            {MONTH_NAMES.map((m, i) => (
                                                <option key={m} value={i + 1}>{m}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={LABEL}>Year</label>
                                        <select className={INPUT} value={year} onChange={e => setYear(Number(e.target.value))}>
                                            {[year - 1, year, year + 1].map(y => (
                                                <option key={y} value={y}>{y}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="max-w-lg">
                                    <label className={LABEL}>Notes (Optional)</label>
                                    <textarea
                                        className={`${INPUT} resize-none`}
                                        rows={3}
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        placeholder="Any notes for this payroll run…"
                                    />
                                </div>
                            </>
                        )}

                        {/* ── Stage 2: Staff & Overtime ── */}
                        {stage === 2 && (
                            <>
                                <p className="text-xs text-gray-500 -mt-3">Search and add employees to include in this payroll run.</p>

                                {/* Staff search with always-visible dropdown */}
                                <div className="relative" ref={staffDropdownRef}>
                                    <div className="flex items-center gap-2 h-9 px-3 border border-gray-200 rounded-lg bg-white">
                                        <Search size={13} className="text-gray-400 flex-shrink-0" />
                                        <input
                                            value={staffSearch}
                                            onChange={e => setStaffSearch(e.target.value)}
                                            onFocus={() => setStaffFocused(true)}
                                            onBlur={() => setTimeout(() => setStaffFocused(false), 150)}
                                            placeholder="Search staff members to add…"
                                            className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
                                        />
                                    </div>

                                    {(staffFocused || staffSearch) && (
                                        <div className="absolute top-full left-0 right-0 mt-1 border border-gray-200 rounded-lg bg-white shadow-md z-10 max-h-52 overflow-y-auto">
                                            {availableStaff.length > 0 ? availableStaff.map(s => (
                                                <button
                                                    key={s.id}
                                                    onMouseDown={() => addStaff(s)}
                                                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
                                                >
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{s.first_name} {s.last_name}</p>
                                                        <p className="text-[10px] text-gray-400">{s.employee_number} · {s.position || s.department || '—'} · K{fmt(s.basic_pay)}/mo</p>
                                                    </div>
                                                    <Plus size={14} className="text-blue-600 flex-shrink-0" />
                                                </button>
                                            )) : (
                                                <p className="px-4 py-3 text-xs text-gray-400 italic">
                                                    {staffSearch ? 'No matching active staff found' : 'All active staff already added'}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Added employees */}
                                {items.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-center gap-2 border border-dashed border-gray-200 rounded-xl">
                                        <p className="text-sm text-gray-400">No employees added yet</p>
                                        <p className="text-xs text-gray-300">Search above to add employees</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        <span className="text-xs font-semibold text-gray-700">{items.length} employee{items.length !== 1 ? 's' : ''} added</span>
                                        <div className="grid grid-cols-[1fr_120px_40px] gap-3 px-4 py-2 bg-gray-50 rounded-lg text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                                            <span>Employee</span>
                                            <span className="text-right">Overtime (K)</span>
                                            <span />
                                        </div>
                                        {items.map((item, idx) => (
                                            <div key={item.staff_id} className="grid grid-cols-[1fr_120px_40px] gap-3 items-center px-4 py-2.5 border border-gray-100 rounded-lg bg-white">
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{item.staff_name}</p>
                                                    <p className="text-[10px] text-gray-400">Basic: K{fmt(item.basic_pay)}</p>
                                                </div>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={item.overtime || ''}
                                                    onChange={e => updateItem(idx, 'overtime', parseFloat(e.target.value) || 0)}
                                                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                                                    placeholder="0.00"
                                                />
                                                <button onClick={() => removeItem(idx)} className="flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
                            </>
                        )}

                        {/* ── Stage 3: Bonuses & Allowances ── */}
                        {stage === 3 && (
                            <>
                                <p className="text-xs text-gray-500 -mt-3">Adjust allowances and one-time bonuses for individual employees this period.</p>
                                {items.map((item, idx) => (
                                    <div key={item.staff_id} className="border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{item.staff_name}</p>
                                            <p className="text-[10px] text-gray-400">Basic: K{fmt(item.basic_pay)} · Overtime: K{fmt(item.overtime)}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className={LABEL}>Other Taxable Allowances / Bonus (K)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={item.taxable_allowances || ''}
                                                    onChange={e => updateItem(idx, 'taxable_allowances', parseFloat(e.target.value) || 0)}
                                                    className={INPUT}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            <div>
                                                <label className={LABEL}>Other Non-Taxable Allowances (K)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={item.non_taxable_allowances || ''}
                                                    onChange={e => updateItem(idx, 'non_taxable_allowances', parseFloat(e.target.value) || 0)}
                                                    className={INPUT}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            {separateAllowances.map(sa => (
                                                <div key={sa.name}>
                                                    <label className={LABEL}>{sa.name} (K)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={item.custom_allowances?.[sa.name] || ''}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            const newCustom = { ...(item.custom_allowances || {}), [sa.name]: val };
                                                            updateItem(idx, 'custom_allowances', newCustom);
                                                        }}
                                                        className={INPUT}
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}

                        {/* ── Stage 4: Deductions ── */}
                        {stage === 4 && (
                            <>
                                <p className="text-xs text-gray-500 -mt-3">Auto-populated from staff records. Search to add employees with one-off deductions.</p>

                                {/* Search to add employees to deduction panel */}
                                <div className="relative" ref={deductDropdownRef}>
                                    <div className="flex items-center gap-2 h-9 px-3 border border-gray-200 rounded-lg bg-white">
                                        <Search size={13} className="text-gray-400 flex-shrink-0" />
                                        <input
                                            value={deductSearch}
                                            onChange={e => setDeductSearch(e.target.value)}
                                            onFocus={() => setDeductFocused(true)}
                                            onBlur={() => setTimeout(() => setDeductFocused(false), 150)}
                                            placeholder="Search to add staff deductions…"
                                            className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
                                        />
                                    </div>

                                    {(deductFocused || deductSearch) && (
                                        <div className="absolute top-full left-0 right-0 mt-1 border border-gray-200 rounded-lg bg-white shadow-md z-10 max-h-52 overflow-y-auto">
                                            {availableForDeduct.length > 0 ? availableForDeduct.map(item => (
                                                <button
                                                    key={item.staff_id}
                                                    onMouseDown={() => {
                                                        setDeductionIds(prev => new Set([...prev, item.staff_id]));
                                                        setDeductSearch('');
                                                        setDeductFocused(false);
                                                    }}
                                                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
                                                >
                                                    <p className="text-sm font-medium text-gray-900">{item.staff_name}</p>
                                                    <Plus size={14} className="text-blue-600 flex-shrink-0" />
                                                </button>
                                            )) : (
                                                <p className="px-4 py-3 text-xs text-gray-400 italic">
                                                    {deductSearch ? 'No matching employees found' : 'All employees already have deduction entries'}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Deduction cards */}
                                {deductionIds.size === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-center gap-2 border border-dashed border-gray-200 rounded-xl">
                                        <p className="text-sm text-gray-400">No deductions this period</p>
                                        <p className="text-xs text-gray-300">Search above to add an employee with a deduction</p>
                                    </div>
                                ) : (
                                    items.filter(item => deductionIds.has(item.staff_id)).map((item, _) => {
                                        const idx = items.findIndex(i => i.staff_id === item.staff_id);
                                        return (
                                            <div key={item.staff_id} className="border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-semibold text-gray-900">{item.staff_name}</p>
                                                    <button
                                                        onClick={() => setDeductionIds(prev => { const s = new Set(prev); s.delete(item.staff_id); return s; })}
                                                        className="text-gray-300 hover:text-red-400 transition-colors"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className={LABEL}>Loans / Advances (K)</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={item.loans || ''}
                                                            onChange={e => updateItem(idx, 'loans', parseFloat(e.target.value) || 0)}
                                                            className={INPUT}
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className={LABEL}>Other Deductions (K)</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={item.other_deductions || ''}
                                                            onChange={e => updateItem(idx, 'other_deductions', parseFloat(e.target.value) || 0)}
                                                            className={INPUT}
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </>
                        )}

                        {/* ── Stage 5: Review & Payment ── */}
                        {stage === 5 && (
                            <>
                                {/* Summary banner */}
                                <div className="bg-blue-50 border border-blue-100 rounded-xl px-6 py-4 grid grid-cols-3 gap-4">
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Employees</span>
                                        <span className="text-lg font-bold text-blue-900">{items.length}</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Gross Total</span>
                                        <span className="text-lg font-bold text-blue-900">K{fmt(totals.gross)}</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Est. Net Total</span>
                                        <span className="text-lg font-bold text-blue-900">K{fmt(totals.net)}</span>
                                    </div>
                                </div>

                                {/* Per-employee payment method */}
                                <div>
                                    <p className="text-xs text-gray-500 mb-3">Select the payment source and destination for each employee.</p>
                                    <div className="flex flex-col gap-3">
                                        {items.map((item, idx) => {
                                            const hasBank = !!(item.bank_account_number?.trim());
                                            const hasMobile = !!(item.mobile_money_number?.trim());
                                            const hasBoth = hasBank && hasMobile;
                                            const destLabel = item.destination_method === 'MOBILE_MONEY'
                                                ? `Mobile Money · ${item.mobile_money_number || '—'}`
                                                : `Bank · ${item.bank_account_number || '—'}`;
                                            return (
                                            <div key={item.staff_id} className="border border-gray-100 rounded-xl px-4 py-3 flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{item.staff_name}</p>
                                                        <p className="text-[10px] text-gray-400">{destLabel}</p>
                                                    </div>
                                                    <span className="text-sm font-bold text-gray-900">K{fmt(calcNet(item, separateAllowances))}</span>
                                                </div>

                                                {/* Receive via — only when employee has both bank and mobile money */}
                                                {hasBoth && (
                                                    <div>
                                                        <label className={LABEL}>Receive Via</label>
                                                        <div className="flex gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => updateItem(idx, 'destination_method', 'BANK')}
                                                                className={`flex-1 py-1.5 px-3 rounded-lg border text-xs font-semibold transition-all text-left ${
                                                                    item.destination_method === 'BANK'
                                                                        ? 'border-blue-600 bg-blue-50 text-blue-800'
                                                                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                                                }`}
                                                            >
                                                                <span className="block text-[10px] font-normal opacity-60 mb-0.5">Bank Account</span>
                                                                {item.bank_account_number || '—'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => updateItem(idx, 'destination_method', 'MOBILE_MONEY')}
                                                                className={`flex-1 py-1.5 px-3 rounded-lg border text-xs font-semibold transition-all text-left ${
                                                                    item.destination_method === 'MOBILE_MONEY'
                                                                        ? 'border-purple-600 bg-purple-50 text-purple-800'
                                                                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                                                }`}
                                                            >
                                                                <span className="block text-[10px] font-normal opacity-60 mb-0.5">Mobile Money</span>
                                                                {item.mobile_money_number || '—'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                <div>
                                                    <label className={LABEL}>Pay From</label>
                                                    <select
                                                        className={`${INPUT} appearance-none`}
                                                        value={item.pay_source}
                                                        onChange={e => updateItem(idx, 'pay_source', e.target.value)}
                                                    >
                                                        {wallets.length > 0 && (
                                                            <optgroup label="MoneyWise Wallets">
                                                                {wallets.map((w: any) => (
                                                                    <option key={w.id} value={`wallet:${w.id}`}>
                                                                        {w.name}{w.balance != null ? ` — K${Number(w.balance).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : ''}
                                                                    </option>
                                                                ))}
                                                            </optgroup>
                                                        )}
                                                        <optgroup label="External Methods">
                                                            {EXTERNAL_PAY_METHODS.map(m => (
                                                                <option key={m.id} value={m.id}>{m.label}</option>
                                                            ))}
                                                        </optgroup>
                                                    </select>
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
                            </>
                        )}
                    </div>
                </div>

                {/* Footer navigation */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0">
                    <button
                        onClick={() => stage > 1 ? setStage((stage - 1) as Stage) : navigate('/apps/payroll')}
                        className="h-9 px-4 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        {stage === 1 ? 'Cancel' : 'Back'}
                    </button>
                    <button
                        onClick={goNext}
                        disabled={saving}
                        className="h-9 px-5 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {stage < 5 ? (
                            <>Next <ChevronRight size={13} /></>
                        ) : (
                            saving ? 'Submitting…' : `Submit Payroll — K${fmt(totals.gross)}`
                        )}
                    </button>
                </div>
            </div>
        </div>
        </Layout>
    );
};
