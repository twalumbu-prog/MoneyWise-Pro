/**
 * capture.logic.ts — the deterministic rules of transaction capture. No I/O: every decision that can book or merge
 * money lives here so it can be unit-tested (npm run test:capture). The AI only fills drafts; these functions decide.
 */
import { dedupeKey as momoDedupeKey, type ParsedMomoMessage } from '../momoCapture/parser';

export type Direction = 'IN' | 'OUT';
export type CaptureStatus = 'NEW' | 'NEEDS_REVIEW' | 'POSTING' | 'APPROVED' | 'AUTO_POSTED' | 'MERGED' | 'DISMISSED' | 'FAILED';
export type ClaimState = 'CLAIMED' | 'CORROBORATED';

export const LENCO_WINDOW_MIN = 120;           // ±2 h when the evidence carries a time
export const LENCO_WINDOW_DATE_ONLY_MIN = 1440; // ±24 h when it carries only a date
export const MOMO_WINDOW_MIN = 30;
export const AUTO_MERGE_MIN_CONFIDENCE = 0.8;
export const AUTO_POST_MIN_CONFIDENCE = 0.9;
export const UNDO_WINDOW_DAYS = 7;

const phoneTail = (s: string | null | undefined) => String(s || '').replace(/\D/g, '').slice(-9);

export interface MatchCandidate { id: string; amount: number; at: string; text?: string | null }
export interface ScoredCandidate { id: string; score: number; minutesApart: number; phoneMatch: boolean }

/** Same amount (to the ngwee) inside the window; scored on time gap and phone. Ordering is total, so ties are visible. */
export function scoreCandidates(
    target: { amount: number; at: string; phone?: string | null },
    candidates: MatchCandidate[],
    windowMin: number,
): ScoredCandidate[] {
    const t = new Date(target.at).getTime();
    const tail = phoneTail(target.phone);
    const out: ScoredCandidate[] = [];
    for (const c of candidates) {
        if (Math.abs(Number(c.amount) - Number(target.amount)) >= 0.005) continue;
        const minutesApart = Math.abs(new Date(c.at).getTime() - t) / 60_000;
        if (!Number.isFinite(minutesApart) || minutesApart > windowMin) continue;
        const phoneMatch = tail.length === 9 && String(c.text || '').replace(/\D/g, '').includes(tail);
        const score = Math.round((0.6 + 0.2 * (1 - minutesApart / windowMin) + (phoneMatch ? 0.2 : 0)) * 1000) / 1000;
        out.push({ id: c.id, score, minutesApart: Math.round(minutesApart * 10) / 10, phoneMatch });
    }
    return out.sort((a, b) => b.score - a.score || a.minutesApart - b.minutesApart || a.id.localeCompare(b.id));
}

export type MergeDecision = { action: 'NONE' } | { action: 'SUGGEST'; candidates: ScoredCandidate[] } | { action: 'AUTO_MERGE'; candidate: ScoredCandidate };

/**
 * Auto-merge only when the evidence is confident AND the target is unambiguous: exactly one candidate, or exactly one
 * candidate whose phone matches. Anything else (ties, several plausible entries) goes to a person.
 */
export function decideMerge(scored: ScoredCandidate[], extractionConfidence: number | null): MergeDecision {
    if (scored.length === 0) return { action: 'NONE' };
    const confident = (extractionConfidence ?? 0) >= AUTO_MERGE_MIN_CONFIDENCE;
    const phoneMatches = scored.filter(c => c.phoneMatch);
    if (confident && scored.length === 1) return { action: 'AUTO_MERGE', candidate: scored[0] };
    if (confident && phoneMatches.length === 1) return { action: 'AUTO_MERGE', candidate: phoneMatches[0] };
    return { action: 'SUGGEST', candidates: scored.slice(0, 3) };
}

/** Capture is a Premium feature, and only while the subscription is active (past_due and cancelled lose access). */
export const capturePlanEligible = (e: { planId: string; status: string }) => e.planId === 'premium' && e.status === 'active';

/** The local part of the first address at our receiving domain, from fields that may be strings, arrays or "Name <a@b>". */
export function recipientAlias(fields: unknown[], domain: string): string | null {
    const suffix = `@${domain.toLowerCase()}`;
    for (const raw of fields.flat(2)) {
        if (typeof raw !== 'string') continue;
        const address = (raw.match(/<([^>]+)>/)?.[1] ?? raw).trim().toLowerCase();
        if (address.endsWith(suffix) && address.length > suffix.length) return address.slice(0, -suffix.length);
    }
    return null;
}

/** Free-form replies are allowed for 24 hours after the customer's last message. */
export const replyWindowEndsAt = (lastInboundAt: string | null | undefined): string | null =>
    lastInboundAt ? new Date(new Date(lastInboundAt).getTime() + 24 * 3600_000).toISOString() : null;

export interface AutoPostInput {
    captureEnabled: boolean;
    autoPostEnabled: boolean;
    autoPostLimit: number;
    amount: number | null;
    confidence: number | null;
    deterministic: boolean;
    claimState: ClaimState;
    matchType: string;
    hasWallet: boolean;
    hasAccount: boolean;
    flags: string[];
}

