import { Response } from 'express';
import * as qo from '../services/quotesOrders.service';

const org = (req: any) => req.user.organization_id as string;
const run = (what: string, fn: (req: any) => Promise<any>) => async (req: any, res: Response) => {
    try { res.json(await fn(req)); }
    catch (e: any) {
        if (e instanceof qo.QuoteOrderError) return res.status(e.httpStatus).json({ error: e.message });
        if (/books are locked/i.test(String(e?.message))) return res.status(423).json({ error: e.message });
        if (e?.httpStatus && e?.message) return res.status(e.httpStatus).json({ error: e.message }); // invoice and purchasing errors carry their own status
        console.error(`[Quotes and orders] ${what}:`, e?.message ?? e); res.status(500).json({ error: `Could not ${what}.` });
    }
};

export const quotes = run('load the quotes', async (r) => ({ quotes: await qo.listQuotes(org(r)) }));
export const createQuote = run('save the quote', async (r) => ({ quote: await qo.createQuote(org(r), r.user.id, r.body) }));
export const quoteStatus = run('update the quote', async (r) => ({ quote: await qo.setQuoteStatus(org(r), r.params.id, String(r.body?.status ?? '')) }));
export const convertQuote = run('turn the quote into an invoice', (r) => qo.convertQuote(org(r), r.user.id, r.params.id, r.body ?? {}));
export const orders = run('load the orders', async (r) => ({ orders: await qo.listOrders(org(r)) }));
export const createOrder = run('save the order', async (r) => ({ order: await qo.createOrder(org(r), r.user.id, r.body) }));
export const cancelOrder = run('cancel the order', (r) => qo.cancelOrder(org(r), r.params.id));
export const receiveOrder = run('receive the goods', (r) => qo.receiveOrder(org(r), r.user.id, r.params.id, r.body ?? {}));
