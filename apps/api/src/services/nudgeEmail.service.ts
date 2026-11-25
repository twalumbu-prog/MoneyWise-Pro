import { supabase } from '../lib/supabase';
import { emailService } from './email.service';
import { getFrontendUrl } from '../utils/frontendUrl';
import { isPersonalOrganization } from '../lib/orgType';
import { getPeriodSummary } from './highlights.service';
import { overview as debtsOverview } from './debts.service';
import { addDays, iso, startOfWeek } from './highlights.service';
import {
    Person, firstNameOf, esc, kwacha, plural, personalLayout, statRow, checklist, checkLine, para, unsubscribeHeaders,
} from './emailPersonal';

/**
 * Nudge emails: the ones that sound like a person who has been watching your progress. One email per person at most per
 * run, written with their first name, and each only when there is something real to say:
 *
 *   bills     schedules and debts falling due in the next three days (and what people still owe you)
 *   setup     the next unfinished step of getting set up (account, first entries, a bill, a teammate)
 *   progress  Sunday: how your week went, compared with last week, with your streak (personal workspaces)
 *   team      Friday: what the people in your company workspace did this week
 *
 * Nothing is sent twice (a key per kind and day/week/step in push_alert_log, the same table the app pushes use), the
 * softer kinds wait two days after any other nudge, and anyone can switch the lot off with the link in the footer.
 */

const FRONTEND = () => getFrontendUrl();
const lusaka = (now: Date) => new Date(now.getTime() + 2 * 3600_000);
const today = (now: Date) => lusaka(now).toISOString().slice(0, 10);
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const money2 = (n: number) => `K${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export type NudgeKind = 'bills' | 'setup' | 'progress' | 'team';
export interface Nudge { kind: NudgeKind; key: string; subject: string; html: string }

export interface Ctx {
    userId: string; email: string; person: Person; orgId: string; orgName: string; personal: boolean; isAdmin: boolean;
    createdAt: string; now: Date;
}

const reasonFor = (c: Ctx) => `You're getting this because you use MoneyWise${c.personal ? '' : ` with ${c.orgName}`}.`;
const layout = (c: Ctx, o: { preheader: string; heading: string; body: string; cta?: { label: string; url: string } }) =>
    personalLayout({ preheader: o.preheader, heading: o.heading, firstName: c.person.firstName, bodyHtml: o.body, cta: o.cta, reason: reasonFor(c), unsubscribeFor: c.userId });
