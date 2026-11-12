import { formatKwacha } from 'core';

/** Shapes and wording for Loans, the same as the web's Loans page. */
export interface LoanProduct {
    id: string; lender_id: string; name: string; kind: string; audience: 'BUSINESS' | 'STAFF' | 'INDIVIDUAL'; description: string | null; features?: string[]; tenors?: number[] | null;
    min_amount: number | null; max_amount: number | null; min_months: number | null; max_months: number | null; indicative_rate: number | null; requirements: string[]; terms_confirmed: boolean;
}
export interface LoanBrand { primary?: string; primaryDark?: string; primaryLight?: string; secondary?: string; website?: string; email?: string; phones?: Record<string, string> }
export interface Lender { id: string; slug: string; name: string; description: string | null; logo_url: string | null; brand?: LoanBrand; products: LoanProduct[] }
export interface Readiness { items: { key: string; label: string; status: 'READY' | 'MONEYWISE' | 'MISSING' | 'LENDER'; note?: string }[]; hasId: boolean; covered: number; total: number; missing: number }
export interface LendersResponse { needsMigration: boolean; lenders: Lender[]; consentScope: { key: string; label: string }[] }
export interface LoanApplication {
    id: string; lender_name: string; product_name: string; amount: number; term_months: number | null; purpose: string | null; status: string; created_at: string; decision_note: string | null;
    events: { at: string; status: string; note?: string }[];
}

export const LOAN_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
    SUBMITTED: { label: 'Sent', bg: '#E8F0FE', fg: '#1967D2' }, IN_REVIEW: { label: 'In review', bg: '#FEF7E0', fg: '#B06000' }, APPROVED: { label: 'Approved', bg: '#E6F4EA', fg: '#137333' },
    DECLINED: { label: 'Declined', bg: '#FCE8E6', fg: '#B31412' }, DISBURSED: { label: 'Paid out', bg: '#E6F4EA', fg: '#137333' }, REPAID: { label: 'Repaid', bg: '#E6F4EA', fg: '#137333' },
    WITHDRAWN: { label: 'Withdrawn', bg: '#F1F3F4', fg: '#5F6368' },
};

export const loanRange = (p: LoanProduct): string => {
    const amount = p.min_amount != null || p.max_amount != null
        ? `${p.min_amount != null ? formatKwacha(p.min_amount) : ''}${p.min_amount != null && p.max_amount != null ? ' to ' : p.max_amount != null ? 'up to ' : 'from '}${p.max_amount != null ? formatKwacha(p.max_amount) : ''}`
        : null;
    const months = p.min_months != null || p.max_months != null ? `${p.min_months ?? 1} to ${p.max_months ?? '…'} months` : null;
    return [amount, months].filter(Boolean).join(' · ');
};
