import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { memoryService } from '../services/ai/memory.service';
import { cashbookService } from '../services/cashbook.service';
import { emailService } from '../services/email.service';
import { QuickBooksService } from '../services/quickbooks.service';
import { ocrService } from '../services/ai/ocr.service';
import { LencoService } from '../services/lenco.service';
import { handleCollectionSuccessful } from './lenco.webhook.controller';
import { RequisitionMessageService } from '../services/requisition_message.service';
import { aiService } from '../services/ai/ai.service';

export const markRequisitionRead = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const user_id = (req as any).user.id;

        // Ensure the requisition belongs to the requestor
        const { data: requisition, error: reqError } = await supabase
            .from('requisitions')
            .select('requestor_id')
            .eq('id', id)
            .single();

        if (reqError || !requisition) {
            return res.status(404).json({ error: 'Requisition not found' });
        }

        if (requisition.requestor_id !== user_id) {
            return res.status(403).json({ error: 'Unauthorized to mark this requisition as read' });
        }

        const { error: updateError } = await supabase
            .from('requisitions')
            .update({ has_unread_updates: false })
            .eq('id', id);

        if (updateError) throw updateError;

        res.json({ message: 'Requisition marked as read' });
    } catch (error: any) {
        console.error('Error marking requisition as read:', error);
        res.status(500).json({ error: 'Failed to mark requisition as read', details: error.message });
    }
};

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
            monthly_deduction,
            payment_method,
            recipient_account,
            recipient_bank_code,
            recipient_name
        } = req.body;
        const requestor_id = (req as any).user.id;
        const organization_id = (req as any).user.organization_id;

        if (!organization_id) {
            return res.status(400).json({ error: 'Organization context missing. Please contact support.' });
        }

        // 0. Check for existing active requisitions (Accountability Safeguard)
        const blockingStatuses = ['DISBURSED', 'EXPENSED'];
        const { data: activeReq, error: activeError } = await supabase
            .from('requisitions')
            .select('id, status')
            .eq('requestor_id', requestor_id)
            .in('status', blockingStatuses)
            .maybeSingle();

        if (activeError) {
            console.error('Error checking active requisitions:', activeError);
        }

        if (activeReq) {
            return res.status(400).json({ 
                error: 'Accountability Block: Multiple requisitions not allowed.',
                message: `You have an outstanding requisition (#${activeReq.id.slice(0, 8)}) with status "${activeReq.status}". Please submit any pending change or complete the existing cycle before requesting more funds.`,
                activeRequisitionId: activeReq.id
            });
        }

        // 1. Insert Requisition
        const insertData: any = {
            requestor_id,
            organization_id,
            description,
            estimated_total,
            status: 'DRAFT',
            interest_rate,
            monthly_deduction,
            department: department || null // Ensure empty strings are handled as null
        };

        // Feature detection: Check if payment columns exist in the database schema
        // This prevents 500 errors if the migration hasn't been applied yet.
        const { error: schemaError } = await supabase
            .from('requisitions')
            .select('payment_method')
            .limit(1);

        if (!schemaError) {
            // Columns exist, add them to the insert
            insertData.payment_method = payment_method;
            insertData.recipient_account = recipient_account;
            insertData.recipient_bank_code = recipient_bank_code;
            insertData.recipient_name = recipient_name;
        } else if (schemaError.code !== 'PGRST204') {
            // Log other errors, but PGRST204 is 'Column not found' which we handle
            console.error('[Schema Check] Unexpected error:', schemaError);
        }

        const { data: requisition, error: reqError } = await supabase
            .from('requisitions')
            .insert(insertData)
            .select()
            .single();

        if (reqError) {
            console.error('[Create Requisition] Supabase Error:', JSON.stringify(reqError, null, 2));
            console.error('[Create Requisition] Payload Attempted:', JSON.stringify(insertData, null, 2));
            return res.status(500).json({ 
                error: 'Failed to create requisition header', 
                details: reqError.message,
                hint: reqError.hint,
                code: reqError.code
            });
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

        // 3. Trigger initial system message
        await RequisitionMessageService.createMessage({
            requisitionId: requisition.id,
            userId: requestor_id,
            content: 'Requisition submitted for approval',
            type: 'SYSTEM',
            metadata: { stage: 'APPROVAL' }
        });

        // 4. Trigger notification
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
        const role = (req as any).user.role || 'REQUESTOR';
        const organizationId = (req as any).user.organization_id;

        console.log(`[Requisition] Fetching for user ${userId}, role: ${role}, org: ${organizationId}`);

        if (!organizationId) {
            console.warn(`[Requisition] No organization ID found for user ${userId}`);
            return res.status(400).json({ error: 'Organization context missing. Please ensure you are assigned to an organization.' });
        }

        let query = supabase
            .from('requisitions')
            .select(`
                *,
                requestor:users!requestor_id(name)
            `)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });

        // 2. Filter based on role (Accountants/Admins/Cashiers see all within org)
        if (role === 'REQUESTOR' && userId !== 'service-role-admin') {
            query = query.eq('requestor_id', userId);
        }

        console.log(`[Requisition] Fetching for user ${userId}, role: ${role}, org: ${(req as any).user.organization_id}`);

        const { data, error } = await query;

        if (error) {
            console.error('[Requisition] Query error:', error);
            throw error;
        }

        console.log(`[Requisition] Found ${data?.length || 0} records`);

        // Flatten requestor name for frontend convenience
        const formatted = data.map((r: any) => ({
            ...r,
            requestor_name: r.requestor?.name
        }));

        res.json(formatted);
    } catch (error: any) {
        console.error('Error fetching requisitions:', error);
        res.status(500).json({
            error: 'Failed to fetch requisitions',
            details: error.message,
            code: error.code,
            hint: error.hint
        });
    }
};

