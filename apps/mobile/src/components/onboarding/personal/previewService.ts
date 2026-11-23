import { PersonalStepError, type PersonalOnboardingState, type PersonalStepKey, type PersonalStepState, type PersonalAccount, type PersonalHolding } from 'core';

/**
 * Dev-only stand-in for personalOnboardingService, used by /personal-onboarding?preview=1 so the screens can be
 * walked in the simulator without a PERSONAL_V2 account on the server. Keeps state in memory for the session and
 * applies a few of the API's checks so error states can be seen. The phone code is always 123456.
 * Never used in a release build.
 */
let state: PersonalOnboardingState = {
    flow: 'PERSONAL_V2', status: 'IN_PROGRESS', completedAt: null, steps: {},
    profile: {
        firstName: 'chanda', lastName: '', dateOfBirth: null, avatarUrl: null, email: 'preview@example.com',
        phone: null, phoneNetwork: null, intents: [], providerPhotoUrl: null,
    },
};

const wait = (ms = 450) => new Promise((r) => setTimeout(r, ms));
const title = (s: string) => s.trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, c: string) => a + c.toUpperCase());
const mark = (key: PersonalStepKey, s: PersonalStepState) => {
    state.steps = { ...state.steps, [key]: { state: state.steps[key]?.state === 'done' && s === 'skipped' ? 'done' : s, at: new Date().toISOString() } };
    return { ...state.steps };
};
let pendingPhone: string | null = null;
let accounts: PersonalAccount[] = [];
let holdings: PersonalHolding[] = [];
let bills: any[] = [];
const PROVIDERS = [
    { code: 'MTN', name: 'MTN MoMo', type: 'MOBILE_MONEY' as const }, { code: 'AIRTEL', name: 'Airtel Money', type: 'MOBILE_MONEY' as const },
    { code: 'ZAMTEL', name: 'Zamtel Kwacha', type: 'MOBILE_MONEY' as const }, { code: 'ZANACO', name: 'Zanaco', type: 'BANK' as const },
    { code: 'FNB', name: 'FNB', type: 'BANK' as const }, { code: 'STANBIC', name: 'Stanbic Bank', type: 'BANK' as const },
    { code: 'ABSA', name: 'Absa Bank', type: 'BANK' as const }, { code: 'ACCESS', name: 'Access Bank', type: 'BANK' as const },
    { code: 'INDO_ZAMBIA', name: 'Indo Zambia Bank', type: 'BANK' as const }, { code: 'ECOBANK', name: 'Ecobank', type: 'BANK' as const },
    { code: 'FIRST_CAPITAL', name: 'First Capital Bank', type: 'BANK' as const }, { code: 'ZNBS', name: 'ZNBS', type: 'BANK' as const },
];
const r2 = (n: number) => Math.round(n * 100) / 100;
const ASSET_KINDS = ['savings', 'investments', 'pension', 'property', 'vehicle', 'business', 'owed_to_me'];
let sentAt = 0;

