/**
 * personal.tools.ts — everything a MoneyWise personal account can do in the app, made available to the Assistant.
 *
 * Reads run freely. Every change goes through the usual approval card. Anything that moves real money out of the person's account
 * (sending money, investing) is additionally marked `strongAuth`, so the app asks for their PIN / Face ID before the approval is
 * sent. Where the app already has a handler for an action, the tool calls that handler (see internalCall.ts) instead of re-doing
 * the work, so the Assistant can only ever do what the app does, exactly the way the app does it.
 */
import { supabase } from '../../../lib/supabase';
import { AgentContext, ToolDefinition, ToolProposal } from '../types';
import { callHandler, errorOf } from '../internalCall';
import { cashbookService } from '../../cashbook.service';
import { LencoService } from '../../lenco.service';
import { savingsService } from '../../savings.service';
import { investorAccountService } from '../../investorAccount.service';
import { getPreferences, updatePreferences, orgIsPersonal, getEmployersForUser } from '../../userPreferences.service';
import { accountsOf } from '../../paymentInfo.service';
import { listExternalWallets } from '../../manualEntry.service';
import { getFrontendUrl } from '../../../utils/frontendUrl';
import { OrganizationController } from '../../../controllers/organization.controller';
import { createWallet, createExternalWallet } from '../../../controllers/cashbook.controller';
import { setBudget } from '../../../controllers/budget.controller';
import { getExpenditure } from '../../../controllers/report.controller';
import { createRequisition } from '../../../controllers/requisition.controller';
import { autoAuthorizeAndDisburse } from '../../../controllers/disbursement.controller';
import { listInvestmentTargets, walletTransferToInvestmentTarget } from '../../../controllers/invest.controller';

const kwacha = (n: number) => `K${Number(n).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const invalid = (m: string): never => { throw new Error(`INVALID_ARGUMENTS: ${m}`); };
const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const LENCO_MIN_TRANSFER = 5;
/** The item whose name is what the person said: an exact match first, then one name containing the other (never on a blank or 1–2 letter name). */
function byName<T>(list: T[], said: string, nameOf: (x: T) => string): T | undefined {
    const q = norm(said);
    if (!q) return undefined;
    return list.find((x) => norm(nameOf(x)) === q) ?? list.find((x) => {
        const n = norm(nameOf(x));
        return n.length >= 3 && (n.includes(q) || (q.length >= 3 && q.includes(n)));
    });
}
const ALL_ROLES: any[] = ['ADMIN', 'ACCOUNTANT', 'CASHIER', 'AUTHORISER', 'REQUESTOR'];
const MONEY_ROLES: any[] = ['ADMIN', 'ACCOUNTANT', 'CASHIER'];
/** Money leaving the account: only the account holder (the app's send/disburse endpoint is ADMIN-only too). */
const OWNER_ONLY: any[] = ['ADMIN'];

const proposal = (summary: string, preview: { label: string; value: string }[], opts: { warning?: string; strongAuth?: boolean } = {}): ToolProposal =>
    ({ __proposal: true, summary, preview, ...opts });

// ── Shared lookups ─────────────────────────────────────────────────────────────

interface Wallet { id: string; name: string; is_main: boolean; balance: number }

async function wallets(ctx: AgentContext): Promise<Wallet[]> {
    const { data } = await supabase.from('organization_wallets').select('id, name, is_main').eq('organization_id', ctx.organizationId);
    return Promise.all((data ?? []).map(async (w: any) => ({
        id: w.id, name: w.name, is_main: !!w.is_main,
        balance: round2(await cashbookService.getCurrentBalance(ctx.organizationId, 'MONEYWISE_WALLET', w.id)),
    })));
}

/** A wallet by what the person called it; the main wallet when they didn't say. */
async function pickWallet(ctx: AgentContext, said?: string, label = 'wallet'): Promise<Wallet> {
    const list = await wallets(ctx);
    if (list.length === 0) invalid('This account has no MoneyWise wallet yet.');
    if (!said || !said.trim()) return list.find((w) => w.is_main) ?? list[0];
    const q = norm(said);
    const hit = byName(list, said, (w) => w.name)
        ?? (['main', 'mainwallet', 'mywallet', 'wallet'].includes(q) ? list.find((w) => w.is_main) : undefined);
    if (!hit) invalid(`No ${label} called "${said}". Wallets: ${list.map((w) => `${w.name} (${kwacha(w.balance)})`).join(', ')}.`);
    return hit!;
}

async function orgKey(ctx: AgentContext): Promise<string | undefined> {
    const { data } = await supabase.from('organizations').select('lenco_secret_key').eq('id', ctx.organizationId).maybeSingle();
    return (data as any)?.lenco_secret_key || undefined;
}

const normalisePhone = (v: string) => {
    const d = String(v ?? '').replace(/[^0-9]/g, '');
    return d.startsWith('260') ? `0${d.slice(3)}` : d;
};
const operatorFor = (p: string): 'AIRTEL' | 'MTN' | 'ZAMTEL' | null =>
    /^0(97|77)/.test(p) ? 'AIRTEL' : /^0(96|76)/.test(p) ? 'MTN' : /^0(95|75)/.test(p) ? 'ZAMTEL' : null;

const thisMonth = (today: string) => {
    const [y, m] = today.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { start: `${y}-${String(m).padStart(2, '0')}-01`, end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
};

async function requirePersonal(ctx: AgentContext, what: string) {
    if (!(await orgIsPersonal(ctx.organizationId))) {
        invalid(`${what} from chat is available on personal accounts. In a business account this goes through a requisition and its approval — offer to draft one with create_requisition.`);
    }
}

// ── Reads ──────────────────────────────────────────────────────────────────────

const getWallets: ToolDefinition = {
    name: 'get_wallets',
    description: 'Every account and its balance: the MoneyWise wallets (main wallet and savings pots) and the external accounts the person tracks by hand (cash, other banks, mobile money).',
    effect: 'read',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: {} },
    handler: async (ctx) => {
        const [mw, ext] = await Promise.all([wallets(ctx), listExternalWallets(ctx.organizationId)]);
        const external = await Promise.all(ext.map(async (e) => ({
            name: e.name, kind: e.provider_type, provider: e.provider_name,
            balance: round2(await cashbookService.getCurrentBalance(ctx.organizationId, e.id)),
        })));
        return {
            moneywise_wallets: mw.map((w) => ({ name: w.name, main: w.is_main, balance: w.balance })),
            moneywise_total: round2(mw.reduce((s, w) => s + w.balance, 0)),
            external_accounts: external,
            note: 'MoneyWise wallet balances are real money held at Lenco. External account balances are what has been recorded by hand.',
        };
    },
};

const getPayLink: ToolDefinition = {
    name: 'get_pay_link',
    description: 'The person\'s own pay link and QR code, for receiving money — anyone can pay it with mobile money. Use for "how do I receive money", "show my QR", "send me my pay link".',
    effect: 'read',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: {} },
    handler: async (ctx) => {
        const r = await callHandler(OrganizationController.getOrCreateQuickLinkUsername, ctx);
        const username = r.body?.username;
        if (r.status >= 400 || !username) throw new Error(errorOf(r, 'Could not get the pay link'));
        const url = `${getFrontendUrl()}/pay/${username}`;
        return {
            __widget: true,
            widget: { type: 'qr', spec: { value: url, title: 'Your pay link', caption: 'Share this link or let someone scan it to pay you.' } },
            ack: `Showed the pay link ${url} as a QR code. Mention the link in one short line; don't repeat instructions the card already shows.`,
        };
    },
};

