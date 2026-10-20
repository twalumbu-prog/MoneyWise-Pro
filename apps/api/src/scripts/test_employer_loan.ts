/**
 * Employer salary-advance / staff-loan flow for a MoneyWise personal account — end to end through the real code, on throwaway
 * organizations. Lenco is not involved (the transfer itself is covered by test_moneywise_pay.ts); this checks that the request
 * is filed with the employer, that the money arriving is booked as a LIABILITY in the personal books, and that every recovery
 * (payroll deduction or admin acknowledgement) works that liability off without touching the wallet balance.
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { createRequisition } from '../controllers/requisition.controller';
import { moneyWisePayService } from '../services/moneyWisePay.service';
import { employerLoanLedger } from '../services/employerLoanLedger.service';

const results: boolean[] = [];
const must = (c: any, m: string) => { if (!c) throw new Error(m); };
async function step(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push(true); console.log('PASS ', name); } catch (e: any) { results.push(false); console.log('FAIL ', name, '—', e.message); }
}
const mockRes = () => { const r: any = { code: 200, body: null }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };
const r2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
    const stamp = Date.now();
    const STEPHEN = '215d63dc-8f4a-4993-a6a5-100ad44b4c1d';
    const mk = async (name: string, personal: boolean) => {
        const { data, error } = await supabase.from('organizations').insert({
            name: `ZZ Loan ${name} ${stamp}`, slug: `zz-loan-${name}-${stamp}`, is_personal: personal, lenco_subaccount_id: crypto.randomUUID(), lenco_secret_key: `zz-${name}-${stamp}`, payment_test_mode: false,
        }).select('id').single();
        if (!data) throw new Error(`org: ${error?.message}`);
        return (data as any).id as string;
    };
    const personal = await mk('personal', true);
    const employer = await mk('employer', false);
    const stranger = await mk('stranger', false);
    for (const org of [personal, employer]) {
        await supabase.from('organization_wallets').insert({ organization_id: org, name: 'Main Wallet', is_main: true });
        await supabase.from('accounts').insert({ organization_id: org, code: 'QB-1150040000', name: 'MoneyWise Wallet', type: 'ASSET', subtype: 'Bank' });
    }
    const { error: memErr } = await supabase.from('user_organizations').insert({ user_id: STEPHEN, organization_id: employer, role: 'REQUESTOR', status: 'ACTIVE', employee_id: `ZZ-${stamp}` });
    if (memErr) throw new Error(`membership: ${memErr.message}`);

    let reqId = '';
    const ref = `MWPAY-${stamp.toString(36).toUpperCase()}`.slice(0, 20);
    const file = (body: any, activeOrg = personal) => createRequisition({ user: { id: STEPHEN, organization_id: activeOrg, role: 'ADMIN' }, body }, mockRes() as any);

    const walletBalance = async () => {
        const { data } = await supabase.from('cashbook_entries').select('debit, credit').eq('organization_id', personal).eq('account_type', 'MONEYWISE_WALLET');
        return r2((data || []).reduce((s: number, r: any) => s + Number(r.debit) - Number(r.credit), 0));
    };
    const accountBalances = async () => {
        const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', personal);
        const ids = (je || []).map((j: any) => j.id);
        const { data: lines } = (ids.length ? await (supabase.from('journal_lines') as any).select('account_id, debit, credit, accounts(name, type)').in('journal_entry_id', ids) : { data: [] }) as { data: any[] };
        const by: Record<string, number> = {};
        for (const l of (lines || []) as any[]) by[l.accounts?.name] = r2((by[l.accounts?.name] || 0) + Number(l.debit) - Number(l.credit));
        return by;
    };

    try {
        await step('1. the request is filed in the EMPLOYER\'s organization, to be paid into the personal account', async () => {
            const res: any = mockRes();
            await createRequisition({ user: { id: STEPHEN, organization_id: personal, role: 'ADMIN' }, body: {
                description: 'ADVANCE: Test - Salary Advance', department: 'HR', type: 'ADVANCE', estimated_total: 100, staff_name: 'Test', loan_amount: 100,
                target_organization_id: employer, payment_method: 'BANK', recipient_account: 'tampered', recipient_bank_code: 'zanaco',
            } }, res);
            must(res.code === 201, `status ${res.code}: ${JSON.stringify(res.body)}`);
            const r = res.body;
            reqId = r.id;
            must(r.organization_id === employer, 'must belong to the employer org');
            must(r.status === 'DRAFT', `employer approval needed, got ${r.status}`);
            must(r.payment_method === 'MONEYWISE_PAY' && r.recipient_account === personal && r.recipient_bank_code === 'MONEYWISE', 'payout destination must come from the server, not the form');
            must(String(r.employee_id).startsWith('ZZ-'), 'employee id should come from the membership');
        });

        await step('2. it is refused for non-members, for non-loan types, and from a business account', async () => {
            const a: any = mockRes(); await createRequisition({ user: { id: STEPHEN, organization_id: personal, role: 'ADMIN' }, body: { description: 'x', type: 'ADVANCE', estimated_total: 50, target_organization_id: stranger } }, a);
            must(a.code === 403, `non-member: ${a.code}`);
            const b: any = mockRes(); await createRequisition({ user: { id: STEPHEN, organization_id: personal, role: 'ADMIN' }, body: { description: 'x', type: 'EXPENSE', estimated_total: 50, target_organization_id: employer } }, b);
            must(b.code === 400, `expense type: ${b.code}`);
            const c: any = mockRes(); await createRequisition({ user: { id: STEPHEN, organization_id: stranger, role: 'ADMIN' }, body: { description: 'x', type: 'ADVANCE', estimated_total: 50, target_organization_id: employer } }, c);
            must(c.code === 403, `business account: ${c.code}`);
        });

        await step('3. money arriving is booked as a LIABILITY (Dr wallet / Cr Employer Loans Payable), once', async () => {
            await supabase.from('requisitions').update({ status: 'RECEIVED' }).eq('id', reqId);
            await supabase.from('disbursements').insert({ requisition_id: reqId, cashier_id: STEPHEN, total_prepared: 100, payment_method: 'MONEYWISE_PAY', organization_id: employer, external_reference: ref, recipient_account: personal });
            await moneyWisePayService.remember(ref, { recipientOrgId: personal, senderName: 'ZZ Employer', amount: 100 });
            await moneyWisePayService.creditRecipient(reqId);
            await moneyWisePayService.creditRecipient(reqId);
            const { data: rows } = await supabase.from('cashbook_entries').select('account_id, status, description').eq('organization_id', personal).eq('external_reference', ref);
            must((rows || []).length === 1, `expected one entry, got ${(rows || []).length}`);
            must(String(rows![0].description).startsWith('Salary advance from'), `description: ${rows![0].description}`);
            must(await walletBalance() === 100, 'wallet should hold K100');
            const b = await accountBalances();
            must(b['Employer Loans & Advances Payable'] === -100, `liability should be a K100 credit: ${JSON.stringify(b)}`);
            must(b['MoneyWise Wallet'] === 100, `wallet asset should be K100: ${JSON.stringify(b)}`);
            must(!('Suspense' in b), `nothing should land in Suspense: ${JSON.stringify(b)}`);
        });

        await step('4. a recovery works the liability off; the wallet balance is unchanged; income reflects salary withheld', async () => {
            const r = await employerLoanLedger.recordManualRecovery({ requisitionId: reqId, organizationId: employer, userId: STEPHEN, amount: 40, note: 'cash repayment' });
            must(r.outstanding === 60 && !r.settled, `outstanding ${r.outstanding}`);
            must(await walletBalance() === 100, `wallet must stay K100, is ${await walletBalance()}`);
            const b = await accountBalances();
            must(b['Employer Loans & Advances Payable'] === -60, `liability should be K60: ${JSON.stringify(b)}`);
            must(b['Salary Income'] === -40, `salary income should be K40: ${JSON.stringify(b)}`);
            must(b['MoneyWise Wallet'] === 100, `wallet asset K100: ${JSON.stringify(b)}`);
        });

        await step('5. re-delivering the same recovery never double-books', async () => {
            const { data: rec } = await supabase.from('loan_manual_recoveries').select('id').eq('requisition_id', reqId);
            const again = await employerLoanLedger.bookLoanRepayment({ requisitionId: reqId, amount: 40, key: `manual-${rec![0].id}` });
            must(again === false, 'should report nothing new');
            must((await accountBalances())['Employer Loans & Advances Payable'] === -60, 'liability changed on replay');
        });

        await step('6. over-recovery is refused; the final recovery settles the loan and clears the liability', async () => {
            let refused = false;
            try { await employerLoanLedger.recordManualRecovery({ requisitionId: reqId, organizationId: employer, userId: STEPHEN, amount: 61 }); } catch { refused = true; }
            must(refused, 'recovering more than is owed must be refused');
            const r = await employerLoanLedger.recordManualRecovery({ requisitionId: reqId, organizationId: employer, userId: STEPHEN, amount: 60 });
            must(r.settled && r.outstanding === 0, 'should be settled');
            const { data: req } = await supabase.from('requisitions').select('status').eq('id', reqId).single();
            must((req as any).status === 'SETTLED', `status ${(req as any).status}`);
            const b = await accountBalances();
            must(!b['Employer Loans & Advances Payable'], `liability should be zero: ${JSON.stringify(b)}`);
            must(b['Salary Income'] === -100, `salary income K100: ${JSON.stringify(b)}`);
            must(await walletBalance() === 100, 'wallet unchanged at K100');
            let again = false;
            try { await employerLoanLedger.recordManualRecovery({ requisitionId: reqId, organizationId: employer, userId: STEPHEN, amount: 1 }); } catch { again = true; }
            must(again, 'a settled loan accepts no more recoveries');
        });

        await step('7. another organization cannot record a recovery on this loan', async () => {
            let refused = false;
            try { await employerLoanLedger.recordManualRecovery({ requisitionId: reqId, organizationId: stranger, userId: STEPHEN, amount: 1 }); } catch { refused = true; }
            must(refused, 'cross-tenant recovery must be refused');
        });
    } finally {
        for (const org of [personal, employer, stranger]) {
            const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', org);
            const ids = (je || []).map((j: any) => j.id);
            for (let i = 0; i < ids.length; i += 100) await supabase.from('journal_lines').delete().in('journal_entry_id', ids.slice(i, i + 100));
            await supabase.from('journal_entries').delete().eq('organization_id', org);
            await supabase.from('cashbook_entries').delete().eq('organization_id', org);
        }
        const { data: reqs } = await supabase.from('requisitions').select('id').in('organization_id', [personal, employer, stranger]);
        for (const r of reqs || []) {
            await supabase.from('requisition_messages').delete().eq('requisition_id', (r as any).id);
            await supabase.from('line_items').delete().eq('requisition_id', (r as any).id);
            await supabase.from('disbursements').delete().eq('requisition_id', (r as any).id);
            await supabase.from('requisitions').delete().eq('id', (r as any).id);
        }
        await supabase.from('app_settings').delete().like('key', `mwpay:${ref}%`);
        await supabase.from('user_organizations').delete().eq('organization_id', employer);
        for (const org of [personal, employer, stranger]) {
            await supabase.from('organization_wallets').delete().eq('organization_id', org);
            await supabase.from('accounts').delete().eq('organization_id', org);
            await supabase.from('organizations').delete().eq('id', org);
        }
        console.log('\n(test organizations removed)');
    }
    const bad = results.filter((r) => !r).length;
    console.log(`${results.length - bad}/${results.length} passed`);
    process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
