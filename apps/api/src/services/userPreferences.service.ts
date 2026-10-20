/**
 * userPreferences.service.ts — a person's own settings (Settings → Preferences in the personal app).
 *
 * Stored as JSONB on `users.preferences`; every value is validated against an allowlist so a client can never
 * point the AI or the payroll router at something arbitrary.
 *
 *   notifications.channel     BOTH | APP | EMAIL — where notifications about their PERSONAL account are delivered
 *   ai.assistant_model        default model for the Assistant (one of ASSISTANT_MODELS)
 *   ai.categorization_model   model used to categorise their personal transactions (one of CATEGORIZATION_MODELS)
 *   payroll.destination       PERSONAL_WALLET | BANK — where a salary from an employer's payroll is paid
 */
import { supabase } from '../lib/supabase';
import { ASSISTANT_MODELS } from './agent/models';
import { PROVIDER_CATALOG } from './ai/ai.settings.service';

export const NOTIFY_CHANNELS = ['BOTH', 'APP', 'EMAIL'] as const;
export type NotifyChannel = typeof NOTIFY_CHANNELS[number];
export const SALARY_DESTINATIONS = ['PERSONAL_WALLET', 'BANK'] as const;
export type SalaryDestination = typeof SALARY_DESTINATIONS[number];

export interface UserPreferences {
    notifications: { channel: NotifyChannel };
    ai: { assistant_model: string | null; categorization_model: string | null };
    payroll: { destination: SalaryDestination };
}

export const DEFAULT_PREFERENCES: UserPreferences = {
    notifications: { channel: 'BOTH' },
    ai: { assistant_model: null, categorization_model: null },
    payroll: { destination: 'BANK' },
};

/** Same test the client and the rest of the API use: personal workspaces are recognised by name. */
export const isPersonalOrgName = (name?: string | null): boolean => {
    const n = (name ?? '').toLowerCase();
    return n.includes('workspace') || n.includes('personal') || n.includes('individual') || n.includes('private');
};

const CATEGORIZATION_LABELS: Record<string, string> = {
    'deepseek/deepseek-r1-distill-llama-70b': 'DeepSeek R1 Distill 70B',
    'meta-llama/llama-3.3-70b-instruct': 'Llama 3.3 70B',
    'qwen/qwen-2.5-72b-instruct': 'Qwen 2.5 72B',
    'anthropic/claude-3-5-haiku': 'Claude Haiku 3.5',
    'anthropic/claude-sonnet-4-5': 'Claude Sonnet 4.5',
};
export const CATEGORIZATION_MODELS: { id: string; label: string }[] =
    PROVIDER_CATALOG.openrouter.models.categorization.map((id: string) => ({ id, label: CATEGORIZATION_LABELS[id] ?? id }));

/** Merges stored JSON over the defaults, dropping anything that is no longer valid. */
export function normalizePreferences(raw: any): UserPreferences {
    const src = raw && typeof raw === 'object' ? raw : {};
    const channel = NOTIFY_CHANNELS.includes(src.notifications?.channel) ? src.notifications.channel : DEFAULT_PREFERENCES.notifications.channel;
    const assistant = ASSISTANT_MODELS.some((m) => m.id === src.ai?.assistant_model) ? src.ai.assistant_model : null;
    const cat = CATEGORIZATION_MODELS.some((m) => m.id === src.ai?.categorization_model) ? src.ai.categorization_model : null;
    const dest = SALARY_DESTINATIONS.includes(src.payroll?.destination) ? src.payroll.destination : DEFAULT_PREFERENCES.payroll.destination;
    return { notifications: { channel }, ai: { assistant_model: assistant, categorization_model: cat }, payroll: { destination: dest } };
}

export async function getPreferences(userId: string): Promise<UserPreferences> {
    const { data } = await supabase.from('users').select('preferences').eq('id', userId).maybeSingle();
    return normalizePreferences((data as any)?.preferences);
}

