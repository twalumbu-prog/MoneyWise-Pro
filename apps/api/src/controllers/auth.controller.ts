import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';

interface RegisterUserRequest {
    email: string;
    password: string;
    employeeId: string;
    name: string;
    role: 'REQUESTOR' | 'AUTHORISER' | 'ACCOUNTANT' | 'CASHIER' | 'ADMIN';
}

export const registerUser = async (req: Request, res: Response): Promise<any> => {
    try {
        const { email, password, employeeId, name, role }: RegisterUserRequest = req.body;

        // Validate required fields
        if (!email || !password || !employeeId || !name || !role) {
            return res.status(400).json({
                error: 'Missing required fields: email, password, employeeId, name, and role are required',
            });
        }

        // Validate password strength
        if (password.length < 6) {
            return res.status(400).json({
                error: 'Password must be at least 6 characters long',
            });
        }

        // Validate role
        const validRoles = ['REQUESTOR', 'AUTHORISER', 'ACCOUNTANT', 'CASHIER', 'ADMIN'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({
                error: 'Invalid role. Must be one of: ' + validRoles.join(', '),
            });
        }

        // Check if employee ID already exists
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('employee_id')
            .eq('employee_id', employeeId)
            .single();

        if (existingUser) {
            return res.status(400).json({
                error: 'Employee ID already exists',
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

        // UPSERT user record into public.users table to handle potential race conditions with triggers
        const { error: dbError } = await supabase.from('users').upsert({
            id: authData.user.id,
            employee_id: employeeId,
            name,
            role,
        });

        if (dbError) {
            console.error('Database error:', dbError);
            // Rollback: delete the auth user if database insert fails
            await supabase.auth.admin.deleteUser(authData.user.id);
            return res.status(500).json({
                error: 'Failed to create user profile: ' + dbError.message,
            });
        }

        return res.status(201).json({
            message: 'User registered successfully. You can now log in.',
            userId: authData.user.id,
        });
    } catch (error: any) {
        console.error('Registration error:', error);
        return res.status(500).json({
            error: 'Internal server error: ' + (error.message || 'Unknown error'),
        });
    }
};

export const simpleSignup = async (req: Request, res: Response): Promise<any> => {
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
