import { Response } from 'express';
import { supabase } from '../lib/supabase';
import { emailService } from '../services/email.service';
import { openRouterComplete } from '../services/ai/ai.provider';
import {
    computeLoyalty,
    selectAudience,
    LOYALTY_SEGMENTS,
    CampaignAudience,
    LoyaltySegment,
} from '../services/crmLoyalty.service';

// Keeps one request inside the serverless time limit (~100 emails per Resend call).
const MAX_RECIPIENTS = 1000;

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sanitizeAudience = (raw: any): CampaignAudience => {
    const valid = new Set(LOYALTY_SEGMENTS.map(s => s.value));
    return {
        payment: ['ALL', 'OWING', 'CLEAR'].includes(raw?.payment) ? raw.payment : 'ALL',
        product: ['MONEYWISE', 'PROJECT_GENIUS'].includes(raw?.product) ? raw.product : undefined,
        segments: (Array.isArray(raw?.segments) ? raw.segments : []).filter((s: any) => valid.has(s)) as LoyaltySegment[],
        product_keys: (Array.isArray(raw?.product_keys) ? raw.product_keys : []).map(String).slice(0, 50),
    };
};

/** GET /crm/loyalty — a segment/loyalty summary for every customer plus the campaign targeting options. */
export const getLoyaltyOverview = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        if (!organization_id) return res.status(400).json({ error: 'Organization context missing' });

        const data = await computeLoyalty(organization_id);
        const counts: Record<string, number> = {};
        const customers = data.customers.map(c => {
            const l = data.byCustomer.get(c.id)!;
            counts[l.segment] = (counts[l.segment] || 0) + 1;
            return {
                customer_id: c.id,
                product: c.product ?? null,
                segment: l.segment,
                order_count: l.order_count,
                last_purchase_at: l.last_purchase_at,
                days_since_last_purchase: l.days_since_last_purchase,
            };
        });

        res.json({
            segments: LOYALTY_SEGMENTS.map(s => ({ ...s, count: counts[s.value] || 0 })),
            products: data.products,
            customers,
        });
    } catch (error: any) {
        console.error('[CRM] getLoyaltyOverview error:', error);
        res.status(500).json({ error: 'Failed to compute loyalty', details: error.message });
    }
};

/** GET /crm/customers/:id/loyalty — purchase-frequency heatmap data + top 5 favourite products. */
export const getCustomerLoyalty = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        if (!organization_id) return res.status(400).json({ error: 'Organization context missing' });

        const data = await computeLoyalty(organization_id);
        const loyalty = data.byCustomer.get(req.params.id);
        if (!loyalty) return res.status(404).json({ error: 'Customer not found' });

        const { product_keys, ...detail } = loyalty;
        res.json({
            ...detail,
            segment_label: LOYALTY_SEGMENTS.find(s => s.value === loyalty.segment)?.label,
            distinct_products: product_keys.length,
        });
    } catch (error: any) {
        console.error('[CRM] getCustomerLoyalty error:', error);
        res.status(500).json({ error: 'Failed to compute customer loyalty', details: error.message });
    }
};

/** POST /crm/campaigns/preview — who an audience resolves to, before anything is sent. */
export const previewCampaignAudience = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        if (!organization_id) return res.status(400).json({ error: 'Organization context missing' });

        const audience = sanitizeAudience(req.body?.audience);
        const { members, matched, withoutEmail } = selectAudience(await computeLoyalty(organization_id), audience);
        res.json({
            matched,
            recipients: members.length,
            without_email: withoutEmail,
            over_limit: members.length > MAX_RECIPIENTS,
            max_recipients: MAX_RECIPIENTS,
            sample: members.slice(0, 5).map(m => ({ name: m.customer.name, email: m.customer.email })),
            list: members.slice(0, 2000).map(m => ({
                customer_id: m.customer.id,
                name: m.customer.name,
                email: m.customer.email,
                segment: m.loyalty.segment,
                owing_status: m.customer.owing_status,
                order_count: m.loyalty.order_count,
            })),
        });
    } catch (error: any) {
        console.error('[CRM] previewCampaignAudience error:', error);
        res.status(500).json({ error: 'Failed to preview audience', details: error.message });
    }
};

