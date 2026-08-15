import { supabase } from './supabase';

/**
 * Links payroll_staff rows to their team-member (users) account so that a
 * salary-advance or loan requisition raised by that team member is visible
 * to payroll — the whole loan/advance recovery pipeline (loadOutstandingDebts,
 * getSuggestedDeductions, recordLoanRecoveries) filters payroll_staff on
 * `.not('user_id', 'is', null)`, so an unmatched staff row is invisible to it
 * no matter how many requisitions they've raised.
 *
 * Matching is intentionally conservative: exact email match first (the
 * reliable signal), falling back to exact full-name match only when it
 * resolves to exactly one candidate on each side. Ambiguous matches are
 * left alone rather than guessed — a wrong link would misattribute someone
 * else's loan deduction.
 */

interface OrgMember {
    user_id: string;
    email: string | null;
    name: string | null;
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

async function loadOrgMembers(orgId: string): Promise<OrgMember[]> {
    const { data, error } = await supabase
        .from('user_organizations')
        .select('user_id, users!inner(id, email, name)')
        .eq('organization_id', orgId);
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
        user_id: row.user_id,
        email: row.users?.email ?? null,
        name: row.users?.name ?? null,
    }));
}

/**
 * Try to link one payroll_staff row to a team member. Returns the matched
 * user_id, or null if no confident match was found. No-op if already linked.
 */
export async function matchStaffMember(orgId: string, staffId: string): Promise<string | null> {
    const { data: staffRow, error: staffErr } = await supabase
        .from('payroll_staff')
        .select('id, user_id, email, first_name, last_name')
        .eq('id', staffId)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (staffErr) throw staffErr;
    if (!staffRow) return null;
    if (staffRow.user_id) return staffRow.user_id;

    const members = await loadOrgMembers(orgId);
    if (members.length === 0) return null;

    const staffEmail = norm(staffRow.email);
    const staffName = norm(`${staffRow.first_name} ${staffRow.last_name}`);

    let matchUserId: string | null = null;
    if (staffEmail) {
        const emailMatches = members.filter(m => norm(m.email) === staffEmail);
        if (emailMatches.length === 1) matchUserId = emailMatches[0].user_id;
    }
    if (!matchUserId && staffName) {
        const nameMatches = members.filter(m => norm(m.name) === staffName);
        if (nameMatches.length === 1) matchUserId = nameMatches[0].user_id;
    }
    if (!matchUserId) return null;

    const { error: updErr } = await supabase
        .from('payroll_staff')
        .update({ user_id: matchUserId })
        .eq('id', staffId);
    if (updErr) throw updErr;
    return matchUserId;
}

/**
 * Reverse direction: when a team member is created/added/invited to an org,
 * try to link them to an unmatched payroll_staff row. Returns the matched
 * payroll_staff id, or null.
 */
export async function matchUserToStaff(orgId: string, userId: string): Promise<string | null> {
    const { data: user, error: userErr } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('id', userId)
        .maybeSingle();
    if (userErr) throw userErr;
    if (!user) return null;

    const { data: unmatched, error: staffErr } = await supabase
        .from('payroll_staff')
        .select('id, email, first_name, last_name')
        .eq('organization_id', orgId)
        .is('user_id', null);
    if (staffErr) throw staffErr;
    if (!unmatched || unmatched.length === 0) return null;

    const userEmail = norm(user.email);
    const userName = norm(user.name);

    let target: { id: string } | null = null;
    if (userEmail) {
        const emailMatches = unmatched.filter(s => norm(s.email) === userEmail);
        if (emailMatches.length === 1) target = emailMatches[0];
    }
    if (!target && userName) {
        const nameMatches = unmatched.filter(s => norm(`${s.first_name} ${s.last_name}`) === userName);
        if (nameMatches.length === 1) target = nameMatches[0];
    }
    if (!target) return null;

    const { error: updErr } = await supabase
        .from('payroll_staff')
        .update({ user_id: userId })
        .eq('id', target.id);
    if (updErr) throw updErr;
    return target.id;
}

/** Retroactive sweep: match every currently-unmatched payroll_staff row in an org. */
export async function matchAllStaffInOrg(orgId: string): Promise<{ matched: number; total: number; matches: { staff_id: string; user_id: string }[] }> {
    const { data: unmatched, error } = await supabase
        .from('payroll_staff')
        .select('id')
        .eq('organization_id', orgId)
        .is('user_id', null);
    if (error) throw error;
    if (!unmatched || unmatched.length === 0) return { matched: 0, total: 0, matches: [] };

    const matches: { staff_id: string; user_id: string }[] = [];
    for (const row of unmatched) {
        const userId = await matchStaffMember(orgId, row.id);
        if (userId) matches.push({ staff_id: row.id, user_id: userId });
    }
    return { matched: matches.length, total: unmatched.length, matches };
}
