import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';

export const listDepartments = async (req: Request, res: Response) => {
    try {
        const organizationId = (req as any).user.organization_id;

        const [deptResult, orgResult] = await Promise.all([
            supabase
                .from('departments')
                .select('*')
                .eq('organization_id', organizationId)
                .eq('is_archived', false)
                .order('name'),
            supabase
                .from('organizations')
                .select('use_departments')
                .eq('id', organizationId)
                .single(),
        ]);

        if (deptResult.error) throw deptResult.error;
        if (orgResult.error) throw orgResult.error;

        res.json({
            use_departments: orgResult.data?.use_departments ?? false,
            departments: deptResult.data ?? [],
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const createDepartment = async (req: Request, res: Response) => {
    try {
        const role = (req as any).user.role;
        if (role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
        const organizationId = (req as any).user.organization_id;
        const { name } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
        const { data, error } = await supabase
            .from('departments')
            .insert({ organization_id: organizationId, name: name.trim() })
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const updateDepartment = async (req: Request, res: Response) => {
    try {
        const role = (req as any).user.role;
        if (role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
        const organizationId = (req as any).user.organization_id;
        const { id } = req.params;
        const { name, is_archived } = req.body;
        const updates: any = {};
        if (name !== undefined) updates.name = name.trim();
        if (is_archived !== undefined) updates.is_archived = is_archived;
        const { data, error } = await supabase
            .from('departments')
            .update(updates)
            .eq('id', id)
            .eq('organization_id', organizationId)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const deleteDepartment = async (req: Request, res: Response) => {
    try {
        const role = (req as any).user.role;
        if (role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
        const organizationId = (req as any).user.organization_id;
        const { id } = req.params;
        const { error } = await supabase
            .from('departments')
            .delete()
            .eq('id', id)
            .eq('organization_id', organizationId);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};
