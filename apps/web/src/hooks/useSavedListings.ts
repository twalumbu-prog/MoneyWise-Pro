import { useLocalList } from './useLocalList';

/** The Marketplace items a person has hearted (their watchlist), kept on this device. */
export function useSavedListings() {
    const { items, has, toggle } = useLocalList('mw:marketplace-saved', 200);
    return { saved: items, isSaved: has, toggle };
}

/** The sellers a person follows, kept on this device. */
export function useSavedSellers() {
    const { items, has, toggle } = useLocalList('mw:marketplace-sellers', 100);
    return { sellers: items, isFollowing: has, toggle };
}

/** What a person looked at last, newest first, so the Marketplace can pick up where they left off. */
export function useRecentlyViewed() {
    const { items, bump } = useLocalList('mw:marketplace-recent', 24);
    return { recent: items, remember: bump };
}
