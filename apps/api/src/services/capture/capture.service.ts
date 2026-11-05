/**
 * capture.service.ts — Phase 0 of AI transaction capture: the shared review queue.
 *
 * Evidence (receipt uploads; MoMo Capture rows via capture.momoMirror) becomes transaction_captures drafts. The model
 * (OCR) only fills drafts; dedupe, matching, posting and undo are deterministic and live here + capture.logic.
 * Off-platform money is booked ONLY through recordManualEntry (or MoMo Capture's own post for MoMo rows). Money that
 * already reached a Lenco wallet is enriched, never booked again.
 */
import crypto from 'crypto';
import { supabase } from '../../lib/supabase';
import { ocrService, normalizeCurrency, type ReceiptOcrData } from '../ai/ocr.service';
import { memoryService } from '../ai/memory.service';
import { parseMomoMessage } from '../momoCapture/parser';
import * as momo from '../momoCapture/momoCapture.service';
import {
    recordManualEntry, suggestCategory, listExternalWallets, matchExternalWallet, ensureCashWallet, categoriesFor, ManualEntryError,
} from '../manualEntry.service';
import { ledgerService } from '../ledger.service';
import { cashbookService } from '../cashbook.service';
import { releaseAllocationsIfNotReceivable, listOpenInvoices, allocatePayment } from '../customerInvoice.service';
import { getCaptureSettings, type CaptureSettings } from './capture.settings';
import { mirrorMomoCapture } from './capture.momoMirror';
import {
    scoreCandidates, decideMerge, decideAutoPost, captureDedupeKey, looksLikeInjection, paymentMethodFrom, draftDiff, lusakaDate,
    LENCO_WINDOW_MIN, LENCO_WINDOW_DATE_ONLY_MIN, MOMO_WINDOW_MIN, UNDO_WINDOW_DAYS, type ScoredCandidate,
} from './capture.logic';

export class CaptureError extends Error {
    constructor(message: string, public httpStatus = 400) { super(message); }
}

export const CAPTURE_BUCKET = 'capture-attachments';
const SIGNED_URL_TTL_S = 600;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const OPEN = ['NEW', 'NEEDS_REVIEW'];
const STALE_LOCK_MS = 2 * 60_000;
const now = () => new Date().toISOString();
const r2 = (n: number) => Math.round(n * 100) / 100;

async function audit(orgId: string, userId: string | null, captureId: string, action: string, changes: Record<string, any> = {}) {
    await supabase.from('audit_logs').insert({
        entity_type: 'TRANSACTION_CAPTURE', entity_id: captureId, action, user_id: userId && userId !== 'service-role-admin' ? userId : null,
        changes: { organization_id: orgId, ...changes },
    }).then(() => undefined, () => undefined);
}

async function requireEnabled(orgId: string): Promise<CaptureSettings> {
    const s = await getCaptureSettings(orgId);
    if (!s.enabled) throw new CaptureError('Transaction capture is turned off for this business', 403);
    return s;
}

async function loadCapture(orgId: string, id: string) {
    const { data, error } = await supabase.from('transaction_captures').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
    if (error) throw new CaptureError(error.message, 500);
    if (!data) throw new CaptureError('Capture not found', 404);
    return data;
}

/** Conditional status flip = the lock. Stale POSTING locks (crashed request) can be taken over. */
async function lockCapture(orgId: string, id: string, from: string[]) {
    const staleBefore = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data } = await supabase.from('transaction_captures').update({ status: 'POSTING', updated_at: now() })
        .eq('id', id).eq('organization_id', orgId)
        .or(`status.in.(${from.join(',')}),and(status.eq.POSTING,updated_at.lt."${staleBefore}")`)
        .select('*').maybeSingle();
    return data;
}

/** Reserves one AI call against today's budget. Any failure means no: the budget fails closed. */
export async function reserveAiCall(orgId: string, budget: number): Promise<boolean> {
    const { data, error } = await supabase.rpc('reserve_capture_ai_call', { p_org: orgId, p_day: lusakaDate(now()), p_budget: budget });
    return !error && data === true;
}

// ───────────────────────────────────────────── upload ─────────────────────────────────────────────

export async function createFromUpload(orgId: string, userId: string, body: { fileBase64?: unknown; mime?: unknown }) {
    await requireEnabled(orgId);
    const mime = typeof body.mime === 'string' ? body.mime.toLowerCase() : '';
    if (!MIME_EXT[mime]) throw new CaptureError('Upload a photo (JPG, PNG, WebP) or a PDF');
    const b64 = typeof body.fileBase64 === 'string' ? body.fileBase64.replace(/^data:[^;]+;base64,/, '') : '';
    const buf = Buffer.from(b64, 'base64');
    if (buf.length === 0) throw new CaptureError('The file is empty');
    if (buf.length > MAX_UPLOAD_BYTES) throw new CaptureError('The file is larger than 10 MB', 413);

    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const { data: dup } = await supabase.from('capture_attachments').select('id').eq('organization_id', orgId).eq('sha256', sha256).maybeSingle();
    if (dup) {
        const { data: cap } = await supabase.from('transaction_captures').select('id, status')
            .eq('organization_id', orgId).contains('source_ids', [dup.id]).limit(1).maybeSingle();
        return { attachmentId: dup.id, duplicate: true, capture: cap ?? null };
    }

    const path = `${orgId}/${lusakaDate(now()).slice(0, 7)}/${sha256}.${MIME_EXT[mime]}`;
    const { error: upErr } = await supabase.storage.from(CAPTURE_BUCKET).upload(path, buf, { contentType: mime, upsert: false });
    if (upErr && !/exists/i.test(upErr.message)) throw new CaptureError(`Could not store the file: ${upErr.message}`, 500);

    const { data: att, error } = await supabase.from('capture_attachments').insert({
        organization_id: orgId, uploaded_by: userId, source_table: 'UPLOAD', storage_path: path, mime, size_bytes: buf.length, sha256,
    }).select('id').single();
    if (error) {
        if (error.code === '23505') return createFromUpload(orgId, userId, body);   // raced an identical upload
        throw new CaptureError(`Could not save the file: ${error.message}`, 500);
    }
    const { error: jobErr } = await supabase.from('capture_jobs').insert({ kind: 'ATTACHMENT', attachment_id: att.id, organization_id: orgId });
    if (jobErr) throw new CaptureError(`Could not queue the file: ${jobErr.message}`, 500);
    await audit(orgId, userId, att.id, 'CAPTURE_UPLOADED', { attachment_id: att.id, mime, size_bytes: buf.length });
    return { attachmentId: att.id, duplicate: false, capture: null };
}

