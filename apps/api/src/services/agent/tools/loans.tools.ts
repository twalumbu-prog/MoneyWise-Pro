/**
 * loans.tools.ts — staff loans and salary advances from chat.
 *
 * The same requests the app's New Loan / New Advance screens file: a LOAN or ADVANCE requisition. From a personal account a
 * request to an employer is filed in the employer's organization (createRequisition checks they really work there) and, once the
 * employer approves it, the money is paid into the personal wallet and repaid through payroll. The person picks the provider from
 * a list (list_loan_providers → a `choices` widget). Taking on a debt is confirmed with the PIN / Face ID like a payment.
 */
import { supabase } from '../../../lib/supabase';
import { AgentContext, ToolDefinition, ToolProposal, ChoiceOption } from '../types';
import { callHandler, errorOf } from '../internalCall';
import { orgIsPersonal, getEmployersForUser, Employer } from '../../userPreferences.service';
import { employerLoanLedger } from '../../employerLoanLedger.service';
import { createRequisition } from '../../../controllers/requisition.controller';

const kwacha = (n: number) => `K${Number(n).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const invalid = (m: string): never => { throw new Error(`INVALID_ARGUMENTS: ${m}`); };
const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALL_ROLES: any[] = ['ADMIN', 'ACCOUNTANT', 'CASHIER', 'AUTHORISER', 'REQUESTOR'];

interface LoanProduct { id: string; name: string; interest: number; maxPeriod: number }
interface Lender { id: string; name: string; description: string; logo: string | null; products: LoanProduct[] }

/** Keep in step with apps/mobile/src/data/loanCatalog.ts and the web MobileStaffLoanWizard. */
const EXTERNAL_LENDERS: Lender[] = [
    { id: 'unifi', name: 'UniFi', description: 'Fast personal loans with flexible repayment terms.', logo: 'unifi', products: [
        { id: 'unifi-personal', name: 'UniFi Personal Loan', interest: 18, maxPeriod: 48 }, { id: 'unifi-salary', name: 'UniFi Salary Advance', interest: 12, maxPeriod: 12 }] },
    { id: 'lolc', name: 'LOLC Finance', description: 'Micro and SME finance solutions across Zambia.', logo: 'lolc', products: [
        { id: 'lolc-micro', name: 'LOLC Micro Loan', interest: 20, maxPeriod: 36 }, { id: 'lolc-salary', name: 'LOLC Salary Loan', interest: 15, maxPeriod: 24 }] },
    { id: 'finca', name: 'FINCA', description: 'Community-focused microfinance and personal loans.', logo: 'finca', products: [
        { id: 'finca-personal', name: 'FINCA Personal Loan', interest: 19, maxPeriod: 36 }, { id: 'finca-group', name: 'FINCA Group Loan', interest: 16, maxPeriod: 24 }] },
    { id: 'agora', name: 'Agora Microfinance', description: 'Affordable microfinance for salaried employees.', logo: 'agora', products: [
        { id: 'agora-standard', name: 'Agora Standard Loan', interest: 17, maxPeriod: 36 }, { id: 'agora-express', name: 'Agora Express Loan', interest: 14, maxPeriod: 12 }] },
    { id: 'bayport', name: 'Bayport', description: 'Payroll-linked personal loans with competitive rates.', logo: 'bayport', products: [
        { id: 'bayport-personal', name: 'Bayport Personal Loan', interest: 16, maxPeriod: 60 }, { id: 'bayport-top-up', name: 'Bayport Top-Up Loan', interest: 14, maxPeriod: 36 }] },
    { id: 'mfz', name: 'Microfinance Zambia', description: 'Inclusive financial services for working Zambians.', logo: 'mfz', products: [
        { id: 'mfz-salary', name: 'MFZ Salary Loan', interest: 18, maxPeriod: 36 }, { id: 'mfz-personal', name: 'MFZ Personal Loan', interest: 21, maxPeriod: 48 }] },
];
const STAFF_LOAN: LoanProduct = { id: 'standard', name: 'Standard Staff Loan', interest: 15, maxPeriod: 36 };

const proposal = (summary: string, preview: { label: string; value: string }[], warning: string): ToolProposal =>
    ({ __proposal: true, summary, preview, warning, strongAuth: true });

function byName<T>(list: T[], said: string, nameOf: (x: T) => string): T | undefined {
    const q = norm(said);
    if (!q) return undefined;
    return list.find((x) => norm(nameOf(x)) === q) ?? list.find((x) => {
        const n = norm(nameOf(x));
        return n.length >= 3 && (n.includes(q) || (q.length >= 3 && q.includes(n)));
    });
}

const employersOf = async (ctx: AgentContext) => ((await orgIsPersonal(ctx.organizationId)) ? getEmployersForUser(ctx.userId) : []);

// ── Reads ──────────────────────────────────────────────────────────────────────

const listLoanProviders: ToolDefinition = {
    name: 'list_loan_providers',
    description:
        'Show the person the providers they can borrow from, as a list they tap to choose. kind "loan": their employer(s) first (staff loan, repaid through payroll), then outside lenders and their products. ' +
        'kind "advance": the employers they can ask for a salary advance. ALWAYS call this when someone wants a loan or advance and hasn\'t named a provider — then ask which they would like.',
    effect: 'read',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['loan', 'advance'] } }, required: ['kind'] },
    handler: async (ctx, args) => {
        const employers = await employersOf(ctx);
        const options: ChoiceOption[] = [];
        if (args.kind === 'advance') {
            if (employers.length === 0) {
                return { providers: [], note: 'Salary advances come from an employer, and this person has no employer linked to their MoneyWise account. Say so; their employer can add them as staff on payroll.' };
            }
            for (const e of employers) options.push({ label: e.name, sublabel: 'Salary advance · paid into your MoneyWise account, recovered from your next salary', badge: 'Employer', logoUrl: e.logo_url, reply: `A salary advance from ${e.name}` });
        } else {
            for (const e of employers) {
                options.push({ label: e.name, sublabel: `Staff loan · ${STAFF_LOAN.interest}% · up to ${STAFF_LOAN.maxPeriod} months · repaid through payroll`, badge: 'Employer', logoUrl: e.logo_url, reply: `A staff loan from ${e.name}` });
            }
            for (const l of EXTERNAL_LENDERS) for (const p of l.products) {
                options.push({ label: p.name, sublabel: `${l.name} · ${p.interest}% · up to ${p.maxPeriod} months`, logo: l.logo ?? undefined, reply: `The ${p.name} from ${l.name}` });
            }
        }
        return {
            __widget: true,
            widget: { type: 'choices', spec: { title: args.kind === 'advance' ? 'Who would you like the advance from?' : 'Which provider would you like?', options } },
            ack: `Showed ${options.length} option(s) as a tappable list. Ask in one short line which they'd like — don't list them again. ` +
                (employers.length ? `Employers: ${employers.map((e) => e.name).join(', ')}.` : 'No employer is linked, so only outside lenders are offered.'),
        };
    },
};

const listMyLoans: ToolDefinition = {
    name: 'list_my_loans',
    description: 'The person\'s own loan and salary-advance requests: who from, how much, status, and for those paid out how much has been repaid and what is still owed.',
    effect: 'read',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: {} },
    handler: async (ctx) => {
        const { data } = await (supabase.from('requisitions') as any)
            .select('id, type, status, description, loan_amount, estimated_total, repayment_period, interest_rate, monthly_deduction, created_at, organization_id, organizations(name)')
            .eq('requestor_id', ctx.userId).in('type', ['LOAN', 'ADVANCE']).order('created_at', { ascending: false }).limit(30);
        const rows = await Promise.all((data ?? []).map(async (r: any) => {
            const bal = await employerLoanLedger.getOutstanding(r.id).catch(() => null);
            return {
                type: r.type, from: r.organization_id === ctx.organizationId ? lenderFromDescription(r.description) : r.organizations?.name,
                amount: Number(r.loan_amount || r.estimated_total || 0), status: r.status, requested: String(r.created_at).slice(0, 10),
                months: r.repayment_period ?? null, monthly: r.monthly_deduction ? round2(r.monthly_deduction) : null,
                total_to_repay: bal?.owed ?? null, repaid: bal?.recovered ?? null, outstanding: bal?.outstanding ?? null,
            };
        }));
        return { loans: rows };
    },
};

const lenderFromDescription = (d: string) => String(d ?? '').split(' - ')[1] ?? 'Personal';

// ── Requests ───────────────────────────────────────────────────────────────────

interface LoanPlan {
    kind: 'employer' | 'external' | 'internal';
    employer?: Employer; lender?: Lender; product: LoanProduct;
    amount: number; months: number; total: number; monthly: number; reason: string;
    staffName: string; employeeId?: string;
}

async function planLoan(ctx: AgentContext, args: any): Promise<LoanPlan> {
    const amount = round2(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) invalid('How much would they like to borrow?');
    const months = Math.round(Number(args.months));
    const reason = String(args.reason ?? '').trim();
    const said = String(args.provider ?? '').trim();
    if (!said) invalid('Which provider? Call list_loan_providers with kind "loan" and let them choose.');

    const employers = await employersOf(ctx);
    const employer = byName(employers, said, (e) => e.name);
    let kind: LoanPlan['kind'];
    let lender: Lender | undefined;
    let product: LoanProduct;
    if (employer) {
        kind = 'employer'; product = STAFF_LOAN;
    } else if (/^(internal|my company|staff loan|personal loan|standard)/i.test(said) && !(await orgIsPersonal(ctx.organizationId))) {
        kind = 'internal'; product = STAFF_LOAN;
    } else {
        const all = EXTERNAL_LENDERS.flatMap((l) => l.products.map((p) => ({ l, p })));
        const hit = byName(all, String(args.product ?? ''), (x) => x.p.name) ?? byName(all, said, (x) => x.p.name);
        lender = hit?.l ?? byName(EXTERNAL_LENDERS, said, (l) => l.name);
        if (!lender) return invalid(`"${said}" isn't a provider they can borrow from. Call list_loan_providers and let them pick.`);
        const p = hit && hit.l.id === lender.id ? hit.p : (lender.products.length === 1 ? lender.products[0] : byName(lender.products, String(args.product ?? ''), (x) => x.name));
        if (!p) return invalid(`Which ${lender.name} product: ${lender.products.map((x) => `${x.name} (${x.interest}%, up to ${x.maxPeriod} months)`).join(' or ')}?`);
        kind = 'external'; product = p;
    }
    if (!Number.isFinite(months) || months < 1) invalid(`Over how many months would they like to repay (up to ${product.maxPeriod})?`);
    if (months > product.maxPeriod) invalid(`${product.name} runs up to ${product.maxPeriod} months.`);

    let staffName = '', employeeId: string | undefined;
    if (kind === 'employer') {
        const { data: u } = await supabase.from('users').select('name').eq('id', ctx.userId).maybeSingle();
        staffName = (u as any)?.name ?? ''; employeeId = employer!.employee_id ?? undefined;
    } else if (kind === 'internal') {
        staffName = String(args.staffName ?? '').trim(); employeeId = String(args.employeeId ?? '').trim() || undefined;
        if (!staffName || !employeeId) invalid('A staff loan in a business account needs the staff member\'s name and employee ID.');
    } else {
        const { data: u } = await supabase.from('users').select('name').eq('id', ctx.userId).maybeSingle();
        staffName = (u as any)?.name ?? '';
    }
    const total = round2(amount * (1 + product.interest / 100));
    return { kind, employer, lender, product, amount, months, total, monthly: round2(total / months), reason, staffName, employeeId };
}

