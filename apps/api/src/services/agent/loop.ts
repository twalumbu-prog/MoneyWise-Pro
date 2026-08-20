/**
 * loop.ts — The agent loop.
 *
 * Streams from OpenRouter (OpenAI-compatible tool calling), executes tool calls,
 * feeds results back, and repeats until the model answers, asks for approval on
 * a write, or hits a ceiling.
 *
 * Two properties the previous implementation lacked and that everything else
 * here depends on:
 *   • Assistant text accumulates across steps instead of being overwritten, so
 *     nothing the model says is silently dropped.
 *   • The loop is *resumable*. Its entire state is the `messages` array, which
 *     the caller persists. An approval arriving minutes later resumes from
 *     exactly where it stopped.
 */

import { AgentContext, AgentEvent, ToolEffect, isProposal } from './types';
import { dispatch, getTool, toolsForRole } from './registry';
import { isWidgetResult } from './tools/viz.tools';
import { buildSystemPrompt } from './prompt';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MAX_STEPS = 8;
const WALL_CLOCK_MS = 110_000;
/**
 * Output ceiling per step. Without this OpenRouter bills against the model's
 * maximum (64k on Sonnet) — it pre-authorises the full amount, so an unset
 * value both risks runaway cost and gets rejected outright on a low balance.
 *
 * Raised from the original 2000 on 2026-08-19: a tool-heavy answer (prose +
 * a render_table call carrying real row data as tool-call arguments) was
 * genuinely hitting 2000 mid-generation on ordinary questions, not just large
 * ones — "list the unaccounted transactions" cut off before finishing the
 * table call. The loop now auto-continues a truncated step either way (see
 * `finishReason === 'length'` below), so this number is about how often that
 * has to happen, not correctness. 2000 was sized for a credit-constrained
 * account; that constraint no longer holds day-to-day (Sonnet 4.5 is the
 * model actually in use), so there's no longer a reason to keep it this tight.
 */
const MAX_OUTPUT_TOKENS = 4000;
/** Tool payloads above this are truncated before entering context. */
const MAX_TOOL_RESULT_CHARS = 12_000;

/**
 * Streaming the model's reasoning trades total time for perceived time.
 * Measured on this app (Gemini 2.5 Flash, a charting question, 3 model calls):
 *
 *              first feedback   answer starts   total
 *   reasoning       3.3s            13.0s       ~13s
 *   no reasoning    9.5s             9.5s       ~10s
 *
 * ~3s slower overall, but something appears six seconds sooner and keeps
 * appearing, which is what makes the wait bearable. On by default; set
 * ASSISTANT_REASONING=off to prioritise raw completion time instead.
 */
const REASONING_ENABLED = process.env.ASSISTANT_REASONING !== 'off';

export type ChatMessage =
    | { role: 'system' | 'user'; content: string }
    | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
    | { role: 'tool'; tool_call_id: string; name: string; content: string };

export interface ToolCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
}

export interface PendingApproval {
    callId: string;
    toolName: string;
    args: Record<string, any>;
    /** The card the user was shown, stored verbatim so the audit row records
     *  what was actually approved rather than what we'd re-render today. */
    proposal: { summary: string; preview: Array<{ label: string; value: string }>; warning?: string };
}

export interface AgentRunResult {
    messages: ChatMessage[];
    /** Prose the assistant produced this run, for persistence. */
    text: string;
    widgets: any[];
    stopReason: 'complete' | 'awaiting_approval' | 'step_limit' | 'time_limit' | 'error';
    pending?: PendingApproval;
}

export type Emit = (event: AgentEvent) => void;

/**
 * Runs until a terminal state. `messages` is both input and output: pass the
 * persisted thread state back in to resume.
 */
