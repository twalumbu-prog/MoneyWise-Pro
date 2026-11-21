import { Response } from 'express';
import { supabase } from '../lib/supabase';
import { captureEvent } from '../utils/analytics';
import { whatsappService, toChatId } from '../services/whatsapp.service';
import {
    parseZambianMobile, generateOtp, hashOtp, resendWait, checkOtp, otpMessage, cleanIntents, isAvatarPreset,
    OTP_TTL_MS, PendingVerification,
} from '../services/personalOnboarding/phone';
import {
    checkStepTransition, isDefaultWorkspaceName, isPersonalStepKey, missingRequiredSteps, normaliseNamePart,
    parseStoredSteps, PersonalStepKey, PersonalStepsMap, validateDateOfBirth,
} from '../services/personalOnboarding/steps';

/**
 * MoneyWise Personal onboarding (flow PERSONAL_V2). docs/personal-onboarding-plan.md.
 *
 *   GET  /onboarding/personal/state        flow, status, step states, the person's profile
 *   PUT  /onboarding/personal/steps/:key   { state: 'done' | 'skipped', data? } — idempotent
 *   POST /onboarding/personal/complete     finish (every required step must be done)
 *
 * Scoped to req.user.organization_id. Steps can be saved after onboarding has finished: that is how the Home
 * "Finish setting up" checklist completes a skipped step.
 */

export const orgContext = (req: any, res: Response): { orgId: string; userId: string } | null => {
    const orgId = req.user?.organization_id;
    const userId = req.user?.id;
    if (!orgId || !userId) {
        res.status(400).json({ error: 'User organization context missing' });
        return null;
    }
    if (req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Only the account owner can set up this account' });
        return null;
    }
    return { orgId, userId };
};

async function loadProgress(orgId: string) {
    const { data, error } = await supabase
        .from('onboarding_progress')
        .select('flow, status, steps, completed_at')
        .eq('organization_id', orgId)
        .maybeSingle();
    if (error?.code === '42703') {
        // Migration 20261129100000 not applied yet: every org is on the legacy wizard.
        const legacy = await supabase.from('onboarding_progress').select('status, completed_at').eq('organization_id', orgId).maybeSingle();
        if (legacy.error) throw legacy.error;
        return legacy.data ? { ...legacy.data, flow: 'LEGACY', steps: {} } as { flow: string; status: string; steps: unknown; completed_at: string | null } : null;
    }
    if (error) throw error;
    return data as { flow: string; status: string; steps: unknown; completed_at: string | null } | null;
}

interface ProfileRow {
    name: string | null; email: string | null; first_name: string | null; last_name: string | null; date_of_birth: string | null;
    avatar_url: string | null; phone: string | null; phone_verified_at: string | null; preferences: any;
}

async function loadProfile(userId: string): Promise<ProfileRow | null> {
    const first = await supabase
        .from('users')
        .select('name, email, first_name, last_name, date_of_birth, avatar_url, phone, phone_verified_at, preferences')
        .eq('id', userId)
        .maybeSingle();
    if (first.error?.code === '42703') {
        // Phone columns (migration 20261129110000) not applied yet.
        const { data, error } = await supabase.from('users').select('name, email, first_name, last_name, date_of_birth, avatar_url, preferences').eq('id', userId).maybeSingle();
        if (error) throw error;
        return data ? { ...(data as any), phone: null, phone_verified_at: null } as ProfileRow : null;
    }
    if (first.error) throw first.error;
    return first.data as ProfileRow | null;
}

/** First name / last name to prefill: saved ones, else split from users.name (Apple/Google or sign-up). */
function prefillName(p: Awaited<ReturnType<typeof loadProfile>>) {
    if (p?.first_name || p?.last_name) return { firstName: p.first_name || '', lastName: p.last_name || '' };
    const raw = String(p?.name || '').trim();
    const emailPrefix = String(p?.email || '').split('@')[0];
    if (!raw || raw === emailPrefix) return { firstName: '', lastName: '' };
    const parts = raw.split(/\s+/);
    return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

export const getPersonalOnboardingState = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const [progress, profile] = await Promise.all([loadProgress(ctx.orgId), loadProfile(ctx.userId)]);
        if (!profile) return res.status(404).json({ error: 'User not found' });
        const prefill = prefillName(profile);
        return res.json({
            // No row = an org that predates onboarding: treated as finished, like the legacy wizard does.
            flow: progress?.flow ?? 'LEGACY',
            status: progress?.status ?? 'COMPLETED',
            completedAt: progress?.completed_at ?? null,
            steps: parseStoredSteps(progress?.steps),
            profile: {
                firstName: prefill.firstName,
                lastName: prefill.lastName,
                dateOfBirth: profile?.date_of_birth ?? null,
                avatarUrl: profile?.avatar_url ?? null,
                email: profile?.email ?? null,
                phone: profile?.phone_verified_at ? profile?.phone ?? null : null,
                phoneNetwork: profile?.phone_verified_at && profile?.phone ? (() => { const p = parseZambianMobile(profile.phone); return 'network' in p ? p.network : null; })() : null,
                intents: cleanIntents(profile?.preferences?.onboarding?.intents),
                providerPhotoUrl: await providerPhoto(ctx.userId),
            },
        });
    } catch (e: any) {
        console.error('[PersonalOnboarding] state', e);
        return res.status(500).json({ error: 'Failed to load onboarding' });
    }
};

