/**
 * Salon booking with hairdressers. A service can be done by certain hairdressers (salon_staff_services), each with their own working days and
 * hours. A client may pick one or take "any available". A hairdresser is reserved for the service's duration across ALL services (so one
 * person can't be booked for two things at once), and when a service is marked finished early the rest of that time is free again.
 *
 * A service nobody is assigned to keeps the original behaviour (capacity per service), so businesses that aren't salons are unaffected.
 */
import { supabase } from '../lib/supabase';
import { resolveConfig, nowInTz, minToTime, toMin, dayDiff, weekdayOf, DATE_RE, TIME_RE, AppointmentConfig } from './appointment.service';

export class SalonError extends Error { constructor(message: string, readonly httpStatus = 400) { super(message); } }

export interface StaffRow { id: string; display_name: string; work_start: string; work_end: string; working_days: number[]; user_id?: string | null }
export interface StaffSlot { start: string; end: string; staffIds: string[] }

const hhmm = (t: string) => String(t).slice(0, 5);

/** How long a service takes: the duration the salon set on the service, else the booking rule's. */
export const serviceDuration = (product: { duration_minutes?: number | null }, cfg: AppointmentConfig): number => {
    const d = Math.round(Number(product?.duration_minutes));
    return Number.isFinite(d) && d >= 5 && d <= 720 ? d : cfg.duration_minutes;
};

/** The shop's open window that day and the earliest a booking can start (notice period), or null when closed / out of range. */
export function dayWindow(cfg: AppointmentConfig, date: string, at: Date = new Date()): { winStart: number; winEnd: number; minStart: number } | null {
    if (!DATE_RE.test(date) || cfg.closed_dates.includes(date)) return null;
    const now = nowInTz(cfg.timezone, at);
    const ahead = dayDiff(now.date, date);
    if (ahead < 0 || ahead > cfg.max_advance_days) return null;
    const win = cfg.hours[String(weekdayOf(date))];
    if (!win) return null;
    const earliest = ahead === 0 ? now.minutes + cfg.min_notice_hours * 60 : 0;
    const noticeDays = ahead > 0 ? now.minutes + cfg.min_notice_hours * 60 - ahead * 1440 : -1;
    return { winStart: toMin(win.start), winEnd: toMin(win.end), minStart: Math.max(earliest, noticeDays) };
}

/**
 * Pure: every start time at which at least one hairdresser is free for `duration` minutes, with who. `busy` is each hairdresser's already
 * booked intervals that day (minutes). Pass `only` to see one hairdresser's own times.
 */
export function computeStaffSlots(
    cfg: AppointmentConfig, duration: number, date: string, staff: StaffRow[], busy: Record<string, { s: number; e: number }[]>, at: Date = new Date(), only?: string,
): StaffSlot[] {
    const w = dayWindow(cfg, date, at);
    if (!w) return [];
    const dow = weekdayOf(date);
    const byStart = new Map<number, string[]>();
    for (const st of staff) {
        if (only && st.id !== only) continue;
        if (!st.working_days.includes(dow)) continue;
        const from = Math.max(w.winStart, toMin(hhmm(st.work_start))), to = Math.min(w.winEnd, toMin(hhmm(st.work_end)));
        const mine = busy[st.id] ?? [];
        for (let s = from; s + duration <= to; s += cfg.slot_interval_minutes) {
            if (s < w.minStart) continue;
            const e = s + duration;
            if (mine.some((b) => b.s < e && b.e > s)) continue;
            byStart.set(s, [...(byStart.get(s) ?? []), st.id]);
        }
    }
    return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([s, ids]) => ({ start: minToTime(s), end: minToTime(s + duration), staffIds: ids }));
}