const renderCampaignHtml = (p: {
    orgName: string;
    orgLogoUrl?: string | null;
    body: string;
    ctaLabel?: string;
    ctaUrl?: string;
    customerName: string;
}) => {
    const FONT_STACK = "'DM Sans','Figtree',-apple-system,sans-serif";
    const firstName = p.customerName.trim().split(/\s+/)[0] || 'there';
    const personalised = p.body
        .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
        .replace(/\{\{\s*name\s*\}\}/gi, p.customerName)
        .replace(/\{\{\s*business\s*\}\}/gi, p.orgName);
    // Escape first, then re-introduce structure: blank line = paragraph, single newline = <br>.
    const paragraphs = esc(personalised)
        .split(/\n{2,}/)
        .map(para => `<p style="margin:0 0 16px; font-size:15px; line-height:1.65; color:#16181D;">${para.replace(/\n/g, '<br>')}</p>`)
        .join('');

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0; background:#EAECEF; font-family:${FONT_STACK}; color:#16181D;">
    <div style="max-width:640px; margin:0 auto; padding:32px 16px;">
        <div style="background:#fff; border:1px solid #E2E5E9; border-radius:14px; overflow:hidden; box-shadow:0 30px 60px -30px rgba(22,24,29,0.28);">
            <div style="padding:30px 44px 8px; text-align:center;">
                ${p.orgLogoUrl ? `<img src="${esc(p.orgLogoUrl)}" alt="${esc(p.orgName)}" style="height:40px; width:auto; max-width:140px; object-fit:contain; margin-bottom:10px;">` : ''}
                <div style="font-size:19px; font-weight:800; letter-spacing:-0.02em;">${esc(p.orgName)}</div>
            </div>
            <div style="padding:24px 44px 8px;">${paragraphs}</div>
            ${p.ctaUrl ? `<div style="padding:8px 44px 8px; text-align:center;">
                <a href="${esc(p.ctaUrl)}" style="display:inline-block; background:#006AFF; color:#fff; font-size:15px; font-weight:800; padding:14px 32px; border-radius:12px; text-decoration:none; font-family:${FONT_STACK};">${esc(p.ctaLabel || 'Learn more')}</a>
            </div>` : ''}
            <div style="margin-top:26px; padding:20px 44px 30px; border-top:1px solid #F0F2F4; text-align:center;">
                <div style="font-size:12px; color:#9AA0A7; line-height:1.6;">You're receiving this because you're a customer of ${esc(p.orgName)}. Reply to this email and ask to be removed if you'd rather not hear from us. Sent via MoneyWise.</div>
            </div>
        </div>
    </div>
</body>
</html>`;
};

// Custom HTML designs (uploaded ads). Generous enough for designs with a few inline images.
const MAX_HTML_LENGTH = 1_500_000;

/** Removes the things email clients refuse anyway (scripts, inline handlers, javascript: links). */
const sanitizeEmailHtml = (html: string) =>
    html
        .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
        .replace(/<script\b[^>]*\/?>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2');

/**
 * Renders an uploaded HTML design for one recipient: personalisation tokens are filled in (escaped),
 * and the "why you're receiving this" footer is added just before </body> so every campaign keeps it.
 */
const renderCustomCampaignHtml = (p: { html: string; orgName: string; customerName: string }) => {
    const firstName = p.customerName.trim().split(/\s+/)[0] || 'there';
    const personalised = p.html
        .replace(/\{\{\s*first_name\s*\}\}/gi, esc(firstName))
        .replace(/\{\{\s*name\s*\}\}/gi, esc(p.customerName))
        .replace(/\{\{\s*business\s*\}\}/gi, esc(p.orgName));
    const footer = `<div style="max-width:640px; margin:0 auto; padding:18px 16px 28px; text-align:center; font-family:-apple-system,'Segoe UI',sans-serif; font-size:12px; line-height:1.6; color:#9AA0A7;">You're receiving this because you're a customer of ${esc(p.orgName)}. Reply to this email and ask to be removed if you'd rather not hear from us. Sent via MoneyWise.</div>`;
    if (/<\/body\s*>/i.test(personalised)) return personalised.replace(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i, `${footer}</body>`);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">${personalised}${footer}</body></html>`;
};

/**
 * POST /crm/campaigns/send — { audience, subject, body?, html?, cta_label?, cta_url?, test_only? }
 * With `html` (an uploaded design) the email is that design as-is; otherwise `body` is laid out
 * in the standard MoneyWise template.
 * Sends a personalised email to every emailable customer in the audience. `test_only` sends a single
 * copy to the caller so the message can be proofread first.
 */
