/**
 * Debt tracking: tag a transaction as a loan, repayment or advance, and see the debt, the ledger and the company's mirror move together.
 * REAL service code against the live database, with a throwaway personal workspace and a throwaway company. Run: npx tsx src/scripts/test_debts.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import * as debts from '../services/debts.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const err = async (fn: () => Promise<unknown>) => { try { await fn(); return ''; } catch (e: any) { return String(e?.message ?? e); } };

(async () => {
    const tag = randomUUID().slice(0, 6);
    let personal = '', company = '', other = '', userId = '';
    const added: string[] = [];
    try {
        const mk = async (name: string, isPersonal: boolean) => { const { data, error } = await supabase.from('organizations').insert({ name: `ZZ TEST ${name} ${tag}`, slug: `zz-test-${name}-${tag}`, is_personal: isPersonal }).select('id').single(); if (error) throw error; return data.id as string; };
        personal = await mk('workspace', true); company = await mk('company', false); other = await mk('stranger', false);
        const { data: u } = await supabase.from('users').select('id').limit(1).single(); userId = u!.id;
        for (const o of [personal, company]) { const { error } = await supabase.from('user_organizations').insert({ user_id: userId, organization_id: o, role: 'ADMIN', status: 'ACTIVE' }); if (error) throw error; added.push(o); }

        const entry = async (org: string, debit: number, credit: number, description: string) => {
            const { data, error } = await supabase.from('cashbook_entries').insert({ organization_id: org, date: new Date().toISOString(), description, debit, credit, entry_type: debit > 0 ? 'INFLOW' : 'EXPENSE', status: 'UNACCOUNTED', account_type: 'CASH', balance_after: 0, created_by: userId }).select('id').single();
            if (error) throw error; return data.id as string;
        };
        const gl = async (org: string) => {
            const { data } = await supabase.rpc('report_account_balances', { p_org: org, p_start: '2000-01-01', p_end: '2100-01-01' });
            const by = (code: string) => { const a = (data ?? []).find((r: any) => r.code === code); return a ? Math.round((Number(a.cumulative_debit) - Number(a.cumulative_credit)) * 100) / 100 : 0; };
            return { owed: by('DEBTS-OWED'), receivable: by('DEBTS-OWED-TO-ME') };
        };

        // ── tags fit the direction of the money
        check('money in offers the "in" tags only', debts.tagsFor({ debit: 100, credit: 0 }).every((t) => t.flow === 'IN') && debts.tagsFor({ debit: 100, credit: 0 }).some((t) => t.key === 'LOAN_RECEIVED'));
        check('money out offers the "out" tags only', debts.tagsFor({ debit: 0, credit: 100 }).every((t) => t.flow === 'OUT') && debts.tagsFor({ debit: 0, credit: 100 }).some((t) => t.key === 'REPAID'));

        // ── a loan I received, then repaid in part
        const loanIn = await entry(personal, 500, 0, 'Mary lent me money');
        const d1: any = await debts.tagEntry(personal, userId, { entryId: loanIn, tag: 'LOAN_RECEIVED', counterpartyName: 'Mary' });
        check('a loan received starts a debt I owe Mary for K500', d1.debt.side === 'OWE' && d1.debt.name === 'Mary' && d1.debt.balance === 500, JSON.stringify(d1.debt));
        check('it leaves income: the transaction points at the debt account', (await supabase.from('cashbook_entries').select('account_id, debt_tag').eq('id', loanIn).single()).data?.debt_tag === 'LOAN_RECEIVED');
        let g = await gl(personal);
        check('the ledger shows K500 owed (a credit on Debts I owe)', g.owed === -500, JSON.stringify(g));
        const rep = await entry(personal, 0, 200, 'Paid Mary back');
        const d2: any = await debts.tagEntry(personal, userId, { entryId: rep, tag: 'REPAID', counterpartyName: '  mary ' });
        check('a repayment finds the same debt (names match ignoring case and spaces) and lowers it to K300', d2.debt.id === d1.debt.id && d2.debt.balance === 300, JSON.stringify(d2.debt));
        g = await gl(personal);
        check('the ledger follows: K300 owed', g.owed === -300, JSON.stringify(g));
        const o1 = await debts.overview(personal);
        check('the page lists it under what I owe, with the total', o1.owe.length === 1 && o1.owe[0].balance === 300 && o1.totals.owe === 300 && o1.totals.net === -300, JSON.stringify(o1.totals));

        // ── rules
        check('"loan received" on money that went out is refused', (await err(() => debts.tagEntry(personal, userId, { entryId: rep, tag: 'LOAN_RECEIVED', counterpartyName: 'Mary' }))).includes('came in'));
        check('a debt needs a person or company', (await err(async () => debts.tagEntry(personal, userId, { entryId: await entry(personal, 10, 0, 'x'), tag: 'LOAN_RECEIVED' }))).includes('who'));
        check('a repayment can’t be put on a debt owed to me', (await err(async () => {
            const lg = await entry(personal, 0, 50, 'lent'); const dd: any = await debts.tagEntry(personal, userId, { entryId: lg, tag: 'LOAN_GIVEN', counterpartyName: 'Peter' });
            await debts.tagEntry(personal, userId, { entryId: rep, tag: 'REPAID', debtId: dd.debt.id });
        })).includes('belongs with'));
        check('debt tracking is for personal accounts only', (await err(async () => debts.tagEntry(company, userId, { entryId: await entry(company, 10, 0, 'x'), tag: 'LOAN_RECEIVED', counterpartyName: 'Mary' }))).includes('personal'));
        check('a company I do not belong to can’t be picked', (await err(async () => debts.tagEntry(personal, userId, { entryId: await entry(personal, 0, 10, 'x'), tag: 'ADVANCE_GIVEN', counterpartyOrgId: other }))).includes('belong'));
        check('another workspace can’t tag my transaction', (await err(() => debts.tagEntry(company, userId, { entryId: rep, tag: 'REPAID', counterpartyName: 'Mary' }))).length > 0);

        // ── paying for the company, and being reimbursed
        const spend = await entry(personal, 0, 639, 'Supabase paid by me');
        const adv: any = await debts.tagEntry(personal, userId, { entryId: spend, tag: 'ADVANCE_GIVEN', counterpartyOrgId: company });
        check('an advance to a company starts a debt owed to me, with the company named', adv.debt.side === 'OWED' && adv.debt.type === 'COMPANY' && adv.debt.orgId === company && adv.debt.balance === 639, JSON.stringify(adv.debt));
        g = await gl(personal);
        check('the ledger shows K639 more owed to me (a debit on Money owed to me), on top of the K50 lent to Peter', g.receivable === 689, JSON.stringify(g));
        const mirror = (await debts.overview(company)).mirror;
        check('the company sees the other side: it owes the member K639', mirror.length === 1 && mirror[0].side === 'OWE' && mirror[0].balance === 639 && /workspace/i.test(mirror[0].name), JSON.stringify(mirror));
        const stranger = (await debts.overview(other)).mirror;
        check('a company that isn’t named sees nothing', stranger.length === 0);
        const reimb = await entry(personal, 639, 0, 'Reimbursement from the company');
        const set: any = await debts.tagEntry(personal, userId, { entryId: reimb, tag: 'REIMBURSEMENT_RECEIVED', debtId: adv.debt.id });
        check('the reimbursement settles the debt to zero (it is not income)', set.debt.balance === 0, JSON.stringify(set.debt));
        g = await gl(personal);
        check('the ledger drops back to just the K50 lent to Peter, and the company’s mirror is gone', g.receivable === 50 && (await debts.overview(company)).mirror.length === 0, JSON.stringify(g));
        const o2 = await debts.overview(personal);
        check('a settled debt moves to the settled list', o2.settled.some((d: any) => d.id === adv.debt.id) && !o2.owed.some((d: any) => d.id === adv.debt.id));

        // ── a debt that began before the books did (an opening balance)
        const srcId = randomUUID();
        const op: any = await debts.recordOpening(personal, userId, { side: 'OWE', counterpartyName: 'Old Lender', amount: 250, asOf: '2026-09-01', note: 'Started earlier', source: 'TEST', sourceId: srcId });
        check('an opening balance starts a debt for that amount with no transaction behind it', op.debt.side === 'OWE' && op.debt.balance === 250 && op.entries.length === 1 && op.entries[0].label === 'Opening balance', JSON.stringify(op.debt));
        g = await gl(personal);
        check('the ledger shows it as owed (K300 earlier plus K250)', g.owed === -550, JSON.stringify(g));
        const jl = (await supabase.from('journal_entries').select('id').eq('organization_id', personal).eq('source_type', 'OPENING')).data ?? [];
        check('it is one balanced posting against Opening balance equity', jl.length === 1);
        const again: any = await debts.recordOpening(personal, userId, { side: 'OWE', counterpartyName: 'Old Lender', amount: 250, source: 'TEST', sourceId: srcId });
        check('importing the same one again changes nothing', again.repeated === true && again.debt.balance === 250 && (await gl(personal)).owed === -550);
        const op2: any = await debts.recordOpening(personal, userId, { side: 'OWE', counterpartyName: 'old lender', amount: 50 });
        check('a second opening balance for the same person adds to the same debt', op2.debt.id === op.debt.id && op2.debt.balance === 300);
        check('an opening balance can’t be recorded on a business workspace', (await err(() => debts.recordOpening(company, userId, { side: 'OWE', counterpartyName: 'X', amount: 10 }))).includes('personal'));
        check('an amount is needed', (await err(() => debts.recordOpening(personal, userId, { side: 'OWE', counterpartyName: 'X', amount: 0 }))).includes('amount'));
        await debts.removeOpening(personal, op2.entries.find((e: any) => e.description === 'Opening balance')?.id ?? `open:${(await supabase.from('debt_opening_balances').select('id').eq('debt_id', op.debt.id).is('source_id', null).single()).data!.id}`);
        check('removing one takes it off the balance and out of the ledger', (await debts.detail(personal, op.debt.id)).debt.balance === 250 && (await gl(personal)).owed === -550);

        // ── taking a tag off
        await debts.untagEntry(personal, rep);
        const back = (await debts.detail(personal, d1.debt.id)).debt;
        check('removing the repayment tag puts the debt back to K500 and the transaction back to uncategorised', back.balance === 500 && (await supabase.from('cashbook_entries').select('status, debt_id').eq('id', rep).single()).data?.debt_id === null);
        check('detail lists the tagged transactions', (await debts.detail(personal, d1.debt.id)).entries.length === 1);
        const cp = await debts.counterparties(userId, personal);
        check('the picker offers the company I belong to and the people used', cp.companies.some((c) => c.id === company) && !cp.companies.some((c) => c.id === other) && cp.people.some((p) => p.name === 'Mary'), JSON.stringify({ companies: cp.companies.length, people: cp.people.length }));
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        for (const o of [personal, company, other].filter(Boolean)) {
            const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', o);
            const ids = (je ?? []).map((j: any) => j.id);
            if (ids.length) await supabase.from('journal_entries').delete().in('id', ids);
            await supabase.from('cashbook_entries').delete().eq('organization_id', o);
            await supabase.from('debt_opening_balances').delete().eq('organization_id', o);
            await supabase.from('debts').delete().eq('organization_id', o);
            await supabase.from('user_organizations').delete().eq('organization_id', o);
            await supabase.from('accounts').delete().eq('organization_id', o);
            await supabase.from('organizations').delete().eq('id', o);
        }
        const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `%${tag}`);
        console.log(`cleanup: ${count ?? 0} test workspaces left`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
