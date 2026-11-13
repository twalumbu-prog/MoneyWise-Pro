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
import { cashbookService } from '../cashbook.service';
import { parseMomoMessage, dedupeKey, describe, type MomoProvider, type ParsedMomoMessage } from './parser';
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
    const { data, error } = await supabase.from('momo_capture_settings').select('user_id, organization_id').eq('token_hash', hashToken(token)).maybeSingle();
    // A failed lookup is not a rejected key: answering 401 makes the phone throw its key away and stop capturing.
    if (error) throw new MomoCaptureError('Capture is temporarily unavailable', 503);
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
    // Postgres rejects a NUL character, which would fail the same message on every retry.
    const text = typeof input.text === 'string' ? input.text.replace(/\u0000/g, '').trim() : '';
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
        if (near?.length) return { accepted: true as const, duplicate: true };
        key = `${key}:${Math.floor(t / 60000)}`;
    }
    const insert = (dedupe_key: string) => supabase.from('momo_captures').insert({
        organization_id: input.orgId, user_id: input.userId, source, provider: parsed.provider, sender,
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
        if (error?.code === '23505') return { accepted: true as const, duplicate: true };
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
    await syncWalletToReportedBalance(input.userId, input.orgId, parsed.provider);
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

async function reportedBalances(orgId: string, userId?: string) {
    let q = supabase.from('momo_captures')
        .select('provider, sender, raw_text, balance_after, occurred_at')
        .eq('organization_id', orgId)
        .order('occurred_at', { ascending: false }).limit(400);
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) throw new MomoCaptureError(error.message, 500);
    const out: { provider: MomoProvider; name: string; balance: number; asOf: string }[] = [];
    for (const row of data ?? []) {
        if (out.some((b) => b.provider === row.provider)) continue;
        const balance = row.balance_after ?? parseMomoMessage(row.raw_text, row.sender)?.balanceAfter ?? null;
        if (balance === null) continue;
        out.push({ provider: row.provider, name: PROVIDER_WALLET[row.provider as MomoProvider], balance: Number(balance), asOf: row.occurred_at });
    }
    return out;
}

export async function balances(userId: string, orgId: string) {
    return reportedBalances(orgId, userId);
}

const balanceRef = (walletId: string) => `MOMO-BALANCE-${walletId}`;

/**
 * Keeps a provider's external account equal to the balance the operator last stated in a message.
 *
 * The ledger only knows the transactions that were recorded; the operator's figure also covers everything that was
 * never captured, was dismissed, or is still waiting for review. The gap is held in ONE balancing entry per account
 * (reference MOMO-BALANCE-<account id>), replaced whenever the gap changes, so the account never fills up with
 * corrections: recording a waiting transaction just moves its amount out of that entry.
 *
 * Only for the "separate account per provider" setting. Never throws: a failed sync must not undo a capture or a
 * booking, and the next message or booking tries again.
 */
async function syncWalletToReportedBalance(userId: string, orgId: string, provider: MomoProvider): Promise<void> {
    try {
        const settings = await settingsRow(userId, orgId);
        if (settings.destination !== 'PROVIDER') return;
        const reported = (await reportedBalances(orgId)).find((b) => b.provider === provider);
        if (!reported) return;
        const wallet = await walletFor(orgId, provider, 'PROVIDER');
        const ledger = await cashbookService.getCurrentBalance(orgId, wallet.id);
        const diff = Math.round((reported.balance - ledger) * 100) / 100;
        if (Math.abs(diff) < 0.01) return;

        const { data: old } = await supabase.from('cashbook_entries').select('id, date, created_at, debit, credit')
            .eq('organization_id', orgId).eq('account_type', wallet.id).eq('external_reference', balanceRef(wallet.id));
        const previous = (old ?? []).reduce((sum: number, e: any) => sum + Number(e.debit || 0) - Number(e.credit || 0), 0);
        const net = Math.round((previous + diff) * 100) / 100;
        const date = (old ?? []).map((e: any) => String(e.date).slice(0, 10)).sort()[0] ?? lusakaDate(new Date().toISOString());

        if (old?.length) {
            const { error } = await supabase.from('cashbook_entries').delete().in('id', old.map((e: any) => e.id));
            if (error) throw new Error(`could not replace the balancing entry: ${error.message}`);
            const first = [...old].sort((x: any, y: any) => `${x.date}${x.created_at}`.localeCompare(`${y.date}${y.created_at}`))[0];
            await cashbookService.recalculateBalancesFrom(orgId, String(first.date).slice(0, 10), first.created_at, wallet.id);
        }
        if (Math.abs(net) >= 0.01) {
            await cashbookService.createEntry(orgId, {
                entry_type: 'ADJUSTMENT',
                description: `${wallet.name} balance brought forward (transactions not recorded in MoneyWise)`,
                debit: net > 0 ? net : 0,
                credit: net < 0 ? -net : 0,
                date,
                created_by: userId,
                account_type: wallet.id,
                status: 'COMPLETED',
                external_reference: balanceRef(wallet.id),
            } as any);
        }
    } catch (e: any) {
        console.error(`[MoMo capture] could not sync the ${provider} account to its reported balance:`, e?.message);
    }
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
export async function post(userId: string, orgId: string, id: string, overrides: { direction?: unknown; amount?: unknown; accountId?: unknown; description?: unknown } = {}, mirror: { autoPosted?: boolean } = {}) {
    const { data: claimed } = await supabase.from('momo_captures').update({ status: 'POSTED', updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId).eq('organization_id', orgId).in('status', ['PENDING', 'MATCHED']).select('*').maybeSingle();
    if (!claimed) throw new MomoCaptureError('This message was already handled or no longer exists', 409);
    // The row comes back already flipped to POSTED, so what it was before has to be worked out: a failed booking
    // must put it back in the review list, not leave it looking recorded with nothing in the ledger.
    const previousStatus = claimed.matched_entry_id ? 'MATCHED' : 'PENDING';

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
        // From here the movement is in the ledger, so nothing below may send the capture back to PENDING (the catch
        // would, and a second tap would then book it twice).
        const { data: done } = await supabase.from('momo_captures')
            .update({ cashbook_entry_id: entry.entryId, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
        // The operator's charge leaves the same wallet, so it's booked beside the movement it belongs to.
        if (claimed.fee && Number(claimed.fee) > 0) {
            try {
                await recordManualEntry({ orgId, userId, direction: 'OUT', amount: Number(claimed.fee), description: `${description} · fee`, date, externalWalletId: wallet.id });
            } catch (e: any) {
                console.error(`[MoMo capture] fee of ${claimed.fee} for capture ${id} was not booked:`, e.message);
            }
        }
        await mirrorMomoCapture(done, mirror);
        await syncWalletToReportedBalance(userId, orgId, claimed.provider);
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
