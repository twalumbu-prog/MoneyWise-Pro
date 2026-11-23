import crypto from 'crypto';

/**
 * Zambian mobile numbers and one-time codes for personal onboarding (step "phone"). Pure, so it is tested by
 * `npm run test:onboarding`.
 *
 * A Zambian mobile number is +260 followed by 9 digits starting 9 or 7 (09x / 07x when written with the trunk 0).
 * The second digit names the network: 6 MTN, 7 Airtel, 5 Zamtel.
 */
export type MobileNetwork = 'MTN' | 'AIRTEL' | 'ZAMTEL';

const NETWORK_BY_DIGIT: Record<string, MobileNetwork> = { '6': 'MTN', '7': 'AIRTEL', '5': 'ZAMTEL' };

export function parseZambianMobile(raw: unknown): { e164: string; national: string; network: MobileNetwork | null } | { error: string } {
    let d = String(raw ?? '').replace(/[^\d+]/g, '');
    if (d.startsWith('+')) d = d.slice(1);
    else if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('260')) d = d.slice(3);
    else if (d.startsWith('0')) d = d.slice(1);
    if (!/^\d+$/.test(d)) return { error: 'Use digits only' };
    if (d.length !== 9) return { error: 'Enter the 9 digits after +260' };
    if (d[0] !== '9' && d[0] !== '7') return { error: 'That isn’t a Zambian mobile number' };
    return { e164: `+260${d}`, national: `0${d}`, network: NETWORK_BY_DIGIT[d[1]] ?? null };
}

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_MS = 30 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LOCK_MS = 10 * 60 * 1000;

export const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/** Salted with the user id so the same code for two people never has the same hash. */
export const hashOtp = (userId: string, code: string) => crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');

export interface PendingVerification {
    phone: string;
    code_hash: string;
    attempts: number;
    sent_at: string;
    expires_at: string;
    locked_until: string | null;
}

/** Can a new code be sent now? Returns the wait in seconds when not. */
export function resendWait(pending: PendingVerification | null, now = Date.now()): number {
    if (!pending) return 0;
    if (pending.locked_until && new Date(pending.locked_until).getTime() > now) {
        return Math.ceil((new Date(pending.locked_until).getTime() - now) / 1000);
    }
    const next = new Date(pending.sent_at).getTime() + OTP_RESEND_MS;
    return next > now ? Math.ceil((next - now) / 1000) : 0;
}

export type OtpCheck =
    | { ok: true }
    | { ok: false; reason: 'none' | 'locked' | 'expired' | 'wrong'; attemptsLeft?: number; lockedUntil?: string };

/** Compare a typed code with the pending one. The caller saves `attempts`/`locked_until` from `next` on a wrong code. */
export function checkOtp(userId: string, pending: PendingVerification | null, code: unknown, now = Date.now()):
    { result: OtpCheck; next?: Partial<PendingVerification> } {
    if (!pending) return { result: { ok: false, reason: 'none' } };
    if (pending.locked_until && new Date(pending.locked_until).getTime() > now) {
        return { result: { ok: false, reason: 'locked', lockedUntil: pending.locked_until } };
    }
    if (new Date(pending.expires_at).getTime() <= now) return { result: { ok: false, reason: 'expired' } };
    const typed = String(code ?? '').replace(/\D/g, '');
    const a = Buffer.from(hashOtp(userId, typed));
    const b = Buffer.from(pending.code_hash);
    if (typed.length === 6 && a.length === b.length && crypto.timingSafeEqual(a, b)) return { result: { ok: true } };
    const attempts = pending.attempts + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
        const lockedUntil = new Date(now + OTP_LOCK_MS).toISOString();
        return { result: { ok: false, reason: 'locked', lockedUntil }, next: { attempts, locked_until: lockedUntil } };
    }
    return { result: { ok: false, reason: 'wrong', attemptsLeft: OTP_MAX_ATTEMPTS - attempts }, next: { attempts } };
}

export const otpMessage = (code: string) =>
    `${code} is your MoneyWise verification code. It expires in 10 minutes. Don't share it with anyone, MoneyWise will never ask you for it.`;

/** Things people come to MoneyWise for (step "intents"). */
export const PERSONAL_INTENTS = ['track_spending', 'save', 'invest', 'pay_bills', 'grow_net_worth', 'family', 'loan'] as const;
export type PersonalIntent = typeof PERSONAL_INTENTS[number];
export const cleanIntents = (raw: unknown): PersonalIntent[] =>
    Array.isArray(raw) ? [...new Set(raw.filter((x): x is PersonalIntent => (PERSONAL_INTENTS as readonly string[]).includes(x)))] : [];

/** Built-in avatars: "preset:<n>", drawn by the app. */
export const AVATAR_PRESET_COUNT = 8;
export const isAvatarPreset = (v: unknown) => typeof v === 'string' && /^preset:[1-8]$/.test(v);
