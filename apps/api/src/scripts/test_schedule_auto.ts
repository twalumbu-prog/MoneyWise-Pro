/**
 * Schedules that add themselves: from an email (a repeating bill) and as suggestions from payment history. REAL service code against the live
 * database with a throwaway workspace; no notifications are sent. Run: npx tsx src/scripts/test_schedule_auto.ts
 */
process.env.SCHEDULE_AUTO_NOTIFY = 'off';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import * as auto from '../services/scheduleAuto.service';
import { dollarRate } from '../services/lipila.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

(async () => {
    const tag = randomUUID().slice(0, 6); let org = '';
    try {
        // ── the payee name and the rhythm
        check('"Vercel (USD 20.00)" and "VERCEL INC." are the same payee', auto.payeeKey('Vercel (USD 20.00)') === auto.payeeKey('VERCEL INC.') && auto.payeeKey('Vercel (USD 20.00)') === 'vercel', auto.payeeKey('VERCEL INC.'));
        check('amounts, numbers and noise words are dropped from a payee', auto.payeeKey('Anthropic Claude (USD 20.00)') === 'anthropic claude' && auto.payeeKey('ZESCO Payment K450.00') === 'zesco');
        check('payments a month apart are a monthly rhythm', auto.rhythmOf(['2026-06-08', '2026-07-08', '2026-08-08', '2026-09-08']) === 'MONTHLY');
        check('weekly and every-three-months are recognised', auto.rhythmOf(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22']) === 'WEEKLY' && auto.rhythmOf(['2026-01-05', '2026-04-05', '2026-07-05', '2026-10-05']) === 'QUARTERLY');
        check('irregular payments are no rhythm', auto.rhythmOf(['2026-06-01', '2026-06-20', '2026-09-15', '2026-09-18']) === null && auto.rhythmOf(['2026-06-01', '2026-07-01']) === null);
        check('a past date steps forward to the next one still ahead', auto.nextDueFrom('2026-01-08', 'MONTHLY', '2026-11-21') === '2026-12-08');

        const { data: o, error } = await supabase.from('organizations').insert({ name: `ZZ TEST schedules ${tag}`, slug: `zz-test-sched-${tag}` }).select('id').single();
        if (error) throw error; org = o.id;
        const { data: u } = await supabase.from('users').select('id').limit(1).single();
        await supabase.from('user_organizations').insert({ user_id: u!.id, organization_id: org, role: 'ADMIN', status: 'ACTIVE' });

        const { data: conn, error: ce } = await supabase.from('email_connections').insert({ organization_id: org, connected_by: u!.id, provider: 'GMAIL', email_address: `zz-${tag}@example.test`, status: 'ACTIVE', refresh_token_enc: 'x', auth_mode: 'DIRECT' }).select('id').single();
        if (ce) throw ce;
        const mail = async (f: Record<string, unknown>) => {
            const { data, error: e } = await supabase.from('inbound_emails').insert({ organization_id: org, connection_id: conn!.id, provider_message_id: `zz-${randomUUID()}`, subject: 'Your invoice', received_at: new Date().toISOString(), prefilter_passed: true,
                intent: 'INVOICE', direction: 'OUT', intent_amount: 429, intent_currency: 'ZMW', counterparty: 'Supabase', intent_confidence: 0.9, intent_cadence: 'MONTHLY', intent_due_date: day(10), classified_at: new Date().toISOString(), ...f }).select('id').single();
            if (e) throw e; return data.id as string;
        };
        const items = async () => ((await supabase.from('scheduled_items').select('*').eq('organization_id', org)).data ?? []) as any[];

        // ── from an email
        const e1 = await mail({});
        const id1 = await auto.scheduleFromEmail(e1, org);
        const list = await items();
        check('a repeating bill email is added straight to Schedules', !!id1 && list.length === 1 && list[0].title === 'Supabase' && Number(list[0].amount) === 429 && list[0].cadence === 'MONTHLY' && list[0].source === 'EMAIL' && list[0].next_due_date === day(10), JSON.stringify(list[0]));
        check('it is marked as coming from the email, with its payee, and the email points back at it', list[0].source_email_id === e1 && list[0].payee_key === 'supabase' && (await supabase.from('inbound_emails').select('scheduled_item_id').eq('id', e1).single()).data?.scheduled_item_id === id1);
        check('the same bill again is not added twice', (await auto.scheduleFromEmail(await mail({ counterparty: 'SUPABASE INC.' }), org)) === null && (await items()).length === 1);
        check('a one-off purchase (no repeat) adds nothing', (await auto.scheduleFromEmail(await mail({ counterparty: 'Hardware Shop', intent_cadence: null }), org)) === null);
        check('money coming in adds nothing', (await auto.scheduleFromEmail(await mail({ counterparty: 'A Customer', direction: 'IN' }), org)) === null);
        check('an unsure reading adds nothing', (await auto.scheduleFromEmail(await mail({ counterparty: 'Maybe Co', intent_confidence: 0.4 }), org)) === null);
        const idY = await auto.scheduleFromEmail(await mail({ counterparty: 'Domain Name Co', intent_cadence: 'YEARLY', intent_due_date: day(200) }), org);
        const itY = (await items()).find((x) => x.id === idY);
        check('a yearly bill (a domain, an annual plan) is added with its due date', !!itY && itY.cadence === 'YEARLY' && itY.next_due_date === day(200), JSON.stringify({ c: itY?.cadence, n: itY?.next_due_date }));
        check('a yearly bill steps forward a year at a time', auto.nextDueFrom('2025-03-01', 'YEARLY', '2026-11-21') === '2027-03-01');
        const idR = await auto.scheduleFromEmail(await mail({ intent: 'RECEIPT', counterparty: 'Cloud Host', intent_due_date: null, received_at: new Date(Date.now() - 20 * 86_400_000).toISOString() }), org);
        const itR = (await items()).find((x) => x.id === idR);
        check('a receipt without a due date steps forward from its date', !!itR && itR.next_due_date >= day(0) && itR.next_due_date <= day(31) && itR.category === 'SUBSCRIPTIONS', JSON.stringify({ n: itR?.next_due_date, c: itR?.category }));
        const rate = await dollarRate().catch(() => 0);
        if (rate > 0) {
            const idU = await auto.scheduleFromEmail(await mail({ counterparty: 'Vercel', intent_amount: 20, intent_currency: 'USD' }), org);
            const it = (await items()).find((x) => x.id === idU);
            check('a dollar bill is kept in dollars with the kwacha amount at today’s rate', !!it && it.currency === 'USD' && Number(it.foreign_amount) === 20 && Math.abs(Number(it.amount) - 20 * rate) < 0.02, JSON.stringify({ a: it?.amount, f: it?.foreign_amount, rate }));
        }
        check('an email in another workspace can’t be scheduled from here', (await auto.scheduleFromEmail(e1, randomUUID())) === null);

        // ── a bill whose emails arrive on a rhythm is a repeating bill even if no email says so
        for (const off of [-95, -65, -35, -5]) await mail({ counterparty: 'Hosting Co Ltd', intent_cadence: null, intent_due_date: null, intent_amount: 150, received_at: new Date(Date.now() + off * 86_400_000).toISOString() });
        for (const off of [-40, -39, -38]) await mail({ counterparty: 'Alarm Notices', intent_cadence: null, intent_due_date: null, received_at: new Date(Date.now() + off * 86_400_000).toISOString() });
        const nPatterns = await auto.scheduleFromEmailPatterns(org);
        const hosting = (await items()).find((x) => x.payee_key === 'hosting');
        check('four bills a month apart add a monthly item, with its typical amount and next date', nPatterns >= 1 && !!hosting && hosting.cadence === 'MONTHLY' && Number(hosting.amount) === 150 && hosting.next_due_date >= day(0) && hosting.source === 'EMAIL', JSON.stringify({ n: nPatterns, c: hosting?.cadence, a: hosting?.amount, d: hosting?.next_due_date }));
        check('notices on three days in a row are not a rhythm', !(await items()).some((x) => x.payee_key === 'alarm notices'));
        check('running it again adds nothing more', (await auto.scheduleFromEmailPatterns(org)) === 0);

        // ── suggestions from history
        const pay = async (description: string, credit: number, offset: number) => { const { error: pe } = await supabase.from('cashbook_entries').insert({ organization_id: org, date: new Date(Date.now() + offset * 86_400_000).toISOString(), description, debit: 0, credit, entry_type: 'EXPENSE', status: 'COMPLETED', account_type: 'CASH', balance_after: 0 }); if (pe) throw pe; };
        for (const [i, amt] of [418, 429, 424, 421].entries()) await pay('Anthropic Claude (USD 20.00)', amt, -(30 * (3 - i)) - 2);
        for (const off of [-95, -50, -12]) await pay('Corner Shop', 80 + (off % 7), off);
        for (const off of [-60, -30, -1]) await pay('Reimbursement from Blue Opus: Fuel', 100, off);
        for (const amt of [900, 20, 400, 55]) await pay('Random Vendor', amt, -(amt % 60) - 5);
        const sugg = await auto.suggestions(org);
        const claude = sugg.find((s) => s.key === 'anthropic claude');
        check('a payee paid monthly for similar amounts is suggested', !!claude && claude.cadence === 'MONTHLY' && claude.seen === 4 && claude.currency === 'USD' && claude.foreignAmount === 20, JSON.stringify(claude));
        check('its next due date is ahead of today', !!claude && claude.nextDue >= day(0), claude?.nextDue);
        check('irregular payments, reimbursements and different amounts are not suggested', !sugg.some((s) => ['corner shop', 'random vendor', 'fuel'].includes(s.key)), JSON.stringify(sugg.map((s) => s.key)));
        check('a payee that is already scheduled is not suggested', !sugg.some((s) => s.key === 'supabase'));
        const added: any = await auto.acceptSuggestion(org, u!.id, 'anthropic claude');
        check('accepting a suggestion adds it, marked as from history', added.source === 'HISTORY' && added.payee_key === 'anthropic claude' && added.cadence === 'MONTHLY' && added.currency === 'USD', JSON.stringify({ s: added.source, c: added.cadence }));
        check('after accepting, it is no longer suggested', !(await auto.suggestions(org)).some((s) => s.key === 'anthropic claude'));
        await auto.dismissSuggestion(org, 'corner shop');
        check('a dismissed suggestion stays dismissed', !(await auto.suggestions(org)).some((s) => s.key === 'corner shop'));
        check('accepting something that is not suggested is refused', await auto.acceptSuggestion(org, u!.id, 'nothing here').then(() => false, () => true));
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        if (org) {
            await supabase.from('inbound_emails').delete().eq('organization_id', org);
            await supabase.from('email_connections').delete().eq('organization_id', org);
            await supabase.from('scheduled_item_runs').delete().eq('organization_id', org);
            await supabase.from('scheduled_items').delete().eq('organization_id', org);
            await supabase.from('cashbook_entries').delete().eq('organization_id', org);
            await supabase.from('app_settings').delete().eq('key', `schedule_dismissed:${org}`);
            await supabase.from('user_organizations').delete().eq('organization_id', org);
            await supabase.from('organizations').delete().eq('id', org);
        }
        const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `%${tag}`);
        console.log(`cleanup: ${count ?? 0} test workspaces left`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