export const savingsInviteLink = (code: string) => `${getFrontendUrl()}/savings/join/${code}`;

export async function pots(ctx: AgentContext) {
    const o = await savingsService.list(ctx.organizationId, ctx.userId);
    return [...o.goals, ...o.wishlist, ...o.groups];
}

const listSavings: ToolDefinition = {
    name: 'list_savings',
    description: 'The person\'s savings pots (goals, wishlist items, group savings): how much is in each, the target and progress.',
    effect: 'read',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: {} },
    handler: async (ctx) => {
        return {
            pots: (await pots(ctx)).map((g) => ({
                name: g.name, kind: g.kind, balance: round2(g.balance), target: g.targetAmount, target_date: g.targetDate,
                progress_pct: g.progress != null ? Math.round(g.progress * 100) : null, mine: g.role === 'OWNER',
            })),
        };
    },
};

const getBudgetStatus: ToolDefinition = {
    name: 'get_budget_status',
    description: 'This month\'s budgets against actual spending, per category — what is left and what is over.',
    effect: 'read',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: {} },
    handler: async (ctx) => {
        const m = thisMonth(ctx.today);
        const [{ data: budgets }, spend] = await Promise.all([
            supabase.from('budgets').select('qb_account_id, qb_account_name, amount').eq('organization_id', ctx.organizationId).eq('period_type', 'MONTHLY').eq('start_date', m.start),
            callHandler(getExpenditure, { ...ctx, role: 'ADMIN' }, { query: { startDate: m.start, endDate: m.end, mode: 'EXPENSE' } }),
        ]);
        const spent = new Map<string, number>();
        for (const r of (Array.isArray(spend.body) ? spend.body : []) as any[]) {
            if (r.type === 'EXPENSE') spent.set(String(r.account_id), Number(r.total_amount) || 0);
        }
        const rows = (budgets ?? []).map((b: any) => {
            const used = round2(spent.get(String(b.qb_account_id)) ?? 0);
            return { category: b.qb_account_name, budget: Number(b.amount), spent: used, remaining: round2(Number(b.amount) - used), over: used > Number(b.amount) };
        });
        return { month: m.start.slice(0, 7), budgets: rows, note: rows.length ? undefined : 'No budgets set for this month — offer set_budgets.' };
    },
};

