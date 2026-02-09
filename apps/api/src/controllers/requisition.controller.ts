import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { memoryService } from '../services/ai/memory.service';
import { cashbookService } from '../services/cashbook.service';
import { emailService } from '../services/email.service';

export const createRequisition = async (req: any, res: any): Promise<any> => {
    try {
        const {
            description,
            estimated_total,
            items,
            department,
            type = 'EXPENSE',
            staff_name,
            employee_id,
            loan_amount,
            repayment_period,
            interest_rate,
            monthly_deduction
        } = req.body;
        const requestor_id = (req as any).user.id;

        // 1. Insert Requisition
        const { data: requisition, error: reqError } = await supabase
            .from('requisitions')
            .insert({
                requestor_id,
                description,
                estimated_total,
                status: 'DRAFT',
                department,
                type,
                staff_name,
                employee_id,
                loan_amount,
                repayment_period,
                interest_rate,
                monthly_deduction
            })
            .select()
            .single();

        if (reqError) {
            console.error('Error creating requisition:', reqError);
            return res.status(500).json({ error: 'Failed to create requisition header', details: reqError.message });
        }

        // 2. Insert Line Items
        if (items && items.length > 0) {
            const lineItemsData = items.map((item: any) => ({
                requisition_id: requisition.id,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                estimated_amount: item.estimated_amount,
                account_id: item.account_id || null
            }));

            const { error: itemsError } = await supabase
                .from('line_items')
                .insert(lineItemsData);

            if (itemsError) {
                console.error('Error creating line items:', itemsError);
                // Compensating Transaction: Delete the header if items fail
                await supabase.from('requisitions').delete().eq('id', requisition.id);
                return res.status(500).json({ error: 'Failed to create line items', details: itemsError.message });
            }
        }

        res.status(201).json(requisition);

        // 3. Trigger notification
        emailService.notifyRequisitionEvent(requisition.id, 'NEW_REQUISITION').catch(err =>
            console.error('[Notification Error] Failed to send NEW_REQUISITION email:', err)
        );
    } catch (error: any) {
        console.error('Error creating requisition:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};

export const getRequisitions = async (req: any, res: any): Promise<any> => {
    try {
        const userId = (req as any).user.id;

        // 1. Get user role
        const { data: userRecord } = await supabase.from('users').select('role').eq('id', userId).single();
        const role = userRecord?.role || 'REQUESTOR';

        let query = supabase
            .from('requisitions')
            .select(`
                *,
                requestor:users!requestor_id(name)
            `)
            .order('created_at', { ascending: false });

        // 2. Filter based on role (Accountants/Admins/Cashiers see all)
        if (role === 'REQUESTOR') {
            query = query.eq('requestor_id', userId);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Flatten requestor name for frontend convenience
        const formatted = data.map((r: any) => ({
            ...r,
            requestor_name: r.requestor?.name
        }));

        res.json(formatted);
    } catch (error: any) {
        console.error('Error fetching requisitions:', error);
        res.status(500).json({ error: 'Failed to fetch requisitions', details: error.message });
    }
};

export const getRequisitionById = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;

        // Fetch requisition with line items and account details
        const { data, error } = await supabase
            .from('requisitions')
            .select('*, line_items(*, accounts(code, name)), disbursements(*)')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') { // JSON code for no rows returned
                return res.status(404).json({ error: 'Requisition not found' });
            }
            throw error;
        }

        // Transform response to match previous API format (items array instead of nested)
        const responseData = {
            ...data,
            items: data.line_items
        };
        delete (responseData as any).line_items;

        res.json(responseData);
    } catch (error: any) {
        console.error('Error fetching requisition:', error);
        res.status(500).json({ error: 'Failed to fetch requisition', details: error.message });
    }
};

export const updateRequisition = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const { description, estimated_total } = req.body;

        const { data, error } = await supabase
            .from('requisitions')
            .update({
                description,
                estimated_total,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('requestor_id', (req as any).user.id)
            .eq('status', 'DRAFT')
            .select()
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Requisition not found or not editable' });
        }

        res.json(data);
    } catch (error: any) {
        console.error('Error updating requisition:', error);
        res.status(500).json({ error: 'Failed to update requisition', details: error.message });
    }
};

