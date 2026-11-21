/**
 * Personal onboarding (flow PERSONAL_V2) — the step keys and the pure rules the API enforces.
 *
 * The full step list (titles, chapters, what is built) lives in packages/core/src/onboarding/personalSteps.ts. The API
 * can't import core, so the keys and required flags are repeated here; `npm run test:onboarding` fails if they drift.
 */

export const PERSONAL_STEP_KEYS = [
    'name', 'dob', 'phone', 'avatar', 'intents',
    'accounts', 'capture', 'gmail', 'assets', 'net_worth',
    'bills', 'grow', 'reminders',
    'kyc', 'wallet',
] as const;

export type PersonalStepKey = typeof PERSONAL_STEP_KEYS[number];
export type PersonalStepState = 'done' | 'skipped';
export type PersonalStepsMap = Partial<Record<PersonalStepKey, { state: PersonalStepState; at: string }>>;

export const REQUIRED_PERSONAL_STEPS: PersonalStepKey[] = ['name', 'dob'];

export const isPersonalStepKey = (k: unknown): k is PersonalStepKey =>
    typeof k === 'string' && (PERSONAL_STEP_KEYS as readonly string[]).includes(k);

/** Only orgs created while this is on get the new flow; everything else stays on the legacy wizard. */
export const personalOnboardingV2Enabled = () => process.env.PERSONAL_ONBOARDING_V2 === '1';

/** onboarding_progress row for a brand-new org. `flow` is only sent when V2 is on, so the insert keeps working
 *  before the 20261129100000 migration is applied (a failed insert would leave the org with no row, which reads as
 *  "onboarding finished"). */
export function onboardingSeedRow(organizationId: string, isPersonal: boolean): Record<string, unknown> {
    const row: Record<string, unknown> = { organization_id: organizationId, current_step: 1, completed_steps: [], status: 'IN_PROGRESS' };
    if (isPersonal && personalOnboardingV2Enabled()) {
        row.flow = 'PERSONAL_V2';
        row.steps = {};
    }
    return row;
}

/** Workspace names the app made up ("Kim's Workspace", "Kim's Workspace 2"), as opposed to one the person chose. */
export const isDefaultWorkspaceName = (name: string | null | undefined) => /^.+['’]s Workspace( \d+)?$/i.test(String(name || '').trim());

/** Email sign-up names a personal workspace "<name>'s Workspace"; older clients don't send the account type. */
export const isPersonalSignup = (accountType: unknown, organizationName: string | null | undefined) =>
    accountType === 'INDIVIDUAL' || (accountType !== 'BUSINESS' && isDefaultWorkspaceName(organizationName));

/**
 * One name part: trimmed, inner spaces collapsed, at most 50 characters, letters plus space, hyphen and apostrophe.
 * Casing the person typed on purpose ("McDonald", "de Souza") is kept; all-lower or all-upper is title-cased.
 */
export function normaliseNamePart(raw: unknown): { value: string } | { error: string } {
    const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!s) return { error: 'Required' };
    if (s.length > 50) return { error: 'Keep it under 50 characters' };
    if (!/^[\p{L}][\p{L}\p{M}' ’.-]*$/u.test(s)) return { error: 'Use letters only' };
    const mixed = s !== s.toLowerCase() && s !== s.toUpperCase();
    if (mixed) return { value: s };
    const titled = s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());
    return { value: titled };
}

/** YYYY-MM-DD, a real calendar date, in the past, at most 120 years ago. Returns the age in whole years. */
export function validateDateOfBirth(raw: unknown, today: Date = new Date()): { iso: string; age: number } | { error: string } {
    const s = String(raw ?? '').trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return { error: 'Enter a full date' };
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { error: 'That date doesn’t exist' };
    const t = { y: today.getUTCFullYear(), m: today.getUTCMonth() + 1, d: today.getUTCDate() };
    let age = t.y - y;
    if (t.m < mo || (t.m === mo && t.d < d)) age -= 1;
    const todayUtc = Date.UTC(t.y, t.m - 1, t.d);
    if (dt.getTime() >= todayUtc) return { error: 'Date of birth must be in the past' };
    if (age > 120) return { error: 'Check the year' };
    return { iso: s, age };
}

/** Required steps can't be skipped. */
export function checkStepTransition(key: PersonalStepKey, state: unknown): { state: PersonalStepState } | { error: string } {
    if (state !== 'done' && state !== 'skipped') return { error: 'state must be "done" or "skipped"' };
    if (state === 'skipped' && REQUIRED_PERSONAL_STEPS.includes(key)) return { error: 'This step can’t be skipped' };
    return { state };
}

export const missingRequiredSteps = (steps: PersonalStepsMap): PersonalStepKey[] =>
    REQUIRED_PERSONAL_STEPS.filter((k) => steps[k]?.state !== 'done');

/** Read a stored steps JSON defensively: unknown keys and malformed entries are dropped. */
export function parseStoredSteps(raw: unknown): PersonalStepsMap {
    const out: PersonalStepsMap = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [k, v] of Object.entries(raw as Record<string, any>)) {
        if (!isPersonalStepKey(k) || !v || (v.state !== 'done' && v.state !== 'skipped')) continue;
        out[k] = { state: v.state, at: typeof v.at === 'string' ? v.at : new Date(0).toISOString() };
    }
    return out;
}
