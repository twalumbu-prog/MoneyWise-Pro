/**
 * ThinkingTrace.tsx — The model's reasoning, shown as it happens.
 *
 * Auto-expands while streaming (it is the only thing to watch during the wait)
 * and collapses to a one-line summary once the answer arrives, so a finished
 * conversation isn't dominated by working-out the user has already moved past.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Brain, ChevronDown } from 'lucide-react';

interface Props {
    content: string;
    /** True while reasoning tokens are still arriving. */
    streaming: boolean;
}

/**
 * Reasoning arrives as markdown, but the trace is deliberately plain muted text
 * — rendering headings and bold inside it would compete with the actual answer.
 * Stripping the syntax is nicer than showing raw `**` to the user.
 */
function plainText(raw: string): string {
    return raw
        .replace(/^#{1,6}\s+/gm, '')      // headings
        .replace(/\*\*(.+?)\*\*/gs, '$1') // bold
        .replace(/(^|\s)\*(?!\s)(.+?)\*/gs, '$1$2') // italics, not bullet markers
        .replace(/`{1,3}([^`]+)`{1,3}/gs, '$1')     // code spans
        .replace(/\n{3,}/g, '\n\n');
}

export const ThinkingTrace: React.FC<Props> = ({ content, streaming }) => {
    const [manuallyToggled, setManuallyToggled] = useState<boolean | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Open while streaming, closed after — unless the user has expressed a preference.
    const open = manuallyToggled ?? streaming;

    // Keep the newest reasoning in view as it streams.
    useEffect(() => {
        if (open && streaming && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [content, open, streaming]);

    if (!content.trim()) return null;

    return (
        <div className="mb-3">
            <button
                onClick={() => setManuallyToggled(!open)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 transition-colors hover:text-gray-600"
            >
                <Brain size={12} className={streaming ? 'text-[#006AFF]' : ''} />
                <span className={streaming ? 'status-live' : ''}>
                    {streaming ? 'Thinking' : 'Thought process'}
                </span>
                <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div
                    ref={scrollRef}
                    className="mt-2 max-h-[220px] overflow-y-auto border-l-2 border-gray-100 pl-3 no-scrollbar"
                >
                    <p className="whitespace-pre-wrap text-[12px] leading-[1.65] text-gray-400">
                        {plainText(content)}
                        {streaming && (
                            <span className="ml-0.5 inline-block h-[11px] w-[2px] translate-y-[1px] animate-pulse bg-gray-300" />
                        )}
                    </p>
                </div>
            )}
        </div>
    );
};
