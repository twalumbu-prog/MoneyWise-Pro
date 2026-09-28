import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { payrollService, StaffMember } from '../services/payroll.service';
import { cashbookService } from '../services/cashbook.service';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Plus, Trash2, Search, ChevronRight, ChevronDown, Check, Building2, Smartphone, Wallet } from 'lucide-react';
import { calcPAYE, calcStatutoryGross, calcGross, calcNet, sumValues, NAPSA_CEILING, NAPSA_RATE, NHIMA_RATE } from 'core';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const EXTERNAL_PAY_METHODS = [
    { id: 'CASH', label: 'Cash' },
    { id: 'AIRTEL_MONEY', label: 'Airtel Money' },
    { id: 'MTN_MONEY', label: 'MTN Money' },
    { id: 'ZAMTEL_MONEY', label: 'Zamtel Kwacha' },
    { id: 'BANK_TRANSFER', label: 'Bank Transfer' },
];

/**
 * A wizard step. Steps are derived from the org's payroll configuration so that
 * every configured allowance type and every configured deduction type gets its
 * own dedicated page, rather than being lumped into one generic screen.
 */
type StepKind =
    | 'PERIOD'
    | 'OVERTIME'
    | 'ALLOWANCE'          // one configured allowance type
    | 'ALLOWANCE_GENERIC'  // fallback when no allowance types are configured
    | 'LOANS'              // built-in: loans & salary advances
    | 'DEDUCTION'          // one configured deduction type
    | 'DEDUCTION_GENERIC'  // fallback when no deduction types are configured
    | 'REVIEW';

interface StepDef {
    key: string;
    kind: StepKind;
    label: string;
    /** Configured allowance/deduction name — set for ALLOWANCE and DEDUCTION steps */
    name?: string;
    /** Allowance steps only: whether the amount is subject to NAPSA/NHIMA/PAYE */
    taxable?: boolean;
}

interface PayrollItem {
    staff_id: string;
    staff_name: string;
    employee_number?: string;
    basic_pay: number;
    overtime: number;
    // Generic pools — used only when the org has no configured allowance types
    taxable_allowances: number;
    non_taxable_allowances: number;
    loans: number;
    // Generic pool — used only when the org has no configured deduction types
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
    // Per-configured-type breakdowns, keyed by the configured type's name
    custom_allowances: Record<string, number>;
    custom_deductions: Record<string, number>;
}

// Statutory math lives in `core` (payroll/calc.ts) -- see the comment there for
// why this must never be a per-client copy: a divergence here is a wrong salary,
// not a UI defect.

const fmt = (n: number) => n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white placeholder:text-gray-400';
const LABEL = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1';

