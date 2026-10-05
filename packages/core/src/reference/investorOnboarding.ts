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

/** Whether the ID needs both sides photographed (a passport is a single data page). */
export const idNeedsBack = (t: IdType | ''): boolean => t === 'NRC' || t === "Driver's Licence";

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

export const INCOME_SOURCES = [
    'Salary', 'Business income', 'Self-employment', 'Farming / Agriculture', 'Pension / Retirement',
    'Investments / Dividends', 'Rental income', 'Savings', 'Remittances / Gifts', 'Other',
];

/** Banks offered where a company enters its own payout account (Settings → Investor Payouts). */
export const ZAMBIA_BANK_NAMES = [
    'Absa Bank', 'Access Bank', 'Atlas Mara', 'Bank of China', 'CAVMONT Bank', 'Ecobank', 'FNB', 'First Capital Bank',
    'Indo-Zambia Bank', 'Investrust', 'Stanbic Bank', 'Standard Chartered', 'United Bank for Africa', 'ZANACO',
    'Zambia Industrial Commercial Bank',
];

export const RELATIONSHIPS = [
    'Spouse', 'Parent', 'Child', 'Sibling', 'Grandparent', 'Uncle / Aunt', 'Cousin', 'Friend', 'Guardian', 'Other',
];

/** Flag emoji from an ISO 3166-1 alpha-2 code. */
export const flagFromIso2 = (iso2: string): string =>
    String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)));

/** Nationality as people state it ("Zambian"), with the country's ISO code for its flag. Zambia first. */
export const NATIONALITIES: { value: string; iso2: string }[] = [
    { value: 'Zambian', iso2: 'ZM' },
    { value: 'American', iso2: 'US' }, { value: 'Angolan', iso2: 'AO' }, { value: 'Australian', iso2: 'AU' },
    { value: 'Botswanan', iso2: 'BW' }, { value: 'British', iso2: 'GB' }, { value: 'Burundian', iso2: 'BI' },
    { value: 'Cameroonian', iso2: 'CM' }, { value: 'Canadian', iso2: 'CA' }, { value: 'Chinese', iso2: 'CN' },
    { value: 'Congolese (DRC)', iso2: 'CD' }, { value: 'Congolese (Republic)', iso2: 'CG' }, { value: 'Egyptian', iso2: 'EG' },
    { value: 'Ethiopian', iso2: 'ET' }, { value: 'French', iso2: 'FR' }, { value: 'German', iso2: 'DE' },
    { value: 'Ghanaian', iso2: 'GH' }, { value: 'Indian', iso2: 'IN' }, { value: 'Irish', iso2: 'IE' },
    { value: 'Italian', iso2: 'IT' }, { value: 'Kenyan', iso2: 'KE' }, { value: 'Malawian', iso2: 'MW' },
    { value: 'Mozambican', iso2: 'MZ' }, { value: 'Namibian', iso2: 'NA' }, { value: 'Nigerian', iso2: 'NG' },
    { value: 'Pakistani', iso2: 'PK' }, { value: 'Rwandan', iso2: 'RW' }, { value: 'South African', iso2: 'ZA' },
    { value: 'Tanzanian', iso2: 'TZ' }, { value: 'Ugandan', iso2: 'UG' }, { value: 'Zimbabwean', iso2: 'ZW' },
    { value: 'Other', iso2: '' },
];

/** The flag for a stated nationality, or '' when unknown. */
export const nationalityFlag = (value: string): string => {
    const n = NATIONALITIES.find((x) => x.value.toLowerCase() === (value || '').trim().toLowerCase());
    return n?.iso2 ? flagFromIso2(n.iso2) : '';
};

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
    /** Set from the ID document the investor uploads — never typed. */
    id_type: string;
    /** Read from the ID by AI (and confirmable/editable by the investor). */
    id_number: string;
    source_of_income: string;
    occupation: string;
    bank_name: string;
    bank_account_number: string;
    /** Returned by the bank when the account is verified. */
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
    source_of_income: '', occupation: '',
    bank_name: '', bank_account_number: '', bank_account_name: '',
    sales_person: '', nok_full_name: '', nok_id_number: '', nok_date_of_birth: '', nok_phone: '', nok_relationship: '',
};

