/**
 * AssistantChat.tsx — The assistant surface.
 *
 * Layout note: this is a plain flex column — header, scrolling message list,
 * composer in normal flow. The previous version floated the composer with
 * `absolute bottom-10` and padded the list to compensate, which overlapped
 * content on short viewports. Nothing here is absolutely positioned except the
 * model dropdown.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, History, PenSquare, Trash2 } from 'lucide-react';
import {
    agentClient, AgentEvent, AssistantModel, Proposal, ThreadSummary, Widget,
} from '../../lib/agentClient';
import { ChatMessage, MessageBubble } from './MessageBubble';
import { ApprovalCard } from './ApprovalCard';
import { Composer } from './Composer';
import { Step } from './ToolTimeline';

interface PendingApproval {
    callId: string;
    toolName: string;
    proposal: Proposal;
    status: 'pending' | 'approving' | 'approved' | 'declined';
    /** Index of the message the card is attached to. */
    messageId: string;
}

const SUGGESTIONS = [
    { label: 'How did we spend last month?', prompt: 'Break down our spending last month by department and chart it.' },
    { label: 'What is due soon?', prompt: 'What scheduled expenses are due in the next 30 days, and what do they total?' },
    { label: 'Show cash position', prompt: 'What is our current cash position across all wallets?' },
    { label: 'Spending trend', prompt: 'Chart our monthly spending over the last 6 months and tell me what stands out.' },
];

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const NEW_CHAT_TITLE = 'New chat';

interface Props {
    /**
     * Fires whenever the chat moves between the hero screen and an active
     * conversation, so the page shell can hide its own tab bar in favour of
     * this component's own top bar while a conversation is showing.
     */
    onChatStateChange?: (inChat: boolean) => void;
}