export const previewPersonalOnboardingService = {
    async getState(): Promise<PersonalOnboardingState> {
        await wait(300);
        return JSON.parse(JSON.stringify(state));
    },
    async saveStep(key: PersonalStepKey, s: PersonalStepState, data?: Record<string, any>) {
        await wait();
        let out: Record<string, unknown> | null = null;
        if (s === 'done' && key === 'name') {
            if (/\d/.test(String(data?.firstName))) throw new PersonalStepError('Use letters only', 'firstName', 400);
            out = { firstName: title(String(data?.firstName)), lastName: title(String(data?.lastName)) };
            state.profile = { ...state.profile, ...(out as any) };
        }
        if (s === 'done' && key === 'dob') {
            const iso = String(data?.dateOfBirth);
            if (new Date(iso).getTime() >= Date.now()) throw new PersonalStepError('Date of birth must be in the past', 'dateOfBirth', 400);
            state.profile.dateOfBirth = iso;
            out = { dateOfBirth: iso };
        }
        if (s === 'done' && key === 'intents') {
            state.profile.intents = (data?.intents as string[]) ?? [];
            out = { intents: state.profile.intents };
        }
        return { steps: mark(key, s), data: out };
    },
    async sendPhoneCode(phone: string) {
        await wait();
        const waitS = Math.ceil((sentAt + 30_000 - Date.now()) / 1000);
        if (pendingPhone === phone && waitS > 0) throw new PersonalStepError(`Wait ${waitS} seconds before asking for another code`, undefined, 429);
        pendingPhone = phone;
        sentAt = Date.now();
        return { sent: true, channel: 'whatsapp' as const, phone, network: null, resendInSeconds: 30 };
    },
    async verifyPhoneCode(code: string) {
        await wait();
        if (!pendingPhone) throw new PersonalStepError('Send a code first.', 'code', 400);
        if (code !== '123456') throw new PersonalStepError('That code isn’t right. 4 tries left.', 'code', 400);
        state.profile.phone = pendingPhone;
        pendingPhone = null;
        return { steps: mark('phone', 'done'), data: { phone: state.profile.phone!, network: null } };
    },
    async saveAvatar(body: any) {
        await wait(700);
        const avatarUrl = body.clear ? null : body.preset ?? (body.imageBase64 ? 'https://placehold.co/512x512/png' : state.profile.providerPhotoUrl ?? null);
        state.profile.avatarUrl = avatarUrl;
        return { steps: mark('avatar', 'done'), data: { avatarUrl } };
    },
    async getMoney() {
        await wait(250);
        const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));
        const by = (t: string) => sum(accounts.filter((a) => a.providerType === t).map((a) => a.balance));
        const own = holdings.filter((h) => h.type === 'ASSET'), owe = holdings.filter((h) => h.type === 'LIABILITY');
        const si = sum(own.filter((h) => ['savings', 'investments', 'pension', 'business'].includes(h.kind)).map((h) => h.value));
        const other = sum(own.filter((h) => !['savings', 'investments', 'pension', 'business'].includes(h.kind)).map((h) => h.value));
        const debts = sum(owe.map((h) => h.value));
        const breakdown = { mobileMoney: by('MOBILE_MONEY'), bank: by('BANK'), cash: by('CUSTOM'), savingsAndInvestments: si, otherAssets: other, debts };
        return { accounts: [...accounts], holdings: [...holdings], breakdown, total: r2(breakdown.mobileMoney + breakdown.bank + breakdown.cash + si + other - debts), providers: PROVIDERS };
    },
    async saveAccount(b: any) {
        await wait();
        const prov = PROVIDERS.find((p) => p.code === b.providerCode);
        const name = (b.nickname || '').trim() || prov?.name || (b.customName || '').trim() || 'Cash';
        const balance = Number(b.balance) || 0;
        if (accounts.some((a) => a.name.toLowerCase() === name.toLowerCase() && a.walletId !== b.walletId)) throw new PersonalStepError(`You already added “${name}”. Give this one a nickname, e.g. “${name} 2”.`, 'nickname', 409);
        const acc: PersonalAccount = { walletId: b.walletId ?? `w-${Date.now()}`, name, providerType: b.providerType, providerCode: prov?.code ?? null, openingBalance: balance, balance };
        accounts = b.walletId ? accounts.map((a) => (a.walletId === b.walletId ? acc : a)) : [...accounts, acc];
        return acc;
    },
    async deleteAccount(walletId: string) {
        await wait(300);
        accounts = accounts.filter((a) => a.walletId !== walletId);
        return { removed: true };
    },
    async saveHolding(b: any) {
        await wait();
        const value = Number(b.value) || 0;
        if (value <= 0) throw new PersonalStepError('Enter what it is worth', 'value', 400);
        const h: PersonalHolding = { accountId: b.accountId ?? `h-${Date.now()}`, kind: b.kind, name: b.name, type: ASSET_KINDS.includes(b.kind) ? 'ASSET' : 'LIABILITY', value, monthlyRepayment: b.monthlyRepayment ?? null, repaymentDay: b.repaymentDay ?? null };
        holdings = b.accountId ? holdings.map((x) => (x.accountId === b.accountId ? h : x)) : [...holdings, h];
        return h;
    },
    async deleteHolding(accountId: string) {
        await wait(300);
        holdings = holdings.filter((h) => h.accountId !== accountId);
        return { removed: true };
    },
    async listBills() { await wait(250); return [...bills]; },
    async saveBill(b: any) {
        await wait();
        const item = { id: b.id ?? `b-${Date.now()}`, title: b.title, amount: b.amount, category: b.category, cadence: b.cadence, next_due_date: b.nextDueDate, status: 'ACTIVE' };
        bills = b.id ? bills.map((x) => (x.id === b.id ? item : x)) : [...bills, item];
        return item;
    },
    async removeBill(id: string) { await wait(300); bills = bills.filter((b) => b.id !== id); },
    async getKyc() { await wait(250); return { exists: false, complete: false, missing: ['ID document', 'Selfie', 'Proof of residence'], applicant: null, idType: null, documents: {}, documentUrls: {}, updatedAt: null }; },
    async attachGmailStatement() { await wait(); return { path: 'preview/statement.pdf', filename: 'statement.pdf' }; },
    async walletStatus() { return { linked: false, poolAvailable: true, activation: { amount: 50, currency: 'ZMW' }, activated: false } as any; },
    async claimWallet() { return {}; },
    async checkWallet() { return { linked: true, activated: false }; },
    async gmailStatus() { return { configured: true, composio: true, connections: [] }; },
    async gmailConnectUrl() { return 'https://example.com'; },
    async gmailComposioComplete() { return { ok: true }; },
    async gmailFindings() { return { connected: true, providers: [], bills: [], statement: null }; },
    async complete() {
        await wait();
        state.status = 'COMPLETED';
        return { status: 'COMPLETED' as const, completedAt: new Date().toISOString() };
    },
};