// ───────────────────────────────────────── worker: attachment ─────────────────────────────────────────

const toIso = (date?: string | null, time?: string | null): { at: string | null; hasTime: boolean } => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { at: null, hasTime: false };
    const hhmm = /^\d{1,2}:\d{2}/.test(String(time || '')) ? String(time).slice(0, 5).padStart(5, '0') : null;
    const d = new Date(`${date}T${hhmm ?? '12:00'}:00+02:00`);
    return Number.isNaN(d.getTime()) ? { at: null, hasTime: false } : { at: d.toISOString(), hasTime: !!hhmm };
};

/** OCR → draft → match → categorise → auto-post or queue. Idempotent per attachment (a retry finds its capture). */
export async function processAttachmentJob(job: { attachment_id: string; organization_id: string; attempts: number }) {
    const orgId = job.organization_id;
    const settings = await getCaptureSettings(orgId);
    if (!settings.enabled) return { skipped: 'capture_disabled' };

    const { data: att } = await supabase.from('capture_attachments').select('*').eq('id', job.attachment_id).eq('organization_id', orgId).maybeSingle();
    if (!att) return { skipped: 'attachment_missing' };
    const { data: already } = await supabase.from('transaction_captures').select('id').eq('organization_id', orgId).contains('source_ids', [att.id]).limit(1).maybeSingle();
    if (already) return { captureId: already.id };

    const flags: string[] = [];
    let ocr: ReceiptOcrData | null = (att.ocr_json as ReceiptOcrData) ?? null;
    let aiCalls = 0;
    if (!ocr) {
        if (!(await reserveAiCall(orgId, settings.dailyAiBudget))) {
            flags.push('AI_BUDGET_EXCEEDED');
        } else {
            const { data: file, error } = await supabase.storage.from(CAPTURE_BUCKET).download(att.storage_path);
            if (error || !file) throw new Error(`Could not read stored file: ${error?.message}`);
            ocr = await ocrService.analyzeReceipt(undefined, Buffer.from(await file.arrayBuffer()));
            aiCalls = 1;
            if (ocr?.error) {
                if (job.attempts < 3) throw new Error(`OCR failed: ${ocr.error}`);
                flags.push('AI_UNAVAILABLE'); ocr = null;
            } else {
                await supabase.from('capture_attachments').update({ ocr_json: ocr, ocr_at: now() }).eq('id', att.id);
            }
        }
    }

    const raw = ocr?.raw_text || '';
    if (looksLikeInjection(`${raw}\n${ocr?.notes || ''}`)) flags.push('INJECTION_SUSPECTED');
    const parsed = raw ? parseMomoMessage(raw) : null;   // deterministic parser beats the model when it parses
    const { at, hasTime } = toIso(ocr?.date, ocr?.time);

    let draft: Record<string, any>;
    if (parsed) {
        draft = {
            direction: parsed.direction, amount: parsed.amount, currency: 'ZMW', zmw_amount: parsed.amount, counterparty_name: parsed.counterparty,
            payment_method: 'MOMO_PERSONAL', intent: parsed.direction === 'IN' ? 'PAYMENT_PROOF' : 'PURCHASE', confidence: 1, model: 'momo-parser',
            deterministic: true, evidence_summary: `${parsed.provider} mobile money · ${parsed.direction === 'IN' ? 'received from' : 'sent to'} ${parsed.counterparty ?? 'unknown'}`.slice(0, 200),
            dedupe_key: captureDedupeKey({ momo: { parsed, rawText: raw } }),
        };
    } else {
        const currency = normalizeCurrency(ocr?.currency) || (ocr?.total_amount ? 'ZMW' : null);
        const amount = Number(ocr?.total_amount) > 0 ? r2(Number(ocr!.total_amount)) : null;
        const zmw = currency === 'ZMW' ? amount : (Number(ocr?.zmw_equivalent) > 0 ? r2(Number(ocr!.zmw_equivalent)) : null);
        if (!amount) flags.push('NO_AMOUNT');
        else if (!zmw) flags.push('UNCONVERTED_CURRENCY');
        draft = {
            direction: 'OUT', amount, currency, zmw_amount: zmw, counterparty_name: ocr?.vendor ?? null,
            payment_method: paymentMethodFrom(ocr?.payment_method), intent: amount ? 'PURCHASE' : null,
            confidence: ocr?.confidence ?? null, model: ocr ? 'ocr' : null, deterministic: false,
            line_items: (ocr?.line_items || []).slice(0, 50).map(li => ({ name: li.description, qty: li.quantity ?? null, unit_price: li.unit_price ?? null, total: li.total ?? null, product_id: null })),
            evidence_summary: [ocr?.vendor || 'Receipt', ocr?.receipt_number ? `#${ocr.receipt_number}` : null, ocr?.vat_amount ? `VAT ${ocr.vat_amount}` : null]
                .filter(Boolean).join(' · ').slice(0, 200),
            dedupe_key: captureDedupeKey({ sha256: att.sha256 }),
        };
    }

    // A file sent in a chat is a customer's proof of payment: money in, and only ever a claim.
    const { data: msg } = att.source_table === 'messaging_messages' && att.source_id
        ? await supabase.from('messaging_messages').select('id, platform, contact_phone, contact_name, conversation_id, sent_at').eq('id', att.source_id).eq('organization_id', orgId).maybeSingle()
        : { data: null as any };
    if (msg) Object.assign(draft, {
        direction: 'IN', intent: draft.amount ? 'PAYMENT_PROOF' : null, counterparty_phone: msg.contact_phone ?? null,
        counterparty_name: msg.contact_name ?? draft.counterparty_name ?? null, conversation_id: msg.conversation_id ?? null,
    });

    const occurredAt = at ?? msg?.sent_at ?? att.created_at;
    const { data: inserted, error } = await supabase.from('transaction_captures').insert({
        ...draft, organization_id: orgId, source: msg?.platform ?? 'RECEIPT_UPLOAD', source_ids: msg ? [att.id, msg.id] : [att.id], created_by: att.uploaded_by,
        occurred_at: occurredAt, occurred_on: lusakaDate(occurredAt), claim_state: 'CLAIMED', ai_calls: aiCalls, flags, status: 'NEW',
        reasoning: hasTime ? null : 'Receipt has no time; matched on the whole day',
    }).select('*').single();

    if (error?.code === '23505') {
        // Same movement already captured (e.g. the MoMo SMS of this screenshot): add this file as evidence.
        const { data: twin } = await supabase.from('transaction_captures').select('id, source_ids').eq('organization_id', orgId).eq('dedupe_key', draft.dedupe_key).maybeSingle();
        if (twin) {
            await supabase.from('transaction_captures').update({ source_ids: Array.from(new Set([...(twin.source_ids || []), att.id])), updated_at: now() }).eq('id', twin.id);
            return { captureId: twin.id, merged: true };
        }
    }
    if (error || !inserted) throw new Error(`Could not save capture: ${error?.message}`);

    await matchAndRoute(inserted, settings, { windowMin: hasTime || parsed ? LENCO_WINDOW_MIN : LENCO_WINDOW_DATE_ONLY_MIN, categorise: true });
    return { captureId: inserted.id };
}

