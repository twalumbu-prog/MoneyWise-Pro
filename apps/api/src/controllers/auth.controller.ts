import express from 'express';
import { supabase } from '../lib/supabase';

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
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('employee_id')
            .eq('employee_id', employeeId)
            .single();

        if (existingUser) {
            // Retry with different ID if collision (simple retry logic)
            // For now just return error, highly unlikely
            return res.status(400).json({
                error: 'System busy, please try again.',
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
            // Rollback auth user
            await (supabase.auth as any).admin.deleteUser(authData.user.id);
            return res.status(500).json({
                error: 'Failed to create organization: ' + (orgError?.message || 'Unknown error'),
            });
        }

        // UPSERT user record into public.users table with organization_id
        const { error: dbError } = await supabase.from('users').upsert({
            id: authData.user.id,
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
            await (supabase.auth as any).admin.deleteUser(authData.user.id);
            await supabase.from('organizations').delete().eq('id', orgData.id);
            return res.status(500).json({
                error: 'Failed to create user profile: ' + dbError.message,
            });
        }

        return res.status(201).json({
            message: 'User registered successfully. You can now log in.',
            userId: authData.user.id,
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

        // Verify organization exists
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('id')
            .eq('id', organizationId)
            .single();

        if (orgError || !org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        // Generate employee ID if not provided
        const finalEmployeeId = employeeId || `EMP-${Date.now().toString().slice(-6)}`;

        // Check employee ID uniqueness
        const { data: existingUser } = await supabase
            .from('users')
            .select('employee_id')
            .eq('employee_id', finalEmployeeId)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'System busy, please try again.' });
        }

        // Create user in Supabase Auth
        const { data: authData, error: authError } = await (supabase.auth as any).admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm
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
            employee_id: finalEmployeeId,
            name,
            role: 'REQUESTOR', // Default role for join requests
            organization_id: organizationId,
            username: username || null,
            status: 'PENDING_APPROVAL'
        });

        if (dbError) {
            console.error('Database error in join request:', dbError);
            // Rollback auth user
            await (supabase.auth as any).admin.deleteUser(authData.user.id);
            return res.status(500).json({ error: 'Failed to create join request: ' + dbError.message });
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
