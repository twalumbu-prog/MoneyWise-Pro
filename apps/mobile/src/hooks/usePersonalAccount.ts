import { useAuth } from '../context/AuthContext';

/**
 * Whether the active account is a MoneyWise personal account (one person's money) rather than a business,
 * plus the picture and name to show for it. Personal workspaces are recognised by name, the same test used
 * across the app and API (`is_personal` is not sent to the client).
 */
export function usePersonalAccount() {
    const { organizationId, organizationName, userOrganizations } = useAuth();
    const org = userOrganizations.find((uo) => uo.organization?.id === organizationId)?.organization;
    const name = org?.name || organizationName || '';
    const n = name.toLowerCase();
    const isPersonal = n.includes('workspace') || n.includes('personal') || n.includes('individual') || n.includes('private');
    return { isPersonal, orgName: name, logoUrl: org?.logo_url ?? null };
}
