import { useQuery } from '@tanstack/react-query';
import { apiJson } from 'core';

export interface DebtTagDef { key: string; label: string; hint: string; flow: 'IN' | 'OUT'; side: 'OWE' | 'OWED'; sign: 1 | -1 }

/** The tags that can be put on a transaction (loan received, repayment made, ...). Fetched once; the server owns the list. */
export function useDebtTags(enabled = true) {
    return useQuery({ queryKey: ['debts', 'tags'], enabled, staleTime: Infinity, retry: false, queryFn: async () => (await apiJson<{ tags: DebtTagDef[] }>('/debts/tags')).tags });
}

/** The pseudo-accounts the category picker shows for a transaction, one per tag that fits the way the money moved. */
export const debtOptionsFor = (tags: DebtTagDef[] | undefined, entry: { debit?: number | string | null; credit?: number | string | null }) => {
    const flow = Number(entry.debit || 0) >= Number(entry.credit || 0) ? 'IN' : 'OUT';
    return (tags ?? []).filter((t) => t.flow === flow).map((t) => ({ id: `debt:${t.key}`, code: 'Debt', name: t.label }));
};
