/**
 * Investor account application — the lists and rules shared by every client.
 *
 * The application a customer fills in to open an account with an investment
 * company. Kept in core so the phone and the web CRM agree on the fields, the
 * options offered and what "valid" means; the API re-validates everything
 * (apps/api/src/services/investorAccount.service.ts) and never trusts a client.
 */

export type IdType = 'NRC' | 'Passport' | "Driver's Licence";
export const ID_TYPES: IdType[] = ['NRC', 'Passport', "Driver's Licence"];

export const GENDERS: { value: 'MALE' | 'FEMALE' | 'OTHER'; label: string }[] = [
    { value: 'MALE', label: 'Male' },
    { value: 'FEMALE', label: 'Female' },
    { value: 'OTHER', label: 'Other' },
];

export const OCCUPATIONS = [
    'Accountant', 'Administrator', 'Agriculture / Farming', 'Banking & Finance', 'Business Owner', 'Civil Servant',
    'Construction', 'Consultant', 'Driver / Transport', 'Education / Teaching', 'Engineer', 'Health Care',
    'Hospitality', 'IT / Technology', 'Legal', 'Manager', 'Mining', 'Retail / Sales', 'Self-employed',
    'Student', 'Retired', 'Unemployed', 'Other',
];

export const RELATIONSHIPS = [
    'Spouse', 'Parent', 'Child', 'Sibling', 'Grandparent', 'Uncle / Aunt', 'Cousin', 'Friend', 'Guardian', 'Other',
];

export const ZAMBIA_BANK_NAMES = [
    'Absa Bank', 'Access Bank', 'Atlas Mara', 'Bank of China', 'CAVMONT Bank', 'Ecobank', 'FNB', 'First Capital Bank',
    'Indo-Zambia Bank', 'Investrust', 'Stanbic Bank', 'Standard Chartered', 'United Bank for Africa', 'ZANACO',
    'Zambia Industrial Commercial Bank',
];

/** Zambia first (the main market), then alphabetical. */
export const NATIONALITIES = [
    'Zambian',
    'American', 'Angolan', 'Australian', 'Botswanan', 'British', 'Burundian', 'Cameroonian', 'Canadian', 'Chinese',
    'Congolese (DRC)', 'Congolese (Republic)', 'Egyptian', 'Ethiopian', 'French', 'German', 'Ghanaian', 'Indian',
    'Irish', 'Italian', 'Kenyan', 'Malawian', 'Mozambican', 'Namibian', 'Nigerian', 'Pakistani', 'Rwandan',
    'South African', 'Tanzanian', 'Ugandan', 'Zimbabwean', 'Other',
];

export type NrcMethod = 'SEPARATE' | 'COMBINED';

export interface InvestorApplicant {
    first_name: string;
    middle_name: string;
    last_name: string;
    /** YYYY-MM-DD */
    date_of_birth: string;
    gender: '' | 'MALE' | 'FEMALE' | 'OTHER';
    nationality: string;
    email: string;
    phone: string;
    physical_address: string;
    id_type: string;
    id_number: string;
    employer: string;
    employee_number: string;
    source_of_income: string;
    occupation: string;
    bank_name: string;
    branch_name: string;
    bank_account_number: string;
    bank_account_name: string;
    sales_person: string;
    nok_full_name: string;
    nok_id_number: string;
    nok_date_of_birth: string;
    nok_phone: string;
    nok_relationship: string;
}

export const EMPTY_APPLICANT: InvestorApplicant = {
    first_name: '', middle_name: '', last_name: '', date_of_birth: '', gender: '', nationality: 'Zambian',
    email: '', phone: '', physical_address: '', id_type: '', id_number: '',
    employer: '', employee_number: '', source_of_income: '', occupation: '',
    bank_name: '', branch_name: '', bank_account_number: '', bank_account_name: '',
    sales_person: '', nok_full_name: '', nok_id_number: '', nok_date_of_birth: '', nok_phone: '', nok_relationship: '',
};

export type InvestorDocKey =
    | 'nrc_front' | 'nrc_back' | 'nrc_combined' | 'photo'
    | 'proof_of_residence' | 'reference_letter' | 'proof_of_income';

export interface InvestorDocuments {
    nrc_method: NrcMethod;
    nrc_front?: string;
    nrc_back?: string;
    nrc_combined?: string;
    photo?: string;
    proof_of_residence?: string;
    reference_letter?: string;
    proof_of_income?: string;
}

export const DOC_LIMITS = {
    /** PDFs are uploaded as-is. */
    pdfBytes: 10 * 1024 * 1024,
    /** Images are compressed on the phone to fit this before upload. */
    imageBytesAfterCompression: 5 * 1024 * 1024,
};

export type FieldErrors = Record<string, string>;

