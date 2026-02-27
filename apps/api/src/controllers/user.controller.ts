import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';

export const getUsers = async (req: AuthRequest, res: any): Promise<any> => {
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

export const getNotificationsSummary = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const organization_id = (req as any).user.organization_id;
        const userRole = (req as any).user.role;
        const user_id = (req as any).user.id;

        if (!organization_id) {
            return res.status(400).json({ error: 'User does not belong to an organization' });
        }

        const counts = {
            requisitions: 0,
            approvals: 0,
            vouchers: 0,
            disbursements: 0,
            settings: 0
        };

        // REQUESTOR checks
        const { count: reqCount } = await supabase
            .from('requisitions')
            .select('*', { count: 'exact', head: true })
            .eq('requestor_id', user_id)
            .eq('has_unread_updates', true);
        counts.requisitions = reqCount || 0;

        // AUTHORISER, ACCOUNTANT, ADMIN checks for approvals
        if (['AUTHORISER', 'ACCOUNTANT', 'ADMIN'].includes(userRole)) {
            const { count: appCount } = await supabase
                .from('requisitions')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organization_id)
                .in('status', ['DRAFT', 'SUBMITTED']);
            counts.approvals = appCount || 0;
        }

        // ACCOUNTANT, ADMIN checks for vouchers (DRAFT)
        if (['ACCOUNTANT', 'ADMIN'].includes(userRole)) {
            const { count: vouchCount } = await supabase
                .from('vouchers')
                .select('id, requisitions!inner(organization_id)', { count: 'exact', head: true })
                .eq('status', 'DRAFT')
                .eq('requisitions.organization_id', organization_id);
            counts.vouchers = vouchCount || 0;
        }

        // Cashier, Accountant, Admin checks
        if (['CASHIER', 'ACCOUNTANT', 'ADMIN'].includes(userRole)) {
            const { count: disbCount } = await supabase
                .from('requisitions')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organization_id)
                .in('status', ['AUTHORISED', 'CHANGE_SUBMITTED']);
            counts.disbursements = disbCount || 0;
        }

        // Admin checks
        if (userRole === 'ADMIN') {
            const { count: setCount } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organization_id)
                .eq('status', 'PENDING_APPROVAL');
            counts.settings = setCount || 0;
        }

        res.json(counts);
    } catch (error: any) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications', details: error.message });
    }
};

export const createUser = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const { email, name, role, employeeId, username } = req.body;
        const organization_id = (req as any).user.organization_id;
        const userRole = (req as any).user.role;

        if (!organization_id) {
            return res.status(400).json({ error: 'User does not belong to an organization' });
        }

        // Only Admin can create/invite users
        if (userRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Only admins can add users' });
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

        const getFrontendUrl = () => {
            if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
            if (process.env.NODE_ENV === 'production') return 'https://money-wise-pro-web.vercel.app';
            return 'http://localhost:5173';
        };

        const FRONTEND_URL = getFrontendUrl();

        // 1. Invite user via Supabase Auth
        const { data: authData, error: authError } = await (supabase.auth as any).admin.inviteUserByEmail(email, {
            data: {
                name,
                role,
                organization_id,
                employee_id: employeeId || `EMP-${Date.now()}`,
                username: username || null,
                status: 'INVITED',
                full_name: name
            },
            redirectTo: `${FRONTEND_URL}/join`,
        });

        if (authError) {
            console.error('[CreateUser] Invitation failed:', authError);
            return res.status(400).json({ error: authError.message });
        }

        if (!authData.user) {
            return res.status(500).json({ error: 'User invitation failed - no user returned' });
        }

        // 2. Upsert user record in DB linked to organization with 'INVITED' status
        // Even though the database trigger handles this, we do it explicitly to be sure 
        // and to handle fields the trigger might miss or to override defaults.
        const { error: dbError } = await supabase.from('users').upsert({
            id: authData.user.id,
            email: email,
            name,
            role,
            employee_id: employeeId || `EMP-${Date.now()}`,
            organization_id: organization_id,
            username: username || null,
            status: 'INVITED'
        });

        if (dbError) {
            console.error('[CreateUser] DB upsert failed:', dbError);
            throw dbError;
        }

        res.status(201).json({
            message: 'Invitation sent successfully',
            userId: authData.user.id,
            status: 'INVITED'
        });

    } catch (error: any) {
        console.error('Error creating/inviting user:', error);
        res.status(500).json({ error: 'Failed to create user', details: error.message });
    }
};

