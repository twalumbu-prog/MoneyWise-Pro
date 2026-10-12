/**
 * Ledger integrity audit — checks that every organization's double-entry books tie to its wallets.
 *
 *   npx tsc -p . --outDir /tmp/apibuild --noEmit false
 *   NODE_PATH=$PWD/node_modules node /tmp/apibuild/scripts/ledger_audit.js --all            # read-only, all orgs
 *   NODE_PATH=$PWD/node_modules node /tmp/apibuild/scripts/ledger_audit.js --org <uuid> --fix # repair one org
 *
 * Exit code 1 if any audited organization has an ERROR finding (after --fix, if given).
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { auditOrganization, healOrganization } from '../services/ledgerIntegrity.service';

async function main() {
    const args = process.argv.slice(2);
    const fix = args.includes('--fix');
    const orgArg = args.includes('--org') ? args[args.indexOf('--org') + 1] : null;
    let orgs: { id: string; name: string }[];
    if (orgArg) orgs = [{ id: orgArg, name: '' }];
    else {
        const { data } = await supabase.from('organizations').select('id, name').order('name');
        orgs = (data || []) as any;
    }

    let bad = 0;
    for (const o of orgs) {
        try {
            let a = await auditOrganization(o.id);
            if (fix && !a.ok) {
                const h = await healOrganization(o.id, { deadlineMs: Date.now() + 8 * 60_000 });
                console.log(`   🔧 healed ${a.organizationName || o.name}: removed ${h.orphansRemoved} ghost postings, re-posted ${h.reposted}, failed ${h.failed}`);
                a = await auditOrganization(o.id);
            }
            const errs = a.findings.filter(f => f.severity === 'ERROR');
            if (a.totals.cashbookEntries === 0 && a.totals.journals === 0) continue; // empty org
            console.log(`${a.ok ? '✅' : '❌'} ${(a.organizationName || o.name).padEnd(38)} entries=${String(a.totals.cashbookEntries).padStart(5)} assets=${a.totals.assets} suspense=${a.totals.suspense}`);
            for (const f of a.findings) {
                if (f.severity === 'INFO' && !args.includes('--verbose')) continue;
                console.log(`     ${f.severity === 'ERROR' ? '✗' : f.severity === 'WARN' ? '!' : 'i'} ${f.code}: ${f.message}${f.sample?.length ? `\n         e.g. ${f.sample.slice(0, 3).join(' | ')}` : ''}`);
            }
            if (errs.length) bad++;
        } catch (e: any) { console.log(`⚠️  ${o.name || o.id}: audit failed — ${e.message}`); bad++; }
    }
    console.log(`\n${orgs.length - bad}/${orgs.length} organizations clean${bad ? `, ${bad} need attention` : ''}`);
    process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
