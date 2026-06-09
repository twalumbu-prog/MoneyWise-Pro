import express from 'express';
import { supabase } from '../lib/supabase';
import { LencoService } from '../services/lenco.service';

interface RegisterUserRequest {
    email: string;
    password: string;
    employeeId: string;
    name: string;
    role: 'REQUESTOR' | 'AUTHORISER' | 'ACCOUNTANT' | 'CASHIER' | 'ADMIN';
}

const getFrontendUrl = () => {
    if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
    if (process.env.NODE_ENV === 'production') return 'https://money-wise-pro-web.vercel.app';
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
            // Verify password for existing account by trying to sign in
            const { data: authSession, error: authSessionError } = await supabase.auth.signInWithPassword({
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
                slug: slug
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

        // Create Lenco Subaccount
        let lencoSubaccountId = null;
        try {
            const lencoAccount = await LencoService.createAccount(orgName);
            lencoSubaccountId = lencoAccount.id;
            
            // Update organization with the lenco_subaccount_id
            await supabase
                .from('organizations')
                .update({ lenco_subaccount_id: lencoSubaccountId })
                .eq('id', orgData.id);
        } catch (lencoError) {
            console.error('Failed to create Lenco subaccount during registration:', lencoError);
        }

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

        return res.status(201).json({
            message: 'User registered successfully. You can now log in.',
            userId: userId,
            organizationId: orgData.id
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
export const completeInvitation = async (req: any, res: any): Promise<any> => {
    try {
        const userId = req.user.id;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { error } = await supabase
            .from('users')
            .update({ status: 'ACTIVE' })
            .eq('id', userId);

        if (error) throw error;

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

            // Ensure they exist in public.users (in case they were only in auth.users)
            const { error: upsertError } = await supabase.from('users').upsert({
                id: existingUserId,
                email: normalizedEmail,
                name: name || normalizedEmail.split('@')[0],
                employee_id: finalEmployeeId,
                organization_id: organizationId, // Link to this org as active
                username: username || null,
                status: 'ACTIVE'
            });

            if (upsertError) {
                console.error('[JoinRequest] Failed to upsert public profile for existing auth user:', upsertError);
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

