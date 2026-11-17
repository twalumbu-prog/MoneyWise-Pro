import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    growService, reportService, sanitizeGrowPlan, projectGrowPlan, gradeMonth, summariseGrowMonth,
    addMonths, monthKeyOf, monthRange, monthsBetween,
} from 'core';
import type { GrowPlan, GrowMonthActuals, GrowMonthResult, GrowProjection, GrowLedgerRow } from 'core';
import { useAuth } from '../../context/AuthContext';
import { cacheStoreSync } from '../../platform/storage';

/** Rejects if `p` hasn't settled in `ms` — a request that hangs offline must not leave Grow spinning. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

const localKey = (userId?: string | null, orgId?: string | null) => `grow-plan:${userId ?? 'anon'}:${orgId ?? 'none'}`;
const readLocal = (key: string): GrowPlan | null => {
    try { return sanitizeGrowPlan(JSON.parse(cacheStoreSync.getItem(key) ?? 'null')); } catch { return null; }
};

/**
 * The person's Grow plan for the active organisation. Local-first: the plan is kept on the device
 * (instant paint, works offline) and on the server (follows them to a new phone). A device copy that
 * is newer than the server's — e.g. saved while offline — wins and is pushed up.
 */
export function useGrowPlan() {
    const { user, organizationId } = useAuth();
    const queryClient = useQueryClient();
    const key = localKey(user?.id, organizationId);
    const queryKey = useMemo(() => ['grow-plan', organizationId, user?.id], [organizationId, user?.id]);

    const query = useQuery({
        queryKey,
        initialData: () => readLocal(key) ?? undefined,
        initialDataUpdatedAt: 0,
        // The query falls back to the device copy on its own, so it must run even offline.
        networkMode: 'always',
        retry: false,
        queryFn: async (): Promise<GrowPlan | null> => {
            const local = readLocal(key);
            let remote: GrowPlan | null = null;
            try {
                remote = await withTimeout(growService.get(), 8000);
            } catch { return local; }
            if (local && (!remote || local.updatedAt > remote.updatedAt)) {
                growService.save(local).catch(() => undefined);
                return local;
            }
            if (remote) cacheStoreSync.setItem(key, JSON.stringify(remote));
            else cacheStoreSync.removeItem(key);
            return remote;
        },
    });

    const save = useCallback(async (plan: GrowPlan) => {
        const stamped = { ...plan, updatedAt: new Date().toISOString() };
        cacheStoreSync.setItem(key, JSON.stringify(stamped));
        queryClient.setQueryData(queryKey, stamped);
        // The device copy is already saved; the server gets a few seconds before we stop waiting
        // (it keeps going in the background, and the next open pushes the device copy if it lost).
        const push = growService.save(stamped).then((saved) => {
            if (saved) {
                cacheStoreSync.setItem(key, JSON.stringify(saved));
                queryClient.setQueryData(queryKey, saved);
            }
            return true;
        }).catch(() => false);
        const synced = await Promise.race([push, new Promise<boolean>((r) => setTimeout(() => r(false), 6000))]);
        return { synced };
    }, [key, queryClient, queryKey]);

    const remove = useCallback(async () => {
        cacheStoreSync.removeItem(key);
        queryClient.setQueryData(queryKey, null);
        await growService.remove().catch(() => undefined);
    }, [key, queryClient, queryKey]);

    return { plan: query.data ?? null, isLoading: query.isPending && query.data === undefined, save, remove, refetch: query.refetch };
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Net worth right now (all balance-sheet accounts as of today). */
export async function fetchNetWorthToday(): Promise<number> {
    const today = new Date();
    const rows = await withTimeout(reportService.getExpenditures(iso(new Date(today.getFullYear(), today.getMonth(), 1)), iso(today), 'EXPENSE'), 20_000);
    return summariseGrowMonth(rows as GrowLedgerRow[], null).netWorth;
}

export function useNetWorthToday(enabled = true) {
    const { organizationId } = useAuth();
    return useQuery({
        queryKey: ['grow-networth-today', organizationId], queryFn: fetchNetWorthToday, enabled, staleTime: 60_000,
        networkMode: 'always', retry: 1,
    });
}

export interface GrowState {
    projection: GrowProjection;
    results: GrowMonthResult[];
    /** Index of the month containing today (clamped into the plan). */
    currentIndex: number;
    currentNetWorth: number;
    /** Net worth at the start of Month 1. */
    baseline: number;
    /** Actual net worth − where the plan says you should be today (pro-rated within the month). */
    aheadBy: number;
    /** Planned net worth for today. */
    plannedToday: number;
    finished: boolean;
}

/**
 * Pulls one reporting snapshot per elapsed plan month (plus the month before Month 1, for the baseline),
 * turns them into the four Grow buckets, and grades every month.
 */
export function useGrowState(plan: GrowPlan | null) {
    const { organizationId } = useAuth();
    const today = new Date();
    const thisMonth = monthKeyOf(today);

    const elapsed = useMemo(() => {
        if (!plan) return [] as string[];
        const last = monthsBetween(plan.startMonth, thisMonth) < 0
            ? addMonths(plan.startMonth, -1)
            : (monthsBetween(plan.goalMonth, thisMonth) > 0 ? plan.goalMonth : thisMonth);
        const out: string[] = [];
        for (let k = addMonths(plan.startMonth, -1); monthsBetween(k, last) >= 0; k = addMonths(k, 1)) out.push(k);
        return out;
    }, [plan, thisMonth]);

    const query = useQuery({
        queryKey: ['grow-actuals', organizationId, elapsed.join(',')],
        enabled: !!plan && elapsed.length > 0,
        staleTime: 60_000,
        networkMode: 'always',
        retry: false,
        queryFn: async () => {
            const todayIso = iso(new Date());
            const snaps = await withTimeout(Promise.all(elapsed.map((k) => {
                const { start, end } = monthRange(k);
                return reportService.getExpenditures(start, end < todayIso ? end : todayIso, 'EXPENSE') as Promise<GrowLedgerRow[]>;
            })), 20_000);
            const byMonth: Record<string, GrowMonthActuals> = {};
            elapsed.forEach((k, i) => { byMonth[k] = summariseGrowMonth(snaps[i], i > 0 ? snaps[i - 1] : null); });
            return byMonth;
        },
    });

    const state: GrowState | null = useMemo(() => {
        if (!plan) return null;
        const actuals: Record<string, GrowMonthActuals> = query.data ?? {};
        const prevKey = addMonths(plan.startMonth, -1);
        const todayIso = iso(new Date());
        // The month before Month 1 has closed → its closing net worth is the true starting point.
        const prevClosed = monthRange(prevKey).end < todayIso && actuals[prevKey];
        const baseline = prevClosed ? actuals[prevKey].netWorth : plan.startNetWorth;
        const projection = projectGrowPlan(plan, baseline);

        let prevNw = baseline;
        const results = projection.months.map((m) => {
            const a = actuals[m.key] ?? null;
            const r = gradeMonth(m, a, prevNw);
            if (a) prevNw = a.netWorth;
            return r;
        });

        const idx = monthsBetween(plan.startMonth, monthKeyOf(new Date()));
        const currentIndex = Math.max(0, Math.min(results.length - 1, idx));
        const latest = [...results].reverse().find((r) => r.actuals);
        const currentNetWorth = latest?.actuals?.netWorth ?? actuals[prevKey]?.netWorth ?? plan.startNetWorth;

        // Where the plan says you should be today: straight line through the current month.
        let plannedToday = baseline;
        if (idx >= results.length) plannedToday = projection.months[projection.months.length - 1].targetNetWorth;
        else if (idx >= 0) {
            const m = projection.months[idx];
            const startNw = idx === 0 ? baseline : projection.months[idx - 1].targetNetWorth;
            const days = monthRange(m.key).days;
            plannedToday = startNw + (m.targetNetWorth - startNw) * (new Date().getDate() / days);
        }

        return {
            projection, results, currentIndex, currentNetWorth, baseline,
            plannedToday, aheadBy: currentNetWorth - plannedToday, finished: idx >= results.length,
        };
    }, [plan, query.data]);

    return {
        state,
        isLoading: query.isPending && query.isFetching && !!plan && elapsed.length > 0,
        isError: query.isError && !query.data,
        isFetching: query.isFetching,
        refetch: query.refetch,
    };
}