const requestLoan: ToolDefinition = {
    name: 'request_loan',
    description:
        'Apply for a loan: a staff loan from the person\'s employer (paid into their MoneyWise account once approved, repaid through payroll) or a loan product from an outside lender. ' +
        'Needs the provider they chose from list_loan_providers, the amount and the repayment period in months. The person confirms with their PIN / Face ID.',
    effect: 'write',
    allowedRoles: ALL_ROLES,
    parameters: {
        type: 'object',
        properties: {
            provider: { type: 'string', description: 'The employer or lender they chose.' },
            product: { type: 'string', description: 'For outside lenders: the product, e.g. "UniFi Salary Advance".' },
            amount: { type: 'number' },
            months: { type: 'number', description: 'Repayment period in months.' },
            reason: { type: 'string', description: 'Optional: what it is for.' },
            staffName: { type: 'string', description: 'Business accounts only: the staff member the loan is for.' },
            employeeId: { type: 'string', description: 'Business accounts only.' },
        },
        required: ['provider', 'amount', 'months'],
    },
    handler: async (ctx, args) => {
        const p = await planLoan(ctx, args);
        const from = p.employer?.name ?? p.lender?.name ?? 'Internal';
        return proposal(`Apply for a ${kwacha(p.amount)} loan from ${from}`, [
            { label: 'Provider', value: from }, { label: 'Product', value: p.product.name },
            { label: 'Amount', value: kwacha(p.amount) }, { label: 'Interest', value: `${p.product.interest}%` },
            { label: 'Repay over', value: `${p.months} month${p.months === 1 ? '' : 's'}` },
            { label: 'Monthly', value: kwacha(p.monthly) }, { label: 'Total to repay', value: kwacha(p.total) },
            ...(p.reason ? [{ label: 'For', value: p.reason }] : []),
            ...(p.kind === 'internal' ? [{ label: 'Staff member', value: `${p.staffName} (${p.employeeId})` }] : []),
        ], p.kind === 'employer'
            ? `This is a debt: ${kwacha(p.total)} repaid as ${kwacha(p.monthly)} a month from your salary. ${p.employer!.name} reviews it first; once approved the money is paid into your MoneyWise account.`
            : p.kind === 'external'
                ? `${p.lender!.name} isn't connected to MoneyWise yet: this records your application in MoneyWise but doesn't send it to them — contact ${p.lender!.name} to complete it.`
                : `A debt of ${kwacha(p.total)}, recovered as ${kwacha(p.monthly)} a month through payroll once approved.`);
    },
    execute: async (ctx, args) => {
        const p = await planLoan(ctx, args);
        const from = p.employer?.name ?? p.lender?.name ?? 'Internal Organization';
        const r = await callHandler(createRequisition, ctx, { body: {
            description: `LOAN: ${p.staffName} - ${from} - ${p.product.name} - ${p.reason || 'Staff Loan'}`,
            department: 'HR', type: 'LOAN', estimated_total: p.amount,
            staff_name: p.staffName, employee_id: p.employeeId, loan_amount: p.amount,
            repayment_period: p.months, interest_rate: p.product.interest, monthly_deduction: p.monthly,
            ...(p.employer ? { target_organization_id: p.employer.id } : {}),
        } });
        if (r.status >= 400 || !r.body?.id) throw new Error(errorOf(r, 'Could not file the loan request'));
        return {
            requested: true, from, amount: p.amount, reference: r.body.reference_number ?? null,
            next: p.employer ? `${from} reviews it; once approved the money arrives in the MoneyWise account.` : p.lender ? `Recorded only — contact ${from} to complete the application.` : 'Awaiting approval.',
        };
    },
};

