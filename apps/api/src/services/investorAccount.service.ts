/**
 * investorAccount.service.ts — a customer's account with an investment company.
 *
 * Investor side
 *   • connect()  — the investor already has an account number with the company.
 *   • apply()    — the investor registers: the application is validated, saved,
 *                  rendered to a PDF and emailed to the company's own email.
 *   • assertCanInvest() — gate used by every funding path (wallet transfer and
 *                  mobile-money intents): no ACTIVE account, no investing.
 *
 * Company side (the CRM "Investors" tab)
 *   • listApplications / getApplication / review — staff change the status and
 *     issue the account number; the applicant is emailed about the outcome.
 *   • savePayoutSettings — the bank account investor deposits are forwarded to.
 *     Forwarding itself is the existing Automations engine (deposit → bank
 *     transfer → proof-of-payment email); this module just keeps one managed
 *     automation in step with the company's saved bank details.
 */
import { supabase } from '../lib/supabase';
import { emailService } from './email.service';
import { LencoService } from './lenco.service';
import { buildApplicationPdf } from './investorApplicationPdf';

export const KYC_BUCKET = 'investor-kyc';
const FRONTEND_URL = process.env.FRONTEND_URL
    || (process.env.NODE_ENV === 'production' ? 'https://moneywise.blueopus.cloud' : 'http://localhost:5173');

/** Marks the automation this module owns, so it never touches one a human built. */
export const MANAGED_AUTOMATION_KEY = 'investor_payout_settings';

export type InvestorAccountStatus = 'PENDING_REVIEW' | 'INFO_REQUESTED' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';

export class InvestorAccountError extends Error {
    constructor(public code: string, message: string, public httpStatus = 400, public details?: any) {
        super(message);
    }
}

// ── Validation ───────────────────────────────────────────────────────────────

const clean = (v: unknown, max = 200): string =>
    typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function ageOn(iso: string, today = new Date()): number {
    const d = new Date(iso);
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
}

const REQUIRED_TEXT: Array<[string, string]> = [
    ['first_name', 'First name'],
    ['last_name', 'Last name'],
    ['nationality', 'Nationality'],
    ['email', 'Email address'],
    ['phone', 'Phone number'],
    ['physical_address', 'Physical address'],
    ['id_type', 'ID type'],
    ['id_number', 'ID number'],
    ['source_of_income', 'Source of income'],
    ['occupation', 'Occupation'],
    ['bank_name', 'Bank name'],
    ['branch_name', 'Branch name'],
    ['bank_account_number', 'Bank account number'],
    ['bank_account_name', 'Bank account name'],
    ['nok_full_name', 'Next of kin full name'],
    ['nok_id_number', 'Next of kin ID / NRC / passport number'],
    ['nok_phone', 'Next of kin contact number'],
    ['nok_relationship', 'Relationship to next of kin'],
];
const OPTIONAL_TEXT = ['middle_name', 'employer', 'employee_number', 'sales_person'];

export function validateApplicant(raw: any): { applicant: Record<string, string>; errors: string[] } {
    const errors: string[] = [];
    const a: Record<string, string> = {};
    const src = raw && typeof raw === 'object' ? raw : {};

    for (const [key, label] of REQUIRED_TEXT) {
        a[key] = clean(src[key]);
        if (!a[key]) errors.push(`${label} is required`);
    }
    for (const key of OPTIONAL_TEXT) a[key] = clean(src[key]);

    a.gender = clean(src.gender, 10).toUpperCase();
    if (!['MALE', 'FEMALE', 'OTHER'].includes(a.gender)) errors.push('Gender is required');

    a.date_of_birth = clean(src.date_of_birth, 10);
    if (!isIsoDate(a.date_of_birth)) errors.push('Date of birth is required');
    else if (ageOn(a.date_of_birth) < 18) errors.push('You must be at least 18 years old to open an account');
    else if (ageOn(a.date_of_birth) > 120) errors.push('Date of birth looks incorrect');

    a.nok_date_of_birth = clean(src.nok_date_of_birth, 10);
    if (!isIsoDate(a.nok_date_of_birth)) errors.push('Next of kin date of birth is required');

    if (a.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.email)) errors.push('Email address is not valid');
    for (const k of ['phone', 'nok_phone'] as const) {
        if (a[k] && !/^\+?[0-9 ]{9,16}$/.test(a[k])) errors.push(`${k === 'phone' ? 'Phone number' : 'Next of kin contact number'} is not valid`);
    }
    if (a.bank_account_number && !/^[0-9A-Za-z-]{4,34}$/.test(a.bank_account_number)) errors.push('Bank account number is not valid');

    return { applicant: a, errors };
}

