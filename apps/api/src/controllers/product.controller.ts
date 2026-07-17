import { Response } from 'express';
import { supabase } from '../lib/supabase';

const VALID_PRODUCT_TYPES = ['PRODUCT', 'SERVICE_FIXED', 'SERVICE_VARIABLE', 'DONATION', 'SERVICE_BOOKING', 'SERVICE_BOOKING_DAILY', 'DIGITAL'];

/**
 * Normalise the digital_assets payload into a clean snapshot array. Each asset
 * must carry at least a `name` and a bucket `path`; size/content_type are kept
 * when present. Returns null for a non-array, and drops malformed entries so a
 * bad client payload can never poison delivery.
 */
const sanitizeDigitalAssets = (raw: any): { name: string; path: string; size?: number; content_type?: string }[] | null => {
    if (!Array.isArray(raw)) return null;
    return raw
        .filter((a: any) => a && typeof a.path === 'string' && a.path.trim() !== '')
        .map((a: any) => ({
            name: String(a.name || a.path.split('/').pop() || 'file'),
            path: String(a.path),
            ...(Number.isFinite(a.size) ? { size: Number(a.size) } : {}),
            ...(a.content_type ? { content_type: String(a.content_type) } : {}),
        }));
};

/**
 * Validates that an optional wallet/income-account reference belongs to the
 * caller's organization. Returns an error message string if invalid, else null.
 * A null/undefined id is allowed (the column falls back to defaults / AI).
 */
const validateOrgOwnedRef = async (
    table: 'organization_wallets' | 'accounts',
    id: string | null | undefined,
    organization_id: string
): Promise<string | null> => {
    if (id === undefined || id === null || id === '') return null;
    const { data, error } = await supabase
        .from(table)
        .select('organization_id')
        .eq('id', id)
        .single();
    if (error || !data) return `Referenced ${table === 'accounts' ? 'income account' : 'wallet'} not found`;
    if (data.organization_id !== organization_id) {
        return `Referenced ${table === 'accounts' ? 'income account' : 'wallet'} belongs to another organization`;
    }
    return null;
};

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

        const { name, description, price, image_url, product_type, wallet_id, income_account_id, category, digital_assets } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Product name is required' });
        }

        const productType = product_type || 'PRODUCT';
        if (!VALID_PRODUCT_TYPES.includes(productType)) {
            return res.status(400).json({ error: `Product type must be one of: ${VALID_PRODUCT_TYPES.join(', ')}` });
        }

        // Digital products deliver an uploaded file on payment — they must carry
        // at least one asset. Other types ignore the field.
        const digitalAssets = productType === 'DIGITAL' ? sanitizeDigitalAssets(digital_assets) : null;
        if (productType === 'DIGITAL' && (!digitalAssets || digitalAssets.length === 0)) {
            return res.status(400).json({ error: 'A digital product must have at least one uploaded file' });
        }

        // DONATION amounts are set by the payer; everything else carries a price.
        const productPrice = productType === 'DONATION' ? 0 : Number(price);
        if (productType !== 'DONATION' && (isNaN(productPrice) || productPrice < 0)) {
            return res.status(400).json({ error: 'Price must be a valid non-negative number' });
        }

        const walletErr = await validateOrgOwnedRef('organization_wallets', wallet_id, organization_id);
        if (walletErr) return res.status(400).json({ error: walletErr });
        const accountErr = await validateOrgOwnedRef('accounts', income_account_id, organization_id);
        if (accountErr) return res.status(400).json({ error: accountErr });

        const { data, error } = await supabase
            .from('products')
            .insert({
                organization_id,
                name: name.trim(),
                description: description || null,
                price: productPrice,
                image_url: image_url || null,
                product_type: productType,
                wallet_id: wallet_id || null,
                income_account_id: income_account_id || null,
                category: (category && category.trim()) || null,
                digital_assets: digitalAssets,
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
            .select('organization_id, product_type, digital_assets')
            .eq('id', id)
            .single();

        if (findError || !product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        if (product.organization_id !== organization_id) {
            return res.status(403).json({ error: 'Permission denied: Product belongs to another organization' });
        }

        const { name, description, price, is_active, image_url, product_type, wallet_id, income_account_id, category, digital_assets } = req.body;
        const updateData: any = {};

        if (name !== undefined) {
            if (name.trim() === '') {
                return res.status(400).json({ error: 'Product name cannot be empty' });
            }
            updateData.name = name.trim();
        }

        if (description !== undefined) updateData.description = description;

        if (product_type !== undefined) {
            if (!VALID_PRODUCT_TYPES.includes(product_type)) {
                return res.status(400).json({ error: `Product type must be one of: ${VALID_PRODUCT_TYPES.join(', ')}` });
            }
            updateData.product_type = product_type;
        }

        if (price !== undefined) {
            // DONATION carries no fixed price; the payer sets the amount.
            const effectiveType = product_type ?? product.product_type;
            const productPrice = effectiveType === 'DONATION' ? 0 : Number(price);
            if (effectiveType !== 'DONATION' && (isNaN(productPrice) || productPrice < 0)) {
                return res.status(400).json({ error: 'Price must be a valid non-negative number' });
            }
            updateData.price = productPrice;
        }

        if (image_url !== undefined) updateData.image_url = image_url || null;

        if (wallet_id !== undefined) {
            const walletErr = await validateOrgOwnedRef('organization_wallets', wallet_id, organization_id);
            if (walletErr) return res.status(400).json({ error: walletErr });
            updateData.wallet_id = wallet_id || null;
        }

        if (income_account_id !== undefined) {
            const accountErr = await validateOrgOwnedRef('accounts', income_account_id, organization_id);
            if (accountErr) return res.status(400).json({ error: accountErr });
            updateData.income_account_id = income_account_id || null;
        }

        if (category !== undefined) updateData.category = (category && category.trim()) || null;

        // Digital assets: sanitize when provided. If the product is (or is becoming)
        // DIGITAL, enforce at least one asset — checked against whatever the assets
        // will be after this update, whether newly supplied or already stored.
        const effectiveType = product_type ?? product.product_type;
        if (digital_assets !== undefined) {
            updateData.digital_assets = effectiveType === 'DIGITAL' ? sanitizeDigitalAssets(digital_assets) : null;
        } else if (product_type !== undefined && effectiveType !== 'DIGITAL') {
            // Switched away from DIGITAL without touching assets — clear stale files.
            updateData.digital_assets = null;
        }
        if (effectiveType === 'DIGITAL') {
            const finalAssets = updateData.digital_assets !== undefined
                ? updateData.digital_assets
                : sanitizeDigitalAssets((product as any).digital_assets);
            if (!finalAssets || finalAssets.length === 0) {
                return res.status(400).json({ error: 'A digital product must have at least one uploaded file' });
            }
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

export const getProductSales = async (req: any, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const organization_id = req.user.organization_id;

        if (!organization_id) {
            return res.status(400).json({ error: 'User organization context missing' });
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

        // Fetch completed product sales
        const { data: sales, error: salesError } = await supabase
            .from('product_sales')
            .select('*')
            .eq('product_id', id)
            .eq('status', 'COMPLETED')
            .order('created_at', { ascending: false });

        if (salesError) throw salesError;

        res.json(sales);
    } catch (error: any) {
        console.error('[Products] Get sales error:', error);
        res.status(500).json({ error: 'Failed to fetch product sales', details: error.message });
    }
};