export const RunPayrollPage: React.FC = () => {
    const navigate = useNavigate();
    const { organizationId } = useAuth();
    const now = new Date();

    const [stepIdx, setStepIdx] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Period
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [notes, setNotes] = useState('');

    const [items, setItems] = useState<PayrollItem[]>([]);

    // Which employees have been added to each step's panel, keyed by step key
    const [stepMembers, setStepMembers] = useState<Record<string, Set<string>>>({});
    const [stepSearch, setStepSearch] = useState<Record<string, string>>({});
    const [focusedStepKey, setFocusedStepKey] = useState<string | null>(null);

    // Review step — open method dropdown index
    const [openMethodIdx, setOpenMethodIdx] = useState<number | null>(null);
    const methodDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (methodDropdownRef.current && !methodDropdownRef.current.contains(e.target as Node)) {
                setOpenMethodIdx(null);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

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
        queryKey: ['suggested-deductions', organizationId, month, year],
        queryFn: () => payrollService.getSuggestedDeductions(month, year),
        enabled: !!organizationId,
    });

    const allowanceTypes = useMemo(() => config?.allowance_types ?? [], [config]);
    const deductionTypes = useMemo(() => config?.deduction_types ?? [], [config]);

    /** Build the wizard's steps from the org's payroll configuration. */
    const steps: StepDef[] = useMemo(() => {
        const out: StepDef[] = [
            { key: 'PERIOD', kind: 'PERIOD', label: 'Select Period' },
            { key: 'OVERTIME', kind: 'OVERTIME', label: 'Staff & Overtime' },
        ];

        if (allowanceTypes.length > 0) {
            allowanceTypes.forEach(a => out.push({
                key: `ALLOWANCE:${a.name}`,
                kind: 'ALLOWANCE',
                label: a.name,
                name: a.name,
                taxable: a.subject_to_statutory !== false,
            }));
        } else {
            out.push({ key: 'ALLOWANCE_GENERIC', kind: 'ALLOWANCE_GENERIC', label: 'Allowances & Bonuses' });
        }

        out.push({ key: 'LOANS', kind: 'LOANS', label: 'Loans & Advances' });

        if (deductionTypes.length > 0) {
            deductionTypes.forEach(d => out.push({
                key: `DEDUCTION:${d.name}`,
                kind: 'DEDUCTION',
                label: d.name,
                name: d.name,
            }));
        } else {
            out.push({ key: 'DEDUCTION_GENERIC', kind: 'DEDUCTION_GENERIC', label: 'Other Deductions' });
        }

        out.push({ key: 'REVIEW', kind: 'REVIEW', label: 'Review & Payment' });
        return out;
    }, [allowanceTypes, deductionTypes]);

    const step = steps[Math.min(stepIdx, steps.length - 1)];
    const isLastStep = stepIdx >= steps.length - 1;

    const defaultPaySource = wallets.length > 0 ? `wallet:${wallets[0].id}` : 'CASH';

    const updateItem = (idx: number, field: keyof PayrollItem, val: any) => {
        setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
    };

    // ── Per-step member helpers ───────────────────────────────────────────────
    const membersOf = (key: string) => stepMembers[key] ?? new Set<string>();

    const addMember = (key: string, staffId: string) =>
        setStepMembers(prev => ({ ...prev, [key]: new Set([...(prev[key] ?? []), staffId]) }));

    const removeMember = (key: string, staffId: string) =>
        setStepMembers(prev => {
            const next = new Set(prev[key] ?? []);
            next.delete(staffId);
            return { ...prev, [key]: next };
        });

    /** Read the amount an item currently holds for a given step. */
    const valueForStep = (item: PayrollItem, s: StepDef): number => {
        switch (s.kind) {
            case 'OVERTIME': return item.overtime;
            case 'ALLOWANCE': return item.custom_allowances?.[s.name!] ?? 0;
            case 'ALLOWANCE_GENERIC': return item.taxable_allowances + item.non_taxable_allowances;
            case 'LOANS': return item.loans;
            case 'DEDUCTION': return item.custom_deductions?.[s.name!] ?? 0;
            case 'DEDUCTION_GENERIC': return item.other_deductions;
            default: return 0;
        }
    };

    /** Write an amount for a given step onto an item. */
    const setValueForStep = (idx: number, s: StepDef, val: number) => {
        const item = items[idx];
        switch (s.kind) {
            case 'OVERTIME': return updateItem(idx, 'overtime', val);
            case 'ALLOWANCE':
                return updateItem(idx, 'custom_allowances', { ...(item.custom_allowances || {}), [s.name!]: val });
            case 'LOANS': return updateItem(idx, 'loans', val);
            case 'DEDUCTION':
                return updateItem(idx, 'custom_deductions', { ...(item.custom_deductions || {}), [s.name!]: val });
            case 'DEDUCTION_GENERIC': return updateItem(idx, 'other_deductions', val);
        }
    };

    // Auto-populate all active staff into items on load.
    // Wait for suggestedDeductions too — it's a separate query that often resolves
    // after allStaff/config, and the `items.length > 0` guard prevents re-applying
    // once items are seeded. If we seed before suggestions arrive the loan column
    // stays zero for everyone. `undefined` means still loading; `{}` means loaded
    // but no outstanding debts — both are valid, only undefined must block.
    useEffect(() => {
        if (allStaff.length === 0 || !config || suggestedDeductions === undefined || items.length > 0) return;

        // Treat null/undefined status as ACTIVE — the createStaffMember API insert never
        // set a status on existing records, so older employees have status = null.
        const initialItems = allStaff.filter(s => !s.status || s.status === 'ACTIVE').map(s => {
            const hasBank = !!(s.bank_account_number?.trim());
            const defaultDest: 'BANK' | 'MOBILE_MONEY' =
                s.payment_method === 'MOBILE_MONEY' ? 'MOBILE_MONEY' :
                s.payment_method === 'BANK' ? 'BANK' :
                hasBank ? 'BANK' : 'MOBILE_MONEY';

            // Loans & advances auto-synced from approved requisitions.
            // NOTE: suggestions are keyed by payroll_staff.id (see payroll.controller)
            let autoLoans = 0;
            const sd = suggestedDeductions?.[s.id];
            if (sd) autoLoans = (sd.loans || 0) + (sd.advances || 0);

            const standingLoans = s.deductions
                ?.filter(d => d.type === 'LOAN' || d.type === 'ADVANCE')
                .reduce((sum, d) => sum + d.amount, 0) ?? 0;

            // Seed every configured allowance type from the staff record
            const initialCustomAllowances: Record<string, number> = {};
            allowanceTypes.forEach(a => {
                initialCustomAllowances[a.name] = s.allowances?.find(x => x.name === a.name)?.amount ?? 0;
            });

            // Seed every configured deduction type from the staff record
            const initialCustomDeductions: Record<string, number> = {};
            deductionTypes.forEach(d => {
                initialCustomDeductions[d.name] = s.deductions?.find(x => x.name === d.name)?.amount ?? 0;
            });

            // Anything on the staff record that doesn't match a configured type
            // falls back into the generic pools so no money is silently dropped.
            let baseTaxable = 0;
            s.allowances?.forEach(a => {
                if (allowanceTypes.find(ca => ca.name === a.name)) return; // has its own step
                baseTaxable += a.amount; // orphan — treated as taxable, the conservative default
            });

            const orphanFixedDeductions = s.deductions
                ?.filter(d => d.type === 'FIXED' && !deductionTypes.find(dt => dt.name === d.name))
                .reduce((sum, d) => sum + d.amount, 0) ?? 0;

            return {
                staff_id: s.id,
                staff_name: `${s.first_name} ${s.last_name}`,
                employee_number: s.employee_number,
                basic_pay: s.basic_pay,
                overtime: 0,
                taxable_allowances: baseTaxable,
                non_taxable_allowances: 0,
                loans: standingLoans + autoLoans,
                other_deductions: orphanFixedDeductions,
                bank_name: s.bank_name ?? undefined,
                bank_account_number: s.bank_account_number ?? undefined,
                mobile_money_provider: s.mobile_money_provider ?? undefined,
                mobile_money_number: s.mobile_money_number ?? undefined,
                destination_method: defaultDest,
                pay_source: defaultPaySource,
                custom_allowances: initialCustomAllowances,
                custom_deductions: initialCustomDeductions,
            };
        });

        setItems(initialItems);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allStaff, config, suggestedDeductions, defaultPaySource]);

    // Entering a step auto-adds anyone who already has a non-zero amount for it,
    // so pre-existing entitlements/deductions are always visible for review.
    useEffect(() => {
        if (!step || items.length === 0) return;
        if (['PERIOD', 'REVIEW'].includes(step.kind)) return;

        setStepMembers(prev => {
            const existing = prev[step.key] ?? new Set<string>();
            const next = new Set(existing);
            items.forEach(item => {
                if (valueForStep(item, step) > 0) next.add(item.staff_id);
            });
            if (next.size === existing.size) return prev;
            return { ...prev, [step.key]: next };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepIdx, items.length]);

    const totals = items.reduce((acc, item) => ({
        gross: acc.gross + calcGross(item),
        net: acc.net + calcNet(item, allowanceTypes),
    }), { gross: 0, net: 0 });

    const handleSubmit = async () => {
        if (items.length === 0) { setError('Add at least one staff member'); return; }
        setSaving(true);
        setError('');
        try {
            const walletSource = items.find(i => i.pay_source.startsWith('wallet:'))?.pay_source;
            const pay_from_wallet_id = walletSource ? walletSource.replace('wallet:', '') : undefined;

            await payrollService.createRun({
                period_month: month,
                period_year: year,
                notes: notes.trim() || undefined,
                pay_from_wallet_id,
                items: items.map(item => {
                    // Fold the per-type breakdowns back into the statutory
                    // buckets the API expects.
                    const taxableCustom = Object.entries(item.custom_allowances || {})
                        .reduce((sum, [name, val]) =>
                            allowanceTypes.find(a => a.name === name)?.subject_to_statutory !== false ? sum + val : sum, 0);
                    const nonTaxableCustom = Object.entries(item.custom_allowances || {})
                        .reduce((sum, [name, val]) =>
                            allowanceTypes.find(a => a.name === name)?.subject_to_statutory === false ? sum + val : sum, 0);

                    return {
                        staff_id: item.staff_id,
                        staff_name: item.staff_name,
                        basic_pay: item.basic_pay,
                        overtime: item.overtime,
                        taxable_allowances: item.taxable_allowances + taxableCustom,
                        non_taxable_allowances: item.non_taxable_allowances + nonTaxableCustom,
                        loans: item.loans,
                        other_deductions: item.other_deductions + sumValues(item.custom_deductions),
                        // Per-type breakdown, retained for the payslip record
                        allowance_breakdown: item.custom_allowances,
                        deduction_breakdown: item.custom_deductions,
                        pay_source: item.pay_source,
                        destination_method: item.destination_method,
                        payment_method: item.destination_method,
                        bank_name: item.destination_method === 'BANK' ? item.bank_name : undefined,
                        bank_account_number: item.destination_method === 'BANK' ? item.bank_account_number : undefined,
                        mobile_money_number: item.destination_method === 'MOBILE_MONEY' ? item.mobile_money_number : undefined,
                    };
                }),
            });
            navigate('/apps/payroll');
        } catch (err: any) {
            setError(err?.response?.data?.error ?? err.message ?? 'Failed to run payroll');
            setSaving(false);
        }
    };

    const goNext = () => {
        if (step.kind === 'PERIOD' && items.length === 0) {
            setError('No active employees found to run payroll for.');
            return;
        }
        setError('');
        if (!isLastStep) setStepIdx(stepIdx + 1);
        else handleSubmit();
    };

    // Employees not yet added to the current step's panel
    const searchTerm = stepSearch[step?.key ?? ''] ?? '';
    const availableForStep = items.filter(item =>
        !membersOf(step?.key ?? '').has(item.staff_id) &&
        (searchTerm ? item.staff_name.toLowerCase().includes(searchTerm.toLowerCase()) : true)
    );
    const panelItems = items.filter(item => membersOf(step?.key ?? '').has(item.staff_id));

    // Copy per step kind
    const stepCopy = (s: StepDef) => {
        switch (s.kind) {
            case 'OVERTIME':
                return { hint: 'Search to add an employee to the overtime panel.', placeholder: 'Search staff to add overtime…', empty: 'No overtime added yet', unit: 'Overtime (K)' };
            case 'ALLOWANCE':
                return { hint: `Set the ${s.label} amount for each employee receiving it this period.`, placeholder: `Search staff to add ${s.label}…`, empty: `No ${s.label} entries yet`, unit: `${s.label} (K)` };
            case 'ALLOWANCE_GENERIC':
                return { hint: 'Add allowances and bonuses for this period.', placeholder: 'Search staff to adjust allowances…', empty: 'No allowance adjustments', unit: 'Allowance (K)' };
            case 'LOANS':
                return { hint: 'Auto-populated from approved staff loans and salary advances. Adjust or add one-off recoveries.', placeholder: 'Search staff to add a loan recovery…', empty: 'No loan or advance recoveries this period', unit: 'Recovery (K)' };
            case 'DEDUCTION':
                return { hint: `Set the ${s.label} deduction for each employee it applies to this period.`, placeholder: `Search staff to add ${s.label}…`, empty: `No ${s.label} entries yet`, unit: `${s.label} (K)` };
            case 'DEDUCTION_GENERIC':
                return { hint: 'Add any other deductions for this period.', placeholder: 'Search staff to add a deduction…', empty: 'No other deductions this period', unit: 'Deduction (K)' };
            default:
                return { hint: '', placeholder: '', empty: '', unit: '' };
        }
    };

    const isDeductionStep = step && ['LOANS', 'DEDUCTION', 'DEDUCTION_GENERIC'].includes(step.kind);

    return (
        <Layout noPadding={true}>
        <div className="flex flex-col h-full min-h-0 px-5 pb-5">
            <div className="flex-1 bg-white rounded-[20px] border border-gray-200 flex flex-col overflow-hidden">

                {/* Page header */}
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
                <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 flex-shrink-0 overflow-x-auto">
                    <div className="flex items-center gap-2 mx-auto">
                        {steps.map((s, i) => (
                            <div key={s.key} className="flex items-center gap-2 flex-shrink-0">
                                <button
                                    onClick={() => i < stepIdx && setStepIdx(i)}
                                    title={s.label}
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors flex-shrink-0 ${
                                        i <= stepIdx ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
                                    } ${i < stepIdx ? 'hover:bg-blue-700 cursor-pointer' : 'cursor-default'}`}
                                >
                                    {i < stepIdx ? <Check size={11} /> : i + 1}
                                </button>
                                {i < steps.length - 1 && (
                                    <div className={`h-px w-6 flex-shrink-0 ${i < stepIdx ? 'bg-blue-600' : 'bg-gray-200'}`} />
                                )}
                            </div>
                        ))}
                        <span className="ml-2 text-[10px] text-gray-400 whitespace-nowrap">Step {stepIdx + 1} of {steps.length}</span>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    <div className={`${step?.kind === 'REVIEW' ? '' : 'max-w-2xl'} mx-auto flex flex-col gap-5`}>

                        <h2 className="text-sm font-bold text-gray-800">{step?.label}</h2>

                        {/* ── Period ── */}
                        {step?.kind === 'PERIOD' && (
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
                                <p className="text-xs text-gray-400">
                                    This run has {steps.length - 2} adjustment {steps.length - 2 === 1 ? 'step' : 'steps'} configured
                                    {allowanceTypes.length + deductionTypes.length > 0 && ' from your payroll settings'}.
                                </p>
                            </>
                        )}

                        {/* ── Generic allowance fallback (no configured types) ── */}
                        {step?.kind === 'ALLOWANCE_GENERIC' && (
                            <>
                                <p className="text-xs text-gray-500 -mt-3">{stepCopy(step).hint}</p>
                                <StepSearch
                                    stepKey={step.key}
                                    placeholder={stepCopy(step).placeholder}
                                    value={searchTerm}
                                    onChange={v => setStepSearch(p => ({ ...p, [step.key]: v }))}
                                    focused={focusedStepKey === step.key}
                                    setFocused={f => setFocusedStepKey(f ? step.key : null)}
                                    available={availableForStep}
                                    onAdd={id => { addMember(step.key, id); setStepSearch(p => ({ ...p, [step.key]: '' })); setFocusedStepKey(null); }}
                                />
                                {panelItems.length === 0 ? (
                                    <EmptyPanel title={stepCopy(step).empty} />
                                ) : panelItems.map(item => {
                                    const idx = items.findIndex(i => i.staff_id === item.staff_id);
                                    return (
                                        <div key={item.staff_id} className="border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">{item.staff_name}</p>
                                                    <p className="text-[10px] text-gray-400">Basic: K{fmt(item.basic_pay)} · Overtime: K{fmt(item.overtime)}</p>
                                                </div>
                                                <button onClick={() => removeMember(step.key, item.staff_id)} className="text-gray-300 hover:text-red-400 transition-colors">
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className={LABEL}>Taxable Allowance / Bonus (K)</label>
                                                    <input type="number" min="0" className={INPUT} placeholder="0.00"
                                                        value={item.taxable_allowances || ''}
                                                        onChange={e => updateItem(idx, 'taxable_allowances', parseFloat(e.target.value) || 0)} />
                                                </div>
                                                <div>
                                                    <label className={LABEL}>Non-Taxable Allowance (K)</label>
                                                    <input type="number" min="0" className={INPUT} placeholder="0.00"
                                                        value={item.non_taxable_allowances || ''}
                                                        onChange={e => updateItem(idx, 'non_taxable_allowances', parseFloat(e.target.value) || 0)} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}

                        {/* ── Single-amount steps: overtime, each allowance, loans, each deduction ── */}
                        {step && ['OVERTIME', 'ALLOWANCE', 'LOANS', 'DEDUCTION', 'DEDUCTION_GENERIC'].includes(step.kind) && (
                            <>
                                <div className="flex items-start justify-between gap-4 -mt-3">
                                    <p className="text-xs text-gray-500">{stepCopy(step).hint}</p>
                                    {step.kind === 'ALLOWANCE' && (
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                            step.taxable ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                                        }`}>
                                            {step.taxable ? 'Taxable' : 'Non-taxable'}
                                        </span>
                                    )}
                                </div>

                                <StepSearch
                                    stepKey={step.key}
                                    placeholder={stepCopy(step).placeholder}
                                    value={searchTerm}
                                    onChange={v => setStepSearch(p => ({ ...p, [step.key]: v }))}
                                    focused={focusedStepKey === step.key}
                                    setFocused={f => setFocusedStepKey(f ? step.key : null)}
                                    available={availableForStep}
                                    onAdd={id => { addMember(step.key, id); setStepSearch(p => ({ ...p, [step.key]: '' })); setFocusedStepKey(null); }}
                                />

                                {panelItems.length === 0 ? (
                                    <EmptyPanel title={stepCopy(step).empty} />
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        <div className="grid grid-cols-[1fr_140px_40px] gap-3 px-4 py-2 bg-gray-50 rounded-lg text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                                            <span>Employee</span>
                                            <span className="text-right">{stepCopy(step).unit}</span>
                                            <span />
                                        </div>
                                        {panelItems.map(item => {
                                            const idx = items.findIndex(i => i.staff_id === item.staff_id);
                                            return (
                                                <div key={item.staff_id} className="grid grid-cols-[1fr_140px_40px] gap-3 items-center px-4 py-2.5 border border-gray-100 rounded-lg bg-white">
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{item.staff_name}</p>
                                                        <p className="text-[10px] text-gray-400">
                                                            {item.employee_number ? `${item.employee_number} · ` : ''}Basic: K{fmt(item.basic_pay)}
                                                        </p>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={valueForStep(item, step) || ''}
                                                        onChange={e => setValueForStep(idx, step, parseFloat(e.target.value) || 0)}
                                                        className={`w-full border rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 ${
                                                            isDeductionStep
                                                                ? 'border-gray-200 text-red-600 focus:ring-red-500/30 focus:border-red-400'
                                                                : 'border-gray-200 text-gray-900 focus:ring-blue-500/30 focus:border-blue-500'
                                                        }`}
                                                        placeholder="0.00"
                                                    />
                                                    <button
                                                        onClick={() => { setValueForStep(idx, step, 0); removeMember(step.key, item.staff_id); }}
                                                        className="flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        <div className="grid grid-cols-[1fr_140px_40px] gap-3 px-4 py-2 bg-gray-50 rounded-lg text-[11px] font-bold text-gray-700">
                                            <span>Total</span>
                                            <span className={`text-right ${isDeductionStep ? 'text-red-600' : 'text-gray-900'}`}>
                                                K{fmt(panelItems.reduce((s, i) => s + valueForStep(i, step), 0))}
                                            </span>
                                            <span />
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ── Review & Payment ── */}
                        {step?.kind === 'REVIEW' && (
                            <>
                                <div className="bg-blue-50 border border-blue-100 rounded-xl px-6 py-4 grid grid-cols-3 gap-4 flex-shrink-0">
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

                                <div className="overflow-x-auto rounded-xl border border-gray-100" ref={methodDropdownRef}>
                                    <table className="min-w-full text-[11px]">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-100">
                                                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap sticky left-0 bg-gray-50">Employee</th>
                                                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Basic Pay</th>
                                                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Overtime</th>
                                                {allowanceTypes.length > 0
                                                    ? allowanceTypes.map(a => (
                                                        <th key={a.name} className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{a.name}</th>
                                                    ))
                                                    : <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Allowances</th>
                                                }
                                                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-blue-600 uppercase tracking-wide whitespace-nowrap">Gross</th>
                                                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-red-400 uppercase tracking-wide whitespace-nowrap">NAPSA</th>
                                                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-red-400 uppercase tracking-wide whitespace-nowrap">NHIMA</th>
                                                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-red-400 uppercase tracking-wide whitespace-nowrap">PAYE</th>
                                                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-red-400 uppercase tracking-wide whitespace-nowrap">Loans</th>
                                                {deductionTypes.length > 0
                                                    ? deductionTypes.map(d => (
                                                        <th key={d.name} className="px-3 py-2.5 text-right text-[10px] font-semibold text-red-400 uppercase tracking-wide whitespace-nowrap">{d.name}</th>
                                                    ))
                                                    : <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-red-400 uppercase tracking-wide whitespace-nowrap">Other Ded.</th>
                                                }
                                                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-900 uppercase tracking-wide whitespace-nowrap">Net Pay</th>
                                                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Method</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map((item, idx) => {
                                                const gross = calcGross(item);
                                                const sg = calcStatutoryGross(item, allowanceTypes);
                                                const napsa = Math.min(sg, NAPSA_CEILING) * NAPSA_RATE;
                                                const nhima = sg * NHIMA_RATE;
                                                const paye = calcPAYE(sg);
                                                const net = calcNet(item, allowanceTypes);
                                                const isWalletSource = item.pay_source.startsWith('wallet:');
                                                const hasBank = !!(item.bank_account_number?.trim());
                                                const hasMobile = !!(item.mobile_money_number?.trim());

                                                const srcWallet = isWalletSource ? wallets.find((w: any) => `wallet:${w.id}` === item.pay_source) : null;
                                                const srcExternal = !isWalletSource ? EXTERNAL_PAY_METHODS.find(m => m.id === item.pay_source) : null;
                                                const srcLabel = srcWallet ? srcWallet.name : srcExternal ? srcExternal.label : 'Select…';
                                                const destLabel = isWalletSource
                                                    ? (item.destination_method === 'BANK'
                                                        ? `→ Bank ${item.bank_account_number ? `···${item.bank_account_number.slice(-4)}` : ''}`
                                                        : `→ Mobile ${item.mobile_money_number || ''}`)
                                                    : '';

                                                return (
                                                    <tr key={item.staff_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors">
                                                        <td className="px-3 py-3 whitespace-nowrap sticky left-0 bg-white">
                                                            <p className="font-semibold text-[12px] text-gray-900">{item.staff_name}</p>
                                                            <p className="text-[10px] text-gray-400">{item.employee_number || '—'}</p>
                                                        </td>
                                                        <td className="px-3 py-3 text-right text-gray-600 whitespace-nowrap">{fmt(item.basic_pay)}</td>
                                                        <td className="px-3 py-3 text-right text-gray-600 whitespace-nowrap">{item.overtime > 0 ? fmt(item.overtime) : <span className="text-gray-300">—</span>}</td>
                                                        {allowanceTypes.length > 0
                                                            ? allowanceTypes.map(a => {
                                                                const v = item.custom_allowances?.[a.name] ?? 0;
                                                                return <td key={a.name} className="px-3 py-3 text-right text-gray-600 whitespace-nowrap">{v > 0 ? fmt(v) : <span className="text-gray-300">—</span>}</td>;
                                                            })
                                                            : (() => {
                                                                const v = item.taxable_allowances + item.non_taxable_allowances;
                                                                return <td className="px-3 py-3 text-right text-gray-600 whitespace-nowrap">{v > 0 ? fmt(v) : <span className="text-gray-300">—</span>}</td>;
                                                            })()
                                                        }
                                                        <td className="px-3 py-3 text-right font-semibold text-blue-700 whitespace-nowrap">{fmt(gross)}</td>
                                                        <td className="px-3 py-3 text-right text-red-500 whitespace-nowrap">({fmt(napsa)})</td>
                                                        <td className="px-3 py-3 text-right text-red-500 whitespace-nowrap">({fmt(nhima)})</td>
                                                        <td className="px-3 py-3 text-right text-red-500 whitespace-nowrap">{paye > 0 ? `(${fmt(paye)})` : <span className="text-gray-300">—</span>}</td>
                                                        <td className="px-3 py-3 text-right text-red-500 whitespace-nowrap">{item.loans > 0 ? `(${fmt(item.loans)})` : <span className="text-gray-300">—</span>}</td>
                                                        {deductionTypes.length > 0
                                                            ? deductionTypes.map(d => {
                                                                const v = item.custom_deductions?.[d.name] ?? 0;
                                                                return <td key={d.name} className="px-3 py-3 text-right text-red-500 whitespace-nowrap">{v > 0 ? `(${fmt(v)})` : <span className="text-gray-300">—</span>}</td>;
                                                            })
                                                            : <td className="px-3 py-3 text-right text-red-500 whitespace-nowrap">{item.other_deductions > 0 ? `(${fmt(item.other_deductions)})` : <span className="text-gray-300">—</span>}</td>
                                                        }
                                                        <td className="px-3 py-3 text-right font-bold text-[12px] text-gray-900 whitespace-nowrap">K{fmt(net)}</td>
                                                        <td className="px-3 py-3 relative">
                                                            <button
                                                                type="button"
                                                                onClick={() => setOpenMethodIdx(openMethodIdx === idx ? null : idx)}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white hover:border-blue-300 transition-colors text-left min-w-[130px]"
                                                            >
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[11px] font-semibold text-gray-800 truncate">{srcLabel}</p>
                                                                    {destLabel && <p className="text-[10px] text-gray-400 truncate">{destLabel}</p>}
                                                                </div>
                                                                <ChevronDown size={11} className="text-gray-400 flex-shrink-0" />
                                                            </button>

                                                            {openMethodIdx === idx && (
                                                                <div className="absolute right-0 top-[calc(100%+4px)] z-40 w-64 bg-white rounded-xl shadow-[0px_8px_24px_0px_rgba(17,24,39,0.12)] border border-gray-100 p-3">
                                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1"><Wallet size={10} /> Pay From</p>

                                                                    {wallets.length > 0 && (
                                                                        <div className="mb-1">
                                                                            <p className="text-[10px] text-gray-400 px-2 mb-0.5">MoneyWise Wallets</p>
                                                                            {wallets.map((w: any) => (
                                                                                <button key={w.id} type="button"
                                                                                    onClick={() => updateItem(idx, 'pay_source', `wallet:${w.id}`)}
                                                                                    className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors flex items-center justify-between ${item.pay_source === `wallet:${w.id}` ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                                                                >
                                                                                    <span>{w.name}</span>
                                                                                    {w.balance != null && <span className="text-[10px] opacity-60">K{Number(w.balance).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    )}

                                                                    <p className="text-[10px] text-gray-400 px-2 mb-0.5">External</p>
                                                                    {EXTERNAL_PAY_METHODS.map(m => (
                                                                        <button key={m.id} type="button"
                                                                            onClick={() => updateItem(idx, 'pay_source', m.id)}
                                                                            className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${item.pay_source === m.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                                                        >
                                                                            {m.label}
                                                                        </button>
                                                                    ))}

                                                                    {isWalletSource && (hasBank || hasMobile) && (
                                                                        <>
                                                                            <div className="border-t border-gray-100 my-2" />
                                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1"><Smartphone size={10} /> Pay To</p>
                                                                            {hasBank && (
                                                                                <button type="button"
                                                                                    onClick={() => updateItem(idx, 'destination_method', 'BANK')}
                                                                                    className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-2 ${item.destination_method === 'BANK' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                                                                >
                                                                                    <Building2 size={12} className="flex-shrink-0" />
                                                                                    <div className="min-w-0">
                                                                                        <p className="font-semibold truncate">{item.bank_name || 'Bank Account'}</p>
                                                                                        <p className="text-[10px] opacity-60 truncate">{item.bank_account_number}</p>
                                                                                    </div>
                                                                                </button>
                                                                            )}
                                                                            {hasMobile && (
                                                                                <button type="button"
                                                                                    onClick={() => updateItem(idx, 'destination_method', 'MOBILE_MONEY')}
                                                                                    className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-2 ${item.destination_method === 'MOBILE_MONEY' ? 'bg-purple-50 text-purple-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                                                                >
                                                                                    <Smartphone size={12} className="flex-shrink-0" />
                                                                                    <div className="min-w-0">
                                                                                        <p className="font-semibold truncate">{item.mobile_money_provider || 'Mobile Money'}</p>
                                                                                        <p className="text-[10px] opacity-60 truncate">{item.mobile_money_number}</p>
                                                                                    </div>
                                                                                </button>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-gray-50 border-t border-gray-200">
                                                <td className="px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50">Total</td>
                                                <td className="px-3 py-2.5 text-right font-semibold text-gray-700 text-[11px]">{fmt(items.reduce((s, i) => s + i.basic_pay, 0))}</td>
                                                <td className="px-3 py-2.5 text-right font-semibold text-gray-700 text-[11px]">{fmt(items.reduce((s, i) => s + i.overtime, 0))}</td>
                                                {allowanceTypes.length > 0
                                                    ? allowanceTypes.map(a => (
                                                        <td key={a.name} className="px-3 py-2.5 text-right font-semibold text-gray-700 text-[11px]">
                                                            {fmt(items.reduce((s, i) => s + (i.custom_allowances?.[a.name] ?? 0), 0))}
                                                        </td>
                                                    ))
                                                    : <td className="px-3 py-2.5 text-right font-semibold text-gray-700 text-[11px]">{fmt(items.reduce((s, i) => s + i.taxable_allowances + i.non_taxable_allowances, 0))}</td>
                                                }
                                                <td className="px-3 py-2.5 text-right font-bold text-blue-700 text-[11px]">{fmt(totals.gross)}</td>
                                                <td className="px-3 py-2.5 text-right font-semibold text-red-500 text-[11px]">({fmt(items.reduce((s, i) => s + Math.min(calcStatutoryGross(i, allowanceTypes), NAPSA_CEILING) * NAPSA_RATE, 0))})</td>
                                                <td className="px-3 py-2.5 text-right font-semibold text-red-500 text-[11px]">({fmt(items.reduce((s, i) => s + calcStatutoryGross(i, allowanceTypes) * NHIMA_RATE, 0))})</td>
                                                <td className="px-3 py-2.5 text-right font-semibold text-red-500 text-[11px]">({fmt(items.reduce((s, i) => s + calcPAYE(calcStatutoryGross(i, allowanceTypes)), 0))})</td>
                                                <td className="px-3 py-2.5 text-right font-semibold text-red-500 text-[11px]">({fmt(items.reduce((s, i) => s + i.loans, 0))})</td>
                                                {deductionTypes.length > 0
                                                    ? deductionTypes.map(d => (
                                                        <td key={d.name} className="px-3 py-2.5 text-right font-semibold text-red-500 text-[11px]">
                                                            ({fmt(items.reduce((s, i) => s + (i.custom_deductions?.[d.name] ?? 0), 0))})
                                                        </td>
                                                    ))
                                                    : <td className="px-3 py-2.5 text-right font-semibold text-red-500 text-[11px]">({fmt(items.reduce((s, i) => s + i.other_deductions, 0))})</td>
                                                }
                                                <td className="px-3 py-2.5 text-right font-bold text-gray-900 text-[12px]">K{fmt(totals.net)}</td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </>
                        )}

                        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
                    </div>
                </div>

                {/* Footer navigation */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0">
                    <button
                        onClick={() => stepIdx > 0 ? setStepIdx(stepIdx - 1) : navigate('/apps/payroll')}
                        className="h-9 px-4 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        {stepIdx === 0 ? 'Cancel' : 'Back'}
                    </button>
                    <button
                        onClick={goNext}
                        disabled={saving}
                        className="h-9 px-5 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {!isLastStep ? (
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

// ── Shared sub-components ────────────────────────────────────────────────────

const EmptyPanel: React.FC<{ title: string }> = ({ title }) => (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-2 border border-dashed border-gray-200 rounded-xl">
        <p className="text-sm text-gray-400">{title}</p>
        <p className="text-xs text-gray-300">Search above to add employees to this step</p>
    </div>
);

interface StepSearchProps {
    stepKey: string;
    placeholder: string;
    value: string;
    onChange: (v: string) => void;
    focused: boolean;
    setFocused: (f: boolean) => void;
    available: PayrollItem[];
    onAdd: (staffId: string) => void;
}

const StepSearch: React.FC<StepSearchProps> = ({ placeholder, value, onChange, focused, setFocused, available, onAdd }) => (
    <div className="relative">
        <div className="flex items-center gap-2 h-9 px-3 border border-gray-200 rounded-lg bg-white">
            <Search size={13} className="text-gray-400 flex-shrink-0" />
            <input
                value={value}
                onChange={e => onChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 150)}
                placeholder={placeholder}
                className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
            />
        </div>

        {(focused || value) && (
            <div className="absolute top-full left-0 right-0 mt-1 border border-gray-200 rounded-lg bg-white shadow-md z-20 max-h-52 overflow-y-auto">
                {available.length > 0 ? available.map(s => (
                    <button
                        key={s.staff_id}
                        onMouseDown={() => onAdd(s.staff_id)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
                    >
                        <div>
                            <p className="text-sm font-medium text-gray-900">{s.staff_name}</p>
                            <p className="text-[10px] text-gray-400">
                                {s.employee_number ? `${s.employee_number} · ` : ''}Basic: K{fmt(s.basic_pay)}/mo
                            </p>
                        </div>
                        <Plus size={14} className="text-blue-600 flex-shrink-0" />
                    </button>
                )) : (
                    <p className="px-4 py-3 text-xs text-gray-400 italic">
                        {value ? 'No matching staff found' : 'All staff already added to this step'}
                    </p>
                )}
            </div>
        )}
    </div>
);
