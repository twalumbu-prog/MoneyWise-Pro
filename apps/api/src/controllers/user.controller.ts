import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { captureEvent } from '../utils/analytics';
import { emailService } from '../services/email.service';
import { pushService } from '../services/push.service';
import { matchUserToStaff } from '../lib/staffUserMatching';

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

        // Parse optional wallets_since timestamp (ms epoch or ISO string) sent by
        // the frontend so we can count only inflows that arrived after the user
        // last visited /cashbook.
        const walletsSinceRaw = req.query.wallets_since as string | undefined;
        let walletsSinceDate: Date | null = null;
        if (walletsSinceRaw) {
            const ts = Number(walletsSinceRaw);
            walletsSinceDate = !isNaN(ts) ? new Date(ts) : new Date(walletsSinceRaw);
            if (isNaN(walletsSinceDate.getTime())) walletsSinceDate = null;
        }

        const counts = {
            requisitions: 0,
            approvals: 0,
            vouchers: 0,
            disbursements: 0,
            settings: 0,
            wallets: 0,
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

        // Wallets badge: INFLOW COMPLETED entries since last /cashbook visit.
        // Only meaningful when the caller supplies wallets_since; without it we
        // return 0 so the badge stays hidden until the user has visited once.
        if (walletsSinceDate && ['CASHIER', 'ACCOUNTANT', 'ADMIN'].includes(userRole)) {
            const { count: walletsCount } = await supabase
                .from('cashbook_entries')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organization_id)
                .eq('entry_type', 'INFLOW')
                .eq('status', 'COMPLETED')
                .gt('created_at', walletsSinceDate.toISOString());
            counts.wallets = walletsCount || 0;
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

            // Try to link this team member to an unmatched payroll_staff row
            // (by email, then exact name) so any salary advance/loan they've
            // already raised is recognised by payroll. Non-fatal.
            try {
                await matchUserToStaff(organization_id, targetUserId);
            } catch (matchErr) {
                console.error('[CreateUser] staff auto-match failed:', matchErr);
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
            pushService.notifyAddedToOrganization(targetUserId, orgRow?.name || 'your organization', role || 'REQUESTOR')
                .catch(err => console.error('[CreateUser] Failed to send added-to-org push:', err));

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

        // Try to link this invitee to an unmatched payroll_staff row (by email,
        // then exact name) so any salary advance/loan they've already raised is
        // recognised by payroll once they accept. Non-fatal.
        try {
            await matchUserToStaff(organization_id, authData.user.id);
        } catch (matchErr) {
            console.error('[CreateUser] staff auto-match failed:', matchErr);
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

export const registerPushToken = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const userId = (req as any).user.id;
        const { token, platform } = req.body;

        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'token is required' });
        }
        if (platform !== 'ios' && platform !== 'android') {
            return res.status(400).json({ error: "platform must be 'ios' or 'android'" });
        }

        await pushService.registerToken(userId, token, platform);
        res.json({ message: 'Push token registered' });
    } catch (error: any) {
        console.error('Error registering push token:', error);
        res.status(500).json({ error: 'Failed to register push token', details: error.message });
    }
};

export const unregisterPushToken = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const { token } = req.body;
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'token is required' });
        }
        await pushService.unregisterToken(token);
        res.json({ message: 'Push token unregistered' });
    } catch (error: any) {
        console.error('Error unregistering push token:', error);
        res.status(500).json({ error: 'Failed to unregister push token', details: error.message });
    }
};

/**
 * Search MoneyWise recipients for P2P transfers (MoneyWise Pay).
 * Supports search by email, username, phone, name, or MoneyWise ID / UUID.
 */