const DOC_LABELS: Record<string, string> = {
    nrc_front: 'NRC – front',
    nrc_back: 'NRC – back',
    nrc_combined: 'NRC – front and back',
    photo: 'Passport-size photo',
    proof_of_residence: 'Proof of residence',
    reference_letter: 'Reference letter',
    proof_of_income: 'Proof of income',
};

async function objectExists(path: string): Promise<boolean> {
    const { error } = await supabase.storage.from(KYC_BUCKET).createSignedUrl(path, 30);
    return !error;
}

export async function validateDocuments(raw: any, userId: string): Promise<{ documents: Record<string, string>; errors: string[] }> {
    const errors: string[] = [];
    const src = raw && typeof raw === 'object' ? raw : {};
    const documents: Record<string, string> = {};

    const method = src.nrc_method === 'COMBINED' ? 'COMBINED' : 'SEPARATE';
    const wanted = [
        ...(method === 'COMBINED' ? ['nrc_combined'] : ['nrc_front', 'nrc_back']),
        'photo', 'proof_of_residence', 'reference_letter', 'proof_of_income',
    ];

    for (const key of wanted) {
        const p = typeof src[key] === 'string' ? src[key].trim() : '';
        if (!p) continue;
        // Uploads go to the investor's own folder; refusing anything else stops one user
        // pointing an application at another user's files.
        if (p.length > 300 || !p.startsWith(`${userId}/`) || p.includes('..')) {
            errors.push(`${DOC_LABELS[key]}: invalid file reference`);
            continue;
        }
        if (!(await objectExists(p))) {
            errors.push(`${DOC_LABELS[key]}: the upload could not be found, please upload it again`);
            continue;
        }
        documents[key] = p;
    }

    if (method === 'COMBINED') {
        if (!documents.nrc_combined) errors.push('NRC (front and back) is required');
    } else {
        if (!documents.nrc_front) errors.push('NRC front is required');
        if (!documents.nrc_back) errors.push('NRC back is required');
    }
    if (!documents.photo) errors.push('Passport-size photo is required');
    if (!documents.proof_of_residence && !documents.reference_letter) {
        errors.push('Upload a proof of residence or a reference letter (one is enough)');
    }
    if (!documents.proof_of_income) errors.push('Proof of income is required');

    return { documents, errors };
}

// ── Targets ──────────────────────────────────────────────────────────────────

interface TargetRow {
    id: string;
    organization_id: string;
    display_name: string;
    requires_account: boolean;
    sales_people: string[] | null;
    organization: { name: string; email: string | null } | null;
}

async function loadTarget(targetId: string): Promise<TargetRow | null> {
    const { data } = await supabase
        .from('investment_targets')
        .select('id, organization_id, display_name, requires_account, sales_people, organization:organizations(name, email)')
        .eq('id', targetId)
        .eq('is_active', true)
        .maybeSingle();
    if (!data) return null;
    const org: any = Array.isArray((data as any).organization) ? (data as any).organization[0] : (data as any).organization;
    return { ...(data as any), organization: org ?? null } as TargetRow;
}

async function targetForOrg(orgId: string) {
    const { data } = await supabase
        .from('investment_targets')
        .select('id, display_name, wallet_id')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .maybeSingle();
    return data as { id: string; display_name: string; wallet_id: string } | null;
}

// ── Investor side ────────────────────────────────────────────────────────────

const PUBLIC_COLUMNS = 'id, investment_target_id, source, status, account_number, review_note, created_at, updated_at';

