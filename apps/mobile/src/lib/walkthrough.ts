import {
    ArrowDownToLine, PiggyBank, Coins, Send, TrendingUp, Target, Sparkles, Camera,
    Building2, Users, FilePlus2, type LucideIcon,
} from 'lucide-react-native';
import { cacheStoreSync } from '../platform/storage';

/** What the server reports the organization has actually done (apps/api walkthrough.controller.ts). */
export interface WalkthroughFacts {
    deposited: boolean; savingsCreated: boolean; savingsFunded: boolean; sentMoney: boolean; invested: boolean;
    budgetSet: boolean; usedAssistant: boolean; teamInvited: boolean; profilePhoto: boolean; businessProfile: boolean;
}
export interface WalkthroughProgress { accountType: 'PERSONAL' | 'BUSINESS'; accountAgeDays: number; facts: WalkthroughFacts }

export interface WalkthroughTask {
    id: string;
    title: string;
    /** One line on the card. */
    blurb: string;
    /** Why this step matters, shown when the person starts it. */
    why: string;
    /** How the step works in the app, in order. */
    how: string[];
    cta: string;
    route: string;
    icon: LucideIcon;
    done: (f: WalkthroughFacts) => boolean;
}

/**
 * MoneyWise Personal — one person managing their own money. In the order that gets someone from "empty account" to
 * "using it properly": put income in, build the saving habit, move money, grow it, stay on budget, get help, make it theirs.
 */
export const PERSONAL_TASKS: WalkthroughTask[] = [
    {
        id: 'deposit', icon: ArrowDownToLine, title: 'Deposit your income', done: (f) => f.deposited,
        blurb: 'Add money to your wallet so MoneyWise can start tracking where it goes.',
        why: 'Everything in MoneyWise starts with money in. Once your income is in, every payment and saving is measured against it, and your reports and net worth become real.',
        how: ['Open Wallet and tap Deposit.', 'Enter the amount, such as your salary, and the mobile money number to pay from.', 'Approve the prompt on your phone. The deposit is filed under income automatically.'],
        cta: 'Make a deposit', route: '/wallet/deposit',
    },
    {
        id: 'savings-pot', icon: PiggyBank, title: 'Create a savings pot', done: (f) => f.savingsCreated,
        blurb: 'Set money aside for something that matters: a trip, an emergency fund, a purchase.',
        why: 'Money with a name gets saved. A pot gives your savings a goal and keeps them separate from the money you spend every day.',
        how: ['Open Savings from the Wallet tab.', 'Choose a goal, wishlist or group pot and name it.', 'Set a target amount and, if you like, a date.'],
        cta: 'Create a pot', route: '/savings',
    },
    {
        id: 'savings-fund', icon: Coins, title: 'Add money to your savings', done: (f) => f.savingsFunded,
        blurb: 'Move something into your pot, even a small amount. It builds the habit.',
        why: 'The habit matters more than the amount. A small, regular top-up is how pots actually fill up.',
        how: ['Open your pot and tap Add money.', 'Pay from your wallet or with mobile money.', 'Watch the progress bar move towards your target.'],
        cta: 'Add to savings', route: '/savings',
    },
    {
        id: 'send', icon: Send, title: 'Send money', done: (f) => f.sentMoney,
        blurb: 'Pay someone in seconds. Every payment is categorised for your reports.',
        why: 'Sending from MoneyWise records and categorises the payment for you, so your spending is always up to date without any bookkeeping.',
        how: ['Tap + on Inbox and choose Send.', 'Enter the amount and who to pay: mobile money, a bank or another MoneyWise user.', 'Review and send. The payment appears in your reports straight away, and you can change its category.'],
        cta: 'Send money', route: '/requisition/new',
    },
    {
        id: 'invest', icon: TrendingUp, title: 'Start investing', done: (f) => f.invested,
        blurb: 'Put money to work in a company on MoneyWise and grow your income.',
        why: 'Saving protects your money; investing grows it. Even a small first investment teaches you how returns work.',
        how: ['Open Menu, then Invest.', 'Pick a company and read how it works.', 'Choose an amount and pay from your wallet. It shows up in your net worth.'],
        cta: 'Explore investing', route: '/apps/invest',
    },
    {
        id: 'budget', icon: Target, title: 'Review your budget', done: (f) => f.budgetSet,
        blurb: 'Set a monthly limit for the categories you spend on, and edit it anytime.',
        why: 'A budget turns "where did it go?" into "I know where it is going." You will see how close each category is to its limit on the Reporting tab.',
        how: ['Open Reporting and tap Budgets.', 'Turn budgets on and enter a monthly target for each category.', 'Come back to Reporting to see your progress, and edit any target when your plans change.'],
        cta: 'Set your budget', route: '/budgets',
    },
    {
        id: 'assistant', icon: Sparkles, title: 'Ask your assistant', done: (f) => f.usedAssistant,
        blurb: 'Ask about your spending, your savings or how to reach a goal faster.',
        why: 'Your assistant knows your numbers. Ask it where your money went this month, which category is growing, or how to reach a goal sooner.',
        how: ['Open the Intelligence tab.', 'Ask in plain words, for example "How much did I spend on food this month?"', 'It can also draft changes for you, and nothing happens until you approve it.'],
        cta: 'Ask a question', route: '/(tabs)/bi',
    },
    {
        id: 'photo', icon: Camera, title: 'Add your profile photo', done: (f) => f.profilePhoto,
        blurb: 'Make your account yours. It appears on your Menu and on payments you send.',
        why: 'A photo makes your account recognisable to the people you pay and to you.',
        how: ['Open Menu, then General Settings.', 'Tap Change profile photo and choose a picture.'],
        cta: 'Add a photo', route: '/settings/general',
    },
];

