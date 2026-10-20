/**
 * MoneyWise Pay test: a MoneyWise-to-MoneyWise payment must move real money at Lenco, and the recipient must be credited
 * only after Lenco confirms. Uses two throwaway organizations and SIMULATED Lenco responses (no real money is moved).
 *
 *   npx tsc -p . --outDir /tmp/apibuild --noEmit false
 *   NODE_PATH=$PWD/node_modules node /tmp/apibuild/scripts/test_moneywise_pay.js
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { LencoService } from '../services/lenco.service';
import { moneyWisePayService } from '../services/moneyWisePay.service';

const results: { name: string; ok: boolean }[] = [];
const must = (c: any, msg: string) => { if (!c) throw new Error(msg); };
async function step(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push({ name, ok: true }); console.log(`PASS  ${name}`); }
    catch (e: any) { results.push({ name, ok: false }); console.log(`FAIL  ${name} — ${e?.message}`); }
}

const L: any = LencoService;
const saved = { bal: L.getAccountBalance, det: L.getAccountDetails, st: L.getTransferStatus, tx: L.transferToLencoMerchant };
const uuid = () => crypto.randomUUID();

async function main() {
    const stamp = Date.now();
    const SRC_ACCT = uuid(), DST_ACCT = uuid();
    const mkOrg = async (name: string, acct: string) => {
        const { data, error } = await supabase.from('organizations').insert({ name: `ZZ MWPay ${name} ${stamp}`, slug: `zz-mwpay-${name}-${stamp}`, lenco_subaccount_id: acct, lenco_secret_key: `test-key-${name}-${stamp}`, payment_test_mode: false }).select('id').single();
        if (!data) throw new Error(`could not create test org: ${error?.message}`);
        return (data as any).id as string;
    };
    const sender = await mkOrg('sender', SRC_ACCT);
    const recipient = await mkOrg('recipient', DST_ACCT);
    const { data: user } = await supabase.from('users').select('id').limit(1).maybeSingle();
    const userId = (user as any).id;
    await supabase.from('accounts').insert([
        { organization_id: recipient, code: 'QB-1150040000', name: 'MoneyWise Wallet', type: 'ASSET', subtype: 'Bank' },
        { organization_id: sender, code: 'QB-1150040000', name: 'MoneyWise Wallet', type: 'ASSET', subtype: 'Bank' },
    ]);
    await supabase.from('organization_wallets').insert([
        { organization_id: recipient, name: 'Main Wallet', is_main: true }, { organization_id: sender, name: 'Main Wallet', is_main: true },
    ]);
    const { data: req } = await supabase.from('requisitions').insert({ organization_id: sender, requestor_id: userId, status: 'DISBURSED', description: 'MWPay test', estimated_total: 100, type: 'EXPENSE' }).select('id').single();
    const reqId = (req as any).id as string;

    let transferCalls: any[] = [];
    const stub = (o: { balance?: number; till?: string | null; failOnTransfer?: boolean; status?: string }) => {
        transferCalls = [];
        L.getAccountBalance = async () => ({ availableBalance: o.balance ?? 1000 });
        L.getAccountDetails = async () => ({ details: { tillNumber: o.till === undefined ? '9876543' : o.till } });
        L.getTransferStatus = async () => (transferCalls.length ? { status: o.status ?? 'successful', fee: '0.12', completedAt: new Date().toISOString() } : null);
        L.transferToLencoMerchant = async (payload: any, source: string) => {
            transferCalls.push({ payload, source });
            if (o.failOnTransfer) throw new Error('Lenco rejected the transfer');
            return { status: o.status ?? 'successful', reference: payload.reference, fee: '0.12' };
        };
    };

    try {
        await step('1. asks Lenco to move the money from the sender\'s account to the recipient\'s till', async () => {
            stub({});
            const r = await moneyWisePayService.sendOnUs({ senderOrgId: sender, recipientOrgId: recipient, amount: 100, requisitionId: reqId });
            // Lenco reports a K0.12 "fee" on the on-us transfer but never takes it from the sender, so none may be booked.
            must(r.status === 'successful' && r.fee === 0, `unexpected result ${JSON.stringify(r)}`);
            must(transferCalls.length === 1, `Lenco should be called exactly once, was ${transferCalls.length}`);
            must(transferCalls[0].source === SRC_ACCT, 'must debit the SENDER\'s Lenco account');
            must(transferCalls[0].payload.tillNumber === '9876543', 'must credit the RECIPIENT\'s till');
            must(transferCalls[0].payload.amount === 100 && String(transferCalls[0].payload.reference).startsWith('MWPAY-'), 'amount/reference wrong');
        });

        await step('2. refuses (and moves nothing) when the sender\'s real Lenco balance is too low', async () => {
            stub({ balance: 40 });
            let threw = false;
            try { await moneyWisePayService.sendOnUs({ senderOrgId: sender, recipientOrgId: recipient, amount: 100, requisitionId: reqId }); } catch { threw = true; }
            must(threw, 'should have thrown'); must(transferCalls.length === 0, 'no transfer may be attempted');
        });

        await step('3. a rejected transfer throws, so nothing is booked and the requisition can be retried', async () => {
            stub({ failOnTransfer: true });
            let threw = false;
            try { await moneyWisePayService.sendOnUs({ senderOrgId: sender, recipientOrgId: recipient, amount: 100, requisitionId: reqId }); } catch { threw = true; }
            must(threw, 'should have thrown');
            const { data: rows } = await supabase.from('cashbook_entries').select('id').eq('organization_id', recipient);
            must((rows || []).length === 0, 'the recipient must not be credited for a failed transfer');
        });

        await step('4. a recipient wallet that cannot receive (no till) is refused before any money moves', async () => {
            stub({ till: null });
            let threw = false;
            try { await moneyWisePayService.sendOnUs({ senderOrgId: sender, recipientOrgId: recipient, amount: 100, requisitionId: reqId }); } catch { threw = true; }
            must(threw && transferCalls.length === 0, 'should refuse without calling Lenco');
        });

        await step('5. a slow transfer is reported as pending (not as success)', async () => {
            stub({ status: 'pending' });
            L.getTransferStatus = async () => (transferCalls.length ? { status: 'pending' } : null);
            const r = await moneyWisePayService.sendOnUs({ senderOrgId: sender, recipientOrgId: recipient, amount: 100, requisitionId: reqId });
            must(r.status === 'pending', `expected pending, got ${r.status}`);
        }).catch(() => undefined);

        await step('6. recipient is credited ONLY after confirmation, exactly once, tagged with the transfer reference', async () => {
            const ref = `MWPAY-${reqId.slice(0, 8)}`;
            await supabase.from('disbursements').insert({ requisition_id: reqId, cashier_id: userId, total_prepared: 100, payment_method: 'MONEYWISE_PAY', organization_id: sender, external_reference: ref, recipient_account: recipient });
            await moneyWisePayService.creditRecipient(reqId);
            const { data: before } = await supabase.from('cashbook_entries').select('id').eq('organization_id', recipient);
            must((before || []).length === 0, 'nothing is credited before the payment is registered as pending-confirmation');
            await moneyWisePayService.remember(ref, { recipientOrgId: recipient, senderName: 'Test Sender', amount: 100 });
            await moneyWisePayService.creditRecipient(reqId);
            await moneyWisePayService.creditRecipient(reqId);   // a second confirmation check must not double-credit
            const { data: rows } = await supabase.from('cashbook_entries').select('debit, external_reference, status').eq('organization_id', recipient);
            must((rows || []).length === 1, `recipient should have exactly one inflow, has ${(rows || []).length}`);
            must(Number(rows![0].debit) === 100 && rows![0].external_reference === ref && rows![0].status === 'COMPLETED', 'inflow wrong');
        });

        await step('7. finalising an on-us payment books exactly the amount — Lenco\'s reported fee is ignored (2026-10-19 K30,000 → K30,005 bug)', async () => {
            const { cashbookService } = require('../services/cashbook.service');
            await cashbookService.finalizeWalletDisbursementLedger(reqId, 5);   // Lenco-reported fee of K5 must be ignored
            const { data: rows } = await supabase.from('cashbook_entries').select('credit, entry_type, external_reference').eq('organization_id', sender).eq('requisition_id', reqId).eq('entry_type', 'DISBURSEMENT');
            must((rows || []).length === 1, `expected one DISBURSEMENT row, got ${(rows || []).length}`);
            must(Number(rows![0].credit) === 100, `sender outflow must be exactly K100, was K${rows![0].credit}`);
            const { data: r2 } = await supabase.from('requisitions').select('estimated_total').eq('id', reqId).single();
            must(Number((r2 as any).estimated_total) === 100, `requisition total must stay K100, was K${(r2 as any).estimated_total}`);
        });

        await step('8. payroll-style: each employee has their own reference, is credited once, and no other row is re-tagged', async () => {
            stub({});
            const ref = `MWPAY-P-${reqId.slice(0, 8)}-ITEM0001`;
            const r = await moneyWisePayService.sendOnUs({ senderOrgId: sender, recipientOrgId: recipient, amount: 250, requisitionId: reqId, reference: ref });
            must(r.reference === ref && transferCalls[0].payload.reference === ref, 'per-item reference not used');
            const { data: before } = await supabase.from('cashbook_entries').select('id').eq('organization_id', recipient).eq('external_reference', ref);
            must((before || []).length === 0, 'credited before confirmation was recorded');
            await moneyWisePayService.remember(ref, { recipientOrgId: recipient, senderName: 'Employer Ltd', amount: 250 });
            await moneyWisePayService.creditByReference(ref);
            await moneyWisePayService.creditByReference(ref);
            const { data: rows } = await supabase.from('cashbook_entries').select('debit, description').eq('organization_id', recipient).eq('external_reference', ref);
            must((rows || []).length === 1 && Number(rows![0].debit) === 250 && String(rows![0].description).includes('Employer Ltd'), 'recipient should have exactly one K250 inflow');
        });
    } finally {
        L.getAccountBalance = saved.bal; L.getAccountDetails = saved.det; L.getTransferStatus = saved.st; L.transferToLencoMerchant = saved.tx;
        for (const org of [sender, recipient]) {
            const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', org);
            const ids = (je || []).map((j: any) => j.id);
            for (let i = 0; i < ids.length; i += 100) await supabase.from('journal_lines').delete().in('journal_entry_id', ids.slice(i, i + 100));
            await supabase.from('journal_entries').delete().eq('organization_id', org);
            await supabase.from('cashbook_entries').delete().eq('organization_id', org);
        }
        await supabase.from('app_settings').delete().like('key', `mwpay:MWPAY-${reqId.slice(0, 8)}%`);
        await supabase.from('app_settings').delete().like('key', `mwpay:MWPAY-P-${reqId.slice(0, 8)}%`);
        await supabase.from('disbursements').delete().eq('requisition_id', reqId);
        await supabase.from('line_items').delete().eq('requisition_id', reqId);
        await supabase.from('requisition_messages').delete().eq('requisition_id', reqId);
        await supabase.from('requisitions').delete().eq('id', reqId);
        for (const org of [sender, recipient]) {
            await supabase.from('organization_wallets').delete().eq('organization_id', org);
            await supabase.from('accounts').delete().eq('organization_id', org);
            await supabase.from('organizations').delete().eq('id', org);
        }
        console.log('\n(test organizations removed)');
    }
    const failed = results.filter(r => !r.ok).length;
    console.log(`${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
