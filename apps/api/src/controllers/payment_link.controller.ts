import { Response } from 'express';
import { randomBytes } from 'crypto';
import { supabase } from '../lib/supabase';

/**
 * One-time, single-use payment links. An admin generates a link pre-filled with a
 * customer + amount for a specific product; the link auto-deactivates (status → PAID)
 * once the Lenco sync finalizes its payment. See lenco.controller finalization.
 */

const generateToken = (): string => randomBytes(24).toString('base64url');

export const createPaymentLink = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user.organization_id;
        const role = req.user.role;
        const created_by = req.user.id;

        if (!organization_id) {
            return res.status(400).json({ error: 'User organization context missing' });
        }
        if (role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only administrators can create payment links' });
        }

        const { product_id, customer_name, customer_phone, amount } = req.body;

        if (!product_id) return res.status(400).json({ error: 'product_id is required' });
        if (!customer_name || !customer_name.trim()) return res.status(400).json({ error: 'Customer name is required' });
        if (!customer_phone || !customer_phone.trim()) return res.status(400).json({ error: 'Customer phone is required' });

        const amountNum = Number(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ error: 'Amount must be a valid number greater than 0' });
        }

        // Verify product belongs to caller's org and resolve the destination wallet.
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('organization_id, wallet_id, is_active')
            .eq('id', product_id)
            .single();

        if (productError || !product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        if (product.organization_id !== organization_id) {
            return res.status(403).json({ error: 'Permission denied: Product belongs to another organization' });
        }

        // Wallet routing: product's mapped wallet, else the org's main wallet.
        let walletId: string | null = product.wallet_id || null;
        if (!walletId) {
            const { data: mainWallet } = await supabase
                .from('organization_wallets')
                .select('id')
                .eq('organization_id', organization_id)
                .eq('is_main', true)
                .maybeSingle();
            walletId = mainWallet?.id || null;
        }

        const token = generateToken();

        const { data, error } = await supabase
            .from('payment_links')
            .insert({
                organization_id,
                product_id,
                token,
                customer_name: customer_name.trim(),
                customer_phone: customer_phone.trim(),
                amount: amountNum,
                wallet_id: walletId,
                status: 'ACTIVE',
                created_by
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ ...data, path: `/pl/${token}` });
    } catch (error: any) {
        console.error('[PaymentLinks] Create error:', error);
        res.status(500).json({ error: 'Failed to create payment link', details: error.message });
    }
};

export const listPaymentLinks = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user.organization_id;
        if (!organization_id) {
            return res.status(400).json({ error: 'User organization context missing' });
        }

        let query = supabase
            .from('payment_links')
            .select('*')
            .eq('organization_id', organization_id)
            .order('created_at', { ascending: false });

        if (req.query.product_id) {
            query = query.eq('product_id', req.query.product_id as string);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        console.error('[PaymentLinks] List error:', error);
        res.status(500).json({ error: 'Failed to fetch payment links', details: error.message });
    }
};

export const deactivatePaymentLink = async (req: any, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const organization_id = req.user.organization_id;
        const role = req.user.role;

        if (!organization_id) {
            return res.status(400).json({ error: 'User organization context missing' });
        }
        if (role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only administrators can manage payment links' });
        }

        const { data: link, error: findError } = await supabase
            .from('payment_links')
            .select('organization_id, status')
            .eq('id', id)
            .single();

        if (findError || !link) {
            return res.status(404).json({ error: 'Payment link not found' });
        }
        if (link.organization_id !== organization_id) {
            return res.status(403).json({ error: 'Permission denied: Link belongs to another organization' });
        }
        if (link.status === 'PAID') {
            return res.status(400).json({ error: 'This link has already been paid and cannot be cancelled' });
        }

        const { data, error } = await supabase
            .from('payment_links')
            .update({ status: 'CANCELLED' })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        console.error('[PaymentLinks] Deactivate error:', error);
        res.status(500).json({ error: 'Failed to deactivate payment link', details: error.message });
    }
};
