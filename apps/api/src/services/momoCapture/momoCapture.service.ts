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
 *
 * Capturing a message never moves money by itself — a wallet's ledger balance changes only when its capture is
 * booked (or auto-posted, which is still an explicit per-user setting). "Wallet balances" in the app is read-only:
 * the operator's own running total from messages, shown next to the ledger figure, not written into it.
 */
import crypto from 'crypto';
import { supabase } from '../../lib/supabase';
import { recordManualEntry, ensureCashWallet, listExternalWallets, categoriesFor, suggestCategory, ManualEntryError } from '../manualEntry.service';
import { cashbookService } from '../cashbook.service';
import { looseGuess, parseMomoMessage, parseBalanceOnly, parseBalanceMessage, diagnoseMessage, balanceDedupeKey, dedupeKey, describe, isPersonalNumber, type MomoProvider, type ParsedMomoMessage } from './parser';
import { mirrorMomoCapture, findBookedCaptureEntry } from '../capture/capture.momoMirror';

export class MomoCaptureError extends Error {
    constructor(message: string, public httpStatus = 400) { super(message); }
}

export type CaptureSource = 'ANDROID_SMS' | 'ANDROID_NOTIFICATION' | 'IOS_SHORTCUT' | 'PASTE';
const SOURCES: CaptureSource[] = ['ANDROID_SMS', 'ANDROID_NOTIFICATION', 'IOS_SHORTCUT', 'PASTE'];

const PROVIDER_WALLET: Record<MomoProvider, string> = { MTN: 'MTN MoMo', AIRTEL: 'Airtel Money', ZAMTEL: 'Zamtel Kwacha', OTHER: 'Mobile Money' };
const LENCO_MATCH_WINDOW_MS = 30 * 60 * 1000;
const SAME_MESSAGE_WINDOW_MS = 15 * 60 * 1000;
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
    const { count: openChecks } = await supabase.from('momo_balance_checks').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('organization_id', orgId).eq('status', 'OPEN');
    // The key belongs to the person and lands messages in ONE workspace (the one it was last set up in). Say so, and
    // count what already went to their other workspaces, so nothing seems to vanish.
    const devices = await listDevices(userId);
    const captureOrgId = (row.organization_id as string) ?? orgId;
    const [{ count: elsewhereCaptures }, { count: elsewhereIgnored }, captureWorkspaceName] = await Promise.all([
        supabase.from('momo_captures').select('id', { count: 'exact', head: true }).eq('user_id', userId).neq('organization_id', orgId),
        supabase.from('momo_ignored_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).neq('organization_id', orgId),
        workspaceName(captureOrgId),
    ]);
    return {
        captureWorkspace: { id: captureOrgId, name: captureWorkspaceName },
        capturingHere: captureOrgId === orgId,
        elsewhere: { captures: elsewhereCaptures ?? 0, ignored: elsewhereIgnored ?? 0 },
        autoPost: !!row.auto_post,
        destination: row.destination as 'PROVIDER' | 'CASH',
        hasToken: !!row.token_hash || devices.length > 0,
        devices,
        tokenCreatedAt: row.token_created_at ?? null,
        lastCaptureAt: row.last_capture_at ?? null,
        lastCaptureSource: row.last_capture_source ?? null,
        pendingCount: (count ?? 0) + (openChecks ?? 0),
        defaultProvider: (row.default_provider ?? null) as 'MTN' | 'AIRTEL' | 'ZAMTEL' | null,
    };
}

export async function updateSettings(userId: string, orgId: string, patch: { autoPost?: unknown; destination?: unknown; defaultProvider?: unknown }) {
    await settingsRow(userId, orgId);
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof patch.autoPost === 'boolean') update.auto_post = patch.autoPost;
    if (patch.destination === 'PROVIDER' || patch.destination === 'CASH') update.destination = patch.destination;
    if (patch.defaultProvider === null || ['MTN', 'AIRTEL', 'ZAMTEL'].includes(patch.defaultProvider as string)) update.default_provider = patch.defaultProvider;
    await supabase.from('momo_capture_settings').update(update).eq('user_id', userId);
    return getSettings(userId, orgId);
}

/** Points the existing key at the workspace the person is in now. The key itself is unchanged, so the phone needs nothing. */
export async function moveCaptureHere(userId: string, orgId: string) {
    await settingsRow(userId, orgId);
    const { error } = await supabase.from('momo_capture_settings').update({ organization_id: orgId, updated_at: new Date().toISOString() }).eq('user_id', userId);
    if (error) throw new MomoCaptureError(`Could not move capture: ${error.message}`, 500);
    workspaceNames.delete(orgId);
    return getSettings(userId, orgId);
}

/**
 * Issues a fresh capture token (and invalidates the previous one). Only its hash is stored, so this is the one moment
 * the plaintext exists — the app hands it to the Android native layer / the iOS Shortcut straight away. Captures land
 * in the organisation that was active when the key was issued.
 */
export interface DeviceInfo { deviceId?: unknown; label?: unknown; platform?: unknown }

/**
 * Issues a capture key for ONE device. A phone that sends its `deviceId` gets its own key (a re-connect replaces only
 * that phone's key), so any number of phones can capture into the same account at once. A client that sends none (an
 * older app build) uses the single shared slot it always had. Only the hash is stored: this is the one moment the
 * plaintext exists. Captures land in the workspace that was active when the key was issued.
 */
export async function rotateToken(userId: string, orgId: string, device: DeviceInfo = {}): Promise<string> {
    await settingsRow(userId, orgId);
    const token = `mwc_${crypto.randomBytes(24).toString('base64url')}`;
    const now = new Date().toISOString();
    const deviceId = typeof device.deviceId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(device.deviceId) ? device.deviceId : null;
    if (deviceId) {
        const label = typeof device.label === 'string' ? device.label.slice(0, 60) : null;
        const platform = ['ios', 'android'].includes(device.platform as string) ? (device.platform as string) : 'other';
        const { error } = await supabase.from('momo_capture_devices').upsert(
            { user_id: userId, organization_id: orgId, device_id: deviceId, label, platform, token_hash: hashToken(token), revoked_at: null, last_seen_at: null },
            { onConflict: 'user_id,device_id' });
        if (error) throw new MomoCaptureError(`Could not create a capture key: ${error.message}`, 500);
        await supabase.from('momo_capture_settings').update({ organization_id: orgId, updated_at: now }).eq('user_id', userId);
        return token;
    }
    const { error } = await supabase.from('momo_capture_settings')
        .update({ organization_id: orgId, token_hash: hashToken(token), token_created_at: now, updated_at: now })
        .eq('user_id', userId);
    if (error) throw new MomoCaptureError(`Could not create a capture key: ${error.message}`, 500);
    return token;
}

/** Turns off one device (by its app-generated id), or the shared slot of older builds when none is given. */
export async function revokeToken(userId: string, deviceId?: string | null) {
    if (deviceId) {
        await supabase.from('momo_capture_devices').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId).eq('device_id', deviceId);
        return;
    }
    await supabase.from('momo_capture_settings').update({ token_hash: null, token_created_at: null, updated_at: new Date().toISOString() }).eq('user_id', userId);
}

/** Switch a device off by its row id (from the web / another phone). */
export async function removeDevice(userId: string, id: string) {
    await supabase.from('momo_capture_devices').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId).eq('id', id);
}

export async function listDevices(userId: string) {
    const { data } = await supabase.from('momo_capture_devices').select('id, device_id, label, platform, created_at, last_seen_at')
        .eq('user_id', userId).is('revoked_at', null).order('created_at', { ascending: true });
    return (data ?? []).map((d: any) => ({ id: d.id as string, deviceId: d.device_id as string, label: (d.label as string | null) ?? null, platform: (d.platform as string | null) ?? 'other', createdAt: d.created_at as string, lastSeenAt: (d.last_seen_at as string | null) ?? null }));
}

export interface TokenOwner { userId: string; orgId: string; deviceId: string | null }

