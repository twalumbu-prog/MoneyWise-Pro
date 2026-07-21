import { supabase } from '../lib/supabase';
import { emailService } from './email.service';
import {
    getPeriodSummary,
    getUnseenAchievements,
    detectAchievements,
    achievementTitle,
    buildConcerns,
    startOfWeek,
    addDays,
    iso,
    PeriodSummary,
    Concern,
    Achievement,
} from './highlights.service';

const FRONTEND_URL = process.env.FRONTEND_URL
    || (process.env.NODE_ENV === 'production' ? 'https://moneywise.blueopus.cloud' : 'http://localhost:5173');

const FONT_STACK = "'DM Sans','Figtree',-apple-system,sans-serif";

// Same palette as the in-app Highlights card and its confetti.
const BLUE = '#006AFF';
const INK = '#16181D';
const MUTED = '#7A8189';
const FAINT = '#9AA0A7';
const HAIRLINE = '#F0F2F4';
const RULE = '#EAECEF';
const AMBER = '#B45309';
const GREEN = '#047857';

const money = (n: number) =>
    `K${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

const signedMoney = (n: number) => `${n < 0 ? '−' : ''}${money(n)}`;

const pctChange = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / Math.abs(prev)) * 100);
};

const prettyDate = (isoDate: string) =>
    new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', timeZone: 'UTC',
    });

/**
 * Escape values that come from user-controlled data (account names, ledger
 * descriptions, org names) before they land in the HTML body.
 */
const esc = (s: string) =>
    String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/**
 * Horizontal bar, drawn as a nested table.
 *
 * Email clients don't run JavaScript and most of them (Outlook especially)
 * won't render inline SVG or CSS-styled block elements reliably, so every chart
 * in this newsletter is built from table cells with a background colour and a
 * percentage width. That's the one charting primitive that renders the same
 * everywhere from Gmail to Outlook 2016.
 */
const bar = (percent: number, color: string, height = 10) => {
    const filled = Math.max(0, Math.min(100, Math.round(percent)));
    const empty = 100 - filled;
    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
                ${filled > 0 ? `<td width="${filled}%" style="width:${filled}%; height:${height}px; background:${color}; border-radius:${height / 2}px; font-size:0; line-height:0;">&nbsp;</td>` : ''}
                ${empty > 0 ? `<td width="${empty}%" style="width:${empty}%; height:${height}px; font-size:0; line-height:0;">&nbsp;</td>` : ''}
            </tr>
        </table>`;
};

/**
 * Ranked category breakdown — used for both where money came from and where it
 * went, so the two sections read as one consistent chart.
 */
