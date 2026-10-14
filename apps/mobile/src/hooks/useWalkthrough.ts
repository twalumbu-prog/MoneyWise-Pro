import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { apiJson } from 'core';
import { useAuth } from '../context/AuthContext';
import { usePersonalAccount } from './usePersonalAccount';
import {
    tasksFor, readSkipped, writeSkipped, readHidden, writeHidden, CARD_MAX_ACCOUNT_AGE_DAYS,
    type WalkthroughProgress, type WalkthroughTask,
} from '../lib/walkthrough';

export interface WalkthroughTaskState extends WalkthroughTask { complete: boolean; skipped: boolean }

/**
 * Getting-started progress for the active account. Steps tick themselves from real activity on the server;
 * "skipped" and "hidden" are this device's preference. Returns `available: false` while loading, on an older server,
 * or on any error — callers simply render nothing, so a failure here can never get in the way of the Inbox.
 */
export function useWalkthrough() {
    const { organizationId } = useAuth();
    const { isPersonal } = usePersonalAccount();
    const qc = useQueryClient();
    const [skipped, setSkipped] = useState<string[]>(() => readSkipped(organizationId));
    const [hidden, setHidden] = useState<boolean>(() => readHidden(organizationId));

    const query = useQuery<WalkthroughProgress>({
        queryKey: ['walkthrough', organizationId],
        queryFn: () => apiJson('/onboarding/walkthrough'),
        enabled: !!organizationId,
        staleTime: 15_000,
        retry: false,
    });

    // Coming back to the Inbox after doing a step re-reads progress, so the card moves on by itself.
    useFocusEffect(useCallback(() => {
        void qc.invalidateQueries({ queryKey: ['walkthrough', organizationId] });
        setSkipped(readSkipped(organizationId));
        setHidden(readHidden(organizationId));
    }, [qc, organizationId]));

    const data = query.data;
    const type = data?.accountType ?? (isPersonal ? 'PERSONAL' : 'BUSINESS');

    const tasks: WalkthroughTaskState[] = useMemo(() => {
        if (!data) return [];
        return tasksFor(type).map((t) => ({ ...t, complete: t.done(data.facts), skipped: skipped.includes(t.id) }));
    }, [data, type, skipped]);

    const completed = tasks.filter((t) => t.complete).length;
    const next = tasks.find((t) => !t.complete && !t.skipped) ?? null;
    const isNewAccount = (data?.accountAgeDays ?? Infinity) <= CARD_MAX_ACCOUNT_AGE_DAYS;

    const skip = useCallback((id: string) => {
        const nextList = Array.from(new Set([...readSkipped(organizationId), id]));
        writeSkipped(organizationId, nextList); setSkipped(nextList);
    }, [organizationId]);
    const unskip = useCallback((id: string) => {
        const nextList = readSkipped(organizationId).filter((x) => x !== id);
        writeSkipped(organizationId, nextList); setSkipped(nextList);
    }, [organizationId]);
    const setCardHidden = useCallback((v: boolean) => { writeHidden(organizationId, v); setHidden(v); }, [organizationId]);

    return {
        available: !!data && tasks.length > 0,
        tasks, completed, total: tasks.length, next, type,
        hidden, showCard: !!data && !hidden && isNewAccount && !!next,
        skip, unskip, setCardHidden,
        refetch: query.refetch,
    };
}
