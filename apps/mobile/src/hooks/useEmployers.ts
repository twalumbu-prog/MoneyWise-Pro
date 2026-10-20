import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePersonalAccount } from './usePersonalAccount';

export interface Employer { id: string; name: string; logoUrl: string | null; employeeId: string | null }

/** Same name test the rest of the app uses to tell a personal workspace from a company. */
const looksPersonal = (name?: string | null) => {
    const n = (name ?? '').toLowerCase();
    return n.includes('workspace') || n.includes('personal') || n.includes('individual') || n.includes('private');
};

/**
 * The organizations a person works for: the companies they are an ACTIVE member of, besides their own personal workspace.
 * Only meaningful while the personal account is active — that is where salary advances and loans from an employer are requested.
 * (The server re-checks membership and that the target is a company, so this list only decides what is offered.)
 */
export function useEmployers(): { isPersonal: boolean; employers: Employer[] } {
    const { isPersonal } = usePersonalAccount();
    const { userOrganizations } = useAuth();
    const employers = useMemo<Employer[]>(
        () => (isPersonal
            ? userOrganizations
                .filter((uo) => uo.status === 'ACTIVE' && uo.organization?.id && !looksPersonal(uo.organization.name))
                .map((uo) => ({ id: uo.organization.id, name: uo.organization.name, logoUrl: uo.organization.logo_url ?? null, employeeId: uo.employee_id ?? null }))
            : []),
        [isPersonal, userOrganizations],
    );
    return { isPersonal, employers };
}
