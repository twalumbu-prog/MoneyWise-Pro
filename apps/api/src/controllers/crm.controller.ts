import { Response } from 'express';
import { supabase } from '../lib/supabase';

export interface CustomerWithStats {
    id: string;
    organization_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    status: string;
    owing_status: 'OWING' | 'CLEAR';
    owing_amount: number;
    open_invoices_count: number;
    total_spend: number;
    created_at: string;
    updated_at: string;
}

// Helper to normalize phone numbers for matching
const normalizePhone = (p?: string | null): string => {
    if (!p) return '';
    return p.replace(/\D/g, '').slice(-9); // last 9 digits
};

// Helper function to auto-sync customers from sales and payment links
export const syncCustomersFromTransactions = async (organization_id: string) => {
    try {
        // Fetch existing customers
        const { data: existingCustomers } = await supabase
            .from('customers')
            .select('name, email, phone')
            .eq('organization_id', organization_id);

        const existingPhones = new Set((existingCustomers || []).map(c => normalizePhone(c.phone)).filter(Boolean));
        const existingEmails = new Set((existingCustomers || []).map(c => c.email?.toLowerCase()).filter(Boolean));
        const existingNames = new Set((existingCustomers || []).map(c => c.name.trim().toLowerCase()).filter(Boolean));

        // 1. Fetch product_sales
        const { data: sales } = await supabase
            .from('product_sales')
            .select('customer_name, customer_phone')
            .eq('organization_id', organization_id);

        // 2. Fetch payment_links
        const { data: links } = await supabase
            .from('payment_links')
            .select('customer_name, customer_phone, customer_email')
            .eq('organization_id', organization_id);

        const newCustomersToInsert: Array<{
            organization_id: string;
            name: string;
            email?: string | null;
            phone?: string | null;
        }> = [];

        const addedKeys = new Set<string>();

        const checkAndAdd = (name?: string | null, phone?: string | null, email?: string | null) => {
            if (!name || !name.trim()) return;
            const cleanName = name.trim();
            const normP = normalizePhone(phone);
            const cleanEmail = email?.trim().toLowerCase() || null;

            const hasPhone = normP && existingPhones.has(normP);
            const hasEmail = cleanEmail && existingEmails.has(cleanEmail);
            const hasName = existingNames.has(cleanName.toLowerCase());

            if (hasPhone || hasEmail || hasName) return;

            const dedupeKey = `${cleanName.toLowerCase()}_${normP || cleanEmail || ''}`;
            if (addedKeys.has(dedupeKey)) return;
            addedKeys.add(dedupeKey);

            newCustomersToInsert.push({
                organization_id,
                name: cleanName,
                phone: phone?.trim() || null,
                email: cleanEmail,
            });
        };

        (sales || []).forEach(s => checkAndAdd(s.customer_name, s.customer_phone, null));
        (links || []).forEach(l => checkAndAdd(l.customer_name, l.customer_phone, l.customer_email));

        if (newCustomersToInsert.length > 0) {
            await supabase.from('customers').insert(newCustomersToInsert);
        }
    } catch (err) {
        console.error('[CRM Sync] Error syncing customers:', err);
    }
};

