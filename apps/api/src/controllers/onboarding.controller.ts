import { Response } from 'express';
import { supabase } from '../lib/supabase';
import { captureEvent } from '../utils/analytics';
import { emailService } from '../services/email.service';
import { generateOnboardingCoa, PL_SECTIONS, PlSection } from '../services/onboarding-coa.service';

/**
 * Onboarding wizard backend.
 *
 * Every handler is scoped to req.user.organization_id (set by requireAuth).
 * Progress persists after every completed step so a refresh or a later login
 * resumes exactly where the user left off. Mutating endpoints are ADMIN-only:
 * onboarding configures the whole organization.
 */

const TOTAL_STEPS = 9; // steps 1-9; step 10 is the completion screen

const requireOrgAdmin = (req: any, res: Response): string | null => {
    const organization_id = req.user?.organization_id;
    if (!organization_id) {
        res.status(400).json({ error: 'User organization context missing' });
        return null;
    }
    if (req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Only administrators can manage onboarding' });
        return null;
    }
    return organization_id;
};

const getActivationSetting = async (): Promise<{ amount: number; currency: string }> => {
    const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'wallet_activation_amount')
        .maybeSingle();
    const value = (data?.value as any) || {};
    return {
        amount: Number(value.amount) > 0 ? Number(value.amount) : 50,
        currency: typeof value.currency === 'string' ? value.currency : 'ZMW',
    };
};

/** Fetch (or lazily create) the org's Main Wallet — the deposit destination. */
const getOrCreateMainWallet = async (organizationId: string): Promise<{ id: string } | null> => {
    const { data: existing } = await supabase
        .from('organization_wallets')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('is_main', true)
        .maybeSingle();
    if (existing) return existing;

    const { data: created, error } = await supabase
        .from('organization_wallets')
        .insert({ organization_id: organizationId, name: 'Main Wallet', is_main: true })
        .select('id')
        .single();
    if (error) {
        console.error('[Onboarding] Failed to seed Main Wallet:', error.message);
        return null;
    }
    return created;
};

// ── State ────────────────────────────────────────────────────────────────────

export const getOnboardingState = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        if (!organization_id) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const [progressRes, orgRes, profileRes, productsRes, poolRes, activation] = await Promise.all([
            supabase.from('onboarding_progress').select('*').eq('organization_id', organization_id).maybeSingle(),
            supabase.from('organizations').select('id, name, logo_url, lenco_subaccount_id').eq('id', organization_id).single(),
            supabase.from('business_profiles').select('*').eq('organization_id', organization_id).maybeSingle(),
            supabase.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', organization_id),
            supabase.from('wallet_pool').select('id, status, linked_at').eq('linked_organization_id', organization_id).maybeSingle(),
            getActivationSetting(),
        ]);

        if (orgRes.error || !orgRes.data) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        // Orgs that predate onboarding have no row → treat as completed.
        const progress = progressRes.data || {
            organization_id,
            current_step: TOTAL_STEPS + 1,
            completed_steps: Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1),
            status: 'COMPLETED',
            coa_saved: true,
            wallet_activated: true,
            wallet_activation_reference: null,
            completed_at: null,
        };

        return res.json({
            progress: {
                currentStep: progress.current_step,
                completedSteps: progress.completed_steps || [],
                status: progress.status,
                coaSaved: progress.coa_saved,
                walletActivated: progress.wallet_activated,
                walletActivationReference: progress.wallet_activation_reference,
            },
            organization: {
                id: orgRes.data.id,
                name: orgRes.data.name,
                logoUrl: orgRes.data.logo_url,
            },
            profile: profileRes.data || null,
            productCount: productsRes.count || 0,
            wallet: {
                linked: !!poolRes.data,
                linkedAt: poolRes.data?.linked_at || null,
                // Whether payments are configured at all (legacy orgs may have a
                // subaccount without a pool record).
                paymentsConfigured: !!orgRes.data.lenco_subaccount_id,
            },
            activation,
            totalSteps: TOTAL_STEPS,
        });
    } catch (error: any) {
        console.error('[Onboarding] getState error:', error);
        return res.status(500).json({ error: 'Failed to load onboarding state' });
    }
};

