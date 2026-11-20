/**
 * The connected-channel inbox lists what the connections already brought in. Read-only checks against the live database and the real handlers,
 * using the one workspace that has a connected Gmail (and a throwaway workspace for isolation).
 * Run: npx tsx src/scripts/test_channel_inbox.ts
 */
import { getChannelInbox, getChannelInboxItem } from '../controllers/channelInbox.controller';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` - ${extra}` : ''}`); if (!ok) failed++; };
const call = async (fn: any, req: any) => { const out: { code: number; body: any } = { code: 200, body: null }; const res: any = { status(n: number) { out.code = n; return this; }, json(b: any) { out.body = b; return this; } }; await fn(req, res); return out; };
const ORG = '8b9476c0-a79a-4678-a9cd-63aeeb04d70f';

(async () => {
    const all = await call(getChannelInbox, { user: { organization_id: ORG }, query: { view: 'all' } });
    check('the inbox lists the emails Gmail already brought in', all.code === 200 && all.body.items.length > 50, `${all.body?.items?.length} items, counts ${JSON.stringify(all.body?.counts)}`);
    check('every item says who, what, when and what the AI read it as', all.body.items.every((i: any) => i.who && i.title && i.at && i.intentLabel && i.channel === 'GMAIL'));
    check('newest first', all.body.items.every((i: any, k: number, a: any[]) => k === 0 || Date.parse(a[k - 1].at) >= Date.parse(i.at)));
    check('the counts add up (orders + money + other = all)', all.body.counts.orders + all.body.counts.money + all.body.counts.other === all.body.counts.all);
    const money = await call(getChannelInbox, { user: { organization_id: ORG }, query: { view: 'money' } });
    check('the Money view holds payments and invoices only', money.body.items.length > 0 && money.body.items.every((i: any) => ['PAYMENT_CONFIRMATION', 'INVOICE', 'RECEIPT'].includes(i.intent)));
    const orders = await call(getChannelInbox, { user: { organization_id: ORG }, query: { view: 'orders' } });
    check('the Orders view holds only orders and sales messages (this mailbox has none, so it is empty, not broken)', orders.body.items.every((i: any) => ['ORDER', 'SALE_INTENT', 'ORDER_QUERY', 'PAYMENT_CLAIM'].includes(i.intent)));
    check('it names the connections and when they last synced', all.body.connections.some((c: any) => c.channel === 'GMAIL' && c.status === 'ACTIVE' && !!c.lastSyncedAt), JSON.stringify(all.body.connections.map((c: any) => c.channel)));
    const search = await call(getChannelInbox, { user: { organization_id: ORG }, query: { view: 'all', q: 'lenco' } });
    check('search finds messages by who or what', search.body.items.length > 0 && search.body.items.every((i: any) => /lenco/i.test(`${i.who} ${i.title} ${i.preview}`)));
    const none = await call(getChannelInbox, { user: { organization_id: '00000000-0000-0000-0000-000000000000' }, query: { view: 'all' } });
    check('another organisation sees none of it', none.body.items.length === 0 && none.body.connections.length === 0);
    const one = all.body.items[0];
    const item = await call(getChannelInboxItem, { user: { organization_id: ORG }, params: { source: one.source, id: one.id } });
    check('one message opens with its text', item.code === 200 && typeof item.body.body === 'string' && item.body.body.length > 0);
    const wrong = await call(getChannelInboxItem, { user: { organization_id: '00000000-0000-0000-0000-000000000000' }, params: { source: one.source, id: one.id } });
    check('another organisation cannot open it', wrong.code === 404);
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