export const AssistantChat: React.FC<Props> = ({ onChatStateChange }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [threadId, setThreadId] = useState<string | null>(null);
    const [models, setModels] = useState<AssistantModel[]>([]);
    const [model, setModel] = useState<string>('');
    const [pending, setPending] = useState<PendingApproval | null>(null);
    const [threads, setThreads] = useState<ThreadSummary[]>([]);
    const [historyOpen, setHistoryOpen] = useState(false);
    // Distinct from `messages.length > 0`: the back button drops into the hero
    // view without discarding the conversation, so it can be resumed from History.
    const [viewMode, setViewMode] = useState<'hero' | 'chat'>('hero');
    const [title, setTitle] = useState(NEW_CHAT_TITLE);

    const abortRef = useRef<AbortController | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    // Suppresses autoscroll once the user scrolls up to read something.
    const stickToBottom = useRef(true);

    // ── Bootstrap ────────────────────────────────────────────────────────────

    useEffect(() => {
        agentClient
            .models()
            .then(({ models: list, default: fallback }) => {
                setModels(list);
                setModel(prev => prev || fallback);
            })
            .catch(() => setModels([]));
    }, []);

    const refreshThreads = useCallback(() => {
        agentClient.threads().then(setThreads).catch(() => undefined);
    }, []);

    useEffect(() => { refreshThreads(); }, [refreshThreads]);

    // Tell the page shell to hide its own tab bar while a conversation is open.
    useEffect(() => { onChatStateChange?.(viewMode === 'chat'); }, [viewMode, onChatStateChange]);

    // Once the backend has named the thread, swap "New chat" for the real
    // title — the `title-fade-in` class is retriggered by the `key` change.
    useEffect(() => {
        if (!threadId) return;
        const match = threads.find(t => t.id === threadId);
        if (match && match.title && match.title !== title) setTitle(match.title);
    }, [threads, threadId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Scrolling ────────────────────────────────────────────────────────────

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };

    useEffect(() => {
        if (stickToBottom.current) {
            bottomRef.current?.scrollIntoView({ behavior: busy ? 'auto' : 'smooth' });
        }
    }, [messages, pending, busy]);

    // ── Event handling ───────────────────────────────────────────────────────

    /** Applies one stream event to the in-flight assistant message. */
    const applyEvent = useCallback((assistantId: string, event: AgentEvent) => {
        switch (event.type) {
            case 'thread':
                setThreadId(event.threadId);
                break;

            case 'status':
                setMessages(prev => patch(prev, assistantId, m => ({ ...m, activity: event.phase })));
                break;

            case 'thinking':
                setMessages(prev => patch(prev, assistantId, m => ({
                    ...m,
                    thinking: (m.thinking ?? '') + event.delta,
                })));
                break;

            case 'tool_call':
                setMessages(prev => patch(prev, assistantId, m => ({
                    ...m,
                    // The running tool becomes the activity, so the status copy
                    // describes what is actually happening rather than guessing.
                    activity: event.name,
                    steps: upsertStep(m.steps, { id: event.id, name: event.name, status: 'running' }),
                })));
                break;

            case 'tool_result':
                setMessages(prev => patch(prev, assistantId, m => ({
                    ...m,
                    activity: 'working',
                    steps: upsertStep(m.steps, {
                        id: event.id,
                        name: event.name,
                        status: event.ok ? 'ok' : 'failed',
                        summary: event.summary,
                    }),
                })));
                break;

            case 'text':
                setMessages(prev => patch(prev, assistantId, m => ({ ...m, content: m.content + event.delta })));
                break;

            case 'widget':
                setMessages(prev => patch(prev, assistantId, m => ({ ...m, widgets: [...m.widgets, event.widget as Widget] })));
                break;

            case 'approval_request':
                setPending({
                    callId: event.callId,
                    toolName: event.toolName,
                    proposal: event.proposal,
                    status: 'pending',
                    messageId: assistantId,
                });
                break;

            case 'error':
                setMessages(prev => patch(prev, assistantId, m => ({ ...m, error: event.message })));
                break;

            case 'done':
                setMessages(prev => patch(prev, assistantId, m => ({ ...m, streaming: false, activity: null })));
                break;
        }
    }, []);

    // ── Sending ──────────────────────────────────────────────────────────────

    const send = useCallback(async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || busy) return;

        const assistantId = uid();
        setInput('');
        setPending(null);
        setBusy(true);
        setViewMode('chat');
        stickToBottom.current = true;

        setMessages(prev => [
            ...prev,
            { id: uid(), role: 'user', content: trimmed, widgets: [], steps: [] },
            { id: assistantId, role: 'assistant', content: '', widgets: [], steps: [], streaming: true, activity: 'thinking' },
        ]);

        const controller = new AbortController();
        abortRef.current = controller;

        await agentClient.chat(
            { message: trimmed, threadId, model },
            e => applyEvent(assistantId, e),
            controller.signal
        );

        setMessages(prev => patch(prev, assistantId, m => ({ ...m, streaming: false, activity: null })));
        setBusy(false);
        abortRef.current = null;
        refreshThreads();
    }, [busy, threadId, model, applyEvent, refreshThreads]);

    const decide = useCallback(async (approved: boolean) => {
        if (!pending || !threadId) return;

        setPending(p => (p ? { ...p, status: 'approving' } : p));
        setBusy(true);

        const assistantId = uid();
        setMessages(prev => [
            ...prev,
            { id: assistantId, role: 'assistant', content: '', widgets: [], steps: [], streaming: true, activity: 'thinking' },
        ]);

        const controller = new AbortController();
        abortRef.current = controller;

        await agentClient.approve(
            { threadId, callId: pending.callId, approved, model },
            e => applyEvent(assistantId, e),
            controller.signal
        );

        // Resolve the card in place rather than removing it — the conversation
        // should still show what was approved when scrolled back through.
        setPending(p => (p && p.callId === pending.callId ? { ...p, status: approved ? 'approved' : 'declined' } : p));
        setMessages(prev => patch(prev, assistantId, m => ({ ...m, streaming: false, activity: null })));
        setBusy(false);
        abortRef.current = null;
    }, [pending, threadId, model, applyEvent]);

    const stop = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setBusy(false);
        setMessages(prev => prev.map(m => (m.streaming ? { ...m, streaming: false } : m)));
    };

    const startNew = () => {
        abortRef.current?.abort();
        setMessages([]);
        setThreadId(null);
        setPending(null);
        setBusy(false);
        setInput('');
        setHistoryOpen(false);
        setViewMode('hero');
        setTitle(NEW_CHAT_TITLE);
    };

    /** Drops back to the hero screen without discarding the conversation. */
    const goBack = () => setViewMode('hero');

    const openThread = async (id: string) => {
        setHistoryOpen(false);
        try {
            const data = await agentClient.thread(id);
            setThreadId(data.threadId);
            setViewMode('chat');
            setTitle(threads.find(t => t.id === id)?.title ?? NEW_CHAT_TITLE);
            if (data.model) setModel(data.model);
            setMessages(
                data.messages.map(m => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    widgets: m.widgets ?? [],
                    steps: (m.steps ?? []).map((s, i) => ({
                        id: `${m.id}-${i}`,
                        name: s.name,
                        status: s.ok ? ('ok' as const) : ('failed' as const),
                        summary: s.summary,
                    })),
                }))
            );
            // A write left hanging when the tab closed is still awaiting a decision.
            setPending(
                data.pending
                    ? {
                          callId: data.pending.callId,
                          toolName: data.pending.toolName,
                          proposal: data.pending.proposal,
                          status: 'pending',
                          messageId: data.messages[data.messages.length - 1]?.id ?? '',
                      }
                    : null
            );
            stickToBottom.current = true;
        } catch {
            /* thread vanished — leave the current view alone */
        }
    };

    const removeThread = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await agentClient.deleteThread(id);
        setThreads(prev => prev.filter(t => t.id !== id));
        if (id === threadId) startNew();
    };

    const empty = messages.length === 0;
    const inChat = viewMode === 'chat';

    /** History dropdown + New button, grouped — reused by both header layouts. */
    const historyAndNew = (
        <div className="flex items-center gap-1 rounded-full bg-gray-50/80 p-0.5">
            <div className="relative">
                <button
                    onClick={() => { setHistoryOpen(v => !v); refreshThreads(); }}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-gray-400 transition-colors hover:bg-white hover:text-gray-600 hover:shadow-sm"
                >
                    <History size={14} />
                    <span className="hidden sm:inline">History</span>
                </button>

                {historyOpen && (
                    <div className="absolute right-0 top-full z-50 mt-1 w-[290px] overflow-hidden rounded-2xl border border-gray-100 bg-white p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
                        {threads.length === 0 ? (
                            <p className="px-3 py-6 text-center text-[12px] font-medium text-gray-400">
                                No past conversations yet.
                            </p>
                        ) : (
                            <div className="max-h-[380px] overflow-y-auto">
                                {threads.map(t => (
                                    <div
                                        key={t.id}
                                        onClick={() => openThread(t.id)}
                                        className={`group flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 transition-colors ${
                                            t.id === threadId ? 'bg-blue-50/60' : 'hover:bg-gray-50'
                                        }`}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[13px] font-bold text-brand-navy">{t.title}</span>
                                            <span className="block text-[11px] font-medium text-gray-400">
                                                {new Date(t.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                            </span>
                                        </span>
                                        <button
                                            onClick={e => removeThread(t.id, e)}
                                            className="flex-shrink-0 rounded-lg p-1.5 text-gray-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                                            title="Delete conversation"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <button
                onClick={startNew}
                disabled={empty && !threadId}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-gray-400 transition-colors hover:bg-white hover:text-gray-600 hover:shadow-sm disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none"
            >
                <PenSquare size={14} />
                <span className="hidden sm:inline">New</span>
            </button>
        </div>
    );

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col">
            {/*
              Two header layouts share the same slot. The hero layout (no
              conversation open yet) just needs History/New in the corner — the
              page shell's own tab bar is still visible above it. Once a
              conversation is open, this becomes the page's entire top bar: a
              back button replaces the tabs, and the middle carries the
              conversation's title so the tab row isn't needed at all.
            */}
            {inChat ? (
                <header className="flex flex-shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-4 md:px-6">
                    <button
                        onClick={goBack}
                        title="Back"
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700"
                    >
                        <ArrowLeft size={18} />
                    </button>

                    <span
                        key={title}
                        className="title-fade-in min-w-0 truncate text-[14px] font-black text-brand-navy md:text-[15px]"
                    >
                        {title}
                    </span>

                    {historyAndNew}
                </header>
            ) : (
                <header className="flex flex-shrink-0 items-center justify-end gap-1 px-4 pb-2 pt-1 md:px-6">
                    {historyAndNew}
                </header>
            )}

            {viewMode === 'hero' ? (
                /* Hero state — the composer is the same component, just centred. */
                <div className="flex flex-1 flex-col items-center justify-start px-5 pb-10 pt-10">
                    <div className="w-full max-w-2xl">
                        <div className="mb-8 text-center">
                            <span className="mb-4 inline-block rounded-full border border-[#006AFF]/20 bg-[#006AFF]/10 px-3 py-1 text-[10px] font-black tracking-widest text-[#006AFF]">
                                BETA
                            </span>
                            <h1 className="text-[28px] font-black leading-tight tracking-tight text-brand-navy md:text-[40px]">
                                How can I help you today?
                            </h1>
                            <p className="mt-2 text-[13px] font-medium text-gray-400 md:text-[14px]">
                                Ask about your numbers, or tell me what to change.
                            </p>
                        </div>

                        <Composer
                            value={input}
                            onChange={setInput}
                            onSend={() => send(input)}
                            onStop={stop}
                            busy={busy}
                            models={models}
                            selectedModel={model}
                            onSelectModel={setModel}
                            autoFocus
                        />

                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                            {SUGGESTIONS.map(s => (
                                <button
                                    key={s.label}
                                    onClick={() => send(s.prompt)}
                                    className="rounded-full border border-gray-100 bg-white px-3.5 py-2 text-[12px] font-bold text-gray-500 shadow-sm transition-all hover:border-blue-200 hover:text-[#006AFF]"
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div
                        ref={scrollRef}
                        onScroll={onScroll}
                        className="min-h-0 flex-1 overflow-y-auto px-4 md:px-6"
                    >
                        <div className="mx-auto max-w-3xl space-y-6 py-4">
                            {messages.map(m => (
                                <MessageBubble key={m.id} message={m}>
                                    {pending?.messageId === m.id && (
                                        <ApprovalCard
                                            toolName={pending.toolName}
                                            proposal={pending.proposal}
                                            status={pending.status}
                                            onDecide={decide}
                                        />
                                    )}
                                </MessageBubble>
                            ))}
                            {/* Card restored from a reloaded thread has no matching message. */}
                            {pending && !messages.some(m => m.id === pending.messageId) && (
                                <ApprovalCard
                                    toolName={pending.toolName}
                                    proposal={pending.proposal}
                                    status={pending.status}
                                    onDecide={decide}
                                />
                            )}
                            <div ref={bottomRef} className="h-px" />
                        </div>
                    </div>

                    <div className="flex-shrink-0 bg-gradient-to-t from-white via-white to-transparent px-4 pb-4 pt-2 md:px-6">
                        <div className="mx-auto max-w-3xl">
                            <Composer
                                value={input}
                                onChange={setInput}
                                onSend={() => send(input)}
                                onStop={stop}
                                busy={busy}
                                models={models}
                                selectedModel={model}
                                onSelectModel={setModel}
                                placeholder="Ask a follow-up…"
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

// ─── Immutable update helpers ────────────────────────────────────────────────

function patch(list: ChatMessage[], id: string, fn: (m: ChatMessage) => ChatMessage): ChatMessage[] {
    return list.map(m => (m.id === id ? fn(m) : m));
}

function upsertStep(steps: Step[], next: Step): Step[] {
    const idx = steps.findIndex(s => s.id === next.id);
    if (idx === -1) return [...steps, next];
    const copy = [...steps];
    copy[idx] = { ...copy[idx], ...next };
    return copy;
}
