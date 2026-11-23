import { supabase } from '../lib/supabase';

/**
 * Blue Opus share offers. Blue Opus is not publicly listed, so this is a private, personal agreement, not a market: a person reads the terms, picks
 * an amount, and signs (their typed name) an offer to buy shares at the round's post-money valuation. Blue Opus reviews it, countersigns, and takes
 * payment itself; this system records the offer and follows its status. Nothing here moves money.
 *
 * Post-money valuation: the company's value INCLUDING the money raised in the round. So a person's ownership is amount / post-money, fixed when
 * they sign (later rounds dilute everyone). The round's numbers are in app_settings 'blue_opus_round'.
 */
export interface Round { enabled: boolean; postMoney: number; currency: string; minAmount: number; maxAmount: number | null; maxTotal: number | null; agreementVersion: string; inviteOnly: boolean; legalApprovedVersion: string | null; maxInvestors: number | null }
export type OfferStatus = 'SUBMITTED' | 'COUNTERSIGNED' | 'PAID' | 'DECLINED' | 'WITHDRAWN';

export class ShareError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'SHARES') { super(message); }
}

const num = (v: unknown) => Number(v) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Ownership as a percentage, to 6 decimals: what the money buys at the post-money valuation. */
export const ownershipPct = (amount: number, postMoney: number): number => (postMoney > 0 ? Math.round((amount / postMoney) * 100 * 1e6) / 1e6 : 0);
/** What one percent of the company costs at the post-money valuation. */
export const pricePerPercent = (postMoney: number): number => postMoney / 100;

