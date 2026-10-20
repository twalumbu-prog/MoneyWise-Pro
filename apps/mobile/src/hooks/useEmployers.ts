import { useQuery } from '@tanstack/react-query';
import { userService } from 'core';
import type { Employer } from 'core';
import { useAuth } from '../context/AuthContext';
import { usePersonalAccount } from './usePersonalAccount';

export type { Employer };

/**
 * The organizations a person works for — where they are on the payroll or hold a staff (non-admin) role — as decided by the server.
 * Only loaded while the personal account is active: that is where a salary advance or loan from an employer is requested.
 * Owners and administrators with no staff record have no employer, so they see none (and the usual flows).
 */
export function useEmployers(): { isPersonal: boolean; employers: Employer[] } {
    const { isPersonal } = usePersonalAccount();
    const { session, organizationId } = useAuth();
    const { data } = useQuery({
        queryKey: ['employers', organizationId],
        queryFn: () => userService.getMyEmployers(),
        enabled: isPersonal && !!session,
        staleTime: 5 * 60_000,
        retry: false,
    });
    return { isPersonal, employers: isPersonal ? (data ?? []) : [] };
}