const listInvestments: ToolDefinition = {
    name: 'list_investments',
    description: 'Investment companies available, the person\'s account status with each (none / pending / active), and what they have invested.',
    effect: 'read',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: {} },
    handler: async (ctx) => {
        const [targets, accounts, { data: invested }] = await Promise.all([
            callHandler(listInvestmentTargets, ctx),
            investorAccountService.myAccounts(ctx.organizationId),
            supabase.from('investments').select('investment_target_id, amount_paid, status').eq('investor_organization_id', ctx.organizationId),
        ]);
        const byTarget = new Map((accounts as any[] ?? []).map((a: any) => [a.investment_target_id ?? a.targetId, a]));
        return {
            companies: (Array.isArray(targets.body) ? targets.body : []).map((t: any) => {
                const acct: any = byTarget.get(t.id);
                const total = (invested ?? []).filter((i: any) => i.investment_target_id === t.id && i.status !== 'FAILED').reduce((s: number, i: any) => s + Number(i.amount_paid || 0), 0);
                return { name: targetName(t), account: acct ? acct.status : 'NONE', account_number: acct?.account_number ?? null, invested: round2(total) };
            }),
            note: 'Investing needs an ACTIVE account with the company; opening one is done in Invest in the app (the KYC profile makes it one tap).',
        };
    },
};

const findRecipient: ToolDefinition = {
    name: 'find_recipient',
    description: 'Look up and verify who would receive a payment before sending: a MoneyWise user (username, email, phone or MW-ID), a mobile-money number, or a bank account (needs the bank name). Returns the verified account name.',
    effect: 'read',
    allowedRoles: ALL_ROLES,
    parameters: {
        type: 'object',
        properties: {
            type: { type: 'string', enum: ['moneywise', 'mobile_money', 'bank'] },
            identifier: { type: 'string', description: 'Username / email / phone / MW-ID, mobile number, or bank account number.' },
            bankName: { type: 'string', description: 'For bank: the bank, e.g. "Zanaco", "FNB".' },
        },
        required: ['type', 'identifier'],
    },
    handler: async (ctx, args) => resolveRecipient(ctx, args.type, args.identifier, args.bankName),
};

/** `account` / `bankCode` are exactly what the app's Send Money screen puts on the requisition (operator upper-case, bank id). */
interface Recipient { type: 'moneywise' | 'mobile_money' | 'bank'; name: string; account: string; bankCode: string; orgId?: string; detail: string }

async function resolveRecipient(ctx: AgentContext, type: string, identifier: string, bankName?: string): Promise<Recipient> {
    const id = String(identifier ?? '').trim();
    if (!id) invalid('Who is it going to? Give a username/email/phone (MoneyWise), a mobile number, or a bank account number.');
    if (type === 'moneywise') {
        const { searchRecipients } = await import('../../../controllers/user.controller');
        const r = await callHandler(searchRecipients, ctx, { query: { q: id } });
        const list: any[] = (Array.isArray(r.body) ? r.body : []).filter((x) => x.organization_id && x.organization_id !== ctx.organizationId && x.lenco_subaccount_id);
        const q = norm(id.replace(/^@/, ''));
        const exact = list.filter((x) => [x.username, x.email, x.phone, x.moneywise_id].some((v) => v && norm(v) === q));
        const pick = exact.length === 1 ? exact[0] : list.length === 1 ? list[0] : null;
        if (!pick) {
            if (list.length === 0) invalid(`No MoneyWise account matches "${id}" that can receive payments. Check the username, email or phone with the user.`);
            invalid(`Several MoneyWise accounts match "${id}": ${list.slice(0, 6).map((x) => `${x.name} (@${x.username ?? x.email ?? x.moneywise_id})`).join(', ')}. Ask which one.`);
        }
        return { type: 'moneywise', name: pick.name, account: pick.id, bankCode: 'moneywise', orgId: pick.organization_id, detail: `@${pick.username ?? pick.email ?? pick.moneywise_id}` };
    }
    const key = await orgKey(ctx);
    if (type === 'mobile_money') {
        const phone = normalisePhone(id);
        const op = operatorFor(phone);
        if (phone.length !== 10 || !op) invalid(`"${id}" isn't a Zambian mobile-money number (097/077 Airtel, 096/076 MTN, 095/075 Zamtel).`);
        const res: any = await LencoService.resolveMobileMoney(phone, op!, key).catch((e: any) => invalid(`Couldn't verify ${phone}: ${e.message}`));
        const name = res?.accountName || res?.account_name || res?.name;
        if (!name) invalid(`Couldn't verify the name on ${phone}. Check the number with the user.`);
        return { type: 'mobile_money', name, account: phone, bankCode: op!, detail: `${op} ${phone}` };
    }
    if (type === 'bank') {
        if (!bankName) invalid('Which bank is the account with?');
        const banks: any[] = (await LencoService.getBanks().catch(() => [])) as any[];
        const list = Array.isArray(banks) ? banks : ((banks as any)?.data ?? []);
        const bank: any = byName(list, bankName!, (b: any) => b.name);
        if (!bank) invalid(`Unknown bank "${bankName}". Banks include: ${list.slice(0, 12).map((b: any) => b.name).join(', ')}.`);
        const res: any = await LencoService.resolveBankAccount(id, bank.id, key).catch((e: any) => invalid(`Couldn't verify account ${id} at ${bank.name}: ${e.message}`));
        const name = res?.accountName || res?.account_name || res?.name;
        if (!name) invalid(`Couldn't verify account ${id} at ${bank.name}. Check the details with the user.`);
        return { type: 'bank', name, account: id, bankCode: String(bank.id), detail: `${bank.name} · ${id}` };
    }
    return invalid('type must be moneywise, mobile_money or bank.');
}

