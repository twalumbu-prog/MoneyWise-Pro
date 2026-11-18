import { supabase } from '../lib/supabase';
import { payLinkService, PayLinkError } from './payLink.service';
import { notifyUser } from './marketplaceNotify';

/**
 * Pay in 4. A buyer whose MoneyWise history qualifies splits a Marketplace order into four interest-free instalments: the first at
 * checkout, then every two weeks. MoneyWise pays the seller the full amount up front and collects the instalments.
 *
 * Eligibility and the limit come only from the buyer's own MoneyWise data: how long they have been active, how much and how steadily
 * money comes into their wallet, and how they have repaid earlier plans. There is no credit bureau check.
 *
 * It only lends once a funding account is set (PAYLATER_ORG_USERNAME, PAYLATER_ORG_ID, PAYLATER_ADMIN_USER_ID). Until then eligibility
 * is shown but the option stays "coming soon".
 */

export const INSTALMENTS = 4;
export const GAP_DAYS = 14;
export const MIN_ORDER = 40;
const START_CAP = 1500;
const CAP_STEP = 500;
const MAX_CAP = 5000;
const MIN_ACCOUNT_AGE_DAYS = 60;
const MIN_INFLOW_90D = 600;
const MIN_DEPOSIT_MONTHS = 2;
const MIN_SCORE = 40;
const MONTHLY_INFLOW_SHARE = 0.3;
const DEFAULT_AFTER_LATE_DAYS = 14;
const IN_FLOW_STATUSES = ['COMPLETED', 'ACCOUNTED', 'UNACCOUNTED'];

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().split('T')[0];
const money = (n: number) => `K${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** One-off fee on an instalment that is more than a day late: 5%, at least K10, at most K50. */
export const lateFeeFor = (amount: number) => round2(Math.min(50, Math.max(10, amount * 0.05)));

export class PayLaterError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'INVALID') { super(message); }
}

interface Funder { orgId: string; username: string; userId: string }
export async function funder(): Promise<Funder | null> {
    const username = String(process.env.PAYLATER_ORG_USERNAME ?? '').trim().replace(/^@/, '');
    const orgId = String(process.env.PAYLATER_ORG_ID ?? '').trim();
    const userId = String(process.env.PAYLATER_ADMIN_USER_ID ?? '').trim();
    if (!username || !orgId || !userId) return null;
    const { data } = await supabase.from('organizations').select('id, lenco_subaccount_id').eq('id', orgId).maybeSingle();
    return data?.lenco_subaccount_id ? { orgId, username, userId } : null;
}

/** Four near-equal instalments; the first is due now, the rest every two weeks. Cents left over go on the first. */
export function schedule(total: number, from = Date.now()): { seq: number; amount: number; dueDate: string }[] {
    const cents = Math.round(total * 100);
    const each = Math.floor(cents / INSTALMENTS);
    return Array.from({ length: INSTALMENTS }, (_, i) => ({
        seq: i + 1, amount: (each + (i === 0 ? cents - each * INSTALMENTS : 0)) / 100, dueDate: isoDay(from + i * GAP_DAYS * DAY),
    }));
}

export interface Eligibility {
    eligible: boolean;
    score: number;
    limit: number;
    available: number;
    reasons: string[];
    stats: { accountAgeDays: number; inflow90d: number; depositMonths: number; averageMonthlyInflow: number; completedPlans: number; latePayments: number };
}

/** Works out whether this buyer qualifies, how much they can owe at once, and why not when they don't. Reads only; changes nothing. */
export async function assess(userId: string, orgId: string): Promise<Eligibility> {
    const since = isoDay(Date.now() - 90 * DAY);
    const [{ data: org }, { data: first }, { data: inflows }, { data: plans }] = await Promise.all([
        supabase.from('organizations').select('created_at').eq('id', orgId).maybeSingle(),
        supabase.from('cashbook_entries').select('date').eq('organization_id', orgId).order('date', { ascending: true }).limit(1),
        supabase.from('cashbook_entries').select('date, debit').eq('organization_id', orgId).eq('account_type', 'MONEYWISE_WALLET')
            .eq('entry_type', 'INFLOW').in('status', IN_FLOW_STATUSES).gte('date', since).limit(5000),
        supabase.from('pay_later_plans').select('id, status').eq('buyer_user_id', userId),
    ]);

    const startedAt = Math.min(...[org?.created_at, first?.[0]?.date].filter(Boolean).map((d: any) => Date.parse(d)), Date.now());
    const accountAgeDays = Math.floor((Date.now() - startedAt) / DAY);
    const rows = (inflows ?? []) as { date: string; debit: number }[];
    const inflow90d = round2(rows.reduce((s, r) => s + Number(r.debit || 0), 0));
    const depositMonths = new Set(rows.filter((r) => Number(r.debit) > 0).map((r) => String(r.date).slice(0, 7))).size;
    const averageMonthlyInflow = round2(inflow90d / 3);

    const planIds = (plans ?? []).map((p: any) => p.id);
    const { data: inst } = planIds.length
        ? await supabase.from('pay_later_instalments').select('plan_id, amount, status, late_fee, paid_at, due_date').in('plan_id', planIds)
        : { data: [] as any[] };
    const completedPlans = (plans ?? []).filter((p: any) => p.status === 'COMPLETED').length;
    const defaulted = (plans ?? []).some((p: any) => p.status === 'DEFAULTED');
    const latePayments = (inst ?? []).filter((i: any) => Number(i.late_fee) > 0 || i.status === 'LATE').length;
    const overdue = (inst ?? []).some((i: any) => i.status === 'LATE');
    const outstanding = round2((inst ?? []).filter((i: any) => i.status !== 'PAID').reduce((s: number, i: any) => s + Number(i.amount), 0));

    const reasons: string[] = [];
    if (defaulted) reasons.push('An earlier Pay in 4 plan wasn’t repaid.');
    if (overdue) reasons.push('You have an overdue instalment. Pay it to unlock Pay in 4 again.');
    if (accountAgeDays < MIN_ACCOUNT_AGE_DAYS) reasons.push(`Your account needs to be ${MIN_ACCOUNT_AGE_DAYS} days old (it’s ${accountAgeDays}).`);
    if (depositMonths < MIN_DEPOSIT_MONTHS) reasons.push(`Money needs to come into your wallet in at least ${MIN_DEPOSIT_MONTHS} of the last 3 months (it did in ${depositMonths}).`);
    if (inflow90d < MIN_INFLOW_90D) reasons.push(`Deposits over the last 3 months need to reach ${money(MIN_INFLOW_90D)} (they’re ${money(inflow90d)}).`);

    const score = Math.max(0, Math.min(100, Math.round(
        Math.min(accountAgeDays / 180, 1) * 25 + Math.min(depositMonths / 3, 1) * 25 + Math.min(averageMonthlyInflow / 5000, 1) * 30
        + Math.min(completedPlans, 2) * 10 - latePayments * 10 - (defaulted ? 100 : 0),
    )));
    if (reasons.length === 0 && score < MIN_SCORE) reasons.push('Your activity score isn’t high enough yet. Keep using your wallet and check back.');

    const cap = Math.min(MAX_CAP, START_CAP + CAP_STEP * completedPlans);
    const limit = Math.floor(Math.min(cap, averageMonthlyInflow * MONTHLY_INFLOW_SHARE) / 50) * 50;
    if (reasons.length === 0 && limit < MIN_ORDER) reasons.push('Your limit would be below the smallest order Pay in 4 supports.');

    const eligible = reasons.length === 0;
    return {
        eligible, score, limit: eligible ? limit : 0, available: eligible ? Math.max(0, round2(limit - outstanding)) : 0, reasons,
        stats: { accountAgeDays, inflow90d, depositMonths, averageMonthlyInflow, completedPlans, latePayments },
    };
}

export interface Offer extends Eligibility {
    /** False until a funding account is set up: the option shows as coming soon. */
    enabled: boolean; instalments: number; gapDays: number; minOrder: number; lateFee: string;
}
export async function offerFor(userId: string, orgId: string): Promise<Offer> {
    const [e, f] = await Promise.all([assess(userId, orgId), funder()]);
    return { ...e, enabled: !!f, instalments: INSTALMENTS, gapDays: GAP_DAYS, minOrder: MIN_ORDER, lateFee: '5% of the instalment, K10 to K50, once' };
}

/** Throws unless this buyer may take a plan for `total`. Returns the funder. */
export async function assertCanBorrow(userId: string, orgId: string, total: number): Promise<Funder> {
    const f = await funder();
    if (!f) throw new PayLaterError('Pay in 4 isn’t available yet.', 409, 'NOT_ENABLED');
    if (total < MIN_ORDER) throw new PayLaterError(`Pay in 4 starts at ${money(MIN_ORDER)}.`, 400, 'TOO_SMALL');
    const e = await assess(userId, orgId);
    if (!e.eligible) throw new PayLaterError(e.reasons[0] ?? 'You don’t qualify for Pay in 4 yet.', 403, 'NOT_ELIGIBLE');
    if (total > e.available + 0.005) throw new PayLaterError(`Your Pay in 4 limit has ${money(e.available)} left, and this order is ${money(total)}.`, 402, 'OVER_LIMIT');
    return f;
}

const todayOf = () => isoDay(Date.now());
const ctxFor = (organizationId: string, userId: string) => ({ organizationId, userId, role: 'ADMIN', today: todayOf() });

/**
 * Runs the money for a new plan: the buyer pays the first instalment to MoneyWise, then MoneyWise pays the seller the whole total.
 * If paying the seller fails, the first instalment is sent straight back so the buyer isn't out of pocket.
 */
export async function fundOrder(p: {
    f: Funder; buyerUserId: string; buyerOrgId: string; sellerUsername: string; total: number; first: number; walletId: string; label: string;
}) {
    const { data: buyerOrg } = await supabase.from('organizations').select('public_username, lenco_subaccount_id').eq('id', p.buyerOrgId).maybeSingle();
    if (!buyerOrg?.public_username || !buyerOrg.lenco_subaccount_id) throw new PayLaterError('Set a MoneyWise username on your account to use Pay in 4.', 409, 'NO_USERNAME');

    await payLinkService.payWithWallet(ctxFor(p.buyerOrgId, p.buyerUserId), { username: p.f.username, amount: p.first, purpose: `Pay in 4 · ${p.label} · 1 of ${INSTALMENTS}`, walletId: p.walletId });
    try {
        return await payLinkService.payWithWallet(ctxFor(p.f.orgId, p.f.userId), { username: p.sellerUsername, amount: p.total, purpose: `${p.label} · Marketplace order (Pay in 4)` });
    } catch (e) {
        try {
            await payLinkService.payWithWallet(ctxFor(p.f.orgId, p.f.userId), { username: buyerOrg.public_username, amount: p.first, purpose: `Refund · ${p.label}` });
        } catch (r) { console.error('[PayLater] could not return the first instalment', r); }
        if (e instanceof PayLinkError) throw new PayLaterError(`${e.message} Your first instalment was returned.`, e.httpStatus, e.code);
        throw e;
    }
}

/** Records the plan once the money has moved. The first instalment is already paid. */
export async function recordPlan(p: { orderId: string; buyerUserId: string; buyerOrgId: string; sellerOrgId: string; description: string; total: number; reference: string | null }) {
    const { data: plan, error } = await supabase.from('pay_later_plans').insert({
        order_id: p.orderId, buyer_user_id: p.buyerUserId, buyer_org_id: p.buyerOrgId, seller_org_id: p.sellerOrgId, description: p.description, principal: p.total,
    }).select('*').single();
    if (error) throw error;
    const rows = schedule(p.total).map((i) => ({
        plan_id: plan.id, seq: i.seq, amount: i.amount, due_date: i.dueDate,
        ...(i.seq === 1 ? { status: 'PAID', paid_at: new Date().toISOString(), payment_reference: p.reference } : {}),
    }));
    const { error: e2 } = await supabase.from('pay_later_instalments').insert(rows);
    if (e2) throw e2;
    return plan;
}

/** Pays one instalment (and its late fee, if any) from the buyer's wallet to MoneyWise. */
export async function payInstalment(instalmentId: string, who: { userId: string; orgId?: string }, walletId?: string, auto = false) {
    const { data: i } = await supabase.from('pay_later_instalments').select('*, pay_later_plans(*)').eq('id', instalmentId).maybeSingle();
    const plan = (i as any)?.pay_later_plans;
    if (!i || !plan || plan.buyer_user_id !== who.userId) throw new PayLaterError('Instalment not found.', 404, 'NOT_FOUND');
    if (i.status === 'PAID') throw new PayLaterError('This instalment is already paid.', 409, 'PAID');
    const f = await funder();
    if (!f) throw new PayLaterError('Pay in 4 payments are paused. Try again soon.', 409, 'NOT_ENABLED');

    const amount = round2(Number(i.amount) + Number(i.late_fee));
    const wallets = await payLinkService.payerWallets(plan.buyer_org_id);
    const wallet = walletId ? wallets.find((w) => w.id === walletId) : wallets.find((w) => w.is_main) ?? wallets[0];
    if (!wallet || wallet.balance + 0.005 < amount) throw new PayLaterError(`${wallet?.name ?? 'Your wallet'} has ${money(wallet?.balance ?? 0)} but this instalment is ${money(amount)}.`, 402, 'INSUFFICIENT');

    // Claim it so a double click or the auto-collector can't take it twice.
    const stale = new Date(Date.now() - 3 * 60_000).toISOString();
    const { data: claimed } = await supabase.from('pay_later_instalments').update({ processing_at: new Date().toISOString() })
        .eq('id', instalmentId).neq('status', 'PAID').or(`processing_at.is.null,processing_at.lt.${stale}`).select('id').maybeSingle();
    if (!claimed) throw new PayLaterError('This instalment is being paid right now.', 409, 'IN_PROGRESS');
    try {
        const r = await payLinkService.payWithWallet(ctxFor(plan.buyer_org_id, plan.buyer_user_id), {
            username: f.username, amount, purpose: `Pay in 4 · ${plan.description} · ${i.seq} of ${INSTALMENTS}`, walletId: wallet.id,
        });
        await supabase.from('pay_later_instalments').update({ status: 'PAID', paid_at: new Date().toISOString(), payment_reference: r.reference, processing_at: null }).eq('id', instalmentId);
        const { count } = await supabase.from('pay_later_instalments').select('id', { count: 'exact', head: true }).eq('plan_id', plan.id).neq('status', 'PAID');
        if ((count ?? 0) === 0) {
            await supabase.from('pay_later_plans').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('id', plan.id);
            void notifyUser(plan.buyer_user_id, { title: 'Pay in 4 complete', path: '/marketplace/pay-later', body: `${plan.description} is fully paid. Your limit just went up.` });
        } else if (!auto) {
            void notifyUser(plan.buyer_user_id, { title: 'Instalment paid', path: '/marketplace/pay-later', body: `${money(amount)} paid for ${plan.description}.` });
        }
        return { ok: true, amount };
    } catch (e) {
        await supabase.from('pay_later_instalments').update({ processing_at: null }).eq('id', instalmentId);
        if (e instanceof PayLinkError) throw new PayLaterError(e.message, e.httpStatus, e.code);
        throw e;
    }
}

/** The buyer's plans with their instalments, soonest due first. */
export async function myPlans(userId: string) {
    const { data: plans } = await supabase.from('pay_later_plans').select('*').eq('buyer_user_id', userId).order('created_at', { ascending: false }).limit(50);
    const ids = (plans ?? []).map((p: any) => p.id);
    const { data: inst } = ids.length ? await supabase.from('pay_later_instalments').select('*').in('plan_id', ids).order('seq') : { data: [] as any[] };
    return (plans ?? []).map((p: any) => ({ ...p, instalments: (inst ?? []).filter((i: any) => i.plan_id === p.id) }));
}

/**
 * Run by the scheduler. Reminds buyers two days ahead, takes instalments from their wallet on the due date when the money is there,
 * adds the late fee to anything more than a day overdue, and marks a plan defaulted after two weeks late (which closes Pay in 4 for them).
 */
export async function sweepPayLater(): Promise<{ reminded: number; collected: number; late: number; defaulted: number }> {
    const out = { reminded: 0, collected: 0, late: 0, defaulted: 0 };
    if (!(await funder())) return out;
    const today = todayOf();
    const { data: due } = await supabase.from('pay_later_instalments').select('*, pay_later_plans(*)').in('status', ['PENDING', 'LATE']).lte('due_date', isoDay(Date.now() + 2 * DAY)).limit(200);

    for (const i of (due ?? []) as any[]) {
        const plan = i.pay_later_plans;
        if (!plan || plan.status !== 'ACTIVE') continue;

        if (i.due_date > today) {
            if (!i.reminder_sent_at) {
                await supabase.from('pay_later_instalments').update({ reminder_sent_at: new Date().toISOString() }).eq('id', i.id);
                void notifyUser(plan.buyer_user_id, { title: 'Instalment due soon', path: '/marketplace/pay-later', body: `${money(Number(i.amount))} for ${plan.description} is due on ${i.due_date}. We’ll take it from your wallet if the money is there.` });
                out.reminded++;
            }
            continue;
        }

        try {
            await payInstalment(i.id, { userId: plan.buyer_user_id }, undefined, true);
            out.collected++;
            continue;
        } catch { /* not enough in the wallet, or already being paid: handled as late below */ }

        const daysLate = Math.floor((Date.parse(today) - Date.parse(i.due_date)) / DAY);
        if (daysLate >= 1 && i.status !== 'LATE') {
            await supabase.from('pay_later_instalments').update({ status: 'LATE', late_fee: lateFeeFor(Number(i.amount)) }).eq('id', i.id);
            void notifyUser(plan.buyer_user_id, { title: 'Instalment overdue', path: '/marketplace/pay-later', body: `${money(Number(i.amount))} for ${plan.description} is overdue. A ${money(lateFeeFor(Number(i.amount)))} late fee was added. Pay it to keep Pay in 4.` });
            out.late++;
        }
        if (daysLate >= DEFAULT_AFTER_LATE_DAYS) {
            await supabase.from('pay_later_plans').update({ status: 'DEFAULTED', defaulted_at: new Date().toISOString() }).eq('id', plan.id).eq('status', 'ACTIVE');
            void notifyUser(plan.buyer_user_id, { title: 'Pay in 4 plan closed', path: '/marketplace/pay-later', body: `${plan.description} wasn’t repaid in time. Pay in 4 is paused on your account until it is cleared.` });
            out.defaulted++;
        }
    }
    return out;
}