export async function runAgent(params: {
    ctx: AgentContext;
    model: string;
    messages: ChatMessage[];
    orgName?: string;
    emit: Emit;
    signal?: AbortSignal;
}): Promise<AgentRunResult> {
    const { ctx, model, emit, signal } = params;
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        emit({ type: 'error', message: 'The assistant is not configured — OPENROUTER_API_KEY is missing.' });
        return { messages: params.messages, text: '', widgets: [], stopReason: 'error' };
    }

    // The system prompt is rebuilt every run rather than persisted: it carries
    // today's date and the caller's current role, both of which can change
    // between turns of a long-lived thread.
    const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(ctx, params.orgName) },
        ...params.messages.filter(m => m.role !== 'system'),
    ];

    const tools = toolsForRole(ctx.role);
    const deadline = Date.now() + WALL_CLOCK_MS;
    const widgets: any[] = [];
    let fullText = '';
    // Set when a step ends because the provider cut it off at MAX_OUTPUT_TOKENS
    // (finish_reason "length"), not because the model actually finished. The
    // next step continues that same answer instead of starting a fresh one —
    // see the `finishReason === 'length'` branch below for why this exists.
    let continuingTruncatedAnswer = false;

    for (let step = 0; step < MAX_STEPS; step++) {
        if (Date.now() > deadline) {
            emit({ type: 'done', reason: 'time_limit' });
            return { messages: strip(messages), text: fullText, widgets, stopReason: 'time_limit' };
        }

        const isFinalStep = step === MAX_STEPS - 1;

        // Announce before the model call, not after: this gap is where the user
        // would otherwise stare at nothing for several seconds.
        emit({ type: 'status', phase: step === 0 ? 'thinking' : 'working' });

        let turn: StreamedTurn;
        try {
            turn = await streamTurn({
                apiKey,
                model,
                messages,
                // On the last step tools are withheld AND the model is told why,
                // so it writes a real answer from what it has rather than being
                // cut off mid-investigation.
                tools: isFinalStep ? undefined : tools,
                extraSystem: isFinalStep
                    ? 'You have no more tool calls available. Answer now using the data you have already gathered, and say plainly if something remains unverified.'
                    : continuingTruncatedAnswer
                    ? 'Your previous reply was cut off by a length limit before you finished. Continue writing exactly where it left off — no greeting, no re-summary, no repeating anything already written. If you were mid-word, finish the word first.'
                    : undefined,
                emit,
                signal,
            });
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                return { messages: strip(messages), text: fullText, widgets, stopReason: 'complete' };
            }
            // The user gets a friendly line; the raw provider error must still
            // reach the logs or a misconfiguration is undiagnosable in prod.
            console.error('[Agent] provider call failed:', err?.message ?? err);
            emit({ type: 'error', message: friendlyProviderError(err?.message ?? 'Model request failed') });
            return { messages: strip(messages), text: fullText, widgets, stopReason: 'error' };
        }

        // A continuation reads as one unbroken answer, not a new paragraph —
        // that's the whole point of resuming it. Every other case (after a
        // tool round, e.g.) genuinely is a fresh paragraph of the reply.
        if (turn.text) fullText += (fullText && !continuingTruncatedAnswer ? '\n\n' : '') + turn.text;

        const assistantMessage: Extract<ChatMessage, { role: 'assistant' }> = {
            role: 'assistant',
            content: turn.text || null,
            ...(turn.toolCalls.length ? { tool_calls: turn.toolCalls } : {}),
        };
        messages.push(assistantMessage);

        if (!turn.toolCalls.length) {
            // "No tool calls" normally means the model has finished. But a model
            // that wrote its tool call into the prose reaches here too, and that
            // text is not an answer — it must never be presented as one.
            if (turn.leaked) {
                console.error(
                    `[Agent] ${model} emitted a tool call as text — the provider serving it ` +
                    `does not support structured tool calling.`
                );
                emit({
                    type: 'error',
                    message:
                        'That model could not use the data tools properly, so it had nothing real to answer with. ' +
                        'Pick a different model from the menu — Gemini 2.5 Flash and Claude are reliable here.',
                });
                return { messages: strip(messages), text: fullText, widgets, stopReason: 'error' };
            }

            // The provider stopped this step because it ran out of room, not
            // because the model was actually finished — treating that as
            // "complete" is exactly the bug that made replies end mid-sentence
            // with the user never told why. Loop again to finish the thought;
            // MAX_STEPS still bounds this like everything else.
            if (turn.finishReason === 'length' && !isFinalStep) {
                continuingTruncatedAnswer = true;
                continue;
            }

            emit({ type: 'done', reason: 'complete' });
            return { messages: strip(messages), text: fullText, widgets, stopReason: 'complete' };
        }

        continuingTruncatedAnswer = false;

        for (const [callIndex, call] of turn.toolCalls.entries()) {
            const tool = getTool(call.function.name);
            const effect: ToolEffect = tool?.effect ?? 'read';
            const args = parseArgs(call.function.arguments);

            emit({ type: 'tool_call', id: call.id, name: call.function.name, args, effect });

            const { ok, result } = await dispatch(ctx, call.function.name, args);

            // ── A write wants to happen: stop and hand the decision to a human.
            if (ok && isProposal(result)) {
                const { __proposal, ...proposal } = result;

                // Every tool call on an assistant turn needs a matching result
                // or the provider rejects the resumed conversation. Calls queued
                // behind this one never run — the model has to reconsider them
                // once it knows whether the write happened — so they are dropped
                // from the turn rather than answered with a fabricated result.
                if (callIndex + 1 < turn.toolCalls.length) {
                    assistantMessage.tool_calls = turn.toolCalls.slice(0, callIndex + 1);
                }

                emit({
                    type: 'approval_request',
                    callId: call.id,
                    toolName: call.function.name,
                    proposal,
                    args,
                });
                emit({ type: 'done', reason: 'awaiting_approval' });
                return {
                    messages: strip(messages),
                    text: fullText,
                    widgets,
                    stopReason: 'awaiting_approval',
                    pending: { callId: call.id, toolName: call.function.name, args, proposal },
                };
            }

            // ── A widget: emit for rendering, hand the model only a short ack.
            if (ok && isWidgetResult(result)) {
                widgets.push(result.widget);
                emit({ type: 'widget', widget: result.widget });
                emit({ type: 'tool_result', id: call.id, name: call.function.name, ok: true, summary: 'Rendered' });
                messages.push({
                    role: 'tool',
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: result.ack,
                });
                continue;
            }

            emit({
                type: 'tool_result',
                id: call.id,
                name: call.function.name,
                ok,
                summary: summarise(ok, result),
            });

            messages.push({
                role: 'tool',
                tool_call_id: call.id,
                name: call.function.name,
                content: serialise(result),
            });
        }
    }

    emit({ type: 'done', reason: 'step_limit' });
    return { messages: strip(messages), text: fullText, widgets, stopReason: 'step_limit' };
}