const getMySettings: ToolDefinition = {
    name: 'get_my_settings',
    description: 'The person\'s own settings: notification channel, AI model choices, where their salary is paid, their saved payout accounts (masked), KYC profile completeness and the employers they can request salary advances from.',
    effect: 'read',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: {} },
    handler: async (ctx) => {
        const [prefs, { data: u }, kyc, employers] = await Promise.all([
            getPreferences(ctx.userId),
            supabase.from('users').select('name, email, payment_info').eq('id', ctx.userId).maybeSingle(),
            investorAccountService.getKycProfile(ctx.userId).catch(() => null),
            getEmployersForUser(ctx.userId).catch(() => []),
        ]);
        const { banks, momos } = accountsOf((u as any)?.payment_info);
        const mask = (s: string) => `${'•'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
        return {
            notifications: prefs.notifications.channel,
            ai: prefs.ai,
            salary_destination: prefs.payroll,
            payout_accounts: [
                ...banks.map((b) => ({ kind: 'BANK', name: `${b.bank_name} ${mask(b.account_number)}`, primary: b.is_default })),
                ...momos.map((m) => ({ kind: 'MOBILE_MONEY', name: `${m.provider} ${m.number}`, primary: m.is_default })),
            ],
            kyc_profile: kyc ? { exists: kyc.exists, complete: kyc.complete, missing: kyc.missing } : null,
            employers: employers.map((e) => e.name),
            security: 'The app PIN and Face ID are set on the phone itself (Settings → Security). They are never changed from chat.',
        };
    },
};

// ── Changes (no money moves) ───────────────────────────────────────────────────

const createWalletTool: ToolDefinition = {
    name: 'create_wallet',
    description: 'Create a new MoneyWise sub-wallet (e.g. "Rent", "Emergency fund") to set money aside in. For savings with a target, prefer create_savings_pot.',
    effect: 'write',
    allowedRoles: MONEY_ROLES,
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async (ctx, args) => {
        const name = String(args.name ?? '').trim();
        if (name.length < 2) invalid('Give the wallet a name.');
        if ((await wallets(ctx)).some((w) => norm(w.name) === norm(name))) invalid(`There is already a wallet called "${name}".`);
        return proposal(`Create a wallet: ${name}`, [{ label: 'Name', value: name }, { label: 'Starts with', value: kwacha(0) }]);
    },
    execute: async (ctx, args) => {
        const r = await callHandler(createWallet, ctx, { body: { name: String(args.name).trim() } });
        if (r.status >= 400) throw new Error(errorOf(r, 'Could not create the wallet'));
        return { created: true, wallet: { name: r.body?.name ?? args.name } };
    },
};

const createExternalAccount: ToolDefinition = {
    name: 'create_external_account',
    description: 'Add an account that lives outside MoneyWise (cash, another bank, a mobile-money number) so its spending can be tracked by hand with record_manual_transactions.',
    effect: 'write',
    allowedRoles: MONEY_ROLES,
    parameters: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'e.g. "FNB Cheque", "Airtel Money", "Cash".' },
            kind: { type: 'string', enum: ['BANK', 'MOBILE_MONEY', 'CUSTOM'], description: 'CUSTOM for cash or anything else.' },
            provider: { type: 'string', description: 'The bank or mobile-money provider, if any.' },
        },
        required: ['name', 'kind'],
    },
    handler: async (ctx, args) => {
        const name = String(args.name ?? '').trim();
        if (name.length < 2) invalid('Give the account a name.');
        if ((await listExternalWallets(ctx.organizationId)).some((w) => norm(w.name) === norm(name))) invalid(`There is already an external account called "${name}".`);
        return proposal(`Add external account: ${name}`, [
            { label: 'Name', value: name }, { label: 'Type', value: String(args.kind) }, ...(args.provider ? [{ label: 'Provider', value: String(args.provider) }] : []),
        ]);
    },
    execute: async (ctx, args) => {
        const r = await callHandler(createExternalWallet, ctx, { body: { name: String(args.name).trim(), providerType: args.kind, providerName: args.provider } });
        if (r.status >= 400) throw new Error(errorOf(r, 'Could not add the account'));
        return { created: true, account: { name: r.body?.name ?? args.name } };
    },
};

const setBudgets: ToolDefinition = {
    name: 'set_budgets',
    description: 'Set this month\'s spending budget for one or more expense categories, e.g. "budget K1,500 for groceries". One call for several categories. Use list_accounts for category codes.',
    effect: 'write',
    allowedRoles: ALL_ROLES,
    parameters: {
        type: 'object',
        properties: {
            budgets: {
                type: 'array',
                items: { type: 'object', properties: { categoryCode: { type: 'string' }, amount: { type: 'number' } }, required: ['categoryCode', 'amount'] },
            },
        },
        required: ['budgets'],
    },
    handler: async (ctx, args) => {
        const rows = await resolveBudgets(ctx, args.budgets);
        return proposal(`Set ${rows.length} monthly budget${rows.length === 1 ? '' : 's'}`, rows.map((r) => ({ label: r.name, value: `${kwacha(r.amount)} / month` })));
    },
    execute: async (ctx, args) => {
        const rows = await resolveBudgets(ctx, args.budgets);
        const m = thisMonth(ctx.today);
        for (const r of rows) {
            const res = await callHandler(setBudget, ctx, { body: { qb_account_id: r.id, qb_account_name: r.name, amount: r.amount, period_type: 'MONTHLY', start_date: m.start, end_date: m.end } });
            if (res.status >= 400) throw new Error(errorOf(res, `Could not set the budget for ${r.name}`));
        }
        return { set: rows.map((r) => ({ category: r.name, amount: r.amount })), month: m.start.slice(0, 7) };
    },
};

async function resolveBudgets(ctx: AgentContext, list: any[]) {
    if (!Array.isArray(list) || list.length === 0) invalid('Which categories, and how much each?');
    const { data: accounts } = await supabase.from('accounts').select('id, code, name').eq('organization_id', ctx.organizationId).eq('type', 'EXPENSE').eq('is_active', true);
    return list.map((b, i) => {
        const a = (accounts ?? []).find((x: any) => String(x.code).toLowerCase() === String(b.categoryCode).toLowerCase());
        if (!a) return invalid(`#${i + 1}: "${b.categoryCode}" is not an expense category. Use list_accounts.`);
        const amount = round2(b.amount);
        if (!Number.isFinite(amount) || amount <= 0) invalid(`#${i + 1}: the budget must be more than zero.`);
        return { id: a.id, name: a.name, amount };
    });
}

