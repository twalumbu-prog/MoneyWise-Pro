/**
 * Tap to pay between MoneyWise users.
 *
 * The person receiving money makes a short-lived "pay me" request. The phone that pays opens it (by tap, QR code or link), sees who is
 * asking and for how much, and pays through the normal MoneyWise-to-MoneyWise transfer. NFC, QR and links only carry the request's
 * code. This service owns the receiver's setting, the requests, who may open them, and the one-time claim that makes a request payable
 * once. The money itself is never moved here.
 */
import crypto from 'crypto';
import { supabase } from '../lib/supabase';

export type TapMode = 'OFF' | 'CONTACTS' | 'EVERYONE';
export const TAP_MODES: TapMode[] = ['OFF', 'CONTACTS', 'EVERYONE'];

export class TapError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'TAP') { super(message); }
}

const TTL_MS = { TAP: 2 * 60_000, LINK: 24 * 3_600_000 } as const;
const CLAIM_MS = 3 * 60_000;
const MAX_AMOUNT = 50_000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PAID_STATES = ['DISBURSED', 'RECEIVED', 'EXPENSED', 'CATEGORIZING', 'CATEGORIZED', 'ACCOUNTED', 'COMPLETED'];

const round2 = (n: number) => Math.round(n * 100) / 100;
const newCode = () => Array.from(crypto.randomBytes(10), (b) => ALPHABET[b % ALPHABET.length]).join('');
const webOrigin = () => process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://moneywise.blueopus.cloud' : 'http://localhost:5173');
export const requestUrl = (code: string) => `${webOrigin().replace(/\/$/, '')}/r/${code}`;
const NOT_AVAILABLE = () => new TapError('This request isn’t available.', 404, 'NOT_AVAILABLE');

/* ───── The receiver's setting ───── */

export async function getMode(userId: string): Promise<TapMode> {
    const { data } = await supabase.from('users').select('tap_receive').eq('id', userId).maybeSingle();
    const m = String((data as any)?.tap_receive ?? 'OFF').toUpperCase();
    return (TAP_MODES as string[]).includes(m) ? (m as TapMode) : 'OFF';
}

export async function setMode(userId: string, mode: unknown): Promise<TapMode> {
    const m = String(mode ?? '').toUpperCase() as TapMode;
    if (!TAP_MODES.includes(m)) throw new TapError('Choose Off, My contacts or Everyone.', 400, 'MODE');
    const { error } = await supabase.from('users').update({ tap_receive: m }).eq('id', userId);
    if (error) throw new TapError('Couldn’t save that setting. Please try again.', 500, 'SAVE');
    // Turning it off ends anything still open.
    if (m === 'OFF') await supabase.from('pay_requests').update({ status: 'CANCELLED' }).eq('receiver_user_id', userId).in('status', ['OPEN']);
    return m;
}

/** "My contacts": people the receiver has sent money to before through MoneyWise. */
export async function isContact(receiverUserId: string, otherUserId: string): Promise<boolean> {
    const { data } = await supabase.from('disbursements')
        .select('id, requisitions!inner(requestor_id)')
        .eq('payment_method', 'MONEYWISE_PAY').eq('recipient_account', otherUserId).eq('requisitions.requestor_id', receiverUserId).limit(1);
    return !!data?.length;
}

async function allowed(receiverUserId: string, senderUserId: string): Promise<boolean> {
    const mode = await getMode(receiverUserId);
    if (mode === 'OFF') return false;
    if (mode === 'EVERYONE') return true;
    return isContact(receiverUserId, senderUserId);
}

/* ───── Requests ───── */

export interface CreateInput { userId: string; orgId: string | null; amount?: unknown; note?: unknown; kind?: unknown }

