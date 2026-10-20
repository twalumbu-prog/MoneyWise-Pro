/**
 * pinRecovery.service.ts — "I forgot my app PIN" by email.
 *
 * The PIN itself lives only on the person's phone (hashed in the device keychain). When it is forgotten, the account
 * email proves who they are: we mail a 6-digit code (10 minutes, 5 tries, one per minute) and, once it is confirmed, the
 * app lets them choose a new PIN. Codes are stored hashed, never in the clear.
 */
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { emailService } from './email.service';

const TTL_MS = 10 * 60_000;
const RESEND_MS = 60_000;
const MAX_TRIES = 5;
const keyFor = (userId: string) => `pinrec:${userId}`;
const hash = (userId: string, code: string) => crypto.createHash('sha256').update(`${userId}:${code}:${process.env.PIN_RECOVERY_PEPPER ?? 'moneywise'}`).digest('hex');

export class PinRecoveryError extends Error {
    constructor(message: string, public httpStatus = 400) { super(message); }
}

export const maskEmail = (email: string) => {
    const [name, domain] = email.split('@');
    if (!domain) return email;
    return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
};

async function requestCode(userId: string): Promise<{ sentTo: string; expiresInSeconds: number }> {
    const { data: user } = await supabase.from('users').select('email, name').eq('id', userId).maybeSingle();
    if (!user?.email) throw new PinRecoveryError('We could not find an email address for your account.', 404);

    const { data: row } = await supabase.from('app_settings').select('value').eq('key', keyFor(userId)).maybeSingle();
    const prev: any = row?.value;
    if (prev?.sentAt && Date.now() - prev.sentAt < RESEND_MS) {
        throw new PinRecoveryError('A code was just sent. Please wait a minute before asking for another.', 429);
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await supabase.from('app_settings').upsert({
        key: keyFor(userId),
        value: { hash: hash(userId, code), exp: Date.now() + TTL_MS, sentAt: Date.now(), tries: 0 },
        description: 'Pending app-PIN recovery code (hashed; safe to delete).',
        updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    const body = `
        <h2>Reset your MoneyWise PIN</h2>
        <p>Hi ${(user.name || '').split(' ')[0] || 'there'}, use this code in the app to set a new PIN:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:20px 0;">${code}</p>
        <p>It expires in 10 minutes. If you didn't ask for this, you can ignore this email — your PIN has not been changed.</p>
    `;
    await emailService.sendEmail({ to: user.email, subject: 'Your MoneyWise PIN reset code', html: emailService.wrapTemplate(body) });
    return { sentTo: maskEmail(user.email), expiresInSeconds: TTL_MS / 1000 };
}

async function verifyCode(userId: string, code: string): Promise<void> {
    const clean = String(code ?? '').replace(/\D/g, '');
    const { data: row } = await supabase.from('app_settings').select('value').eq('key', keyFor(userId)).maybeSingle();
    const rec: any = row?.value;
    if (!rec?.hash || Date.now() > rec.exp) throw new PinRecoveryError('That code has expired. Ask for a new one.', 410);
    if ((rec.tries ?? 0) >= MAX_TRIES) throw new PinRecoveryError('Too many attempts. Ask for a new code.', 429);

    const ok = clean.length === 6 && crypto.timingSafeEqual(Buffer.from(hash(userId, clean)), Buffer.from(rec.hash));
    if (!ok) {
        await supabase.from('app_settings').update({ value: { ...rec, tries: (rec.tries ?? 0) + 1 } }).eq('key', keyFor(userId));
        throw new PinRecoveryError('That code is not right.', 400);
    }
    await supabase.from('app_settings').delete().eq('key', keyFor(userId));
}

export const pinRecoveryService = { requestCode, verifyCode };
