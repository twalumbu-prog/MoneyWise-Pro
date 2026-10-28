/**
 * rewards.service.ts — customer rewards.
 *
 * A person earns points with each MoneyWise business they buy from, and with MoneyWise itself for inviting friends.
 * The ledger (reward_ledger) is the single source of truth: every row is one earning / redeeming event with a unique `ref`, so
 * the same purchase can be looked at any number of times and only ever pays once.
 *
 * Where points come from
 *   • MoneyWise Pay from a personal account to a business: credited the moment the transfer settles (awardMoneyWisePay).
 *   • Paid payment links and quick-pay page payments: found by the payer's saved phone number / email when they open Rewards
 *     (syncPurchases), so past purchases count too.
 *   • Invites: a friend who pays a business through the inviter's link earns the inviter the business's referral points; a friend
 *     who signs up with the inviter's code and makes a first purchase earns the inviter MoneyWise points (syncReferrals).
 */
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { accountsOf } from './paymentInfo.service';
import { normalizeZambiaPhone } from '../utils/zambiaPhone';
import { getFrontendUrl } from '../utils/frontendUrl';

export const PLATFORM = 'moneywise';
export const PLATFORM_REFERRAL_POINTS = 200;
const REFERRAL_WINDOW_DAYS = 30;

export interface Program {
    organization_id: string;
    enabled: boolean;
    points_per_kwacha: number;
    reward_threshold: number;
    reward_title: string;
    reward_value: number;
    referral_points: number;
}

export const DEFAULT_PROGRAM = {
    enabled: true, points_per_kwacha: 1, reward_threshold: 500, reward_title: 'K25 off your next purchase', reward_value: 25, referral_points: 100,
};

const TIERS = [{ name: 'Bronze', min: 0 }, { name: 'Silver', min: 500 }, { name: 'Gold', min: 2000 }, { name: 'Platinum', min: 5000 }];
export const tierFor = (lifetime: number) => [...TIERS].reverse().find((t) => lifetime >= t.min)!.name;

