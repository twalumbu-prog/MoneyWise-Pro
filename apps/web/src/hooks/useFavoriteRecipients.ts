import { useCallback, useEffect, useState } from 'react';
import type { MoneyWiseRecipient } from 'core';

export type FavoriteMethod = 'moneywise' | 'mobile' | 'bank';

/** Someone the person pays often: enough to fill the send form in one tap. */
export interface FavoriteRecipient {
    id: string;
    method: FavoriteMethod;
    name: string;
    /** The line under the name: @username, phone number or bank and account. */
    subtitle: string;
    logoUrl?: string | null;
    /** MoneyWise: the full recipient, as the search returned it. */
    recipient?: MoneyWiseRecipient;
    /** Mobile money. */
    phone?: string;
    operator?: string;
    /** Bank. */
    bankId?: string;
    bankName?: string;
    accountNumber?: string;
    savedAt: number;
}

const MAX_FAVORITES = 30;
const keyFor = (organizationId: string | null | undefined) => `mw:favorite-recipients:${organizationId ?? 'none'}`;

function read(key: string): FavoriteRecipient[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * The people a person has starred for quick sending, kept per account in this browser. They are stored on the device (no server
 * round trip, nothing sensitive beyond what the person already typed); moving them to the account so they follow the person across
 * devices is a later step.
 */
export function useFavoriteRecipients(organizationId: string | null | undefined) {
    const key = keyFor(organizationId);
    const [favorites, setFavorites] = useState<FavoriteRecipient[]>(() => read(key));

    useEffect(() => { setFavorites(read(key)); }, [key]);

    // Another tab starring someone shows up here too.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => { if (e.key === key) setFavorites(read(key)); };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [key]);

    const persist = useCallback((next: FavoriteRecipient[]) => {
        setFavorites(next);
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable: the list just won't persist */ }
    }, [key]);

    const isFavorite = useCallback((id: string | null | undefined) => !!id && favorites.some((f) => f.id === id), [favorites]);

    const toggleFavorite = useCallback((fav: Omit<FavoriteRecipient, 'savedAt'>) => {
        if (favorites.some((f) => f.id === fav.id)) persist(favorites.filter((f) => f.id !== fav.id));
        else persist([{ ...fav, savedAt: Date.now() }, ...favorites].slice(0, MAX_FAVORITES));
    }, [favorites, persist]);

    const removeFavorite = useCallback((id: string) => persist(favorites.filter((f) => f.id !== id)), [favorites, persist]);

    return { favorites, isFavorite, toggleFavorite, removeFavorite };
}
