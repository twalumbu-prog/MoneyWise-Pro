import { Response } from 'express';
import { randomBytes } from 'crypto';
import { supabase } from '../lib/supabase';
import { emailService } from '../services/email.service';

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

/**
 * Multi-item invoice link: an admin builds a cart for a specific customer and the
 * whole basket is paid through one /pl/:token link. Prices are recomputed
 * server-side (never trusting client totals); bookings compute nights × price.
 * The basket is snapshotted into payment_links.items (product_id left null).
 */
export const createInvoiceLink = async (req: any, res: Response): Promise<any> => {
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

        const { items, customer_name, customer_phone, customer_email, wallet_id, send_email } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'At least one item is required' });
        }
        if (!customer_name || !customer_name.trim()) return res.status(400).json({ error: 'Customer name is required' });
        if (!customer_phone || !customer_phone.trim()) return res.status(400).json({ error: 'Customer phone is required' });
        if (send_email && (!customer_email || !customer_email.trim())) {
            return res.status(400).json({ error: 'Customer email is required to send the invoice by email' });
        }

        // Load every referenced product and confirm org ownership.
        const productIds = [...new Set(items.map((it: any) => it.product_id))];
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('id, name, price, organization_id, product_type')
            .in('id', productIds);
        if (productsError) throw productsError;

        const nightsOf = (ci: string, co: string) =>
            Math.round((Date.parse(`${co}T00:00:00Z`) - Date.parse(`${ci}T00:00:00Z`)) / 86400000);

        let amount = 0;
        const snapshot: any[] = [];
        for (const it of items) {
            const p = (products || []).find((x: any) => x.id === it.product_id);
            if (!p) return res.status(404).json({ error: 'One of the products was not found' });
            if (p.organization_id !== organization_id) {
                return res.status(403).json({ error: 'Permission denied: a product belongs to another organization' });
            }

            const isDonation = p.product_type === 'DONATION';
            const isBooking = !!(it.check_in && it.check_out);
            // Donations are payer/admin-priced (no server price); everything else uses the product price.
            const unit_price = isDonation ? (Number(it.price) || 0) : (Number(p.price) || 0);
            const quantity = isBooking ? nightsOf(String(it.check_in), String(it.check_out)) : Math.max(1, Number(it.quantity) || 1);
            const lineTotal = Math.round(unit_price * quantity * 100) / 100;
            if (lineTotal <= 0) {
                return res.status(400).json({ error: `Please set an amount greater than 0 for ${p.name}` });
            }
            amount += lineTotal;
            snapshot.push({
                product_id: p.id,
                name: p.name,
                quantity,
                unit_price,
                ...(isBooking ? { check_in: it.check_in, check_out: it.check_out } : {})
            });
        }
        amount = Math.round(amount * 100) / 100;

        // Destination wallet: caller-supplied (the wallet the modal was opened from),
        // else the org's main wallet. Per-product routing still applies at finalization.
        let walletId: string | null = wallet_id || null;
        if (walletId) {
            const { data: w } = await supabase
                .from('organization_wallets')
                .select('id, organization_id')
                .eq('id', walletId)
                .maybeSingle();
            if (!w || w.organization_id !== organization_id) walletId = null;
        }
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
                product_id: null,
                token,
                customer_name: customer_name.trim(),
                customer_phone: customer_phone.trim(),
                customer_email: customer_email ? customer_email.trim() : null,
                amount,
                items: snapshot,
                wallet_id: walletId,
                status: 'ACTIVE',
                created_by
            })
            .select()
            .single();

        if (error) throw error;

        // Optional invoice email — non-fatal: the link is always returned so the
        // admin can copy/share it manually even if the email fails.
        let emailSent = false;
        if (send_email && customer_email && customer_email.trim()) {
            try {
                const { data: org } = await supabase
                    .from('organizations')
                    .select('name, logo_url')
                    .eq('id', organization_id)
                    .single();
                await emailService.sendPaymentLinkInvoice({
                    to: customer_email.trim(),
                    orgName: org?.name || 'the business',
                    orgLogoUrl: org?.logo_url || null,
                    customerName: customer_name.trim(),
                    items: snapshot,
                    total: amount,
                    token
                });
                emailSent = true;
            } catch (mailErr: any) {
                console.error('[PaymentLinks] Invoice email failed:', mailErr?.message || mailErr);
            }
        }

        res.status(201).json({ ...data, path: `/pl/${token}`, email_sent: emailSent });
    } catch (error: any) {
        console.error('[PaymentLinks] Invoice create error:', error);
        res.status(500).json({ error: 'Failed to create invoice link', details: error.message });
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
