/**
 * One-off retroactive sweep: link existing LOAN/ADVANCE requisitions to the
 * payroll_staff row they're actually for. These were always filed with the
 * employee's name folded into the free-text description ("LOAN: Jane Doe -
 * reason") since staff_name/employee_id were being silently dropped on
 * insert (fixed in requisition.controller.ts) and no payroll_staff_id column
 * existed until now. Parses the name back out of the description and matches
 * it against payroll_staff, same conservative rule as resolveStaffFromFreeText:
 * only resolve when it's an unambiguous single match (also tries the name
 * with its two words swapped, since staff were entered both ways).
 *
 * Usage: npx ts-node src/scripts/backfillRequisitionStaffLink.ts "<org name substring>"
 *        npx ts-node src/scripts/backfillRequisitionStaffLink.ts --all
 */
import { supabase } from '../lib/supabase';

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** "LOAN: Jane Doe - Staff Loan" -> "Jane Doe" */
function nameFromDescription(desc: string | null, type: string): string | null {
    if (!desc) return null;
    const withoutPrefix = desc.replace(new RegExp(`^${type}:\\s*`, 'i'), '');
    const beforeDash = withoutPrefix.split(' - ')[0];
    return beforeDash.trim() || null;
}

async function main() {
    const arg = process.argv[2];
    if (!arg) {
        console.error('Usage: backfillRequisitionStaffLink.ts "<org name substring>" | --all');
        process.exit(1);
    }

    let orgs: { id: string; name: string }[] = [];
    if (arg === '--all') {
        const { data, error } = await supabase.from('organizations').select('id, name');
        if (error) throw error;
        orgs = data ?? [];
    } else {
        const { data, error } = await supabase.from('organizations').select('id, name').ilike('name', `%${arg}%`);
        if (error) throw error;
        orgs = data ?? [];
    }

    for (const org of orgs) {
        const { data: reqs, error: reqErr } = await supabase
            .from('requisitions')
            .select('id, type, description, staff_name, employee_id')
            .eq('organization_id', org.id)
            .in('type', ['LOAN', 'ADVANCE'])
            .is('payroll_staff_id', null);
        if (reqErr) throw reqErr;
        if (!reqs || reqs.length === 0) continue;

        const { data: staff, error: staffErr } = await supabase
            .from('payroll_staff')
            .select('id, employee_number, first_name, last_name')
            .eq('organization_id', org.id);
        if (staffErr) throw staffErr;
        if (!staff || staff.length === 0) continue;

        console.log(`\n${org.name} (${org.id}) — ${reqs.length} unmatched LOAN/ADVANCE requisitions`);

        let matched = 0;
        for (const r of reqs) {
            let targetId: string | null = null;

            const empId = norm(r.employee_id);
            if (empId) {
                const m = staff.filter(s => norm(s.employee_number) === empId);
                if (m.length === 1) targetId = m[0].id;
            }

            if (!targetId) {
                const rawName = norm(r.staff_name) || norm(nameFromDescription(r.description, r.type));
                if (rawName) {
                    const m = staff.filter(s =>
                        norm(`${s.first_name} ${s.last_name}`) === rawName ||
                        norm(`${s.last_name} ${s.first_name}`) === rawName
                    );
                    if (m.length === 1) targetId = m[0].id;
                }
            }

            if (targetId) {
                const { error: updErr } = await supabase.from('requisitions').update({ payroll_staff_id: targetId }).eq('id', r.id);
                if (updErr) throw updErr;
                matched++;
                console.log(`  matched: "${r.description}" -> staff ${targetId}`);
            } else {
                console.log(`  NO MATCH: "${r.description}" (staff_name="${r.staff_name}" employee_id="${r.employee_id}")`);
            }
        }
        console.log(`  ${matched}/${reqs.length} matched`);
    }
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