async function myAccounts(investorOrgId: string) {
    const { data, error } = await supabase
        .from('investor_accounts')
        .select(PUBLIC_COLUMNS)
        .eq('investor_organization_id', investorOrgId)
        .neq('status', 'REJECTED')
        .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    // A rejected application is still worth telling the investor about (with the reason),
    // but only when it is the latest word for that company.
    const { data: rejected } = await supabase
        .from('investor_accounts')
        .select(PUBLIC_COLUMNS)
        .eq('investor_organization_id', investorOrgId)
        .eq('status', 'REJECTED')
        .order('updated_at', { ascending: false });
    const live = new Set((data ?? []).map(r => r.investment_target_id));
    const latestRejected = new Map<string, any>();
    for (const r of rejected ?? []) if (!live.has(r.investment_target_id) && !latestRejected.has(r.investment_target_id)) latestRejected.set(r.investment_target_id, r);

    return [...(data ?? []), ...latestRejected.values()];
}

const ACCOUNT_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9\-\/. ]{1,38}[A-Za-z0-9]$/;

async function connect(params: { investorOrgId: string; userId: string; targetId: string; accountNumber: string }) {
    const target = await loadTarget(params.targetId);
    if (!target) throw new InvestorAccountError('TARGET_NOT_FOUND', 'Investment company not found', 404);
    if (target.organization_id === params.investorOrgId) throw new InvestorAccountError('OWN_ORG', 'You cannot invest in your own organization');

    const accountNumber = clean(params.accountNumber, 40);
    if (!ACCOUNT_NUMBER_RE.test(accountNumber)) {
        throw new InvestorAccountError('BAD_ACCOUNT_NUMBER', 'Enter your investment account number exactly as the company gave it to you.');
    }

    const { data: existing } = await supabase
        .from('investor_accounts')
        .select(PUBLIC_COLUMNS)
        .eq('investor_organization_id', params.investorOrgId)
        .eq('investment_target_id', target.id)
        .neq('status', 'REJECTED')
        .maybeSingle();
    if (existing) throw new InvestorAccountError('ALREADY_EXISTS', 'You already have an account or application with this company.', 409, existing);

    // An account number belongs to one investor. Someone else holding it is either a
    // typo or an attempt to ride on another investor's account — never silently allow it.
    const { data: taken } = await supabase
        .from('investor_accounts')
        .select('id')
        .eq('investment_target_id', target.id)
        .eq('status', 'ACTIVE')
        .ilike('account_number', accountNumber.replace(/[%_]/g, m => `\\${m}`))
        .maybeSingle();
    if (taken) {
        throw new InvestorAccountError('NUMBER_TAKEN', 'That account number is already linked to another MoneyWise account. Check the number, or contact the company.', 409);
    }

    const { data, error } = await supabase
        .from('investor_accounts')
        .insert({
            investor_organization_id: params.investorOrgId,
            investment_target_id: target.id,
            target_organization_id: target.organization_id,
            user_id: params.userId,
            source: 'CONNECTED',
            // Active straight away so the investor isn't blocked; the company sees it
            // flagged as self-linked in its CRM and can suspend it if it isn't theirs.
            status: 'ACTIVE',
            account_number: accountNumber,
            reviewed_at: new Date().toISOString(),
        })
        .select(PUBLIC_COLUMNS)
        .single();
    if (error) {
        if ((error as any).code === '23505') throw new InvestorAccountError('NUMBER_TAKEN', 'That account number is already linked to another MoneyWise account.', 409);
        throw new Error(`Could not connect the account: ${error.message}`);
    }
    return data;
}

