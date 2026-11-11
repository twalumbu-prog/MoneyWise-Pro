import { supabase } from '../lib/supabase';

/**
 * Time-slot appointments (SERVICE_APPOINTMENT products — salons, clinics, …).
 * Opening hours / slot rules live on `products.appointment_config`; paid slots in
 * `product_appointments`. All times are wall-clock in the business's timezone.
 */
export interface AppointmentConfig {
    duration_minutes: number;
    slot_interval_minutes: number;
    capacity: number;
    min_notice_hours: number;
    max_advance_days: number;
    timezone: string;
    /** 0=Sun … 6=Sat; a missing day is closed. */
    hours: Record<string, { start: string; end: string }>;
    closed_dates: string[];
}

export const DEFAULT_APPOINTMENT_CONFIG: AppointmentConfig = {
    duration_minutes: 60,
    slot_interval_minutes: 60,
    capacity: 1,
    min_notice_hours: 2,
    max_advance_days: 60,
    timezone: 'Africa/Lusaka',
    hours: Object.fromEntries([1, 2, 3, 4, 5, 6].map(d => [String(d), { start: '09:00', end: '17:00' }])),
    closed_dates: [],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const toMin = (t: string) => { const [h, m] = t.split(':'); return Number(h) * 60 + Number(m); };
export const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const clampInt = (v: any, min: number, max: number, dflt: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
const validTz = (tz: any): string => {
    try { if (typeof tz === 'string') { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } } catch { /* fall through */ }
    return DEFAULT_APPOINTMENT_CONFIG.timezone;
};

/** Normalise an untrusted client config into a safe, complete one. */
export function sanitizeAppointmentConfig(raw: any): AppointmentConfig {
    const r = raw && typeof raw === 'object' ? raw : {};
    const duration = clampInt(r.duration_minutes, 5, 720, 60);
    const hours: AppointmentConfig['hours'] = {};
    if (r.hours && typeof r.hours === 'object') {
        for (const d of ['0', '1', '2', '3', '4', '5', '6']) {
            const h = r.hours[d];
            if (h && TIME_RE.test(String(h.start)) && TIME_RE.test(String(h.end)) && toMin(h.end) > toMin(h.start)) {
                hours[d] = { start: h.start, end: h.end };
            }
        }
    } else {
        Object.assign(hours, DEFAULT_APPOINTMENT_CONFIG.hours);
    }
    return {
        duration_minutes: duration,
        slot_interval_minutes: clampInt(r.slot_interval_minutes, 5, 720, duration),
        capacity: clampInt(r.capacity, 1, 50, 1),
        min_notice_hours: clampInt(r.min_notice_hours, 0, 24 * 30, 2),
        max_advance_days: clampInt(r.max_advance_days, 1, 365, 60),
        timezone: validTz(r.timezone),
        hours,
        closed_dates: Array.isArray(r.closed_dates)
            ? [...new Set(r.closed_dates.filter((d: any) => typeof d === 'string' && DATE_RE.test(d)))].slice(0, 400) as string[]
            : [],
    };
}

export function resolveConfig(raw: any): AppointmentConfig {
    return raw ? sanitizeAppointmentConfig(raw) : DEFAULT_APPOINTMENT_CONFIG;
}

/** Current wall-clock date + minutes-since-midnight in `tz`. */
export function nowInTz(tz: string, at: Date = new Date()): { date: string; minutes: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at);
    const g = (t: string) => parts.find(p => p.type === t)!.value;
    return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) };
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export interface Slot { start: string; end: string; remaining: number }

/** Pure: every bookable slot on `date`, given the already-confirmed appointments that day. */
export function computeSlots(
    cfg: AppointmentConfig,
    date: string,
    confirmed: { start_time: string; end_time: string }[],
    at: Date = new Date(),
): Slot[] {
    if (!DATE_RE.test(date) || cfg.closed_dates.includes(date)) return [];
    const now = nowInTz(cfg.timezone, at);
    const ahead = dayDiff(now.date, date);
    if (ahead < 0 || ahead > cfg.max_advance_days) return [];
    const win = cfg.hours[String(weekdayOf(date))];
    if (!win) return [];

    const earliest = ahead === 0 ? now.minutes + cfg.min_notice_hours * 60 : 0;
    // Notice that spills past midnight pushes bookings on later days too.
    const noticeDays = ahead > 0 ? (now.minutes + cfg.min_notice_hours * 60 - ahead * 1440) : -1;
    const minStart = Math.max(earliest, noticeDays);
    const taken = confirmed.map(c => ({ s: toMin(c.start_time.slice(0, 5)), e: toMin(c.end_time.slice(0, 5)) }));
    const slots: Slot[] = [];
    for (let s = toMin(win.start); s + cfg.duration_minutes <= toMin(win.end); s += cfg.slot_interval_minutes) {
        const e = s + cfg.duration_minutes;
        if (s < minStart) continue;
        const used = taken.filter(t => t.s < e && t.e > s).length;
        if (used < cfg.capacity) slots.push({ start: minToTime(s), end: minToTime(e), remaining: cfg.capacity - used });
    }
    return slots;
}

export async function fetchConfirmedForDate(productId: string, date: string) {
    const { data, error } = await supabase
        .from('product_appointments')
        .select('start_time, end_time')
        .eq('product_id', productId)
        .eq('status', 'CONFIRMED')
        .eq('appointment_date', date);
    if (error) throw error;
    return (data || []) as { start_time: string; end_time: string }[];
}

/** Is exactly this slot (still) offered? Used to validate a checkout intent. */
export async function isSlotAvailable(productId: string, cfgRaw: any, date: string, start: string): Promise<Slot | null> {
    const cfg = resolveConfig(cfgRaw);
    if (!TIME_RE.test(start)) return null;
    const slots = computeSlots(cfg, date, await fetchConfirmedForDate(productId, date));
    return slots.find(s => s.start === start) || null;
}

/** Flip an appointment PENDING → CONFIRMED/CONFLICT atomically (advisory-locked RPC). */
export async function confirmAppointment(id: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('confirm_product_appointment', { p_appointment_id: id });
    if (error) throw error;
    return (data as string | null) ?? null;
}
