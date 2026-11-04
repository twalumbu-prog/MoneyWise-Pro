import { supabase } from '../lib/supabase';
import { notifyUser } from './marketplaceNotify';
import * as payLater from './payLater.service';
import { investorAccountService } from './investorAccount.service';
import { latestChecks } from './kycDocumentCheck.service';

/**
 * The Loans tab. Lenders (microfinance institutions) publish loan products; a business applies from inside MoneyWise and, only if it
 * agrees, shares a snapshot of its trading record with the lender. The application, what was agreed and the figures shared are all kept.
 *
 * What exists today: lenders and products, applications with consent and a data snapshot, and the status trail. What does not exist yet:
 * a screen or API for the lender to review and decide (applications are emailed to the lender's contact for now) and disbursement and
 * repayment through the wallet. Product terms marked terms_confirmed = false are placeholders.
 */

export class LoanError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'INVALID') { super(message); }
}
const missing = (e: any) => /loan_lenders|loan_products|loan_applications|schema cache/i.test(String(e?.message ?? ''));
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Ctx { userId: string; orgId: string; role: string; name: string }

/** What a borrower agrees to share, in words they can read, keyed so the lender knows what it received. */
export const CONSENT_SCOPE = [
    { key: 'kyc_identity', label: 'Your MoneyWise ID details: name, date of birth, ID number, phone, email, address and next of kin' },
    { key: 'kyc_documents', label: 'The ID photo, selfie and proof of residence saved on your MoneyWise ID' },
    { key: 'bank_details', label: 'Your bank account for the payout' },
    { key: 'sales_cashflow', label: 'Money in and out of your wallets over the last 12 months, month by month (totals, not individual customers)' },
    { key: 'account_age', label: 'How long your MoneyWise account has been active and how regularly money comes in' },
    { key: 'repayment_history', label: 'Your record of repaying MoneyWise Pay in 4 plans, if you have used them' },
    { key: 'business_details', label: 'Your business name, and the contact details you give on this application' },
];

/**
 * What lenders ask for, each checked against the person's saved MoneyWise ID or their records. READY means it is already on their
 * MoneyWise ID, MONEYWISE means MoneyWise can supply it from their records, MISSING means they can fix it in their ID, and LENDER means it
 * is something only they can hand to the lender (a registration certificate, an invoice). The names are the keys stored on loan_products.needs.
 */
const NEEDS: Record<string, { label: string; kind: 'KYC' | 'MONEYWISE' | 'LENDER'; fields?: string[]; doc?: string }> = {
    identity: { label: 'Your name, date of birth, gender and ID number', kind: 'KYC', fields: ['first_name', 'last_name', 'date_of_birth', 'gender', 'id_number'] },
    contact: { label: 'Phone number and email', kind: 'KYC', fields: ['phone', 'email'] },
    address: { label: 'Where you live', kind: 'KYC', fields: ['physical_address'] },
    next_of_kin: { label: 'Next of kin', kind: 'KYC', fields: ['nok_full_name', 'nok_phone', 'nok_relationship'] },
    bank: { label: 'Bank account for the payout', kind: 'KYC', fields: ['bank_name', 'bank_account_number'] },
    id_documents: { label: 'A photo of your ID', kind: 'KYC', doc: 'id_front' },
    photo: { label: 'A clear photo of you', kind: 'KYC', doc: 'photo' },
    proof_of_residence: { label: 'Proof of residence', kind: 'KYC', doc: 'proof_of_residence' },
    bank_statement: { label: 'Recent statement of money in and out', kind: 'MONEYWISE' },
    payslip: { label: 'Proof of income', kind: 'MONEYWISE' },
    business: { label: 'Business name and details', kind: 'MONEYWISE' },
    employment: { label: 'Employer, job and salary', kind: 'LENDER' },
    employer_arrangement: { label: 'Employer payroll arrangement', kind: 'LENDER' },
    business_registration: { label: 'Business registration certificate', kind: 'LENDER' },
    financial_statements: { label: 'Financial statements', kind: 'LENDER' },
    invoice: { label: 'The approved invoice', kind: 'LENDER' },
    purchase_order: { label: 'The confirmed purchase order', kind: 'LENDER' },
};

