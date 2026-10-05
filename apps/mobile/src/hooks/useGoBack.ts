import { useCallback } from 'react';
import { useRouter } from 'expo-router';

/**
 * A back action that can't fail. `router.back()` throws "The action 'GO_BACK' was not handled" when a
 * screen is the first in its stack — which is exactly what happens when it is opened from a push
 * notification, an invite link or a deep link. In that case go to a sensible parent instead.
 */
export function useGoBack(fallback: string = '/(tabs)') {
    const router = useRouter();
    return useCallback(() => {
        if (router.canGoBack()) router.back();
        else router.replace(fallback as any);
    }, [router, fallback]);
}
