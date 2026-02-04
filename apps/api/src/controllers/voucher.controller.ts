import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';

export const getVouchers = async (req: AuthRequest, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('vouchers')
            .select('*, requisitions(description)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        console.error('Error fetching vouchers:', error);
        res.status(500).json({ error: 'Failed to fetch vouchers', details: error.message });
    }
};

export const getVoucherById = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('vouchers')
            .select('*, voucher_lines(*, accounts(code, name)), requisitions(*)')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return res.status(404).json({ error: 'Voucher not found' });
            throw error;
        }

        res.json(data);
    } catch (error: any) {
        console.error('Error fetching voucher:', error);
        res.status(500).json({ error: 'Failed to fetch voucher', details: error.message });
    }
};

export const createVoucherFromRequisition = async (req: AuthRequest, res: Response) => {
    try {
        const { requisition_id } = req.body;
        const user_id = req.user.id;

        // 1. Fetch Requisition and its items
        const { data: requisition, error: reqError } = await supabase
            .from('requisitions')
            .select('*, line_items(*)')
            .eq('id', requisition_id)
            .single();

        if (reqError || !requisition) {
            return res.status(404).json({ error: 'Requisition not found' });
        }

        // Only allow vouchers for RECEIVED/COMPLETED requisitions
        if (requisition.status !== 'RECEIVED' && requisition.status !== 'COMPLETED') {
            return res.status(400).json({ error: 'Requisition must be RECEIVED or COMPLETED to generate a voucher' });
        }

        // Check if voucher already exists for this requisition
        const { data: existingVoucher } = await supabase
            .from('vouchers')
            .select('id')
            .eq('requisition_id', requisition_id)
            .single();

        if (existingVoucher) {
            return res.status(400).json({ error: 'Voucher already exists for this requisition' });
        }

        const totalAmount = requisition.actual_total || requisition.estimated_total;

        // 2. Create Voucher Header
        const { data: voucher, error: vError } = await supabase
            .from('vouchers')
            .insert({
                requisition_id,
                created_by: user_id,
                reference_number: `VOU-${Date.now()}`,
                total_debit: totalAmount,
                total_credit: totalAmount,
                status: 'DRAFT'
            })
            .select()
            .single();

        if (vError) throw vError;

        // 3. Create Voucher Lines
        const voucherLines = [];

        // Debit lines for each line item's account
        for (const item of requisition.line_items) {
            voucherLines.push({
                voucher_id: voucher.id,
                account_id: item.account_id, // Ensure this is not null!
                description: item.description,
                debit: item.actual_amount || item.estimated_amount,
                credit: 0
            });
        }

        // Credit line (usually from Petty Cash or Bank)
        // For MVP, look for a '1000' (Petty Cash) account
        const { data: cashAccount } = await supabase
            .from('accounts')
            .select('id')
            .eq('code', '1000')
            .single();

        voucherLines.push({
            voucher_id: voucher.id,
            account_id: cashAccount?.id,
            description: `Payment for Requisition #${requisition.id.slice(0, 8)}`,
            debit: 0,
            credit: totalAmount
        });

        const { error: linesError } = await supabase
            .from('voucher_lines')
            .insert(voucherLines);

        if (linesError) throw linesError;

        res.status(201).json(voucher);

    } catch (error: any) {
        console.error('Error creating voucher:', error);
        res.status(500).json({ error: 'Failed to create voucher', details: error.message });
    }
};

export const postVoucher = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        // 1. Fetch Voucher
        const { data: voucher, error: vError } = await supabase
            .from('vouchers')
            .select('*')
            .eq('id', id)
            .single();

        if (vError || !voucher) {
            return res.status(404).json({ error: 'Voucher not found' });
        }

        if (voucher.status === 'POSTED') {
            return res.status(400).json({ error: 'Voucher is already posted' });
        }

        // 2. Update Status
        const { error: updateError } = await supabase
            .from('vouchers')
            .update({
                status: 'POSTED',
                posted_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateError) throw updateError;

        res.json({ message: 'Voucher posted successfully' });

    } catch (error: any) {
        console.error('Error posting voucher:', error);
        res.status(500).json({ error: 'Failed to post voucher', details: error.message });
    }
};
