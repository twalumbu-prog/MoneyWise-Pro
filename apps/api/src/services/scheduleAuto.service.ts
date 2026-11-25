import { supabase } from '../lib/supabase';
import { notifyUser } from './marketplaceNotify';
import { advanceDueDate, lusakaToday } from './schedule.service';
import { dollarRate } from './lipila.service';

/**
 * Schedules that add themselves.
 *
 *  - From email: when the reader (emailIntent) finds a bill or a subscription receipt that REPEATS, the bill is added straight to Schedules, for both
 *    personal and business workspaces. Each one is marked "from an email" and can be undone, and the same bill is never added twice.
 *  - From history: a payee you pay on a regular rhythm (about the same amount, about a month apart) is offered as a suggestion. It is only added when
 *    you accept it, because a pattern is a guess where an email is a document.
 *
 * Nothing here moves money. A schedule only creates a request for approval when it comes due (see schedule.service).
 */

const CADENCES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
type Cadence = typeof CADENCES[number];
const r2 = (n: number) => Math.round(n * 100) / 100;
const clean = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** A payee reduced to what stays the same between bills: "Vercel (USD 20.00)" and "VERCEL INC." both become "vercel". */
export function payeeKey(name: string): string {
    return String(name ?? '').toLowerCase()
        .replace(/\(.*?\)/g, ' ')
        .replace(/\b(usd|zmw|zar|gbp|eur)\s?[\d.,]+/g, ' ')
        .replace(/[$€£k]\s?\d[\d.,]*/g, ' ')
        .replace(/\b(inc|ltd|limited|llc|plc|co|company|corp|corporation|zambia|payment|payments|invoice|receipt|subscription|bill|billing|charge|charges|direct|debit)\b\.?/g, ' ')
        .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

const toCadence = (v: unknown): Cadence | null => {
    const c = String(v ?? '').toUpperCase();
    return (CADENCES as readonly string[]).includes(c) ? (c as Cadence) : null;
};

/** The day a repeating bill is next due: a stated due date if it is still ahead, otherwise the last date stepped forward by its rhythm. */
export function nextDueFrom(base: string, cadence: Cadence, today = lusakaToday()): string {
    let d = base, guard = 0;
    while (d < today && guard++ < 400) d = advanceDueDate(d, cadence);
    return d;
}

const categoryFor = (intent: string, text: string, cadence: Cadence): 'BILLS' | 'SUBSCRIPTIONS' => {
    if (/\b(subscription|renew|plan|pro\b|premium|monthly plan|hosting|cloud|software|saas)\b/i.test(text)) return 'SUBSCRIPTIONS';
    if (/\b(electricity|zesco|water|internet|airtime|rent|insurance|tax|utility|utilities|dstv|school|fees)\b/i.test(text)) return 'BILLS';
    return intent === 'RECEIPT' && cadence === 'MONTHLY' ? 'SUBSCRIPTIONS' : 'BILLS';
};

/** Someone in the workspace to own an item that was added by itself: the person who connected the mailbox, else an admin. */
async function ownerOf(orgId: string, connectionId?: string | null): Promise<string | null> {
    if (connectionId) {
        const { data } = await supabase.from('email_connections').select('connected_by').eq('id', connectionId).maybeSingle();
        if (data?.connected_by) return data.connected_by;
    }
    const { data } = await supabase.from('user_organizations').select('user_id').eq('organization_id', orgId).eq('role', 'ADMIN').eq('status', 'ACTIVE').limit(1).maybeSingle();
    return data?.user_id ?? null;
}

/** Amount in kwacha for a bill in another currency (dollars only; others are left to the person). */
async function toKwacha(amount: number, currency: string): Promise<{ amount: number; foreign: number | null } | null> {
    if (currency === 'ZMW') return { amount: r2(amount), foreign: null };
    if (currency === 'USD') { const rate = await dollarRate().catch(() => 0); return rate > 0 ? { amount: r2(amount * rate), foreign: r2(amount) } : null; }
    return null;
}

/**
 * Called after an email has been classified. Adds the bill to Schedules when it is a repeating bill we are confident about and not already there.
 * Returns the new item's id, or null when nothing was added. Never throws.
 */
export async function scheduleFromEmail(emailId: string, orgId: string): Promise<string | null> {
    try {
        const { data: em } = await supabase.from('inbound_emails')
            .select('id, connection_id, subject, intent, direction, intent_amount, intent_currency, counterparty, intent_confidence, intent_due_date, intent_cadence, intent_summary, received_at, scheduled_item_id')
            .eq('id', emailId).eq('organization_id', orgId).maybeSingle();
        if (!em || em.scheduled_item_id) return null;
        const cadence = toCadence(em.intent_cadence);
        // Only money going OUT, as a bill or a receipt for something that repeats, with an amount and a name, and a reader that was sure.
        if (!cadence || !['INVOICE', 'RECEIPT'].includes(em.intent) || em.direction !== 'OUT') return null;
        if (!(Number(em.intent_amount) > 0) || !em.counterparty || Number(em.intent_confidence) < 0.7) return null;
        const key = payeeKey(em.counterparty);
        if (key.length < 2) return null;

        // The same bill is never added twice: an item for this payee that is still active (however it was made) already covers it.
        const { data: dup } = await supabase.from('scheduled_items').select('id').eq('organization_id', orgId).eq('payee_key', key).eq('status', 'ACTIVE').limit(1).maybeSingle();
        if (dup) { await supabase.from('inbound_emails').update({ scheduled_item_id: dup.id }).eq('id', emailId); return null; }

        const money = await toKwacha(Number(em.intent_amount), String(em.intent_currency || 'ZMW'));
        if (!money) return null;
        const owner = await ownerOf(orgId, em.connection_id);
        if (!owner) return null;
        const base = em.intent_due_date ? String(em.intent_due_date).slice(0, 10) : String(em.received_at).slice(0, 10);
        const next = nextDueFrom(base, cadence);
        const title = clean(em.counterparty, 80);
        const { data: item, error } = await supabase.from('scheduled_items').insert({
            organization_id: orgId, created_by: owner, title, amount: money.amount, category: categoryFor(em.intent, `${em.subject} ${em.counterparty} ${em.intent_summary}`, cadence), cadence,
            next_due_date: next, due_day: Number(next.slice(8, 10)), description: `Added from an email: ${clean(em.subject, 120)}`, status: 'ACTIVE',
            source: 'EMAIL', source_email_id: emailId, payee_key: key, currency: money.foreign != null ? 'USD' : 'ZMW', foreign_amount: money.foreign,
        }).select('id').single();
        if (error || !item) { console.error('[ScheduleAuto] could not add from email:', error?.message); return null; }
        await supabase.from('inbound_emails').update({ scheduled_item_id: item.id }).eq('id', emailId);
        if (process.env.SCHEDULE_AUTO_NOTIFY !== 'off') await notifyUser(owner, { title: 'Added to your schedule', body: `${title} (${money.foreign != null ? `$${money.foreign}` : `K${money.amount}`}, ${cadence.toLowerCase()}) was added from an email. Open Schedules to review or undo it.`, path: '/schedules', orgId }).catch(() => undefined);
        return item.id;
    } catch (e: any) {
        console.error('[ScheduleAuto] from email failed:', e?.message ?? e);
        return null;
    }
}

/**
 * A payee that sends a bill or receipt on a regular rhythm (three or more, about a month apart) is a repeating bill even when no single email says so.
 * Needs the mailbox to reach back far enough, which is what the deeper look back is for. Added straight to Schedules like any other bill from an email.
 * Returns how many were added.
 */
export async function scheduleFromEmailPatterns(orgId: string): Promise<number> {
    try {
        const since = new Date(Date.now() - 400 * 86_400_000).toISOString();
        const { data } = await supabase.from('inbound_emails')
            .select('id, connection_id, subject, counterparty, intent, intent_amount, intent_currency, intent_confidence, received_at')
            .eq('organization_id', orgId).eq('prefilter_passed', true).in('intent', ['INVOICE', 'RECEIPT']).eq('direction', 'OUT')
            .not('counterparty', 'is', null).gt('intent_amount', 0).gte('received_at', since).order('received_at', { ascending: true }).range(0, 4999);
        const groups = new Map<string, any[]>();
        for (const e of (data ?? []) as any[]) {
            if (Number(e.intent_confidence) < 0.6) continue;
            const key = payeeKey(e.counterparty);
            if (key.length >= 2) groups.set(key, [...(groups.get(key) ?? []), e]);
        }
        const { data: have } = await supabase.from('scheduled_items').select('payee_key, title').eq('organization_id', orgId).eq('status', 'ACTIVE');
        const taken = new Set((have ?? []).map((i: any) => i.payee_key || payeeKey(i.title)));
        let added = 0;
        for (const [key, rows] of groups) {
            if (taken.has(key)) continue;
            const days = [...new Set(rows.map((r) => String(r.received_at).slice(0, 10)))].sort();
            const cadence = rhythmOf(days);
            if (!cadence) continue;
            const last = rows[rows.length - 1];
            const cur = String(rows.filter((r) => r.intent_currency).map((r) => r.intent_currency).sort((a, b) => rows.filter((r) => r.intent_currency === b).length - rows.filter((r) => r.intent_currency === a).length)[0] ?? 'ZMW');
            const typical = median(rows.filter((r) => (r.intent_currency || 'ZMW') === cur).map((r) => Number(r.intent_amount)));
            const money = await toKwacha(typical, cur);
            const owner = await ownerOf(orgId, last.connection_id);
            if (!money || !owner) continue;
            const next = nextDueFrom(advanceDueDate(days[days.length - 1], cadence), cadence);
            const title = clean(last.counterparty, 80);
            const { data: item, error } = await supabase.from('scheduled_items').insert({
                organization_id: orgId, created_by: owner, title, amount: money.amount, category: categoryFor(last.intent, `${last.subject} ${last.counterparty}`, cadence), cadence,
                next_due_date: next, due_day: Number(next.slice(8, 10)), description: `Added from your emails: ${days.length} bills about ${cadence === 'WEEKLY' ? 'a week' : cadence === 'BIWEEKLY' ? '2 weeks' : cadence === 'QUARTERLY' ? '3 months' : 'a month'} apart`, status: 'ACTIVE',
                source: 'EMAIL', source_email_id: last.id, payee_key: key, currency: money.foreign != null ? 'USD' : 'ZMW', foreign_amount: money.foreign,
            }).select('id').single();
            if (error || !item) { console.error('[ScheduleAuto] pattern add failed:', error?.message); continue; }
            await supabase.from('inbound_emails').update({ scheduled_item_id: item.id }).eq('id', last.id);
            taken.add(key); added++;
            if (process.env.SCHEDULE_AUTO_NOTIFY !== 'off') await notifyUser(owner, { title: 'Added to your schedule', body: `${title} (${money.foreign != null ? `${money.foreign}` : `K${money.amount}`}, ${cadence.toLowerCase()}) was added because it arrives in your emails regularly. Open Schedules to review or undo it.`, path: '/schedules', orgId }).catch(() => undefined);
        }
        return added;
    } catch (e: any) {
        console.error('[ScheduleAuto] email patterns failed:', e?.message ?? e);
        return 0;
    }
}

/* ───────────── Suggestions from payment history ───────────── */

export interface Suggestion { key: string; title: string; amount: number; cadence: Cadence; nextDue: string; seen: number; lastPaid: string; currency: 'ZMW' | 'USD'; foreignAmount: number | null }
const dismissKey = (orgId: string) => `schedule_dismissed:${orgId}`;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** The rhythm of a list of payment dates, if they keep one: weekly, every two weeks, monthly or every three months. */
export function rhythmOf(dates: string[]): Cadence | null {
    if (dates.length < 3) return null;
    const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
    const m = median(gaps);
    const near = (target: number, tol: number) => gaps.filter((g) => Math.abs(g - target) <= tol).length >= Math.max(2, Math.ceil(gaps.length * 0.7));
    if (m >= 5 && m <= 9 && near(7, 2)) return 'WEEKLY';
    if (m >= 12 && m <= 16 && near(14, 3)) return 'BIWEEKLY';
    if (m >= 26 && m <= 35 && near(30, 5)) return 'MONTHLY';
    if (m >= 84 && m <= 98 && near(91, 8)) return 'QUARTERLY';
    return null;
}

/** Payees paid on a regular rhythm over the last 8 months and not already scheduled or turned down. */
export async function suggestions(orgId: string): Promise<Suggestion[]> {
    const since = new Date(Date.now() - 240 * 86_400_000).toISOString().slice(0, 10);
    const { data } = await supabase.from('cashbook_entries').select('description, credit, debit, date, entry_type, status')
        .eq('organization_id', orgId).gt('credit', 0).eq('debit', 0).gte('date', since).in('status', ['COMPLETED', 'ACCOUNTED', 'UNACCOUNTED']).range(0, 4999);
    const groups = new Map<string, { title: string; rows: { date: string; amount: number; usd: number | null }[] }>();
    for (const e of (data ?? []) as any[]) {
        const desc = String(e.description ?? '').split(' | Ref:')[0];
        if (/^(opening|closing|transfer|reimbursement|refund)/i.test(desc)) continue;
        const key = payeeKey(desc);
        if (key.length < 3) continue;
        const usd = /\bUSD\s?([\d.]+)/i.exec(desc);
        const g = groups.get(key) ?? { title: clean(desc.replace(/\(.*?\)/g, ''), 60) || key, rows: [] };
        g.rows.push({ date: String(e.date).slice(0, 10), amount: Number(e.credit), usd: usd ? Number(usd[1]) : null });
        groups.set(key, g);
    }
    const [{ data: items }, { data: dis }] = await Promise.all([
        supabase.from('scheduled_items').select('payee_key, title').eq('organization_id', orgId).eq('status', 'ACTIVE'),
        supabase.from('app_settings').select('value').eq('key', dismissKey(orgId)).maybeSingle(),
    ]);
    const taken = new Set([...(items ?? []).map((i: any) => i.payee_key || payeeKey(i.title)), ...((dis?.value?.keys as string[] | undefined) ?? [])]);
    const out: Suggestion[] = [];
    for (const [key, g] of groups) {
        if (taken.has(key)) continue;
        // one payment a day for a payee is enough to read a rhythm (a second charge the same day is a duplicate)
        const byDay = new Map<string, number>(); for (const r of g.rows) byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.amount);
        const dates = [...byDay.keys()].sort();
        const cadence = rhythmOf(dates);
        if (!cadence) continue;
        const amounts = g.rows.map((r) => r.amount), mid = median(amounts);
        // about the same amount each time (dollar bills move a little with the rate)
        if (amounts.filter((a) => Math.abs(a - mid) <= mid * 0.15).length < Math.ceil(amounts.length * 0.7)) continue;
        const last = dates[dates.length - 1];
        const usds = g.rows.map((r) => r.usd).filter((x): x is number => x != null);
        out.push({ key, title: g.title, amount: r2(mid), cadence, nextDue: nextDueFrom(advanceDueDate(last, cadence), cadence), seen: dates.length, lastPaid: last, currency: usds.length >= Math.ceil(g.rows.length / 2) ? 'USD' : 'ZMW', foreignAmount: usds.length ? r2(median(usds)) : null });
    }
    return out.sort((a, b) => b.seen - a.seen || b.amount - a.amount).slice(0, 12);
}

