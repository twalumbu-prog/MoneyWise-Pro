import { useSyncExternalStore } from 'react';

/** Which walkthrough sheet is open. A tiny shared store so the Inbox card and the header's trophy button drive the same sheets. */
interface UiState { list: boolean; step: string | null }
let state: UiState = { list: false, step: null };
const listeners = new Set<() => void>();
const set = (next: Partial<UiState>) => { state = { ...state, ...next }; listeners.forEach((l) => l()); };

export const walkthroughUi = {
    openList: () => set({ list: true, step: null }),
    closeList: () => set({ list: false }),
    openStep: (id: string) => set({ step: id, list: false }),
    closeStep: () => set({ step: null }),
};

export function useWalkthroughUi(): UiState {
    return useSyncExternalStore(
        (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
        () => state,
        () => state,
    );
}
