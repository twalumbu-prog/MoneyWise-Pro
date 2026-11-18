import { supabase } from '../lib/supabase';
import { callAllOcrProviders } from './ai/ai.provider';

/**
 * Scores an uploaded KYC document so unusable ones are caught on the spot, not weeks later when a lender rejects them.
 *
 * Two parts make the score. The browser measures the photo itself (sharpness, light, glare, size) before upload and sends that score along.
 * Here the AI vision model reads the document and says what only reading can tell: is it the right kind of document, are all its edges in the
 * frame, can the text be read, is there a face (for a selfie), is it a photo of a screen, has the ID expired, is the proof of residence recent.
 * The two are blended into one score out of 100. A document is "usable" when nothing disqualifying was found and the score is 55 or more.
 * If the AI is unavailable the result says so and falls back to the browser's score; it never blocks someone because a check failed to run.
 */

const BUCKET = 'investor-kyc';
const SLOTS: Record<string, { what: string; face?: boolean; expires?: boolean; recent?: boolean; text?: boolean }> = {
    id_front: { what: 'the FRONT of a national ID card, or the photo page of a passport', expires: true, text: true },
    id_back: { what: 'the BACK of a national ID card', text: true },
    photo: { what: 'a passport-style photo of one person’s face (a clear portrait or selfie)', face: true },
    proof_of_residence: { what: 'a proof of residence: a utility bill, bank statement, lease or similar that shows the person’s name and home address', recent: true, text: true },
};

export type CheckLevel = 'good' | 'ok' | 'poor';
export interface DocumentCheck {
    slot: string; score: number; level: CheckLevel; usable: boolean; issues: string[]; note: string | null; checkedByAi: boolean;
    /** True when a person should look at it: the details on the ID don't match the profile, or it shows signs of editing. Never blocks by itself. */
    needsReview: boolean; flags: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const levelOf = (score: number): CheckLevel => (score >= 75 ? 'good' : score >= 55 ? 'ok' : 'poor');
const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);

const PROMPT = (what: string, readIdDetails = false) => `You are checking a document photo uploaded for identity verification at a financial company. It should be ${what}.
Look carefully and answer with ONLY a JSON object, no other text:
{
  "matches_expected": true or false (is this the kind of document described above),
  "seen": "what you actually see, in a few words",
  "all_edges_visible": true or false (is the whole document inside the frame),
  "text_readable": true or false (could a person read the important text, such as the name, numbers and dates),
  "blurry": true or false,
  "glare": "none" or "minor" or "severe" (reflections or shadows that hide detail),
  "photo_of_screen_or_copy": true or false (a photo of a screen, or a photocopy of a photocopy),
  "face_clearly_visible": true or false or null (null when no face is expected),
  "expiry_date": "YYYY-MM-DD" or null (the expiry date printed on an ID, if there is one),
  "document_date": "YYYY-MM-DD" or null (the date printed on a bill or statement, if there is one),
  "quality": a number from 0 to 100 for how usable this image is for verification,
  "looks_edited": true or false (signs the image was digitally altered: mismatched fonts or spacing, pasted-over text or photo, uneven backgrounds; false when you see none),
  "edit_notes": "what looks altered, or an empty string",${readIdDetails ? `
  "full_name": "the full name printed on the ID, or null",
  "id_number": "the ID or passport number printed on it, or null",
  "date_of_birth": "YYYY-MM-DD or null",` : ''}
  "issues": ["up to 3 short, plain sentences telling the customer exactly what to fix, worst first"]
}
Do not guess at details you cannot see. If it is not the described document, say so in "matches_expected" and "seen".`;

const letters = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
const compact = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** A Zambian NRC number looks like 123456/78/1. */
const NRC_FORMAT = /^\d{6}\/\d{2}\/\d$/;

/**
 * Compares what the model read off the ID with what the person typed into their profile. A difference isn't treated as fraud (the model can
 * misread, and so can people typing), it just sends the document to a person to look at and tells the customer to check their details.
 */
async function crossCheckId(userId: string, ai: any): Promise<string[]> {
    const flags: string[] = [];
    const { data } = await supabase.from('investor_kyc_profiles').select('applicant, id_type').eq('user_id', userId).maybeSingle();
    const a = (data?.applicant ?? {}) as Record<string, string>;
    const idType = String(data?.id_type ?? a.id_type ?? '');

    if (typeof ai.id_number === 'string' && ai.id_number.trim()) {
        if (/nrc|national/i.test(idType) && !NRC_FORMAT.test(ai.id_number.replace(/\s+/g, ''))) flags.push(`The ID number read from the card (${ai.id_number}) doesn’t look like an NRC number (123456/78/1). Check the photo is clear.`);
        if (a.id_number && compact(a.id_number) !== compact(ai.id_number)) flags.push(`The ID number on the card (${ai.id_number}) doesn’t match the one in your profile (${a.id_number}).`);
    }
    if (typeof ai.full_name === 'string' && ai.full_name.trim() && (a.first_name || a.last_name)) {
        const onId = new Set(letters(ai.full_name));
        const mine = [...letters(a.first_name), ...letters(a.last_name)];
        if (mine.length && !mine.every((t) => onId.has(t))) flags.push(`The name on the ID (${String(ai.full_name).slice(0, 60)}) doesn’t match your profile (${[a.first_name, a.last_name].filter(Boolean).join(' ')}).`);
    }
    if (typeof ai.date_of_birth === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ai.date_of_birth) && a.date_of_birth && a.date_of_birth.slice(0, 10) !== ai.date_of_birth) {
        flags.push(`The date of birth on the ID (${ai.date_of_birth}) doesn’t match your profile (${a.date_of_birth.slice(0, 10)}).`);
    }
    return flags;
}

