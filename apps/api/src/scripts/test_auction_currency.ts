/**
 * Auctions in the product's currency, bidders visible to the seller, and turning an auction off. The REAL handlers and services against the live
 * database with a throwaway business and made-up bidders, all removed at the end.
 * Run: npx tsx src/scripts/test_auction_currency.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { dollarRate, usdToZmw } from '../services/lipila.service';
import { createAuction, cancelAuction, placeBid, getAuctionBids, getMarketplaceListings } from '../controllers/marketplace.controller';
import { settleDueAuctions, followProductCurrency } from '../services/marketplace.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

const call = async (fn: any, req: any) => {
    const out: { code: number; body: any } = { code: 200, body: null };
    const res: any = { status(n: number) { out.code = n; return this; }, json(b: any) { out.body = b; return this; } };
    await fn(req, res);
    return out;
};

(async () => {
    const tag = randomUUID().slice(0, 6);
    let org = '';
    const bidders: string[] = [];
    try {
        const rate = await dollarRate().catch(() => 0);
        if (!(rate > 0)) { console.log('skipped: no dollar rate is set'); return; }
        const { data: o, error } = await supabase.from('organizations').insert({ name: `ZZ TEST auction ${tag}`, slug: `zz-test-auction-${tag}`, public_username: `zzauc${tag}`, lenco_subaccount_id: randomUUID() }).select('id').single();
        if (error) throw error; org = o.id;
        const { data: w } = await supabase.from('organization_wallets').insert({ organization_id: org, name: 'Main', is_main: true }).select('id').single();
        const mk = async (name: string, price: number, currency: 'USD' | 'ZMW') => { const { data, error: e } = await supabase.from('products').insert({ organization_id: org, wallet_id: w!.id, name, price, currency, product_type: 'PRODUCT', is_active: true, marketplace_listed: true }).select('id').single(); if (e) throw e; return data!.id as string; };
        // created_by must be a real account (a foreign key); the person is only named on the rows, nothing of theirs is changed
        const { data: anyUser } = await supabase.from('users').select('id').limit(1).single();
        const seller = { id: anyUser!.id as string, organization_id: org, role: 'ADMIN' };
        const bidder = (name: string) => { const id = randomUUID(); bidders.push(id); return { id, organization_id: null, role: 'MEMBER', name }; };
        const start = (productId: string, body: any = {}) => call(createAuction, { user: seller, body: { productId, startPrice: 50, durationHours: 24, bidIncrement: 5, ...body } });

        // ── a dollar product is auctioned in dollars
        const D = await mk(`ZZ ${tag} Course`, 100, 'USD');
        const r1 = await start(D);
        check('an auction on a dollar product is created in dollars', r1.code === 201 && r1.body?.currency === 'USD', JSON.stringify(r1.body));
        const { data: row } = await supabase.from('marketplace_auctions').select('currency, start_price').eq('id', r1.body.id).single();
        check('and stored in dollars, with the amounts as typed ($50 start)', row?.currency === 'USD' && Number(row?.start_price) === 50);
        const lst = await call(getMarketplaceListings, { user: { id: seller.id, organization_id: org } });
        const view = (lst.body?.listings ?? []).find((l: any) => l.id === D)?.auction;
        check('the Marketplace listing says the auction is in dollars', view?.currency === 'USD' && view?.startPrice === 50, JSON.stringify(view && { c: view.currency, s: view.startPrice }));

        // ── bids and who can see them
        const b1 = bidder('Mwila Banda'), b2 = bidder('Chanda Mumba');
        const bid = (u: any, amount: number, phone: string) => call(placeBid, { user: u, params: { id: r1.body.id }, body: { amount, phone } });
        const x = await bid(b1, 55, '0971111111');
        check('a bid is accepted', x.code === 201, JSON.stringify(x.body));
        const low = await bid(b2, 56, '0972222222');
        check('a bid under the minimum is refused with the amount in DOLLARS', low.code === 409 && /\$60\.00/.test(low.body?.error ?? ''), low.body?.error);
        await bid(b2, 70, '0972222222');
        // (the made-up bidders have no account name, so give each bid the name the real bidder would have had)
        await supabase.from('marketplace_bids').update({ bidder_name: 'Mwila Banda' }).eq('auction_id', r1.body.id).eq('bidder_user_id', b1.id);
        await supabase.from('marketplace_bids').update({ bidder_name: 'Chanda Mumba' }).eq('auction_id', r1.body.id).eq('bidder_user_id', b2.id);
        const seen = await call(getAuctionBids, { user: seller, params: { id: r1.body.id } });
        check('the seller sees every bidder\'s full name, their number and their bid, highest first', seen.body?.isSeller === true && seen.body.bids[0]?.bidder === 'Chanda Mumba' && seen.body.bids[0]?.phone === '0972222222' && seen.body.bids[0]?.amount === 70 && seen.body.bids[1]?.bidder === 'Mwila Banda', JSON.stringify(seen.body?.bids));
        check('and the bid history says it is in dollars', seen.body?.currency === 'USD');
        const stranger = await call(getAuctionBids, { user: bidder('Someone Else'), params: { id: r1.body.id } });
        check('a stranger sees only masked names and no phone numbers', stranger.body?.isSeller === false && stranger.body.bids.every((b: any) => /\*\*\*/.test(b.bidder) && b.phone === undefined), JSON.stringify(stranger.body?.bids));

        // ── turning it off
        const noConfirm = await call(cancelAuction, { user: seller, params: { id: r1.body.id }, body: {} });
        check('turning off an auction that has bids asks for confirmation first, and nothing changes', noConfirm.code === 409 && noConfirm.body?.needsConfirm === true && noConfirm.body?.bids === 2);
        check('a currency change on an auction with bids is blocked', (await followProductCurrency(D, 'ZMW')) === 'BLOCKED');
        const off = await call(cancelAuction, { user: seller, params: { id: r1.body.id }, body: { confirm: true } });
        const { data: after } = await supabase.from('marketplace_auctions').select('status').eq('id', r1.body.id).single();
        check('confirmed, it ends, and the two bidders are counted as told', off.code === 200 && off.body?.notified === 2 && after?.status === 'CANCELLED', JSON.stringify(off.body));
        const lst2 = await call(getMarketplaceListings, { user: { id: seller.id, organization_id: org } });
        check('the item is a plain buy-now listing again (no auction)', (lst2.body?.listings ?? []).find((l: any) => l.id === D)?.auction === null);
        const again = await start(D);
        check('and a new auction can be started later', again.code === 201);
        await call(cancelAuction, { user: seller, params: { id: again.body.id }, body: {} });

        // ── a kwacha product stays in kwacha; the auction follows a currency change when it has no bids
        const K = await mk(`ZZ ${tag} Cake`, 400, 'ZMW');
        const r2 = await start(K, { startPrice: 270, bidIncrement: 10, buyNowPrice: 900 });
        check('a kwacha product is auctioned in kwacha', r2.body?.currency === 'ZMW');
        check('changing the product to dollars converts a bid-free auction at today\'s rate', (await followProductCurrency(K, 'USD')) === 'CONVERTED');
        const { data: conv } = await supabase.from('marketplace_auctions').select('currency, start_price, buy_now_price, bid_increment').eq('id', r2.body.id).single();
        check('its amounts are now dollars ($' + (270 / rate).toFixed(2) + ' start)', conv?.currency === 'USD' && Math.abs(Number(conv?.start_price) - 270 / rate) < 0.01 && Math.abs(Number(conv?.buy_now_price) - 900 / rate) < 0.01 && Number(conv?.bid_increment) >= 0.5, JSON.stringify(conv));
        await call(cancelAuction, { user: seller, params: { id: r2.body.id }, body: {} });

        // ── a won dollar auction is paid through a dollar link
        const W = await mk(`ZZ ${tag} Ebook`, 40, 'USD');
        const r3 = await start(W, { startPrice: 20, bidIncrement: 1 });
        const winner = bidder('Winner Person');
        await call(placeBid, { user: winner, params: { id: r3.body.id }, body: { amount: 30, phone: '0973333333' } });
        await supabase.from('marketplace_auctions').update({ ends_at: new Date(Date.now() - 1000).toISOString() }).eq('id', r3.body.id);
        await settleDueAuctions();
        const { data: sold } = await supabase.from('marketplace_auctions').select('status, winning_amount, payment_link_token, currency').eq('id', r3.body.id).single();
        check('the auction closes with the winner at $30', sold?.status === 'SOLD' && Number(sold?.winning_amount) === 30 && sold?.currency === 'USD', JSON.stringify(sold));
        const { data: link } = await supabase.from('payment_links').select('currency, foreign_amount, amount').eq('token', sold!.payment_link_token).single();
        check('the winner\'s payment link is a DOLLAR link: $30, with the kwacha equivalent', link?.currency === 'USD' && Number(link?.foreign_amount) === 30 && Number(link?.amount) === usdToZmw(30, rate), JSON.stringify(link));
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        if (org) {
            const { data: aucs } = await supabase.from('marketplace_auctions').select('id').eq('organization_id', org);
            const ids = (aucs ?? []).map((a: any) => a.id);
            if (ids.length) await supabase.from('marketplace_bids').delete().in('auction_id', ids);
            await supabase.from('payment_links').delete().eq('organization_id', org);
            await supabase.from('marketplace_auctions').delete().eq('organization_id', org);
            if (bidders.length) await supabase.from('notifications').delete().in('user_id', bidders);
            await supabase.from('products').delete().eq('organization_id', org);
            await supabase.from('organization_wallets').delete().eq('organization_id', org);
            const { error: delErr } = await supabase.from('organizations').delete().eq('id', org);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST auction ${tag}`);
            console.log(`cleanup: ${count ?? 0} test businesses left${delErr ? ` (${delErr.message.slice(0, 80)})` : ''}`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
