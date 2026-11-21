/**
 * MoneyWise Personal onboarding (flow PERSONAL_V2): the ordered list of steps, in one place, so reordering or adding a
 * step is a change here and nowhere else. See docs/personal-onboarding-plan.md.
 *
 * Progress is stored per step key (onboarding_progress.steps), never by position, so changing the order never
 * breaks someone's saved progress.
 *
 * `built: false` steps are planned but not shipped yet: the wizard and the "Finish setting up" checklist skip them.
 * Flip to true as each milestone lands.
 *
 * The API keeps its own copy of the keys and required flags (apps/api/src/services/personalOnboarding/steps.ts);
 * `npm run test:onboarding` in apps/api fails if the two drift apart.
 */

export type PersonalStepKey =
    | 'name' | 'dob' | 'phone' | 'avatar' | 'intents'
    | 'accounts' | 'capture' | 'gmail' | 'assets' | 'net_worth'
    | 'bills' | 'grow' | 'reminders'
    | 'kyc' | 'wallet';

export type PersonalChapter = 'about' | 'money' | 'plan' | 'unlock';

export type PersonalStepState = 'done' | 'skipped';

export interface PersonalStepRecord {
    state: PersonalStepState;
    at: string;
}

export type PersonalStepsMap = Partial<Record<PersonalStepKey, PersonalStepRecord>>;

export interface PersonalStepDef {
    key: PersonalStepKey;
    chapter: PersonalChapter;
    /** Required steps show no Skip and must be done before onboarding can finish. */
    required: boolean;
    /** Shipped in the app. Unbuilt steps are left out of the wizard and the checklist. */
    built: boolean;
    title: string;
    /** Short line under the title. */
    subtitle: string;
    /** Shown in the (?) help sheet. */
    help: string;
    /** Label for the Home "Finish setting up" checklist. */
    checklistLabel: string;
}

export const PERSONAL_CHAPTERS: Record<PersonalChapter, string> = {
    about: 'About you',
    money: 'Your money',
    plan: 'Your plan',
    unlock: 'Unlock',
};

export const PERSONAL_STEPS: PersonalStepDef[] = [
    {
        key: 'name', chapter: 'about', required: true, built: true,
        title: 'What’s your name?',
        subtitle: 'As it appears on your NRC or passport.',
        help: 'We use your legal name to match your ID if you later verify your identity or activate your MoneyWise wallet. You can change how your name shows in Settings.',
        checklistLabel: 'Add your name',
    },
    {
        key: 'dob', chapter: 'about', required: true, built: true,
        title: 'Date of birth',
        subtitle: 'We need this to keep your account safe.',
        help: 'Your date of birth is checked against your ID when you verify your identity. The MoneyWise wallet needs you to be 18 or older; tracking your money does not.',
        checklistLabel: 'Add your date of birth',
    },
    {
        key: 'phone', chapter: 'about', required: false, built: true,
        title: 'Phone number',
        subtitle: 'We’ll send a one-time code on WhatsApp to confirm it.',
        help: 'Your number is a second way to secure your account. It also helps match mobile money messages to you and is where payment confirmations go. The code comes as a WhatsApp message.',
        checklistLabel: 'Verify your phone number',
    },
    {
        key: 'avatar', chapter: 'about', required: false, built: true,
        title: 'Your avatar',
        subtitle: 'Choose a picture for your account, or skip and keep your initials.',
        help: 'Your avatar shows on your account and to people you send money to.',
        checklistLabel: 'Add a profile picture',
    },
    {
        key: 'intents', chapter: 'about', required: false, built: true,
        title: 'What brings you here?',
        subtitle: 'Pick as many as you like.',
        help: 'This helps us show you the most useful things first. It changes nothing you can do.',
        checklistLabel: 'Tell us what you want to do',
    },
    {
        key: 'accounts', chapter: 'money', required: false, built: true,
        title: 'Where do you keep your money?',
        subtitle: 'Add your mobile money, bank and cash with today’s balance.',
        help: 'Each account you add starts at the balance you enter. From then on MoneyWise keeps it up to date from your transactions.',
        checklistLabel: 'Add your accounts',
    },
    {
        key: 'capture', chapter: 'money', required: false, built: true,
        title: 'Capture automatically',
        subtitle: 'Turn mobile money messages into transactions.',
        help: 'Only messages from MTN, Airtel and Zamtel are read. Nothing else leaves your phone.',
        checklistLabel: 'Turn on automatic capture',
    },
    {
        key: 'gmail', chapter: 'money', required: false, built: true,
        title: 'Connect Gmail',
        subtitle: 'Pick up bank alerts and receipts from email.',
        help: 'MoneyWise reads bank alerts, receipts and statements only. You can disconnect at any time.',
        checklistLabel: 'Connect Gmail',
    },
    {
        key: 'assets', chapter: 'money', required: false, built: true,
        title: 'Anything else you own or owe?',
        subtitle: 'Savings, investments, property, loans.',
        help: 'Adding these gives you your full net worth: what you own minus what you owe.',
        checklistLabel: 'Add investments and debts',
    },
    {
        key: 'net_worth', chapter: 'money', required: false, built: true,
        title: 'Your net worth',
        subtitle: 'This is your starting point.',
        help: 'Net worth is everything you own minus everything you owe.',
        checklistLabel: 'See your net worth',
    },
    {
        key: 'bills', chapter: 'plan', required: false, built: true,
        title: 'What do you pay regularly?',
        subtitle: 'We’ll remind you before each one is due.',
        help: 'On each due date MoneyWise reminds you and prepares a payment request for you to approve. Nothing is ever paid without you.',
        checklistLabel: 'Add your regular bills',
    },
    {
        key: 'grow', chapter: 'plan', required: false, built: true,
        title: 'Your Grow plan',
        subtitle: 'Set targets and see where your money goes.',
        help: 'Set what you plan to earn, spend, save and invest. Grow shows where that takes your net worth.',
        checklistLabel: 'Set up your Grow plan',
    },
    {
        key: 'reminders', chapter: 'plan', required: false, built: true,
        title: 'Reminders and app lock',
        subtitle: 'Stay on top of bills and keep your money private.',
        help: 'Notifications remind you about bills and money coming in. App lock asks for Face ID, fingerprint or a PIN.',
        checklistLabel: 'Turn on reminders and app lock',
    },
    {
        key: 'kyc', chapter: 'unlock', required: false, built: true,
        title: 'Verify your identity',
        subtitle: 'Needed for your MoneyWise wallet and loans.',
        help: 'Upload your NRC, passport or driver’s licence, a selfie and a proof of residence such as a recent bank statement.',
        checklistLabel: 'Verify your identity',
    },
    {
        key: 'wallet', chapter: 'unlock', required: false, built: true,
        title: 'Activate your MoneyWise wallet',
        subtitle: 'Receive, pay and save from one wallet.',
        help: 'Your MoneyWise wallet lets you receive money with a link, pay, and join group savings.',
        checklistLabel: 'Activate your MoneyWise wallet',
    },
];