// ── Progress autosave ────────────────────────────────────────────────────────

export const saveProgress = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = requireOrgAdmin(req, res);
        if (!organization_id) return;

        const { currentStep, completedStep } = req.body;
        const step = Number(currentStep);
        if (!Number.isInteger(step) || step < 1 || step > TOTAL_STEPS + 1) {
            return res.status(400).json({ error: 'currentStep must be an integer between 1 and 11' });
        }

        const { data: existing } = await supabase
            .from('onboarding_progress')
            .select('completed_steps, status')
            .eq('organization_id', organization_id)
            .maybeSingle();

        if (existing?.status === 'COMPLETED') {
            return res.json({ message: 'Onboarding already completed' });
        }

        const completedSteps = new Set<number>(existing?.completed_steps || []);
        const done = Number(completedStep);
        if (Number.isInteger(done) && done >= 1 && done <= TOTAL_STEPS) {
            completedSteps.add(done);
        }

        const { error } = await supabase.from('onboarding_progress').upsert({
            organization_id,
            current_step: step,
            completed_steps: Array.from(completedSteps).sort((a, b) => a - b),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id' });

        if (error) throw error;
        return res.json({ message: 'Progress saved' });
    } catch (error: any) {
        console.error('[Onboarding] saveProgress error:', error);
        return res.status(500).json({ error: 'Failed to save progress' });
    }
};

// ── Step 1: organization name ────────────────────────────────────────────────

export const updateOrganizationName = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = requireOrgAdmin(req, res);
        if (!organization_id) return;

        const name = String(req.body?.name || '').trim();
        if (name.length < 2 || name.length > 120) {
            return res.status(400).json({ error: 'Organization name must be between 2 and 120 characters' });
        }

        // Unique across other organizations (case-insensitive).
        const { data: clash } = await supabase
            .from('organizations')
            .select('id')
            .ilike('name', name)
            .neq('id', organization_id)
            .maybeSingle();
        if (clash) {
            return res.status(409).json({ error: `An organization named "${name}" already exists.` });
        }

        const { error } = await supabase
            .from('organizations')
            .update({ name, updated_at: new Date().toISOString() })
            .eq('id', organization_id);
        if (error) throw error;

        return res.json({ message: 'Organization updated', name });
    } catch (error: any) {
        console.error('[Onboarding] updateOrganizationName error:', error);
        return res.status(500).json({ error: 'Failed to update organization name' });
    }
};

// ── Steps 2, 4, 5, 6: business profile ───────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s\-()]{7,20}$/;
const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i;

