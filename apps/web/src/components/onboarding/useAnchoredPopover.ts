import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const VIEWPORT_MARGIN = 8;

/**
 * Shared positioning + open/close plumbing for a button that opens a portaled
 * popover (country pickers, etc). Computes `fixed` coordinates from the
 * trigger's real viewport position so the popover can render into
 * document.body — escaping any ancestor's `overflow-hidden` — instead of
 * being an absolutely-positioned child that gets clipped by it.
 */
export function useAnchoredPopover(open: boolean, popoverWidth: number, onClose: () => void) {
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const updatePosition = () => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return;
        const left = Math.min(rect.left, window.innerWidth - popoverWidth - VIEWPORT_MARGIN);
        setCoords({ top: rect.bottom + 8, left: Math.max(VIEWPORT_MARGIN, left) });
    };

    useLayoutEffect(() => {
        if (open) updatePosition();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        searchRef.current?.focus();

        const onClickAway = (e: MouseEvent) => {
            const target = e.target as Node;
            if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
            onClose();
        };
        // capture=true so this also fires for scrolls inside any nested
        // scrollable ancestor, not just the window.
        document.addEventListener('mousedown', onClickAway);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            document.removeEventListener('mousedown', onClickAway);
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return { coords, buttonRef, popoverRef, searchRef };
}
