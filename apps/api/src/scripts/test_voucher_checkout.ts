/**
 * Using a reward voucher at the store's checkout, end to end, with the REAL sale-intent handler and the real card path (Lipila itself is a stand-in:
 * no real key, no real money). Runs against the live database with a throwaway business that is removed at the end.
 * Run: npx tsx src/scripts/test_voucher_checkout.ts
 */
import crypto, { randomUUID } from 'crypto';

process.env.GATEWAY_CREDENTIALS_KEY = process.env.GATEWAY_CREDENTIALS_KEY || crypto.randomBytes(32).toString('hex');

import { supabase } from '../lib/supabase';
import * as lipila from '../services/lipila.service';
import { rewardsService, RewardsError } from '../services/rewards.service';
import { allocateDiscount } from '../services/rewardDiscount';
import { confirmBookingsForReference } from '../services/product_routing.service';
import { logPublicWalletDepositIntent } from '../controllers/lenco.controller';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const rejects = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e: any) { return e; } };

const realFetch = globalThis.fetch;
const cardCalls: any[] = [];
globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(typeof input === 'string' ? input : input?.url ?? input);
    if (!/api\.lipila\.dev|blz\.lipila\.io/.test(url)) return realFetch(input, init);
    const body = init.body ? JSON.parse(init.body) : null;
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.includes('/collections/card')) { cardCalls.push(body); return json(200, { status: 'Pending', cardRedirectionUrl: `https://checkout.example/pay/${body.collectionRequest.referenceId}`, referenceId: body.collectionRequest.referenceId }); }
    return json(404, {});
}) as any;

/** Runs the real handler with a stand-in request and response. */
const intent = async (body: Record<string, unknown>) => {
    const out: { code: number; body: any } = { code: 200, body: null };
    const res: any = { status(n: number) { out.code = n; return this; }, json(b: any) { out.body = b; return this; } };
    await logPublicWalletDepositIntent({ body, headers: {} } as any, res);
    return out;
};

