/**
 * Checks booking deposits end to end: the checkout (through the running local API, so the real intent handler is used), what is recorded,
 * the balance and its payment link, cash received, and no-shows. Uses a temporary service and hairdresser at Siba's and removes everything.
 * The cash entry is stubbed (so no real cash is recorded and nobody is notified). Needs the local API running on port 3000.
 * Run: npx tsx src/scripts/test_booking_deposits.ts
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { markPaymentLinkPaid } from '../services/product_routing.service';
import * as salon from '../services/salon.service';

let failed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${JSON.stringify(extra)}`}`); if (!ok) failed++; };
const rejects = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e: any) { return e as any; } };

// ── The pure rules ──
check('options are cleaned: positive, unique, smallest first', JSON.stringify(salon.sanitizeDepositOptions([200, '100', 100, -5, 'x', 0])) === '[100,200]');
check('no usable option means no deposit', salon.sanitizeDepositOptions([]) === null && salon.sanitizeDepositOptions('nope') === null);
check('no request means pay in full', salon.checkDeposit({ price: 350, deposit_options: [100, 200] }, null) === null);
check('an offered deposit is accepted', salon.checkDeposit({ price: 350, deposit_options: [100, 200] }, 200) === 200);
check('a deposit that isn’t offered is refused', (() => { try { salon.checkDeposit({ price: 350, deposit_options: [100, 200] }, 150); return false; } catch (e) { return e instanceof salon.SalonError; } })());
check('a deposit not below the price is refused (it would be the full price)', (() => { try { salon.checkDeposit({ price: 150, deposit_options: [100, 200] }, 200); return false; } catch (e) { return e instanceof salon.SalonError; } })());
check('balance = price - paid; no paid amount recorded means paid in full', salon.balanceOf({ amount: 350, paid_amount: 100 }) === 250 && salon.balanceOf({ amount: 350, paid_amount: null }) === 0 && salon.balanceOf({ amount: 350, paid_amount: 400 }) === 0);

(async () => {
    const ORG = '8f7ee72f-868f-4bcf-9281-4bfc45f3955b', WALLET = 'ebdff6e6-9d03-43ee-b70d-195439bdd6d1', USER = '0cd08494-f960-408d-a373-5e5c00346495';
    const API = 'http://localhost:3000';
    const tag = `TEST-${Date.now()}`;
    const d = new Date(Date.now() + 9 * 86400000); while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
    const date = d.toISOString().slice(0, 10);

    const { data: prod, error: perr } = await supabase.from('products').insert({
        organization_id: ORG, name: `${tag} Braids`, price: 350, product_type: 'SERVICE_APPOINTMENT', is_active: true, duration_minutes: 60, deposit_options: [100, 200],
        appointment_config: { hours: { '2': { start: '09:00', end: '17:00' } }, capacity: 1, timezone: 'Africa/Lusaka', closed_dates: [], duration_minutes: 60, max_advance_days: 60, min_notice_hours: 2, slot_interval_minutes: 60 },
    }).select('id').single();
    if (perr || !prod) throw new Error(`Could not make the test service: ${perr?.message}`);
    const PID = prod.id as string;
    const { data: st } = await supabase.from('salon_staff_profiles').insert({ organization_id: ORG, display_name: `${tag} Stylist`, work_start: '08:00', work_end: '18:00', working_days: [2], is_bookable: true, is_active: true }).select('id').single();
    const STAFF = st!.id as string;
    await supabase.from('salon_staff_services').insert({ organization_id: ORG, staff_profile_id: STAFF, product_id: PID });
    const refs: string[] = [];
    const calls: any[] = [];
    const realLog = (cashbookService as any).logInflow;

    const intent = async (time: string, extra: Record<string, unknown>) => {
        const reference = `${tag}-${refs.length}`; refs.push(reference);
        const r = await fetch(`${API}/lenco/public-wallet-deposit-intent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference, purpose: `Sale: ${tag} Braids`, amount: 1, walletId: WALLET, customerName: tag, customerPhone: '0977000000', items: [{ id: PID, quantity: 1, price: 350, appointment_date: date, appointment_time: time, staff_profile_id: STAFF, ...extra }] }),
        });
        return { status: r.status, body: await r.json().catch(() => ({})), reference };
    };
    const apptOf = async (reference: string) => (await supabase.from('product_appointments').select('*').eq('reference', reference).maybeSingle()).data as any;

    try {
        const pub = await fetch(`${API}/lenco/public-product-appointment-info/${PID}`).then((r) => r.json());
        check('the public page is told the price and the deposits offered', pub.price === 350 && JSON.stringify(pub.deposit_options) === '[100,200]', pub);

        const dep = await intent('10:00', { deposit_amount: 100 });
        check('checkout accepts an offered deposit', dep.status === 200, dep);
        const sale = (await supabase.from('product_sales').select('amount_paid, is_deposit').eq('reference', dep.reference).single()).data as any;
        check('the sale line is the deposit actually paid, flagged as a deposit', Number(sale?.amount_paid) === 100 && sale?.is_deposit === true, sale);
        const a1 = await apptOf(dep.reference);
        check('the booking keeps the full price, with the deposit and what is paid', Number(a1?.amount) === 350 && Number(a1?.paid_amount) === 100 && Number(a1?.deposit_amount) === 100, a1);

        const bad = await intent('11:00', { deposit_amount: 150 });
        check('checkout refuses a deposit the service doesn’t offer', bad.status === 400, bad);
        const none = await supabase.from('product_appointments').select('id').eq('reference', bad.reference);
        check('and records nothing for it', (none.data ?? []).length === 0);

        const full = await intent('11:00', {});
        const a2 = await apptOf(full.reference);
        const fsale = (await supabase.from('product_sales').select('amount_paid, is_deposit').eq('reference', full.reference).single()).data as any;
        check('paying in full records the full price as paid', full.status === 200 && Number(a2?.paid_amount) === 350 && Number(fsale?.amount_paid) === 350 && fsale?.is_deposit === false, { a2, fsale });

        // Payment arrives: confirmed. Then the salon sees paid and balance under the client's name.
        const c1 = (await supabase.rpc('confirm_product_appointment', { p_appointment_id: a1.id })).data;
        const c2 = (await supabase.rpc('confirm_product_appointment', { p_appointment_id: a2.id })).data;
        check('both bookings confirm once paid', c1 === 'CONFIRMED' && c2 === 'CONFIRMED', { c1, c2 });
        const day = (await salon.bookingsForDay(ORG, date)).filter((b) => b.customerName === tag);
        const b1 = day.find((b) => b.id === a1.id), b2 = day.find((b) => b.id === a2.id);
        check('the deposit booking shows K100 paid and K250 due', b1?.paid === 100 && b1?.balance === 250 && b1?.deposit === 100, b1);
        check('the paid-in-full booking shows no balance', b2?.paid === 350 && b2?.balance === 0, b2);

        // The balance link
        const link = await salon.createBalanceLink(ORG, USER, a1.id);
        check('a balance link is made for what is owed (K250)', link.amount === 250 && !link.reused, link);
        const again = await salon.createBalanceLink(ORG, USER, a1.id);
        check('asking again returns the same link', again.token === link.token && again.reused === true);
        const none2 = await rejects(() => salon.createBalanceLink(ORG, USER, a2.id));
        check('nothing to pay on a fully paid booking', none2?.httpStatus === 409, none2?.message);

        // The client pays the link
        const lref = `${tag}-link`;
        await supabase.from('payment_links').update({ reference: lref }).eq('token', link.token);
        const flipped = await markPaymentLinkPaid(ORG, lref);
        const after = (await apptOf(dep.reference));
        check('paying the link settles the booking: paid K350, nothing owed', flipped === true && Number(after.paid_amount) === 350 && salon.balanceOf(after) === 0, after);
        const flippedAgain = await markPaymentLinkPaid(ORG, lref);
        check('the same payment arriving again adds nothing more', flippedAgain === false && Number((await apptOf(dep.reference)).paid_amount) === 350);

        // Cash at the salon (the cash entry is stubbed)
        (cashbookService as any).logInflow = async (...args: any[]) => { calls.push(args); return {}; };
        const dep2 = await intent('13:00', { deposit_amount: 200 });
        const a3 = await apptOf(dep2.reference);
        await supabase.rpc('confirm_product_appointment', { p_appointment_id: a3.id });
        const got = await salon.recordBalanceReceived(ORG, USER, a3.id);
        check('cash received settles the booking and records K150 of cash', got.recorded === 150 && Number((await apptOf(dep2.reference)).paid_amount) === 350 && calls.length === 1 && calls[0][1].amount === 150 && calls[0][1].accountType === 'CASH', { got, calls });
        const twice = await rejects(() => salon.recordBalanceReceived(ORG, USER, a3.id));
        check('it can’t be recorded twice', twice?.httpStatus === 409 && calls.length === 1, twice?.message);

        // If the cash can't be recorded, the booking is put back
        const dep3 = await intent('14:00', { deposit_amount: 100 });
        const a4 = await apptOf(dep3.reference);
        await supabase.rpc('confirm_product_appointment', { p_appointment_id: a4.id });
        (cashbookService as any).logInflow = async () => { throw new Error('books unavailable'); };
        const failedCash = await rejects(() => salon.recordBalanceReceived(ORG, USER, a4.id));
        check('if the cash can’t be written down the booking still owes its balance', failedCash?.httpStatus === 500 && Number((await apptOf(dep3.reference)).paid_amount) === 100, failedCash?.message);
        (cashbookService as any).logInflow = realLog;

        // No-show keeps the deposit
        const before = await rejects(() => salon.markNoShow(ORG, a4.id, () => true, new Date(`${date}T06:00:00Z`)));
        check('a no-show can’t be marked before the appointment time', before?.httpStatus === 409, before?.message);
        const denied = await rejects(() => salon.markNoShow(ORG, a4.id, () => false, new Date(`${date}T16:00:00Z`)));
        check('only managers or the hairdresser can mark a no-show', denied?.httpStatus === 403);
        const ns = await salon.markNoShow(ORG, a4.id, () => true, new Date(`${date}T16:00:00Z`));
        const nrow = await apptOf(dep3.reference);
        check('a no-show keeps the deposit (K100) and is recorded', ns.depositKept === 100 && nrow.status === 'NO_SHOW' && Number(nrow.paid_amount) === 100, { ns, nrow });
        const dayAfter = (await salon.bookingsForDay(ORG, date)).find((b) => b.id === a4.id);
        check('the day view shows it as a no-show with nothing owed', dayAfter?.noShow === true && dayAfter?.balance === 0, dayAfter);
        const slots = (await salon.publicSlots(PID, date, STAFF)).slots.map((s) => s.start);
        check('a no-show frees the time for another client', slots.includes('14:00'), slots);
    } finally {
        (cashbookService as any).logInflow = realLog;
        await supabase.from('payment_links').delete().eq('organization_id', ORG).like('customer_name', 'TEST-%');
        await supabase.from('product_sales').delete().in('reference', refs);
        await supabase.from('product_appointments').delete().eq('product_id', PID);
        await supabase.from('cashbook_entries').delete().eq('organization_id', ORG).in('external_reference', refs);
        await supabase.from('salon_staff_services').delete().eq('staff_profile_id', STAFF);
        await supabase.from('salon_staff_profiles').delete().eq('id', STAFF);
        await supabase.from('products').delete().eq('id', PID);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
