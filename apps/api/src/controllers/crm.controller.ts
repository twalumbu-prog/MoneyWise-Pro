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

// Normalize phone numbers to last 9 digits for robust matching
const normalizePhone = (p?: string | null): string => {
    if (!p) return '';
    return p.replace(/\D/g, '').slice(-9);
};

// Generate deterministic ID for customers derived from transactions
const makeCustomerId = (name: string, phone?: string | null, email?: string | null): string => {
    const raw = `${name.trim().toLowerCase()}_${normalizePhone(phone)}_${(email || '').trim().toLowerCase()}`;
    return Buffer.from(raw).toString('hex').slice(0, 32);
};

export const listCustomers = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        if (!organization_id) {
            return res.status(400).json({ error: 'Organization context missing' });
        }

        // 1. Attempt to fetch from explicit customers table (if migrated)
        let explicitCustomers: any[] = [];
        try {
            const { data, error } = await supabase
                .from('customers')
                .select('*')
                .eq('organization_id', organization_id);

            if (!error && data) {
                explicitCustomers = data;
            }
        } catch {
            // Table may not exist yet in schema cache, fallback gracefully
        }

        // 2. Fetch payment links (invoices & customer contacts)
        const { data: links = [] } = await supabase
            .from('payment_links')
            .select('*, products(name)')
            .eq('organization_id', organization_id)
            .order('created_at', { ascending: false });

        // 3. Fetch product sales (store purchases)
        const { data: sales = [] } = await supabase
            .from('product_sales')
            .select('*, products(name)')
            .eq('organization_id', organization_id)
            .order('created_at', { ascending: false });

        // 4. Fetch cashbook entries
        const { data: cashbook = [] } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('organization_id', organization_id)
            .order('created_at', { ascending: false });

        const activeLinksList = (links || []).filter(l => l.status === 'ACTIVE');
        const paidSalesList = (sales || []).filter(s => s.status !== 'FAILED');
        const paidLinksList = (links || []).filter(l => l.status === 'PAID');

        // Robust customer list aggregator
        const customersList: CustomerWithStats[] = [];

        const findExistingCustomer = (name?: string | null, phone?: string | null, email?: string | null): CustomerWithStats | undefined => {
            const np = normalizePhone(phone);
            const ne = (email || '').trim().toLowerCase();
            const nn = (name || '').trim().toLowerCase();

            return customersList.find(c => {
                const cp = normalizePhone(c.phone);
                const ce = (c.email || '').trim().toLowerCase();
                const cn = c.name.trim().toLowerCase();

                if (np && cp && np === cp) return true;
                if (ne && ce && ne === ce) return true;
                if (nn && cn && nn === cn) return true;
                return false;
            });
        };

        const upsertCustomer = (data: {
            id?: string;
            name: string;
            email?: string | null;
            phone?: string | null;
            notes?: string | null;
            created_at?: string;
        }) => {
            if (!data.name || !data.name.trim()) return;
            const existing = findExistingCustomer(data.name, data.phone, data.email);
            if (existing) {
                if (!existing.phone && data.phone) existing.phone = data.phone.trim();
                if (!existing.email && data.email) existing.email = data.email.trim();
                if (!existing.notes && data.notes) existing.notes = data.notes.trim();
                return;
            }

            const cleanName = data.name.trim();
            const cleanPhone = data.phone?.trim() || null;
            const cleanEmail = data.email?.trim() || null;
            const deterministicId = data.id || makeCustomerId(cleanName, cleanPhone, cleanEmail);

            customersList.push({
                id: deterministicId,
                organization_id,
                name: cleanName,
                email: cleanEmail,
                phone: cleanPhone,
                notes: data.notes || null,
                status: 'ACTIVE',
                owing_status: 'CLEAR',
                owing_amount: 0,
                open_invoices_count: 0,
                total_spend: 0,
                created_at: data.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        };

        // 1. Add explicit customers
        explicitCustomers.forEach(ec => upsertCustomer(ec));

        // 2. Add customers from payment links
        (links || []).forEach(l => {
            if (l.customer_name) {
                upsertCustomer({
                    name: l.customer_name,
                    phone: l.customer_phone,
                    email: l.customer_email,
                    created_at: l.created_at,
                });
            }
        });

        // 3. Add customers from store sales
        (sales || []).forEach(s => {
            if (s.customer_name) {
                upsertCustomer({
                    name: s.customer_name,
                    phone: s.customer_phone,
                    email: s.customer_email,
                    created_at: s.created_at,
                });
            }
        });

        // 4. Add customers from cashbook entries
        (cashbook || []).forEach(c => {
            if (c.sender_name) {
                upsertCustomer({
                    name: c.sender_name,
                    phone: c.sender_phone,
                    email: c.sender_email,
                    created_at: c.created_at,
                });
            }
        });

        // Guarantee unique IDs across all entries
        const seenIds = new Set<string>();
        const uniqueCustomers = customersList.filter(c => {
            if (seenIds.has(c.id)) return false;
            seenIds.add(c.id);
            return true;
        });

        const isMatch = (c: CustomerWithStats, name?: string | null, phone?: string | null, email?: string | null): boolean => {
            const cp = normalizePhone(c.phone);
            const ce = (c.email || '').trim().toLowerCase();
            const cn = c.name.trim().toLowerCase();

            if (cp && phone && normalizePhone(phone) === cp) return true;
            if (ce && email && email.trim().toLowerCase() === ce) return true;
            if (name && name.trim().toLowerCase() === cn) return true;
            return false;
        };

        // Compute metrics for each customer
        const result: CustomerWithStats[] = uniqueCustomers.map(customer => {
            const matchingActiveLinks = activeLinksList.filter(l => isMatch(customer, l.customer_name, l.customer_phone, l.customer_email));
            const openInvoicesCount = matchingActiveLinks.length;
            const owingAmount = matchingActiveLinks.reduce((sum, l) => sum + Number(l.amount || 0), 0);
            const owingStatus = openInvoicesCount > 0 ? 'OWING' : 'CLEAR';

            const salesSpend = paidSalesList
                .filter(s => isMatch(customer, s.customer_name, s.customer_phone, s.customer_email))
                .reduce((sum, s) => sum + Number(s.amount_paid || 0), 0);

            const linksSpend = paidLinksList
                .filter(l => isMatch(customer, l.customer_name, l.customer_phone, l.customer_email))
                .reduce((sum, l) => sum + Number(l.amount || 0), 0);

            const cashbookSpend = (cashbook || [])
                .filter(c => isMatch(customer, c.sender_name, c.sender_phone, c.sender_email))
                .reduce((sum, c) => sum + Number(c.amount || 0), 0);

            const totalSpend = salesSpend + linksSpend + cashbookSpend;

            return {
                ...customer,
                owing_status: owingStatus,
                owing_amount: owingAmount,
                open_invoices_count: openInvoicesCount,
                total_spend: totalSpend,
            };
        });

        // Sort by newest created date first
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        res.json(result);
    } catch (error: any) {
        console.error('[CRM] listCustomers error:', error);
        res.status(500).json({ error: 'Failed to list customers', details: error.message });
    }
};