/**
 * Appends the outcome of an approved (or declined) write and resumes the loop
 * so the model can acknowledge it and carry on.
 */
export async function resumeAfterApproval(params: {
    ctx: AgentContext;
    model: string;
    messages: ChatMessage[];
    callId: string;
    toolName: string;
    outcome: any;
    orgName?: string;
    emit: Emit;
    signal?: AbortSignal;
}): Promise<AgentRunResult> {
    const messages: ChatMessage[] = [
        ...params.messages,
        {
            role: 'tool',
            tool_call_id: params.callId,
            name: params.toolName,
            content: serialise(params.outcome),
        },
    ];

    return runAgent({
        ctx: params.ctx,
        model: params.model,
        messages,
        orgName: params.orgName,
        emit: params.emit,
        signal: params.signal,
    });
}

// ─── Provider transport ──────────────────────────────────────────────────────

interface StreamedTurn {
    text: string;
    toolCalls: ToolCall[];
    /** The model wrote a tool call into the prose; `text` is not an answer. */
    leaked: boolean;
    /**
     * Why the provider stopped generating — 'length' means MAX_OUTPUT_TOKENS
     * was hit mid-answer, not that the model chose to stop. Null if the
     * provider never sent one (some don't on every chunk).
     */
    finishReason: string | null;
}

/**
 * Text is emitted this many characters behind the stream so a tool-call marker
 * can be recognised before any of it reaches the client. Markers are ~24 chars;
 * 48 covers them with room to spare, and the lag is imperceptible.
 */
const EMIT_HOLDBACK = 48;

