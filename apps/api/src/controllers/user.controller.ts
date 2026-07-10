import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { captureEvent } from '../utils/analytics';
import { emailService } from '../services/email.service';

const INVITE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export const getUsers = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const organization_id = (req as any).user.organization_id;

        if (!organization_id) {
            return res.status(400).json({ error: 'User does not belong to an organization' });
        }

        const { data: userOrgs, error } = await supabase
            .from('user_organizations')
            .select(`
                role,
                status,
                employee_id,
                created_at,
                user:users (*)
            `)
            .eq('organization_id', organization_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Map memberships to return objects that look like user profiles
        const formattedUsers = (userOrgs || []).map((uo: any) => {
            if (!uo.user) return null;
            return {
                ...uo.user,
                role: uo.role,
                status: uo.status,
                employee_id: uo.employee_id,
                created_at: uo.created_at
            };
        }).filter(Boolean);

        res.json(formattedUsers);
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

        const workflowId = `invite-${Date.now()}`;
        captureEvent('organization_invite_started', {
            feature: 'organization_invite', workflow_id: workflowId, organization_id, user_id: (req as any).user.id,
        });

        const normalizedEmail = email.trim().toLowerCase();

        // Check if user already exists in the system by email (case-insensitive)
        const { data: existingUser } = await supabase
            .from('users')
            .select('id, email')
            .ilike('email', normalizedEmail)
            .maybeSingle();

        let targetUserId = existingUser?.id || null;
        let isExistingUser = !!existingUser;

        if (!isExistingUser) {
            // Preemptively check if they exist in auth.users to avoid "already registered" error
            const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
            if (!listError && listData?.users) {
                const matchedAuthUser = listData.users.find(
                    (u: any) => u.email?.toLowerCase() === normalizedEmail
                );
                if (matchedAuthUser) {
                    targetUserId = matchedAuthUser.id;
                    isExistingUser = true;
                    console.log(`[CreateUser] Preemptively found user in auth.users: ${targetUserId}`);
                }
            }
        }

        if (isExistingUser && targetUserId) {
            // Check if they are already a member of this organization
            const { data: existingMember } = await supabase
                .from('user_organizations')
                .select('id, status')
                .eq('user_id', targetUserId)
                .eq('organization_id', organization_id)
                .maybeSingle();

            if (existingMember) {
                return res.status(400).json({ error: 'A user with this email address is already a member of this organization' });
            }

            const finalEmployeeId = employeeId || `EMP-${Date.now()}`;
            
            // Ensure they have a record in public.users (in case they were only in auth.users)
            const { error: upsertError } = await supabase.from('users').upsert({
                id: targetUserId,
                email: normalizedEmail,
                name: name || normalizedEmail.split('@')[0],
                role: role || 'REQUESTOR',
                employee_id: finalEmployeeId,
                organization_id: organization_id, // link to this organization as active
                username: username || null,
                status: 'ACTIVE'
            });

            if (upsertError) {
                console.error('[CreateUser] Failed to upsert public profile for existing auth user:', upsertError);
                throw upsertError;
            }

            // Link existing user to this organization
            const { error: uoError } = await supabase.from('user_organizations').insert({
                user_id: targetUserId,
                organization_id: organization_id,
                role: role || 'REQUESTOR',
                employee_id: finalEmployeeId,
                status: 'ACTIVE' // Directly active as the admin added them
            });

            if (uoError) {
                console.error('[CreateUser] user_organizations insert failed:', uoError);
                throw uoError;
            }

            // This path links an already-registered account directly — there's no
            // password to set, so sendTeamInvite doesn't apply. Without a notification
            // here, the person was silently added to a new org with zero email at all.
            const { data: orgRow } = await supabase.from('organizations').select('name').eq('id', organization_id).maybeSingle();
            try {
                await emailService.notifyAddedToOrganization({
                    to: normalizedEmail,
                    name: name || normalizedEmail.split('@')[0],
                    orgName: orgRow?.name || 'your organization',
                    role: role || 'REQUESTOR',
                });
            } catch (emailErr: any) {
                console.error('[CreateUser] Failed to send added-to-org email:', emailErr);
            }

            captureEvent('organization_invite_succeeded', {
                feature: 'organization_invite', workflow_id: workflowId, organization_id, user_id: (req as any).user.id,
                path: 'existing_user_added',
            });
            return res.status(201).json({
                message: `${name || normalizedEmail} already had a MoneyWise account, so they were added directly (no password-setup email needed) — we sent them a notification that they now have access to this organization.`,
                userId: targetUserId,
                status: 'ACTIVE'
            });
        }

        // Validate username uniqueness if provided and user does not exist
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
            if (process.env.NODE_ENV === 'production') return 'https://moneywise.blueopus.cloud';
            return 'http://localhost:5173';
        };

        const FRONTEND_URL = getFrontendUrl();

        // 1. Create the invited auth user and mint an invite link via Supabase Auth,
        // but don't let Supabase send its own invite email (unreliable) — we deliver
        // the action_link ourselves via Resend below.
        const { data: authData, error: authError } = await (supabase.auth as any).admin.generateLink({
            type: 'invite',
            email: normalizedEmail,
            options: {
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
            },
        });

        if (authError) {
            console.error('[CreateUser] Invitation failed:', authError);
            captureEvent('organization_invite_failed', {
                feature: 'organization_invite', workflow_id: workflowId, organization_id, user_id: (req as any).user.id,
                error_code: 'auth_provider_error', error_message: authError.message,
            });
            return res.status(400).json({ error: authError.message });
        }

        if (!authData.user) {
            return res.status(500).json({ error: 'User invitation failed - no user returned' });
        }

        // 2. Upsert user record in DB linked to organization with 'INVITED' status
        // Even though the database trigger handles this, we do it explicitly to be sure
        // and to handle fields the trigger might miss or to override defaults.
        const finalEmployeeId = employeeId || `EMP-${Date.now()}`;
        const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
        const { error: dbError } = await supabase.from('users').upsert({
            id: authData.user.id,
            email: normalizedEmail,
            name,
            role,
            employee_id: finalEmployeeId,
            organization_id: organization_id,
            username: username || null,
            status: 'INVITED',
            invite_expires_at: inviteExpiresAt
        });

        if (dbError) {
            console.error('[CreateUser] DB upsert failed:', dbError);
            throw dbError;
        }

        // Upsert public.user_organizations — the handle_new_user DB trigger already
        // inserts this row as part of the auth.users insert above, so a plain insert()
        // here always collided on the (user_id, organization_id) unique constraint.
        const { error: uoError } = await supabase.from('user_organizations').upsert({
            user_id: authData.user.id,
            organization_id: organization_id,
            role,
            employee_id: finalEmployeeId,
            status: 'INVITED'
        }, { onConflict: 'user_id,organization_id' });

        if (uoError) {
            console.error('[CreateUser] user_organizations upsert failed:', uoError);
            throw uoError;
        }

        // 3. Deliver the invite ourselves via Resend (non-fatal: the invite/user record
        // already exists even if the email send hiccups — admin can use "Resend").
        const { data: orgRow } = await supabase.from('organizations').select('name').eq('id', organization_id).maybeSingle();
        try {
            await emailService.sendTeamInvite({
                to: normalizedEmail,
                inviteeName: name,
                orgName: orgRow?.name || 'your organization',
                role,
                actionLink: authData.properties.action_link,
            });
        } catch (emailErr: any) {
            console.error('[CreateUser] Failed to send invite email:', emailErr);
        }

        captureEvent('organization_invite_succeeded', {
            feature: 'organization_invite', workflow_id: workflowId, organization_id, user_id: (req as any).user.id,
            path: 'invitation_sent',
        });
        res.status(201).json({
            message: 'Invitation sent successfully',
            userId: authData.user.id,
            status: 'INVITED'
        });

    } catch (error: any) {
        console.error('Error creating/inviting user:', error);
        captureEvent('organization_invite_failed', {
            feature: 'organization_invite', workflow_id: `invite-${Date.now()}`, organization_id: (req as any).user?.organization_id || 'unknown', user_id: (req as any).user?.id || 'unknown',
            error_code: 'server_error', error_message: error.message,
        });
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

        // Ensure target user has a membership record in this org (covers both active
        // members and pending join requestors whose users.organization_id may still
        // point to a different org).
        const { data: membership } = await supabase
            .from('user_organizations')
            .select('status')
            .eq('user_id', id)
            .eq('organization_id', organization_id)
            .maybeSingle();

        if (!membership) {
            return res.status(404).json({ error: 'User not found in organization' });
        }

        // Update user_organizations first
        const uoUpdates: any = {};
        if (role) uoUpdates.role = role;
        if (status) uoUpdates.status = status;

        if (Object.keys(uoUpdates).length > 0) {
            const { error: uoError } = await supabase
                .from('user_organizations')
                .update(uoUpdates)
                .eq('user_id', id)
                .eq('organization_id', organization_id);
            if (uoError) throw uoError;
        }

        // Sync role/status back to users table only when this org is the user's active one,
        // OR when approving a pending join request (status → ACTIVE) so the user can log in.
        const { data: curUser } = await supabase
            .from('users')
            .select('organization_id, status')
            .eq('id', id)
            .single();

        const userUpdates: any = {};
        if (name) userUpdates.name = name;

        const isActiveOrg = curUser && curUser.organization_id === organization_id;
        const isApproving = status === 'ACTIVE' && membership.status === 'PENDING_APPROVAL';

        if (isActiveOrg || isApproving) {
            if (role) userUpdates.role = role;
            if (status) userUpdates.status = status;
            // If approving a join request, also set the user's active org to this one
            if (isApproving && !isActiveOrg) {
                userUpdates.organization_id = organization_id;
            }
        }

        if (Object.keys(userUpdates).length > 0) {
            const { error: userError } = await supabase
                .from('users')
                .update(userUpdates)
                .eq('id', id);
            if (userError) throw userError;
        }

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

        // Delete membership from user_organizations
        const { error: uoDeleteError } = await supabase
            .from('user_organizations')
            .delete()
            .eq('user_id', id)
            .eq('organization_id', organization_id);
        if (uoDeleteError) throw uoDeleteError;

        // Check remaining memberships
        const { data: remainingOrgs } = await supabase
            .from('user_organizations')
            .select('organization_id, role, status, employee_id')
            .eq('user_id', id);

        if (!remainingOrgs || remainingOrgs.length === 0) {
            // No remaining orgs: do hard delete of invitation or soft delete of active/disabled user
            if (targetUser.status === 'INVITED') {
                const { error: dbError } = await supabase.from('users').delete().eq('id', id);
                if (dbError) throw dbError;

                const { error: authError } = await (supabase.auth as any).admin.deleteUser(id);
                if (authError) {
                    console.error('[DeleteUser] Auth hard delete failed:', authError);
                }

                return res.json({ message: 'Invitation cancelled and user removed successfully' });
            } else {
                const { error: authError } = await (supabase.auth as any).admin.updateUserById(id, {
                    ban_duration: '876000h' // Effectively ban forever
                });

                if (authError) {
                    console.error('[DeleteUser] Auth ban failed:', authError);
                }

                const { error: dbError } = await supabase
                    .from('users')
                    .update({ status: 'DISABLED' })
                    .eq('id', id);

                if (dbError) throw dbError;

                return res.json({ message: 'User deactivated successfully' });
            }
        } else {
            // Has other orgs: if the deleted org was active, switch active org to the first remaining one
            const { data: curUser } = await supabase
                .from('users')
                .select('organization_id')
                .eq('id', id)
                .single();

            if (curUser && curUser.organization_id === organization_id) {
                const nextOrg = remainingOrgs[0];
                await supabase
                    .from('users')
                    .update({
                        organization_id: nextOrg.organization_id,
                        role: nextOrg.role,
                        status: nextOrg.status,
                        employee_id: nextOrg.employee_id
                    })
                    .eq('id', id);
            }

            return res.json({ message: 'User removed from organization successfully' });
        }

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
            if (process.env.NODE_ENV === 'production') return 'https://moneywise.blueopus.cloud';
            return 'http://localhost:5173';
        };

        const FRONTEND_URL = getFrontendUrl();

        // Workaround for Supabase Auth not supporting re-sending invites directly:
        // Delete the existing INVITED user completely and create a new invite.

        // 1. Hard Delete
        const { error: uoDeleteError } = await supabase.from('user_organizations').delete().eq('user_id', id).eq('organization_id', organization_id);
        if (uoDeleteError) throw uoDeleteError;

        const { error: dbDeleteError } = await supabase.from('users').delete().eq('id', id);
        if (dbDeleteError) throw dbDeleteError;

        const { error: authDeleteError } = await (supabase.auth as any).admin.deleteUser(id);
        if (authDeleteError) {
            console.error('[ResendInvite] Warning: Auth hard delete failed:', authDeleteError);
        }

        // 2. Resend invitation via creating a new one. Same as createUser: mint the
        // link via generateLink and deliver it ourselves instead of Supabase's email.
        const { data: authData, error: authError } = await (supabase.auth as any).admin.generateLink({
            type: 'invite',
            email: targetUser.email,
            options: {
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
            },
        });

        if (authError) {
            console.error('[ResendInvite] Invitation failed:', authError);
            return res.status(400).json({ error: authError.message });
        }

        const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
        await supabase.from('users').update({ invite_expires_at: inviteExpiresAt }).eq('id', authData.user.id);

        const { data: orgRow } = await supabase.from('organizations').select('name').eq('id', organization_id).maybeSingle();
        try {
            await emailService.sendTeamInvite({
                to: targetUser.email,
                inviteeName: targetUser.name,
                orgName: orgRow?.name || 'your organization',
                role: targetUser.role,
                actionLink: authData.properties.action_link,
            });
        } catch (emailErr: any) {
            console.error('[ResendInvite] Failed to send invite email:', emailErr);
        }

        res.json({ message: 'Invitation resent successfully' });

    } catch (error: any) {
        console.error('Error resending invitation:', error);
        res.status(500).json({ error: 'Failed to resend invitation', details: error.message });
    }
};