export const searchRecipients = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const query = ((req.query.q as string) || (req.query.query as string) || '').trim();
        const currentUserId = (req as any).user?.id;
        const currentOrgId = (req as any).user?.organization_id;

        if (!query || query.length < 2) {
            return res.json([]);
        }

        const cleanHandle = query.startsWith('@') ? query.slice(1).trim() : query;
        const cleanPhone = query.replace(/[^0-9+]/g, '');
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
        // The four modes the UI advertises are email / "Lenco ID" (the MW-XXXXXXXX
        // shown throughout this file) / phone / username — but only email and
        // username were ever wired into this query. isMwId + shortHex, and the two
        // phone forms below, close that gap using the same matching verifyRecipient
        // already does correctly elsewhere in this file.
        const isMwId = /^MW-[0-9A-F]{8}$/i.test(query);
        const shortHex = isMwId ? query.slice(3).toLowerCase() : null;
        // Local numbers get typed/stored as either 0XXXXXXXXX or 260XXXXXXXXX —
        // generate both forms so a search matches regardless of which one a user's
        // payment_info happens to have.
        const phoneVariants = new Set<string>();
        if (cleanPhone.length >= 5) {
            const digitsOnly = cleanPhone.replace(/^\+/, '');
            phoneVariants.add(digitsOnly);
            if (digitsOnly.startsWith('0')) phoneVariants.add(`260${digitsOnly.slice(1)}`);
            if (digitsOnly.startsWith('260')) phoneVariants.add(`0${digitsOnly.slice(3)}`);
        }

        // 1. Search Users
        let userQuery = supabase
            .from('users')
            .select(`
                id,
                name,
                email,
                username,
                organization_id,
                payment_info,
                status
            `)
            .neq('status', 'DISABLED')
            .limit(15);

        // Filter out sender's own current user profile
        if (currentUserId) {
            userQuery = userQuery.neq('id', currentUserId);
        }

        const userOrConditions: string[] = [
            `email.ilike.%${query}%`,
            `username.ilike.%${cleanHandle}%`,
            `name.ilike.%${query}%`
        ];
        if (isUUID) {
            userOrConditions.push(`id.eq.${query}`);
        }
        for (const variant of phoneVariants) {
            userOrConditions.push(`payment_info->>mobile_money_number.ilike.%${variant}%`);
            userOrConditions.push(`payment_info->>phone.ilike.%${variant}%`);
        }

        userQuery = userQuery.or(userOrConditions.join(','));
        const { data: matchedUsers, error: userError } = await userQuery;
        if (userError) {
            console.error('[SearchRecipients] User search error:', userError);
        }
        let userResults = matchedUsers || [];

        // MW-ID short-code search: the id-derived code isn't a stored/indexed
        // column, so — same approach verifyRecipient already uses — pull a bounded
        // candidate set and match the prefix in memory instead of in SQL.
        if (shortHex && userResults.every((u: any) => !u.id.replace(/-/g, '').toLowerCase().startsWith(shortHex))) {
            let candidateQuery = supabase
                .from('users')
                .select('id, name, email, username, organization_id, payment_info, status')
                .neq('status', 'DISABLED')
                .limit(200);
            if (currentUserId) candidateQuery = candidateQuery.neq('id', currentUserId);
            const { data: candidates } = await candidateQuery;
            const prefixMatches = (candidates || []).filter((u: any) =>
                u.id.replace(/-/g, '').toLowerCase().startsWith(shortHex));
            const existingIds = new Set(userResults.map((u: any) => u.id));
            userResults = [...userResults, ...prefixMatches.filter((u: any) => !existingIds.has(u.id))];
        }

        // 2. Search Organizations (Workspaces / Businesses)
        let orgQuery = supabase
            .from('organizations')
            .select('id, name, logo_url, email, phone, public_username, slug, lenco_subaccount_id')
            .limit(15);

        // Only exclude current sender organization
        if (currentOrgId) {
            orgQuery = orgQuery.neq('id', currentOrgId);
        }

        const orgOrConditions: string[] = [
            `name.ilike.%${query}%`,
            `email.ilike.%${query}%`,
            `slug.ilike.%${cleanHandle}%`
        ];
        if (cleanHandle.length >= 2) {
            orgOrConditions.push(`public_username.ilike.%${cleanHandle}%`);
        }
        if (cleanPhone.length >= 5) {
            orgOrConditions.push(`phone.ilike.%${cleanPhone}%`);
        }
        if (isUUID) {
            orgOrConditions.push(`id.eq.${query}`);
        }

        orgQuery = orgQuery.or(orgOrConditions.join(','));
        const { data: matchedOrgs, error: orgError } = await orgQuery;
        if (orgError) {
            console.error('[SearchRecipients] Org search error:', orgError);
        }
        let orgResults = matchedOrgs || [];

        if (shortHex && orgResults.every((o: any) => !o.id.replace(/-/g, '').toLowerCase().startsWith(shortHex))) {
            let candidateOrgQuery = supabase
                .from('organizations')
                .select('id, name, logo_url, email, phone, public_username, slug, lenco_subaccount_id')
                .limit(200);
            if (currentOrgId) candidateOrgQuery = candidateOrgQuery.neq('id', currentOrgId);
            const { data: orgCandidates } = await candidateOrgQuery;
            const orgPrefixMatches = (orgCandidates || []).filter((o: any) =>
                o.id.replace(/-/g, '').toLowerCase().startsWith(shortHex));
            const existingOrgIds = new Set(orgResults.map((o: any) => o.id));
            orgResults = [...orgResults, ...orgPrefixMatches.filter((o: any) => !existingOrgIds.has(o.id))];
        }

        // 3. Look up user organizations for matched users
        const orgIdsToFetch = new Set<string>();
        userResults.forEach((u: any) => {
            if (u.organization_id) {
                orgIdsToFetch.add(u.organization_id);
            }
        });

        let orgMap = new Map<string, any>();
        if (orgIdsToFetch.size > 0) {
            const { data: userOrgs } = await supabase
                .from('organizations')
                .select('id, name, logo_url, lenco_subaccount_id')
                .in('id', Array.from(orgIdsToFetch));
            (userOrgs || []).forEach((o: any) => orgMap.set(o.id, o));
        }

        const results: any[] = [];
        const seenKeys = new Set<string>();

        // Format user results
        userResults.forEach((u: any) => {
            const userOrg = u.organization_id ? orgMap.get(u.organization_id) : null;
            const orgName = userOrg?.name || 'Personal Account';
            const isPersonal = orgName.toLowerCase().includes('workspace') ||
                orgName.toLowerCase().includes('personal') ||
                orgName.toLowerCase().includes('individual');
            const logoUrl = userOrg?.logo_url || null;
            const phone = u.payment_info?.mobile_money_number || u.payment_info?.phone || null;
            const mwId = `MW-${u.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

            const key = `user_${u.id}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                results.push({
                    id: u.id,
                    user_id: u.id,
                    name: u.name,
                    username: u.username || null,
                    email: u.email || null,
                    phone: phone,
                    organization_id: u.organization_id || null,
                    organization_name: orgName,
                    logo_url: logoUrl,
                    account_type: isPersonal ? 'PERSONAL' : 'BUSINESS',
                    moneywise_id: mwId,
                    lenco_subaccount_id: userOrg?.lenco_subaccount_id || null,
                    verified: true
                });
            }
        });

        // Format org results
        orgResults.forEach((o: any) => {
            const isPersonal = o.name.toLowerCase().includes('workspace') ||
                o.name.toLowerCase().includes('personal') ||
                o.name.toLowerCase().includes('individual');
            const mwId = `MW-${o.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

            const key = `org_${o.id}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                results.push({
                    id: o.id,
                    user_id: null,
                    name: o.name,
                    username: o.public_username || null,
                    email: o.email || null,
                    phone: o.phone || null,
                    organization_id: o.id,
                    organization_name: o.name,
                    logo_url: o.logo_url || null,
                    account_type: isPersonal ? 'PERSONAL' : 'BUSINESS',
                    moneywise_id: mwId,
                    lenco_subaccount_id: o.lenco_subaccount_id || null,
                    verified: true
                });
            }
        });

        res.json(results);
    } catch (error: any) {
        console.error('[SearchRecipients] Error:', error);
        res.status(500).json({ error: 'Failed to search recipients', details: error.message });
    }
};