// ───────────────────────────────────────── matching (both directions) ─────────────────────────────────────────

async function takenEntryIds(orgId: string, ids: string[], exceptCaptureId: string): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const [a, b] = await Promise.all([
        supabase.from('transaction_captures').select('id, matched_cashbook_entry_id').eq('organization_id', orgId).in('matched_cashbook_entry_id', ids).not('status', 'in', '(DISMISSED,FAILED)'),
        supabase.from('transaction_captures').select('id, cashbook_entry_id').eq('organization_id', orgId).in('cashbook_entry_id', ids),
    ]);
    const s = new Set<string>();
    for (const r of a.data || []) if (r.id !== exceptCaptureId) s.add(r.matched_cashbook_entry_id);
    for (const r of b.data || []) if (r.id !== exceptCaptureId) s.add(r.cashbook_entry_id);
    return s;
}

async function lencoCandidates(cap: any, windowMin: number): Promise<ScoredCandidate[]> {
    const t = new Date(cap.occurred_at).getTime();
    const { data } = await supabase.from('cashbook_entries').select('id, debit, credit, description, created_at, transaction_at')
        .eq('organization_id', cap.organization_id).eq('account_type', 'MONEYWISE_WALLET')
        .eq(cap.direction === 'IN' ? 'debit' : 'credit', cap.zmw_amount)
        .gte('created_at', new Date(t - windowMin * 60_000).toISOString())
        .lte('created_at', new Date(t + windowMin * 60_000 + 6 * 3600_000).toISOString())   // sync can book a few hours late
        .limit(50);
    const taken = await takenEntryIds(cap.organization_id, (data || []).map((e: any) => e.id), cap.id);
    return scoreCandidates(
        { amount: cap.zmw_amount, at: cap.occurred_at, phone: cap.counterparty_phone },
        (data || []).filter((e: any) => !taken.has(e.id)).map((e: any) => ({
            id: e.id, amount: Number(cap.direction === 'IN' ? e.debit : e.credit), at: e.transaction_at || e.created_at, text: e.description,
        })),
        windowMin,
    );
}

async function momoCandidates(cap: any): Promise<ScoredCandidate[]> {
    const t = new Date(cap.occurred_at).getTime();
    const { data } = await supabase.from('momo_captures').select('id, amount, occurred_at, raw_text')
        .eq('organization_id', cap.organization_id).eq('direction', cap.direction).eq('amount', cap.zmw_amount).neq('status', 'DISMISSED')
        .gte('occurred_at', new Date(t - MOMO_WINDOW_MIN * 60_000).toISOString()).lte('occurred_at', new Date(t + MOMO_WINDOW_MIN * 60_000).toISOString())
        .limit(20);
    return scoreCandidates({ amount: cap.zmw_amount, at: cap.occurred_at, phone: cap.counterparty_phone },
        (data || []).map((m: any) => ({ id: m.id, amount: Number(m.amount), at: m.occurred_at, text: m.raw_text })), MOMO_WINDOW_MIN);
}

/** Moves this capture's evidence onto `target` and marks it MERGED. */
async function mergeIntoCapture(cap: any, target: any, matchType: string, score: number | null) {
    await supabase.from('transaction_captures').update({
        source_ids: Array.from(new Set([...(target.source_ids || []), ...(cap.source_ids || [])])), updated_at: now(),
    }).eq('id', target.id).eq('organization_id', cap.organization_id);
    await supabase.from('transaction_captures').update({
        status: 'MERGED', match_type: matchType, merged_into_id: target.id, match_score: score, claim_state: 'CORROBORATED', last_matched_at: now(), updated_at: now(),
    }).eq('id', cap.id).eq('organization_id', cap.organization_id);
}

/**
 * Stage 3 → 5 for one capture. Order: Lenco entry → MoMo capture → new off-platform draft. Only an unambiguous,
 * confident match merges automatically; ties and multiples are suggested for a person.
 */
