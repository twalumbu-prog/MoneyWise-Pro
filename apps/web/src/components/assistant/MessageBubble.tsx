/**
 * MessageBubble.tsx — One turn in the conversation.
 *
 * User turns are compact right-aligned bubbles. Assistant turns are full-width
 * prose — bubbling a long financial analysis wastes horizontal space and makes
 * embedded charts and tables cramped.
 */

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
// Without this, react-markdown v10 leaves GFM tables as raw pipe characters —
// the component overrides below never fire. Models emit them regularly, even
// though render_table is the preferred path for real data.
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import type { Widget } from '../../lib/agentClient';
import { WidgetRenderer } from './widgets/WidgetRenderer';
import { Step, ToolTimeline } from './ToolTimeline';
import { ThinkingTrace } from './ThinkingTrace';
import { ActivityIndicator } from './ActivityIndicator';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    widgets: Widget[];
    steps: Step[];
    /** Reasoning tokens, kept separate from the answer itself. */
    thinking?: string;
    /** Set while this message is still streaming in. */
    streaming?: boolean;
    /** Tool currently running, or the status phase — drives the activity copy. */
    activity?: string | null;
    error?: string;
}

const markdownComponents = {
    p: (props: any) => <p className="mb-3 leading-[1.7] last:mb-0" {...props} />,
    ul: (props: any) => <ul className="mb-3 ml-5 list-disc space-y-1.5 last:mb-0" {...props} />,
    ol: (props: any) => <ol className="mb-3 ml-5 list-decimal space-y-1.5 last:mb-0" {...props} />,
    li: (props: any) => <li className="pl-1 leading-[1.65]" {...props} />,
    h1: (props: any) => <h1 className="mb-3 mt-5 text-[20px] font-black tracking-tight text-brand-navy first:mt-0" {...props} />,
    h2: (props: any) => <h2 className="mb-2.5 mt-5 text-[17px] font-black tracking-tight text-brand-navy first:mt-0" {...props} />,
    h3: (props: any) => <h3 className="mb-2 mt-4 text-[15px] font-black text-brand-navy first:mt-0" {...props} />,
    strong: (props: any) => <strong className="font-black text-brand-navy" {...props} />,
    code: (props: any) => (
        <code className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[12.5px] text-brand-navy" {...props} />
    ),
    a: (props: any) => <a className="font-bold text-[#006AFF] underline underline-offset-2" {...props} />,
    hr: () => <hr className="my-4 border-gray-100" />,
    blockquote: (props: any) => (
        <blockquote className="my-3 border-l-2 border-gray-200 pl-3 text-gray-500" {...props} />
    ),
    // Markdown tables still appear for small ad-hoc grids; the table *widget*
    // is preferred for real data, but this keeps the fallback readable.
    table: (props: any) => (
        <div className="my-3 overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full border-collapse text-left" {...props} />
        </div>
    ),
    thead: (props: any) => <thead className="bg-gray-50/70" {...props} />,
    th: (props: any) => (
        <th className="whitespace-nowrap px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400" {...props} />
    ),
    td: (props: any) => <td className="border-t border-gray-50 px-3.5 py-2.5 text-[13px] text-gray-700" {...props} />,
};

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => {
                navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                });
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
        >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
        </button>
    );
};

export const MessageBubble: React.FC<{ message: ChatMessage; children?: React.ReactNode }> = ({ message, children }) => {
    if (message.role === 'user') {
        return (
            <div className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-[#006AFF] px-4 py-3 text-[14.5px] leading-relaxed text-white shadow-lg shadow-blue-500/10">
                    {message.content}
                </div>
            </div>
        );
    }

    return (
        <div className="flex">
            <div className="min-w-0 flex-1">
                <ThinkingTrace
                    content={message.thinking ?? ''}
                    streaming={!!message.streaming && !message.content}
                />

                <ToolTimeline steps={message.steps} live={!!message.streaming && !message.content} />

                {/*
                  The activity line is the last thing standing between the user
                  and silence: shown whenever this message is streaming but has
                  produced no prose yet.
                */}
                {message.streaming && !message.content && (
                    <div className="my-2">
                        <ActivityIndicator activity={message.activity ?? null} />
                    </div>
                )}

                {message.widgets.map((w, i) => (
                    <WidgetRenderer key={i} widget={w} />
                ))}

                {message.content && (
                    <div className="text-[14.5px] text-gray-700">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {message.content}
                        </ReactMarkdown>
                        {message.streaming && (
                            <span className="ml-0.5 inline-block h-[15px] w-[2px] translate-y-[2px] animate-pulse bg-[#006AFF]" />
                        )}
                    </div>
                )}

                {message.error && (
                    <div className="mt-2 rounded-xl border border-rose-100 bg-rose-50/60 px-3.5 py-2.5 text-[13px] font-medium text-rose-700">
                        {message.error}
                    </div>
                )}

                {children}

                {!message.streaming && message.content && (
                    <div className="mt-2 -ml-2">
                        <CopyButton text={message.content} />
                    </div>
                )}
            </div>
        </div>
    );
};