/** Rename "<old>'s Workspace" after the person's first name. A name they chose themselves is never touched. */
async function renameDefaultWorkspace(orgId: string, firstName: string) {
    const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
    if (!org || !isDefaultWorkspaceName(org.name)) return;
    const base = `${firstName}'s Workspace`;
    if (org.name === base) return;
    for (let n = 1; n <= 50; n++) {
        const candidate = n === 1 ? base : `${base} ${n}`;
        if (candidate === org.name) return;
        const { data: clash } = await supabase.from('organizations').select('id').ilike('name', candidate).neq('id', orgId).maybeSingle();
        if (clash) continue;
        const { error } = await supabase.from('organizations').update({ name: candidate }).eq('id', orgId);
        if (error) console.error('[PersonalOnboarding] workspace rename failed:', error.message);
        return;
    }
}

type StepResult = { ok: true; data?: Record<string, unknown> } | { ok: false; status: number; error: string; field?: string };

/** What each step saves. Steps without data (or not built yet) just record their state. */
async function applyStepData(key: PersonalStepKey, data: any, ctx: { orgId: string; userId: string }): Promise<StepResult> {
    if (key === 'name') {
        const first = normaliseNamePart(data?.firstName);
        if ('error' in first) return { ok: false, status: 400, error: first.error, field: 'firstName' };
        const last = normaliseNamePart(data?.lastName);
        if ('error' in last) return { ok: false, status: 400, error: last.error, field: 'lastName' };
        const { error } = await supabase.from('users')
            .update({ first_name: first.value, last_name: last.value, name: `${first.value} ${last.value}` })
            .eq('id', ctx.userId);
        if (error) throw error;
        await renameDefaultWorkspace(ctx.orgId, first.value);
        return { ok: true, data: { firstName: first.value, lastName: last.value } };
    }
    if (key === 'dob') {
        const dob = validateDateOfBirth(data?.dateOfBirth);
        if ('error' in dob) return { ok: false, status: 400, error: dob.error, field: 'dateOfBirth' };
        const { error } = await supabase.from('users').update({ date_of_birth: dob.iso }).eq('id', ctx.userId);
        if (error) throw error;
        return { ok: true, data: { dateOfBirth: dob.iso, adult: dob.age >= 18 } };
    }
    if (key === 'phone') {
        // Done only through /phone/verify; a plain "done" is accepted once the number is verified.
        const p = await loadProfile(ctx.userId);
        if (!p?.phone_verified_at) return { ok: false, status: 400, error: 'Verify your number first', field: 'phone' };
        return { ok: true };
    }
    if (key === 'intents') {
        const intents = cleanIntents(data?.intents);
        await mergeUserPreferences(ctx.userId, { onboarding: { intents } });
        return { ok: true, data: { intents } };
    }
    return { ok: true };
}

export const savePersonalOnboardingStep = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const key = req.params.key;
        if (!isPersonalStepKey(key)) return res.status(404).json({ error: 'Unknown step' });
        const t = checkStepTransition(key, req.body?.state);
        if ('error' in t) return res.status(400).json({ error: t.error });

        const progress = await loadProgress(ctx.orgId);
        if (progress?.flow !== 'PERSONAL_V2') return res.status(409).json({ error: 'This account is not on the personal onboarding' });

        const steps: PersonalStepsMap = parseStoredSteps(progress.steps);
        // Going back and skipping a step already done keeps it done.
        const nextState = steps[key]?.state === 'done' && t.state === 'skipped' ? 'done' : t.state;

        let result: StepResult = { ok: true };
        if (t.state === 'done') {
            result = await applyStepData(key, req.body?.data, ctx);
            if (!result.ok) return res.status(result.status).json({ error: result.error, field: result.field });
        }

        steps[key] = { state: nextState, at: new Date().toISOString() };
        const { error } = await supabase.from('onboarding_progress')
            .update({ steps, updated_at: new Date().toISOString() })
            .eq('organization_id', ctx.orgId);
        if (error) throw error;

        return res.json({ steps, data: result.ok ? result.data ?? null : null });
    } catch (e: any) {
        console.error('[PersonalOnboarding] saveStep', e);
        return res.status(500).json({ error: 'Failed to save this step' });
    }
};