export type NeedStatus = 'READY' | 'MONEYWISE' | 'MISSING' | 'LENDER';

/** How much of what this loan asks for is already covered by the person's MoneyWise ID and records. */
export async function readiness(ctx: Ctx, productId: string) {
    const { data: product } = await supabase.from('loan_products').select('id, name, needs').eq('id', productId).maybeSingle();
    if (!product) throw new LoanError('That loan isn’t available any more.', 404, 'NOT_FOUND');
    const kyc = await investorAccountService.getKycProfile(ctx.userId).catch(() => null);
    const a = (kyc?.applicant ?? {}) as Record<string, string>;
    const docs = (kyc?.documents ?? {}) as Record<string, string>;
    const checks = await latestChecks(ctx.userId).catch(() => new Map());
    let active = false;
    try { active = ((await payLater.offerFor(ctx.userId, ctx.orgId)).stats?.accountAgeDays ?? 0) > 0; } catch { /* no records yet */ }
    const { data: org } = await supabase.from('organizations').select('name').eq('id', ctx.orgId).maybeSingle();

    const items = ((product.needs ?? []) as string[]).filter((k) => NEEDS[k]).map((key) => {
        const n = NEEDS[key];
        let status: NeedStatus;
        let note: string | undefined;
        if (n.kind === 'KYC' && n.doc && docs[n.doc]) {
            // A document that was checked and found unusable doesn't count as ready: the person is told what to fix.
            const c = checks.get(n.doc);
            if (c && c.path === docs[n.doc] && !c.usable) note = c.issues[0] ?? 'This document needs to be replaced.';
        }
        if (n.kind === 'KYC') status = n.doc ? (docs[n.doc] && !note ? 'READY' : 'MISSING') : (n.fields ?? []).every((f) => String(a[f] ?? '').trim()) ? 'READY' : 'MISSING';
        else if (n.kind === 'MONEYWISE') status = key === 'business' ? (org?.name ? 'READY' : 'MISSING') : active ? 'MONEYWISE' : 'MISSING';
        else status = 'LENDER';
        return { key, label: n.label, status, ...(note ? { note } : {}) };
    });
    return {
        productId: product.id, items, hasId: !!kyc?.exists,
        covered: items.filter((i) => i.status === 'READY' || i.status === 'MONEYWISE').length, total: items.length,
        missing: items.filter((i) => i.status === 'MISSING').length,
    };
}

export async function listLenders() {
    const { data: lenders, error } = await supabase.from('loan_lenders').select('id, slug, name, description, logo_url, brand').eq('active', true).order('created_at');
    if (error) { if (missing(error)) return { needsMigration: true, lenders: [], consentScope: CONSENT_SCOPE }; throw error; }
    const { data: products } = await supabase.from('loan_products').select('*').eq('active', true).order('created_at');
    return {
        needsMigration: false, consentScope: CONSENT_SCOPE,
        lenders: (lenders ?? []).map((l: any) => ({ ...l, products: (products ?? []).filter((p: any) => p.lender_id === l.id) })),
    };
}

export async function myApplications(orgId: string) {
    const { data, error } = await supabase.from('loan_applications').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(100);
    if (error) { if (missing(error)) return []; throw error; }
    const ids = [...new Set((data ?? []).flatMap((a: any) => [a.lender_id, a.product_id]))];
    const [{ data: lenders }, { data: products }] = await Promise.all([
        supabase.from('loan_lenders').select('id, name').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
        supabase.from('loan_products').select('id, name, kind').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
    ]);
    const lm = new Map((lenders ?? []).map((l: any) => [l.id, l])), pm = new Map((products ?? []).map((p: any) => [p.id, p]));
    return (data ?? []).map((a: any) => ({ ...a, lender_name: lm.get(a.lender_id)?.name ?? 'Lender', product_name: pm.get(a.product_id)?.name ?? 'Loan', product_kind: pm.get(a.product_id)?.kind ?? null }));
}

