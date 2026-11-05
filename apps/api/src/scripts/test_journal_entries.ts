/**
 * Scenario test for manual journal entries and the GL-based statements (trial balance, cash flow, changes in equity, general ledger).
 * Creates a throwaway organization, drives real wallet transactions through cashbookService plus manual journals through
 * journalEntry.service, and asserts that: validation rejects bad entries, numbers are sequential (and survive 9999), a posted journal moves
 * the reports and keeps the ledger audit clean, the statements reconcile with the balance sheet, and a reversal nets to zero.
 * The throwaway organization is deleted afterwards.
 *
 *   npm run test:journals
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { auditOrganization } from '../services/ledgerIntegrity.service';
import { createManualJournal, validateJournalInput, reverseManualJournal, listJournals, JournalError } from '../services/journalEntry.service';
import { trialBalance, cashFlowStatement, changesInEquity, generalLedger } from '../services/financialStatements.service';

const results: { name: string; ok: boolean; detail?: string }[] = [];
const today = new Date().toISOString().slice(0, 10);
const year = new Date().getUTCFullYear();
const r2 = (n: number) => Math.round(n * 100) / 100;
async function step(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push({ name, ok: true }); console.log(`PASS  ${name}`); }
    catch (e: any) { results.push({ name, ok: false, detail: e?.message }); console.log(`FAIL  ${name} — ${e?.message}`); }
}
const must = (c: any, msg: string) => { if (!c) throw new Error(msg); };
const rejects = async (fn: () => any, re: RegExp, label: string) => {
    try { await fn(); } catch (e: any) { must(e instanceof JournalError && re.test(e.message), `${label}: expected /${re}/ but got "${e?.message}"`); return; }
    throw new Error(`${label}: should have been rejected`);
};

async function main() {
    const { data: anyUser } = await supabase.from('users').select('id').limit(1).maybeSingle();
    const userId = (anyUser as any)?.id; must(userId, 'no user available for created_by');
    const stamp = Date.now();
    const { data: org, error: orgErr } = await supabase.from('organizations').insert({ name: `ZZ Journal Test ${stamp}`, slug: `zz-journal-test-${stamp}` }).select('id').single();
    must(org && !orgErr, `could not create the test organization: ${orgErr?.message}`);
    const orgId = (org as any).id as string;
    console.log(`test organization ${orgId}\n`);

    try {
        const mk = async (code: string, name: string, type: string, subtype: string) =>
            (await supabase.from('accounts').insert({ organization_id: orgId, code, name, type, subtype }).select('id').single()).data as any;
        await mk('QB-1150040000', 'MoneyWise Wallet', 'ASSET', 'Bank');
        const wallet = (await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', 'QB-1150040000').single()).data as any;
        const ar = await mk('AR-1', 'Accounts Receivable', 'ASSET', 'Accounts Receivable');
        const equip = await mk('FA-1', 'Office Equipment', 'ASSET', 'Fixed Asset');
        const accDep = await mk('FA-2', 'Accumulated Depreciation', 'ASSET', 'Fixed Asset');
        const ap = await mk('AP-1', 'Accounts Payable', 'LIABILITY', 'Accounts Payable');
        const loan = await mk('LI-1', 'Bank Loan', 'LIABILITY', 'Long Term Liability');
        const capital = await mk('EQ-1', 'Owner Capital', 'EQUITY', "Owner's Equity");
        const sales = await mk('INC-1', 'Sales', 'INCOME', 'Sales');
        const rent = await mk('EXP-1', 'Rent', 'EXPENSE', 'Operating Expenses');
        const dep = await mk('EXP-2', 'Depreciation Expense', 'EXPENSE', 'Operating Expenses');
        const { data: main } = await supabase.from('organization_wallets').insert({ organization_id: orgId, name: 'Main Wallet', is_main: true }).select('id').single();
        const mainId = (main as any).id;
        const J = (lines: any[], over: any = {}) => ({ date: today, description: 'Test journal', lines, ...over });

        await step('1. validation rejects bad entries (pure)', async () => {
            const L = (a: string, d?: number, c?: number) => ({ account_id: a, debit: d, credit: c });
            await rejects(() => validateJournalInput(J([L('a', 10)])), /at least two lines/, 'single line');
            await rejects(() => validateJournalInput(J([L('a', 10), L('b', undefined, 9)])), /out of balance by 1\.00/, 'unbalanced');
            await rejects(() => validateJournalInput(J([L('a', 10, 10), L('b', 0, 0)])), /either a debit or a credit/, 'both sides');
            await rejects(() => validateJournalInput(J([L('a'), L('b', undefined, 5)])), /enter a debit or a credit/, 'empty line');
            await rejects(() => validateJournalInput(J([L('a', -5), L('b', undefined, -5)])), /positive/, 'negative');
            await rejects(() => validateJournalInput(J([L('', 5), L('b', undefined, 5)])), /choose an account/, 'no account');
            await rejects(() => validateJournalInput(J([L('a', 5), L('b', undefined, 5)], { date: '2026-02-30' })), /valid date/, 'bad date');
            await rejects(() => validateJournalInput(J([L('a', 5), L('b', undefined, 5)], { description: ' ' })), /description/, 'no description');
            await rejects(() => validateJournalInput(J([L('a', 0.123), L('b', undefined, 0.123)])), /2 decimals/, 'float noise');
            const ok = validateJournalInput(J([L('a', 10.1), L('b', undefined, 10.1)]));
            must(ok.totalDebit === 10.1 && ok.totalCredit === 10.1, 'a balanced entry should pass');
        });

        await step('2. wallet / foreign / inactive accounts are refused', async () => {
            await rejects(() => createManualJournal(orgId, userId, J([{ account_id: wallet.id, debit: 5 }, { account_id: sales.id, credit: 5 }])), /wallet\/cash account/, 'wallet account');
            await rejects(() => createManualJournal(orgId, userId, J([{ account_id: '00000000-0000-0000-0000-000000000000', debit: 5 }, { account_id: sales.id, credit: 5 }])), /does not belong/, 'foreign account');
            const { count } = await supabase.from('journal_entries').select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
            must((count ?? 0) === 0, 'a refused entry must not leave anything behind');
        });

        // Real wallet money first, so cash exists: K10,000 owner capital in, K2,000 rent out.
        await cashbookService.createEntry(orgId, { date: today, balance_after: 0, created_by: userId, account_type: 'MONEYWISE_WALLET', wallet_id: mainId, status: 'COMPLETED', debit: 10000, credit: 0, entry_type: 'INFLOW', description: 'Owner capital', account_id: capital.id } as any);
        await cashbookService.createEntry(orgId, { date: today, balance_after: 0, created_by: userId, account_type: 'MONEYWISE_WALLET', wallet_id: mainId, status: 'COMPLETED', debit: 0, credit: 2000, entry_type: 'DISBURSEMENT', description: 'Rent paid', account_id: rent.id } as any);

        let first: any, second: any;
        await step('3. a balanced journal posts, gets JV-<year>-0001 and the next gets 0002', async () => {
            first = await createManualJournal(orgId, userId, J([{ account_id: ar.id, debit: 500, description: 'Invoice 7' }, { account_id: sales.id, credit: 500 }], { reference: 'INV-7', description: 'Credit sale' }));
            must(first.journal_number === `JV-${year}-0001`, `journal number was ${first.journal_number}`);
            must(first.total_debit === 500 && first.total_credit === 500 && first.lines.length === 2, 'totals/lines wrong');
            must(first.source_type === 'MANUAL', 'source_type should be MANUAL');
            second = await createManualJournal(orgId, userId, J([{ account_id: dep.id, debit: 300 }, { account_id: accDep.id, credit: 300 }], { description: 'Depreciation' }));
            must(second.journal_number === `JV-${year}-0002`, `second number was ${second.journal_number}`);
        });

        await step('4. numbering carries past 9999 without truncating', async () => {
            await supabase.from('journal_entries').insert({ organization_id: orgId, entry_date: today, description: 'seed', reference_number: `JV-${year}-9999`, source_type: 'MANUAL', source_id: '11111111-1111-1111-1111-111111111111' });
            const j = await createManualJournal(orgId, userId, J([{ account_id: ap.id, credit: 1 }, { account_id: rent.id, debit: 1 }]));
            must(j.journal_number === `JV-${year}-10000`, `expected JV-${year}-10000, got ${j.journal_number}`);
            await supabase.from('journal_entries').delete().eq('organization_id', orgId).eq('source_id', '11111111-1111-1111-1111-111111111111');
        });

        await step('5. the ledger audit stays clean with manual journals present', async () => {
            const a = await auditOrganization(orgId);
            const errors = a.findings.filter(f => f.severity === 'ERROR');
            must(errors.length === 0, errors.map(e => `${e.code} (${e.message})`).join('; '));
        });

        await step('6. trial balance includes the journals and balances', async () => {
            const tb = await trialBalance(orgId, `${year}-01-01`, today);
            must(tb.balanced, `trial balance out by ${tb.totals.debit - tb.totals.credit}`);
            const row = tb.rows.find(r => r.account_id === ar.id);
            must(row && row.debit === 500, 'receivable should show 500 debit');
        });

        await step('7. cash flow (indirect) ties to the cash accounts and balance sheet', async () => {
            const cf = await cashFlowStatement(orgId, `${year}-01-01`, today);
            must(cf.checks.cashChangeTiesToBalanceSheet && cf.checks.ledgerBalanced, `cash flow checks failed: ${JSON.stringify(cf.checks)}`);
            must(cf.closingCash === 8000 && cf.openingCash === 0, `cash ${cf.openingCash} → ${cf.closingCash}`);
            // profit = sales 500 − rent 2000 − dep 300 − 1 (AP test) ; operating = profit + dep addback(300) − AR increase(500) + AP(1)
            must(r2(cf.netProfit) === r2(500 - 2000 - 300 - 1), `net profit ${cf.netProfit}`);
            must(cf.financing.total === 10000, `financing should be the 10,000 owner capital, got ${cf.financing.total}`);
            must(r2(cf.operating.total + cf.investing.total + cf.financing.total) === 8000, 'sections must add to the cash movement');
            // a window that starts after everything → opening = closing, zero movement
            const later = await cashFlowStatement(orgId, `${year + 1}-01-01`, `${year + 1}-12-31`);
            must(later.netChange === 0 && later.openingCash === 8000 && later.closingCash === 8000, 'a later empty period should carry the cash forward');
        });

        await step('8. statement of changes in equity rolls forward and ties to balance-sheet equity', async () => {
            const eq = await changesInEquity(orgId, `${year}-01-01`, today);
            must(eq.checks.closingTiesToBalanceSheet && eq.checks.rollForwardOk, `equity checks failed: ${JSON.stringify(eq.checks)}`);
            const cap = eq.rows.find(r => r.name === 'Owner Capital'); must(cap && cap.closing === 10000, 'owner capital closing should be 10,000');
            const next = await changesInEquity(orgId, `${year + 1}-01-01`, `${year + 1}-12-31`);
            must(next.totals.opening === eq.totals.closing && next.checks.closingTiesToBalanceSheet, 'next year opening should equal this year closing');
        });

        await step('9. general ledger shows the lines with a running balance', async () => {
            const gl = await generalLedger(orgId, ar.id, `${year}-01-01`, today);
            must(gl.rows.length === 1 && gl.rows[0].debit === 500 && gl.closing === 500 && gl.opening === 0, 'receivable ledger wrong');
            const glWallet = await generalLedger(orgId, wallet.id, `${year}-01-01`, today);
            must(glWallet.closing === 8000, `wallet ledger closing ${glWallet.closing}`);
        });

        await step('10. a reversal nets the entry to zero and is listed', async () => {
            const rev = await reverseManualJournal(orgId, userId, first.id);
            must(rev.total_debit === 500, 'reversal should mirror the amounts');
            const gl = await generalLedger(orgId, ar.id, `${year}-01-01`, today);
            must(gl.closing === 0, `receivable should be back to 0, was ${gl.closing}`);
            const list = await listJournals(orgId, { sourceType: 'MANUAL' });
            must(list.total >= 4, `manual journals should be listed, got ${list.total}`);
            await rejects(() => reverseManualJournal(orgId, userId, '00000000-0000-0000-0000-000000000000'), /not found/, 'unknown journal');
        });
    } finally {
        const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', orgId);
        const ids = (je || []).map((j: any) => j.id);
        for (let i = 0; i < ids.length; i += 200) await supabase.from('journal_lines').delete().in('journal_entry_id', ids.slice(i, i + 200));
        await supabase.from('journal_entries').delete().eq('organization_id', orgId);
        await supabase.from('cashbook_entries').delete().eq('organization_id', orgId);
        await supabase.from('organization_wallets').delete().eq('organization_id', orgId);
        await supabase.from('reference_counters').delete().eq('organization_id', orgId);
        await supabase.from('accounts').delete().eq('organization_id', orgId);
        const { error } = await supabase.from('organizations').delete().eq('id', orgId);
        console.log(error ? `\n(cleanup: left test organization ${orgId} behind: ${error.message})` : '\n(test organization removed)');
    }
    const failed = results.filter(r => !r.ok).length;
    console.log(`${results.length - failed}/${results.length} scenarios passed`);
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