export const getRequisitionById = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const organization_id = (req as any).user.organization_id;

        // Fetch requisition with line items and account details
        const { data, error } = await supabase
            .from('requisitions')
            .select('*, organization:organizations(id, name, lenco_subaccount_id, lenco_public_key, payment_test_mode), line_items(*, accounts(code, name)), disbursements(*, cashier:users!disbursements_cashier_id_fkey(name)), receipts(*)')
            .eq('id', id)
            .single();


        if (error) {
            if (error.code === 'PGRST116') { // JSON code for no rows returned
                return res.status(404).json({ error: 'Requisition not found' });
            }
            throw error;
        }

        // Transform response to match previous API format (items array instead of nested)
        // AND map disbursement fields for the document viewer
        const responseData = {
            ...data,
            items: data.line_items,
            receipts: data.receipts || [],
            disbursements: data.disbursements?.map((d: any) => ({
                ...d,
                amount: d.total_prepared,
                method: d.payment_method,
                recipient_provider: d.recipient_bank_code,
                recipient_value: d.recipient_account,
                processed_by_name: d.cashier?.name || 'System Admin'
            }))
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
        const userRole = (req as any).user.role;
        const organizationId = (req as any).user.organization_id;

        if (!organizationId) {
            console.warn(`[Requisition] No organization ID found for Admin/Accountant fetch (User ${req.user.id})`);
            return res.status(400).json({ error: 'Organization context missing' });
        }

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
        // Fetch all requisitions with requester name
        // users!requestor_id refers to the foreign key relationship
        const { data, error } = await supabase
            .from('requisitions')
            .select('*, requestor:users!requestor_id(name)')
            .eq('organization_id', organizationId)
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

        const user_id = (req as any).user.id;
        const userRole = (req as any).user.role;
        const org_id = (req as any).user.organization_id;

        const allowedStatuses = ['AUTHORISED', 'REJECTED', 'DISBURSED', 'EXPENSED', 'CHANGE_SUBMITTED'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Permission check
        if (userRole !== 'ACCOUNTANT' && userRole !== 'ADMIN' && userRole !== 'MANAGER') {
            // Allow requestors to update to CHANGE_SUBMITTED if they own it
            if (userRole === 'REQUESTOR' && status === 'CHANGE_SUBMITTED') {
                const { data: requisition } = await supabase
                    .from('requisitions')
                    .select('requestor_id')
                    .eq('id', id)
                    .single();
                
                if (!requisition || requisition.requestor_id !== user_id) {
                    return res.status(403).json({ error: 'Unauthorized: You can only update your own requisitions' });
                }
            } else {
                return res.status(403).json({ error: 'Unauthorized: Accountant, Admin or Manager access required' });
            }
        }

        // Generate Sequential Reference ONLY if status is AUTHORISED and it doesn't have one yet
        let refNum = null;
        if (status === 'AUTHORISED') {
            const { data: currentReq } = await supabase
                .from('requisitions')
                .select('reference_number')
                .eq('id', id)
                .single();

            if (currentReq && !currentReq.reference_number) {
                const { data: newRef, error: refError } = await supabase
                    .rpc('generate_sequential_reference', {
                        p_org_id: (req as any).user.organization_id,
                        p_entity_type: 'REQUISITION',
                        p_prefix: 'REQ'
                    });

                if (!refError) {
                    refNum = newRef;
                } else {
                    console.error('Error generating reference number during approval:', refError);
                }
            }
        }

        const updateData: any = {
            status,
            updated_at: new Date().toISOString()
        };

        if (refNum) {
            updateData.reference_number = refNum;
        }

        const { data, error } = await supabase
            .from('requisitions')
            .update(updateData)
            .eq('id', id)
            .eq('organization_id', (req as any).user.organization_id)
            .neq('status', status)
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Requisition not found' });

        // Determine if we need a system message and its stage
        const stageToCreate = status === 'AUTHORISED' ? 'DISBURSAL' : 
                              status === 'DISBURSED' ? 'EXPENSE_TRACKING' : 
                              undefined;

        // Idempotency Check: Prevent duplicate system messages if this stage was already logged
        let shouldCreateMessage = true;
        if (stageToCreate) {
            const { data: existingMsg } = await supabase
                .from('requisition_messages')
                .select('id')
                .eq('requisition_id', id)
                .contains('metadata', { stage: stageToCreate })
                .limit(1)
                .maybeSingle();
            
            if (existingMsg) {
                shouldCreateMessage = false;
            }
        }

        if (shouldCreateMessage) {
            // Trigger system message
            await RequisitionMessageService.createMessage({
                requisitionId: id,
                userId: (req as any).user.id,
                content: status === 'AUTHORISED' ? 'How would you like to disburse these funds?' : 
                         status === 'DISBURSED' ? 'Transaction needs to be expensed' : 
                         `Status updated to ${status}`,
                type: 'SYSTEM',
                metadata: { 
                    status,
                    stage: stageToCreate
                }
            });
        }

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
            .select('status, requestor_id, estimated_total')
            .eq('id', id)
            .single();

        if (reqError || !requisition) {
            return res.status(404).json({ error: 'Requisition not found' });
        }

        if (requisition.requestor_id !== (req as any).user.id) {
            return res.status(403).json({ 
                error: 'Unauthorized',
                message: 'Only the original requestor of this requisition is authorized to enter final expense details and upload receipts.'
            });
        }

        // Allow updating expenses if status is DISBURSED, EXPENSED or RECEIVED
        if (requisition.status !== 'RECEIVED' && requisition.status !== 'DISBURSED' && requisition.status !== 'EXPENSED') {
            return res.status(400).json({ error: 'Requisition must be DISBURSED, EXPENSED or RECEIVED to track expenses' });
        }

        // 2. Update Line Items
        // Loop through items and update individually. A batch update would be better but Supabase JS doesn't support bulk update with different values easily without RPC.
        // Given typically low number of line items, loop is acceptable for MVP.
        const promises = items.map((item: any) => {
            const updateData: any = {
                actual_amount: item.actual_amount,
                receipt_url: item.receipt_url,
                updated_at: new Date().toISOString()
            };

            // If a receipt_url is provided but there's no OCR status yet, mark it as PENDING
            if (item.receipt_url) {
                updateData.receipt_ocr_status = 'PENDING';
            }

            return supabase
                .from('line_items')
                .update(updateData)
                .eq('id', item.id)
                .eq('requisition_id', id);
        });

        await Promise.all(promises);

        // 3. Update Requisition Header Actual Total (Optional but good for reporting)
        // We can do this by summing up all line items.
        const { data: allItems } = await supabase
            .from('line_items')
            .select('actual_amount')
            .eq('requisition_id', id);

        const actualTotal = allItems?.reduce((sum: number, item: any) => sum + (item.actual_amount || 0), 0) || 0;
        
        // Use the fetched requisition to check estimated_total
        const estimatedTotal = requisition.estimated_total;
        const status = (Math.abs(actualTotal - (estimatedTotal || 0)) < 0.01) ? 'RECEIVED' : 'EXPENSED';

        await supabase
            .from('requisitions')
            .update({
                actual_total: actualTotal,
                status,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        // 4. Trigger OCR analysis synchronously for Vercel compatibility 
        // (Serverless functions terminate background tasks upon response)
        const itemsWithNewReceipts = items.filter((item: any) => item.receipt_url);
        if (itemsWithNewReceipts.length > 0) {
            console.log(`[OCR] Processing ${itemsWithNewReceipts.length} receipts synchronously...`);
            const startTime = Date.now();
            
            await Promise.all(itemsWithNewReceipts.map(async (item: any) => {
                const itemStart = Date.now();
                try {
                    // Build public URL from path
                    const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(item.receipt_url);
                    const publicUrl = urlData.publicUrl;

                    // Skip PDFs for now
                    if (item.receipt_url.match(/\.pdf$/i)) {
                        await supabase.from('line_items').update({
                            receipt_ocr_status: 'FAILED',
                            receipt_ocr_data: { error: 'PDF analysis not supported. Please upload an image.' }
                        }).eq('id', item.id);
                        return;
                    }

                    const ocrData = await ocrService.analyzeReceipt(publicUrl);

                    await supabase.from('line_items').update({
                        receipt_ocr_data: ocrData,
                        receipt_ocr_status: ocrData.error ? 'FAILED' : 'DONE'
                    }).eq('id', item.id);

                    const duration = ((Date.now() - itemStart) / 1000).toFixed(2);
                    console.log(`[OCR] Completed for item ${item.id} in ${duration}s: ${ocrData.vendor || 'Unknown vendor'}`);
                } catch (ocrErr: any) {
                    const duration = ((Date.now() - itemStart) / 1000).toFixed(2);
                    console.error(`[OCR] Failed for item ${item.id} after ${duration}s:`, ocrErr.message);
                    await supabase.from('line_items').update({
                        receipt_ocr_status: 'FAILED',
                        receipt_ocr_data: { error: ocrErr.message }
                    }).eq('id', item.id);
                }
            }));
            
            const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`[OCR] All items processed in ${totalDuration}s`);
        }

        res.json({ message: 'Expenses updated and analyzed successfully', actual_total: actualTotal });
        
        // 5. Trigger AI Review & Categorization stage automatically
        const organizationId = (req as any).user.organization_id;
        const userId = (req as any).user.id;
        
        // Calculate change for the summary message
        const change = (estimatedTotal || 0) - actualTotal;
        const changeText = change > 0 
            ? ` Change to Submit: K${change.toLocaleString(undefined, { minimumFractionDigits: 2 })}.` 
            : ' No change to submit.';

        // Create a summary message to record the event in the chat
        await RequisitionMessageService.createMessage({
            requisitionId: id,
            userId,
            content: `Expenses tracked: Total Actual K${actualTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}.${changeText}`,
            type: 'SYSTEM',
            metadata: { 
                stage: 'EXPENSE_SUMMARY',
                actualTotal,
                changeAmount: change > 0 ? change : 0
            }
        });

        // Add a deliberate delay so the user sees the summary/status change before AI kicks in
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Trigger AI Review & Categorization
        await triggerAIReview(id, organizationId, userId).catch(err => 
            console.error('[AI Review] Auto-trigger failed:', err)
        );

    } catch (error: any) {
        console.error('Error updating expenses:', error);
        res.status(500).json({ error: 'Failed to update expenses', details: error.message });
    }
};

/**
 * On-demand re-analysis of a specific line item's receipt.
 * POST /requisitions/:id/items/:itemId/analyze-receipt
 */
export const analyzeReceiptItem = async (req: any, res: any): Promise<any> => {
    try {
        const { id, itemId } = req.params;

        const { data: item, error: itemError } = await supabase
            .from('line_items')
            .select('id, receipt_url, requisition_id')
            .eq('id', itemId)
            .eq('requisition_id', id)
            .single();

        if (itemError || !item) {
            return res.status(404).json({ error: 'Line item not found' });
        }

        if (!item.receipt_url) {
            return res.status(400).json({ 
                error: 'No receipt URL found for this item in the database.',
                message: 'If you just uploaded a receipt, please click "Save Expenses" first to persist the file path before starting AI analysis.'
            });
        }

        if (item.receipt_url.match(/\.pdf$/i)) {
            return res.status(400).json({ error: 'PDF analysis not supported. Please upload an image.' });
        }

        // Mark as pending
        await supabase.from('line_items').update({ receipt_ocr_status: 'PENDING' }).eq('id', itemId);

        // Perform analysis synchronously for Vercel reliability
        try {
            const storagePath = item.receipt_url.startsWith('receipts/') 
                ? item.receipt_url.substring(9) 
                : item.receipt_url;

            const { data: fileData, error: downloadError } = await supabase.storage
                .from('receipts')
                .download(storagePath);

            if (downloadError) throw downloadError;

            const buffer = Buffer.from(await fileData.arrayBuffer());
            const ocrData = await ocrService.analyzeReceipt(undefined, buffer);

            await supabase.from('line_items').update({
                receipt_ocr_data: ocrData,
                receipt_ocr_status: ocrData.error ? 'FAILED' : 'DONE'
            }).eq('id', itemId);

            res.json({ message: 'Receipt analysis completed', status: ocrData.error ? 'FAILED' : 'DONE', data: ocrData });
        } catch (err: any) {
            await supabase.from('line_items').update({
                receipt_ocr_status: 'FAILED',
                receipt_ocr_data: { error: err.message }
            }).eq('id', itemId);
            throw err;
        }

    } catch (error: any) {
        console.error('Error triggering receipt analysis:', error);
        res.status(500).json({ error: 'Failed to analyze receipt', details: error.message });
    }
};

export const submitChange = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const { denominations, change_amount, submission_method, change_external_reference } = req.body;
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
                actual_change_amount: change_amount,
                change_submission_method: submission_method || 'CASH',
                change_external_reference: change_external_reference || null
            })
            .eq('requisition_id', id);

        if (disbError) throw disbError;

        // 3. Automated Finalization for Wallet Submission
        if (submission_method === 'MONEYWISE_WALLET') {
            console.log(`[SubmitChange] Automated finalization for Wallet submission (Req ${id})`);
            
            // Re-fetch with full details for finalization (need organization and line items)
            const { data: fullReq } = await supabase
                .from('requisitions')
                .select('*, line_items(*), disbursements(*)')
                .eq('id', id)
                .single();

            const organizationId = (req as any).user.organization_id;
            const disbursement = fullReq?.disbursements?.[0];

            if (!fullReq || !disbursement || !organizationId) {
                throw new Error("Required information for automated finalization is missing");
            }

            // A. Verify External Reference
            if (!change_external_reference) {
                return res.status(400).json({ error: 'Missing external reference for wallet submission' });
            }

            // B. Ensure Entry exists in Cashbook (Process Lenco status if needed)
            const { data: existingEntry } = await supabase
                .from('cashbook_entries')
                .select('id')
                .like('description', `%${change_external_reference}`)
                .maybeSingle();

            if (!existingEntry) {
                console.log(`[SubmitChange] Ref ${change_external_reference} not in ledger. Checking Lenco...`);
                const lencoStatus = await LencoService.getCollectionStatus(change_external_reference);
                if (lencoStatus && lencoStatus.status === 'successful') {
                    await handleCollectionSuccessful(lencoStatus, organizationId);
                } else {
                    return res.status(400).json({ 
                        error: 'Wallet deposit not found or still pending', 
                        message: `We couldn't find a successful deposit for reference ${change_external_reference}. Please ensure the deposit is completed.`
                    });
                }
            }

            // C. Calculate Discrepancy (same logic as confirmChange)
            const totalDisbursed = Number(disbursement.total_prepared || 0);
            const isLoanOrAdvance = fullReq.type === 'LOAN' || fullReq.type === 'ADVANCE';
            const lineItems = fullReq.line_items || [];
            
            let actualExpenditure = 0;
            if (isLoanOrAdvance) {
                actualExpenditure = Number(fullReq.estimated_total || 0);
            } else {
                // INCLUDE all line items (including withdrawal fees) for accounting discrepancy calculation
                actualExpenditure = lineItems.reduce((acc: number, item: any) => acc + Number(item.actual_amount || item.estimated_amount || 0), 0);
            }

            const confirmedChange = Number(change_amount || 0);
            const discrepancy = totalDisbursed - actualExpenditure - confirmedChange;

            // D. Auto-Update Disbursement Confirmation Fields
            await supabase
                .from('disbursements')
                .update({
                    confirmed_denominations: denominations,
                    confirmed_change_amount: confirmedChange,
                    confirmed_by: user_id,
                    confirmed_at: new Date().toISOString(),
                    discrepancy_amount: discrepancy
                })
                .eq('id', disbursement.id);

            // E. Generate Voucher
            const voucherRef = `PV-${fullReq.reference_number || id.slice(0, 6)}`;
            const { data: voucher, error: voucherError } = await supabase
                .from('vouchers')
                .insert({
                    requisition_id: id,
                    organization_id: organizationId,
                    created_by: user_id,
                    reference_number: voucherRef,
                    total_credit: actualExpenditure,
                    total_debit: actualExpenditure,
                    status: 'DRAFT'
                })
                .select()
                .single();

            if (voucherError) throw voucherError;

            // F. Finalize Ledger
            await cashbookService.finalizeDisbursement(
                organizationId,
                id,
                actualExpenditure,
                voucher.id,
                discrepancy,
                voucher.reference_number,
                submission_method
            );

            // G. Trigger AI Review & Categorization
            await triggerAIReview(id, organizationId, user_id);

            res.json({ message: 'Change submitted and logged via Wallet. Proceeding to AI Review.', voucher_id: voucher.id });
            
            // H. Trigger Notification
            emailService.notifyRequisitionEvent(id, 'REQUISITION_COMPLETED').catch(err =>
                console.error('[Notification Error] Failed to send AUTO_COMPLETED email:', err)
            );
        } else {
            // Standard Cash Workflow: Just move to CHANGE_SUBMITTED
            const { error: statusError } = await supabase
                .from('requisitions')
                .update({ status: 'CHANGE_SUBMITTED', updated_at: new Date().toISOString() })
                .eq('id', id);

            if (statusError) throw statusError;

            res.json({ message: 'Change submitted successfully' });

            // Trigger Notification
            emailService.notifyRequisitionEvent(id, 'CHANGE_SUBMITTED').catch(err =>
                console.error('[Notification Error] Failed to send CHANGE_SUBMITTED email:', err)
            );
        }
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
        const organizationId = (req as any).user.organization_id;

        // 1. Verify Role
        const userRole = (req as any).user.role;
        if (userRole !== 'ACCOUNTANT' && userRole !== 'CASHIER' && userRole !== 'ADMIN') {
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

        // Sum up actual expenditure directly from line items (or use estimated_total for loans)
        const isLoanOrAdvance = requisition.type === 'LOAN' || requisition.type === 'ADVANCE';
        const lineItems = requisition.line_items || [];

        let actualExpenditure = 0;
        if (isLoanOrAdvance) {
            actualExpenditure = Number(requisition.estimated_total || 0);
        } else {
            actualExpenditure = lineItems.reduce((acc: number, item: any) => acc + Number(item.actual_amount || item.estimated_amount || 0), 0);
        }

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
                organization_id: organizationId,
                created_by: cashier_id,
                reference_number: voucherRef,
                total_credit: actualExpenditure,
                total_debit: actualExpenditure,
                status: 'DRAFT'
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
        if (!organizationId) throw new Error("Missing organization context");

        const submissionMethod = disbursement.change_submission_method || 'CASH';

        // Additional Verification for Wallet Submission
        if (submissionMethod === 'MONEYWISE_WALLET') {
            const ref = disbursement.change_external_reference;
            if (!ref) {
                return res.status(400).json({ error: 'Missing external reference for wallet submission' });
            }

            // Verify the transaction exists and is successful
            const { data: existingEntry } = await supabase
                .from('cashbook_entries')
                .select('id')
                .like('description', `%${ref}`)
                .maybeSingle();

            if (!existingEntry) {
                // If not in DB, try one last check on Lenco
                console.log(`[ConfirmChange] Ref ${ref} not found in ledger. Checking Lenco...`);
                const lencoStatus = await LencoService.getCollectionStatus(ref);
                if (lencoStatus && lencoStatus.status === 'successful') {
                    await handleCollectionSuccessful(lencoStatus, organizationId);
                } else {
                    return res.status(400).json({ 
                        error: 'Wallet deposit not found or still pending', 
                        message: `We couldn't find a successful deposit for reference ${ref}. Please ensure the requestor has completed the deposit.`
                    });
                }
            }
        }

        await cashbookService.finalizeDisbursement(
            organizationId,
            id,
            actualExpenditure,
            voucher.id,
            discrepancy,
            voucher.reference_number,
            submissionMethod
        );

        // 6. Trigger AI Review & Categorization
        await triggerAIReview(id, organizationId, cashier_id);

        res.json({ message: 'Change confirmed and logged in ledger. Proceeding to AI Review.', discrepancy, voucher_id: voucher.id });

        // 8. Trigger Notification
        emailService.notifyRequisitionEvent(id, 'REQUISITION_COMPLETED').catch(err =>
            console.error('[Notification Error] Failed to send REQUISITION_COMPLETED email:', err)
        );

        // NOTE: QuickBooks Sync is now deferred to the "Post Voucher" step in the Accounting Workflow.
        // We no longer trigger it here.
    } catch (error: any) {
        console.error('Error confirming change:', error);
        res.status(500).json({ error: 'Failed to confirm change', details: error.message });
    }
};