/** MoneyWise Professional — a business: set up the workspace, fund it, bring the team in, start moving money. */
export const BUSINESS_TASKS: WalkthroughTask[] = [
    {
        id: 'business-profile', icon: Building2, title: 'Complete your business profile', done: (f) => f.businessProfile,
        blurb: 'Add your business details and set up your workspace.',
        why: 'Your details appear on invoices, receipts and payment links, so customers and suppliers know who they are dealing with.',
        how: ['Open Menu, then General Settings.', 'Add your phone, address and website, and a logo.', 'Save. Your documents will use these details.'],
        cta: 'Complete profile', route: '/settings/general',
    },
    {
        id: 'deposit', icon: ArrowDownToLine, title: 'Fund your wallet', done: (f) => f.deposited,
        blurb: 'Deposit money so you can pay suppliers and staff and start trading.',
        why: 'A funded wallet is what lets you pay out and what customers pay into. Your books start from this first deposit.',
        how: ['Open Wallet and tap Deposit.', 'Enter the amount and pay with mobile money.', 'Your balance and ledger update as soon as it lands.'],
        cta: 'Make a deposit', route: '/wallet/deposit',
    },
    {
        id: 'team', icon: Users, title: 'Invite your team', done: (f) => f.teamInvited,
        blurb: 'Bring in colleagues so they can raise requests and approve spending.',
        why: 'Spending controls only work with people in them: staff raise requests, approvers authorise, and everyone sees only what their role allows.',
        how: ['Open Menu, then Team Members.', 'Add a colleague with their email and role.', 'They get an invitation and join your workspace.'],
        cta: 'Invite a teammate', route: '/settings/team',
    },
    {
        id: 'request', icon: FilePlus2, title: 'Make your first payment request', done: (f) => f.sentMoney,
        blurb: 'Raise a request to pay for an expense, a supplier or a purchase.',
        why: 'Every payment goes through a request, so there is always a record of who asked, who approved and what it was for.',
        how: ['Tap + on Inbox and choose a request.', 'Describe the expense, add the amount and who to pay.', 'Submit it, then approve and pay. It is categorised for your reports automatically.'],
        cta: 'Create a request', route: '/requisition/new',
    },
    {
        id: 'budget', icon: Target, title: 'Set your budgets', done: (f) => f.budgetSet,
        blurb: 'Give each spending category a monthly limit and track it in Reporting.',
        why: 'Budgets show you early when a category is running ahead of plan, so you can act before the month ends.',
        how: ['Open Reporting, then Budgets.', 'Enter a monthly target for each category.', 'Track actual spend against it in Reporting.'],
        cta: 'Set budgets', route: '/budgets',
    },
    {
        id: 'assistant', icon: Sparkles, title: 'Meet your assistant', done: (f) => f.usedAssistant,
        blurb: 'Ask about your spending, cash position and trends in plain language.',
        why: 'Skip the spreadsheets: ask your assistant for a spending breakdown or a chart for your next meeting.',
        how: ['Open the Intelligence tab.', 'Ask a question such as "What were my biggest expenses last month?"', 'It can build charts, and proposed changes wait for your approval.'],
        cta: 'Ask a question', route: '/(tabs)/bi',
    },
];

export const tasksFor = (type: 'PERSONAL' | 'BUSINESS') => (type === 'PERSONAL' ? PERSONAL_TASKS : BUSINESS_TASKS);

/** The card is for new accounts only. */
export const CARD_MAX_ACCOUNT_AGE_DAYS = 45;

// ── Per-organization preferences (skipped steps, hidden card) ─────────────────
const prefKey = (orgId: string, name: 'skipped' | 'hidden') => `walkthrough_${name}_v1:${orgId}`;

export const readSkipped = (orgId: string | null): string[] => {
    if (!orgId) return [];
    try { return JSON.parse(cacheStoreSync.getItem(prefKey(orgId, 'skipped')) || '[]'); } catch { return []; }
};
export const writeSkipped = (orgId: string | null, ids: string[]) => {
    if (orgId) try { cacheStoreSync.setItem(prefKey(orgId, 'skipped'), JSON.stringify(ids)); } catch { /* best effort */ }
};
export const readHidden = (orgId: string | null): boolean => !!orgId && cacheStoreSync.getItem(prefKey(orgId, 'hidden')) === '1';
export const writeHidden = (orgId: string | null, hidden: boolean) => {
    if (!orgId) return;
    try { hidden ? cacheStoreSync.setItem(prefKey(orgId, 'hidden'), '1') : cacheStoreSync.removeItem(prefKey(orgId, 'hidden')); } catch { /* best effort */ }
};
