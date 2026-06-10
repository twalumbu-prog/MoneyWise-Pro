import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Lightweight, dependency-free animated tabs used on the Reports mobile view.
 *
 * - `SegmentedControl` renders a row of options with a highlight pill that
 *   smoothly slides (and resizes) to the active option.
 * - `AnimatedTabContent` cross-fades + directionally slides its children
 *   whenever `tabKey` changes, mimicking the animate-ui content transition
 *   without pulling in framer-motion.
 */

// Inject the content-swap keyframes once (module scope so they exist before
// the first AnimatedTabContent renders).
const STYLE_ID = 'animated-tabs-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = `
@keyframes atabs-in-right { from { opacity: 0; transform: translateX(48px); } to { opacity: 1; transform: translateX(0); } }
@keyframes atabs-in-left  { from { opacity: 0; transform: translateX(-48px); } to { opacity: 1; transform: translateX(0); } }
@keyframes atabs-chart-enter { from { opacity: 0; transform: translateY(34px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes atabs-chart-exit  { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(34px) scale(0.97); } }
@keyframes atabs-fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
`;
    document.head.appendChild(el);
}

export interface SegOption {
    value: string;
    label: React.ReactNode;
}

interface SegmentedControlProps {
    options: SegOption[];
    value: string;
    onChange: (value: string) => void;
    /** 'pill' = filled white chip on a gray track; 'outline' = blue-outlined chip on transparent track. */
    variant?: 'pill' | 'outline';
    className?: string;
}

interface HighlightRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export function SegmentedControl({
    options,
    value,
    onChange,
    variant = 'pill',
    className = '',
}: SegmentedControlProps) {
    const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const [rect, setRect] = useState<HighlightRect>({ left: 0, top: 0, width: 0, height: 0 });
    // Skip the transition on the very first measure so the pill appears in
    // place instead of growing out from the left edge.
    const [ready, setReady] = useState(false);

    const measure = () => {
        const btn = btnRefs.current[value];
        if (btn) {
            setRect({ left: btn.offsetLeft, top: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight });
        }
    };

    useLayoutEffect(() => {
        measure();
        // Re-measure after the frame settles (font loading / layout shifts).
        const raf = requestAnimationFrame(measure);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, options]);

    useEffect(() => {
        const onResize = () => measure();
        window.addEventListener('resize', onResize);
        const raf = requestAnimationFrame(() => setReady(true));
        return () => {
            window.removeEventListener('resize', onResize);
            cancelAnimationFrame(raf);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const isPill = variant === 'pill';

    const trackClass = isPill
        ? 'relative flex bg-gray-100 p-1 rounded-xl border border-gray-200'
        : 'relative flex items-center gap-1.5';

    const highlightClass = isPill
        ? 'bg-white shadow-sm rounded-lg'
        : 'bg-white rounded-xl border-[1.5px] border-[#006AFF]';

    return (
        <div className={`${trackClass} ${className}`}>
            {/* Sliding highlight */}
            <div
                aria-hidden
                className={`absolute z-0 pointer-events-none ${highlightClass}`}
                style={{
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                    transition: ready
                        ? 'left 300ms cubic-bezier(0.22, 1, 0.36, 1), width 300ms cubic-bezier(0.22, 1, 0.36, 1), top 300ms cubic-bezier(0.22, 1, 0.36, 1)'
                        : 'none',
                }}
            />
            {options.map((opt) => {
                const active = opt.value === value;
                const baseClass = isPill
                    ? `relative z-10 flex-1 py-2 rounded-lg text-xs text-center transition-colors duration-200 ${
                          active ? 'text-brand-navy font-extrabold' : 'text-gray-500 font-bold hover:text-gray-900'
                      }`
                    : `relative z-10 px-3 py-1.5 rounded-xl text-sm transition-colors duration-200 ${
                          active ? 'text-[#006AFF] font-bold' : 'text-[#7C8FA2] font-normal'
                      }`;
                return (
                    <button
                        key={opt.value}
                        ref={(node) => {
                            btnRefs.current[opt.value] = node;
                        }}
                        onClick={() => onChange(opt.value)}
                        className={baseClass}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

interface AnimatedTabContentProps {
    /** When this changes, the content re-mounts and replays the entrance animation. */
    tabKey: string;
    /** Position of the active tab; used to pick slide direction (higher = slide in from right). */
    index: number;
    children: React.ReactNode;
    className?: string;
}

export function AnimatedTabContent({ tabKey, index, children, className = '' }: AnimatedTabContentProps) {
    const prevIndex = useRef(index);
    const direction = index >= prevIndex.current ? 'right' : 'left';

    useEffect(() => {
        prevIndex.current = index;
    }, [index]);

    const animName = direction === 'right' ? 'atabs-in-right' : 'atabs-in-left';

    return (
        <div
            key={tabKey}
            className={className}
            style={{ animation: `${animName} 0.42s cubic-bezier(0.22, 1, 0.36, 1)` }}
        >
            {children}
        </div>
    );
}
