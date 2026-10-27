/**
 * momoCapture.service.ts — mobile money messages captured on the phone → external-account ledger entries.
 *
 * Sources: the Android app's SMS receiver and notification listener (native, run even when the app is closed), an iOS
 * Shortcuts "message received" automation, and a manual paste. All of them hand over the raw message text; parsing,
 * dedupe and booking happen here so every source books exactly the same way.
 *
 * Booking goes through recordManualEntry — the same path as "New manual entry" — into either a per-provider external
 * account ("MTN MoMo", "Airtel Money", …) or the Cash account, per the user's setting. A message whose movement is
 * already in the ledger through Lenco (same amount, same direction, within half an hour on the MoneyWise wallet) is
 * marked MATCHED and never booked: those payments are real Lenco transactions and the sync owns them.
 */
import crypto from 'crypto';
import { supabase } from '../../lib/supabase';
import { recordManualEntry, ensureCashWallet, listExternalWallets, ManualEntryError } from '../manualEntry.service';
import { parseMomoMessage, dedupeKey, describe, type MomoProvider, type ParsedMomoMessage } from './parser';

export class MomoCaptureError extends Error {
    constructor(message: string, public httpStatus = 400) { super(message); }
}

export type CaptureSource = 'ANDROID_SMS' | 'ANDROID_NOTIFICATION' | 'IOS_SHORTCUT' | 'PASTE';
const SOURCES: CaptureSource[] = ['ANDROID_SMS', 'ANDROID_NOTIFICATION', 'IOS_SHORTCUT', 'PASTE'];

const PROVIDER_WALLET: Record<MomoProvider, string> = { MTN: 'MTN MoMo', AIRTEL: 'Airtel Money', ZAMTEL: 'Zamtel Kwacha', OTHER: 'Mobile Money' };
const LENCO_MATCH_WINDOW_MS = 30 * 60 * 1000;
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
/** Ledger dates are Zambian calendar days (CAT, UTC+2). */
const lusakaDate = (iso: string) => new Date(new Date(iso).getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10);

async function settingsRow(userId: string, orgId: string) {
    const { data } = await supabase.from('momo_capture_settings').select('*').eq('user_id', userId).maybeSingle();
    if (data) return data;
    const { data: created, error } = await supabase.from('momo_capture_settings')
        .upsert({ user_id: userId, organization_id: orgId }, { onConflict: 'user_id' }).select('*').single();
    if (error) throw new MomoCaptureError(`Could not load capture settings: ${error.message}`, 500);
    return created;
}

export async function getSettings(userId: string, orgId: string) {
    const row = await settingsRow(userId, orgId);
    const { count } = await supabase.from('momo_captures').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('organization_id', orgId).eq('status', 'PENDING');
    return {
        autoPost: !!row.auto_post,
        destination: row.destination as 'PROVIDER' | 'CASH',
        hasToken: !!row.token_hash,
        tokenCreatedAt: row.token_created_at ?? null,
        lastCaptureAt: row.last_capture_at ?? null,
        lastCaptureSource: row.last_capture_source ?? null,
        pendingCount: count ?? 0,
    };
}

export async function updateSettings(userId: string, orgId: string, patch: { autoPost?: unknown; destination?: unknown }) {
    await settingsRow(userId, orgId);
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof patch.autoPost === 'boolean') update.auto_post = patch.autoPost;
    if (patch.destination === 'PROVIDER' || patch.destination === 'CASH') update.destination = patch.destination;
    await supabase.from('momo_capture_settings').update(update).eq('user_id', userId);
    return getSettings(userId, orgId);
}

/**
 * Issues a fresh capture token (and invalidates the previous one). Only its hash is stored, so this is the one moment
 * the plaintext exists — the app hands it to the Android native layer / the iOS Shortcut straight away. Captures land
 * in the organisation that was active when the key was issued.
 */