const updateMyPreferences: ToolDefinition = {
    name: 'update_my_preferences',
    description: 'Change the person\'s own preferences: where notifications arrive (BOTH, APP or EMAIL), the Assistant / categorisation AI model, and where their salary is paid (PERSONAL_WALLET, or BANK / MOBILE_MONEY with one of their saved payout accounts). Read get_my_settings first.',
    effect: 'write',
    allowedRoles: ALL_ROLES,
    parameters: {
        type: 'object',
        properties: {
            notificationChannel: { type: 'string', enum: ['BOTH', 'APP', 'EMAIL'] },
            assistantModel: { type: 'string', description: 'A model id, or "default".' },
            categorizationModel: { type: 'string', description: 'A model id, or "default".' },
            salaryDestination: { type: 'string', enum: ['PERSONAL_WALLET', 'BANK', 'MOBILE_MONEY'] },
            salaryAccountId: { type: 'string', description: 'For BANK / MOBILE_MONEY: which saved account (omit to use the details the employer has on file).' },
        },
    },
    handler: async (ctx, args) => {
        const patch = toPatch(args);
        if (Object.keys(patch).length === 0) invalid('Nothing to change.');
        const preview: { label: string; value: string }[] = [];
        if (patch.notifications) preview.push({ label: 'Notifications', value: { BOTH: 'App and email', APP: 'App only', EMAIL: 'Email only' }[patch.notifications.channel as 'BOTH'] });
        if (patch.ai?.assistant_model !== undefined) preview.push({ label: 'Assistant model', value: patch.ai.assistant_model ?? 'Automatic' });
        if (patch.ai?.categorization_model !== undefined) preview.push({ label: 'Categorisation model', value: patch.ai.categorization_model ?? 'Automatic' });
        if (patch.payroll) preview.push({ label: 'Salary paid into', value: patch.payroll.destination === 'PERSONAL_WALLET' ? 'MoneyWise personal account' : `${patch.payroll.destination}${patch.payroll.account_id ? ' (chosen account)' : ' (employer\'s details)'}` });
        return proposal('Update your preferences', preview);
    },
    execute: async (ctx, args) => ({ preferences: await updatePreferences(ctx.userId, toPatch(args)) }),
};

function toPatch(args: any) {
    const patch: any = {};
    if (args.notificationChannel) patch.notifications = { channel: args.notificationChannel };
    const model = (v: any) => (v === undefined ? undefined : (v === 'default' || v === null ? null : String(v)));
    if (args.assistantModel !== undefined || args.categorizationModel !== undefined) {
        patch.ai = {};
        if (args.assistantModel !== undefined) patch.ai.assistant_model = model(args.assistantModel);
        if (args.categorizationModel !== undefined) patch.ai.categorization_model = model(args.categorizationModel);
    }
    if (args.salaryDestination) patch.payroll = { destination: args.salaryDestination, account_id: args.salaryDestination === 'PERSONAL_WALLET' ? null : (args.salaryAccountId ?? null) };
    return patch;
}

