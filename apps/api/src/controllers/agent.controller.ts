/**
 * agent.controller.ts — HTTP surface for the assistant.
 *
 *   POST /ai/agent/chat      stream a turn (SSE)
 *   POST /ai/agent/approve   decide a pending write, then stream the continuation
 *   GET  /ai/agent/models    the model picker's options
 *   GET  /ai/agent/threads   conversation list
 *   GET  /ai/agent/threads/:id
 *   DELETE /ai/agent/threads/:id
 *
 * Streaming is plain SSE over POST rather than EventSource, because the request
 * carries a bearer token and a JSON body — neither of which EventSource can send.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { runAgent, resumeAfterApproval, ChatMessage } from '../services/agent/loop';
import { threadStore } from '../services/agent/thread.store';
import { commit } from '../services/agent/registry';
import { ASSISTANT_MODELS, DEFAULT_ASSISTANT_MODEL, resolveModel } from '../services/agent/models';
import { AgentContext, AgentEvent } from '../services/agent/types';

function buildContext(req: AuthRequest): AgentContext | null {
    const organizationId = req.user?.organization_id;
    const userId = req.user?.id;
    if (!organizationId || !userId) return null;
    return {
        organizationId,
        userId,
        role: req.user?.role ?? 'STAFF',
        today: new Date().toISOString().slice(0, 10),
    };
}

/** Opens an SSE response and returns a writer plus a completion signal. */
function openStream(res: Response) {
    res.status(200).set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Vercel/nginx buffer text responses by default, which defeats streaming.
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    let closed = false;
    return {
        send(event: AgentEvent) {
            if (closed) return;
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        },
        end() {
            if (closed) return;
            closed = true;
            res.write('data: [DONE]\n\n');
            res.end();
        },
        get closed() {
            return closed;
        },
        markClosed() {
            closed = true;
        },
    };
}

async function getOrgName(organizationId: string): Promise<string | undefined> {
    const { data } = await supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle();
    return data?.name;
}

/** Collects the events that need persisting alongside the assistant's reply. */
function makeCollector() {
    const widgets: any[] = [];
    const steps: Array<{ name: string; summary: string; ok: boolean }> = [];
    let text = '';
    return {
        widgets,
        steps,
        get text() {
            return text;
        },
        observe(event: AgentEvent) {
            if (event.type === 'text') text += event.delta;
            else if (event.type === 'widget') widgets.push(event.widget);
            else if (event.type === 'tool_result') steps.push({ name: event.name, summary: event.summary, ok: event.ok });
        },
    };
}

// ─── POST /ai/agent/chat ─────────────────────────────────────────────────────

export const agentChat = async (req: AuthRequest, res: Response) => {
    const ctx = buildContext(req);
    if (!ctx) return res.status(401).json({ error: 'Not authenticated' });

    const { message, threadId: incomingThreadId, model: requestedModel } = req.body ?? {};
    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'A message is required' });
    }
    if (message.length > 8000) {
        return res.status(400).json({ error: 'Message is too long (8000 character limit)' });
    }

    const model = resolveModel(requestedModel);

    let threadId: string;
    let priorState: ChatMessage[] = [];
    try {
        if (incomingThreadId) {
            const owned = await threadStore.assertOwned(ctx, incomingThreadId);
            if (!owned) return res.status(404).json({ error: 'Conversation not found' });
            threadId = owned.id;
            priorState = await threadStore.loadRunState(ctx, threadId);
        } else {
            threadId = await threadStore.createThread(ctx, message, model);
        }
        await threadStore.addMessage(ctx, threadId, { role: 'user', content: message });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }

    const stream = openStream(res);
    stream.send({ type: 'thread', threadId });

    // Client navigated away or hit stop — abort the provider call rather than
    // burning tokens on a response nobody will read.
    const abort = new AbortController();
    req.on('close', () => {
        stream.markClosed();
        abort.abort();
    });

    const collector = makeCollector();
    const emit = (event: AgentEvent) => {
        collector.observe(event);
        stream.send(event);
    };

    try {
        const result = await runAgent({
            ctx,
            model,
            messages: [...priorState, { role: 'user', content: message }],
            orgName: await getOrgName(ctx.organizationId),
            emit,
            signal: abort.signal,
        });

        await persistTurn(ctx, threadId, model, result, collector);
    } catch (err: any) {
        console.error('[Agent] chat failed:', err);
        stream.send({ type: 'error', message: 'The assistant hit an unexpected error. Please try again.' });
    } finally {
        stream.end();
    }
};

// ─── POST /ai/agent/approve ──────────────────────────────────────────────────

