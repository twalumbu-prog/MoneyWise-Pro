import { Response } from 'express';
import * as svc from '../services/priceCompare.service';

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof svc.PriceError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error(`[Price compare] ${what}:`, e?.message ?? e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};
const who = (req: any) => String(req.user?.id ?? 'admin');

/* ── Everyone signed in ── */
export const catalog = async (req: any, res: Response) => {
    try { res.json(await svc.searchCatalog(req.query.q as string, req.query.category as string, (req.query.vertical as string) || 'CONSTRUCTION')); } catch (e) { fail(res, e, 'load the catalogue'); }
};
export const catalogItem = async (req: any, res: Response) => {
    try { res.json({ item: await svc.getItem(req.params.id) }); } catch (e) { fail(res, e, 'load the product'); }
};
export const compare = async (req: any, res: Response) => {
    try { res.json(await svc.compare(req.params.id)); } catch (e) { fail(res, e, 'compare prices'); }
};

/* ── The team ── */
export const deskOverview = async (_req: any, res: Response) => {
    try { res.json(await svc.deskOverview()); } catch (e) { fail(res, e, 'load the price desk'); }
};
export const saveItem = async (req: any, res: Response) => {
    try { res.json(await svc.saveItem(req.body ?? {}, req.params.id)); } catch (e) { fail(res, e, 'save the product'); }
};
export const savePrice = async (req: any, res: Response) => {
    try { res.json(await svc.savePricePoint(req.body ?? {}, who(req), req.params.id)); } catch (e) { fail(res, e, 'save the price'); }
};
export const priceStatus = async (req: any, res: Response) => {
    try { res.json(await svc.setPricePointStatus(req.params.id, String(req.body?.status ?? ''))); } catch (e) { fail(res, e, 'update the price'); }
};

/* ── Shopper price reports ── */
import * as reports from '../services/priceReports.service';
export const submitReport = async (req: any, res: Response) => {
    try { res.status(201).json(await reports.submitReport(req.user.id, req.body ?? {})); } catch (e) { fail(res, e, 'save your report'); }
};
export const myReports = async (req: any, res: Response) => {
    try { res.json(await reports.myReports(req.user.id)); } catch (e) { fail(res, e, 'load your reports'); }
};
export const knownPlaces = async (req: any, res: Response) => {
    try { res.json(await reports.knownPlaces(req.query.item as string | undefined)); } catch (e) { fail(res, e, 'load the places'); }
};
export const reviewQueue = async (_req: any, res: Response) => {
    try { res.json(await reports.reviewQueue()); } catch (e) { fail(res, e, 'load the reports to review'); }
};
export const approveReport = async (req: any, res: Response) => {
    try { res.json(await reports.approveReport(req.params.id, req.body?.note)); } catch (e) { fail(res, e, 'approve the report'); }
};
export const rejectReport = async (req: any, res: Response) => {
    try { res.json(await reports.rejectReport(req.params.id, req.body?.note)); } catch (e) { fail(res, e, 'reject the report'); }
};
