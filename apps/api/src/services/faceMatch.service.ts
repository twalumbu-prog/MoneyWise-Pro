import crypto from 'crypto';
import { supabase } from '../lib/supabase';

/**
 * Checks that the selfie on a person's MoneyWise ID is the same person as the photo on their ID card, using Smile ID (SmartSelfie Compare).
 *
 * It stays switched off until SMILE_ID_PARTNER_ID and SMILE_ID_API_KEY are set (SMILE_ID_ENV=production for live, anything else uses Smile's sandbox).
 * Smile ID answers a moment later by calling us back, so the result is saved against the job and read from there. Nothing here ever blocks
 * a person: a weak or failed match sends the profile to a human to look at, it doesn't reject it.
 *
 * Saved in kyc_document_checks under the slot "face_match" (details holds the job id and Smile's reply), so no new table is needed.
 * The callback's exact field names were not available in the documentation read, so the reply is stored whole and read defensively;
 * confirm against a sandbox run before relying on "passed".
 */

const BUCKET = 'investor-kyc';
const SLOT = 'face_match';
const base = () => (process.env.SMILE_ID_ENV === 'production' ? 'https://api.smileidentity.com' : 'https://testapi.smileidentity.com');
const partnerId = () => (process.env.SMILE_ID_PARTNER_ID ?? '').trim();
const apiKey = () => (process.env.SMILE_ID_API_KEY ?? '').trim();

export const faceMatchEnabled = () => !!(partnerId() && apiKey() && process.env.API_PUBLIC_URL);

export type FaceMatchState = 'OFF' | 'NOT_STARTED' | 'PENDING' | 'PASSED' | 'REVIEW' | 'ERROR';
export interface FaceMatchStatus { state: FaceMatchState; message: string; checkedAt?: string }

const MESSAGE: Record<FaceMatchState, string> = {
    OFF: 'Face matching isn’t switched on yet.',
    NOT_STARTED: 'Your selfie hasn’t been compared with your ID photo yet.',
    PENDING: 'Comparing your selfie with your ID photo…',
    PASSED: 'Your selfie matches your ID photo.',
    REVIEW: 'We couldn’t confirm your selfie matches your ID photo, so a person will take a look.',
    ERROR: 'We couldn’t run the face check. You can carry on; a person will check it instead.',
};

async function download(path: string): Promise<Buffer> {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) throw new Error('A document could not be found');
    return Buffer.from(await data.arrayBuffer());
}
const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

async function save(userId: string, path: string, state: FaceMatchState, details: Record<string, unknown>) {
    const passed = state === 'PASSED';
    await supabase.from('kyc_document_checks').upsert({
        user_id: userId, slot: SLOT, path, score: passed ? 100 : 0, level: passed ? 'good' : 'poor', usable: passed || state === 'REVIEW',
        issues: [], details: { state, ...details }, checked_at: new Date().toISOString(),
    }, { onConflict: 'user_id,slot' });
}

