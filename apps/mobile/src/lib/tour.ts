import { useSyncExternalStore } from 'react';
import type { View } from 'react-native';

/**
 * The guided walkthrough ("spotlight tour"). Each task is a short sequence of steps; a step points at one element
 * on one screen (`target` is the id of a <TourTarget> wrapped around that element), dims everything else, and says
 * what to do. `tap` steps advance when the person presses the highlighted element; `next` steps have a Next button.
 */
export interface TourStep {
    target: string;
    /** True when the screen showing the target is open (compared with the current pathname). */
    onScreen: (pathname: string) => boolean;
    /** Where "Take me there" goes if the person is on a different screen. */
    route: string;
    title: string;
    body: string;
    advance: 'tap' | 'next';
}

const exact = (p: string) => (path: string) => path === p;
const starts = (p: string, not?: string) => (path: string) => path.startsWith(p) && !(not && path.startsWith(not));

const SEND: TourStep[] = [
    { target: 'inbox-new', onScreen: exact('/'), route: '/', title: 'Start here', body: 'Start a new payment or request from here.', advance: 'tap' },
    { target: 'send-form', onScreen: starts('/requisition/new'), route: '/requisition/new', title: 'Fill in the details', body: 'Enter the amount and who you are paying. Review it, then send. It is categorised for your reports automatically.', advance: 'next' },
];
const DEPOSIT: TourStep[] = [
    { target: 'wallet-deposit', onScreen: exact('/wallet'), route: '/wallet', title: 'Add money', body: 'Tap Deposit to put money into your wallet.', advance: 'tap' },
    { target: 'deposit-amount', onScreen: exact('/wallet/deposit'), route: '/wallet/deposit', title: 'How much?', body: 'Enter the amount, choose mobile money and the number to pay from, then approve the prompt on your phone.', advance: 'next' },
];
const BUDGET: TourStep[] = [
    { target: 'reporting-budgets', onScreen: exact('/reporting'), route: '/reporting', title: 'Budgets live here', body: 'Tap Budgets to set monthly limits for your spending categories.', advance: 'tap' },
    { target: 'budgets-activate', onScreen: exact('/budgets'), route: '/budgets', title: 'Switch budgets on', body: 'Turn this on, enter a monthly target for each category and save. You can edit them anytime.', advance: 'next' },
];
const ASSISTANT: TourStep[] = [
    { target: 'assistant-composer', onScreen: exact('/bi'), route: '/bi', title: 'Ask anything', body: 'Type a question about your money, such as "How much did I spend on food this month?"', advance: 'next' },
];

export const TOURS: Record<string, TourStep[]> = {
    deposit: DEPOSIT,
    'savings-pot': [
        { target: 'wallet-savings', onScreen: exact('/wallet'), route: '/wallet', title: 'Savings', body: 'Tap Savings to open your savings pots.', advance: 'tap' },
        { target: 'savings-create', onScreen: exact('/savings'), route: '/savings', title: 'Create a pot', body: 'Tap + to create your first pot: give it a name and a target.', advance: 'next' },
    ],
    'savings-fund': [
        { target: 'savings-list', onScreen: exact('/savings'), route: '/savings', title: 'Open a pot', body: 'Tap one of your pots to open it.', advance: 'tap' },
        { target: 'savings-add', onScreen: starts('/savings/', '/savings/join'), route: '/savings', title: 'Add money', body: 'Tap Add money, choose an amount and pay from your wallet or with mobile money.', advance: 'next' },
    ],
    send: SEND,
    invest: [
        { target: 'menu-invest', onScreen: exact('/menu'), route: '/menu', title: 'Invest', body: 'Tap Invest to see companies you can put money into.', advance: 'tap' },
        { target: 'invest-list', onScreen: starts('/apps/invest'), route: '/apps/invest', title: 'Pick a company', body: 'Open a company to read how it works, then choose an amount and pay from your wallet.', advance: 'next' },
    ],
    budget: BUDGET,
    assistant: ASSISTANT,
    photo: [
        { target: 'menu-general', onScreen: exact('/menu'), route: '/menu', title: 'Settings', body: 'Tap General Settings to change your photo.', advance: 'tap' },
        { target: 'settings-photo', onScreen: exact('/settings/general'), route: '/settings/general', title: 'Your photo', body: 'Tap Change profile photo and choose a picture.', advance: 'next' },
    ],
    // business track
    'business-profile': [
        { target: 'menu-general', onScreen: exact('/menu'), route: '/menu', title: 'Settings', body: 'Tap General Settings to complete your business profile.', advance: 'tap' },
        { target: 'settings-details', onScreen: exact('/settings/general'), route: '/settings/general', title: 'Your business details', body: 'Add your phone, address and website, upload your logo, then Save changes.', advance: 'next' },
    ],
    team: [
        { target: 'menu-team', onScreen: exact('/menu'), route: '/menu', title: 'Your team', body: 'Tap Team Members to invite colleagues.', advance: 'tap' },
        { target: 'team-add', onScreen: exact('/settings/team'), route: '/settings/team', title: 'Invite someone', body: 'Add a colleague with their email and role. They will get an invitation.', advance: 'next' },
    ],
    request: SEND,
};

// ── Tour state ────────────────────────────────────────────────────────────────
interface TourState { taskId: string | null; index: number }
let state: TourState = { taskId: null, index: 0 };
const listeners = new Set<() => void>();
const emit = (next: Partial<TourState>) => { state = { ...state, ...next }; listeners.forEach((l) => l()); };

export const tour = {
    start: (taskId: string) => { if (TOURS[taskId]) emit({ taskId, index: 0 }); },
    stop: () => emit({ taskId: null, index: 0 }),
    next: () => {
        const steps = state.taskId ? TOURS[state.taskId] : null;
        if (!steps) return;
        if (state.index + 1 >= steps.length) emit({ taskId: null, index: 0 });
        else emit({ index: state.index + 1 });
    },
    /** A highlighted element was pressed: advance if it is the current step's tap target. */
    tapped: (targetId: string) => {
        const steps = state.taskId ? TOURS[state.taskId] : null;
        const step = steps?.[state.index];
        if (step && step.advance === 'tap' && step.target === targetId) setTimeout(tour.next, 250);
    },
    state: () => state,
};

export function useTour(): { taskId: string | null; index: number; step: TourStep | null; total: number } {
    const s = useSyncExternalStore(
        (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
        () => state, () => state,
    );
    const steps = s.taskId ? TOURS[s.taskId] : null;
    return { taskId: s.taskId, index: s.index, step: steps?.[s.index] ?? null, total: steps?.length ?? 0 };
}

// ── Target registry: where each highlighted element is on screen ────────────
export interface Rect { x: number; y: number; width: number; height: number }
const targets = new Map<string, Set<View>>();

export const registerTarget = (id: string, view: View) => {
    const set = targets.get(id) ?? new Set<View>();
    set.add(view); targets.set(id, set);
    return () => { set.delete(view); if (set.size === 0) targets.delete(id); };
};

/** The on-screen rectangle of a target, or null when it isn't mounted / visible. */
export const measureTarget = (id: string): Promise<Rect | null> => new Promise((resolve) => {
    const views = targets.get(id);
    if (!views || views.size === 0) return resolve(null);
    const view = Array.from(views).pop()!;       // the most recently mounted copy (the screen on top)
    let done = false;
    const finish = (r: Rect | null) => { if (!done) { done = true; resolve(r); } };
    setTimeout(() => finish(null), 400);
    try {
        view.measureInWindow((x, y, width, height) => finish(width > 0 && height > 0 ? { x, y, width, height } : null));
    } catch { finish(null); }
});
