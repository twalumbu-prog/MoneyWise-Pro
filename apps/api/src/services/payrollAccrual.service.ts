/**
 * Payroll accounting: turns a payroll run into the two journals the books need.
 *
 *  1. ACCRUAL (once per run)   Dr Staff Salaries (gross) + Dr NAPSA / NHIMA employer cost
 *                              Cr NAPSA payable + NHIMA payable + PAYE payable (ZRA) + Staff deductions control + Net pay control
 *     Net pay control is then cleared by the actual payouts (requisitions / bank transfers debit "Wages and salaries control").
 *
 *  2. ALLOCATION (once per run) Dr Staff deductions control
 *                              Cr School-fee receivables / Staff salary advances / Staff loans / Staff purchases (uniform sales)
 *     In QuickBooks school-fee credits must carry a customer (the pupil), so the QuickBooks allocation is only posted when the run
 *     has no school-fee deductions; otherwise it stays flagged for the accountant (the per-pupil detail lives in deduction_breakdown).
 *
 * Both are idempotent: a run that already has a journal id is never posted twice, and the MoneyWise journal carries
 * external_reference PAYROLL-<year>-<mm> / PAYROLL-ALLOC-<year>-<mm>.
 */
import { supabase } from '../lib/supabase';
import { createManualJournal, JournalLineInput } from './journalEntry.service';
import { QuickBooksService } from './quickbooks.service';

export type PayrollRole =
    | 'salaries' | 'napsa_employer' | 'nhima_employer' | 'napsa_payable' | 'nhima_payable' | 'paye_payable'
    | 'deductions_control' | 'net_pay_control' | 'school_fees_receivable' | 'salary_advances' | 'staff_loans' | 'other_deductions_income';

export const ROLE_LABELS: Record<PayrollRole, string> = {
    salaries: 'Staff Salaries (gross pay)', napsa_employer: "NAPSA - Employer's contributions", nhima_employer: 'NHIMA - Employer contribution',
    napsa_payable: 'NAPSA Payable', nhima_payable: 'NHIMA Payable', paye_payable: 'ZRA tax payable (PAYE)', deductions_control: 'Staff deductions control',
    net_pay_control: 'Wages and salaries control (net pay)', school_fees_receivable: 'Receivables (school fees)', salary_advances: 'Staff Salary Advances',
    staff_loans: 'Staff Loans', other_deductions_income: 'Sale of School Uniforms (staff purchases)',
};

/** The accounts Twalumbu already uses, by chart code. Used to seed payroll_config.account_map. */
export const DEFAULT_ROLE_CODES: Record<PayrollRole, string> = {
    salaries: 'QB-21', napsa_employer: 'QB-67', nhima_employer: 'QB-1150040007', napsa_payable: 'QB-1150040008', nhima_payable: 'QB-1150040009',
    paye_payable: 'QB-45', deductions_control: 'QB-1150040100', net_pay_control: 'QB-48', school_fees_receivable: 'QB-61',
    salary_advances: 'QB-1150040017', staff_loans: 'QB-1150040034', other_deductions_income: 'QB-57',
};