const createSavingsPot: ToolDefinition = {
    name: 'create_savings_pot',
    description: 'Start a savings pot: a GOAL (an amount by a date, e.g. "save K5,000 for a laptop by December"), a WISHLIST item, or GROUP savings that other people join and contribute to (e.g. a chilimba or a shared trip). WISHLIST and GROUP need a target amount. After a GROUP is created, offer get_group_invite or add_group_member.',
    effect: 'write',
    allowedRoles: ALL_ROLES,
    parameters: {
        type: 'object',
        properties: {
            kind: { type: 'string', enum: ['GOAL', 'WISHLIST', 'GROUP'] },
            name: { type: 'string' },
            targetAmount: { type: 'number' },
            targetDate: { type: 'string', description: 'YYYY-MM-DD (optional, must be in the future).' },
            frequency: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY'], description: 'Optional: how often people put money in.' },
        },
        required: ['kind', 'name'],
    },
    handler: async (ctx, args) => {
        const name = String(args.name ?? '').trim();
        if (name.length < 2) invalid('Name the pot.');
        if (args.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(args.targetDate)) invalid('targetDate must be YYYY-MM-DD.');
        if (args.targetDate && args.targetDate <= ctx.today) invalid('The goal date must be in the future.');
        if ((args.kind === 'WISHLIST' || args.kind === 'GROUP') && !(Number(args.targetAmount) > 0)) invalid('How much do they need to save in total?');
        const what = args.kind === 'WISHLIST' ? 'wishlist item' : args.kind === 'GROUP' ? 'group savings' : 'goal';
        return proposal(`Create ${args.kind === 'GROUP' ? '' : 'a savings '}${what}: ${name}`, [
            { label: 'Name', value: name },
            ...(args.targetAmount ? [{ label: 'Target', value: kwacha(args.targetAmount) }] : []),
            ...(args.targetDate ? [{ label: 'By', value: args.targetDate }] : []),
            ...(args.frequency ? [{ label: 'Contributions', value: String(args.frequency).toLowerCase() }] : []),
            ...(args.kind === 'GROUP' ? [{ label: 'Members', value: 'Join with an invite link; pay in by mobile money or wallet' }] : []),
        ]);
    },
    execute: async (ctx, args) => {
        const pot: any = await savingsService.create({
            orgId: ctx.organizationId, userId: ctx.userId, kind: args.kind, name: String(args.name).trim(), targetAmount: args.targetAmount, targetDate: args.targetDate, frequency: args.frequency,
        });
        return { created: true, pot: { name: pot?.name ?? args.name, kind: args.kind, invite_link: pot?.inviteCode ? savingsInviteLink(pot.inviteCode) : undefined } };
    },
};

// ── Money ──────────────────────────────────────────────────────────────────────

export async function findPot(ctx: AgentContext, said: string) {
    const items = await pots(ctx);
    const hit = byName(items, said, (g) => g.name);
    if (!hit) return invalid(`No savings pot called "${said}". Pots: ${items.map((g) => g.name).join(', ') || 'none yet'}.`);
    return hit;
}

const transferBetweenWallets: ToolDefinition = {
    name: 'transfer_between_wallets',
    description: 'Move money between the person\'s own MoneyWise wallets (e.g. main wallet → "Rent"). Nothing leaves their account.',
    effect: 'write',
    allowedRoles: MONEY_ROLES,
    parameters: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' }, amount: { type: 'number' }, note: { type: 'string' } },
        required: ['to', 'amount'],
    },
    handler: async (ctx, args) => {
        const { from, to, amount } = await planTransfer(ctx, args);
        return proposal(`Move ${kwacha(amount)} from ${from.name} to ${to.name}`, [
            { label: 'From', value: `${from.name} (${kwacha(from.balance)})` }, { label: 'To', value: to.name }, { label: 'Amount', value: kwacha(amount) },
        ]);
    },
    execute: async (ctx, args) => {
        const { from, to, amount } = await planTransfer(ctx, args);
        const { transferSubwalletFunds } = await import('../../../controllers/cashbook.controller');
        const r = await callHandler(transferSubwalletFunds, ctx, { body: { sourceWalletId: from.id, destinationWalletId: to.id, amount, description: args.note || undefined } });
        if (r.status >= 400) throw new Error(errorOf(r, 'The transfer failed'));
        return { moved: amount, from: from.name, to: to.name };
    },
};

async function planTransfer(ctx: AgentContext, args: any) {
    const amount = round2(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) invalid('The amount must be more than zero.');
    const from = await pickWallet(ctx, args.from, 'wallet to move from');
    const to = await pickWallet(ctx, args.to, 'wallet to move to');
    if (from.id === to.id) invalid('Choose two different wallets.');
    if (from.balance + 0.005 < amount) invalid(`${from.name} only has ${kwacha(from.balance)}.`);
    return { from, to, amount };
}

const addToSavings: ToolDefinition = {
    name: 'add_to_savings',
    description: 'Put money into one of the person\'s savings pots from a MoneyWise wallet (main wallet by default).',
    effect: 'write',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: { pot: { type: 'string' }, amount: { type: 'number' }, fromWallet: { type: 'string' } }, required: ['pot', 'amount'] },
    handler: async (ctx, args) => {
        const { pot, from, amount } = await planSave(ctx, args);
        return proposal(`Save ${kwacha(amount)} into ${pot.name}`, [
            { label: 'Into', value: pot.name }, { label: 'From', value: `${from.name} (${kwacha(from.balance)})` }, { label: 'Amount', value: kwacha(amount) },
        ], { strongAuth: pot.kind === 'GROUP' && pot.role !== 'OWNER' });
    },
    execute: async (ctx, args) => {
        const { pot, from, amount } = await planSave(ctx, args);
        const r: any = pot.kind === 'GROUP'
            ? await savingsService.memberWalletDeposit({ goalId: pot.id, orgId: ctx.organizationId, userId: ctx.userId, amount, sourceWalletId: from.id })
            : await savingsService.deposit({ goalId: pot.id, orgId: ctx.organizationId, userId: ctx.userId, amount, sourceWalletId: from.id });
        return { saved: amount, pot: pot.name, status: r?.status ?? 'done' };
    },
};

