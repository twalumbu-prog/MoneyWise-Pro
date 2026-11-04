import { Response } from 'express';
import { supabase } from '../lib/supabase';
import * as svc from '../services/imports.service';

async function ctxOf(req: any): Promise<svc.Ctx> {
    const { data } = await supabase.from('users').select('name').eq('id', req.user.id).maybeSingle();
    return { userId: req.user.id, orgId: req.user.organization_id, role: req.user.role, name: data?.name || req.user.email || 'MoneyWise user' };
}

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof svc.ImportError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error(`[Imports] ${what}:`, e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};
const who = (req: any) => String(req.user?.email ?? req.user?.id ?? 'admin');

/* ── Buyers ── */

/** GET /marketplace/imports?q=&category=  What can be ordered from overseas, priced in kwacha. */
export const browse = async (req: any, res: Response) => {
    try { res.json(await svc.browse(req.query.q as string, req.query.category as string, Number(req.query.page) || 0)); } catch (e) { fail(res, e, 'load the imported products'); }
};
/** POST /marketplace/imports/quote  { id, quantity }  One item, what it costs, and the buyer's wallets. */
export const quote = async (req: any, res: Response) => {
    try { res.json(await svc.quoteImport(await ctxOf(req), { id: req.body?.id, quantity: req.body?.quantity })); } catch (e) { fail(res, e, 'work out the price'); }
};
/** POST /marketplace/imports/from-link  { url } */
export const fromLink = async (req: any, res: Response) => {
    try { res.json(await svc.importFromLink(req.body?.url)); } catch (e) { fail(res, e, 'read that link'); }
};
/** POST /marketplace/imports/orders */
export const placeOrder = async (req: any, res: Response) => {
    try { res.status(201).json({ order: await svc.placeImportOrder(await ctxOf(req), req.body ?? {}) }); } catch (e) { fail(res, e, 'place the order'); }
};
/** GET /marketplace/imports/orders */
export const myOrders = async (req: any, res: Response) => {
    try { res.json({ orders: await svc.myImportOrders(req.user.id) }); } catch (e) { fail(res, e, 'load your import orders'); }
};

/* ── The team ── */

/** GET /admin/imports  Everything the imports screen needs in one go. */
export const adminOverview = async (req: any, res: Response) => {
    try {
        const [orders, products, cfg] = await Promise.all([svc.queue(req.query.status as string), svc.adminProducts(), svc.loadSettings(true)]);
        res.json({ orders, products, settings: cfg.settings, feeds: cfg.feeds, sources: svc.connectorStatus(), statuses: svc.STATUSES });
    } catch (e) { fail(res, e, 'load the imports'); }
};
export const adminUpdateOrder = async (req: any, res: Response) => {
    try { res.json(await svc.updateOrder(req.params.id, req.body ?? {}, who(req))); } catch (e) { fail(res, e, 'update the order'); }
};
export const adminCancelOrder = async (req: any, res: Response) => {
    try { res.json(await svc.cancelAndRefund(req.params.id, req.body?.reason, who(req))); } catch (e) { fail(res, e, 'cancel the order'); }
};
export const adminSaveProduct = async (req: any, res: Response) => {
    try { res.json(await svc.saveManualProduct(req.params.id ?? null, req.body ?? {})); } catch (e) { fail(res, e, 'save the product'); }
};
export const adminRefreshProduct = async (req: any, res: Response) => {
    try { res.json(await svc.adminRefresh(req.params.id)); } catch (e) { fail(res, e, 'refresh the product'); }
};
export const adminSearch = async (req: any, res: Response) => {
    try { res.json({ items: await svc.adminSearch(req.body?.source, req.body?.q) }); } catch (e) { fail(res, e, 'search'); }
};
export const adminAdd = async (req: any, res: Response) => {
    try { res.json(await svc.adminAddFromSource(req.body?.source, req.body?.sourceId, req.body?.category)); } catch (e) { fail(res, e, 'add the product'); }
};
export const adminSaveSettings = async (req: any, res: Response) => {
    try { res.json(await svc.saveSettings(req.body ?? {})); } catch (e) { fail(res, e, 'save the settings'); }
};
export const adminRefreshNow = async (_req: any, res: Response) => {
    try { res.json(await svc.refreshStale({ budgetMs: 100_000, hydrate: 40, refresh: 10, searches: 5 })); } catch (e) { fail(res, e, 'refresh'); }
};
