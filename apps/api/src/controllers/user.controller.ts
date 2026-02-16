import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';

export const getUsers = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const organization_id = (req as any).user.organization_id;

        if (!organization_id) {
            return res.status(400).json({ error: 'User does not belong to an organization' });
        }

        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('organization_id', organization_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Filter out sensitive data if needed, though supabase client usually returns what's asked
        res.json(users);
    } catch (error: any) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users', details: error.message });
    }
};

export const createUser = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const { email, password, name, role, employeeId } = req.body;
        const organization_id = (req as any).user.organization_id;
        const userRole = (req as any).user.role;

        if (!organization_id) {
            return res.status(400).json({ error: 'User does not belong to an organization' });
        }

        // Only Admin can create users
        if (userRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Only admins can add users' });
        }

        // Create user in Supabase Auth
        const { data: authData, error: authError } = await (supabase.auth as any).admin.createUser({
            email,
            password,
            email_confirm: true,
        });

        if (authError) {
            return res.status(400).json({ error: authError.message });
        }

        if (!authData.user) {
            return res.status(500).json({ error: 'User creation failed' });
        }

        // Create user record in DB linked to organization
        const { error: dbError } = await supabase.from('users').insert({
            id: authData.user.id,
            email: email, // If email column exists, otherwise remove
            name,
            role,
            employee_id: employeeId || `EMP-${Date.now()}`,
            organization_id: organization_id,
            status: 'ACTIVE'
        });

        if (dbError) {
            // Rollback auth
            await (supabase.auth as any).admin.deleteUser(authData.user.id);
            throw dbError;
        }

        res.status(201).json({ message: 'User created successfully', userId: authData.user.id });

    } catch (error: any) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user', details: error.message });
    }
};

export const updateUser = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { role, status, name } = req.body;
        const organization_id = (req as any).user.organization_id;
        const userRole = (req as any).user.role;

        // Verify admin
        if (userRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Only admins can update users' });
        }

        // Ensure target user is in same org
        const { data: targetUser } = await supabase
            .from('users')
            .select('organization_id')
            .eq('id', id)
            .single();

        if (!targetUser || targetUser.organization_id !== organization_id) {
            return res.status(404).json({ error: 'User not found in organization' });
        }

        const updates: any = {};
        if (role) updates.role = role;
        if (status) updates.status = status;
        if (name) updates.name = name;

        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'User updated successfully' });

    } catch (error: any) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user', details: error.message });
    }
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const organization_id = (req as any).user.organization_id;
        const userRole = (req as any).user.role;

        // Verify admin
        if (userRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Only admins can delete users' });
        }

        // Ensure target user is in same org
        const { data: targetUser } = await supabase
            .from('users')
            .select('organization_id')
            .eq('id', id)
            .single();

        if (!targetUser || targetUser.organization_id !== organization_id) {
            return res.status(404).json({ error: 'User not found in organization' });
        }

        // Delete from Auth (Hard delete for now, or just status=DISABLED)
        const { error: authError } = await (supabase.auth as any).admin.deleteUser(id);
        if (authError) throw authError;

        // Delete from DB (Cascade should handle it via Auth ID if configured, but safe to delete)
        const { error: dbError } = await supabase.from('users').delete().eq('id', id);
        if (dbError) throw dbError;

        res.json({ message: 'User deleted successfully' });

    } catch (error: any) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user', details: error.message });
    }
};