export const PERSONAL_STEP_KEYS: PersonalStepKey[] = PERSONAL_STEPS.map((s) => s.key);

export const personalStepDef = (key: string): PersonalStepDef | undefined => PERSONAL_STEPS.find((s) => s.key === key);

/** The steps the wizard walks through, in order. */
export const builtPersonalSteps = (): PersonalStepDef[] => PERSONAL_STEPS.filter((s) => s.built);

/** First built step with no saved state, or null when every built step is done or skipped. */
export function firstOpenPersonalStep(steps: PersonalStepsMap): PersonalStepDef | null {
    return builtPersonalSteps().find((s) => !steps[s.key]) ?? null;
}

/** Every required step is done (skipping is not allowed for them). */
export function personalRequiredDone(steps: PersonalStepsMap): boolean {
    return PERSONAL_STEPS.filter((s) => s.required).every((s) => steps[s.key]?.state === 'done');
}

/** Built, optional steps not done yet (skipped or never reached): the Home "Finish setting up" checklist. */
export function personalChecklist(steps: PersonalStepsMap): { def: PersonalStepDef; done: boolean }[] {
    return builtPersonalSteps()
        .filter((s) => !s.required)
        .map((def) => ({ def, done: steps[def.key]?.state === 'done' }));
}

/** Progress through the wizard, 0–1, counting built steps only. */
export function personalProgress(currentKey: PersonalStepKey | null): number {
    const built = builtPersonalSteps();
    if (!currentKey) return 1;
    const i = built.findIndex((s) => s.key === currentKey);
    return i < 0 ? 0 : i / built.length;
}

/** Step "intents": what people come to MoneyWise for. Keys match the API whitelist. */
export const PERSONAL_INTENTS: { key: string; label: string }[] = [
    { key: 'track_spending', label: 'Track my spending' },
    { key: 'save', label: 'Save for something' },
    { key: 'pay_bills', label: 'Pay bills on time' },
    { key: 'grow_net_worth', label: 'Grow my net worth' },
    { key: 'family', label: 'Manage money with family' },
    { key: 'loan', label: 'Get a loan' },
];

/** Zambian mobile network from a number (second significant digit: 6 MTN, 7 Airtel, 5 Zamtel). */
export function zambianNetwork(raw: string): 'MTN' | 'AIRTEL' | 'ZAMTEL' | null {
    let d = raw.replace(/\D/g, '');
    if (d.startsWith('260')) d = d.slice(3); else if (d.startsWith('0')) d = d.slice(1);
    if (d.length < 2 || (d[0] !== '9' && d[0] !== '7')) return null;
    return ({ '6': 'MTN', '7': 'AIRTEL', '5': 'ZAMTEL' } as const)[d[1] as '6' | '7' | '5'] ?? null;
}

