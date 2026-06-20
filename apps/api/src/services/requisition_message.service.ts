import { supabase } from '../lib/supabase';

// Canonical order of the requisition lifecycle stages. Used to prune messages
// that belong to stages *after* the one a requisition is being reverted to, so
// the chat doesn't keep stale cards (e.g. a "disburse" prompt after a revert to
// draft) cluttering the thread.
const STAGE_ORDER = [
    'APPROVAL',
    'DISBURSAL',
    'DISBURSAL_SUCCESS',
    'EXPENSE_TRACKING',
    'EXPENSE_SUMMARY',
    'CHANGE_SUBMITTED',
    'AI_REVIEW',
    'AI_REVIEW_DISABLED',
    'QUICKBOOKS_POSTING',
    'POSTED_SUCCESS',
    'COMPLETED',
];

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

    /**
     * Delete every lifecycle message that belongs to a stage occurring strictly
     * after `keepThroughStage` (e.g. reverting an AUTHORISED requisition back to
     * DRAFT should remove the DISBURSAL prompt and anything beyond it). Messages
     * with no recognised `metadata.stage` (user chat, action logs) are preserved.
     */
    static async pruneMessagesAfterStage(requisitionId: string, keepThroughStage: string) {
        const keepIdx = STAGE_ORDER.indexOf(keepThroughStage);
        if (keepIdx === -1) {
            console.warn(`[RequisitionMessageService] pruneMessagesAfterStage: unknown stage "${keepThroughStage}"`);
            return;
        }

        const { data: messages, error } = await supabase
            .from('requisition_messages')
            .select('id, metadata')
            .eq('requisition_id', requisitionId);

        if (error || !messages) {
            if (error) console.error('[RequisitionMessageService] Prune fetch failed:', error);
            return;
        }

        const idsToDelete = messages
            .filter(m => {
                const stage = m.metadata?.stage;
                if (!stage) return false; // keep non-lifecycle messages
                const idx = STAGE_ORDER.indexOf(stage);
                return idx > keepIdx; // delete strictly-later stages
            })
            .map(m => m.id);

        if (idsToDelete.length === 0) return;

        const { error: delError } = await supabase
            .from('requisition_messages')
            .delete()
            .in('id', idsToDelete);

        if (delError) {
            console.error('[RequisitionMessageService] Prune delete failed:', delError);
        } else {
            console.log(`[RequisitionMessageService] Pruned ${idsToDelete.length} stale message(s) after ${keepThroughStage} for ${requisitionId}`);
        }
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
        if (['AUTHORISED', 'DISBURSED', 'RECEIVED', 'EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'].includes(req.status)) {
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
        if (['DISBURSED', 'RECEIVED', 'EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'].includes(req.status)) {
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
        // Skip if already past this stage (has summary or change submitted) to avoid cluttering old records
        if (['DISBURSED', 'RECEIVED', 'EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'].includes(req.status)) {
            if (!existingStages.has('EXPENSE_TRACKING') && !existingStages.has('EXPENSE_SUMMARY') && !existingStages.has('CHANGE_SUBMITTED')) {
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
        if (['EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'].includes(req.status) || (req.status === 'RECEIVED' && req.actual_total !== null && Number(req.actual_total) > 0)) {
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

            if (!existingStages.has('CHANGE_SUBMITTED') && req.status === 'CHANGE_SUBMITTED') {
                await this.createMessage({
                    requisitionId,
                    userId,
                    content: `Change of K${Number(req.actual_change_amount || 0).toLocaleString()} submitted. Awaiting cashier confirmation.`,
                    type: 'SYSTEM',
                    metadata: { 
                        stage: 'CHANGE_SUBMITTED', 
                        changeAmount: req.actual_change_amount || 0,
                        isRepaired: true
                    }
                });
            }

            if (!existingStages.has('AI_REVIEW') && ['CATEGORIZED', 'COMPLETED', 'ACCOUNTED'].includes(req.status)) {
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

    static async getMessages(requisitionId: string, recursionLevel: number = 0): Promise<any> {
        if (recursionLevel > 2) {
            console.error(`[RequisitionMessageService] Max recursion level reached for ${requisitionId}. Returning existing data.`);
            const { data } = await supabase.from('requisition_messages').select('*, user:users!user_id(name)').eq('requisition_id', requisitionId).order('created_at', { ascending: true });
            return data?.map((m: any) => ({ ...m, user_name: m.user?.name || 'System' })) || [];
        }
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
                // Re-fetch after repair with incremented recursion level
                return this.getMessages(requisitionId, recursionLevel + 1);
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

        const mapped = data.map((m: any) => ({
            ...m,
            user_name: m.user?.name || 'System'
        }));

        // Ensure DISBURSAL_SUCCESS always appears before EXPENSE_TRACKING regardless of
        // which timestamp was written first (repair can create DISBURSAL_SUCCESS after
        // EXPENSE_TRACKING already existed, producing wrong visual order).
        const dsIdx = mapped.findIndex((m: any) => m.metadata?.stage === 'DISBURSAL_SUCCESS');
        const etIdx = mapped.findIndex((m: any) => m.metadata?.stage === 'EXPENSE_TRACKING');
        if (dsIdx !== -1 && etIdx !== -1 && dsIdx > etIdx) {
            const [dsMsg] = mapped.splice(dsIdx, 1);
            mapped.splice(etIdx, 0, dsMsg);
        }

        return mapped;
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
