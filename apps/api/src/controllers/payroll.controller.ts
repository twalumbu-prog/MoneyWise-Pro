import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';

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
const NAPSA_RATE = 0.05; // 5% employee, 5% employer
const NHIMA_RATE = 0.01; // 1% employee, 1% employer
const NAPSA_CEILING = 1073.15; // monthly ceiling (2026 rate)

function calcPAYE(grossIncome: number): number {
    // Zambia ZRA PAYE 2024/2025 bands (annual → monthly divide)
    // Monthly bands:
    // 0–4800: 0%
    // 4800.01–9600: 20%
    // 9600.01–16000: 30%
    // 16000.01+: 37.5%
    if (grossIncome <= 4800) return 0;
    if (grossIncome <= 9600) return (grossIncome - 4800) * 0.20;
    if (grossIncome <= 16000) return (9600 - 4800) * 0.20 + (grossIncome - 9600) * 0.30;
    return (9600 - 4800) * 0.20 + (16000 - 9600) * 0.30 + (grossIncome - 16000) * 0.375;
}

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

        // Compute per-item statutory amounts
        const computedItems = submittedItems.map((item: any) => {
            const basicPay = Number(item.basic_pay) || 0;
            const overtime = Number(item.overtime) || 0;
            const taxableAllowances = Number(item.taxable_allowances) || 0;
            const nonTaxableAllowances = Number(item.non_taxable_allowances) || 0;
            const allowancesTotal = taxableAllowances + nonTaxableAllowances;
            const grossPay = basicPay + overtime + allowancesTotal;
            const statutoryGross = basicPay + overtime + taxableAllowances;

            const napsaBase = Math.min(statutoryGross, NAPSA_CEILING * 12 / 12); // NAPSA_CEILING is 1073.15 per month limit (or maybe higher now, but we use the defined constant)
            const napsaEmployee = parseFloat((napsaBase * NAPSA_RATE).toFixed(2));
            const napsaEmployer = napsaEmployee;
            const nhimaEmployee = parseFloat((statutoryGross * NHIMA_RATE).toFixed(2));
            const nhimaEmployer = nhimaEmployee;
            const paye = parseFloat(calcPAYE(statutoryGross).toFixed(2));
            const statutoryTotal = napsaEmployee + nhimaEmployee + paye;

            const loans = Number(item.loans) || 0;
            const otherDeductions = Number(item.other_deductions) || 0;
            const netPay = parseFloat((grossPay - statutoryTotal - loans - otherDeductions).toFixed(2));

            return {
                organization_id: orgId,
                staff_id: item.staff_id || null,
                staff_name: item.staff_name,
                basic_pay: basicPay,
                overtime,
                allowances: allowancesTotal,
                gross_pay: grossPay,
                napsa_employee: napsaEmployee,
                napsa_employer: napsaEmployer,
                nhima_employee: nhimaEmployee,
                nhima_employer: nhimaEmployer,
                paye,
                statutory_total: statutoryTotal,
                loans,
                other_deductions: otherDeductions,
                net_pay: netPay,
                payment_method: item.payment_method || 'BANK',
                pay_source: item.pay_source || null,
                destination_method: item.destination_method || null,
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

        res.status(201).json(run);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

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
            const groupGross = groupItems.reduce((s: number, i: any) => s + Number(i.gross_pay), 0);

            const reqTitle = `${run.period_label} — ${srcLabel} (${groupItems.length} employee${groupItems.length !== 1 ? 's' : ''})`;

            // Determine wallet id for electronic runs
            const walletId = electronic && paySource.startsWith('wallet:')
                ? paySource.replace('wallet:', '')
                : null;

            // Insert requisition header
            const { data: req_, error: reqErr } = await supabase
                .from('requisitions')
                .insert({
                    organization_id: orgId,
                    requestor_id: userId,
                    type: 'PAYROLL',
                    status: electronic ? 'APPROVED' : 'APPROVED',
                    description: reqTitle,
                    estimated_total: parseFloat(groupNet.toFixed(2)),
                    actual_total: parseFloat(groupNet.toFixed(2)),
                    payment_method: electronic ? 'BATCH_PAYROLL' : paySource,
                    pay_from_wallet_id: walletId,
                    payroll_run_id: id,
                    department: 'Payroll',
                    notes: `Auto-generated on approval of payroll run ${run.period_label}. Source: ${srcLabel}.`,
                    approved_by: userId,
                    approved_at: new Date().toISOString(),
                })
                .select()
                .single();
            if (reqErr) throw reqErr;

            // Build line items
            const lineItems = groupItems.map((item: any) => {
                const destMethod = item.destination_method || item.payment_method || 'BANK';
                return {
                    requisition_id: req_.id,
                    description: `Payroll for ${item.staff_name}`,
                    quantity: 1,
                    unit_price: Number(item.net_pay),
                    estimated_amount: Number(item.net_pay),
                    employee_id: item.staff_id || null,
                    employee_name: item.staff_name,
                    payment_method: electronic ? destMethod : paySource,
                    recipient_account: destMethod === 'MOBILE_MONEY'
                        ? item.mobile_money_number
                        : item.bank_account_number,
                    recipient_bank_code: destMethod === 'BANK' ? item.bank_name : null,
                    is_valid: !electronic, // external methods are pre-valid; electronic need Lenco verification
                    verified_name: !electronic ? item.staff_name : null,
                    error_message: null,
                };
            });

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

        // 5. Mark the payroll run as CLEARED
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

        res.json({
            run: updatedRun,
            requisitions: createdRequisitions,
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
        const { basic_pay_configured, allowance_types, deduction_types } = req.body;

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
                deduction_types: deduction_types ?? []
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
                deduction_types: deduction_types ?? []
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

export const getSuggestedDeductions = async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organization_id;
        const { data: staffData, error: staffErr } = await supabase
            .from('payroll_staff')
            .select('id, user_id')
            .eq('organization_id', orgId)
            .not('user_id', 'is', null)
            .eq('is_archived', false);

        if (staffErr) throw staffErr;
        if (!staffData || staffData.length === 0) return res.json({});

        const userIds = staffData.map(s => s.user_id);

        const { data: reqData, error: reqErr } = await supabase
            .from('requisitions')
            .select('requestor_id, type, monthly_deduction, loan_amount, actual_total, estimated_total')
            .eq('organization_id', orgId)
            .in('type', ['ADVANCE', 'LOAN'])
            .in('status', ['DISBURSED', 'RECEIVED'])
            .in('requestor_id', userIds);

        if (reqErr) throw reqErr;

        const suggestions: Record<string, { loans: number, advances: number }> = {};
        staffData.forEach(staff => {
            const userReqs = (reqData || []).filter(r => r.requestor_id === staff.user_id);
            let loans = 0;
            let advances = 0;
            userReqs.forEach(r => {
                const deduction = Number(r.monthly_deduction) || 0;
                if (r.type === 'LOAN') loans += deduction;
                if (r.type === 'ADVANCE') {
                    if (deduction > 0) advances += deduction;
                    else advances += (Number(r.actual_total) || Number(r.estimated_total) || Number(r.loan_amount) || 0);
                }
            });
            if (loans > 0 || advances > 0) {
                suggestions[staff.id] = { loans, advances };
            }
        });

        res.json(suggestions);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