export const getRequisitionMessages = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const messages = await RequisitionMessageService.getMessages(id);
        res.json(messages);
    } catch (error: any) {
        console.error('Error fetching requisition messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages', details: error.message });
    }
};

export const sendRequisitionMessage = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const { content, type = 'CHAT', metadata = {} } = req.body;
        const userId = (req as any).user.id;

        const message = await RequisitionMessageService.createMessage({
            requisitionId: id,
            userId,
            content,
            type,
            metadata
        });

        res.status(201).json(message);
    } catch (error: any) {
        console.error('Error sending requisition message:', error);
        res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
};

/**
 * Helper to trigger AI Categorization and send the Review message
 */
async function triggerAIReview(requisitionId: string, organizationId: string, userId: string) {
    try {
        console.log(`[AI Review] Triggering for Req ${requisitionId}`);
        
        // 1. Update Status
        await supabase
            .from('requisitions')
            .update({ status: 'CATEGORIZING', updated_at: new Date().toISOString() })
            .eq('id', requisitionId);

        // 2. Find or create a single AI_REVIEW message — NEVER create a second one.
        //    Use order + limit to safely get the most recent one, avoiding .single() errors.
        const { data: existingMsgRows } = await supabase
            .from('requisition_messages')
            .select('id')
            .eq('requisition_id', requisitionId)
            .contains('metadata', { stage: 'AI_REVIEW' })
            .order('created_at', { ascending: false })
            .limit(1);

        const existingMsg = existingMsgRows?.[0] || null;

        let aiMessageId: string;

        if (existingMsg) {
            // Update the existing message to "thinking" state
            await RequisitionMessageService.updateMessage(existingMsg.id, {
                content: 'AI is re-categorizing your transaction. Please wait...',
                metadata: { stage: 'AI_REVIEW', isThinking: true }
            });
            aiMessageId = existingMsg.id;
        } else {
            // First-time: create the message
            const newMsg = await RequisitionMessageService.createMessage({
                requisitionId,
                userId,
                content: 'AI is categorizing your transaction. Please wait...',
                type: 'SYSTEM',
                metadata: { stage: 'AI_REVIEW', isThinking: true }
            });
            aiMessageId = newMsg.id;
        }

        // 3. Fetch Line Items
        const { data: lineItems } = await supabase
            .from('line_items')
            .select('*')
            .eq('requisition_id', requisitionId);

        if (!lineItems || lineItems.length === 0) {
            await RequisitionMessageService.updateMessage(aiMessageId, {
                content: 'No line items found to categorize.',
                metadata: { stage: 'AI_REVIEW', isThinking: false }
            });
            return;
        }

        // 4. Get Chart of Accounts for Grounding
        const { data: accounts, error: accountsError } = await supabase
            .from('accounts')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('is_active', true);

        if (accountsError || !accounts || accounts.length === 0) {
            console.warn(`[AI Review] No active accounts found for organization ${organizationId}. Skipping AI categorization.`);
            await RequisitionMessageService.updateMessage(aiMessageId, {
                content: 'AI categorization is currently disabled because your Chart of Accounts is not set up. Please import or create accounts to enable this feature.',
                metadata: { stage: 'AI_REVIEW_DISABLED', isThinking: false }
            });
            return;
        }

        // 5. Get Suggestions
        const suggestions = await aiService.suggestBatch(accounts || [], lineItems.map(li => ({
            description: li.description,
            amount: li.actual_amount || li.estimated_amount,
            receipt_data: li.receipt_ocr_data
        })));

        // 6. Update Line Items & Prepare metadata
        const itemsMetadata = [];
        for (let i = 0; i < lineItems.length; i++) {
            const li = lineItems[i];
            const suggestion = suggestions[i];
            
            // CRITICAL FIX: Resolve the account UUID from the code returned by AI
            // If we don't do this, the join in the reports/ledger will fail.
            const matchedAccount = accounts?.find(a => String(a.code) === String(suggestion.account_code));
            const accountId = matchedAccount ? matchedAccount.id : null;

            await supabase
                .from('line_items')
                .update({
                    account_id: accountId,
                    qb_account_id: matchedAccount?.qb_account_id || null,
                    qb_account_name: matchedAccount?.name || null,
                    ai_reasoning: suggestion.reasoning,
                    ai_confidence: suggestion.confidence,
                    ai_decision_path: suggestion.method
                })
                .eq('id', li.id);

            itemsMetadata.push({
                id: li.id,
                description: li.description,
                amount: li.actual_amount || li.estimated_amount,
                category_code: suggestion.account_code,
                category_name: matchedAccount?.name || suggestion.account_code,
                reasoning: suggestion.reasoning,
                confidence: suggestion.confidence,
                method: suggestion.method
            });
        }

        // 7. Always update the SAME message — clear isThinking and set final results
        await RequisitionMessageService.updateMessage(aiMessageId, {
            content: 'AI has categorized your transaction. Please review and approve.',
            metadata: { 
                stage: 'AI_REVIEW',
                isThinking: false,
                items: itemsMetadata
            }
        });

        console.log(`[AI Review] Completed for Req ${requisitionId}. Message ${aiMessageId} updated.`);
    } catch (err) {
        console.error('[AI Review Error]', err);
        // Attempt to find and clear any stuck thinking state on failure
        try {
            const { data: stuckMsgs } = await supabase
                .from('requisition_messages')
                .select('id')
                .eq('requisition_id', requisitionId)
                .contains('metadata', { stage: 'AI_REVIEW', isThinking: true })
                .order('created_at', { ascending: false })
                .limit(1);
            
            if (stuckMsgs?.[0]) {
                await RequisitionMessageService.updateMessage(stuckMsgs[0].id, {
                    content: 'AI categorization encountered an error. Please click Reload to try again.',
                    metadata: { stage: 'AI_REVIEW', isThinking: false, hasError: true }
                });
            }
        } catch (cleanupErr) {
            console.error('[AI Review] Failed to clear stuck thinking state:', cleanupErr);
        }
    }
}

