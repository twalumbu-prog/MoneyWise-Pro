import { useCallback, useEffect, useState } from 'react';
import type { FavoriteRecipient } from './useFavoriteRecipients';

const MAX_RECENTS = 10;
const keyFor = (organizationId: string | null | undefined) => `mw:recent-recipients:${organizationId ?? 'none'}`;

function read(key: string): FavoriteRecipient[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * The last few people this person actually sent money to, newest first, kept per account in this browser (the same way favourites are).
 * A recipient is added only after a payment to them has gone through, and paying the same person again moves them to the front.
 */
export function useRecentRecipients(organizationId: string | null | undefined) {
    const key = keyFor(organizationId);
    const [recents, setRecents] = useState<FavoriteRecipient[]>(() => read(key));

    useEffect(() => { setRecents(read(key)); }, [key]);

    const addRecent = useCallback((r: Omit<FavoriteRecipient, 'savedAt'>) => {
        const next = [{ ...r, savedAt: Date.now() }, ...read(key).filter((x) => x.id !== r.id)].slice(0, MAX_RECENTS);
        setRecents(next);
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable: recents just won't persist */ }
    }, [key]);

    return { recents, addRecent };
}
