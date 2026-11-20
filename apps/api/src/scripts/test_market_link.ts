/**
 * Buying on the Marketplace with mobile money or a card (a one-time payment link), and buying from a seller who has no public username. REAL order
 * code against the live database with a throwaway seller; no money moves (the link is only created and later marked paid by the test).
 * Run: npx tsx src/scripts/test_market_link.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { dollarRate } from '../services/lipila.service';
import { createOrder, quoteOrder, refreshOrder } from '../services/marketplaceOrders.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const code = async (fn: () => Promise<unknown>) => { try { await fn(); return 'OK'; } catch (e: any) { return e?.code ?? e?.message ?? 'ERR'; } };

(async () => {
    const tag = randomUUID().slice(0, 6);
    let org = '';
    try {
        // a seller with a payment account but NO public username
        const { data: o, error } = await supabase.from('organizations').insert({ name: `ZZ TEST marketlink ${tag}`, slug: `zz-test-marketlink-${tag}`, lenco_subaccount_id: randomUUID() }).select('id').single();
        if (error) throw error; org = o.id;
        const { data: w } = await supabase.from('organization_wallets').insert({ organization_id: org, name: 'Main', is_main: true }).select('id').single();
        const mk = async (name: string, price: number, extra: Record<string, unknown> = {}) => { const { data, error: e } = await supabase.from('products').insert({ organization_id: org, wallet_id: w!.id, name, price, product_type: 'PRODUCT', is_active: true, marketplace_listed: true, ...extra }).select('id').single(); if (e) throw e; return data!.id as string; };
        const { data: users } = await supabase.from('users').select('id, name, organization_id').not('organization_id', 'is', null).neq('organization_id', org).limit(1);
        const buyer = { userId: users![0].id as string, orgId: users![0].organization_id as string, role: 'MEMBER', name: 'Test Buyer' };

        const P = await mk(`ZZ ${tag} Cake`, 100);
        const q: any = await quoteOrder(buyer, { productId: P });
        check('a seller with no public username can be bought from in the app', q.supported === true, String(q.unsupportedReason));

        // ── pay with mobile money or card
        const phone = '0971234567';
        check('a bad phone number is refused before anything is created', await code(() => createOrder(buyer, { productId: P, payVia: 'LINK', phone: '123', idempotencyKey: `k-${tag}-bad` })) === 'PHONE');
        check('Opus Delivery can\'t be paid by link (it is a wallet transfer)', await code(() => createOrder(buyer, { productId: P, payVia: 'LINK', phone, deliveryMethod: 'OPUS', area: 'Lusaka CBD', address: 'x', idempotencyKey: `k-${tag}-opus` })) !== 'OK');
        check('Pay in 4 can\'t be combined with a link', await code(() => createOrder(buyer, { productId: P, payVia: 'LINK', phone, payLater: true, idempotencyKey: `k-${tag}-pl` })) === 'LINK_NOT_ALLOWED');

        const r: any = await createOrder(buyer, { productId: P, payVia: 'LINK', phone, idempotencyKey: `k-${tag}-1` });
        check('the order waits for payment and hands back a payment page', r.order.status === 'PENDING_PAYMENT' && r.order.payment_method === 'LINK' && !!r.paymentLinkToken && r.order.payment_link_token === r.paymentLinkToken, JSON.stringify({ s: r.order.status, t: !!r.paymentLinkToken }));
        const { data: link } = await supabase.from('payment_links').select('amount, status, customer_phone, wallet_id, product_id, organization_id').eq('token', r.paymentLinkToken).single();
        check('the link is for exactly the order total, to the seller\'s wallet, and active', Number(link?.amount) === 100 && link?.status === 'ACTIVE' && link?.wallet_id === w!.id && link?.organization_id === org && link?.customer_phone === phone, JSON.stringify(link));
        const again: any = await createOrder(buyer, { productId: P, payVia: 'LINK', phone, idempotencyKey: `k-${tag}-1` });
        check('asking again with the same key returns the same order and page, not a second one', again.repeated === true && again.paymentLinkToken === r.paymentLinkToken);
        const fresh = await refreshOrder(r.order);
        check('an unpaid order stays as it is', fresh.status === 'PENDING_PAYMENT');
        await supabase.from('payment_links').update({ status: 'PAID' }).eq('token', r.paymentLinkToken);
        const paid = await refreshOrder(r.order);
        check('once the link is paid the order is PAID, with a time', paid.status === 'PAID' && !!paid.paid_at, JSON.stringify({ s: paid.status }));
        check('refreshing again changes nothing', (await refreshOrder(paid)).status === 'PAID');

        // ── given up on: the order is cancelled and the stock goes back
        const S = await mk(`ZZ ${tag} Mug`, 20, { track_stock: true, stock_quantity: 5 });
        const r2: any = await createOrder(buyer, { productId: S, payVia: 'LINK', phone, quantity: 2, idempotencyKey: `k-${tag}-2` });
        const stockOf = async () => Number((await supabase.from('products').select('stock_quantity').eq('id', S).single()).data?.stock_quantity);
        check('placing the order holds the stock (5 to 3)', r2.order.quantity === 2 && (await stockOf()) === 3, String(await stockOf()));
        await supabase.from('marketplace_orders').update({ created_at: new Date(Date.now() - 3 * 3_600_000).toISOString() }).eq('id', r2.order.id);
        const { data: aged } = await supabase.from('marketplace_orders').select('*').eq('id', r2.order.id).single();
        const gone = await refreshOrder(aged);
        const { data: l2 } = await supabase.from('payment_links').select('status').eq('token', r2.paymentLinkToken).single();
        check('an order unpaid after 2 hours is cancelled, its link closed, and the stock returned', gone.status === 'FAILED' && l2?.status === 'CANCELLED' && (await stockOf()) === 5, JSON.stringify({ s: gone.status, l: l2?.status, stock: await stockOf() }));

        // ── a dollar item with nothing added is charged to a card in dollars
        const rate = await dollarRate().catch(() => 0);
        if (rate > 0) {
            const U = await mk(`ZZ ${tag} Course`, 50, { currency: 'USD' });
            const r3: any = await createOrder(buyer, { productId: U, payVia: 'LINK', phone, idempotencyKey: `k-${tag}-3` });
            const { data: l3 } = await supabase.from('payment_links').select('currency, foreign_amount, amount').eq('token', r3.paymentLinkToken).single();
            check('a dollar item gets a dollar payment page ($50, with the kwacha equivalent)', l3?.currency === 'USD' && Number(l3?.foreign_amount) === 50 && Number(l3?.amount) === 50 * rate, JSON.stringify(l3));
        }
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        if (org) {
            await supabase.from('marketplace_orders').delete().eq('seller_org_id', org);
            await supabase.from('payment_links').delete().eq('organization_id', org);
            await supabase.from('products').delete().eq('organization_id', org);
            await supabase.from('organization_wallets').delete().eq('organization_id', org);
            const { error: delErr } = await supabase.from('organizations').delete().eq('id', org);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST marketlink ${tag}`);
            console.log(`cleanup: ${count ?? 0} test businesses left${delErr ? ` (${delErr.message.slice(0, 80)})` : ''}`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
