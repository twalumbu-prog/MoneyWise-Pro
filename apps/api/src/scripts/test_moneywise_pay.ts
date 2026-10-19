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
            must(r.status === 'successful' && r.fee === 0.12, `unexpected result ${JSON.stringify(r)}`);
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
        await supabase.from('disbursements').delete().eq('requisition_id', reqId);
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