export const approveCategorization = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { overrides } = req.body; // Array of { id: string, account_id: string }
        const user_id = (req as any).user.id;

        // 1. Apply overrides if provided (User manually edited AI suggestions)
        if (overrides && Array.isArray(overrides)) {
            const organizationId = (req as any).user.organization_id;
            
            // Fetch all expense accounts for this org to enable denormalization
            const { data: accounts } = await supabase
                .from('accounts')
                .select('id, name, qb_account_id')
                .eq('organization_id', organizationId);

            for (const item of overrides) {
                if (!item.id || !item.account_id) continue;
                
                const matchedAccount = accounts?.find(a => a.id === item.account_id);

                await supabase
                    .from('line_items')
                    .update({ 
                        account_id: item.account_id,
                        qb_account_id: matchedAccount?.qb_account_id || null,
                        qb_account_name: matchedAccount?.name || null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', item.id);
            }
        }

        // 2. Check for QuickBooks integration
        const organizationId = (req as any).user.organization_id;
        const { data: qbIntegration } = await supabase
            .from('integrations')
            .select('id')
            .eq('provider', 'QUICKBOOKS')
            .eq('organization_id', organizationId)
            .single();

        const isQBConnected = !!qbIntegration;
        const nextStatus = isQBConnected ? 'CATEGORIZED' : 'COMPLETED';

        // 3. Update Requisition Status
        const { error } = await supabase
            .from('requisitions')
            .update({ 
                status: nextStatus, 
                updated_at: new Date().toISOString() 
            })
            .eq('id', id);

        if (error) throw error;

        // Send "Approved" message to the right (Blue)
        await RequisitionMessageService.createMessage({
            requisitionId: id,
            userId: user_id,
            content: isQBConnected ? 'Categorization Approved' : 'Categorization Approved. Requisition COMPLETED.',
            type: 'CHAT',
            metadata: { isSummary: true, isCategorizationApproval: true }
        });

        if (isQBConnected) {
            // Send QuickBooks Posting card
            await RequisitionMessageService.createMessage({
                requisitionId: id,
                userId: user_id,
                content: 'Post this transaction to QuickBooks?',
                type: 'SYSTEM',
                metadata: { stage: 'QUICKBOOKS_POSTING' }
            });
        } else {
            // Send final completion message
            await RequisitionMessageService.createMessage({
                requisitionId: id,
                userId: user_id,
                content: 'Transaction has been fully categorized. Since QuickBooks is not connected, this requisition is now marked as COMPLETED.',
                type: 'SYSTEM',
                metadata: { stage: 'COMPLETED' }
            });
        }

        res.json({ message: 'Categorization approved' });
    } catch (error: any) {
        console.error('Error approving categorization:', error);
        res.status(500).json({ error: 'Failed to approve categorization', details: error.message });
    }
};