export async function resolveToken(token: string): Promise<TokenOwner | null> {
    if (typeof token !== 'string' || !token.startsWith('mwc_') || token.length > 100) return null;
    const hash = hashToken(token);
    // A failed lookup is not a rejected key: answering 401 makes the phone throw its key away and stop capturing.
    const dev = await supabase.from('momo_capture_devices').select('id, user_id').eq('token_hash', hash).is('revoked_at', null).maybeSingle();
    if (dev.error) throw new MomoCaptureError('Capture is temporarily unavailable', 503);
    if (dev.data) {
        // The workspace is the person's current capture workspace (one setting for all their devices).
        const st = await supabase.from('momo_capture_settings').select('organization_id').eq('user_id', dev.data.user_id).maybeSingle();
        if (st.error || !st.data) throw new MomoCaptureError('Capture is temporarily unavailable', 503);
        void supabase.from('momo_capture_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', dev.data.id).then(() => undefined, () => undefined);
        return { userId: dev.data.user_id, orgId: st.data.organization_id, deviceId: dev.data.id };
    }
    const { data, error } = await supabase.from('momo_capture_settings').select('user_id, organization_id').eq('token_hash', hash).maybeSingle();
    if (error) throw new MomoCaptureError('Capture is temporarily unavailable', 503);
    return data ? { userId: data.user_id, orgId: data.organization_id, deviceId: null } : null;
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
    userId: string; orgId: string; source: unknown; text: unknown; sender?: unknown; occurredAt?: unknown; deviceId?: string | null;
}

/**
 * What the iPhone keeps (MomoCaptureStore.looksLikeMoneyMessage): an amount AND something only an operator or bank
 * writes. The phone ships the same defaults; these override them, so a new bank's wording is a deploy here, not an app
 * release. Patterns are ICU regexes (NSRegularExpression). Anything not matched never leaves the phone.
 */
export const DEVICE_RULES = {
    version: 1,
    amount: String.raw`(?i)(?:\b(?:ZMW|ZK)\s?\d|(?<![A-Za-z0-9])K\s?\d|\b(?:amount|amt)\s*[:.]?\s*(?:ZMW|ZK|K)?\s?\d)`,
    money: String.raw`(?i)(?:\b(?:ZMW|ZK)\b|\b(?:airtel|mtn|momo|zamtel|kwacha|zanaco|fnb|absa|stanbic|indo\s?zambia|izb|atlas\s?mara|ecobank|uba|lenco|natsave|investrust|first\s?capital|access\s?bank|bank)\b|\b(?:tid|txn|transaction\s?id|trans\.?\s?id|financial\s?transaction|ref(?:erence)?\s?(?:no)?\s?[:#.])|\b(?:bal|balance|avail(?:able)?\s?bal))`,
    // For now every message is sent so none can be lost: this lets any text through. The amount/money rules above stay
    // in place for when filtering is switched back on (drop this override).
    allow: String.raw`(?s).`,
    captureAll: true,
};

const workspaceNames = new Map<string, { name: string | null; at: number }>();
/** The organisation's display name, cached for a few minutes (asked on every captured message). */
export async function workspaceName(orgId: string): Promise<string | null> {
    const hit = workspaceNames.get(orgId);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.name;
    const { data } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
    const name = (data?.name as string | undefined) ?? null;
    workspaceNames.set(orgId, { name, at: Date.now() });
    return name;
}

export async function ingest(input: IngestInput) {
    const source = SOURCES.includes(input.source as CaptureSource) ? (input.source as CaptureSource) : null;
    if (!source) throw new MomoCaptureError('Unknown capture source');
    // Postgres rejects a NUL character, which would fail the same message on every retry.
    const text = typeof input.text === 'string' ? input.text.replace(/\u0000/g, '').trim() : '';
    if (!text) throw new MomoCaptureError('Message text is required');
    const sender = typeof input.sender === 'string' ? input.sender.slice(0, 60) : null;
    const when = typeof input.occurredAt === 'string' || typeof input.occurredAt === 'number' ? new Date(input.occurredAt) : new Date();
    // A device clock can be off; anything implausible is stamped with the time it reached us.
    const occurredAt = (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 10 * 60 * 1000 || when.getTime() < Date.now() - 400 * 24 * 3600 * 1000)
        ? new Date().toISOString() : when.toISOString();

    // A confirmation from an ordinary phone number is a scam, not a transaction (see isPersonalNumber). Checked here as
    // well as on the phone, so older app versions are covered too.
    if (isPersonalNumber(sender)) {
        await logIgnored(input.deviceId ?? null, input.userId, input.orgId, source, text, sender, 'Sent from a personal phone number, not a mobile money provider or bank — possibly a scam');
        return { accepted: false as const, reason: 'PERSONAL_NUMBER' as const };
    }

    const parsed = parseMomoMessage(text, sender);
    await supabase.from('momo_capture_settings')
        .update({ last_capture_at: new Date().toISOString(), last_capture_source: source }).eq('user_id', input.userId);
    // A message that doesn't name its provider is filed under the one this phone number is on.
    const fallbackProvider = async (found: MomoProvider): Promise<MomoProvider> =>
        found !== 'OTHER' ? found : (((await settingsRow(input.userId, input.orgId)).default_provider as MomoProvider | null) ?? 'OTHER');
    if (parsed) parsed.provider = await fallbackProvider(parsed.provider);
    if (!parsed) {
        // Not a transaction. A balance enquiry reply is compared with the ledger and offers a one-tap adjustment, but
        // is never booked by itself: an account's balance only moves when the person records something.
        const reading = parseBalanceOnly(text, sender);
        const bal = parseBalanceMessage(text, sender);
        if (bal) {
            const balanceCheck = await recordBalanceCheck(input.deviceId ?? null, input.userId, input.orgId, source, text, await fallbackProvider(bal.provider), bal.balance, occurredAt);
            if ('duplicate' in balanceCheck) await logIgnored(input.deviceId ?? null, input.userId, input.orgId, source, text, sender, 'Balance reading already captured (same figure within a few minutes)');
            return { accepted: true as const, balanceCheck };
        }
        await logIgnored(input.deviceId ?? null, input.userId, input.orgId, source, text, sender);
        return { accepted: false as const, reason: reading ? 'BALANCE_ONLY' as const : 'NOT_A_TRANSACTION' as const };
    }

    // Already in the ledger: through Lenco, or because a screenshot of this same confirmation was approved first.
    const twin = await findLencoTwin(input.orgId, parsed, occurredAt)
        ?? await findBookedCaptureEntry(input.orgId, dedupeKey(parsed, text));
    // A message with no transaction id is recognised by its wording. The same wording within a few minutes is the
    // same message arriving twice (SMS and its notification); hours or days apart it is another transaction of the
    // same amount from the same person, which must not be thrown away as a duplicate.
    let key = dedupeKey(parsed, text);
    if (!parsed.reference) {
        const t = new Date(occurredAt).getTime();
        const { data: near } = await supabase.from('momo_captures').select('id')
            .eq('organization_id', input.orgId).like('dedupe_key', `${key}%`)
            .gte('occurred_at', new Date(t - SAME_MESSAGE_WINDOW_MS).toISOString())
            .lte('occurred_at', new Date(t + SAME_MESSAGE_WINDOW_MS).toISOString()).limit(1);
        if (near?.length) { await logIgnored(input.deviceId ?? null, input.userId, input.orgId, source, text, sender, 'Already captured — the same message arrived again (from this or another phone)'); return { accepted: true as const, duplicate: true }; }
        key = `${key}:${Math.floor(t / 60000)}`;
    }
    const insert = (dedupe_key: string) => supabase.from('momo_captures').insert({
        organization_id: input.orgId, user_id: input.userId, device_id: input.deviceId ?? null, source, provider: parsed.provider, sender,
        raw_text: text.slice(0, 1200), direction: parsed.direction, amount: parsed.amount, fee: parsed.fee,
        balance_after: parsed.balanceAfter, counterparty: parsed.counterparty, provider_reference: parsed.reference,
        occurred_at: occurredAt, dedupe_key,
        status: twin ? 'MATCHED' : 'PENDING', matched_entry_id: twin,
    }).select('*').single();
    let { data: row, error } = await insert(key);
    if (error?.code === '23505' && parsed.reference) {
        // The same transaction id going the other way is a second movement, not a repeat: a reversal quotes the id
        // of the payment it undoes, and a transfer between two of your own lines shows the id on both sides.
        const { data: existing } = await supabase.from('momo_captures').select('direction')
            .eq('organization_id', input.orgId).eq('dedupe_key', key).limit(1);
        if (existing?.length && existing[0].direction !== parsed.direction) ({ data: row, error } = await insert(`${key}:${parsed.direction}`));
    }
    if (error || !row) {
        if (error?.code === '23505') { await logIgnored(input.deviceId ?? null, input.userId, input.orgId, source, text, sender, 'Already captured — the same message arrived again (from this or another phone)'); return { accepted: true as const, duplicate: true }; }
        throw new MomoCaptureError(`Could not save the message: ${error?.message}`, 500);
    }

    if (!twin) {
        const settings = await settingsRow(input.userId, input.orgId);
        if (settings.auto_post) {
            try { return { accepted: true as const, capture: await post(input.userId, input.orgId, row.id, {}, { autoPosted: true }) }; }
            catch (e: any) { console.error('[MoMo capture] auto-post failed, left for review:', e.message); }
        }
    }
    // The message is saved. Nothing after this may fail the request: the phone would retry, be told "duplicate",
    // and never show its prompt.
    try { await mirrorMomoCapture(row); } catch (e: any) { console.error('[MoMo capture] mirror failed:', e?.message); }
    return { accepted: true as const, capture: row };
}

