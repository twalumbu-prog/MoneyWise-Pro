/**
 * Composer.tsx — Message input with model selection and speech-to-text.
 *
 * A textarea, not an input: multi-line questions are normal here. Enter sends,
 * Shift+Enter breaks the line, and the box grows to a cap then scrolls.
 *
 * The mic button uses the Web Speech API for transcription and AudioContext
 * for a reactive waveform that animates to actual microphone volume — not a
 * looping CSS animation, but real frequency data from the mic.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, Mic, Square } from 'lucide-react';
import type { AssistantModel } from '../../lib/agentClient';
import { VendorLogo } from './VendorLogos';

const TIER_STYLE: Record<string, string> = {
    fast: 'bg-emerald-50 text-emerald-600',
    balanced: 'bg-blue-50 text-[#006AFF]',
    deep: 'bg-purple-50 text-purple-600',
};

const MAX_TEXTAREA_PX = 200;

// Frequency bin indices for each of the 5 bars (symmetrical, mid-range focus).
// fftSize=64 → 32 bins; bins 2–8 cover roughly 130 Hz–500 Hz (speech range).
const BAR_BINS = [2, 4, 6, 4, 2];

interface Props {
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    onStop: () => void;
    busy: boolean;
    disabled?: boolean;
    models: AssistantModel[];
    selectedModel: string;
    onSelectModel: (id: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
}

export const Composer: React.FC<Props> = ({
    value, onChange, onSend, onStop, busy, disabled,
    models, selectedModel, onSelectModel, placeholder, autoFocus,
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // ── Speech-to-text ───────────────────────────────────────────────────────

    const [listening, setListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animFrameRef = useRef<number>(0);
    const barRefs = useRef<(HTMLDivElement | null)[]>([]);
    /** Text that existed in the box before recording started — prepended to transcript. */
    const baseTextRef = useRef('');

    const teardown = useCallback(() => {
        cancelAnimationFrame(animFrameRef.current);
        try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
        recognitionRef.current = null;
        analyserRef.current?.disconnect();
        analyserRef.current = null;
        audioCtxRef.current?.close().catch(() => undefined);
        audioCtxRef.current = null;
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        // Reset bars to resting height without going through React state.
        barRefs.current.forEach(b => { if (b) b.style.height = '3px'; });
        setListening(false);
    }, []);

    const startListening = useCallback(async () => {
        const SR =
            (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;
        if (!SR) {
            // eslint-disable-next-line no-alert
            alert('Speech recognition is not supported in this browser. Try Chrome or Edge.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const ctx = new AudioContext();
            audioCtxRef.current = ctx;
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            analyser.smoothingTimeConstant = 0.75; // smooths out sudden spikes
            const source = ctx.createMediaStreamSource(stream);
            source.connect(analyser);
            analyserRef.current = analyser;

            const freqData = new Uint8Array(analyser.frequencyBinCount);

            const tick = () => {
                analyser.getByteFrequencyData(freqData);
                barRefs.current.forEach((bar, i) => {
                    if (!bar) return;
                    const raw = freqData[BAR_BINS[i]] ?? 0;
                    // Map 0–255 to 3px (silence) – 20px (loud)
                    bar.style.height = `${3 + (raw / 255) * 17}px`;
                });
                animFrameRef.current = requestAnimationFrame(tick);
            };
            animFrameRef.current = requestAnimationFrame(tick);

            baseTextRef.current = value;

            const recognition = new SR();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onresult = (event: any) => {
                let transcript = '';
                for (let i = 0; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                const prefix = baseTextRef.current;
                onChange(prefix ? `${prefix} ${transcript}` : transcript);
            };

            recognition.onerror = () => teardown();
            recognition.onend = () => teardown();

            recognitionRef.current = recognition;
            recognition.start();
            setListening(true);
        } catch {
            // Mic permission denied or hardware unavailable
            teardown();
        }
    }, [value, onChange, teardown]);

    // Clean up when the component unmounts mid-session.
    useEffect(() => () => teardown(), [teardown]);

    // ── Textarea auto-resize ─────────────────────────────────────────────────

    /**
     * Grow with content up to the cap, then let it scroll.
     *
     * The single-row height is derived from computed style rather than measured,
     * and an empty box skips measurement entirely — scrollHeight on an empty
     * textarea is unreliable across engines, and an empty box is one row by
     * definition. A bad read can otherwise leave the composer stuck at its
     * maximum height on first paint.
     */
    const resize = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;

        const cs = getComputedStyle(el);
        const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 24;
        const chrome =
            parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) +
            parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
        const singleRow = Math.ceil(lineHeight + chrome);

        if (!el.value) {
            el.style.height = `${singleRow}px`;
            return;
        }

        el.style.height = 'auto';
        const measured = el.scrollHeight;
        el.style.height = `${Math.min(Math.max(measured, singleRow), MAX_TEXTAREA_PX)}px`;
    }, []);

    useLayoutEffect(resize, [value, resize]);

    // The first measurement can land before webfonts and the stylesheet have
    // settled. Re-measuring on the next frame (and once fonts resolve) corrects
    // it before the user ever sees it.
    useEffect(() => {
        const frame = requestAnimationFrame(resize);
        (document as any).fonts?.ready?.then(resize).catch(() => undefined);
        return () => cancelAnimationFrame(frame);
    }, [resize]);

    useEffect(() => {
        if (!menuOpen) return;
        const close = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [menuOpen]);

    const active = models.find(m => m.id === selectedModel);
    const canSend = value.trim().length > 0 && !busy && !disabled;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (canSend) onSend();
        }
    };

    return (
        <div className="rounded-[24px] border border-gray-200/70 bg-white shadow-[0_4px_28px_rgba(0,0,0,0.06)] transition-shadow focus-within:border-blue-200 focus-within:shadow-[0_4px_32px_rgba(0,106,255,0.10)]">
            <textarea
                ref={textareaRef}
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus={autoFocus}
                rows={1}
                disabled={disabled}
                placeholder={placeholder ?? 'Ask about your finances, or ask me to make a change…'}
                className="block w-full resize-none bg-transparent px-5 pt-4 text-[15px] leading-relaxed text-gray-800 placeholder:text-gray-300 focus:outline-none disabled:opacity-50"
                style={{ maxHeight: MAX_TEXTAREA_PX }}
            />

            <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
                {/* Model picker */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setMenuOpen(v => !v)}
                        className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-bold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
                    >
                        {active && <VendorLogo vendor={active.vendor} size={14} />}
                        <span className="max-w-[140px] truncate">{active?.label ?? 'Model'}</span>
                        <ChevronDown size={13} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {menuOpen && (
                        <div className="absolute bottom-full left-0 z-50 mb-2 w-[300px] overflow-hidden rounded-2xl border border-gray-100 bg-white p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
                            <p className="px-2.5 pb-1.5 pt-2 text-[10px] font-black uppercase tracking-widest text-gray-300">
                                Model
                            </p>
                            <div className="max-h-[320px] overflow-y-auto">
                                {models.map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => { onSelectModel(m.id); setMenuOpen(false); }}
                                        className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                                            m.id === selectedModel ? 'bg-blue-50/60' : 'hover:bg-gray-50'
                                        }`}
                                    >
                                        {/* Left: vendor logo */}
                                        <span className="mt-0.5 flex-shrink-0">
                                            <VendorLogo vendor={m.vendor} size={18} />
                                        </span>

                                        {/* Middle: name + blurb */}
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                <span className="truncate text-[13px] font-black text-brand-navy">{m.label}</span>
                                                <span className={`rounded px-1.5 py-px text-[9px] font-black uppercase tracking-wide ${TIER_STYLE[m.tier]}`}>
                                                    {m.tier}
                                                </span>
                                            </span>
                                            <span className="mt-0.5 block text-[11px] font-medium leading-snug text-gray-400">
                                                {m.blurb}
                                            </span>
                                        </span>

                                        {/* Right: active checkmark */}
                                        <span className="mt-0.5 w-4 flex-shrink-0 flex items-start">
                                            {m.id === selectedModel && <Check size={13} className="text-[#006AFF]" />}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right-side action buttons */}
                <div className="flex items-center gap-1.5">
                    {/* Mic / speech-to-text — hidden while AI is generating */}
                    {!busy && (
                        <button
                            onClick={listening ? teardown : startListening}
                            title={listening ? 'Stop recording' : 'Dictate'}
                            className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                                listening
                                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                            }`}
                        >
                            {listening ? (
                                /*
                                 * Five bars driven by requestAnimationFrame + direct DOM writes
                                 * (no React state, so 60fps updates don't cause re-renders).
                                 * Heights go from 3px (silence) to 20px (loud).
                                 */
                                <div className="flex items-center gap-[2.5px]" aria-hidden>
                                    {BAR_BINS.map((_, i) => (
                                        <div
                                            key={i}
                                            ref={el => { barRefs.current[i] = el; }}
                                            className="w-[2.5px] rounded-full bg-white"
                                            style={{ height: '3px', transition: 'height 80ms ease-out' }}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <Mic size={15} />
                            )}
                        </button>
                    )}

                    {busy ? (
                        <button
                            onClick={onStop}
                            title="Stop generating"
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200"
                        >
                            <Square size={13} fill="currentColor" />
                        </button>
                    ) : (
                        <button
                            onClick={onSend}
                            disabled={!canSend}
                            title="Send"
                            className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                                canSend
                                    ? 'bg-[#006AFF] text-white shadow-lg shadow-blue-500/25 hover:bg-[#0057d4]'
                                    : 'bg-gray-100 text-gray-300'
                            }`}
                        >
                            <ArrowUp size={17} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