const name = (c: Ctx) => c.person.firstName;
const withName = (c: Ctx, rest: string) => (name(c) ? `${name(c)}, ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1));

// ── bills ───────────────────────────────────────────────────────────────────────────────────────────────────────

export async function billsNudge(c: Ctx): Promise<Nudge | null> {
    if (!c.isAdmin) return null;
    const t = today(c.now);
    const soon = iso(addDays(new Date(`${t}T00:00:00Z`), 3));
    const [{ data: items }, debts] = await Promise.all([
        supabase.from('scheduled_items').select('title, amount, next_due_date, currency, foreign_amount').eq('organization_id', c.orgId).eq('status', 'ACTIVE').gte('next_due_date', t).lte('next_due_date', soon).order('next_due_date'),
        debtsOverview(c.orgId).catch(() => null),
    ]);
    const due = (items ?? []) as any[];
    const owe = (debts?.owe ?? []).filter((d) => d.dueDate && d.dueDate <= soon).map((d) => ({ ...d, dueDate: d.dueDate as string }));
    const owedLate = (debts?.owed ?? []).filter((d: any) => d.overdue);
    if (!due.length && !owe.length && !owedLate.length) return null;

    const rows: string[] = [];
    for (const i of due) {
        const label = i.currency === 'USD' && i.foreign_amount ? `$${i.foreign_amount}` : money2(Number(i.amount));
        rows.push(`<tr><td style="padding:9px 0; border-bottom:1px solid #F0F2F4;"><strong>${esc(i.title)}</strong><div style="font-size:12px; color:#7A8189;">${i.next_due_date === t ? 'Due today' : `Due ${longDate(i.next_due_date)}`}</div></td><td style="padding:9px 0; border-bottom:1px solid #F0F2F4; text-align:right; font-weight:700;">${esc(label)}</td></tr>`);
    }
    for (const d of owe) {
        rows.push(`<tr><td style="padding:9px 0; border-bottom:1px solid #F0F2F4;"><strong>You owe ${esc(d.name)}</strong><div style="font-size:12px; color:#7A8189;">${d.dueDate < t ? 'Was due' : 'Due'} ${longDate(d.dueDate)}</div></td><td style="padding:9px 0; border-bottom:1px solid #F0F2F4; text-align:right; font-weight:700;">${money2(d.balance)}</td></tr>`);
    }
    const table = rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">${rows.join('')}</table>` : '';
    const owedText = owedLate.length
        ? para(owedLate.slice(0, 3).map((d: any) => `<strong>${esc(d.name)}</strong> still owes you <strong>${money2(d.balance)}</strong>${d.dueDate ? ` (was due ${longDate(d.dueDate)})` : ''}`).join('. ') + '. A quick message might be all it takes.')
        : '';

    const count = due.length + owe.length;
    const first = due[0];
    const heading = count === 1 && first
        ? `${esc(first.title)} is ${first.next_due_date === t ? 'due today' : `due ${longDate(first.next_due_date)}`}`
        : count > 0 ? `${plural(count, 'payment')} coming up in the next 3 days` : `${esc(owedLate[0].name)} still owes you ${money2(owedLate[0].balance)}`;
    const subject = count === 1 && first
        ? withName(c, `${first.title} is due ${first.next_due_date === t ? 'today' : longDate(first.next_due_date)}`)
        : count > 0 ? withName(c, `${plural(count, 'payment')} due in the next 3 days`) : withName(c, `${owedLate[0].name} still owes you ${money2(owedLate[0].balance)}`);

    return {
        kind: 'bills', key: `em:bills:${t}`, subject,
        html: layout(c, {
            preheader: count ? 'Have the money ready so nothing is late.' : 'A gentle reminder about money you are owed.',
            heading, body: (count ? para('Here is what is coming up so nothing catches you out:') + table : '') + owedText,
            cta: { label: count ? 'Open my schedules' : 'See who owes me', url: `${FRONTEND()}/schedules${count ? '' : '?view=debts'}` },
        }),
    };
}

// ── setup ───────────────────────────────────────────────────────────────────────────────────────────────────────

interface Step { id: string; done: boolean; line: string; label: string; url: string }

async function setupSteps(c: Ctx): Promise<Step[]> {
    const count = async (table: string, col = 'organization_id') => (await supabase.from(table).select('id', { count: 'exact', head: true }).eq(col, c.orgId)).count ?? 0;
    const [wallets, entries, schedules, members] = await Promise.all([
        count('external_wallets'), count('cashbook_entries'), count('scheduled_items'),
        c.personal ? Promise.resolve(1) : supabase.from('user_organizations').select('id', { count: 'exact', head: true }).eq('organization_id', c.orgId).then((r) => r.count ?? 0),
    ]);
    const steps: Step[] = [
        { id: 'account', done: wallets > 0, line: 'Add your first account (mobile money, bank or cash)', label: 'Add an account', url: `${FRONTEND()}/cashbook` },
        { id: 'entries', done: entries >= 5, line: 'Record a few transactions so you can see where money goes', label: 'Record transactions', url: `${FRONTEND()}/cashbook` },
        { id: 'bill', done: schedules > 0, line: 'Add a bill or something you pay regularly', label: 'Add a bill', url: `${FRONTEND()}/schedules` },
    ];
    if (!c.personal) steps.push({ id: 'team', done: members > 1, line: 'Invite a teammate so nothing depends on one person', label: 'Invite a teammate', url: `${FRONTEND()}/settings` });
    return steps;
}

