import { supabase } from '../lib/supabase';
import { ledgerService } from '../services/ledger.service';

/**
 * Phase 3 — historical backfill + audit for the double-entry general ledger.
 *
 * For the given organization(s), re-posts every non-PENDING cashbook entry into the
 * GL (idempotent), then prints a trial balance and the key invariants:
 *   - every journal entry balances (enforced by the DB trigger anyway)
 *   - GL cash balance == cashbook_entries.balance_after (latest)
 *   - Assets - Liabilities == Equity (incl. computed Retained Earnings)
 *
 * Usage:  ts-node src/scripts/backfill_journal.ts <org_id|ALL> [--audit-only]
 */

const BLUE_OPUS = 'fa99669d-6160-44fd-94ac-8ff1f065003f';

async function backfillOrg(orgId: string, auditOnly: boolean) {
    if (!auditOnly) {
        const { data: entries } = await supabase
            .from('cashbook_entries')
            .select('id')
            .eq('organization_id', orgId)
            .neq('status', 'PENDING')
            .order('date', { ascending: true })
            .order('created_at', { ascending: true });

        console.log(`\n[Backfill] Org ${orgId}: re-posting ${entries?.length || 0} entries...`);
        let done = 0;
        for (const e of entries || []) {
            await ledgerService.repostForCashbookEntry(e.id);
            if (++done % 50 === 0) console.log(`  ...${done}`);
        }
        console.log(`[Backfill] Done (${done} entries).`);
    }

    await auditOrg(orgId);
}

async function auditOrg(orgId: string) {
    // Pull all journal lines joined to account type/name.
    const { data: lines } = await supabase
        .from('journal_lines')
        .select('debit, credit, accounts!inner(type, name, code), journal_entries!inner(organization_id)')
        .eq('journal_entries.organization_id', orgId);

    const byType: Record<string, number> = { ASSET: 0, LIABILITY: 0, EQUITY: 0, INCOME: 0, EXPENSE: 0 };
    const byAccount = new Map<string, { type: string; bal: number }>();

    for (const l of (lines as any[]) || []) {
        const t = l.accounts.type;
        const signedDebit = Number(l.debit || 0) - Number(l.credit || 0);
        // debit-normal: ASSET, EXPENSE; credit-normal: the rest
        const normal = (t === 'ASSET' || t === 'EXPENSE') ? signedDebit : -signedDebit;
        byType[t] = (byType[t] || 0) + normal;
        const key = `${l.accounts.code} ${l.accounts.name}`;
        const cur = byAccount.get(key) || { type: t, bal: 0 };
        cur.bal += normal;
        byAccount.set(key, cur);
    }

    const assets = byType.ASSET || 0;
    const liabilities = byType.LIABILITY || 0;
    const equityAccts = byType.EQUITY || 0;
    const income = byType.INCOME || 0;
    const expense = byType.EXPENSE || 0;
    const retainedEarnings = income - expense;
    const totalEquity = equityAccts + retainedEarnings;
    const check = assets - liabilities - totalEquity;

    console.log(`\n========== TRIAL BALANCE / BALANCE SHEET — org ${orgId} ==========`);
    console.log(`Assets:               K${assets.toFixed(2)}`);
    console.log(`Liabilities:          K${liabilities.toFixed(2)}`);
    console.log(`--- Equity ---`);
    console.log(`  Equity accounts:    K${equityAccts.toFixed(2)}  (capital, opening balance, suspense, share capital)`);
    console.log(`  Retained Earnings:  K${retainedEarnings.toFixed(2)}  (income ${income.toFixed(2)} - expense ${expense.toFixed(2)})`);
    console.log(`  TOTAL EQUITY:       K${totalEquity.toFixed(2)}`);
    console.log(`ACCOUNTING EQUATION:  Assets - Liabilities - Equity = K${check.toFixed(2)}  ${Math.abs(check) < 0.01 ? '✅ BALANCED' : '❌ OFF'}`);

    console.log(`\n--- Equity account detail ---`);
    for (const [name, v] of byAccount) {
        if (v.type === 'EQUITY' && Math.abs(v.bal) > 0.005) console.log(`  ${name}: K${v.bal.toFixed(2)}`);
    }

    // GL cash vs cashbook ledger balance.
    const { data: walletAcct } = await supabase
        .from('accounts').select('id, name').eq('organization_id', orgId).eq('code', 'QB-1150040000').maybeSingle();
    if (walletAcct) {
        const cur = byAccount.get(`QB-1150040000 ${walletAcct.name}`);
        const glCash = cur?.bal || 0;
        const { data: latest } = await supabase
            .from('cashbook_entries')
            .select('balance_after')
            .eq('organization_id', orgId)
            .eq('account_type', 'MONEYWISE_WALLET')
            .neq('status', 'PENDING')
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        const ledgerBal = Number(latest?.balance_after || 0);
        const diff = glCash - ledgerBal;
        console.log(`\n--- Cash reconciliation ---`);
        console.log(`  GL Main Wallet balance:        K${glCash.toFixed(2)}`);
        console.log(`  cashbook_entries.balance_after: K${ledgerBal.toFixed(2)}`);
        console.log(`  Diff: K${diff.toFixed(2)}  ${Math.abs(diff) < 0.01 ? '✅' : '⚠️ (note: aggregate vs sub-wallet split may differ)'}`);
    }
}

async function main() {
    const arg = process.argv[2] || BLUE_OPUS;
    const auditOnly = process.argv.includes('--audit-only');

    let orgIds: string[];
    if (arg === 'ALL') {
        const { data: orgs } = await supabase.from('organizations').select('id');
        orgIds = (orgs || []).map(o => o.id);
    } else {
        orgIds = [arg];
    }

    for (const orgId of orgIds) {
        await backfillOrg(orgId, auditOnly);
    }
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