const NOT_SETTLED = new Set(['PENDING', 'FAILED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'VOIDED', 'VOID']);
const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

export class RewardsError extends Error { constructor(message: string, public httpStatus = 400) { super(message); } }

// ── Programmes ─────────────────────────────────────────────────────────────────

export async function getProgram(orgId: string): Promise<Program> {
    const { data } = await supabase.from('reward_programs').select('*').eq('organization_id', orgId).maybeSingle();
    const p: any = data ?? {};
    return {
        organization_id: orgId,
        enabled: p.enabled ?? DEFAULT_PROGRAM.enabled,
        points_per_kwacha: Number(p.points_per_kwacha ?? DEFAULT_PROGRAM.points_per_kwacha),
        reward_threshold: Number(p.reward_threshold ?? DEFAULT_PROGRAM.reward_threshold),
        reward_title: p.reward_title ?? DEFAULT_PROGRAM.reward_title,
        reward_value: Number(p.reward_value ?? DEFAULT_PROGRAM.reward_value),
        referral_points: Number(p.referral_points ?? DEFAULT_PROGRAM.referral_points),
    };
}

export async function updateProgram(orgId: string, patch: any): Promise<Program> {
    const cur = await getProgram(orgId);
    const num = (v: any, fallback: number, min: number, max: number, what: string) => {
        if (v === undefined || v === null || v === '') return fallback;
        const n = Number(v);
        if (!Number.isFinite(n) || n < min || n > max) throw new RewardsError(`${what} must be between ${min} and ${max}.`);
        return n;
    };
    const next = {
        organization_id: orgId,
        enabled: patch.enabled === undefined ? cur.enabled : !!patch.enabled,
        points_per_kwacha: num(patch.points_per_kwacha, cur.points_per_kwacha, 0.01, 1000, 'Points per kwacha'),
        reward_threshold: Math.round(num(patch.reward_threshold, cur.reward_threshold, 10, 1_000_000, 'Points for a reward')),
        reward_title: String(patch.reward_title ?? cur.reward_title).trim().slice(0, 80) || cur.reward_title,
        reward_value: round2(num(patch.reward_value, cur.reward_value, 0, 1_000_000, 'Reward value')),
        referral_points: Math.round(num(patch.referral_points, cur.referral_points, 0, 100_000, 'Referral points')),
        updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('reward_programs').upsert(next, { onConflict: 'organization_id' });
    if (error) throw new Error(error.message);
    return getProgram(orgId);
}


// ── Rewards a business offers ──────────────────────────────────────────────────

export type RewardType = 'AMOUNT_OFF' | 'PERCENT_OFF' | 'FREE_ITEM';
export interface RewardItem { id: string; organization_id: string; title: string; reward_type: RewardType; value: number; points_cost: number; product_ids: string[]; active: boolean }
export const LEGACY_REWARD_ID = 'default';
const TYPES: RewardType[] = ['AMOUNT_OFF', 'PERCENT_OFF', 'FREE_ITEM'];
const missingTable = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205' || /reward_items/.test(String(e.message ?? '')) && /does not exist|schema cache/.test(String(e.message ?? '')));

const toItem = (r: any): RewardItem => ({
    id: r.id, organization_id: r.organization_id, title: r.title, reward_type: r.reward_type, value: Number(r.value) || 0,
    points_cost: Number(r.points_cost), product_ids: r.product_ids ?? [], active: r.active !== false,
});

/** Every reward row a business has made (active or not). Empty, not an error, until the table exists. */
async function rawItems(orgIds: string[]): Promise<RewardItem[]> {
    if (orgIds.length === 0) return [];
    const { data, error } = await supabase.from('reward_items').select('*').in('organization_id', orgIds).order('points_cost', { ascending: true });
    if (error) { if (missingTable(error)) return []; throw new Error(error.message); }
    return (data ?? []).map(toItem);
}

/**
 * The rewards customers can redeem at each business, cheapest first. A business that has never defined any gets the single reward
 * from its original programme settings, so nothing disappears for businesses that haven't set the new ones up yet. A business that
 * has defined rewards (even if all are switched off) uses only those.
 */
async function offeredRewards(orgIds: string[]): Promise<Map<string, RewardItem[]>> {
    const rows = await rawItems(orgIds);
    const out = new Map<string, RewardItem[]>();
    for (const id of orgIds) {
        const mine = rows.filter((r) => r.organization_id === id);
        if (mine.length > 0) { out.set(id, mine.filter((r) => r.active)); continue; }
        const p = await getProgram(id);
        out.set(id, p.enabled ? [{ id: LEGACY_REWARD_ID, organization_id: id, title: p.reward_title, reward_type: 'AMOUNT_OFF', value: p.reward_value, points_cost: p.reward_threshold, product_ids: [], active: true }] : []);
    }
    return out;
}

async function productNames(orgId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const { data } = await supabase.from('products').select('id, name').eq('organization_id', orgId).in('id', ids);
    const byId = new Map((data ?? []).map((p: any) => [p.id, p.name as string]));
    return ids.map((i) => byId.get(i)).filter((n): n is string => !!n);
}

/** "K25 off", "10% off Haircut", "Free Coffee". */
export function describeReward(r: Pick<RewardItem, 'reward_type' | 'value'>, names: string[]): string {
    const on = names.length === 0 ? '' : names.length <= 2 ? ` ${names.join(' & ')}` : ` ${names[0]} & ${names.length - 1} more`;
    if (r.reward_type === 'FREE_ITEM') return `Free${on || ' item'}`;
    if (r.reward_type === 'PERCENT_OFF') return `${r.value}% off${on}`;
    return `K${r.value.toLocaleString('en-US')} off${on}`;
}

export async function listRewardItems(orgId: string) {
    const items = await rawItems([orgId]);
    const ids = [...new Set(items.flatMap((i) => i.product_ids))];
    const { data } = ids.length ? await supabase.from('products').select('id, name').eq('organization_id', orgId).in('id', ids) : { data: [] as any[] };
    const names = new Map((data ?? []).map((p: any) => [p.id, p.name as string]));
    return items.map((i) => ({ ...i, products: i.product_ids.map((id) => ({ id, name: names.get(id) ?? 'Removed product' })), summary: describeReward(i, i.product_ids.map((id) => names.get(id)).filter((n): n is string => !!n)) }));
}

async function cleanItem(orgId: string, input: any, cur?: RewardItem) {
    const type = (input.reward_type ?? cur?.reward_type) as RewardType;
    if (!TYPES.includes(type)) throw new RewardsError('Choose what the customer gets: money off, a percentage off, or a free item.');
    const cost = Math.round(Number(input.points_cost ?? cur?.points_cost));
    if (!Number.isFinite(cost) || cost < 1 || cost > 1_000_000) throw new RewardsError('Points needed must be between 1 and 1,000,000.');
    let value = type === 'FREE_ITEM' ? 0 : round2(Number(input.value ?? cur?.value));
    if (type === 'AMOUNT_OFF' && !(value > 0 && value <= 1_000_000)) throw new RewardsError('Enter how much money comes off.');
    if (type === 'PERCENT_OFF' && !(value > 0 && value <= 100)) throw new RewardsError('A percentage off must be between 1 and 100.');
    const wanted: string[] = input.product_ids === undefined ? (cur?.product_ids ?? []) : [...new Set((Array.isArray(input.product_ids) ? input.product_ids : []).map(String))] as string[];
    if (wanted.length > 0) {
        const { data } = await supabase.from('products').select('id').eq('organization_id', orgId).in('id', wanted);
        if ((data ?? []).length !== wanted.length) throw new RewardsError('One of the selected products isn’t in your shop any more.');
    }
    if (type === 'FREE_ITEM' && wanted.length === 0) throw new RewardsError('Choose which product is given free.');
    const names = await productNames(orgId, wanted);
    const typed = String(input.title ?? '').trim();
    const title = (typed || (cur && input.title === undefined ? cur.title : '') || describeReward({ reward_type: type, value }, names)).slice(0, 80);
    return { title, reward_type: type, value, points_cost: cost, product_ids: wanted, active: input.active === undefined ? (cur?.active ?? true) : !!input.active };
}

export async function createRewardItem(orgId: string, input: any) {
    const row = { organization_id: orgId, ...(await cleanItem(orgId, input)) };
    const { data, error } = await supabase.from('reward_items').insert(row).select('*').single();
    if (error) { if (missingTable(error)) throw new RewardsError('Rewards need a one-time database update first. Please ask support to apply it.', 503); throw new Error(error.message); }
    return toItem(data);
}

export async function updateRewardItem(orgId: string, id: string, input: any) {
    const cur = (await rawItems([orgId])).find((r) => r.id === id);
    if (!cur) throw new RewardsError('Reward not found.', 404);
    const row = { ...(await cleanItem(orgId, input, cur)), updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('reward_items').update(row).eq('id', id).eq('organization_id', orgId).select('*').single();
    if (error) throw new Error(error.message);
    return toItem(data);
}

/** Vouchers already issued keep their own copy of the title and products, so removing a reward never breaks them. */
export async function deleteRewardItem(orgId: string, id: string) {
    const { error } = await supabase.from('reward_items').delete().eq('id', id).eq('organization_id', orgId);
    if (error) throw new Error(error.message);
}

// ── Earning ────────────────────────────────────────────────────────────────────

/** Writes one ledger row. Returns false when this exact event was already counted. */
async function addLedger(row: { user_id: string; organization_id: string | null; points: number; kind: string; description: string; ref: string; amount?: number; created_at?: string }): Promise<boolean> {
    if (!row.points) return false;
    const { error } = await supabase.from('reward_ledger').insert(row);
    if (!error) return true;
    if ((error as any).code === '23505') return false;
    throw new Error(error.message);
}

/** The person's own organizations: buying from your own business earns nothing. */
async function ownOrgIds(userId: string): Promise<Set<string>> {
    const [{ data: m }, { data: u }] = await Promise.all([
        supabase.from('user_organizations').select('organization_id').eq('user_id', userId),
        supabase.from('users').select('organization_id').eq('id', userId).maybeSingle(),
    ]);
    const s = new Set<string>((m ?? []).map((x: any) => x.organization_id));
    if ((u as any)?.organization_id) s.add((u as any).organization_id);
    return s;
}

export const isPersonalOrg = (o: { is_personal?: boolean | null; name?: string | null }) =>
    o?.is_personal === true || /workspace|personal account|individual/i.test(String(o?.name ?? ''));

async function businessInfo(orgIds: string[]) {
    if (orgIds.length === 0) return new Map<string, any>();
    const { data } = await supabase.from('organizations').select('id, name, logo_url, is_personal').in('id', orgIds);
    // The flag is only set on workspaces made by the app; an older personal account can be recognised only by its name (the app
    // tells them apart the same way). Either way it is a person, not a business, so it never gets a rewards programme.
    return new Map((data ?? []).map((o: any) => [o.id, { ...o, is_personal: isPersonalOrg(o) }]));
}

async function contactsOf(userId: string): Promise<{ email: string | null; phones: string[] }> {
    const { data: u } = await supabase.from('users').select('email, payment_info').eq('id', userId).maybeSingle();
    const { momos } = accountsOf((u as any)?.payment_info);
    const phones = [...new Set(momos.map((m) => normalizeZambiaPhone(m.number)).filter((p) => /^0\d{9}$/.test(p)))];
    return { email: (u as any)?.email ? String((u as any).email).trim().toLowerCase() : null, phones };
}

/** MoneyWise Pay from a personal account to a business: the sender earns points with that business. Idempotent. */
export async function awardMoneyWisePay(p: { requisitionId: string; recipientOrgId: string; amount: number; ref: string }): Promise<void> {
    const { data: req } = await supabase.from('requisitions').select('requestor_id, organization_id').eq('id', p.requisitionId).maybeSingle();
    if (!req?.requestor_id) return;
    const orgs = await businessInfo([(req as any).organization_id, p.recipientOrgId]);
    const sender = orgs.get((req as any).organization_id), biz = orgs.get(p.recipientOrgId);
    if (!sender || !biz || sender.is_personal !== true || biz.is_personal === true) return;
    if ((await ownOrgIds((req as any).requestor_id)).has(p.recipientOrgId)) return;
    const program = await getProgram(p.recipientOrgId);
    if (!program.enabled) return;
    await addLedger({
        user_id: (req as any).requestor_id, organization_id: p.recipientOrgId, kind: 'PURCHASE', ref: `MWP:${p.ref}`,
        points: Math.floor(p.amount * program.points_per_kwacha), amount: round2(p.amount), description: `Payment to ${biz.name}`,
    });
}

/** Counts this person's purchases from payment links and quick-pay pages that aren't in the ledger yet. */
export async function syncPurchases(userId: string): Promise<number> {
    const { email, phones } = await contactsOf(userId);
    if (phones.length === 0 && !email) return 0;
    const own = await ownOrgIds(userId);
    type Found = { ref: string; orgId: string; amount: number; at: string; label: string };
    const found: Found[] = [];

    const links: any[] = [];
    if (phones.length) { const { data } = await supabase.from('payment_links').select('id, organization_id, amount, paid_at, customer_name, items').eq('status', 'PAID').in('customer_phone', phones); links.push(...(data ?? [])); }
    if (email) { const { data } = await supabase.from('payment_links').select('id, organization_id, amount, paid_at, customer_name, items').eq('status', 'PAID').ilike('customer_email', email); links.push(...(data ?? [])); }
    for (const l of links) found.push({ ref: `PL:${l.id}`, orgId: l.organization_id, amount: Number(l.amount) || 0, at: l.paid_at ?? new Date().toISOString(), label: 'Purchase' });

    if (phones.length) {
        const { data: qlp } = await supabase.from('quick_link_payments').select('reference, organization_id, created_at').in('payer_phone', phones);
        const settled = await settledAmounts((qlp ?? []).map((q: any) => q.reference));
        for (const q of qlp ?? []) {
            const amount = settled.get((q as any).reference);
            if (amount) found.push({ ref: `QL:${(q as any).reference}`, orgId: (q as any).organization_id, amount, at: (q as any).created_at, label: 'Payment' });
        }
    }

    const candidates = found.filter((f) => f.amount > 0 && !own.has(f.orgId));
    if (candidates.length === 0) return 0;
    const orgs = await businessInfo([...new Set(candidates.map((f) => f.orgId))]);
    const programs = new Map<string, Program>();
    let added = 0;
    for (const f of candidates) {
        const biz = orgs.get(f.orgId);
        if (!biz || biz.is_personal === true) continue;
        if (!programs.has(f.orgId)) programs.set(f.orgId, await getProgram(f.orgId));
        const program = programs.get(f.orgId)!;
        if (!program.enabled) continue;
        if (await addLedger({
            user_id: userId, organization_id: f.orgId, kind: 'PURCHASE', ref: f.ref, points: Math.floor(f.amount * program.points_per_kwacha),
            amount: round2(f.amount), description: `${f.label} at ${biz.name}`, created_at: f.at,
        })) added++;
    }
    return added;
}

/** Settled amount per quick-pay reference: the inflow only counts once Lenco has confirmed it. */
async function settledAmounts(refs: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (refs.length === 0) return out;
    const { data } = await supabase.from('cashbook_entries').select('external_reference, debit, status').in('external_reference', refs).eq('entry_type', 'INFLOW');
    for (const e of data ?? []) {
        if (NOT_SETTLED.has(String((e as any).status).toUpperCase())) continue;
        out.set((e as any).external_reference, Number((e as any).debit) || 0);
    }
    return out;
}

// ── Invites ────────────────────────────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from(crypto.randomBytes(7)).map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

export async function getReferralCode(userId: string): Promise<string> {
    const { data } = await supabase.from('reward_codes').select('code').eq('user_id', userId).maybeSingle();
    if ((data as any)?.code) return (data as any).code;
    for (let i = 0; i < 6; i++) {
        const code = makeCode();
        const { error } = await supabase.from('reward_codes').insert({ user_id: userId, code });
        if (!error) return code;
        const again = await supabase.from('reward_codes').select('code').eq('user_id', userId).maybeSingle();
        if ((again.data as any)?.code) return (again.data as any).code;
    }
    throw new Error('Could not create a referral code. Please try again.');
}

async function userByCode(code: string): Promise<string | null> {
    const { data } = await supabase.from('reward_codes').select('user_id').eq('code', String(code ?? '').trim().toUpperCase()).maybeSingle();
    return (data as any)?.user_id ?? null;
}

/** The link to share: MoneyWise itself, or — on a business's page — that business's pay page with the code attached. */
export async function getInvite(userId: string, scope: string) {
    const code = await getReferralCode(userId);
    const base = getFrontendUrl();
    if (scope === PLATFORM) {
        return { code, scope, title: 'Invite friends to MoneyWise', link: `${base}/login?ref=${code}`, reward: `Earn ${PLATFORM_REFERRAL_POINTS} points when a friend joins and makes their first purchase.` };
    }
    const { data: org } = await supabase.from('organizations').select('id, name, public_username, is_personal').eq('id', scope).maybeSingle();
    if (!org || (org as any).is_personal === true) throw new RewardsError('Business not found.', 404);
    const program = await getProgram(scope);
    const username = (org as any).public_username;
    return {
        code, scope, title: `Invite friends to ${(org as any).name}`,
        // A business with no pay page yet can't take a friend's first purchase, so the invite falls back to MoneyWise.
        link: username ? `${base}/pay/${username}?ref=${code}` : `${base}/login?ref=${code}`,
        reward: program.referral_points > 0 ? `Earn ${program.referral_points} points when a friend makes their first payment to ${(org as any).name}.` : `Friends who pay ${(org as any).name} through your link are counted as your invites.`,
        businessPage: !!username,
    };
}

/** A new person enters (or arrives with) a friend's code: remember who invited them. */
export async function claimReferral(userId: string, code: string): Promise<{ referrerName: string }> {
    const referrer = await userByCode(code);
    if (!referrer) throw new RewardsError("That referral code isn't valid. Check it with your friend.", 404);
    if (referrer === userId) throw new RewardsError("You can't use your own code.");
    const { data: me } = await supabase.from('users').select('created_at').eq('id', userId).maybeSingle();
    const created = (me as any)?.created_at ? Date.parse((me as any).created_at) : NaN;
    if (Number.isFinite(created) && Date.now() - created > REFERRAL_WINDOW_DAYS * 86_400_000) {
        throw new RewardsError(`Referral codes can only be added in your first ${REFERRAL_WINDOW_DAYS} days.`);
    }
    const { error } = await supabase.from('reward_referrals').insert({ referrer_user_id: referrer, referred_user_id: userId });
    if (error) {
        if ((error as any).code === '23505') throw new RewardsError("You've already added a referral code.", 409);
        throw new Error(error.message);
    }
    const { data: r } = await supabase.from('users').select('name').eq('id', referrer).maybeSingle();
    return { referrerName: String((r as any)?.name ?? 'your friend').split(' ')[0] };
}

/** Rewards the inviter for friends who acted: paid a business through their link, or joined and made a first purchase. */
export async function syncReferrals(userId: string): Promise<number> {
    let added = 0;
    const { data: codeRow } = await supabase.from('reward_codes').select('code').eq('user_id', userId).maybeSingle();
    const code = (codeRow as any)?.code as string | undefined;
    const mine = await contactsOf(userId);

    if (code) {
        const { data: qlp } = await supabase.from('quick_link_payments').select('reference, organization_id, payer_phone, created_at').eq('referral_code', code).not('payer_phone', 'is', null).order('created_at', { ascending: true });
        const settled = await settledAmounts((qlp ?? []).map((q: any) => q.reference));
        const orgs = await businessInfo([...new Set((qlp ?? []).map((q: any) => q.organization_id))]);
        for (const q of (qlp ?? []) as any[]) {
            const phone = normalizeZambiaPhone(q.payer_phone);
            if (!settled.get(q.reference) || mine.phones.includes(phone)) continue;
            const biz = orgs.get(q.organization_id);
            if (!biz || biz.is_personal === true) continue;
            const program = await getProgram(q.organization_id);
            if (!program.enabled || program.referral_points <= 0) continue;
            if (await hadEarlierPurchase(q.organization_id, phone, q.created_at, q.reference)) continue;
            if (await addLedger({
                user_id: userId, organization_id: q.organization_id, kind: 'REFERRAL', ref: `RFB:${q.organization_id}:${phone}`,
                points: program.referral_points, description: `A friend you invited paid ${biz.name}`,
            })) added++;
        }
    }

    const { data: pending } = await supabase.from('reward_referrals').select('id, referred_user_id').eq('referrer_user_id', userId).eq('status', 'PENDING');
    for (const r of (pending ?? []) as any[]) {
        await syncPurchases(r.referred_user_id).catch(() => 0);
        const { data: acted } = await supabase.from('reward_ledger').select('id').eq('user_id', r.referred_user_id).eq('kind', 'PURCHASE').limit(1);
        if (!acted || acted.length === 0) continue;
        const { data: name } = await supabase.from('users').select('name').eq('id', r.referred_user_id).maybeSingle();
        await addLedger({
            user_id: userId, organization_id: null, kind: 'REFERRAL', ref: `RFP:${r.referred_user_id}`, points: PLATFORM_REFERRAL_POINTS,
            description: `${String((name as any)?.name ?? 'A friend you invited').split(' ')[0]} joined and made a first purchase`,
        }) && added++;
        await supabase.from('reward_referrals').update({ status: 'REWARDED', rewarded_at: new Date().toISOString() }).eq('id', r.id);
    }
    return added;
}

/** Did this phone already pay this business before `before` (so it isn't a new customer)? */
async function hadEarlierPurchase(orgId: string, phone: string, before: string, exceptRef: string): Promise<boolean> {
    const [{ data: links }, { data: qlps }] = await Promise.all([
        supabase.from('payment_links').select('id').eq('organization_id', orgId).eq('customer_phone', phone).eq('status', 'PAID').lt('paid_at', before).limit(1),
        supabase.from('quick_link_payments').select('reference').eq('organization_id', orgId).eq('payer_phone', phone).lt('created_at', before).neq('reference', exceptRef).limit(5),
    ]);
    if ((links ?? []).length > 0) return true;
    const settled = await settledAmounts((qlps ?? []).map((q: any) => q.reference));
    return settled.size > 0;
}

// ── Reading ────────────────────────────────────────────────────────────────────

const lastSync = new Map<string, number>();
/** Catches the ledger up with the person's purchases and invites (at most every 30 seconds each). */
export async function sync(userId: string, force = false): Promise<void> {
    const last = lastSync.get(userId) ?? 0;
    if (!force && Date.now() - last < 30_000) return;
    lastSync.set(userId, Date.now());
    await syncPurchases(userId).catch((e) => console.error('[Rewards] syncPurchases failed:', e.message));
    await syncReferrals(userId).catch((e) => console.error('[Rewards] syncReferrals failed:', e.message));
}

interface Totals { balance: number; lifetime: number; last: string | null }

async function totalsFor(userId: string): Promise<Map<string, Totals>> {
    const { data } = await supabase.from('reward_ledger').select('organization_id, points, created_at').eq('user_id', userId);
    const m = new Map<string, Totals>();
    for (const r of (data ?? []) as any[]) {
        const key = r.organization_id ?? PLATFORM;
        const t = m.get(key) ?? { balance: 0, lifetime: 0, last: null };
        t.balance += r.points;
        if (r.points > 0) t.lifetime += r.points;
        if (!t.last || r.created_at > t.last) t.last = r.created_at;
        m.set(key, t);
    }
    return m;
}

function cardOf(id: string, name: string, logoUrl: string | null, t: Totals, rewards: RewardItem[] | null) {
    // The reward to work towards: the cheapest one not yet affordable, or the cheapest overall once everything is.
    const costs = (rewards ?? []).map((r) => r.points_cost).sort((a, b) => a - b);
    const threshold = costs.find((c) => c > t.balance) ?? costs[0] ?? 0;
    const target = (rewards ?? []).filter((r) => r.points_cost === threshold)[0];
    const progress = threshold > 0 ? Math.min(1, Math.max(0, t.balance) / threshold) : 0;
    return {
        id, name, logoUrl, isPlatform: id === PLATFORM,
        balance: t.balance, lifetime: t.lifetime, tier: tierFor(t.lifetime), status: `${tierFor(t.lifetime)} member`,
        threshold: threshold || null, progress, pointsToNext: threshold > 0 ? Math.max(0, threshold - t.balance) : null,
        rewardReady: costs.length > 0 && t.balance >= costs[0], rewardTitle: target?.title ?? null,
        redeemable: costs.length > 0,
        lastActivity: t.last,
    };
}

export async function getOverview(userId: string) {
    await sync(userId);
    const totals = await totalsFor(userId);
    const orgIds = [...totals.keys()].filter((k) => k !== PLATFORM);
    const orgs = await businessInfo(orgIds);
    // A person's own (personal) account is never a business, even if points were once recorded against it.
    const shown = orgIds.filter((id) => orgs.has(id) && orgs.get(id).is_personal !== true);
    const offered = await offeredRewards(shown);
    const businesses = shown.map((id) => {
        const o = orgs.get(id);
        return cardOf(id, o.name ?? 'Business', o.logo_url ?? null, totals.get(id)!, offered.get(id) ?? []);
    });
    businesses.sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''));
    const platform = cardOf(PLATFORM, 'MoneyWise', null, totals.get(PLATFORM) ?? { balance: 0, lifetime: 0, last: null }, null);
    return { platform, businesses, code: await getReferralCode(userId) };
}

export async function getDetail(userId: string, scope: string) {
    await sync(userId);
    const orgId = scope === PLATFORM ? null : scope;
    const totals = (await totalsFor(userId)).get(scope) ?? { balance: 0, lifetime: 0, last: null };
    let name = 'MoneyWise', logoUrl: string | null = null, program: Program | null = null, rewards: RewardItem[] | null = null;
    if (orgId) {
        const org = (await businessInfo([orgId])).get(orgId);
        if (!org || org.is_personal === true) throw new RewardsError('Business not found.', 404);
        name = org.name; logoUrl = org.logo_url ?? null; program = await getProgram(orgId); rewards = (await offeredRewards([orgId])).get(orgId) ?? [];
    }
    let q = supabase.from('reward_ledger').select('id, points, kind, description, amount, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(200);
    q = orgId ? q.eq('organization_id', orgId) : q.is('organization_id', null);
    const { data: ledger } = await q;
    const { data: redemptions } = orgId
        ? await supabase.from('reward_redemptions').select('id, points, title, value, code, status, created_at, used_at').eq('user_id', userId).eq('organization_id', orgId).order('created_at', { ascending: false })
        : { data: [] as any[] };

    const rows = (ledger ?? []) as any[];
    const achievements: any[] = [];
    for (const r of (redemptions ?? []) as any[]) {
        achievements.push({ id: r.id, kind: 'reward', title: r.title, description: r.status === 'USED' ? 'Redeemed' : r.status === 'CANCELLED' ? 'Cancelled' : 'Ready to use — show this code', code: r.status === 'ISSUED' ? r.code : null, status: r.status, points: r.points, at: r.used_at ?? r.created_at });
    }
    const chrono = [...rows].reverse();
    let running = 0, tierIdx = 0;
    for (const r of chrono) {
        if (r.points < 0) continue;
        running += r.points;
        while (tierIdx + 1 < TIERS.length && running >= TIERS[tierIdx + 1].min) {
            tierIdx++;
            achievements.push({ id: `tier-${TIERS[tierIdx].name}`, kind: 'tier', title: `${TIERS[tierIdx].name} member`, description: `Reached ${TIERS[tierIdx].min.toLocaleString('en-US')} points`, at: r.created_at });
        }
    }
    const firstPurchase = chrono.find((r) => r.kind === 'PURCHASE'), firstReferral = chrono.find((r) => r.kind === 'REFERRAL');
    if (firstPurchase) achievements.push({ id: 'first-purchase', kind: 'milestone', title: 'First purchase', description: orgId ? `Your first purchase at ${name}` : 'Your first purchase with MoneyWise', at: firstPurchase.created_at });
    if (firstReferral) achievements.push({ id: 'first-invite', kind: 'milestone', title: 'First friend invited', description: 'A friend you invited took their first step', at: firstReferral.created_at });
    achievements.sort((a, b) => String(b.at).localeCompare(String(a.at)));

    return {
        card: cardOf(scope, name, logoUrl, totals, rewards),
        rewards: rewards ? await rewardOptions(orgId!, rewards, totals.balance) : [],
        program: program ? { threshold: rewards?.[0]?.points_cost ?? program.reward_threshold, rewardTitle: rewards?.[0]?.title ?? program.reward_title, rewardValue: program.reward_value, pointsPerKwacha: program.points_per_kwacha, referralPoints: program.referral_points, enabled: program.enabled } : null,
        points: rows.map((r) => ({ id: r.id, points: r.points, kind: r.kind, description: r.description, amount: r.amount == null ? null : Number(r.amount), at: r.created_at })),
        achievements,
    };
}

/** What a customer sees when choosing: each reward with what it gives, what it applies to, and whether their points reach it. */
async function rewardOptions(orgId: string, rewards: RewardItem[], balance: number) {
    const names = new Map<string, string>();
    const ids = [...new Set(rewards.flatMap((r) => r.product_ids))];
    if (ids.length) {
        const { data } = await supabase.from('products').select('id, name').eq('organization_id', orgId).in('id', ids);
        for (const p of data ?? []) names.set((p as any).id, (p as any).name);
    }
    return rewards.map((r) => {
        const products = r.product_ids.map((i) => names.get(i)).filter((n): n is string => !!n);
        return {
            id: r.id, title: r.title, type: r.reward_type, value: r.value, points: r.points_cost, products,
            appliesTo: products.length === 0 ? 'Anything' : products.join(', '),
            affordable: balance >= r.points_cost, pointsToGo: Math.max(0, r.points_cost - balance),
        };
    });
}

// ── Redeeming ──────────────────────────────────────────────────────────────────

const VOUCHER_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const voucherCode = () => `RW-${Array.from(crypto.randomBytes(6)).map((b) => VOUCHER_CHARS[b % VOUCHER_CHARS.length]).join('')}`;

/** Spends the business's "points for a reward" and issues a voucher the person shows at the business. */
export async function redeem(userId: string, orgId: string, rewardId?: string) {
    if (orgId === PLATFORM) throw new RewardsError("MoneyWise points can't be redeemed yet. Redeem the points you've earned with a business.");
    await sync(userId, true);
    const org = (await businessInfo([orgId])).get(orgId);
    if (!org || org.is_personal === true) throw new RewardsError('Business not found.', 404);
    const offered = (await offeredRewards([orgId])).get(orgId) ?? [];
    if (offered.length === 0) throw new RewardsError(`${org.name} isn't offering rewards right now.`);
    const reward = rewardId ? offered.find((r) => r.id === rewardId) : offered[0];
    if (!reward) throw new RewardsError("That reward isn't available any more.", 404);
    const balance = ((await totalsFor(userId)).get(orgId)?.balance) ?? 0;
    if (balance < reward.points_cost) throw new RewardsError(`You need ${reward.points_cost.toLocaleString('en-US')} points for ${reward.title} — you have ${balance.toLocaleString('en-US')}.`);
    const names = await productNames(orgId, reward.product_ids);

    let redemption: any = null;
    for (let i = 0; i < 5 && !redemption; i++) {
        const { data, error } = await supabase.from('reward_redemptions').insert({
            user_id: userId, organization_id: orgId, points: reward.points_cost, title: reward.title, value: reward.value, code: voucherCode(), status: 'ISSUED',
            ...(reward.id === LEGACY_REWARD_ID ? {} : { reward_id: reward.id, reward_type: reward.reward_type, product_names: names.join(', ') || null }),
        }).select('*').single();
        if (!error) redemption = data;
        else if ((error as any).code !== '23505') throw new Error(error.message);
    }
    if (!redemption) throw new Error('Could not issue the reward. Please try again.');
    await addLedger({ user_id: userId, organization_id: orgId, kind: 'REDEMPTION', ref: `RDM:${redemption.id}`, points: -reward.points_cost, description: `Redeemed: ${reward.title}` });
    // Two taps at once could both pass the balance check: if the balance went negative, undo this one.
    const after = ((await totalsFor(userId)).get(orgId)?.balance) ?? 0;
    if (after < 0) {
        await supabase.from('reward_ledger').delete().eq('user_id', userId).eq('ref', `RDM:${redemption.id}`);
        await supabase.from('reward_redemptions').delete().eq('id', redemption.id);
        throw new RewardsError("Your points changed while redeeming. Please try again.", 409);
    }
    return { id: redemption.id, code: redemption.code, title: redemption.title, value: Number(redemption.value), business: org.name, balance: after, appliesTo: names.join(', ') || null };
}

/** The business marks a customer's voucher as used. */
export async function useVoucher(orgId: string, actorId: string, code: string) {
    const c = String(code ?? '').trim().toUpperCase();
    if (!c) throw new RewardsError('Enter the voucher code.');
    const { data: v } = await supabase.from('reward_redemptions').select('*').eq('code', c).maybeSingle();
    if (!v || (v as any).organization_id !== orgId) throw new RewardsError("That code isn't one of your rewards.", 404);
    if ((v as any).status === 'USED') throw new RewardsError('This reward has already been used.', 409);
    if ((v as any).status !== 'ISSUED') throw new RewardsError('This reward is no longer valid.', 409);
    const { data: done } = await supabase.from('reward_redemptions').update({ status: 'USED', used_at: new Date().toISOString(), used_by: actorId }).eq('id', (v as any).id).eq('status', 'ISSUED').select('id');
    if (!done || done.length === 0) throw new RewardsError('This reward has already been used.', 409);
    const { data: u } = await supabase.from('users').select('name').eq('id', (v as any).user_id).maybeSingle();
    return { title: (v as any).title, value: Number((v as any).value), customer: (u as any)?.name ?? 'Customer' };
}

/** Everything the redeem screen needs: businesses where a reward is ready, and vouchers waiting to be used. */
export async function getRedeemables(userId: string) {
    const overview = await getOverview(userId);
    const { data: vouchers } = await supabase.from('reward_redemptions').select('id, organization_id, title, value, code, created_at').eq('user_id', userId).eq('status', 'ISSUED').order('created_at', { ascending: false });
    const orgs = await businessInfo([...new Set((vouchers ?? []).map((v: any) => v.organization_id))]);
    // Every business that offers rewards, with each reward and whether this person's points reach it, so the popup can show what
    // they can redeem now and what is still ahead.
    const offered = await offeredRewards(overview.businesses.map((b) => b.id));
    const programmes = (await Promise.all(overview.businesses.map(async (b) => ({ card: b, rewards: await rewardOptions(b.id, offered.get(b.id) ?? [], b.balance) }))))
        .filter((p) => p.rewards.length > 0);
    return {
        programmes,
        ready: overview.businesses.filter((b) => b.rewardReady && b.redeemable),
        vouchers: (vouchers ?? []).map((v: any) => ({ id: v.id, organizationId: v.organization_id, business: orgs.get(v.organization_id)?.name ?? 'Business', logoUrl: orgs.get(v.organization_id)?.logo_url ?? null, title: v.title, value: Number(v.value), code: v.code, at: v.created_at })),
    };
}

export const rewardsService = { getProgram, updateProgram, awardMoneyWisePay, syncPurchases, syncReferrals, sync, getOverview, getDetail, getInvite, getReferralCode, claimReferral, redeem, useVoucher, getRedeemables, listRewardItems, createRewardItem, updateRewardItem, deleteRewardItem };