export interface RunTotals {
    gross: number; napsa_employee: number; napsa_employer: number; nhima_employee: number; nhima_employer: number; paye: number;
    school_fees: number; salary_advances: number; loans: number; other_deductions: number; net: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const cents = (n: number) => Math.round(n * 100);

export function totalsFromItems(items: any[]): RunTotals {
    const sum = (k: string) => r2(items.reduce((a, i) => a + (Number(i[k]) || 0), 0));
    return {
        gross: sum('gross_pay'), napsa_employee: sum('napsa_employee'), napsa_employer: sum('napsa_employer'), nhima_employee: sum('nhima_employee'), nhima_employer: sum('nhima_employer'),
        paye: sum('paye'), school_fees: sum('school_fees'), salary_advances: sum('salary_advances'), loans: sum('loans'), other_deductions: sum('other_deductions'), net: sum('net_pay'),
    };
}

export interface BuiltLine { role: PayrollRole; debit: number; credit: number; description: string }

/** Pure: the accrual journal for a run. Throws if the run does not foot (gross - deductions != net), so a bad sheet never posts. */
export function buildAccrualLines(t: RunTotals, label: string): BuiltLine[] {
    const deductions = r2(t.school_fees + t.salary_advances + t.loans + t.other_deductions);
    // Net pay control is the derived balancing figure: per-employee rounding can leave the summed net a cent or two off the summed parts.
    const expected = r2(t.gross - t.napsa_employee - t.nhima_employee - t.paye - deductions);
    if (Math.abs(expected - t.net) > 0.05) throw new Error(`The payroll does not foot: gross ${t.gross} - statutory ${r2(t.napsa_employee + t.nhima_employee + t.paye)} - deductions ${deductions} = ${expected}, but net pay is ${t.net}.`);
    const lines = ([
        { role: 'salaries', debit: t.gross, credit: 0, description: `Payroll expense for ${label}` },
        { role: 'napsa_employer', debit: t.napsa_employer, credit: 0, description: `NAPSA employer's contribution for ${label}` },
        { role: 'nhima_employer', debit: t.nhima_employer, credit: 0, description: `NHIMA employer's contribution for ${label}` },
        { role: 'napsa_payable', debit: 0, credit: r2(t.napsa_employee + t.napsa_employer), description: `NAPSA payable for employer & employee (${label})` },
        { role: 'nhima_payable', debit: 0, credit: r2(t.nhima_employee + t.nhima_employer), description: `NHIMA payable for employer & employee (${label})` },
        { role: 'paye_payable', debit: 0, credit: t.paye, description: `ZRA PAYE tax liability (${label})` },
        { role: 'deductions_control', debit: 0, credit: deductions, description: `Staff deductions for ${label}` },
        { role: 'net_pay_control', debit: 0, credit: expected, description: `Net pay to be settled through bank (${label})` },
    ] as BuiltLine[]).filter(l => l.debit > 0 || l.credit > 0);
    const dr = lines.reduce((a, l) => a + cents(l.debit), 0), cr = lines.reduce((a, l) => a + cents(l.credit), 0);
    if (dr !== cr) throw new Error(`The payroll journal is out of balance by ${(Math.abs(dr - cr) / 100).toFixed(2)}.`);
    return lines;
}

/** Pure: the allocation journal that clears Staff deductions control to what was actually deducted. */
export function buildAllocationLines(t: RunTotals, label: string): BuiltLine[] {
    const deductions = r2(t.school_fees + t.salary_advances + t.loans + t.other_deductions);
    if (deductions <= 0) return [];
    const lines = ([
        { role: 'deductions_control', debit: deductions, credit: 0, description: `Deductions for ${label}` },
        { role: 'school_fees_receivable', debit: 0, credit: t.school_fees, description: `School fee deductions (${label})` },
        { role: 'salary_advances', debit: 0, credit: t.salary_advances, description: `Salary advance recoveries (${label})` },
        { role: 'staff_loans', debit: 0, credit: t.loans, description: `Staff loan repayments (${label})` },
        { role: 'other_deductions_income', debit: 0, credit: t.other_deductions, description: `Staff purchases deducted from pay (${label})` },
    ] as BuiltLine[]).filter(l => l.debit > 0 || l.credit > 0);
    return lines;
}

/** Resolves every payroll role to a MoneyWise account id: payroll_config.account_map first, then the default chart codes. */
export async function resolveAccountMap(orgId: string): Promise<Record<PayrollRole, { id: string; name: string; qb: string | null }>> {
    const { data: cfg } = await supabase.from('payroll_config').select('account_map').eq('organization_id', orgId).maybeSingle();
    const stored: Record<string, string> = (cfg as any)?.account_map || {};
    const { data: accts } = await supabase.from('accounts').select('id, code, name, qb_account_id').eq('organization_id', orgId);
    const byId = new Map((accts || []).map((a: any) => [a.id, a])); const byCode = new Map((accts || []).map((a: any) => [a.code, a]));
    const out: any = {};
    for (const role of Object.keys(DEFAULT_ROLE_CODES) as PayrollRole[]) {
        const a: any = (stored[role] && byId.get(stored[role])) || byCode.get(DEFAULT_ROLE_CODES[role]);
        if (!a) throw new Error(`No account is set for "${ROLE_LABELS[role]}". Map it in Payroll settings (or add chart account ${DEFAULT_ROLE_CODES[role]}).`);
        out[role] = { id: a.id, name: a.name, qb: a.qb_account_id || null };
    }
    return out;
}

const periodLabel = (run: any) => {
    const m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][run.period_month - 1];
    return `${m} ${run.period_year}`;
};
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

async function findJournalByRef(orgId: string, ref: string): Promise<string | null> {
    const r = await supabase.from('journal_entries').select('id').eq('organization_id', orgId).eq('external_reference', ref).maybeSingle();
    if (!r.error) return (r.data as any)?.id ?? null;
    // external_reference column not migrated yet: createManualJournal keeps the reference inside the description instead
    const { data } = await supabase.from('journal_entries').select('id').eq('organization_id', orgId).like('description', `%(Ref: ${ref})%`).limit(1);
    return (data as any)?.[0]?.id ?? null;
}