export const saveBusinessProfile = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = requireOrgAdmin(req, res);
        if (!organization_id) return;

        const b = req.body || {};
        const update: Record<string, any> = {};
        const fail = (msg: string) => res.status(400).json({ error: msg });

        // Industries / categories (arrays of short strings)
        for (const field of ['industries', 'store_categories'] as const) {
            if (b[field] !== undefined) {
                if (!Array.isArray(b[field]) || b[field].some((v: any) => typeof v !== 'string' || v.length > 80)) {
                    return fail(`${field} must be an array of strings`);
                }
                update[field] = [...new Set((b[field] as string[]).map(v => v.trim()).filter(Boolean))];
            }
        }

        // Contact
        if (b.phone !== undefined) {
            if (!PHONE_RE.test(String(b.phone).trim())) return fail('Please enter a valid business phone number');
            update.phone = String(b.phone).trim();
        }
        if (b.alt_phone !== undefined) {
            const v = String(b.alt_phone || '').trim();
            if (v && !PHONE_RE.test(v)) return fail('Please enter a valid alternative phone number');
            update.alt_phone = v || null;
        }
        if (b.business_email !== undefined) {
            if (!EMAIL_RE.test(String(b.business_email).trim())) return fail('Please enter a valid business email');
            update.business_email = String(b.business_email).trim().toLowerCase();
        }
        if (b.website !== undefined) {
            const v = String(b.website || '').trim();
            if (v && !URL_RE.test(v)) return fail('Please enter a valid website URL');
            update.website = v || null;
        }
        if (b.social_links !== undefined) {
            if (typeof b.social_links !== 'object' || Array.isArray(b.social_links)) {
                return fail('social_links must be an object');
            }
            const links: Record<string, string> = {};
            for (const [k, v] of Object.entries(b.social_links)) {
                const val = String(v || '').trim();
                if (!val) continue;
                if (val.length > 255) return fail(`Social link for ${k} is too long`);
                links[k.slice(0, 40)] = val;
            }
            update.social_links = links;
        }

        // Address
        for (const field of ['country', 'province', 'city', 'plot_number', 'street', 'postal_code'] as const) {
            if (b[field] !== undefined) {
                const v = String(b[field] || '').trim();
                if (v.length > 255) return fail(`${field} is too long`);
                update[field] = v || null;
            }
        }
        for (const field of ['latitude', 'longitude'] as const) {
            if (b[field] !== undefined) {
                const v = b[field] === null ? null : Number(b[field]);
                if (v !== null && (isNaN(v) || Math.abs(v) > 180)) return fail(`${field} is invalid`);
                update[field] = v;
            }
        }

        if (Object.keys(update).length === 0) {
            return fail('No valid fields to save');
        }

        const { data, error } = await supabase
            .from('business_profiles')
            .upsert(
                { organization_id, ...update, updated_at: new Date().toISOString() },
                { onConflict: 'organization_id' }
            )
            .select()
            .single();
        if (error) throw error;

        return res.json({ message: 'Profile saved', profile: data });
    } catch (error: any) {
        console.error('[Onboarding] saveBusinessProfile error:', error);
        return res.status(500).json({ error: 'Failed to save business profile' });
    }
};

// ── Step 9: chart of accounts ────────────────────────────────────────────────

export const generateChartOfAccounts = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = requireOrgAdmin(req, res);
        if (!organization_id) return;

        const [orgRes, profileRes, productsRes] = await Promise.all([
            supabase.from('organizations').select('name').eq('id', organization_id).single(),
            supabase.from('business_profiles').select('industries, store_categories').eq('organization_id', organization_id).maybeSingle(),
            supabase.from('products').select('name, product_type, category').eq('organization_id', organization_id).limit(100),
        ]);

        const { accounts, method } = await generateOnboardingCoa({
            organizationName: orgRes.data?.name || 'Business',
            industries: profileRes.data?.industries || [],
            storeCategories: profileRes.data?.store_categories || [],
            products: productsRes.data || [],
        });

        captureEvent('onboarding_coa_generated', {
            feature: 'onboarding', workflow_id: organization_id, organization_id,
            user_id: req.user.id, method, account_count: accounts.length,
        });

        return res.json({ accounts, method });
    } catch (error: any) {
        console.error('[Onboarding] generateChartOfAccounts error:', error);
        return res.status(500).json({ error: 'Failed to generate chart of accounts' });
    }
};

