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

        if (!data) return [];

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
