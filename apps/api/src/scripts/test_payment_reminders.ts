/**
 * Reminders to customers who owe a business money. The rules and the message are pure; the rest runs against the live database with throwaway
 * businesses (removed at the end) and a stand-in for WhatsApp, so nobody is messaged. The database part needs migration
 * 20261119140000 (it says so and stops if the table isn't there yet). Run: npx tsx src/scripts/test_payment_reminders.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { cleanSettings, reminderDecision, reminderMessage, lusakaDate, getSettings, saveSettings, runCustomerPaymentReminders, remindNow, DEFAULT_SETTINGS } from '../services/paymentReminders.service';
import { InvoiceError } from '../services/customerInvoice.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const rejects = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e: any) { return e; } };
const DAY = 24 * 3600 * 1000;

(async () => {
    // ── settings
    check('reminders are OFF by default, every 7 days, at most 3', JSON.stringify(DEFAULT_SETTINGS) === '{"enabled":false,"repeat_every_days":7,"max_reminders":3}');
    check('settings are pulled into range (2 to 30 days, 1 to 6 reminders)', cleanSettings({ enabled: true, repeat_every_days: 0, max_reminders: 99 }).repeat_every_days === 2 && cleanSettings({ repeat_every_days: 500 }).repeat_every_days === 30 && cleanSettings({ max_reminders: 99 }).max_reminders === 6 && cleanSettings({ max_reminders: 0 }).max_reminders === 1);
    check('enabled is only true when it is exactly true', cleanSettings({ enabled: 'yes' }).enabled === false && cleanSettings({ enabled: true }).enabled === true);
    check('a missing field keeps what was there', cleanSettings({ enabled: true }, { enabled: false, repeat_every_days: 10, max_reminders: 2 }).repeat_every_days === 10);

    // ── the rules
    const on = { enabled: true, repeat_every_days: 7, max_reminders: 3 };
    const now = new Date('2026-11-19T07:00:00Z'); // 09:00 in Lusaka, 19 Nov
    const inv = (o: Record<string, unknown> = {}) => ({ status: 'OPEN', total: 100, amount_paid: 0, follow_up_date: '2026-11-18', customer_phone: '0977123456', customer_reminder_count: 0, customer_last_reminder_at: null, ...o }) as any;
    const why = (s: any, i: any, n = now) => reminderDecision(s, i, n).why;
    check('an unpaid invoice that reached its follow-up date is reminded', reminderDecision(on, inv(), now).send && reminderDecision(on, inv(), now).balance === 100);
    check('off: nothing is sent', why({ ...on, enabled: false }, inv()) === 'off');
    check('paid, void: never reminded', why(on, inv({ status: 'PAID' })) === 'not_open' && why(on, inv({ status: 'VOID' })) === 'not_open');
    check('a balance of nothing is not reminded even if still marked open', why(on, inv({ amount_paid: 100 })) === 'paid');
    check('a part-paid invoice is reminded for what is LEFT', reminderDecision(on, inv({ status: 'PARTIAL', amount_paid: 40 }), now).balance === 60 && reminderDecision(on, inv({ status: 'PARTIAL', amount_paid: 40 }), now).send);
    check('before its follow-up date: not yet', why(on, inv({ follow_up_date: '2026-11-20' })) === 'not_due');
    check('on its follow-up date: yes', why(on, inv({ follow_up_date: '2026-11-19' })) === 'send');
    check('the date is Lusaka\'s: 22:30 UTC on the 19th is already the 20th there', lusakaDate(new Date('2026-11-19T22:30:00Z')) === '2026-11-20' && why(on, inv({ follow_up_date: '2026-11-20' }), new Date('2026-11-19T22:30:00Z')) === 'send');
    check('too soon after the last reminder', why(on, inv({ customer_reminder_count: 1, customer_last_reminder_at: new Date(now.getTime() - 3 * DAY).toISOString() })) === 'too_soon');
    check('after the repeat gap: reminded again', why(on, inv({ customer_reminder_count: 1, customer_last_reminder_at: new Date(now.getTime() - 7 * DAY).toISOString() })) === 'send');
    check('stops at the limit', why(on, inv({ customer_reminder_count: 3, customer_last_reminder_at: new Date(now.getTime() - 30 * DAY).toISOString() })) === 'limit');
    check('no valid mobile number: nothing to send to', why(on, inv({ customer_phone: null })) === 'no_phone' && why(on, inv({ customer_phone: '12345' })) === 'no_phone');

    // ── the message
    const msg = reminderMessage({ business: 'Siba Hair', customer: 'Mary Banda', invoiceNumber: 'INV-0007', balance: 1234.5, dueDate: '2026-11-18', link: 'https://app.test/pl/abc', late: true });
    check('the message says who, what and how much, gives the link, and is kind', /Hello Mary,/.test(msg) && /Siba Hair/.test(msg) && /INV-0007/.test(msg) && /K1,234\.50/.test(msg) && /https:\/\/app\.test\/pl\/abc/.test(msg) && /already paid, thank you/.test(msg), msg);
    check('a customer with no name is still greeted', /Hello there,/.test(reminderMessage({ business: 'X', customer: '', invoiceNumber: 'I', balance: 1, dueDate: '', link: 'l', late: false })));

    // ── the database part
    const probe = await supabase.from('payment_reminder_settings').select('organization_id').limit(1);
    if (probe.error) { console.log(`\nSKIPPED the database part: ${probe.error.message}. Apply supabase/migrations/20261119140000_customer_payment_reminders.sql first.`); console.log(failed ? `\n${failed} FAILED` : '\npure checks passed'); process.exit(failed ? 1 : 0); }

    const tag = randomUUID().slice(0, 6);
    const orgs: string[] = [];
    const mkOrg = async (n: string) => { const { data, error } = await supabase.from('organizations').insert({ name: `ZZ TEST remind ${n} ${tag}`, slug: `zz-test-remind-${n}-${tag}` }).select('id').single(); if (error) throw error; orgs.push(data.id); return data.id as string; };
    const mkInv = async (org: string, n: number, o: Record<string, unknown> = {}) => {
        const { data, error } = await supabase.from('customer_invoices').insert({ organization_id: org, invoice_number: `ZZ-${tag}-${n}`, customer_name: `Customer ${n}`, customer_phone: '0977123456', follow_up_date: '2026-11-18', items: [{ name: 'Goods', quantity: 1, unit_price: 100 }], total: 100, status: 'OPEN', ...o }).select('id').single();
        if (error) throw error; return data!.id as string;
    };
    const stateOf = async (id: string) => (await supabase.from('customer_invoices').select('customer_reminder_count, customer_last_reminder_at').eq('id', id).single()).data as any;
    const sent: { chatId: string | null; text: string }[] = [];
    let sendOk = true;
    const send = async (chatId: string | null, text: string) => { if (!sendOk) return false; sent.push({ chatId, text }); return true; };
    const FRONT = 'https://app.test';
    try {
        const A = await mkOrg('a'); const B = await mkOrg('b');
        check('a business with no settings row gets the defaults (off)', JSON.stringify(await getSettings(A)) === JSON.stringify(DEFAULT_SETTINGS));
        const saved = await saveSettings(A, { enabled: true, repeat_every_days: 1, max_reminders: 50 });
        check('saving pulls the numbers into range and keeps them', saved.enabled && saved.repeat_every_days === 2 && saved.max_reminders === 6 && (await getSettings(A)).max_reminders === 6);
        await saveSettings(A, { repeat_every_days: 7, max_reminders: 3 });
        await saveSettings(B, { enabled: false });

        const due = await mkInv(A, 1);
        const paid = await mkInv(A, 2, { status: 'PAID', amount_paid: 100 });
        const future = await mkInv(A, 3, { follow_up_date: '2026-12-31' });
        const noPhone = await mkInv(A, 4, { customer_phone: null });
        const part = await mkInv(A, 5, { status: 'PARTIAL', amount_paid: 40 });
        const offBiz = await mkInv(B, 6);

        const r1 = await runCustomerPaymentReminders({ now, send, frontend: FRONT });
        const mine = sent.filter((m) => /ZZ-/.test(m.text) || /Customer/.test(m.text));
        check('the run reminds the two that are due, in the business that switched it on', r1.sent >= 2 && (await stateOf(due)).customer_reminder_count === 1 && (await stateOf(part)).customer_reminder_count === 1, JSON.stringify(r1));
        check('paid, not-yet-due, no-number and switched-off businesses are NOT reminded', (await stateOf(paid)).customer_reminder_count === 0 && (await stateOf(future)).customer_reminder_count === 0 && (await stateOf(noPhone)).customer_reminder_count === 0 && (await stateOf(offBiz)).customer_reminder_count === 0);
        const mDue = sent.find((m) => /Customer 1/.test(m.text) || /INV|ZZ-/.test(m.text) && /K100\.00/.test(m.text));
        check('the message goes to the customer\'s WhatsApp number with a pay link for the balance', !!mDue && mDue.chatId === '260977123456@c.us' && /https:\/\/app\.test\//.test(mDue.text) && /K100\.00/.test(mDue.text), JSON.stringify(mDue));
        check('a part-paid invoice is reminded for what is LEFT (K60)', sent.some((m) => /K60\.00/.test(m.text)));

        const before = sent.length;
        await runCustomerPaymentReminders({ now: new Date(now.getTime() + 60_000), send, frontend: FRONT });
        check('running again straight away sends nothing more', sent.length === before);
        await runCustomerPaymentReminders({ now: new Date(now.getTime() + 8 * DAY), send, frontend: FRONT });
        check('a week later it reminds again (count 2)', (await stateOf(due)).customer_reminder_count === 2);
        await runCustomerPaymentReminders({ now: new Date(now.getTime() + 16 * DAY), send, frontend: FRONT });
        await runCustomerPaymentReminders({ now: new Date(now.getTime() + 24 * DAY), send, frontend: FRONT });
        check('it stops at the limit of 3', (await stateOf(due)).customer_reminder_count === 3);

        // A third invoice, still early in its reminders, is paid: it gets no more, however long it waits.
        const paidLater = await mkInv(A, 10);
        await runCustomerPaymentReminders({ now: new Date(now.getTime() + 32 * DAY), send, frontend: FRONT });
        const countWhenPaid = (await stateOf(paidLater)).customer_reminder_count;
        await supabase.from('customer_invoices').update({ status: 'PAID', amount_paid: 100 }).eq('id', paidLater);
        const before2 = sent.length;
        await runCustomerPaymentReminders({ now: new Date(now.getTime() + 40 * DAY), send, frontend: FRONT });
        check('an invoice that gets paid stops being reminded at once', countWhenPaid === 1 && sent.length === before2 && (await stateOf(paidLater)).customer_reminder_count === 1, `count when paid ${countWhenPaid}`);

        // a message that could not be sent is not counted, and is tried again
        const retry = await mkInv(A, 7);
        sendOk = false;
        const rf = await runCustomerPaymentReminders({ now, send, frontend: FRONT });
        check('a message that could not go out is not counted', (await stateOf(retry)).customer_reminder_count === 0 && rf.failed >= 1, JSON.stringify(rf));
        sendOk = true;
        await runCustomerPaymentReminders({ now: new Date(now.getTime() + 60_000), send, frontend: FRONT });
        check('and goes out at the next run', (await stateOf(retry)).customer_reminder_count === 1);

        // the manual button
        const manual = await mkInv(A, 8, { follow_up_date: '2026-12-31' });
        const mr = await remindNow(A, manual, { now, send, frontend: FRONT });
        check('"remind now" works before the follow-up date', mr.sent && (await stateOf(manual)).customer_reminder_count === 1);
        const again = await rejects(() => remindNow(A, manual, { now: new Date(now.getTime() + 3600_000), send, frontend: FRONT }));
        check('but only once a day to the same customer', (again as InvoiceError)?.status === 429);
        check('a paid invoice can\'t be reminded', ((await rejects(() => remindNow(A, paid, { now, send, frontend: FRONT }))) as InvoiceError)?.status === 409);
        check('an invoice with no number can\'t be reminded', ((await rejects(() => remindNow(A, noPhone, { now, send, frontend: FRONT }))) as InvoiceError)?.status === 409);
        check('another business\'s invoice is "not found"', ((await rejects(() => remindNow(B, manual, { now, send, frontend: FRONT }))) as InvoiceError)?.status === 404);
        sendOk = false;
        const lost = await mkInv(A, 9);
        check('if WhatsApp fails the button says so and counts nothing', ((await rejects(() => remindNow(A, lost, { now, send, frontend: FRONT }))) as InvoiceError)?.status === 502 && (await stateOf(lost)).customer_reminder_count === 0);
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        if (orgs.length) {
            await supabase.from('payment_links').delete().in('organization_id', orgs);
            await supabase.from('customer_invoices').delete().in('organization_id', orgs);
            await supabase.from('payment_reminder_settings').delete().in('organization_id', orgs);
            const { error: delErr } = await supabase.from('organizations').delete().in('id', orgs);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST remind % ${tag}`);
            console.log(`cleanup: ${count ?? 0} test businesses left${delErr ? ` (${delErr.message.slice(0, 90)})` : ''}`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
