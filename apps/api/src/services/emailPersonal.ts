import crypto from 'crypto';
import { supabase } from '../lib/supabase';

/**
 * Everything that makes an email feel like it was written to one person: their first name, a subject that says
 * something, one clear button, and a footer that says why they are getting it and how to stop it. Used by the
 * payment/inflow/weekly emails and by the nudge emails.
 */

const BLUE = '#006AFF';
const INK = '#16181D';
const MUTED = '#5C636B';
const FAINT = '#9AA0A7';
const HAIRLINE = '#F0F2F4';
const FONT = "'DM Sans','Figtree',-apple-system,'Segoe UI',Roboto,sans-serif";

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const kwacha = (n: number) => `K${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
export const kwacha2 = (n: number) => `K${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export interface Person { userId: string | null; email: string; firstName: string | null }

/** "Charley" from a user row. Anything that is not a real first name (an email, a number, a workspace label) gives null, so the greeting falls back to "Hi there". */
export function firstNameOf(u: { first_name?: string | null; name?: string | null; email?: string | null } | null | undefined): string | null {
    const pick = (raw?: string | null) => {
        const word = String(raw ?? '').trim().split(/\s+/)[0] ?? '';
        if (!word || /[@\d_]/.test(word) || word.length > 24) return null;
        if (/^(workspace|personal|individual|private|admin|user|customer|owner)$/i.test(word)) return null;
        return word.charAt(0).toUpperCase() + word.slice(1);
    };
    return pick(u?.first_name) ?? pick(u?.name);
}

/** The people behind a list of addresses (so each can be greeted by name). Unknown addresses keep a null name. */
export async function peopleForEmails(emails: string[]): Promise<Person[]> {
    const list = [...new Set(emails.map((e) => e.trim()).filter(Boolean))];
    if (!list.length) return [];
    const { data } = await supabase.from('users').select('id, email, name, first_name').in('email', list);
    const byEmail = new Map<string, any>((data ?? []).map((u: any) => [String(u.email).toLowerCase(), u]));
    return list.map((email) => {
        const u = byEmail.get(email.toLowerCase());
        return { userId: u?.id ?? null, email, firstName: firstNameOf(u) };
    });
}

// ── Unsubscribe links ────────────────────────────────────────────────────────────────────────────────────────────
// A signed link per person (no login needed, as the one-click unsubscribe standard requires). It can only ever
// switch that person's nudge emails off.

const secret = () => process.env.EMAIL_PREFS_SECRET || process.env.LENCO_SYNC_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-only-secret';
export const unsubscribeToken = (userId: string) => crypto.createHmac('sha256', secret()).update(`unsub:${userId}`).digest('base64url').slice(0, 32);
export const unsubscribeTokenValid = (userId: string, token: string) => {
    const a = Buffer.from(unsubscribeToken(userId)); const b = Buffer.from(String(token ?? ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const apiBase = () => (process.env.API_PUBLIC_URL || 'https://money-wise-pro-api.vercel.app').replace(/\/$/, '');
export const unsubscribeUrl = (userId: string) => `${apiBase()}/email-prefs/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;

/** Headers that tell Gmail/Outlook this is mail the person can opt out of (one tap), which is what keeps it out of spam. */
export const unsubscribeHeaders = (userId: string): Record<string, string> => ({
    'List-Unsubscribe': `<${unsubscribeUrl(userId)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
});

// ── Layout ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const greeting = (firstName: string | null) => (firstName ? `Hi ${esc(firstName)},` : 'Hi there,');

export interface LayoutOptions {
    /** The grey line a mail app shows next to the subject. Say something useful in it. */
    preheader: string;
    /** Big first line, e.g. "Charley, you're 2 steps from your first report". */
    heading: string;
    firstName: string | null;
    /** The message: paragraphs, lists, small tables. Trusted HTML (escape what comes from users). */
    bodyHtml: string;
    cta?: { label: string; url: string };
    /** "You're getting this because …" */
    reason: string;
    /** Set for nudge emails: adds the unsubscribe link in the footer. */
    unsubscribeFor?: string | null;
}

export function personalLayout(o: LayoutOptions): string {
    const cta = o.cta
        ? `<div style="padding:8px 40px 6px;"><a href="${esc(o.cta.url)}" style="display:inline-block; background:${BLUE}; color:#ffffff; font-size:15px; font-weight:700; padding:14px 26px; border-radius:10px; text-decoration:none; font-family:${FONT};">${esc(o.cta.label)}</a></div>`
        : '';
    const unsub = o.unsubscribeFor
        ? ` <a href="${esc(unsubscribeUrl(o.unsubscribeFor))}" style="color:${FAINT}; text-decoration:underline;">Unsubscribe from these tips</a>.`
        : '';
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${esc(o.heading)}</title>
</head>
<body style="margin:0; padding:0; background:#F3F5F7; font-family:${FONT}; color:${INK};">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; font-size:1px; line-height:1px; color:#F3F5F7;">${esc(o.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <div style="max-width:600px; margin:0 auto; padding:24px 12px;">
        <div style="padding:6px 8px 16px; font-size:20px; font-weight:800; letter-spacing:-0.02em; color:${BLUE};">MoneyWise</div>
        <div style="background:#ffffff; border:1px solid #E4E7EB; border-radius:14px; overflow:hidden;">
            <div style="padding:34px 40px 8px;">
                <div style="font-size:14px; color:${MUTED}; margin-bottom:10px;">${greeting(o.firstName)}</div>
                <div style="font-size:24px; line-height:1.25; font-weight:800; letter-spacing:-0.02em; color:${INK};">${o.heading}</div>
            </div>
            <div style="padding:14px 40px 22px; font-size:15px; line-height:1.6; color:#3A4048;">${o.bodyHtml}</div>
            ${cta}
            <div style="height:30px; font-size:0; line-height:0;">&nbsp;</div>
        </div>
        <div style="padding:18px 12px 8px; font-size:12px; line-height:1.6; color:${FAINT}; text-align:center;">
            ${esc(o.reason)}${unsub}<br>
            MoneyWise &middot; Lusaka, Zambia
        </div>
    </div>
</body>
</html>`;
}

/** A small stat block used inside bodies: label over a big number. */
export const statRow = (items: { label: string; value: string; tone?: 'good' | 'bad' | 'plain' }[]) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 14px; border:1px solid ${HAIRLINE}; border-radius:12px; border-collapse:separate;">
    <tr>${items.map((s) => `
        <td style="padding:14px 8px; text-align:center; vertical-align:top;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${FAINT};">${esc(s.label)}</div>
            <div style="font-size:21px; font-weight:800; margin-top:5px; color:${s.tone === 'good' ? '#047857' : s.tone === 'bad' ? '#B45309' : INK};">${esc(s.value)}</div>
        </td>`).join('')}
    </tr>
</table>`;

/** A checklist line: done steps are ticked, the next one is highlighted. */
export const checkLine = (done: boolean, text: string, next = false) => `
<tr>
    <td style="width:28px; padding:7px 0; vertical-align:top; font-size:16px; color:${done ? '#047857' : next ? BLUE : FAINT};">${done ? '&#10003;' : next ? '&#9654;' : '&#9675;'}</td>
    <td style="padding:7px 0; font-size:15px; ${done ? `color:${FAINT}; text-decoration:line-through;` : next ? `color:${INK}; font-weight:700;` : `color:#3A4048;`}">${text}</td>
</tr>`;

export const checklist = (rows: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;">${rows}</table>`;

export const para = (html: string) => `<p style="margin:0 0 14px;">${html}</p>`;
