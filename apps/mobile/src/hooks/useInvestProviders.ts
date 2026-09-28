import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { investmentService } from 'core';
import { INVEST_PROVIDERS, toRealInvestProvider, type InvestProvider } from '../data/investCatalog';

/**
 * Real investment targets (see apps/api/src/controllers/invest.controller.ts)
 * prepended to the static demo catalog, so a real company like Kapstone
 * Capital shows up first everywhere the Invest feature lists providers.
 */
export function useInvestProviders(): InvestProvider[] {
    const { data } = useQuery({
        queryKey: ['investment-targets'],
        queryFn: () => investmentService.getTargets(),
        staleTime: 60_000,
    });

    return useMemo(() => {
        const real = (data || []).map(toRealInvestProvider);
        return [...real, ...INVEST_PROVIDERS];
    }, [data]);
}