/** Stage 5 for a NEW off-platform entry. Model confidence alone can never satisfy this: a deterministic parse and corroboration are required too. */
export function decideAutoPost(i: AutoPostInput): { autoPost: boolean; reason: string } {
    if (!i.captureEnabled) return { autoPost: false, reason: 'capture_disabled' };
    if (!i.autoPostEnabled) return { autoPost: false, reason: 'auto_post_off' };
    if (i.flags.length > 0) return { autoPost: false, reason: `flagged:${i.flags.join(',')}` };
    if (i.matchType !== 'NONE') return { autoPost: false, reason: 'matched' };
    if (!i.deterministic) return { autoPost: false, reason: 'not_deterministic' };
    if (i.claimState !== 'CORROBORATED') return { autoPost: false, reason: 'claim_not_corroborated' };
    if ((i.confidence ?? 0) < AUTO_POST_MIN_CONFIDENCE) return { autoPost: false, reason: 'low_confidence' };
    if (!(Number(i.amount) > 0)) return { autoPost: false, reason: 'no_amount' };
    if (Number(i.amount) > Number(i.autoPostLimit)) return { autoPost: false, reason: 'over_limit' };
    if (!i.hasWallet || !i.hasAccount) return { autoPost: false, reason: 'incomplete_draft' };
    return { autoPost: true, reason: 'eligible' };
}

/**
 * One key per real-world movement: a MoMo confirmation keys the same whether it came by SMS, notification or screenshot.
 * The provider prefix is dropped because a screenshot has no SMS sender, so the parser may name the provider differently.
 */
const withoutProvider = (k: string) => k.replace(/^[A-Z]+:/, '');
export function captureDedupeKey(e: { momo?: { parsed: ParsedMomoMessage; rawText: string } | null; momoRowKey?: string | null; sha256?: string | null }): string {
    if (e.momoRowKey) return `momo:${withoutProvider(e.momoRowKey)}`;
    if (e.momo) return `momo:${withoutProvider(momoDedupeKey(e.momo.parsed, e.momo.rawText))}`;
    if (e.sha256) return `att:${e.sha256}`;
    throw new Error('captureDedupeKey: no evidence to key on');
}

const INJECTION = [
    /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions|prompts?|rules)/i,
    /disregard\s+(all\s+|the\s+)?(previous|prior|above)/i,
    /\b(system|assistant)\s*(prompt|message)?\s*:/i,
    /you\s+are\s+now\b/i,
    /\b(mark|record|book|set)\b[^.\n]{0,40}\b(as\s+)?(received|paid|approved|confirmed)\b/i,
    /<\/?(system|instructions?|prompt)>/i,
];

/** Text that addresses the model rather than describing a transaction. Flagged captures are never auto-posted. */
export function looksLikeInjection(text: string | null | undefined): boolean {
    const s = String(text || '').normalize('NFKC');
    return INJECTION.some(r => r.test(s));
}

export function paymentMethodFrom(raw: string | null | undefined): 'CASH' | 'MOMO_PERSONAL' | 'OTHER_BANK' | 'UNKNOWN' {
    const s = String(raw || '').toLowerCase();
    if (!s) return 'UNKNOWN';
    if (/\bcash\b/.test(s)) return 'CASH';
    if (/momo|mobile\s*money|airtel|mtn|zamtel/.test(s)) return 'MOMO_PERSONAL';
    if (/card|visa|master|bank|transfer|eft|pos/.test(s)) return 'OTHER_BANK';
    return 'UNKNOWN';
}

/** MoMo Capture row status → queue status. MoMo keeps booking exactly as before; the queue only mirrors it. */
export function mirrorStatus(momoStatus: string, autoPosted: boolean): CaptureStatus {
    switch (momoStatus) {
        case 'POSTED': return autoPosted ? 'AUTO_POSTED' : 'APPROVED';
        case 'MATCHED': return 'MERGED';
        case 'DISMISSED': return 'DISMISSED';
        default: return 'NEEDS_REVIEW';
    }
}

/** Field-level diff between the AI draft and what a person approved; feeds learning and the edit-rate gate. */
export function draftDiff(draft: Record<string, any>, final: Record<string, any>): Record<string, { from: any; to: any }> {
    const diff: Record<string, { from: any; to: any }> = {};
    for (const k of Object.keys(final)) {
        const a = draft[k] ?? null; const b = final[k] ?? null;
        const same = typeof a === 'number' || typeof b === 'number' ? Math.abs(Number(a) - Number(b)) < 0.005 && a !== null && b !== null : String(a) === String(b);
        if (!same && !(a === null && b === null)) diff[k] = { from: a, to: b };
    }
    return diff;
}

/** Ledger dates are Lusaka calendar days (UTC+2). */
export const lusakaDate = (iso: string) => new Date(new Date(iso).getTime() + 2 * 3600_000).toISOString().slice(0, 10);
