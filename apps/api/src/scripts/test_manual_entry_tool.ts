/** Assistant "I spent K10 cash on tomatoes" → record_manual_transactions, through the real code on a throwaway organization. */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { getTool } from '../services/agent/registry';
import { isProposal } from '../services/agent/types';

const results: boolean[] = [];
const must = (c: any, m: string) => { if (!c) throw new Error(m); };
async function step(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push(true); console.log('PASS ', name); } catch (e: any) { results.push(false); console.log('FAIL ', name, '—', e.message); }
}

async function main() {
    const stamp = Date.now();
    const STEPHEN = '215d63dc-8f4a-4993-a6a5-100ad44b4c1d';
    const { data: org } = await supabase.from('organizations').insert({ name: `ZZ Manual ${stamp}`, slug: `zz-manual-${stamp}`, is_personal: true }).select('id').single();
    const orgId = (org as any).id as string;
    await supabase.from('accounts').insert([
        { organization_id: orgId, code: 'TST-GROC', name: 'Groceries & Household', type: 'EXPENSE', is_active: true },
        { organization_id: orgId, code: 'TST-GIFT', name: 'Gifts Received', type: 'INCOME', is_active: true },
    ]);
    const ctx = { organizationId: orgId, userId: STEPHEN, role: 'ADMIN', today: new Date().toISOString().split('T')[0] };
    const tool = getTool('record_manual_transactions')!;

    try {
        await step('the tool is registered and offered to a personal account holder', async () => {
            must(tool && tool.effect === 'write' && tool.allowedRoles?.includes('ADMIN'), 'not registered');
        });
        await step('without a category it refuses and hands back a suggestion (nothing written)', async () => {
            let msg = '';
            try { await tool.handler(ctx as any, { transactions: [{ amount: 10, description: 'Tomatoes', account: 'cash' }] }); } catch (e: any) { msg = e.message; }
            must(msg.startsWith('INVALID_ARGUMENTS') && msg.includes('categoryCode'), `got: ${msg}`);
            const { data } = await supabase.from('cashbook_entries').select('id').eq('organization_id', orgId);
            must((data || []).length === 0, 'nothing may be written before approval');
        });
        await step('an unknown account or category is refused with the choices', async () => {
            let a = ''; try { await tool.handler(ctx as any, { transactions: [{ amount: 10, description: 'Tomatoes', account: 'Stanbic', categoryCode: 'TST-GROC' }] }); } catch (e: any) { a = e.message; }
            must(a.includes('no external account called'), `account: ${a}`);
            let c = ''; try { await tool.handler(ctx as any, { transactions: [{ amount: 10, description: 'Tomatoes', account: 'cash', categoryCode: 'TST-GIFT' }] }); } catch (e: any) { c = e.message; }
            must(c.includes('not an active expense account'), `category: ${c}`);
            let f = ''; try { await tool.handler(ctx as any, { transactions: [{ amount: 10, description: 'Tomatoes', account: 'cash', categoryCode: 'TST-GROC', date: '2099-01-01' }] }); } catch (e: any) { f = e.message; }
            must(f.includes('future'), `future: ${f}`);
        });
        let proposalArgs: any;
        await step('the card shows exactly what will be booked: amount, account, date, category', async () => {
            proposalArgs = { transactions: [
                { amount: 10, description: 'Tomatoes', account: 'cash', categoryCode: 'TST-GROC' },
                { direction: 'IN', amount: 500, description: 'From Mum', account: 'Cash', categoryCode: 'TST-GIFT', date: '2026-10-01' },
            ] };
            const p: any = await tool.handler(ctx as any, proposalArgs);
            must(isProposal(p), 'expected a proposal');
            const text = JSON.stringify(p.preview);
            must(text.includes('Tomatoes') && text.includes('Groceries & Household') && text.includes('Cash (new account)') && text.includes('2026-10-01'), text);
            must(String(p.warning).includes('Cash'), 'should warn that a Cash account is created');
        });
        await step('approving books both, against one new Cash account, categorised, with the right balance', async () => {
            const r: any = await tool.execute!(ctx as any, proposalArgs);
            must(r.count === 2, `count ${r.count}`);
            const { data: wallets } = await supabase.from('external_wallets').select('id, name').eq('organization_id', orgId);
            must((wallets || []).length === 1 && wallets![0].name === 'Cash', `wallets: ${JSON.stringify(wallets)}`);
            const { data: rows } = await supabase.from('cashbook_entries').select('debit, credit, account_type, account_id, status, date, description').eq('organization_id', orgId).order('date');
            must((rows || []).length === 2 && rows!.every((x: any) => x.account_type === wallets![0].id && x.status === 'ACCOUNTED' && x.account_id), JSON.stringify(rows));
            const bal = rows!.reduce((s: number, x: any) => s + Number(x.debit) - Number(x.credit), 0);
            must(bal === 490, `cash balance should be K490, is ${bal}`);
            const tomatoes = rows!.find((x: any) => x.description === 'Tomatoes');
            must(tomatoes && Number(tomatoes.credit) === 10 && tomatoes.date === ctx.today, 'tomatoes row wrong');
        });
        await step('the books follow: each entry posts a balanced journal to its category, nothing in Suspense', async () => {
            await new Promise((r) => setTimeout(r, 1500));
            const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', orgId);
            const ids = (je || []).map((j: any) => j.id);
            must(ids.length === 2, `expected 2 journals, got ${ids.length}`);
            const { data: lines } = await (supabase.from('journal_lines') as any).select('debit, credit, accounts(name, type)').in('journal_entry_id', ids);
            const names = (lines || []).map((l: any) => l.accounts?.name);
            must(names.includes('Groceries & Household') && names.includes('Gifts Received'), `lines: ${JSON.stringify(names)}`);
            must(!names.some((n: string) => /suspense/i.test(n || '')), `suspense hit: ${JSON.stringify(names)}`);
            const d = (lines || []).reduce((s: number, l: any) => s + Number(l.debit), 0), c = (lines || []).reduce((s: number, l: any) => s + Number(l.credit), 0);
            must(Math.abs(d - c) < 0.005, `unbalanced ${d} vs ${c}`);
        });
        await step('a second cash purchase reuses the same Cash account', async () => {
            await tool.execute!(ctx as any, { transactions: [{ amount: 25, description: 'Bread', account: 'cash', categoryCode: 'TST-GROC' }] });
            const { data: wallets } = await supabase.from('external_wallets').select('id').eq('organization_id', orgId);
            must((wallets || []).length === 1, 'should not create a second Cash account');
        });
    } finally {
        const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', orgId);
        const ids = (je || []).map((j: any) => j.id);
        if (ids.length) await supabase.from('journal_lines').delete().in('journal_entry_id', ids);
        await supabase.from('journal_entries').delete().eq('organization_id', orgId);
        await supabase.from('cashbook_entries').delete().eq('organization_id', orgId);
        await supabase.from('external_wallets').delete().eq('organization_id', orgId);
        await supabase.from('accounts').delete().eq('organization_id', orgId);
        await supabase.from('organizations').delete().eq('id', orgId);
        console.log('\n(test organization removed)');
    }
    const bad = results.filter((r) => !r).length;
    console.log(`${results.length - bad}/${results.length} passed`);
    process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
