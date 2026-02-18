import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { QuickBooksService } from '../services/quickbooks.service';

export const postVoucher = async (req: AuthRequest, res: any): Promise<any> => {
    try {
        const { id } = req.params; // Requisition ID or Voucher ID? Let's use Requisition ID as it's the main entity
        const { items } = req.body; // Array of { id, account_id, class_id, description }
        const organization_id = (req as any).user.organization_id;
        const user_id = (req as any).user.id;

        if (!organization_id) {
            return res.status(400).json({ error: 'Organization context missing' });
        }

        // 1. Validate User Role (Accountant/Admin only)
        const { data: userRecord } = await supabase
            .from('users')
            .select('role')
            .eq('id', user_id)
            .single();

        if (userRecord?.role !== 'ACCOUNTANT' && userRecord?.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Unauthorized: Accountant access required' });
        }

        // 2. Validate Requisition/Voucher State
        const { data: requisition, error: reqError } = await supabase
            .from('requisitions')
            .select('*, vouchers(*)')
            .eq('id', id)
            .single();

        if (reqError || !requisition) {
            return res.status(404).json({ error: 'Requisition not found' });
        }

        if (requisition.status !== 'COMPLETED') {
            return res.status(400).json({ error: 'Requisition must be COMPLETED (Disbursed & Confirmed) to post voucher' });
        }

        // 3. Update Line Items (Classification)
        // We iterate because we might be updating different fields for each item
        for (const item of items) {
            if (!item.id) continue;

            const { error: itemError } = await supabase
                .from('line_items')
                .update({
                    account_id: item.account_id || null,
                    // class_id: item.class_id, // If we had a class_id column
                    // description: item.description // If verified/edited description differs
                })
                .eq('id', item.id)
                .eq('requisition_id', id);

            if (itemError) throw itemError;
        }

        // 4. Update Voucher Status
        const voucher = requisition.vouchers?.[0];
        if (voucher) {
            await supabase
                .from('vouchers')
                .update({
                    status: 'POSTED_TO_QB',
                    posted_at: new Date().toISOString(),
                    posted_by: user_id
                })
                .eq('id', voucher.id);
        }

        // 5. Trigger QuickBooks Sync
        try {
            await QuickBooksService.createExpense(id, user_id, organization_id);

            // 6. Update Requisition Status to ACCOUNTED (New Status)
            await supabase
                .from('requisitions')
                .update({ status: 'ACCOUNTED' })
                .eq('id', id);

            res.json({ message: 'Voucher posted and synced to QuickBooks successfully' });

        } catch (qbError: any) {
            console.error('QuickBooks sync failed:', qbError);
            // We might want to save a "Sync Failed" status or log it
            return res.status(500).json({
                error: 'Voucher saved locally but QuickBooks sync failed',
                details: qbError.message
            });
        }

    } catch (error: any) {
        console.error('Error posting voucher:', error);
        res.status(500).json({ error: 'Failed to post voucher', details: error.message });
    }
};