export const updateUser = async (req: AuthRequest, res: any): Promise<any> => {
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

export const deleteUser = async (req: AuthRequest, res: any): Promise<any> => {
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
            .select('organization_id, status')
            .eq('id', id)
            .single();

        if (!targetUser || targetUser.organization_id !== organization_id) {
            return res.status(404).json({ error: 'User not found in organization' });
        }

        if (targetUser.status === 'INVITED') {
            // Hard Delete Strategy for INVITED users:
            // Completely remove from auth and public to allow re-invitation

            // Note: Since we have a trigger, deleting from auth.users might automatically delete from public.users via ON DELETE CASCADE (if configured),
            // but we explicitly delete from public.users first to be safe, or just delete from auth.users.
            // Our schema doesn't seem to have CASCADE on users table from auth.users, so we delete both.

            const { error: dbError } = await supabase.from('users').delete().eq('id', id);
            if (dbError) throw dbError;

            const { error: authError } = await (supabase.auth as any).admin.deleteUser(id);
            if (authError) {
                console.error('[DeleteUser] Auth hard delete failed:', authError);
                // Even if auth fails, the DB record is gone, allowing re-invitation to potentially succeed if auth record was already gone
            }

            return res.json({ message: 'Invitation cancelled and user removed successfully' });
        }

        // Soft Delete Strategy for ACTIVE/DISABLED users:
        // 1. Update status in Auth to prevent login (Banning)
        // This keeps the user record in auth.users so foreign keys don't break,
        // but prevents them from accessing the system.
        const { error: authError } = await (supabase.auth as any).admin.updateUserById(id, {
            ban_duration: '876000h' // Effectively ban forever
        });

        if (authError) {
            console.error('[DeleteUser] Auth ban failed:', authError);
            // We continue even if auth fails, as they might already be deleted from Auth 
            // but left in DB due to a previous partial failure.
        }

        // 2. Update status in our DB to DISABLED
        const { error: dbError } = await supabase
            .from('users')
            .update({ status: 'DISABLED' })
            .eq('id', id);

        if (dbError) throw dbError;

        res.json({ message: 'User deactivated successfully' });

    } catch (error: any) {
        console.error('Error deactivating user:', error);
        res.status(500).json({ error: 'Failed to deactivate user', details: error.message });
    }
};

export const resendInvite = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const organization_id = (req as any).user.organization_id;
        const userRole = (req as any).user.role;

        // Verify admin
        if (userRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Only admins can resend invitations' });
        }

        // Ensure target user is in same org and INVITED
        const { data: targetUser } = await supabase
            .from('users')
            .select('organization_id, email, name, role, employee_id, username, status')
            .eq('id', id)
            .single();

        if (!targetUser || targetUser.organization_id !== organization_id) {
            return res.status(404).json({ error: 'User not found in organization' });
        }

        if (targetUser.status !== 'INVITED') {
            return res.status(400).json({ error: 'Can only resend invitations to users with INVITED status' });
        }

        const getFrontendUrl = () => {
            if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
            if (process.env.NODE_ENV === 'production') return 'https://money-wise-pro-web.vercel.app';
            return 'http://localhost:5173';
        };

        const FRONTEND_URL = getFrontendUrl();

        // Workaround for Supabase Auth not supporting re-sending invites directly:
        // Delete the existing INVITED user completely and create a new invite.

        // 1. Hard Delete
        const { error: dbDeleteError } = await supabase.from('users').delete().eq('id', id);
        if (dbDeleteError) throw dbDeleteError;

        const { error: authDeleteError } = await (supabase.auth as any).admin.deleteUser(id);
        if (authDeleteError) {
            console.error('[ResendInvite] Warning: Auth hard delete failed:', authDeleteError);
        }

        // 2. Resend invitation via creating a new one
        const { error: authError } = await (supabase.auth as any).admin.inviteUserByEmail(targetUser.email, {
            data: {
                name: targetUser.name,
                role: targetUser.role,
                organization_id: targetUser.organization_id,
                employee_id: targetUser.employee_id,
                username: targetUser.username,
                status: 'INVITED',
                full_name: targetUser.name
            },
            redirectTo: `${FRONTEND_URL}/join`,
        });

        if (authError) {
            console.error('[ResendInvite] Invitation failed:', authError);
            return res.status(400).json({ error: authError.message });
        }

        res.json({ message: 'Invitation resent successfully' });

    } catch (error: any) {
        console.error('Error resending invitation:', error);
        res.status(500).json({ error: 'Failed to resend invitation', details: error.message });
    }
};
