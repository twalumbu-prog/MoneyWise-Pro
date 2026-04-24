import { supabase } from '../lib/supabase';

export class RequisitionMessageService {
    static async createMessage(params: {
        requisitionId: string;
        userId: string;
        content: string;
        type?: 'CHAT' | 'SYSTEM';
        metadata?: any;
    }) {
        const { requisitionId, userId, content, type = 'CHAT', metadata = {} } = params;

        const { data, error } = await supabase
            .from('requisition_messages')
            .insert({
                requisition_id: requisitionId,
                user_id: userId,
                message_type: type,
                content,
                metadata
            })
            .select(`
                *,
                user:users!user_id(name)
            `)
            .single();

        if (error) {
            console.error('[RequisitionMessageService] Error creating message:', error);
            throw error;
        }

        // Mark requisition as having unread updates
        await supabase
            .from('requisitions')
            .update({ has_unread_updates: true })
            .eq('id', requisitionId);

        return {
            ...data,
            user_name: data.user?.name || 'System'
        };
    }



    static async repairLifecycleMessages(requisitionId: string) {
        console.log(`[RequisitionMessageService] Repairing lifecycle for ${requisitionId}...`);
        
        // 1. Fetch requisition with full lifecycle data
        const { data: req, error: reqError } = await supabase
            .from('requisitions')
            .select(`
                *,
                line_items(*, accounts(code, name)),
                disbursements(*),
                receipts(*)
            `)
            .eq('id', requisitionId)
            .single();

        if (reqError || !req) {
            console.error('[RequisitionMessageService] Repair failed: Requisition not found', requisitionId);
            return;
        }

        // 2. Fetch existing messages to find gaps
        const { data: messages } = await supabase
            .from('requisition_messages')
            .select('id, metadata')
            .eq('requisition_id', requisitionId);

        const existingStages = new Set(messages?.map(m => m.metadata?.stage).filter(Boolean) || []);
        const userId = req.requestor_id;

        // 3. Sequential Backfill
        
        // Stage 1: APPROVAL
        if (!existingStages.has('APPROVAL')) {
            await this.createMessage({
                requisitionId,
                userId,
                content: 'Requisition submitted for approval',
                type: 'SYSTEM',
                metadata: { stage: 'APPROVAL', isRepaired: true }
            });
        }

        // Stage 2: DISBURSAL (If AUTHORISED or further)
        if (['AUTHORISED', 'DISBURSED', 'RECEIVED', 'EXPENSED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'].includes(req.status)) {
            if (!existingStages.has('DISBURSAL')) {
                await this.createMessage({
                    requisitionId,
                    userId,
                    content: 'How would you like to disburse these funds?',
                    type: 'SYSTEM',
                    metadata: { stage: 'DISBURSAL', isRepaired: true }
                });
            }
        }

        // Stage 3: DISBURSAL_SUCCESS (If DISBURSED or further AND disbursement exists)
        if (['DISBURSED', 'RECEIVED', 'EXPENSED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'].includes(req.status)) {
            if (!existingStages.has('DISBURSAL_SUCCESS') && req.disbursements?.length > 0) {
                const disb = req.disbursements[0];
                await this.createMessage({
                    requisitionId,
                    userId,
                    content: `Funds Disbursed: K${Number(disb.total_prepared).toLocaleString()}\nMethod: ${disb.payment_method}\nRef: ${disb.external_reference || 'N/A'}\nStatus: SUCCESS`,
                    type: 'SYSTEM',
                    metadata: { 
                        stage: 'DISBURSAL_SUCCESS', 
                        disbursement_id: disb.id,
                        isSummary: true,
                        isRepaired: true,
                        amount: disb.total_prepared,
                        payment_method: disb.payment_method,
                        external_reference: disb.external_reference
                    }
                });
            }
        }

        // Stage 4: EXPENSE_TRACKING (If DISBURSED or further)
        if (['DISBURSED', 'RECEIVED', 'EXPENSED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'].includes(req.status)) {
            if (!existingStages.has('EXPENSE_TRACKING')) {
                await this.createMessage({
                    requisitionId,
                    userId,
                    content: 'Transaction needs to be expensed',
                    type: 'SYSTEM',
                    metadata: { stage: 'EXPENSE_TRACKING', isRepaired: true }
                });
            }
        }

        // Stage 5: EXPENSE_SUMMARY & AI_REVIEW (If RECEIVED or further)
        if (['RECEIVED', 'EXPENSED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'].includes(req.status)) {
            const actualTotal = req.actual_total || req.line_items?.reduce((sum: number, i: any) => sum + (i.actual_amount || 0), 0) || 0;
            const change = req.estimated_total - actualTotal;

            if (!existingStages.has('EXPENSE_SUMMARY')) {
                await this.createMessage({
                    requisitionId,
                    userId,
                    content: `Expenses tracked: Total Actual K${actualTotal.toLocaleString()}.`,
                    type: 'SYSTEM',
                    metadata: { 
                        stage: 'EXPENSE_SUMMARY',
                        actualTotal,
                        changeAmount: change > 0 ? change : 0,
                        isRepaired: true
                    }
                });
            }

            if (!existingStages.has('AI_REVIEW')) {
                // Synthesize items for AI review card
                const aiItems = req.line_items?.map((item: any) => ({
                    id: item.id,
                    description: item.description,
                    amount: item.actual_amount || item.unit_price,
                    category_code: item.account_id ? item.accounts?.code : null,
                    category_name: item.account_id ? item.accounts?.name : null,
                    confidence: 1.0,
                    logic: 'Recovered from database'
                }));

                await this.createMessage({
                    requisitionId,
                    userId,
                    content: 'AI has categorized your transaction.',
                    type: 'SYSTEM',
                    metadata: { 
                        stage: 'AI_REVIEW',
                        items: aiItems,
                        isThinking: false,
                        isRepaired: true
                    }
                });
            }
        }

        // Stage 6: QUICKBOOKS_POSTING (If COMPLETED or ACCOUNTED)
        if (['COMPLETED', 'ACCOUNTED'].includes(req.status)) {
            if (!existingStages.has('QUICKBOOKS_POSTING')) {
                await this.createMessage({
                    requisitionId,
                    userId,
                    content: 'Ready to post to QuickBooks',
                    type: 'SYSTEM',
                    metadata: { stage: 'QUICKBOOKS_POSTING', isRepaired: true }
                });
            }
        }

        // Stage 7: POSTED_SUCCESS (If ACCOUNTED)
        if (req.status === 'ACCOUNTED') {
            if (!existingStages.has('POSTED_SUCCESS')) {
                await this.createMessage({
                    requisitionId,
                    userId,
                    content: 'Successfully posted to QuickBooks',
                    type: 'SYSTEM',
                    metadata: { 
                        stage: 'POSTED_SUCCESS', 
                        qbExpenseId: req.qb_expense_id,
                        isRepaired: true
                    }
                });
            }
        }

        console.log(`[RequisitionMessageService] Repair completed for ${requisitionId}`);
    }

