import { supabase } from './supabase';

/**
 * Personal accounts (one person's money) vs businesses. There is no dedicated column everywhere,
 * so this mirrors the name-based test used across the codebase, preferring the explicit
 * `is_personal` flag when the column exists.
 */
export async function isPersonalOrganization(organizationId: string): Promise<boolean> {
    const withFlag = await supabase.from('organizations').select('name, is_personal').eq('id', organizationId).maybeSingle();
    const row: any = withFlag.error
        ? (await supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle()).data
        : withFlag.data;
    if (!row) return false;
    if (row.is_personal === true) return true;
    const n = String(row.name || '').toLowerCase();
    return n.includes('workspace') || n.includes('personal') || n.includes('individual') || n.includes('private');
}