export async function rotateToken(userId: string, orgId: string): Promise<string> {
    await settingsRow(userId, orgId);
    const token = `mwc_${crypto.randomBytes(24).toString('base64url')}`;
    const { error } = await supabase.from('momo_capture_settings')
        .update({ organization_id: orgId, token_hash: hashToken(token), token_created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    if (error) throw new MomoCaptureError(`Could not create a capture key: ${error.message}`, 500);
    return token;
}

export async function revokeToken(userId: string) {
    await supabase.from('momo_capture_settings').update({ token_hash: null, token_created_at: null, updated_at: new Date().toISOString() }).eq('user_id', userId);
}

export async function resolveToken(token: string): Promise<{ userId: string; orgId: string } | null> {
    if (typeof token !== 'string' || !token.startsWith('mwc_') || token.length > 100) return null;
    const { data } = await supabase.from('momo_capture_settings').select('user_id, organization_id').eq('token_hash', hashToken(token)).maybeSingle();
    return data ? { userId: data.user_id, orgId: data.organization_id } : null;
}

/** The Lenco-synced wallet entry this message describes, if there is one. */
async function findLencoTwin(orgId: string, p: ParsedMomoMessage, occurredAt: string): Promise<string | null> {
    const t = new Date(occurredAt).getTime();
    const { data } = await supabase.from('cashbook_entries').select('id')
        .eq('organization_id', orgId).eq('account_type', 'MONEYWISE_WALLET')
        .eq(p.direction === 'IN' ? 'debit' : 'credit', p.amount)
        .gte('created_at', new Date(t - LENCO_MATCH_WINDOW_MS).toISOString())
        .lte('created_at', new Date(t + LENCO_MATCH_WINDOW_MS).toISOString())
        .limit(1);
    return data?.[0]?.id ?? null;
}

export interface IngestInput {
    userId: string; orgId: string; source: unknown; text: unknown; sender?: unknown; occurredAt?: unknown;
}

export async function ingest(input: IngestInput) {
    const source = SOURCES.includes(input.source as CaptureSource) ? (input.source as CaptureSource) : null;
    if (!source) throw new MomoCaptureError('Unknown capture source');
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text) throw new MomoCaptureError('Message text is required');
    const sender = typeof input.sender === 'string' ? input.sender.slice(0, 60) : null;
    const when = typeof input.occurredAt === 'string' || typeof input.occurredAt === 'number' ? new Date(input.occurredAt) : new Date();
    // A device clock can be off; anything implausible is stamped with the time it reached us.
    const occurredAt = (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 10 * 60 * 1000 || when.getTime() < Date.now() - 400 * 24 * 3600 * 1000)
        ? new Date().toISOString() : when.toISOString();

    const parsed = parseMomoMessage(text, sender);
    await supabase.from('momo_capture_settings')
        .update({ last_capture_at: new Date().toISOString(), last_capture_source: source }).eq('user_id', input.userId);
    if (!parsed) return { accepted: false as const, reason: 'NOT_A_TRANSACTION' };

    const twin = await findLencoTwin(input.orgId, parsed, occurredAt);
    const { data: row, error } = await supabase.from('momo_captures').insert({
        organization_id: input.orgId, user_id: input.userId, source, provider: parsed.provider, sender,
        raw_text: text.slice(0, 1200), direction: parsed.direction, amount: parsed.amount, fee: parsed.fee,
        balance_after: parsed.balanceAfter, counterparty: parsed.counterparty, provider_reference: parsed.reference,
        occurred_at: occurredAt, dedupe_key: dedupeKey(parsed, text),
        status: twin ? 'MATCHED' : 'PENDING', matched_entry_id: twin,
    }).select('*').single();
    if (error) {
        if (error.code === '23505') return { accepted: true as const, duplicate: true };
        throw new MomoCaptureError(`Could not save the message: ${error.message}`, 500);
    }

    if (!twin) {
        const settings = await settingsRow(input.userId, input.orgId);
        if (settings.auto_post) {
            try { return { accepted: true as const, capture: await post(input.userId, input.orgId, row.id) }; }
            catch (e: any) { console.error('[MoMo capture] auto-post failed, left for review:', e.message); }
        }
    }
    return { accepted: true as const, capture: row };
}

export async function list(userId: string, orgId: string, status?: unknown) {
    let q = supabase.from('momo_captures').select('*').eq('user_id', userId).eq('organization_id', orgId)
        .order('occurred_at', { ascending: false }).limit(100);
    if (typeof status === 'string' && ['PENDING', 'POSTED', 'MATCHED', 'DISMISSED'].includes(status)) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new MomoCaptureError(error.message, 500);
    return data ?? [];
}

async function walletFor(orgId: string, provider: MomoProvider, destination: string) {
    if (destination === 'CASH') return ensureCashWallet(orgId);
    const name = PROVIDER_WALLET[provider];
    const existing = (await listExternalWallets(orgId)).find((w) => w.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const { data, error } = await supabase.from('external_wallets')
        .insert({ organization_id: orgId, name, provider_type: 'MOBILE_MONEY', provider_name: name })
        .select('id, name, provider_type, provider_name').single();
    if (data) return data;
    // Lost a race with a concurrent capture creating the same account.
    const again = (await listExternalWallets(orgId)).find((w) => w.name.toLowerCase() === name.toLowerCase());
    if (again) return again;
    throw new MomoCaptureError(`Could not create the ${name} account: ${error?.message}`, 500);
}

/**
 * Books a capture. The PENDING → POSTED flip happens first and conditionally, so two taps (or a tap racing auto-post)
 * can't book it twice; a failed booking puts it back to PENDING.
 */
export async function post(userId: string, orgId: string, id: string, overrides: { direction?: unknown; amount?: unknown; accountId?: unknown; description?: unknown } = {}) {
    const { data: claimed } = await supabase.from('momo_captures').update({ status: 'POSTED', updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId).eq('organization_id', orgId).in('status', ['PENDING', 'MATCHED']).select('*').maybeSingle();
    if (!claimed) throw new MomoCaptureError('This message was already handled or no longer exists', 409);

    try {
        const settings = await settingsRow(userId, orgId);
        const wallet = await walletFor(orgId, claimed.provider, settings.destination);
        const direction = overrides.direction === 'IN' || overrides.direction === 'OUT' ? overrides.direction : claimed.direction;
        const amount = Number(overrides.amount) > 0 ? Number(overrides.amount) : Number(claimed.amount);
        const description = typeof overrides.description === 'string' && overrides.description.trim().length >= 2
            ? overrides.description.trim()
            : describe({ ...claimed, direction, counterparty: claimed.counterparty } as ParsedMomoMessage);
        const date = lusakaDate(claimed.occurred_at);
        const accountId = typeof overrides.accountId === 'string' ? overrides.accountId : null;

        const entry = await recordManualEntry({ orgId, userId, direction, amount, description, date, externalWalletId: wallet.id, accountId });
        // The operator's charge leaves the same wallet, so it's booked beside the movement it belongs to.
        if (claimed.fee && Number(claimed.fee) > 0) {
            await recordManualEntry({ orgId, userId, direction: 'OUT', amount: Number(claimed.fee), description: `${description} · fee`, date, externalWalletId: wallet.id });
        }
        const { data: done } = await supabase.from('momo_captures')
            .update({ cashbook_entry_id: entry.entryId, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
        return { ...done, entry };
    } catch (e: any) {
        await supabase.from('momo_captures').update({ status: claimed.status, updated_at: new Date().toISOString() }).eq('id', id);
        if (e instanceof ManualEntryError) throw new MomoCaptureError(e.message, e.httpStatus);
        throw e;
    }
}

export async function dismiss(userId: string, orgId: string, id: string) {
    const { data } = await supabase.from('momo_captures').update({ status: 'DISMISSED', updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId).eq('organization_id', orgId).in('status', ['PENDING', 'MATCHED']).select('*').maybeSingle();
    if (!data) throw new MomoCaptureError('This message was already handled or no longer exists', 409);
    return data;
}