/** The hairdressers who do this service (active, bookable). Empty means the service isn't staffed, so the original booking rules apply. */
export async function staffForService(orgId: string, productId: string): Promise<StaffRow[]> {
    const { data: links } = await supabase.from('salon_staff_services').select('staff_profile_id').eq('organization_id', orgId).eq('product_id', productId);
    const ids = (links ?? []).map((l: any) => l.staff_profile_id);
    if (!ids.length) return [];
    const { data } = await supabase.from('salon_staff_profiles').select('id, display_name, work_start, work_end, working_days, user_id').eq('organization_id', orgId).eq('is_active', true).eq('is_bookable', true).in('id', ids).order('display_name');
    return (data ?? []).map((r: any) => ({ ...r, working_days: (r.working_days ?? []).map(Number) }));
}

async function busyFor(staffIds: string[], date: string): Promise<Record<string, { s: number; e: number }[]>> {
    const out: Record<string, { s: number; e: number }[]> = {};
    if (!staffIds.length) return out;
    const { data } = await supabase.from('product_appointments').select('staff_profile_id, start_time, end_time').in('staff_profile_id', staffIds).in('status', ['CONFIRMED', 'COMPLETED']).eq('appointment_date', date);
    for (const r of (data ?? []) as any[]) (out[r.staff_profile_id] ??= []).push({ s: toMin(hhmm(r.start_time)), e: toMin(hhmm(r.end_time)) });
    return out;
}

async function loadService(productId: string) {
    const { data: p } = await supabase.from('products').select('id, organization_id, name, price, product_type, is_active, duration_minutes, appointment_config').eq('id', productId).maybeSingle();
    if (!p || p.product_type !== 'SERVICE_APPOINTMENT' || !p.is_active) return null;
    const cfg = resolveConfig(p.appointment_config);
    return { p, cfg, duration: serviceDuration(p, cfg) };
}

/** What the public booking page needs: who can do this service, and the free times for a day (optionally for one hairdresser). */
export async function publicSlots(productId: string, date: string, choice?: string) {
    const svc = await loadService(productId);
    if (!svc) throw new SalonError('Appointment service not found', 404);
    const staff = await staffForService(svc.p.organization_id, productId);
    if (!staff.length) return { staffed: false as const, staff: [], duration: svc.duration, slots: [] as StaffSlot[] };
    const only = choice && choice !== 'any' ? choice : undefined;
    if (only && !staff.some((s) => s.id === only)) throw new SalonError('That hairdresser doesn’t do this service.', 404);
    const busy = await busyFor(staff.map((s) => s.id), date);
    return { staffed: true as const, staff: staff.map((s) => ({ id: s.id, name: s.display_name })), duration: svc.duration, slots: computeStaffSlots(svc.cfg, svc.duration, date, staff, busy, new Date(), only) };
}

/**
 * Checks a chosen slot at checkout and decides who does it: the hairdresser the client named, or (for "any") the free one with the fewest bookings
 * that day. Returns null when the service isn't staffed (the original rules apply); throws when the time is no longer free.
 */
export async function assignStaff(orgId: string, productId: string, date: string, start: string, choice: string | null | undefined): Promise<{ staffId: string; any: boolean; duration: number } | null> {
    const svc = await loadService(productId);
    if (!svc || svc.p.organization_id !== orgId) return null;
    const staff = await staffForService(orgId, productId);
    if (!staff.length) return null;
    if (!TIME_RE.test(start)) throw new SalonError('That time isn’t valid.');
    const any = !choice || choice === 'any';
    const busy = await busyFor(staff.map((s) => s.id), date);
    const slot = computeStaffSlots(svc.cfg, svc.duration, date, staff, busy, new Date(), any ? undefined : choice!).find((s) => s.start === start);
    if (!slot) throw new SalonError('Sorry, that time is no longer available. Please choose another.', 409);
    if (!any) return { staffId: slot.staffIds[0], any: false, duration: svc.duration };
    // Fewest bookings that day first, so the work is spread; ties go to the first alphabetically.
    const load = (id: string) => (busy[id] ?? []).length;
    const pick = [...slot.staffIds].sort((a, b) => load(a) - load(b) || (staff.find((s) => s.id === a)!.display_name).localeCompare(staff.find((s) => s.id === b)!.display_name))[0];
    return { staffId: pick, any: true, duration: svc.duration };
}