export async function setupNudge(c: Ctx): Promise<Nudge | null> {
    const ageDays = (c.now.getTime() - new Date(c.createdAt).getTime()) / 86400_000;
    if (ageDays < 2 || ageDays > 45 || !c.isAdmin) return null;
    const steps = await setupSteps(c);
    const next = steps.find((s) => !s.done);
    if (!next) return null;
    const done = steps.filter((s) => s.done).length;
    const left = steps.length - done;
    const rows = steps.map((s) => checkLine(s.done, esc(s.line), s.id === next.id)).join('');
    return {
        kind: 'setup', key: `em:setup:${next.id}`,
        subject: done === 0 ? withName(c, `let’s get your money in one place`) : withName(c, `${plural(left, 'step')} left to finish setting up`),
        html: layout(c, {
            preheader: `${done} of ${steps.length} done. Next: ${next.label.toLowerCase()}.`,
            heading: done === 0 ? 'Your money in one place starts with one step' : `You’re ${done} of ${steps.length} of the way there`,
            body: para(done === 0 ? 'It takes about two minutes. Start with this:' : 'Nice progress. Here is what is left:') + checklist(rows),
            cta: { label: next.label, url: next.url },
        }),
    };
}

// ── progress (Sunday) ───────────────────────────────────────────────────────────────────────────────────────────

export async function progressNudge(c: Ctx): Promise<Nudge | null> {
    if (!c.personal || lusaka(c.now).getUTCDay() !== 0) return null;
    const weekStart = startOfWeek(lusaka(c.now));
    const start = iso(weekStart), end = today(c.now);
    const pStart = iso(addDays(weekStart, -7)), pEnd = iso(addDays(weekStart, -1));
    const [cur, prev, prog] = await Promise.all([
        getPeriodSummary(c.orgId, start, end), getPeriodSummary(c.orgId, pStart, pEnd),
        supabase.from('user_progress').select('streak, best_streak, active_days').eq('user_id', c.userId).maybeSingle().then((r) => r.data as any),
    ]);
    if (cur.revenue === 0 && cur.spending === 0) return null;
    const change = prev.spending > 0 ? Math.round(((cur.spending - prev.spending) / prev.spending) * 100) : null;
    const top = cur.categories[0];
    const lines: string[] = [];
    if (change !== null && Math.abs(change) >= 5) lines.push(change < 0 ? `You spent <strong>${Math.abs(change)}% less</strong> than last week. Well done.` : `You spent <strong>${change}% more</strong> than last week.`);
    if (top) lines.push(`<strong>${esc(top.name)}</strong> took the biggest share at ${kwacha(top.amount)}.`);
    if (cur.saved > 0) lines.push(`You moved <strong>${kwacha(cur.saved)}</strong> into savings.`);
    if (prog?.streak >= 2) lines.push(`🔥 You have checked in <strong>${prog.streak} days in a row</strong>${prog.best_streak > prog.streak ? ` (your best is ${prog.best_streak})` : ' — your best yet'}.`);
    const net = cur.revenue - cur.spending;
    return {
        kind: 'progress', key: `em:progress:${start}`,
        subject: withName(c, `your week: ${kwacha(cur.revenue)} in, ${kwacha(cur.spending)} out`),
        html: layout(c, {
            preheader: net >= 0 ? `You kept ${kwacha(net)} this week.` : `You spent ${kwacha(-net)} more than you brought in.`,
            heading: net >= 0 ? `You kept ${kwacha(net)} this week` : `You spent ${kwacha(-net)} more than you earned this week`,
            body: statRow([{ label: 'Money in', value: kwacha(cur.revenue), tone: 'good' }, { label: 'Money out', value: kwacha(cur.spending) }, { label: net >= 0 ? 'Kept' : 'Short', value: kwacha(net), tone: net >= 0 ? 'good' : 'bad' }]) + lines.map(para).join(''),
            cta: { label: 'See my full week', url: `${FRONTEND()}/reporting` },
        }),
    };
}

// ── team (Friday) ───────────────────────────────────────────────────────────────────────────────────────────────