export interface ApplyInput { productId: string; amount: number; termMonths?: number; purpose?: string; requisitionId?: string; phone?: string; consent: boolean; scope?: string[]; idempotencyKey?: string }

/** The figures a lender sees: taken from the account at the moment of consent, so what was shared can be shown later. */
async function monthlySeries(orgId: string): Promise<{ month: string; moneyIn: number; moneyOut: number }[]> {
    const since = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    const { data } = await supabase.from('cashbook_entries').select('date, entry_type, debit, credit, status').eq('organization_id', orgId).eq('account_type', 'MONEYWISE_WALLET')
        .in('entry_type', ['INFLOW', 'DISBURSEMENT', 'EXPENSE']).in('status', ['ACCOUNTED', 'COMPLETED', 'UNACCOUNTED', 'DISBURSED']).gte('date', since).limit(20000);
    const by = new Map<string, { moneyIn: number; moneyOut: number }>();
    for (const r of (data ?? []) as any[]) {
        const m = String(r.date).slice(0, 7);
        const e = by.get(m) ?? { moneyIn: 0, moneyOut: 0 };
        if (r.entry_type === 'INFLOW') e.moneyIn += Number(r.debit || 0); else e.moneyOut += Number(r.credit || 0);
        by.set(m, e);
    }
    return [...by].sort((x, y) => x[0].localeCompare(y[0])).map(([month, v]) => ({ month, moneyIn: round2(v.moneyIn), moneyOut: round2(v.moneyOut) }));
}

async function snapshotFor(ctx: Ctx, scope: string[]): Promise<Record<string, unknown>> {
    const { data: org } = await supabase.from('organizations').select('name').eq('id', ctx.orgId).maybeSingle();
    let stats: any = null;
    try { stats = (await payLater.offerFor(ctx.userId, ctx.orgId)).stats; } catch { /* the figures are optional: an application can still go without them */ }
    const out: Record<string, unknown> = { takenAt: new Date().toISOString() };
    if (scope.includes('business_details')) out.business = org?.name ?? null;
    if (scope.includes('account_age') && stats) Object.assign(out, { accountAgeDays: stats.accountAgeDays, monthsWithMoneyIn: stats.depositMonths });
    if (scope.includes('sales_cashflow')) {
        out.monthly = await monthlySeries(ctx.orgId).catch(() => []);
        if (stats) Object.assign(out, { moneyIn90Days: round2(Number(stats.inflow90d)), averageMonthlyMoneyIn: round2(Number(stats.averageMonthlyInflow)) });
    }
    if (scope.includes('repayment_history') && stats) out.payIn4 = { completedPlans: stats.completedPlans, latePayments: stats.latePayments };
    // The shared MoneyWise ID: only the parts the person ticked. Documents are references to the private store, not the files themselves.
    if (['kyc_identity', 'kyc_documents', 'bank_details'].some((k) => scope.includes(k))) {
        const k = await investorAccountService.getKycProfile(ctx.userId).catch(() => null);
        if (k?.exists) {
            const a = (k.applicant ?? {}) as Record<string, string>;
            const BANK = ['bank_name', 'bank_account_number', 'bank_account_name'];
            out.kyc = {
                ...(scope.includes('kyc_identity') ? { identity: Object.fromEntries(Object.entries(a).filter(([key]) => !BANK.includes(key) && key !== 'sales_person')), idType: k.idType } : {}),
                ...(scope.includes('bank_details') ? { bank: Object.fromEntries(BANK.map((key) => [key, a[key] ?? ''])) } : {}),
                ...(scope.includes('kyc_documents') ? { documents: k.documents } : {}),
            };
        }
    }
    return out;
}