/**
 * Verify a MoneyWise recipient by exact identifier (Email, Username, Phone, MoneyWise ID, or UUID).
 */
export const verifyRecipient = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const { identifier } = req.body;
        if (!identifier || typeof identifier !== 'string') {
            return res.status(400).json({ error: 'identifier is required' });
        }

        const trimmed = identifier.trim();
        const cleanHandle = trimmed.startsWith('@') ? trimmed.slice(1).trim() : trimmed;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
        const isMwId = /^MW-[0-9A-F]{8}$/i.test(trimmed);
        const shortHex = isMwId ? trimmed.slice(3).toLowerCase() : null;

        // 1. Try matching user
        let userQuery = supabase
            .from('users')
            .select(`
                id,
                name,
                email,
                username,
                organization_id,
                payment_info,
                status
            `)
            .neq('status', 'DISABLED');

        if (isUUID) {
            userQuery = userQuery.eq('id', trimmed);
        } else if (trimmed.includes('@')) {
            userQuery = userQuery.ilike('email', trimmed);
        } else if (cleanHandle) {
            userQuery = userQuery.ilike('username', cleanHandle);
        }

        const { data: userMatch } = await userQuery.maybeSingle();

        if (userMatch) {
            let userOrg: any = null;
            if (userMatch.organization_id) {
                const { data: orgData } = await supabase
                    .from('organizations')
                    .select('id, name, logo_url, lenco_subaccount_id')
                    .eq('id', userMatch.organization_id)
                    .maybeSingle();
                userOrg = orgData;
            }

            const orgName = userOrg?.name || 'Personal Account';
            const isPersonal = orgName.toLowerCase().includes('workspace') ||
                orgName.toLowerCase().includes('personal') ||
                orgName.toLowerCase().includes('individual');
            const mwId = `MW-${userMatch.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

            return res.json({
                found: true,
                recipient: {
                    id: userMatch.id,
                    user_id: userMatch.id,
                    name: userMatch.name,
                    username: userMatch.username || null,
                    email: userMatch.email || null,
                    phone: userMatch.payment_info?.mobile_money_number || userMatch.payment_info?.phone || null,
                    organization_id: userMatch.organization_id || null,
                    organization_name: orgName,
                    logo_url: userOrg?.logo_url || null,
                    account_type: isPersonal ? 'PERSONAL' : 'BUSINESS',
                    moneywise_id: mwId,
                    lenco_subaccount_id: userOrg?.lenco_subaccount_id || null,
                    verified: true
                }
            });
        }

        // 2. Try matching organization
        let orgQuery = supabase
            .from('organizations')
            .select('id, name, logo_url, email, phone, public_username, lenco_subaccount_id');

        if (isUUID) {
            orgQuery = orgQuery.eq('id', trimmed);
        } else if (trimmed.includes('@')) {
            orgQuery = orgQuery.ilike('email', trimmed);
        } else if (cleanHandle) {
            orgQuery = orgQuery.or(`public_username.ilike.${cleanHandle},name.ilike.${trimmed}`);
        }

        const { data: orgMatch } = await orgQuery.maybeSingle();

        if (orgMatch) {
            const isPersonal = orgMatch.name.toLowerCase().includes('workspace') ||
                orgMatch.name.toLowerCase().includes('personal') ||
                orgMatch.name.toLowerCase().includes('individual');
            const mwId = `MW-${orgMatch.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

            return res.json({
                found: true,
                recipient: {
                    id: orgMatch.id,
                    user_id: null,
                    name: orgMatch.name,
                    username: orgMatch.public_username || null,
                    email: orgMatch.email || null,
                    phone: orgMatch.phone || null,
                    organization_id: orgMatch.id,
                    organization_name: orgMatch.name,
                    logo_url: orgMatch.logo_url || null,
                    account_type: isPersonal ? 'PERSONAL' : 'BUSINESS',
                    moneywise_id: mwId,
                    lenco_subaccount_id: orgMatch.lenco_subaccount_id || null,
                    verified: true
                }
            });
        }

        // 3. If short MW-ID prefix was supplied, search by ID prefix
        if (shortHex) {
            const { data: prefixUsers } = await supabase
                .from('users')
                .select('id, name, email, username, organization_id, payment_info')
                .limit(50);

            const matchedUser = (prefixUsers || []).find((u: any) =>
                u.id.replace(/-/g, '').toLowerCase().startsWith(shortHex)
            );

            if (matchedUser) {
                let userOrg: any = null;
                if (matchedUser.organization_id) {
                    const { data: orgData } = await supabase
                        .from('organizations')
                        .select('id, name, logo_url, lenco_subaccount_id')
                        .eq('id', matchedUser.organization_id)
                        .maybeSingle();
                    userOrg = orgData;
                }

                const orgName = userOrg?.name || 'Personal Account';
                const isPersonal = orgName.toLowerCase().includes('workspace') ||
                    orgName.toLowerCase().includes('personal') ||
                    orgName.toLowerCase().includes('individual');
                const mwId = `MW-${matchedUser.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

                return res.json({
                    found: true,
                    recipient: {
                        id: matchedUser.id,
                        user_id: matchedUser.id,
                        name: matchedUser.name,
                        username: matchedUser.username || null,
                        email: matchedUser.email || null,
                        phone: matchedUser.payment_info?.mobile_money_number || matchedUser.payment_info?.phone || null,
                        organization_id: matchedUser.organization_id || null,
                        organization_name: orgName,
                        logo_url: userOrg?.logo_url || null,
                        account_type: isPersonal ? 'PERSONAL' : 'BUSINESS',
                        moneywise_id: mwId,
                        lenco_subaccount_id: userOrg?.lenco_subaccount_id || null,
                        verified: true
                    }
                });
            }
        }

        return res.json({ found: false, error: 'Recipient not found on MoneyWise' });
    } catch (error: any) {
        console.error('[VerifyRecipient] Error:', error);
        res.status(500).json({ error: 'Failed to verify recipient', details: error.message });
    }
};

