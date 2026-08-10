import axios from 'axios';
import { supabase } from '../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

const getHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}` };
};

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

export const payrollService = {
    // Staff
    async listStaff(department?: string): Promise<StaffMember[]> {
        const headers = await getHeaders();
        const params: any = {};
        if (department && department !== 'ALL') params.department = department;
        const res = await axios.get(`${API_URL}/payroll/staff`, { headers, params });
        return res.data;
    },

    async getStaffMember(id: string): Promise<StaffMember> {
        const headers = await getHeaders();
        const res = await axios.get(`${API_URL}/payroll/staff/${id}`, { headers });
        return res.data;
    },

    async createStaffMember(data: Partial<StaffMember>): Promise<StaffMember> {
        const headers = await getHeaders();
        const res = await axios.post(`${API_URL}/payroll/staff`, data, { headers });
        return res.data;
    },

    async updateStaffMember(id: string, data: Partial<StaffMember>): Promise<StaffMember> {
        const headers = await getHeaders();
        const res = await axios.patch(`${API_URL}/payroll/staff/${id}`, data, { headers });
        return res.data;
    },

    async archiveStaffMember(id: string): Promise<void> {
        const headers = await getHeaders();
        await axios.delete(`${API_URL}/payroll/staff/${id}`, { headers });
    },

    async getStaffPayrollHistory(id: string): Promise<StaffPayrollHistoryItem[]> {
        const headers = await getHeaders();
        const res = await axios.get(`${API_URL}/payroll/staff/${id}/history`, { headers });
        return res.data;
    },

    async getStaffDepartments(): Promise<string[]> {
        const headers = await getHeaders();
        const res = await axios.get(`${API_URL}/payroll/staff/departments`, { headers });
        return res.data;
    },

    // Runs
    async listRuns(): Promise<PayrollRun[]> {
        const headers = await getHeaders();
        const res = await axios.get(`${API_URL}/payroll/runs`, { headers });
        return res.data;
    },

    async getRun(id: string): Promise<PayrollRunDetail> {
        const headers = await getHeaders();
        const res = await axios.get(`${API_URL}/payroll/runs/${id}`, { headers });
        return res.data;
    },

    async createRun(data: {
        period_month: number;
        period_year: number;
        notes?: string;
        pay_from_wallet_id?: string;
        items: Array<{
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
        }>;
    }): Promise<PayrollRun> {
        const headers = await getHeaders();
        const res = await axios.post(`${API_URL}/payroll/runs`, data, { headers });
        return res.data;
    },

    async approveRun(id: string): Promise<PayrollRun> {
        const headers = await getHeaders();
        const res = await axios.post(`${API_URL}/payroll/runs/${id}/approve`, {}, { headers });
        return res.data;
    },

    async getSuggestedDeductions(month: number, year: number): Promise<Record<string, { loans: number; advances: number }>> {
        const headers = await getHeaders();
        const res = await axios.get(`${API_URL}/payroll/runs/suggested-deductions`, { headers, params: { month, year } });
        return res.data;
    },

    // Config
    async getPayrollConfig(): Promise<PayrollConfig> {
        const headers = await getHeaders();
        const res = await axios.get(`${API_URL}/payroll/config`, { headers });
        return res.data;
    },

    async upsertPayrollConfig(data: Partial<PayrollConfig>): Promise<PayrollConfig> {
        const headers = await getHeaders();
        const res = await axios.put(`${API_URL}/payroll/config`, data, { headers });
        return res.data;
    }
};
