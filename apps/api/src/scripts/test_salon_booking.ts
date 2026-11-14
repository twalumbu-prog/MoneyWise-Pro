/**
 * Checks hairdresser booking: the pure slot engine, then the database rules (clash per hairdresser across services, "any available" moved to a
 * free hairdresser, finishing early frees the time). Uses a temporary second hairdresser and test bookings at Siba's, and removes them.
 * Run: npx tsx src/scripts/test_salon_booking.ts
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { resolveConfig } from '../services/appointment.service';
import * as salon from '../services/salon.service';

let failed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${JSON.stringify(extra)}`}`); if (!ok) failed++; };
const rejects = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e: any) { return e as any; } };

// ── The pure engine ──
const cfg = resolveConfig({ hours: { '1': { start: '09:00', end: '17:00' }, '2': { start: '09:00', end: '17:00' } }, duration_minutes: 60, slot_interval_minutes: 60, capacity: 1, min_notice_hours: 2, max_advance_days: 60, timezone: 'Africa/Lusaka' });
const NOW = new Date('2026-11-10T00:00:00Z');
const MON = '2026-11-16', SUN = '2026-11-15';
const A = { id: 'A', display_name: 'Ann', work_start: '08:00', work_end: '18:00', working_days: [1, 2, 3, 4, 5, 6] };
const B = { id: 'B', display_name: 'Bea', work_start: '12:00', work_end: '18:00', working_days: [1] };
const starts = (s: salon.StaffSlot[]) => s.map((x) => x.start).join(',');

check('one hairdresser, a 2 hour service, shop 9 to 5: seven starts', starts(salon.computeStaffSlots(cfg, 120, MON, [A], {}, NOW)) === '09:00,10:00,11:00,12:00,13:00,14:00,15:00');
check('a booked 10 to 12 removes every start that would overlap it', starts(salon.computeStaffSlots(cfg, 120, MON, [A], { A: [{ s: 600, e: 720 }] }, NOW)) === '12:00,13:00,14:00,15:00');
const two = salon.computeStaffSlots(cfg, 120, MON, [A, B], { A: [{ s: 600, e: 720 }] }, NOW);
check('with two hairdressers, a time one is busy for is still offered if the other is free', !!two.find((s) => s.start === '12:00') && !two.some((s) => s.start === '10:00'), two);
check('a hairdresser’s own working hours limit their times (Bea from 12:00)', salon.computeStaffSlots(cfg, 60, MON, [B], {}, NOW).map((s) => s.start)[0] === '12:00');
check('choosing one hairdresser shows only their times', salon.computeStaffSlots(cfg, 60, MON, [A, B], {}, NOW, 'B').every((s) => s.staffIds.join() === 'B'));
check('a day the hairdresser doesn’t work has no times (Bea only Mondays)', salon.computeStaffSlots(cfg, 60, '2026-11-17', [B], {}, NOW).length === 0);
check('a day the shop is closed has no times (Sunday)', salon.computeStaffSlots(cfg, 60, SUN, [A], {}, NOW).length === 0);
check('a service that ends early frees the rest: 10 to 11 busy, so 11:00 is open again', starts(salon.computeStaffSlots(cfg, 120, MON, [A], { A: [{ s: 600, e: 660 }] }, NOW)).startsWith('09:00') === false && starts(salon.computeStaffSlots(cfg, 120, MON, [A], { A: [{ s: 600, e: 660 }] }, NOW)).includes('11:00'));
check('the service’s own duration is used (150) and falls back to the booking rule', salon.serviceDuration({ duration_minutes: 150 }, cfg) === 150 && salon.serviceDuration({ duration_minutes: null }, cfg) === 60);

// ── The database rules ──
(async () => {
    const ORG = '8f7ee72f-868f-4bcf-9281-4bfc45f3955b';
    const STICKONS = 'f6804b31-acca-4741-86f6-9282f009bd51', CORNROWS = '3f94e266-f766-4ccc-85d7-9e9ab9e8c262';
    const SIBA = '112a4106-c8a1-43f8-957c-9fda2b5d5d68';
    const tag = `TEST-${Date.now()}`;
    // The next Monday that is at least a week away, so notice and range never get in the way.
    const d = new Date(Date.now() + 8 * 86400000); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    const date = d.toISOString().slice(0, 10);

    const { data: tmp, error: terr } = await supabase.from('salon_staff_profiles').insert({ organization_id: ORG, display_name: `${tag} Helper`, work_start: '08:00', work_end: '18:00', working_days: [1, 2, 3, 4, 5, 6], is_bookable: true, is_active: true }).select('id').single();
    if (terr || !tmp) throw new Error(`Could not make the test hairdresser: ${terr?.message}`);
    const HELPER = tmp.id as string;
    await supabase.from('salon_staff_services').insert({ organization_id: ORG, staff_profile_id: HELPER, product_id: STICKONS });
    const made: string[] = [];
    const book = async (product: string, staff: string | null, start: string, end: string, any = false, status = 'PENDING') => {
        const { data, error } = await supabase.from('product_appointments').insert({ organization_id: ORG, product_id: product, reference: `${tag}-${made.length}`, customer_name: tag, customer_phone: '0000000000', appointment_date: date, start_time: start, end_time: end, amount: 1, status, staff_profile_id: staff, staff_any: any }).select('id').single();
        if (error || !data) throw new Error(error?.message);
        made.push(data.id); return data.id as string;
    };
    const confirm = async (id: string) => (await supabase.rpc('confirm_product_appointment', { p_appointment_id: id })).data as string;
    const staffOf = async (id: string) => (await supabase.from('product_appointments').select('staff_profile_id, status').eq('id', id).single()).data as any;

    try {
        const open = await salon.publicSlots(STICKONS, date, 'any');
        check('a staffed service lists its hairdressers (Siba and the helper)', open.staffed && open.staff.length === 2, open.staff);
        check('the real duration is used: Stickons is 60 minutes', open.duration === 60 && open.slots[0]?.end === '10:00', open.slots[0]);
        check('both hairdressers are free at 10:00 before any booking', open.slots.find((s) => s.start === '10:00')?.staffIds.length === 2);

        const a1 = await book(STICKONS, SIBA, '10:00', '11:00');
        check('a paid booking for Siba at 10:00 is confirmed', (await confirm(a1)) === 'CONFIRMED');
        const a2 = await book(STICKONS, SIBA, '10:30', '11:30');
        check('an overlapping booking for the same hairdresser is a conflict', (await confirm(a2)) === 'CONFLICT');
        const a3 = await book(CORNROWS, SIBA, '10:00', '12:00');
        check('a different service for the same hairdresser at the same time is still a conflict', (await confirm(a3)) === 'CONFLICT');
        const a4 = await book(STICKONS, SIBA, '10:00', '11:00', true);
        check('"any available" that lost its first choice is moved to a free hairdresser', (await confirm(a4)) === 'CONFIRMED' && (await staffOf(a4)).staff_profile_id === HELPER, await staffOf(a4));

        const after = await salon.publicSlots(STICKONS, date, 'any');
        check('with both busy at 10:00 nobody is offered for 10:00, but 11:00 is open', !after.slots.some((s) => s.start === '10:00') && after.slots.some((s) => s.start === '11:00'));
        const err = await rejects(() => salon.assignStaff(ORG, STICKONS, date, '10:00', 'any'));
        check('checkout refuses a time that is no longer free', err instanceof salon.SalonError && err.httpStatus === 409, err?.message);
        const pick = await salon.assignStaff(ORG, STICKONS, date, '14:00', 'any');
        check('"any" at a free time picks a hairdresser', !!pick && pick.any === true && [SIBA, HELPER].includes(pick.staffId), pick);
        const named = await salon.assignStaff(ORG, STICKONS, date, '14:00', HELPER);
        check('naming a hairdresser gets that hairdresser', named?.staffId === HELPER && named.any === false, named);
        check('something that isn’t a staffed service keeps the original rules (null)', (await salon.assignStaff(ORG, '00000000-0000-0000-0000-000000000000', date, '09:00', 'any')) === null);
        const longer = await rejects(() => salon.assignStaff(ORG, '4e349604-aea8-4639-bdb8-ea149c868310', date, '09:00', SIBA));
        check('a 90 minute service at 09:00 clashes with Siba’s 10:00 booking (the duration matters)', longer instanceof salon.SalonError && longer.httpStatus === 409, longer?.message);

        // Finishing early frees the rest of the booked time
        const e1 = await book(STICKONS, SIBA, '14:00', '16:00', false, 'CONFIRMED');
        const during = new Date(`${date}T12:30:00Z`); // 14:30 in Lusaka
        const noPermission = await rejects(() => salon.completeBooking(ORG, e1, () => false, during));
        check('someone who isn’t a manager or that hairdresser can’t mark it finished', noPermission?.httpStatus === 403, noPermission?.message);
        const done = await salon.completeBooking(ORG, e1, () => true, during);
        check('finishing at 14:30 on a 14:00 to 16:00 booking frees 90 minutes', done.freedMinutes === 90 && done.endedAt === '14:30', done);
        const row = (await supabase.from('product_appointments').select('status, end_time, scheduled_end_time').eq('id', e1).single()).data as any;
        check('it keeps the time it was booked until, and the real end', row.status === 'COMPLETED' && String(row.end_time).startsWith('14:30') && String(row.scheduled_end_time).startsWith('16:00'), row);
        const freed = (await salon.publicSlots(STICKONS, date, SIBA)).slots.map((s) => s.start);
        check('the freed time is bookable again: 15:00 is offered, 14:00 is not', freed.includes('15:00') && !freed.includes('14:00'), freed);
        const twice = await rejects(() => salon.completeBooking(ORG, e1, () => true, during));
        check('it can only be finished once', twice?.httpStatus === 409, twice?.message);
        const future = await book(STICKONS, SIBA, '16:00', '17:00', false, 'CONFIRMED');
        const early = await rejects(() => salon.completeBooking(ORG, future, () => true, new Date(`${date}T00:00:00Z`)));
        check('a booking that hasn’t happened yet can’t be finished', early !== null, early?.message);

        const day = await salon.bookingsForDay(ORG, date);
        const mine = day.filter((b) => b.customerName === tag);
        check('the day view lists each booking with its hairdresser and state', mine.length >= 3 && mine.some((b) => b.staff?.endsWith('Helper')) && mine.some((b) => b.status === 'COMPLETED'), mine.length);
    } finally {
        if (made.length) await supabase.from('product_appointments').delete().in('id', made);
        await supabase.from('salon_staff_services').delete().eq('staff_profile_id', HELPER);
        await supabase.from('salon_staff_profiles').delete().eq('id', HELPER);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
