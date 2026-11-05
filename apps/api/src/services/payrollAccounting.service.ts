import { supabase } from '../lib/supabase';
import { getEntitlements } from './entitlements.service';

/**
 * Payroll in the books, and the statutory schedules for ZRA (PAYE), NAPSA and NHIMA. Enterprise plan.
 *
 * With accruals on, approving a run posts one entry dated the last day of its month:
 *   Dr Salaries and wages (gross pay)            Cr Salaries payable (net pay)
 *   Dr Employer contributions (NAPSA + NHIMA)    Cr PAYE payable, NAPSA payable, NHIMA payable (employee and employer shares)
 *                                                Cr Payroll deductions payable (loan recoveries and other deductions)
 * The run's net-pay requisition is then classed to Salaries payable, so paying staff clears the liability instead of booking the salary twice.
 * Paying ZRA, NAPSA or NHIMA is recorded here and clears their payable. With accruals off nothing in the books changes; the schedules still work.
 */

export class PayrollAcctError extends Error { constructor(message: string, readonly httpStatus = 400) { super(message); } }

const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export type Agency = 'PAYE' | 'NAPSA' | 'NHIMA';
export const AGENCIES: Agency[] = ['PAYE', 'NAPSA', 'NHIMA'];
const PAYABLE: Record<Agency, { code: string; name: string }> = {
    PAYE: { code: 'PAYE-PAYABLE', name: 'PAYE payable (ZRA)' }, NAPSA: { code: 'NAPSA-PAYABLE', name: 'NAPSA payable' }, NHIMA: { code: 'NHIMA-PAYABLE', name: 'NHIMA payable' },
};
/** Each agency is paid by the 10th of the month after the pay month. Sources disagree on some of these dates, so they are shown as a guide. */
export const dueBy = (year: number, month: number) => new Date(Date.UTC(year, month, 10)).toISOString().slice(0, 10);

async function ensureAccount(orgId: string, code: string, name: string, type: string, subtype: string): Promise<string> {
    const { data } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', code).maybeSingle();
    if (data) return data.id;
    const { data: made, error } = await supabase.from('accounts').insert({ organization_id: orgId, code, name, type, subtype, is_active: true, description: 'Created for payroll' }).select('id').single();
    if (error || !made) {
        const { data: again } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', code).maybeSingle();
        if (again) return again.id;
        throw new PayrollAcctError(`Could not set up the ${name} account.`, 500);
    }
    return made.id;
}
export const salariesPayableAccount = (o: string) => ensureAccount(o, 'SALARIES-PAYABLE', 'Salaries payable', 'LIABILITY', 'Other Current Liabilities');
const agencyAccount = (o: string, a: Agency) => ensureAccount(o, PAYABLE[a].code, PAYABLE[a].name, 'LIABILITY', 'Other Current Liabilities');

// ---------- settings ----------

export async function getStatus(orgId: string) {
    const { data } = await supabase.from('accounting_settings').select('payroll_accrual_from').eq('organization_id', orgId).maybeSingle();
    return { accrualFrom: (data?.payroll_accrual_from as string | null) ?? null, enabled: !!data?.payroll_accrual_from };
}