export async function matchAndRoute(cap: any, settings: CaptureSettings, opts: { windowMin: number; categorise: boolean }) {
    const orgId = cap.organization_id;
    const base = { last_matched_at: now(), updated_at: now() };
    if (!cap.direction || !(Number(cap.zmw_amount) > 0) || !cap.occurred_at) {
        await supabase.from('transaction_captures').update({ ...base, status: 'NEEDS_REVIEW' }).eq('id', cap.id).eq('organization_id', orgId);
        return;
    }

    const lenco = decideMerge(await lencoCandidates(cap, opts.windowMin), cap.confidence);
    if (lenco.action === 'AUTO_MERGE') {
        const { data: won, error } = await supabase.from('transaction_captures').update({
            ...base, status: 'MERGED', match_type: 'LENCO_ENTRY', matched_cashbook_entry_id: lenco.candidate.id, match_score: lenco.candidate.score,
            claim_state: 'CORROBORATED', match_candidates: [lenco.candidate],
        }).eq('id', cap.id).eq('organization_id', orgId).in('status', OPEN).select('id').maybeSingle();
        if (!error && !won) return;   // someone acted on it meanwhile
        if (!error) {
            await enrichEntry(orgId, cap.id, lenco.candidate.id, cap.suggested_account_id, null);
            await audit(orgId, null, cap.id, 'CAPTURE_AUTO_MERGED', { entry_id: lenco.candidate.id, score: lenco.candidate.score });
            return;
        }
        if (error.code !== '23505') throw new Error(error.message);   // lost the entry to another capture: fall through to review
    }

    const mm = decideMerge(await momoCandidates(cap), cap.confidence);
    if (mm.action === 'AUTO_MERGE') {
        const { data: row } = await supabase.from('momo_captures').select('*').eq('id', mm.candidate.id).eq('organization_id', orgId).maybeSingle();
        if (row) {
            await mirrorMomoCapture(row);
            const { data: target } = await supabase.from('transaction_captures').select('*').eq('organization_id', orgId).eq('momo_capture_id', row.id).maybeSingle();
            if (target && target.id !== cap.id) {
                await mergeIntoCapture(cap, target, 'MOMO_CAPTURE', mm.candidate.score);
                await audit(orgId, null, cap.id, 'CAPTURE_AUTO_MERGED', { into_capture_id: target.id, momo_capture_id: row.id });
                return;
            }
        }
    }

    // Nothing in the wallet yet, but this customer owes exactly this amount on one open invoice.
    let invoiceId: string | null = null;
    if (cap.direction === 'IN' && cap.suggested_crm_contact_id && lenco.action === 'NONE' && mm.action === 'NONE') {
        const fits = (await listOpenInvoices(orgId, cap.suggested_crm_contact_id))
            .filter((i: any) => Math.abs(Number(i.total) - Number(i.amount_paid) - Number(cap.zmw_amount)) < 0.005);
        if (fits.length === 1) invoiceId = fits[0].id;
    }

    const suggestions = [
        ...(lenco.action === 'SUGGEST' ? lenco.candidates.map(c => ({ ...c, kind: 'LENCO_ENTRY' })) : []),
        ...(mm.action === 'SUGGEST' ? mm.candidates.map(c => ({ ...c, kind: 'MOMO_CAPTURE' })) : []),
    ];
    const update: Record<string, any> = {
        ...base, match_candidates: suggestions, match_type: invoiceId ? 'INVOICE' : 'NONE', matched_invoice_id: invoiceId,
    };

    if (opts.categorise && cap.status === 'NEW') {
        Object.assign(update, await draftBooking(cap, settings));
        const auto = decideAutoPost({
            captureEnabled: settings.enabled, autoPostEnabled: settings.autoPostEnabled, autoPostLimit: settings.autoPostLimit,
            amount: cap.zmw_amount, confidence: cap.confidence, deterministic: !!cap.deterministic, claimState: cap.claim_state,
            matchType: invoiceId ? 'INVOICE' : suggestions.length ? 'SUGGESTED' : 'NONE', hasWallet: !!update.suggested_wallet_id, hasAccount: !!update.suggested_account_id,
            flags: cap.flags || [],
        });
        update.status = 'NEEDS_REVIEW';
        await supabase.from('transaction_captures').update(update).eq('id', cap.id).eq('organization_id', orgId);
        if (auto.autoPost && cap.created_by) {
            const locked = await lockCapture(orgId, cap.id, ['NEEDS_REVIEW']);
            if (locked) {
                try {
                    await bookOffPlatform(locked, cap.created_by, {
                        direction: locked.direction, amount: Number(locked.zmw_amount), date: locked.occurred_on, walletId: update.suggested_wallet_id,
                        accountId: update.suggested_account_id, description: locked.evidence_summary || 'Captured transaction',
                    }, 'AUTO_POSTED', null);
                    await audit(orgId, null, cap.id, 'CAPTURE_AUTO_POSTED', { amount: locked.zmw_amount });
                } catch (e: any) {
                    await supabase.from('transaction_captures').update({ status: 'NEEDS_REVIEW', updated_at: now() }).eq('id', cap.id).eq('status', 'POSTING');
                    console.error('[Capture] auto-post failed, left for review:', e?.message);
                }
            }
        }
        return;
    }
    if (cap.status === 'NEW') update.status = 'NEEDS_REVIEW';
    await supabase.from('transaction_captures').update(update).eq('id', cap.id).eq('organization_id', orgId);
}

/** Category (org memory → rules → AI via decisionRouter) and the external wallet the payment method implies. */
async function draftBooking(cap: any, settings: CaptureSettings): Promise<Record<string, any>> {
    const out: Record<string, any> = {};
    const wallets = await listExternalWallets(cap.organization_id);
    const wallet = cap.payment_method === 'CASH' ? matchExternalWallet(wallets, 'cash')
        : cap.payment_method === 'MOMO_PERSONAL' ? (wallets.filter(w => w.provider_type === 'MOBILE_MONEY').length === 1 ? wallets.find(w => w.provider_type === 'MOBILE_MONEY')! : null)
        : null;
    if (wallet) out.suggested_wallet_id = wallet.id;
    if (cap.suggested_account_id) return out;   // a matched product already decided the category
    if (await reserveAiCall(cap.organization_id, settings.dailyAiBudget)) {
        const s = await suggestCategory(cap.organization_id, cap.direction, cap.evidence_summary || cap.counterparty_name || 'Captured transaction', Number(cap.zmw_amount));
        out.ai_calls = (cap.ai_calls || 0) + 1;
        if (s) { out.suggested_account_id = s.account.id; out.reasoning = s.reasoning ?? cap.reasoning ?? null; }
    }
    return out;
}

/**
 * The other direction: a capture that found nothing may be corroborated later (the Lenco sync books the inflow, the
 * MoMo SMS lands). Re-checks open, unmatched captures oldest-checked first. No AI is called here.
 */
export async function rematchPending(deadline: number, limit = 25): Promise<number> {
    const { data } = await supabase.from('transaction_captures').select('*')
        .eq('status', 'NEEDS_REVIEW').in('match_type', ['NONE', 'INVOICE']).not('zmw_amount', 'is', null)
        .gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
        .order('last_matched_at', { ascending: true, nullsFirst: true }).limit(limit);
    let n = 0;
    const settingsByOrg = new Map<string, CaptureSettings>();
    for (const cap of data || []) {
        if (Date.now() > deadline) break;
        if (cap.momo_capture_id) { await supabase.from('transaction_captures').update({ last_matched_at: now() }).eq('id', cap.id); continue; }
        const s = settingsByOrg.get(cap.organization_id) ?? await getCaptureSettings(cap.organization_id);
        settingsByOrg.set(cap.organization_id, s);
        if (!s.enabled) {
            // Still move it down the line, or a lapsed org's captures would fill every run's batch.
            await supabase.from('transaction_captures').update({ last_matched_at: now() }).eq('id', cap.id);
            continue;
        }
        await matchAndRoute(cap, s, { windowMin: cap.reasoning?.startsWith('Receipt has no time') ? LENCO_WINDOW_DATE_ONLY_MIN : LENCO_WINDOW_MIN, categorise: false });
        n++;
    }
    return n;
}