export const getMyProfile = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const userId = (req as any).user.id;
        
        // We select individual fields. If payment_info is missing from the DB,
        // this might fail. We'll try to select basic info first, then attempt payment_info.
        const { data, error } = await supabase
            .from('users')
            .select('id, name, role, employee_id, payment_info')
            .eq('id', userId)
            .single();

        if (error) {
            // Fallback: Try selecting without payment_info if the first one failed
            // (Likely due to column not existing yet)
            console.warn('[GetMyProfile] Select with payment_info failed, trying basic select:', error.message);
            const { data: basicData, error: basicError } = await supabase
                .from('users')
                .select('id, name, role, employee_id')
                .eq('id', userId)
                .single();
            
            if (basicError) throw basicError;
            return res.json(basicData);
        }

        res.json(data);
    } catch (error: any) {
        console.error('[GetMyProfile] Final failure:', error);
        res.status(500).json({ error: 'Failed to fetch profile', details: error.message });
    }
};

export const updatePaymentInfo = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const userId = (req as any).user.id;
        const { payment_info } = req.body;

        if (!payment_info || typeof payment_info !== 'object') {
            return res.status(400).json({ error: 'payment_info must be a valid object' });
        }

        const { error } = await supabase
            .from('users')
            .update({ payment_info })
            .eq('id', userId);

        if (error) throw error;
        res.json({ message: 'Payment info updated successfully', payment_info });
    } catch (error: any) {
        console.error('Error updating payment info:', error);
        res.status(500).json({ error: 'Failed to update payment info', details: error.message });
    }
};

