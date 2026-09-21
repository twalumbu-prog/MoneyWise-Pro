import React, { useId, useRef } from 'react';
import { motion } from 'framer-motion';

/**
 * Animated tabs used across the app — all indicator animations driven by
 * framer-motion's layoutId (spring physics, shared layout).
 *
 * Exports:
 *  - SegmentedControl   – pill/capsule/outline/flat track with a sliding indicator
 *  - AnimatedTabContent – directional slide-in for tab content panels
 *  - TabPillGroup       – inline tab toggle for custom button layouts
 */

const SPRING = {
    type: 'spring',
    stiffness: 300,
    damping: 32,
    bounce: 0,
    restDelta: 0.01,
} as const;

// ---------------------------------------------------------------------------
// SegmentedControl
// ---------------------------------------------------------------------------

export interface SegOption {
    value: string;
    label: React.ReactNode;
}

interface SegmentedControlProps {
    options: SegOption[];
    value: string;
    onChange: (value: string) => void;
    /**
     * pill    = white chip on a gray track (default)
     * outline = blue-outlined chip on transparent track
     * capsule = fully-rounded pill on a rounded-full track
     * flat    = gray chip, no shadow, on a gapped transparent track
     */
    variant?: 'pill' | 'outline' | 'capsule' | 'flat';
    className?: string;
    trackBgClassName?: string;
    inactiveTextClassName?: string;
}