export async function setAccrual(orgId: string, userId: string, enabled: boolean) {
    const from = enabled ? today() : null;
    const { error } = await supabase.from('accounting_settings').upsert({ organization_id: orgId, payroll_accrual_from: from, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' });
    if (error) throw new PayrollAcctError(error.message, 500);
    await supabase.from('audit_logs').insert({ entity_type: 'PAYROLL_ACCRUAL', entity_id: orgId, action: enabled ? 'ENABLED' : 'DISABLED', user_id: userId, changes: { from } }).then(() => undefined, () => undefined);
    return getStatus(orgId);
}

/** For the payroll controller: the account its net-pay lines should be classed to, or null when accruals are off or the plan doesn't include them. */
export async function netPayAccountFor(orgId: string): Promise<string | null> {
    try {
        if (!(await getEntitlements(orgId)).isEnterprise) return null;
        if (!(await getStatus(orgId)).enabled) return null;
        return await salariesPayableAccount(orgId);
    } catch (e) { console.error('[Payroll accounting] could not prepare accruals:', (e as Error).message); return null; }
}

// ---------- accruing a run ----------

export async function accrueRun(orgId: string, userId: string | null, runId: string) {
    const { data: run } = await supabase.from('payroll_runs').select('id, period_label, period_month, period_year, status, accrued_at, approved_at').eq('organization_id', orgId).eq('id', runId).maybeSingle();
    if (!run) throw new PayrollAcctError('Payroll run not found.', 404);
    if (run.status !== 'CLEARED') throw new PayrollAcctError('Only an approved payroll run can be posted to the books.');
    if (run.accrued_at) return { posted: false, reason: 'Already posted.' };
    const st = await getStatus(orgId);
    if (!st.accrualFrom) throw new PayrollAcctError('Payroll accruals are switched off.');
    if (run.approved_at && String(run.approved_at).slice(0, 10) < st.accrualFrom) throw new PayrollAcctError(`This run was approved before accruals were switched on (${st.accrualFrom}), and its pay is already in the books.`);

    const { data: items } = await supabase.from('payroll_run_items').select('gross_pay, napsa_employee, napsa_employer, nhima_employee, nhima_employer, paye, loans, other_deductions, net_pay').eq('payroll_run_id', runId).range(0, 4999);
    const t = { gross: 0, napsaEe: 0, napsaEr: 0, nhimaEe: 0, nhimaEr: 0, paye: 0, other: 0, net: 0 };
    for (const i of (items ?? []) as any[]) {
        t.gross += Number(i.gross_pay) || 0; t.napsaEe += Number(i.napsa_employee) || 0; t.napsaEr += Number(i.napsa_employer) || 0;
        t.nhimaEe += Number(i.nhima_employee) || 0; t.nhimaEr += Number(i.nhima_employer) || 0; t.paye += Number(i.paye) || 0;
        t.other += (Number(i.loans) || 0) + (Number(i.other_deductions) || 0); t.net += Number(i.net_pay) || 0;
    }
    for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] = r2(t[k]);
    if (!(t.gross > 0)) throw new PayrollAcctError('This run has no pay to post.');

    const [wages, employer, net, paye, napsa, nhima, other] = await Promise.all([
        ensureAccount(orgId, 'SALARIES-EXP', 'Salaries and wages', 'EXPENSE', 'Expense'),
        ensureAccount(orgId, 'EMPLOYER-CONTRIB', 'Employer NAPSA and NHIMA contributions', 'EXPENSE', 'Expense'),
        salariesPayableAccount(orgId), agencyAccount(orgId, 'PAYE'), agencyAccount(orgId, 'NAPSA'), agencyAccount(orgId, 'NHIMA'),
        ensureAccount(orgId, 'PAYROLL-DEDUCTIONS', 'Payroll deductions payable', 'LIABILITY', 'Other Current Liabilities'),
    ]);
    const napsaTotal = r2(t.napsaEe + t.napsaEr), nhimaTotal = r2(t.nhimaEe + t.nhimaEr), employerCost = r2(t.napsaEr + t.nhimaEr);
    const lines = [
        { account_id: wages, debit: t.gross, credit: 0, description: 'Gross pay' },
        { account_id: employer, debit: employerCost, credit: 0, description: 'Employer contributions' },
        { account_id: net, debit: 0, credit: t.net, description: 'Net pay owed to staff' },
        { account_id: paye, debit: 0, credit: t.paye, description: 'PAYE withheld' },
        { account_id: napsa, debit: 0, credit: napsaTotal, description: 'NAPSA (employee and employer)' },
        { account_id: nhima, debit: 0, credit: nhimaTotal, description: 'NHIMA (employee and employer)' },
        { account_id: other, debit: 0, credit: t.other, description: 'Loan recoveries and other deductions' },
    ].filter((l) => l.debit || l.credit);
    const dr = r2(lines.reduce((s, l) => s + l.debit, 0)), cr = r2(lines.reduce((s, l) => s + l.credit, 0));
    if (Math.abs(dr - cr) >= 0.01) throw new PayrollAcctError(`The run doesn't add up (debits ${dr}, credits ${cr}): gross pay less deductions should equal net pay. Check the run before posting it.`, 409);

    const lastDay = new Date(Date.UTC(run.period_year, run.period_month, 0)).toISOString().slice(0, 10);
    const { data: je, error } = await supabase.from('journal_entries').insert({ organization_id: orgId, entry_date: lastDay, description: `Payroll: ${run.period_label}`, reference_number: `PAYROLL-${run.period_year}-${String(run.period_month).padStart(2, '0')}`, source_type: 'PAYROLL_RUN', source_id: runId, created_by: userId }).select('id').single();
    if (error || !je) throw new PayrollAcctError(`Could not post to the ledger: ${error?.message}`, 500);
    const { error: le } = await supabase.from('journal_lines').insert(lines.map((l) => ({ journal_entry_id: je.id, ...l })));
    if (le) { await supabase.from('journal_entries').delete().eq('id', je.id); throw new PayrollAcctError(le.message, 500); }
    await supabase.from('payroll_runs').update({ accrued_at: new Date().toISOString() }).eq('id', runId);
    return { posted: true, date: lastDay, gross: t.gross, employerCost, paye: t.paye, napsa: napsaTotal, nhima: nhimaTotal };
}

/** Called when a run is approved. Never stops the approval: a failure is logged and the run can be posted from the Payroll screen. */
export async function onRunApproved(orgId: string, userId: string | null, runId: string) {
    try {
        if (!(await getEntitlements(orgId)).isEnterprise) return;
        if (!(await getStatus(orgId)).enabled) return;
        await accrueRun(orgId, userId, runId);
    } catch (e) { console.error('[Payroll accounting] could not post the run to the books:', (e as Error).message); }
}

// ---------- schedules and payments ----------

export async function statutory(orgId: string, year: number, month: number) {
    const { data: runs } = await supabase.from('payroll_runs').select('id, period_label, status, accrued_at, employee_count').eq('organization_id', orgId).eq('period_year', year).eq('period_month', month).order('created_at');
    const approved = (runs ?? []).filter((r: any) => r.status === 'CLEARED');
    const ids = approved.map((r: any) => r.id);
    const { data: items } = ids.length ? await supabase.from('payroll_run_items').select('staff_id, staff_name, gross_pay, napsa_employee, napsa_employer, nhima_employee, nhima_employer, paye').in('payroll_run_id', ids).range(0, 19999) : { data: [] as any[] };
    const staffIds = [...new Set((items ?? []).map((i: any) => i.staff_id).filter(Boolean))] as string[];
    const { data: staff } = staffIds.length ? await supabase.from('payroll_staff').select('id, employee_number, id_type, id_number, napsa_number, nhima_number, zra_tpin').in('id', staffIds) : { data: [] as any[] };
    const sById = new Map<string, any>((staff ?? []).map((s: any) => [s.id, s]));

    const by = new Map<string, any>();
    for (const i of (items ?? []) as any[]) {
        const k = i.staff_id ?? i.staff_name;
        const s = i.staff_id ? sById.get(i.staff_id) : null;
        const x = by.get(k) ?? { staffId: i.staff_id, name: i.staff_name, employeeNumber: s?.employee_number ?? null, idNumber: s?.id_number ?? null, napsaNumber: s?.napsa_number ?? null, nhimaNumber: s?.nhima_number ?? null, tpin: s?.zra_tpin ?? null, gross: 0, paye: 0, napsaEe: 0, napsaEr: 0, nhimaEe: 0, nhimaEr: 0 };
        x.gross = r2(x.gross + Number(i.gross_pay)); x.paye = r2(x.paye + Number(i.paye)); x.napsaEe = r2(x.napsaEe + Number(i.napsa_employee)); x.napsaEr = r2(x.napsaEr + Number(i.napsa_employer));
        x.nhimaEe = r2(x.nhimaEe + Number(i.nhima_employee)); x.nhimaEr = r2(x.nhimaEr + Number(i.nhima_employer));
        by.set(k, x);
    }
    const employees = [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
    const sum = (f: (e: any) => number) => r2(employees.reduce((s, e) => s + f(e), 0));
    const owed: Record<Agency, number> = { PAYE: sum((e) => e.paye), NAPSA: sum((e) => e.napsaEe + e.napsaEr), NHIMA: sum((e) => e.nhimaEe + e.nhimaEr) };
    const { data: pays } = await supabase.from('statutory_payments').select('*').eq('organization_id', orgId).eq('period_year', year).eq('period_month', month).order('paid_on');
    const paid: Record<Agency, number> = { PAYE: 0, NAPSA: 0, NHIMA: 0 };
    for (const p of (pays ?? []) as any[]) paid[p.agency as Agency] = r2(paid[p.agency as Agency] + Number(p.amount));
    const missing = employees.filter((e) => !e.napsaNumber || !e.tpin).length;
    return {
        year, month, due: dueBy(year, month), runs: runs ?? [], approvedRuns: approved.length, pendingRuns: (runs ?? []).filter((r: any) => r.status !== 'CLEARED').length,
        employees, totals: { gross: sum((e) => e.gross), paye: owed.PAYE, napsaEmployee: sum((e) => e.napsaEe), napsaEmployer: sum((e) => e.napsaEr), nhimaEmployee: sum((e) => e.nhimaEe), nhimaEmployer: sum((e) => e.nhimaEr) },
        agencies: AGENCIES.map((a) => ({ agency: a, owed: owed[a], paid: paid[a], outstanding: r2(owed[a] - paid[a]) })), payments: pays ?? [], employeesMissingNumbers: missing,
    };
}

export async function recordPayment(orgId: string, userId: string, body: any) {
    const agency = String(body?.agency ?? '').toUpperCase() as Agency;
    if (!AGENCIES.includes(agency)) throw new PayrollAcctError('Choose ZRA (PAYE), NAPSA or NHIMA.');
    const year = Math.floor(Number(body?.year)), month = Math.floor(Number(body?.month));
    if (!(year >= 2000 && year <= 2100 && month >= 1 && month <= 12)) throw new PayrollAcctError('Choose the pay month this payment is for.');
    const amount = r2(Number(body?.amount));
    if (!(amount > 0)) throw new PayrollAcctError('Enter the amount paid.');
    const paidOn = isDate(body?.paidOn) ? body.paidOn : today();
    const s = await statutory(orgId, year, month);
    const row = s.agencies.find((a) => a.agency === agency)!;
    if (amount > row.outstanding + 0.01) throw new PayrollAcctError(`Only ${row.outstanding.toFixed(2)} is still owed to ${agency} for ${year}-${String(month).padStart(2, '0')}.`);

    const st = await getStatus(orgId);
    let accountId: string | null = null;
    if (st.enabled && body?.accountId) {
        const { data: acct } = await supabase.from('accounts').select('id, type').eq('organization_id', orgId).eq('id', String(body.accountId)).maybeSingle();
        if (!acct || acct.type !== 'ASSET') throw new PayrollAcctError('Choose the bank, cash or wallet account the money came from.');
        accountId = acct.id;
    }
    const { data: pay, error } = await supabase.from('statutory_payments').insert({ organization_id: orgId, agency, period_year: year, period_month: month, amount, paid_on: paidOn, method: String(body?.method ?? '').trim().slice(0, 40) || null, reference: String(body?.reference ?? '').trim().slice(0, 80) || null, account_id: accountId, created_by: userId }).select('*').single();
    if (error || !pay) throw new PayrollAcctError(error?.message ?? 'Could not record the payment.', 500);
    if (accountId) {
        try {
            const payable = await agencyAccount(orgId, agency);
            const { data: je, error: je_err } = await supabase.from('journal_entries').insert({ organization_id: orgId, entry_date: paidOn, description: `${agency} payment for ${year}-${String(month).padStart(2, '0')}`, reference_number: `STAT-${pay.id.slice(0, 8)}`, source_type: 'STATUTORY_PAYMENT', source_id: pay.id, created_by: userId }).select('id').single();
            if (je_err || !je) throw new Error(je_err?.message);
            const { error: le } = await supabase.from('journal_lines').insert([{ journal_entry_id: je.id, account_id: payable, debit: amount, credit: 0 }, { journal_entry_id: je.id, account_id: accountId, debit: 0, credit: amount }]);
            if (le) { await supabase.from('journal_entries').delete().eq('id', je.id); throw new Error(le.message); }
        } catch (e) { await supabase.from('statutory_payments').delete().eq('id', pay.id); throw new PayrollAcctError(`Could not post the payment to the ledger: ${(e as Error).message}`, 500); }
    }
    return pay;
}

/** The months that have payroll, with what is owed, paid and outstanding to each agency, newest first. */
export async function periods(orgId: string) {
    const { data: runs } = await supabase.from('payroll_runs').select('period_year, period_month').eq('organization_id', orgId).eq('status', 'CLEARED').range(0, 999);
    const keys = [...new Set((runs ?? []).map((r: any) => `${r.period_year}-${r.period_month}`))].map((k) => k.split('-').map(Number) as [number, number]).sort((a, b) => b[0] - a[0] || b[1] - a[1]).slice(0, 24);
    const out = [];
    for (const [y, m] of keys) { const s = await statutory(orgId, y, m); out.push({ year: y, month: m, due: s.due, agencies: s.agencies, gross: s.totals.gross }); }
    return out;
}