export const saveChartOfAccounts = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = requireOrgAdmin(req, res);
        if (!organization_id) return;

        const accounts = req.body?.accounts;
        if (!Array.isArray(accounts) || accounts.length === 0) {
            return res.status(400).json({ error: 'accounts must be a non-empty array' });
        }
        if (accounts.length > 100) {
            return res.status(400).json({ error: 'Too many accounts (max 100)' });
        }

        const rows: any[] = [];
        const seenCodes = new Set<string>();
        for (const acc of accounts) {
            const name = String(acc?.name || '').trim();
            const subtype = acc?.subtype as PlSection;
            const code = String(acc?.code || '').trim();
            if (!name || name.length > 120) {
                return res.status(400).json({ error: 'Every account needs a name (max 120 chars)' });
            }
            if (!PL_SECTIONS.includes(subtype)) {
                return res.status(400).json({ error: `Invalid section for "${name}"` });
            }
            if (!code || seenCodes.has(code)) {
                return res.status(400).json({ error: `Duplicate or missing code for "${name}"` });
            }
            seenCodes.add(code);
            rows.push({
                organization_id,
                code,
                name,
                type: subtype === 'Revenue' || subtype === 'Other Income' ? 'INCOME' : 'EXPENSE',
                subtype,
                description: String(acc?.description || '').slice(0, 300) || null,
                is_active: acc?.is_active !== false,
                updated_at: new Date().toISOString(),
            });
        }

        // Idempotent: re-saving updates the same (code, organization_id) rows.
        const { error } = await supabase
            .from('accounts')
            .upsert(rows, { onConflict: 'code,organization_id' });
        if (error) throw error;

        await supabase.from('onboarding_progress').upsert({
            organization_id,
            coa_saved: true,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id' });

        captureEvent('onboarding_coa_saved', {
            feature: 'onboarding', workflow_id: organization_id, organization_id,
            user_id: req.user.id, account_count: rows.length,
        });

        return res.json({ message: 'Chart of accounts saved', count: rows.length });
    } catch (error: any) {
        console.error('[Onboarding] saveChartOfAccounts error:', error);
        return res.status(500).json({ error: 'Failed to save chart of accounts' });
    }
};

// ── Step 10: wallet activation ───────────────────────────────────────────────

export const getWalletStatus = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        if (!organization_id) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const [poolRes, availableRes, orgRes, activation, mainWallet, progressRes] = await Promise.all([
            supabase.from('wallet_pool').select('id, provider_account_id, public_key, status, linked_at')
                .eq('linked_organization_id', organization_id).maybeSingle(),
            supabase.from('wallet_pool').select('id', { count: 'exact', head: true }).eq('status', 'AVAILABLE'),
            supabase.from('organizations').select('lenco_subaccount_id, lenco_public_key, payment_test_mode')
                .eq('id', organization_id).single(),
            getActivationSetting(),
            getOrCreateMainWallet(organization_id),
            supabase.from('onboarding_progress').select('wallet_activated, wallet_activation_reference')
                .eq('organization_id', organization_id).maybeSingle(),
        ]);

        return res.json({
            linked: !!poolRes.data,
            providerAccountId: poolRes.data?.provider_account_id || orgRes.data?.lenco_subaccount_id || null,
            publicKey: poolRes.data?.public_key || orgRes.data?.lenco_public_key || null,
            paymentTestMode: orgRes.data?.payment_test_mode || false,
            mainWalletId: mainWallet?.id || null,
            poolAvailable: (availableRes.count || 0) > 0,
            activation,
            activated: progressRes.data?.wallet_activated || false,
            activationReference: progressRes.data?.wallet_activation_reference || null,
        });
    } catch (error: any) {
        console.error('[Onboarding] getWalletStatus error:', error);
        return res.status(500).json({ error: 'Failed to load wallet status' });
    }
};