export async function createRequest(input: CreateInput) {
    if ((await getMode(input.userId)) === 'OFF') throw new TapError('Turn on Tap to receive in Settings first.', 403, 'OFF');
    const kind: 'TAP' | 'LINK' = String(input.kind ?? 'TAP').toUpperCase() === 'LINK' ? 'LINK' : 'TAP';
    let amount: number | null = null;
    if (input.amount !== undefined && input.amount !== null && input.amount !== '') {
        amount = round2(Number(input.amount));
        if (!(amount > 0)) throw new TapError('Enter an amount greater than zero, or leave it empty.', 400, 'AMOUNT');
        if (amount > MAX_AMOUNT) throw new TapError(`The most one request can ask for is K${MAX_AMOUNT.toLocaleString()}.`, 400, 'AMOUNT');
    }
    const note = String(input.note ?? '').trim().slice(0, 140) || null;

    // One live tap request at a time: a new one replaces the last.
    if (kind === 'TAP') await supabase.from('pay_requests').update({ status: 'CANCELLED' }).eq('receiver_user_id', input.userId).eq('kind', 'TAP').eq('status', 'OPEN');

    const expiresAt = new Date(Date.now() + TTL_MS[kind]).toISOString();
    for (let i = 0; i < 5; i++) {
        const code = newCode();
        const { data, error } = await supabase.from('pay_requests').insert({ code, receiver_user_id: input.userId, receiver_org_id: input.orgId, amount, note, kind, expires_at: expiresAt }).select('id, code').single();
        if (!error && data) return { id: data.id as string, code: data.code as string, url: requestUrl(data.code), amount, note, kind, expiresAt };
        if (error && error.code !== '23505') throw new TapError('Couldn’t make the request. Please try again.', 500, 'CREATE');
    }
    throw new TapError('Couldn’t make the request. Please try again.', 500, 'CREATE');
}

async function load(code: string) {
    const { data } = await supabase.from('pay_requests').select('*').eq('code', String(code ?? '').toUpperCase()).maybeSingle();
    if (!data) return null;
    if (data.status === 'OPEN' && Date.parse(data.expires_at) < Date.now()) {
        await supabase.from('pay_requests').update({ status: 'EXPIRED' }).eq('id', data.id).eq('status', 'OPEN');
        data.status = 'EXPIRED';
    }
    return data as any;
}