/** Sends the selfie and ID photo to Smile ID. Returns straight away; the answer arrives on the callback. */
export async function startFaceMatch(userId: string, email: string | null): Promise<FaceMatchStatus> {
    if (!faceMatchEnabled()) return { state: 'OFF', message: MESSAGE.OFF };

    const { data: profile } = await supabase.from('investor_kyc_profiles').select('applicant, documents').eq('user_id', userId).maybeSingle();
    const docs = (profile?.documents ?? {}) as Record<string, string>;
    const a = (profile?.applicant ?? {}) as Record<string, string>;
    if (!docs.photo || !docs.id_front) throw new Error('Add your selfie and the front of your ID first.');
    if (!a.first_name || !a.last_name) throw new Error('Add your first and last name to your profile first.');
    const contactEmail = (a.email || email || '').trim();
    if (!contactEmail) throw new Error('Add an email address to your profile first.');

    const [selfie, idPhoto] = await Promise.all([download(docs.photo), download(docs.id_front)]);
    if (!isJpeg(selfie) || !isJpeg(idPhoto)) throw new Error('The face check needs both photos as JPEG. Please re-upload them as JPEG.');

    try {
        const tokenRes = await fetch(`${base()}/v3/token`, { method: 'POST', headers: { 'smileid-partner-id': partnerId(), 'smileid-api-key': apiKey() } });
        const tokenBody: any = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok || !tokenBody.token) throw new Error(tokenBody.message || `Smile ID token ${tokenRes.status}`);

        const form = new FormData();
        form.append('selfie_image', new Blob([new Uint8Array(selfie)], { type: 'image/jpeg' }), 'selfie.jpg');
        form.append('comparison_image', new Blob([new Uint8Array(idPhoto)], { type: 'image/jpeg' }), 'id.jpg');
        form.append('comparison_image_type', 'DOCUMENT');
        form.append('user_details', JSON.stringify({ given_names: a.first_name, last_name: a.last_name, email: contactEmail }));
        form.append('consent', JSON.stringify({
            granted: true, granted_at: new Date().toISOString(), notice_language: 'EN',
            notice_privacy_policy_url: process.env.PRIVACY_POLICY_URL || 'https://moneywise.africa/privacy',
        }));
        form.append('callback_url', `${process.env.API_PUBLIC_URL!.replace(/\/$/, '')}/kyc-face-match/callback`);
        form.append('partner_params', JSON.stringify({ user_id: userId }));

        const res = await fetch(`${base()}/v3/compare`, { method: 'POST', headers: { 'SmileID-Token': tokenBody.token, 'SmileID-Partner-ID': partnerId() }, body: form });
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || `Smile ID ${res.status}`);
        await save(userId, docs.photo, 'PENDING', { job_id: body.job_id, started_at: new Date().toISOString() });
        return { state: 'PENDING', message: MESSAGE.PENDING };
    } catch (e: any) {
        console.error('[FaceMatch] start failed:', e?.message ?? e);
        await save(userId, docs.photo, 'ERROR', { error: String(e?.message ?? e).slice(0, 200) });
        return { state: 'ERROR', message: MESSAGE.ERROR };
    }
}

/** What Smile ID's callback says, read without assuming field names: only an explicit pass counts as passed. */
function readOutcome(p: any): 'PASSED' | 'REVIEW' {
    const text = JSON.stringify(p ?? {}).toLowerCase();
    if (/fail|reject|mismatch|not[_ ]?match|block|attention|error/.test(text)) return 'REVIEW';
    const verdict = String(p?.status ?? p?.result?.status ?? p?.ResultText ?? p?.result_text ?? '').toLowerCase();
    return /^(clear|pass|passed|approved|verified)/.test(verdict) || /"result_?text":"(?:[^"]*)(?:passed|approved|verified)/.test(text) ? 'PASSED' : 'REVIEW';
}

/** Smile ID signs each callback: HMAC-SHA256 of timestamp + partner id + "sid_request", keyed by the API key, base64. */
export function verifyCallback(timestamp: string | undefined, signature: string | undefined): boolean {
    if (!timestamp || !signature) return false;
    const expected = crypto.createHmac('sha256', apiKey()).update(timestamp + partnerId() + 'sid_request').digest('base64');
    const a = Buffer.from(expected), b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function handleCallback(headers: Record<string, any>, payload: any): Promise<boolean> {
    if (!faceMatchEnabled() || !verifyCallback(headers['response-timestamp'], headers['response-signature'])) return false;
    const jobId = String(payload?.job_id ?? payload?.SmileJobID ?? payload?.result?.job_id ?? '');
    if (!jobId) return false;
    const { data: row } = await supabase.from('kyc_document_checks').select('user_id, path, details').eq('slot', SLOT).filter('details->>job_id', 'eq', jobId).maybeSingle();
    if (!row) return false;
    const state = readOutcome(payload);
    await save(row.user_id, row.path, state, { job_id: jobId, reply: JSON.stringify(payload).slice(0, 4000) });
    return true;
}

export async function faceMatchStatus(userId: string): Promise<FaceMatchStatus> {
    if (!faceMatchEnabled()) return { state: 'OFF', message: MESSAGE.OFF };
    const { data } = await supabase.from('kyc_document_checks').select('details, checked_at').eq('user_id', userId).eq('slot', SLOT).maybeSingle();
    const state = ((data?.details as any)?.state ?? 'NOT_STARTED') as FaceMatchState;
    return { state, message: MESSAGE[state] ?? MESSAGE.NOT_STARTED, checkedAt: data?.checked_at };
}
