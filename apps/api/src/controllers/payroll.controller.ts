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
            'mobile_money_provider', 'mobile_money_number', 'payment_method',
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
            const allowancesTotal = Number(item.allowances) || 0;
            const grossPay = basicPay + overtime + allowancesTotal;

            const napsaBase = Math.min(grossPay, NAPSA_CEILING * 12 / 12);
            const napsaEmployee = parseFloat((napsaBase * NAPSA_RATE).toFixed(2));
            const napsaEmployer = napsaEmployee;
            const nhimaEmployee = parseFloat((grossPay * NHIMA_RATE).toFixed(2));
            const nhimaEmployer = nhimaEmployee;
            const paye = parseFloat(calcPAYE(grossPay).toFixed(2));
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

export const approvePayrollRun = async (req: Request, res: Response) => {
    try {
        if (!adminOnly(req, res)) return;
        const orgId = (req as any).user.organization_id;
        const userId = (req as any).user.id;
        const { id } = req.params;

        const { data, error } = await supabase
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
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
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