async function recipientFor(req: any) {
    const { data: u } = await supabase.from('users').select('id, name, username, email, organization_id').eq('id', req.receiver_user_id).maybeSingle();
    if (!u) throw NOT_AVAILABLE();
    const { data: org } = u.organization_id ? await supabase.from('organizations').select('id, name, logo_url, lenco_subaccount_id').eq('id', u.organization_id).maybeSingle() : { data: null as any };
    const orgName = org?.name || 'Personal Account';
    const personal = /workspace|personal|individual/i.test(orgName);
    return {
        id: u.id, user_id: u.id, name: u.name, username: u.username ?? null, email: null, phone: null, organization_id: u.organization_id ?? null, organization_name: orgName,
        logo_url: org?.logo_url ?? null, account_type: personal ? 'PERSONAL' : 'BUSINESS', moneywise_id: `MW-${String(u.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        lenco_subaccount_id: org?.lenco_subaccount_id ?? null, verified: true,
    };
}

/** What the paying phone shows before the person confirms. Everything that isn't allowed looks the same, so nobody can probe who accepts requests. */
export async function resolve(code: string, senderUserId: string) {
    const req = await load(code);
    if (!req) throw NOT_AVAILABLE();
    if (req.receiver_user_id === senderUserId) throw new TapError('That is your own request. Ask the other person to scan it.', 400, 'OWN');
    if (!(await allowed(req.receiver_user_id, senderUserId))) throw NOT_AVAILABLE();
    if (req.status === 'PAID') throw new TapError('This request has already been paid.', 409, 'PAID');
    if (req.status === 'CANCELLED' || req.status === 'EXPIRED') throw new TapError('This request has ended. Ask for a new one.', 410, 'EXPIRED');
    if (req.status === 'CLAIMED' && req.claimed_by_user_id !== senderUserId && Date.parse(req.claim_expires_at) > Date.now()) throw new TapError('Someone else is paying this request right now.', 409, 'IN_USE');
    return { code: req.code as string, amount: req.amount === null ? null : Number(req.amount), note: req.note as string | null, expiresAt: req.expires_at as string, recipient: await recipientFor(req) };
}

/** Reserves the request for this payer for a few minutes, so it can only be paid once. */
export async function claim(code: string, sender: { id: string; role: string }) {
    if (sender.role !== 'ADMIN') throw new TapError('Only the account holder can pay by tap. Ask them to scan it.', 403, 'ROLE');
    const view = await resolve(code, sender.id);
    const now = new Date().toISOString();
    const until = new Date(Date.now() + CLAIM_MS).toISOString();
    const { data } = await supabase.from('pay_requests')
        .update({ status: 'CLAIMED', claimed_by_user_id: sender.id, claimed_at: now, claim_expires_at: until })
        .eq('code', view.code).gt('expires_at', now)
        .or(`status.eq.OPEN,and(status.eq.CLAIMED,claimed_by_user_id.eq.${sender.id}),and(status.eq.CLAIMED,claim_expires_at.lt.${now})`)
        .select('id');
    if (!data?.length) throw new TapError('This request can’t be paid right now. Ask for a new one.', 409, 'IN_USE');
    return { ...view, claimExpiresAt: until };
}

/** Ties the payer's payment to the request, after checking it is the right payment. */
export async function attach(code: string, senderUserId: string, requisitionId: string) {
    const req = await load(code);
    if (!req || req.status !== 'CLAIMED' || req.claimed_by_user_id !== senderUserId) throw new TapError('This request is no longer yours to pay.', 409, 'CLAIM');
    if (req.requisition_id && req.requisition_id !== requisitionId) throw new TapError('This request already has a payment.', 409, 'USED');
    const { data: r } = await supabase.from('requisitions').select('id, requestor_id, estimated_total').eq('id', requisitionId).maybeSingle();
    if (!r || r.requestor_id !== senderUserId) throw new TapError('That payment isn’t yours.', 403, 'REQUISITION');
    if (req.amount !== null && Math.abs(Number(r.estimated_total) - Number(req.amount)) > 0.005) throw new TapError(`This request is for K${Number(req.amount).toFixed(2)}. The payment must be for that amount.`, 400, 'AMOUNT');
    const { error } = await supabase.from('pay_requests').update({ requisition_id: requisitionId }).eq('id', req.id);
    if (error) throw new TapError('Couldn’t link the payment. Please try again.', 500, 'ATTACH');
    return { ok: true };
}

/** For the receiver's phone: has it been paid, and by whom. The answer comes from the payment itself, never from the payer's phone. */
export async function status(id: string, receiverUserId: string) {
    const { data: req } = await supabase.from('pay_requests').select('*').eq('id', id).eq('receiver_user_id', receiverUserId).maybeSingle();
    if (!req) throw NOT_AVAILABLE();
    let state: string = req.status;
    if (state === 'OPEN' && Date.parse(req.expires_at) < Date.now()) { state = 'EXPIRED'; await supabase.from('pay_requests').update({ status: 'EXPIRED' }).eq('id', id).eq('status', 'OPEN'); }
    if (state === 'CLAIMED' && req.requisition_id) {
        const { data: r } = await supabase.from('requisitions').select('status, estimated_total').eq('id', req.requisition_id).maybeSingle();
        if (r && PAID_STATES.includes(String(r.status))) {
            state = 'PAID';
            await supabase.from('pay_requests').update({ status: 'PAID', paid_at: new Date().toISOString() }).eq('id', id).eq('status', 'CLAIMED');
        }
    }
    let payer: string | null = null; let paidAmount: number | null = null;
    if (state === 'PAID' && req.claimed_by_user_id) {
        const { data: u } = await supabase.from('users').select('name').eq('id', req.claimed_by_user_id).maybeSingle();
        payer = (u as any)?.name ?? null;
        const { data: r } = req.requisition_id ? await supabase.from('requisitions').select('estimated_total').eq('id', req.requisition_id).maybeSingle() : { data: null as any };
        paidAmount = r ? Number(r.estimated_total) : req.amount === null ? null : Number(req.amount);
    }
    return { id: req.id as string, status: state, amount: req.amount === null ? null : Number(req.amount), expiresAt: req.expires_at as string, payer, paidAmount, claimed: req.status === 'CLAIMED' };
}

export async function cancel(id: string, receiverUserId: string) {
    const { data } = await supabase.from('pay_requests').update({ status: 'CANCELLED' }).eq('id', id).eq('receiver_user_id', receiverUserId).in('status', ['OPEN', 'CLAIMED']).is('requisition_id', null).select('id');
    return { cancelled: !!data?.length };
}
