import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { unsubscribeTokenValid, esc } from '../services/emailPersonal';

/**
 * Public (no login): the link in the footer of every nudge email. The token is a signature of the user id, so it can only
 * ever switch that one person's nudge emails off. GET shows a confirmation page after doing it; POST is the one-tap
 * "List-Unsubscribe-Post" that Gmail and Outlook call themselves.
 */
const router = Router();

async function switchOff(userId: string): Promise<boolean> {
    const { data, error } = await supabase.from('users').select('preferences').eq('id', userId).maybeSingle();
    if (error || !data) return false;
    const prefs = (data as any).preferences && typeof (data as any).preferences === 'object' ? (data as any).preferences : {};
    const next = { ...prefs, notifications: { ...(prefs.notifications ?? {}), nudge_emails: false } };
    const { error: e2 } = await supabase.from('users').update({ preferences: next }).eq('id', userId);
    return !e2;
}

const page = (title: string, body: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0; background:#F3F5F7; font-family:-apple-system,'Segoe UI',Roboto,sans-serif; color:#16181D;">
<div style="max-width:440px; margin:12vh auto; padding:32px; background:#fff; border:1px solid #E4E7EB; border-radius:14px; text-align:center;">
<div style="font-size:20px; font-weight:800; color:#006AFF; margin-bottom:18px;">MoneyWise</div>
<div style="font-size:20px; font-weight:800; margin-bottom:10px;">${esc(title)}</div>
<div style="font-size:15px; line-height:1.6; color:#5C636B;">${body}</div></div></body></html>`;

router.get('/unsubscribe', async (req, res) => {
    const u = String(req.query.u ?? ''), t = String(req.query.t ?? '');
    if (!u || !unsubscribeTokenValid(u, t)) return res.status(400).type('html').send(page('This link is not valid', 'It may have been copied incorrectly. You can also turn these emails off in the app under Settings.'));
    const ok = await switchOff(u);
    if (!ok) return res.status(500).type('html').send(page('Something went wrong', 'We could not update your settings. Please try again in a moment.'));
    return res.type('html').send(page('You’re unsubscribed', 'You won’t get progress tips and reminders by email any more. Payment receipts and account emails will still reach you.'));
});

router.post('/unsubscribe', async (req, res) => {
    const u = String(req.query.u ?? ''), t = String(req.query.t ?? '');
    if (!u || !unsubscribeTokenValid(u, t)) return res.status(400).json({ error: 'Invalid link' });
    return (await switchOff(u)) ? res.json({ ok: true }) : res.status(500).json({ error: 'Could not update' });
});

export default router;