/* ───────────── The salon's own view ───────────── */

export async function listStaff(orgId: string) {
    const [{ data: staff }, { data: links }, { data: services }] = await Promise.all([
        supabase.from('salon_staff_profiles').select('*').eq('organization_id', orgId).order('display_name'),
        supabase.from('salon_staff_services').select('staff_profile_id, product_id').eq('organization_id', orgId),
        supabase.from('products').select('id, name, duration_minutes').eq('organization_id', orgId).eq('product_type', 'SERVICE_APPOINTMENT').eq('is_active', true).order('name'),
    ]);
    return {
        staff: (staff ?? []).map((s: any) => ({ id: s.id, name: s.display_name, isBookable: s.is_bookable, isActive: s.is_active, workStart: hhmm(s.work_start), workEnd: hhmm(s.work_end), workingDays: (s.working_days ?? []).map(Number), userId: s.user_id ?? null, serviceIds: (links ?? []).filter((l: any) => l.staff_profile_id === s.id).map((l: any) => l.product_id) })),
        services: services ?? [],
    };
}

export async function saveStaff(orgId: string, body: any, id?: string) {
    const name = String(body?.name ?? '').trim().slice(0, 60);
    if (!name) throw new SalonError('Enter the hairdresser’s name.');
    const workStart = String(body?.workStart ?? '08:00'), workEnd = String(body?.workEnd ?? '18:00');
    if (!TIME_RE.test(workStart) || !TIME_RE.test(workEnd) || toMin(workEnd) <= toMin(workStart)) throw new SalonError('The finishing time must be after the starting time.');
    const days = [...new Set((Array.isArray(body?.workingDays) ? body.workingDays : []).map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))] as number[];
    if (!days.length) throw new SalonError('Choose at least one working day.');
    const row = { organization_id: orgId, display_name: name, work_start: workStart, work_end: workEnd, working_days: days, is_bookable: body?.isBookable !== false, is_active: body?.isActive !== false, updated_at: new Date().toISOString() };
    let staffId = id;
    if (id) {
        const { data, error } = await supabase.from('salon_staff_profiles').update(row).eq('id', id).eq('organization_id', orgId).select('id').maybeSingle();
        if (error || !data) throw new SalonError(error?.message ?? 'Hairdresser not found.', error ? 500 : 404);
    } else {
        const { data, error } = await supabase.from('salon_staff_profiles').insert(row).select('id').single();
        if (error || !data) throw new SalonError(error?.message ?? 'Could not save the hairdresser.', 500);
        staffId = data.id;
    }
    // The services they do: only this business's appointment services.
    const wanted: string[] = Array.isArray(body?.serviceIds) ? body.serviceIds.map(String) : [];
    const { data: ok } = wanted.length ? await supabase.from('products').select('id').eq('organization_id', orgId).eq('product_type', 'SERVICE_APPOINTMENT').in('id', wanted) : { data: [] as any[] };
    await supabase.from('salon_staff_services').delete().eq('staff_profile_id', staffId!).eq('organization_id', orgId);
    if ((ok ?? []).length) await supabase.from('salon_staff_services').insert((ok ?? []).map((p: any) => ({ organization_id: orgId, staff_profile_id: staffId, product_id: p.id })));
    return (await listStaff(orgId)).staff.find((s) => s.id === staffId);
}

