/**
 * Phase 2 check against the live tables: requests for quote. Uses throwaway businesses with no admins (so nobody real is notified)
 * and removes everything it made. Run: npx tsx src/scripts/test_rfq.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { compare, saveItem } from '../services/priceCompare.service';
import * as rfq from '../services/rfq.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const expectErr = async (name: string, fn: () => Promise<unknown>, code?: string) => {
    try { await fn(); check(name, false, 'did not throw'); } catch (e: any) { check(name, e instanceof rfq.RfqError && (!code || e.code === code), e?.code ?? e?.message); }
};
const future = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const past = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

(async () => {
    const tag = randomUUID().slice(0, 8);
    const buyerOrg = randomUUID(); // no row needed: a request only stores the id
    const buyer: rfq.Ctx = { userId: randomUUID(), orgId: buyerOrg, role: 'ADMIN', name: 'ZZ Test Buyer' };
    const orgIds: string[] = [];
    let itemId: string | null = null;
    const rfqIds: string[] = [];
    const productIds: string[] = [];

    const mkOrg = async (n: string) => { const { data, error } = await supabase.from('organizations').insert({ name: `ZZ TEST ${n} ${tag}`, slug: `zz-test-${n}-${tag}`.toLowerCase() }).select('id').single(); if (error) throw error; orgIds.push(data.id); return data.id as string; };

    try {
        const item = await saveItem({ name: `ZZ TEST Block ${tag}`, category: 'ZZ Test', unit: 'piece' });
        itemId = item.id;
        const s1 = await mkOrg('s1');
        const sup1: rfq.Ctx = { userId: randomUUID(), orgId: s1, role: 'ADMIN', name: 'ZZ Supplier One' };
        const sup2: rfq.Ctx = { userId: randomUUID(), orgId: randomUUID(), role: 'ADMIN', name: 'ZZ Supplier Two' };

        // asking
        await expectErr('zero quantity refused', () => rfq.createRfq(buyer, { catalogItemId: item.id, quantity: 0, deliveryTown: 'Kabwe' }), 'QUANTITY');
        await expectErr('a delivery town is needed', () => rfq.createRfq(buyer, { catalogItemId: item.id, quantity: 10 }), 'TOWN');
        await expectErr('a date in the past is refused', () => rfq.createRfq(buyer, { catalogItemId: item.id, quantity: 10, deliveryTown: 'Kabwe', neededBy: past(2) }), 'DATE');
        await expectErr('a free-text request needs a unit', () => rfq.createRfq(buyer, { title: 'Roofing nails', quantity: 5, deliveryTown: 'Kabwe' }), 'UNIT');
        const r = await rfq.createRfq(buyer, { catalogItemId: item.id, quantity: 500, deliveryTown: 'Kabwe', deliveryProvince: 'Central', neededBy: future(5), details: 'Delivered to site', phone: '0977000000' });
        rfqIds.push(r.id);
        check('request created from a catalogue item', /^RFQ-[A-Z0-9]{6}$/.test(r.reference) && r.title === item.name && r.unit === 'piece' && r.status === 'OPEN', r.reference);
        const free = await rfq.createRfq(buyer, { title: 'Roofing nails 75 mm', unit: 'kg', quantity: 20, deliveryTown: 'Ndola' });
        rfqIds.push(free.id);
        check('free-text request created', free.catalog_item_id === null && free.unit === 'kg');

        // quoting
        await expectErr('can’t quote on your own request', () => rfq.submitQuote(buyer, r.id, { unitPrice: 5 }), 'OWN');
        await expectErr('only the account holder quotes', () => rfq.submitQuote({ ...sup1, role: 'MEMBER' }, r.id, { unitPrice: 5 }), 'FORBIDDEN');
        await expectErr('a price is needed', () => rfq.submitQuote(sup1, r.id, { unitPrice: 0 }), 'PRICE');
        await expectErr('an old valid-until date is refused', () => rfq.submitQuote(sup1, r.id, { unitPrice: 5, validUntil: past(1) }), 'DATE');
        const q1 = await rfq.submitQuote(sup1, r.id, { unitPrice: 9.5, deliveryFee: 300, delivers: true, validUntil: future(5), note: 'Ready tomorrow' });
        check('quote totals unit price × quantity + delivery', Number(q1.total) === 5050 && q1.status === 'SUBMITTED', String(q1.total));
        const q1b = await rfq.submitQuote(sup1, r.id, { unitPrice: 9, deliveryFee: 300 });
        check('a supplier re-quoting updates, not duplicates', q1b.id === q1.id && Number(q1b.total) === 4800, String(q1b.total));
        const q2 = await rfq.submitQuote(sup2, r.id, { unitPrice: 8.8, deliveryFee: 800 });
        const q3 = await rfq.teamAddQuote(r.id, { supplierName: 'ZZ Depot (by phone)', supplierPhone: '0966000000', unitPrice: 9.2, deliveryFee: 0 }, 'test');
        check('quote from a phone supplier saved', q3.supplier_org_id === null && Number(q3.total) === 4600, String(q3.total));
        await expectErr('team quote needs a supplier name', () => rfq.teamAddQuote(r.id, { unitPrice: 5 }, 'test'), 'SUPPLIER');

        // prices feed the comparison
        const cmp = await compare(item.slug);
        check('quotes appear in the price comparison as bulk prices', cmp.offers.length === 3 && cmp.offers.every((o) => o.minQty === 500 && o.sourceType === 'RFQ_QUOTE'), `${cmp.offers.length} offers`);

        // reading
        const asBuyer: any = await rfq.getRfq(buyer, r.id);
        const totals = asBuyer.quotes.map((q: any) => q.total);
        check('buyer sees every quote, cheapest first', asBuyer.role === 'BUYER' && totals.join() === [4600, 4800, 5200].join(), totals.join());
        check('cheapest total flagged and the gap to it shown', asBuyer.quotes[0].cheapest && asBuyer.quotes[2].extraVsBest === 600, JSON.stringify(asBuyer.quotes.map((q: any) => q.extraVsBest)));
        check('supplier contact hidden until a quote is chosen', asBuyer.quotes.every((q: any) => q.supplierPhone === null));
        const asSup: any = await rfq.getRfq(sup1, r.id);
        check('supplier sees only their own quote', asSup.role === 'SUPPLIER' && asSup.quotes.length === 1 && asSup.quotes[0].id === q1.id && asSup.buyer === null);
        check('delivery address kept from other suppliers', asSup.request.deliveryAddress === null);
        const mine = await rfq.myRequests(buyer);
        check('buyer’s list shows quote counts and the best total', mine.requests.find((x: any) => x.id === r.id)?.quoteCount === 3 && mine.requests.find((x: any) => x.id === r.id)?.bestTotal === 4600);
        const brd = await rfq.board(sup1);
        check('board shows others’ open requests, flags my quote', brd.requests.some((x: any) => x.id === r.id && x.myQuote?.total === 4800) && !brd.requests.some((x: any) => x.buyer_org_id));
        const own = await rfq.board(buyer);
        check('a buyer’s own requests aren’t on their board', !own.requests.some((x: any) => x.id === r.id));

        // withdrawing
        await rfq.withdrawQuote(sup2, q2.id);
        const afterW: any = await rfq.getRfq(buyer, r.id);
        check('a withdrawn quote disappears', afterW.quotes.length === 2);
        await expectErr('can’t withdraw someone else’s quote', () => rfq.withdrawQuote(sup1, q3.id), 'NOT_FOUND');

        // deciding
        await expectErr('a supplier can’t accept', () => rfq.acceptQuote(sup1, q1.id), 'NOT_FOUND');
        await expectErr('only the account holder accepts', () => rfq.acceptQuote({ ...buyer, role: 'MEMBER' }, q1.id), 'FORBIDDEN');
        const acc = await rfq.acceptQuote(buyer, q1.id);
        check('accepting makes a private listing to pay through checkout', !!acc.payPath && /^\/marketplace\/checkout\//.test(acc.payPath) && acc.total === 4800, String(acc.payPath));
        const productId = acc.payPath!.split('/').pop()!; productIds.push(productId);
        const { data: prod } = await supabase.from('products').select('organization_id, price, marketplace_listed, is_active, own_delivery_charge, requires_delivery, name').eq('id', productId).single();
        check('private listing: hidden, right seller, price excludes delivery', prod?.marketplace_listed === false && prod?.is_active === true && prod?.organization_id === s1 && Number(prod?.price) === 4500 && Number(prod?.own_delivery_charge) === 300 && prod?.requires_delivery === true, JSON.stringify(prod));
        const after: any = await rfq.getRfq(buyer, r.id);
        check('request awarded; the other quote declined', after.request.status === 'AWARDED' && after.quotes.find((q: any) => q.id === q3.id)?.status === 'DECLINED' && after.quotes.find((q: any) => q.id === q1.id)?.status === 'ACCEPTED');
        check('the chosen supplier’s contact is shown to the buyer', after.quotes.find((q: any) => q.id === q1.id)?.payPath === acc.payPath);
        const supAfter: any = await rfq.getRfq(sup1, r.id);
        check('the chosen supplier now sees the buyer’s details', supAfter.buyer?.name === 'ZZ Test Buyer' && supAfter.buyer?.phone === '0977000000');
        await expectErr('a decided request can’t be accepted again', () => rfq.acceptQuote(buyer, q3.id), 'CLOSED');
        await expectErr('can’t cancel an awarded request', () => rfq.cancelRfq(buyer, r.id), 'CLOSED');
        await expectErr('no new quotes on an awarded request', () => rfq.submitQuote(sup2, r.id, { unitPrice: 1 }), 'CLOSED');

        // a phone quote has no checkout, only contact details; cancelling
        const q4 = await rfq.teamAddQuote(free.id, { supplierName: 'ZZ Hardware', supplierPhone: '0955000000', unitPrice: 30 }, 'test');
        const acc2 = await rfq.acceptQuote(buyer, q4.id);
        check('a phone supplier’s quote returns contact details, no checkout', acc2.payPath === null && acc2.supplier.phone === '0955000000' && acc2.supplier.onMoneyWise === false);
        const c3 = await rfq.createRfq(buyer, { title: 'Paint brushes', unit: 'piece', quantity: 4, deliveryTown: 'Lusaka' }); rfqIds.push(c3.id);
        await rfq.cancelRfq(buyer, c3.id);
        await expectErr('no quotes on a cancelled request', () => rfq.submitQuote(sup1, c3.id, { unitPrice: 1 }), 'CLOSED');

        // expiry
        await supabase.from('rfq_requests').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', free.id).eq('status', 'AWARDED');
        const old = await rfq.createRfq(buyer, { title: 'Old request', unit: 'piece', quantity: 1, deliveryTown: 'Lusaka' }); rfqIds.push(old.id);
        await supabase.from('rfq_requests').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', old.id);
        await expectErr('an expired request takes no quotes', () => rfq.submitQuote(sup1, old.id, { unitPrice: 1 }), 'CLOSED');
    } catch (e: any) {
        console.log('ERROR:', e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        if (rfqIds.length) await supabase.from('rfq_requests').delete().in('id', rfqIds);
        if (productIds.length) await supabase.from('products').delete().in('id', productIds);
        if (itemId) await supabase.from('catalog_items').delete().eq('id', itemId); // price records go with it
        if (orgIds.length) await supabase.from('products').delete().in('organization_id', orgIds);
        if (orgIds.length) await supabase.from('organizations').delete().in('id', orgIds);
        await supabase.from('catalog_items').delete().like('name', 'ZZ TEST Block%');
        const { count: left } = await supabase.from('rfq_requests').select('id', { count: 'exact', head: true }).eq('buyer_org_id', buyerOrg);
        const { count: orgsLeft } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST % ${tag}`);
        console.log(`cleanup: ${left ?? 0} requests, ${orgsLeft ?? 0} test businesses left`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