export async function list(userId: string, orgId: string, status?: unknown) {
    let q = supabase.from('momo_captures').select('*').eq('user_id', userId).eq('organization_id', orgId)
        .order('occurred_at', { ascending: false }).limit(100);
    if (typeof status === 'string' && ['PENDING', 'POSTED', 'MATCHED', 'DISMISSED'].includes(status)) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new MomoCaptureError(error.message, 500);
    const rows = data ?? [];
    // Waiting ones get a suggested category, so confirming them can be one tap (or none) plus Next.
    if (status !== 'PENDING' || rows.length === 0) return rows;
    const s = await categorySuggestions(userId, orgId).catch((e) => {
        console.warn('[MoMo capture] suggestions failed:', e?.message);
        return null;
    });
    if (!s) return rows;
    return rows.map((r: any) => ({
        ...r,
        suggested_account_id: (() => { const k = contactKey(r.direction, r.counterparty); return k ? s.byContact.get(k) ?? null : null; })(),
        ranked_account_ids: s.ranked[r.direction as 'IN' | 'OUT'] ?? [],
    }));
}

/**
 * Who a transaction was with, as a stable key: the phone number when the message has one (names are spelt and
 * truncated differently from one message to the next), else the name. Null when there is nothing to go on.
 */
// Not the SMS sender: that is the operator ("MoMo", "Airtel"), never the other party.
export function contactKey(direction: string, counterparty: string | null | undefined): string | null {
    const text = counterparty || '';
    const digits = (text.match(/\+?\d[\d ]{6,}/)?.[0] || '').replace(/\D/g, '');
    if (digits.length >= 9) return `${direction}|tel:${digits.slice(-9)}`;
    const name = text.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (name.length >= 3) return `${direction}|name:${name}`;
    return null;
}

/**
 * Learnt from the person's own booked captures: the category last used with each contact, and the categories they
 * use most, per direction (to order the chips). Only choices that reached the ledger count.
 */
export async function categorySuggestions(userId: string, orgId: string) {
    const { data: booked, error } = await supabase.from('momo_captures')
        .select('direction, counterparty, cashbook_entry_id, occurred_at')
        .eq('user_id', userId).eq('organization_id', orgId).eq('status', 'POSTED').not('cashbook_entry_id', 'is', null)
        .order('occurred_at', { ascending: false }).limit(400);
    if (error) throw new Error(error.message);
    const ids = (booked ?? []).map((b: any) => b.cashbook_entry_id as string);
    const accountOf = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
        const { data: entries } = await supabase.from('cashbook_entries').select('id, account_id')
            .eq('organization_id', orgId).in('id', ids.slice(i, i + 200)).not('account_id', 'is', null);
        for (const e of entries ?? []) accountOf.set((e as any).id, (e as any).account_id);
    }
    // Most-used categories come from everything in the books, not just mobile money: someone new to capture still gets
    // their usual categories first. Last 120 days, so habits that changed fade out.
    const { data: ledger } = await supabase.from('cashbook_entries').select('entry_type, account_id')
        .eq('organization_id', orgId).not('account_id', 'is', null).in('entry_type', ['INFLOW', 'EXPENSE', 'DISBURSEMENT'])
        .gte('date', new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 10))
        .order('date', { ascending: false }).limit(1000);
    return buildSuggestions(
        (booked ?? []).map((b: any) => ({ ...b, account_id: accountOf.get(b.cashbook_entry_id) ?? null })),
        (ledger ?? []).map((e: any) => ({ direction: e.entry_type === 'INFLOW' ? 'IN' : 'OUT', account_id: e.account_id })),
    );
}

/**
 * Pure part of categorySuggestions. `history` (booked captures, newest first) gives the category last used with each
 * contact; the ranking counts `ledger` (every categorised entry) when given, else `history`.
 */
export function buildSuggestions(
    history: { direction: string; counterparty: string | null; account_id: string | null }[],
    ledger?: { direction: string; account_id: string | null }[],
) {
    const byContact = new Map<string, string>();
    const counts: Record<'IN' | 'OUT', Map<string, number>> = { IN: new Map(), OUT: new Map() };
    const count = (direction: string, accountId: string) => {
        if (direction === 'IN' || direction === 'OUT') counts[direction].set(accountId, (counts[direction].get(accountId) ?? 0) + 1);
    };
    for (const h of history) {
        if (!h.account_id || (h.direction !== 'IN' && h.direction !== 'OUT')) continue;
        const key = contactKey(h.direction, h.counterparty);
        if (key && !byContact.has(key)) byContact.set(key, h.account_id);   // newest wins
        if (!ledger) count(h.direction, h.account_id);
    }
    for (const e of ledger ?? []) if (e.account_id) count(e.direction, e.account_id);
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
    return { byContact, ranked: { IN: top(counts.IN), OUT: top(counts.OUT) } };
}

/**
 * What each mobile money account holds in MoneyWise: the booked ledger balance of its provider account, and nothing
 * else. A balance only moves when the person records a transaction (or taps "Adjust" on a balance check) — never from
 * a message alone, whether it is still waiting for review, dismissed, or just states a balance. Providers with no
 * account yet are left out rather than shown as zero.
 */
export async function balances(_userId: string, orgId: string) {
    const wallets = await listExternalWallets(orgId);
    const out: { provider: MomoProvider; name: string; balance: number; asOf: string }[] = [];
    for (const [provider, name] of Object.entries(PROVIDER_WALLET) as [MomoProvider, string][]) {
        const wallet = wallets.find((w) => w.name.toLowerCase() === name.toLowerCase());
        if (!wallet) continue;
        const balance = await cashbookService.getCurrentBalance(orgId, wallet.id);
        out.push({ provider, name: wallet.name, balance: Math.round(Number(balance) * 100) / 100, asOf: new Date().toISOString() });
    }
    return out;
}

