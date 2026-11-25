import { supabase } from '../lib/supabase';
import { emailService } from './email.service';
import { getFrontendUrl } from '../utils/frontendUrl';
import { esc, kwacha2, plural, para, personalLayout, statRow, Person } from './emailPersonal';

/**
 * "Money came in" emails, without the flood. A busy account can have dozens of deposits a day; one email each trains people to
 * stop opening them. So:
 *
 *   - the first two deposits each day, and any single deposit of K1,000 or more, still get their own email, right away
 *   - everything after that is rolled into ONE evening email (19:00 Lusaka): the day's total, how many payments, the biggest ones
 *
 * Sent counts live in push_alert_log (keys em:inflow:<day>:<n>), the same table the other personal emails use.
 */

export const BIG_INFLOW = 1000;
export const IMMEDIATE_PER_DAY = 2;

const lusakaDay = (now = new Date()) => new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10);

/** True when this person should get an email for this deposit now (and records it). False means it goes into tonight's digest. */
export async function claimImmediateInflow(userId: string, orgId: string, amount: number, now = new Date()): Promise<boolean> {
    const day = lusakaDay(now);
    if (amount < BIG_INFLOW) {
        const { count } = await supabase.from('push_alert_log').select('key', { count: 'exact', head: true })
            .eq('user_id', userId).eq('organization_id', orgId).like('key', `em:inflow:${day}:%`);
        if ((count ?? 0) >= IMMEDIATE_PER_DAY) return false;
    }
    const key = `em:inflow:${day}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from('push_alert_log').insert({ user_id: userId, organization_id: orgId, key });
    return !error;
}

const cleanLabel = (d: string) => String(d || '').split(' | Ref:')[0].replace(/\s+/g, ' ').trim() || 'Deposit';

export function renderInflowDigest(p: Person, orgName: string, personal: boolean, rows: { description: string; amount: number }[], total: number): { subject: string; html: string } {
    const top = [...rows].sort((a, b) => b.amount - a.amount).slice(0, 5);
    const list = top.map((r) => `<tr><td style="padding:9px 0; border-bottom:1px solid #F0F2F4;">${esc(cleanLabel(r.description))}</td><td style="padding:9px 0; border-bottom:1px solid #F0F2F4; text-align:right; font-weight:700;">${kwacha2(r.amount)}</td></tr>`).join('');
    const more = rows.length - top.length;
    const name = p.firstName;
    return {
        subject: `${name ? `${name}, ` : ''}${kwacha2(total)} came in today from ${plural(rows.length, 'payment')}`,
        html: personalLayout({
            preheader: `Your day in one email: ${plural(rows.length, 'deposit')}, ${kwacha2(total)}.`,
            heading: `${kwacha2(total)} came in today`,
            firstName: name,
            bodyHtml:
                para(`Instead of an email for every deposit, here is today in one place${personal ? '' : ` for <strong>${esc(orgName)}</strong>`}.`) +
                statRow([{ label: 'Payments', value: String(rows.length) }, { label: 'Total in', value: kwacha2(total), tone: 'good' }]) +
                `<div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#9AA0A7; margin:6px 0 2px;">Biggest today</div>` +
                `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;">${list}</table>` +
                (more > 0 ? para(`<span style="color:#7A8189; font-size:13px;">…and ${plural(more, 'smaller payment')}.</span>`) : ''),
            cta: { label: 'See everything in my cashbook', url: `${getFrontendUrl()}/cashbook` },
            reason: 'You get one of these a day when more than a couple of deposits arrive, so your inbox stays quiet.',
        }),
    };
}

export interface DigestRun { orgs: number; sent: number; skipped: number; errors: string[] }

export async function sendInflowDigests(opts: { now?: Date; dryRun?: boolean; budgetMs?: number } = {}): Promise<DigestRun> {
    const now = opts.now ?? new Date();
    const day = lusakaDay(now);
    const deadline = Date.now() + (opts.budgetMs ?? 45_000);
    const out: DigestRun = { orgs: 0, sent: 0, skipped: 0, errors: [] };

    const orgTotals = new Map<string, { description: string; amount: number }[]>();
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('cashbook_entries').select('organization_id, description, debit')
            .eq('date', day).gt('debit', 0).neq('status', 'PENDING').order('created_at').range(from, from + 999);
        if (error) throw new Error(`Could not read today's deposits: ${error.message}`);
        for (const r of (data ?? []) as any[]) {
            const arr = orgTotals.get(r.organization_id) ?? [];
            arr.push({ description: r.description, amount: Number(r.debit) || 0 });
            orgTotals.set(r.organization_id, arr);
        }
        if (!data || data.length < 1000) break;
    }

    for (const [orgId, rows] of orgTotals) {
        if (Date.now() > deadline) break;
        out.orgs++;
        try {
            const { orgName, people } = await emailService.getOrgNotificationPeople(orgId);
            const { data: o } = await supabase.from('organizations').select('is_personal').eq('id', orgId).maybeSingle();
            const personal = (o as any)?.is_personal === true;
            const total = rows.reduce((s, r) => s + r.amount, 0);
            for (const p of people) {
                if (!p.userId) { out.skipped++; continue; }
                // Only people who had deposits held back get the digest: they were over the daily cap.
                const { count } = await supabase.from('push_alert_log').select('key', { count: 'exact', head: true })
                    .eq('user_id', p.userId).eq('organization_id', orgId).like('key', `em:inflow:${day}:%`);
                const emailed = count ?? 0;
                if (rows.length <= emailed) { out.skipped++; continue; }
                const claimKey = `em:inflowdigest:${day}`;
                const { data: dup } = await supabase.from('push_alert_log').select('key').eq('user_id', p.userId).eq('organization_id', orgId).eq('key', claimKey).maybeSingle();
                if (dup) { out.skipped++; continue; }
                if (opts.dryRun) { out.sent++; continue; }
                const m = renderInflowDigest(p, orgName, personal, rows, total);
                const n = await emailService.sendToEach([p], () => m, { orgId });
                if (n > 0) { await supabase.from('push_alert_log').insert({ user_id: p.userId, organization_id: orgId, key: claimKey }); out.sent++; }
            }
        } catch (e: any) { out.errors.push(`${orgId}: ${e?.message}`); }
    }
    return out;
}