/** Partial update: only the keys supplied change; invalid values are rejected rather than silently ignored. */
export async function updatePreferences(userId: string, patch: any): Promise<UserPreferences> {
    const current = await getPreferences(userId);
    const next: UserPreferences = JSON.parse(JSON.stringify(current));
    const bad = (m: string) => { throw Object.assign(new Error(m), { httpStatus: 400 }); };

    if (patch?.notifications?.channel !== undefined) {
        if (!NOTIFY_CHANNELS.includes(patch.notifications.channel)) bad('Choose app, email or both for notifications.');
        next.notifications.channel = patch.notifications.channel;
    }
    if (patch?.ai?.assistant_model !== undefined) {
        const v = patch.ai.assistant_model;
        if (v !== null && !ASSISTANT_MODELS.some((m) => m.id === v)) bad('That Assistant model is not available.');
        next.ai.assistant_model = v;
    }
    if (patch?.ai?.categorization_model !== undefined) {
        const v = patch.ai.categorization_model;
        if (v !== null && !CATEGORIZATION_MODELS.some((m) => m.id === v)) bad('That categorisation model is not available.');
        next.ai.categorization_model = v;
    }
    if (patch?.payroll?.destination !== undefined) {
        if (!SALARY_DESTINATIONS.includes(patch.payroll.destination)) bad('Choose your personal MoneyWise account or your bank.');
        if (patch.payroll.destination === 'PERSONAL_WALLET' && !(await getPersonalOrgForUser(userId))) bad('You need a MoneyWise personal account to receive your salary there.');
        next.payroll.destination = patch.payroll.destination;
    }

    const { error } = await supabase.from('users').update({ preferences: next }).eq('id', userId);
    if (error) throw new Error(`Could not save your preferences: ${error.message}`);
    return next;
}

/** The person's own personal workspace (the one their salary can land in), or null. */
export async function getPersonalOrgForUser(userId: string): Promise<{ id: string; name: string } | null> {
    const { data } = await supabase
        .from('user_organizations')
        .select('organization:organizations(id, name)')
        .eq('user_id', userId)
        .eq('status', 'ACTIVE');
    const orgs = (data ?? []).map((r: any) => r.organization).filter(Boolean);
    return orgs.find((o: any) => isPersonalOrgName(o.name)) ?? null;
}

/** True when the person is on an employer's payroll (a payroll_staff row linked to their user). */
export async function isStaffWithPayroll(userId: string): Promise<boolean> {
    const { count } = await supabase.from('payroll_staff').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    return (count ?? 0) > 0;
}

// ── Notification channel gating ───────────────────────────────────────────────
// The preference is only offered in the personal app, so it only governs notifications about a personal
// workspace. Business notifications are never filtered by it.

const orgIsPersonalCache = new Map<string, { at: number; v: boolean }>();
async function orgIsPersonal(orgId: string): Promise<boolean> {
    const hit = orgIsPersonalCache.get(orgId);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v;
    const { data } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
    const v = isPersonalOrgName((data as any)?.name);
    orgIsPersonalCache.set(orgId, { at: Date.now(), v });
    return v;
}

/** Drops user ids who asked for email-only notifications, for events in a personal workspace. */
export async function filterUserIdsForPush(userIds: string[], orgId?: string | null): Promise<string[]> {
    if (!orgId || userIds.length === 0 || !(await orgIsPersonal(orgId))) return userIds;
    const { data } = await supabase.from('users').select('id, preferences').in('id', userIds);
    const emailOnly = new Set((data ?? []).filter((u: any) => u.preferences?.notifications?.channel === 'EMAIL').map((u: any) => u.id));
    return userIds.filter((id) => !emailOnly.has(id));
}

/** Drops addresses of people who asked for app-only notifications, for events in a personal workspace. */
export async function filterEmailsForOrg(emails: string[], orgId?: string | null): Promise<string[]> {
    if (!orgId || emails.length === 0 || !(await orgIsPersonal(orgId))) return emails;
    const { data } = await supabase.from('users').select('email, preferences').in('email', emails);
    const appOnly = new Set((data ?? []).filter((u: any) => u.preferences?.notifications?.channel === 'APP').map((u: any) => String(u.email).toLowerCase()));
    return emails.filter((e) => !appOnly.has(e.toLowerCase()));
}