export const retriggerAICategorization = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const organization_id = (req as any).user.organization_id;
        const user_id = (req as any).user.id;

        // Simply call the helper
        await triggerAIReview(id, organization_id, user_id);

        res.json({ message: 'AI Categorization re-triggered successfully' });
    } catch (error: any) {
        console.error('Error re-triggering AI categorization:', error);
        res.status(500).json({ error: 'Failed to re-trigger AI categorization', details: error.message });
    }
};

export const postToQuickBooks = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { payment_account_id, payment_account_name } = req.body;
        const organization_id = (req as any).user.organization_id;
        const user_id = (req as any).user.id;

        const { data: items } = await supabase
            .from('line_items')
            .select('*')
            .eq('requisition_id', id);

        if (!items || items.length === 0) throw new Error("No items to post");

        const qbResult = await QuickBooksService.createExpense(
            id, user_id, organization_id, payment_account_id, payment_account_name
        );

        if (!qbResult.success) throw new Error(qbResult.error as string);

        await supabase.from('requisitions').update({ status: 'ACCOUNTED' }).eq('id', id);

        // Send Success message
        await RequisitionMessageService.createMessage({
            requisitionId: id,
            userId: user_id,
            content: 'Successfully posted to QuickBooks',
            type: 'SYSTEM',
            metadata: { stage: 'POSTED_SUCCESS', qbExpenseId: qbResult.qbId }
        });

        res.json({ message: 'Success', qb_expense_id: qbResult.qbId });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * AI Receipt Scanning & Allocation
 */
