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
import { parseMomoMessage, parseBalanceMessage, diagnoseMessage, balanceDedupeKey, dedupeKey, describe, type MomoProvider, type ParsedMomoMessage } from './parser';

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
    const { count: openChecks } = await supabase.from('momo_balance_checks').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('organization_id', orgId).eq('status', 'OPEN');
    return {
        autoPost: !!row.auto_post,
        destination: row.destination as 'PROVIDER' | 'CASH',
        hasToken: !!row.token_hash,
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
    // A message that doesn't name its provider is filed under the one this phone number is on.
    const fallbackProvider = async (found: MomoProvider): Promise<MomoProvider> =>
        found !== 'OTHER' ? found : (((await settingsRow(input.userId, input.orgId)).default_provider as MomoProvider | null) ?? 'OTHER');
    if (parsed) parsed.provider = await fallbackProvider(parsed.provider);
    if (!parsed) {
        // Not a money movement — it may be a balance enquiry reply, which is compared with the ledger instead.
        const bal = parseBalanceMessage(text, sender);
        if (bal) return { accepted: true as const, balanceCheck: await recordBalanceCheck(input.userId, input.orgId, source, text, await fallbackProvider(bal.provider), bal.balance, occurredAt) };
        await logIgnored(input.userId, input.orgId, source, text, sender);
        return { accepted: false as const, reason: 'NOT_A_TRANSACTION' };
    }

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
async function logIgnored(userId: string, orgId: string, source: CaptureSource, text: string, sender: string | null) {
    try {
        const d = diagnoseMessage(text, sender);
        if (d.kind !== 'IGNORED') return;
        await supabase.from('momo_ignored_messages').insert({
            organization_id: orgId, user_id: userId, source, reason: d.reason,
            raw_text: d.sensitive ? '[hidden: looks like a one-time code]' : text.slice(0, 300),
        });
        await supabase.from('momo_ignored_messages').delete().eq('user_id', userId)
            .lt('created_at', new Date(Date.now() - IGNORED_KEEP_DAYS * 24 * 3600 * 1000).toISOString());
    } catch (e: any) { console.error('[MoMo capture] could not log ignored message:', e?.message); }
}

export async function listIgnored(userId: string, orgId: string) {
    const { data, error } = await supabase.from('momo_ignored_messages').select('*')
        .eq('user_id', userId).eq('organization_id', orgId).order('created_at', { ascending: false }).limit(100);
    if (error) throw new MomoCaptureError(error.message, 500);
    return data ?? [];
}

/** Dry run for the web tester: how a pasted message would be read, nothing saved. */
export function testParse(text: unknown) {
    const t = typeof text === 'string' ? text : '';
    if (!t.trim()) throw new MomoCaptureError('Paste a message to test');
    return diagnoseMessage(t, null);
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

async function recordBalanceCheck(userId: string, orgId: string, source: CaptureSource, text: string, provider: MomoProvider, balance: number, observedAt: string) {
    const settings = await settingsRow(userId, orgId);
    const { data: row, error } = await supabase.from('momo_balance_checks').insert({
        organization_id: orgId, user_id: userId, source, provider, raw_text: text.slice(0, 600), balance, observed_at: observedAt,
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
