/**
 * Loan / salary-advance arithmetic shared by payroll (recovery by deduction) and the manual "record recovery" action.
 */

export const RECOVERABLE_STATUSES = ['DISBURSED', 'RECEIVED', 'ACCOUNTED', 'CATEGORIZED', 'COMPLETED'];

/**
 * Returns true if a LOAN's calendar repayment term has already elapsed.
 *
 * We use created_at as the loan start date and add repayment_period months to
 * get the expiry. If today is past that point the loan should no longer generate
 * payroll deductions — this handles loans that were fully or partially repaid
 * outside the payroll system before automatic tracking was introduced.
 *
 * Salary advances (type === 'ADVANCE') have no fixed term, so this always
 * returns false for them.
 */
export function loanTermExpired(r: any): boolean {
    if (r.type !== 'LOAN') return false;
    const periods = Number(r.repayment_period) || 0;
    if (periods <= 0) return false;

    const start = new Date(r.created_at);
    if (isNaN(start.getTime())) return false;

    const expiry = new Date(start);
    expiry.setMonth(expiry.getMonth() + periods);

    return new Date() > expiry;
}

/**
 * Total amount a loan or advance is expected to repay in full.
 * For a loan this is the instalment schedule (or principal plus interest);
 * for an advance it is simply the amount advanced.
 */
export function totalOwed(r: any): number {
    if (r.type === 'LOAN') {
        const monthly = Number(r.monthly_deduction) || 0;
        const periods = Number(r.repayment_period) || 0;
        if (monthly > 0 && periods > 0) return monthly * periods;

        const principal = Number(r.loan_amount) || Number(r.actual_total) || Number(r.estimated_total) || 0;
        const rate = Number(r.interest_rate) || 0;
        return principal * (1 + rate / 100);
    }
    // ADVANCE — recovered at face value
    return Number(r.actual_total) || Number(r.estimated_total) || Number(r.loan_amount) || 0;
}

