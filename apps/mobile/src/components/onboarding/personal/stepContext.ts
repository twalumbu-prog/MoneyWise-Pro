import type { personalOnboardingService, PersonalOnboardingState, PersonalStepDef, PersonalStepsMap, PersonalMoney, GmailFindings } from 'core';

/**
 * What every Personal onboarding step gets from the wizard (app/personal-onboarding.tsx). A step renders its own
 * PersonalStepShell and decides what Continue does; `run` does the saving, error display, analytics and moving on.
 */
export type PersonalService = typeof personalOnboardingService;

export interface AvatarDraft {
    /** What the person picked on this visit; undefined = keep what is saved. */
    kind?: 'photo' | 'preset' | 'provider' | 'initials';
    uri?: string;
    base64?: string;
    mime?: string;
    preset?: string;
}

export interface PersonalDrafts {
    name: { firstName: string; lastName: string };
    dob: { dateOfBirth: string };
    phone: { number: string; codeSentTo: string | null; code: string; resendAt: number | null };
    avatar: AvatarDraft;
    intents: string[];
    /** What the connected mailbox suggested: banks to add, bills for the bills step, a statement for KYC. */
    gmail: GmailFindings | null;
    /** Monthly total of the regular bills (set by the bills step, the Grow step's expense suggestion). */
    billsMonthly: number | null;
}

export interface StepContext {
    def: PersonalStepDef;
    /** 0–1 through the whole flow. */
    progress: number;
    single: boolean;
    preview: boolean;
    service: PersonalService;
    state: PersonalOnboardingState;
    drafts: PersonalDrafts;
    setDraft: <K extends keyof PersonalDrafts>(key: K, value: PersonalDrafts[K]) => void;
    onBack?: () => void;
    saving: 'continue' | 'skip' | null;
    error: string | null;
    fieldErrors: Record<string, string>;
    /**
     * Run a save. `fn` returns the server's steps when the step is finished (the wizard then moves on), or null when
     * the step stays open (e.g. "code sent, now type it"). Errors are shown on the step; a 400 with `field` shows
     * under that input.
     */
    run: (how: 'continue' | 'skip', fn: () => Promise<{ steps: PersonalStepsMap } | null>) => Promise<void>;
    /** Skip with the plain step save. Undefined for required steps. */
    skip?: () => void;
    /** Plain "done" save with optional data. */
    done: (data?: Record<string, unknown>) => void;
    /** Profile changes a step made (name casing, avatar, phone) so later steps and the All set screen see them. */
    patchProfile: (patch: Partial<PersonalOnboardingState['profile']>) => void;
    /** Accounts, holdings and totals (loaded once by the wizard, refreshed after every change). */
    money: PersonalMoney | null;
    refreshMoney: () => Promise<PersonalMoney | null>;
    /** Open another step (e.g. the wallet step sending someone to identity first); Back returns here. */
    goTo: (key: import('core').PersonalStepKey) => void;
}
