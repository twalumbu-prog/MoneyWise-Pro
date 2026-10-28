/** Post-send summary (services/sendSummary.service.ts) on a throwaway personal organization. */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { getSendSummary } from '../services/sendSummary.service';

const results: boolean[] = [];
const must = (c: any, m: string) => { if (!c) throw new Error(m); };
async function step(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push(true); console.log('PASS ', name); } catch (e: any) { results.push(false); console.log('FAIL ', name, '—', e.message); }
}

async function main() {
    const stamp = Date.now();
    const STEPHEN = '215d63dc-8f4a-4993-a6a5-100ad44b4c1d';
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
    const { data: org } = await supabase.from('organizations').insert({ name: `ZZ Send ${stamp}`, slug: `zz-send-${stamp}`, is_personal: true }).select('id').single();
    const orgId = (org as any).id as string;
    const { data: acc } = await supabase.from('accounts').insert({ organization_id: orgId, code: 'TST-GROC', name: '🛒 Groceries', type: 'EXPENSE', is_active: true }).select('id').single();
    const accId = (acc as any).id as string;
    await supabase.from('budgets').insert({ organization_id: orgId, qb_account_id: accId, qb_account_name: '🛒 Groceries', amount: 1000, period_type: 'MONTHLY', start_date: monthStart, end_date: monthEnd });
    const mkReq = async (items: any[]) => {
        const { data: r } = await supabase.from('requisitions').insert({ organization_id: orgId, requestor_id: STEPHEN, status: 'COMPLETED', description: 'Groceries', estimated_total: 100, type: 'EXPENSE' }).select('id').single();
        const id = (r as any).id as string;
        for (const i of items) await supabase.from('line_items').insert({ requisition_id: id, description: 'Groceries', quantity: 1, unit_price: 100, estimated_amount: 100, ...i });
        return id;
    };
    const created: string[] = [];
    try {
        await step('a categorised payment returns its account, this month\'s spend and the budget left', async () => {
            const id = await mkReq([{ account_id: accId }]); created.push(id);
            const s = await getSendSummary(orgId, STEPHEN, id, 4000);
            must(s.status === 'ready' && s.account?.name === '🛒 Groceries' && s.account.id === accId, JSON.stringify(s));
            must(s.amount === 100, `amount ${s.amount}`);
            must(s.spentAfter !== null && s.spentBefore === Math.max(0, s.spentAfter - 100), `before/after ${s.spentBefore}/${s.spentAfter}`);
            must(s.budget && s.budget.amount === 1000 && s.budget.remaining === 1000 - s.spentAfter! && s.budget.over === false, JSON.stringify(s.budget));
        });
        await step('no categorisation within the wait → pending, nothing invented', async () => {
            const id = await mkReq([]); created.push(id);
            const s = await getSendSummary(orgId, STEPHEN, id, 2500);
            must(s.status === 'pending' && s.account === null && s.budget === null, JSON.stringify(s));
        });
        await step('someone else\'s payment is not readable', async () => {
            let msg = ''; try { await getSendSummary('00000000-0000-0000-0000-000000000000', STEPHEN, created[0], 500); } catch (e: any) { msg = e.message; }
            must(msg === 'Payment not found.', msg);
        });
        await step('a category with no budget returns budget: null', async () => {
            const { data: a2 } = await supabase.from('accounts').insert({ organization_id: orgId, code: 'TST-FUN', name: '🎬 Fun', type: 'EXPENSE', is_active: true }).select('id').single();
            const id = await mkReq([{ account_id: (a2 as any).id }]); created.push(id);
            const s = await getSendSummary(orgId, STEPHEN, id, 4000);
            must(s.status === 'ready' && s.budget === null, JSON.stringify(s));
        });
    } finally {
        for (const id of created) { await supabase.from('line_items').delete().eq('requisition_id', id); await supabase.from('requisition_messages').delete().eq('requisition_id', id); await supabase.from('requisitions').delete().eq('id', id); }
        await supabase.from('budgets').delete().eq('organization_id', orgId);
        await supabase.from('accounts').delete().eq('organization_id', orgId);
        await supabase.from('organizations').delete().eq('id', orgId);
        console.log('\n(test organization removed)');
    }
    const bad = results.filter((r) => !r).length;
    console.log(`${results.length - bad}/${results.length} passed`);
    process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
