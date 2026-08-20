/**
 * agentClient.ts — Typed client for the streaming assistant.
 *
 * EventSource can't carry a bearer token or a JSON body, so this reads the SSE
 * frames off a normal fetch response instead. Same wire format, full control
 * over headers and cancellation.
 */

import { supabase } from './supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

// ─── Mirror of the server's event and widget contracts ───────────────────────

export interface ChartSpec {
    kind: 'bar' | 'line' | 'area' | 'pie' | 'donut';
    title: string;
    subtitle?: string;
    xKey: string;
    series: Array<{ key: string; label: string }>;
    data: Array<Record<string, string | number>>;
    valueFormat?: 'currency' | 'number' | 'percent';
    stacked?: boolean;
}

export interface TableSpec {
    title: string;
    columns: Array<{ key: string; label: string; align?: 'left' | 'right'; format?: 'currency' | 'number' | 'date' | 'text' }>;
    rows: Array<Record<string, string | number | null>>;
    total?: Record<string, string | number>;
}

export interface KpiSpec {
    title?: string;
    items: Array<{ label: string; value: string; delta?: number; hint?: string }>;
}

/** A generated download (PDF report or Excel export). `url` is a time-limited signed link. */
export interface FileSpec {
    name: string;
    url: string;
    kind: 'pdf' | 'xlsx';
    sizeLabel?: string;
}

export type Widget =
    | { type: 'chart'; spec: ChartSpec }
    | { type: 'table'; spec: TableSpec }
    | { type: 'kpi'; spec: KpiSpec }
    | { type: 'file'; spec: FileSpec };

export interface Proposal {
    summary: string;
    preview: Array<{ label: string; value: string }>;
    warning?: string;
}

export type AgentEvent =
    | { type: 'thread'; threadId: string }
    | { type: 'tool_call'; id: string; name: string; args: Record<string, any>; effect: 'read' | 'write' }
    | { type: 'tool_result'; id: string; name: string; ok: boolean; summary: string }
    | { type: 'status'; phase: 'thinking' | 'working' }
    | { type: 'thinking'; delta: string }
    | { type: 'text'; delta: string }
    | { type: 'widget'; widget: Widget }
    | { type: 'approval_request'; callId: string; toolName: string; proposal: Proposal; args: Record<string, any> }
    | { type: 'done'; reason: 'complete' | 'awaiting_approval' | 'step_limit' | 'time_limit' }
    | { type: 'error'; message: string };

export interface AssistantModel {
    id: string;
    label: string;
    vendor: string;
    blurb: string;
    tier: 'fast' | 'balanced' | 'deep';
}

export interface StoredMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    widgets: Widget[];
    steps: Array<{ name: string; summary: string; ok: boolean }>;
    created_at: string;
}

export interface ThreadSummary {
    id: string;
    title: string;
    model: string | null;
    updated_at: string;
}

async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    };
}

/**
 * Streams one turn. Resolves when the stream ends; `onEvent` fires for each
 * frame. Pass `signal` to let the user stop generation.
 */
async function streamPost(
    path: string,
    body: Record<string, any>,
    onEvent: (event: AgentEvent) => void,
    signal?: AbortSignal
): Promise<void> {
    let resp: Response;
    try {
        resp = await fetch(`${API_URL}${path}`, {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify(body),
            signal,
        });
    } catch (err: any) {
        if (err?.name === 'AbortError') return;
        onEvent({ type: 'error', message: 'Could not reach the assistant. Check your connection and try again.' });
        return;
    }

    if (!resp.ok) {
        // Errors before the stream opens come back as ordinary JSON.
        const detail = await resp.json().catch(() => null);

        // 409 with a `pending` payload means the server refused to start a
        // new turn because an earlier write proposal in this thread never got
        // a decision — most often because the SSE event that would have shown
        // it was dropped mid-stream. Re-synthesizing it as an approval_request
        // here means the same ApprovalCard UI just re-appears with the real
        // pending change, rather than the user seeing a dead-end error while
        // the card silently reattaches to whatever they type next.
        if (resp.status === 409 && detail?.pending) {
            onEvent({
                type: 'approval_request',
                callId: detail.pending.callId,
                toolName: detail.pending.toolName,
                proposal: detail.pending.proposal,
                args: detail.pending.args,
            });
            return;
        }

        onEvent({ type: 'error', message: detail?.error ?? `Request failed (${resp.status}).` });
        return;
    }
    if (!resp.body) {
        onEvent({ type: 'error', message: 'The assistant returned an empty response.' });
        return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split('\n\n');
            // The trailing fragment is an incomplete frame; keep it buffered.
            buffer = frames.pop() ?? '';

            for (const frame of frames) {
                const line = frame.trim();
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;
                try {
                    onEvent(JSON.parse(payload) as AgentEvent);
                } catch {
                    // Ignore malformed frames rather than tearing down the stream.
                }
            }
        }
    } catch (err: any) {
        if (err?.name !== 'AbortError') {
            onEvent({ type: 'error', message: 'The connection dropped mid-response.' });
        }
    }
}

export const agentClient = {
    chat(
        params: {
            message: string;
            threadId?: string | null;
            model: string;
            /** A file already uploaded to the bank-statements bucket — path + display filename. */
            attachment?: { path: string; filename: string } | null;
        },
        onEvent: (e: AgentEvent) => void,
        signal?: AbortSignal
    ) {
        return streamPost(
            '/ai/agent/chat',
            {
                message: params.message,
                threadId: params.threadId ?? undefined,
                model: params.model,
                attachment: params.attachment ?? undefined,
            },
            onEvent,
            signal
        );
    },

    approve(
        params: { threadId: string; callId: string; approved: boolean; model: string },
        onEvent: (e: AgentEvent) => void,
        signal?: AbortSignal
    ) {
        return streamPost('/ai/agent/approve', params, onEvent, signal);
    },

    async models(): Promise<{ models: AssistantModel[]; default: string }> {
        const resp = await fetch(`${API_URL}/ai/agent/models`, { headers: await authHeaders() });
        if (!resp.ok) throw new Error('Could not load models');
        return resp.json();
    },

    async threads(): Promise<ThreadSummary[]> {
        const resp = await fetch(`${API_URL}/ai/agent/threads`, { headers: await authHeaders() });
        if (!resp.ok) return [];
        const data = await resp.json();
        return data.threads ?? [];
    },

    async thread(id: string): Promise<{
        threadId: string;
        model: string | null;
        messages: StoredMessage[];
        pending: { callId: string; toolName: string; args: Record<string, any>; proposal: Proposal } | null;
    }> {
        const resp = await fetch(`${API_URL}/ai/agent/threads/${id}`, { headers: await authHeaders() });
        if (!resp.ok) throw new Error('Conversation not found');
        return resp.json();
    },

    async deleteThread(id: string): Promise<void> {
        await fetch(`${API_URL}/ai/agent/threads/${id}`, { method: 'DELETE', headers: await authHeaders() });
    },
};