/** Enrichment of an existing Lenco entry: set its category if it has none (or the person chose one). Never books. */
async function enrichEntry(orgId: string, captureId: string, entryId: string, accountId: string | null, userId: string | null, force = false) {
    if (!accountId) return;
    const { data: entry } = await supabase.from('cashbook_entries').select('id, account_id').eq('id', entryId).eq('organization_id', orgId).maybeSingle();
    if (!entry || (entry.account_id && !force) || entry.account_id === accountId) return;
    const { error } = await supabase.from('cashbook_entries').update({ account_id: accountId }).eq('id', entryId).eq('organization_id', orgId);
    if (error) throw new CaptureError(`Could not categorise the matched entry: ${error.message}`, 500);
    await releaseAllocationsIfNotReceivable(orgId, entryId, accountId).catch(e => console.error('[Capture] release allocations failed:', e?.message));
    ledgerService.repostForCashbookEntry(entryId).catch(e => console.error('[Capture] repost failed:', e?.message));
    await supabase.from('transaction_captures').update({ edits: { enrichment: { entry_id: entryId, previous_account_id: entry.account_id ?? null, account_id: accountId } } })
        .eq('id', captureId).eq('organization_id', orgId);
    await audit(orgId, userId, captureId, 'CAPTURE_ENRICHED_ENTRY', { entry_id: entryId, previous_account_id: entry.account_id ?? null, account_id: accountId });
}

// ───────────────────────────────────────────── posting ─────────────────────────────────────────────

interface BookValues { direction: 'IN' | 'OUT'; amount: number; date: string; walletId: string; accountId: string | null; description: string }

/** Books through recordManualEntry. A deterministic reference makes a retried or concurrent call reuse the same entry. */
async function bookOffPlatform(locked: any, userId: string, v: BookValues, finalStatus: 'APPROVED' | 'AUTO_POSTED', reviewer: string | null, edits?: any) {
    const orgId = locked.organization_id;
    const reference = `CAPTURE-${locked.id}-${locked.post_seq}`;
    const { data: prior } = await supabase.from('cashbook_entries').select('id').eq('organization_id', orgId).eq('external_reference', reference).limit(1);
    const entryId = prior?.[0]?.id ?? (await recordManualEntry({
        orgId, userId, direction: v.direction, amount: v.amount, description: v.description, date: v.date,
        externalWalletId: v.walletId, accountId: v.accountId, autoCategorize: false, externalReference: reference,
    })).entryId;
    const { data: done, error } = await supabase.from('transaction_captures').update({
        status: finalStatus, cashbook_entry_id: entryId, posted_at: now(), updated_at: now(),
        ...(reviewer ? { reviewed_by: reviewer, reviewed_at: now() } : {}), ...(edits !== undefined ? { edits } : {}),
    }).eq('id', locked.id).eq('organization_id', orgId).eq('status', 'POSTING').select('*').maybeSingle();
    if (error) throw new CaptureError(`Booked entry ${entryId} but could not update the capture: ${error.message}`, 500);
    return { capture: done, entryId };
}

const EDITABLE = ['direction', 'amount', 'occurred_on', 'account_id', 'wallet_id', 'description', 'counterparty_name', 'payment_method'] as const;

function finalValues(cap: any, edits: Record<string, any>) {
    const v: Record<string, any> = {
        direction: cap.direction, amount: cap.zmw_amount != null ? Number(cap.zmw_amount) : null, occurred_on: cap.occurred_on,
        account_id: cap.suggested_account_id, wallet_id: cap.suggested_wallet_id, description: cap.evidence_summary,
        counterparty_name: cap.counterparty_name, payment_method: cap.payment_method,
    };
    const draft = { ...v };
    for (const k of EDITABLE) if (edits && edits[k] !== undefined) v[k] = k === 'amount' ? Number(edits[k]) : edits[k];
    return { draft, v };
}

function cleanLineItems(raw: unknown) {
    if (!Array.isArray(raw)) return null;
    const num = (n: unknown) => (n === null || n === '' || n === undefined || !Number.isFinite(Number(n)) ? null : Number(n));
    return raw.slice(0, 50).filter((l: any) => typeof l?.name === 'string' && l.name.trim()).map((l: any) => ({
        name: l.name.trim().slice(0, 200), qty: num(l.qty), unit_price: num(l.unit_price), total: num(l.total), product_id: typeof l.product_id === 'string' ? l.product_id : null,
    }));
}

