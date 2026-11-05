/**
 * Email capture through Resend. Each business gets its own address at the receiving subdomain. Resend's webhook carries
 * metadata only, so the webhook stores and queues, and the worker fetches the body and attachments through the API.
 * Attachment links last an hour, so files are copied into our own bucket as soon as the job runs.
 */
import crypto from 'crypto';
import { Resend } from 'resend';
import { supabase } from '../../lib/supabase';
import { emailService } from '../email.service';
import { getCaptureSettings } from './capture.settings';
import { saveEvidenceFile } from './capture.media';
import { CaptureError, matchAndRoute, reserveAiCall } from './capture.service';
import { shouldExtractEmail } from './capture.prefilter';
import { extractFromEmail, parseExtraction, amountAppearsInText, type Extraction } from './capture.extract';
import { looksLikeInjection, lusakaDate, recipientAlias, LENCO_WINDOW_DATE_ONLY_MIN } from './capture.logic';

const MAX_TEXT = 20_000;
const MAX_ATTACHMENTS = 5;
const inboundDomain = () => process.env.RESEND_INBOUND_DOMAIN || 'naunal.resend.app';
const client = () => new Resend(process.env.RESEND_API_KEY);

/** The org's forwarding address, created the first time it's asked for. */
export async function emailCaptureStatus(orgId: string) {
    const { data: row } = await supabase.from('capture_settings').select('email_alias, email_last_received_at').eq('organization_id', orgId).maybeSingle();
    if (!row) throw new CaptureError('Turn on transaction capture first', 409);
    let alias: string | null = row.email_alias;
    if (!alias) {
        const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
        const slug = String(org?.name || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12) || 'business';
        for (let i = 0; i < 3 && !alias; i++) {
            const candidate = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
            const { error } = await supabase.from('capture_settings').update({ email_alias: candidate }).eq('organization_id', orgId);
            if (!error) alias = candidate;
            else if (error.code !== '23505') throw new CaptureError('Could not create your capture address', 500);
        }
        if (!alias) throw new CaptureError('Could not create your capture address', 500);
    }
    // Gmail confirms a forwarding address by emailing a code to it, so the person needs to see that message here.
    const { data: confirm } = await supabase.from('inbound_emails').select('text').eq('organization_id', orgId)
        .ilike('from_address', '%forwarding-noreply@google.com%').gte('received_at', new Date(Date.now() - 86400_000).toISOString())
        .order('received_at', { ascending: false }).limit(1).maybeSingle();
    return {
        address: `${alias}@${inboundDomain()}`, lastReceivedAt: row.email_last_received_at ?? null,
        gmailConfirmation: confirm?.text ? String(confirm.text).slice(0, 600) : null,
    };
}

export async function sendTestEmail(orgId: string) {
    const { address } = await emailCaptureStatus(orgId);
    const sent = await emailService.sendEmail({ to: address, subject: 'MoneyWise capture test', html: '<p>Your capture address is working.</p>' });
    if (!sent) throw new CaptureError('The test email could not be sent', 502);
    return { sent: true };
}

/** POST /integrations/email/inbound. A bad signature stores nothing. Unknown addresses get 200 so Resend stops retrying. */
export const receiveInboundEmail = async (req: any, res: any) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret || !req.rawBody) return res.sendStatus(401);
    let event: any;
    try {
        event = client().webhooks.verify({
            payload: req.rawBody.toString('utf8'),
            headers: { id: String(req.header('svix-id') || ''), timestamp: String(req.header('svix-timestamp') || ''), signature: String(req.header('svix-signature') || '') },
            webhookSecret: secret,
        });
    } catch {
        return res.sendStatus(401);
    }
    if (event?.type !== 'email.received') return res.sendStatus(200);
    try {
        await storeInboundEmail(event.data);
        res.sendStatus(200);
    } catch (e: any) {
        console.error('[Capture] inbound email failed:', e?.message);
        res.sendStatus(500);
    }
};

async function storeInboundEmail(d: any) {
    const alias = recipientAlias([d?.received_for, d?.to], inboundDomain());
    if (!alias || !d?.email_id) return;
    const { data: row } = await supabase.from('capture_settings').select('organization_id').eq('email_alias', alias).maybeSingle();
    if (!row) return;
    const orgId = row.organization_id as string;
    if (!(await getCaptureSettings(orgId)).enabled) return;

    const now = new Date().toISOString();
    await supabase.from('capture_settings').update({ email_last_received_at: now }).eq('organization_id', orgId);
    const { data: email, error } = await supabase.from('inbound_emails').insert({
        organization_id: orgId, resend_id: d.email_id, message_id: d.message_id || d.email_id,
        from_address: typeof d.from === 'string' ? d.from.slice(0, 300) : null, subject: typeof d.subject === 'string' ? d.subject.slice(0, 500) : null,
        received_at: d.created_at || now,
    }).select('id').single();
    if (error?.code === '23505') return;   // a retried delivery
    if (error || !email) throw new Error(`Could not save email: ${error?.message}`);
    const { error: jobErr } = await supabase.from('capture_jobs').insert({ kind: 'EMAIL', inbound_email_id: email.id, organization_id: orgId });
    if (jobErr) throw new Error(`Could not queue email: ${jobErr.message}`);
}