/** One day's bookings, each with the hairdresser, the service and whether it has been finished. */
export async function bookingsForDay(orgId: string, date: string, staffId?: string) {
    if (!DATE_RE.test(date)) throw new SalonError('Choose a date.');
    let q = supabase.from('product_appointments').select('id, product_id, staff_profile_id, customer_name, customer_phone, appointment_date, start_time, end_time, scheduled_end_time, completed_at, amount, status').eq('organization_id', orgId).eq('appointment_date', date).in('status', ['CONFIRMED', 'COMPLETED']).order('start_time');
    if (staffId) q = q.eq('staff_profile_id', staffId);
    const { data, error } = await q;
    if (error) throw new SalonError(error.message, 500);
    const rows = (data ?? []) as any[];
    const pids = [...new Set(rows.map((r) => r.product_id))], sids = [...new Set(rows.map((r) => r.staff_profile_id).filter(Boolean))];
    const [{ data: prods }, { data: staff }] = await Promise.all([
        pids.length ? supabase.from('products').select('id, name').in('id', pids) : Promise.resolve({ data: [] as any[] }),
        sids.length ? supabase.from('salon_staff_profiles').select('id, display_name').in('id', sids) : Promise.resolve({ data: [] as any[] }),
    ]);
    const pn = new Map((prods ?? []).map((p: any) => [p.id, p.name])), sn = new Map((staff ?? []).map((s: any) => [s.id, s.display_name]));
    return rows.map((r) => ({
        id: r.id, service: pn.get(r.product_id) ?? 'Service', staffId: r.staff_profile_id, staff: r.staff_profile_id ? sn.get(r.staff_profile_id) ?? null : null,
        customerName: r.customer_name, customerPhone: r.customer_phone, start: hhmm(r.start_time), end: hhmm(r.end_time), bookedUntil: hhmm(r.scheduled_end_time ?? r.end_time),
        status: r.status, finishedAt: r.completed_at, amount: Number(r.amount) || 0,
    }));
}

/**
 * Marks a service finished. If that is before the time it was booked until, the booking now ends at the real finish, so the rest of the
 * time is free for the next client (subject to bookings already made). Only today's or earlier bookings, and only once.
 */
export async function completeBooking(orgId: string, id: string, allow: (staffUserId: string | null) => boolean, at: Date = new Date()) {
    const { data: a } = await supabase.from('product_appointments').select('id, product_id, staff_profile_id, appointment_date, start_time, end_time, scheduled_end_time, status').eq('organization_id', orgId).eq('id', id).maybeSingle();
    if (!a) throw new SalonError('Booking not found.', 404);
    if (a.status === 'COMPLETED') throw new SalonError('This service is already marked finished.', 409);
    if (a.status !== 'CONFIRMED') throw new SalonError('Only a confirmed booking can be marked finished.', 409);
    let staffUser: string | null = null;
    if (a.staff_profile_id) staffUser = (await supabase.from('salon_staff_profiles').select('user_id').eq('id', a.staff_profile_id).maybeSingle()).data?.user_id ?? null;
    if (!allow(staffUser)) throw new SalonError('Only the salon’s managers or the hairdresser who did this service can mark it finished.', 403);

    const { data: p } = await supabase.from('products').select('appointment_config').eq('id', a.product_id).maybeSingle();
    const tz = resolveConfig(p?.appointment_config).timezone;
    const now = nowInTz(tz, at);
    if (a.appointment_date > now.date) throw new SalonError('This booking is in the future, so it can’t be finished yet.', 409);
    const scheduledEnd = toMin(hhmm(a.end_time)), start = toMin(hhmm(a.start_time));
    if (a.appointment_date === now.date && now.minutes < start) throw new SalonError('This service hasn’t started yet, so it can’t be marked finished.', 409);
    // Finished early (on the day, after it started, before its booked end): the booking now ends at the real finish, at least a minute long.
    const early = a.appointment_date === now.date && now.minutes < scheduledEnd;
    const realEnd = early ? Math.max(start + 1, now.minutes) : scheduledEnd;
    const patch: Record<string, unknown> = { status: 'COMPLETED', completed_at: at.toISOString(), updated_at: at.toISOString(), scheduled_end_time: a.scheduled_end_time ?? a.end_time };
    if (early) patch.end_time = minToTime(realEnd);
    const { error } = await supabase.from('product_appointments').update(patch).eq('id', id).eq('status', 'CONFIRMED');
    if (error) throw new SalonError(error.message, 500);
    return { id, status: 'COMPLETED', freedMinutes: Math.max(0, scheduledEnd - realEnd), endedAt: minToTime(realEnd) };
}
