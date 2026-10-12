/**
 * Scenario test for the double-entry books. Creates a throwaway organization, drives REAL transactions through the
 * application's own code (cashbookService / ledgerService), and after every step asserts that:
 *   - the ledger ties to the wallets (per wallet, to the ngwee),
 *   - the balance sheet balances (assets − liabilities = equity + income − expenses),
 *   - reports show exactly what the wallets hold,
 * and that deliberately-broken states (neutralised entry, deleted entry, pending→completed, reclassified) either can't happen (the
 * database guards) or are DETECTED by the audit and REPAIRED by the heal. The throwaway organization is deleted afterwards.
 *
 *   npx tsc -p . --outDir /tmp/apibuild --noEmit false
 *   NODE_PATH=$PWD/node_modules node /tmp/apibuild/scripts/test_ledger_scenarios.js
 *
 * Exit code 1 on any failure. Run it before releases that touch money movement, posting or reporting.
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { ledgerService } from '../services/ledger.service';
import { auditOrganization, healOrganization } from '../services/ledgerIntegrity.service';

const results: { name: string; ok: boolean; detail?: string }[] = [];
const today = new Date().toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

async function step(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push({ name, ok: true }); console.log(`PASS  ${name}`); }
    catch (e: any) { results.push({ name, ok: false, detail: e?.message }); console.log(`FAIL  ${name} — ${e?.message}`); }
}
const must = (c: any, msg: string) => { if (!c) throw new Error(msg); };

async function report(orgId: string) {
    // Same roll-up the Reports screen reads.
    const { data, error } = await supabase.rpc('report_account_balances', { p_org: orgId, p_start: '2000-01-01', p_end: '2100-01-01' });
    if (error) throw new Error(error.message);
    const by = (t: string, sign: 1 | -1) => (data || []).filter((r: any) => r.type === t).reduce((s: number, r: any) => s + sign * (Number(r.cumulative_debit) - Number(r.cumulative_credit)), 0);
    return { assets: r2(by('ASSET', 1)), liabilities: r2(by('LIABILITY', -1)), equity: r2(by('EQUITY', -1)), income: r2(by('INCOME', -1)), expense: r2(by('EXPENSE', 1)), rows: data || [] };
}
async function expectClean(orgId: string, label: string) {
    const a = await auditOrganization(orgId);
    const errors = a.findings.filter(f => f.severity === 'ERROR');
    must(errors.length === 0, `${label}: ${errors.map(e => `${e.code} (${e.message})`).join('; ')}`);
    return a;
}

async function main() {
    const { data: anyUser } = await supabase.from('users').select('id').limit(1).maybeSingle();
    const userId = (anyUser as any)?.id;
    must(userId, 'no user available for created_by');

    const stamp = Date.now();
    const { data: org, error: orgErr } = await supabase.from('organizations').insert({ name: `ZZ Ledger Test ${stamp}`, slug: `zz-ledger-test-${stamp}` }).select('id').single();
    must(org && !orgErr, `could not create the test organization: ${orgErr?.message}`);
    const orgId = (org as any).id as string;
    console.log(`test organization ${orgId}\n`);

    try {
        // ── fixtures ──
        const mk = async (code: string, name: string, type: string, subtype: string) =>
            (await supabase.from('accounts').insert({ organization_id: orgId, code, name, type, subtype }).select('id').single()).data as any;
        await mk('QB-1150040000', 'MoneyWise Wallet', 'ASSET', 'Bank');
        const groceries = await mk('EXP-901', 'Test Groceries', 'EXPENSE', 'Operating Expenses');
        const fuel = await mk('EXP-902', 'Test Fuel', 'EXPENSE', 'Operating Expenses');
        const salary = await mk('INC-901', 'Test Salary', 'INCOME', 'Revenue');
        const { data: main } = await supabase.from('organization_wallets').insert({ organization_id: orgId, name: 'Main Wallet', is_main: true }).select('id').single();
        const { data: trip } = await supabase.from('organization_wallets').insert({ organization_id: orgId, name: 'Trip Fund', is_main: false }).select('id').single();
        const mainId = (main as any).id, tripId = (trip as any).id;

        const entry = (over: any) => cashbookService.createEntry(orgId, { date: today, balance_after: 0, created_by: userId, account_type: 'MONEYWISE_WALLET', wallet_id: mainId, status: 'COMPLETED', debit: 0, credit: 0, entry_type: 'INFLOW', description: 'x', ...over } as any);

        let inflow: any, outflow: any, tripIn: any;

        await step('1. uncategorised deposit K1,000 → wallet K1,000, ledger ties, sits in Suspense', async () => {
            inflow = await entry({ description: 'Deposit from employer', debit: 1000, entry_type: 'INFLOW' });
            const a = await expectClean(orgId, 'after deposit');
            const w = a.wallets.find(x => x.name.includes('Main') || x.account === 'MoneyWise Wallet');
            must(w && w.cashbook === 1000 && w.ledger === 1000, `main wallet should be 1000/1000, got ${JSON.stringify(w)}`);
            must(a.totals.suspense === 1000, `suspense should hold the 1000, got ${a.totals.suspense}`);
        });

        await step('2. categorising the deposit moves it out of Suspense into income (live)', async () => {
            await supabase.from('cashbook_entries').update({ account_id: salary.id, status: 'COMPLETED' }).eq('id', inflow.id);
            await ledgerService.repostForCashbookEntry(inflow.id);
            const a = await expectClean(orgId, 'after categorising');
            const rep = await report(orgId);
            must(a.totals.suspense === 0 && rep.income === 1000, `income should be 1000, suspense 0 (income ${rep.income}, suspense ${a.totals.suspense})`);
        });

        await step('3. categorised payout K250 → wallet K750, expense K250, balance sheet balances', async () => {
            outflow = await entry({ description: 'Shoprite groceries', credit: 250, entry_type: 'EXPENSE', account_id: groceries.id });
            const a = await expectClean(orgId, 'after payout');
            const rep = await report(orgId);
            must(rep.assets === 750 && rep.expense === 250 && rep.income === 1000, `assets 750 / expense 250 / income 1000 expected, got ${JSON.stringify({ a: rep.assets, e: rep.expense, i: rep.income })}`);
            must(r2(rep.assets - rep.liabilities) === r2(rep.equity + rep.income - rep.expense), 'balance sheet identity broken');
            must(a.totals.assets === 750, 'audit assets should be 750');
        });

        await step('4. transfer between wallets K100 (two entries) → each wallet ties separately, total unchanged', async () => {
            await entry({ description: 'Transfer: Main ➡️ Trip (Outflow)', credit: 100, entry_type: 'ADJUSTMENT', wallet_id: mainId });
            tripIn = await entry({ description: 'Transfer: Main ➡️ Trip (Inflow)', debit: 100, entry_type: 'ADJUSTMENT', wallet_id: tripId });
            const a = await expectClean(orgId, 'after transfer');
            const mainW = a.wallets.find(w => w.account === 'MoneyWise Wallet'); const tripW = a.wallets.find(w => w.account === 'Trip Fund');
            must(mainW?.ledger === 650 && mainW?.cashbook === 650, `main should be 650, got ${JSON.stringify(mainW)}`);
            must(tripW?.ledger === 100 && tripW?.cashbook === 100, `Trip Fund should be 100 with its OWN ledger account, got ${JSON.stringify(tripW)}`);
            must(a.totals.assets === 750, 'total assets should still be 750');
        });

        await step('5. editing a category re-posts: reclassify the payout Groceries → Fuel', async () => {
            await supabase.from('cashbook_entries').update({ account_id: fuel.id }).eq('id', outflow.id);
            await ledgerService.repostForCashbookEntry(outflow.id);
            const a = await expectClean(orgId, 'after reclassify');
            const rep = await report(orgId);
            const fuelRow = rep.rows.find((r: any) => r.code === 'EXP-902'); const grocRow = rep.rows.find((r: any) => r.code === 'EXP-901');
            must(Number(fuelRow?.cumulative_debit) - Number(fuelRow?.cumulative_credit) === 250 && !(Number(grocRow?.cumulative_debit) - Number(grocRow?.cumulative_credit)), 'expense should have moved to Fuel');
            must(a.ok, 'books should be clean');
        });

        await step('6. an entry zeroed ("neutralised") can never leave a stale ledger entry (DB guard, or detected + healed)', async () => {
            const dup = await entry({ description: 'Duplicate to be neutralised', debit: 61, entry_type: 'INFLOW' });
            await supabase.from('cashbook_entries').update({ debit: 0, credit: 0, description: '[Duplicate of a booked transfer - neutralised] x' }).eq('id', dup.id);
            const after = await auditOrganization(orgId);
            if (!after.ok) {
                // No database guard installed: the audit must see it, and the heal must fix it.
                must(after.findings.some(f => f.code === 'JOURNAL_FOR_INELIGIBLE'), 'audit should flag the stale posting');
                await healOrganization(orgId, { deadlineMs: Date.now() + 60_000 });
            }
            await expectClean(orgId, 'after neutralising');
        });

        await step('7. a deleted entry can never leave a ghost posting (DB guard, or detected + healed)', async () => {
            const ghost = await entry({ description: 'To be deleted', debit: 500, entry_type: 'INFLOW' });
            await supabase.from('cashbook_entries').delete().eq('id', ghost.id);
            const after = await auditOrganization(orgId);
            if (!after.ok) {
                must(after.findings.some(f => f.code === 'ORPHAN_JOURNAL'), 'audit should flag the ghost posting');
                const h = await healOrganization(orgId, { deadlineMs: Date.now() + 60_000 });
                must(h.orphansRemoved >= 1, 'heal should remove the ghost');
            }
            await expectClean(orgId, 'after deleting');
        });

        await step('8. a pending entry is not in the books until it completes', async () => {
            const pend = await entry({ description: 'Pending deposit', debit: 40, entry_type: 'INFLOW', status: 'PENDING' });
            const before = await expectClean(orgId, 'with pending entry');
            must(before.totals.assets === 750, 'a pending deposit must not count yet');
            await supabase.from('cashbook_entries').update({ status: 'COMPLETED' }).eq('id', pend.id);
            await ledgerService.repostForCashbookEntry(pend.id as string);
            const after = await expectClean(orgId, 'after completing');
            must(after.totals.assets === 790, `assets should now be 790, got ${after.totals.assets}`);
        });

        await step('9. final: reports equal the wallets exactly, and the balance sheet balances', async () => {
            const a = await expectClean(orgId, 'final');
            const rep = await report(orgId);
            const walletTotal = r2(a.wallets.reduce((s, w) => s + w.cashbook, 0));
            must(rep.assets === walletTotal, `Reports show assets K${rep.assets} but the wallets hold K${walletTotal}`);
            must(r2(rep.assets - rep.liabilities) === r2(rep.equity + rep.income - rep.expense), 'assets − liabilities ≠ equity + income − expense');
        });

        await step('10. an organization with no cash account still gets cash entries posted (account created on demand)', async () => {
            const cashEntry = await entry({ description: 'Cash sale', debit: 30, entry_type: 'INFLOW', account_type: 'CASH', wallet_id: null });
            const a = await expectClean(orgId, 'after a cash entry');
            const { data: cashAcct } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', 'CASH-ON-HAND').maybeSingle();
            must(cashAcct, 'a Cash on Hand account should have been created');
            const { data: je } = await supabase.from('journal_entries').select('id').eq('source_id', (cashEntry as any).id).maybeSingle();
            must(je, 'the cash entry should be in the ledger');
            must(a.ok, 'books should be clean');
        });
    } finally {
        // clean up the throwaway organization
        const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', orgId);
        const ids = (je || []).map((j: any) => j.id);
        for (let i = 0; i < ids.length; i += 200) await supabase.from('journal_lines').delete().in('journal_entry_id', ids.slice(i, i + 200));
        await supabase.from('journal_entries').delete().eq('organization_id', orgId);
        await supabase.from('cashbook_entries').delete().eq('organization_id', orgId);
        await supabase.from('organization_wallets').delete().eq('organization_id', orgId);
        await supabase.from('accounts').delete().eq('organization_id', orgId);
        const { error } = await supabase.from('organizations').delete().eq('id', orgId);
        console.log(error ? `\n(cleanup: left test organization ${orgId} behind: ${error.message})` : '\n(test organization removed)');
    }

    const failed = results.filter(r => !r.ok).length;
    console.log(`${results.length - failed}/${results.length} scenarios passed`);
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