export const sendCampaign = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        if (!organization_id) return res.status(400).json({ error: 'Organization context missing' });

        const subject = String(req.body?.subject || '').replace(/[\r\n]+/g, ' ').trim();
        const body = String(req.body?.body || '').trim();
        const ctaUrl = String(req.body?.cta_url || '').trim();
        const ctaLabel = String(req.body?.cta_label || '').trim().slice(0, 60);
        const testOnly = !!req.body?.test_only;
        const rawHtml = typeof req.body?.html === 'string' ? req.body.html.trim() : '';
        const customHtml = rawHtml ? sanitizeEmailHtml(rawHtml) : '';

        if (!subject || subject.length > 150) return res.status(400).json({ error: 'A subject (up to 150 characters) is required' });
        if (rawHtml.length > MAX_HTML_LENGTH) return res.status(400).json({ error: 'The HTML design is too large (max ~1.5 MB). Host images online instead of embedding them.' });
        if (!customHtml && (!body || body.length > 10_000)) return res.status(400).json({ error: 'A message body (up to 10,000 characters) is required' });
        if (ctaUrl && !/^https?:\/\/[^\s]+$/i.test(ctaUrl)) return res.status(400).json({ error: 'The button link must start with http:// or https://' });

        const { data: org } = await supabase
            .from('organizations')
            .select('name, logo_url, email')
            .eq('id', organization_id)
            .maybeSingle();
        const orgName = org?.name || 'MoneyWise';
        const render = (customerName: string) =>
            customHtml
                ? renderCustomCampaignHtml({ html: customHtml, orgName, customerName })
                : renderCampaignHtml({ orgName, orgLogoUrl: org?.logo_url, body, ctaLabel, ctaUrl: ctaUrl || undefined, customerName });
        const personalSubject = (customerName: string) =>
            subject
                .replace(/\{\{\s*first_name\s*\}\}/gi, customerName.trim().split(/\s+/)[0] || 'there')
                .replace(/\{\{\s*name\s*\}\}/gi, customerName)
                .replace(/\{\{\s*business\s*\}\}/gi, orgName);

        if (testOnly) {
            const to = req.user?.email;
            if (!to) return res.status(400).json({ error: 'Your account has no email address to send a test to' });
            const result = await emailService.sendBatch({
                fromName: orgName,
                replyTo: org?.email || undefined,
                messages: [{ to, subject: `[Test] ${personalSubject('Alex Sample')}`, html: render('Alex Sample') }],
            });
            if (result.skipped) return res.status(503).json({ error: 'Email sending is not configured on this server' });
            if (result.failed) return res.status(502).json({ error: 'The test email could not be sent' });
            return res.json({ test: true, sent: 1, to });
        }

        const audience = sanitizeAudience(req.body?.audience);
        const { members, matched, withoutEmail } = selectAudience(await computeLoyalty(organization_id), audience);
        if (members.length === 0) return res.status(400).json({ error: 'No customers with an email address match this audience' });
        if (members.length > MAX_RECIPIENTS) {
            return res.status(400).json({ error: `This audience has ${members.length} recipients; send at most ${MAX_RECIPIENTS} at a time. Narrow the groups and try again.` });
        }

        const result = await emailService.sendBatch({
            fromName: orgName,
            replyTo: org?.email || undefined,
            messages: members.map(m => ({
                to: m.customer.email!.trim(),
                subject: personalSubject(m.customer.name),
                html: render(m.customer.name),
            })),
        });
        if (result.skipped) return res.status(503).json({ error: 'Email sending is not configured on this server' });

        console.log(`[CRM] Campaign${customHtml ? ' (custom HTML)' : ''} by ${req.user?.id} for org ${organization_id}: ${result.sent} sent, ${result.failed} failed, audience ${JSON.stringify(audience)}`);
        res.json({ sent: result.sent, failed: result.failed, matched, without_email: withoutEmail });
    } catch (error: any) {
        console.error('[CRM] sendCampaign error:', error);
        res.status(500).json({ error: 'Failed to send campaign', details: error.message });
    }
};

/**
 * POST /crm/campaigns/draft — { instructions, audience_description?, current_subject?, current_body? }
 * Has the AI write (or revise) a campaign email from the user's instructions. Nothing is sent.
 */
