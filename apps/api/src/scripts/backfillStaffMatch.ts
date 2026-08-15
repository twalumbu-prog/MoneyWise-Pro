/**
 * One-off retroactive sweep: link existing payroll_staff rows to their team-
 * member (users) account so salary advances/loans they've already raised are
 * recognised by payroll. Uses the same conservative email→name matcher as the
 * live create-staff / invite-user code paths.
 *
 * Usage: npx ts-node src/scripts/backfillStaffMatch.ts "<org name substring>"
 *        npx ts-node src/scripts/backfillStaffMatch.ts --all
 */
import { supabase } from '../lib/supabase';
import { matchAllStaffInOrg } from '../lib/staffUserMatching';

async function main() {
    const arg = process.argv[2];
    if (!arg) {
        console.error('Usage: backfillStaffMatch.ts "<org name substring>" | --all');
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

    if (orgs.length === 0) {
        console.log('No matching organizations found.');
        return;
    }

    for (const org of orgs) {
        const result = await matchAllStaffInOrg(org.id);
        console.log(`\n${org.name} (${org.id})`);
        console.log(`  Unmatched before: ${result.total}`);
        console.log(`  Matched now:      ${result.matched}`);
        if (result.matches.length > 0) {
            for (const m of result.matches) {
                console.log(`    staff ${m.staff_id} -> user ${m.user_id}`);
            }
        }
        if (result.total - result.matched > 0) {
            console.log(`  Still unmatched:  ${result.total - result.matched} (no confident email/name match found)`);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
