import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';

export const OrganizationController = {
    async getOrganization(req: Request, res: Response) {
        try {
            const organization_id = (req as any).user?.organization_id;

            if (!organization_id) {
                return res.status(400).json({ error: 'User does not belong to an organization' });
            }

            const { data, error } = await supabase
                .from('organizations')
                .select('id, name, slug, email, phone, address, tax_id, website')
                .eq('id', organization_id)
                .single();

            if (error) {
                return res.status(400).json({ error: error.message });
            }

            return res.json(data);
        } catch (error: any) {
            console.error('[Organization] Get error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async updateOrganization(req: Request, res: Response) {
        try {
            const organization_id = (req as any).user?.organization_id;

            if (!organization_id) {
                return res.status(400).json({ error: 'User does not belong to an organization' });
            }

            // Extract allowed fields
            const { name, email, phone, address, tax_id, website } = req.body;

            // Optional: Check if user is an ADMIN. 
            // Depending on requirements, we might restrict org updates to admins.
            const { data: userRoleData, error: userError } = await supabase
                .from('users')
                .select('role')
                .eq('id', (req as any).user.id)
                .single();

            if (userError || userRoleData?.role !== 'ADMIN') {
                return res.status(403).json({ error: 'Only admins can update organization settings' });
            }

            const updateData: any = {};
            if (name !== undefined) updateData.name = name;
            if (email !== undefined) updateData.email = email;
            if (phone !== undefined) updateData.phone = phone;
            if (address !== undefined) updateData.address = address;
            if (tax_id !== undefined) updateData.tax_id = tax_id;
            if (website !== undefined) updateData.website = website;

            updateData.updated_at = new Date().toISOString();

            const { data, error } = await supabase
                .from('organizations')
                .update(updateData)
                .eq('id', organization_id)
                .select('id, name, slug, email, phone, address, tax_id, website')
                .single();

            if (error) {
                return res.status(400).json({ error: error.message });
            }

            return res.json(data);
        } catch (error: any) {
            console.error('[Organization] Update error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async deleteOrganization(req: Request, res: Response) {
        try {
            const organization_id = (req as any).user?.organization_id;

            if (!organization_id) {
                return res.status(400).json({ error: 'User does not belong to an organization' });
            }

            // Exactly check if user is an ADMIN. 
            // Only admins should be able to delete the organization
            const { data: userRoleData, error: userError } = await supabase
                .from('users')
                .select('role')
                .eq('id', (req as any).user.id)
                .single();

            if (userError || userRoleData?.role !== 'ADMIN') {
                return res.status(403).json({ error: 'Only admins can delete the organization' });
            }

            console.log(`[Organization] Starting deletion process for org_id: ${organization_id}`);

            // 1. Fetch all users belonging to this organization
            const { data: orgUsers, error: usersError } = await supabase
                .from('users')
                .select('id')
                .eq('organization_id', organization_id);

            if (usersError) {
                console.error('[Organization] Failed to fetch users for deletion:', usersError);
                return res.status(500).json({ error: 'Failed to prepare organization deletion' });
            }

            // 2. Execute the database RPC to drop all relational data
            const { error: rpcError } = await supabase.rpc('delete_organization_data', {
                org_id: organization_id
            });

            if (rpcError) {
                console.error('[Organization] Database RPC deletion failed:', rpcError);
                return res.status(500).json({ error: 'Failed to clear organization relational data' });
            }

            // 3. Delete all Auth Identities via Supabase Admin API
            // This will automatically cascade delete from public.users
            const userIds = orgUsers?.map(u => u.id) || [];
            console.log(`[Organization] Deleting ${userIds.length} users from Auth...`);

            for (const uid of userIds) {
                const { error: authDelError } = await supabase.auth.admin.deleteUser(uid);
                if (authDelError) {
                    console.error(`[Organization] Failed to delete user ${uid} from Auth:`, authDelError);
                }
            }

            // 4. Finally, delete the organization record itself
            const { error: orgDelError } = await supabase
                .from('organizations')
                .delete()
                .eq('id', organization_id);

            if (orgDelError) {
                console.error('[Organization] Failed to delete organization record:', orgDelError);
                return res.status(500).json({ error: 'Failed to delete core organization record' });
            }

            console.log(`[Organization] Successfully completely deleted org_id: ${organization_id}`);
            return res.json({ success: true, message: 'Organization successfully deleted' });
        } catch (error: any) {
            console.error('[Organization] Delete error:', error);
            res.status(500).json({ error: 'Internal server error during deletion' });
        }
    }
};
