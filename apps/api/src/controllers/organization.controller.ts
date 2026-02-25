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
    }
};