async function planAdvance(ctx: AgentContext, args: any) {
    const amount = round2(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) invalid('How much would they like as an advance?');
    const employers = await employersOf(ctx);
    if (employers.length === 0) invalid('Salary advances come from an employer, and no employer is linked to this MoneyWise account.');
    const employer = args.employer ? byName(employers, args.employer, (e) => e.name) : (employers.length === 1 ? employers[0] : undefined);
    if (!employer) return invalid(`Which employer? Call list_loan_providers with kind "advance" and let them choose.`);
    const { data: u } = await supabase.from('users').select('name').eq('id', ctx.userId).maybeSingle();
    return { amount, employer, reason: String(args.reason ?? '').trim(), name: (u as any)?.name ?? '' };
}

const requestSalaryAdvance: ToolDefinition = {
    name: 'request_salary_advance',
    description: 'Ask the person\'s employer for a salary advance, paid into their MoneyWise account once approved and recovered from their next salary. Personal accounts only. Confirmed with PIN / Face ID.',
    effect: 'write',
    allowedRoles: ALL_ROLES,
    parameters: {
        type: 'object',
        properties: { employer: { type: 'string' }, amount: { type: 'number' }, reason: { type: 'string' } },
        required: ['amount'],
    },
    handler: async (ctx, args) => {
        const p = await planAdvance(ctx, args);
        return proposal(`Ask ${p.employer.name} for a ${kwacha(p.amount)} salary advance`, [
            { label: 'Employer', value: p.employer.name }, { label: 'Amount', value: kwacha(p.amount) },
            ...(p.reason ? [{ label: 'For', value: p.reason }] : []),
            { label: 'Paid into', value: 'Your MoneyWise account' }, { label: 'Recovered', value: 'From your next salary' },
        ], `This is a debt of ${kwacha(p.amount)} to ${p.employer.name}, taken from your next salary. They review it first.`);
    },
    execute: async (ctx, args) => {
        const p = await planAdvance(ctx, args);
        const r = await callHandler(createRequisition, ctx, { body: {
            description: `ADVANCE: ${p.name} - ${p.reason || 'Salary Advance'}`, department: 'HR', type: 'ADVANCE', estimated_total: p.amount,
            staff_name: p.name, employee_id: p.employer.employee_id ?? undefined, loan_amount: p.amount, target_organization_id: p.employer.id,
        } });
        if (r.status >= 400 || !r.body?.id) throw new Error(errorOf(r, 'Could not file the advance request'));
        return { requested: true, from: p.employer.name, amount: p.amount, reference: r.body.reference_number ?? null, next: `${p.employer.name} reviews it; once approved the money arrives in the MoneyWise account.` };
    },
};

export const loanTools: ToolDefinition[] = [listLoanProviders, listMyLoans, requestLoan, requestSalaryAdvance];