export const completePersonalOnboarding = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const progress = await loadProgress(ctx.orgId);
        if (progress?.flow !== 'PERSONAL_V2') return res.status(409).json({ error: 'This account is not on the personal onboarding' });
        if (progress.status === 'COMPLETED') return res.json({ status: 'COMPLETED', completedAt: progress.completed_at });

        const steps = parseStoredSteps(progress.steps);
        const missing = missingRequiredSteps(steps);
        if (missing.length) return res.status(400).json({ error: 'Some required steps are not finished', missing });

        const completedAt = new Date().toISOString();
        const { error } = await supabase.from('onboarding_progress')
            .update({ status: 'COMPLETED', completed_at: completedAt, updated_at: completedAt })
            .eq('organization_id', ctx.orgId);
        if (error) throw error;

        captureEvent('onboarding_completed', {
            feature: 'onboarding', workflow_id: ctx.orgId, organization_id: ctx.orgId, user_id: ctx.userId,
            flow: 'PERSONAL_V2',
            skipped_keys: Object.entries(steps).filter(([, v]) => v?.state === 'skipped').map(([k]) => k),
            done_keys: Object.entries(steps).filter(([, v]) => v?.state === 'done').map(([k]) => k),
        });
        return res.json({ status: 'COMPLETED', completedAt });
    } catch (e: any) {
        console.error('[PersonalOnboarding] complete', e);
        return res.status(500).json({ error: 'Failed to finish onboarding' });
    }
};


/** The photo Google/Apple gave at sign-in, if any (offered on the avatar step). */
async function providerPhoto(userId: string): Promise<string | null> {
    try {
        const { data } = await supabase.auth.admin.getUserById(userId);
        const m: any = data?.user?.user_metadata || {};
        const url = m.avatar_url || m.picture || null;
        return typeof url === 'string' && /^https:\/\//.test(url) ? url : null;
    } catch {
        return null;
    }
}

/** Shallow-merge into users.preferences, one level deep for the keys given. */
async function mergeUserPreferences(userId: string, patch: Record<string, Record<string, unknown>>) {
    const { data } = await supabase.from('users').select('preferences').eq('id', userId).maybeSingle();
    const prefs: Record<string, any> = { ...(data?.preferences || {}) };
    for (const [k, v] of Object.entries(patch)) prefs[k] = { ...(prefs[k] || {}), ...v };
    const { error } = await supabase.from('users').update({ preferences: prefs }).eq('id', userId);
    if (error) throw error;
}

export async function markStep(orgId: string, key: PersonalStepKey, state: 'done' | 'skipped'): Promise<PersonalStepsMap> {
    const progress = await loadProgress(orgId);
    const steps = parseStoredSteps(progress?.steps);
    steps[key] = { state: steps[key]?.state === 'done' ? 'done' : state, at: new Date().toISOString() };
    const { error } = await supabase.from('onboarding_progress').update({ steps, updated_at: new Date().toISOString() }).eq('organization_id', orgId);
    if (error) throw error;
    return steps;
}

// ── Phone (step "phone") ─────────────────────────────────────────────────────

/** POST /onboarding/personal/phone/send { phone } — sends a 6-digit code on WhatsApp. */
export const sendPhoneCode = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const parsed = parseZambianMobile(req.body?.phone);
        if ('error' in parsed) return res.status(400).json({ error: parsed.error, field: 'phone' });

        // The same number on another verified account can't be claimed twice.
        const { data: taken } = await supabase.from('users').select('id').eq('phone', parsed.e164).not('phone_verified_at', 'is', null).neq('id', ctx.userId).maybeSingle();
        if (taken) return res.status(409).json({ error: 'That number is already verified on another MoneyWise account', field: 'phone' });

        const { data: pending } = await supabase.from('phone_verifications').select('*').eq('user_id', ctx.userId).maybeSingle();
        const wait = resendWait(pending as PendingVerification | null);
        if (wait > 0) return res.status(429).json({ error: `Wait ${wait} seconds before asking for another code`, retryInSeconds: wait });

        const code = generateOtp();
        const now = Date.now();
        const { error } = await supabase.from('phone_verifications').upsert({
            user_id: ctx.userId, phone: parsed.e164, code_hash: hashOtp(ctx.userId, code), attempts: 0,
            sent_at: new Date(now).toISOString(), expires_at: new Date(now + OTP_TTL_MS).toISOString(), locked_until: null,
        }, { onConflict: 'user_id' });
        if (error) throw error;

        const sent = await whatsappService.sendMessage(toChatId(parsed.e164), otpMessage(code));
        if (!sent) {
            await supabase.from('phone_verifications').delete().eq('user_id', ctx.userId);
            return res.status(502).json({ error: 'We couldn’t send the code. Check the number uses WhatsApp, or skip for now.' });
        }
        captureEvent('phone_code_sent', { feature: 'onboarding', workflow_id: ctx.orgId, organization_id: ctx.orgId, user_id: ctx.userId, network: parsed.network });
        return res.json({ sent: true, channel: 'whatsapp', phone: parsed.e164, network: parsed.network, resendInSeconds: 30 });
    } catch (e: any) {
        console.error('[PersonalOnboarding] sendPhoneCode', e);
        return res.status(500).json({ error: 'Failed to send the code' });
    }
};

