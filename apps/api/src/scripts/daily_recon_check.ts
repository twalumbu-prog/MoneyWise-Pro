/**
 * Daily MoneyWise-wallets vs live-Lenco balance check (read-only). Run by the Claude Code scheduled task
 * `daily-wallet-lenco-recon`:  cd apps/api && npx ts-node src/scripts/daily_recon_check.ts
 * Prints a report; the last line is `RESULT: ALL BALANCED` or `RESULT: DIFFERENCES FOUND (n)`.
 */
import 'dotenv/config';
import { runDailyBalanceCheck, RECON_TOLERANCE } from '../services/reconciliation.service';

const k = (v: number | null) => v === null ? 'n/a' : `K${v.toFixed(2)}`;

(async () => {
    const { rows, checked, skipped } = await runDailyBalanceCheck(120_000);
    const diffs = rows.filter(r => r.flag === 'DIFFERENCE');
    const errs = rows.filter(r => r.flag === 'ERROR');
    console.log(`Checked ${checked} orgs (${skipped} unreached), tolerance ${k(RECON_TOLERANCE)}; ${rows.filter(r => r.flag === 'BALANCED').length} balanced.`);
    for (const r of diffs) {
        console.log(`DIFF  ${r.name}: MoneyWise ${k(r.moneywise)} vs Lenco ${k(r.lenco)} = ${k(r.difference)} | Lenco hold ${k(r.lencoHold)} | unexplained ${k(r.unexplained)}${r.note ? ' | ' + r.note : ''}`);
    }
    for (const r of errs) console.log(`ERROR ${r.name}: ${r.note}`);
    console.log(diffs.length || errs.length ? `RESULT: DIFFERENCES FOUND (${diffs.length} diff, ${errs.length} error)` : 'RESULT: ALL BALANCED');
    process.exit(0);
})().catch(e => { console.error('RECON FAILED:', e?.message || e); process.exit(1); });
