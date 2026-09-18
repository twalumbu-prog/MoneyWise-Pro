import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAchievements } from '../../context/AchievementsContext';
import { Sparkles, X, ChevronRight, ArrowDown, ArrowUp, ArrowLeft, ArrowRight } from 'lucide-react';

interface ElementBounds {
    top: number;
    left: number;
    width: number;
    height: number;
}

export const AchievementTourOverlay: React.FC = () => {
    const { activeMission, activeStep, activeStepIndex, advanceStep, cancelMission } = useAchievements();
    const [bounds, setBounds] = useState<ElementBounds | null>(null);
    const [isFadedBackdrop, setIsFadedBackdrop] = useState(false);
    const [isStuck, setIsStuck] = useState(false);
    // Matches Tailwind's `md` breakpoint, which is also where the sidebar
    // layout switches to the mobile bottom-nav / sticky-header layout.
    const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth < 768);
    const targetRef = useRef<Element | null>(null);
    const boundsRef = useRef<ElementBounds | null>(null);

    // Reset backdrop fade timer whenever active step changes
    useEffect(() => {
        setIsFadedBackdrop(false);
        const timer = setTimeout(() => {
            setIsFadedBackdrop(true);
        }, 2200);

        return () => clearTimeout(timer);
    }, [activeStepIndex, activeStep]);

    // Update target element bounds with threshold check to prevent perpetual re-renders
    const updateBounds = useCallback(() => {
        if (!activeStep) {
            if (boundsRef.current !== null) {
                boundsRef.current = null;
                setBounds(null);
            }
            return;
        }

        const selector = activeStep.targetSelector;
        const cssSelector = selector.startsWith('data-tour-target=')
            ? `[data-tour-target="${selector.split('=')[1].replace(/['"]/g, '')}"]`
            : selector;

        // The same tour target can exist twice in the DOM at once — the desktop
        // sidebar and the mobile bottom nav both render (one is just CSS-hidden
        // via `display:none`, not unmounted). querySelector() would always
        // return the first one in document order regardless of which layout is
        // actually visible, so instead pick the first match with real on-screen
        // dimensions — a display:none ancestor collapses getBoundingClientRect()
        // to 0x0, which a genuinely visible element (even position:fixed) never has.
        let el: Element | null = null;
        const candidates = document.querySelectorAll(cssSelector);
        for (const candidate of candidates) {
            const r = candidate.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                el = candidate;
                break;
            }
        }

        if (el) {
            targetRef.current = el;
            const rect = el.getBoundingClientRect();
            const newBounds = {
                top: Math.round(rect.top),
                left: Math.round(rect.left),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
            };

            setIsStuck(false);
            const prev = boundsRef.current;
            if (
                !prev ||
                Math.abs(prev.top - newBounds.top) > 1 ||
                Math.abs(prev.left - newBounds.left) > 1 ||
                Math.abs(prev.width - newBounds.width) > 1 ||
                Math.abs(prev.height - newBounds.height) > 1
            ) {
                boundsRef.current = newBounds;
                setBounds(newBounds);
            }
        } else {
            if (boundsRef.current !== null) {
                boundsRef.current = null;
                setBounds(null);
            }
        }
    }, [activeStep]);

    // Poll & observe layout/scroll/resize changes
    useEffect(() => {
        if (!activeStep) return;

        setIsStuck(false);
        updateBounds();
        const interval = setInterval(updateBounds, 150);
        const stuckTimer = setTimeout(() => setIsStuck(true), 6000);
        const handleResize = () => {
            updateBounds();
            setIsMobileViewport(window.innerWidth < 768);
        };
        window.addEventListener('resize', handleResize);
        window.addEventListener('scroll', updateBounds, true);

        return () => {
            clearInterval(interval);
            clearTimeout(stuckTimer);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', updateBounds, true);
        };
    }, [activeStep, updateBounds]);

    // Auto-advance step when user clicks on target element directly
    useEffect(() => {
        if (!activeStep || !bounds) return;

        const handleTargetClick = (e: MouseEvent) => {
            const target = targetRef.current;
            if (target && (target.contains(e.target as Node) || target === e.target)) {
                // Give small delay so target element click handler triggers first
                setTimeout(() => {
                    advanceStep();
                }, 150);
            }
        };

        window.addEventListener('click', handleTargetClick, true);
        return () => {
            window.removeEventListener('click', handleTargetClick, true);
        };
    }, [activeStep, bounds, advanceStep]);

    if (!activeMission || !activeStep) return null;

    const totalSteps = activeMission.steps.length;
    const arrowPos = (isMobileViewport && activeStep.mobileArrowPosition) || activeStep.arrowPosition || 'top';

    // If bounds are not resolved yet (e.g., page loading or tab switching), render dark backdrop smoothly
    if (!bounds) {
        if (isStuck) {
            return (
                <div className="fixed inset-0 z-[300] bg-brand-navy/60 backdrop-blur-xs transition-opacity duration-200 pointer-events-auto flex items-center justify-center p-4">
                    <div className="w-full max-w-xs bg-white rounded-3xl shadow-2xl border border-[#E8EEF8] p-5 text-center animate-in fade-in zoom-in-95 duration-200">
                        <p className="text-sm font-bold text-brand-navy mb-1">Couldn't find this step</p>
                        <p className="text-xs text-gray-500 leading-relaxed mb-4">
                            This part of the screen may have moved or isn't visible right now.
                        </p>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={advanceStep}
                                className="w-full py-2.5 bg-[#006AFF] hover:bg-[#0058DB] active:scale-98 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                            >
                                Skip This Step
                            </button>
                            <button
                                onClick={cancelMission}
                                className="w-full py-2 text-xs font-semibold text-gray-400 hover:text-gray-600"
                            >
                                Exit Tour
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        return (
            <div className="fixed inset-0 z-[300] bg-brand-navy/50 backdrop-blur-xs transition-opacity duration-200 pointer-events-auto flex items-center justify-center">
                <div className="bg-white text-brand-navy px-4 py-2.5 rounded-2xl border border-[#E8EEF8] text-xs font-bold shadow-xl flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#006AFF] animate-pulse" />
                    Locating step...
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[300] pointer-events-none animate-in fade-in duration-200">
            {/* Backdrop Spotlight Cutout with smooth fade-to-normal effect */}
            <div
                className={`absolute transition-all duration-700 ease-out border-2 border-[#006AFF]/80 rounded-2xl ${
                    isFadedBackdrop
                        ? 'shadow-[0_0_0_9999px_rgba(0,46,59,0.14)]'
                        : 'shadow-[0_0_0_9999px_rgba(0,46,59,0.68)]'
                }`}
                style={{
                    top: Math.max(0, bounds.top - 6),
                    left: Math.max(0, bounds.left - 6),
                    width: bounds.width + 12,
                    height: bounds.height + 12,
                }}
            />

            {/* Animated Arrow */}
            <div
                className="absolute z-[310] flex flex-col items-center pointer-events-none transition-all duration-250"
                style={getArrowStyle(bounds, arrowPos)}
            >
                <div className="bg-[#006AFF] text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full shadow-lg mb-1">
                    Tap here
                </div>
                {renderArrowIcon(arrowPos)}
            </div>

            {/* Floating Guidance Card */}
            <div
                className="absolute z-[320] pointer-events-auto w-80 max-w-[calc(100vw-32px)] bg-brand-navy text-white border border-white/10 rounded-3xl shadow-2xl p-4 backdrop-blur-md transition-all duration-250"
                style={getCardStyle(bounds, arrowPos)}
            >
                <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#006AFF]/20 text-[#4E9BFF] flex items-center justify-center">
                            <Sparkles size={14} />
                        </div>
                        <span className="text-[10px] font-bold text-[#7EB3FF] uppercase tracking-wider truncate max-w-[140px]">
                            {activeMission.title}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] font-semibold text-white/60 bg-white/10 px-2 py-0.5 rounded-full">
                            {activeStepIndex + 1} / {totalSteps}
                        </span>
                        <button
                            onClick={cancelMission}
                            className="text-white/50 hover:text-white transition-colors"
                            aria-label="Cancel mission tour"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                <h4 className="text-sm font-bold text-white mb-1">{activeStep.title}</h4>
                <p className="text-xs text-white/70 leading-relaxed mb-4">{activeStep.description}</p>

                <div className="flex items-center justify-between gap-2">
                    <button
                        onClick={cancelMission}
                        className="text-xs font-semibold text-white/50 hover:text-white/80 px-2 py-1"
                    >
                        Exit Tour
                    </button>

                    <button
                        onClick={advanceStep}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#006AFF] hover:bg-[#0058DB] active:scale-95 px-4 py-2 rounded-xl shadow-md transition-all"
                    >
                        {activeStepIndex + 1 === totalSteps ? 'Complete Mission' : 'Next Step'}
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

function renderArrowIcon(pos: string) {
    const className = "text-[#006AFF] filter drop-shadow-md";
    switch (pos) {
        case 'bottom': return <ArrowUp size={28} className={className} />;
        case 'left': return <ArrowRight size={28} className={className} />;
        case 'right': return <ArrowLeft size={28} className={className} />;
        case 'top':
        default:
            return <ArrowDown size={28} className={className} />;
    }
}

function getArrowStyle(bounds: ElementBounds, pos: string): React.CSSProperties {
    switch (pos) {
        case 'bottom':
            return {
                top: bounds.top + bounds.height + 12,
                left: bounds.left + bounds.width / 2 - 20,
            };
        case 'left':
            return {
                top: bounds.top + bounds.height / 2 - 20,
                left: bounds.left - 48,
            };
        case 'right':
            return {
                top: bounds.top + bounds.height / 2 - 20,
                left: bounds.left + bounds.width + 12,
            };
        case 'top':
        default:
            return {
                top: Math.max(10, bounds.top - 58),
                left: bounds.left + bounds.width / 2 - 20,
            };
    }
}

function getCardStyle(bounds: ElementBounds, arrowPos: string): React.CSSProperties {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const cardWidth = Math.min(320, screenWidth - 32);
    const cardHeight = 175;

    // Target Box with 12px margin
    const target = {
        top: bounds.top - 12,
        left: bounds.left - 12,
        right: bounds.left + bounds.width + 12,
        bottom: bounds.top + bounds.height + 12,
    };

    // Arrow Box
    let arrow = { top: 0, left: 0, right: 0, bottom: 0 };
    if (arrowPos === 'bottom') {
        arrow = {
            top: bounds.top + bounds.height + 4,
            left: bounds.left + bounds.width / 2 - 35,
            right: bounds.left + bounds.width / 2 + 35,
            bottom: bounds.top + bounds.height + 68,
        };
    } else if (arrowPos === 'top') {
        arrow = {
            top: bounds.top - 68,
            left: bounds.left + bounds.width / 2 - 35,
            right: bounds.left + bounds.width / 2 + 35,
            bottom: bounds.top - 4,
        };
    } else if (arrowPos === 'left') {
        arrow = {
            top: bounds.top + bounds.height / 2 - 35,
            left: bounds.left - 68,
            right: bounds.left - 4,
            bottom: bounds.top + bounds.height / 2 + 35,
        };
    } else {
        arrow = {
            top: bounds.top + bounds.height / 2 - 35,
            left: bounds.left + bounds.width + 4,
            right: bounds.left + bounds.width + 68,
            bottom: bounds.top + bounds.height / 2 + 35,
        };
    }

    const hasOverlap = (cTop: number, cLeft: number) => {
        const cRight = cLeft + cardWidth;
        const cBottom = cTop + cardHeight;

        const overlapsTarget = !(cRight < target.left || cLeft > target.right || cBottom < target.top || cTop > target.bottom);
        const overlapsArrow = !(cRight < arrow.left || cLeft > arrow.right || cBottom < arrow.top || cTop > arrow.bottom);

        return overlapsTarget || overlapsArrow;
    };

    const targetCenterX = bounds.left + bounds.width / 2;
    const targetCenterY = bounds.top + bounds.height / 2;
    const isLeftSide = targetCenterX < screenWidth / 2;

    // 1. Position for arrowPos === 'right' (e.g. sidebar navigation items)
    if (arrowPos === 'right') {
        // Preferred: To the right of arrow (out in main content area)
        const rightOfArrow = bounds.left + bounds.width + 72;
        const alignTop = Math.max(16, Math.min(bounds.top - 12, screenHeight - cardHeight - 16));
        if (rightOfArrow + cardWidth <= screenWidth - 16 && !hasOverlap(alignTop, rightOfArrow)) {
            return { top: alignTop, left: rightOfArrow };
        }
        // Secondary: Left of target if wide screen
        const leftOfTarget = bounds.left - cardWidth - 16;
        if (leftOfTarget >= 16 && !hasOverlap(alignTop, leftOfTarget)) {
            return { top: alignTop, left: leftOfTarget };
        }
    }

    // 2. Position for arrowPos === 'left'
    if (arrowPos === 'left') {
        const leftOfArrow = bounds.left - cardWidth - 72;
        const alignTop = Math.max(16, Math.min(bounds.top - 12, screenHeight - cardHeight - 16));
        if (leftOfArrow >= 16 && !hasOverlap(alignTop, leftOfArrow)) {
            return { top: alignTop, left: leftOfArrow };
        }
        const rightOfTarget = bounds.left + bounds.width + 16;
        if (rightOfTarget + cardWidth <= screenWidth - 16 && !hasOverlap(alignTop, rightOfTarget)) {
            return { top: alignTop, left: rightOfTarget };
        }
    }

    // 3. Position for arrowPos === 'bottom'
    if (arrowPos === 'bottom') {
        const idealLeft = isLeftSide
            ? Math.max(16, bounds.left)
            : Math.min(screenWidth - cardWidth - 16, bounds.left + bounds.width - cardWidth);

        // Try above target
        const topAbove = bounds.top - cardHeight - 16;
        if (topAbove >= 16 && !hasOverlap(topAbove, idealLeft)) {
            return { top: topAbove, left: idealLeft };
        }
        // Try below arrow
        const topBelowArrow = bounds.top + bounds.height + 76;
        if (topBelowArrow + cardHeight <= screenHeight - 16 && !hasOverlap(topBelowArrow, idealLeft)) {
            return { top: topBelowArrow, left: idealLeft };
        }
    }

    // 4. Position for arrowPos === 'top'
    if (arrowPos === 'top') {
        const idealLeft = isLeftSide
            ? Math.max(16, bounds.left)
            : Math.min(screenWidth - cardWidth - 16, bounds.left + bounds.width - cardWidth);

        // Try below target
        const topBelow = bounds.top + bounds.height + 16;
        if (topBelow + cardHeight <= screenHeight - 16 && !hasOverlap(topBelow, idealLeft)) {
            return { top: topBelow, left: idealLeft };
        }
        // Try above arrow
        const topAboveArrow = bounds.top - 76 - cardHeight;
        if (topAboveArrow >= 16 && !hasOverlap(topAboveArrow, idealLeft)) {
            return { top: topAboveArrow, left: idealLeft };
        }
    }

    // 5. Universal Fallback: Place card on opposite side of screen from target
    const fallbackLeft = isLeftSide
        ? Math.min(screenWidth - cardWidth - 24, Math.max(bounds.left + bounds.width + 68, 280))
        : 24;

    const fallbackTop = targetCenterY < screenHeight / 2
        ? Math.min(screenHeight - cardHeight - 24, Math.max(24, bounds.top + bounds.height + 24))
        : 24;

    return {
        top: fallbackTop,
        left: fallbackLeft,
    };
}