    static async getMessages(requisitionId: string) {
        const { data, error } = await supabase
            .from('requisition_messages')
            .select(`
                *,
                user:users!user_id(name)
            `)
            .eq('requisition_id', requisitionId)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });

        if (error) throw error;

        // Lazy Initialization / Repair: 
        // If no messages exist OR if the requisition is far along but missing modern stages
        const hasModernStages = data?.some(m => m.metadata?.stage && m.metadata.stage !== 'APPROVAL');
        
        if (!data || data.length === 0 || (!hasModernStages && data.length < 5)) {
            // Check if it's an old one that needs repair
            const { data: req } = await supabase
                .from('requisitions')
                .select('status, updated_at')
                .eq('id', requisitionId)
                .single();
            
            const updatedRecently = req?.updated_at && (Date.now() - new Date(req.updated_at).getTime() < 5000);
            
            if (req && req.status !== 'DRAFT' && req.status !== 'PENDING_APPROVAL' && !updatedRecently) {
                await this.repairLifecycleMessages(requisitionId);
                // Re-fetch after repair
                return this.getMessages(requisitionId);
            }
        }

        if (!data || data.length === 0) {
            console.log(`[RequisitionMessageService] No messages found for ${requisitionId}. Initializing...`);
            
            // 1. Fetch requisition to get context
            const { data: req } = await supabase
                .from('requisitions')
                .select('requestor_id, status')
                .eq('id', requisitionId)
                .single();

            if (req) {
                // 2. Create the appropriate starting message
                let stage = 'APPROVAL';
                let content = 'Requisition submitted for approval';

                // Map status to stage if it's already past initial approval
                if (['AUTHORISED', 'DISBURSED', 'EXPENSED'].includes(req.status)) {
                    stage = 'DISBURSAL';
                    content = 'Status updated to AUTHORISED';
                }

                try {
                    const initialMsg = await this.createMessage({
                        requisitionId,
                        userId: req.requestor_id,
                        content,
                        type: 'SYSTEM',
                        metadata: { stage, isRepaired: true }
                    });
                    return [initialMsg];
                } catch (createErr) {
                    console.error('[RequisitionMessageService] Failed to lazy init message:', createErr);
                    return [];
                }
            }
        }

        return data.map((m: any) => ({
            ...m,
            user_name: m.user?.name || 'System'
        }));
    }

    static async updateMessage(id: string, params: { content?: string, metadata?: any }) {
        const { error } = await supabase
            .from('requisition_messages')
            .update({
                ...params,
                created_at: new Date().toISOString() // Refresh the timestamp to bring it to the bottom
            })
            .eq('id', id);

        if (error) {
            console.error('[RequisitionMessageService] Error updating message:', error);
            throw error;
        }
    }
}
