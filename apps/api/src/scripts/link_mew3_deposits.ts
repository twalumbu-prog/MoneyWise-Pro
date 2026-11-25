/**
 * One-off: link MEW3 Apartments' Kaizen sales to the wallet deposits that moved their money (see
 * services/depositTransfer.service.ts). DRY RUN by default — prints what would be booked and writes nothing.
 *
 *   npx ts-node --transpile-only src/scripts/link_mew3_deposits.ts            # dry run, 15–17 Nov pairs
 *   npx ts-node --transpile-only src/scripts/link_mew3_deposits.ts --apply    # book them (production!)
 *   ... --pairs earlier                                                       # the 11–14 Nov pairs instead
 *   ... --pairs nov21                                                         # #178 ⇄ CR-2026-0087, #159 ⇄ CR-2026-0090
 *   ... --pairs banza                                                         # #176 ⇄ CR-2026-0072 (K1,800 sale, K1,777 deposit)
 */
import 'dotenv/config';
import { linkDepositTransfer } from '../services/depositTransfer.service';

const ORG = '73937936-5b95-4351-b5a8-174563362173'; // MEW3 Apartments
const SETS: Record<string, Array<[string, string]>> = {
    default: [['kaizen:mew3:2026-11-14:r173', 'CR-2026-0068'], ['kaizen:mew3:2026-11-16:r174', 'CR-2026-0069'], ['kaizen:mew3:2026-11-17:r175', 'CR-2026-0071']],
    banza: [['kaizen:mew3:2026-11-20:r176', 'CR-2026-0072']],
    nov21: [['kaizen:mew3:2026-11-21:r178', 'CR-2026-0087'], ['kaizen:mew3:2026-11-21:r159', 'CR-2026-0090']],
    earlier: [['kaizen:mew3:2026-11-10:r170', 'CR-2026-0065'], ['kaizen:mew3:2026-11-14:r171', 'CR-2026-0066'], ['kaizen:mew3:2026-11-14:r172', 'CR-2026-0067']],
};

async function main() {
    const apply = process.argv.includes('--apply');
    const which = process.argv.includes('--pairs') ? process.argv[process.argv.indexOf('--pairs') + 1] : 'default';
    const pairs = SETS[which];
    if (!pairs) throw new Error(`unknown --pairs ${which}`);
    console.log(apply ? '*** APPLY: writing to the database ***' : 'DRY RUN (add --apply to write)');
    for (const [sale, dep] of pairs) {
        try {
            const r = await linkDepositTransfer({ organizationId: ORG, saleExternalReference: sale, depositReference: dep, dryRun: !apply });
            const t = r.transfer;
            console.log(`\n${sale}  ⇄  ${dep} (${t.deposit.date}, K${t.deposit.amount})  [${r.dryRun ? 'planned' : r.created ? 'CREATED' : 'already linked'}]`);
            console.log(`  gross K${t.gross_amount}  net K${t.net_amount}  fee K${t.fee_amount}  from ${t.source_account_type}`);
            for (const l of r.planned ?? []) console.log(`  - ${l.kind.padEnd(8)} ${l.account_type} credit K${l.credit}${l.account ? ` → ${l.account}` : ' → Suspense (offsets the deposit)'}  ref ${l.external_reference}\n      ${l.description}`);
            if (!r.dryRun) console.log(`  entries: ${t.entry_ids.join(', ')}`);
        } catch (e: any) { console.log(`\n${sale} ⇄ ${dep}: FAILED — ${e.message}`); process.exitCode = 1; }
    }
}
main().then(() => process.exit());
