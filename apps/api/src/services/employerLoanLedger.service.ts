/**
 * employerLoanLedger.service.ts — a salary advance / staff loan seen from the BORROWER'S personal MoneyWise account.
 *
 * An employee with a MoneyWise personal account can request an advance or loan from their employer's organization. When
 * the employer pays it into the personal wallet (a Lenco on-us transfer), the personal books record:
 *
 *     Dr Wallet  K amount          — the cash arrives
 *     Cr Employer Loans & Advances Payable (liability)  K amount          — it is owed back
 *
 * Each time the employer recovers part of it — through a payroll deduction or an admin acknowledging a repayment made some other
 * way — the personal books show it being worked off, without touching the wallet balance:
 *
 *     Dr Wallet   K amount / Cr Salary Income  K amount      ("salary withheld")
 *     Dr Liability K amount / Cr Wallet        K amount      ("repayment")
 *
 * i.e. as if that part of the pay arrived and was handed straight back. Cash is unchanged, income and the liability move by the
 * amount recovered, and the liability reaches zero exactly when the employer marks the loan recovered. Both legs are ordinary
 * cashbook entries, so the ledger's one-journal-per-entry guarantees (and its audit and self-heal) cover them like any other.
 */
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { cashbookService } from './cashbook.service';
import { RECOVERABLE_STATUSES, totalOwed } from '../lib/loanMath';

const LIABILITY = { name: 'Employer Loans & Advances Payable', code: 'MW-LIAB-EMPLOYER', type: 'LIABILITY', description: 'Salary advances and staff loans received from an employer, until recovered' } as const;
const SALARY = { name: 'Salary Income', code: 'MW-INC-SALARY', type: 'INCOME', description: 'Salary and wages received' } as const;

const kindLabel = (t: string) => (t === 'LOAN' ? 'staff loan' : 'salary advance');
const r2 = (n: number) => Math.round(n * 100) / 100;

async function getOrCreateAccount(orgId: string, spec: typeof LIABILITY | typeof SALARY, nameLike: string[]): Promise<string> {
    const filter = [`code.eq.${spec.code}`, ...nameLike.map((n) => `name.ilike.${n}`)].join(',');
    const { data: existing } = await supabase.from('accounts').select('id, type').eq('organization_id', orgId).eq('type', spec.type).or(filter).limit(1).maybeSingle();
    if (existing) return existing.id;
    const { data, error } = await supabase.from('accounts')
        .insert({ organization_id: orgId, name: spec.name, type: spec.type, code: spec.code, description: spec.description })
        .select('id').single();
    if (error || !data) {
        // Lost a race with a concurrent creator: take theirs.
        const { data: again } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', spec.code).maybeSingle();
        if (again) return again.id;
        throw new Error(`Could not set up the ${spec.name} account: ${error?.message}`);
    }
    return data.id;
}

const liabilityAccount = (orgId: string) => getOrCreateAccount(orgId, LIABILITY, [LIABILITY.name]);
const salaryAccount = (orgId: string) => getOrCreateAccount(orgId, SALARY, ['Salary Income', 'Salaries', 'Salary', 'Wages']);

async function mainWalletId(orgId: string): Promise<string | null> {
    const { data } = await supabase.from('organization_wallets').select('id').eq('organization_id', orgId).eq('is_main', true).maybeSingle();
    return data?.id ?? null;
}

const todayIso = () => new Date().toISOString().split('T')[0];

/** The money arriving: booked as a liability, never as income. Idempotent on the transfer reference. */
async function bookLoanReceived(p: { recipientOrgId: string; kind: string; employerName: string; amount: number; ref: string }): Promise<void> {
    const { data: already } = await supabase.from('cashbook_entries').select('id').eq('organization_id', p.recipientOrgId).eq('external_reference', p.ref).limit(1);
    if (already && already.length > 0) return;

    const liabilityId = await liabilityAccount(p.recipientOrgId);
    await cashbookService.createEntry(p.recipientOrgId, {
        entry_type: 'INFLOW',
        account_type: 'MONEYWISE_WALLET',
        wallet_id: await mainWalletId(p.recipientOrgId),
        debit: p.amount,
        credit: 0,
        description: `${p.kind === 'LOAN' ? 'Staff loan' : 'Salary advance'} from ${p.employerName}`,
        reference_number: p.ref,
        external_reference: p.ref,
        sender_name: p.employerName,
        account_id: liabilityId,
        date: todayIso(),
        status: 'ACCOUNTED',
    } as any);
}