/** `YYYY-MM-DD` from the three DOB inputs, or '' when they are not a real date. */
export function toIsoDate(day: string, month: string, year: string): string {
    const d = parseInt(day, 10), m = parseInt(month, 10), y = parseInt(year, 10);
    if (!d || !m || !y || year.length !== 4) return '';
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function splitIsoDate(iso: string): { day: string; month: string; year: string } {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? { day: m[3], month: m[2], year: m[1] } : { day: '', month: '', year: '' };
}

export function ageFromIso(iso: string, today = new Date()): number {
    const d = new Date(iso);
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
}

const req = (v: string) => !!v && v.trim().length > 0;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ]{9,16}$/;

/** The wizard's steps, in order. Each lists the applicant fields it owns. */
export const APPLICATION_STEPS = [
    { id: 'personal', title: 'Personal details', subtitle: 'Tell us who you are' },
    { id: 'contact', title: 'Contact details', subtitle: 'How the company can reach you' },
    { id: 'identity', title: 'Identification', subtitle: 'Your official ID' },
    { id: 'employment', title: 'Employment & funds', subtitle: 'Where your money comes from' },
    { id: 'banking', title: 'Banking details', subtitle: 'Your bank account' },
    { id: 'kin', title: 'Sales & next of kin', subtitle: 'Who to contact on your behalf' },
    { id: 'documents', title: 'Documents', subtitle: 'Upload your supporting documents' },
    { id: 'review', title: 'Review & submit', subtitle: 'Check everything before sending' },
] as const;
export type ApplicationStepId = typeof APPLICATION_STEPS[number]['id'];

export function validateApplicantStep(step: ApplicationStepId, a: InvestorApplicant): FieldErrors {
    const e: FieldErrors = {};
    switch (step) {
        case 'personal':
            if (!req(a.first_name)) e.first_name = 'Enter your first name';
            if (!req(a.last_name)) e.last_name = 'Enter your last name';
            if (!a.date_of_birth) e.date_of_birth = 'Enter a valid date of birth';
            else if (ageFromIso(a.date_of_birth) < 18) e.date_of_birth = 'You must be at least 18';
            else if (ageFromIso(a.date_of_birth) > 120) e.date_of_birth = 'Check the year';
            if (!a.gender) e.gender = 'Select your gender';
            if (!req(a.nationality)) e.nationality = 'Select your nationality';
            break;
        case 'contact':
            if (!EMAIL_RE.test(a.email.trim())) e.email = 'Enter a valid email address';
            if (!PHONE_RE.test(a.phone.trim())) e.phone = 'Enter a valid phone number';
            if (!req(a.physical_address)) e.physical_address = 'Enter your physical address';
            break;
        case 'identity':
            if (!req(a.id_type)) e.id_type = 'Select an ID type';
            if (!req(a.id_number)) e.id_number = 'Enter your ID number';
            break;
        case 'employment':
            if (!req(a.source_of_income)) e.source_of_income = 'Enter your source of income';
            if (!req(a.occupation)) e.occupation = 'Select your occupation';
            break;
        case 'banking':
            if (!req(a.bank_name)) e.bank_name = 'Select your bank';
            if (!req(a.branch_name)) e.branch_name = 'Enter the branch name';
            if (!/^[0-9A-Za-z-]{4,34}$/.test(a.bank_account_number.trim())) e.bank_account_number = 'Enter a valid account number';
            if (!req(a.bank_account_name)) e.bank_account_name = 'Enter the account name';
            break;
        case 'kin':
            if (!req(a.nok_full_name)) e.nok_full_name = 'Enter their full name';
            if (!req(a.nok_id_number)) e.nok_id_number = 'Enter their ID / NRC / passport number';
            if (!a.nok_date_of_birth) e.nok_date_of_birth = 'Enter a valid date of birth';
            if (!PHONE_RE.test(a.nok_phone.trim())) e.nok_phone = 'Enter a valid contact number';
            if (!req(a.nok_relationship)) e.nok_relationship = 'Select the relationship';
            break;
        default:
            break;
    }
    return e;
}

export function validateDocumentsStep(d: InvestorDocuments): FieldErrors {
    const e: FieldErrors = {};
    if (d.nrc_method === 'COMBINED') {
        if (!d.nrc_combined) e.nrc_combined = 'Upload your NRC (front and back)';
    } else {
        if (!d.nrc_front) e.nrc_front = 'Upload the front of your NRC';
        if (!d.nrc_back) e.nrc_back = 'Upload the back of your NRC';
    }
    if (!d.photo) e.photo = 'Upload a passport-size photo';
    if (!d.proof_of_residence && !d.reference_letter) e.residence = 'Upload a proof of residence or a reference letter';
    if (!d.proof_of_income) e.proof_of_income = 'Upload your proof of income';
    return e;
}

export const INVESTOR_STATUS_LABEL: Record<string, string> = {
    PENDING_REVIEW: 'Under review',
    INFO_REQUESTED: 'More information needed',
    ACTIVE: 'Active',
    REJECTED: 'Not approved',
    SUSPENDED: 'Suspended',
};