/** Every capture with where it ended up in the ledger (account, category, status) — for the web review page. */
export async function listWithEntries(userId: string, orgId: string, status?: unknown) {
    const rows = await list(userId, orgId, status);
    const ids = rows.map((r: any) => r.cashbook_entry_id).filter(Boolean);
    const entries = new Map<string, any>();
    if (ids.length) {
        const { data } = await supabase.from('cashbook_entries').select('id, reference_number, status, account_id, account_type, date, description').in('id', ids);
        const accountIds = [...new Set((data ?? []).map((e: any) => e.account_id).filter(Boolean))];
        const accounts = new Map<string, any>();
        if (accountIds.length) {
            const { data: acc } = await supabase.from('accounts').select('id, code, name').in('id', accountIds);
            (acc ?? []).forEach((a: any) => accounts.set(a.id, a));
        }
        const walletIds = [...new Set((data ?? []).map((e: any) => e.account_type).filter(Boolean))];
        const wallets = new Map<string, string>();
        if (walletIds.length) {
            const { data: w } = await supabase.from('external_wallets').select('id, name').in('id', walletIds);
            (w ?? []).forEach((x: any) => wallets.set(x.id, x.name));
        }
        (data ?? []).forEach((e: any) => entries.set(e.id, {
            reference_number: e.reference_number, status: e.status, date: e.date,
            category: e.account_id ? accounts.get(e.account_id) ?? null : null,
            account: wallets.get(e.account_type) ?? null,
        }));
    }
    return rows.map((r: any) => ({ ...r, entry: r.cashbook_entry_id ? entries.get(r.cashbook_entry_id) ?? null : null }));
}

const IGNORED_KEEP_DAYS = 30;

/** Remembers a message the parser ignored, and why. Never allowed to break ingest. */
async function logIgnored(deviceId: string | null, userId: string, orgId: string, source: CaptureSource, text: string, sender: string | null, reason?: string) {
    try {
        const d = diagnoseMessage(text, sender);
        const sensitive = d.kind === 'IGNORED' && d.sensitive;
        await supabase.from('momo_ignored_messages').insert({
            organization_id: orgId, user_id: userId, device_id: deviceId, source, reason: reason ?? (d.kind === 'IGNORED' ? d.reason : 'Not booked'),
            raw_text: sensitive ? '[hidden: looks like a one-time code]' : text.slice(0, 300),
        });
        await supabase.from('momo_ignored_messages').delete().eq('user_id', userId)
            .lt('created_at', new Date(Date.now() - IGNORED_KEEP_DAYS * 24 * 3600 * 1000).toISOString());
    } catch (e: any) { console.error('[MoMo capture] could not log ignored message:', e?.message); }
}

/** Every message the phone sent that wasn't booked, across all of the person's workspaces (each tagged with its own). */
export async function listIgnored(userId: string, orgId: string) {
    const { data, error } = await supabase.from('momo_ignored_messages').select('*')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
    if (error) throw new MomoCaptureError(error.message, 500);
    const rows = data ?? [];
    const names = new Map<string, string | null>();
    for (const id of new Set(rows.map((r: any) => r.organization_id as string))) names.set(id, await workspaceName(id));
    return rows.map((r: any) => ({ ...r, workspace: names.get(r.organization_id) ?? null, elsewhere: r.organization_id !== orgId }));
}

/** Dry run for the web tester: how a pasted message would be read, nothing saved. */
export function testParse(text: unknown) {
    const t = typeof text === 'string' ? text : '';
    if (!t.trim()) throw new MomoCaptureError('Paste a message to test');
    return diagnoseMessage(t, null);
}

/**
 * Makes sure the external account has its own ASSET account in the chart, so what is booked to it is posted there (and
 * shows in Reports) rather than falling into "Uncategorised Asset". Safe to call every time.
 */
async function ensureWalletAssetAccount(orgId: string, wallet: { id: string; name: string; provider_type?: string | null }) {
    const { data: ew } = await supabase.from('external_wallets').select('qb_account_id').eq('id', wallet.id).maybeSingle();
    if (ew?.qb_account_id && /^[0-9a-f-]{36}$/i.test(ew.qb_account_id)) {
        const { data: linked } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('type', 'ASSET').eq('id', ew.qb_account_id).maybeSingle();
        if (linked) return linked.id as string;
    }
    const { data: byName } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('type', 'ASSET').ilike('name', wallet.name).limit(1).maybeSingle();
    let id = byName?.id as string | undefined;
    if (!id) {
        const { data: made, error } = await supabase.from('accounts').insert({
            organization_id: orgId, code: `EXT-${wallet.id.slice(0, 8).toUpperCase()}`, name: wallet.name, type: 'ASSET',
            subtype: wallet.provider_type === 'BANK' ? 'Bank' : 'Other Asset', is_active: true, description: `Money in ${wallet.name}`,
        }).select('id').single();
        if (error || !made) throw new MomoCaptureError(`Could not create the ${wallet.name} account in the chart: ${error?.message}`, 500);
        id = made.id as string;
    }
    await supabase.from('external_wallets').update({ qb_account_id: id }).eq('id', wallet.id);
    return id;
}