export const scanReceipts = async (req: any, res: any): Promise<any> => {
    try {
        const { id } = req.params;
        const { imageUrls } = req.body; // Array of storage paths or URLs
        const userId = (req as any).user.id;
        const organizationId = (req as any).user.organization_id;

        if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
            return res.status(400).json({ error: 'No receipt images provided' });
        }

        console.log(`[Scan Receipts] Processing ${imageUrls.length} receipts for Req ${id}`);

        // 1. Fetch current line items for matching
        const { data: lineItems } = await supabase
            .from('line_items')
            .select('*')
            .eq('requisition_id', id);

        if (!lineItems || lineItems.length === 0) {
            return res.status(400).json({ error: 'No line items found for this requisition' });
        }

        const allExtractedItems: any[] = [];
        const processedReceipts = [];
        const processingErrors: string[] = [];

        // 2. Process each receipt
        for (const imageUrl of imageUrls) {
            try {
                // Strip "receipts/" prefix if present for storage calls
                const storagePath = imageUrl.startsWith('receipts/') 
                    ? imageUrl.substring(9) 
                    : imageUrl;

                console.log(`[Scan Receipts] Downloading from storage: ${storagePath}`);

                // 2. Download directly from storage to avoid public URL issues
                const { data: fileData, error: downloadError } = await supabase.storage
                    .from('receipts')
                    .download(storagePath);

                if (downloadError) {
                    throw new Error(`Failed to download receipt from storage: ${downloadError.message}`);
                }

                // Convert to Buffer
                const buffer = Buffer.from(await fileData.arrayBuffer());

                // OCR Analysis
                const ocrData = await ocrService.analyzeReceipt(undefined, buffer);
                
                if (ocrData.error) {
                    throw new Error(ocrData.error);
                }

                // If AI found the total but no line items (common for simple receipts like toll/fuel),
                // synthesize a line item to ensure matching and UI rendering works correctly.
                if ((!ocrData.line_items || ocrData.line_items.length === 0) && ocrData.total_amount) {
                    console.log(`[Scan Receipts] Synthesizing line item for simple receipt: ${ocrData.vendor}`);
                    ocrData.line_items = [{
                        description: `Charge from ${ocrData.vendor || 'Vendor'}`,
                        quantity: 1,
                        unit_price: ocrData.total_amount,
                        total: ocrData.total_amount
                    }];
                }

                // Check if receipt already exists for this requisition and file_url
                const { data: existingReceipt } = await supabase
                    .from('receipts')
                    .select('id')
                    .eq('requisition_id', id)
                    .eq('file_url', imageUrl)
                    .maybeSingle();

                let savedReceipt;
                if (existingReceipt) {
                    // Update existing
                    const { data: updated, error: updateError } = await supabase
                        .from('receipts')
                        .update({
                            ocr_data: ocrData,
                            ocr_text: ocrData.raw_text || ''
                        })
                        .eq('id', existingReceipt.id)
                        .select()
                        .single();
                        
                    if (updateError) throw new Error(`Update receipt failed: ${updateError.message}`);
                    savedReceipt = updated;
                } else {
                    // Insert new
                    const { data: inserted, error: insertError } = await supabase
                        .from('receipts')
                        .insert({
                            requisition_id: id,
                            file_url: imageUrl,
                            ocr_data: ocrData,
                            ocr_text: ocrData.raw_text || '',
                            uploaded_by: userId
                        })
                        .select()
                        .single();
                        
                    if (insertError) throw new Error(`Insert receipt failed: ${insertError.message}`);
                    savedReceipt = inserted;
                }

                processedReceipts.push(savedReceipt);

                // Prepare items for matching - tag them with their source receipt ID
                if (ocrData.line_items) {
                    const enrichedItems = ocrData.line_items.map((li: any) => ({
                        ...li,
                        source_receipt_id: savedReceipt.id,
                        source_receipt_vendor: ocrData.vendor || 'Unknown Vendor',
                        source_receipt_total: ocrData.total_amount
                    }));
                    allExtractedItems.push(...enrichedItems);
                }
            } catch (err: any) {
                console.error(`[Scan Receipts] Individual receipt processing failed: ${imageUrl}`, err.message);
                processingErrors.push(`${imageUrl}: ${err.message}`);
            }
        }

        if (allExtractedItems.length === 0) {
            console.log('[Scan Receipts] No line items extracted.');
            
            // If we had errors and no success at all, return error
            if (processingErrors.length > 0 && processedReceipts.length === 0) {
                return res.status(400).json({ 
                    error: 'AI could not process any receipts.', 
                    details: processingErrors.join('; ') 
                });
            }

            return res.status(200).json({ 
                success: true,
                message: 'Receipts processed, but AI could not extract specific line items.',
                receipts: processedReceipts,
                matches: []
            });
        }

        // 3. Match extracted items to requested line items
        console.log(`[Scan Receipts] Matching ${allExtractedItems.length} extracted items with ${lineItems.length} requisition items...`);
        
        // Include both estimated and actual amounts for better matching context
        const requestedItemsContext = lineItems.map(i => ({
            id: i.id,
            description: i.description,
            amount: i.estimated_amount,
            current_actual_amount: i.actual_amount
        }));

        let matchResult;
        try {
            matchResult = await ocrService.matchExtractedItems(requestedItemsContext, allExtractedItems);
        } catch (matchErr: any) {
            console.error('[Scan Receipts] AI Matching failed:', matchErr.message);
            // Fallback: return success with processed receipts but no matches
            return res.status(200).json({
                success: true,
                message: `Receipts processed, but AI matching failed: ${matchErr.message}`,
                receipts: processedReceipts,
                matches: [],
                errors: processingErrors
            });
        }

        if (matchResult && matchResult.matches) {
            // 4. Update database with findings
            const updatePromises = matchResult.matches.map((match: any) => {
                return supabase
                    .from('line_items')
                    .update({
                        ai_extracted_amount: match.extracted_amount,
                        receipt_ocr_data: match, // Store the match details
                        receipt_ocr_status: 'DONE',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', match.requested_item_id);
            });

            await Promise.all(updatePromises);
        }

        res.json({
            message: 'Receipts processed and items allocated successfully',
            receipts: processedReceipts,
            matches: matchResult?.matches || [],
            unmatched_extracted: matchResult?.unmatched_extracted || [],
            unmatched_requested_ids: matchResult?.unmatched_requested_ids || []
        });

    } catch (error: any) {
        console.error('[Scan Receipts] Critical error:', error);
        res.status(500).json({ error: 'AI Receipt Scanning failed', details: error.message });
    }
};

export const deleteReceipt = async (req: any, res: any): Promise<any> => {
    try {
        const { id, receiptId } = req.params;

        // 1. Fetch receipt to get file_url
        const { data: receipt, error: fetchError } = await supabase
            .from('receipts')
            .select('file_url')
            .eq('id', receiptId)
            .single();

        if (fetchError || !receipt) {
            return res.status(404).json({ error: 'Receipt not found' });
        }

        // 2. Delete from Storage
        const storagePath = receipt.file_url.startsWith('receipts/') 
            ? receipt.file_url.substring(9) 
            : receipt.file_url;

        const { error: storageError } = await supabase.storage
            .from('receipts')
            .remove([storagePath]);

        if (storageError) {
            console.error('[Delete Receipt] Storage removal failed:', storageError);
        }

        // 3. Delete from Database
        const { error: dbError } = await supabase
            .from('receipts')
            .delete()
            .eq('id', receiptId);

        if (dbError) throw dbError;

        res.json({ message: 'Receipt deleted successfully' });
    } catch (error: any) {
        console.error('[Delete Receipt] Error:', error);
        res.status(500).json({ error: 'Failed to delete receipt', details: error.message });
    }
};

export const deleteRequisitionMessage = async (req: any, res: any): Promise<any> => {
    try {
        const { id, messageId } = req.params;
        const user_id = (req as any).user.id;

        // Fetch message to check permissions
        const { data: message, error: fetchError } = await supabase
            .from('requisition_messages')
            .select('*')
            .eq('id', messageId)
            .eq('requisition_id', id)
            .single();

        if (fetchError || !message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Allow deletion if:
        // 1. It's the user's own message
        // 2. It's a REPAIRED system message (Undo)
        const isRepaired = message.metadata?.isRepaired;
        const isOwner = message.user_id === user_id;

        if (!isOwner && !isRepaired) {
            return res.status(403).json({ error: 'Unauthorized to delete this message' });
        }

        const { error: deleteError } = await supabase
            .from('requisition_messages')
            .delete()
            .eq('id', messageId);

        if (deleteError) throw deleteError;

        res.json({ message: 'Message deleted successfully' });
    } catch (error: any) {
        console.error('[Delete Message] Error:', error);
        res.status(500).json({ error: 'Failed to delete message', details: error.message });
    }
};