/** The 9 digits after +260, or null while incomplete/invalid. */
export function zambianMobileDigits(raw: string): string | null {
    let d = raw.replace(/\D/g, '');
    if (d.startsWith('260')) d = d.slice(3); else if (d.startsWith('0')) d = d.slice(1);
    return d.length === 9 && (d[0] === '9' || d[0] === '7') ? d : null;
}

// ── Bills (step "bills") ─────────────────────────────────────────────────────

export type BillCadence = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';
export type BillCategory = 'BILLS' | 'SUBSCRIPTIONS' | 'LOAN_REPAYMENTS' | 'GENERAL_EXPENSES' | 'INVESTMENTS';

export interface BillSuggestion { key: string; label: string; category: BillCategory; cadence: BillCadence; emoji: string }

/** Common regular payments in Zambia, in the order most people have them. "Every term" is quarterly. */
export const BILL_SUGGESTIONS: BillSuggestion[] = [
    { key: 'rent', label: 'Rent', category: 'BILLS', cadence: 'MONTHLY', emoji: '🏠' },
    { key: 'zesco', label: 'ZESCO electricity', category: 'BILLS', cadence: 'MONTHLY', emoji: '⚡' },
    { key: 'water', label: 'Water', category: 'BILLS', cadence: 'MONTHLY', emoji: '🚰' },
    { key: 'talktime', label: 'Talk time', category: 'BILLS', cadence: 'WEEKLY', emoji: '📞' },
    { key: 'data', label: 'Data bundles', category: 'BILLS', cadence: 'WEEKLY', emoji: '📶' },
    { key: 'dstv', label: 'DStv', category: 'SUBSCRIPTIONS', cadence: 'MONTHLY', emoji: '📺' },
    { key: 'gotv', label: 'GOtv', category: 'SUBSCRIPTIONS', cadence: 'MONTHLY', emoji: '📺' },
    { key: 'internet', label: 'Internet / Wi-Fi', category: 'BILLS', cadence: 'MONTHLY', emoji: '🌐' },
    { key: 'school_fees', label: 'School fees', category: 'BILLS', cadence: 'QUARTERLY', emoji: '🎒' },
    { key: 'transport', label: 'Transport', category: 'GENERAL_EXPENSES', cadence: 'WEEKLY', emoji: '🚌' },
    { key: 'groceries', label: 'Groceries', category: 'GENERAL_EXPENSES', cadence: 'WEEKLY', emoji: '🛒' },
    { key: 'tithe', label: 'Church / tithe', category: 'GENERAL_EXPENSES', cadence: 'MONTHLY', emoji: '⛪' },
    { key: 'insurance', label: 'Insurance', category: 'BILLS', cadence: 'MONTHLY', emoji: '🛡️' },
    { key: 'loan', label: 'Loan repayment', category: 'LOAN_REPAYMENTS', cadence: 'MONTHLY', emoji: '🏦' },
    { key: 'gym', label: 'Gym', category: 'SUBSCRIPTIONS', cadence: 'MONTHLY', emoji: '🏋️' },
    { key: 'netflix', label: 'Netflix', category: 'SUBSCRIPTIONS', cadence: 'MONTHLY', emoji: '🎬' },
    { key: 'showmax', label: 'Showmax', category: 'SUBSCRIPTIONS', cadence: 'MONTHLY', emoji: '🎬' },
    { key: 'family', label: 'Family support', category: 'GENERAL_EXPENSES', cadence: 'MONTHLY', emoji: '👨‍👩‍👧' },
];

export const BILL_CADENCE_LABEL: Record<BillCadence, string> = { WEEKLY: 'Weekly', BIWEEKLY: 'Every 2 weeks', MONTHLY: 'Monthly', QUARTERLY: 'Every term (3 months)' };

/** How much a bill costs in an average month. */
export function billMonthly(amount: number, cadence: BillCadence): number {
    const f = cadence === 'WEEKLY' ? 52 / 12 : cadence === 'BIWEEKLY' ? 26 / 12 : cadence === 'QUARTERLY' ? 1 / 3 : 1;
    return Math.round(amount * f * 100) / 100;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Next due date (YYYY-MM-DD, local calendar). Monthly/quarterly: the given day of the month, this month if still
 * ahead (today counts), else next; a day past the month's end lands on its last day. Weekly/bi-weekly: `weekday`
 * (0 = Sunday) on or after today, or today when none is given.
 */
export function nextBillDue(cadence: BillCadence, opts: { day?: number | null; weekday?: number | null }, today = new Date()): string {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (cadence === 'WEEKLY' || cadence === 'BIWEEKLY') {
        if (opts.weekday == null) return iso(t);
        const diff = (opts.weekday - t.getDay() + 7) % 7;
        return iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() + diff));
    }
    const day = Math.min(31, Math.max(1, opts.day ?? t.getDate()));
    const at = (y: number, m: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
    let d = at(t.getFullYear(), t.getMonth());
    if (d < t) d = at(t.getFullYear(), t.getMonth() + 1);
    return iso(d);
}