async function planSave(ctx: AgentContext, args: any) {
    const amount = round2(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) invalid('The amount must be more than zero.');
    const pot = await findPot(ctx, args.pot);
    const from = await pickWallet(ctx, args.fromWallet, 'wallet to save from');
    if (pot.walletId && pot.walletId === from.id) invalid('Pick a different wallet to save from.');
    if (from.balance + 0.005 < amount) invalid(`${from.name} only has ${kwacha(from.balance)}.`);
    return { pot, from, amount };
}

const withdrawFromSavings: ToolDefinition = {
    name: 'withdraw_from_savings',
    description: 'Take money out of one of the person\'s savings pots back into a MoneyWise wallet (main wallet by default).',
    effect: 'write',
    allowedRoles: ALL_ROLES,
    parameters: { type: 'object', properties: { pot: { type: 'string' }, amount: { type: 'number' }, toWallet: { type: 'string' } }, required: ['pot', 'amount'] },
    handler: async (ctx, args) => {
        const amount = round2(args.amount);
        if (!Number.isFinite(amount) || amount <= 0) invalid('The amount must be more than zero.');
        const pot = await findPot(ctx, args.pot);
        const to = await pickWallet(ctx, args.toWallet, 'wallet to withdraw into');
        if (Number(pot.balance ?? 0) + 0.005 < amount) invalid(`${pot.name} only has ${kwacha(pot.balance ?? 0)}.`);
        return proposal(`Withdraw ${kwacha(amount)} from ${pot.name}`, [{ label: 'From', value: pot.name }, { label: 'Into', value: to.name }, { label: 'Amount', value: kwacha(amount) }]);
    },
    execute: async (ctx, args) => {
        const pot = await findPot(ctx, args.pot);
        const to = await pickWallet(ctx, args.toWallet, 'wallet to withdraw into');
        await savingsService.withdraw({ goalId: pot.id, orgId: ctx.organizationId, userId: ctx.userId, amount: round2(args.amount), destinationWalletId: to.id });
        return { withdrawn: round2(args.amount), pot: pot.name, into: to.name };
    },
};

const sendMoney: ToolDefinition = {
    name: 'send_money',
    description:
        'Send money from the person\'s MoneyWise wallet to someone: another MoneyWise user (free, instant), a mobile-money number, or a bank account. ' +
        'The recipient is verified by name before the card is shown, and the person confirms with their PIN / Face ID. Personal accounts only. ' +
        'Ask for the reason if they gave none (it is how the payment is categorised).',
    effect: 'write',
    allowedRoles: OWNER_ONLY,
    parameters: {
        type: 'object',
        properties: {
            recipientType: { type: 'string', enum: ['moneywise', 'mobile_money', 'bank'] },
            recipient: { type: 'string', description: 'Username / email / phone / MW-ID, mobile number, or bank account number.' },
            bankName: { type: 'string', description: 'For bank transfers.' },
            amount: { type: 'number' },
            reason: { type: 'string', description: 'What it is for, e.g. "Rent for November".' },
            fromWallet: { type: 'string', description: 'Defaults to the main wallet.' },
        },
        required: ['recipientType', 'recipient', 'amount', 'reason'],
    },
    handler: async (ctx, args) => {
        const plan = await planSend(ctx, args);
        return proposal(`Send ${kwacha(plan.amount)} to ${plan.recipient.name}`, [
            { label: 'To', value: plan.recipient.name },
            { label: 'Account', value: plan.recipient.detail },
            { label: 'Amount', value: kwacha(plan.amount) },
            { label: 'Fee', value: plan.fee ? kwacha(plan.fee) : 'Free' },
            { label: 'From', value: `${plan.wallet.name} (${kwacha(plan.wallet.balance)})` },
            { label: 'For', value: plan.reason },
        ], { strongAuth: true, warning: 'This sends real money. Check the name — payments can\'t be reversed.' });
    },
    execute: async (ctx, args) => {
        const plan = await planSend(ctx, args);
        const r = plan.recipient;
        const created = await callHandler(createRequisition, ctx, { body: {
            description: plan.reason, estimated_total: plan.amount,
            payment_method: r.type === 'moneywise' ? 'MONEYWISE_PAY' : r.type === 'mobile_money' ? r.bankCode : 'BANK',
            recipient_account: r.account, recipient_bank_code: r.type === 'moneywise' ? 'MONEYWISE' : r.bankCode, recipient_name: r.name,
            recipient_organization_id: r.orgId,
        } });
        if (created.status >= 400 || !created.body?.id) throw new Error(errorOf(created, 'Could not prepare the payment'));
        const sent = await callHandler(autoAuthorizeAndDisburse, ctx, { params: { id: created.body.id }, body: {
            payment_method: r.type === 'moneywise' ? 'MONEYWISE_PAY' : 'MONEYWISE_WALLET',
            total_prepared: plan.amount, recipient_account: r.account, recipient_bank_code: r.bankCode.toLowerCase(),
            recipient_account_name: r.name, recipient_organization_id: r.orgId, wallet_id: plan.wallet.id,
        } });
        if (sent.status >= 400) throw new Error(`${errorOf(sent, 'The payment failed')} Nothing was sent.`);
        const status = String(sent.body?.lencoStatus ?? '').toLowerCase();
        return {
            sent: plan.amount, to: r.name, reference: created.body.reference_number ?? null,
            status: status === 'successful' ? 'sent' : 'processing',
            note: status === 'successful' ? undefined : 'Lenco is still processing it; it usually settles within minutes and the Inbox will update.',
        };
    },
};