async function walletFor(orgId: string, provider: MomoProvider, destination: string) {
    if (destination === 'CASH') return ensureCashWallet(orgId);
    const name = PROVIDER_WALLET[provider];
    const wallets = await listExternalWallets(orgId);
    // By name first; else the one mobile money account of this provider, whatever it was nicknamed (onboarding lets
    // people call their MTN line "Work line"). Two of the same provider and none named after it → the default name.
    const sameProvider = wallets.filter((w) => w.provider_type === 'MOBILE_MONEY' && (w.provider_name ?? '').toLowerCase() === name.toLowerCase());
    const existing = wallets.find((w) => w.name.toLowerCase() === name.toLowerCase()) ?? (sameProvider.length === 1 ? sameProvider[0] : undefined);
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
export async function post(userId: string, orgId: string, id: string, overrides: { direction?: unknown; amount?: unknown; accountId?: unknown; description?: unknown; walletId?: unknown; date?: unknown; fee?: unknown; feeAccountId?: unknown } = {}, mirror: { autoPosted?: boolean } = {}) {
    const { data: claimed } = await supabase.from('momo_captures').update({ status: 'POSTED', updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId).eq('organization_id', orgId).in('status', ['PENDING', 'MATCHED']).select('*').maybeSingle();
    if (!claimed) throw new MomoCaptureError('This message was already handled or no longer exists', 409);
    // The row comes back already flipped to POSTED, so what it was before has to be worked out: a failed booking
    // must put it back in the review list, not leave it looking recorded with nothing in the ledger.
    const previousStatus = claimed.matched_entry_id ? 'MATCHED' : 'PENDING';

    try {
        const settings = await settingsRow(userId, orgId);
        // The account it lands in: the one chosen in the review, else the one saved on the capture, else its provider's default.
        const chosenWalletId = typeof overrides.walletId === 'string' && overrides.walletId ? overrides.walletId : (claimed.external_wallet_id as string | null);
        const wallet = chosenWalletId
            ? ((await listExternalWallets(orgId)).find((w) => w.id === chosenWalletId) ?? (() => { throw new MomoCaptureError('That account no longer exists. Choose another.', 400); })())
            : await walletFor(orgId, claimed.provider, settings.destination);
        await ensureWalletAssetAccount(orgId, wallet);
        const direction = overrides.direction === 'IN' || overrides.direction === 'OUT' ? overrides.direction : claimed.direction;
        const amount = Number(overrides.amount) > 0 ? Number(overrides.amount) : Number(claimed.amount);
        const description = typeof overrides.description === 'string' && overrides.description.trim().length >= 2
            ? overrides.description.trim()
            : describe({ ...claimed, direction, counterparty: claimed.counterparty } as ParsedMomoMessage);
        const date = typeof overrides.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(overrides.date) ? overrides.date : lusakaDate(claimed.occurred_at);
        const fee = overrides.fee !== undefined ? (money(overrides.fee, 'Fee') ?? 0) : Number(claimed.fee) || 0;
        // No category chosen (the prompt's quick Record, or auto-record): the one last used with this contact, if any;
        // otherwise recordManualEntry suggests one as before.
        let accountId = typeof overrides.accountId === 'string' ? overrides.accountId : null;
        if (!accountId) {
            const key = contactKey(direction, claimed.counterparty);
            if (key) accountId = (await categorySuggestions(userId, orgId).catch(() => null))?.byContact.get(key) ?? null;
        }

        const entry = await recordManualEntry({ orgId, userId, direction, amount, description, date, externalWalletId: wallet.id, accountId, context: claimed.note ?? null, anyAccount: true });
        // From here the movement is in the ledger, so nothing below may send the capture back to PENDING (the catch
        // would, and a second tap would then book it twice).
        const { data: done } = await supabase.from('momo_captures')
            .update({ cashbook_entry_id: entry.entryId, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
        // The operator's charge leaves the same wallet, so it's booked beside the movement it belongs to.
        if (fee > 0) {
            try {
                await recordManualEntry({ orgId, userId, direction: 'OUT', amount: fee, description: `${description} · fee`, date, externalWalletId: wallet.id, accountId: typeof overrides.feeAccountId === 'string' && overrides.feeAccountId ? overrides.feeAccountId : null, anyAccount: true });
            } catch (e: any) {
                console.error(`[MoMo capture] fee of ${fee} for capture ${id} was not booked:`, e.message);
            }
        }
        // The balance the newest recorded message states wins. Never allowed to undo the booking above.
        if (!chosenWalletId || wallet.name.toLowerCase() === PROVIDER_WALLET[claimed.provider as MomoProvider].toLowerCase()) await syncToLatestBalance(orgId, userId, claimed.provider, settings.destination)
            .catch((e: any) => console.error(`[MoMo capture] balance sync after ${id} failed:`, e?.message));
        await mirrorMomoCapture(done, mirror);
        return { ...done, entry };
    } catch (e: any) {
        await supabase.from('momo_captures').update({ status: previousStatus, updated_at: new Date().toISOString() }).eq('id', id);
        if (e instanceof ManualEntryError) throw new MomoCaptureError(e.message, e.httpStatus);
        throw e;
    }
}

export async function dismiss(userId: string, orgId: string, id: string) {
    const { data } = await supabase.from('momo_captures').update({ status: 'DISMISSED', updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId).eq('organization_id', orgId).in('status', ['PENDING', 'MATCHED']).select('*').maybeSingle();
    if (!data) throw new MomoCaptureError('This message was already handled or no longer exists', 409);
    await mirrorMomoCapture(data);
    return data;
}


// ── The latest message's balance wins (only once recorded) ─────────────────

export interface RecordedCapture { direction: string; amount: number | string; fee: number | string | null; balance_after: number | string | null; occurred_at: string }

/**
 * What a provider account should hold, from the person's RECORDED captures (newest first): the balance stated by the
 * most recent message that states one — the operator's own figure, so it beats anything worked out from our records —
 * plus whatever recorded transactions happened after it (an MTN deposit message, say, states no balance). Ordered by
 * the time in the message, not by when it was recorded, so recording an older message later never rolls the
 * balance back. Null when no recorded message states a balance: then the booked total stands as it is. Pure.
 */
export function latestBalanceTarget(rows: RecordedCapture[]): { balance: number; asOf: string } | null {
    const sorted = [...rows].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    const anchor = sorted.findIndex((r) => r.balance_after !== null && r.balance_after !== undefined && Number.isFinite(Number(r.balance_after)));
    if (anchor === -1) return null;
    let balance = Number(sorted[anchor].balance_after);
    for (const r of sorted.slice(0, anchor)) {
        balance += (r.direction === 'IN' ? 1 : -1) * Number(r.amount) - (Number(r.fee) > 0 ? Number(r.fee) : 0);
    }
    return { balance: Math.round(balance * 100) / 100, asOf: sorted[anchor].occurred_at };
}

/**
 * After a capture is recorded: brings the provider account to latestBalanceTarget with one ADJUSTMENT entry (not
 * income or spending, so Grow and the reports never count it). Runs only from recording — a message that is merely
 * captured, waiting or dismissed never moves a balance. Not for captures booked to Cash.
 */
async function syncToLatestBalance(orgId: string, userId: string, provider: MomoProvider, destination: string) {
    if (destination === 'CASH' || provider === 'OTHER') return null;
    const { data, error } = await supabase.from('momo_captures')
        .select('direction, amount, fee, balance_after, occurred_at')
        .eq('organization_id', orgId).eq('provider', provider).eq('status', 'POSTED').not('cashbook_entry_id', 'is', null)
        .order('occurred_at', { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    const target = latestBalanceTarget((data ?? []) as RecordedCapture[]);
    if (!target) return null;
    const wallet = await walletFor(orgId, provider, 'PROVIDER');
    const current = round2(Number(await cashbookService.getCurrentBalance(orgId, wallet.id)));
    const diff = round2(target.balance - current);
    if (Math.abs(diff) < EPS) return null;
    const when = new Date(target.asOf).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lusaka' });
    await cashbookService.createEntry(orgId, {
        entry_type: 'ADJUSTMENT',
        description: `${PROVIDER_WALLET[provider]} · Balance set to K${target.balance.toFixed(2)} from the ${when} message`,
        debit: diff > 0 ? diff : 0,
        credit: diff < 0 ? -diff : 0,
        date: lusakaDate(new Date().toISOString()),
        created_by: userId,
        account_type: wallet.id,
    } as any);
    return { balance: target.balance, adjustedBy: diff };
}

// ── Balance checks ──────────────────────────────────────────────────────────

const EPS = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The provider's account in MoneyWise, if it exists yet (never created just to compare). */
async function existingProviderWallet(orgId: string, provider: MomoProvider) {
    const name = PROVIDER_WALLET[provider].toLowerCase();
    return (await listExternalWallets(orgId)).find((w) => w.name.toLowerCase() === name) ?? null;
}

/**
 * What MoneyWise holds for this provider right now: the account's running balance, plus captured messages still waiting
 * for review (they are real movements the phone already counted, just not booked yet). MATCHED ones are excluded: those
 * are on the Lenco wallet, not on this account.
 */
async function ledgerPosition(userId: string, orgId: string, provider: MomoProvider, upTo: string) {
    const wallet = await existingProviderWallet(orgId, provider);
    const ledger = wallet ? await cashbookService.getCurrentBalance(orgId, wallet.id) : 0;
    const { data } = await supabase.from('momo_captures').select('direction, amount, fee')
        .eq('user_id', userId).eq('organization_id', orgId).eq('provider', provider).eq('status', 'PENDING').lte('occurred_at', upTo);
    const pendingNet = (data ?? []).reduce((sum, c: any) =>
        sum + (c.direction === 'IN' ? Number(c.amount) : -(Number(c.amount) + Number(c.fee ?? 0))), 0);
    return { ledger: round2(ledger), pendingNet: round2(pendingNet) };
}

async function evaluateCheck(check: any) {
    const { ledger, pendingNet } = await ledgerPosition(check.user_id, check.organization_id, check.provider, check.observed_at);
    const difference = round2(Number(check.balance) - (ledger + pendingNet));
    const status = Math.abs(difference) < EPS ? 'IN_SYNC' : 'OPEN';
    const { data } = await supabase.from('momo_balance_checks')
        .update({ ledger_balance: ledger, pending_net: pendingNet, difference, status, updated_at: new Date().toISOString() })
        .eq('id', check.id).in('status', ['OPEN', 'IN_SYNC']).select('*').maybeSingle();
    return data ?? { ...check, ledger_balance: ledger, pending_net: pendingNet, difference, status };
}

async function recordBalanceCheck(deviceId: string | null, userId: string, orgId: string, source: CaptureSource, text: string, provider: MomoProvider, balance: number, observedAt: string) {
    const settings = await settingsRow(userId, orgId);
    const { data: row, error } = await supabase.from('momo_balance_checks').insert({
        organization_id: orgId, user_id: userId, device_id: deviceId, source, provider, raw_text: text.slice(0, 600), balance, observed_at: observedAt,
        dedupe_key: balanceDedupeKey(provider, balance, observedAt),
        // Captures booked to Cash don't track the provider's own balance, so there is nothing to compare with.
        status: settings.destination === 'CASH' ? 'NO_ACCOUNT' : 'OPEN',
    }).select('*').single();
    if (error) {
        if (error.code === '23505') return { duplicate: true as const };
        throw new MomoCaptureError(`Could not save the balance: ${error.message}`, 500);
    }
    if (row.status === 'NO_ACCOUNT') return row;
    // The newest check is the only one worth acting on.
    await supabase.from('momo_balance_checks').update({ status: 'SUPERSEDED', updated_at: new Date().toISOString() })
        .eq('user_id', userId).eq('organization_id', orgId).eq('provider', provider).eq('status', 'OPEN').lt('observed_at', observedAt).neq('id', row.id);
    return evaluateCheck(row);
}

/** Open balance differences, re-compared with the ledger as it is now (a capture booked since may have closed the gap). */
export async function listAllBalanceChecks(userId: string, orgId: string) {
    const { data, error } = await supabase.from('momo_balance_checks').select('*')
        .eq('user_id', userId).eq('organization_id', orgId).order('observed_at', { ascending: false }).limit(100);
    if (error) throw new MomoCaptureError(error.message, 500);
    return data ?? [];
}

export async function listBalanceChecks(userId: string, orgId: string) {
    const { data, error } = await supabase.from('momo_balance_checks').select('*')
        .eq('user_id', userId).eq('organization_id', orgId).eq('status', 'OPEN').order('observed_at', { ascending: false }).limit(10);
    if (error) throw new MomoCaptureError(error.message, 500);
    const fresh = await Promise.all((data ?? []).map(evaluateCheck));
    return fresh.filter((c: any) => c.status === 'OPEN');
}

/** One tap: books the difference so the provider account matches the phone's balance. */
export async function adjustToBalance(userId: string, orgId: string, id: string) {
    const { data: found } = await supabase.from('momo_balance_checks').select('*')
        .eq('id', id).eq('user_id', userId).eq('organization_id', orgId).eq('status', 'OPEN').maybeSingle();
    if (!found) throw new MomoCaptureError('This balance check was already handled or no longer exists', 409);
    const check = await evaluateCheck(found);
    if (check.status !== 'OPEN') return check;

    const { data: claimed } = await supabase.from('momo_balance_checks').update({ status: 'ADJUSTED', updated_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'OPEN').select('*').maybeSingle();
    if (!claimed) throw new MomoCaptureError('This balance check was already handled', 409);
    try {
        const wallet = await walletFor(orgId, check.provider, 'PROVIDER');
        const diff = Number(check.difference);
        const label = PROVIDER_WALLET[check.provider as MomoProvider];
        const entry = await recordManualEntry({
            orgId, userId, direction: diff > 0 ? 'IN' : 'OUT', amount: Math.abs(diff),
            description: `${label} · Balance adjustment to match the provider balance of K${Number(check.balance).toFixed(2)}`,
            date: lusakaDate(check.observed_at), externalWalletId: wallet.id, autoCategorize: false,
        });
        const { data: done } = await supabase.from('momo_balance_checks')
            .update({ adjustment_entry_id: entry.entryId, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
        return { ...done, entry };
    } catch (e: any) {
        await supabase.from('momo_balance_checks').update({ status: 'OPEN', updated_at: new Date().toISOString() }).eq('id', id);
        if (e instanceof ManualEntryError) throw new MomoCaptureError(e.message, e.httpStatus);
        throw e;
    }
}

export async function dismissBalanceCheck(userId: string, orgId: string, id: string) {
    const { data } = await supabase.from('momo_balance_checks').update({ status: 'DISMISSED', updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId).eq('organization_id', orgId).eq('status', 'OPEN').select('*').maybeSingle();
    if (!data) throw new MomoCaptureError('This balance check was already handled or no longer exists', 409);
    return data;
}


/**
 * Everything the person's phones have sent, newest first, in one list: captures, balance readings and the messages
 * that were not booked (with why). Across all workspaces; `workspace` / `elsewhere` say where each went and `device`
 * which phone sent it.
 */
export async function listEverything(userId: string, orgId: string, limit = 200) {
    const cap = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const [caps, bals, igns, devices] = await Promise.all([
        supabase.from('momo_captures').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(cap),
        supabase.from('momo_balance_checks').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(cap),
        supabase.from('momo_ignored_messages').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(cap),
        supabase.from('momo_capture_devices').select('id, label, platform').eq('user_id', userId),
    ]);
    for (const r of [caps, bals, igns]) if (r.error) throw new MomoCaptureError(r.error.message, 500);
    const deviceName = new Map<string, string>((devices.data ?? []).map((d: any) => [d.id, d.label || (d.platform === 'android' ? 'Android' : d.platform === 'ios' ? 'iPhone' : 'Phone')]));
    const names = new Map<string, string | null>();
    const orgs = new Set<string>([...(caps.data ?? []), ...(bals.data ?? []), ...(igns.data ?? [])].map((r: any) => r.organization_id));
    for (const id of orgs) names.set(id, await workspaceName(id));
    const common = (r: any) => ({
        id: r.id as string, source: r.source as string, at: (r.occurred_at ?? r.observed_at ?? r.created_at) as string, receivedAt: r.created_at as string,
        device: r.device_id ? (deviceName.get(r.device_id) ?? 'A phone') : null,
        workspace: names.get(r.organization_id) ?? null, elsewhere: r.organization_id !== orgId,
    });
    const out = [
        ...(caps.data ?? []).map((r: any) => ({ ...common(r), kind: 'TRANSACTION' as const, text: r.raw_text as string, status: r.status as string, direction: r.direction as string | null, amount: Number(r.amount) as number | null, provider: r.provider as string | null, note: null as string | null, comment: (r.note as string | null) ?? null, guess: null as ReturnType<typeof looseGuess> | null, movable: false })),
        ...(bals.data ?? []).map((r: any) => ({ ...common(r), kind: 'BALANCE' as const, text: r.raw_text as string, status: r.status as string, direction: null as string | null, amount: Number(r.balance) as number | null, provider: r.provider as string | null, note: null as string | null, comment: null as string | null, guess: null as ReturnType<typeof looseGuess> | null, movable: false })),
        ...(igns.data ?? []).map((r: any) => ({ ...common(r), kind: 'NOT_BOOKED' as const, text: r.raw_text as string, status: 'IGNORED', direction: null as string | null, amount: null as number | null, provider: null as string | null, note: r.reason as string | null, comment: null as string | null,
            // A message can be moved into Captured by hand unless it is another workspace's, or a hidden one-time code.
            movable: r.organization_id === orgId && !String(r.raw_text).startsWith('[hidden'), guess: looseGuess(String(r.raw_text), null) })),
    ];
    return out.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1)).slice(0, cap);
}


// ── Editing a capture, and moving a not-booked message into Captured ──────────────────────────────

const PROVIDERS: MomoProvider[] = ['MTN', 'AIRTEL', 'ZAMTEL', 'OTHER'];
const money = (v: unknown, what: string, opts: { required?: boolean } = {}): number | null => {
    if (v === null || v === undefined || v === '') { if (opts.required) throw new MomoCaptureError(`${what} is required`); return null; }
    const n = Number(String(v).replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0 || (opts.required && n <= 0)) throw new MomoCaptureError(`${what} must be a valid amount`);
    return Math.round(n * 100) / 100;
};
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null);

interface CaptureFields { accountId?: unknown; provider?: unknown; direction?: unknown; amount?: unknown; fee?: unknown; balanceAfter?: unknown; counterparty?: unknown; reference?: unknown; sender?: unknown; note?: unknown }

/** Reads whichever of the editable fields were sent; anything left out is left alone. */
function readFields(f: CaptureFields) {
    const out: Record<string, any> = {};
    if (f.provider !== undefined) {
        if (!PROVIDERS.includes(f.provider as MomoProvider)) throw new MomoCaptureError('Choose MTN, Airtel, Zamtel or Other as the provider');
        out.provider = f.provider;
    }
    if (f.direction !== undefined) {
        if (f.direction !== 'IN' && f.direction !== 'OUT') throw new MomoCaptureError('Direction must be money in or money out');
        out.direction = f.direction;
    }
    if (f.accountId !== undefined) out.accountId = typeof f.accountId === 'string' && f.accountId ? f.accountId : null;
    if (f.amount !== undefined) out.amount = money(f.amount, 'Amount', { required: true });
    if (f.fee !== undefined) out.fee = money(f.fee, 'Fee');
    if (f.balanceAfter !== undefined) out.balance_after = money(f.balanceAfter, 'Balance after');
    if (f.counterparty !== undefined) out.counterparty = text(f.counterparty, 80);
    if (f.reference !== undefined) out.provider_reference = text(f.reference, 60);
    if (f.sender !== undefined) out.sender = text(f.sender, 60);
    if (f.note !== undefined) out.note = text(f.note, 500);
    return out;
}


/** The provider a given external account stands for (its default name), or OTHER for banks and custom accounts. */
function providerOfWallet(w: { name: string }): MomoProvider {
    return (Object.entries(PROVIDER_WALLET) as [MomoProvider, string][]).find(([k, n]) => k !== 'OTHER' && n.toLowerCase() === w.name.toLowerCase())?.[0] ?? 'OTHER';
}

/** Validates a chosen account and fills `external_wallet_id` and the provider that goes with it. */
async function applyAccountChoice(orgId: string, update: Record<string, any>) {
    if (!('accountId' in update)) return;
    const id = update.accountId as string | null;
    delete update.accountId;
    if (!id) { update.external_wallet_id = null; return; }
    const w = (await listExternalWallets(orgId)).find((x) => x.id === id);
    if (!w) throw new MomoCaptureError('Choose one of your accounts', 400);
    update.external_wallet_id = w.id;
    update.provider = providerOfWallet(w);
}

/** Corrects a capture that is still waiting (or matched), before it is booked. */
export async function editCapture(userId: string, orgId: string, id: string, patch: CaptureFields) {
    const { data: row } = await supabase.from('momo_captures').select('*').eq('id', id).eq('user_id', userId).eq('organization_id', orgId).maybeSingle();
    if (!row) throw new MomoCaptureError('This message no longer exists', 404);
    if (row.status !== 'PENDING' && row.status !== 'MATCHED') throw new MomoCaptureError('This message is already booked or dismissed, so it can no longer be edited', 409);
    const update = readFields(patch);
    await applyAccountChoice(orgId, update);
    // The same transaction id (and provider) is what stops one message being captured twice, so it follows the edit.
    const provider = update.provider ?? row.provider;
    const reference = 'provider_reference' in update ? update.provider_reference : row.provider_reference;
    if (reference && ('provider_reference' in update || 'provider' in update)) {
        const suffix = /:(IN|OUT)$/.exec(row.dedupe_key)?.[0] ?? '';
        update.dedupe_key = `${provider}:REF:${String(reference).toUpperCase()}${suffix}`;
    }
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('momo_captures').update(update).eq('id', id).eq('user_id', userId).in('status', ['PENDING', 'MATCHED']).select('*').maybeSingle();
    if (error) {
        if (error.code === '23505') throw new MomoCaptureError('Another captured message already has that transaction reference', 409);
        throw new MomoCaptureError(`Could not save: ${error.message}`, 500);
    }
    if (!data) throw new MomoCaptureError('This message was already handled', 409);
    try { await mirrorMomoCapture(data); } catch (e: any) { console.error('[MoMo capture] mirror after edit failed:', e?.message); }
    return data;
}

/**
 * Turns a message that was not booked into a captured transaction, using the details the person confirmed. The
 * message text is the one that was kept; the not-booked entry is removed so it is not listed twice.
 */
export async function moveIgnoredToCaptured(userId: string, orgId: string, id: string, fields: CaptureFields) {
    const { data: ign } = await supabase.from('momo_ignored_messages').select('*').eq('id', id).eq('user_id', userId).eq('organization_id', orgId).maybeSingle();
    if (!ign) throw new MomoCaptureError('This message no longer exists', 404);
    if (String(ign.raw_text).startsWith('[hidden')) throw new MomoCaptureError('This looked like a one-time code, so its text was not kept and it cannot be captured', 400);
    const f = readFields(fields);
    await applyAccountChoice(orgId, f);
    if (f.amount == null) throw new MomoCaptureError('Amount is required');
    if (!f.direction) throw new MomoCaptureError('Choose whether money came in or went out');
    const settings = await settingsRow(userId, orgId);
    const provider: MomoProvider = f.provider ?? ((settings.default_provider as MomoProvider | null) ?? 'OTHER');
    const reference = f.provider_reference ?? null;
    const dedupe_key = reference ? `${provider}:REF:${String(reference).toUpperCase()}`
        : dedupeKey({ provider, direction: f.direction, amount: f.amount, fee: null, balanceAfter: null, counterparty: null, reference: null } as ParsedMomoMessage, ign.raw_text);
    const { data: row, error } = await supabase.from('momo_captures').insert({
        organization_id: orgId, user_id: userId, device_id: ign.device_id ?? null, source: ign.source, provider, sender: f.sender ?? null,
        raw_text: String(ign.raw_text).slice(0, 1200), direction: f.direction, amount: f.amount, fee: f.fee ?? null,
        balance_after: f.balance_after ?? null, counterparty: f.counterparty ?? null, provider_reference: reference, external_wallet_id: f.external_wallet_id ?? null,
        occurred_at: ign.created_at, dedupe_key, status: 'PENDING', note: f.note ?? null,
    }).select('*').single();
    if (error) {
        if (error.code === '23505') throw new MomoCaptureError('A captured message with that transaction reference already exists', 409);
        throw new MomoCaptureError(`Could not capture it: ${error.message}`, 500);
    }
    await supabase.from('momo_ignored_messages').delete().eq('id', id);
    try { await mirrorMomoCapture(row); } catch (e: any) { console.error('[MoMo capture] mirror after move failed:', e?.message); }
    return row;
}


// ── Accounting review: what booking will post, and the choices that change it ─────────────────────

/** The accounts a capture can be booked to / categorised under, for the review dialog and the account dropdown. */
export async function accountingOptions(_userId: string, orgId: string) {
    const [wallets, { data: accts }] = await Promise.all([
        listExternalWallets(orgId),
        supabase.from('accounts').select('id, code, name, type').eq('organization_id', orgId).eq('is_active', true).order('name'),
    ]);
    const pick = (t: string) => (accts ?? []).filter((a: any) => a.type === t).map((a: any) => ({ id: a.id as string, code: (a.code as string | null) ?? null, name: a.name as string, emoji: null as string | null }));
    return {
        wallets: wallets.map((w) => ({ id: w.id, name: w.name, providerType: w.provider_type, provider: providerOfWallet(w) })),
        income: pick('INCOME'), expense: pick('EXPENSE'),
        // The whole chart, for the debit / credit pickers in the review.
        accounts: (accts ?? []).map((a: any) => ({ id: a.id as string, code: (a.code as string | null) ?? null, name: a.name as string, type: a.type as string })),
    };
}

interface PreviewInput { direction?: unknown; amount?: unknown; fee?: unknown; accountId?: unknown; feeAccountId?: unknown; walletId?: unknown; description?: unknown; date?: unknown }

/**
 * The double entry booking this capture would post, without posting it: the money account on one side, the category
 * on the other (the person's choice, else the AI's suggestion with its reasoning, else Suspense), and the operator's
 * fee as its own pair. Mirrors post(): every figure and account here is what post() will use when given the same input.
 */
export async function previewPosting(userId: string, orgId: string, id: string, input: PreviewInput = {}) {
    const { data: c } = await supabase.from('momo_captures').select('*').eq('id', id).eq('user_id', userId).eq('organization_id', orgId).maybeSingle();
    if (!c) throw new MomoCaptureError('This message no longer exists', 404);
    const direction = input.direction === 'IN' || input.direction === 'OUT' ? input.direction : (c.direction as 'IN' | 'OUT');
    const amount = money(input.amount ?? c.amount, 'Amount', { required: true })!;
    const fee = input.fee !== undefined ? (money(input.fee, 'Fee') ?? 0) : Number(c.fee) || 0;
    const settings = await settingsRow(userId, orgId);
    const wallets = await listExternalWallets(orgId);
    const wanted = typeof input.walletId === 'string' && input.walletId ? input.walletId : (c.external_wallet_id as string | null);
    let wallet = wanted ? wallets.find((w) => w.id === wanted) ?? null : null;
    let walletWillBeCreated = false;
    if (!wallet) {
        if (settings.destination === 'CASH') wallet = wallets.find((w) => w.name.toLowerCase() === 'cash') ?? null;
        else {
            const name = PROVIDER_WALLET[c.provider as MomoProvider];
            wallet = wallets.find((w) => w.name.toLowerCase() === name.toLowerCase()) ?? null;
            if (!wallet) walletWillBeCreated = true;
        }
    }
    const walletName = wallet?.name ?? (settings.destination === 'CASH' ? 'Cash' : PROVIDER_WALLET[c.provider as MomoProvider]);

    // The asset account the money account maps to in the ledger.
    let assetAcct: { id: string; code: string | null; name: string } | null = null;
    if (wallet) {
        const { data: ew } = await supabase.from('external_wallets').select('qb_account_id').eq('id', wallet.id).maybeSingle();
        const linkId = ew?.qb_account_id && /^[0-9a-f-]{36}$/i.test(ew.qb_account_id) ? ew.qb_account_id : null;
        const q = supabase.from('accounts').select('id, code, name').eq('organization_id', orgId).eq('type', 'ASSET');
        const { data: byLink } = linkId ? await q.eq('id', linkId).maybeSingle() : { data: null };
        assetAcct = (byLink as any) ?? ((await supabase.from('accounts').select('id, code, name').eq('organization_id', orgId).eq('type', 'ASSET').ilike('name', wallet.name).limit(1).maybeSingle()).data as any) ?? null;
    }
    const assetLabel = assetAcct ? { accountId: assetAcct.id, code: assetAcct.code, name: assetAcct.name, type: 'ASSET' as const, willBeCreated: false }
        : { accountId: null as string | null, code: null as string | null, name: walletName, type: 'ASSET' as const, willBeCreated: true };

    const note = typeof c.note === 'string' ? c.note : '';
    const baseDescription = typeof input.description === 'string' && input.description.trim().length >= 2 ? input.description.trim() : describe({ ...c, direction } as ParsedMomoMessage);
    const description = note ? `${baseDescription} · ${note}`.slice(0, 300) : baseDescription;

    const categories = await categoriesFor(orgId, direction);
    const chart = (await supabase.from('accounts').select('id, code, name, type').eq('organization_id', orgId).eq('is_active', true)).data ?? [];
    const lookup = async (accountId: unknown, dir: 'IN' | 'OUT', desc: string, amt: number, list: any[]) => {
        if (typeof accountId === 'string' && accountId) {
            // Any account in the chart may be chosen (a manual double entry), not only an income / expense category.
            const a = chart.find((x: any) => x.id === accountId);
            if (!a) throw new MomoCaptureError('That account does not exist or is switched off', 400);
            if (assetAcct && a.id === assetAcct.id) throw new MomoCaptureError('The debit and credit can\'t be the same account', 400);
            return { account: a, source: 'USER' as const, reasoning: null as string | null, confidence: null as number | null };
        }
        const sug = await suggestCategory(orgId, dir, desc, amt);
        return sug ? { account: sug.account, source: 'AI' as const, reasoning: sug.reasoning, confidence: sug.confidence } : { account: null, source: null, reasoning: null, confidence: null };
    };
    const main = await lookup(input.accountId, direction, description, amount, categories);
    const catLine = main.account
        ? { accountId: main.account.id as string, code: (main.account.code as string | null) ?? null, name: main.account.name as string, type: String(main.account.type ?? (direction === 'IN' ? 'INCOME' : 'EXPENSE')), suspense: false }
        : { accountId: null as string | null, code: null as string | null, name: 'Suspense (not categorised yet)', type: 'SUSPENSE' as const, suspense: true };

    const lines: { role: string; accountId: string | null; code: string | null; name: string; type: string; debit: number; credit: number; note: string | null }[] = [];
    const asset = (debit: number, credit: number, role: string, note: string | null) => lines.push({ role, accountId: assetLabel.accountId, code: assetLabel.code, name: assetLabel.name, type: 'ASSET', debit, credit, note: assetLabel.willBeCreated ? 'This account will be created when you post' : note });
    const cat = (debit: number, credit: number, role: string) => lines.push({ role, accountId: catLine.accountId, code: catLine.code, name: catLine.name, type: catLine.type, debit, credit, note: catLine.suspense ? 'No category chosen, so it sits in Suspense until one is set' : null });
    if (direction === 'IN') { asset(amount, 0, 'MONEY', 'Money received'); cat(0, amount, 'CATEGORY'); }
    else { cat(amount, 0, 'CATEGORY'); asset(0, amount, 'MONEY', 'Money paid out'); }

    let feeInfo: { source: 'USER' | 'AI' | null; reasoning: string | null; confidence: number | null; accountId: string | null } | null = null;
    if (fee > 0) {
        const expense = await categoriesFor(orgId, 'OUT');
        const f = await lookup(input.feeAccountId, 'OUT', `${description} · fee`, fee, expense);
        feeInfo = { source: f.source, reasoning: f.reasoning, confidence: f.confidence, accountId: f.account?.id ?? null };
        lines.push({ role: 'FEE_CATEGORY', accountId: f.account?.id ?? null, code: f.account?.code ?? null, name: f.account?.name ?? 'Suspense (not categorised yet)', type: f.account ? String(f.account.type ?? 'EXPENSE') : 'SUSPENSE', debit: fee, credit: 0, note: 'Operator fee' });
        asset(0, fee, 'FEE_MONEY', 'Operator fee paid from the same account');
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const totalDebit = r2(lines.reduce((t, l) => t + l.debit, 0)), totalCredit = r2(lines.reduce((t, l) => t + l.credit, 0));
    return {
        direction, amount, fee, description: baseDescription, note: note || null,
        date: typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : lusakaDate(c.occurred_at),
        wallet: { id: wallet?.id ?? null, name: walletName, willBeCreated: walletWillBeCreated },
        category: { accountId: main.account?.id ?? null, source: main.source, reasoning: main.reasoning, confidence: main.confidence },
        fee_category: feeInfo,
        lines, totals: { debit: totalDebit, credit: totalCredit, balanced: totalDebit === totalCredit },
    };
}


const BANK_WORDS = /\b(bank|fnb|zanaco|absa|stanbic|indo\s?zambia|izb|atlas\s?mara|ecobank|uba|natsave|investrust|access|first\s?capital|cavmont|bancabc|standard\s?chartered|citi)\b/i;

/** Adds an external account (a bank like FNB, a mobile money line, cash …) so captures can be booked into it. */
export async function createAccount(_userId: string, orgId: string, nameIn: unknown, typeIn?: unknown) {
    const name = typeof nameIn === 'string' ? nameIn.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    if (name.length < 2) throw new MomoCaptureError('Give the account a name, for example FNB');
    const providerType = ['BANK', 'MOBILE_MONEY', 'CUSTOM'].includes(typeIn as string) ? (typeIn as string) : BANK_WORDS.test(name) ? 'BANK' : /\b(cash|petty)\b/i.test(name) ? 'CUSTOM' : 'MOBILE_MONEY';
    const existing = (await listExternalWallets(orgId)).find((w) => w.name.toLowerCase() === name.toLowerCase());
    if (existing) return { id: existing.id, name: existing.name, providerType: existing.provider_type, provider: providerOfWallet(existing), existed: true };
    const { data, error } = await supabase.from('external_wallets').insert({ organization_id: orgId, name, provider_type: providerType, provider_name: null }).select('id, name, provider_type, provider_name').single();
    if (error || !data) throw new MomoCaptureError(`Could not add the account: ${error?.message}`, 500);
    await ensureWalletAssetAccount(orgId, { id: data.id as string, name: data.name as string, provider_type: data.provider_type as string });
    return { id: data.id as string, name: data.name as string, providerType: data.provider_type as string, provider: providerOfWallet(data as any), existed: false };
}