export type InvestorDocKey = 'id_front' | 'id_back' | 'photo' | 'proof_of_residence';

export interface InvestorDocuments {
    id_front?: string;
    id_back?: string;
    photo?: string;
    proof_of_residence?: string;
}

/** What the AI read off the ID. Every field is optional: a poor photo yields little. */
export interface IdExtraction {
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    /** YYYY-MM-DD */
    date_of_birth?: string;
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    nationality?: string;
    id_number?: string;
    /** 0..1 */
    confidence?: number;
    /** False when the image doesn't look like the chosen kind of ID. */
    looks_like_id?: boolean;
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

/**
 * The wizard's pages, in order. The ID goes first so the AI can read it and pre-fill the
 * personal details that follow; the photo and proof of residence each get a page of their own.
 */
export const APPLICATION_STEPS = [
    { id: 'id', title: 'Your ID', subtitle: 'Upload your ID and we’ll fill in your details' },
    { id: 'personal', title: 'Personal details', subtitle: 'Check what we read from your ID' },
    { id: 'contact', title: 'Contact details', subtitle: 'How the company can reach you' },
    { id: 'work', title: 'Occupation & income', subtitle: 'What you do and where your money comes from' },
    { id: 'banking', title: 'Bank account', subtitle: 'Where your returns are paid' },
    { id: 'kin', title: 'Sales & next of kin', subtitle: 'Who to contact on your behalf' },
    { id: 'photo', title: 'Passport-size photo', subtitle: 'A clear, recent photo of your face' },
    { id: 'residence', title: 'Proof of residence', subtitle: 'A utility bill or similar showing your address' },
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
            if (!req(a.id_number)) e.id_number = 'Enter the number on your ID';
            break;
        case 'contact':
            if (!EMAIL_RE.test(a.email.trim())) e.email = 'Enter a valid email address';
            if (!PHONE_RE.test(a.phone.trim())) e.phone = 'Enter a valid phone number';
            if (!req(a.physical_address)) e.physical_address = 'Enter your physical address';
            break;
        case 'work':
            if (!req(a.source_of_income)) e.source_of_income = 'Select your source of income';
            if (!req(a.occupation)) e.occupation = 'Select your occupation';
            break;
        case 'banking':
            if (!req(a.bank_name)) e.bank_name = 'Select your bank';
            if (!/^[0-9A-Za-z-]{4,34}$/.test(a.bank_account_number.trim())) e.bank_account_number = 'Enter a valid account number';
            else if (!req(a.bank_account_name)) e.bank_account_number = 'We couldn’t verify this account. Check the bank and number.';
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

/** The ID, photo and proof-of-residence pages each validate on their own. */
export function validateDocumentStep(step: 'id' | 'photo' | 'residence', idType: IdType | '', d: InvestorDocuments): FieldErrors {
    const e: FieldErrors = {};
    if (step === 'id') {
        if (!idType) e.id_type = 'Choose the kind of ID you’re uploading';
        if (!d.id_front) e.id_front = idType === 'Passport' ? 'Upload your passport photo page' : 'Upload the front of your ID';
        if (idNeedsBack(idType) && !d.id_back) e.id_back = 'Upload the back of your ID';
    } else if (step === 'photo') {
        if (!d.photo) e.photo = 'Upload a passport-size photo';
    } else if (!d.proof_of_residence) {
        e.proof_of_residence = 'Upload a proof of residence';
    }
    return e;
}

export const INVESTOR_STATUS_LABEL: Record<string, string> = {
    PENDING_REVIEW: 'Under review',
    INFO_REQUESTED: 'More information needed',
    ACTIVE: 'Active',
    REJECTED: 'Not approved',
    SUSPENDED: 'Suspended',
};
