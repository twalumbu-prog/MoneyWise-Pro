/**
 * Social sign-in (Google / Apple) support.
 *
 * Supabase handles the sign-in itself and links a Google/Apple identity to an existing email account
 * when the email matches (so one person never ends up with two accounts). A database trigger already
 * gives every new login a `users` row — but a BRAND-NEW social user has no organization yet, because
 * email sign-up creates the organization in the same request. These endpoints finish that for a user
 * who is already authenticated: save their real name (Apple only shares it once) and create their
 * personal workspace or business exactly the way email sign-up does.
 */
import { supabase } from '../lib/supabase';
import { seedDefaultAccounts, seedPersonalAccounts, purgeBusinessTemplateAccounts } from '../services/account-provisioning.service';
import { captureEvent } from '../utils/analytics';

const PLACEHOLDER_NAMES = new Set(['', 'unknown user']);
const clean = (v: unknown, max = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

async function loadUser(userId: string) {
    const { data } = await supabase.from('users').select('id, name, email').eq('id', userId).maybeSingle();
    return data as { id: string; name: string | null; email: string | null } | null;
}

/** Only replaces a missing/placeholder name — never overwrites one the person chose. */
async function applyNameIfMissing(userId: string, current: string | null | undefined, name: string, email?: string | null) {
    const cur = String(current || '').trim();
    const emailPrefix = (email || '').split('@')[0];
    const isPlaceholder = PLACEHOLDER_NAMES.has(cur.toLowerCase()) || (!!emailPrefix && cur === emailPrefix);
    if (name && isPlaceholder) await supabase.from('users').update({ name }).eq('id', userId);
}

/** POST /auth/social-profile  { name } */
export const saveSocialProfile = async (req: any, res: any): Promise<any> => {
    try {
        const userId = req.user.id;
        const name = clean(req.body?.name, 80);
        if (!name) return res.json({ updated: false });
        const user = await loadUser(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await applyNameIfMissing(userId, user.name, name, user.email);
        return res.json({ updated: true });
    } catch (e: any) {
        console.error('[SocialAuth] saveSocialProfile', e);
        return res.status(500).json({ error: 'Could not save your profile' });
    }
};

/**
 * POST /auth/complete-social-signup  { accountType: 'INDIVIDUAL' | 'BUSINESS', organizationName?, name? }
 * Creates the person's first organization. Safe to call twice: a personal workspace that already exists
 * is returned instead of duplicated.
 */
export const completeSocialSignup = async (req: any, res: any): Promise<any> => {
    try {
        const userId = req.user.id;
        const accountType = String(req.body?.accountType || '').toUpperCase();
        if (accountType !== 'INDIVIDUAL' && accountType !== 'BUSINESS') {
            return res.status(400).json({ error: 'accountType must be INDIVIDUAL or BUSINESS' });
        }

        const user = await loadUser(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const email = (user.email || req.user.email || '').trim().toLowerCase();

        const providedName = clean(req.body?.name, 80);
        await applyNameIfMissing(userId, user.name, providedName, email);
        const displayName = providedName
            || (PLACEHOLDER_NAMES.has(String(user.name || '').trim().toLowerCase()) ? (email.split('@')[0] || 'My') : String(user.name));

        // Already has a personal workspace? Hand it back rather than create a second one.
        if (accountType === 'INDIVIDUAL') {
            const { data: existing } = await supabase
                .from('user_organizations')
                .select('organization_id, role, organization:organizations(id, name, is_personal)')
                .eq('user_id', userId).eq('status', 'ACTIVE');
            const personal = (existing || []).find((m: any) => {
                const o = Array.isArray(m.organization) ? m.organization[0] : m.organization;
                return o?.is_personal === true;
            });
            if (personal) {
                await supabase.from('users').update({ organization_id: personal.organization_id, role: personal.role || 'ADMIN' }).eq('id', userId);
                return res.json({ organizationId: personal.organization_id, created: false });
            }
        }

        // Organization name. Businesses must be unique (same rule and suggestion as email sign-up);
        // personal workspaces are named after the person, so a clash just gets a number.
        const firstName = displayName.split(' ')[0] || displayName;
        let orgName = accountType === 'BUSINESS' ? clean(req.body?.organizationName, 100) : `${firstName}'s Workspace`;
        if (accountType === 'BUSINESS' && orgName.length < 2) return res.status(400).json({ error: 'Enter your business name' });

        const nameTaken = async (n: string) => !!(await supabase.from('organizations').select('id').ilike('name', n).maybeSingle()).data;
        if (await nameTaken(orgName)) {
            let n = 2;
            while (await nameTaken(`${orgName} ${n}`)) n++;
            const suggestion = `${orgName} ${n}`;
            if (accountType === 'BUSINESS') {
                return res.status(400).json({ error: `An organization with the name "${orgName}" already exists. Did you mean to join it?`, suggestion });
            }
            orgName = suggestion;
        }

        const slug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
        const isPersonal = accountType === 'INDIVIDUAL';
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .insert({ name: orgName, slug, email: email || null, is_personal: isPersonal })
            .select()
            .single();
        if (orgError || !org) return res.status(500).json({ error: 'Failed to create your account: ' + (orgError?.message || 'unknown error') });

        const employeeId = `${isPersonal ? 'PERS' : 'ADMIN'}-${Date.now().toString().slice(-6)}`;
        const { error: uoError } = await supabase.from('user_organizations').insert({
            user_id: userId, organization_id: org.id, role: 'ADMIN', employee_id: employeeId, status: 'ACTIVE',
        });
        if (uoError) {
            await supabase.from('organizations').delete().eq('id', org.id);
            return res.status(500).json({ error: 'Failed to link you to your account: ' + uoError.message });
        }
        await supabase.from('users').update({ organization_id: org.id, role: 'ADMIN', employee_id: employeeId, status: 'ACTIVE' }).eq('id', userId);

        // Same seeding as email sign-up: chart of accounts, Main Wallet, onboarding progress (best effort).
        if (isPersonal) {
            await seedPersonalAccounts(org.id);
            await purgeBusinessTemplateAccounts(org.id);
        } else {
            await seedDefaultAccounts(org.id);
        }
        const walletSeed = await supabase.from('organization_wallets').insert({ organization_id: org.id, name: 'Main Wallet', is_main: true });
        if (walletSeed.error) console.error('[SocialAuth] Main Wallet seed failed:', walletSeed.error.message);
        const progressSeed = await supabase.from('onboarding_progress').insert({ organization_id: org.id, current_step: 1, completed_steps: [], status: 'IN_PROGRESS' });
        if (progressSeed.error) console.error('[SocialAuth] onboarding seed failed:', progressSeed.error.message);

        captureEvent('social_signup_completed', {
            feature: 'auth', workflow_id: org.id, organization_id: org.id, user_id: userId, account_type: accountType,
        });
        return res.status(201).json({ organizationId: org.id, organizationName: org.name, created: true, onboarding: true });
    } catch (e: any) {
        console.error('[SocialAuth] completeSocialSignup', e);
        return res.status(500).json({ error: 'Could not finish setting up your account: ' + (e?.message || 'unknown error') });
    }
};
