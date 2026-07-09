import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

/**
 * Live cache invalidation: after each write the API broadcasts a tiny
 * `{ entities }` event on the org's private Realtime channel; each entity is
 * a React Query key prefix, so invalidating it makes any mounted screen
 * refetch immediately. Changes made on one device (or by the background
 * Lenco sync) appear on every signed-in device within a second or two.
 *
 * Deliberately degrades gracefully on flaky carriers: the socket is an
 * accelerator, not a dependency — if it drops, refetch-on-focus/reconnect
 * and staleTime still keep data moving, exactly as before this existed.
 */
export const RealtimeCacheSync: React.FC = () => {
    const { session, organizationId } = useAuth();
    const queryClient = useQueryClient();
    const accessToken = session?.access_token;

    useEffect(() => {
        if (!accessToken || !organizationId) return;

        // Private-channel authorization checks the user's JWT against RLS on
        // realtime.messages (org members may only receive their own org topic).
        supabase.realtime.setAuth(accessToken);

        const channel = supabase
            .channel(`org:${organizationId}`, { config: { private: true } })
            .on('broadcast', { event: 'invalidate' }, ({ payload }) => {
                const entities: string[] = Array.isArray(payload?.entities) ? payload.entities : [];
                entities.forEach((prefix) =>
                    queryClient.invalidateQueries({ queryKey: [prefix] })
                );
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken, organizationId]);

    return null;
};
