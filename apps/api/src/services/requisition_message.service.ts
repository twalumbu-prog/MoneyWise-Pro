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

        // Lazy Initialization: If no messages exist, create the initial system message
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
                        metadata: { stage }
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