export interface PostOptions { toQuickBooks?: boolean; date?: string }

/** Posts (idempotently) the accrual + allocation journals for a run to the MoneyWise ledger and, optionally, QuickBooks. */
export async function postRunJournals(orgId: string, runId: string, userId: string | null, opts: PostOptions = {}) {
    const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', runId).eq('organization_id', orgId).single();
    if (!run) throw new Error('Payroll run not found');
    const { data: items } = await supabase.from('payroll_run_items').select('*').eq('payroll_run_id', runId);
    if (!items?.length) throw new Error('The payroll run has no items');
    // The platform accrual (payrollAccounting.service, Enterprise) already booked this run to its own accounts: never post it a second time.
    if (run.accrued_at && !run.accrual_journal_id) return { skipped: 'This run was already booked by the platform payroll accrual.' };
    const totals = totalsFromItems(items); const label = periodLabel(run);
    const date = opts.date || run.pay_date || lastDay(run.period_year, run.period_month);
    const map = await resolveAccountMap(orgId); const result: any = { totals, date, label };
    const toInput = (ls: BuiltLine[]): JournalLineInput[] => ls.map(l => ({ account_id: map[l.role].id, debit: l.debit || null, credit: l.credit || null, description: l.description }));
    const ymm = `${run.period_year}-${String(run.period_month).padStart(2, '0')}`;

    // ---- MoneyWise ledger
    const accrual = buildAccrualLines(totals, label); const alloc = buildAllocationLines(totals, label);
    let accrualId: string | null = run.accrual_journal_id || await findJournalByRef(orgId, `PAYROLL-${ymm}`);
    if (!accrualId) { const j = await createManualJournal(orgId, userId, { date, reference: `PAYROLL-${ymm}`, description: `${label} payroll (${run.source === 'IMPORTED' ? 'signed-off payroll sheet' : 'payroll run'})`, lines: toInput(accrual) }); accrualId = j.id; result.accrual_posted = true; }
    let allocId: string | null = run.allocation_journal_id || await findJournalByRef(orgId, `PAYROLL-ALLOC-${ymm}`);
    if (!allocId && alloc.length) { const j = await createManualJournal(orgId, userId, { date, reference: `PAYROLL-ALLOC-${ymm}`, description: `${label} payroll: deductions allocated`, lines: toInput(alloc) }); allocId = j.id; result.allocation_posted = true; }
    await supabase.from('payroll_runs').update({ accrual_journal_id: accrualId, allocation_journal_id: allocId, accrued_at: run.accrued_at || new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', runId);
    result.accrual_journal_id = accrualId; result.allocation_journal_id = allocId;

    // ---- QuickBooks
    if (opts.toQuickBooks && !run.qb_journal_id) {
        const qbLines = (ls: BuiltLine[]) => ls.map(l => ({ accountId: map[l.role].qb as string, debit: l.debit, credit: l.credit, description: l.description }));
        if (accrual.some(l => !map[l.role].qb)) throw new Error('A payroll account has no QuickBooks account id; map it before posting to QuickBooks.');
        const r = await QuickBooksService.createPayrollJournal(orgId, { date, docNumber: `PAY-${ymm}`, note: `${label} payroll`, lines: qbLines(accrual) });
        if (!r.success) { await supabase.from('payroll_runs').update({ qb_sync_status: 'FAILED', qb_sync_error: String(r.error).slice(0, 500) }).eq('id', runId); throw new Error(`QuickBooks rejected the payroll journal: ${r.error}`); }
        let qbAlloc: string | null = null; let note: string | null = null;
        if (alloc.length && totals.school_fees === 0) { const a = await QuickBooksService.createPayrollJournal(orgId, { date, docNumber: `PAY-ALLOC-${ymm}`, note: `${label} payroll: deductions allocated`, lines: qbLines(alloc) }); if (a.success) qbAlloc = a.qbId as string; else note = `allocation: ${a.error}`; }
        else if (alloc.length) note = 'School-fee deductions need per-pupil lines in QuickBooks: allocate them to the pupils\' receivables (detail in the run).';
        await supabase.from('payroll_runs').update({ qb_journal_id: r.qbId, qb_allocation_journal_id: qbAlloc, qb_sync_status: note ? 'PARTIAL' : 'SUCCESS', qb_sync_error: note }).eq('id', runId);
        result.qb_journal_id = r.qbId; result.qb_allocation_journal_id = qbAlloc; result.qb_note = note;
    }
    return result;
}