async function planSend(ctx: AgentContext, args: any) {
    await requirePersonal(ctx, 'Sending money');
    const amount = round2(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) invalid('The amount must be more than zero.');
    const reason = String(args.reason ?? '').trim();
    if (reason.length < 2) invalid('What is the payment for? Ask the user.');
    const recipient = await resolveRecipient(ctx, args.recipientType, args.recipient, args.bankName);
    if (recipient.type !== 'moneywise' && amount < LENCO_MIN_TRANSFER) invalid(`Mobile-money and bank transfers start at K${LENCO_MIN_TRANSFER}.`);
    const fee = recipient.type === 'moneywise' ? 0 : LencoService.calculatePayoutFee(amount, recipient.type === 'bank' ? 'BANK' : 'MOBILE_MONEY');
    const wallet = await pickWallet(ctx, args.fromWallet, 'wallet to pay from');
    if (wallet.balance + 0.005 < amount + fee) invalid(`${wallet.name} has ${kwacha(wallet.balance)} but this needs ${kwacha(amount + fee)}${fee ? ' including the fee' : ''}. Suggest a deposit or another wallet.`);
    return { amount, reason, recipient, fee, wallet };
}

const investTool: ToolDefinition = {
    name: 'invest',
    description: 'Invest money from a MoneyWise wallet into one of the investment companies the person has an ACTIVE account with (see list_investments). The person confirms with their PIN / Face ID.',
    effect: 'write',
    allowedRoles: OWNER_ONLY,
    parameters: {
        type: 'object',
        properties: { company: { type: 'string' }, amount: { type: 'number' }, product: { type: 'string' }, fromWallet: { type: 'string' } },
        required: ['company', 'amount'],
    },
    handler: async (ctx, args) => {
        const p = await planInvest(ctx, args);
        return proposal(`Invest ${kwacha(p.amount)} with ${p.target.name}`, [
            { label: 'Company', value: p.target.name }, ...(args.product ? [{ label: 'Product', value: String(args.product) }] : []),
            { label: 'Amount', value: kwacha(p.amount) }, { label: 'From', value: `${p.wallet.name} (${kwacha(p.wallet.balance)})` },
        ], { strongAuth: true, warning: 'This sends real money to the investment company.' });
    },
    execute: async (ctx, args) => {
        const p = await planInvest(ctx, args);
        const r = await callHandler(walletTransferToInvestmentTarget, ctx, { body: { sourceWalletId: p.wallet.id, targetId: p.target.id, amount: p.amount, productName: args.product || undefined } });
        if (r.status >= 400) throw new Error(errorOf(r, 'The investment failed. Nothing was sent.'));
        return { invested: p.amount, company: p.target.name, result: r.body?.status ?? 'submitted' };
    },
};

const targetName = (t: any) => String(t.displayName ?? t.display_name ?? t.name ?? '');

async function planInvest(ctx: AgentContext, args: any) {
    const amount = round2(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) invalid('The amount must be more than zero.');
    const t = await callHandler(listInvestmentTargets, ctx);
    const list: any[] = Array.isArray(t.body) ? t.body : [];
    const hit = byName(list, args.company, targetName);
    if (!hit) return invalid(`No investment company called "${args.company}". Available: ${list.map(targetName).join(', ') || 'none'}.`);
    await investorAccountService.assertCanInvest(ctx.organizationId, hit.id).catch((e: any) => invalid(`${e.message} Opening an account is done in Invest in the app.`));
    const wallet = await pickWallet(ctx, args.fromWallet, 'wallet to invest from');
    if (wallet.balance + 0.005 < amount) invalid(`${wallet.name} only has ${kwacha(wallet.balance)}.`);
    return { amount, wallet, target: { id: hit.id, name: targetName(hit) } };
}

export const personalTools: ToolDefinition[] = [
    getWallets, getPayLink, listSavings, getBudgetStatus, listInvestments, findRecipient, getMySettings,
    createWalletTool, createExternalAccount, setBudgets, updateMyPreferences, createSavingsPot,
    transferBetweenWallets, addToSavings, withdrawFromSavings, sendMoney, investTool,
];