async function apply(params: { investorOrgId: string; userId: string; targetId: string; applicant: any; documents: any; declaration: boolean }) {
    const target = await loadTarget(params.targetId);
    if (!target) throw new InvestorAccountError('TARGET_NOT_FOUND', 'Investment company not found', 404);
    if (target.organization_id === params.investorOrgId) throw new InvestorAccountError('OWN_ORG', 'You cannot invest in your own organization');
    if (params.declaration !== true) throw new InvestorAccountError('DECLARATION', 'Please accept the declaration to submit your application.');

    const { applicant, errors: applicantErrors } = validateApplicant(params.applicant);
    const { documents, errors: docErrors } = await validateDocuments(params.documents, params.userId);
    const errors = [...applicantErrors, ...docErrors];
    if (errors.length) throw new InvestorAccountError('VALIDATION', errors[0], 422, { errors });

    const { data: existing } = await supabase
        .from('investor_accounts')
        .select('id, status')
        .eq('investor_organization_id', params.investorOrgId)
        .eq('investment_target_id', target.id)
        .neq('status', 'REJECTED')
        .maybeSingle();
    if (existing && existing.status !== 'INFO_REQUESTED') {
        throw new InvestorAccountError('ALREADY_EXISTS', 'You already have an account or application with this company.', 409);
    }

    const now = new Date();
    const row = {
        investor_organization_id: params.investorOrgId,
        investment_target_id: target.id,
        target_organization_id: target.organization_id,
        user_id: params.userId,
        source: 'REGISTERED' as const,
        status: 'PENDING_REVIEW' as const,
        applicant,
        documents,
        declaration_accepted_at: now.toISOString(),
        review_note: null,
        email_sent_at: null,
        email_error: null,
        updated_at: now.toISOString(),
    };

    let id: string;
    if (existing) {
        const { error } = await supabase.from('investor_accounts').update(row).eq('id', existing.id);
        if (error) throw new Error(`Could not save the application: ${error.message}`);
        id = existing.id;
    } else {
        const { data, error } = await supabase.from('investor_accounts').insert(row).select('id').single();
        if (error || !data) throw new Error(`Could not save the application: ${error?.message}`);
        id = data.id;
    }

    // PDF + email are best-effort: the application is already safely saved and visible in
    // the company's CRM, so a Resend/storage hiccup must never lose or fail the submission.
    const delivery = await deliverApplication(id, target, applicant, documents, now).catch((e: any) => ({ ok: false, error: e.message as string }));
    if (!delivery.ok) console.error(`[InvestorAccounts] delivery of application ${id} failed:`, delivery.error);

    const { data: saved } = await supabase.from('investor_accounts').select(PUBLIC_COLUMNS).eq('id', id).single();
    return saved;
}