export const agentApprove = async (req: AuthRequest, res: Response) => {
    const ctx = buildContext(req);
    if (!ctx) return res.status(401).json({ error: 'Not authenticated' });

    const { threadId, callId, approved } = req.body ?? {};
    if (!threadId || !callId || typeof approved !== 'boolean') {
        return res.status(400).json({ error: 'threadId, callId and approved are required' });
    }

    const owned = await threadStore.assertOwned(ctx, threadId);
    if (!owned) return res.status(404).json({ error: 'Conversation not found' });

    // Atomically claim the pending call. A second click finds nothing to claim,
    // so an approved write can never be committed twice.
    const claimed = await threadStore.claimPending(ctx, threadId, callId, approved ? 'APPROVED' : 'DECLINED');
    if (!claimed) {
        return res.status(409).json({ error: 'That request has already been decided or has expired.' });
    }

    const model = resolveModel(req.body?.model ?? owned.model ?? DEFAULT_ASSISTANT_MODEL);
    const priorState = await threadStore.loadRunState(ctx, threadId);

    const stream = openStream(res);
    stream.send({ type: 'thread', threadId });

    const abort = new AbortController();
    req.on('close', () => {
        stream.markClosed();
        abort.abort();
    });

    const collector = makeCollector();
    const emit = (event: AgentEvent) => {
        collector.observe(event);
        stream.send(event);
    };

    let outcome: any;
    if (!approved) {
        outcome = { declined: true, note: 'The user declined this change. Acknowledge briefly and do not propose it again unless asked.' };
    } else {
        emit({ type: 'tool_call', id: callId, name: claimed.tool_name, args: claimed.arguments, effect: 'write' });
        const { ok, result } = await commit(ctx, claimed.tool_name, claimed.arguments);
        await threadStore.recordOutcome(ctx, threadId, callId, {
            ok,
            result: ok ? result : undefined,
            error: ok ? undefined : String(result?.error ?? 'failed'),
        });
        emit({
            type: 'tool_result',
            id: callId,
            name: claimed.tool_name,
            ok,
            summary: ok ? 'Change applied' : String(result?.error ?? 'failed').slice(0, 160),
        });
        outcome = ok ? result : { error: result?.error, note: 'The write failed. Explain the failure to the user plainly.' };
    }

    try {
        const result = await resumeAfterApproval({
            ctx,
            model,
            messages: priorState,
            callId,
            toolName: claimed.tool_name,
            outcome,
            orgName: await getOrgName(ctx.organizationId),
            emit,
            signal: abort.signal,
        });

        await persistTurn(ctx, threadId, model, result, collector);
    } catch (err: any) {
        console.error('[Agent] approval resume failed:', err);
        stream.send({ type: 'error', message: 'The change was recorded but the assistant could not continue.' });
    } finally {
        stream.end();
    }
};

/** Saves the assistant's reply, the loop state, and any new pending proposal. */
async function persistTurn(
    ctx: AgentContext,
    threadId: string,
    model: string,
    result: Awaited<ReturnType<typeof runAgent>>,
    collector: ReturnType<typeof makeCollector>
) {
    try {
        await threadStore.saveRunState(ctx, threadId, result.messages);

        if (collector.text.trim() || collector.widgets.length) {
            await threadStore.addMessage(ctx, threadId, {
                role: 'assistant',
                content: collector.text,
                widgets: collector.widgets,
                steps: collector.steps,
                model,
            });
        }

        if (result.stopReason === 'awaiting_approval' && result.pending) {
            await threadStore.recordProposal(ctx, threadId, {
                callId: result.pending.callId,
                toolName: result.pending.toolName,
                args: result.pending.args,
                proposal: result.pending.proposal,
            });
        }
    } catch (err: any) {
        // Persistence failure must not corrupt a response the user already saw.
        console.error('[Agent] persist failed:', err.message);
    }
}

// ─── Metadata & thread management ────────────────────────────────────────────

export const listModels = async (_req: AuthRequest, res: Response) => {
    res.json({ models: ASSISTANT_MODELS, default: DEFAULT_ASSISTANT_MODEL });
};

export const listThreads = async (req: AuthRequest, res: Response) => {
    const ctx = buildContext(req);
    if (!ctx) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ threads: await threadStore.listThreads(ctx) });
};

export const getThread = async (req: AuthRequest, res: Response) => {
    const ctx = buildContext(req);
    if (!ctx) return res.status(401).json({ error: 'Not authenticated' });

    const owned = await threadStore.assertOwned(ctx, req.params.id);
    if (!owned) return res.status(404).json({ error: 'Conversation not found' });

    const [messages, pending] = await Promise.all([
        threadStore.getMessages(ctx, owned.id),
        threadStore.getPending(ctx, owned.id),
    ]);

    res.json({
        threadId: owned.id,
        model: owned.model,
        messages,
        // A page reload mid-approval must still show the card.
        pending: pending
            ? { callId: pending.call_id, toolName: pending.tool_name, args: pending.arguments, proposal: pending.proposal }
            : null,
    });
};

export const deleteThread = async (req: AuthRequest, res: Response) => {
    const ctx = buildContext(req);
    if (!ctx) return res.status(401).json({ error: 'Not authenticated' });
    await threadStore.deleteThread(ctx, req.params.id);
    res.json({ deleted: true });
};
