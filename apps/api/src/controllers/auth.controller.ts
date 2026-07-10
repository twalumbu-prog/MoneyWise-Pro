import express from 'express';
import { supabase } from '../lib/supabase';
import { seedDefaultAccounts } from '../services/account-provisioning.service';
import { captureEvent } from '../utils/analytics';
import { emailService } from '../services/email.service';

interface RegisterUserRequest {
    email: string;
    password: string;
    employeeId: string;
    name: string;
    role: 'REQUESTOR' | 'AUTHORISER' | 'ACCOUNTANT' | 'CASHIER' | 'ADMIN';
}

const getFrontendUrl = () => {
    if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
    if (process.env.NODE_ENV === 'production') return 'https://moneywise.blueopus.cloud';
    return 'http://localhost:5173';
};

export const registerUser = async (req: any, res: any): Promise<any> => {
    try {
        const { email, password, name, organizationName, username }: RegisterUserRequest & { organizationName?: string, username?: string } = req.body;

        // Defaults for organization creator
        const role = 'ADMIN';
        // Generate a random employee ID for the first user
        const employeeId = `ADMIN-${Date.now().toString().slice(-6)}`;

        // Validate required fields
        if (!email || !password || !name || !organizationName) {
            return res.status(400).json({
                error: 'Missing required fields: email, password, name, and organizationName are required',
            });
        }

        // Validate username uniqueness if provided
        if (username) {
            const { data: existingUsername } = await supabase
                .from('users')
                .select('id')
                .eq('username', username)
                .single();

            if (existingUsername) {
                return res.status(400).json({ error: 'Username is already taken' });
            }
        }

        // Validate password strength
        if (password.length < 6) {
            return res.status(400).json({
                error: 'Password must be at least 6 characters long',
            });
        }

        // Check if employee ID already exists (unlikely with timestamp but good practice)
        const { data: existingEmployee } = await supabase
            .from('users')
            .select('employee_id')
            .eq('employee_id', employeeId)
            .single();

        if (existingEmployee) {
            return res.status(400).json({
                error: 'System busy, please try again.',
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Check if user email already exists (case-insensitive)
        const { data: existingEmailUser } = await supabase
            .from('users')
            .select('id, email')
            .ilike('email', normalizedEmail)
            .maybeSingle();

        let userId: string;
        let isNewUser = false;
        let matchedUserId = existingEmailUser?.id || null;

        if (!matchedUserId) {
            // Check auth.users preemptively
            const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
            if (!listError && listData?.users) {
                const matchedAuthUser = listData.users.find(
                    (u: any) => u.email?.toLowerCase() === normalizedEmail
                );
                if (matchedAuthUser) {
                    matchedUserId = matchedAuthUser.id;
                    console.log(`[RegisterUser] Preemptively found existing user in auth.users: ${matchedUserId}`);
                }
            }
        }

        if (matchedUserId) {
            // Verify password using a separate throw-away client so the shared service-role
            // client's session is not overwritten. Signing in on the shared client makes all
            // subsequent queries run as the authenticated user, which trips RLS on
            // user_organizations (and skips RLS-disabled tables), breaking registration.
            const { createClient } = await import('@supabase/supabase-js');
            const verifyClient = createClient(
                process.env.SUPABASE_URL!,
                process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
                { auth: { persistSession: false } }
            );
            const { data: authSession, error: authSessionError } = await verifyClient.auth.signInWithPassword({
                email: normalizedEmail,
                password
            });

            if (authSessionError || !authSession.user) {
                return res.status(401).json({ error: 'Invalid password for the existing account' });
            }
            userId = authSession.user.id;
        } else {
            // Create user in Supabase Auth with password
            const { data: authData, error: authError } = await (supabase.auth as any).admin.createUser({
                email: normalizedEmail,
                password,
                email_confirm: true, // Auto-confirm email to enable immediate login
            });

            if (authError || !authData.user) {
                console.error('Auth error:', authError);
                return res.status(400).json({
                    error: authError?.message || 'Failed to create user account',
                });
            }
            userId = authData.user.id;
            isNewUser = true;
        }

        // Check if organization name already exists
        const { data: existingOrg } = await supabase
            .from('organizations')
            .select('name')
            .ilike('name', organizationName)
            .maybeSingle();

        if (existingOrg) {
            // Rollback auth user if new user
            if (isNewUser) {
                await (supabase.auth as any).admin.deleteUser(userId);
            }

            // Generate a suggestion
            let suggestion = '';
            let isUnique = false;
            let counter = 2;

            while (!isUnique) {
                const suggestedName = `${organizationName} ${counter}`;
                const { data: checkOrg } = await supabase
                    .from('organizations')
                    .select('name')
                    .ilike('name', suggestedName)
                    .maybeSingle();

                if (!checkOrg) {
                    suggestion = suggestedName;
                    isUnique = true;
                }
                counter++;
            }

            return res.status(400).json({
                error: `An organization with the name "${organizationName}" already exists. Did you mean to join it?`,
                suggestion: suggestion
            });
        }

        // Create Organization
        const orgName = organizationName;
        const slug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();

        const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .insert({
                name: orgName,
                slug: slug,
                // Wire the founding admin's email in immediately so payment/inflow/
                // requisition notifications work from the first transaction, instead of
                // depending solely on the ACTIVE-ADMIN fallback (getOrgNotificationRecipients)
                // to resolve it at send time. An org created without this sat with
                // organizations.email null until someone set it manually — confirmed live
                // as the cause of TAEMJA General Dealers never receiving payment emails.
                email: normalizedEmail
            })
            .select()
            .single();

        if (orgError || !orgData) {
            // Rollback auth user if new user
            if (isNewUser) {
                await (supabase.auth as any).admin.deleteUser(userId);
            }
            return res.status(500).json({
                error: 'Failed to create organization: ' + (orgError?.message || 'Unknown error'),
            });
        }

        // NOTE: No payment account is created here. Payment wallets are
        // pre-provisioned into the wallet_pool table and linked to the
        // organization during the onboarding wizard's wallet-activation step
        // (see onboarding.controller claimWallet / claim_pool_wallet RPC).

        // UPSERT user record into public.users table with organization_id
        const { error: dbError } = await supabase.from('users').upsert({
            id: userId,
            email: normalizedEmail,
            employee_id: employeeId,
            name,
            role,
            organization_id: orgData.id,
            username: username || null,
            status: 'ACTIVE'
        });

        if (dbError) {
            console.error('Database error:', dbError);
            // Rollback: delete the auth user and organization if database insert fails
            if (isNewUser) {
                await (supabase.auth as any).admin.deleteUser(userId);
            }
            await supabase.from('organizations').delete().eq('id', orgData.id);
            return res.status(500).json({
                error: 'Failed to create user profile: ' + dbError.message,
            });
        }

        // Insert into public.user_organizations
        const { error: uoError } = await supabase.from('user_organizations').insert({
            user_id: userId,
            organization_id: orgData.id,
            role,
            employee_id: employeeId,
            status: 'ACTIVE'
        });

        if (uoError) {
            console.error('Database user_organizations error:', uoError);
            // Rollback
            if (isNewUser) {
                await (supabase.auth as any).admin.deleteUser(userId);
                await supabase.from('users').delete().eq('id', userId);
            }
            await supabase.from('organizations').delete().eq('id', orgData.id);
            return res.status(500).json({
                error: 'Failed to link user to organization: ' + uoError.message,
            });
        }

        // Seed the baseline chart of accounts (MoneyWise wallet, Owner's Equity, Retained
        // Earnings) so the org's balance sheet balances from the start. Best-effort — never
        // blocks registration.
        await seedDefaultAccounts(orgData.id);

        // Seed the Main Wallet + onboarding progress so the wizard can start
        // immediately after sign-in. Best-effort: registration never fails on these.
        const { error: walletSeedError } = await supabase
            .from('organization_wallets')
            .insert({ organization_id: orgData.id, name: 'Main Wallet', is_main: true });
        if (walletSeedError) {
            console.error('[RegisterUser] Failed to seed Main Wallet:', walletSeedError.message);
        }
        const { error: onboardingSeedError } = await supabase
            .from('onboarding_progress')
            .insert({ organization_id: orgData.id, current_step: 1, completed_steps: [], status: 'IN_PROGRESS' });
        if (onboardingSeedError) {
            console.error('[RegisterUser] Failed to seed onboarding progress:', onboardingSeedError.message);
        }

        return res.status(201).json({
            message: 'User registered successfully. You can now log in.',
            userId: userId,
            organizationId: orgData.id,
            onboarding: true
        });
    } catch (error: any) {
        console.error('Registration error:', error);
        return res.status(500).json({
            error: 'Internal server error: ' + (error.message || 'Unknown error'),
        });
    }
};

export const simpleSignup = async (req: any, res: any): Promise<any> => {
    try {
        const { email, password } = req.body;

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({
                error: 'Missing required fields: email and password are required',
            });
        }

        // Validate password strength
        if (password.length < 6) {
            return res.status(400).json({
                error: 'Password must be at least 6 characters long',
            });
        }

        // Create user in Supabase Auth with password
        const { data: authData, error: authError } = await (supabase.auth as any).admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm email to enable immediate login
        });

        if (authError) {
            console.error('Auth error:', authError);
            return res.status(400).json({
                error: authError.message || 'Failed to create user account',
            });
        }

        if (!authData.user) {
            return res.status(500).json({
                error: 'User creation failed - no user returned',
            });
        }

        // UPSERT user record into public.users table with default values
        const { error: dbError } = await supabase.from('users').upsert({
            id: authData.user.id,
            employee_id: `EMP${Date.now()}`, // Generate a temporary employee ID
            name: email.split('@')[0], // Use email prefix as name
            role: 'REQUESTOR', // Default role
        });

        if (dbError) {
            console.error('Database error:', dbError);
            // Rollback: delete the auth user if database insert fails
            await (supabase.auth as any).admin.deleteUser(authData.user.id);
            return res.status(500).json({
                error: 'Failed to create user profile: ' + dbError.message,
            });
        }

        return res.status(201).json({
            message: 'Account created successfully. You can now log in.',
            userId: authData.user.id,
        });
    } catch (error: any) {
        console.error('Signup error:', error);
        return res.status(500).json({
            error: 'Internal server error: ' + (error.message || 'Unknown error'),
        });
    }
};