export const listCustomers = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        if (!organization_id) {
            return res.status(400).json({ error: 'Organization context missing' });
        }

        // Run background sync for store/payment link customers
        await syncCustomersFromTransactions(organization_id);

        // Fetch customers
        const { data: customers, error } = await supabase
            .from('customers')
            .select('*')
            .eq('organization_id', organization_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Fetch active payment links (open invoices) for status calculation
        const { data: activeLinks } = await supabase
            .from('payment_links')
            .select('customer_name, customer_phone, customer_email, amount')
            .eq('organization_id', organization_id)
            .eq('status', 'ACTIVE');

        // Fetch paid product sales for total spend calculation
        const { data: paidSales } = await supabase
            .from('product_sales')
            .select('customer_name, customer_phone, amount_paid')
            .eq('organization_id', organization_id)
            .neq('status', 'FAILED');

        // Fetch paid payment links
        const { data: paidLinks } = await supabase
            .from('payment_links')
            .select('customer_name, customer_phone, customer_email, amount')
            .eq('organization_id', organization_id)
            .eq('status', 'PAID');

        const activeLinksList = activeLinks || [];
        const paidSalesList = paidSales || [];
        const paidLinksList = paidLinks || [];

        const customersWithStats: CustomerWithStats[] = (customers || []).map(customer => {
            const custPhoneNorm = normalizePhone(customer.phone);
            const custEmailNorm = customer.email?.trim().toLowerCase();
            const custNameNorm = customer.name.trim().toLowerCase();

            const isMatch = (name?: string | null, phone?: string | null, email?: string | null) => {
                if (custPhoneNorm && phone && normalizePhone(phone) === custPhoneNorm) return true;
                if (custEmailNorm && email && email.trim().toLowerCase() === custEmailNorm) return true;
                if (name && name.trim().toLowerCase() === custNameNorm) return true;
                return false;
            };

            // Calculate owing status and open invoices
            const matchingActiveLinks = activeLinksList.filter(l => isMatch(l.customer_name, l.customer_phone, l.customer_email));
            const openInvoicesCount = matchingActiveLinks.length;
            const owingAmount = matchingActiveLinks.reduce((sum, l) => sum + Number(l.amount || 0), 0);
            const owingStatus = openInvoicesCount > 0 ? 'OWING' : 'CLEAR';

            // Calculate total spend
            const salesSpend = paidSalesList
                .filter(s => isMatch(s.customer_name, s.customer_phone, null))
                .reduce((sum, s) => sum + Number(s.amount_paid || 0), 0);
            const linksSpend = paidLinksList
                .filter(l => isMatch(l.customer_name, l.customer_phone, l.customer_email))
                .reduce((sum, l) => sum + Number(l.amount || 0), 0);
            const totalSpend = salesSpend + linksSpend;

            return {
                ...customer,
                owing_status: owingStatus,
                owing_amount: owingAmount,
                open_invoices_count: openInvoicesCount,
                total_spend: totalSpend,
            };
        });

        res.json(customersWithStats);
    } catch (error: any) {
        console.error('[CRM] listCustomers error:', error);
        res.status(500).json({ error: 'Failed to list customers', details: error.message });
    }
};

export const createCustomer = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        if (!organization_id) {
            return res.status(400).json({ error: 'Organization context missing' });
        }

        const { name, email, phone, notes } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Customer name is required' });
        }

        const { data, error } = await supabase
            .from('customers')
            .insert({
                organization_id,
                name: name.trim(),
                email: email?.trim() || null,
                phone: phone?.trim() || null,
                notes: notes?.trim() || null,
                status: 'ACTIVE',
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error: any) {
        console.error('[CRM] createCustomer error:', error);
        res.status(500).json({ error: 'Failed to create customer', details: error.message });
    }
};

export const getCustomer = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        const { id } = req.params;

        const { data: customer, error } = await supabase
            .from('customers')
            .select('*')
            .eq('id', id)
            .eq('organization_id', organization_id)
            .single();

        if (error || !customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const custPhoneNorm = normalizePhone(customer.phone);
        const custEmailNorm = customer.email?.trim().toLowerCase();
        const custNameNorm = customer.name.trim().toLowerCase();

        const isMatch = (name?: string | null, phone?: string | null, email?: string | null) => {
            if (custPhoneNorm && phone && normalizePhone(phone) === custPhoneNorm) return true;
            if (custEmailNorm && email && email.trim().toLowerCase() === custEmailNorm) return true;
            if (name && name.trim().toLowerCase() === custNameNorm) return true;
            return false;
        };

        const { data: activeLinks } = await supabase
            .from('payment_links')
            .select('customer_name, customer_phone, customer_email, amount')
            .eq('organization_id', organization_id)
            .eq('status', 'ACTIVE');

        const { data: paidSales } = await supabase
            .from('product_sales')
            .select('customer_name, customer_phone, amount_paid')
            .eq('organization_id', organization_id)
            .neq('status', 'FAILED');

        const { data: paidLinks } = await supabase
            .from('payment_links')
            .select('customer_name, customer_phone, customer_email, amount')
            .eq('organization_id', organization_id)
            .eq('status', 'PAID');

        const matchingActiveLinks = (activeLinks || []).filter(l => isMatch(l.customer_name, l.customer_phone, l.customer_email));
        const openInvoicesCount = matchingActiveLinks.length;
        const owingAmount = matchingActiveLinks.reduce((sum, l) => sum + Number(l.amount || 0), 0);
        const owingStatus = openInvoicesCount > 0 ? 'OWING' : 'CLEAR';

        const salesSpend = (paidSales || [])
            .filter(s => isMatch(s.customer_name, s.customer_phone, null))
            .reduce((sum, s) => sum + Number(s.amount_paid || 0), 0);
        const linksSpend = (paidLinks || [])
            .filter(l => isMatch(l.customer_name, l.customer_phone, l.customer_email))
            .reduce((sum, l) => sum + Number(l.amount || 0), 0);
        const totalSpend = salesSpend + linksSpend;

        res.json({
            ...customer,
            owing_status: owingStatus,
            owing_amount: owingAmount,
            open_invoices_count: openInvoicesCount,
            total_spend: totalSpend,
        });
    } catch (error: any) {
        console.error('[CRM] getCustomer error:', error);
        res.status(500).json({ error: 'Failed to fetch customer', details: error.message });
    }
};