export async function acceptSuggestion(orgId: string, userId: string, key: string) {
    const s = (await suggestions(orgId)).find((x) => x.key === key);
    if (!s) throw new Error('That suggestion is no longer available.');
    const { data, error } = await supabase.from('scheduled_items').insert({
        organization_id: orgId, created_by: userId, title: s.title, amount: s.amount, category: categoryFor('RECEIPT', s.title, s.cadence), cadence: s.cadence,
        next_due_date: s.nextDue, due_day: Number(s.nextDue.slice(8, 10)), description: `Added from your payment history (${s.seen} payments)`, status: 'ACTIVE',
        source: 'HISTORY', payee_key: s.key, currency: s.currency, foreign_amount: s.foreignAmount,
    }).select('*').single();
    if (error || !data) throw new Error(error?.message ?? 'Could not add it.');
    return data;
}

export async function dismissSuggestion(orgId: string, key: string) {
    const { data } = await supabase.from('app_settings').select('value').eq('key', dismissKey(orgId)).maybeSingle();
    const keys = [...new Set([...(((data?.value?.keys as string[]) ?? [])), key])].slice(-200);
    const { error } = await supabase.from('app_settings').upsert({ key: dismissKey(orgId), value: { keys }, description: 'Schedule suggestions this workspace turned down', updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
}