function parseJson(text: string): any | null {
    try { return JSON.parse(text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()); } catch { return null; }
}

export async function checkDocument(userId: string, slot: string, path: string, clientScore?: number): Promise<DocumentCheck> {
    const rules = SLOTS[slot];
    if (!rules) throw new Error('Unknown document');
    if (typeof path !== 'string' || path.length > 300 || !path.startsWith(`${userId}/`) || path.includes('..')) throw new Error('Invalid file reference');
    const client = Number.isFinite(Number(clientScore)) ? clamp(Number(clientScore)) : null;

    const { data: blob, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !blob) throw new Error('That upload could not be found');
    const buf = Buffer.from(await blob.arrayBuffer());
    const ext = (path.split('.').pop() || '').toLowerCase();
    const mime = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    let ai: any = null;
    try {
        for (const r of await callAllOcrProviders(PROMPT(rules.what, slot === 'id_front'), buf.toString('base64'), mime)) { ai = parseJson(r.text); if (ai && typeof ai === 'object') break; ai = null; }
    } catch (e: any) { console.error('[KYC check] vision failed:', e?.message ?? e); }

    let result: DocumentCheck;
    if (!ai) {
        // Not checked by AI: judged on the browser's measurements alone, and never blocked for that.
        const score = client ?? 60;
        result = { slot, score, level: levelOf(score), usable: score >= 55, issues: [], note: 'Not read by the document checker', checkedByAi: false, needsReview: false, flags: [] };
    } else {
        const issues: string[] = (Array.isArray(ai.issues) ? ai.issues : []).map((x: unknown) => String(x).slice(0, 160)).filter(Boolean).slice(0, 3);
        let aiScore = clamp(Number(ai.quality));
        const add = (text: string) => { if (!issues.includes(text)) issues.unshift(text); };
        let hardFail = false;

        if (ai.matches_expected === false) { hardFail = true; add(`This doesn’t look like ${rules.what}${ai.seen ? ` (it looks like ${String(ai.seen).slice(0, 60)})` : ''}.`); }
        if (rules.text && ai.text_readable === false) { hardFail = true; add('The text can’t be read. Retake it closer and in better light.'); }
        if (rules.face && ai.face_clearly_visible === false) { hardFail = true; add('A clear face isn’t visible. Face the camera in good light.'); }
        if (ai.all_edges_visible === false) { aiScore -= 20; add('Part of the document is cut off. Show all four edges.'); }
        if (ai.blurry === true) { aiScore -= 30; add('The photo is blurry. Hold the phone steady and let it focus.'); }
        if (ai.glare === 'severe') { aiScore -= 25; add('Glare hides detail. Tilt the document away from the light.'); }
        else if (ai.glare === 'minor') aiScore -= 8;
        if (ai.photo_of_screen_or_copy === true) { aiScore -= 25; add('This looks like a photo of a screen or a copy. Use the original document.'); }

        if (rules.expires && typeof ai.expiry_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ai.expiry_date) && ai.expiry_date < today()) { hardFail = true; add(`This ID expired on ${ai.expiry_date}. Use a valid one.`); }
        if (rules.recent && typeof ai.document_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ai.document_date)) {
            const ageDays = (Date.now() - Date.parse(ai.document_date)) / 86_400_000;
            if (ageDays > 120) { hardFail = true; add(`This is dated ${ai.document_date}, more than 3 months ago. Upload a recent one.`); }
        }
        aiScore = clamp(aiScore);
        const score = client != null ? clamp(0.35 * client + 0.65 * aiScore) : aiScore;
        const flags: string[] = [];
        if (ai.looks_edited === true) flags.push(`Parts of this document look edited${ai.edit_notes ? `: ${String(ai.edit_notes).slice(0, 100)}` : ''}.`);
        if (slot === 'id_front' && ai.matches_expected !== false) flags.push(...(await crossCheckId(userId, ai)));
        result = { slot, score, level: levelOf(score), usable: !hardFail && score >= 55, issues: issues.slice(0, 3), note: ai.seen ? String(ai.seen).slice(0, 80) : null, checkedByAi: true, needsReview: flags.length > 0, flags };
    }

    // Kept so the loan application can say which documents still need replacing. A failure to save never fails the check.
    await supabase.from('kyc_document_checks').upsert({
        user_id: userId, slot, path, score: result.score, level: result.level, usable: result.usable, issues: result.issues, details: { note: result.note, checkedByAi: result.checkedByAi, client, needsReview: result.needsReview, flags: result.flags },
        checked_at: new Date().toISOString(),
    }, { onConflict: 'user_id,slot' }).then(() => undefined, () => undefined);
    return result;
}

/** The latest check for each of a person's documents (empty when the table isn't there yet). */
export async function latestChecks(userId: string): Promise<Map<string, { path: string; usable: boolean; level: CheckLevel; issues: string[]; score: number }>> {
    const out = new Map<string, { path: string; usable: boolean; level: CheckLevel; issues: string[]; score: number }>();
    const { data, error } = await supabase.from('kyc_document_checks').select('slot, path, usable, level, issues, score').eq('user_id', userId);
    if (error) return out;
    for (const r of (data ?? []) as any[]) out.set(r.slot, { path: r.path, usable: !!r.usable, level: r.level, issues: Array.isArray(r.issues) ? r.issues : [], score: Number(r.score) });
    return out;
}