async function streamTurn(params: {
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    tools?: ReturnType<typeof toolsForRole>;
    extraSystem?: string;
    emit: Emit;
    signal?: AbortSignal;
}): Promise<StreamedTurn> {
    const body: Record<string, any> = {
        model: params.model,
        messages: params.extraSystem
            ? [...params.messages, { role: 'system', content: params.extraSystem }]
            : params.messages,
        stream: true,
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
        // OpenRouter drops this for models that don't support reasoning.
        ...(REASONING_ENABLED ? { reasoning: { effort: 'low' } } : {}),
    };
    if (params.tools?.length) {
        body.tools = params.tools;
        body.tool_choice = 'auto';
        /**
         * NOT setting `provider: { require_parameters: true }` here, despite it
         * looking like the obvious guard against providers that ignore `tools`.
         * It restricts routing to paid providers, which returns 402 for every
         * model on a credit-less account — it was measured breaking the working
         * default, not just the misbehaving model. The defence against a
         * provider that ignores `tools` is the leak detection below instead.
         * Revisit once the OpenRouter account carries credits.
         */
    }

    /**
     * Retried once, but only around the connection itself. A blip on the way to
     * the provider costs the user their whole turn otherwise — and on this app's
     * geography (users in Zambia, API in Europe) that is a routine event, not an
     * edge case. Retrying is only safe here because nothing has been emitted
     * yet; a failure part-way through a stream must not replay the tokens the
     * client already rendered, so that case is left to fail.
     */
    let resp: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            resp = await fetch(OPENROUTER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${params.apiKey}`,
                    'HTTP-Referer': 'https://moneywise.blueopus.cloud',
                    'X-Title': 'MoneyWise Pro Assistant',
                },
                body: JSON.stringify(body),
                signal: params.signal as any,
            });
            break;
        } catch (err: any) {
            // A deliberate cancellation is not a failure to retry.
            if (err?.name === 'AbortError' || attempt === 1) throw err;
            console.warn('[Agent] provider connection failed, retrying once:', err?.message ?? err);
            await new Promise(resolve => setTimeout(resolve, 400));
        }
    }

    if (!resp) throw new Error('OpenRouter: no response');
    if (!resp.ok || !resp.body) {
        // 4xx/5xx are deterministic for this payload — no retry, surface it.
        throw new Error(`OpenRouter ${resp.status}: ${await resp.text()}`);
    }

    const reader = (resp.body as any).getReader?.() ?? null;
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    // Emission bookkeeping for the hold-back window above.
    let emittedUpTo = 0;
    let leaked = false;
    let finishReason: string | null = null;
    // Tool calls stream in fragments keyed by index; name and arguments arrive
    // across many chunks and must be concatenated in order.
    const partial = new Map<number, { id: string; name: string; args: string }>();

    const pump = async function* (): AsyncGenerator<string> {
        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) return;
                yield decoder.decode(value, { stream: true });
            }
        } else {
            for await (const chunk of resp.body as any) {
                yield typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
            }
        }
    };

    for await (const chunk of pump()) {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;

            let parsed: any;
            try {
                parsed = JSON.parse(payload);
            } catch {
                continue; // partial JSON across chunk boundary; the buffer keeps the rest
            }

            // Read before the `!delta` bail-out below: some providers send
            // finish_reason on a final chunk whose delta is empty ({}, still
            // truthy) but others send it on a chunk with no delta key at all.
            const reason = parsed.choices?.[0]?.finish_reason;
            if (reason) finishReason = reason;

            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            // Reasoning arrives before content and is not part of the answer —
            // it is surfaced separately and never persisted as the reply.
            const reasoning = delta.reasoning ?? delta.reasoning_content;
            if (reasoning) params.emit({ type: 'thinking', delta: reasoning });

            if (delta.content) {
                text += delta.content;

                // Hold the tail back so a marker is caught before it is shown.
                // Once one appears, everything from here is tool-call syntax,
                // not prose — stop emitting entirely.
                if (!leaked) {
                    if (looksLikeLeakedToolCall(text)) {
                        leaked = true;
                    } else {
                        const safeEnd = Math.max(0, text.length - EMIT_HOLDBACK);
                        if (safeEnd > emittedUpTo) {
                            params.emit({ type: 'text', delta: text.slice(emittedUpTo, safeEnd) });
                            emittedUpTo = safeEnd;
                        }
                    }
                }
            }

            for (const tc of delta.tool_calls ?? []) {
                const idx = tc.index ?? 0;
                const cur = partial.get(idx) ?? { id: '', name: '', args: '' };
                if (tc.id) cur.id = tc.id;
                if (tc.function?.name) cur.name += tc.function.name;
                if (tc.function?.arguments) cur.args += tc.function.arguments;
                partial.set(idx, cur);
            }
        }
    }

    const toolCalls: ToolCall[] = [...partial.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([idx, c]) => ({
            id: c.id || `call_${idx}_${Date.now()}`,
            type: 'function' as const,
            function: { name: c.name, arguments: c.args || '{}' },
        }))
        .filter(c => c.function.name);

    // Flush whatever was held back, unless the turn turned out to be a leaked
    // tool call — in which case none of it should ever reach the client.
    if (!leaked && emittedUpTo < text.length) {
        params.emit({ type: 'text', delta: text.slice(emittedUpTo) });
    }

    return { text: leaked ? '' : text, toolCalls, leaked, finishReason };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Detects a model emitting a tool call as prose instead of in `tool_calls`.
 *
 * Happens when a provider accepts `tools` but doesn't implement structured tool
 * calling, so the model falls back to its chat template's raw markers. The loop
 * would otherwise treat the fragment as the finished answer and show the user
 * something like `<｜tool▁calls▁begin｜>function<｜tool▁sep｜>aggregate_spending`.
 *
 * Covers the DeepSeek markers (both the full-width variant its tokenizer uses
 * and the ASCII one) plus the common XML-ish forms from Qwen and Llama builds.
 */
const LEAKED_TOOL_CALL = /<[｜|]tool[▁_]calls?[▁_]begin[｜|]>|<[｜|]tool[▁_]sep[｜|]>|<tool_call>|<function_call>|<\|python_tag\|>/i;

function looksLikeLeakedToolCall(text: string): boolean {
    return LEAKED_TOOL_CALL.test(text);
}

function parseArgs(raw: string): Record<string, any> {
    try {
        return JSON.parse(raw || '{}');
    } catch {
        return {};
    }
}

/** Drops the system message so persisted state stays portable across prompt edits. */
function strip(messages: ChatMessage[]): ChatMessage[] {
    return messages.filter(m => m.role !== 'system');
}

function serialise(result: any): string {
    const json = JSON.stringify(result ?? null);
    if (json.length <= MAX_TOOL_RESULT_CHARS) return json;
    return (
        json.slice(0, MAX_TOOL_RESULT_CHARS) +
        `\n…[truncated at ${MAX_TOOL_RESULT_CHARS} characters — narrow your filters or aggregate instead of listing]`
    );
}

/** One line for the activity timeline. Never the full payload. */
function summarise(ok: boolean, result: any): string {
    if (!ok) return String(result?.error ?? 'failed').slice(0, 160);
    if (result == null) return 'no data';
    if (typeof result.count === 'number') return `${result.count} record${result.count === 1 ? '' : 's'}`;
    if (Array.isArray(result.groups)) return `${result.groups.length} group${result.groups.length === 1 ? '' : 's'}`;
    if (Array.isArray(result.matches)) return `${result.matches.length} topic${result.matches.length === 1 ? '' : 's'}`;
    if (Array.isArray(result.requisitions)) return `${result.requisitions.length} requisition${result.requisitions.length === 1 ? '' : 's'}`;
    return 'done';
}

function friendlyProviderError(raw: string): string {
    if (/401|403|No auth credentials/i.test(raw)) return 'The assistant could not authenticate with the model provider. Check OPENROUTER_API_KEY.';
    if (/402|credit|quota|insufficient/i.test(raw)) {
        return 'The assistant is out of OpenRouter credit, so no model can run. Add credits at openrouter.ai/settings/credits — this is an account balance issue, not a problem with your question.';
    }
    if (/429|rate limit/i.test(raw)) return 'The model is rate limited right now. Try again in a moment, or pick a different model.';
    if (/404|not a valid model|model not found/i.test(raw)) return 'That model is unavailable on OpenRouter right now. Pick a different one from the model menu.';
    return 'The model request failed. Try again, or switch models if it persists.';
}
