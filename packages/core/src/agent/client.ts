/**
 * agentClient — typed streaming client for the Intelligence assistant.
 *
 * Moved from apps/web/src/lib/agentClient.ts. Web read the SSE body via
 * `response.body.getReader()`; native has no such stream on its stock fetch,
 * which is exactly why P0 built a `stream` adapter around expo/fetch. Frame
 * parsing (splitting on blank lines, stripping `data:`, JSON-decoding) is
 * identical either way and lives here once, so both clients agree on the wire
 * format without re-deriving it.
 */

import { getCore, requireCapability } from '../platform';
import { apiFetch, apiJson } from '../api/apiFetch';

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
    const { data } = await getCore().supabase.auth.getSession();
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
    signal?: AbortSignal,
): Promise<void> {
    const core = getCore();
    const apiUrl = core.env.apiUrl;
    const stream = requireCapability('stream');

    let frames: AsyncIterable<string>;
    let buffer = '';
    try {
        // Web's XHR-backed fetch throws its own network errors before the first
        // byte; native's stream adapter does the same via expo/fetch, so both
        // paths funnel through this one catch.
        frames = stream(`${apiUrl}${path}`, {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify(body),
            signal,
        } as any);
    } catch (err: any) {
        if (err?.name === 'AbortError') return;
        onEvent({ type: 'error', message: 'Could not reach the assistant. Check your connection and try again.' });
        return;
    }

    try {
        for await (const chunk of frames) {
            buffer += chunk;
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';

            for (const frame of parts) {
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
        if (err?.name === 'AbortError') return;

        // A non-2xx response reaches here as a thrown error from the stream
        // adapter, carrying the parsed body when the caller attached one.
        const detail = (err as any)?.body;
        if ((err as any)?.status === 409 && detail?.pending) {
            onEvent({
                type: 'approval_request',
                callId: detail.pending.callId,
                toolName: detail.pending.toolName,
                proposal: detail.pending.proposal,
                args: detail.pending.args,
            });
            return;
        }
        onEvent({
            type: 'error',
            message: detail?.error ?? (err?.message?.startsWith('Stream failed')
                ? err.message
                : 'The connection dropped mid-response.'),
        });
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
        signal?: AbortSignal,
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
            signal,
        );
    },

    approve(
        params: { threadId: string; callId: string; approved: boolean; model: string },
        onEvent: (e: AgentEvent) => void,
        signal?: AbortSignal,
    ) {
        return streamPost('/ai/agent/approve', params, onEvent, signal);
    },

    // These four are plain JSON requests (unlike chat/approve, which stream),
    // so they go through the same apiFetch every other core service uses —
    // one 401-retry-after-refresh, telemetry, consistent error parsing —
    // instead of the bespoke bare `fetch()` this file used previously, which
    // had none of that and would surface a silently-empty model list on a
    // single stale-token blip rather than retrying.
    async models(): Promise<{ models: AssistantModel[]; default: string }> {
        return apiJson('/ai/agent/models');
    },

    async threads(): Promise<ThreadSummary[]> {
        const data = await apiJson<{ threads?: ThreadSummary[] }>('/ai/agent/threads');
        return data.threads ?? [];
    },

    async thread(id: string): Promise<{
        threadId: string;
        model: string | null;
        messages: StoredMessage[];
        pending: { callId: string; toolName: string; args: Record<string, any>; proposal: Proposal } | null;
    }> {
        return apiJson(`/ai/agent/threads/${id}`);
    },

    async deleteThread(id: string): Promise<void> {
        await apiFetch(`/ai/agent/threads/${id}`, { method: 'DELETE' });
    },
};
