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

export interface CheckoutField { id: string; label: string; type: 'text' | 'select'; required: boolean; options?: string[] }

/** Normalise merchant-defined checkout fields; drops malformed entries (a select needs options). */
export const sanitizeCheckoutFields = (raw: any): CheckoutField[] => {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: CheckoutField[] = [];
    for (const f of raw.slice(0, 20)) {
        const label = typeof f?.label === 'string' ? f.label.trim().slice(0, 80) : '';
        const id = typeof f?.id === 'string' ? f.id.trim().slice(0, 40) : '';
        if (!label || !id || seen.has(id)) continue;
        const type = f.type === 'select' ? 'select' : 'text';
        if (type === 'select') {
            const options = Array.isArray(f.options)
                ? [...new Set(f.options.map((o: any) => String(o ?? '').trim().slice(0, 40)).filter(Boolean))] as string[]
                : [];
            if (options.length === 0) continue;
            out.push({ id, label, type, required: f.required !== false, options: options.slice(0, 30) });
        } else {
            out.push({ id, label, type, required: f.required !== false });
        }
        seen.add(id);
    }
    return out;
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

        const { name, description, price, image_url, product_type, wallet_id, income_account_id, category, digital_assets,
                requires_delivery, allow_external_delivery, own_delivery_charge,
                additional_images, whats_included, checkout_fields } = req.body;

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
                is_active: true,
                requires_delivery: requires_delivery === true,
                allow_external_delivery: allow_external_delivery === true,
                own_delivery_charge: Number(own_delivery_charge) || 0,
                additional_images: Array.isArray(additional_images) ? additional_images.filter((u: any) => typeof u === 'string' && u.trim()) : [],
                whats_included: Array.isArray(whats_included) ? whats_included.filter((s: any) => typeof s === 'string' && s.trim()) : [],
                checkout_fields: sanitizeCheckoutFields(checkout_fields),
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

        const { name, description, price, is_active, image_url, product_type, wallet_id, income_account_id, category, digital_assets,
                requires_delivery, allow_external_delivery, own_delivery_charge,
                additional_images, whats_included, checkout_fields } = req.body;
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
        if (requires_delivery !== undefined) updateData.requires_delivery = requires_delivery === true;
        if (allow_external_delivery !== undefined) updateData.allow_external_delivery = allow_external_delivery === true;
        if (own_delivery_charge !== undefined) updateData.own_delivery_charge = Number(own_delivery_charge) || 0;
        if (additional_images !== undefined) updateData.additional_images = Array.isArray(additional_images) ? additional_images.filter((u: any) => typeof u === 'string' && u.trim()) : [];
        if (whats_included !== undefined) updateData.whats_included = Array.isArray(whats_included) ? whats_included.filter((s: any) => typeof s === 'string' && s.trim()) : [];
        if (checkout_fields !== undefined) updateData.checkout_fields = sanitizeCheckoutFields(checkout_fields);
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


/**
 * GET /organizations/products/sales-by-reference/:reference
 * Returns all product_sales rows (with product snapshot) for a cashbook entry
 * identified by its external_reference. Used by the inflow detail drawer.
 */
export const getSalesByReference = async (req: any, res: Response): Promise<any> => {
    try {
        const { reference } = req.params;
        const organization_id = req.user.organization_id;

        if (!organization_id) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        const { data: sales, error: salesError } = await supabase
            .from('product_sales')
            .select('*, products(id, name, description, image_url, product_type)')
            .eq('organization_id', organization_id)
            .eq('reference', reference)
            .order('created_at', { ascending: true });

        if (salesError) throw salesError;
        res.json(sales || []);
    } catch (error: any) {
        console.error('[Products] Get sales by reference error:', error);
        res.status(500).json({ error: 'Failed to fetch sales', details: error.message });
    }
};


/**
 * GET /organizations/products/inflow-detail?reference=&entryId=
 * Everything the inflow detail view and receipt need for one money-in record:
 * the ledger entry (wallet, categorisation account, payer), the product sale lines
 * with the buyer's checkout answers + delivery status, and the double-entry
 * journal that records how it was treated in the books.
 */
export const getInflowDetail = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user.organization_id;
        if (!organization_id) return res.status(400).json({ error: 'User organization context missing' });

        const reference = typeof req.query.reference === 'string' ? req.query.reference : '';
        const entryId = typeof req.query.entryId === 'string' ? req.query.entryId : '';
        if (!reference && !entryId) return res.status(400).json({ error: 'reference or entryId is required' });

        const ENTRY_SELECT = 'id, description, debit, date, created_at, reference_number, external_reference, account_type, status, sender_name, sender_phone, qb_sync_status, wallet_id, account_id, accounts!account_id(id, code, name, category), organization_wallets:wallet_id(id, name), users!created_by(name)';

        // Entries: the exact row the user tapped, plus any siblings sharing its reference (split-routed sales).
        const entries: any[] = [];
        const seen = new Set<string>();
        const collect = (rows: any[] | null) => (rows || []).forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); entries.push(r); } });

        if (entryId) {
            const { data } = await supabase.from('cashbook_entries').select(ENTRY_SELECT)
                .eq('organization_id', organization_id).eq('id', entryId);
            collect(data);
        }
        const refs = [reference, ...entries.flatMap(e => [e.external_reference, e.reference_number])].filter(Boolean) as string[];
        const uniqueRefs = Array.from(new Set(refs));
        if (uniqueRefs.length) {
            const list = uniqueRefs.map(r => `"${r.replace(/"/g, '')}"`).join(',');
            const { data } = await supabase.from('cashbook_entries').select(ENTRY_SELECT)
                .eq('organization_id', organization_id).eq('entry_type', 'INFLOW')
                .or(`external_reference.in.(${list}),reference_number.in.(${list})`);
            collect(data);
        }

        const { data: sales } = uniqueRefs.length
            ? await supabase.from('product_sales')
                .select('*, products(id, name, description, image_url, product_type, price, requires_delivery)')
                .eq('organization_id', organization_id).in('reference', uniqueRefs)
                .order('created_at', { ascending: true })
            : { data: [] as any[] };

        // Accounting treatment: journals generated from these ledger rows (or sharing the reference).
        const entryIds = entries.map(e => e.id);
        const journalSelect = 'id, entry_date, description, reference_number, source_type, journal_lines(id, debit, credit, description, accounts(id, code, name, category))';
        const journals: any[] = [];
        const seenJ = new Set<string>();
        const addJ = (rows: any[] | null) => (rows || []).forEach(j => { if (!seenJ.has(j.id)) { seenJ.add(j.id); journals.push(j); } });
        if (entryIds.length) {
            const { data } = await supabase.from('journal_entries').select(journalSelect)
                .eq('organization_id', organization_id).in('source_id', entryIds);
            addJ(data);
        }
        if (journals.length === 0 && uniqueRefs.length) {
            const { data } = await supabase.from('journal_entries').select(journalSelect)
                .eq('organization_id', organization_id).in('reference_number', uniqueRefs);
            addJ(data);
        }

        const { data: org } = await supabase.from('organizations').select('name, logo_url').eq('id', organization_id).single();

        res.json({ organization: org || null, entries, sales: sales || [], journals });
    } catch (error: any) {
        console.error('[Products] Get inflow detail error:', error);
        res.status(500).json({ error: 'Failed to fetch inflow detail', details: error.message });
    }
};

/**
 * PATCH /organizations/products/sales/:id/delivery  { delivered: boolean }
 * Marks a product sale line as delivered (or back to pending).
 */
export const setSaleDelivery = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user.organization_id;
        if (!organization_id) return res.status(400).json({ error: 'User organization context missing' });
        const delivered = req.body?.delivered === true;

        const { data, error } = await supabase
            .from('product_sales')
            .update({
                delivery_status: delivered ? 'DELIVERED' : 'PENDING',
                delivered_at: delivered ? new Date().toISOString() : null,
                delivered_by: delivered ? req.user.id : null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', req.params.id)
            .eq('organization_id', organization_id)
            .select('id, delivery_status, delivered_at')
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        console.error('[Products] Set delivery error:', error);
        res.status(500).json({ error: 'Failed to update delivery status', details: error.message });
    }
};