/** Where (if anywhere) a requisition's loan was booked as a liability: the borrower's personal org and the transfer reference. */
async function findPersonalLoanBooking(requisitionId: string): Promise<{ recipientOrgId: string; ref: string; employerName: string; kind: string } | null> {
    const { data: req } = await supabase.from('requisitions').select('type, organization_id').eq('id', requisitionId).maybeSingle();
    if (!req || (req.type !== 'LOAN' && req.type !== 'ADVANCE')) return null;
    const { data: d } = await supabase.from('disbursements').select('external_reference').eq('requisition_id', requisitionId).maybeSingle();
    const ref = (d as any)?.external_reference as string | undefined;
    if (!ref || !ref.startsWith('MWPAY-')) return null;
    const { data: memoRow } = await supabase.from('app_settings').select('value').eq('key', `mwpay:${ref}`).maybeSingle();
    const recipientOrgId = (memoRow?.value as any)?.recipientOrgId as string | undefined;
    if (!recipientOrgId) return null;
    // Only when the money really was booked as a liability there (older payments and bank payouts are not).
    const liabilityId = await liabilityAccount(recipientOrgId);
    const { data: booked } = await supabase.from('cashbook_entries').select('id').eq('organization_id', recipientOrgId).eq('external_reference', ref).eq('account_id', liabilityId).limit(1);
    if (!booked || booked.length === 0) return null;
    const { data: org } = await supabase.from('organizations').select('name').eq('id', req.organization_id).maybeSingle();
    return { recipientOrgId, ref, employerName: (org as any)?.name || 'your employer', kind: req.type };
}

/**
 * The employer recovered `amount` of a loan/advance. Reflect it in the borrower's personal books if that loan lives there as a liability.
 * Idempotent per `key` (a payroll run + requisition, or a manual-recovery row), so retries and re-approvals never double-book.
 */
async function bookLoanRepayment(p: { requisitionId: string; amount: number; key: string }): Promise<boolean> {
    const amount = r2(p.amount);
    if (amount <= 0) return false;
    const booking = await findPersonalLoanBooking(p.requisitionId);
    if (!booking) return false;

    // reference_number is a VARCHAR(50): a short, stable digest of the recovery's key keeps both legs under it.
    const short = crypto.createHash('sha1').update(p.key).digest('hex').slice(0, 24);
    const refIn = `LRP-${short}-IN`, refOut = `LRP-${short}-OUT`;
    const { data: done } = await supabase.from('cashbook_entries').select('id, reference_number').eq('organization_id', booking.recipientOrgId).in('reference_number', [refIn, refOut]);
    const have = new Set((done ?? []).map((r: any) => r.reference_number));
    if (have.has(refIn) && have.has(refOut)) return false;

    const [salaryId, liabilityId, walletId] = await Promise.all([salaryAccount(booking.recipientOrgId), liabilityAccount(booking.recipientOrgId), mainWalletId(booking.recipientOrgId)]);
    const label = kindLabel(booking.kind);
    const base = { account_type: 'MONEYWISE_WALLET', wallet_id: walletId, date: todayIso(), status: 'ACCOUNTED', sender_name: booking.employerName, skip_inflow_notification: true };

    if (!have.has(refIn)) {
        await cashbookService.createEntry(booking.recipientOrgId, {
            ...base, entry_type: 'INFLOW', debit: amount, credit: 0, account_id: salaryId, reference_number: refIn,
            description: `Salary withheld to repay ${label} — ${booking.employerName}`,
        } as any);
    }
    if (!have.has(refOut)) {
        await cashbookService.createEntry(booking.recipientOrgId, {
            ...base, entry_type: 'EXPENSE', debit: 0, credit: amount, account_id: liabilityId, reference_number: refOut,
            description: `Repayment of ${label} — ${booking.employerName}`,
        } as any);
    }
    return true;
}

/**
 * Books any recovery leg the borrower's personal books are missing, for EVERY recovery recorded against this loan (payroll
 * deductions and manual acknowledgements). Idempotent, so it is safe to call after each new recovery: a transient failure on
 * an earlier one is healed by the next, and nothing is ever booked twice.
 */