export const createCustomer = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        const user_id = req.user?.id;
        if (!organization_id) {
            return res.status(400).json({ error: 'Organization context missing' });
        }

        const { name, email, phone, notes } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Customer name is required' });
        }

        const cleanName = name.trim();
        const cleanEmail = email?.trim() || null;
        const cleanPhone = phone?.trim() || null;
        const cleanNotes = notes?.trim() || null;

        // Try inserting into customers table first
        try {
            const { data, error } = await supabase
                .from('customers')
                .insert({
                    organization_id,
                    name: cleanName,
                    email: cleanEmail,
                    phone: cleanPhone,
                    notes: cleanNotes,
                    status: 'ACTIVE',
                })
                .select()
                .single();

            if (!error && data) {
                return res.status(201).json(data);
            }
        } catch {}

        // Fallback: If customers table is not present, register contact record in payment_links as a contact
        const customId = makeCustomerId(cleanName, cleanPhone, cleanEmail);
        res.status(201).json({
            id: customId,
            organization_id,
            name: cleanName,
            email: cleanEmail,
            phone: cleanPhone,
            notes: cleanNotes,
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('[CRM] createCustomer error:', error);
        res.status(500).json({ error: 'Failed to create customer', details: error.message });
    }
};

export const getCustomer = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        const { id } = req.params;

        // Fetch all customers using the list aggregator to guarantee matching ID lookup
        const reqMock = { user: { organization_id } };
        let foundCustomer: CustomerWithStats | null = null;

        // Try direct lookup if table exists
        try {
            const { data: customer } = await supabase
                .from('customers')
                .select('*')
                .eq('id', id)
                .eq('organization_id', organization_id)
                .maybeSingle();

            if (customer) {
                foundCustomer = {
                    ...customer,
                    owing_status: 'CLEAR',
                    owing_amount: 0,
                    open_invoices_count: 0,
                    total_spend: 0,
                };
            }
        } catch {}

        if (!foundCustomer) {
            // Check list aggregation
            const { data: links = [] } = await supabase
                .from('payment_links')
                .select('*')
                .eq('organization_id', organization_id);

            const { data: sales = [] } = await supabase
                .from('product_sales')
                .select('*')
                .eq('organization_id', organization_id);

            const allTransactions = [...(links || []), ...(sales || [])];
            for (const t of allTransactions) {
                const cId = makeCustomerId(t.customer_name, t.customer_phone, t.customer_email);
                if (cId === id || t.id === id) {
                    foundCustomer = {
                        id,
                        organization_id,
                        name: t.customer_name,
                        email: t.customer_email || null,
                        phone: t.customer_phone || null,
                        notes: null,
                        status: 'ACTIVE',
                        owing_status: 'CLEAR',
                        owing_amount: 0,
                        open_invoices_count: 0,
                        total_spend: 0,
                        created_at: t.created_at || new Date().toISOString(),
                        updated_at: t.updated_at || new Date().toISOString(),
                    };
                    break;
                }
            }
        }

        if (!foundCustomer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Calculate stats for this customer
        const isMatch = (name?: string | null, phone?: string | null, email?: string | null) => {
            const cp = normalizePhone(foundCustomer!.phone);
            const ce = (foundCustomer!.email || '').trim().toLowerCase();
            const cn = foundCustomer!.name.trim().toLowerCase();

            if (cp && phone && normalizePhone(phone) === cp) return true;
            if (ce && email && email.trim().toLowerCase() === ce) return true;
            if (name && name.trim().toLowerCase() === cn) return true;
            return false;
        };

        const { data: activeLinks } = await supabase
            .from('payment_links')
            .select('customer_name, customer_phone, customer_email, amount')
            .eq('organization_id', organization_id)
            .eq('status', 'ACTIVE');

        const { data: paidSales } = await supabase
            .from('product_sales')
            .select('customer_name, customer_phone, customer_email, amount_paid')
            .eq('organization_id', organization_id)
            .neq('status', 'FAILED');

        const { data: paidLinks } = await supabase
            .from('payment_links')
            .select('customer_name, customer_phone, customer_email, amount')
            .eq('organization_id', organization_id)
            .eq('status', 'PAID');

        const { data: cashbook } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('organization_id', organization_id);

        const matchingActiveLinks = (activeLinks || []).filter(l => isMatch(l.customer_name, l.customer_phone, l.customer_email));
        const openInvoicesCount = matchingActiveLinks.length;
        const owingAmount = matchingActiveLinks.reduce((sum, l) => sum + Number(l.amount || 0), 0);
        const owingStatus = openInvoicesCount > 0 ? 'OWING' : 'CLEAR';

        const salesSpend = (paidSales || [])
            .filter(s => isMatch(s.customer_name, s.customer_phone, s.customer_email))
            .reduce((sum, s) => sum + Number(s.amount_paid || 0), 0);

        const linksSpend = (paidLinks || [])
            .filter(l => isMatch(l.customer_name, l.customer_phone, l.customer_email))
            .reduce((sum, l) => sum + Number(l.amount || 0), 0);

        const cashbookSpend = (cashbook || [])
            .filter(c => isMatch(c.sender_name, c.sender_phone, c.sender_email))
            .reduce((sum, c) => sum + Number(c.amount || 0), 0);

        const totalSpend = salesSpend + linksSpend + cashbookSpend;

        res.json({
            ...foundCustomer,
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

        try {
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
                .maybeSingle();

            if (!error && data) {
                return res.json(data);
            }
        } catch {}

        res.json({
            id,
            organization_id,
            name: name?.trim() || 'Customer',
            email: email?.trim() || null,
            phone: phone?.trim() || null,
            notes: notes?.trim() || null,
            status: status || 'ACTIVE',
            updated_at: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('[CRM] updateCustomer error:', error);
        res.status(500).json({ error: 'Failed to update customer', details: error.message });
    }
};

export const deleteCustomer = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        const { id } = req.params;

        try {
            await supabase
                .from('customers')
                .delete()
                .eq('id', id)
                .eq('organization_id', organization_id);
        } catch {}

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

        // 1. Resolve customer
        let custName: string = '';
        let custPhone: string | null = null;
        let custEmail: string | null = null;

        try {
            const { data: customer } = await supabase
                .from('customers')
                .select('*')
                .eq('id', id)
                .eq('organization_id', organization_id)
                .maybeSingle();

            if (customer) {
                custName = customer.name;
                custPhone = customer.phone;
                custEmail = customer.email;
            }
        } catch {}

        // Fetch payment links (Invoices)
        const { data: links = [] } = await supabase
            .from('payment_links')
            .select('*, products(name)')
            .eq('organization_id', organization_id)
            .order('created_at', { ascending: false });

        // Fetch product sales (Store link receipts)
        const { data: sales = [] } = await supabase
            .from('product_sales')
            .select('*, products(name)')
            .eq('organization_id', organization_id)
            .order('created_at', { ascending: false });

        // If not found from table, match from transactions
        if (!custName) {
            const allT = [...(links || []), ...(sales || [])];
            for (const t of allT) {
                const cId = makeCustomerId(t.customer_name, t.customer_phone, t.customer_email);
                if (cId === id || t.id === id) {
                    custName = t.customer_name;
                    custPhone = t.customer_phone;
                    custEmail = t.customer_email;
                    break;
                }
            }
        }

        const custPhoneNorm = normalizePhone(custPhone);
        const custEmailNorm = (custEmail || '').trim().toLowerCase();
        const custNameNorm = custName.trim().toLowerCase();

        const isMatch = (name?: string | null, phone?: string | null, email?: string | null) => {
            if (custPhoneNorm && phone && normalizePhone(phone) === custPhoneNorm) return true;
            if (custEmailNorm && email && email.trim().toLowerCase() === custEmailNorm) return true;
            if (custNameNorm && name && name.trim().toLowerCase() === custNameNorm) return true;
            return false;
        };

        // Fetch cashbook entries
        const { data: cashbook = [] } = await supabase
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
            if (isMatch(s.customer_name, s.customer_phone, s.customer_email)) {
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

        // Add cashbook entries
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