export async function teamNudge(c: Ctx): Promise<Nudge | null> {
    if (c.personal || !c.isAdmin || lusaka(c.now).getUTCDay() !== 5) return null;
    const since = new Date(c.now.getTime() - 7 * 86400_000).toISOString();
    const [{ data: rows }, { data: joined }] = await Promise.all([
        supabase.from('cashbook_entries').select('created_by, debit, credit').eq('organization_id', c.orgId).neq('created_by', c.userId).gte('created_at', since).not('created_by', 'is', null).range(0, 4999),
        supabase.from('user_organizations').select('user:users!inner(id, name, first_name)').eq('organization_id', c.orgId).eq('status', 'ACTIVE').gte('created_at', since).neq('user_id', c.userId),
    ]);
    const by = new Map<string, { n: number; inn: number; out: number }>();
    for (const r of (rows ?? []) as any[]) {
        const cur = by.get(r.created_by) ?? { n: 0, inn: 0, out: 0 };
        cur.n++; cur.inn += Number(r.debit) || 0; cur.out += Number(r.credit) || 0; by.set(r.created_by, cur);
    }
    const newcomers = ((joined ?? []) as any[]).map((j) => firstNameOf(j.user) ?? 'A new teammate');
    if (!by.size && !newcomers.length) return null;
    const ids = [...by.keys()];
    const { data: users } = ids.length ? await supabase.from('users').select('id, name, first_name').in('id', ids) : { data: [] as any[] };
    const nameOf = new Map<string, string>((users ?? []).map((u: any) => [u.id, firstNameOf(u) ?? 'A teammate']));
    const ranked = [...by.entries()].sort((a, b) => b[1].n - a[1].n);
    const total = ranked.reduce((s, [, v]) => s + v.n, 0);
    const list = ranked.slice(0, 5).map(([id, v]) => `<tr><td style="padding:9px 0; border-bottom:1px solid #F0F2F4;"><strong>${esc(nameOf.get(id)!)}</strong><div style="font-size:12px; color:#7A8189;">${plural(v.n, 'entry')}</div></td><td style="padding:9px 0; border-bottom:1px solid #F0F2F4; text-align:right; font-size:13px; color:#3A4048;">${v.inn > 0 ? `in ${kwacha(v.inn)}` : ''}${v.inn > 0 && v.out > 0 ? '<br>' : ''}${v.out > 0 ? `out ${kwacha(v.out)}` : ''}</td></tr>`).join('');
    const who = ranked.slice(0, 2).map(([id]) => nameOf.get(id)!);
    const headline = total
        ? `${who.join(' and ')}${ranked.length > 2 ? ` and ${ranked.length - 2} more` : ''} added ${plural(total, 'entry').replace('entrys', 'entries')} this week`
        : `${newcomers.join(' and ')} joined ${esc(c.orgName)} this week`;
    return {
        kind: 'team', key: `em:team:${iso(startOfWeek(lusaka(c.now)))}`,
        subject: withName(c, total ? `here’s what your team did this week` : `${newcomers[0]} joined ${c.orgName}`),
        html: layout(c, {
            preheader: total ? `${plural(ranked.length, 'teammate')} recorded ${plural(total, 'entry').replace('entrys', 'entries')}.` : 'Say hello when you next see them.',
            heading: esc(headline),
            body: (list ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">${list}</table>` : '') + (newcomers.length && total ? para(`${esc(newcomers.join(' and '))} also joined your workspace.`) : ''),
            cta: { label: 'Review the activity', url: `${FRONTEND()}/cashbook` },
        }),
    };
}

// ── running it ──────────────────────────────────────────────────────────────────────────────────────────────────

const SOFT: NudgeKind[] = ['setup', 'progress', 'team'];
const BUILDERS: Record<NudgeKind, (c: Ctx) => Promise<Nudge | null>> = { bills: billsNudge, setup: setupNudge, progress: progressNudge, team: teamNudge };

async function audience(onlyUserId?: string) {
    const out: any[] = [];
    for (let from = 0; ; from += 500) {
        let q = supabase.from('users').select('id, email, name, first_name, organization_id, role, preferences, created_at').eq('status', 'ACTIVE').not('email', 'is', null).not('organization_id', 'is', null).order('id').range(from, from + 499);
        if (onlyUserId) q = q.eq('id', onlyUserId);
        const { data, error } = await q;
        if (error) throw new Error(`Could not load people to email: ${error.message}`);
        out.push(...(data ?? []));
        if (!data || data.length < 500 || onlyUserId) break;
    }
    return out;
}

export interface NudgeRun { people: number; sent: number; skipped: number; planned: { userId: string; email: string; kind: NudgeKind; subject: string }[]; errors: string[] }

/** Works out (and, unless dryRun, sends) at most one nudge per person. `onlyUserId` and `kinds` narrow it for testing. */
export async function runNudgeEmails(opts: { budgetMs?: number; now?: Date; dryRun?: boolean; onlyUserId?: string; kinds?: NudgeKind[]; ignoreThrottle?: boolean } = {}): Promise<NudgeRun> {
    const now = opts.now ?? new Date();
    const deadline = Date.now() + (opts.budgetMs ?? 50_000);
    const kinds = opts.kinds ?? (['bills', 'setup', 'progress', 'team'] as NudgeKind[]);
    const result: NudgeRun = { people: 0, sent: 0, skipped: 0, planned: [], errors: [] };
    const orgCache = new Map<string, { name: string; personal: boolean }>();
    const orgOf = async (id: string) => {
        if (!orgCache.has(id)) {
            const { data } = await supabase.from('organizations').select('name').eq('id', id).maybeSingle();
            orgCache.set(id, { name: (data as any)?.name ?? 'your workspace', personal: await isPersonalOrganization(id) });
        }
        return orgCache.get(id)!;
    };
    const recentCutoff = new Date(now.getTime() - 2 * 86400_000).toISOString();

    for (const u of await audience(opts.onlyUserId)) {
        if (Date.now() > deadline) break;
        const prefs = u.preferences?.notifications ?? {};
        if (prefs.nudge_emails === false || prefs.channel === 'APP') { result.skipped++; continue; }
        // Store-review and test accounts are not people to nudge.
        if (/^(appreview|reviewer|test|demo|qa)/i.test(String(u.email).split('@')[0])) { result.skipped++; continue; }
        result.people++;
        try {
            const org = await orgOf(u.organization_id);
            const ctx: Ctx = {
                userId: u.id, email: u.email, person: { userId: u.id, email: u.email, firstName: firstNameOf(u) },
                orgId: u.organization_id, orgName: org.name, personal: org.personal, isAdmin: org.personal || u.role === 'ADMIN',
                createdAt: u.created_at, now,
            };
            const { data: recent } = await supabase.from('push_alert_log').select('key').eq('user_id', u.id).like('key', 'em:%').gte('sent_at', recentCutoff).limit(1);
            const throttled = !opts.ignoreThrottle && (recent?.length ?? 0) > 0;

            for (const kind of (['bills', 'setup', 'progress', 'team'] as NudgeKind[]).filter((k) => kinds.includes(k))) {
                if (throttled && SOFT.includes(kind)) continue;
                const nudge = await BUILDERS[kind](ctx);
                if (!nudge) continue;
                const { data: dup } = await supabase.from('push_alert_log').select('key').eq('user_id', u.id).eq('organization_id', u.organization_id).eq('key', nudge.key).maybeSingle();
                if (dup) continue;
                result.planned.push({ userId: u.id, email: u.email, kind, subject: nudge.subject });
                if (opts.dryRun) break;
                const claim = await supabase.from('push_alert_log').insert({ user_id: u.id, organization_id: u.organization_id, key: nudge.key });
                if (claim.error) { if (claim.error.code === '23505') continue; throw new Error(claim.error.message); }
                const ok = await emailService.sendEmail({ to: u.email, subject: nudge.subject, html: nudge.html, headers: unsubscribeHeaders(u.id) });
                if (ok) result.sent++;
                else await supabase.from('push_alert_log').delete().eq('user_id', u.id).eq('organization_id', u.organization_id).eq('key', nudge.key);
                break; // one nudge per person per run
            }
        } catch (e: any) { result.errors.push(`${u.email}: ${e?.message}`); }
    }
    return result;
}
