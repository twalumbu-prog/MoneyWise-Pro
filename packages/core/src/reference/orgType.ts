/**
 * Personal/individual accounts have no dedicated column — "personal-ness" is
 * inferred from the org's own display name (set at signup) everywhere in the
 * codebase. Centralised here so every caller uses the exact same test rather
 * than re-typing the substring list with a chance of drifting.
 */
export function isPersonalOrgName(orgName: string | null | undefined): boolean {
    const name = (orgName || '').toLowerCase();
    return name.includes('workspace') ||
        name.includes('personal') ||
        name.includes('individual') ||
        name.includes('private');
}
