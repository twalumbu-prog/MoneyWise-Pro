import { Response } from 'express';
import { supabase } from '../lib/supabase';

export const getProducts = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user.organization_id;

        if (!organization_id) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('organization_id', organization_id)
            .order('name', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        console.error('[Products] Get error:', error);
        res.status(500).json({ error: 'Failed to fetch products', details: error.message });
    }
};

export const createProduct = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user.organization_id;
        const role = req.user.role;

        if (!organization_id) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        if (role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only administrators can manage products' });
        }

        const { name, description, price } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Product name is required' });
        }

        const productPrice = Number(price);
        if (isNaN(productPrice) || productPrice < 0) {
            return res.status(400).json({ error: 'Price must be a valid non-negative number' });
        }

        const { data, error } = await supabase
            .from('products')
            .insert({
                organization_id,
                name: name.trim(),
                description: description || null,
                price: productPrice,
                is_active: true
            })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error: any) {
        console.error('[Products] Create error:', error);
        res.status(500).json({ error: 'Failed to create product', details: error.message });
    }
};

export const updateProduct = async (req: any, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const organization_id = req.user.organization_id;
        const role = req.user.role;

        if (!organization_id) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        if (role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only administrators can manage products' });
        }

        // Verify product belongs to user's organization
        const { data: product, error: findError } = await supabase
            .from('products')
            .select('organization_id')
            .eq('id', id)
            .single();

        if (findError || !product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        if (product.organization_id !== organization_id) {
            return res.status(403).json({ error: 'Permission denied: Product belongs to another organization' });
        }

        const { name, description, price, is_active } = req.body;
        const updateData: any = {};

        if (name !== undefined) {
            if (name.trim() === '') {
                return res.status(400).json({ error: 'Product name cannot be empty' });
            }
            updateData.name = name.trim();
        }

        if (description !== undefined) updateData.description = description;

        if (price !== undefined) {
            const productPrice = Number(price);
            if (isNaN(productPrice) || productPrice < 0) {
                return res.status(400).json({ error: 'Price must be a valid non-negative number' });
            }
            updateData.price = productPrice;
        }

        if (is_active !== undefined) updateData.is_active = !!is_active;
        updateData.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        console.error('[Products] Update error:', error);
        res.status(500).json({ error: 'Failed to update product', details: error.message });
    }
};

export const deleteProduct = async (req: any, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const organization_id = req.user.organization_id;
        const role = req.user.role;

        if (!organization_id) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        if (role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only administrators can manage products' });
        }

        // Verify product belongs to user's organization
        const { data: product, error: findError } = await supabase
            .from('products')
            .select('organization_id')
            .eq('id', id)
            .single();

        if (findError || !product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        if (product.organization_id !== organization_id) {
            return res.status(403).json({ error: 'Permission denied: Product belongs to another organization' });
        }

        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error: any) {
        console.error('[Products] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete product', details: error.message });
    }
};