async function download(path: string): Promise<Buffer | null> {
    const { data, error } = await supabase.storage.from(KYC_BUCKET).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

async function deliverApplication(
    id: string, target: TargetRow, applicant: Record<string, string>, documents: Record<string, string>, submittedAt: Date,
): Promise<{ ok: boolean; error?: string }> {
    const fullName = [applicant.first_name, applicant.middle_name, applicant.last_name].filter(Boolean).join(' ');

    // Photo is embedded in the PDF only when PDFKit can render it (JPEG/PNG).
    let photo: Buffer | null = null;
    if (documents.photo && /\.(jpe?g|png)$/i.test(documents.photo)) photo = await download(documents.photo);

    const pdf = await buildApplicationPdf({
        companyName: target.display_name,
        applicationId: id,
        submittedAt,
        applicant,
        uploadedDocuments: Object.keys(documents).map(k => DOC_LABELS[k] ?? k),
        declarationAcceptedAt: submittedAt,
        photo,
    });

    const pdfPath = `${target.organization_id}/applications/${id}.pdf`;
    const { error: upErr } = await supabase.storage.from(KYC_BUCKET).upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true });
    await supabase.from('investor_accounts').update({ pdf_path: upErr ? null : pdfPath }).eq('id', id);
    if (upErr) console.error(`[InvestorAccounts] could not store PDF for ${id}:`, upErr.message);

    const recipient = target.organization?.email?.trim();
    if (!recipient) {
        const msg = `${target.display_name} has no email address set, so the application was not emailed. It is available in the CRM.`;
        await supabase.from('investor_accounts').update({ email_error: msg }).eq('id', id);
        return { ok: false, error: msg };
    }

    // Attach the supporting documents while they fit comfortably under the provider's
    // limit; anything left out stays one click away in the CRM.
    const attachments: { filename: string; content: Buffer }[] = [{ filename: `Investor application - ${fullName || id.slice(0, 8)}.pdf`, content: pdf }];
    let budget = 20 * 1024 * 1024 - pdf.length;
    const omitted: string[] = [];
    for (const [key, path] of Object.entries(documents)) {
        const buf = await download(path);
        if (!buf) { omitted.push(DOC_LABELS[key] ?? key); continue; }
        if (buf.length > budget) { omitted.push(DOC_LABELS[key] ?? key); continue; }
        budget -= buf.length;
        const ext = (path.split('.').pop() || 'bin').toLowerCase();
        attachments.push({ filename: `${DOC_LABELS[key] ?? key}.${ext}`.replace(/[\/\\]/g, '-'), content: buf });
    }

    const link = `${FRONTEND_URL}/crm?tab=investors&application=${id}`;
    try {
        await emailService.sendEmail({
            to: recipient,
            replyTo: applicant.email || undefined,
            subject: `New investor application – ${fullName}`,
            html: `
                <h2 style="color:#002E3B;margin:0 0 12px">New investor account application</h2>
                <p><strong>${escapeHtml(fullName)}</strong> has applied to open an account with <strong>${escapeHtml(target.display_name)}</strong> through MoneyWise.</p>
                <table style="border-collapse:collapse;margin:12px 0;font-size:14px">
                    <tr><td style="padding:3px 16px 3px 0;color:#64748b">Email</td><td>${escapeHtml(applicant.email)}</td></tr>
                    <tr><td style="padding:3px 16px 3px 0;color:#64748b">Phone</td><td>${escapeHtml(applicant.phone)}</td></tr>
                    <tr><td style="padding:3px 16px 3px 0;color:#64748b">ID</td><td>${escapeHtml(applicant.id_type)} ${escapeHtml(applicant.id_number)}</td></tr>
                </table>
                <p>The completed application form is attached as a PDF${attachments.length > 1 ? ', together with the supporting documents' : ''}.${omitted.length ? ` Not attached because of size: ${escapeHtml(omitted.join(', '))} — open them in the CRM.` : ''}</p>
                <p>Review it, set the status and issue the account number from your CRM:</p>
                <a href="${link}" style="display:inline-block;padding:12px 24px;background-color:#006AFF;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Open in CRM</a>
                <p style="color:#64748b;font-size:12px;margin-top:20px">You can reply to this email to reach the applicant directly.</p>`,
            attachments,
        });
        await supabase.from('investor_accounts').update({ email_sent_at: new Date().toISOString(), email_error: null }).eq('id', id);
    } catch (e: any) {
        const msg = `Email to ${recipient} failed: ${e?.message || 'unknown error'}`;
        await supabase.from('investor_accounts').update({ email_error: msg }).eq('id', id);
        return { ok: false, error: msg };
    }

    // Confirmation to the applicant (separate so a bounce here can't affect the company's copy).
    emailService.sendEmail({
        to: applicant.email,
        subject: `We received your ${target.display_name} application`,
        html: `
            <h2 style="color:#002E3B;margin:0 0 12px">Application received</h2>
            <p>Hi ${escapeHtml(applicant.first_name)}, thank you for applying to open an account with <strong>${escapeHtml(target.display_name)}</strong>.</p>
            <p>${escapeHtml(target.display_name)} will review your details and documents. You will get an email, and see the status in the MoneyWise app, once your account is active and your account number has been issued.</p>`,
    }).catch(() => undefined);

    return { ok: true };
}

/**
 * The gate every funding path goes through. Returns the investor's ACTIVE account
 * (or null when the company doesn't require one).
 */
async function assertCanInvest(investorOrgId: string, targetId: string) {
    const target = await loadTarget(targetId);
    if (!target) throw new InvestorAccountError('TARGET_NOT_FOUND', 'Investment company not found', 404);
    if (!target.requires_account) return null;

    const { data } = await supabase
        .from('investor_accounts')
        .select('id, status, account_number')
        .eq('investor_organization_id', investorOrgId)
        .eq('investment_target_id', targetId)
        .neq('status', 'REJECTED')
        .maybeSingle();

    if (!data) throw new InvestorAccountError('ACCOUNT_REQUIRED', `Connect or register an account with ${target.display_name} before investing.`, 403);
    if (data.status !== 'ACTIVE') {
        const msg = data.status === 'SUSPENDED'
            ? `Your ${target.display_name} account is suspended. Contact them for help.`
            : `Your ${target.display_name} account isn't active yet. You can invest once it has been approved.`;
        throw new InvestorAccountError('ACCOUNT_NOT_ACTIVE', msg, 403, { status: data.status });
    }
    return data as { id: string; status: string; account_number: string | null };
}

// ── Company side (CRM) ───────────────────────────────────────────────────────