/** POST /onboarding/personal/phone/verify { code } — confirms the number and finishes step "phone". */
export const verifyPhoneCode = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const { data: pending } = await supabase.from('phone_verifications').select('*').eq('user_id', ctx.userId).maybeSingle();
        const { result, next } = checkOtp(ctx.userId, pending as PendingVerification | null, req.body?.code);
        if (!result.ok) {
            if (next) await supabase.from('phone_verifications').update(next).eq('user_id', ctx.userId);
            const msg = result.reason === 'wrong' ? `That code isn’t right. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left.`
                : result.reason === 'locked' ? 'Too many wrong codes. Try again in 10 minutes.'
                : result.reason === 'expired' ? 'That code has expired. Send a new one.'
                : 'Send a code first.';
            return res.status(400).json({ error: msg, field: 'code', reason: result.reason });
        }
        const phone = (pending as PendingVerification).phone;
        const { error } = await supabase.from('users').update({ phone, phone_verified_at: new Date().toISOString() }).eq('id', ctx.userId);
        if (error) throw error;
        await supabase.from('phone_verifications').delete().eq('user_id', ctx.userId);
        const parsed = parseZambianMobile(phone);
        const steps = await markStep(ctx.orgId, 'phone', 'done');
        return res.json({ steps, data: { phone, network: 'network' in parsed ? parsed.network : null } });
    } catch (e: any) {
        console.error('[PersonalOnboarding] verifyPhoneCode', e);
        return res.status(500).json({ error: 'Failed to verify the code' });
    }
};

// ── Avatar (step "avatar") ───────────────────────────────────────────────────

const AVATAR_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * POST /onboarding/personal/avatar
 *   { imageBase64, mime }  a picture (the app crops to a square and compresses to ≤ 300 KB first)
 *   { preset: 'preset:3' } one of the built-in characters
 *   { providerPhoto: true } the Google/Apple photo from sign-in
 *   { clear: true }        back to initials
 */
export const saveAvatar = async (req: any, res: Response): Promise<any> => {
    try {
        const ctx = orgContext(req, res);
        if (!ctx) return;
        const b = req.body || {};
        let avatarUrl: string | null = null;
        if (b.clear) avatarUrl = null;
        else if (b.preset !== undefined) {
            if (!isAvatarPreset(b.preset)) return res.status(400).json({ error: 'Unknown avatar' });
            avatarUrl = b.preset;
        } else if (b.providerPhoto) {
            avatarUrl = await providerPhoto(ctx.userId);
            if (!avatarUrl) return res.status(400).json({ error: 'No photo from your sign-in' });
        } else if (typeof b.imageBase64 === 'string') {
            const ext = AVATAR_MIME[String(b.mime)];
            if (!ext) return res.status(400).json({ error: 'Use a JPEG, PNG or WebP picture' });
            const buf = Buffer.from(b.imageBase64, 'base64');
            if (buf.length === 0 || buf.length > 600 * 1024) return res.status(400).json({ error: 'That picture is too large' });
            const path = `${ctx.userId}/avatar-${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from('user-avatars').upload(path, buf, { contentType: String(b.mime), upsert: true, cacheControl: '3600' });
            if (error) throw error;
            avatarUrl = supabase.storage.from('user-avatars').getPublicUrl(path).data.publicUrl;
        } else {
            return res.status(400).json({ error: 'Nothing to save' });
        }
        const { error } = await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', ctx.userId);
        if (error) throw error;
        const steps = await markStep(ctx.orgId, 'avatar', 'done');
        return res.json({ steps, data: { avatarUrl } });
    } catch (e: any) {
        console.error('[PersonalOnboarding] saveAvatar', e);
        return res.status(500).json({ error: 'Failed to save your picture' });
    }
};