function renderCategoryChart(
    categories: { name: string; amount: number }[],
    total: number,
    emptyLabel: string
): string {
    if (categories.length === 0) {
        return `<div style="font-size:14px; color:${MUTED};">${emptyLabel}</div>`;
    }

    const top = categories.slice(0, 5);
    const peak = Math.max(1, ...top.map(c => c.amount));

    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            ${top.map(cat => {
                const share = total > 0 ? Math.round((cat.amount / total) * 100) : 0;
                return `
                <tr>
                    <td style="padding:11px 0 4px; font-size:13px; font-weight:700; color:${INK};">
                        ${esc(cat.name)}
                        <span style="font-weight:600; color:${FAINT};"> · ${share}%</span>
                    </td>
                    <td style="padding:11px 0 4px; text-align:right; font-size:13px; font-weight:800; color:${INK}; white-space:nowrap; font-variant-numeric:tabular-nums;">
                        ${money(cat.amount)}
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="padding-bottom:6px;">${bar((cat.amount / peak) * 100, BLUE, 8)}</td>
                </tr>`;
            }).join('')}
        </table>`;
}

/**
 * The card used by both Achievements and Needs your attention — same shape,
 * different accent, so a good week and a worrying one read at the same glance.
 */
const noticeCard = (eyebrow: string, accent: string, heading: string, detail: string) => `
    <tr>
        <td style="padding:14px 18px; background:#FFFFFF; border:1px solid ${RULE}; border-radius:12px;">
            <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:${accent};">${eyebrow}</div>
            <div style="font-size:16px; font-weight:900; color:${INK}; margin-top:4px;">${heading}</div>
            <div style="font-size:12px; color:${MUTED}; margin-top:3px;">${detail}</div>
        </td>
    </tr>
    <tr><td style="height:10px; font-size:0; line-height:0;">&nbsp;</td></tr>`;

const noticeSection = (label: string, cards: string) => `
    <div style="padding:6px 44px 0;">
        <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:${FAINT}; margin-bottom:12px;">${label}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
            ${cards}
        </table>
    </div>`;

function renderAchievements(achievements: Achievement[]): string {
    if (achievements.length === 0) return '';

    const cards = achievements.slice(0, 3).map(a => noticeCard(
        '🏆 New record',
        BLUE,
        `${esc(achievementTitle(a))} — ${money(Number(a.value))}`,
        a.previous_value
            ? `Beats your previous best of ${money(Number(a.previous_value))}.`
            : 'A first for your business.'
    )).join('');

    return noticeSection('Achievements', cards);
}

/**
 * Things to look into. Always rendered, because "nothing to flag" is itself
 * information an owner wants on a Monday morning.
 */
function renderConcerns(concerns: Concern[]): string {
    const cards = concerns.length > 0
        ? concerns.map(c => noticeCard('⚠️ Look into this', AMBER, esc(c.title), esc(c.detail))).join('')
        : noticeCard(
            '✅ All clear',
            GREEN,
            'Nothing needs your attention',
            'No unusual spending, sharp drops or uncategorised costs turned up this week.'
        );

    return noticeSection('Needs your attention', cards);
}

export interface WeeklyHighlightsData {
    orgName: string;
    current: PeriodSummary;
    previous: PeriodSummary;
    achievements: Achievement[];
    concerns: Concern[];
}

/**
 * Newsletter-style weekly financial summary.
 *
 * Layout is table-based with inline styles throughout — the only combination
 * that survives Gmail's CSS stripping and Outlook's Word rendering engine.
 */
export function renderWeeklyHighlightsEmail(data: WeeklyHighlightsData): string {
    const { orgName, current, previous, achievements, concerns } = data;

    const revenueChange = pctChange(current.revenue, previous.revenue);
    const profitUp = current.profit >= previous.profit;
    const range = `${prettyDate(current.start)} – ${prettyDate(current.end)}`;

    const trendPill = (label: string, up: boolean) => `
        <span style="display:inline-block; padding:4px 10px; border-radius:999px; background:${up ? '#E8F1FF' : '#F4F5F6'}; color:${up ? BLUE : MUTED}; font-size:12px; font-weight:800;">
            ${up ? '▲' : '▼'} ${label}
        </span>`;

    const statTile = (label: string, value: string, color: string) => `
        <td width="50%" style="width:50%; padding:16px 12px; text-align:center; vertical-align:top;">
            <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.09em; color:${FAINT};">${label}</div>
            <div style="font-size:22px; font-weight:900; color:${color}; margin-top:6px; letter-spacing:-0.02em; font-variant-numeric:tabular-nums;">${value}</div>
        </td>`;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Your week at ${esc(orgName)}</title>
</head>
<body style="margin:0; padding:0; background:#EAECEF; font-family:${FONT_STACK}; color:${INK};">
    <div style="max-width:640px; margin:0 auto; padding:32px 16px;">
        <div style="background:#ffffff; border:1px solid #E2E5E9; border-radius:14px; overflow:hidden; box-shadow:0 30px 60px -30px rgba(22,24,29,0.28);">

            <!-- Masthead -->
            <div style="padding:28px 44px 18px; border-bottom:1px solid ${HAIRLINE};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td style="font-size:18px; font-weight:900; letter-spacing:-0.02em; color:${INK};">MoneyWise</td>
                        <td style="text-align:right; font-size:12px; font-weight:700; color:${FAINT};">Weekly Highlights</td>
                    </tr>
                </table>
            </div>

            <!-- Hero -->
            <div style="padding:34px 44px 26px; text-align:center;">
                <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:${FAINT};">${esc(orgName)} · ${range}</div>
                <div style="font-size:15px; font-weight:700; color:${BLUE}; margin-top:16px;">Your profit this week</div>
                <div style="font-size:58px; font-weight:900; letter-spacing:-0.035em; line-height:1.05; margin-top:8px; color:${current.profit >= 0 ? INK : '#C0392B'}; font-variant-numeric:tabular-nums;">
                    ${signedMoney(current.profit)}
                </div>
                <div style="margin-top:14px;">
                    ${trendPill(`${Math.abs(pctChange(current.profit, previous.profit))}% vs last week`, profitUp)}
                </div>
            </div>

            <!-- Stat tiles -->
            <div style="padding:0 32px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${RULE}; border-radius:14px; border-collapse:separate;">
                    <tr>
                        ${statTile('Money in', money(current.revenue), INK)}
                        ${statTile('Money out', money(current.spending), INK)}
                    </tr>
                </table>
            </div>

            ${renderAchievements(achievements)}

            ${renderConcerns(concerns)}

            <!-- Where it came from -->
            <div style="padding:30px 44px 6px;">
                <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:${FAINT}; margin-bottom:6px;">Where your money came from</div>
                <div style="font-size:14px; color:${MUTED}; margin-bottom:6px;">
                    You brought in <strong style="color:${INK};">${money(current.revenue)}</strong> this week${
                        previous.revenue > 0
                            ? `, ${revenueChange >= 0 ? 'up' : 'down'} ${Math.abs(revenueChange)}% on the week before`
                            : ''
                    }.
                </div>
                ${renderCategoryChart(current.revenueCategories, current.revenue, 'No income recorded this week.')}
            </div>

            <!-- Where it went -->
            <div style="padding:30px 44px 6px;">
                <div style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:${FAINT}; margin-bottom:6px;">Where your money went</div>
                <div style="font-size:14px; color:${MUTED}; margin-bottom:6px;">
                    ${current.categories[0]
                        ? `<strong style="color:${INK};">${esc(current.categories[0].name)}</strong> was your biggest cost at <strong style="color:${INK};">${money(current.categories[0].amount)}</strong>.`
                        : 'Nothing went out this week.'}
                </div>
                ${renderCategoryChart(current.categories, current.spending, 'No spending recorded this week.')}
            </div>

            ${current.topInflow ? `
            <!-- Biggest win -->
            <div style="padding:26px 44px 6px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #DCE7FB; background:#F5F8FF; border-radius:14px; border-collapse:separate;">
                    <tr>
                        <td style="padding:18px 22px;">
                            <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.09em; color:${BLUE};">Biggest win</div>
                            <div style="font-size:17px; font-weight:900; color:${INK}; margin-top:5px; font-variant-numeric:tabular-nums;">${money(current.topInflow.amount)}</div>
                            <div style="font-size:13px; color:${MUTED}; margin-top:3px;">from ${esc(current.topInflow.label)}</div>
                        </td>
                    </tr>
                </table>
            </div>` : ''}

            <!-- CTA -->
            <div style="padding:30px 44px 10px;">
                <a href="${FRONTEND_URL}/reports" style="display:block; background:${BLUE}; color:#ffffff; font-size:16px; font-weight:800; padding:17px 24px; border-radius:12px; text-decoration:none; text-align:center; font-family:${FONT_STACK};">See your full report</a>
            </div>

            <!-- Footer -->
            <div style="margin-top:22px; padding:24px 44px 34px; border-top:1px solid ${HAIRLINE}; text-align:center;">
                <div style="font-size:14px; font-weight:800; color:${INK}; margin-bottom:8px;">MoneyWise</div>
                <div style="font-size:12px; color:${FAINT}; line-height:1.6;">
                    You're receiving this weekly summary because you're an admin on ${esc(orgName)}.<br>
                    Figures cover ${range} and are based on your recorded cashbook activity.
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Gather one organization's numbers for the week that just ended (Monday to
 * Sunday), and email the newsletter to its admins.
 *
 * `weekOffset` shifts the window back in whole weeks — 0 is the most recently
 * completed week, which is what the Monday-morning cron wants.
 */
export async function sendWeeklyHighlights(
    organizationId: string,
    options: { now?: Date; weekOffset?: number; overrideRecipients?: string[] } = {}
): Promise<{ sent: boolean; recipients: string[]; reason?: string }> {
    const now = options.now || new Date();
    const weekOffset = options.weekOffset ?? 0;

    // The completed week: back up to this week's Monday, then step back.
    const currentWeekStart = addDays(startOfWeek(now), -7 * (weekOffset + 1));
    const start = iso(currentWeekStart);
    const end = iso(addDays(currentWeekStart, 6));
    const prevStart = iso(addDays(currentWeekStart, -7));
    const prevEnd = iso(addDays(currentWeekStart, -1));

    const { orgName, emails } = await emailService.getOrgNotificationRecipients(organizationId);
    const recipients = options.overrideRecipients?.length ? options.overrideRecipients : emails;

    if (recipients.length === 0) {
        return { sent: false, recipients: [], reason: 'no admin recipients' };
    }

    const [current, previous] = await Promise.all([
        getPeriodSummary(organizationId, start, end),
        getPeriodSummary(organizationId, prevStart, prevEnd),
    ]);

    // A week with no money movement at all isn't worth an email — sending one
    // trains admins to ignore the newsletter.
    if (current.revenue === 0 && current.spending === 0) {
        return { sent: false, recipients, reason: 'no activity in period' };
    }

    // Records are surfaced but NOT marked seen here: the in-app badge owns that,
    // so a user who gets the email still sees their confetti in the app.
    let achievements: Achievement[] = [];
    try {
        await detectAchievements(organizationId, now);
        achievements = await getUnseenAchievements(organizationId);
    } catch (err: any) {
        console.error(`[WeeklyHighlights] Achievement lookup failed for org ${organizationId}:`, err?.message || err);
    }

    const html = renderWeeklyHighlightsEmail({
        orgName,
        current,
        previous,
        achievements,
        concerns: buildConcerns(current, previous),
    });

    await emailService.sendEmail({
        to: recipients,
        subject: `Your week at ${orgName} — ${signedMoney(current.profit)} profit`,
        html,
    });

    console.log(`[WeeklyHighlights] Sent ${start}..${end} summary for org ${organizationId} to ${recipients.join(', ')}`);
    return { sent: true, recipients };
}

/**
 * Fan the weekly newsletter out across every active organization. Each org is
 * independent — one failure logs and the run continues.
 */
export async function sendWeeklyHighlightsToAllOrgs(
    options: { now?: Date; weekOffset?: number } = {}
): Promise<{ processed: number; sent: number; skipped: { organizationId: string; reason: string }[] }> {
    const { data: orgs, error } = await supabase
        .from('organizations')
        .select('id, name');

    if (error) throw error;

    let sent = 0;
    const skipped: { organizationId: string; reason: string }[] = [];

    for (const org of orgs || []) {
        try {
            const result = await sendWeeklyHighlights(org.id, options);
            if (result.sent) sent++;
            else skipped.push({ organizationId: org.id, reason: result.reason || 'unknown' });
        } catch (err: any) {
            console.error(`[WeeklyHighlights] Failed for org ${org.id}:`, err?.message || err);
            skipped.push({ organizationId: org.id, reason: err?.message || 'error' });
        }
    }

    console.log(`[WeeklyHighlights] Run complete — ${sent} sent, ${skipped.length} skipped of ${orgs?.length || 0} orgs`);
    return { processed: orgs?.length || 0, sent, skipped };
}