export async function apply(ctx: Ctx, input: ApplyInput) {
    if (ctx.role !== 'ADMIN') throw new LoanError('Only the account holder can apply for a loan.', 403, 'FORBIDDEN');
    if (!input.consent) throw new LoanError('Agree to share your trading record with the lender to apply.', 400, 'CONSENT');
    const key = String(input.idempotencyKey ?? '').trim() || null;
    if (key) {
        const { data: prior } = await supabase.from('loan_applications').select('*').eq('idempotency_key', key).maybeSingle();
        if (prior) { if (prior.organization_id !== ctx.orgId) throw new LoanError('That request isn’t yours.', 403, 'FORBIDDEN'); return prior; }
    }
    const { data: product, error: pe } = await supabase.from('loan_products').select('*, loan_lenders(id, name, contact_email, active)').eq('id', input.productId).maybeSingle();
    if (pe && missing(pe)) throw new LoanError('Loans are opening soon.', 409, 'NOT_ENABLED');
    if (!product || !product.active || !product.loan_lenders?.active) throw new LoanError('That loan isn’t available any more.', 404, 'NOT_FOUND');

    const amount = round2(Number(input.amount));
    // The lender decides the repayment period; what the borrower types is only what they would prefer, and may be left out.
    const term = input.termMonths ? Math.floor(Number(input.termMonths)) : null;
    if (!(amount > 0)) throw new LoanError('Enter how much you need.', 400, 'AMOUNT');
    if (product.min_amount != null && amount < Number(product.min_amount)) throw new LoanError(`The smallest amount is K${Number(product.min_amount).toLocaleString()}.`, 400, 'AMOUNT');
    if (product.max_amount != null && amount > Number(product.max_amount)) throw new LoanError(`The largest amount is K${Number(product.max_amount).toLocaleString()}.`, 400, 'AMOUNT');
    if (term != null && !(term > 0 && term <= 120)) throw new LoanError('Enter a number of months between 1 and 120, or leave it blank.', 400, 'TERM');
    const phone = String(input.phone ?? '').trim().slice(0, 20);
    if (!phone) throw new LoanError('Add a phone number so the lender can reach you.', 400, 'PHONE');

    let requisitionId: string | null = null;
    if (input.requisitionId) {
        const { data: r } = await supabase.from('requisitions').select('id, organization_id').eq('id', input.requisitionId).maybeSingle();
        if (!r || r.organization_id !== ctx.orgId) throw new LoanError('That request isn’t one of yours.', 400, 'REQUISITION');
        requisitionId = r.id;
    }
    const valid = new Set(CONSENT_SCOPE.map((s) => s.key));
    const scope = (Array.isArray(input.scope) && input.scope.length ? input.scope : CONSENT_SCOPE.map((s) => s.key)).filter((k) => valid.has(k));
    const now = new Date().toISOString();
    const { data: row, error } = await supabase.from('loan_applications').insert({
        organization_id: ctx.orgId, applicant_user_id: ctx.userId, applicant_name: ctx.name, lender_id: product.lender_id, product_id: product.id, amount, term_months: term,
        purpose: String(input.purpose ?? '').trim().slice(0, 300) || null, requisition_id: requisitionId, phone, consent_at: now, consent_scope: scope,
        data_snapshot: await snapshotFor(ctx, scope), status: 'SUBMITTED', idempotency_key: key,
        events: [{ at: now, status: 'SUBMITTED', note: 'Application sent with the applicant’s consent to share their record.' }],
    }).select('*').single();
    if (error || !row) throw error ?? new Error('application not saved');

    void notifyUser(ctx.userId, { title: 'Loan application sent', path: '/loans', body: `Your application to ${product.loan_lenders.name} for K${amount.toLocaleString()} was sent. We’ll tell you when they respond.` });
    return row;
}

export async function withdraw(ctx: Ctx, id: string) {
    const { data: a } = await supabase.from('loan_applications').select('*').eq('id', id).maybeSingle();
    if (!a || a.organization_id !== ctx.orgId) throw new LoanError('Application not found.', 404, 'NOT_FOUND');
    if (!['SUBMITTED', 'IN_REVIEW'].includes(a.status)) throw new LoanError('This application can’t be withdrawn any more.', 409, 'NOT_WITHDRAWABLE');
    const at = new Date().toISOString();
    const { data } = await supabase.from('loan_applications').update({ status: 'WITHDRAWN', events: [...(a.events ?? []), { at, status: 'WITHDRAWN', note: 'Withdrawn by the applicant.' }], updated_at: at }).eq('id', id).select('*').single();
    return data;
}