async function healLoanLedger(requisitionId: string): Promise<void> {
    const [{ data: payroll }, { data: manual }] = await Promise.all([
        supabase.from('payroll_loan_recoveries').select('amount, payroll_run_id').eq('requisition_id', requisitionId),
        supabase.from('loan_manual_recoveries').select('id, amount').eq('requisition_id', requisitionId),
    ]);
    for (const r of payroll ?? []) {
        await bookLoanRepayment({ requisitionId, amount: Number(r.amount), key: `${requisitionId}-${(r as any).payroll_run_id}` })
            .catch((e: any) => console.error('[LoanLedger] could not book payroll recovery for', requisitionId, e?.message));
    }
    for (const r of manual ?? []) {
        await bookLoanRepayment({ requisitionId, amount: Number(r.amount), key: `manual-${(r as any).id}` })
            .catch((e: any) => console.error('[LoanLedger] could not book manual recovery for', requisitionId, e?.message));
    }
}

/** What is still owed on a loan/advance after every payroll deduction and manual recovery. */
async function getOutstanding(requisitionId: string): Promise<{ owed: number; recovered: number; outstanding: number; status: string; type: string; organization_id: string } | null> {
    const { data: r } = await supabase.from('requisitions')
        .select('id, type, status, organization_id, monthly_deduction, repayment_period, interest_rate, loan_amount, actual_total, estimated_total')
        .eq('id', requisitionId).maybeSingle();
    if (!r || (r.type !== 'LOAN' && r.type !== 'ADVANCE')) return null;
    const [{ data: payroll }, { data: manual }] = await Promise.all([
        supabase.from('payroll_loan_recoveries').select('amount').eq('requisition_id', requisitionId),
        supabase.from('loan_manual_recoveries').select('amount').eq('requisition_id', requisitionId),
    ]);
    const recovered = r2([...(payroll ?? []), ...(manual ?? [])].reduce((s: number, x: any) => s + Number(x.amount), 0));
    const owed = r2(totalOwed(r));
    return { owed, recovered, outstanding: Math.max(0, r2(owed - recovered)), status: r.status, type: r.type, organization_id: r.organization_id };
}

class LoanRecoveryError extends Error { constructor(message: string, public httpStatus = 400) { super(message); } }

/** An admin acknowledges a repayment made outside payroll (cash, bank deposit…). */
async function recordManualRecovery(p: { requisitionId: string; organizationId: string; userId: string; amount: number; note?: string }) {
    const amount = r2(Number(p.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new LoanRecoveryError('Enter the amount that was recovered.');
    const bal = await getOutstanding(p.requisitionId);
    if (!bal || bal.organization_id !== p.organizationId) throw new LoanRecoveryError('Loan or salary advance not found.', 404);
    if (bal.status === 'SETTLED') throw new LoanRecoveryError('This has already been fully recovered.', 409);
    if (!RECOVERABLE_STATUSES.includes(bal.status)) throw new LoanRecoveryError('The money has not been paid out yet, so there is nothing to recover.', 409);
    if (amount > bal.outstanding + 0.005) throw new LoanRecoveryError(`Only K${bal.outstanding.toFixed(2)} is still outstanding.`);

    const { data: row, error } = await supabase.from('loan_manual_recoveries')
        .insert({ organization_id: p.organizationId, requisition_id: p.requisitionId, amount, note: (p.note ?? '').slice(0, 300) || null, recorded_by: p.userId })
        .select('id').single();
    if (error || !row) throw new Error(`Could not record the recovery: ${error?.message}`);

    // The borrower's own books follow (best effort: the employer's record above is the source of truth and is already saved).
    await healLoanLedger(p.requisitionId);

    const outstanding = r2(bal.outstanding - amount);
    const settled = outstanding <= 0.005;
    if (settled) await supabase.from('requisitions').update({ status: 'SETTLED', updated_at: new Date().toISOString() }).eq('id', p.requisitionId);
    return { recovered: amount, outstanding: Math.max(0, outstanding), settled };
}

export const employerLoanLedger = { bookLoanReceived, bookLoanRepayment, healLoanLedger, getOutstanding, recordManualRecovery };
export { LoanRecoveryError };