(async () => {
    // ── the sharing of a discount across lines (pure)
    const L = [{ product_id: 'a', unit_price: 100, quantity: 1 }, { product_id: 'b', unit_price: 50, quantity: 2 }, { product_id: 'c', unit_price: 33.33, quantity: 3 }];
    const sh = allocateDiscount({ product_ids: [] }, L, 20);
    check('the shares add up to exactly the discount, to the ngwee', Math.round(sh.reduce((s, x) => s + x, 0) * 100) / 100 === 20, JSON.stringify(sh));
    check('only covered lines get a share', JSON.stringify(allocateDiscount({ product_ids: ['b'] }, L, 20)) === '[0,20,0]');
    check('no discount, no shares', allocateDiscount({ product_ids: [] }, L, 0).every((x) => x === 0));

    const tag = randomUUID().slice(0, 6);
    const orgs: string[] = [];
    const mkOrg = async (n: string) => { const { data, error } = await supabase.from('organizations').insert({ name: `ZZ TEST voucher ${n} ${tag}`, slug: `zz-test-voucher-${n}-${tag}` }).select('id').single(); if (error) throw error; orgs.push(data.id); return data.id as string; };
    const { data: prevRollout } = await supabase.from('app_settings').select('value, description').eq('key', 'lipila_rollout').maybeSingle();
    const refs: string[] = [];
    try {
        const A = await mkOrg('a'); const B = await mkOrg('b');
        const { data: wallet, error: we } = await supabase.from('organization_wallets').insert({ organization_id: A, name: `ZZ TEST wallet ${tag}`, is_main: true }).select('id').single();
        if (we) throw we;
        const mkProd = async (name: string, price: number, type = 'PRODUCT') => { const { data, error } = await supabase.from('products').insert({ organization_id: A, name, price, product_type: type, is_active: true }).select('id').single(); if (error) throw error; return data!.id as string; };
        const P1 = await mkProd(`ZZ ${tag} Cake`, 100); const P2 = await mkProd(`ZZ ${tag} Tea`, 40); const DON = await mkProd(`ZZ ${tag} Gift`, 0, 'DONATION');
        const { data: r20 } = await supabase.from('reward_items').insert({ organization_id: A, title: 'K20 off Cake', reward_type: 'AMOUNT_OFF', value: 20, points_cost: 100, product_ids: [P1] }).select('id').single();
        const voucher = async (org: string, status = 'ISSUED', extra: Record<string, unknown> = {}) => {
            const code = `RW-T${randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase()}`;
            const { error } = await supabase.from('reward_redemptions').insert({ user_id: randomUUID(), organization_id: org, points: 100, title: 'K20 off Cake', value: 20, code, status, reward_id: r20!.id, reward_type: 'AMOUNT_OFF', product_names: 'Cake', ...extra });
            if (error) throw error;
            return code;
        };
        const stateOf = async (code: string) => (await supabase.from('reward_redemptions').select('status, reserved_ref, reserved_until, used_at').eq('code', code).single()).data as any;
        const cart = [{ id: P1, quantity: 2 }, { id: P2, quantity: 1 }];

        // ── preview: worked out from the database's prices
        const v1 = await voucher(A);
        const pv = await rewardsService.previewVoucherForCart(A, v1.toLowerCase(), cart);
        check('preview: K20 off the cakes of an order of K240 -> K220 to pay, from the database prices', pv.discount === 20 && pv.subtotal === 240 && pv.payableSubtotal === 220, JSON.stringify(pv));
        check('preview holds nothing', (await stateOf(v1)).reserved_ref === null);
        check('preview refuses an order with a donation', ((await rejects(() => rewardsService.previewVoucherForCart(A, v1, [...cart, { id: DON, quantity: 1 }]))) as any)?.httpStatus === 409);
        check('preview refuses another business\'s code', (((await rejects(() => rewardsService.previewVoucherForCart(B, v1, cart))) as any)?.httpStatus ?? 0) >= 400);
        check('preview refuses a reward that covers nothing in the order', ((await rejects(() => rewardsService.previewVoucherForCart(A, v1, [{ id: P2, quantity: 1 }]))) as any)?.httpStatus === 409);
        const used = await voucher(A, 'USED');
        check('preview refuses a used voucher', ((await rejects(() => rewardsService.previewVoucherForCart(A, used, cart))) as any)?.httpStatus === 409);

        // ── the real sale intent, with a client number that is WRONG
        const ref1 = `LPL-ZZV-${tag}-1`; refs.push(ref1);
        const r1 = await intent({ reference: ref1, purpose: `Sale: ZZ ${tag}`, amount: 1, walletId: wallet!.id, customerName: 'Test', customerPhone: '0977000000', voucherCode: v1,
            items: [{ id: P1, quantity: 2, price: 1 }, { id: P2, quantity: 1, price: 1 }] });
        check('intent: accepted, and the answer says what the voucher took off', r1.code === 200 && r1.body?.voucher?.discount === 20 && r1.body?.voucher?.net === 220, JSON.stringify(r1));
        const { data: pend } = await supabase.from('cashbook_entries').select('debit, status').eq('organization_id', A).eq('external_reference', ref1).single();
        check('intent: the recorded sale is the SERVER\'s discounted total (K220), not the browser\'s K1', Number(pend?.debit) === 220 && pend?.status === 'PENDING', JSON.stringify(pend));
        const { data: lines } = await supabase.from('product_sales').select('product_id, quantity, amount_paid').eq('reference', ref1);
        const sum = Math.round((lines ?? []).reduce((s: number, l: any) => s + Number(l.amount_paid), 0) * 100) / 100;
        check('intent: the lines add up to the sale (K220) at database prices, not the browser\'s K1 each', sum === 220 && (lines ?? []).find((l: any) => l.product_id === P1)?.amount_paid !== undefined && Number((lines ?? []).find((l: any) => l.product_id === P1)?.amount_paid) === 180, JSON.stringify(lines));
        const held = await stateOf(v1);
        check('intent: the voucher is HELD for this payment (not used yet)', held.status === 'ISSUED' && held.reserved_ref === ref1 && new Date(held.reserved_until).getTime() > Date.now() + 30 * 60_000, JSON.stringify(held));

        // ── it cannot be taken twice
        const ref2 = `LPL-ZZV-${tag}-2`; refs.push(ref2);
        const r2 = await intent({ reference: ref2, purpose: `Sale: ZZ ${tag}`, amount: 240, walletId: wallet!.id, customerName: 'Other', customerPhone: '0977000001', voucherCode: v1, items: [{ id: P1, quantity: 2, price: 100 }, { id: P2, quantity: 1, price: 40 }] });
        check('a held voucher cannot be used by a second checkout', r2.code === 409 && /another checkout/.test(r2.body?.error ?? ''), JSON.stringify(r2));
        const { data: none2 } = await supabase.from('cashbook_entries').select('id').eq('organization_id', A).eq('external_reference', ref2);
        check('and that second checkout recorded nothing', (none2 ?? []).length === 0);
        const again = await intent({ reference: ref1, purpose: `Sale: ZZ ${tag}`, amount: 1, walletId: wallet!.id, customerName: 'Test', customerPhone: '0977000000', voucherCode: v1, items: [{ id: P1, quantity: 2, price: 1 }, { id: P2, quantity: 1, price: 1 }] });
        check('the same checkout asking again is a repeat, not a second discount', again.code === 200 && /already logged/.test(again.body?.message ?? ''));
        check('staff cannot check or use a held voucher', ((await rejects(() => rewardsService.checkVoucher(A, v1))) as any)?.httpStatus === 409 && ((await rejects(() => rewardsService.useVoucher(A, randomUUID(), v1))) as any)?.httpStatus === 409);

        // ── a cart a voucher can't be used on is refused before anything is held
        const vb = await voucher(A);
        const rb = await intent({ reference: `LPL-ZZV-${tag}-3`, purpose: 'x', amount: 5, walletId: wallet!.id, voucherCode: vb, items: [{ id: DON, quantity: 1, price: 5 }] });
        check('a donation in the cart: refused, voucher not held', rb.code === 409 && (await stateOf(vb)).reserved_ref === null, JSON.stringify(rb));
        const rbook = await intent({ reference: `LPL-ZZV-${tag}-4`, purpose: 'x', amount: 5, walletId: wallet!.id, voucherCode: vb, items: [{ id: P1, quantity: 1, price: 100, check_in: '2030-01-01', check_out: '2030-01-02' }] });
        check('a booking in the cart: refused', rbook.code === 400 && (await stateOf(vb)).reserved_ref === null);

        // ── the card path accepts exactly the voucher's discount
        const { data: o } = await supabase.from('organizations').select('id').eq('id', A).single();
        await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: { all: false, orgs: [...(prevRollout?.value?.orgs ?? []), o!.id] }, description: prevRollout?.description ?? 'Lipila card rollout', updated_at: new Date().toISOString() });
        lipila.clearRolloutCache();
        await lipila.saveCredentials(A, randomUUID(), { apiKey: 'Lsk_test_v_' + crypto.randomBytes(6).toString('hex'), env: 'sandbox', enabled: true }, null);
        const init = await lipila.initiateCard({ organizationId: A, reference: ref1, apiBase: null, context: { kind: 'store', token: wallet!.id } }).catch((e) => e);
        const g = lipila.grossUp(220);
        check('card: the discounted sale (K220) is accepted and the card is charged K220 plus the card fee', init?.charged === g.charged && cardCalls[cardCalls.length - 1]?.collectionRequest?.amount === g.charged, JSON.stringify({ init: init?.message ?? init?.charged, g }));

        // a cheat: the recorded lines say K100 for a K220 order (more than the voucher allows)
        const vc = await voucher(A);
        const ref5 = `LPL-ZZV-${tag}-5`; refs.push(ref5);
        await intent({ reference: ref5, purpose: 'x', amount: 240, walletId: wallet!.id, customerName: 'T', customerPhone: '0977000002', voucherCode: vc, items: [{ id: P1, quantity: 2, price: 100 }, { id: P2, quantity: 1, price: 40 }] });
        await supabase.from('product_sales').update({ amount_paid: 50 }).eq('reference', ref5).eq('product_id', P1);
        await supabase.from('cashbook_entries').update({ debit: 90 }).eq('organization_id', A).eq('external_reference', ref5);
        const cheat = await rejects(() => lipila.initiateCard({ organizationId: A, reference: ref5, apiBase: null, context: { kind: 'store', token: wallet!.id } }));
        check('card: paying less than price minus the voucher\'s discount is refused', (cheat as any)?.code === 'AMOUNT', String((cheat as any)?.code ?? (cheat as any)?.message));

        // ── paid: the voucher is used
        await confirmBookingsForReference(A, ref1);
        const done = await stateOf(v1);
        check('payment confirmed: the voucher is USED', done.status === 'USED' && !!done.used_at, JSON.stringify(done));
        await confirmBookingsForReference(A, ref1);
        check('confirming again changes nothing', (await stateOf(v1)).status === 'USED');
        check('the used voucher cannot be used again', ((await rejects(() => rewardsService.previewVoucherForCart(A, v1, cart))) as any)?.httpStatus === 409);
        check('a payment that held no voucher does nothing', (await rewardsService.consumeVoucherForReference(`LPL-ZZV-${tag}-none`)) === false);

        // ── released, and expiry
        const ref6 = `LPL-ZZV-${tag}-6`;
        const vd = await voucher(A);
        await rewardsService.reserveVoucher(A, vd, ref6, [{ product_id: P1, unit_price: 100, quantity: 2 }]);
        await rewardsService.releaseVoucherForReference(ref6);
        check('releasing gives the voucher back at once', (await stateOf(vd)).reserved_ref === null);
        await supabase.from('reward_redemptions').update({ reserved_ref: 'OLD', reserved_until: new Date(Date.now() - 60_000).toISOString() }).eq('code', vd);
        const re = await rewardsService.reserveVoucher(A, vd, `LPL-ZZV-${tag}-7`, [{ product_id: P1, unit_price: 100, quantity: 2 }]).catch((e) => e);
        check('a hold that has run out (abandoned payment) can be taken by the next checkout', re?.discount === 20 && (await stateOf(vd)).reserved_ref === `LPL-ZZV-${tag}-7`, String(re?.message ?? ''));
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        globalThis.fetch = realFetch;
        if (prevRollout) await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: prevRollout.value, description: prevRollout.description, updated_at: new Date().toISOString() });
        else await supabase.from('app_settings').delete().eq('key', 'lipila_rollout');
        lipila.clearRolloutCache();
        if (orgs.length) {
            await new Promise((r) => setTimeout(r, 1500));
            await supabase.from('lipila_card_sessions').delete().in('organization_id', orgs);
            await supabase.from('org_gateway_credentials').delete().in('organization_id', orgs);
            await supabase.from('product_sales').delete().in('organization_id', orgs);
            await supabase.from('reward_redemptions').delete().in('organization_id', orgs);
            await supabase.from('reward_items').delete().in('organization_id', orgs);
            const { data: je } = await supabase.from('journal_entries').select('id').in('organization_id', orgs);
            const ids = (je ?? []).map((j: any) => j.id);
            if (ids.length) await supabase.from('journal_lines').delete().in('journal_entry_id', ids);
            await supabase.from('journal_entries').delete().in('organization_id', orgs);
            await supabase.from('cashbook_entries').delete().in('organization_id', orgs);
            await supabase.from('products').delete().in('organization_id', orgs);
            await supabase.from('organization_wallets').delete().in('organization_id', orgs);
            await supabase.from('accounts').delete().in('organization_id', orgs);
            const { error: delErr } = await supabase.from('organizations').delete().in('id', orgs);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST voucher % ${tag}`);
            console.log(`cleanup: ${count ?? 0} test businesses left${delErr ? ` (${delErr.message.slice(0, 80)})` : ''}`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
