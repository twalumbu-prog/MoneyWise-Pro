import { employerLoanLedger } from '../services/employerLoanLedger.service';
import { mergeRules, allowanceBases, computeStatutory, AllowanceType } from '../lib/payrollStatutory';
import { postRunJournals, resolveAccountMap } from '../services/payrollAccrual.service';
import { RECOVERABLE_STATUSES, loanTermExpired, totalOwed } from '../lib/loanMath';
import { getPreferences, getPersonalOrgForUser } from '../services/userPreferences.service';
import { accountsOf, getAllPaymentInfo } from '../services/paymentInfo.service';
import { Request, Response } from 'express';
import * as payrollAcct from '../services/payrollAccounting.service';
import { supabase } from '../lib/supabase';
import { matchStaffMember } from '../lib/staffUserMatching';

const adminOnly = (req: Request, res: Response): boolean => {
    const role = (req as any).user.role;
    if (!['ADMIN', 'ACCOUNTANT'].includes(role)) {
        res.status(403).json({ error: 'Admin or Accountant only' });
        return false;
    }
    return true;
};

// ── Staff ─────────────────────────────────────────────────────────────────────

export const listStaff = async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organization_id;
        const { department, status } = req.query;

        let query = supabase
            .from('payroll_staff')
            .select('*')
            .eq('organization_id', orgId)
            .eq('is_archived', false)
            .order('last_name');

        if (department && department !== 'ALL') query = query.eq('department', department as string);
        if (status) query = query.eq('status', status as string);

        const { data, error } = await query;
        if (error) throw error;
        res.json(data ?? []);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const getStaffMember = async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organization_id;
        const { id } = req.params;

        const { data, error } = await supabase
            .from('payroll_staff')
            .select('*')
            .eq('id', id)
            .eq('organization_id', orgId)
            .single();
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const createStaffMember = async (req: Request, res: Response) => {
    try {
        if (!adminOnly(req, res)) return;
        const orgId = (req as any).user.organization_id;
        const body = req.body;

        // Generate employee number
        const { count } = await supabase
            .from('payroll_staff')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId);

        const empNum = `EMP${String((count ?? 0) + 1).padStart(4, '0')}`;

        const { data, error } = await supabase
            .from('payroll_staff')
            .insert({
                organization_id: orgId,
                employee_number: empNum,
                first_name: body.first_name,
                middle_name: body.middle_name || null,
                last_name: body.last_name,
                id_type: body.id_type || null,
                id_number: body.id_number || null,
                napsa_number: body.napsa_number || null,
                nhima_number: body.nhima_number || null,
                zra_tpin: body.zra_tpin || null,
                date_of_birth: body.date_of_birth || null,
                gender: body.gender || null,
                phone: body.phone || null,
                email: body.email || null,
                department: body.department || null,
                position: body.position || null,
                status: body.status || 'ACTIVE',
                basic_pay: body.basic_pay ?? 0,
                allowances: body.allowances ?? [],
                deductions: body.deductions ?? [],
                bank_name: body.bank_name || null,
                bank_account_number: body.bank_account_number || null,
                bank_account_name: body.bank_account_name || null,
                mobile_money_provider: body.mobile_money_provider || null,
                mobile_money_number: body.mobile_money_number || null,
                payment_method: body.payment_method || 'BANK',
                user_id: body.user_id || null,
            })
            .select()
            .single();
        if (error) throw error;

        // Auto-link to a team member (by email, then exact name) so any
        // salary advance / loan they later raise as a team member is
        // recognised by payroll. Non-fatal — matching failure shouldn't
        // block staff creation.
        if (!data.user_id) {
            try {
                const matchedUserId = await matchStaffMember(orgId, data.id);
                if (matchedUserId) data.user_id = matchedUserId;
            } catch (matchErr) {
                console.error('[createStaffMember] auto-match failed:', matchErr);
            }
        }

        res.status(201).json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const updateStaffMember = async (req: Request, res: Response) => {
    try {
        if (!adminOnly(req, res)) return;
        const orgId = (req as any).user.organization_id;
        const { id } = req.params;
        const body = req.body;

        const allowed = [
            'first_name', 'middle_name', 'last_name', 'id_type', 'id_number',
            'napsa_number', 'nhima_number', 'zra_tpin', 'date_of_birth', 'gender',
            'phone', 'email', 'department', 'position', 'status',
            'basic_pay', 'allowances', 'deductions',
            'bank_name', 'bank_account_number', 'bank_account_name',
            'mobile_money_provider', 'mobile_money_number', 'payment_method', 'user_id'
        ];
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (key in body) updates[key] = body[key];
        }

        const { data, error } = await supabase
            .from('payroll_staff')
            .update(updates)
            .eq('id', id)
            .eq('organization_id', orgId)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const archiveStaffMember = async (req: Request, res: Response) => {
    try {
        if (!adminOnly(req, res)) return;
        const orgId = (req as any).user.organization_id;
        const { id } = req.params;

        const { error } = await supabase
            .from('payroll_staff')
            .update({ is_archived: true, status: 'TERMINATED', updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('organization_id', orgId);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const getStaffPayrollHistory = async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organization_id;
        const { id } = req.params;

        const { data, error } = await supabase
            .from('payroll_run_items')
            .select(`
                *,
                payroll_runs (id, period_label, period_month, period_year, status, run_at)
            `)
            .eq('staff_id', id)
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data ?? []);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

// ── Payroll Runs ──────────────────────────────────────────────────────────────

export const listPayrollRuns = async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organization_id;

        const { data, error } = await supabase
            .from('payroll_runs')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data ?? []);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const getPayrollRun = async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organization_id;
        const { id } = req.params;

        const [runRes, itemsRes, docsRes] = await Promise.all([
            supabase.from('payroll_runs').select('*').eq('id', id).eq('organization_id', orgId).single(),
            supabase.from('payroll_run_items').select('*').eq('payroll_run_id', id).order('staff_name'),
            supabase.from('payroll_documents').select('*').eq('payroll_run_id', id).order('created_at'),
        ]);

        if (runRes.error) throw runRes.error;
        res.json({ run: runRes.data, items: itemsRes.data ?? [], documents: docsRes.data ?? [] });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

// Zambia statutory calculation helpers
export const createPayrollRun = async (req: Request, res: Response) => {
    try {
        if (!adminOnly(req, res)) return;
        const orgId = (req as any).user.organization_id;
        const userId = (req as any).user.id;
        const { period_month, period_year, items: submittedItems, notes } = req.body;

        if (!period_month || !period_year || !Array.isArray(submittedItems) || submittedItems.length === 0) {
            return res.status(400).json({ error: 'period_month, period_year, and items[] are required' });
        }

        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const periodLabel = `${monthNames[period_month - 1]} Payroll Run - ${period_year}`;

        // Statutory rules + allowance flags come from the organisation's payroll settings (see lib/payrollStatutory.ts).
        const { data: cfg } = await supabase.from('payroll_config').select('allowance_types, statutory_rules').eq('organization_id', orgId).maybeSingle();
        const rules = mergeRules((cfg as any)?.statutory_rules);
        const allowanceTypes: AllowanceType[] = ((cfg as any)?.allowance_types || []) as AllowanceType[];

        const computedItems = submittedItems.map((item: any) => {
            const basicPay = Number(item.basic_pay) || 0;
            const overtime = Number(item.overtime) || 0;
            const taxableAllowances = Number(item.taxable_allowances) || 0;
            const nonTaxableAllowances = Number(item.non_taxable_allowances) || 0;
            const allowancesTotal = taxableAllowances + nonTaxableAllowances;
            const breakdown = (item.allowance_breakdown && typeof item.allowance_breakdown === 'object') ? item.allowance_breakdown : {};
            const breakdownSum = Object.values(breakdown).reduce((a: number, v: any) => a + (Number(v) || 0), 0);

            // Per-statutory bases: the breakdown's allowance types carry their own NAPSA / NHIMA / PAYE flags. Any allowance amount the
            // breakdown does not name (a staff record's own allowance, an ad-hoc one) is treated as fully statutory — the prudent default.
            let bases = { napsa: taxableAllowances, nhima: taxableAllowances, paye: taxableAllowances, total: allowancesTotal };
            if (breakdownSum > 0) {
                const b = allowanceBases(breakdown, allowanceTypes);
                const rem = Math.max(0, allowancesTotal - breakdownSum);
                bases = { napsa: b.napsa + rem, nhima: b.nhima + rem, paye: b.paye + rem, total: Math.max(allowancesTotal, b.total) };
            }

            const st = computeStatutory({
                basic: basicPay, overtime, allowanceBases: bases,
                napsaExempt: !!item.napsa_exempt, nhimaExempt: !!item.nhima_exempt,
                override: item.statutory_override && typeof item.statutory_override === 'object' ? item.statutory_override : undefined,
            }, rules);
            const grossPay = st.gross;

            const schoolFees = Number(item.school_fees) || 0;
            const salaryAdvances = Number(item.salary_advances) || 0;
            const loans = Number(item.loans) || 0;
            const otherDeductions = Number(item.other_deductions) || 0;
            const netPay = parseFloat((grossPay - st.statutory_total - schoolFees - salaryAdvances - loans - otherDeductions).toFixed(2));

            return {
                organization_id: orgId,
                staff_id: item.staff_id || null,
                staff_name: item.staff_name,
                basic_pay: basicPay,
                overtime,
                allowances: allowancesTotal,
                gross_pay: grossPay,
                napsa_employee: st.napsa_employee,
                napsa_employer: st.napsa_employer,
                nhima_employee: st.nhima_employee,
                nhima_employer: st.nhima_employer,
                paye: st.paye,
                statutory_total: st.statutory_total,
                statutory_override: st.overridden,
                school_fees: schoolFees,
                salary_advances: salaryAdvances,
                bonus: Number(item.bonus) || 0,
                loans,
                other_deductions: otherDeductions,
                net_pay: netPay,
                department: item.department || null,
                payment_method: item.payment_method || 'BANK',
                pay_source: item.pay_source || null,
                destination_method: item.destination_method || null,
                allowance_breakdown: item.allowance_breakdown || {},
                deduction_breakdown: item.deduction_breakdown || {},
                bank_name: item.bank_name || null,
                bank_account_number: item.bank_account_number || null,
                mobile_money_number: item.mobile_money_number || null,
            };
        });

        const grossTotal = computedItems.reduce((s: number, i: any) => s + i.gross_pay, 0);
        const netTotal = computedItems.reduce((s: number, i: any) => s + i.net_pay, 0);

        const { data: run, error: runErr } = await supabase
            .from('payroll_runs')
            .insert({
                organization_id: orgId,
                period_label: periodLabel,
                period_month,
                period_year,
                status: 'PENDING_APPROVAL',
                gross_total: parseFloat(grossTotal.toFixed(2)),
                net_total: parseFloat(netTotal.toFixed(2)),
                employee_count: computedItems.length,
                notes: notes || null,
                run_by: userId,
                run_at: new Date().toISOString(),
            })
            .select()
            .single();
        if (runErr) throw runErr;

        const itemsWithRunId = computedItems.map((i: any) => ({ ...i, payroll_run_id: run.id }));
        const { error: itemsErr } = await supabase.from('payroll_run_items').insert(itemsWithRunId);
        if (itemsErr) throw itemsErr;

        const advance_check = await checkAdvanceRecovery(orgId, itemsWithRunId, period_month, period_year).catch(() => null);
        res.status(201).json({ ...run, advance_check });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

// ── Loan / advance recovery ──────────────────────────────────────────────────

/**
 * Statuses a loan or advance can sit in while it still owes money. DISBURSED/
 * RECEIVED cover the general expense pipeline; ACCOUNTED/CATEGORIZED/COMPLETED
 * are the states a LOAN/ADVANCE requisition actually settles into once the
 * payout is confirmed (CATEGORIZED vs COMPLETED just branches on whether
 * QuickBooks is connected — see requisition.controller.ts) — money is out
 * the door either way, which is what matters for recovery.
 */
/**
 * Load every still-owing loan/advance for an org, with how much has already
 * been recovered against each. Returns rows ordered oldest-first so recoveries
 * are allocated to the longest-standing debt first.
 *
 * `staff` rows are {id: payroll_staff.id, user_id}. A debt is matched to a
 * staff member two ways: primarily via requisitions.payroll_staff_id (set
 * when the requisition was filed by an accountant on the employee's behalf —
 * the common case), falling back to requestor_id === payroll_staff.user_id
 * (the employee filed it themselves). Every returned debt carries a resolved
 * `staff_id` so callers never need to re-derive it.
 */
async function loadOutstandingDebts(orgId: string, staff: { id: string; user_id: string | null }[]) {
    if (staff.length === 0) return [];

    const staffIds = staff.map(s => s.id);
    const userIds = staff.filter(s => s.user_id).map(s => s.user_id as string);
    const byUserId = new Map(staff.filter(s => s.user_id).map(s => [s.user_id as string, s.id]));

    const orFilter = [
        `payroll_staff_id.in.(${staffIds.join(',')})`,
        ...(userIds.length > 0 ? [`requestor_id.in.(${userIds.join(',')})`] : []),
    ].join(',');

    const { data: reqs, error: reqErr } = await supabase
        .from('requisitions')
        .select('id, requestor_id, payroll_staff_id, type, status, created_at, monthly_deduction, repayment_period, interest_rate, loan_amount, actual_total, estimated_total')
        .eq('organization_id', orgId)
        .in('type', ['ADVANCE', 'LOAN'])
        .in('status', RECOVERABLE_STATUSES)
        .or(orFilter)
        .order('created_at', { ascending: true });
    if (reqErr) throw reqErr;
    if (!reqs || reqs.length === 0) return [];

    const { data: recoveries, error: recErr } = await supabase
        .from('payroll_loan_recoveries')
        .select('requisition_id, amount, period_month, period_year')
        .in('requisition_id', reqs.map(r => r.id));
    if (recErr) throw recErr;

    const { data: manualRecoveries } = await supabase
        .from('loan_manual_recoveries')
        .select('requisition_id, amount')
        .in('requisition_id', reqs.map(r => r.id));

    // An advance is recovered at the principal paid to the employee: the wallet's withdrawal / transfer fee is a company cost
    // (it sits in bank charges), so it is not added to what the employee owes.
    const advanceIds = reqs.filter(r => r.type === 'ADVANCE').map(r => r.id);
    const feeByReq = new Map<string, number>();
    if (advanceIds.length) {
        const { data: lis } = await supabase.from('line_items').select('requisition_id, description, actual_amount, estimated_amount').in('requisition_id', advanceIds);
        for (const li of lis ?? []) {
            if (/withdraw(al)?\s*(fee|charge)|transaction (fee|charge)|bank charge|transfer fee/i.test(String(li.description || ''))) {
                feeByReq.set(li.requisition_id, (feeByReq.get(li.requisition_id) || 0) + (Number(li.actual_amount) || Number(li.estimated_amount) || 0));
            }
        }
    }

    return reqs.map(r => {
        const mine = (recoveries ?? []).filter(x => x.requisition_id === r.id);
        const manual = (manualRecoveries ?? []).filter(x => x.requisition_id === r.id);
        const recovered = mine.reduce((s, x) => s + Number(x.amount), 0) + manual.reduce((s, x) => s + Number(x.amount), 0);
        const owed = r.type === 'ADVANCE' ? Math.max(0, parseFloat((totalOwed(r) - (feeByReq.get(r.id) || 0)).toFixed(2))) : totalOwed(r);
        const staff_id = r.payroll_staff_id || (r.requestor_id ? byUserId.get(r.requestor_id) : undefined) || null;
        return {
            ...r,
            staff_id,
            owed,
            recovered,
            outstanding: Math.max(0, parseFloat((owed - recovered).toFixed(2))),
            recoveredPeriods: mine.map(x => `${x.period_year}-${x.period_month}`),
        };
    }).filter(d =>
        // Every debt must be attributable to a staff member
        d.staff_id &&
        // Skip loans whose calendar repayment term has elapsed — covers debts
        // that were repaid outside the payroll system before tracking was added
        !loanTermExpired(d)
    );
}

/**
 * The instalment to recover from a debt this period — never more than what is
 * still outstanding, so the final instalment tapers to the exact balance.
 */
function installmentFor(debt: { monthly_deduction: any; outstanding: number }): number {
    const monthly = Number(debt.monthly_deduction) || 0;
    const target = monthly > 0 ? monthly : debt.outstanding;
    return parseFloat(Math.min(target, debt.outstanding).toFixed(2));
}


/**
 * Month-end salary-advance check. Every advance paid out during the month must be deducted from the payroll register in that month's run, so after
 * the run the Staff Salary Advances account should hold nothing but advances paid AFTER month end. Two tests:
 *   1. per person — what the run deducts (salary_advances) vs what that person still owes at period end (advances requested up to month end,
 *      principal only, less what was already recovered). UNDER = an advance is left on the books; OVER = deducting money that isn't owed.
 *   2. ledger — after the run's journals are posted, the account's balance at period end must be zero. This catches advances that cannot be tied
 *      to a payroll staff member (e.g. filed as an ordinary expense, or for someone who is not on the register).
 * Warnings only — a run is never blocked by this; the accountant decides.
 */
export async function checkAdvanceRecovery(orgId: string, items: any[], month: number, year: number, opts: { ledger?: boolean } = {}) {
    const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    const { data: staffData } = await supabase.from('payroll_staff').select('id, user_id, first_name, last_name').eq('organization_id', orgId).eq('is_archived', false);
    const staff = staffData ?? [];
    const debts = (await loadOutstandingDebts(orgId, staff)).filter((d: any) => d.type === 'ADVANCE' && new Date(d.created_at) <= periodEnd);
    const deducted = new Map<string, number>();
    for (const i of items) if (i.staff_id) deducted.set(i.staff_id, (deducted.get(i.staff_id) || 0) + (Number(i.salary_advances) || 0));
    const warnings: any[] = [];
    for (const st of staff) {
        const owed = parseFloat(debts.filter((d: any) => d.staff_id === st.id).reduce((a: number, d: any) => a + d.outstanding, 0).toFixed(2));
        const took = parseFloat((deducted.get(st.id) || 0).toFixed(2));
        if (Math.abs(owed - took) < 0.5) continue;
        warnings.push({
            staff_id: st.id, staff_name: [st.first_name, st.last_name].filter(Boolean).join(' '),
            outstanding: owed, deducted: took, difference: parseFloat((owed - took).toFixed(2)),
            kind: took < owed ? 'UNDER' : 'OVER',
            message: took < owed ? `Owes K${owed.toFixed(2)} in advances but only K${took.toFixed(2)} is deducted — the rest stays on Staff Salary Advances.`
                : `K${took.toFixed(2)} is deducted but only K${owed.toFixed(2)} of advances is outstanding.`,
        });
    }
    let ledger: any = undefined;
    if (opts.ledger) {
        try {
            const acct = (await resolveAccountMap(orgId)).salary_advances;
            const { data: lines } = await supabase.from('journal_lines').select('debit, credit, journal_entries!inner(entry_date, organization_id)').eq('account_id', acct.id).eq('journal_entries.organization_id', orgId).lte('journal_entries.entry_date', periodEnd.toISOString().slice(0, 10)).limit(5000);
            const balance = parseFloat((lines ?? []).reduce((a: number, l: any) => a + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0).toFixed(2));
            ledger = { account: acct.name, balance_at_period_end: balance, ok: Math.abs(balance) < 0.5,
                message: Math.abs(balance) < 0.5 ? 'Staff Salary Advances is nil at period end.' : `Staff Salary Advances holds K${balance.toFixed(2)} at period end — advances paid in the period were not all deducted (or some cannot be tied to a payroll staff member).` };
        } catch (e: any) { ledger = { error: e.message }; }
    }
    return { ok: warnings.length === 0 && (!ledger || ledger.ok !== false), warnings, ledger };
}

/**
 * Post the loan/advance recoveries a payroll run collected, then settle any
 * debt whose balance has reached zero. Each staff member's total `loans`
 * deduction is allocated across their outstanding debts, oldest first.
 */
async function recordLoanRecoveries(orgId: string, run: any, runItems: any[]) {
    const withDeductions = runItems.filter(i => (Number(i.loans) > 0 || Number(i.salary_advances) > 0) && i.staff_id);
    if (withDeductions.length === 0) return { recovered: 0, settled: 0 };

    const { data: staff, error: staffErr } = await supabase
        .from('payroll_staff')
        .select('id, user_id')
        .eq('organization_id', orgId)
        .in('id', withDeductions.map(i => i.staff_id));
    if (staffErr) throw staffErr;
    if (!staff || staff.length === 0) return { recovered: 0, settled: 0 };

    const debts = await loadOutstandingDebts(orgId, staff);
    if (debts.length === 0) return { recovered: 0, settled: 0 };

    const rows: any[] = [];
    const settledIds: string[] = [];

    for (const item of withDeductions) {
        const member = staff.find(s => s.id === item.staff_id);
        if (!member) continue;

        // Oldest debt first, so the longest-standing balance clears first
        // The advances column settles ADVANCE debts and the loans column settles LOAN debts; each is allocated oldest first.
        const theirs = debts.filter(d => d.staff_id === member.id && d.outstanding > 0)
            .sort((a: any, b: any) => (a.type === b.type ? 0 : a.type === 'ADVANCE' ? -1 : 1));
        const pool: Record<string, number> = { ADVANCE: Number(item.salary_advances) || 0, LOAN: Number(item.loans) || 0 };

        for (const debt of theirs) {
            let remaining = pool[debt.type] ?? 0;
            if (remaining <= 0.005) continue;
            const take = parseFloat(Math.min(remaining, debt.outstanding).toFixed(2));
            if (take <= 0) continue;

            rows.push({
                organization_id: orgId,
                requisition_id: debt.id,
                payroll_run_id: run.id,
                staff_id: item.staff_id,
                amount: take,
                period_month: run.period_month,
                period_year: run.period_year,
            });

            debt.outstanding = parseFloat((debt.outstanding - take).toFixed(2));
            pool[debt.type] = parseFloat((remaining - take).toFixed(2));

            if (debt.outstanding <= 0.005) settledIds.push(debt.id);
        }
    }

    if (rows.length > 0) {
        // Idempotent: the (requisition_id, payroll_run_id) unique constraint
        // means re-approving the same run cannot double-recover an instalment.
        const { error: insErr } = await supabase
            .from('payroll_loan_recoveries')
            .upsert(rows, { onConflict: 'requisition_id,payroll_run_id', ignoreDuplicates: true });
        if (insErr) throw insErr;
    }

    if (settledIds.length > 0) {
        const { error: setErr } = await supabase
            .from('requisitions')
            .update({ status: 'SETTLED' })
            .in('id', settledIds);
        if (setErr) throw setErr;
    }

    // A loan paid into the employee's MoneyWise personal account lives there as a liability: reflect what payroll just recovered.
    // Best effort and idempotent per (requisition, run) — payroll itself must never fail because of a borrower's books.
    for (const reqId of new Set(rows.map((r: any) => r.requisition_id as string))) {
        await employerLoanLedger.healLoanLedger(reqId)
            .catch((e: any) => console.error('[Payroll] borrower ledger update failed for', reqId, e?.message));
    }

    return { recovered: rows.length, settled: settledIds.length };
}

// Human-readable label for a pay_source value
function paySourceLabel(paySource: string): string {
    if (paySource.startsWith('wallet:')) return 'MoneyWise Wallet';
    const labels: Record<string, string> = {
        CASH: 'Cash',
        CHEQUE: 'Cheque',
        BANK_TRANSFER: 'Bank Transfer',
        AIRTEL_MONEY: 'Airtel Money',
        MTN_MONEY: 'MTN Money',
        ZAMTEL_MONEY: 'Zamtel Money',
        LEGACY: 'MoneyWise Wallet',
    };
    return labels[paySource] ?? paySource;
}

// Whether a pay_source routes through MoneyWise/Lenco electronic disbursement
function isElectronicWallet(paySource: string): boolean {
    return paySource.startsWith('wallet:') || paySource === 'LEGACY';
}

export const approvePayrollRun = async (req: Request, res: Response) => {
    try {
        if (!adminOnly(req, res)) return;
        const orgId = (req as any).user.organization_id;
        const userId = (req as any).user.id;
        const { id } = req.params;

        // 1. Load the run + all its items
        const { data: run, error: runErr } = await supabase
            .from('payroll_runs')
            .select('*')
            .eq('id', id)
            .eq('organization_id', orgId)
            .single();
        if (runErr) throw runErr;
        if (!run) return res.status(404).json({ error: 'Payroll run not found' });
        if (run.status !== 'PENDING_APPROVAL') {
            return res.status(400).json({ error: `Payroll run is already ${run.status}` });
        }

        const { data: runItems, error: itemsErr } = await supabase
            .from('payroll_run_items')
            .select('*')
            .eq('payroll_run_id', id);
        if (itemsErr) throw itemsErr;
        if (!runItems || runItems.length === 0) {
            return res.status(400).json({ error: 'No items found for this payroll run' });
        }

        // 2. Load org details for requisition creation
        const { data: orgData } = await supabase
            .from('organizations')
            .select('name, lenco_secret_key, payment_test_mode')
            .eq('id', orgId)
            .single();

        // 3. Group items by pay_source
        const groups = new Map<string, typeof runItems>();
        for (const item of runItems) {
            const src = item.pay_source || 'LEGACY';
            if (!groups.has(src)) groups.set(src, []);
            groups.get(src)!.push(item);
        }

        const createdRequisitions: any[] = [];

        // 4. Create one requisition per group
        for (const [paySource, groupItems] of groups.entries()) {
            const srcLabel = paySourceLabel(paySource);
            const electronic = isElectronicWallet(paySource);
            const groupNet = groupItems.reduce((s: number, i: any) => s + Number(i.net_pay), 0);

            const reqTitle = `${run.period_label} — ${srcLabel} (${groupItems.length} employee${groupItems.length !== 1 ? 's' : ''})`;

            // Determine wallet id for electronic runs
            const walletId = electronic && paySource.startsWith('wallet:')
                ? paySource.replace('wallet:', '')
                : null;

            // Insert requisition header.
            // AUTHORISED (not "APPROVED") — the requisitions status check
            // constraint has no APPROVED member.
            const { data: req_, error: reqErr } = await supabase
                .from('requisitions')
                .insert({
                    organization_id: orgId,
                    requestor_id: userId,
                    type: 'PAYROLL',
                    status: 'AUTHORISED',
                    description: reqTitle,
                    estimated_total: parseFloat(groupNet.toFixed(2)),
                    actual_total: parseFloat(groupNet.toFixed(2)),
                    payment_method: electronic ? 'BATCH_PAYROLL' : paySource,
                    pay_from_wallet_id: walletId,
                    payroll_run_id: id,
                    department: 'Payroll',
                })
                .select()
                .single();
            if (reqErr) throw reqErr;

            // Employees who chose (Settings → Preferences) to receive their salary in their MoneyWise personal account.
            const salaryOverrides = electronic ? await resolveSalaryOverrides(groupItems.map((i: any) => i.staff_id).filter(Boolean)) : new Map<string, SalaryOverride>();

            // Build line items
            const lineItems = groupItems.map((item: any) => {
                const override = item.staff_id ? salaryOverrides.get(item.staff_id) : undefined;
                const personalOrgId = override?.kind === 'MONEYWISE' ? override.orgId : undefined;
                if (personalOrgId) {
                    return {
                        requisition_id: req_.id,
                        description: `Payroll for ${item.staff_name}`,
                        quantity: 1,
                        unit_price: Number(item.net_pay),
                        estimated_amount: Number(item.net_pay),
                        employee_id: item.staff_id || null,
                        employee_name: item.staff_name,
                        payment_method: 'MONEYWISE_PAY',
                        recipient_account: personalOrgId,
                        recipient_bank_code: 'MONEYWISE',
                        is_valid: true, // an on-us transfer to a MoneyWise account needs no bank-name lookup
                        verified_name: item.staff_name,
                        error_message: null,
                    };
                }
                // The employee's own choice of one of their saved accounts replaces the payroll record's details.
                const chosen = override && override.kind !== 'MONEYWISE' ? override : null;
                const destMethod = chosen ? chosen.kind : (item.destination_method || item.payment_method || 'BANK');
                const chosenAccount = chosen?.kind === 'MOBILE_MONEY' ? chosen.number : chosen?.kind === 'BANK' ? chosen.account_number : null;
                const chosenBank = chosen?.kind === 'BANK' ? chosen.bank_name : null;
                return {
                    requisition_id: req_.id,
                    description: `Payroll for ${item.staff_name}`,
                    quantity: 1,
                    unit_price: Number(item.net_pay),
                    estimated_amount: Number(item.net_pay),
                    employee_id: item.staff_id || null,
                    employee_name: item.staff_name,
                    payment_method: electronic ? destMethod : paySource,
                    recipient_account: chosenAccount ?? (destMethod === 'MOBILE_MONEY'
                        ? item.mobile_money_number
                        : item.bank_account_number),
                    recipient_bank_code: destMethod === 'BANK' ? (chosenBank ?? item.bank_name) : null,
                    is_valid: !electronic, // external methods are pre-valid; electronic need Lenco verification
                    verified_name: !electronic ? item.staff_name : null,
                    error_message: null,
                };
            });

            // With payroll accruals on, paying staff clears Salaries payable instead of booking the salary a second time.
            const netPayAccount = await payrollAcct.netPayAccountFor(orgId);
            if (netPayAccount) lineItems.forEach((li: any) => { li.account_id = netPayAccount; });

            // For electronic (Lenco) runs, verify accounts if org has a secret key
            if (electronic && orgData?.lenco_secret_key && !orgData?.payment_test_mode) {
                // Verification is handled downstream by the disbursement processor — leave is_valid as false until then
            } else if (electronic && orgData?.payment_test_mode) {
                for (const li of lineItems) {
                    li.is_valid = true;
                    li.verified_name = `Test: ${li.employee_name}`;
                }
            }

            const { error: liErr } = await supabase.from('line_items').insert(lineItems);
            if (liErr) throw liErr;

            createdRequisitions.push({ requisition_id: req_.id, pay_source: paySource, label: srcLabel, employee_count: groupItems.length, net_total: groupNet });
        }

        // Advance check BEFORE the recoveries are recorded (so what this run deducts is still outstanding)
        const advanceCheckPre = await checkAdvanceRecovery(orgId, runItems, run.period_month, run.period_year).catch(() => null);

        // 5. Post loan/advance recoveries and settle any cleared debts
        const recovery = await recordLoanRecoveries(orgId, run, runItems);

        // 6. Mark the payroll run as CLEARED
        const { data: updatedRun, error: updateErr } = await supabase
            .from('payroll_runs')
            .update({
                status: 'CLEARED',
                approved_by: userId,
                approved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('organization_id', orgId)
            .select()
            .single();
        if (updateErr) throw updateErr;

        // Books. Two mechanisms exist and must never both post the same run:
        //   1. the platform accrual (Enterprise plan, switched on in Accounting settings) — generic accounts it creates itself;
        //   2. this organisation's own mapped accounts (payroll_config.account_map, e.g. a QuickBooks-mirrored chart) — payrollAccrual.service.
        // The platform accrual goes first; if it booked the run (accrued_at set) the mapped-account journal is skipped.
        // Neither blocks the approval: a posting problem is logged / reported on the run so the accountant can retry.
        await payrollAcct.onRunApproved(orgId, userId, id);
        let journals: any = null;
        try { journals = await postRunJournals(orgId, id, userId, { toQuickBooks: true }); }
        catch (e: any) {
            console.error('[approvePayrollRun] payroll journal not posted:', e.message);
            await supabase.from('payroll_runs').update({ qb_sync_status: 'FAILED', qb_sync_error: String(e.message).slice(0, 500) }).eq('id', id);
            journals = { error: e.message };
        }

        const ledgerCheck = await checkAdvanceRecovery(orgId, [], run.period_month, run.period_year, { ledger: true }).then(c => c.ledger).catch(() => null);
        res.json({
            run: updatedRun,
            requisitions: createdRequisitions,
            loan_recovery: recovery,
            journals,
            advance_check: advanceCheckPre ? { ...advanceCheckPre, ledger: ledgerCheck } : null,
        });
    } catch (err: any) {
        console.error('[approvePayrollRun]', err);
        res.status(500).json({ error: err.message });
    }
};

export const getStaffDepartments = async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organization_id;
        const { data, error } = await supabase
            .from('payroll_staff')
            .select('department')
            .eq('organization_id', orgId)
            .eq('is_archived', false)
            .not('department', 'is', null);
        if (error) throw error;
        const depts = [...new Set((data ?? []).map((r: any) => r.department).filter(Boolean))].sort();
        res.json(depts);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

// ── Configuration ─────────────────────────────────────────────────────────────

export const getPayrollConfig = async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organization_id;
        const { data, error } = await supabase
            .from('payroll_config')
            .select('*')
            .eq('organization_id', orgId)
            .maybeSingle();

        if (error) {
            console.error('getPayrollConfig DB Error:', error);
            // If the table does not exist (42P01) or other error, we can fail gracefully or throw
            throw error;
        }

        if (!data) {
            return res.json({
                basic_pay_configured: true,
                allowance_types: [],
                deduction_types: [],
            });
        }
        res.json(data);
    } catch (err: any) {
        console.error('getPayrollConfig Error:', err);
        res.status(500).json({ error: err.message || JSON.stringify(err), details: err });
    }
};

export const upsertPayrollConfig = async (req: Request, res: Response) => {
    try {
        if (!adminOnly(req, res)) return;
        const orgId = (req as any).user.organization_id;
        const { basic_pay_configured, allowance_types, deduction_types, statutory_rules, account_map } = req.body;

        const { data: existing, error: checkError } = await supabase
            .from('payroll_config')
            .select('id')
            .eq('organization_id', orgId)
            .maybeSingle();

        if (checkError) {
            throw checkError;
        }

        let data, error;
        if (existing) {
            const payload = {
                basic_pay_configured: basic_pay_configured ?? true,
                allowance_types: allowance_types ?? [],
                deduction_types: deduction_types ?? [],
                ...(statutory_rules !== undefined ? { statutory_rules } : {}),
                ...(account_map !== undefined ? { account_map } : {}),
            };
            const result = await supabase
                .from('payroll_config')
                .update(payload)
                .eq('organization_id', orgId)
                .select()
                .maybeSingle();
            data = result.data;
            error = result.error;
        } else {
            const payload = {
                organization_id: orgId,
                basic_pay_configured: basic_pay_configured ?? true,
                allowance_types: allowance_types ?? [],
                deduction_types: deduction_types ?? [],
                ...(statutory_rules !== undefined ? { statutory_rules } : {}),
                ...(account_map !== undefined ? { account_map } : {}),
            };
            const result = await supabase
                .from('payroll_config')
                .insert(payload)
                .select()
                .maybeSingle();
            data = result.data;
            error = result.error;
        }

        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        console.error('upsertPayrollConfig Error:', err);
        res.status(500).json({ error: err.message || err.details || JSON.stringify(err) });
    }
};

// ── Requisition Sync ─────────────────────────────────────────────────────────

/**
 * What each staff member should have deducted this period for outstanding
 * loans and salary advances.
 *
 * Keyed by payroll_staff.id. Amounts are capped at the remaining balance
 * (derived from the recovery ledger), so a debt tapers to its exact final
 * instalment and then stops — rather than re-deducting forever. A debt already
 * recovered for the requested period returns zero so re-opening the wizard for
 * the same month cannot double-charge.
 */
export const getSuggestedDeductions = async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organization_id;
        const month = Number(req.query.month) || null;
        const year = Number(req.query.year) || null;

        const { data: staffData, error: staffErr } = await supabase
            .from('payroll_staff')
            .select('id, user_id')
            .eq('organization_id', orgId)
            .eq('is_archived', false);
        if (staffErr) throw staffErr;
        if (!staffData || staffData.length === 0) return res.json({});

        const debts = await loadOutstandingDebts(orgId, staffData);

        const periodKey = month && year ? `${year}-${month}` : null;
        const suggestions: Record<string, { loans: number; advances: number }> = {};

        for (const staff of staffData) {
            let loans = 0;
            let advances = 0;

            for (const debt of debts.filter(d => d.staff_id === staff.id)) {
                if (debt.outstanding <= 0.005) continue;
                // Already recovered for this period — don't suggest it twice
                if (periodKey && debt.recoveredPeriods.includes(periodKey)) continue;

                const amount = installmentFor(debt);
                if (amount <= 0) continue;

                if (debt.type === 'LOAN') loans += amount;
                else advances += amount;
            }

            if (loans > 0 || advances > 0) {
                suggestions[staff.id] = {
                    loans: parseFloat(loans.toFixed(2)),
                    advances: parseFloat(advances.toFixed(2)),
                };
            }
        }

        res.json(suggestions);
    } catch (err: any) {
        console.error('[getSuggestedDeductions]', err);
        res.status(500).json({ error: err.message });
    }
};

type SalaryOverride =
    | { kind: 'MONEYWISE'; orgId: string }
    | { kind: 'BANK'; bank_name: string; account_number: string; account_name: string }
    | { kind: 'MOBILE_MONEY'; provider: string; number: string; name: string };

/**
 * staff id → where that employee chose (Settings → Preferences → Salary) to be paid, for staff who linked their account to
 * the payroll record. MoneyWise personal account → an on-us transfer (only if that workspace has a Lenco wallet);
 * a saved bank / mobile-money account → those details instead of the payroll record's. Anyone without a linked account, without a
 * choice, or whose chosen account has since been removed stays on the payroll record's details — a salary is never routed
 * somewhere it can't land.
 */
async function resolveSalaryOverrides(staffIds: string[]): Promise<Map<string, SalaryOverride>> {
    const out = new Map<string, SalaryOverride>();
    if (staffIds.length === 0) return out;
    const { data: staff } = await supabase.from('payroll_staff').select('id, user_id').in('id', staffIds).not('user_id', 'is', null);
    for (const row of staff ?? []) {
        try {
            const prefs = await getPreferences((row as any).user_id);
            const dest = prefs.payroll.destination;
            if (dest === 'PERSONAL_WALLET') {
                const org = await getPersonalOrgForUser((row as any).user_id);
                if (!org) continue;
                const { data: o } = await supabase.from('organizations').select('lenco_subaccount_id').eq('id', org.id).maybeSingle();
                if ((o as any)?.lenco_subaccount_id) out.set((row as any).id, { kind: 'MONEYWISE', orgId: org.id });
            } else if (prefs.payroll.account_id) {
                const { banks, momos } = accountsOf(await getAllPaymentInfo((row as any).user_id));
                if (dest === 'BANK') {
                    const a = banks.find((b) => b.id === prefs.payroll.account_id);
                    if (a && a.bank_name && a.account_number) out.set((row as any).id, { kind: 'BANK', bank_name: a.bank_name, account_number: a.account_number, account_name: a.account_name });
                } else {
                    const a = momos.find((m) => m.id === prefs.payroll.account_id);
                    if (a && a.number) out.set((row as any).id, { kind: 'MOBILE_MONEY', provider: a.provider, number: a.number, name: a.name });
                }
            }
        } catch (e: any) {
            console.warn('[Payroll] could not resolve salary destination for staff', (row as any).id, e?.message);
        }
    }
    return out;
}


// ── Record a payroll that was run outside the app (signed-off payroll sheet) ──────────────────────────────────────────

/**
 * POST /payroll/runs/import
 * Records a month's payroll with the figures actually paid, exactly as signed off — nothing is recomputed — and books its
 * journals. It creates NO requisitions and NO disbursements (the money moved outside the app) and does not touch the loan
 * recovery ledger. A period can only be recorded once.
 *
 * body: { period_month, period_year, pay_date?, notes?, qb_journal_id?, qb_allocation_journal_id?, post_to_quickbooks?,
 *         items: [{ staff_id?, staff_name, department?, basic_pay, overtime?, allowance_breakdown?, napsa_employee, napsa_employer?,
 *                   nhima_employee, nhima_employer?, paye, school_fees?, salary_advances?, loans?, other_deductions?, net_pay, pay_source? }] }
 */
export const importPayrollRun = async (req: Request, res: Response) => {
    try {
        if (!adminOnly(req, res)) return;
        const orgId = (req as any).user.organization_id;
        const userId = (req as any).user.id;
        const { period_month, period_year, pay_date, notes, items, qb_journal_id, qb_allocation_journal_id, post_to_quickbooks } = req.body;
        if (!period_month || !period_year || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'period_month, period_year and items[] are required' });

        const { data: dup } = await supabase.from('payroll_runs').select('id, status').eq('organization_id', orgId).eq('period_month', period_month).eq('period_year', period_year).neq('status', 'CANCELLED').maybeSingle();
        if (dup) return res.status(409).json({ error: `A payroll run for ${period_month}/${period_year} already exists (${dup.status}).` });

        const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
        const problems: string[] = [];
        const rows = items.map((it: any, idx: number) => {
            const basic = Number(it.basic_pay) || 0, ot = Number(it.overtime) || 0;
            const breakdown = it.allowance_breakdown && typeof it.allowance_breakdown === 'object' ? it.allowance_breakdown : {};
            const allow = r2(Object.values(breakdown).reduce((a: number, v: any) => a + (Number(v) || 0), 0));
            const gross = r2(basic + ot + allow);
            const nE = Number(it.napsa_employee) || 0, hE = Number(it.nhima_employee) || 0, paye = Number(it.paye) || 0;
            const nR = it.napsa_employer == null ? nE : Number(it.napsa_employer), hR = it.nhima_employer == null ? hE : Number(it.nhima_employer);
            const sf = Number(it.school_fees) || 0, adv = Number(it.salary_advances) || 0, loans = Number(it.loans) || 0, oth = Number(it.other_deductions) || 0;
            const net = r2(gross - nE - hE - paye - sf - adv - loans - oth);
            if (it.net_pay != null && Math.abs(net - Number(it.net_pay)) > 0.05) problems.push(`${it.staff_name || '#' + (idx + 1)}: net pay ${it.net_pay} does not equal gross - deductions (${net})`);
            return {
                organization_id: orgId, staff_id: it.staff_id || null, staff_name: it.staff_name, basic_pay: basic, overtime: ot, allowances: allow, gross_pay: gross,
                napsa_employee: nE, napsa_employer: nR, nhima_employee: hE, nhima_employer: hR, paye, statutory_total: r2(nE + hE + paye), statutory_override: true,
                school_fees: sf, salary_advances: adv, loans, other_deductions: oth, bonus: Number(breakdown.Bonus ?? breakdown.bonus) || 0, net_pay: net,
                department: it.department || null, payment_method: it.payment_method || 'BANK', pay_source: it.pay_source || 'MANUAL', destination_method: it.destination_method || null,
                allowance_breakdown: breakdown, deduction_breakdown: it.deduction_breakdown || {},
                bank_name: it.bank_name || null, bank_account_number: it.bank_account_number || null, mobile_money_number: it.mobile_money_number || null,
            };
        });
        if (problems.length) return res.status(400).json({ error: 'Some payroll lines do not foot', problems });

        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const gross = r2(rows.reduce((a: number, r: any) => a + r.gross_pay, 0)), net = r2(rows.reduce((a: number, r: any) => a + r.net_pay, 0));
        const { data: run, error: runErr } = await supabase.from('payroll_runs').insert({
            organization_id: orgId, period_label: `${monthNames[period_month - 1]} Payroll Run - ${period_year}`, period_month, period_year, status: 'CLEARED', source: 'IMPORTED',
            pay_date: pay_date || null, gross_total: gross, net_total: net, employee_count: rows.length, notes: notes || 'Recorded from the signed-off payroll sheet',
            run_by: userId, run_at: new Date().toISOString(), approved_by: userId, approved_at: new Date().toISOString(),
            qb_journal_id: qb_journal_id || null, qb_allocation_journal_id: qb_allocation_journal_id || null, qb_sync_status: qb_journal_id ? 'SUCCESS' : null,
        }).select().single();
        if (runErr) throw runErr;
        const { error: itErr } = await supabase.from('payroll_run_items').insert(rows.map((r: any) => ({ ...r, payroll_run_id: run.id })));
        if (itErr) { await supabase.from('payroll_runs').delete().eq('id', run.id); throw itErr; }

        let journals: any = null;
        try { journals = await postRunJournals(orgId, run.id, userId, { toQuickBooks: !!post_to_quickbooks && !qb_journal_id }); }
        catch (e: any) { journals = { error: e.message }; }
        res.status(201).json({ run, journals });
    } catch (err: any) {
        console.error('[importPayrollRun]', err);
        res.status(500).json({ error: err.message });
    }
};