export const resolveUsername = async (req: any, res: any): Promise<any> => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('email') // We only need the email to perform the login
            .eq('username', username)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'Username not found' });
        }

        return res.json({ email: user.email });
    } catch (error: any) {
        console.error('Resolve username error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
/**
 * Start the password-reset flow. Mints a Supabase recovery link and delivers it via
 * Resend (Supabase's own recovery email was unreliable — same reasoning as team invites).
 *
 * Always responds 200 with the same generic message regardless of whether the email
 * maps to a real account, so this endpoint can't be used to enumerate registered users.
 */
export const forgotPassword = async (req: any, res: any): Promise<any> => {
    const genericResponse = {
        message: 'If an account exists for that email, a password reset link is on its way.',
    };

    try {
        const { email } = req.body;

        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'Email is required' });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Look up the user's display name for a friendlier email (best-effort).
        const { data: userRow } = await supabase
            .from('users')
            .select('name')
            .ilike('email', normalizedEmail)
            .maybeSingle();

        // Mint a recovery link. If the email doesn't belong to a real auth user,
        // generateLink errors — we swallow it and still return the generic response.
        const { data: linkData, error: linkError } = await (supabase.auth as any).admin.generateLink({
            type: 'recovery',
            email: normalizedEmail,
            options: {
                redirectTo: `${getFrontendUrl()}/reset-password`,
            },
        });

        if (linkError || !linkData?.properties?.action_link) {
            // Don't reveal that the account is missing — log and return success.
            console.warn(`[ForgotPassword] No recovery link generated for ${normalizedEmail}:`, linkError?.message);
            return res.json(genericResponse);
        }

        try {
            await emailService.sendPasswordReset({
                to: normalizedEmail,
                name: userRow?.name,
                actionLink: linkData.properties.action_link,
            });
        } catch (emailErr: any) {
            console.error('[ForgotPassword] Failed to send reset email:', emailErr);
        }

        return res.json(genericResponse);
    } catch (error: any) {
        console.error('Forgot password error:', error);
        // Still return the generic message so failures don't leak account existence.
        return res.json(genericResponse);
    }
};