export async function approve(orgId: string, userId: string, id: string, edits: Record<string, any> = {}) {
    const cap = await loadCapture(orgId, id);
    if (['APPROVED', 'AUTO_POSTED'].includes(cap.status)) return { capture: cap, entryId: cap.cashbook_entry_id, alreadyApproved: true };
    if (cap.status === 'POSTING' && Date.now() - new Date(cap.updated_at).getTime() < STALE_LOCK_MS) throw new CaptureError('This capture is being approved right now', 409);
    if (!OPEN.includes(cap.status) && cap.status !== 'POSTING') throw new CaptureError(`A ${cap.status.toLowerCase()} capture cannot be approved`, 409);

    const { draft, v } = finalValues(cap, edits);
    if (v.direction !== 'IN' && v.direction !== 'OUT') throw new CaptureError('Choose money in or money out');
    if (!(Number(v.amount) > 0)) throw new CaptureError('Enter the amount in Kwacha');
    if (!v.occurred_on || !/^\d{4}-\d{2}-\d{2}$/.test(v.occurred_on)) throw new CaptureError('Enter the date');
    if (!v.description || String(v.description).trim().length < 2) v.description = cap.counterparty_name || 'Captured transaction';
    const diff: Record<string, any> = draftDiff(draft, v);
    const lineItems = cleanLineItems(edits.line_items);
    if (lineItems) {
        diff.line_items = { from: cap.line_items, to: lineItems };
        await supabase.from('transaction_captures').update({ line_items: lineItems }).eq('id', id).eq('organization_id', orgId);
    }

    // MoMo rows book through MoMo Capture's own post (fees, provider wallet) — same as before the queue existed.
    if (cap.momo_capture_id) {
        const { data: row } = await supabase.from('momo_captures').select('id, user_id').eq('id', cap.momo_capture_id).eq('organization_id', orgId).maybeSingle();
        if (!row) throw new CaptureError('The mobile money message for this capture no longer exists', 404);
        try {
            await momo.post(row.user_id, orgId, row.id, { direction: v.direction, amount: v.amount, accountId: v.account_id ?? undefined, description: v.description });
        } catch (e: any) {
            const again = await loadCapture(orgId, id);
            if (['APPROVED', 'AUTO_POSTED'].includes(again.status)) return { capture: again, entryId: again.cashbook_entry_id, alreadyApproved: true };
            if (e instanceof momo.MomoCaptureError) throw new CaptureError(e.message, e.httpStatus);
            throw e;
        }
        await supabase.from('transaction_captures').update({ reviewed_by: userId, reviewed_at: now(), edits: { diff } }).eq('id', id).eq('organization_id', orgId);
        await learn(orgId, v, diff);
        await audit(orgId, userId, id, 'CAPTURE_APPROVED', { via: 'momo_capture', diff });
        const done = await loadCapture(orgId, id);
        return { capture: done, entryId: done.cashbook_entry_id, alreadyApproved: false };
    }

    let walletId = v.wallet_id as string | null;
    if (!walletId && v.payment_method === 'CASH') walletId = (await ensureCashWallet(orgId)).id;
    if (!walletId) throw new CaptureError('Choose the account the money moved through');
    if (v.account_id) {
        const ok = (await categoriesFor(orgId, v.direction)).some((a: any) => a.id === v.account_id);
        if (!ok) throw new CaptureError('That category does not fit this direction');
    }

    const locked = await lockCapture(orgId, id, OPEN);
    if (!locked) {
        const again = await loadCapture(orgId, id);
        if (['APPROVED', 'AUTO_POSTED'].includes(again.status)) return { capture: again, entryId: again.cashbook_entry_id, alreadyApproved: true };
        throw new CaptureError('This capture was changed by someone else; refresh and try again', 409);
    }
    try {
        const result = await bookOffPlatform(locked, userId, {
            direction: v.direction, amount: r2(Number(v.amount)), date: v.occurred_on, walletId, accountId: v.account_id ?? null, description: String(v.description),
        }, 'APPROVED', userId, { diff });
        await applyToInvoice(locked, userId, result.entryId, Number(v.amount), v.direction);
        await learn(orgId, v, diff);
        await audit(orgId, userId, id, 'CAPTURE_APPROVED', { entry_id: result.entryId, diff });
        return { capture: result.capture, entryId: result.entryId, alreadyApproved: false };
    } catch (e: any) {
        await supabase.from('transaction_captures').update({ status: 'NEEDS_REVIEW', updated_at: now() })
            .eq('id', id).eq('organization_id', orgId).eq('status', 'POSTING');
        if (e instanceof ManualEntryError) throw new CaptureError(e.message, e.httpStatus);
        throw e;
    }
}

/** The money is booked either way; a refused allocation is flagged for a person instead of failing the approval. */
async function applyToInvoice(cap: any, userId: string, entryId: string, amount: number, direction: string) {
    if (!cap.matched_invoice_id || direction !== 'IN') return;
    try {
        await allocatePayment(cap.organization_id, userId, entryId, [{ invoice_id: cap.matched_invoice_id, amount }]);
    } catch (e: any) {
        console.error('[Capture] invoice allocation failed:', e?.message);
        await supabase.from('transaction_captures').update({ flags: Array.from(new Set([...(cap.flags || []), 'INVOICE_NOT_APPLIED'])) })
            .eq('id', cap.id).eq('organization_id', cap.organization_id);
    }
}

async function learn(orgId: string, v: Record<string, any>, diff: Record<string, any>) {
    if (!v.account_id || !v.description) return;
    await memoryService.learn({ organizationId: orgId, description: String(v.description), accountId: v.account_id, authoritative: true, source: diff.account_id ? 'capture_correction' : 'capture_approval' })
        .catch(e => console.error('[Capture] learning failed:', e?.message));
}

export async function bulkApprove(orgId: string, userId: string, ids: unknown) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50 || !ids.every(i => typeof i === 'string')) throw new CaptureError('Send between 1 and 50 capture ids');
    const { data } = await supabase.from('transaction_captures').select('id, zmw_amount, suggested_wallet_id, suggested_account_id, payment_method, momo_capture_id, status')
        .eq('organization_id', orgId).in('id', ids as string[]);
    const rows = data || [];
    const incomplete = (ids as string[]).filter(id => {
        const c = rows.find((r: any) => r.id === id);
        return !c || !(Number(c.zmw_amount) > 0) || !c.suggested_account_id || (!c.momo_capture_id && !c.suggested_wallet_id && c.payment_method !== 'CASH');
    });
    if (incomplete.length) throw new CaptureError(`These need an amount, account and category first: ${incomplete.length} capture(s)`, 422);
    const results: any[] = [];
    for (const id of ids as string[]) {
        try { const r = await approve(orgId, userId, id); results.push({ id, ok: true, entryId: r.entryId }); }
        catch (e: any) { results.push({ id, ok: false, error: e?.message }); }
    }
    return { results };
}

