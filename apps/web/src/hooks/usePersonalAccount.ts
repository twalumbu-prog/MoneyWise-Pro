import { useAuth } from '../context/AuthContext';

/**
 * Whether the active account is a MoneyWise personal account (one person's money) rather than a business.
 * Personal workspaces are recognised by name, the same test the mobile app and API use
 * (`is_personal` is not sent to the client).
 */
export function usePersonalAccount() {
    const { organizationId, organizationName, userOrganizations } = useAuth();
    const org = userOrganizations.find((uo: any) => uo.organization?.id === organizationId)?.organization;
    const name: string = org?.name || organizationName || '';
    const n = name.toLowerCase();
    const isPersonal = n.includes('workspace') || n.includes('personal') || n.includes('individual') || n.includes('private');
    return { isPersonal, orgName: name, logoUrl: (org?.logo_url ?? null) as string | null };
}