async function listApplications(targetOrgId: string, status?: string) {
    let q = supabase
        .from('investor_accounts')
        .select('id, source, status, account_number, applicant, pdf_path, email_sent_at, email_error, review_note, reviewed_at, created_at, updated_at')
        .eq('target_organization_id', targetOrgId)
        .order('created_at', { ascending: false })
        .limit(500);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return (data ?? []).map(r => {
        const a: any = r.applicant || {};
        return {
            id: r.id,
            source: r.source,
            status: r.status,
            accountNumber: r.account_number,
            name: [a.first_name, a.last_name].filter(Boolean).join(' ') || null,
            email: a.email ?? null,
            phone: a.phone ?? null,
            hasPdf: !!r.pdf_path,
            emailSent: !!r.email_sent_at,
            emailError: r.email_error,
            reviewNote: r.review_note,
            reviewedAt: r.reviewed_at,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    });
}

async function signed(path: string, ttl = 60 * 60): Promise<string | null> {
    const { data } = await supabase.storage.from(KYC_BUCKET).createSignedUrl(path, ttl);
    return data?.signedUrl ?? null;
}

async function getApplication(id: string, targetOrgId: string) {
    const { data, error } = await supabase
        .from('investor_accounts')
        .select('*')
        .eq('id', id)
        .eq('target_organization_id', targetOrgId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    const docs: Record<string, { label: string; url: string | null }> = {};
    for (const [key, path] of Object.entries((data.documents ?? {}) as Record<string, string>)) {
        docs[key] = { label: DOC_LABELS[key] ?? key, url: await signed(path) };
    }
    const { data: investments } = await supabase
        .from('investments')
        .select('id, reference, method, amount_paid, amount_received, status, product_name, created_at')
        .eq('investor_account_id', id)
        .order('created_at', { ascending: false })
        .limit(50);

    return {
        id: data.id,
        source: data.source,
        status: data.status,
        accountNumber: data.account_number,
        applicant: data.applicant,
        documents: docs,
        pdfUrl: data.pdf_path ? await signed(data.pdf_path) : null,
        declarationAcceptedAt: data.declaration_accepted_at,
        emailSentAt: data.email_sent_at,
        emailError: data.email_error,
        reviewNote: data.review_note,
        reviewedAt: data.reviewed_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        investments: investments ?? [],
    };
}

const REVIEW_STATUSES: InvestorAccountStatus[] = ['PENDING_REVIEW', 'INFO_REQUESTED', 'ACTIVE', 'REJECTED', 'SUSPENDED'];

async function review(params: {
    id: string; targetOrgId: string; reviewerId: string;
    status: string; accountNumber?: string; note?: string;
}) {
    if (!REVIEW_STATUSES.includes(params.status as InvestorAccountStatus)) throw new InvestorAccountError('BAD_STATUS', 'Unknown status');

    const { data: acct } = await supabase
        .from('investor_accounts')
        .select('*')
        .eq('id', params.id)
        .eq('target_organization_id', params.targetOrgId)
        .maybeSingle();
    if (!acct) throw new InvestorAccountError('NOT_FOUND', 'Application not found', 404);

    const status = params.status as InvestorAccountStatus;
    const note = clean(params.note, 1000) || null;
    let accountNumber: string | null = acct.account_number;

    if (status === 'ACTIVE') {
        accountNumber = clean(params.accountNumber ?? acct.account_number ?? '', 40);
        if (!ACCOUNT_NUMBER_RE.test(accountNumber)) throw new InvestorAccountError('BAD_ACCOUNT_NUMBER', 'Enter the account number to issue to this investor.');
    }
    if ((status === 'REJECTED' || status === 'INFO_REQUESTED') && !note) {
        throw new InvestorAccountError('NOTE_REQUIRED', status === 'REJECTED' ? 'Add a reason for rejecting this application.' : 'Tell the applicant what more you need.');
    }

    const { data: updated, error } = await supabase
        .from('investor_accounts')
        .update({
            status,
            account_number: accountNumber,
            review_note: note,
            reviewed_by: params.reviewerId,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', params.id)
        .select(PUBLIC_COLUMNS)
        .single();
    if (error) {
        if ((error as any).code === '23505') throw new InvestorAccountError('NUMBER_TAKEN', 'That account number is already issued to another investor.', 409);
        throw new Error(error.message);
    }

    notifyApplicant(acct, status, accountNumber, note).catch(e => console.error('[InvestorAccounts] notify failed:', e.message));
    return updated;
}

async function notifyApplicant(acct: any, status: InvestorAccountStatus, accountNumber: string | null, note: string | null) {
    if (acct.status === status) return;
    const to = acct.applicant?.email;
    if (!to) return;
    const target = await loadTarget(acct.investment_target_id);
    const company = escapeHtml(target?.display_name ?? 'the investment company');
    const first = escapeHtml(acct.applicant?.first_name ?? 'there');

    let subject: string; let body: string;
    switch (status) {
        case 'ACTIVE':
            subject = `Your ${target?.display_name} account is active`;
            body = `<h2 style="color:#002E3B">Your account is active</h2>
                <p>Hi ${first}, your <strong>${company}</strong> account has been approved.</p>
                <p style="font-size:18px">Account number: <strong>${escapeHtml(accountNumber ?? '')}</strong></p>
                <p>Open MoneyWise → Invest to make your first investment.</p>`;
            break;
        case 'REJECTED':
            subject = `Update on your ${target?.display_name} application`;
            body = `<h2 style="color:#002E3B">Application not approved</h2>
                <p>Hi ${first}, ${company} was unable to approve your application.</p>${note ? `<p><strong>Reason:</strong> ${escapeHtml(note)}</p>` : ''}
                <p>You can correct the details and apply again in the MoneyWise app.</p>`;
            break;
        case 'INFO_REQUESTED':
            subject = `${target?.display_name} needs more information`;
            body = `<h2 style="color:#002E3B">More information needed</h2>
                <p>Hi ${first}, ${company} needs a little more before they can approve your application:</p>
                <p style="background:#F0F7FF;padding:12px;border-radius:8px">${escapeHtml(note ?? '')}</p>
                <p>Open MoneyWise → Invest, update your application and resubmit.</p>`;
            break;
        case 'SUSPENDED':
            subject = `Your ${target?.display_name} account was suspended`;
            body = `<h2 style="color:#002E3B">Account suspended</h2><p>Hi ${first}, your ${company} account has been suspended.</p>${note ? `<p>${escapeHtml(note)}</p>` : ''}<p>Please contact ${company} for help.</p>`;
            break;
        default:
            return;
    }
    await emailService.sendEmail({ to, subject, html: body });
}

// ── Payout settings (bank account for investor deposits) ─────────────────────

async function getPayoutSettings(orgId: string) {
    const { data, error } = await supabase
        .from('organizations')
        .select('email, payout_bank_code, payout_bank_name, payout_branch, payout_account_number, payout_account_name, forward_investor_deposits')
        .eq('id', orgId)
        .single();
    if (error || !data) throw new Error(error?.message || 'Organization not found');
    const target = await targetForOrg(orgId);
    return {
        isInvestmentCompany: !!target,
        bankName: data.payout_bank_name,
        branch: data.payout_branch,
        accountNumber: data.payout_account_number,
        accountName: data.payout_account_name,
        forwardDeposits: !!data.forward_investor_deposits,
        proofOfPaymentEmail: data.email,
    };
}

async function savePayoutSettings(params: {
    orgId: string; userId: string;
    bankName: string; branch?: string; accountNumber: string; accountName?: string; forwardDeposits: boolean;
}) {
    const bankName = clean(params.bankName, 100);
    const accountNumber = clean(params.accountNumber, 40).replace(/\s/g, '');
    if (!bankName || !accountNumber) throw new InvestorAccountError('VALIDATION', 'Bank name and account number are required.');
    if (!/^[0-9A-Za-z-]{4,34}$/.test(accountNumber)) throw new InvestorAccountError('VALIDATION', 'The account number is not valid.');

    const { data: org } = await supabase
        .from('organizations')
        .select('lenco_secret_key, payment_test_mode')
        .eq('id', params.orgId)
        .single();

    // Verify with the bank before saving: money is sent here automatically, so a typo
    // would otherwise only surface as a failed (or worse, misdirected) transfer.
    let resolvedName = clean(params.accountName, 150);
    let bankCode = bankName;
    if (!org?.payment_test_mode) {
        try {
            bankCode = await LencoService.findBankId(bankName, org?.lenco_secret_key || undefined);
            const resolved = await LencoService.resolveBankAccount(accountNumber, bankCode, org?.lenco_secret_key || undefined);
            if (resolved?.accountName) resolvedName = resolved.accountName;
        } catch (e: any) {
            throw new InvestorAccountError('ACCOUNT_NOT_VERIFIED', `The bank could not verify this account: ${e.message}. Check the bank and account number.`, 422);
        }
    }
    if (!resolvedName) throw new InvestorAccountError('VALIDATION', 'Enter the account name.');

    const { error } = await supabase
        .from('organizations')
        .update({
            payout_bank_name: bankName,
            payout_bank_code: bankCode,
            payout_branch: clean(params.branch, 100) || null,
            payout_account_number: accountNumber,
            payout_account_name: resolvedName,
            forward_investor_deposits: !!params.forwardDeposits,
        })
        .eq('id', params.orgId);
    if (error) throw new Error(`Could not save payout details: ${error.message}`);

    const automation = await syncForwardAutomation(params.orgId, params.userId);
    return { ...(await getPayoutSettings(params.orgId)), automation };
}

/**
 * Keeps ONE managed automation in step with the saved bank details. It is created the
 * first time forwarding is enabled and paused when it is turned off. `watch_from` is reset
 * on (re)enable, so turning it on never sweeps up money that arrived while it was off.
 */
async function syncForwardAutomation(orgId: string, userId: string): Promise<'active' | 'paused' | 'none'> {
    const { data: org } = await supabase
        .from('organizations')
        .select('name, email, payout_bank_code, payout_bank_name, payout_account_number, payout_account_name, forward_investor_deposits')
        .eq('id', orgId)
        .single();
    const target = await targetForOrg(orgId);

    const { data: existing } = await supabase
        .from('automations')
        .select('id, status')
        .eq('organization_id', orgId)
        .neq('status', 'ARCHIVED')
        .contains('trigger_config', { managed_by: MANAGED_AUTOMATION_KEY })
        .maybeSingle();

    const ready = !!(org && target && org.forward_investor_deposits && org.payout_account_number && org.payout_bank_code);

    if (!ready) {
        if (existing && existing.status === 'ACTIVE') {
            await supabase.from('automations').update({ status: 'PAUSED', updated_at: new Date().toISOString() }).eq('id', existing.id);
        }
        return existing ? 'paused' : 'none';
    }

    const actions: any[] = [{
        type: 'FORWARD_PAYMENT',
        recipient_account: org!.payout_account_number,
        recipient_bank_code: org!.payout_bank_code,
        recipient_bank_name: org!.payout_bank_name,
        recipient_name: org!.payout_account_name,
        payment_method: 'BANK_TRANSFER',
        fee_mode: 'AUTO',
    }];
    if (org!.email) actions.push({ type: 'SEND_POP_EMAIL', to: org!.email });

    const fields = {
        name: `Forward investor deposits to ${org!.payout_bank_name}`,
        description: `Every investor deposit into ${target!.display_name}'s wallet is forwarded to ${org!.payout_bank_name} ${org!.payout_account_number} and a Proof of Payment is emailed. Managed from Settings → Investor payouts.`,
        trigger_type: 'WALLET_DEPOSIT',
        trigger_config: { wallet_id: target!.wallet_id, managed_by: MANAGED_AUTOMATION_KEY },
        actions,
        status: 'ACTIVE',
        updated_at: new Date().toISOString(),
    };

    if (existing) {
        await supabase.from('automations').update({
            ...fields,
            ...(existing.status !== 'ACTIVE' ? { watch_from: new Date().toISOString() } : {}),
        }).eq('id', existing.id);
    } else {
        await supabase.from('automations').insert({
            ...fields,
            organization_id: orgId,
            created_by: userId,
            watch_from: new Date().toISOString(),
        });
    }
    return 'active';
}

export const investorAccountService = {
    myAccounts,
    connect,
    apply,
    assertCanInvest,
    listApplications,
    getApplication,
    review,
    getPayoutSettings,
    savePayoutSettings,
    targetForOrg,
};