export const completeInvitation = async (req: any, res: any): Promise<any> => {
    try {
        const userId = req.user.id;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Enforce our own 12-hour invite window on top of Supabase's own link expiry —
        // the user already has a valid session by this point (they clicked a Supabase
        // link that hasn't expired), but our business rule is stricter.
        const { data: userRow, error: fetchError } = await supabase
            .from('users')
            .select('organization_id, invite_expires_at')
            .eq('id', userId)
            .single();

        if (fetchError) throw fetchError;

        if (userRow?.invite_expires_at && new Date(userRow.invite_expires_at) < new Date()) {
            return res.status(410).json({ error: 'This invitation has expired. Ask your organization admin to resend it.' });
        }

        const { error } = await supabase
            .from('users')
            .update({ status: 'ACTIVE', invite_expires_at: null })
            .eq('id', userId);

        if (error) throw error;

        if (userRow?.organization_id) {
            await supabase
                .from('user_organizations')
                .update({ status: 'ACTIVE' })
                .eq('user_id', userId)
                .eq('organization_id', userRow.organization_id);
        }

        res.json({ message: 'Registration finalized successfully' });
    } catch (error: any) {
        console.error('Complete invitation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const searchOrganizations = async (req: any, res: any): Promise<any> => {
    try {
        const { query } = req.query;

        if (!query || query.length < 2) {
            return res.status(400).json({ error: 'Search query must be at least 2 characters long' });
        }

        const { data: organizations, error } = await supabase
            .from('organizations')
            .select('id, name, slug')
            .ilike('name', `%${query}%`)
            .limit(10);

        if (error) throw error;

        return res.json(organizations || []);
    } catch (error: any) {
        console.error('Organization search error:', error);
        return res.status(500).json({ error: 'Failed to search organizations' });
    }
};

export const joinRequest = async (req: any, res: any): Promise<any> => {
    try {
        const { email, password, name, organizationId, employeeId, username } = req.body;

        if (!email || !password || !name || !organizationId) {
            return res.status(400).json({
                error: 'Missing required fields: email, password, name, and organizationId are required',
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // Verify organization exists
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('id')
            .eq('id', organizationId)
            .single();

        if (orgError || !org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        const finalEmployeeId = employeeId || `EMP-${Date.now().toString().slice(-6)}`;

        const normalizedEmail = email.trim().toLowerCase();

        // Check if user already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('id, email')
            .ilike('email', normalizedEmail)
            .maybeSingle();

        let matchedUserId = existingUser?.id || null;
        let isExistingUser = !!existingUser;

        if (!isExistingUser) {
            // Check auth.users preemptively
            const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
            if (!listError && listData?.users) {
                const matchedAuthUser = listData.users.find(
                    (u: any) => u.email?.toLowerCase() === normalizedEmail
                );
                if (matchedAuthUser) {
                    matchedUserId = matchedAuthUser.id;
                    isExistingUser = true;
                    console.log(`[JoinRequest] Preemptively found existing user in auth.users: ${matchedUserId}`);
                }
            }
        }

        if (isExistingUser && matchedUserId) {
            // Verify password using a separate throw-away client so the shared service-role
            // client's session is not overwritten (which would cause RLS failures below).
            const { createClient } = await import('@supabase/supabase-js');
            const verifyClient = createClient(
                process.env.SUPABASE_URL!,
                process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
                { auth: { persistSession: false } }
            );
            const { data: authSession, error: authSessionError } = await verifyClient.auth.signInWithPassword({
                email: normalizedEmail,
                password
            });

            if (authSessionError || !authSession.user) {
                return res.status(401).json({ error: 'Invalid password for the existing account' });
            }

            const existingUserId = authSession.user.id;

            // Only create a public.users row if one doesn't already exist
            // (e.g. user exists in auth.users but not yet in public.users).
            // Do NOT overwrite an existing user's organization_id or status —
            // that would break their current active session.
            const { data: existingPublicUser } = await supabase
                .from('users')
                .select('id')
                .eq('id', existingUserId)
                .maybeSingle();

            if (!existingPublicUser) {
                const { error: upsertError } = await supabase.from('users').insert({
                    id: existingUserId,
                    email: normalizedEmail,
                    name: name || normalizedEmail.split('@')[0],
                    employee_id: finalEmployeeId,
                    organization_id: organizationId,
                    username: username || null,
                    status: 'PENDING_APPROVAL'
                });

                if (upsertError) {
                    console.error('[JoinRequest] Failed to create public profile for auth-only user:', upsertError);
                    return res.status(500).json({ error: 'Failed to create user profile: ' + upsertError.message });
                }
            }

            // Check if they are already in the organization
            const { data: existingMember } = await supabase
                .from('user_organizations')
                .select('status')
                .eq('user_id', existingUserId)
                .eq('organization_id', organizationId)
                .maybeSingle();

            if (existingMember) {
                if (existingMember.status === 'ACTIVE') {
                    return res.status(400).json({ error: 'You are already an active member of this organization' });
                } else if (existingMember.status === 'PENDING_APPROVAL') {
                    return res.status(400).json({ error: 'Your request to join this organization is already pending approval' });
                } else {
                    return res.status(400).json({ error: `Your membership status is ${existingMember.status}` });
                }
            }

            // Create new pending membership
            const { error: joinError } = await supabase.from('user_organizations').insert({
                user_id: existingUserId,
                organization_id: organizationId,
                role: 'REQUESTOR',
                employee_id: finalEmployeeId,
                status: 'PENDING_APPROVAL'
            });

            if (joinError) {
                console.error('Error joining org with existing user:', joinError);
                return res.status(500).json({ error: 'Failed to create join request: ' + joinError.message });
            }

            return res.status(201).json({
                message: 'Join request submitted successfully. Please wait for an admin to approve your account.',
                userId: existingUserId
            });
        }

        // New user path:
        // Validate username uniqueness
        if (username) {
            const { data: existingUsername } = await supabase
                .from('users')
                .select('id')
                .eq('username', username)
                .single();

            if (existingUsername) {
                return res.status(400).json({ error: 'Username is already taken' });
            }
        }

        // Create user in Supabase Auth
        const { data: authData, error: authError } = await (supabase.auth as any).admin.createUser({
            email: normalizedEmail,
            password,
            email_confirm: true,
        });

        if (authError) {
            console.error('Auth error in join request:', authError);
            return res.status(400).json({ error: authError.message || 'Failed to create user account' });
        }

        if (!authData.user) {
            return res.status(500).json({ error: 'User creation failed' });
        }

        // Insert into public.users with PENDING_APPROVAL status
        const { error: dbError } = await supabase.from('users').upsert({
            id: authData.user.id,
            email: normalizedEmail,
            employee_id: finalEmployeeId,
            name,
            role: 'REQUESTOR',
            organization_id: organizationId,
            username: username || null,
            status: 'PENDING_APPROVAL'
        });

        if (dbError) {
            console.error('Database error in join request:', dbError);
            await (supabase.auth as any).admin.deleteUser(authData.user.id);
            return res.status(500).json({ error: 'Failed to create join request: ' + dbError.message });
        }

        // Insert into public.user_organizations
        const { error: uoError } = await supabase.from('user_organizations').insert({
            user_id: authData.user.id,
            organization_id: organizationId,
            role: 'REQUESTOR',
            employee_id: finalEmployeeId,
            status: 'PENDING_APPROVAL'
        });

        if (uoError) {
            console.error('Database user_organizations error in join request:', uoError);
            await (supabase.auth as any).admin.deleteUser(authData.user.id);
            await supabase.from('users').delete().eq('id', authData.user.id);
            return res.status(500).json({ error: 'Failed to link user to organization: ' + uoError.message });
        }

        return res.status(201).json({
            message: 'Join request submitted successfully. Please wait for an admin to approve your account.',
            userId: authData.user.id
        });

    } catch (error: any) {
        console.error('Join request error:', error);
        return res.status(500).json({ error: 'Internal server error: ' + (error.message || 'Unknown error') });
    }
};

export const getMyOrganizations = async (req: any, res: any): Promise<any> => {
    try {
        const userId = req.user.id;

        const { data: memberships, error } = await supabase
            .from('user_organizations')
            .select(`
                role,
                status,
                employee_id,
                organization:organizations (
                    id,
                    name,
                    slug,
                    logo_url
                )
            `)
            .eq('user_id', userId);

        if (error) throw error;

        res.json(memberships || []);
    } catch (error: any) {
        console.error('Error fetching my organizations:', error);
        res.status(500).json({ error: 'Failed to fetch organizations', details: error.message });
    }
};

export const switchOrganization = async (req: any, res: any): Promise<any> => {
    try {
        const userId = req.user.id;
        const { organizationId } = req.body;

        if (!organizationId) {
            return res.status(400).json({ error: 'Organization ID is required' });
        }

        const { data: membership, error: memberError } = await supabase
            .from('user_organizations')
            .select('role, employee_id, status')
            .eq('user_id', userId)
            .eq('organization_id', organizationId)
            .maybeSingle();

        if (memberError || !membership) {
            return res.status(403).json({ error: 'You are not a member of this organization' });
        }

        if (membership.status !== 'ACTIVE') {
            return res.status(403).json({ error: `Cannot switch to this organization: membership status is ${membership.status}` });
        }

        const { error: updateError } = await supabase
            .from('users')
            .update({
                organization_id: organizationId,
                role: membership.role,
                employee_id: membership.employee_id,
                status: 'ACTIVE'
            })
            .eq('id', userId);

        if (updateError) throw updateError;

        const { data: updatedUser, error: userError } = await supabase
            .from('users')
            .select('id, name, email, role, organization_id, employee_id, status')
            .eq('id', userId)
            .single();

        if (userError) throw userError;

        res.json({
            message: 'Organization switched successfully',
            user: updatedUser
        });
    } catch (error: any) {
        console.error('Error switching organization:', error);
        res.status(500).json({ error: 'Failed to switch organization', details: error.message });
    }
};