export const getAllRequisitionsAdmin = async (req: any, res: any): Promise<any> => {
    try {
        // Check if user is accountant/admin
        // Note: We use the SERVICE ROLE key in the backend client, so we must manually check the role.
        const { data: userRecord, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', (req as any).user.id)
            .single();

        if (userError || !userRecord) {
            console.error('Role check failed:', userError);
            return res.status(401).json({ error: 'User not found' });
        }

        const userRole = userRecord.role;
        if (userRole !== 'ACCOUNTANT' && userRole !== 'ADMIN' && userRole !== 'CASHIER') {
            return res.status(403).json({
                error: 'Unauthorized: Accountant or Cashier access required',
                debug: {
                    userId: req.user.id,
                    foundRole: userRole,
                    expected: ['ACCOUNTANT', 'CASHIER']
                }
            });
        }

        // Fetch all requisitions with requester name
        // users!requestor_id refers to the foreign key relationship
        const { data, error } = await supabase
            .from('requisitions')
            .select('*, requestor:users!requestor_id(name)')
            .order('created_at', { ascending: false });

        console.log(`[Requisition] getAllRequisitionsAdmin: Found ${data?.length || 0} records for user ${req.user?.id} (Role: ${userRole})`);

        if (error) {
            console.error('[Requisition] getAllRequisitionsAdmin error:', error);
            throw error;
        }

        // Transform to flatten the requestor name
        const flattened = data.map((req: any) => ({
            ...req,
            requestor_name: req.requestor?.name || 'Unknown'
        }));

        res.json(flattened);
    } catch (error: any) {
        console.error('Error fetching all requisitions:', error);
        res.status(500).json({
            error: 'Failed to fetch requisitions',
            details: error.message
        });
    }
};

export const updateRequisitionStatus = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Check role
        const { data: userRecord, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', (req as any).user.id)
            .single();

        const userRole = userRecord?.role;

        if (userRole !== 'ACCOUNTANT' && userRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Unauthorized: Accountant access required' });
        }

        const allowedStatuses = ['AUTHORISED', 'REJECTED', 'DISBURSED'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const { data, error } = await supabase
            .from('requisitions')
            .update({
                status,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Requisition not found' });

        // Trigger AI learning if authorized
        if (status === 'AUTHORISED') {
            memoryService.learnFromRequisition(id).catch((err: any) =>
                console.error('[AI Memory] Background learning failed:', err)
            );
        }

        // Trigger notifications
        if (status === 'AUTHORISED') {
            emailService.notifyRequisitionEvent(id, 'REQUISITION_APPROVED').catch(err =>
                console.error('[Notification Error] Failed to send REQUISITION_APPROVED email:', err)
            );
        } else if (status === 'REJECTED') {
            emailService.notifyRequisitionEvent(id, 'REQUISITION_REJECTED').catch(err =>
                console.error('[Notification Error] Failed to send REQUISITION_REJECTED email:', err)
            );
        } else if (status === 'DISBURSED') {
            emailService.notifyRequisitionEvent(id, 'CASH_DISBURSED').catch(err =>
                console.error('[Notification Error] Failed to send CASH_DISBURSED email:', err)
            );
        }

        res.json(data);
    } catch (error: any) {
        console.error('Error updating requisition status:', error);
        res.status(500).json({ error: 'Failed to update requisition status', details: error.message });
    }
};

export const updateRequisitionExpenses = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const { items } = req.body; // Array of { id, actual_amount, receipt_url }

        // 1. Verify Requisition exists and is in correct status (RECEIVED)
        const { data: requisition, error: reqError } = await supabase
            .from('requisitions')
            .select('status, requestor_id')
            .eq('id', id)
            .single();

        if (reqError || !requisition) {
            return res.status(404).json({ error: 'Requisition not found' });
        }

        if (requisition.requestor_id !== (req as any).user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Allow updating expenses if status is RECEIVED (or maybe COMPLETED if we allow edits?)
        // For strict flow: RECEIVED.
        if (requisition.status !== 'RECEIVED') {
            return res.status(400).json({ error: 'Requisition must be RECEIVED to track expenses' });
        }

        // 2. Update Line Items
        // Loop through items and update individually. A batch update would be better but Supabase JS doesn't support bulk update with different values easily without RPC.
        // Given typically low number of line items, loop is acceptable for MVP.
        const promises = items.map((item: any) => {
            return supabase
                .from('line_items')
                .update({
                    actual_amount: item.actual_amount,
                    receipt_url: item.receipt_url,
                    updated_at: new Date().toISOString()
                })
                .eq('id', item.id)
                .eq('requisition_id', id); // Safety check
        });

        await Promise.all(promises);

        // 3. Update Requisition Header Actual Total (Optional but good for reporting)
        // We can do this by summing up all line items.
        const { data: allItems } = await supabase
            .from('line_items')
            .select('actual_amount')
            .eq('requisition_id', id);

        const actualTotal = allItems?.reduce((sum: number, item: any) => sum + (item.actual_amount || 0), 0) || 0;

        await supabase
            .from('requisitions')
            .update({
                actual_total: actualTotal,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        res.json({ message: 'Expenses updated successfully', actual_total: actualTotal });

    } catch (error: any) {
        console.error('Error updating expenses:', error);
        res.status(500).json({ error: 'Failed to update expenses', details: error.message });
    }
};

export const submitChange = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const { denominations, change_amount } = req.body;
        const user_id = (req as any).user.id;

        // 1. Verify Requisition
        const { data: requisition, error: reqError } = await supabase
            .from('requisitions')
            .select('status, requestor_id')
            .eq('id', id)
            .single();

        if (reqError || !requisition) return res.status(404).json({ error: 'Requisition not found' });
        if (requisition.requestor_id !== user_id) return res.status(403).json({ error: 'Only the requestor can submit change' });

        // Allow if RECEIVED or CHANGE_SUBMITTED (for updates)
        if (requisition.status !== 'RECEIVED' && requisition.status !== 'CHANGE_SUBMITTED') {
            return res.status(400).json({ error: 'Requisition must be in RECEIVED status to submit change' });
        }

        // 2. Update Disbursement Table
        const { error: disbError } = await supabase
            .from('disbursements')
            .update({
                returned_denominations: denominations,
                actual_change_amount: change_amount
            })
            .eq('requisition_id', id);

        if (disbError) throw disbError;

        // 3. Update Requisition Status
        const { error: statusError } = await supabase
            .from('requisitions')
            .update({ status: 'CHANGE_SUBMITTED', updated_at: new Date().toISOString() })
            .eq('id', id);

        if (statusError) {
            console.error('[SubmitChange] Status update failed:', statusError);
            throw statusError;
        }

        console.log(`[SubmitChange] Success for Req ${id}`);
        res.json({ message: 'Change submitted successfully' });

        // 4. Trigger Notification
        emailService.notifyRequisitionEvent(id, 'CHANGE_SUBMITTED').catch(err =>
            console.error('[Notification Error] Failed to send CHANGE_SUBMITTED email:', err)
        );
    } catch (error: any) {
        console.error('Error submitting change:', error);
        res.status(500).json({
            error: 'Failed to submit change',
            message: error.message, // Add message for frontend
            details: error.details || error.message,
            hint: 'Database columns might be missing. Ensure migrations were applied manually.'
        });
    }
};

export const confirmChange = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const { confirmed_denominations, confirmed_change_amount } = req.body;
        const cashier_id = (req as any).user.id;

        // 1. Verify Role
        const { data: userRecord } = await supabase.from('users').select('role').eq('id', cashier_id).single();
        if (userRecord?.role !== 'ACCOUNTANT' && userRecord?.role !== 'CASHIER' && userRecord?.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Unauthorized: Access restricted to Cashiers/Accountants' });
        }

        // 2. Get Requisition and Disbursement info
        const { data: requisition, error: reqError } = await supabase
            .from('requisitions')
            .select('*, disbursements(*)')
            .eq('id', id)
            .single();

        if (reqError || !requisition) return res.status(404).json({ error: 'Requisition not found' });
        if (requisition.status !== 'CHANGE_SUBMITTED') return res.status(400).json({ error: 'Requisition must be in CHANGE_SUBMITTED status' });

        const disbursement = requisition.disbursements?.[0];
        if (!disbursement) return res.status(404).json({ error: 'Disbursement info missing' });

        // ROBUST DISCREPANCY:
        // totalDisbursed = what left the box initially
        // actualExpenditure = what was spent (receipts)
        // confirmed_change_amount = what actually came back to the box
        // discrepancy = what is missing overall (Total - Spent - Returned)
        const totalDisbursed = Number(disbursement.total_prepared || 0);
        const actualExpenditure = Number(requisition.actual_total || 0);
        const confirmedChange = Number(confirmed_change_amount || 0);
        const discrepancy = totalDisbursed - actualExpenditure - confirmedChange;

        console.log(`[ConfirmChange] Req ${id}: Total=${totalDisbursed}, Actual=${actualExpenditure}, Change=${confirmedChange}, Disc=${discrepancy}`);

        // 3. Update Disbursement Table with confirmation
        const { error: disbUpdateError } = await supabase
            .from('disbursements')
            .update({
                confirmed_denominations,
                confirmed_change_amount: confirmedChange,
                confirmed_by: cashier_id,
                confirmed_at: new Date().toISOString(),
                discrepancy_amount: discrepancy
            })
            .eq('id', disbursement.id);

        if (disbUpdateError) throw disbUpdateError;

        // 4. Create Voucher Record
        const voucherRef = `PV-${requisition.reference_number || id.slice(0, 6)}`;
        const { data: voucher, error: voucherError } = await supabase
            .from('vouchers')
            .insert({
                requisition_id: id,
                reference_number: voucherRef,
                date: new Date().toISOString().split('T')[0],
                amount: actualExpenditure,
                status: 'POSTED', // Assuming status column exists directly or default
                description: requisition.description
            })
            .select()
            .single();

        if (voucherError) {
            console.error('Error creating voucher:', voucherError);
            // Proceed? Or fail? Fail is safer to ensure consistency.
            throw voucherError;
        }

        // 5. Finalize Ledger
        // We assume actualExpenditure is already set by trackExpenses.
        await cashbookService.finalizeDisbursement(
            id,
            actualExpenditure,
            voucher.id,
            discrepancy,
            voucher.reference_number
        );

        // 6. Update Requisition Status
        await supabase
            .from('requisitions')
            .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
            .eq('id', id);

        res.json({ message: 'Change confirmed, voucher created, and ledger updated', discrepancy, voucher_id: voucher.id });

        // 7. Trigger Notification
        emailService.notifyRequisitionEvent(id, 'REQUISITION_COMPLETED').catch(err =>
            console.error('[Notification Error] Failed to send REQUISITION_COMPLETED email:', err)
        );
    } catch (error: any) {
        console.error('Error confirming change:', error);
        res.status(500).json({ error: 'Failed to confirm change', details: error.message });
    }
};
