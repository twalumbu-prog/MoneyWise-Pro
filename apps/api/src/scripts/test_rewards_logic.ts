/**
 * Rewards logic (services/rewards.service.ts) against an in-memory stand-in for the database, so it can be checked without the
 * reward_* tables being applied. Covers earning, never paying a purchase twice, invites, redeeming and vouchers.
 * (test_rewards_db.ts runs the same service against the real database once migration 20261028120000 is applied.)
 */
import { supabase } from '../lib/supabase';

type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
const UNIQUE: Record<string, string[][]> = {
    reward_ledger: [['user_id', 'ref']], reward_codes: [['user_id'], ['code']], reward_referrals: [['referred_user_id']], reward_redemptions: [['code']], reward_programs: [['organization_id']],
};
const DEFAULTS: Record<string, Row> = { reward_referrals: { status: 'PENDING' }, reward_redemptions: { status: 'ISSUED' } };
let seq = 0;

class Q {
    private filters: ((r: Row) => boolean)[] = [];
    private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    private payload: any; private ord?: { c: string; asc: boolean }; private lim?: number; private wantRows = false;
    constructor(private t: string) { db[t] = db[t] ?? []; }
    select(_c?: string, _o?: any) { if (this.op === 'select') this.op = 'select'; this.wantRows = true; return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    upsert(p: any, _o?: any) { this.op = 'upsert'; this.payload = p; return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
    neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
    in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
    ilike(c: string, v: string) { this.filters.push((r) => String(r[c] ?? '').toLowerCase() === v.toLowerCase()); return this; }
    lt(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] < v); return this; }
    is(c: string, v: any) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
    not(c: string, _op: string, v: any) { this.filters.push((r) => (v === null ? r[c] != null : r[c] !== v)); return this; }
    order(c: string, o?: { ascending?: boolean }) { this.ord = { c, asc: o?.ascending !== false }; return this; }
    limit(n: number) { this.lim = n; return this; }
    private match() { return db[this.t].filter((r) => this.filters.every((f) => f(r))); }
    private run(): { data: any; error: any } {
        const rows = db[this.t];
        if (this.op === 'insert' || this.op === 'upsert') {
            const list: Row[] = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p: Row) => ({ id: p.id ?? `id${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...(DEFAULTS[this.t] ?? {}), ...p }));
            const out: Row[] = [];
            for (const n of list as Row[]) {
                const clash = (UNIQUE[this.t] ?? []).some((cols) => rows.some((r) => cols.every((c) => r[c] === n[c])));
                if (clash && this.op === 'upsert') { Object.assign(rows.find((r) => (UNIQUE[this.t] ?? []).some((cols) => cols.every((c) => r[c] === n[c])))!, n); continue; }
                if (clash) return { data: null, error: { code: '23505', message: 'duplicate key' } };
                rows.push(n); out.push(n);
            }
            return { data: this.wantRows ? out : null, error: null };
        }
        if (this.op === 'update') { const m = this.match(); m.forEach((r) => Object.assign(r, this.payload)); return { data: this.wantRows ? m : null, error: null }; }
        if (this.op === 'delete') { const m = this.match(); db[this.t] = rows.filter((r) => !m.includes(r)); return { data: null, error: null }; }
        let m = this.match();
        if (this.ord) m = [...m].sort((a, b) => (String(a[this.ord!.c]) < String(b[this.ord!.c]) ? -1 : 1) * (this.ord!.asc ? 1 : -1));
        if (this.lim) m = m.slice(0, this.lim);
        return { data: m, error: null };
    }
    maybeSingle() { const r = this.run(); return Promise.resolve({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }); }
    single() { const r = this.run(); const d = Array.isArray(r.data) ? r.data[0] : r.data; return Promise.resolve({ data: d ?? null, error: r.error ?? (d ? null : { message: 'no rows' }) }); }
    then(res: any, rej: any) { return Promise.resolve(this.run()).then(res, rej); }
}
(supabase as any).from = (t: string) => new Q(t);

import * as R from '../services/rewards.service';

const results: boolean[] = [];
const must = (c: any, m: string) => { if (!c) throw new Error(m); };
async function step(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push(true); console.log('PASS ', name); } catch (e: any) { results.push(false); console.log('FAIL ', name, '—', e.message); }
}
const refusal = async (p: Promise<any>) => { try { await p; return ''; } catch (e: any) { return String(e.message); } };
const bal = async (u: string, scope: string) => { const o = await R.getOverview(u); return (scope === 'moneywise' ? o.platform : o.businesses.find((b) => b.id === scope))?.balance ?? 0; };

async function main() {
    const set = (t: string, rows: Row[]) => { db[t] = rows; };
    set('organizations', [
        { id: 'B', name: 'Cafe B', logo_url: null, is_personal: false, public_username: 'cafeb' },
        { id: 'B2', name: 'Shop B2', logo_url: null, is_personal: false, public_username: null },
        { id: 'P1', name: 'P1 Personal', is_personal: true }, { id: 'P2', name: 'P2 Personal', is_personal: true }, { id: 'P3', name: 'P3 Personal', is_personal: true },
    ]);
    set('users', [
        { id: 'U1', name: 'Una One', email: 'una@x.com', organization_id: 'P1', payment_info: { mobile_money_number: '0971111111' }, created_at: new Date().toISOString() },
        { id: 'U2', name: 'Rey Two', email: 'rey@x.com', organization_id: 'P2', payment_info: { mobile_money_number: '0973333333' }, created_at: new Date().toISOString() },
        { id: 'U3', name: 'Fay Three', email: 'fay@x.com', organization_id: 'P3', payment_info: { mobile_money_number: '0972222222' }, created_at: new Date().toISOString() },
    ]);
    set('user_organizations', [{ user_id: 'U2', organization_id: 'B2' }]);
    set('payment_links', [{ id: 'L1', organization_id: 'B', customer_phone: '0971111111', customer_email: null, amount: 300, status: 'PAID', paid_at: '2026-10-01T10:00:00Z' }, { id: 'L2', organization_id: 'B', customer_phone: '0971111111', amount: 999, status: 'ACTIVE' }]);
    set('quick_link_payments', [
        { reference: 'R1', organization_id: 'B', payer_phone: '0971111111', created_at: '2026-10-05T10:00:00Z' },
        { reference: 'R2', organization_id: 'B', payer_phone: '0971111111', created_at: '2026-10-06T10:00:00Z' },
        { reference: 'R3', organization_id: 'B2', payer_phone: '0973333333', created_at: '2026-10-07T10:00:00Z' },
    ]);
    set('cashbook_entries', [
        { external_reference: 'R1', entry_type: 'INFLOW', debit: 250, status: 'COMPLETED' }, { external_reference: 'R2', entry_type: 'INFLOW', debit: 90, status: 'PENDING' },
        { external_reference: 'R3', entry_type: 'INFLOW', debit: 100, status: 'COMPLETED' },
    ]);

    await step('purchases are found by the payer\'s saved phone: payment links and settled quick-pay payments, not pending or unpaid ones', async () => {
        const o = await R.getOverview('U1');
        const b = o.businesses.find((x) => x.id === 'B')!;
        must(b && b.balance === 550, `expected 550 got ${b?.balance}`);
        must(b.name === 'Cafe B' && b.status === 'Silver member' && b.threshold === 500 && b.rewardReady, JSON.stringify(b));
        must(o.platform.balance === 0 && o.platform.name === 'MoneyWise', 'platform card');
    });
    await step('looking again never pays a purchase twice', async () => {
        await R.sync('U1', true); await R.sync('U1', true);
        must((await bal('U1', 'B')) === 550, 'double counted');
        must(db.reward_ledger.filter((r) => r.user_id === 'U1').length === 2, 'two ledger rows');
    });
    await step('buying from your own business earns nothing', async () => {
        must((await bal('U2', 'B2')) === 0, 'U2 belongs to B2');
    });
    await step('detail shows the points history and achievements (tier, first purchase)', async () => {
        const d = await R.getDetail('U1', 'B');
        must(d.points.length === 2 && d.points.every((p) => p.points > 0), JSON.stringify(d.points));
        const kinds = d.achievements.map((a) => a.title);
        must(kinds.includes('Silver member') && kinds.includes('First purchase'), JSON.stringify(kinds));
        must(d.program!.threshold === 500 && d.program!.pointsPerKwacha === 1, 'program');
    });
    let code = '';
    await step('redeem spends the threshold and issues a voucher; with too few points it refuses', async () => {
        const r = await R.redeem('U1', 'B');
        code = r.code;
        must(/^RW-[A-Z0-9]{6}$/.test(code) && r.balance === 50 && r.business === 'Cafe B', JSON.stringify(r));
        must((await refusal(R.redeem('U1', 'B'))).includes('You need 500 points'), 'second redeem');
        must((await bal('U1', 'B')) === 50, 'balance after');
        must((await refusal(R.redeem('U1', 'moneywise'))).includes("can't be redeemed yet"), 'platform');
    });
    await step('achievements show the voucher code until it is used', async () => {
        const d = await R.getDetail('U1', 'B');
        must(d.achievements.some((a) => a.kind === 'reward' && a.code === code && a.status === 'ISSUED'), JSON.stringify(d.achievements));
        const red = await R.getRedeemables('U1');
        must(red.vouchers.length === 1 && red.vouchers[0].code === code && red.ready.length === 0, JSON.stringify(red));
    });
    await step('only the issuing business can mark a voucher used, and only once', async () => {
        must((await refusal(R.useVoucher('B2', 'U2', code))).includes("isn't one of your rewards"), 'other org');
        const u = await R.useVoucher('B', 'U9', code);
        must(u.customer === 'Una One', JSON.stringify(u));
        must((await refusal(R.useVoucher('B', 'U9', code))).includes('already been used'), 'twice');
        const d = await R.getDetail('U1', 'B');
        must(d.achievements.find((a) => a.kind === 'reward')!.status === 'USED' && !d.achievements.find((a) => a.kind === 'reward')!.code, 'used state');
    });
    await step('a disabled programme earns and redeems nothing; settings are validated', async () => {
        await R.updateProgram('B2', { enabled: false });
        db.payment_links.push({ id: 'L9', organization_id: 'B2', customer_phone: '0971111111', amount: 100, status: 'PAID', paid_at: '2026-10-08T10:00:00Z' });
        await R.sync('U1', true);
        must((await bal('U1', 'B2')) === 0, 'disabled programme paid out');
        must((await refusal(R.updateProgram('B', { reward_threshold: 1 }))).includes('between'), 'validation');
        const p = await R.updateProgram('B', { points_per_kwacha: 2, reward_title: 'Free coffee' });
        must(p.points_per_kwacha === 2 && p.reward_title === 'Free coffee', JSON.stringify(p));
        await R.updateProgram('B', { points_per_kwacha: 1, reward_title: 'K25 off your next purchase' });
    });
    await step('MoneyWise Pay from a personal account to a business earns points; business-to-business and own business do not', async () => {
        db.requisitions = [{ id: 'RQ1', requestor_id: 'U1', organization_id: 'P1' }, { id: 'RQ2', requestor_id: 'U1', organization_id: 'B2' }];
        await R.awardMoneyWisePay({ requisitionId: 'RQ1', recipientOrgId: 'B', amount: 120.9, ref: 'MWPAY-1' });
        await R.awardMoneyWisePay({ requisitionId: 'RQ1', recipientOrgId: 'B', amount: 120.9, ref: 'MWPAY-1' });
        must((await bal('U1', 'B')) === 50 + 120, 'expected 170 (floor of 120.9, once)');
        await R.awardMoneyWisePay({ requisitionId: 'RQ2', recipientOrgId: 'B', amount: 500, ref: 'MWPAY-2' });
        await R.awardMoneyWisePay({ requisitionId: 'RQ1', recipientOrgId: 'P2', amount: 500, ref: 'MWPAY-3' });
        must((await bal('U1', 'B')) === 170 && (await bal('U1', 'P2')) === 0, 'must not pay B2B or personal recipients');
    });
    await step('invite links: business link carries the code; a business with no pay page falls back to MoneyWise', async () => {
        const a = await R.getInvite('U2', 'B'), b = await R.getInvite('U2', 'B2'), c = await R.getInvite('U2', 'moneywise');
        must(a.link.includes('/pay/cafeb?ref=' + a.code) && a.businessPage === true, a.link);
        must(b.link.includes('/login?ref=') && b.businessPage === false, b.link);
        must(c.link.includes('/login?ref=' + c.code) && c.reward.includes('200'), c.link);
        must(a.code === b.code && /^[A-Z2-9]{7}$/.test(a.code), 'one stable code per person');
        must((await refusal(R.getInvite('U2', 'P1'))).includes('Business not found'), 'personal org is not a business');
    });
    await step('a friend who pays a business through the invite earns the inviter its referral points — once, never for oneself or a returning customer', async () => {
        const c2 = (await R.getInvite('U2', 'B')).code;
        db.quick_link_payments.push(
            { reference: 'F1', organization_id: 'B', payer_phone: '0972222222', referral_code: c2, created_at: '2026-10-10T10:00:00Z' },
            { reference: 'F2', organization_id: 'B', payer_phone: '0972222222', referral_code: c2, created_at: '2026-10-11T10:00:00Z' },
            { reference: 'S1', organization_id: 'B', payer_phone: '0973333333', referral_code: c2, created_at: '2026-10-12T10:00:00Z' },
            { reference: 'X1', organization_id: 'B', payer_phone: '0971111111', referral_code: c2, created_at: '2026-10-13T10:00:00Z' },
        );
        db.cashbook_entries.push(...['F1', 'F2', 'S1', 'X1'].map((r) => ({ external_reference: r, entry_type: 'INFLOW', debit: 50, status: 'COMPLETED' })));
        await R.sync('U2', true);
        const referralPoints = () => db.reward_ledger.filter((r) => r.user_id === 'U2' && r.kind === 'REFERRAL' && r.organization_id === 'B').reduce((s, r) => s + r.points, 0);
        must(referralPoints() === 100, `expected 100 referral points got ${referralPoints()} (friend once; not self; not a returning customer)`);
        await R.sync('U2', true);
        must(referralPoints() === 100, 'paid twice');
    });
    await step('platform invite: claim a code, reward the inviter after the friend\'s first purchase, once', async () => {
        const c2 = (await R.getInvite('U2', 'moneywise')).code;
        must((await refusal(R.claimReferral('U2', c2))).includes("can't use your own"), 'self');
        must((await refusal(R.claimReferral('U3', 'NOPE123'))).includes('valid'), 'bad code');
        must((await R.claimReferral('U3', c2)).referrerName === 'Rey', 'name');
        must((await refusal(R.claimReferral('U3', c2))).includes('already added'), 'twice');
        // U3 (Fay) has not bought anything yet → nothing for U2
        db.reward_ledger = db.reward_ledger.filter((r) => r.user_id !== 'U3');
        db.quick_link_payments = db.quick_link_payments.filter((q) => q.payer_phone !== '0972222222');
        await R.sync('U2', true);
        must((await bal('U2', 'moneywise')) === 0, 'rewarded before the friend acted');
        db.payment_links.push({ id: 'L3', organization_id: 'B', customer_phone: '0972222222', amount: 80, status: 'PAID', paid_at: '2026-10-14T10:00:00Z' });
        await R.sync('U2', true); await R.sync('U2', true);
        must((await bal('U2', 'moneywise')) === 200, `expected 200 got ${await bal('U2', 'moneywise')}`);
        must(db.reward_referrals.find((r) => r.referred_user_id === 'U3')!.status === 'REWARDED', 'status');
    });
    await step('the overview lists MoneyWise first and businesses by most recent activity', async () => {
        const o = await R.getOverview('U2');
        must(o.platform.balance === 200 && o.platform.threshold === null && o.platform.isPlatform, JSON.stringify(o.platform));
        must(o.businesses.length === 1 && o.businesses[0].id === 'B', JSON.stringify(o.businesses.map((b) => b.id)));
    });

    const bad = results.filter((r) => !r).length;
    console.log(`${results.length - bad}/${results.length} passed`);
    process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