export async function processEmailJob(job: { job_id: string; organization_id: string; attempts: number }) {
    const orgId = job.organization_id;
    const { data: link, error: linkErr } = await supabase.from('capture_jobs').select('inbound_email_id').eq('id', job.job_id).maybeSingle();
    if (linkErr || !link?.inbound_email_id) throw new Error('Email job has no email');
    const { data: email } = await supabase.from('inbound_emails').select('*').eq('id', link.inbound_email_id).eq('organization_id', orgId).maybeSingle();
    if (!email) return { skipped: 'email_missing' };

    const resend = client();
    const { data: full, error } = await resend.emails.receiving.get(email.resend_id);
    if (error || !full) throw new Error(`Could not read email: ${error?.message}`);
    const text = (full.text || String(full.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).slice(0, MAX_TEXT);
    await supabase.from('inbound_emails').update({ text }).eq('id', email.id).eq('organization_id', orgId);

    const hasAttachments = (full.attachments?.length ?? 0) > 0;
    if (!shouldExtractEmail({ from: full.from, subject: full.subject, text, headers: full.headers, hasAttachment: hasAttachments })) return { skipped: 'prefilter' };

    // An invoice or receipt file is the better evidence, so it goes through OCR like an upload.
    if (hasAttachments) {
        const { data: list, error: listErr } = await resend.emails.receiving.attachments.list({ emailId: email.resend_id });
        if (listErr) throw new Error(`Could not list attachments: ${listErr.message}`);
        let saved = 0;
        for (const a of (list?.data ?? []).slice(0, MAX_ATTACHMENTS)) {
            const file = await fetch(a.download_url);
            if (!file.ok) throw new Error(`Could not download attachment (${file.status})`);
            const stored = await saveEvidenceFile({
                orgId, buf: Buffer.from(await file.arrayBuffer()), mime: a.content_type, sourceTable: 'inbound_emails', sourceId: email.id,
            });
            if (stored) saved++;
        }
        if (saved > 0) return { attachments: saved };
    }
    return captureEmailText(job, email, text);
}

async function captureEmailText(job: { organization_id: string; attempts: number }, email: any, text: string) {
    const orgId = job.organization_id;
    const dedupeKey = `email:${email.message_id}`;
    const { data: already } = await supabase.from('transaction_captures').select('id').eq('organization_id', orgId).eq('dedupe_key', dedupeKey).maybeSingle();
    if (already) return { captureId: already.id };

    const settings = await getCaptureSettings(orgId);
    const body = `${email.subject || ''}\n${text}`;
    const flags: string[] = looksLikeInjection(body) ? ['INJECTION_SUSPECTED'] : [];
    let x: Extraction | null = null;
    let aiCalls = 0;
    if (await reserveAiCall(orgId, settings.dailyAiBudget)) {
        aiCalls = 1;
        try {
            x = parseExtraction(await extractFromEmail({ from: email.from_address, subject: email.subject, text }));
            if (!x) flags.push('EXTRACTION_INVALID');
        } catch (e) {
            if (job.attempts < 3) throw e;
            flags.push('AI_UNAVAILABLE');
        }
    } else {
        flags.push('AI_BUDGET_EXCEEDED');
    }
    if (x?.intent === 'NOT_TRANSACTION' && !flags.includes('INJECTION_SUSPECTED')) return { skipped: 'not_transaction' };

    const amount = x?.amount ?? null;
    const currency = x?.currency || (amount ? 'ZMW' : null);
    const zmw = currency === 'ZMW' ? amount : null;
    if (x && amount && !amountAppearsInText(amount, body)) flags.push('AMOUNT_NOT_IN_TEXT');
    if (x && !amount) flags.push('NO_AMOUNT');
    if (amount && !zmw) flags.push('UNCONVERTED_CURRENCY');

    const { data: created, error } = await supabase.from('transaction_captures').insert({
        organization_id: orgId, source: 'EMAIL', source_ids: [email.id], dedupe_key: dedupeKey, status: 'NEW', claim_state: 'CLAIMED', ai_calls: aiCalls, flags,
        direction: x?.direction ?? null, amount, currency, zmw_amount: zmw, line_items: x?.line_items ?? [], occurred_at: email.received_at,
        occurred_on: x?.date ?? lusakaDate(email.received_at), counterparty_name: x?.counterparty ?? email.from_address, payment_method: x?.payment_method ?? 'UNKNOWN',
        intent: x?.intent === 'NOT_TRANSACTION' ? null : x?.intent ?? null, confidence: x?.confidence ?? null, model: x ? 'openrouter' : null, deterministic: false,
        evidence_summary: x?.evidence_summary ?? String(email.subject || '').slice(0, 200), reasoning: 'Receipt has no time; matched on the whole day',
    }).select('*').single();
    if (error?.code === '23505') return { merged: true };
    if (error || !created) throw new Error(`Could not save capture: ${error?.message}`);
    if (x?.intent !== 'ORDER_ONLY') await matchAndRoute(created, settings, { windowMin: LENCO_WINDOW_DATE_ONLY_MIN, categorise: true });
    return { captureId: created.id };
}
