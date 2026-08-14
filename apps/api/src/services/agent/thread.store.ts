/**
 * thread.store.ts — Persistence for assistant conversations.
 *
 * Every read here is scoped by organization_id *and* user_id: a thread belongs
 * to the person who started it, and finance conversations shouldn't be visible
 * to colleagues who happen to share the tenant.
 */

import { supabase } from '../../lib/supabase';
import { ChatMessage } from './loop';
import { AgentContext, Widget } from './types';

export interface ThreadSummary {
    id: string;
    title: string;
    model: string | null;
    updated_at: string;
}

export interface StoredMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    widgets: Widget[];
    steps: Array<{ name: string; summary: string; ok: boolean }>;
    created_at: string;
}

export const threadStore = {
    async listThreads(ctx: AgentContext, limit = 30): Promise<ThreadSummary[]> {
        const { data } = await supabase
            .from('agent_threads')
            .select('id, title, model, updated_at')
            .eq('organization_id', ctx.organizationId)
            .eq('user_id', ctx.userId)
            .eq('archived', false)
            .order('updated_at', { ascending: false })
            .limit(limit);
        return data ?? [];
    },

    async createThread(ctx: AgentContext, firstMessage: string, model: string): Promise<string> {
        const { data, error } = await supabase
            .from('agent_threads')
            .insert({
                organization_id: ctx.organizationId,
                user_id: ctx.userId,
                title: deriveTitle(firstMessage),
                model,
            })
            .select('id')
            .single();
        if (error) throw new Error(`Could not start conversation: ${error.message}`);
        return data.id;
    },

    /** Ownership check. Returns null when the thread isn't this user's. */
    async assertOwned(ctx: AgentContext, threadId: string): Promise<{ id: string; model: string | null } | null> {
        const { data } = await supabase
            .from('agent_threads')
            .select('id, model')
            .eq('id', threadId)
            .eq('organization_id', ctx.organizationId)
            .eq('user_id', ctx.userId)
            .maybeSingle();
        return data ?? null;
    },

    async getMessages(ctx: AgentContext, threadId: string): Promise<StoredMessage[]> {
        const { data } = await supabase
            .from('agent_messages')
            .select('id, role, content, widgets, steps, created_at')
            .eq('thread_id', threadId)
            .eq('organization_id', ctx.organizationId)
            .order('created_at', { ascending: true });
        return (data ?? []) as StoredMessage[];
    },

    async addMessage(
        ctx: AgentContext,
        threadId: string,
        msg: { role: 'user' | 'assistant'; content: string; widgets?: Widget[]; steps?: any[]; model?: string }
    ): Promise<string> {
        const { data, error } = await supabase
            .from('agent_messages')
            .insert({
                thread_id: threadId,
                organization_id: ctx.organizationId,
                role: msg.role,
                content: msg.content,
                widgets: msg.widgets ?? [],
                steps: msg.steps ?? [],
                model: msg.model ?? null,
            })
            .select('id')
            .single();
        if (error) throw new Error(error.message);

        await supabase
            .from('agent_threads')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', threadId)
            .eq('organization_id', ctx.organizationId);

        return data.id;
    },

    // ── Loop state (provider-format messages) ────────────────────────────────

    async loadRunState(ctx: AgentContext, threadId: string): Promise<ChatMessage[]> {
        const { data } = await supabase
            .from('agent_runs')
            .select('state')
            .eq('thread_id', threadId)
            .eq('organization_id', ctx.organizationId)
            .maybeSingle();
        return (data?.state as ChatMessage[]) ?? [];
    },

    async saveRunState(ctx: AgentContext, threadId: string, state: ChatMessage[]): Promise<void> {
        await supabase.from('agent_runs').upsert(
            {
                thread_id: threadId,
                organization_id: ctx.organizationId,
                state: trimState(state),
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'thread_id' }
        );
    },

    // ── Write audit trail ────────────────────────────────────────────────────

    async recordProposal(
        ctx: AgentContext,
        threadId: string,
        call: { callId: string; toolName: string; args: any; proposal: any }
    ): Promise<void> {
        await supabase.from('agent_tool_calls').upsert(
            {
                thread_id: threadId,
                organization_id: ctx.organizationId,
                call_id: call.callId,
                tool_name: call.toolName,
                arguments: call.args,
                proposal: call.proposal,
                status: 'PENDING',
            },
            { onConflict: 'thread_id,call_id' }
        );
    },

    /**
     * Claims a pending proposal for execution. The `status = 'PENDING'` filter
     * is the guard against a double-click committing the same write twice —
     * the second update matches no rows and returns null.
     */
    async claimPending(
        ctx: AgentContext,
        threadId: string,
        callId: string,
        decision: 'APPROVED' | 'DECLINED'
    ): Promise<{ tool_name: string; arguments: any } | null> {
        const { data } = await supabase
            .from('agent_tool_calls')
            .update({
                status: decision,
                decided_by: ctx.userId,
                decided_at: new Date().toISOString(),
            })
            .eq('thread_id', threadId)
            .eq('organization_id', ctx.organizationId)
            .eq('call_id', callId)
            .eq('status', 'PENDING')
            .select('tool_name, arguments')
            .maybeSingle();
        return data ?? null;
    },

    async recordOutcome(
        ctx: AgentContext,
        threadId: string,
        callId: string,
        outcome: { ok: boolean; result?: any; error?: string }
    ): Promise<void> {
        await supabase
            .from('agent_tool_calls')
            .update({
                status: outcome.ok ? 'EXECUTED' : 'FAILED',
                result: outcome.result ?? null,
                error: outcome.error ?? null,
                executed_at: new Date().toISOString(),
            })
            .eq('thread_id', threadId)
            .eq('organization_id', ctx.organizationId)
            .eq('call_id', callId);
    },

    async getPending(ctx: AgentContext, threadId: string) {
        const { data } = await supabase
            .from('agent_tool_calls')
            .select('call_id, tool_name, arguments, proposal')
            .eq('thread_id', threadId)
            .eq('organization_id', ctx.organizationId)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        return data ?? null;
    },

    async deleteThread(ctx: AgentContext, threadId: string): Promise<void> {
        await supabase
            .from('agent_threads')
            .delete()
            .eq('id', threadId)
            .eq('organization_id', ctx.organizationId)
            .eq('user_id', ctx.userId);
    },
};

function deriveTitle(message: string): string {
    const clean = message.trim().replace(/\s+/g, ' ');
    if (clean.length <= 60) return clean || 'New conversation';
    return clean.slice(0, 57) + '…';
}

/**
 * Long threads are trimmed before persistence, keeping the last 40 provider
 * messages. Tool payloads dominate the size and old ones stop being useful
 * quickly; the display history in agent_messages is kept in full.
 */
function trimState(state: ChatMessage[]): ChatMessage[] {
    if (state.length <= 40) return state;
    const tail = state.slice(-40);
    // Never start the retained window on an orphaned tool result — providers
    // reject a tool message whose originating assistant turn is missing.
    while (tail.length && tail[0].role === 'tool') tail.shift();
    return tail;
}
