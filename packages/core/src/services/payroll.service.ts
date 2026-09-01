import { apiFetch, apiJson } from '../api/apiFetch';

export interface StaffAllowance {
    name: string;
    amount: number;
}

export interface StaffDeduction {
    name: string;
    amount: number;
    type: 'FIXED' | 'LOAN' | 'ADVANCE';
}

export interface AllowanceConfig {
    id: string;
    name: string;
    separate_step: boolean;
    subject_to_statutory: boolean;
}

export interface DeductionConfig {
    id: string;
    name: string;
}

export interface PayrollConfig {
    id?: string;
    organization_id?: string;
    basic_pay_configured: boolean;
    allowance_types: AllowanceConfig[];
    deduction_types: DeductionConfig[];
}

export interface StaffMember {
    id: string;
    organization_id: string;
    employee_number: string;
    first_name: string;
    middle_name?: string;
    last_name: string;
    id_type?: string;
    id_number?: string;
    napsa_number?: string;
    nhima_number?: string;
    zra_tpin?: string;
    date_of_birth?: string;
    gender?: string;
    phone?: string;
    email?: string;
    department?: string;
    position?: string;
    status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
    basic_pay: number;
    allowances: StaffAllowance[];
    deductions: StaffDeduction[];
    bank_name?: string;
    bank_account_number?: string;
    bank_account_name?: string;
    mobile_money_provider?: string;
    mobile_money_number?: string;
    payment_method: 'BANK' | 'MOBILE_MONEY' | 'WALLET';
    user_id?: string;
    created_at: string;
    updated_at: string;
    is_archived: boolean;
}

export interface PayrollRun {
    id: string;
    organization_id: string;
    period_label: string;
    period_month: number;
    period_year: number;
    status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'CLEARED';
    gross_total: number;
    net_total: number;
    employee_count: number;
    notes?: string;
    run_by?: string;
    approved_by?: string;
    run_at?: string;
    approved_at?: string;
    created_at: string;
    updated_at: string;
}

export interface PayrollRunItem {
    id: string;
    payroll_run_id: string;
    staff_id?: string;
    staff_name: string;
    basic_pay: number;
    overtime: number;
    taxable_allowances: number;
    non_taxable_allowances: number;
    allowances?: number; // retained for backwards compatibility with DB
    gross_pay: number;
    napsa_employee: number;
    napsa_employer: number;
    nhima_employee: number;
    nhima_employer: number;
    paye: number;
    statutory_total: number;
    loans: number;
    other_deductions: number;
    net_pay: number;
    payment_method: string;
    bank_name?: string;
    bank_account_number?: string;
    mobile_money_number?: string;
}

export interface PayrollRunDetail {
    run: PayrollRun;
    items: PayrollRunItem[];
    documents: PayrollDocument[];
}

export interface PayrollDocument {
    id: string;
    payroll_run_id: string;
    doc_type: string;
    file_name: string;
    file_url?: string;
    created_at: string;
}

export interface StaffPayrollHistoryItem {
    id: string;
    staff_name: string;
    gross_pay: number;
    net_pay: number;
    payroll_runs: {
        id: string;
        period_label: string;
        period_month: number;
        period_year: number;
        status: string;
        run_at?: string;
    };
}

export interface CreatePayrollRunItem {
    staff_id?: string;
    staff_name: string;
    basic_pay: number;
    overtime: number;
    taxable_allowances: number;
    non_taxable_allowances: number;
    loans: number;
    other_deductions: number;
    payment_method: string;
    bank_name?: string;
    bank_account_number?: string;
    mobile_money_number?: string;
}

export interface CreatePayrollRunPayload {
    period_month: number;
    period_year: number;
    notes?: string;
    pay_from_wallet_id?: string;
    items: CreatePayrollRunItem[];
}

export const payrollService = {
    // ── Staff ────────────────────────────────────────────────────────────────
    listStaff(department?: string): Promise<StaffMember[]> {
        const params = new URLSearchParams();
        if (department && department !== 'ALL') params.set('department', department);
        const qs = params.toString();
        return apiJson<StaffMember[]>(`/payroll/staff${qs ? `?${qs}` : ''}`);
    },

    getStaffMember(id: string): Promise<StaffMember> {
        return apiJson<StaffMember>(`/payroll/staff/${id}`);
    },

    createStaffMember(data: Partial<StaffMember>): Promise<StaffMember> {
        return apiJson<StaffMember>('/payroll/staff', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    updateStaffMember(id: string, data: Partial<StaffMember>): Promise<StaffMember> {
        return apiJson<StaffMember>(`/payroll/staff/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    },

    async archiveStaffMember(id: string): Promise<void> {
        await apiFetch(`/payroll/staff/${id}`, { method: 'DELETE' });
    },

    getStaffPayrollHistory(id: string): Promise<StaffPayrollHistoryItem[]> {
        return apiJson<StaffPayrollHistoryItem[]>(`/payroll/staff/${id}/history`);
    },

    getStaffDepartments(): Promise<string[]> {
        return apiJson<string[]>('/payroll/staff/departments');
    },

    // ── Runs ─────────────────────────────────────────────────────────────────
    listRuns(): Promise<PayrollRun[]> {
        return apiJson<PayrollRun[]>('/payroll/runs');
    },

    getRun(id: string): Promise<PayrollRunDetail> {
        return apiJson<PayrollRunDetail>(`/payroll/runs/${id}`);
    },

    /**
     * Batch payroll is bounded by a 30s request ceiling and a unique index on
     * the per-employee rows, so callers must treat this as a job kick-off and
     * poll getRun rather than assuming completion on resolve.
     */
    createRun(data: CreatePayrollRunPayload): Promise<PayrollRun> {
        return apiJson<PayrollRun>('/payroll/runs', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    approveRun(id: string): Promise<PayrollRun> {
        return apiJson<PayrollRun>(`/payroll/runs/${id}/approve`, {
            method: 'POST',
            body: JSON.stringify({}),
        });
    },

    getSuggestedDeductions(
        month: number,
        year: number,
    ): Promise<Record<string, { loans: number; advances: number }>> {
        const params = new URLSearchParams({ month: String(month), year: String(year) });
        return apiJson(`/payroll/runs/suggested-deductions?${params}`);
    },

    // ── Config ───────────────────────────────────────────────────────────────
    getPayrollConfig(): Promise<PayrollConfig> {
        return apiJson<PayrollConfig>('/payroll/config');
    },

    upsertPayrollConfig(data: Partial<PayrollConfig>): Promise<PayrollConfig> {
        return apiJson<PayrollConfig>('/payroll/config', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
};
