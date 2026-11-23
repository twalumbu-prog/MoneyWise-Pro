/**
 * Reward vouchers: the discount rules (pure) and checking a voucher without using it (against the live database with a throwaway business that
 * is removed at the end). Run: npx tsx src/scripts/test_reward_voucher.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { voucherDiscount } from '../services/rewardDiscount';
import { rewardsService, RewardsError } from '../services/rewards.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

const P1 = randomUUID(), P2 = randomUUID(), P3 = randomUUID();
const cart = [{ product_id: P1, unit_price: 100, quantity: 2 }, { product_id: P2, unit_price: 40, quantity: 1 }, { product_id: P3, unit_price: 10, quantity: 3 }];

(async () => {
    // ── the rules
    check('amount off: K25 off an order of K270', voucherDiscount({ reward_type: 'AMOUNT_OFF', value: 25, product_ids: [] }, cart).amount === 25);
    check('amount off is never more than the order', voucherDiscount({ reward_type: 'AMOUNT_OFF', value: 500, product_ids: [] }, cart).amount === 270);
    check('amount off only counts the covered products: K500 off P2 alone is the price of P2', voucherDiscount({ reward_type: 'AMOUNT_OFF', value: 500, product_ids: [P2] }, cart).amount === 40);
    check('percent off: 10% of the whole order', voucherDiscount({ reward_type: 'PERCENT_OFF', value: 10, product_ids: [] }, cart).amount === 27);
    check('percent off a named product: 50% of P1 (2 x K100)', voucherDiscount({ reward_type: 'PERCENT_OFF', value: 50, product_ids: [P1] }, cart).amount === 100);
    check('percent over 100 is held at 100', voucherDiscount({ reward_type: 'PERCENT_OFF', value: 250, product_ids: [P2] }, cart).amount === 40);
    check('free item: one unit of the CHEAPEST covered product', voucherDiscount({ reward_type: 'FREE_ITEM', value: 0, product_ids: [] }, cart).amount === 10);
    check('free item of a named product: one unit of P1 (K100), not both', voucherDiscount({ reward_type: 'FREE_ITEM', value: 0, product_ids: [P1] }, cart).amount === 100);
    const none = voucherDiscount({ reward_type: 'AMOUNT_OFF', value: 25, product_ids: [randomUUID()] }, cart);
    check('a reward for products not in the order takes nothing off, and says why', none.amount === 0 && /covered/.test(none.reason ?? ''));
    check('a voucher without a type is an amount off (the original reward)', voucherDiscount({ reward_type: null, value: 25, product_ids: [] }, cart).amount === 25);
    check('an empty order takes nothing off', voucherDiscount({ reward_type: 'AMOUNT_OFF', value: 25, product_ids: [] }, []).amount === 0);
    check('bad lines (zero price, zero quantity, NaN) are ignored', voucherDiscount({ reward_type: 'AMOUNT_OFF', value: 25, product_ids: [] }, [{ product_id: P1, unit_price: 0, quantity: 1 }, { product_id: P1, unit_price: 50, quantity: 0 }, { product_id: P1, unit_price: NaN, quantity: 1 }]).amount === 0);
    check('amounts are rounded to the ngwee', voucherDiscount({ reward_type: 'PERCENT_OFF', value: 33.333, product_ids: [] }, [{ product_id: P1, unit_price: 10, quantity: 1 }]).amount === 3.33);

    // ── checking a voucher (database)
    const tag = randomUUID().slice(0, 6);
    const orgs: string[] = [];
    const mkOrg = async (n: string) => { const { data, error } = await supabase.from('organizations').insert({ name: `ZZ TEST reward ${n} ${tag}`, slug: `zz-test-reward-${n}-${tag}` }).select('id').single(); if (error) throw error; orgs.push(data.id); return data.id as string; };
    try {
        const A = await mkOrg('a'); const B = await mkOrg('b');
        const { data: item, error: ie } = await supabase.from('reward_items').insert({ organization_id: A, title: '10% off Haircut', reward_type: 'PERCENT_OFF', value: 10, points_cost: 100, product_ids: [P1] }).select('id').single();
        if (ie) throw ie;
        const redemption = async (org: string, status: string, extra: Record<string, unknown> = {}) => {
            const code = `RW-T${randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase()}`;
            const { error } = await supabase.from('reward_redemptions').insert({ user_id: randomUUID(), organization_id: org, points: 100, title: '10% off Haircut', value: 10, code, status, ...extra });
            if (error) throw error;
            return code;
        };
        const good = await redemption(A, 'ISSUED', { reward_id: item!.id, reward_type: 'PERCENT_OFF', product_names: 'Haircut' });
        const r = await rewardsService.checkVoucher(A, ` ${good.toLowerCase()} `, cart);
        check('a good voucher is read (any case, spaces trimmed): title, type, what it covers', r.title === '10% off Haircut' && r.rewardType === 'PERCENT_OFF' && r.appliesTo === 'Haircut' && r.code === good);
        check('and given the order it says how much comes off (10% of P1: K20)', (r as any).discount?.amount === 20, JSON.stringify((r as any).discount));
        const after = await supabase.from('reward_redemptions').select('status, used_at').eq('code', good).single();
        check('CHECKING CHANGES NOTHING: it is still unused', after.data?.status === 'ISSUED' && !after.data?.used_at);
        const legacy = await redemption(A, 'ISSUED');
        const lr = await rewardsService.checkVoucher(A, legacy, cart);
        check('an original (untyped) voucher is an amount off the whole order', lr.rewardType === 'AMOUNT_OFF' && (lr as any).discount?.amount === 10);
        const expect = async (name: string, fn: () => Promise<unknown>, status: number, re: RegExp) => { try { await fn(); check(name, false, 'did not throw'); } catch (e: any) { check(name, e instanceof RewardsError && e.httpStatus === status && re.test(e.message), `${e?.httpStatus} ${e?.message}`); } };
        await expect('another business cannot look at it', () => rewardsService.checkVoucher(B, good), 404, /isn't one of your rewards/);
        await expect('an unknown code is refused', () => rewardsService.checkVoucher(A, 'RW-NOPE00'), 404, /isn't one of your rewards/);
        await expect('an empty code is refused', () => rewardsService.checkVoucher(A, '  '), 400, /Enter the voucher code/);
        const used = await redemption(A, 'USED');
        await expect('a used voucher is refused', () => rewardsService.checkVoucher(A, used), 409, /already been used/);
        const cancelled = await redemption(A, 'CANCELLED');
        await expect('a cancelled voucher is refused', () => rewardsService.checkVoucher(A, cancelled), 409, /no longer valid/);
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        if (orgs.length) {
            await supabase.from('reward_redemptions').delete().in('organization_id', orgs);
            await supabase.from('reward_items').delete().in('organization_id', orgs);
            await supabase.from('organizations').delete().in('id', orgs);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST reward % ${tag}`);
            console.log(`cleanup: ${count ?? 0} test businesses left`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