/** The offer's words. A DRAFT for Blue Opus's lawyer to review and change before real money is raised; the version is stored with every signed offer. */
export const AGREEMENT_VERSION_DEFAULT = '2026-11-draft-2';
export function agreementClauses(r: Round, amount?: number): { title: string; text: string }[] {
    const money = (n: number) => `K${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    const pct = amount ? ownershipPct(amount, r.postMoney) : null;
    return [
        { title: 'What this is', text: 'A personal agreement between you and Blue Opus (the Company) for you to buy shares in the Company. The Company is privately held and its shares are not listed or traded on any exchange.' },
        { title: 'Price and your share', text: `The Company is valued at ${money(r.postMoney)} post-money, which is its value including the money raised in this round. Your ownership is your amount divided by ${money(r.postMoney)}${pct !== null ? `: ${money(amount!)} buys ${pct}% of the Company` : ''}. This percentage is fixed when you sign. Later share issues can reduce it (dilution).` },
        { title: 'The round', text: `${r.maxTotal ? `This round raises up to ${money(r.maxTotal)}` : 'This round raises money'} for shares in the Company at the ${money(r.postMoney)} post-money valuation${r.maxTotal ? ` (${Math.round((r.maxTotal / r.postMoney) * 1000) / 10}% of the Company in total)` : ''}. The Company decides which offers to accept and may close the round when it is full.` },
        { title: 'Not final until the Company agrees', text: 'Signing here is your offer. It becomes binding only when the Company countersigns it and you have paid the amount as the Company directs. The Company may decline an offer. If it does, or if you withdraw before it countersigns, nothing is owed and no money is taken here.' },
        { title: 'Payment', text: 'This page does not take payment. If your offer is accepted, the Company will tell you how to pay. Do not send money to anyone who has not confirmed it through MoneyWise.' },
        { title: 'Risks you accept', text: 'You can lose all of the money you put in. Shares in a private company are hard to sell: there is no market, and you may not be able to sell for a long time or at all. The Company may never pay dividends. The valuation is the Company’s own figure and is not independently verified. Nothing here is investment, legal or tax advice.' },
        { title: 'How you may get money back', text: 'The Company intends to give shareholders a share of dividends once it is generating cash, which it expects from 2028, but dividends are decided by its board and are not promised. The Company may also offer to buy your shares back for cash at its value at that time; this is an option for the Company and for you to agree, not a right. Any figures about future revenue, value or returns in the Company’s investor materials are projections, not guarantees.' },
        { title: 'Records', text: 'You will be recorded as a shareholder in the Company’s share register once the Company countersigns and receives your payment. Until then you hold no shares and have no shareholder rights.' },
        { title: 'Your details', text: 'We keep your name, contact details and the details of this offer to run the agreement and to meet legal duties. Your KYC details, where needed, are handled as set out in the Investor accounts section.' },
        { title: 'Law', text: 'This agreement is governed by the laws of Zambia.' },
    ];
}

export async function getRound(): Promise<Round> {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'blue_opus_round').maybeSingle();
    const v: any = data?.value ?? {};
    return {
        enabled: v.enabled === true,
        postMoney: num(v.postMoney) || 7_500_000,
        currency: String(v.currency || 'ZMW'),
        minAmount: num(v.minAmount) || 1000,
        maxAmount: v.maxAmount ? num(v.maxAmount) : null,
        maxTotal: v.maxTotal ? num(v.maxTotal) : null,
        agreementVersion: String(v.agreementVersion || AGREEMENT_VERSION_DEFAULT),
        // Private by default: a company that isn't listed must not advertise its shares to the public.
        inviteOnly: v.inviteOnly !== false,
        legalApprovedVersion: v.legalApprovedVersion ? String(v.legalApprovedVersion) : null,
        maxInvestors: v.maxInvestors ? num(v.maxInvestors) : null,
    };
}

/** Money offered or paid so far in the round (declined and withdrawn offers don't count). */
async function committedTotal(): Promise<number> {
    const { data } = await supabase.from('share_offers').select('amount').in('status', ['SUBMITTED', 'COUNTERSIGNED', 'PAID']);
    return round2((data ?? []).reduce((s: number, r: any) => s + num(r.amount), 0));
}

/** What the page shows: the terms, the limits, and how much of the round is left (when there is a cap). */
export async function terms(access = true) {
    const r = await getRound();
    // Without an invitation nothing about the offer is shown: no valuation, no figures, no agreement. The page only asks for a code.
    if (r.inviteOnly && !access) return { access: false as const, inviteOnly: true as const };
    const committed = r.maxTotal ? await committedTotal() : null;
    // Blue Opus's own logo (the Blue Opus Software organisation's), for the page and the Invest list.
    const { data: org } = await supabase.from('organizations').select('logo_url').eq('name', 'Blue Opus Software').maybeSingle();
    return {
        access: true as const,
        inviteOnly: r.inviteOnly,
        // Offers can be taken only once a lawyer has approved THIS version of the agreement.
        legalApproved: r.legalApprovedVersion === r.agreementVersion,
        round: r,
        logoUrl: (org?.logo_url as string | null) ?? null,
        pricePerPercent: pricePerPercent(r.postMoney),
        remaining: r.maxTotal && committed !== null ? Math.max(0, round2(r.maxTotal - committed)) : null,
        clauses: agreementClauses(r),
    };
}

const MAX_OPEN_OFFERS = 3;

/* ───────────── Invitations ───────────── */

/** Can this person see and use the offer? Everyone when it is not invite-only; otherwise an admin, or someone who redeemed a live (not revoked, not expired) invite. */
export async function hasAccess(userId: string, isAdmin = false): Promise<boolean> {
    const r = await getRound();
    if (!r.inviteOnly || isAdmin) return true;
    return !!(await liveInviteFor(userId));
}

async function liveInviteFor(userId: string) {
    const { data } = await supabase.from('share_invites').select('id, expires_at, revoked_at').eq('redeemed_by', userId).is('revoked_at', null).limit(5);
    return (data ?? []).find((i: any) => !i.expires_at || new Date(i.expires_at).getTime() > Date.now()) ?? null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I: easy to read out over the phone
export const newInviteCode = (): string => { let c = ''; const buf = new Uint8Array(8); require('crypto').randomFillSync(buf); for (const b of buf) c += CODE_ALPHABET[b % CODE_ALPHABET.length]; return `BO-${c}`; };
const normCode = (c: unknown) => String(c ?? '').trim().toUpperCase().replace(/\s+/g, '');

/** A few wrong guesses an hour per person, so a code can't be guessed by trying many. */
const tries = new Map<string, { n: number; at: number }>();
function throttle(userId: string, failed: boolean) {
    const now = Date.now(); const cur = tries.get(userId);
    const rec = cur && now - cur.at < 3_600_000 ? cur : { n: 0, at: now };
    if (!failed) return rec.n >= 10 ? (() => { throw new ShareError('Too many wrong codes. Please try again in an hour.', 429, 'THROTTLED'); })() : undefined;
    rec.n += 1; tries.set(userId, rec);
}

/** A person enters their invitation code. One invite opens one account, once. */
export async function redeemInvite(userId: string, codeInput: unknown) {
    throttle(userId, false);
    const r = await getRound();
    const code = normCode(codeInput);
    const bad = () => { throttle(userId, true); return new ShareError('That code isn’t valid. Check it and try again, or ask Blue Opus for a new one.', 400, 'BAD_CODE'); };
    if (!/^BO-[A-Z0-9]{8}$/.test(code)) throw bad();
    const { data: inv } = await supabase.from('share_invites').select('*').eq('code', code).maybeSingle();
    if (!inv || inv.revoked_at || (inv.expires_at && new Date(inv.expires_at).getTime() <= Date.now())) throw bad();
    if (inv.redeemed_by && inv.redeemed_by !== userId) throw bad();
    if (inv.redeemed_by === userId) return { ok: true };
    if (r.maxInvestors) {
        const { count } = await supabase.from('share_invites').select('id', { count: 'exact', head: true }).not('redeemed_by', 'is', null).is('revoked_at', null);
        if ((count ?? 0) >= r.maxInvestors) throw new ShareError('The list of investors for this round is full.', 409, 'FULL_LIST');
    }
    // Atomic: only if nobody else has taken it in the meantime.
    const { data: won } = await supabase.from('share_invites').update({ redeemed_by: userId, redeemed_at: new Date().toISOString() }).eq('id', inv.id).is('redeemed_by', null).select('id').maybeSingle();
    if (!won) throw bad();
    return { ok: true };
}

/** Blue Opus's side: make, list and revoke invitations. */
export async function adminCreateInvite(by: string, input: { name: unknown; email?: unknown; phone?: unknown; note?: unknown; expiresInDays?: unknown }) {
    const name = String(input.name ?? '').trim().slice(0, 120);
    if (name.length < 2) throw new ShareError('Enter the name of the person you are inviting.', 400, 'NAME');
    const days = Number(input.expiresInDays);
    const expires_at = Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
    for (let i = 0; i < 5; i++) {
        const { data, error } = await supabase.from('share_invites').insert({ code: newInviteCode(), name, email: String(input.email ?? '').trim().slice(0, 200) || null, phone: String(input.phone ?? '').trim().slice(0, 40) || null, note: String(input.note ?? '').trim().slice(0, 300) || null, created_by: by, expires_at }).select('*').single();
        if (!error) return data;
        if (!/duplicate|unique/i.test(error.message)) throw error;
    }
    throw new ShareError('Couldn’t make a code. Please try again.', 500, 'CODE');
}
export async function adminListInvites() {
    const { data, error } = await supabase.from('share_invites').select('*').order('created_at', { ascending: false }).limit(300);
    if (error) throw error;
    return data ?? [];
}
export async function adminRevokeInvite(id: string) {
    const { data, error } = await supabase.from('share_invites').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new ShareError('Invite not found or already revoked.', 404, 'NOT_FOUND');
    return { ok: true };
}

/** Blue Opus records that a lawyer has approved (or no longer approves) the CURRENT wording. Offers are blocked until it is approved; changing the wording (a new version) blocks them again. */
export async function adminSetLegalApproval(approved: boolean, reviewer: unknown) {
    const r = await getRound();
    const { data: row } = await supabase.from('app_settings').select('value, description').eq('key', 'blue_opus_round').maybeSingle();
    const value = { ...(row?.value ?? {}), legalApprovedVersion: approved ? r.agreementVersion : null, legalReviewedBy: approved ? String(reviewer ?? '').trim().slice(0, 120) || null : null, legalReviewedAt: approved ? new Date().toISOString() : null };
    if (approved && !value.legalReviewedBy) throw new ShareError('Enter the name of the lawyer or firm that approved the wording.', 400, 'REVIEWER');
    const { error } = await supabase.from('app_settings').upsert({ key: 'blue_opus_round', value, description: row?.description ?? 'Blue Opus share round', updated_at: new Date().toISOString() });
    if (error) throw error;
    return { legalApproved: approved, version: r.agreementVersion };
}
const same = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

export async function createOffer(user: { id: string; organization_id?: string | null }, input: { amount: unknown; fullName: unknown; acceptedName: unknown; agree: unknown; email?: unknown; phone?: unknown; declarations?: unknown }, ip: string | null, isAdmin = false) {
    const r = await getRound();
    if (!r.enabled) throw new ShareError('This share round is closed.', 409, 'CLOSED');
    if (r.inviteOnly && !isAdmin && !(await liveInviteFor(user.id))) throw new ShareError('This offer is by invitation only.', 403, 'NOT_INVITED');
    if (r.legalApprovedVersion !== r.agreementVersion) throw new ShareError('Offers open once Blue Opus’s lawyer has approved the agreement. Please check back soon.', 409, 'NOT_APPROVED');
    const amount = round2(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new ShareError('Enter the amount you want to invest.', 400, 'AMOUNT');
    if (amount < r.minAmount) throw new ShareError(`The smallest amount is K${r.minAmount.toLocaleString('en-US')}.`, 400, 'MIN');
    if (r.maxAmount && amount > r.maxAmount) throw new ShareError(`The largest amount for one person is K${r.maxAmount.toLocaleString('en-US')}.`, 400, 'MAX');
    if (amount > r.postMoney * 0.5) throw new ShareError('That amount is too large for an online offer. Please contact Blue Opus directly.', 400, 'MAX');
    const fullName = String(input.fullName ?? '').trim().replace(/\s+/g, ' ');
    if (fullName.length < 3 || !fullName.includes(' ')) throw new ShareError('Enter your full legal name (first and last name).', 400, 'NAME');
    if (input.agree !== true) throw new ShareError('Please tick the box to say you have read and accept the agreement.', 400, 'AGREE');
    // What the investor confirms about themselves (the screening, along with Blue Opus's own review of every offer).
    const d: any = input.declarations ?? {};
    if (!(d.invited === true && d.adult === true && d.canAffordLoss === true && d.ownDecision === true)) throw new ShareError('Please confirm each statement about you before signing.', 400, 'DECLARATIONS');
    if (!same(String(input.acceptedName ?? ''), fullName)) throw new ShareError('To sign, type your full name exactly as above.', 400, 'SIGNATURE');
    if (r.maxTotal) {
        const committed = await committedTotal();
        if (committed + amount > r.maxTotal) throw new ShareError(`Only K${Math.max(0, round2(r.maxTotal - committed)).toLocaleString('en-US')} is left in this round.`, 409, 'FULL');
    }
    const { count } = await supabase.from('share_offers').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['SUBMITTED', 'COUNTERSIGNED']);
    if ((count ?? 0) >= MAX_OPEN_OFFERS) throw new ShareError(`You already have ${MAX_OPEN_OFFERS} offers open. Please wait for those, or withdraw one.`, 409, 'TOO_MANY');

    const { data, error } = await supabase.from('share_offers').insert({
        user_id: user.id, organization_id: user.organization_id ?? null, full_name: fullName,
        email: String(input.email ?? '').trim().slice(0, 200) || null, phone: String(input.phone ?? '').trim().slice(0, 40) || null,
        amount, post_money: r.postMoney, ownership_pct: ownershipPct(amount, r.postMoney), currency: r.currency,
        agreement_version: r.agreementVersion, accepted_name: String(input.acceptedName).trim().replace(/\s+/g, ' '), accepted_ip: ip,
        declarations: { invited: true, adult: true, canAffordLoss: true, ownDecision: true, at: new Date().toISOString() },
        invite_id: (await liveInviteFor(user.id))?.id ?? null,
    }).select('*').single();
    if (error) throw error;
    return data;
}

export async function myOffers(userId: string) {
    const { data, error } = await supabase.from('share_offers').select('id, amount, post_money, ownership_pct, currency, status, note, agreement_version, accepted_at, decided_at, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return data ?? [];
}

/** A person can withdraw an offer the Company has not countersigned yet. */
export async function withdraw(userId: string, id: string) {
    const { data, error } = await supabase.from('share_offers').update({ status: 'WITHDRAWN', decided_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).eq('status', 'SUBMITTED').select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new ShareError('Only an offer that is still waiting can be withdrawn.', 409, 'NOT_WAITING');
    return { ok: true };
}

const NEXT: Record<OfferStatus, OfferStatus[]> = { SUBMITTED: ['COUNTERSIGNED', 'DECLINED'], COUNTERSIGNED: ['PAID', 'DECLINED'], PAID: [], DECLINED: [], WITHDRAWN: [] };

/** Blue Opus's side: every offer, newest first, with the round's running total. */
export async function adminList(status?: string) {
    let q = supabase.from('share_offers').select('*').order('created_at', { ascending: false }).limit(300);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    const all = data ?? [];
    return { offers: all, totals: { submitted: round2(all.filter((o: any) => o.status === 'SUBMITTED').reduce((s: number, o: any) => s + num(o.amount), 0)), countersigned: round2(all.filter((o: any) => o.status === 'COUNTERSIGNED').reduce((s: number, o: any) => s + num(o.amount), 0)), paid: round2(all.filter((o: any) => o.status === 'PAID').reduce((s: number, o: any) => s + num(o.amount), 0)) } };
}

/** Blue Opus countersigns, marks paid, or declines an offer. Only the steps in NEXT are allowed, and the offer must still be in the status it was read in. */
export async function adminDecide(id: string, status: string, note: unknown) {
    const { data: o } = await supabase.from('share_offers').select('id, status, user_id').eq('id', id).maybeSingle();
    if (!o) throw new ShareError('Offer not found.', 404, 'NOT_FOUND');
    if (!(NEXT[o.status as OfferStatus] ?? []).includes(status as OfferStatus)) throw new ShareError(`An offer that is ${String(o.status).toLowerCase()} can’t be marked ${String(status).toLowerCase()}.`, 409, 'BAD_STEP');
    const { data, error } = await supabase.from('share_offers').update({ status, note: String(note ?? '').trim().slice(0, 500) || null, decided_at: new Date().toISOString() }).eq('id', id).eq('status', o.status).select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new ShareError('This offer was just changed. Reload and try again.', 409, 'CHANGED');
    return data;
}
