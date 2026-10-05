import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { investmentService } from 'core';
import { buildInvestProviders, type InvestProvider } from '../data/investCatalog';

/**
 * Real investment targets (see apps/api/src/controllers/invest.controller.ts) merged
 * into the catalog: a company linked to a catalog provider replaces its demo entry,
 * and real companies with no catalog entry (e.g. Kapstone Capital) come first.
 */
export function useInvestProviders(): InvestProvider[] {
    const { data } = useQuery({
        queryKey: ['investment-targets'],
        queryFn: () => investmentService.getTargets(),
        staleTime: 60_000,
    });

    return useMemo(() => buildInvestProviders(data || []), [data]);
}