/** "Merge with…": attach this capture to an existing Lenco entry (enrichment) or to another capture. */
export async function merge(orgId: string, userId: string, id: string, body: { cashbookEntryId?: unknown; captureId?: unknown; accountId?: unknown }) {
    const cap = await loadCapture(orgId, id);
    if (!OPEN.includes(cap.status)) throw new CaptureError(`A ${cap.status.toLowerCase()} capture cannot be merged`, 409);
    const accountId = typeof body.accountId === 'string' ? body.accountId : cap.suggested_account_id;

    if (typeof body.captureId === 'string') {
        if (body.captureId === id) throw new CaptureError('Choose a different capture');
        const target = await loadCapture(orgId, body.captureId);
        if (['DISMISSED', 'FAILED', 'MERGED'].includes(target.status)) throw new CaptureError('That capture cannot take more evidence', 409);
        await mergeIntoCapture(cap, target, 'EXISTING_CAPTURE', null);
        await supabase.from('transaction_captures').update({ reviewed_by: userId, reviewed_at: now() }).eq('id', id).eq('organization_id', orgId);
        await audit(orgId, userId, id, 'CAPTURE_MERGED', { into_capture_id: target.id });
        return loadCapture(orgId, id);
    }
    if (typeof body.cashbookEntryId !== 'string') throw new CaptureError('Choose what to merge with');
    const { data: entry } = await supabase.from('cashbook_entries').select('id, debit, credit, account_type')
        .eq('id', body.cashbookEntryId).eq('organization_id', orgId).maybeSingle();
    if (!entry) throw new CaptureError('Entry not found', 404);
    const entryAmount = Number(cap.direction === 'IN' ? entry.debit : entry.credit);
    if (entry.account_type !== 'MONEYWISE_WALLET' || Math.abs(entryAmount - Number(cap.zmw_amount)) >= 0.005) {
        throw new CaptureError('Only a MoneyWise wallet entry with the same amount and direction can be merged');
    }
    if (accountId && !(await categoriesFor(orgId, cap.direction)).some((a: any) => a.id === accountId)) throw new CaptureError('That category does not fit this direction');
    const { data: done, error } = await supabase.from('transaction_captures').update({
        status: 'MERGED', match_type: 'LENCO_ENTRY', matched_cashbook_entry_id: entry.id, claim_state: 'CORROBORATED',
        reviewed_by: userId, reviewed_at: now(), updated_at: now(),
    }).eq('id', id).eq('organization_id', orgId).in('status', OPEN).select('*').maybeSingle();
    if (error?.code === '23505') throw new CaptureError('That entry is already linked to another capture', 409);
    if (error || !done) throw new CaptureError('This capture was changed by someone else; refresh and try again', 409);
    await enrichEntry(orgId, id, entry.id, accountId, userId, typeof body.accountId === 'string');
    await audit(orgId, userId, id, 'CAPTURE_MERGED', { entry_id: entry.id });
    return loadCapture(orgId, id);
}

export async function dismiss(orgId: string, userId: string, id: string) {
    const cap = await loadCapture(orgId, id);
    if (cap.momo_capture_id) {
        const { data: row } = await supabase.from('momo_captures').select('id, user_id').eq('id', cap.momo_capture_id).eq('organization_id', orgId).maybeSingle();
        if (row) {
            try { await momo.dismiss(row.user_id, orgId, row.id); }
            catch (e: any) { if (e instanceof momo.MomoCaptureError) throw new CaptureError(e.message, e.httpStatus); throw e; }
        }
    }
    const { data } = await supabase.from('transaction_captures').update({ status: 'DISMISSED', reviewed_by: userId, reviewed_at: now(), updated_at: now() })
        .eq('id', id).eq('organization_id', orgId).in('status', cap.momo_capture_id ? [...OPEN, 'DISMISSED'] : OPEN).select('*').maybeSingle();
    if (!data) throw new CaptureError('This capture was already handled', 409);
    await audit(orgId, userId, id, 'CAPTURE_DISMISSED');
    return data;
}

/**
 * Undo: DISMISSED → back to review; MERGED (Lenco) → unlink and restore the entry's previous category; APPROVED /
 * AUTO_POSTED (within 7 days) → neutralise the booked entry the way Ledger Guardian does (amounts zeroed and tagged,
 * derived journal removed, running balances rebuilt) — never a delete — and return the capture to review.
 */
export async function undo(orgId: string, userId: string, id: string) {
    const cap = await loadCapture(orgId, id);

    if (cap.status === 'DISMISSED') {
        if (cap.momo_capture_id) {
            await supabase.from('momo_captures').update({ status: 'PENDING', updated_at: now() }).eq('id', cap.momo_capture_id).eq('organization_id', orgId).eq('status', 'DISMISSED');
        }
        const { data } = await supabase.from('transaction_captures').update({ status: 'NEEDS_REVIEW', updated_at: now() })
            .eq('id', id).eq('organization_id', orgId).eq('status', 'DISMISSED').select('*').maybeSingle();
        await audit(orgId, userId, id, 'CAPTURE_UNDO', { from: 'DISMISSED' });
        return data;
    }

    if (cap.status === 'MERGED' && cap.match_type === 'LENCO_ENTRY' && !cap.momo_capture_id) {
        const enr = cap.edits?.enrichment;
        if (enr?.entry_id === cap.matched_cashbook_entry_id) {
            await supabase.from('cashbook_entries').update({ account_id: enr.previous_account_id ?? null })
                .eq('id', enr.entry_id).eq('organization_id', orgId).eq('account_id', enr.account_id);
            ledgerService.repostForCashbookEntry(enr.entry_id).catch(e => console.error('[Capture] repost failed:', e?.message));
        }
        const { data } = await supabase.from('transaction_captures').update({
            status: 'NEEDS_REVIEW', match_type: 'NONE', matched_cashbook_entry_id: null, match_score: null, claim_state: 'CLAIMED', updated_at: now(),
        }).eq('id', id).eq('organization_id', orgId).eq('status', 'MERGED').select('*').maybeSingle();
        await audit(orgId, userId, id, 'CAPTURE_UNDO', { from: 'MERGED', entry_id: cap.matched_cashbook_entry_id });
        return data;
    }

    if (!['APPROVED', 'AUTO_POSTED'].includes(cap.status)) throw new CaptureError(`A ${cap.status.toLowerCase()} capture cannot be undone`, 409);
    if (cap.momo_capture_id) throw new CaptureError('Mobile money entries are undone from the ledger, not from the capture queue', 409);
    if (!cap.posted_at || Date.now() - new Date(cap.posted_at).getTime() > UNDO_WINDOW_DAYS * 86400_000) throw new CaptureError(`Undo is available for ${UNDO_WINDOW_DAYS} days after posting`, 409);

    const locked = await lockCapture(orgId, id, ['APPROVED', 'AUTO_POSTED']);
    if (!locked) throw new CaptureError('This capture was changed by someone else; refresh and try again', 409);
    try {
        const { data: entry } = await supabase.from('cashbook_entries').select('id, date, created_at, account_type, wallet_id, debit, credit, description, bank_statement_reference')
            .eq('id', cap.cashbook_entry_id).eq('organization_id', orgId).maybeSingle();
        if (entry?.bank_statement_reference) throw new CaptureError('This entry is reconciled to a bank statement; reverse it from the ledger', 409);
        if (entry && (Number(entry.debit) !== 0 || Number(entry.credit) !== 0)) {
            // Release the invoice first: allocatePayment needs the amount still on the entry.
            if (cap.matched_invoice_id) await allocatePayment(orgId, userId, entry.id, []);
            const was = Number(entry.debit) - Number(entry.credit);
            const tag = `[Voided: ${lusakaDate(now())} capture undo] | was ${was >= 0 ? '+' : ''}${was.toFixed(2)} | `;
            const { error } = await supabase.from('cashbook_entries').update({ debit: 0, credit: 0, description: `${tag}${entry.description ?? ''}`.slice(0, 500) })
                .eq('id', entry.id).eq('organization_id', orgId);
            if (error) throw new CaptureError(`Could not void the entry: ${error.message}`, 500);
            await ledgerService.removeForCashbookEntry(entry.id, orgId);
            await cashbookService.recalculateBalancesFrom(orgId, entry.date, entry.created_at, entry.account_type, entry.wallet_id || undefined);
        }
        const { data } = await supabase.from('transaction_captures').update({
            status: 'NEEDS_REVIEW', cashbook_entry_id: null, posted_at: null, post_seq: (locked.post_seq || 0) + 1,
            voided_entry_ids: Array.from(new Set([...(locked.voided_entry_ids || []), ...(entry ? [entry.id] : [])])), updated_at: now(),
        }).eq('id', id).eq('organization_id', orgId).eq('status', 'POSTING').select('*').maybeSingle();
        // An SMS that stood down because this entry existed must come back, or the money would vanish from review.
        if (entry) {
            await supabase.from('momo_captures').update({ status: 'PENDING', matched_entry_id: null, updated_at: now() })
                .eq('organization_id', orgId).eq('matched_entry_id', entry.id).eq('status', 'MATCHED');
        }
        await audit(orgId, userId, id, 'CAPTURE_UNDO', { from: cap.status, voided_entry_id: entry?.id ?? null });
        return data;
    } catch (e) {
        await supabase.from('transaction_captures').update({ status: cap.status, updated_at: now() }).eq('id', id).eq('organization_id', orgId).eq('status', 'POSTING');
        throw e;
    }
}