export function SegmentedControl({
    options,
    value,
    onChange,
    variant = 'pill',
    className = '',
    trackBgClassName,
    inactiveTextClassName,
}: SegmentedControlProps) {
    const layoutId = useId();

    const isPill    = variant === 'pill';
    const isCapsule = variant === 'capsule';
    const isFlat    = variant === 'flat';

    /* ── Track wrapper ── */
    const trackClass = isPill
        ? `relative flex ${trackBgClassName ?? 'bg-gray-100'} p-1 rounded-xl border border-gray-200`
        : isCapsule
        ? `relative flex ${trackBgClassName ?? 'bg-gray-50'} p-0.5 rounded-[80px]`
        : isFlat
        ? `relative flex items-center gap-6 ${trackBgClassName ?? ''}`
        : 'relative flex items-center gap-1.5';

    /* ── Sliding indicator classes ── */
    const indicatorClass = isPill
        ? 'absolute inset-0 bg-white shadow-sm rounded-lg'
        : isCapsule
        ? 'absolute inset-0 bg-white rounded-[80px] shadow-[0px_3px_1px_0px_rgba(0,0,0,0.04),0px_3px_8px_0px_rgba(0,0,0,0.12)] outline outline-[0.5px] outline-black/5'
        : isFlat
        ? 'absolute inset-0 bg-gray-100 rounded-md'
        : 'absolute inset-0 bg-white rounded-xl border-[1.5px] border-[#006AFF]';

    return (
        <div className={`${trackClass} ${className}`} role="tablist">
            {options.map((opt) => {
                const active = opt.value === value;

                /* ── Per-variant button classes ── */
                const btnClass = isPill
                    ? `relative flex-1 py-2 rounded-lg text-xs text-center ${
                          active ? 'text-brand-navy font-extrabold' : 'text-gray-500 font-bold hover:text-gray-900'
                      }`
                    : isCapsule
                    ? `relative flex-1 py-2 px-2.5 text-xs text-center leading-4 ${
                          active ? 'text-gray-900' : (inactiveTextClassName ?? 'text-gray-400')
                      }`
                    : isFlat
                    ? `relative flex-1 flex items-center justify-center px-1 text-center ${
                          active ? 'text-black' : (inactiveTextClassName ?? 'text-neutral-400')
                      }`
                    : `relative px-3 py-1.5 rounded-xl text-sm ${
                          active ? 'text-[#006AFF] font-bold' : 'text-[#7C8FA2] font-normal'
                      }`;

                return (
                    <button
                        key={opt.value}
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(opt.value)}
                        className={btnClass}
                    >
                        {/* Sliding indicator — lives inside the button so inset-0 matches
                            its size, but uses layoutId so framer-motion can fly it between
                            buttons as the active value changes. */}
                        {active && (
                            <motion.span
                                layoutId={`seg-indicator-${layoutId}`}
                                className={indicatorClass}
                                transition={SPRING}
                                aria-hidden
                            />
                        )}
                        {/* Label must be stacked above the indicator */}
                        <span className="relative">{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// AnimatedTabContent
// ---------------------------------------------------------------------------

interface AnimatedTabContentProps {
    /** Changing this remounts the content with a directional entrance. */
    tabKey: string;
    /** Index of the active tab — higher = slide in from the right. */
    index: number;
    children: React.ReactNode;
    className?: string;
}

export function AnimatedTabContent({ tabKey, index, children, className = '' }: AnimatedTabContentProps) {
    // Track direction synchronously during render (before framer-motion
    // reads the `initial` prop) so the slide direction is always correct.
    const prevIndexRef = useRef(index);
    const dirRef       = useRef(0);          // 0 = no slide on first mount
    const isFirstRef   = useRef(true);

    if (isFirstRef.current) {
        isFirstRef.current = false;          // first mount → no slide
    } else if (prevIndexRef.current !== index) {
        dirRef.current = index > prevIndexRef.current ? 1 : -1;
        prevIndexRef.current = index;
    }

    return (
        <motion.div
            key={tabKey}
            className={className}
            initial={{ opacity: dirRef.current === 0 ? 1 : 0, x: dirRef.current * 32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={SPRING}
        >
            {children}
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// TabPillGroup — lightweight tab toggle for custom-layout bars.
//
// The track and buttons supply all the visual structure via className props;
// this component contributes ONLY the animated indicator (motion.span with
// layoutId) and the click handler.
//
// Usage example (Inbox Inflows/Outflows):
//
//   <TabPillGroup
//     value={mode}
//     onChange={setMode}
//     trackClassName="h-8 px-1 bg-white rounded-lg outline ..."
//     indicatorClassName="bg-[#F3F5FC] rounded-md"
//     separator={<div className="w-[1px] h-4 bg-[#E8EEF8]" />}
//     tabs={[
//       { value: 'outflows', buttonClassName: '...', label: <…/> },
//       { value: 'inflows',  buttonClassName: '...', label: <…/> },
//     ]}
//   />
// ---------------------------------------------------------------------------

interface TabPillGroupTab {
    value: string;
    label: React.ReactNode;
    /** Applied to the button always. */
    buttonClassName?: string;
    /** Applied to the button ONLY when it is active (merged with buttonClassName). */
    activeButtonClassName?: string;
}

interface TabPillGroupProps {
    value: string;
    onChange: (value: string) => void;
    tabs: TabPillGroupTab[];
    /** Outer wrapper element className. */
    trackClassName?: string;
    /** Classes for the sliding indicator motion.span (inset-0 is already applied). */
    indicatorClassName?: string;
    /** Optional element rendered between adjacent tabs (e.g. a divider). */
    separator?: React.ReactNode;
}

export function TabPillGroup({
    value,
    onChange,
    tabs,
    trackClassName = '',
    indicatorClassName = 'bg-white rounded-lg shadow-sm',
    separator,
}: TabPillGroupProps) {
    const layoutId = useId();

    return (
        <div className={trackClassName} role="tablist">
            {tabs.map((tab, i) => {
                const active = tab.value === value;
                return (
                    <React.Fragment key={tab.value}>
                        {i > 0 && separator}
                        <button
                            role="tab"
                            aria-selected={active}
                            onClick={() => onChange(tab.value)}
                            className={`relative ${tab.buttonClassName ?? ''}${active && tab.activeButtonClassName ? ` ${tab.activeButtonClassName}` : ''}`}
                        >
                            {active && (
                                <motion.span
                                    layoutId={`pill-indicator-${layoutId}`}
                                    className={`absolute inset-0 ${indicatorClassName}`}
                                    transition={SPRING}
                                    aria-hidden
                                />
                            )}
                            {/* Stacked above the indicator */}
                            <span className="relative flex items-center gap-2">{tab.label}</span>
                        </button>
                    </React.Fragment>
                );
            })}
        </div>
    );
}
