/**
 * The Assistant's personal-account tools (personal.tools.ts), through the real code on throwaway organizations.
 * Lenco is stubbed and nothing here sends money: money tools are checked up to their approval card only.
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { getTool } from '../services/agent/registry';
import { isProposal } from '../services/agent/types';
import { isWidgetResult } from '../services/agent/tools/viz.tools';
import { LencoService } from '../services/lenco.service';

const results: boolean[] = [];
const must = (c: any, m: string) => { if (!c) throw new Error(m); };
async function step(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push(true); console.log('PASS ', name); } catch (e: any) { results.push(false); console.log('FAIL ', name, '—', e.message); }
}
const refusal = async (p: Promise<any>) => { try { await p; return ''; } catch (e: any) { return String(e.message); } };

async function main() {
    const stamp = Date.now();
    const STEPHEN = '215d63dc-8f4a-4993-a6a5-100ad44b4c1d';
    const today = new Date().toISOString().split('T')[0];
    const mkOrg = async (tag: string, personal: boolean) => {
        const { data, error } = await supabase.from('organizations').insert({
            name: `ZZ Agent ${tag} ${stamp}`, slug: `zz-agent-${tag}-${stamp}`, is_personal: personal, lenco_secret_key: `test-key-${tag}-${stamp}`,
        }).select('id').single();
        if (error) throw new Error(error.message);
        return (data as any).id as string;
    };
    const orgId = await mkOrg('personal', true);
    const bizId = await mkOrg('business', false);
    const { data: ws } = await supabase.from('organization_wallets').insert([
        { organization_id: orgId, name: 'Main Wallet', is_main: true }, { organization_id: orgId, name: 'Rent', is_main: false },
    ]).select('id, name');
    const main = ws!.find((w: any) => w.name === 'Main Wallet')!.id;
    await supabase.from('cashbook_entries').insert({
        organization_id: orgId, entry_type: 'INFLOW', description: 'Opening', debit: 300, credit: 0, date: today,
        account_type: 'MONEYWISE_WALLET', wallet_id: main, balance_after: 300, status: 'COMPLETED', created_by: STEPHEN,
    });
    await supabase.from('accounts').insert({ organization_id: orgId, code: 'TST-GROC', name: 'Groceries', type: 'EXPENSE', is_active: true });
    const ctx: any = { organizationId: orgId, userId: STEPHEN, role: 'ADMIN', today };

    const L: any = LencoService;
    const orig = { resolveMobileMoney: L.resolveMobileMoney };
    L.resolveMobileMoney = async (phone: string) => ({ accountName: 'TEST PERSON', accountNumber: phone });

    try {
        await step('all the personal tools are registered; money out is owner-only', async () => {
            for (const n of ['get_wallets', 'get_pay_link', 'list_savings', 'get_budget_status', 'list_investments', 'find_recipient', 'get_my_settings',
                'create_wallet', 'create_external_account', 'set_budgets', 'update_my_preferences', 'create_savings_pot',
                'transfer_between_wallets', 'add_to_savings', 'withdraw_from_savings', 'send_money', 'invest']) must(getTool(n), `${n} missing`);
            must(JSON.stringify(getTool('send_money')!.allowedRoles) === '["ADMIN"]' && JSON.stringify(getTool('invest')!.allowedRoles) === '["ADMIN"]', 'send/invest must be ADMIN only');
            must(getTool('get_wallets')!.effect === 'read' && getTool('send_money')!.effect === 'write', 'effects wrong');
        });
        await step('get_wallets reports each MoneyWise wallet and the total', async () => {
            const r: any = await getTool('get_wallets')!.handler(ctx, {});
            must(r.moneywise_total === 300 && r.moneywise_wallets.length === 2, JSON.stringify(r));
            must(r.moneywise_wallets.find((w: any) => w.main).balance === 300, 'main balance');
        });
        await step('get_pay_link returns a QR widget with the pay URL', async () => {
            const r: any = await getTool('get_pay_link')!.handler(ctx, {});
            must(isWidgetResult(r) && r.widget.type === 'qr' && /\/pay\/[^/]+$/.test(r.widget.spec.value), JSON.stringify(r));
        });
        await step('send_money: verified recipient, fee, strong auth — and nothing written before approval', async () => {
            const p: any = await getTool('send_money')!.handler(ctx, { recipientType: 'mobile_money', recipient: '0971234567', amount: 100, reason: 'Groceries money' });
            must(isProposal(p) && p.strongAuth === true, 'must be a strong-auth proposal');
            const text = JSON.stringify(p.preview);
            must(text.includes('TEST PERSON') && text.includes('AIRTEL 0971234567') && text.includes('K8.50'), text);
            const { data } = await supabase.from('requisitions').select('id').eq('organization_id', orgId);
            must((data || []).length === 0, 'no requisition may exist before approval');
        });
        await step('send_money refuses: no reason, too little money (fee included), under K5, bad number', async () => {
            const tool = getTool('send_money')!;
            must((await refusal(tool.handler(ctx, { recipientType: 'mobile_money', recipient: '0971234567', amount: 50, reason: '' }))).includes('What is the payment for'), 'reason');
            must((await refusal(tool.handler(ctx, { recipientType: 'mobile_money', recipient: '0971234567', amount: 295, reason: 'Rent' }))).includes('including the fee'), 'balance+fee');
            must((await refusal(tool.handler(ctx, { recipientType: 'mobile_money', recipient: '0971234567', amount: 3, reason: 'Tip' }))).includes('start at K5'), 'min');
            must((await refusal(tool.handler(ctx, { recipientType: 'mobile_money', recipient: '12345', amount: 50, reason: 'Tip' }))).includes("isn't a Zambian"), 'number');
        });
        await step('send_money is refused in a business account (requisitions there)', async () => {
            const m = await refusal(getTool('send_money')!.handler({ ...ctx, organizationId: bizId }, { recipientType: 'mobile_money', recipient: '0971234567', amount: 50, reason: 'x' }));
            must(m.includes('personal accounts') && m.includes('create_requisition'), m);
        });
        await step('send_money to an unknown MoneyWise user is refused, not guessed', async () => {
            const m = await refusal(getTool('send_money')!.handler(ctx, { recipientType: 'moneywise', recipient: `nobody-${stamp}@example.invalid`, amount: 10, reason: 'Lunch' }));
            must(m.includes('No MoneyWise account matches'), m);
        });
        await step('transfer_between_wallets: card for own wallets; refuses same wallet and overdraft', async () => {
            const tool = getTool('transfer_between_wallets')!;
            const p: any = await tool.handler(ctx, { to: 'rent', amount: 120 });
            must(isProposal(p) && !p.strongAuth && p.summary.includes('Main Wallet to Rent'), JSON.stringify(p));
            must((await refusal(tool.handler(ctx, { from: 'Rent', to: 'Rent', amount: 1 }))).includes('two different'), 'same');
            must((await refusal(tool.handler(ctx, { to: 'Rent', amount: 301 }))).includes('only has'), 'overdraft');
            must((await refusal(tool.handler(ctx, { to: 'Holiday', amount: 1 }))).includes('No wallet to move to called'), 'unknown');
        });
        await step('create_wallet refuses a duplicate name', async () => {
            must((await refusal(getTool('create_wallet')!.handler(ctx, { name: 'rent' }))).includes('already a wallet'), 'dup');
            must(isProposal(await getTool('create_wallet')!.handler(ctx, { name: 'Holiday' })), 'new');
        });
        await step('set_budgets books this month\'s budget and get_budget_status reads it back', async () => {
            const tool = getTool('set_budgets')!;
            must((await refusal(tool.handler(ctx, { budgets: [{ categoryCode: 'NOPE', amount: 10 }] }))).includes('not an expense category'), 'unknown code');
            const args = { budgets: [{ categoryCode: 'TST-GROC', amount: 1500 }] };
            must(isProposal(await tool.handler(ctx, args)), 'proposal');
            await tool.execute!(ctx, args);
            const s: any = await getTool('get_budget_status')!.handler(ctx, {});
            const row = s.budgets.find((b: any) => b.category === 'Groceries');
            must(row && row.budget === 1500 && row.remaining === 1500, JSON.stringify(s));
        });
        await step('update_my_preferences shows the change on a card (not applied here)', async () => {
            const p: any = await getTool('update_my_preferences')!.handler(ctx, { notificationChannel: 'APP', salaryDestination: 'PERSONAL_WALLET' });
            must(isProposal(p) && JSON.stringify(p.preview).includes('App only') && JSON.stringify(p.preview).includes('MoneyWise personal account'), JSON.stringify(p));
            must((await refusal(getTool('update_my_preferences')!.handler(ctx, {}))).includes('Nothing to change'), 'empty');
        });
        await step('invest refuses a company that does not exist', async () => {
            const m = await refusal(getTool('invest')!.handler(ctx, { company: `Nope ${stamp}`, amount: 10 }));
            must(m.includes('No investment company called'), m);
        });
    } finally {
        L.resolveMobileMoney = orig.resolveMobileMoney;
        for (const id of [orgId, bizId]) {
            await supabase.from('budgets').delete().eq('organization_id', id);
            await supabase.from('cashbook_entries').delete().eq('organization_id', id);
            await supabase.from('organization_wallets').delete().eq('organization_id', id);
            await supabase.from('accounts').delete().eq('organization_id', id);
            await supabase.from('organizations').delete().eq('id', id);
        }
        console.log('\n(test organizations removed)');
    }
    const bad = results.filter((r) => !r).length;
    console.log(`${results.length - bad}/${results.length} passed`);
    process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