export const updateCustomer = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        const { id } = req.params;
        const { name, email, phone, notes, status } = req.body;

        const { data, error } = await supabase
            .from('customers')
            .update({
                ...(name ? { name: name.trim() } : {}),
                email: email !== undefined ? (email ? email.trim() : null) : undefined,
                phone: phone !== undefined ? (phone ? phone.trim() : null) : undefined,
                notes: notes !== undefined ? (notes ? notes.trim() : null) : undefined,
                status: status || undefined,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('organization_id', organization_id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error: any) {
        console.error('[CRM] updateCustomer error:', error);
        res.status(500).json({ error: 'Failed to update customer', details: error.message });
    }
};

export const deleteCustomer = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        const { id } = req.params;

        const { error } = await supabase
            .from('customers')
            .delete()
            .eq('id', id)
            .eq('organization_id', organization_id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error: any) {
        console.error('[CRM] deleteCustomer error:', error);
        res.status(500).json({ error: 'Failed to delete customer', details: error.message });
    }
};

export const getCustomerTransactions = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        const { id } = req.params;

        const { data: customer, error: custErr } = await supabase
            .from('customers')
            .select('*')
            .eq('id', id)
            .eq('organization_id', organization_id)
            .single();

        if (custErr || !customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const custPhoneNorm = normalizePhone(customer.phone);
        const custEmailNorm = customer.email?.trim().toLowerCase();
        const custNameNorm = customer.name.trim().toLowerCase();

        const isMatch = (name?: string | null, phone?: string | null, email?: string | null) => {
            if (custPhoneNorm && phone && normalizePhone(phone) === custPhoneNorm) return true;
            if (custEmailNorm && email && email.trim().toLowerCase() === custEmailNorm) return true;
            if (name && name.trim().toLowerCase() === custNameNorm) return true;
            return false;
        };

        // Fetch payment links (Invoices)
        const { data: links } = await supabase
            .from('payment_links')
            .select('*, products(name)')
            .eq('organization_id', organization_id);

        // Fetch product sales (Store link receipts)
        const { data: sales } = await supabase
            .from('product_sales')
            .select('*, products(name)')
            .eq('organization_id', organization_id);

        // Fetch cashbook entries (Direct receipts)
        const { data: cashbook } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('organization_id', organization_id);

        const transactions: Array<{
            id: string;
            type: 'INVOICE' | 'RECEIPT';
            date: string;
            description: string;
            amount: number;
            status: string;
            reference?: string;
            items?: any[];
        }> = [];

        // Add payment links
        (links || []).forEach(l => {
            if (isMatch(l.customer_name, l.customer_phone, l.customer_email)) {
                const isInvoice = Array.isArray(l.items) && l.items.length > 0;
                const desc = isInvoice
                    ? `Invoice (${l.items.length} items)`
                    : `Payment Link: ${l.products?.name || 'Product Purchase'}`;
                transactions.push({
                    id: l.id,
                    type: 'INVOICE',
                    date: l.created_at,
                    description: desc,
                    amount: Number(l.amount || 0),
                    status: l.status === 'ACTIVE' ? 'OWING' : l.status,
                    reference: l.token,
                    items: l.items || [],
                });
            }
        });

        // Add product sales
        (sales || []).forEach(s => {
            if (isMatch(s.customer_name, s.customer_phone, null)) {
                transactions.push({
                    id: s.id,
                    type: 'RECEIPT',
                    date: s.created_at,
                    description: `Store Purchase: ${s.products?.name || 'Item'} (x${s.quantity || 1})`,
                    amount: Number(s.amount_paid || 0),
                    status: s.status === 'COMPLETED' || s.status === 'PAID' ? 'PAID' : s.status,
                    reference: s.reference,
                });
            }
        });

        // Add cashbook entries if sender matches
        (cashbook || []).forEach(c => {
            if (isMatch(c.sender_name, c.sender_phone, c.sender_email)) {
                transactions.push({
                    id: c.id,
                    type: 'RECEIPT',
                    date: c.created_at || c.date,
                    description: c.description || 'Cashbook Payment',
                    amount: Number(c.amount || 0),
                    status: 'PAID',
                    reference: c.external_reference || undefined,
                });
            }
        });

        // Sort descending by date
        transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        res.json(transactions);
    } catch (error: any) {
        console.error('[CRM] getCustomerTransactions error:', error);
        res.status(500).json({ error: 'Failed to fetch customer transactions', details: error.message });
    }
};
