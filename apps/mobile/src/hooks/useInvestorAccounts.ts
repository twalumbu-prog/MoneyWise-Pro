import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { investmentService } from 'core';
import type { MyInvestorAccount } from 'core';

/**
 * The caller's account (or application) with each investment company. Drives the
 * Invest button: no ACTIVE account means the connect/register prompt, not the payment flow.
 */
export function useInvestorAccounts() {
    const query = useQuery({
        queryKey: ['investor-accounts'],
        queryFn: () => investmentService.getMyAccounts(),
        staleTime: 30_000,
    });

    const accountFor = useCallback(
        (targetId?: string | null): MyInvestorAccount | undefined =>
            targetId ? query.data?.find((a) => a.targetId === targetId) : undefined,
        [query.data],
    );

    return { accounts: query.data ?? [], accountFor, isPending: query.isPending, refetch: query.refetch };
}