export const claimWallet = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = requireOrgAdmin(req, res);
        if (!organization_id) return;

        const { data, error } = await supabase.rpc('claim_pool_wallet', {
            p_organization_id: organization_id,
        });
        if (error) throw error;

        const claimed = Array.isArray(data) ? data[0] : data;

        if (!claimed) {
            // Pool exhausted: block activation, tell the user kindly, wake the admins.
            captureEvent('onboarding_wallet_pool_exhausted', {
                feature: 'onboarding', workflow_id: organization_id, organization_id, user_id: req.user.id,
            });
            const admins = String(process.env.SUPER_ADMIN_EMAILS || '')
                .split(',').map(e => e.trim()).filter(Boolean);
            if (admins.length > 0) {
                emailService.sendEmail({
                    to: admins,
                    subject: '⚠️ MoneyWise wallet pool is empty',
                    html: `<h2>Wallet pool exhausted</h2>
                           <p>An organization tried to activate a wallet during onboarding but no
                           AVAILABLE wallets remain in the pool. Please provision more Lenco
                           accounts into <code>wallet_pool</code>.</p>
                           <p>Organization ID: <code>${organization_id}</code></p>`,
                }).catch((e: any) => console.error('[Onboarding] Pool alert email failed:', e?.message));
            }
            return res.status(409).json({
                error: 'NO_WALLETS_AVAILABLE',
                message: "We're preparing new wallets right now. Our team has been notified — please try again shortly. Everything you've set up is saved.",
            });
        }

        await getOrCreateMainWallet(organization_id);

        captureEvent('onboarding_wallet_linked', {
            feature: 'onboarding', workflow_id: organization_id, organization_id,
            user_id: req.user.id, already_linked: claimed.already_linked,
        });

        // Never return api_secret — the RPC doesn't expose it and neither do we.
        return res.json({
            linked: true,
            alreadyLinked: !!claimed.already_linked,
            providerAccountId: claimed.provider_account_id,
            publicKey: claimed.public_key,
            linkedAt: claimed.linked_at,
        });
    } catch (error: any) {
        console.error('[Onboarding] claimWallet error:', error);
        return res.status(500).json({ error: 'Failed to link wallet. Please try again.' });
    }
};

/**
 * Confirm the activation deposit. The client passes the payment reference it
 * used for the Lenco checkout; we trust only the ledger — the cashbook INFLOW
 * for that reference must exist for this org and be COMPLETED (set by the
 * verified Lenco collection), otherwise activation is refused.
 */
export const confirmWalletActivation = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = requireOrgAdmin(req, res);
        if (!organization_id) return;

        const reference = String(req.body?.reference || '').trim();
        if (!reference) {
            return res.status(400).json({ error: 'reference is required' });
        }

        const { data: entry } = await supabase
            .from('cashbook_entries')
            .select('id, status')
            .eq('organization_id', organization_id)
            .eq('external_reference', reference)
            .eq('entry_type', 'INFLOW')
            .maybeSingle();

        if (!entry || entry.status !== 'COMPLETED') {
            return res.status(409).json({
                error: 'Payment not confirmed yet',
                status: entry?.status || 'NOT_FOUND',
            });
        }

        const { error } = await supabase.from('onboarding_progress').upsert({
            organization_id,
            wallet_activated: true,
            wallet_activation_reference: reference,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id' });
        if (error) throw error;

        captureEvent('onboarding_wallet_activated', {
            feature: 'onboarding', workflow_id: organization_id, organization_id,
            user_id: req.user.id, reference,
        });

        return res.json({ message: 'Wallet activated' });
    } catch (error: any) {
        console.error('[Onboarding] confirmWalletActivation error:', error);
        return res.status(500).json({ error: 'Failed to confirm wallet activation' });
    }
};

// ── Completion ───────────────────────────────────────────────────────────────

export const completeOnboarding = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = requireOrgAdmin(req, res);
        if (!organization_id) return;

        const { data: progress } = await supabase
            .from('onboarding_progress')
            .select('coa_saved, wallet_activated, status')
            .eq('organization_id', organization_id)
            .maybeSingle();

        if (progress?.status === 'COMPLETED') {
            return res.json({ message: 'Onboarding already completed' });
        }
        if (!progress?.coa_saved || !progress?.wallet_activated) {
            return res.status(400).json({
                error: 'Finish saving your chart of accounts and activating your wallet first',
            });
        }

        const { error } = await supabase.from('onboarding_progress').update({
            status: 'COMPLETED',
            current_step: TOTAL_STEPS + 1,
            completed_steps: Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }).eq('organization_id', organization_id);
        if (error) throw error;

        captureEvent('onboarding_completed', {
            feature: 'onboarding', workflow_id: organization_id, organization_id, user_id: req.user.id,
        });

        return res.json({ message: 'Onboarding complete. Welcome to MoneyWise!' });
    } catch (error: any) {
        console.error('[Onboarding] completeOnboarding error:', error);
        return res.status(500).json({ error: 'Failed to complete onboarding' });
    }
};