export const draftCampaignEmail = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        if (!organization_id) return res.status(400).json({ error: 'Organization context missing' });

        const instructions = String(req.body?.instructions || '').trim().slice(0, 2000);
        if (instructions.length < 5) return res.status(400).json({ error: 'Tell the AI what the email should say' });
        const audience = String(req.body?.audience_description || '').trim().slice(0, 500);
        const currentSubject = String(req.body?.current_subject || '').trim().slice(0, 150);
        const currentBody = String(req.body?.current_body || '').trim().slice(0, 5000);

        const { data: org } = await supabase.from('organizations').select('name').eq('id', organization_id).maybeSingle();
        const orgName = org?.name || 'the business';

        const system = [
            `You write marketing and customer emails for ${orgName}, a small business in Zambia. Currency is Zambian Kwacha, written like K150.`,
            'Write warm, clear, concise plain-text emails a customer will actually read: a short greeting, 2-4 short paragraphs, a friendly sign-off from the business.',
            'Use the placeholder {{first_name}} for the greeting (e.g. "Hi {{first_name}},"). You may also use {{business}} for the business name. Do not use any other placeholders or square brackets.',
            'Never invent discounts, prices, dates, product names, links or facts that are not in the instructions. If a detail is missing, keep the wording general rather than guessing.',
            'No markdown, no emojis unless asked, no HTML. Separate paragraphs with a blank line.',
            'Reply ONLY with a JSON object: {"subject": string, "body": string}. The subject is under 70 characters.',
        ].join('\n');

        const prompt = [
            audience ? `Audience: ${audience}` : '',
            currentBody ? `Current draft to revise (subject: ${currentSubject || '(none)'}):\n${currentBody}\n` : '',
            `Instructions from the business owner:\n${instructions}`,
        ].filter(Boolean).join('\n\n');

        const raw = await openRouterComplete(prompt, { system, jsonObject: true, timeoutMs: 25_000 });
        let parsed: any;
        try {
            parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        } catch {
            return res.status(502).json({ error: 'The AI returned something unreadable. Please try again.' });
        }
        const subject = String(parsed?.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 150);
        const body = String(parsed?.body || '').trim();
        if (!subject || !body) return res.status(502).json({ error: 'The AI did not produce a complete email. Please try again.' });
        res.json({ subject, body });
    } catch (error: any) {
        console.error('[CRM] draftCampaignEmail error:', error);
        const notConfigured = /not configured/i.test(error?.message || '');
        res.status(notConfigured ? 503 : 500).json({ error: notConfigured ? 'AI drafting is not configured on this server' : 'Failed to draft the email', details: error.message });
    }
};

// ── Saved HTML designs ───────────────────────────────────────────────────────

const designsTableMissing = (error: any) =>
    !!error && (error.code === '42P01' || error.code === 'PGRST205' || /crm_email_designs/.test(error.message || ''));
const DESIGNS_NOT_READY = 'Saved designs are not set up yet (migration 20261104150000_crm_email_designs has not been applied). You can still use the HTML for this email.';

/** GET /crm/email-designs — the organisation's saved HTML email designs, newest first. */
export const listEmailDesigns = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        if (!organization_id) return res.status(400).json({ error: 'Organization context missing' });
        const { data, error } = await supabase
            .from('crm_email_designs')
            .select('id, name, html, created_at, updated_at')
            .eq('organization_id', organization_id)
            .order('updated_at', { ascending: false })
            .limit(50);
        if (error) {
            if (designsTableMissing(error)) return res.json([]);
            throw error;
        }
        res.json(data || []);
    } catch (error: any) {
        console.error('[CRM] listEmailDesigns error:', error);
        res.status(500).json({ error: 'Failed to load saved designs', details: error.message });
    }
};

/** POST /crm/email-designs — { id?, name, html }. Creates a design, or updates one when `id` is given. */
export const saveEmailDesign = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        if (!organization_id) return res.status(400).json({ error: 'Organization context missing' });
        const name = String(req.body?.name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
        const html = typeof req.body?.html === 'string' ? req.body.html.trim() : '';
        const id = req.body?.id ? String(req.body.id) : null;
        if (!name) return res.status(400).json({ error: 'Give the design a name' });
        if (!html) return res.status(400).json({ error: 'The design has no HTML' });
        if (html.length > MAX_HTML_LENGTH) return res.status(400).json({ error: 'The HTML design is too large (max ~1.5 MB). Host images online instead of embedding them.' });

        const now = new Date().toISOString();
        const query = id
            ? supabase.from('crm_email_designs').update({ name, html, updated_at: now }).eq('id', id).eq('organization_id', organization_id)
            : supabase.from('crm_email_designs').insert({ organization_id, name, html, created_by: req.user?.id || null });
        const { data, error } = await query.select('id, name, html, created_at, updated_at').maybeSingle();
        if (error) {
            if (designsTableMissing(error)) return res.status(503).json({ error: DESIGNS_NOT_READY });
            throw error;
        }
        if (!data) return res.status(404).json({ error: 'Design not found' });
        res.json(data);
    } catch (error: any) {
        console.error('[CRM] saveEmailDesign error:', error);
        res.status(500).json({ error: 'Failed to save the design', details: error.message });
    }
};

/** DELETE /crm/email-designs/:id */
export const deleteEmailDesign = async (req: any, res: Response): Promise<any> => {
    try {
        const organization_id = req.user?.organization_id;
        if (!organization_id) return res.status(400).json({ error: 'Organization context missing' });
        const { error } = await supabase
            .from('crm_email_designs')
            .delete()
            .eq('id', req.params.id)
            .eq('organization_id', organization_id);
        if (error) {
            if (designsTableMissing(error)) return res.status(503).json({ error: DESIGNS_NOT_READY });
            throw error;
        }
        res.json({ success: true });
    } catch (error: any) {
        console.error('[CRM] deleteEmailDesign error:', error);
        res.status(500).json({ error: 'Failed to delete the design', details: error.message });
    }
};
