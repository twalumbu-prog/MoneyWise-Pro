import { useCallback, useEffect, useState } from 'react';

function read(key: string): string[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

/**
 * A short list of ids kept on this device (saved items, saved sellers, recently viewed). Changes are instant because nothing waits on
 * the network, and another tab's changes show up here too.
 */
export function useLocalList(key: string, max = 100) {
    const [items, setItems] = useState<string[]>(() => read(key));

    useEffect(() => {
        const onStorage = (e: StorageEvent) => { if (e.key === key) setItems(read(key)); };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [key]);

    const write = useCallback((next: string[]) => {
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable: the list just won't persist */ }
    }, [key]);

    /** Adds the id if missing, removes it if present. */
    const toggle = useCallback((id: string) => {
        setItems((prev) => {
            const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev].slice(0, max);
            write(next);
            return next;
        });
    }, [max, write]);

    /** Puts the id at the front (moving it if already there). */
    const bump = useCallback((id: string) => {
        setItems((prev) => {
            if (prev[0] === id) return prev;
            const next = [id, ...prev.filter((x) => x !== id)].slice(0, max);
            write(next);
            return next;
        });
    }, [max, write]);

    const has = useCallback((id: string) => items.includes(id), [items]);
    return { items, has, toggle, bump };
}