// ───────────────────────────────────────────── reads ─────────────────────────────────────────────

const LIST_STATUSES = ['NEEDS_REVIEW', 'AUTO_POSTED', 'APPROVED', 'MERGED', 'DISMISSED', 'FAILED'];
const SOURCES = ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'EMAIL', 'RECEIPT_UPLOAD', 'MOMO_SMS'];

export async function list(orgId: string, q: { status?: unknown; source?: unknown; before?: unknown; limit?: unknown }) {
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 100);
    let query = supabase.from('transaction_captures').select(
        'id, source, status, direction, amount, currency, zmw_amount, occurred_on, occurred_at, counterparty_name, payment_method, intent, confidence, deterministic, claim_state, match_type, flags, suggested_account_id, suggested_wallet_id, cashbook_entry_id, posted_at, created_at, momo_capture_id',
    ).eq('organization_id', orgId).order('created_at', { ascending: false }).limit(limit);
    const statuses = String(q.status || '').split(',').filter(s => LIST_STATUSES.includes(s));
    query = statuses.length ? query.in('status', statuses) : query.in('status', ['NEEDS_REVIEW', 'AUTO_POSTED', 'APPROVED', 'MERGED', 'POSTING']);
    if (typeof q.source === 'string' && SOURCES.includes(q.source)) query = query.eq('source', q.source);
    if (typeof q.before === 'string' && !Number.isNaN(Date.parse(q.before))) query = query.lt('created_at', q.before);
    const { data, error } = await query;
    if (error) throw new CaptureError(error.message, 500);
    const settings = await getCaptureSettings(orgId);
    return { enabled: settings.enabled, items: data || [], nextBefore: data && data.length === limit ? data[data.length - 1].created_at : null };
}

export async function count(orgId: string) {
    const { count: n } = await supabase.from('transaction_captures').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'NEEDS_REVIEW');
    return { needsReview: n ?? 0 };
}

/** The capture behind a ledger entry, booked by it or matched to it. */
export async function byEntry(orgId: string, entryId: string) {
    const { data } = await supabase.from('transaction_captures').select('id, source, status')
        .eq('organization_id', orgId).or(`cashbook_entry_id.eq.${entryId},matched_cashbook_entry_id.eq.${entryId}`).limit(1).maybeSingle();
    return { capture: data ?? null };
}

export async function detail(orgId: string, id: string) {
    const cap = await loadCapture(orgId, id);
    const ids: string[] = cap.source_ids || [];
    const [{ data: atts }, { data: momoRows }] = await Promise.all([
        ids.length ? supabase.from('capture_attachments').select('id, mime, storage_path, created_at').eq('organization_id', orgId).in('id', ids) : Promise.resolve({ data: [] as any[] }),
        ids.length ? supabase.from('momo_captures').select('id, raw_text, provider, occurred_at').eq('organization_id', orgId).in('id', ids) : Promise.resolve({ data: [] as any[] }),
    ]);
    const attachments = await Promise.all((atts || []).map(async (a: any) => {
        const { data } = await supabase.storage.from(CAPTURE_BUCKET).createSignedUrl(a.storage_path, SIGNED_URL_TTL_S);
        return { id: a.id, mime: a.mime, url: data?.signedUrl ?? null, created_at: a.created_at };
    }));
    const { data: chatRows } = cap.conversation_id
        ? await supabase.from('messaging_messages').select('id, direction, body, message_type, sent_at, contact_name')
            .eq('organization_id', orgId).eq('conversation_id', cap.conversation_id).order('sent_at', { ascending: true }).limit(30)
        : { data: [] as any[] };
    const candIds = (cap.match_candidates || []).filter((c: any) => c.kind === 'LENCO_ENTRY').map((c: any) => c.id);
    if (cap.matched_cashbook_entry_id) candIds.push(cap.matched_cashbook_entry_id);
    const { data: entries } = candIds.length
        ? await supabase.from('cashbook_entries').select('id, date, description, debit, credit, transaction_at, created_at').eq('organization_id', orgId).in('id', candIds)
        : { data: [] as any[] };
    const [wallets, categories] = cap.direction ? await Promise.all([listExternalWallets(orgId), categoriesFor(orgId, cap.direction)]) : [await listExternalWallets(orgId), []];
    return {
        capture: cap,
        attachments,
        momoMessages: momoRows || [],
        chatMessages: chatRows || [],
        entries: entries || [],
        wallets,
        categories: (categories || []).map((a: any) => ({ id: a.id, name: a.name, code: a.code, emoji: a.emoji ?? null })),
        undoAvailableUntil: cap.posted_at && !cap.momo_capture_id ? new Date(new Date(cap.posted_at).getTime() + UNDO_WINDOW_DAYS * 86400_000).toISOString() : null,
    };
}
