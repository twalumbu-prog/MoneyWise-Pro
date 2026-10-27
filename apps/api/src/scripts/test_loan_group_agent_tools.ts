/**
 * The Assistant's loan / salary-advance tools (loans.tools.ts) and group-savings tools (groupSavings.tools.ts), through the real
 * code on throwaway organizations. No money moves: loan requests are only filed, and nothing is paid out.
 */
import 'dotenv/config';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { getTool } from '../services/agent/registry';
import { isProposal } from '../services/agent/types';
import { isWidgetResult } from '../services/agent/tools/viz.tools';

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
    const mk = async (name: string, personal: boolean) => {
        const { data, error } = await supabase.from('organizations').insert({
            name: `ZZ Agent ${name} ${stamp}`, slug: `zz-agent2-${name}-${stamp}`, is_personal: personal, lenco_subaccount_id: crypto.randomUUID(), lenco_secret_key: `zz2-${name}-${stamp}`, payment_test_mode: false,
        }).select('id').single();
        if (!data) throw new Error(`org: ${error?.message}`);
        return (data as any).id as string;
    };
    const personal = await mk('personal', true);
    const employer = await mk('Employer', false);
    const employerName = `ZZ Agent Employer ${stamp}`;
    await supabase.from('organization_wallets').insert({ organization_id: personal, name: 'Main Wallet', is_main: true });
    const { error: memErr } = await supabase.from('user_organizations').insert({ user_id: STEPHEN, organization_id: employer, role: 'REQUESTOR', status: 'ACTIVE', employee_id: `ZZ-${stamp}` });
    if (memErr) throw new Error(`membership: ${memErr.message}`);
    const ctx: any = { organizationId: personal, userId: STEPHEN, role: 'ADMIN', today };

    try {
        await step('the loan and group-savings tools are registered', async () => {
            for (const n of ['list_loan_providers', 'list_my_loans', 'request_loan', 'request_salary_advance',
                'get_group_invite', 'find_people_for_group', 'add_group_member', 'join_group_savings', 'leave_group_savings']) must(getTool(n), `${n} missing`);
        });
        await step('list_loan_providers shows a tappable list: the employer first (with Employer badge), then the outside lenders', async () => {
            const r: any = await getTool('list_loan_providers')!.handler(ctx, { kind: 'loan' });
            must(isWidgetResult(r) && r.widget.type === 'choices', 'expected a choices widget');
            const opts = (r.widget as any).spec.options;
            const idx = opts.findIndex((o: any) => o.label === employerName);
            must(idx >= 0 && opts[idx].badge === 'Employer' && opts[idx].reply.includes(employerName), JSON.stringify(opts.slice(0, 3)));
            must(opts.slice(0, idx).every((o: any) => o.badge === 'Employer'), 'employers come before lenders');
            must(opts.some((o: any) => o.label === 'UniFi Salary Advance' && o.logo === 'unifi'), 'outside lenders listed with logos');
            must(r.ack.includes("don't list them again"), 'ack tells the model not to repeat the list');
        });
        await step('advance providers are employers only', async () => {
            const r: any = await getTool('list_loan_providers')!.handler(ctx, { kind: 'advance' });
            must(isWidgetResult(r) && (r.widget as any).spec.options.every((o: any) => o.badge === 'Employer'), JSON.stringify(r));
        });
        await step('request_loan from the employer: card with interest, monthly and total; PIN-confirmed; nothing filed yet', async () => {
            const p: any = await getTool('request_loan')!.handler(ctx, { provider: employerName, amount: 1000, months: 10 });
            must(isProposal(p) && p.strongAuth === true, 'strong auth');
            const t = JSON.stringify(p.preview);
            must(t.includes('15%') && t.includes('K115.00') && t.includes('K1,150.00'), t);
            must(String(p.warning).includes('debt'), 'debt warning');
            const { data } = await supabase.from('requisitions').select('id').in('organization_id', [personal, employer]);
            must((data || []).length === 0, 'nothing filed before approval');
        });
        await step('request_loan refuses: no provider, unknown provider, too many months', async () => {
            const t = getTool('request_loan')!;
            must((await refusal(t.handler(ctx, { provider: '', amount: 100, months: 3 }))).includes('list_loan_providers'), 'no provider');
            must((await refusal(t.handler(ctx, { provider: 'Acme Lending', amount: 100, months: 3 }))).includes("isn't a provider"), 'unknown');
            must((await refusal(t.handler(ctx, { provider: 'UniFi', product: 'UniFi Salary Advance', amount: 100, months: 24 }))).includes('up to 12 months'), 'max');
            must((await refusal(t.handler(ctx, { provider: 'LOLC Finance', amount: 100, months: 6 }))).includes('Which LOLC Finance product'), 'ambiguous product');
        });
        await step('an outside lender is labelled honestly: recorded only, not sent to them', async () => {
            const p: any = await getTool('request_loan')!.handler(ctx, { provider: 'Bayport', product: 'Bayport Personal Loan', amount: 2000, months: 12 });
            must(String(p.warning).includes("isn't connected to MoneyWise"), p.warning);
        });
        await step('approving files the loan in the EMPLOYER\'s organization, as the app does; list_my_loans shows it', async () => {
            const r: any = await getTool('request_loan')!.execute!(ctx, { provider: employerName, amount: 1000, months: 10, reason: 'School fees' });
            must(r.requested, JSON.stringify(r));
            const { data } = await supabase.from('requisitions').select('organization_id, type, loan_amount, repayment_period, interest_rate, monthly_deduction, requestor_id').eq('organization_id', employer);
            const q: any = (data || [])[0];
            must(q && q.type === 'LOAN' && Number(q.loan_amount) === 1000 && q.repayment_period === 10 && Number(q.interest_rate) === 15 && Number(q.monthly_deduction) === 115 && q.requestor_id === STEPHEN, JSON.stringify(data));
            const mine: any = await getTool('list_my_loans')!.handler(ctx, {});
            must(mine.loans.some((l: any) => l.from === employerName && l.amount === 1000), JSON.stringify(mine.loans.slice(0, 3)));
        });
        await step('request_salary_advance files an ADVANCE with the employer', async () => {
            const p: any = await getTool('request_salary_advance')!.handler(ctx, { employer: employerName, amount: 500 });
            must(isProposal(p) && p.strongAuth, 'card');
            await getTool('request_salary_advance')!.execute!(ctx, { employer: employerName, amount: 500, reason: 'Rent' });
            const { data } = await supabase.from('requisitions').select('type, loan_amount').eq('organization_id', employer).eq('type', 'ADVANCE');
            must((data || []).length === 1 && Number((data as any)[0].loan_amount) === 500, JSON.stringify(data));
        });

        const groupName = `Trip ${stamp % 100000}`;
        await step('create_savings_pot makes GROUP savings (needs a target) and returns the invite link', async () => {
            const t = getTool('create_savings_pot')!;
            must((await refusal(t.handler(ctx, { kind: 'GROUP', name: groupName }))).includes('How much'), 'target required');
            must(isProposal(await t.handler(ctx, { kind: 'GROUP', name: groupName, targetAmount: 3000 })), 'card');
            const r: any = await t.execute!(ctx, { kind: 'GROUP', name: groupName, targetAmount: 3000 });
            must(/\/savings\/join\/[A-Z0-9]{6,}$/.test(r.pot.invite_link), JSON.stringify(r));
        });
        let code = '';
        await step('get_group_invite shows the invite as a QR', async () => {
            const r: any = await getTool('get_group_invite')!.handler(ctx, { group: groupName });
            must(isWidgetResult(r) && r.widget.type === 'qr', JSON.stringify(r));
            code = String((r.widget as any).spec.value).split('/').pop()!;
        });
        await step('find_people_for_group never guesses: no match → offer the invite instead', async () => {
            const r: any = await getTool('find_people_for_group')!.handler(ctx, { group: groupName, query: `zz-nobody-${stamp}` });
            must(!isWidgetResult(r) && r.matches.length === 0 && r.note.includes('get_group_invite'), JSON.stringify(r));
            must((await refusal(getTool('add_group_member')!.handler(ctx, { group: groupName, userId: 'Bob' }))).includes('find_people_for_group'), 'needs an id');
        });
        await step('join_group_savings previews the group from the link; the organiser can\'t leave their own group', async () => {
            const p: any = await getTool('join_group_savings')!.handler(ctx, { code: `https://moneywise.example/savings/join/${code}` });
            must(isProposal(p) && p.summary === `Join ${groupName}`, JSON.stringify(p));
            must((await refusal(getTool('join_group_savings')!.handler(ctx, { code: 'NOPE12' }))).includes("isn't a valid invite"), 'bad code');
            must((await refusal(getTool('leave_group_savings')!.handler(ctx, { group: groupName }))).includes("can't leave"), 'owner leave');
        });
    } finally {
        const orgs = [personal, employer];
        const { data: goals } = await supabase.from('savings_goals').select('id').in('organization_id', orgs);
        for (const g of goals || []) await supabase.from('savings_group_members').delete().eq('goal_id', (g as any).id);
        await supabase.from('savings_goals').delete().in('organization_id', orgs);
        for (const org of orgs) {
            const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', org);
            const ids = (je || []).map((j: any) => j.id);
            if (ids.length) await supabase.from('journal_lines').delete().in('journal_entry_id', ids);
            await supabase.from('journal_entries').delete().eq('organization_id', org);
            await supabase.from('cashbook_entries').delete().eq('organization_id', org);
        }
        const { data: reqs } = await supabase.from('requisitions').select('id').in('organization_id', orgs);
        for (const r of reqs || []) {
            await supabase.from('requisition_messages').delete().eq('requisition_id', (r as any).id);
            await supabase.from('line_items').delete().eq('requisition_id', (r as any).id);
            await supabase.from('requisitions').delete().eq('id', (r as any).id);
        }
        await supabase.from('user_organizations').delete().eq('organization_id', employer);
        for (const org of orgs) {
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
